/* A self-destroying service worker. The app that used to live at this
   address installed a worker that serves its cached shell for every visit;
   that worker checks here for a new version on each load, finds this, and
   installs it. This one clears the caches, unregisters itself, and reloads
   every open tab so the redirect page is what they get. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) { clients.forEach(function (c) { c.navigate(c.url); }); })
  );
});
