const CACHE_NAME = "amanecer-rebelde-v9";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./inventory-utils.js", "./catalog.js", "./firebase-config.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];
const SHELL_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  // Wait for an explicit update so open forms are not discarded.
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('amanecer-rebelde-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = ''; url.hash = '';
  // Cache only public app assets, never auth, inventories or other Pages apps.
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(url.href)) || fetch(event.request);
  })());
});
