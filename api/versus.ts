import { RoomError, versus } from '../server/rooms';
import { readJson, send } from '../server/http';
import type { Req, Res } from '../server/http';
import { supabaseDb } from '../server/supabase';

/**
 * The one door into a Versus room: `POST /api/versus` with `{ action, ... }`.
 *
 * A single function rather than a route per action, since the free plan
 * counts functions and every action wants the same three things anyway: a
 * JSON body, the database, and the whole room back.
 */
export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'POST only.' });
    return;
  }
  const body = await readJson(req);
  if (body === undefined) {
    send(res, 400, { error: 'A JSON body is required.' });
    return;
  }
  try {
    send(res, 200, await versus(supabaseDb(), body, new Date()));
  } catch (err) {
    if (err instanceof RoomError) {
      send(res, err.status, { error: err.message });
      return;
    }
    console.error(err);
    send(res, 500, { error: 'Something went wrong on the server.' });
  }
}
