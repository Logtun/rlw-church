// RCCG Rivers of Living Water Parish - unified site.
// Serves the homepage files and passes /firsttimers, /workers, /birthdays, /quiz, /youth and /records to each tool's own site.
// /api/sermons serves the church YouTube channel's latest videos (cached). /manifest.webmanifest and /sw.js (plain files) make the site an installable app.
// No data lives here: every tool keeps its own storage. Domain-agnostic: links use the request's own origin.
const PROXY_KEY = "REPLACE_WITH_YOUR_PROXY_KEY"; // shared with the tools so they trust the visitor IP and base address we forward
const TOOLS = {
  firsttimers: { up: "https://rlw-first-timers.sites.tab.bot", name: "First-Timer Check-in" },
  workers: { up: "https://rlw-workers.sites.tab.bot", name: "Workers' Attendance" },
  birthdays: { up: "https://rlw-birthdays.sites.tab.bot", name: "Birthdays" },
  quiz: { up: "https://rlw-bible-quiz.sites.tab.bot", name: "Bible Quiz Night" },
  youth: { up: "https://rlw-youth.sites.tab.bot", name: "Youth Cave" },
  records: { up: "https://rlw-records.sites.tab.bot", name: "Ushering & Records" },
};
const HOP = ["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer",
  "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "cf-worker", "x-real-ip", "x-forwarded-host", "x-forwarded-proto",
  "x-vercel-id", "x-rlw-proxy", "x-rlw-base", "content-length"];
// pages that get no top bar (print posters, the embedded birthday card frame)
const NO_BAR = /^\/(poster|today)(\.html)?$/;

const BAR_CSS = `#rlw-bar{all:initial;display:block;box-sizing:border-box;width:100%;background:#1B2A6B;border-bottom:3px solid #0A8F4A;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;position:relative;z-index:50}
#rlw-bar *{box-sizing:border-box}
#rlw-bar .rb-in{max-width:1080px;margin:0 auto;display:flex;align-items:center;gap:10px;padding:6px 14px;min-height:50px}
#rlw-bar a{color:#fff;text-decoration:none;font-family:inherit}
#rlw-bar .rb-brand{display:flex;align-items:center;gap:9px;margin-right:auto;min-width:0}
#rlw-bar .rb-brand img{height:36px;width:auto;display:block;border:0}
#rlw-bar .rb-brand b{font-size:14px;font-weight:700;line-height:1.15;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rlw-bar .rb-brand small{display:block;font-size:11.5px;font-weight:500;color:#cfd5f0}
#rlw-bar .rb-home{flex:none;font-size:14px;font-weight:700;padding:8px 14px;border-radius:999px;background:#0A8F4A;color:#fff;line-height:1}
#rlw-bar .rb-home:hover{background:#0c9f53}
#rlw-bar a:focus-visible{outline:3px solid #fff;outline-offset:2px}
@media print{#rlw-bar{display:none!important}}`;

// Latest Sermons: the church YouTube channel's public feed, read on the server and cached ~30 min.
const YT_CHANNEL_ID = "UCLmofy14h42gEqhL0gxBQYQ"; // @riversoflivingwaterparish
const YT_FEED = "https://www.youtube.com/feeds/videos.xml?channel_id=" + YT_CHANNEL_ID;
const SERMON_TTL = 1800;           // fresh copy: 30 minutes
let memSermons = null;             // last good copy held by this worker instance

function xmlText(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&").trim();
}
function parseFeed(xml) {
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = (e.match(/<yt:videoId>([\w-]{6,20})<\/yt:videoId>/) || [])[1];
    if (!id) continue;
    const title = xmlText((e.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1]);
    const published = (e.match(/<published>([^<]+)<\/published>/) || [, ""])[1];
    out.push({ id, title, published, thumb: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg", url: "https://www.youtube.com/watch?v=" + id });
    if (out.length >= 6) break;
  }
  return out;
}
function sermonResp(body, maxAge) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + maxAge,
    "access-control-allow-origin": "*", "x-sermons-source": body.source } });
}
// Cache layers: this worker's memory (30 minutes) and Cloudflare's edge cache of the YouTube feed (30 minutes).
// If YouTube ever fails: the last good copy in memory, else /sermons-snapshot.json (real videos saved at the last publish).
// With nothing at all, an empty list, and the page shows a link to the channel instead.
async function sermons(req, env, ctx) {
  const now = Date.now();
  const age = b => b && b.fetchedAt ? (now - b.fetchedAt) / 1000 : Infinity;
  if (age(memSermons) < SERMON_TTL) return sermonResp(Object.assign({}, memSermons, { source: "cache" }), 600);
  let videos = null, err = "";
  try {
    const r = await fetch(YT_FEED, { headers: { "user-agent": "Mozilla/5.0 (RLW Parish site)", accept: "application/atom+xml,application/xml,text/xml" }, cf: { cacheTtl: SERMON_TTL, cacheEverything: true } });
    if (r.ok) videos = parseFeed(await r.text()); else err = "feed " + r.status;
  } catch (e) { err = "feed unreachable"; }
  if (videos && videos.length) {
    memSermons = { channel: "https://www.youtube.com/@riversoflivingwaterparish", channelId: YT_CHANNEL_ID, updated: new Date(now).toISOString(), fetchedAt: now, videos };
    return sermonResp(Object.assign({}, memSermons, { source: "live" }), 900);
  }
  let last = memSermons;
  if (!last || !last.videos || !last.videos.length) {
    try { const s = await env.ASSETS.fetch(new Request(new URL("/sermons-snapshot.json", req.url))); if (s.ok) last = await s.json(); } catch (e) {}
  }
  if (last && last.videos && last.videos.length) return sermonResp(Object.assign({}, last, { source: "stale", note: err || "empty feed" }), 300);
  return sermonResp({ channel: "https://www.youtube.com/@riversoflivingwaterparish", channelId: YT_CHANNEL_ID, updated: new Date(now).toISOString(), videos: [], source: "empty", note: err || "no videos" }, 120);
}

function barHtml(tool) {
  return `<style>${BAR_CSS}</style><div id="rlw-bar" role="banner"><div class="rb-in"><a class="rb-brand" href="/" aria-label="Rivers of Living Water Parish, home"><img src="/logo-bar.png" width="28" height="36" alt=""><b>Rivers of Living Water Parish<small>${TOOLS[tool].name}</small></b></a><a class="rb-home" href="/">Home</a></div></div>`;
}

function rewriteLoc(loc, tool, origin) {
  if (!loc) return loc;
  const up = TOOLS[tool].up;
  if (loc.startsWith(up)) return origin + "/" + tool + (loc.slice(up.length) || "/");
  if (loc.startsWith("/") && !loc.startsWith("//")) return "/" + tool + loc;
  return loc;
}

async function proxy(req, url, tool, rest) {
  const up = TOOLS[tool].up;
  const target = up + rest + url.search;
  const h = new Headers();
  for (const [k, v] of req.headers) if (!HOP.includes(k.toLowerCase())) h.set(k, v);
  h.set("x-forwarded-for", req.headers.get("cf-connecting-ip") || "");
  h.set("x-rlw-proxy", PROXY_KEY);
  h.set("x-rlw-base", url.origin + "/" + tool);
  const init = { method: req.method, headers: h, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = req.body;
  let r;
  try { r = await fetch(target, init); }
  catch (e) { return new Response("This page could not be reached. Please try again in a moment.", { status: 502, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }); }
  const oh = new Headers(r.headers);
  if (oh.has("location")) oh.set("location", rewriteLoc(oh.get("location"), tool, url.origin));
  // cookies (none today) stay scoped to their tool's folder
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) { oh.delete("set-cookie"); for (const c of sc) oh.append("set-cookie", /;\s*path=/i.test(c) ? c.replace(/;\s*path=\/?([^;]*)/i, (m0, p) => "; Path=/" + tool + (p ? "/" + p : "")) : c + "; Path=/" + tool); }
  oh.delete("x-tab-sites-served-by");
  const resp = new Response(r.body, { status: r.status, statusText: r.statusText, headers: oh });
  const ct = oh.get("content-type") || "";
  if (!ct.includes("text/html") || req.method === "HEAD" || r.status === 304) return resp;
  const pageUrl = url.origin + url.pathname;
  let rw = new HTMLRewriter()
    .on('meta[property="og:url"]', { element(e) { e.setAttribute("content", pageUrl); } })
    .on('link[rel="canonical"]', { element(e) { e.setAttribute("href", pageUrl); } });
  if (!NO_BAR.test(rest)) rw = rw.on("body", { element(e) { e.prepend(barHtml(tool), { html: true }); } });
  return rw.transform(resp);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/api/sermons") return sermons(req, env, ctx);
    const m = url.pathname.match(/^\/(firsttimers|workers|birthdays|quiz|youth|records)(\/.*)?$/i);
    if (m) {
      const tool = m[1].toLowerCase();
      if (!m[2] || m[1] !== tool) return Response.redirect(url.origin + "/" + tool + (m[2] || "/") + url.search, 301);
      return proxy(req, url, tool, m[2]);
    }
    if (/^\/(_worker|tab-site|\.)/.test(url.pathname)) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(req);
  },
};
