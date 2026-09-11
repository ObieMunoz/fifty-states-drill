import { registerSW } from 'virtual:pwa-register';
import { roomFromMessage } from './versus/notify';

/**
 * Take each new deploy as soon as it lands, without pulling the rug mid-match.
 *
 * The service worker keeps the app working offline, and that same caching
 * means a phone that has the app open when a deploy goes out carries on
 * running the old build — and an installed app that is only ever brought
 * back from the switcher, never relaunched, can stay on it for days. A fix
 * to how two phones connect is no use while one of them is on last week's
 * code. So a waiting build reloads the page the moment it is safe: at once,
 * or, when a match is on, the moment the player leaves Versus.
 */
let pending: (() => void) | null = null;

/** `busy` says whether a reload right now would interrupt something. */
export function installUpdates(busy: () => boolean): void {
  const update = registerSW({
    onNeedRefresh() {
      const apply = () => { void update(true); };
      if (busy()) pending = apply;
      else apply();
    },
  });
}

/** Called once the thing that was busy has finished. */
export function applyPendingUpdate(): void {
  const apply = pending;
  pending = null;
  apply?.();
}

/**
 * Hear the service worker say a notification was tapped, and which room it
 * named. Messages sent before the page listens are held by the browser
 * until `startMessages` releases them, so a tap that opened the app cold is
 * not lost either. Returns the unsubscribe.
 */
export function onOpenRoom(cb: (code: string) => void): () => void {
  const sw = navigator.serviceWorker as ServiceWorkerContainer | undefined;
  if (!sw) return () => {};
  const onMessage = (e: MessageEvent) => {
    const code = roomFromMessage(e.data);
    if (code) cb(code);
  };
  sw.addEventListener('message', onMessage);
  sw.startMessages?.();
  return () => sw.removeEventListener('message', onMessage);
}
