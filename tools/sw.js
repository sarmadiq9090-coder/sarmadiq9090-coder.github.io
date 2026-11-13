/* FastKiwi Toolbox service worker (scope /tools/). It caches ONLY the files the tools need to work offline
   (their pages, scripts, strings, the vendored libraries and the few shared site files they use: style, fonts, logo and lockups)
   and leaves every other request alone. Bump VERSION when you change any file in PRECACHE.
   Pages, scripts and strings: network first (3 s, then the cached copy), so updates show up when online.
   Vendored libraries and fonts (versioned, never change): cache first; pdf.js's optional data files are cached on first use. */
const VERSION = '2026-11-13.3';
const CACHE = 'fk-tools-' + VERSION;
const PRECACHE = [
  '/tools/pdf/', '/tools/pdf/ar/',
  '/tools/pdf/app.js', '/tools/pdf/core.js', '/tools/pdf/pdf.css',
  '/tools/pdf/i18n/en.json', '/tools/pdf/i18n/ar.json',
  '/tools/pdf/manifest.webmanifest', '/tools/pdf/ar/manifest.webmanifest',
  '/tools/lib/i18n.js', '/tools/lib/pwa.js', '/tools/lib/zip.js', '/tools/tools.css',
  '/tools/icons/pdf-kit.svg', '/tools/icons/pdf-kit-192.png',
  '/tools/vendor/pdf-lib-1.17.1/pdf-lib.esm.min.js',
  '/tools/vendor/pdfjs-dist-6.5.438/pdf.min.mjs', '/tools/vendor/pdfjs-dist-6.5.438/pdf.worker.min.mjs',
  '/style.css', '/img/logo.svg', '/favicon.ico',
  '/img/fastkiwi-latin.svg', '/img/fastkiwi-arabic.svg', '/img/fastkiwi-latin-dark.svg', '/img/fastkiwi-arabic-dark.svg',
  '/fonts/rubik-latin-wght.woff2', '/fonts/rubik-arabic-wght.woff2',
  '/fonts/plex-arabic-latin-400.woff2', '/fonts/plex-arabic-latin-700.woff2',
  '/fonts/plex-arabic-arabic-400.woff2', '/fonts/plex-arabic-arabic-700.woff2'
];
const IMMUTABLE = p => p.startsWith('/tools/vendor/') || p.startsWith('/fonts/');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(p => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('fk-tools-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (IMMUTABLE(p)) e.respondWith(cacheFirst(req));
  else if (PRECACHE.includes(p)) e.respondWith(networkFirst(req));
  // anything else (other site pages, /tools/ index): not ours, the browser handles it normally
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
  net.catch(() => {}); // a late failure after the timeout is not an error
  const cached = () => cache.match(req, { ignoreSearch: true });
  const timeout = new Promise(r => setTimeout(r, 3000));
  try {
    const res = await Promise.race([net, timeout]);
    if (res) return res;
    return (await cached()) || (await net); // slow network: the cached copy now, if there is one
  } catch {
    const hit = await cached();
    if (hit) return hit;
    throw new Error('offline and not cached');
  }
}
