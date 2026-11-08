// RLW Youth Cave — Worker (D1 for data, R2 for uploads)
// Two roles: "youth" (members, view + suggestion box) and "exco" (everything).
// Base-path aware: served at its own host and at /youth/ on the parish site (rlw-church proxy).
const SALT = "REPLACE_WITH_SALT";
const YOUTH_HASH = "REPLACE_WITH_YOUTH_PASSWORD_HASH";
const EXCO_HASH = "REPLACE_WITH_EXCO_PASSWORD_HASH";
const SIGN_KEY = "REPLACE_WITH_SIGNING_KEY";
const PROXY_KEY = "REPLACE_WITH_YOUR_PROXY_KEY"; // shared with the parish site proxy so the visitor IP and base address it forwards are trusted
const PUBQ = "https://rlw-youth.sites.tab.bot";
const LAGOS = 3600 * 1000; // Africa/Lagos is UTC+1, no DST
const DAY = 86400000;
const SESSION_MS = 30 * DAY;
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: HEADERS });
const enc = new TextEncoder();

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
let hkey = null;
async function hmac(s) {
  if (!hkey) hkey = await crypto.subtle.importKey("raw", enc.encode(SIGN_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const b = await crypto.subtle.sign("HMAC", hkey, enc.encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function eq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, "0")).join(""); }
const b64u = s => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const clip1 = (v, n) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, n);
const clipN = (v, n) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim().slice(0, n);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s + "T00:00:00Z"));
const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || "");
const lagosDate = ts => new Date(ts + LAGOS).toISOString().slice(0, 10);

const viaProxy = req => req.headers.get("x-rlw-proxy") === PROXY_KEY;
function pubBase(req) { const b = req && viaProxy(req) ? (req.headers.get("x-rlw-base") || "") : ""; return /^https:\/\/[^\s"'<>]+$/.test(b) ? b.replace(/\/+$/, "") : PUBQ; }
function clientIp(req) {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (xff && viaProxy(req)) return xff; // via the unified parish site (rlw-church) proxy: real visitor IP
  return req.headers.get("cf-connecting-ip") || "unknown";
}

// ---------- schema ----------
// field types: date, time, text:N (one line), long:N (multi-line), money, bool, int, file
const SECTIONS = {
  offerings: { fields: { date: "date!", title: "text:80!", amount: "money!", counted_by: "text:120", notes: "long:2000", photo: "file" }, order: "date DESC, id DESC", money: true },
  events: { fields: { title: "text:120!", date: "date!", time: "time", venue: "text:160", description: "long:3000", photo: "file" }, order: "date ASC, time ASC, id ASC" },
  announcements: { fields: { title: "text:140!", body: "long:4000", date: "date!", pinned: "bool" }, order: "pinned DESC, date DESC, id DESC" },
  minutes: { fields: { date: "date!", title: "text:140", attendees: "long:1500", body: "long:12000" }, order: "date DESC, id DESC" },
  actions: { fields: { minute_id: "int!", what: "text:300!", who: "text:120", due: "date", done: "bool" }, order: "done ASC, due ASC, id ASC" },
  roster: { fields: { date: "date!", duty: "text:60!", person: "text:160" }, order: "date DESC, duty COLLATE NOCASE ASC, id ASC" },
  exco: { fields: { name: "text:100!", role: "text:80!", phone: "text:30", photo: "file", sort: "int" }, order: "sort ASC, id ASC" },
  members: { fields: { name: "text:100!", sort: "int" }, order: "sort ASC, name COLLATE NOCASE ASC", money: true },
  expenses: { fields: { date: "date!", item: "text:160!", category: "text:40!", amount: "money!", paid_to: "text:120", approved_by: "text:120", notes: "long:2000", receipt: "file" }, order: "date DESC, id DESC", money: true },
};
const FILE_COLS = { offerings: "photo", events: "photo", exco: "photo", expenses: "receipt" }; // tables that hold uploaded files, and the column
const SQLT = { date: "TEXT", time: "TEXT", text: "TEXT", long: "TEXT", money: "REAL", bool: "INTEGER", int: "INTEGER", file: "TEXT" };
const PLACEHOLDER_ROLES = ["President", "Vice President", "General Secretary", "Financial Secretary", "Treasurer", "Welfare Director", "Music and Media Director", "Evangelism Director"];

let ready = false;
async function init(env) {
  if (ready) return;
  const stmts = [];
  for (const [name, s] of Object.entries(SECTIONS)) {
    const cols = Object.entries(s.fields).map(([k, t]) => k + " " + SQLT[t.split(":")[0].replace("!", "")]).join(", ");
    stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${name} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${cols}, created_at INTEGER NOT NULL, updated_at INTEGER)`));
  }
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS contrib (member_id INTEGER NOT NULL, year INTEGER NOT NULL, month INTEGER NOT NULL, amount REAL NOT NULL, PRIMARY KEY (member_id, year, month))`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL)`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, created_at INTEGER, expires_at INTEGER)`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS ratelimit (k TEXT NOT NULL, ts INTEGER NOT NULL)`));
  stmts.push(env.DB.prepare(`CREATE INDEX IF NOT EXISTS ratelimit_k ON ratelimit(k, ts)`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`));
  stmts.push(env.DB.prepare(`CREATE INDEX IF NOT EXISTS actions_m ON actions(minute_id)`));
  stmts.push(env.DB.prepare(`CREATE INDEX IF NOT EXISTS expenses_d ON expenses(date)`));
  await env.DB.batch(stmts);
  const seeded = await env.DB.prepare("SELECT v FROM settings WHERE k = 'exco_seeded'").first();
  if (!seeded) {
    const now = Date.now();
    const b = PLACEHOLDER_ROLES.map((r, i) => env.DB.prepare("INSERT INTO exco (name, role, phone, photo, sort, created_at) VALUES (?, ?, '', '', ?, ?)").bind("Name to be added", r, (i + 1) * 10, now));
    b.push(env.DB.prepare("INSERT INTO settings (k, v) VALUES ('exco_seeded', '1') ON CONFLICT(k) DO NOTHING"));
    await env.DB.batch(b);
  }
  ready = true;
}
async function setting(env, k, dflt) { const r = await env.DB.prepare("SELECT v FROM settings WHERE k = ?").bind(k).first(); return r ? r.v : dflt; }
async function setSetting(env, k, v) { await env.DB.prepare("INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run(); }
async function moneyMode(env) { return (await setting(env, "money", "all")) === "exco" ? "exco" : "all"; }

// ---------- auth ----------
async function pwMatches(env, role, pw) {
  const over = await setting(env, "pw_" + role, "");
  if (over) { const [s, h] = over.split(":"); return eq(await sha(s + pw), h); }
  return eq(await sha(SALT + pw), role === "exco" ? EXCO_HASH : YOUTH_HASH);
}
async function login(req, env) {
  let d; try { d = await req.json(); } catch (e) { d = {}; }
  const lk = (await sha(SALT + "login:" + clientIp(req))).slice(0, 32);
  const now = Date.now();
  if (Math.random() < 0.1) await env.DB.prepare("DELETE FROM ratelimit WHERE ts < ?").bind(now - DAY).run();
  const fails = await env.DB.prepare("SELECT COUNT(*) AS n FROM ratelimit WHERE k = ? AND ts > ?").bind(lk, now - 15 * 60000).first();
  if ((fails && fails.n) >= 10) return J({ ok: false, error: "Too many wrong attempts. Wait 15 minutes and try again." }, 429);
  const pw = String(d.password || "").trim().slice(0, 200);
  let role = null;
  if (pw && await pwMatches(env, "exco", pw)) role = "exco";
  else if (pw && await pwMatches(env, "youth", pw)) role = "youth";
  if (!role) {
    await env.DB.prepare("INSERT INTO ratelimit (k, ts) VALUES (?, ?)").bind(lk, now).run();
    return J({ ok: false, error: "That password is not right." }, 401);
  }
  const payload = b64u(JSON.stringify({ r: role, e: now + SESSION_MS, n: randHex(12) }));
  const tok = payload + "." + await hmac(payload);
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, role, created_at, expires_at) VALUES (?,?,?,?)").bind(await sha(tok), role, now, now + SESSION_MS).run();
  return J({ ok: true, token: tok, role, money: await moneyMode(env) });
}
async function session(req, env) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const dot = tok.lastIndexOf(".");
  if (dot < 10) return null;
  const payload = tok.slice(0, dot), sig = tok.slice(dot + 1);
  if (!eq(await hmac(payload), sig)) return null;
  let p; try { p = JSON.parse(unb64u(payload)); } catch (e) { return null; }
  if (!p || (p.r !== "youth" && p.r !== "exco") || !(p.e > Date.now())) return null;
  const th = await sha(tok);
  const row = await env.DB.prepare("SELECT role, expires_at FROM sessions WHERE token_hash = ?").bind(th).first();
  if (!row || row.expires_at < Date.now() || row.role !== p.r) return null;
  return { role: p.r, th };
}

// ---------- validation ----------
function parseField(type, v) {
  const req = type.endsWith("!"); const t = type.replace("!", ""); const [kind, nStr] = t.split(":"); const n = +nStr || 200;
  let out;
  if (kind === "date") { out = String(v || "").trim(); if (out && !isDate(out)) return { err: "Pick a valid date." }; }
  else if (kind === "time") { out = String(v || "").trim(); if (out && !isTime(out)) return { err: "Time must look like 16:00." }; }
  else if (kind === "text") out = clip1(v, n);
  else if (kind === "long") out = clipN(v, n);
  else if (kind === "money") {
    const s = String(v == null ? "" : v).replace(/[₦,\s]/g, "");
    if (s === "") out = null; else { const x = Number(s); if (!isFinite(x) || x < 0 || x > 1e11) return { err: "Enter the amount in Naira, for example 25000." }; out = Math.round(x * 100) / 100; }
  }
  else if (kind === "bool") out = v === true || v === 1 || v === "1" || v === "true" || v === "on" ? 1 : 0;
  else if (kind === "int") { const x = parseInt(v, 10); out = isFinite(x) ? x : 0; }
  else if (kind === "file") { out = String(v || "").trim(); if (out && !/^up\/[a-f0-9]{24}\.(jpg|png|webp|pdf)$/.test(out)) return { err: "That upload was not recognised. Please upload it again." }; }
  if (req && (out === "" || out === null)) return { err: "missing" };
  return { val: out };
}
const LABELS = { date: "date", title: "title", amount: "amount", name: "name", role: "role", what: "action item", duty: "duty", minute_id: "meeting", item: "item", category: "category" };

async function listSection(env, name) {
  const s = SECTIONS[name];
  const { results } = await env.DB.prepare(`SELECT * FROM ${name} ORDER BY ${s.order}`).all();
  return results;
}
async function saveRow(env, name, body) {
  const s = SECTIONS[name];
  const id = parseInt(body.id, 10) || 0;
  let old = null;
  if (id) { old = await env.DB.prepare(`SELECT * FROM ${name} WHERE id = ?`).bind(id).first(); if (!old) return J({ ok: false, error: "That entry no longer exists. Refresh the page." }, 404); }
  const vals = {};
  for (const [k, t] of Object.entries(s.fields)) {
    if (id && !(k in body)) continue; // partial update keeps the old value
    const r = parseField(t, body[k]);
    if (r.err) return J({ ok: false, error: r.err === "missing" ? "Please fill in the " + (LABELS[k] || k.replace("_", " ")) + "." : r.err }, 400);
    vals[k] = r.val;
  }
  if (name === "actions" && "minute_id" in vals) {
    const m = await env.DB.prepare("SELECT id FROM minutes WHERE id = ?").bind(vals.minute_id).first();
    if (!m) return J({ ok: false, error: "That meeting no longer exists." }, 400);
  }
  const now = Date.now();
  const keys = Object.keys(vals);
  if (id) {
    if (keys.length) await env.DB.prepare(`UPDATE ${name} SET ${keys.map(k => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...keys.map(k => vals[k]), now, id).run();
    const fc = FILE_COLS[name];
    if (old && fc && fc in vals && old[fc] && old[fc] !== vals[fc]) await dropFile(env, old[fc]);
  } else {
    for (const [k, t] of Object.entries(s.fields)) if (!(k in vals)) vals[k] = t.startsWith("money") ? null : (t.startsWith("bool") || t.startsWith("int") ? 0 : "");
    const ks = Object.keys(vals);
    const r = await env.DB.prepare(`INSERT INTO ${name} (${ks.join(", ")}, created_at) VALUES (${ks.map(() => "?").join(", ")}, ?)`).bind(...ks.map(k => vals[k]), now).run();
    return J({ ok: true, id: r.meta.last_row_id });
  }
  return J({ ok: true, id });
}
async function dropFile(env, key) { if (key && env.FILES) { try { await env.FILES.delete(key); } catch (e) {} } }
async function deleteRow(env, name, body) {
  const id = parseInt(body.id, 10) || 0;
  const old = await env.DB.prepare(`SELECT * FROM ${name} WHERE id = ?`).bind(id).first();
  if (!old) return J({ ok: true, gone: true });
  const b = [env.DB.prepare(`DELETE FROM ${name} WHERE id = ?`).bind(id)];
  if (name === "minutes") b.push(env.DB.prepare("DELETE FROM actions WHERE minute_id = ?").bind(id));
  if (name === "members") b.push(env.DB.prepare("DELETE FROM contrib WHERE member_id = ?").bind(id));
  await env.DB.batch(b);
  const fc = FILE_COLS[name];
  if (fc && old[fc]) await dropFile(env, old[fc]);
  return J({ ok: true });
}

// ---------- contributions ----------
async function contribYear(env, year) {
  const { results: members } = await env.DB.prepare(`SELECT id, name, sort FROM members ORDER BY ${SECTIONS.members.order}`).all();
  const { results: cells } = await env.DB.prepare("SELECT member_id, month, amount FROM contrib WHERE year = ?").bind(year).all();
  const { results: yrs } = await env.DB.prepare("SELECT DISTINCT year FROM contrib ORDER BY year").all();
  return { year, members, cells, years: yrs.map(r => r.year) };
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function csvResp(lines, fname) {
  return new Response("\ufeff" + lines.map(l => l.map(csvCell).join(",")).join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${fname}"`, "cache-control": "no-store" } });
}
async function contribCsv(env, year) {
  const d = await contribYear(env, year);
  const grid = {}; for (const c of d.cells) grid[c.member_id + ":" + c.month] = c.amount;
  const lines = [["Member", ...MONTHS, "Total"]];
  const colT = Array(12).fill(0); let all = 0;
  for (const m of d.members) {
    let t = 0; const row = [m.name];
    for (let i = 1; i <= 12; i++) { const a = grid[m.id + ":" + i]; row.push(a == null ? "" : a); if (a != null) { t += a; colT[i - 1] += a; } }
    all += t; row.push(t); lines.push(row);
  }
  lines.push(["Total", ...colT, all]);
  return csvResp(lines, `rlw-youth-contributions-${year}.csv`);
}

// ---------- expenses ----------
// Month summary: Income = offering records dated in that month + contribution cells for that month (contrib.year/month).
const isMonth = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || "");
async function monthIncome(env, ym) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const o = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS t, COUNT(*) AS n FROM offerings WHERE substr(date, 1, 7) = ?").bind(ym).first();
  const c = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS t, COUNT(*) AS n FROM contrib WHERE year = ? AND month = ?").bind(y, m).first();
  const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
  return { offering: r2(o && o.t), offering_n: (o && o.n) || 0, contrib: r2(c && c.t), contrib_n: (c && c.n) || 0, total: r2((Number(o && o.t) || 0) + (Number(c && c.t) || 0)) };
}
async function expensesMonth(env, ym) {
  const { results: rows } = await env.DB.prepare(`SELECT * FROM expenses WHERE substr(date, 1, 7) = ? ORDER BY ${SECTIONS.expenses.order}`).bind(ym).all();
  const by = {}; let total = 0;
  for (const r of rows) { const k = r.category || "Other"; by[k] = (by[k] || 0) + (Number(r.amount) || 0); total += Number(r.amount) || 0; }
  const cats = Object.entries(by).map(([category, t]) => ({ category, total: Math.round(t * 100) / 100 })).sort((a, b) => b.total - a.total);
  total = Math.round(total * 100) / 100;
  const income = await monthIncome(env, ym);
  const { results: ms } = await env.DB.prepare("SELECT DISTINCT substr(date, 1, 7) AS ym FROM expenses ORDER BY ym DESC").all();
  const { results: cs } = await env.DB.prepare("SELECT category, COUNT(*) AS n FROM expenses GROUP BY category ORDER BY n DESC LIMIT 40").all();
  return { month: ym, rows, cats, total, income, balance: Math.round((income.total - total) * 100) / 100, months: ms.map(r => r.ym), used_categories: cs.map(r => r.category) };
}
async function expensesCsv(env, u) {
  const ym = u.searchParams.get("month"), yr = parseInt(u.searchParams.get("year"), 10);
  const head = ["Date", "Item", "Category", "Amount (NGN)", "Paid to", "Approved / paid by", "Notes", "Receipt attached"];
  const line = r => [r.date, r.item, r.category, r.amount, r.paid_to, r.approved_by, r.notes, r.receipt ? "Yes" : "No"];
  if (isMonth(ym)) {
    const d = await expensesMonth(env, ym);
    const rows = d.rows.slice().reverse(); // oldest first in the file
    const L = [head, ...rows.map(line), [], ["Category", "Total (NGN)"], ...d.cats.map(c => [c.category, c.total]), ["Total expenses", d.total], [],
      ["Month summary", ""], ["Offering", d.income.offering], ["Contributions", d.income.contrib], ["Income", d.income.total], ["Expenses", d.total], ["Balance", d.balance]];
    return csvResp(L, `rlw-youth-expenses-${ym}.csv`);
  }
  if (yr >= 2000 && yr <= 2100) {
    const { results } = await env.DB.prepare("SELECT * FROM expenses WHERE substr(date, 1, 4) = ? ORDER BY date ASC, id ASC").bind(String(yr)).all();
    const L = [head, ...results.map(line), [], ["Month", "Offering", "Contributions", "Income", "Expenses", "Balance"]];
    const T = [0, 0, 0, 0, 0];
    for (let m = 1; m <= 12; m++) {
      const ymm = yr + "-" + String(m).padStart(2, "0");
      const inc = await monthIncome(env, ymm);
      const ex = Math.round(results.filter(r => r.date.slice(0, 7) === ymm).reduce((a, r) => a + (Number(r.amount) || 0), 0) * 100) / 100;
      const bal = Math.round((inc.total - ex) * 100) / 100;
      L.push([MONTHS[m - 1] + " " + yr, inc.offering, inc.contrib, inc.total, ex, bal]);
      [inc.offering, inc.contrib, inc.total, ex, bal].forEach((v, i) => T[i] += v);
    }
    L.push(["Year total", ...T.map(v => Math.round(v * 100) / 100)]);
    return csvResp(L, `rlw-youth-expenses-${yr}.csv`);
  }
  return J({ ok: false, error: "Pick a month or a year." }, 400);
}

// ---------- files ----------
const MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
async function upload(req, env) {
  if (!env.FILES) return J({ ok: false, error: "Uploads are not available right now." }, 503);
  const ct = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = MIME[ct];
  if (!ext) return J({ ok: false, error: "Upload a photo (JPG, PNG or WebP) or a PDF." }, 400);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return J({ ok: false, error: "That file is empty." }, 400);
  if (buf.byteLength > 8 * 1024 * 1024) return J({ ok: false, error: "That file is too big. The limit is 8 MB." }, 413);
  const key = "up/" + randHex(12) + "." + ext;
  await env.FILES.put(key, buf, { httpMetadata: { contentType: ct } });
  return J({ ok: true, key });
}
async function referenced(env) {
  const keys = new Set(); const where = {};
  for (const [t, c] of Object.entries(FILE_COLS)) {
    const { results } = await env.DB.prepare(`SELECT ${c} AS f FROM ${t} WHERE ${c} != ''`).all();
    for (const r of results) { keys.add(r.f); where[r.f] = t; }
  }
  return { keys, where };
}
async function serveFile(env, ses, key) {
  if (!/^up\/[a-f0-9]{24}\.(jpg|png|webp|pdf)$/.test(key)) return new Response("Not found", { status: 404 });
  if (ses.role !== "exco") {
    const off = (await env.DB.prepare("SELECT id FROM offerings WHERE photo = ?").bind(key).first()) || (await env.DB.prepare("SELECT id FROM expenses WHERE receipt = ?").bind(key).first());
    if (off && (await moneyMode(env)) === "exco") return new Response("Only Exco can see this.", { status: 403 });
  }
  const o = env.FILES ? await env.FILES.get(key) : null;
  if (!o) return new Response("Not found", { status: 404 });
  return new Response(o.body, { headers: { "content-type": (o.httpMetadata && o.httpMetadata.contentType) || "application/octet-stream", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
}
async function cleanup(env, minAgeMs) {
  if (!env.FILES) return { removed: 0 };
  const { keys } = await referenced(env);
  let removed = 0, cursor;
  const cutoff = Date.now() - minAgeMs;
  do {
    const l = await env.FILES.list({ prefix: "up/", cursor });
    const del = l.objects.filter(o => !keys.has(o.key) && o.uploaded.getTime() < cutoff).map(o => o.key);
    if (del.length) { await env.FILES.delete(del); removed += del.length; }
    cursor = l.truncated ? l.cursor : null;
  } while (cursor);
  return { removed };
}

// ---------- jobs & opportunities ----------
// Filled daily by the updater script through POST /api/jobs/import (header x-import-key).
const IMPORT_HASH = "REPLACE_WITH_IMPORT_KEY_HASH"; // sha256(SALT + "import:" + key); the plain key lives only on the updater's machine
const JOB_CATS = ["jobs", "tech", "remote", "scholarships"];
const JOB_MAX = 120, JOB_AGE_DAYS = 21;
let jobsReady = false;
async function initJobs(env) {
  if (jobsReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, org TEXT, location TEXT, category TEXT NOT NULL, tags TEXT, deadline TEXT, found TEXT NOT NULL, source TEXT, summary TEXT, hidden INTEGER NOT NULL DEFAULT 0, manual INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS jobs_found ON jobs(found)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS jobs_blocked (url TEXT PRIMARY KEY, ts INTEGER NOT NULL)`),
  ]);
  jobsReady = true;
}
const isUrl = s => /^https?:\/\/[^\s"'<>]{4,}$/i.test(s || "");
function cleanJob(it, manual) {
  const url = clip1(it.url, 600);
  if (!isUrl(url)) return { err: "Add a full link that starts with https://" };
  const title = clip1(it.title, 200);
  if (title.length < 3) return { err: "Please fill in the title." };
  const category = JOB_CATS.includes(it.category) ? it.category : "jobs";
  const tags = String(it.tags || "").split(",").map(t => t.trim().toLowerCase()).filter(t => JOB_CATS.includes(t) && t !== category).slice(0, 3).join(",");
  let deadline = String(it.deadline || "").trim(); if (deadline && !isDate(deadline)) deadline = "";
  let found = String(it.found || "").trim(); if (!isDate(found)) found = lagosDate(Date.now());
  return { val: { url, title, org: clip1(it.org, 160), location: clip1(it.location, 120), category, tags, deadline, found, source: clip1(it.source, 60) || (manual ? "Added by Exco" : ""), summary: clipN(it.summary, 600) } };
}
async function pruneJobs(env) {
  const today = lagosDate(Date.now());
  const cutoff = lagosDate(Date.now() - JOB_AGE_DAYS * DAY);
  const a = await env.DB.prepare("DELETE FROM jobs WHERE (manual = 0 AND found < ?) OR (deadline != '' AND deadline < ?)").bind(cutoff, today).run();
  const b = await env.DB.prepare(`DELETE FROM jobs WHERE manual = 0 AND id NOT IN (SELECT id FROM jobs ORDER BY manual DESC, found DESC, id DESC LIMIT ${JOB_MAX})`).run();
  await env.DB.prepare("DELETE FROM jobs_blocked WHERE ts < ?").bind(Date.now() - 60 * DAY).run();
  return ((a.meta && a.meta.changes) || 0) + ((b.meta && b.meta.changes) || 0);
}
async function importJobs(req, env) {
  const key = (req.headers.get("x-import-key") || "").trim();
  if (key.length < 32 || !eq(await sha(SALT + "import:" + key), IMPORT_HASH)) return J({ ok: false, error: "not allowed" }, 403);
  await initJobs(env);
  let d; try { d = await req.json(); } catch (e) { return J({ ok: false, error: "send JSON" }, 400); }
  const items = Array.isArray(d.items) ? d.items.slice(0, 25) : []; // the updater sends small chunks
  const now = Date.now(); let skipped = 0;
  const vals = [];
  for (const it of items) { const c = cleanJob(it, false); if (c.err) skipped++; else if (!vals.some(v => v.url === c.val.url)) vals.push(c.val); }
  let added = 0, updated = 0, blocked = 0;
  if (vals.length) {
    const qs = vals.map(() => "?").join(",");
    const urls = vals.map(v => v.url);
    const bl = new Set((await env.DB.prepare(`SELECT url FROM jobs_blocked WHERE url IN (${qs})`).bind(...urls).all()).results.map(r => r.url));
    const ex = {}; for (const r of (await env.DB.prepare(`SELECT url, manual FROM jobs WHERE url IN (${qs})`).bind(...urls).all()).results) ex[r.url] = r.manual;
    const st = [];
    for (const v of vals) {
      if (bl.has(v.url)) { blocked++; continue; }
      if (v.url in ex) { if (ex[v.url]) { skipped++; continue; } updated++; } else added++;
      st.push(env.DB.prepare("INSERT INTO jobs (url, title, org, location, category, tags, deadline, found, source, summary, hidden, manual, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?) ON CONFLICT(url) DO UPDATE SET title = excluded.title, org = excluded.org, location = excluded.location, category = excluded.category, tags = excluded.tags, deadline = excluded.deadline, source = excluded.source, summary = excluded.summary, updated_at = excluded.created_at WHERE jobs.manual = 0")
        .bind(v.url, v.title, v.org, v.location, v.category, v.tags, v.deadline, v.found, v.source, v.summary, now));
    }
    if (st.length) await env.DB.batch(st);
  }
  const out = { ok: true, added, updated, skipped, blocked };
  if (d.final) {
    out.removed = await pruneJobs(env);
    await setSetting(env, "jobs_updated", String(now));
    if (d.sources && typeof d.sources === "object") await setSetting(env, "jobs_sources", JSON.stringify(d.sources).slice(0, 2000));
    const r = await env.DB.prepare("SELECT category, COUNT(*) AS n FROM jobs WHERE hidden = 0 GROUP BY category").all();
    out.counts = {}; for (const x of r.results) out.counts[x.category] = x.n;
  }
  return J(out);
}
async function listJobs(env, exco) {
  await initJobs(env);
  if (Math.random() < 0.2) await pruneJobs(env);
  const { results } = await env.DB.prepare(`SELECT id, url, title, org, location, category, tags, deadline, found, source, summary, hidden, manual FROM jobs ${exco ? "" : "WHERE hidden = 0"} ORDER BY found DESC, id ASC LIMIT 200`).all();
  return J({ ok: true, rows: results, updated: +(await setting(env, "jobs_updated", "0")) || 0, today: lagosDate(Date.now()) });
}
async function jobsExco(env, op, body) {
  await initJobs(env);
  const id = parseInt(body.id, 10) || 0;
  if (op === "hide") { await env.DB.prepare("UPDATE jobs SET hidden = ?, updated_at = ? WHERE id = ?").bind(body.hidden ? 1 : 0, Date.now(), id).run(); return J({ ok: true }); }
  if (op === "delete") {
    const old = await env.DB.prepare("SELECT url, manual FROM jobs WHERE id = ?").bind(id).first();
    if (!old) return J({ ok: true, gone: true });
    const b = [env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id)];
    if (!old.manual) b.push(env.DB.prepare("INSERT INTO jobs_blocked (url, ts) VALUES (?, ?) ON CONFLICT(url) DO UPDATE SET ts = excluded.ts").bind(old.url, Date.now()));
    await env.DB.batch(b);
    return J({ ok: true });
  }
  if (op === "save") {
    const c = cleanJob(Object.assign({}, body, { found: "" }), true);
    if (c.err) return J({ ok: false, error: c.err }, 400);
    const v = c.val, now = Date.now();
    if (id) {
      const old = await env.DB.prepare("SELECT id FROM jobs WHERE id = ?").bind(id).first();
      if (!old) return J({ ok: false, error: "That listing no longer exists. Refresh the page." }, 404);
      const dupe = await env.DB.prepare("SELECT id FROM jobs WHERE url = ? AND id != ?").bind(v.url, id).first();
      if (dupe) return J({ ok: false, error: "Another listing already uses that link." }, 400);
      await env.DB.prepare("UPDATE jobs SET url = ?, title = ?, org = ?, location = ?, category = ?, deadline = ?, summary = ?, manual = 1, updated_at = ? WHERE id = ?").bind(v.url, v.title, v.org, v.location, v.category, v.deadline, v.summary, now, id).run();
      return J({ ok: true, id });
    }
    const dupe = await env.DB.prepare("SELECT id FROM jobs WHERE url = ?").bind(v.url).first();
    if (dupe) return J({ ok: false, error: "That link is already listed." }, 400);
    await env.DB.prepare("DELETE FROM jobs_blocked WHERE url = ?").bind(v.url).run();
    const r = await env.DB.prepare("INSERT INTO jobs (url, title, org, location, category, tags, deadline, found, source, summary, hidden, manual, created_at) VALUES (?,?,?,?,?,'',?,?,?,?,0,1,?)").bind(v.url, v.title, v.org, v.location, v.category, v.deadline, v.found, "Added by Exco", v.summary, now).run();
    return J({ ok: true, id: r.meta.last_row_id });
  }
  return J({ ok: false, error: "not found" }, 404);
}

// ---------- routes ----------
async function api(req, env, path, u) {
  if (path === "/api/login" && req.method === "POST") return login(req, env);
  if (path === "/api/jobs/import" && req.method === "POST") return importJobs(req, env);
  const ses = await session(req, env);
  if (!ses) return J({ ok: false, error: "Please sign in again.", auth: true }, 401);
  const exco = ses.role === "exco";
  let body = {};
  if (req.method === "POST" && path !== "/api/upload") { try { body = await req.json(); } catch (e) { body = {}; } }
  const money = await moneyMode(env);
  const canMoney = exco || money === "all";

  if (path === "/api/me") return J({ ok: true, role: ses.role, money, base: pubBase(req), today: lagosDate(Date.now()) });
  if (path === "/api/logout" && req.method === "POST") { await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(ses.th).run(); return J({ ok: true }); }

  if (path === "/api/all" && req.method === "GET") {
    const out = { ok: true, role: ses.role, money, today: lagosDate(Date.now()), base: pubBase(req) };
    for (const n of ["events", "announcements", "minutes", "actions", "roster", "exco"]) out[n] = await listSection(env, n);
    if (canMoney) out.offerings = await listSection(env, "offerings");
    if (exco) { const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'new'").first(); out.new_suggestions = r ? r.n : 0; }
    return J(out);
  }
  const lm = path.match(/^\/api\/list\/([a-z]+)$/);
  if (lm && req.method === "GET") {
    const n = lm[1];
    if (n === "suggestions") { if (!exco) return J({ ok: false, error: "Only Exco can read suggestions." }, 403); const { results } = await env.DB.prepare("SELECT id, body, status, created_at FROM suggestions ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END, created_at DESC").all(); return J({ ok: true, rows: results }); }
    if (!SECTIONS[n]) return J({ ok: false, error: "not found" }, 404);
    if (SECTIONS[n].money && !canMoney) return J({ ok: false, error: "Only Exco can see this page." }, 403);
    return J({ ok: true, rows: await listSection(env, n) });
  }
  if (path === "/api/contrib" && req.method === "GET") {
    if (!canMoney) return J({ ok: false, error: "Only Exco can see this page." }, 403);
    const y = parseInt(u.searchParams.get("year"), 10) || +lagosDate(Date.now()).slice(0, 4);
    return J({ ok: true, ...(await contribYear(env, y)) });
  }
  if (path === "/api/contrib.csv" && req.method === "GET") {
    if (!canMoney) return J({ ok: false, error: "Only Exco can see this page." }, 403);
    const y = parseInt(u.searchParams.get("year"), 10) || +lagosDate(Date.now()).slice(0, 4);
    return contribCsv(env, y);
  }
  if (path === "/api/expenses" && req.method === "GET") {
    if (!canMoney) return J({ ok: false, error: "Only Exco can see this page." }, 403);
    let ym = u.searchParams.get("month"); if (!isMonth(ym)) ym = lagosDate(Date.now()).slice(0, 7);
    return J({ ok: true, ...(await expensesMonth(env, ym)) });
  }
  if (path === "/api/expenses.csv" && req.method === "GET") {
    if (!canMoney) return J({ ok: false, error: "Only Exco can see this page." }, 403);
    return expensesCsv(env, u);
  }
  const fm = path.match(/^\/api\/file\/(up\/[a-z0-9.]+)$/);
  if (fm && req.method === "GET") return serveFile(env, ses, fm[1]);
  if (path === "/api/suggest" && req.method === "POST") {
    const text = clipN(body.body, 3000);
    if (text.length < 3) return J({ ok: false, error: "Please write your suggestion first." }, 400);
    const k = (await sha(SALT + "sug:" + ses.th)).slice(0, 32), now = Date.now();
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM ratelimit WHERE k = ? AND ts > ?").bind(k, now - 3600000).first();
    if ((n && n.n) >= 6) return J({ ok: false, error: "You have sent a lot of suggestions in the last hour. Please try again later." }, 429);
    await env.DB.prepare("INSERT INTO ratelimit (k, ts) VALUES (?, ?)").bind(k, now).run();
    // anonymous: no name, no IP, no session link is stored with the suggestion
    await env.DB.prepare("INSERT INTO suggestions (body, status, created_at) VALUES (?, 'new', ?)").bind(text, Math.floor(now / 3600000) * 3600000).run();
    return J({ ok: true });
  }

  if (path === "/api/jobs" && req.method === "GET") return listJobs(env, exco);
  // everything below is Exco only
  if (!exco) return J({ ok: false, error: "Only Exco can make changes." }, 403);
  const jm = path.match(/^\/api\/jobs\/(save|hide|delete)$/);
  if (jm && req.method === "POST") return jobsExco(env, jm[1], body);
  if (path === "/api/upload" && req.method === "POST") return upload(req, env);
  const sm = path.match(/^\/api\/(save|delete)\/([a-z]+)$/);
  if (sm && req.method === "POST") {
    const [, op, n] = sm;
    if (n === "suggestions") {
      const id = parseInt(body.id, 10) || 0;
      if (op === "delete") { await env.DB.prepare("DELETE FROM suggestions WHERE id = ?").bind(id).run(); return J({ ok: true }); }
      const st = ["new", "read", "archived"].includes(body.status) ? body.status : "read";
      await env.DB.prepare("UPDATE suggestions SET status = ? WHERE id = ?").bind(st, id).run();
      return J({ ok: true });
    }
    if (!SECTIONS[n]) return J({ ok: false, error: "not found" }, 404);
    return op === "save" ? saveRow(env, n, body) : deleteRow(env, n, body);
  }
  if (path === "/api/contrib/cell" && req.method === "POST") {
    const mid = parseInt(body.member_id, 10) || 0, y = parseInt(body.year, 10) || 0, m = parseInt(body.month, 10) || 0;
    if (!(y >= 2000 && y <= 2100) || !(m >= 1 && m <= 12)) return J({ ok: false, error: "Pick a month." }, 400);
    const mem = await env.DB.prepare("SELECT id FROM members WHERE id = ?").bind(mid).first();
    if (!mem) return J({ ok: false, error: "That member no longer exists." }, 400);
    const r = parseField("money", body.amount);
    if (r.err) return J({ ok: false, error: r.err }, 400);
    if (r.val == null) await env.DB.prepare("DELETE FROM contrib WHERE member_id = ? AND year = ? AND month = ?").bind(mid, y, m).run();
    else await env.DB.prepare("INSERT INTO contrib (member_id, year, month, amount) VALUES (?,?,?,?) ON CONFLICT(member_id, year, month) DO UPDATE SET amount = excluded.amount").bind(mid, y, m, r.val).run();
    return J({ ok: true, amount: r.val });
  }
  if (path === "/api/settings" && req.method === "GET") {
    const c = {};
    for (const t of [...Object.keys(SECTIONS), "contrib", "suggestions"]) { const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first(); c[t] = r ? r.n : 0; }
    let files = null;
    if (env.FILES) { files = 0; let cursor; do { const l = await env.FILES.list({ prefix: "up/", cursor }); files += l.objects.length; cursor = l.truncated ? l.cursor : null; } while (cursor); }
    return J({ ok: true, money, base: pubBase(req), counts: c, files });
  }
  if (path === "/api/settings" && req.method === "POST") {
    if (body.money !== "exco" && body.money !== "all") return J({ ok: false, error: "Pick who can see the money pages." }, 400);
    await setSetting(env, "money", body.money);
    return J({ ok: true, money: body.money });
  }
  if (path === "/api/password" && req.method === "POST") {
    const which = body.which === "exco" ? "exco" : body.which === "youth" ? "youth" : null;
    const pw = String(body.password || "").trim();
    if (!which) return J({ ok: false, error: "Pick which password to change." }, 400);
    if (pw.length < 8 || pw.length > 100) return J({ ok: false, error: "Use at least 8 characters." }, 400);
    const other = which === "exco" ? "youth" : "exco";
    if (await pwMatches(env, other, pw)) return J({ ok: false, error: "The Youth and Exco passwords must be different." }, 400);
    const s = randHex(16);
    await setSetting(env, "pw_" + which, s + ":" + await sha(s + pw));
    // everyone signed in with the old password signs in again (this Exco session stays)
    await env.DB.prepare("DELETE FROM sessions WHERE role = ? AND token_hash != ?").bind(which, ses.th).run();
    return J({ ok: true });
  }
  if (path === "/api/admin/cleanup" && req.method === "POST") {
    const age = Math.max(0, parseInt(body.min_age_ms, 10) || 0);
    return J({ ok: true, ...(await cleanup(env, age)) });
  }
  return J({ ok: false, error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path.startsWith("/api/")) { await init(env); return await api(req, env, path, u); }
      if (/^\/(_worker|tab-site|\.)/.test(path)) return new Response("Not found", { status: 404 });
      const res = await env.ASSETS.fetch(req);
      const out = new Response(res.body, res);
      if (path === "/" || path === "/index.html" || /\.(js|css)$/.test(path)) out.headers.set("cache-control", "no-cache");
      out.headers.set("x-robots-tag", "noindex, nofollow");
      out.headers.set("x-content-type-options", "nosniff");
      out.headers.set("referrer-policy", "same-origin");
      return out;
    } catch (e) {
      return J({ ok: false, error: "Something went wrong on our side. Please try again." }, 500);
    }
  }
};
