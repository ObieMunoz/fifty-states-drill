import webpush from 'web-push';
import type { SubscriptionRow } from '../src/versus/types';

/**
 * Sending a push notification to one phone.
 *
 * Web Push is addressed by the subscription a phone handed over: the push
 * service's endpoint plus the keys that encrypt the message for that phone
 * alone. The server signs each send with its VAPID key, which is how the
 * push service knows it is the same server the phone subscribed to.
 *
 * Kept behind an interface so the room rules can be tested without a push
 * service: the tests hand in a recorder, production hands in `web-push`.
 */
export interface Pusher {
  /**
   * `gone` means the subscription is dead — the phone unsubscribed, or the
   * browser rotated it — and the row should be dropped. `failed` is anything
   * else, which is not the phone's fault and leaves the row alone.
   */
  send(to: SubscriptionRow, payload: string, ttlSeconds: number): Promise<'sent' | 'gone' | 'failed'>;
}

/** Where the push services may write about this server, failing anything better. */
const DEFAULT_SUBJECT = 'https://fifty-states-drill.vercel.app/';

/** An environment value as typed, less the quotes and whitespace a paste picks up. */
const setting = (name: string): string =>
  (process.env[name] || '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();

/**
 * The contact the push services are given, as the standard wants it: a
 * `mailto:` or an `https:` URL. A bare address gets its `mailto:`. Anything
 * else — a value pasted with its variable name, say — is only a contact
 * detail, so it is logged and the site's own address used, rather than
 * letting it switch notifications off.
 */
export function subjectOf(raw: string): string {
  let subject = raw.trim();
  if (!subject) return DEFAULT_SUBJECT;
  if (!/^(mailto:|https?:)/i.test(subject) && /^[^\s/@]+@[^\s/@]+$/.test(subject)) subject = `mailto:${subject}`;
  try {
    const u = new URL(subject);
    if ((u.protocol === 'mailto:' && u.pathname) || ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname)) {
      return subject;
    }
  } catch {
    // Not a URL at all: handled below.
  }
  console.warn(`VAPID_SUBJECT is not a mailto: or https: URL, using ${DEFAULT_SUBJECT} instead:`, raw);
  return DEFAULT_SUBJECT;
}

/**
 * The VAPID keys, or null when the deployment has not set them up. Values
 * are trimmed, since a pasted key easily picks up a stray space or quotes.
 */
function vapid(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = setting('VAPID_PUBLIC_KEY') || setting('VITE_VAPID_PUBLIC_KEY');
  const privateKey = setting('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) {
    console.warn('push is not configured: VITE_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are needed');
    return null;
  }
  return { subject: subjectOf(setting('VAPID_SUBJECT')), publicKey, privateKey };
}

let configured: Pusher | null | undefined;

/**
 * The real thing, or null when notifications are not set up on this server.
 * A bad key or subject is a setup mistake in one feature, and is logged and
 * treated as unconfigured rather than allowed to break every room action.
 */
export function webPusher(): Pusher | null {
  if (configured !== undefined) return configured;
  const keys = vapid();
  if (!keys) return (configured = null);
  try {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  } catch (err) {
    console.error('push is misconfigured, so notifications are off:', (err as Error).message);
    return (configured = null);
  }
  return (configured = {
    async send(to, payload, ttlSeconds) {
      try {
        await webpush.sendNotification(
          { endpoint: to.endpoint, keys: { p256dh: to.p256dh, auth: to.auth } },
          payload,
          { TTL: ttlSeconds, urgency: 'high' },
        );
        return 'sent';
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return 'gone';
        console.error('push failed', status, (err as Error).message);
        return 'failed';
      }
    },
  });
}
