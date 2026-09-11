/**
 * What a push notification carries, and what it says on screen.
 *
 * The server builds the payload and the service worker reads it, so both
 * ends share this file. A payload is kept small and self-describing: what
 * kind of message it is, and just enough to act on it.
 */
export interface RematchPayload {
  kind: 'rematch';
  /** The room the requester is waiting in. */
  code: string;
  /** Who is asking, as they typed it. */
  from: string;
}

export type PushPayload = RematchPayload;

export const APP_NAME = 'Fifty States Drill';

export const rematchPayload = (code: string, from: string): RematchPayload =>
  ({ kind: 'rematch', code, from });

/** What the notification shows, and where a tap on it goes. */
export interface Notice {
  title: string;
  body: string;
  /** Same-origin path the tap opens. */
  url: string;
  /** Notifications sharing a tag replace each other rather than stack. */
  tag: string;
}

/** A payload off the wire, or null for anything that is not one. */
export function parsePayload(raw: unknown): PushPayload | null {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const p = v as Partial<RematchPayload>;
  if (p.kind !== 'rematch' || typeof p.code !== 'string' || typeof p.from !== 'string') return null;
  const code = p.code.replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!code) return null;
  return { kind: 'rematch', code, from: p.from.slice(0, 40) };
}

export function noticeFor(p: PushPayload): Notice {
  return {
    title: `${p.from} wants a rematch`,
    body: `Tap to join room ${p.code} in ${APP_NAME}.`,
    url: `/versus/${p.code}`,
    tag: `rematch:${p.code}`,
  };
}

/**
 * What the service worker tells an open page when a notification is tapped:
 * go to this room. Sent rather than navigating the page from the worker,
 * which browsers do inconsistently once an installed app is in the
 * background — the page itself changes screen, and joins.
 */
export interface OpenRoomMessage {
  type: 'OPEN_ROOM';
  code: string;
}

export const openRoomMessage = (code: string): OpenRoomMessage => ({ type: 'OPEN_ROOM', code });

/** The room code a message carries, or null for any other message. */
export function roomFromMessage(data: unknown): string | null {
  const m = data as Partial<OpenRoomMessage> | null;
  if (!m || m.type !== 'OPEN_ROOM' || typeof m.code !== 'string') return null;
  const code = m.code.replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return code || null;
}
