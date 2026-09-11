import { RoomError, isPhoneAction, phone, versus } from '../server/rooms';
import { webPusher } from '../server/push';
import { readJson, send } from '../server/http';
import type { Req, Res } from '../server/http';
import { supabaseDb } from '../server/supabase';

/**
 * The one door into a Versus room: `POST /api/versus` with `{ action, ... }`.
 *
 * A single function rather than a route per action, since the free plan
 * counts functions and every action wants the same three things anyway: a
 * JSON body, the database, and the whole room back. The few actions that are
 * about a phone rather than a room — where its notifications go — come
 * through the same door and answer with a receipt instead.
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
    const db = supabaseDb();
    send(res, 200, isPhoneAction(body) ? await phone(db, body) : await versus(db, body, new Date(), webPusher()));
  } catch (err) {
    if (err instanceof RoomError) {
      send(res, err.status, { error: err.message });
      return;
    }
    console.error(err);
    send(res, 500, { error: 'Something went wrong on the server.' });
  }
}
