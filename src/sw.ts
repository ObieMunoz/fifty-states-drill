/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { noticeFor, openRoomMessage, parsePayload } from './versus/notify';
import { rememberRoom } from './versus/pending';

/**
 * The service worker: the offline shell, and the phone's ear for rematch
 * requests.
 *
 * The caching half is what vite-plugin-pwa used to generate on its own; it
 * is written out here because a generated worker cannot also listen for
 * push. The list of files to precache is injected at build time.
 */
declare const self: ServiceWorkerGlobalScope;

/* ---------------- the offline shell ---------------- */

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every path is the app (/learn/…, /quiz/…, /versus/…), so an offline
// navigation to any of them gets the shell. The API is not.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

// The Google Fonts stylesheet changes with browser support, so serve the
// cached copy and refresh it in the background.
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' }),
);

// The font files are content-addressed and effectively immutable.
registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
);

// A new build waits until src/pwa.ts says it is safe to take over.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
clientsClaim();

/* ---------------- rematch requests ---------------- */

self.addEventListener('push', (event) => {
  const payload = parsePayload(event.data?.text());
  if (!payload) return;
  const n = noticeFor(payload);
  event.waitUntil(self.registration.showNotification(n.title, {
    body: n.body,
    tag: n.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: n.url, code: payload.code },
  }));
});

/**
 * A tap opens the room.
 *
 * The room is written down first, where the page can find it for itself.
 * An installed app in the background is asleep when the tap comes, and on
 * iOS a message posted to it then is lost as often as not, as is a
 * navigation asked of it; the phone may even throw the page away and
 * reload it on the way to the front. Bringing the app forward does work,
 * and a page that starts or comes to the front looks for the note
 * (src/pwa.ts).
 *
 * A running app is then told which room and brought forward: the message
 * is the quick way in wherever it does arrive. With no window open at all,
 * one is opened at the room's own address, which joins on load like an
 * invite link.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string; code?: string };
  const url = new URL(data.url ?? '/versus', self.location.origin).href;
  event.waitUntil((async () => {
    if (data.code) {
      await rememberRoom(data.code).catch(() => {
        // No store to write to: the message and the address are the other ways in.
      });
    }
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // The one on screen, failing that any; an app has one window in practice.
    const win = wins.find((w) => w.focused || w.visibilityState === 'visible') ?? wins[0];
    if (win && data.code) {
      // Told before it is brought forward, so the word is queued whatever
      // becomes of the focus call.
      win.postMessage(openRoomMessage(data.code));
      try {
        await win.focus();
      } catch {
        // Not every browser lets a worker focus a window; the note still stands.
      }
      return;
    }
    await self.clients.openWindow(url);
  })());
});

/**
 * The browser rotated the subscription. The server keeps the old endpoint
 * against the player, so it can move them to the new one without this
 * worker knowing who the phone belongs to.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as ExtendableEvent & { oldSubscription: PushSubscription | null; newSubscription: PushSubscription | null };
  const old = e.oldSubscription;
  if (!old) return;
  e.waitUntil((async () => {
    const next = e.newSubscription
      ?? await self.registration.pushManager.subscribe(old.options as PushSubscriptionOptionsInit);
    await fetch('/api/versus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'resubscribe', endpoint: old.endpoint, subscription: next.toJSON() }),
    });
  })());
});
