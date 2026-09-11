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

/** The VAPID keys, or null when the deployment has not set them up. */
function vapid(): { subject: string; publicKey: string; privateKey: string } | null {
  // The public key is set under the name the build reads, so either works.
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('push is not configured: VITE_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are needed');
    return null;
  }
  return { subject: process.env.VAPID_SUBJECT || 'https://fifty-states-drill.vercel.app/', publicKey, privateKey };
}

let configured: Pusher | null | undefined;

/** The real thing, or null when notifications are not set up on this server. */
export function webPusher(): Pusher | null {
  if (configured !== undefined) return configured;
  const keys = vapid();
  if (!keys) return (configured = null);
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
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
