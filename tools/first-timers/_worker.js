// RLW First-Timer Check-in — Worker (D1 storage)
const SALT = "REPLACE_WITH_SALT";
const PW_HASH = "REPLACE_WITH_PASSWORD_HASH";
const LAGOS_OFFSET = 3600 * 1000; // Africa/Lagos is UTC+1, no DST
const DEFAULT_TEMPLATE = "Hello {name}, thank you for worshipping with us at RCCG Rivers of Living Water Parish. It was a joy to have you with us! We would love to see you again this Sunday. If there is anything we can pray with you about, just reply here. God bless you. - The Follow-up Team";
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: HEADERS });

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function eq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, "0")).join(""); }

let ready = false;
async function init(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS visitors (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, service_date TEXT NOT NULL, full_name TEXT NOT NULL, phone TEXT NOT NULL, gender TEXT, age_range TEXT, area TEXT, heard TEXT, heard_other TEXT, wants_visit TEXT, prayer TEXT, consent INTEGER NOT NULL DEFAULT 0, contacted_at INTEGER, contacted_by TEXT, contacted_note TEXT, visited_at INTEGER, visited_by TEXT, visited_note TEXT)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS visitors_created ON visitors(created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, created_at INTEGER, expires_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ratelimit (k TEXT NOT NULL, ts INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS ratelimit_k ON ratelimit(k, ts)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`),
  ]);
  ready = true;
}

function clientIp(req) {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (req.headers.get("x-vercel-id") && xff) return xff; // via the Vercel domain: real visitor IP
  if (xff && req.headers.get("x-rlw-proxy") === "REPLACE_WITH_YOUR_PROXY_KEY") return xff; // via the unified parish site (rlw-church) proxy: real visitor IP
  return req.headers.get("cf-connecting-ip") || xff || "unknown";
}
async function limited(env, kind, req, max, windowMs) {
  const k = kind + ":" + (await sha(SALT + clientIp(req))).slice(0, 24);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM ratelimit WHERE ts < ?").bind(now - 86400000).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM ratelimit WHERE k = ? AND ts > ?").bind(k, now - windowMs).first();
  if ((row && row.n) >= max) return true;
  await env.DB.prepare("INSERT INTO ratelimit (k, ts) VALUES (?, ?)").bind(k, now).run();
  return false;
}

// Nigerian mobile number -> +234XXXXXXXXXX, or null
function normPhone(raw) {
  let s = String(raw || "").replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00234")) s = s.slice(2);
  let rest = null;
  if (/^234\d{10}$/.test(s)) rest = s.slice(3);
  else if (/^2340\d{10}$/.test(s)) rest = s.slice(4);
  else if (/^0\d{10}$/.test(s)) rest = s.slice(1);
  else if (/^\d{10}$/.test(s)) rest = s;
  if (!rest || !/^[789][01]\d{8}$/.test(rest)) return null;
  return "+234" + rest;
}
// The service date is the Lagos calendar day the card was filled (Sunday service, or a midweek service).
function serviceDate(ts) { return new Date(ts + LAGOS_OFFSET).toISOString().slice(0, 10); }
// Start (UTC ms) of the most recent Sunday 00:00 in Lagos: the church week.
function weekStart(ts) {
  const d = new Date(ts + LAGOS_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()) - LAGOS_OFFSET;
}
const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const AGES = ["Under 18", "18-25", "26-35", "36-50", "50+"];
const HEARD = ["Invited by a member", "Social media", "Passing by", "Other"];
const GENDERS = ["Male", "Female"];

async function checkin(req, env) {
  let d; try { d = await req.json(); } catch (e) { return J({ ok: false, error: "Could not read the form." }, 400); }
  if (d.website || d.company) return J({ ok: true }); // honeypot: pretend success
  if (d.t && Date.now() - Number(d.t) < 2500) return J({ ok: true }); // filled in under 2.5 s: a script
  const name = clip(d.full_name, 80);
  if (name.length < 2) return J({ ok: false, field: "full_name", error: "Please enter your full name." }, 400);
  const phone = normPhone(d.phone);
  if (!phone) return J({ ok: false, field: "phone", error: "Please enter a Nigerian phone number, e.g. 0803 123 4567 or +234 803 123 4567." }, 400);
  const age = AGES.includes(d.age_range) ? d.age_range : "";
  if (!age) return J({ ok: false, field: "age_range", error: "Please choose your age range." }, 400);
  const heard = HEARD.includes(d.heard) ? d.heard : "";
  if (!heard) return J({ ok: false, field: "heard", error: "Please tell us how you heard about us." }, 400);
  const visit = d.wants_visit === "Yes" || d.wants_visit === "No" ? d.wants_visit : "";
  if (!visit) return J({ ok: false, field: "wants_visit", error: "Please choose Yes or No." }, 400);
  if (await limited(env, "checkin", req, 60, 10 * 60 * 1000)) return J({ ok: false, error: "Too many check-ins from this device. Please wait a few minutes and try again." }, 429);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO visitors (created_at, service_date, full_name, phone, gender, age_range, area, heard, heard_other, wants_visit, prayer, consent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(now, serviceDate(now), name, phone, GENDERS.includes(d.gender) ? d.gender : "", age, clip(d.area, 160), heard, heard === "Other" ? clip(d.heard_other, 120) : "", visit, clip(d.prayer, 1500), d.consent ? 1 : 0).run();
  return J({ ok: true, first: name.split(/\s+/)[0] });
}

async function authed(req, env) {
  const h = req.headers.get("authorization") || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!/^[0-9a-f]{64}$/.test(tok)) return false;
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").bind(await sha(tok)).first();
  return !!(row && row.expires_at > Date.now());
}

async function login(req, env) {
  let d; try { d = await req.json(); } catch (e) { d = {}; }
  if (await limited(env, "login", req, 10, 15 * 60 * 1000)) return J({ ok: false, error: "Too many attempts. Wait 15 minutes and try again." }, 429);
  const pw = String(d.password || "").trim();
  if (!eq(await sha(SALT + pw), PW_HASH)) return J({ ok: false, error: "That password is not right." }, 401);
  const tok = randHex(32), now = Date.now();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?,?,?)").bind(await sha(tok), now, now + 30 * 86400000).run();
  return J({ ok: true, token: tok });
}

async function getTemplate(env) {
  const r = await env.DB.prepare("SELECT v FROM settings WHERE k = 'wa_template'").first();
  return r && r.v ? r.v : DEFAULT_TEMPLATE;
}

function stats(rows) {
  const now = Date.now();
  const ws = weekStart(now);
  const l = new Date(now + LAGOS_OFFSET);
  const monthKey = l.toISOString().slice(0, 7);
  let week = 0, month = 0, open = 0;
  for (const r of rows) {
    if (r.created_at >= ws) week++;
    if (new Date(r.created_at + LAGOS_OFFSET).toISOString().slice(0, 7) === monthKey) month++;
    if (!r.contacted_at) open++;
  }
  return { week, month, open, total: rows.length };
}

const CSV_COLS = ["id", "submitted_lagos", "service_date", "full_name", "phone", "gender", "age_range", "area", "heard", "heard_other", "wants_visit", "consent", "prayer", "contacted_at_lagos", "contacted_by", "contacted_note", "visited_at_lagos", "visited_by", "visited_note"];
const lagosStr = ts => ts ? new Date(ts + LAGOS_OFFSET).toISOString().slice(0, 16).replace("T", " ") : "";
function csvCell(v) { let s = String(v == null ? "" : v); if (/^[=+\-@]/.test(s) && !/^\+234\d+$/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

async function team(req, env, path) {
  if (!(await authed(req, env))) return J({ ok: false, error: "Please sign in." }, 401);
  if (path === "/api/team/list" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM visitors ORDER BY created_at DESC").all();
    const seen = {};
    for (const r of results) seen[r.phone] = (seen[r.phone] || 0) + 1;
    for (const r of results) r.times = seen[r.phone];
    return J({ ok: true, rows: results, stats: stats(results), template: await getTemplate(env) });
  }
  if (path === "/api/team/mark" && req.method === "POST") {
    const d = await req.json().catch(() => ({}));
    const id = Number(d.id); if (!Number.isInteger(id)) return J({ ok: false, error: "bad id" }, 400);
    const kind = d.kind === "visited" ? "visited" : d.kind === "contacted" ? "contacted" : null;
    if (!kind) return J({ ok: false, error: "bad kind" }, 400);
    if (d.undo) await env.DB.prepare(`UPDATE visitors SET ${kind}_at = NULL, ${kind}_by = NULL, ${kind}_note = NULL WHERE id = ?`).bind(id).run();
    else {
      const by = clip(d.by, 60); if (!by) return J({ ok: false, error: "Please add your name." }, 400);
      await env.DB.prepare(`UPDATE visitors SET ${kind}_at = ?, ${kind}_by = ?, ${kind}_note = ? WHERE id = ?`).bind(Date.now(), by, clip(d.note, 500), id).run();
    }
    return J({ ok: true, row: await env.DB.prepare("SELECT * FROM visitors WHERE id = ?").bind(id).first() });
  }
  if (path === "/api/team/delete" && req.method === "POST") {
    const d = await req.json().catch(() => ({}));
    const id = Number(d.id); if (!Number.isInteger(id)) return J({ ok: false, error: "bad id" }, 400);
    const r = await env.DB.prepare("DELETE FROM visitors WHERE id = ?").bind(id).run();
    return J({ ok: true, deleted: r.meta ? r.meta.changes : null });
  }
  if (path === "/api/team/settings" && req.method === "POST") {
    const d = await req.json().catch(() => ({}));
    const t = clip(d.template, 1000);
    if (t.length < 5) return J({ ok: false, error: "The message is too short." }, 400);
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('wa_template', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(t).run();
    return J({ ok: true, template: t });
  }
  if (path === "/api/team/export.csv" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM visitors ORDER BY created_at DESC").all();
    const lines = [CSV_COLS.join(",")];
    for (const r of results) {
      const o = { ...r, submitted_lagos: lagosStr(r.created_at), contacted_at_lagos: lagosStr(r.contacted_at), visited_at_lagos: lagosStr(r.visited_at), consent: r.consent ? "Yes" : "No" };
      lines.push(CSV_COLS.map(c => csvCell(o[c])).join(","));
    }
    return new Response("\ufeff" + lines.join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="rlw-first-timers-${serviceDate(Date.now())}.csv"` } });
  }
  if (path === "/api/team/logout" && req.method === "POST") {
    const tok = (req.headers.get("authorization") || "").slice(7).trim();
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(tok)).run();
    return J({ ok: true });
  }
  return J({ ok: false, error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path.startsWith("/api/")) {
        await init(env);
        if (path === "/api/checkin" && req.method === "POST") return await checkin(req, env);
        if (path === "/api/login" && req.method === "POST") return await login(req, env);
        if (path.startsWith("/api/team/")) return await team(req, env, path);
        return J({ ok: false, error: "not found" }, 404);
      }
      if (/^\/(_worker|tab-site)/.test(path)) return new Response("Not found", { status: 404 });
      const res = await env.ASSETS.fetch(req);
      const out = new Response(res.body, res);
      if (path === "/team" || path === "/team.html") { out.headers.set("x-robots-tag", "noindex"); out.headers.set("cache-control", "no-store"); }
      out.headers.set("x-content-type-options", "nosniff");
      out.headers.set("referrer-policy", "same-origin");
      return out;
    } catch (e) {
      return J({ ok: false, error: "Something went wrong on our side. Please try again." }, 500);
    }
  }
};
