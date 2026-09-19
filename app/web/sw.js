// sw.js - offline caching
const VERSION = 'v1';
const SHELL_CACHE = 'hanzi-shell-' + VERSION;
const DATA_CACHE = 'hanzi-data-' + VERSION;

const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/data.js',
  'js/db.js',
  'js/animator.js',
  'js/sheet.js',
  'vendor/jspdf.umd.min.js',
  'manifest.webmanifest',
  'icon.svg',
  'data/manifest.json',
  'data/templates.json',
  'data/sequences.json',
  'data/pinyin.json',
  'data/primers.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

// data files: network-first while online (fresh), fall back to cache offline
async function staleWhileRevalidate(req) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== 'GET') return;

  if (url.pathname.includes('/data/c')) {
    event.respondWith(staleWhileRevalidate(event.request));
  } else if (url.pathname.startsWith('/data/') || url.pathname.startsWith('/js/') ||
             url.pathname.startsWith('/css/') || url.pathname.startsWith('/vendor/') ||
             url.pathname.endsWith('.html') || url.pathname.endsWith('.svg') ||
             url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('/')) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
  }
});

// Preload every data chunk into the data cache for full offline use.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_DATA') {
    event.waitUntil(cacheAllData(event));
  }
});

async function cacheAllData(event) {
  const cache = await caches.open(DATA_CACHE);
  const manifest = await (await fetch('data/manifest.json')).json();
  for (const [name] of manifest.chunks) {
    try {
      const res = await fetch('data/' + name, { cache: 'reload' });
      if (res.ok) await cache.put('data/' + name, res);
    } catch (e) {
      // network failed: keep what's cached
    }
  }
  if (event.source) event.source.postMessage({ type: 'CACHE_DATA_DONE' });
}
