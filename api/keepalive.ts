import { expireRooms } from '../server/rooms';
import { send } from '../server/http';
import type { Req, Res } from '../server/http';
import { supabaseDb } from '../server/supabase';

/**
 * Run daily by the cron in vercel.json. It sweeps rooms nobody has touched
 * for a day — and, just as important, it is a query against the database
 * every day, which is what keeps a free Supabase project from being paused
 * for inactivity while nobody happens to be playing.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }
  try {
    send(res, 200, { swept: await expireRooms(supabaseDb(), new Date()) });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Something went wrong on the server.' });
  }
}
