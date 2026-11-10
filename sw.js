// RLW Parish app service worker. Keeps the homepage shell for offline use.
// Never caches /api/* or any church tool (/firsttimers, /workers, /birthdays, /quiz, /youth, /records, /graphics): those always go to the network.
const VERSION = "rlw-parish-v1";
const SHELL = ["/", "/offline", "/verses.js?v=1", "/logo-d.png?v=2", "/logo-w.png?v=2", "/pastor.jpg?v=3", "/favicon.png",
  "/icons/icon-192.png", "/manifest.webmanifest"];
const SKIP = /^\/(api|firsttimers|workers|birthdays|quiz|youth|records|graphics)(\/|$)/i;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("rlw-parish-") && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // YouTube, maps, fonts: browser handles them
  if (SKIP.test(url.pathname)) return;                  // tools and APIs: never touched, never cached
  if (url.pathname === "/sw.js") return;
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    // network first, so updates show at once; cached copy or the offline page when there is no signal
    e.respondWith(fetch(req).then(r => {
      if (r.ok && (url.pathname === "/" || url.pathname === "/index.html")) { const cp = r.clone(); caches.open(VERSION).then(c => c.put("/", cp)); }
      return r;
    }).catch(() => caches.match(url.pathname === "/" || url.pathname === "/index.html" ? "/" : req).then(m => m || caches.match("/offline"))));
    return;
  }
  // small static files (logos, icons, verses): cached copy at once, refreshed in the background
  e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok && r.type === "basic") c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});
