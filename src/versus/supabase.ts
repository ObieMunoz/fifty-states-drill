import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser's Supabase client, used only to listen.
 *
 * It holds the publishable key, which may read the room tables and nothing
 * else; every write goes through the API. Made on first use so the study
 * modes never pay for it.
 */
let client: SupabaseClient | null = null;

const UNCONFIGURED = 'Versus is not set up on this deployment: the Supabase address and key are missing.';

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error(UNCONFIGURED);
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
