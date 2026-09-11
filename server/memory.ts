import type { Db } from './rooms';
import type { AnswerRow, PairingRow, PlayerRow, RoomRow, SubscriptionRow } from '../src/versus/types';

/**
 * A `Db` made of a few Maps and arrays.
 *
 * It is what the room rules are tested against, and what `npm run dev:local`
 * runs Versus on when there is no Supabase to hand. It reports every row
 * change the way Realtime would, so the phones in a local match hear each
 * other exactly as they do in production.
 */

export type Table = 'rooms' | 'players' | 'answers';

export interface RowChange {
  table: Table;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

export interface MemoryDb extends Db {
  rooms: Map<string, RoomRow>;
  readonly players: PlayerRow[];
  readonly answers: AnswerRow[];
  readonly subs: SubscriptionRow[];
  readonly pairings: PairingRow[];
  /** Hear each row change as Realtime would report it. Returns the unsubscribe. */
  onChange(cb: (change: RowChange) => void): () => void;
}

export function memoryDb(): MemoryDb {
  const rooms = new Map<string, RoomRow>();
  let players: PlayerRow[] = [];
  let answers: AnswerRow[] = [];
  let subs: SubscriptionRow[] = [];
  let pairings: PairingRow[] = [];
  const listeners = new Set<(change: RowChange) => void>();

  const emit = (change: RowChange) => { listeners.forEach((cb) => cb(change)); };
  const row = (r: object): Record<string, unknown> => ({ ...r });

  return {
    rooms,
    get players() { return players; },
    get answers() { return answers; },
    get subs() { return subs; },
    get pairings() { return pairings; },
    onChange(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    async getRoom(code) { return rooms.get(code) ?? null; },
    async insertRoom(r) {
      if (rooms.has(r.code)) return false;
      rooms.set(r.code, { ...r });
      emit({ table: 'rooms', eventType: 'INSERT', new: row(r), old: {} });
      return true;
    },
    async updateRoom(code, patch) {
      const r = rooms.get(code);
      if (!r) return;
      const next = { ...r, ...patch };
      rooms.set(code, next);
      emit({ table: 'rooms', eventType: 'UPDATE', new: row(next), old: row(r) });
    },
    async getPlayers(code) { return players.filter((p) => p.room_code === code); },
    async upsertPlayer(r) {
      const was = players.find((p) => p.room_code === r.room_code && p.id === r.id);
      players = players.filter((p) => !(p.room_code === r.room_code && p.id === r.id));
      players.push({ ...r });
      emit({ table: 'players', eventType: was ? 'UPDATE' : 'INSERT', new: row(r), old: was ? row(was) : {} });
    },
    async updatePlayers(code, patch) {
      players = players.map((p) => {
        if (p.room_code !== code) return p;
        const next = { ...p, ...patch };
        emit({ table: 'players', eventType: 'UPDATE', new: row(next), old: row(p) });
        return next;
      });
    },
    async deletePlayer(code, id) {
      const was = players.find((p) => p.room_code === code && p.id === id);
      players = players.filter((p) => !(p.room_code === code && p.id === id));
      if (was) emit({ table: 'players', eventType: 'DELETE', new: {}, old: row(was) });
    },
    async getAnswers(code, matchNo) {
      return answers.filter((a) => a.room_code === code && a.match_no === matchNo);
    },
    async insertAnswer(r) {
      if (answers.some((a) => a.room_code === r.room_code && a.match_no === r.match_no
        && a.round === r.round && a.player_id === r.player_id)) return false;
      answers.push({ ...r });
      emit({ table: 'answers', eventType: 'INSERT', new: row(r), old: {} });
      return true;
    },
    async deleteRoomsBefore(before) {
      let n = 0;
      for (const [code, r] of rooms) {
        if (new Date(r.updated_at) < before) {
          rooms.delete(code);
          players = players.filter((p) => p.room_code !== code);
          answers = answers.filter((a) => a.room_code !== code);
          emit({ table: 'rooms', eventType: 'DELETE', new: {}, old: row(r) });
          n++;
        }
      }
      return n;
    },
    async getWaitingRoomsHostedBy(hostId) {
      return [...rooms.values()].filter((r) => r.host_id === hostId && r.status === 'waiting');
    },
    async getSubscription(endpoint) { return subs.find((r) => r.endpoint === endpoint) ?? null; },
    async getSubscriptions(playerId) { return subs.filter((r) => r.player_id === playerId); },
    async upsertSubscription(r) {
      subs = [...subs.filter((x) => x.endpoint !== r.endpoint), { ...r }];
    },
    async deleteSubscription(endpoint, playerId) {
      subs = subs.filter((r) => r.endpoint !== endpoint || (playerId !== undefined && r.player_id !== playerId));
    },
    async getPairing(aId, bId) { return pairings.find((r) => r.a_id === aId && r.b_id === bId) ?? null; },
    async upsertPairing(r) {
      pairings = [...pairings.filter((x) => !(x.a_id === r.a_id && x.b_id === r.b_id)), { ...r }];
    },
    async deletePairing(aId, bId) {
      pairings = pairings.filter((r) => !(r.a_id === aId && r.b_id === bId));
    },
    async deletePairingsBefore(before) {
      const keep = pairings.filter((r) => new Date(r.played_at) >= before);
      const n = pairings.length - keep.length;
      pairings = keep;
      return n;
    },
  };
}
