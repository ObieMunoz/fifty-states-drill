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

/**
 * The VAPID keys, or null when the deployment has not set them up. Values
 * are trimmed, since a pasted key easily picks up a stray space, and a
 * subject typed as a bare address gets the `mailto:` the standard wants.
 */
function vapid(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) {
    console.warn('push is not configured: VITE_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are needed');
    return null;
  }
  let subject = (process.env.VAPID_SUBJECT || '').trim() || 'https://fifty-states-drill.vercel.app/';
  if (!/^(mailto:|https?:)/i.test(subject) && subject.includes('@')) subject = `mailto:${subject}`;
  return { subject, publicKey, privateKey };
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
