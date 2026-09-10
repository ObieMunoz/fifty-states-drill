import { supabase } from './supabase';
import type { AnswerRow, PlayerRow, RoomRow, Snapshot } from './types';

/**
 * A room, kept current from the server.
 *
 * The API answers every call with the whole room, and between calls the
 * database pushes each row that changes. Both land here: a snapshot replaces
 * what is held, a change patches it, and either way the hook gets the room
 * as it now stands. Presence rides on the same channel, so each phone knows
 * whether the other is on the room right now, without a row for it.
 *
 * `receivedAt` is when the snapshot's `now` was fresh. The difference is
 * this device's offset from the server clock, and it stays good across the
 * patches that follow, which carry no time of their own.
 */
export interface LiveSnapshot extends Snapshot {
  receivedAt: number;
}

export interface LiveEvents {
  onSnapshot: (snap: LiveSnapshot) => void;
  /** Ids of the players whose phones are on the room right now. */
  onPresence: (ids: string[]) => void;
  /** This phone's own link to the room. `linked` again after a loss means resync. */
  onLink: (link: 'linked' | 'lost') => void;
}

export interface Live {
  /** Take a snapshot from the API as the truth. */
  seed: (snap: Snapshot) => void;
  leave: () => void;
}

/** One row change, as Realtime delivers it. */
export interface Change {
  table: 'rooms' | 'players' | 'answers';
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Partial<RoomRow & PlayerRow & AnswerRow>;
  old: Partial<RoomRow & PlayerRow & AnswerRow>;
}

/** The snapshot with one change folded in; the same object if it does not apply. */
export function patchSnapshot(snap: LiveSnapshot, change: Change): LiveSnapshot {
  const { table, eventType } = change;
  if (table === 'rooms') {
    if (eventType === 'DELETE' || change.new.code !== snap.room.code) return snap;
    const room = change.new as RoomRow;
    // A rematch moves the answers on: the old match's rows no longer belong.
    const answers = room.match_no === snap.room.match_no
      ? snap.answers
      : snap.answers.filter((a) => a.match_no === room.match_no);
    return { ...snap, room, answers };
  }
  if (table === 'players') {
    if (eventType === 'DELETE') {
      const id = change.old.id;
      if (!id || !snap.players.some((p) => p.id === id)) return snap;
      return { ...snap, players: snap.players.filter((p) => p.id !== id) };
    }
    const row = change.new as PlayerRow;
    if (row.room_code !== snap.room.code) return snap;
    const players = snap.players.some((p) => p.id === row.id)
      ? snap.players.map((p) => (p.id === row.id ? row : p))
      : [...snap.players, row];
    return { ...snap, players };
  }
  if (eventType !== 'INSERT') return snap;
  const row = change.new as AnswerRow;
  if (row.room_code !== snap.room.code || row.match_no !== snap.room.match_no) return snap;
  const dup = snap.answers.some((a) => a.round === row.round && a.player_id === row.player_id);
  return dup ? snap : { ...snap, answers: [...snap.answers, row] };
}

export function openLive(code: string, playerId: string, ev: LiveEvents): Live {
  const sb = supabase();
  let current: LiveSnapshot | null = null;
  let closed = false;
  let wasLinked = false;

  const emit = () => { if (current && !closed) ev.onSnapshot(current); };

  const onChange = (table: Change['table']) => (payload: {
    eventType: Change['eventType']; new: Change['new']; old: Change['old'];
  }) => {
    if (closed || !current) return;
    const next = patchSnapshot(current, { table, eventType: payload.eventType, new: payload.new, old: payload.old });
    if (next !== current) {
      current = next;
      emit();
    }
  };

  const channel = sb.channel(`room:${code}`, { config: { presence: { key: playerId } } });
  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, onChange('rooms'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${code}` }, onChange('players'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `room_code=eq.${code}` }, onChange('answers'))
    .on('presence', { event: 'sync' }, () => {
      if (!closed) ev.onPresence(Object.keys(channel.presenceState()));
    })
    .subscribe((status) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') {
        void channel.track({ id: playerId });
        // A second SUBSCRIBED is a reconnect: the hook resyncs on the transition.
        if (!wasLinked) ev.onLink('linked');
        wasLinked = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        wasLinked = false;
        ev.onLink('lost');
      }
    });

  return {
    seed(snap) {
      if (closed) return;
      current = { ...snap, receivedAt: Date.now() };
      emit();
    },
    leave() {
      closed = true;
      void sb.removeChannel(channel);
    },
  };
}
