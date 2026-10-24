// 離線與快取（模組 E）。快取名前綴 tw，改了規則把 VERSION 加一。
// 同網域的頁面、程式、資料：網路優先（3 秒沒回應就用快取），離線時照樣打得開；
// 地圖圖磚與外部函式庫、字型：先用快取、背景更新，圖磚最多留 TILE_MAX 張；
// Firebase 與 Places API 一律不攔截（標記與評分要即時，離線時的標記由 sync.js 處理）。
const VERSION = 'tw-v12';
const TILES = 'tw-tiles-v1';
const TILE_MAX = 400;
const NET_TIMEOUT = 3000;

// 新增同網域檔案要加進這裡
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'css/home.css',
  'css/places.css',
  'css/marks.css',
  'css/inbox.css',
  'css/fx.css',
  'css/photos.css',
  'css/quick.css',
  'js/app.js',
  'js/state.js',
  'js/sync.js',
  'js/util.js',
  'js/icons.js',
  'js/prefs.js',
  'js/quick.js',
  'js/map.js',
  'js/places.js',
  'js/photos.js',
  'js/marks.js',
  'js/inbox.js',
  'data/config.json',
  'data/regions.json',
  'data/places.json',
  'data/geo/counties.json',
  'img/bg/alishan.jpg',
  'img/train-cut.webp',
  'img/bg/jiufen-night.jpg',
  'img/icons/icon.svg',
  'img/icons/icon-192.png',
  'img/icons/icon-512.png',
  'img/icons/apple-touch-icon.png',
];

const STATIC_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  // 單一檔案失敗（例如還沒上線的 css）不該讓整個安裝失敗
  e.waitUntil(caches.open(VERSION).then((c) =>
    Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('tw-') && k !== VERSION && k !== TILES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const withTimeout = (p, ms) => new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error('timeout')), ms);
  p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); no(e); });
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    // 繞過瀏覽器 HTTP 快取（Pages 預設 10 分鐘），改版後馬上拿到新檔
    const res = await withTimeout(fetch(req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' })), NET_TIMEOUT);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html') ?? await cache.match('./');
      if (shell) return shell;
    }
    throw err;
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - TILE_MAX))) await cache.delete(k);
}

async function staleWhileRevalidate(req, name, limit) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()).then(() => limit && trim(cache)); }
    return res;
  }).catch(() => null);
  return hit ?? (await fresh) ?? Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));
  } else if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(staleWhileRevalidate(req, TILES, true));
  } else if (STATIC_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req, VERSION, false));
  }
});
