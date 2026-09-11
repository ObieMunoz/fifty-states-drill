/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { noticeFor, parsePayload } from './versus/notify';

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
    data: { url: n.url },
  }));
});

/** A tap opens the room: in the app if it is open, else in a new window. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | undefined)?.url ?? '/versus', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => 'navigate' in w);
    if (win) {
      try {
        await win.focus();
        await win.navigate(url);
        return;
      } catch {
        // A window this worker may not steer: open a fresh one instead.
      }
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
