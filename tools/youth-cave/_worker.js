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
  announcements: { fields: { title: "text:140!", body: "long:4000", date: "date!", pinned: "bool", ev_date: "date", ev_time: "time", ev_end: "time", ev_loc: "text:300" }, order: "pinned DESC, date DESC, id DESC" },
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
  // safe migration: add any column a section gained after its table was first created (never drops or rewrites)
  for (const [name, s] of Object.entries(SECTIONS)) {
    const { results: cols } = await env.DB.prepare(`PRAGMA table_info(${name})`).all();
    const have = new Set((cols || []).map(c => c.name));
    for (const [k, t] of Object.entries(s.fields)) {
      if (have.has(k)) continue;
      try { await env.DB.prepare(`ALTER TABLE ${name} ADD COLUMN ${k} ${SQLT[t.split(":")[0].replace("!", "")]}`).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
  }
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
async function voiceOn(env) { return (await setting(env, "welcome_voice", "on")) !== "off"; }

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
  return J({ ok: true, token: tok, role, money: await moneyMode(env), voice: await voiceOn(env) });
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
  if (name === "announcements") {
    const m = { ...(old || {}), ...vals };
    if ((m.ev_time || m.ev_end || m.ev_loc) && !m.ev_date) return J({ ok: false, error: "Add the event date too, or clear the event time and location." }, 400);
    if (m.ev_date && !m.ev_time) return J({ ok: false, error: "Add the event start time too, so the Remind Me button knows when to alert." }, 400);
    if (m.ev_end && m.ev_time && m.ev_end <= m.ev_time) return J({ ok: false, error: "The end time must be after the start time." }, 400);
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

// ---------- polls (Exco asks, youth vote; one vote per device per poll) ----------
// Everyone shares the Youth password, so a device is identified by a random voter id the browser keeps in localStorage.
// The server stores only a hash of that id. Youth see counts and percentages; Exco also see the names.
let pollsReady = false;
async function initPolls(env) {
  if (pollsReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL, options TEXT NOT NULL, multi INTEGER NOT NULL DEFAULT 0, hide_results INTEGER NOT NULL DEFAULT 0, closes_at INTEGER, closed INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER NOT NULL, voter TEXT NOT NULL, name TEXT NOT NULL, choices TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER, PRIMARY KEY (poll_id, voter))`),
  ]);
  pollsReady = true;
}
const pollOpen = (p, now) => !p.closed && !(p.closes_at && p.closes_at <= now);
const isVoterId = s => /^[a-f0-9]{32}$/.test(s || "");
async function voterKey(id) { return (await sha(SALT + "voter:" + id)).slice(0, 40); }
function pollOpts(p) { try { const o = JSON.parse(p.options); return Array.isArray(o) ? o.map(String) : []; } catch (e) { return []; } }
function voteChoices(v) { try { const c = JSON.parse(v.choices); return Array.isArray(c) ? c.filter(n => Number.isInteger(n)) : []; } catch (e) { return []; } }
async function pollsData(env, exco, voterId) {
  await initPolls(env);
  const now = Date.now();
  const { results: polls } = await env.DB.prepare("SELECT * FROM polls ORDER BY pinned DESC, created_at DESC, id DESC LIMIT 200").all();
  const { results: votes } = polls.length ? await env.DB.prepare("SELECT poll_id, voter, name, choices, updated_at FROM poll_votes").all() : { results: [] };
  const me = isVoterId(voterId) ? await voterKey(voterId) : "";
  const by = {}; for (const v of votes) (by[v.poll_id] = by[v.poll_id] || []).push(v);
  return polls.map(p => {
    const opts = pollOpts(p), vs = by[p.id] || [], open = pollOpen(p, now);
    const counts = opts.map(() => 0), names = opts.map(() => []);
    let mine = null;
    for (const v of vs) {
      const ch = voteChoices(v);
      for (const i of ch) if (i >= 0 && i < opts.length) { counts[i]++; names[i].push(v.name); }
      if (me && v.voter === me) mine = ch;
    }
    const show = exco || !p.hide_results || !!mine || !open;
    const o = { id: p.id, question: p.question, options: opts, multi: p.multi ? 1 : 0, hide_results: p.hide_results ? 1 : 0, closes_at: p.closes_at || null, closed: p.closed ? 1 : 0, open, pinned: p.pinned ? 1 : 0, created_at: p.created_at, total: vs.length, mine, results: show };
    if (show) o.counts = counts;
    if (exco) o.voters = names.map(n => n.slice().sort((a, b) => a.localeCompare(b)));
    return o;
  });
}
async function listPolls(env, exco, u) {
  return J({ ok: true, now: Date.now(), polls: await pollsData(env, exco, u.searchParams.get("voter")) });
}
async function votePoll(env, ses, body) {
  await initPolls(env);
  const id = parseInt(body.poll_id, 10) || 0, now = Date.now();
  if (!isVoterId(body.voter)) return J({ ok: false, error: "Your phone could not be recognised. Please refresh the page and try again." }, 400);
  const name = clip1(body.name, 60);
  if (name.length < 2) return J({ ok: false, error: "Please type your name first." }, 400);
  const p = await env.DB.prepare("SELECT * FROM polls WHERE id = ?").bind(id).first();
  if (!p) return J({ ok: false, error: "This poll no longer exists. Refresh the page." }, 404);
  if (!pollOpen(p, now)) return J({ ok: false, error: "This poll is closed." }, 400);
  const n = pollOpts(p).length;
  let ch = Array.isArray(body.choices) ? body.choices.map(x => parseInt(x, 10)).filter(x => Number.isInteger(x) && x >= 0 && x < n) : [];
  ch = [...new Set(ch)].sort((a, b) => a - b);
  if (!ch.length) return J({ ok: false, error: "Pick an option first." }, 400);
  if (!p.multi && ch.length > 1) return J({ ok: false, error: "This poll takes one choice only." }, 400);
  const rk = (await sha(SALT + "vote:" + ses.th)).slice(0, 32);
  const rl = await env.DB.prepare("SELECT COUNT(*) AS n FROM ratelimit WHERE k = ? AND ts > ?").bind(rk, now - 3600000).first();
  if ((rl && rl.n) >= 60) return J({ ok: false, error: "Too many votes from this phone in the last hour. Please try again later." }, 429);
  await env.DB.prepare("INSERT INTO ratelimit (k, ts) VALUES (?, ?)").bind(rk, now).run();
  const vk = await voterKey(body.voter);
  await env.DB.prepare("INSERT INTO poll_votes (poll_id, voter, name, choices, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(poll_id, voter) DO UPDATE SET name = excluded.name, choices = excluded.choices, updated_at = excluded.updated_at")
    .bind(id, vk, name, JSON.stringify(ch), now, now).run();
  return J({ ok: true });
}
async function savePoll(env, body) {
  await initPolls(env);
  const id = parseInt(body.id, 10) || 0, now = Date.now();
  const question = clip1(body.question, 200);
  if (question.length < 3) return J({ ok: false, error: "Please type the question." }, 400);
  const opts = (Array.isArray(body.options) ? body.options : []).map(o => clip1(o, 120)).filter(Boolean);
  if (opts.length < 2) return J({ ok: false, error: "Add at least 2 options." }, 400);
  if (opts.length > 8) return J({ ok: false, error: "A poll can have up to 8 options." }, 400);
  if (new Set(opts.map(o => o.toLowerCase())).size !== opts.length) return J({ ok: false, error: "Two options are the same. Please make each option different." }, 400);
  const cd = String(body.closes_date || "").trim(); let ct = String(body.closes_time || "").trim();
  let closes = null;
  if (cd || ct) {
    if (!cd) return J({ ok: false, error: "Add the closing date too, or clear the closing time." }, 400);
    if (!isDate(cd)) return J({ ok: false, error: "Pick a valid closing date." }, 400);
    if (!ct) ct = "23:59";
    if (!isTime(ct)) return J({ ok: false, error: "Closing time must look like 20:00." }, 400);
    closes = lagosMs(cd, ct);
    if (closes <= now + 60000) return J({ ok: false, error: "The closing date and time must be in the future." }, 400);
  }
  const multi = body.multi ? 1 : 0, hide = body.hide_results ? 1 : 0;
  if (id) {
    const old = await env.DB.prepare("SELECT id FROM polls WHERE id = ?").bind(id).first();
    if (!old) return J({ ok: false, error: "This poll no longer exists. Refresh the page." }, 404);
    const v = await env.DB.prepare("SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id = ?").bind(id).first();
    if (v && v.n) return J({ ok: false, error: "This poll already has votes, so it can no longer be edited. You can close it and start a new one." }, 400);
    await env.DB.prepare("UPDATE polls SET question = ?, options = ?, multi = ?, hide_results = ?, closes_at = ?, updated_at = ? WHERE id = ?").bind(question, JSON.stringify(opts), multi, hide, closes, now, id).run();
    return J({ ok: true, id });
  }
  const r = await env.DB.prepare("INSERT INTO polls (question, options, multi, hide_results, closes_at, closed, pinned, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)").bind(question, JSON.stringify(opts), multi, hide, closes, now).run();
  const nid = r.meta.last_row_id;
  if (body.pinned) await env.DB.batch([env.DB.prepare("UPDATE polls SET pinned = 0 WHERE id != ?").bind(nid), env.DB.prepare("UPDATE polls SET pinned = 1 WHERE id = ?").bind(nid)]);
  return J({ ok: true, id: nid });
}
async function pollAction(env, body) {
  await initPolls(env);
  const id = parseInt(body.id, 10) || 0, op = String(body.op || ""), now = Date.now();
  const p = await env.DB.prepare("SELECT * FROM polls WHERE id = ?").bind(id).first();
  if (!p) return J({ ok: op === "delete", gone: true, error: "This poll no longer exists. Refresh the page." }, op === "delete" ? 200 : 404);
  if (op === "close") await env.DB.prepare("UPDATE polls SET closed = 1, updated_at = ? WHERE id = ?").bind(now, id).run();
  else if (op === "reopen") await env.DB.prepare("UPDATE polls SET closed = 0, closes_at = CASE WHEN closes_at IS NOT NULL AND closes_at <= ? THEN NULL ELSE closes_at END, updated_at = ? WHERE id = ?").bind(now, now, id).run();
  else if (op === "pin") await env.DB.batch([env.DB.prepare("UPDATE polls SET pinned = 0 WHERE id != ?").bind(id), env.DB.prepare("UPDATE polls SET pinned = 1, updated_at = ? WHERE id = ?").bind(now, id)]);
  else if (op === "unpin") await env.DB.prepare("UPDATE polls SET pinned = 0, updated_at = ? WHERE id = ?").bind(now, id).run();
  else if (op === "delete") await env.DB.batch([env.DB.prepare("DELETE FROM poll_votes WHERE poll_id = ?").bind(id), env.DB.prepare("DELETE FROM polls WHERE id = ?").bind(id)]);
  else return J({ ok: false, error: "Unknown action." }, 400);
  return J({ ok: true });
}
async function pollCsv(env, id) {
  await initPolls(env);
  const p = await env.DB.prepare("SELECT * FROM polls WHERE id = ?").bind(id).first();
  if (!p) return J({ ok: false, error: "This poll no longer exists." }, 404);
  const opts = pollOpts(p);
  const { results: vs } = await env.DB.prepare("SELECT name, choices FROM poll_votes WHERE poll_id = ? ORDER BY name COLLATE NOCASE").bind(id).all();
  const names = opts.map(() => []);
  for (const v of vs) for (const i of voteChoices(v)) if (i >= 0 && i < opts.length) names[i].push(v.name);
  const lines = [["Poll", p.question], ["Status", pollOpen(p, Date.now()) ? "Open" : "Closed"], ["Total voters", vs.length], [], ["Option", "Votes", "Voters"]];
  opts.forEach((o, i) => lines.push([o, names[i].length, names[i].join("; ")]));
  const slug = p.question.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase() || "poll";
  return csvResp(lines, `rlw-youth-poll-${id}-${slug}.csv`);
}

// ---------- plans (Youth department plans and programmes; Exco adds and edits, youth view) ----------
let plansReady = false;
const PLAN_STATUS = ["Not started", "In progress", "Done", "Paused"];
async function initPlans(env) {
  if (plansReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, responsible TEXT, steps TEXT NOT NULL DEFAULT '[]', start_date TEXT, target_date TEXT, status TEXT NOT NULL DEFAULT 'Not started', progress INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS plan_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL, date TEXT NOT NULL, body TEXT NOT NULL, reported_by TEXT, created_at INTEGER NOT NULL)`),
  ]);
  plansReady = true;
}
function planSteps(p) { try { const s = JSON.parse(p.steps || "[]"); return Array.isArray(s) ? s.map(x => ({ t: String((x && x.t) || ""), d: x && x.d ? 1 : 0 })).filter(x => x.t) : []; } catch (e) { return []; } }
async function plansData(env) {
  await initPlans(env);
  const { results: ps } = await env.DB.prepare("SELECT * FROM plans ORDER BY CASE status WHEN 'In progress' THEN 0 WHEN 'Not started' THEN 1 WHEN 'Paused' THEN 2 ELSE 3 END, COALESCE(target_date, '9999-12-31') ASC, id DESC LIMIT 300").all();
  const { results: rs } = ps.length ? await env.DB.prepare("SELECT id, plan_id, date, body, reported_by, created_at FROM plan_reports ORDER BY date DESC, id DESC").all() : { results: [] };
  const by = {}; for (const r of rs) (by[r.plan_id] = by[r.plan_id] || []).push(r);
  return ps.map(p => ({ id: p.id, title: p.title, responsible: p.responsible || "", steps: planSteps(p), start_date: p.start_date || "", target_date: p.target_date || "", status: p.status, progress: p.progress || 0, created_at: p.created_at, updated_at: p.updated_at || p.created_at, reports: by[p.id] || [] }));
}
async function savePlan(env, body) {
  await initPlans(env);
  const id = parseInt(body.id, 10) || 0, now = Date.now();
  const title = clip1(body.title, 140);
  if (title.length < 3) return J({ ok: false, error: "Please type the plan title." }, 400);
  const responsible = clip1(body.responsible, 120);
  const raw = Array.isArray(body.steps) ? body.steps : [];
  const steps = raw.map(s => (typeof s === "string" ? { t: s, d: 0 } : s || {})).map(s => ({ t: clip1(s.t, 200), d: s.d ? 1 : 0 })).filter(s => s.t);
  if (steps.length > 30) return J({ ok: false, error: "Use 30 steps or fewer." }, 400);
  const start = String(body.start_date || "").trim(), target = String(body.target_date || "").trim();
  if (start && !isDate(start)) return J({ ok: false, error: "The start date is not valid." }, 400);
  if (target && !isDate(target)) return J({ ok: false, error: "The target date is not valid." }, 400);
  if (start && target && target < start) return J({ ok: false, error: "The target date must be on or after the start date." }, 400);
  const status = PLAN_STATUS.includes(body.status) ? body.status : "Not started";
  let progress = parseInt(body.progress, 10); if (!Number.isFinite(progress)) progress = 0; progress = Math.max(0, Math.min(100, progress));
  if (id) {
    const ex = await env.DB.prepare("SELECT id FROM plans WHERE id = ?").bind(id).first();
    if (!ex) return J({ ok: false, error: "This plan no longer exists. Refresh the page." }, 404);
    await env.DB.prepare("UPDATE plans SET title = ?, responsible = ?, steps = ?, start_date = ?, target_date = ?, status = ?, progress = ?, updated_at = ? WHERE id = ?")
      .bind(title, responsible || null, JSON.stringify(steps), start || null, target || null, status, progress, now, id).run();
    return J({ ok: true, id });
  }
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM plans").first();
  if ((c && c.n) >= 300) return J({ ok: false, error: "There are already 300 plans. Delete some old ones first." }, 400);
  const r = await env.DB.prepare("INSERT INTO plans (title, responsible, steps, start_date, target_date, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(title, responsible || null, JSON.stringify(steps), start || null, target || null, status, progress, now, now).run();
  return J({ ok: true, id: r.meta && r.meta.last_row_id });
}
async function planAction(env, op, body) {
  await initPlans(env);
  const now = Date.now();
  if (op === "report-delete") { await env.DB.prepare("DELETE FROM plan_reports WHERE id = ?").bind(parseInt(body.id, 10) || 0).run(); return J({ ok: true }); }
  const id = parseInt(op === "report" ? body.plan_id : body.id, 10) || 0;
  const p = await env.DB.prepare("SELECT * FROM plans WHERE id = ?").bind(id).first();
  if (!p) return J({ ok: op === "delete", gone: true, error: "This plan no longer exists. Refresh the page." }, op === "delete" ? 200 : 404);
  if (op === "delete") {
    await env.DB.batch([env.DB.prepare("DELETE FROM plan_reports WHERE plan_id = ?").bind(id), env.DB.prepare("DELETE FROM plans WHERE id = ?").bind(id)]);
    return J({ ok: true });
  }
  if (op === "step") {
    const steps = planSteps(p), i = parseInt(body.i, 10);
    if (!(i >= 0 && i < steps.length)) return J({ ok: false, error: "That step no longer exists. Refresh the page." }, 400);
    steps[i].d = body.done ? 1 : 0;
    await env.DB.prepare("UPDATE plans SET steps = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(steps), now, id).run();
    return J({ ok: true });
  }
  if (op === "report") {
    const date = String(body.date || "").trim() || lagosDate(now);
    if (!isDate(date)) return J({ ok: false, error: "The report date is not valid." }, 400);
    const text = clipN(body.body, 2000);
    if (text.length < 2) return J({ ok: false, error: "Please write the report." }, 400);
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM plan_reports WHERE plan_id = ?").bind(id).first();
    if ((c && c.n) >= 300) return J({ ok: false, error: "This plan already has 300 reports." }, 400);
    const stmts = [env.DB.prepare("INSERT INTO plan_reports (plan_id, date, body, reported_by, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, date, text, clip1(body.reported_by, 100) || null, now)];
    let prog = p.progress, st = p.status;
    if (body.progress != null && body.progress !== "") { const v = parseInt(body.progress, 10); if (Number.isFinite(v)) prog = Math.max(0, Math.min(100, v)); }
    if (PLAN_STATUS.includes(body.status)) st = body.status;
    stmts.push(env.DB.prepare("UPDATE plans SET progress = ?, status = ?, updated_at = ? WHERE id = ?").bind(prog, st, now, id));
    await env.DB.batch(stmts);
    return J({ ok: true });
  }
  return J({ ok: false, error: "not found" }, 404);
}
async function plansCsv(env) {
  const ps = await plansData(env);
  const lines = [["Plan", "Person/unit responsible", "Start date", "Target date", "Status", "Progress %", "Steps done", "Steps total", "Last report date", "Last report"]];
  for (const p of ps) {
    const done = p.steps.filter(s => s.d).length, last = p.reports[0];
    lines.push([p.title, p.responsible, p.start_date, p.target_date, p.status, p.progress, done, p.steps.length, last ? last.date : "", last ? last.body : ""]);
  }
  return csvResp(lines, `rlw-youth-plans-${lagosDate(Date.now())}.csv`);
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
// ---------- calendar reminders (.ics) ----------
// The .ics is opened by the phone's calendar app, which has no session, so each link carries a short signed key
// (HMAC of kind + id). The file holds only the title, time, place, a short note and three alarms.
async function icsKey(kind, id) { return (await hmac("ics:" + kind + ":" + id)).slice(0, 32); }
function icsEsc(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function icsFold(line) {
  // RFC 5545: lines longer than 75 octets are folded with CRLF + one space, never splitting a UTF-8 character
  const out = []; let cur = "", n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const icsUtc = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function lagosMs(date, time) { const [y, m, d] = date.split("-").map(Number); const [h, mi] = time.split(":").map(Number); return Date.UTC(y, m - 1, d, h, mi) - LAGOS; }
function eventOf(kind, row) {
  if (kind === "announcement") {
    if (!row.ev_date || !row.ev_time) return null;
    const start = lagosMs(row.ev_date, row.ev_time);
    let end = row.ev_end && row.ev_end > row.ev_time ? lagosMs(row.ev_date, row.ev_end) : start + 3600000;
    return { title: row.title, start, end, loc: row.ev_loc || "", note: row.body || "" };
  }
  if (!row.date || !row.time) return null;
  const start = lagosMs(row.date, row.time);
  return { title: row.title, start, end: start + 3600000, loc: row.venue || "", note: row.description || "" };
}
async function serveIcs(req, env, kind, id, u) {
  const k = String(u.searchParams.get("k") || "");
  if (!eq(k, await icsKey(kind, id))) return new Response("This reminder link is not valid.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const row = await env.DB.prepare(`SELECT * FROM ${kind === "announcement" ? "announcements" : "events"} WHERE id = ?`).bind(id).first();
  const ev = row && eventOf(kind, row);
  if (!ev) return new Response("This event is no longer on the Youth Cave.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const base = pubBase(req);
  const link = base + "/#" + (kind === "announcement" ? "notices" : "events");
  let note = String(ev.note).replace(/\r\n?/g, "\n").trim();
  if (note.length > 600) note = note.slice(0, 597).trimEnd() + "...";
  const desc = (note ? note + "\n\n" : "") + "RLW Youth Cave: " + link;
  const isUrl = /^https?:\/\/\S+$/i.test(ev.loc.trim());
  const title = clip1(ev.title, 140) || "Youth Cave event";
  const L = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RCCG Rivers of Living Water Parish//Youth Cave//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + kind + "-" + id + "@rlw-youth.sites.tab.bot",
    "DTSTAMP:" + icsUtc(Date.now()),
    "DTSTART:" + icsUtc(ev.start),
    "DTEND:" + icsUtc(ev.end),
    "SUMMARY:" + icsEsc(title),
    "DESCRIPTION:" + icsEsc(desc),
  ];
  if (ev.loc) L.push("LOCATION:" + icsEsc(clip1(ev.loc, 300)));
  L.push("URL:" + (isUrl ? ev.loc.trim() : link));
  const alarms = [["-PT1H", "starts in 1 hour"], ["-PT30M", "starts in 30 minutes"], ["PT0M", "is starting now"]];
  for (const [t, w] of alarms) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(title + " " + w), "TRIGGER:" + t, "END:VALARM");
  L.push("END:VEVENT", "END:VCALENDAR");
  const body = L.map(icsFold).join("\r\n") + "\r\n";
  const fname = (title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "youth-cave-event") + ".ics";
  const disp = u.searchParams.get("dl") === "1" ? "attachment" : "inline";
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `${disp}; filename="${fname}"`, "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

async function api(req, env, path, u) {
  if (path === "/api/login" && req.method === "POST") return login(req, env);
  if (path === "/api/jobs/import" && req.method === "POST") return importJobs(req, env);
  const im = path.match(/^\/api\/ics\/(announcement|event)\/(\d+)\.ics$/);
  if (im && (req.method === "GET" || req.method === "HEAD")) return serveIcs(req, env, im[1], parseInt(im[2], 10), u);
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
    const out = { ok: true, role: ses.role, money, voice: await voiceOn(env), today: lagosDate(Date.now()), base: pubBase(req) };
    for (const n of ["events", "announcements", "minutes", "actions", "roster", "exco"]) out[n] = await listSection(env, n);
    for (const a of out.announcements) if (a.ev_date && a.ev_time) a.ics_k = await icsKey("announcement", a.id);
    for (const e of out.events) if (e.date && e.time) e.ics_k = await icsKey("event", e.id);
    if (canMoney) out.offerings = await listSection(env, "offerings");
    if (exco) { const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'new'").first(); out.new_suggestions = r ? r.n : 0; }
    try { await initPlans(env); const r = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'In progress' THEN 1 ELSE 0 END) AS ip FROM plans").first(); out.plans_sum = { total: (r && r.n) || 0, in_progress: (r && r.ip) || 0 }; } catch (e) { out.plans_sum = { total: 0, in_progress: 0 }; }
    try { out.polls_open = (await pollsData(env, false, u.searchParams.get("voter"))).filter(p => p.open).map(p => ({ id: p.id, question: p.question, pinned: p.pinned, closes_at: p.closes_at, voted: !!p.mine, total: p.total })); } catch (e) { out.polls_open = []; }
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
  if (path === "/api/polls" && req.method === "GET") return listPolls(env, exco, u);
  if (path === "/api/polls/vote" && req.method === "POST") return votePoll(env, ses, body);
  if (path === "/api/plans" && req.method === "GET") return J({ ok: true, today: lagosDate(Date.now()), plans: await plansData(env) });
  // everything below is Exco only
  if (!exco) return J({ ok: false, error: "Only Exco can make changes." }, 403);
  const jm = path.match(/^\/api\/jobs\/(save|hide|delete)$/);
  if (jm && req.method === "POST") return jobsExco(env, jm[1], body);
  if (path === "/api/polls/save" && req.method === "POST") return savePoll(env, body);
  if (path === "/api/polls/action" && req.method === "POST") return pollAction(env, body);
  if (path === "/api/polls.csv" && req.method === "GET") return pollCsv(env, parseInt(u.searchParams.get("id"), 10) || 0);
  if (path === "/api/plans/save" && req.method === "POST") return savePlan(env, body);
  const pm = path.match(/^\/api\/plans\/(delete|step|report|report-delete)$/);
  if (pm && req.method === "POST") return planAction(env, pm[1], body);
  if (path === "/api/plans.csv" && req.method === "GET") return plansCsv(env);
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
    return J({ ok: true, money, voice: await voiceOn(env), base: pubBase(req), counts: c, files });
  }
  if (path === "/api/settings" && req.method === "POST") {
    if (Object.prototype.hasOwnProperty.call(body, "voice") && body.money === undefined) {
      if (!exco) return J({ ok: false, error: "Only Exco can change this." }, 403);
      if (typeof body.voice !== "boolean") return J({ ok: false, error: "Pick on or off." }, 400);
      await setSetting(env, "welcome_voice", body.voice ? "on" : "off");
      return J({ ok: true, voice: body.voice });
    }
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
