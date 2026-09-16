// Offline support. Levels, textures and the three.js bundle never change
// without a re-export, so they are cache-first. The app shell is network-first
// so a redeploy reaches players immediately and only falls back to the cache
// when they are actually offline.
const CACHE = 'memory-maze-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'vendor/three.module.js',
  'src/main.js', 'src/config.js', 'src/level.js', 'src/player.js',
  'src/game.js', 'src/input.js', 'src/minimap.js',
  'levels/index.json', 'assets/icon.svg',
];
const IMMUTABLE = /\/(levels|assets|vendor)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function store(request, response) {
  if (response && response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(caches.match(e.request)
      .then((hit) => hit || fetch(e.request).then((res) => store(e.request, res))));
    return;
  }
  e.respondWith(fetch(e.request)
    .then((res) => store(e.request, res))
    .catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))));
});
