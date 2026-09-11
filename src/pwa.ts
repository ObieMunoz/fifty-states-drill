import { registerSW } from 'virtual:pwa-register';
import { roomFromMessage } from './versus/notify';
import { forgetPendingRoom, takePendingRoom } from './versus/pending';

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

/** The same room heard again this soon after is the same tap, said the other way. */
const SAME_TAP_MS = 2000;

/** Called once the thing that was busy has finished. */
export function applyPendingUpdate(): void {
  const apply = pending;
  pending = null;
  apply?.();
}

/**
 * Hear which room a tapped notification named, and hand it on.
 *
 * The service worker says it two ways. It posts a message, the quick way
 * in where the page is awake to hear it; messages sent before the page
 * listens are held by the browser until `startMessages` releases them, so
 * a tap that opened the app cold is not lost either. And it writes the
 * room down (src/versus/pending.ts) for the page an installed app has
 * asleep in the background, or throws away and reloads on the way to the
 * front, which is where the message goes missing: that page looks for the
 * note when it starts and whenever it comes to the front. Whichever
 * arrives first is acted on, and the other, following within moments, is
 * taken as the same tap. Returns the unsubscribe.
 */
export function onOpenRoom(cb: (code: string) => void): () => void {
  const sw = navigator.serviceWorker as ServiceWorkerContainer | undefined;
  if (!sw) return () => {};
  let stopped = false;
  let last = { code: '', at: 0 };
  const open = (code: string) => {
    if (stopped) return;
    const now = Date.now();
    if (code === last.code && now - last.at < SAME_TAP_MS) return;
    last = { code, at: now };
    // Told one way; the other is not needed any more.
    void forgetPendingRoom();
    cb(code);
  };
  const onMessage = (e: MessageEvent) => {
    const code = roomFromMessage(e.data);
    if (code) open(code);
  };
  const look = () => {
    void takePendingRoom().then((code) => { if (code) open(code); });
  };
  const onVisible = () => { if (document.visibilityState === 'visible') look(); };
  sw.addEventListener('message', onMessage);
  sw.startMessages?.();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', look);
  look();
  return () => {
    stopped = true;
    sw.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', look);
  };
}
