// RCCG Rivers of Living Water Parish - unified site.
// Serves the homepage files and passes /firsttimers, /workers, /birthdays, /quiz, /youth and /records to each tool's own site.
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
  async fetch(req, env) {
    const url = new URL(req.url);
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
