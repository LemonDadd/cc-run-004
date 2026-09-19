// Service Worker：离线缓存（app shell + 笔顺数据 + vendor）
const CACHE = 'hanzi-xingben-v1';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'src/app.js',
  'src/data.js',
  'src/stroketype.js',
  'src/geometry.js',
  'src/charview.js',
  'src/grids.js',
  'src/player.js',
  'src/workbook.js',
  'src/exporter.js',
  'src/db.js',
  'src/templates.js',
  'vendor/jspdf.umd.min.js',
  'data/strokes.json',
  'manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 缓存优先，网络回源并补缓存
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreVary: true }).then(hit =>
      hit || fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('index.html'))
    )
  );
});
