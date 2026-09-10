import { expireRooms } from '../server/rooms';
import { supabaseDb } from '../server/supabase';

/**
 * Run daily by the cron in vercel.json. It sweeps rooms nobody has touched
 * for a day — and, just as important, it is a query against the database
 * every day, which is what keeps a free Supabase project from being paused
 * for inactivity while nobody happens to be playing.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const swept = await expireRooms(supabaseDb(), new Date());
  return Response.json({ swept });
}
