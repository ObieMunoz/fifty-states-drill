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
