import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from './rooms';
import type { AnswerRow, PairingRow, PlayerRow, RoomRow, SubscriptionRow } from '../src/versus/types';

/**
 * The `Db` the API runs against: the Supabase project, through its secret
 * key. That key bypasses row security, which is the point — the API is the
 * one writer — and it lives only in the function's environment.
 */

/** Postgres: unique_violation. A taken code, or a second answer to a round. */
const DUPLICATE = '23505';

const env = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

let client: SupabaseClient | null = null;

/** One client per function instance; a warm instance reuses its socket. */
function supabase(): SupabaseClient {
  client ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Throw on anything but the one error the caller expects. */
const check = (error: { code?: string; message: string } | null, allow?: string): boolean => {
  if (!error) return true;
  if (allow && error.code === allow) return false;
  throw new Error(error.message);
};

export function supabaseDb(): Db {
  const sb = supabase();
  return {
    async getRoom(code) {
      const { data, error } = await sb.from('rooms').select('*').eq('code', code).maybeSingle();
      check(error);
      return (data as RoomRow | null) ?? null;
    },
    async insertRoom(row) {
      const { error } = await sb.from('rooms').insert(row);
      return check(error, DUPLICATE);
    },
    async updateRoom(code, patch) {
      const { error } = await sb.from('rooms').update(patch).eq('code', code);
      check(error);
    },
    async getPlayers(code) {
      const { data, error } = await sb.from('players').select('*').eq('room_code', code).order('joined_at');
      check(error);
      return (data as PlayerRow[] | null) ?? [];
    },
    async upsertPlayer(row) {
      const { error } = await sb.from('players').upsert(row);
      check(error);
    },
    async updatePlayers(code, patch) {
      const { error } = await sb.from('players').update(patch).eq('room_code', code);
      check(error);
    },
    async deletePlayer(code, id) {
      const { error } = await sb.from('players').delete().eq('room_code', code).eq('id', id);
      check(error);
    },
    async getAnswers(code, matchNo) {
      const { data, error } = await sb.from('answers').select('*').eq('room_code', code).eq('match_no', matchNo);
      check(error);
      return (data as AnswerRow[] | null) ?? [];
    },
    async insertAnswer(row) {
      const { error } = await sb.from('answers').insert(row);
      return check(error, DUPLICATE);
    },
    async deleteRoomsBefore(before) {
      const { data, error } = await sb.from('rooms').delete().lt('updated_at', before.toISOString()).select('code');
      check(error);
      return data?.length ?? 0;
    },
    async getWaitingRoomsHostedBy(hostId) {
      const { data, error } = await sb.from('rooms').select('*').eq('host_id', hostId).eq('status', 'waiting');
      check(error);
      return (data as RoomRow[] | null) ?? [];
    },
    async getSubscription(endpoint) {
      const { data, error } = await sb.from('push_subscriptions').select('*').eq('endpoint', endpoint).maybeSingle();
      check(error);
      return (data as SubscriptionRow | null) ?? null;
    },
    async getSubscriptions(playerId) {
      const { data, error } = await sb.from('push_subscriptions').select('*').eq('player_id', playerId);
      check(error);
      return (data as SubscriptionRow[] | null) ?? [];
    },
    async upsertSubscription(row) {
      const { error } = await sb.from('push_subscriptions').upsert(row);
      check(error);
    },
    async deleteSubscription(endpoint, playerId) {
      let q = sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (playerId !== undefined) q = q.eq('player_id', playerId);
      const { error } = await q;
      check(error);
    },
    async getPairing(aId, bId) {
      const { data, error } = await sb.from('pairings').select('*').eq('a_id', aId).eq('b_id', bId).maybeSingle();
      check(error);
      return (data as PairingRow | null) ?? null;
    },
    async upsertPairing(row) {
      const { error } = await sb.from('pairings').upsert(row);
      check(error);
    },
    async deletePairing(aId, bId) {
      const { error } = await sb.from('pairings').delete().eq('a_id', aId).eq('b_id', bId);
      check(error);
    },
    async deletePairingsBefore(before) {
      const { data, error } = await sb.from('pairings').delete().lt('played_at', before.toISOString()).select('a_id');
      check(error);
      return data?.length ?? 0;
    },
  };
}
