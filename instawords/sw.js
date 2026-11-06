// Service worker: makes the whole site work offline.
// VERSION and ASSETS are filled in by scripts/build-site.mjs; a new VERSION replaces the old cache.
const VERSION = "b3923395a94a389a";
const ASSETS = [
  "./",
  "InstaWords.xlam",
  "LICENSE.txt",
  "Tafqit.bas",
  "assets/app.js",
  "assets/bulk.js",
  "assets/release.js",
  "assets/single.js",
  "assets/style.css",
  "bulk.html",
  "excel.html",
  "fonts/OFL.txt",
  "fonts/plex-arabic-arabic-400.woff2",
  "fonts/plex-arabic-arabic-700.woff2",
  "fonts/plex-arabic-latin-400.woff2",
  "fonts/plex-arabic-latin-700.woff2",
  "icon.svg",
  "img/fastkiwi.svg",
  "index.html",
  "lib/catalog.js",
  "lib/csv.js",
  "lib/engine.js",
  "lib/errors.js",
  "lib/generated/units-data.js",
  "lib/index.js",
  "lib/lang/ar.js",
  "lib/lang/en.js",
  "lib/lang/fr.js",
  "lib/lang/index.js",
  "lib/lang/types.js",
  "lib/lexicon.js",
  "lib/normalize.js",
  "lib/types.js",
  "manifest.webmanifest",
  "release-fallback.json",
  "units.json"
];

const CACHE = `tafket-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("tafket-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Other origins are never cached or answered here. In particular the GitHub API call for the
  // latest Windows release goes straight to the network: offline it simply fails and the page
  // falls back to the release it ships with, instead of showing a stale or broken cached answer.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/units.json")) {
    event.respondWith(cacheThenUpdate(event));
  } else {
    event.respondWith(cacheFirst(req));
  }
});

async function store(cache, req, res) {
  if (res && res.ok && res.type === "basic") await cache.put(req, res.clone());
  return res;
}

// HTML, CSS, JS, icon…: served from the cache; anything not precached is cached on first use.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const isPage = req.mode === "navigate";
  const hit = await cache.match(req, { ignoreSearch: isPage });
  if (hit) return hit;
  try {
    return await store(cache, req, await fetch(req));
  } catch (err) {
    if (isPage) {
      const fallback = await cache.match("index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}

// units.json: answer from the cache at once, and refresh the cached copy from the network.
async function cacheThenUpdate(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req)
    .then((res) => store(cache, req, res))
    .catch(() => undefined);
  event.waitUntil(network);
  if (hit) return hit;
  const res = await network;
  return res ?? Response.error();
}
