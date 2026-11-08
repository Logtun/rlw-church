// RLW Birthdays — Worker (D1 for data, R2 for photos and songs)
const SALT = "REPLACE_WITH_SALT";
const PW_HASH = "REPLACE_WITH_PASSWORD_HASH";
const LAGOS = 3600 * 1000;
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: HEADERS });
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DIM = [31,29,31,30,31,30,31,31,30,31,30,31];

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function eq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, "0")).join(""); }
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, n);
const normName = s => clip(s, 120).toLowerCase().replace(/[^a-z0-9\u00c0-\u024f ]/g, "").replace(/\s+/g, " ").trim();
const lagosStr = ts => ts ? new Date(ts + LAGOS).toISOString().slice(0, 16).replace("T", " ") : "";

let ready = false;
async function init(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_key TEXT NOT NULL, day INTEGER NOT NULL, month INTEGER NOT NULL, phone TEXT, dept TEXT, photo TEXT, orig TEXT, consent INTEGER NOT NULL DEFAULT 1, hidden INTEGER NOT NULL DEFAULT 0, source TEXT, created_at INTEGER NOT NULL, updated_at INTEGER)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS members_month ON members(month, day)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, created_at INTEGER, expires_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ratelimit (k TEXT NOT NULL, ts INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS ratelimit_k ON ratelimit(k, ts)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS songs (month INTEGER PRIMARY KEY, file TEXT NOT NULL, name TEXT, mime TEXT, bytes INTEGER, created_at INTEGER)`),
  ]);
  ready = true;
}
function clientIp(req) {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (req.headers.get("x-vercel-id") && xff) return xff;
  if (xff && req.headers.get("x-rlw-proxy") === "REPLACE_WITH_YOUR_PROXY_KEY") return xff; // via the unified parish site (rlw-church) proxy: real visitor IP
  return req.headers.get("cf-connecting-ip") || xff || "unknown";
}
async function hits(env, key, windowMs) {
  const k = (await sha(SALT + key)).slice(0, 32);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM ratelimit WHERE k = ? AND ts > ?").bind(k, Date.now() - windowMs).first();
  return { k, n: (row && row.n) || 0 };
}
async function addHit(env, k) {
  const now = Date.now();
  if (Math.random() < 0.1) await env.DB.prepare("DELETE FROM ratelimit WHERE ts < ?").bind(now - 86400000).run();
  await env.DB.prepare("INSERT INTO ratelimit (k, ts) VALUES (?, ?)").bind(k, now).run();
}
async function getSetting(env, k) { const r = await env.DB.prepare("SELECT v FROM settings WHERE k = ?").bind(k).first(); return r ? r.v : null; }
async function checkPassword(env, pw) {
  const custom = await getSetting(env, "pw");
  if (custom) { const [salt, hash] = custom.split(":"); return eq(await sha(salt + pw), hash); }
  return eq(await sha(SALT + pw), PW_HASH);
}
async function authed(req, env) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!tok || tok.length < 32) return false;
  const r = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").bind(await sha(tok)).first();
  return !!(r && r.expires_at > Date.now());
}
async function login(req, env) {
  const d = await req.json().catch(() => ({}));
  const h = await hits(env, "login:" + clientIp(req), 15 * 60 * 1000);
  if (h.n >= 10) return J({ ok: false, error: "Too many wrong attempts. Wait 15 minutes and try again." }, 429);
  const pw = String(d.password || "").trim();
  if (!(await checkPassword(env, pw))) { await addHit(env, h.k); return J({ ok: false, error: "That password is not right." }, 401); }
  const tok = randHex(32), now = Date.now();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?,?,?)").bind(await sha(tok), now, now + 30 * 86400000).run();
  return J({ ok: true, token: tok });
}
function validDate(day, month) { return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= DIM[month - 1]; }
async function isJpeg(file) {
  if (!file || typeof file.arrayBuffer !== "function") return null;
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  return buf;
}
async function putPhoto(env, buf) {
  const key = randHex(16) + ".jpg";
  await env.FILES.put("photos/" + key, buf, { httpMetadata: { contentType: "image/jpeg" } });
  return key;
}
async function delFiles(env, keys) { const k = keys.filter(Boolean).map(x => "photos/" + x); if (k.length) await env.FILES.delete(k).catch(() => {}); }
const pub = (m) => ({ id: m.id, name: m.name, day: m.day, month: m.month, phone: m.phone || "", dept: m.dept || "", photo: m.photo ? "img/" + m.photo : "", orig: m.orig ? "img/" + m.orig : "", hidden: !!m.hidden, source: m.source || "", created: lagosStr(m.created_at) });

async function readMemberForm(req) {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) return null;
  return await req.formData();
}

async function submit(req, env) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 9 * 1024 * 1024) return J({ ok: false, error: "That photo is too large. Please choose a smaller one." }, 413);
  const f = await readMemberForm(req).catch(() => null);
  if (!f) return J({ ok: false, error: "Please fill the form again." }, 400);
  if (clip(f.get("website"), 50)) return J({ ok: true, id: 0 }); // honeypot: pretend success
  const elapsed = Number(f.get("elapsed") || 0);
  if (!(elapsed >= 4000)) return J({ ok: false, error: "That was very fast. Please check your details and press Submit again." }, 400);
  const name = clip(f.get("name"), 80), day = parseInt(f.get("day"), 10), month = parseInt(f.get("month"), 10);
  if (name.length < 2 || !/[a-zA-Z\u00c0-\u024f]/.test(name)) return J({ ok: false, error: "Please enter your full name." }, 400);
  if (!validDate(day, month)) return J({ ok: false, error: "Please choose a valid day and month." }, 400);
  if (f.get("consent") !== "1") return J({ ok: false, error: "Please tick the box to agree your name and photo can be shown." }, 400);
  const photo = await isJpeg(f.get("photo"));
  if (!photo) return J({ ok: false, error: "Please add a photo of yourself." }, 400);
  if (photo.length > 3 * 1024 * 1024) return J({ ok: false, error: "That photo is too large. Please choose a smaller one." }, 413);
  const orig = await isJpeg(f.get("orig"));
  const ip = clientIp(req);
  const rl = await hits(env, "submit:" + ip, 60 * 60 * 1000);
  if (rl.n >= 12) return J({ ok: false, error: "Too many forms from this connection in the last hour. Please try again later." }, 429);
  const key = normName(name);
  if (f.get("confirm_dup") !== "1") {
    const dup = await env.DB.prepare("SELECT id FROM members WHERE name_key = ? AND day = ? AND month = ?").bind(key, day, month).first();
    if (dup) return J({ ok: false, dup: true, error: "Someone with this name and birthday is already registered." }, 409);
  }
  await addHit(env, rl.k);
  const pk = await putPhoto(env, photo);
  const ok = orig && orig.length < 5 * 1024 * 1024 ? await putPhoto(env, orig) : null;
  const now = Date.now();
  const r = await env.DB.prepare("INSERT INTO members (name, name_key, day, month, phone, dept, photo, orig, consent, hidden, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,0,'form',?,?)")
    .bind(name, key, day, month, clip(f.get("phone"), 24), clip(f.get("dept"), 60), pk, ok, now, now).run();
  return J({ ok: true, id: r.meta && r.meta.last_row_id });
}

const csvCell = v => { let s = String(v == null ? "" : v); if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvResp = (lines, name) => new Response("\ufeff" + lines.map(l => l.map(csvCell).join(",")).join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="${name}"` } });

async function admin(req, env, path, u) {
  if (!(await authed(req, env))) return J({ ok: false, error: "Please sign in." }, 401);
  const now = Date.now();
  if (path === "/api/admin/members" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM members ORDER BY month, day, name COLLATE NOCASE").all();
    return J({ ok: true, members: results.map(pub), month_now: new Date(now + LAGOS).getUTCMonth() + 1 });
  }
  if (path === "/api/admin/add" && req.method === "POST") {
    const f = await readMemberForm(req).catch(() => null);
    if (!f) return J({ ok: false, error: "bad form" }, 400);
    const name = clip(f.get("name"), 80), day = parseInt(f.get("day"), 10), month = parseInt(f.get("month"), 10);
    if (name.length < 2) return J({ ok: false, error: "Please enter the full name." }, 400);
    if (!validDate(day, month)) return J({ ok: false, error: "Please choose a valid day and month." }, 400);
    const photo = await isJpeg(f.get("photo")), orig = await isJpeg(f.get("orig"));
    const pk = photo ? await putPhoto(env, photo) : null, ok = orig ? await putPhoto(env, orig) : null;
    const r = await env.DB.prepare("INSERT INTO members (name, name_key, day, month, phone, dept, photo, orig, consent, hidden, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,0,'admin',?,?)")
      .bind(name, normName(name), day, month, clip(f.get("phone"), 24), clip(f.get("dept"), 60), pk, ok, now, now).run();
    return J({ ok: true, id: r.meta && r.meta.last_row_id });
  }
  if (path === "/api/admin/update" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const id = Number(b.id); const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
    if (!m) return J({ ok: false, error: "Member not found." }, 404);
    const name = b.name !== undefined ? clip(b.name, 80) : m.name;
    const day = b.day !== undefined ? parseInt(b.day, 10) : m.day, month = b.month !== undefined ? parseInt(b.month, 10) : m.month;
    if (name.length < 2) return J({ ok: false, error: "Name is too short." }, 400);
    if (!validDate(day, month)) return J({ ok: false, error: "Please choose a valid day and month." }, 400);
    const phone = b.phone !== undefined ? clip(b.phone, 24) : m.phone, dept = b.dept !== undefined ? clip(b.dept, 60) : m.dept;
    const hidden = b.hidden !== undefined ? (b.hidden ? 1 : 0) : m.hidden;
    await env.DB.prepare("UPDATE members SET name=?, name_key=?, day=?, month=?, phone=?, dept=?, hidden=?, updated_at=? WHERE id=?").bind(name, normName(name), day, month, phone, dept, hidden, now, id).run();
    return J({ ok: true });
  }
  if (path === "/api/admin/photo" && req.method === "POST") {
    const f = await readMemberForm(req).catch(() => null);
    if (!f) return J({ ok: false, error: "bad form" }, 400);
    const id = Number(f.get("id")); const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
    if (!m) return J({ ok: false, error: "Member not found." }, 404);
    const photo = await isJpeg(f.get("photo"));
    if (!photo) return J({ ok: false, error: "No photo received." }, 400);
    const orig = await isJpeg(f.get("orig"));
    const pk = await putPhoto(env, photo);
    let ok = m.orig;
    if (orig) { ok = await putPhoto(env, orig); }
    await env.DB.prepare("UPDATE members SET photo=?, orig=?, updated_at=? WHERE id=?").bind(pk, ok, now, id).run();
    await delFiles(env, [m.photo, orig ? m.orig : null]);
    return J({ ok: true, photo: "img/" + pk, orig: ok ? "img/" + ok : "" });
  }
  if (path === "/api/admin/delete" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(Number).filter(Number.isInteger);
    let n = 0;
    for (const id of ids) {
      const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
      if (!m) continue;
      await env.DB.prepare("DELETE FROM members WHERE id = ?").bind(id).run();
      await delFiles(env, [m.photo, m.orig]); n++;
    }
    return J({ ok: true, deleted: n });
  }
  if (path === "/api/admin/export.csv" && req.method === "GET") {
    const mo = parseInt(u.searchParams.get("m") || "0", 10);
    const q = mo >= 1 && mo <= 12 ? env.DB.prepare("SELECT * FROM members WHERE month = ? ORDER BY day, name COLLATE NOCASE").bind(mo) : env.DB.prepare("SELECT * FROM members ORDER BY month, day, name COLLATE NOCASE");
    const { results } = await q.all();
    const lines = [["Name", "Day", "Month", "Birthday", "Department / unit", "WhatsApp", "Shown on flyers", "Added by", "Submitted (Lagos time)"]];
    for (const m of results) lines.push([m.name, m.day, MONTHS[m.month - 1], m.day + " " + MONTHS[m.month - 1], m.dept || "", m.phone || "", m.hidden ? "No (hidden)" : "Yes", m.source === "admin" ? "Admin" : "Member form", lagosStr(m.created_at)]);
    return csvResp(lines, mo ? `rlw-birthdays-${MONTHS[mo - 1].toLowerCase()}.csv` : "rlw-birthdays-all.csv");
  }
  if (path === "/api/admin/song" && req.method === "POST") {
    const mo = parseInt(u.searchParams.get("m") || "0", 10);
    if (!(mo >= 1 && mo <= 12)) return J({ ok: false, error: "Pick a month." }, 400);
    const ct = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^audio\//.test(ct) && ct !== "video/mp4") return J({ ok: false, error: "Please choose an audio file (MP3, M4A, WAV or OGG)." }, 400);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length < 1000) return J({ ok: false, error: "That file looks empty." }, 400);
    if (buf.length > 20 * 1024 * 1024) return J({ ok: false, error: "Please choose a song under 20 MB." }, 413);
    const key = "s" + randHex(12);
    await env.FILES.put("songs/" + key, buf, { httpMetadata: { contentType: ct } });
    const old = await env.DB.prepare("SELECT file FROM songs WHERE month = ?").bind(mo).first();
    await env.DB.prepare("INSERT INTO songs (month, file, name, mime, bytes, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(month) DO UPDATE SET file=excluded.file, name=excluded.name, mime=excluded.mime, bytes=excluded.bytes, created_at=excluded.created_at")
      .bind(mo, key, clip(u.searchParams.get("name"), 100) || "Your song", ct, buf.length, now).run();
    if (old) await env.FILES.delete("songs/" + old.file).catch(() => {});
    return J({ ok: true });
  }
  if (path === "/api/admin/song/reset" && req.method === "POST") {
    const b = await req.json().catch(() => ({})); const mo = parseInt(b.m, 10);
    const old = await env.DB.prepare("SELECT file FROM songs WHERE month = ?").bind(mo).first();
    if (old) { await env.DB.prepare("DELETE FROM songs WHERE month = ?").bind(mo).run(); await env.FILES.delete("songs/" + old.file).catch(() => {}); }
    return J({ ok: true });
  }
  if (path === "/api/admin/songs" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT month, file, name, bytes FROM songs").all();
    return J({ ok: true, custom: results.map(r => ({ month: r.month, url: "song/" + r.file, name: r.name, bytes: r.bytes })) });
  }
  if (path === "/api/admin/password" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    if (!(await checkPassword(env, String(b.current || "").trim()))) return J({ ok: false, error: "The current password is not right." }, 400);
    const nw = String(b.next || "").trim();
    if (nw.length < 8) return J({ ok: false, error: "Use at least 8 characters for the new password." }, 400);
    const salt = randHex(16);
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('pw', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(salt + ":" + (await sha(salt + nw))).run();
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash != ?").bind(await sha(tok)).run();
    return J({ ok: true });
  }
  if (path === "/api/admin/design" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const v = b.classic ? "1" : "0";
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('classic', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(v).run();
    return J({ ok: true, classic: v === "1" });
  }
  if (path === "/api/admin/logout" && req.method === "POST") {
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(tok)).run();
    return J({ ok: true });
  }
  return J({ ok: false, error: "not found" }, 404);
}

async function serveR2(env, key, type) {
  const o = await env.FILES.get(key);
  if (!o) return new Response("Not found", { status: 404 });
  const h = new Headers();
  h.set("content-type", (o.httpMetadata && o.httpMetadata.contentType) || type);
  h.set("cache-control", "public, max-age=31536000, immutable");
  h.set("x-robots-tag", "noindex"); h.set("x-content-type-options", "nosniff");
  return new Response(o.body, { headers: h });
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path.startsWith("/api/")) {
        await init(env);
        if (path === "/api/submit" && req.method === "POST") return await submit(req, env);
        if (path === "/api/login" && req.method === "POST") return await login(req, env);
        if (path === "/api/design" && req.method === "GET") {
          return new Response(JSON.stringify({ ok: true, classic: (await getSetting(env, "classic")) === "1" }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
        }
        if (path === "/api/songs" && req.method === "GET") {
          const { results } = await env.DB.prepare("SELECT month, file, name FROM songs").all();
          return J({ ok: true, custom: results.map(r => ({ month: r.month, url: "song/" + r.file, name: r.name })) });
        }
        if (path === "/api/today" && req.method === "GET") {
          const t = new Date(Date.now() + LAGOS), d = t.getUTCDate(), mo = t.getUTCMonth() + 1;
          const { results } = await env.DB.prepare("SELECT name, day, month, dept, photo FROM members WHERE hidden = 0 AND day = ? AND month = ? ORDER BY name COLLATE NOCASE").bind(d, mo).all();
          const body = JSON.stringify({ ok: true, day: d, month: mo, classic: (await getSetting(env, "classic")) === "1", celebrants: results.map(r => ({ name: r.name, day: r.day, month: r.month, dept: r.dept || "", photo: r.photo ? "img/" + r.photo : "" })) });
          return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*", "x-robots-tag": "noindex" } });
        }
        if (path.startsWith("/api/admin/")) return await admin(req, env, path, u);
        return J({ ok: false, error: "not found" }, 404);
      }
      let m;
      if ((m = /^\/img\/([0-9a-f]{32}\.jpg)$/.exec(path))) return await serveR2(env, "photos/" + m[1], "image/jpeg");
      if ((m = /^\/song\/(s[0-9a-f]{24})$/.exec(path))) return await serveR2(env, "songs/" + m[1], "audio/mpeg");
      if (/^\/(_worker|tab-site|\.)/.test(path)) return new Response("Not found", { status: 404 });
      const res = await env.ASSETS.fetch(req);
      const out = new Response(res.body, res);
      if (path === "/admin" || path === "/admin.html") { out.headers.set("x-robots-tag", "noindex"); out.headers.set("cache-control", "no-store"); }
      if (/\.(html|js|css)$/.test(path) || path === "/" || path === "/admin" || path === "/poster") out.headers.set("cache-control", "no-cache");
      out.headers.set("x-content-type-options", "nosniff");
      out.headers.set("referrer-policy", "same-origin");
      return out;
    } catch (e) {
      return J({ ok: false, error: "Something went wrong on our side. Please try again." }, 500);
    }
  }
};
