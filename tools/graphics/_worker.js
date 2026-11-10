// RLW Graphics Generator - Worker.
// Serves the static tool. Base-path aware by design: every link in the page is relative, so it works at its own host
// and at /graphics/ on the parish site (rlw-church proxy). No data is stored: flyers are drawn on the visitor's device.
// /photos/*: the bundled photo library. Served from this site's own files when they are deployed with it,
// otherwise read from the church's GitHub repo (tools/graphics/photos) and cached at the edge.
const PHOTO_SRC = "https://raw.githubusercontent.com/Logtun/rlw-church/main/tools/graphics/photos/";
const PHOTO_TTL = 2592000; // 30 days

async function photo(req, env, ctx, name) {
  const own = await env.ASSETS.fetch(req);
  if (own.ok) return own;
  const cache = caches.default, key = new Request(new URL(req.url).origin + "/photos/" + name);
  let hit = await cache.match(key);
  if (hit) return hit;
  let r;
  try { r = await fetch(PHOTO_SRC + name, { cf: { cacheTtl: PHOTO_TTL, cacheEverything: true } }); }
  catch (e) { return new Response("Photo unavailable", { status: 502, headers: { "cache-control": "no-store" } }); }
  if (!r.ok) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const out = new Response(r.body, { status: 200, headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=" + PHOTO_TTL + ", immutable", "access-control-allow-origin": "*" } });
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (/^\/(_worker|tab-site|\.)/.test(url.pathname)) return new Response("Not found", { status: 404 });
    const m = url.pathname.match(/^\/photos\/([a-z]+-\d+\.jpg)$/);
    if (m && (req.method === "GET" || req.method === "HEAD")) return photo(req, env, ctx, m[1]);
    return env.ASSETS.fetch(req);
  },
};
