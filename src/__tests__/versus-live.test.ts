import { describe, expect, it } from 'vitest';
import { patchSnapshot } from '../versus/live';
import { REACTIONS, isEmoji, parseReaction } from '../versus/reactions';
import type { LiveSnapshot } from '../versus/live';
import type { AnswerRow, PlayerRow, RoomRow } from '../versus/types';

const room = (over: Partial<RoomRow> = {}): RoomRow => ({
  code: 'ACDE', host_id: 'me', status: 'lobby', mode: 'mixed', rounds: 5, scope: 'all',
  match_no: 0, seed: null, difs: null, round: 0, round_started_at: null,
  updated_at: '2026-09-10T12:00:00.000Z', ...over,
});
const player = (id: string, over: Partial<PlayerRow> = {}): PlayerRow =>
  ({ room_code: 'ACDE', id, name: id, dif: 'standard', ready: false, wants_again: false, ...over });
const answer = (player_id: string, round: number, over: Partial<AnswerRow> = {}): AnswerRow =>
  ({ room_code: 'ACDE', match_no: 0, round, player_id, correct: true, ms: 1000, points: 140, pick: 'CA', timeout: false, ...over });

const base = (): LiveSnapshot => ({
  room: room(), players: [player('me'), player('them')], answers: [answer('me', 0)],
  now: '2026-09-10T12:00:00.000Z', receivedAt: 1,
});

describe('folding pushed changes into the room', () => {
  it('replaces the room, and keeps the clock offset', () => {
    const next = patchSnapshot(base(), { table: 'rooms', eventType: 'UPDATE', new: room({ status: 'playing', seed: 'ACDE:0' }), old: {} });
    expect(next.room.status).toBe('playing');
    expect(next.receivedAt).toBe(1);
    expect(next.answers).toHaveLength(1);
  });

  it('ignores another room, and a room being deleted', () => {
    const s = base();
    expect(patchSnapshot(s, { table: 'rooms', eventType: 'UPDATE', new: room({ code: 'XXXX', status: 'final' }), old: {} })).toBe(s);
    expect(patchSnapshot(s, { table: 'rooms', eventType: 'DELETE', new: {}, old: { code: 'ACDE' } })).toBe(s);
  });

  it('drops the old match’s answers when a rematch moves the room on', () => {
    const next = patchSnapshot(base(), { table: 'rooms', eventType: 'UPDATE', new: room({ match_no: 1 }), old: {} });
    expect(next.answers).toEqual([]);
  });

  it('seats, updates and removes players by id', () => {
    let s = patchSnapshot(base(), { table: 'players', eventType: 'INSERT', new: player('x'), old: {} });
    expect(s.players.map((p) => p.id)).toEqual(['me', 'them', 'x']);
    s = patchSnapshot(s, { table: 'players', eventType: 'UPDATE', new: player('them', { ready: true }), old: {} });
    expect(s.players.find((p) => p.id === 'them')?.ready).toBe(true);
    s = patchSnapshot(s, { table: 'players', eventType: 'DELETE', new: {}, old: { room_code: 'ACDE', id: 'x' } });
    expect(s.players.map((p) => p.id)).toEqual(['me', 'them']);
  });

  it('ignores a player in another room, or one already gone', () => {
    const s = base();
    expect(patchSnapshot(s, { table: 'players', eventType: 'INSERT', new: player('x', { room_code: 'XXXX' }), old: {} })).toBe(s);
    expect(patchSnapshot(s, { table: 'players', eventType: 'DELETE', new: {}, old: { id: 'nobody' } })).toBe(s);
    expect(patchSnapshot(s, { table: 'players', eventType: 'DELETE', new: {}, old: {} })).toBe(s);
  });

  it('adds an answer once, for this match only', () => {
    const s = base();
    const added = patchSnapshot(s, { table: 'answers', eventType: 'INSERT', new: answer('them', 0), old: {} });
    expect(added.answers).toHaveLength(2);
    expect(patchSnapshot(added, { table: 'answers', eventType: 'INSERT', new: answer('them', 0, { points: 1 }), old: {} })).toBe(added);
    expect(patchSnapshot(s, { table: 'answers', eventType: 'INSERT', new: answer('them', 0, { match_no: 3 }), old: {} })).toBe(s);
    expect(patchSnapshot(s, { table: 'answers', eventType: 'INSERT', new: answer('them', 0, { room_code: 'XXXX' }), old: {} })).toBe(s);
    expect(patchSnapshot(s, { table: 'answers', eventType: 'UPDATE', new: answer('me', 0, { points: 999 }), old: {} })).toBe(s);
  });
});

describe('reactions off the wire', () => {
  it('takes a known emoji from a named sender', () => {
    expect(parseReaction({ from: 'them', emoji: '🔥' })).toEqual({ from: 'them', emoji: '🔥' });
  });

  it('drops anything that is not one', () => {
    expect(parseReaction(null)).toBeNull();
    expect(parseReaction('🔥')).toBeNull();
    expect(parseReaction({ from: 'them', emoji: '💩' })).toBeNull();
    expect(parseReaction({ from: '', emoji: '🔥' })).toBeNull();
    expect(parseReaction({ from: 'x'.repeat(65), emoji: '🔥' })).toBeNull();
    expect(parseReaction({ emoji: '🔥' })).toBeNull();
  });

  it('knows its own set', () => {
    for (const e of REACTIONS) expect(isEmoji(e)).toBe(true);
    expect(isEmoji('👍')).toBe(false);
    expect(isEmoji(42)).toBe(false);
  });
});
