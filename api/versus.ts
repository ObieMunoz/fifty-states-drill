import { RoomError, versus } from '../server/rooms';
import { supabaseDb } from '../server/supabase';

/**
 * The one door into a Versus room: `POST /api/versus` with `{ action, ... }`.
 *
 * A single function rather than a route per action, since the free plan
 * counts functions and every action wants the same three things anyway: a
 * JSON body, the database, and the whole room back.
 */

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'A JSON body is required.' }, 400);
  }
  try {
    return json(await versus(supabaseDb(), body, new Date()), 200);
  } catch (err) {
    if (err instanceof RoomError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong on the server.' }, 500);
  }
}
