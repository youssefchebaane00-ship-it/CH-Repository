// =========================================================
// SERVICE WORKER: makes the app work offline once it's installed.
//
// It's a small script the browser runs in the background (only when the
// app is opened from a web address, not from a double-clicked file).
// It keeps a copy of the app's files in a "cache" and answers from it:
//
//   • app files: answered from the cache right away (fast, works offline),
//     and quietly refreshed from the network for next time
//   • Google Fonts: same idea
//   • weather (Open-Meteo): always from the network, never cached, so you
//     never see old weather presented as current
//
// Your data is NOT here: it stays in localStorage/IndexedDB as before.
// =========================================================

const CACHE = "personal-dashboard-v1";

// Which files to keep: read them from index.html, so new modules are
// picked up automatically (every <script src> and <link href> is listed there).
async function appFiles() {
  const html = await (await fetch("./index.html", { cache: "no-store" })).text();
  const local = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png|webmanifest))"/g)].map((m) => m[1]);
  return ["./", "./index.html", ...new Set(local)];
}

// Save one file, trying up to 3 times (servers sometimes answer "busy" for a moment)
async function saveFile(cache, path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.ok) { await cache.put(path, response); return true; }
    } catch {
      // offline or network hiccup: wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Each file separately, so one failure can't block all the others.
    // (A file that still failed is saved the first time the app uses it.)
    const files = await appFiles();
    const results = await Promise.all(files.map((path) => saveFile(cache, path)));
    const failed = files.filter((_, i) => !results[i]);
    if (failed.length) console.warn("Not cached yet (will be cached when used):", failed);
    await self.skipWaiting(); // use the new version straight away
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Remove caches from older versions
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim(); // control open pages without waiting for a reload
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Weather and anything else external: straight to the network
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !isFont) return;

  // "Stale while revalidate": answer from the cache if we have it, and update the cache in the background
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: url.origin === self.location.origin });
    const fresh = fetch(request).then((response) => {
      if (response.ok || response.type === "opaque") cache.put(request, response.clone());
      return response;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(fresh);
      return cached;
    }
    const response = await fresh;
    if (response) return response;
    // Offline and not cached: for page loads, fall back to the app itself
    if (request.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
    return Response.error();
  })());
});
