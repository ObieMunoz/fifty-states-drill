import { callPhone } from './client';
import { playerId } from './player';

/**
 * This phone's ear for rematch requests: whether it can have one, and
 * turning it on and off.
 *
 * Web Push needs three things the browser may or may not give: a service
 * worker, a push manager, and permission. On iPhone the first two only
 * exist once the app is on the Home Screen, so a Safari tab is told to
 * install rather than offered a switch that would do nothing. The server's
 * public key comes with the build; without it there is nothing to subscribe
 * to and the whole feature stays out of sight.
 */
export type PushSupport =
  /** Subscribing is possible here. */
  | 'ready'
  /** iPhone or iPad, in Safari rather than the installed app. */
  | 'install'
  /** No push here at all, or the deployment has not set it up. */
  | 'none';

export type PushStatus =
  | 'on'
  | 'off'
  /** Permission refused; only the phone's settings can change that. */
  | 'blocked';

export const VAPID_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined;

const isApple = (): boolean =>
  /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isInstalled = (): boolean =>
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  || (navigator as { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (!VAPID_KEY || typeof window === 'undefined') return 'none';
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ready';
  return isApple() && !isInstalled() ? 'install' : 'none';
}

/** Where this phone stands, from the browser's own record. */
export async function pushStatus(): Promise<PushStatus> {
  if (pushSupport() !== 'ready') return 'off';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  const sub = await current();
  return sub ? 'on' : 'off';
}

async function current(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** The key as `subscribe` wants it: base64url text to raw bytes. */
export function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Ask, subscribe, and tell the server. Must run from a tap: browsers only
 * show the permission prompt in answer to one. Throws with a reason fit for
 * the screen.
 */
export async function enablePush(): Promise<PushStatus> {
  if (pushSupport() !== 'ready' || !VAPID_KEY) throw new Error('Notifications are not available here.');
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.ready;
  const sub = await current()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY) });
  await callPhone({ action: 'subscribe', playerId: playerId(), subscription: sub.toJSON() });
  return 'on';
}

/** Tell the server first: a phone that has unsubscribed cannot be told anything. */
export async function disablePush(): Promise<PushStatus> {
  const sub = await current();
  if (sub) {
    await callPhone({ action: 'unsubscribe', playerId: playerId(), endpoint: sub.endpoint }).catch(() => {
      // The push service will refuse the next send and the row goes then.
    });
    await sub.unsubscribe();
  }
  return 'off';
}

/**
 * Re-send the subscription the phone already holds. Cheap, and it keeps the
 * server's row matched to this player id after the browser or the server
 * has forgotten one side. Nothing to do when notifications are off.
 */
export async function syncPush(): Promise<void> {
  if (pushSupport() !== 'ready' || Notification.permission !== 'granted') return;
  const sub = await current();
  if (sub) await callPhone({ action: 'subscribe', playerId: playerId(), subscription: sub.toJSON() });
}
