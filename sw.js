// ============================================================
//  Severe Malaria Study — Data Collection · Service Worker
//  BUMP THIS VERSION every time you upload a new index.html
//  (or any other file) so devices pick up the update.
const CACHE_VERSION = 'sm-study-v1';
// ============================================================

// App shell — everything needed to run offline.
// The app itself is self-contained inside index.html (logo is embedded,
// no CDN JavaScript libraries), so this list is short.
const APP_FILES = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

// Google Fonts stylesheet (the actual font files are cached at runtime
// on first load). The app has system-font fallbacks if these are absent.
const CDN_FILES = [
  'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
];

// NEVER cache — always hit the live network (the Google Apps Script backend).
const NEVER_CACHE = ['script.google.com', 'docs.google.com'];

// External origins we're allowed to cache at runtime (fonts).
const CACHE_EXTERNAL = ['fonts.googleapis.com', 'fonts.gstatic.com'];

function toAbs(url){ return url.startsWith('http') ? url : new URL(url, self.location.href).href; }

async function cacheOne(cache, url){
  try {
    const req = new Request(url, { cache: 'reload' });
    const res = await fetch(req);
    if (res && (res.status === 200 || res.type === 'opaque')) await cache.put(req, res);
  } catch (e) { console.warn('[SW] Skipped:', url, '-', e.message); }
}

// ── INSTALL: cache the app shell, never fail on one missing file ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      await Promise.all([...APP_FILES, ...CDN_FILES].map(u => cacheOne(cache, toAbs(u))));
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: delete old caches, take control immediately ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
  // NOTE: we intentionally do NOT clear the user's saved drafts/records on update.
});

// ── FETCH: cache-first, then network, then offline page ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  // Backend calls always go to the live network.
  if (NEVER_CACHE.some(p => url.includes(p))) return;

  // Ignore unknown external origins (don't try to cache them).
  const isExternal = !url.startsWith(self.location.origin);
  const isAllowed = CACHE_EXTERNAL.some(o => new URL(url).hostname.includes(o));
  if (isExternal && !isAllowed) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(r => {
          if (r && (r.status === 200 || r.type === 'opaque')) {
            const copy = r.clone();
            caches.open(CACHE_VERSION).then(c => c.put(event.request, copy));
          }
          return r;
        })
        .catch(() => {
          if (event.request.mode === 'navigate')
            return caches.match(toAbs('./offline.html')) || caches.match(toAbs('./index.html'));
          return new Response('', { status: 503 });
        });
    })
  );
});

// ── MESSAGES ──
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'CLEAR_CACHE') caches.delete(CACHE_VERSION);
});
