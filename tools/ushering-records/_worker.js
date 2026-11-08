// RLW Ushering & Records - Worker (D1 for data, R2 for receipts and count sheets)
// Two roles: "member" (view only) and "admin" (Ushers/Admin: add, edit, delete, settings).
// Base-path aware: served at its own host and at /records/ on the parish site (rlw-church proxy).
const SALT = "REPLACE_WITH_SALT";
const MEMBER_HASH = "REPLACE_WITH_MEMBER_PASSWORD_HASH";
const ADMIN_HASH = "REPLACE_WITH_ADMIN_PASSWORD_HASH";
const SIGN_KEY = "REPLACE_WITH_SIGNING_KEY";
const PROXY_KEY = "REPLACE_WITH_YOUR_PROXY_KEY"; // shared with the parish site proxy so the visitor IP and base address it forwards are trusted
const PUBQ = "https://rlw-records.sites.tab.bot";
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
const isMonth = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || "");
const lagosDate = ts => new Date(ts + LAGOS).toISOString().slice(0, 10);
const r2 = x => Math.round((Number(x) || 0) * 100) / 100;

const viaProxy = req => req.headers.get("x-rlw-proxy") === PROXY_KEY;
function pubBase(req) { const b = req && viaProxy(req) ? (req.headers.get("x-rlw-base") || "") : ""; return /^https:\/\/[^\s"'<>]+$/.test(b) ? b.replace(/\/+$/, "") : PUBQ; }
function clientIp(req) {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (xff && viaProxy(req)) return xff;
  return req.headers.get("cf-connecting-ip") || "unknown";
}

// ---------- schema ----------
// field types: date, text:N (one line), long:N (multi-line), money, count (whole number >= 0), file
const SECTIONS = {
  attendance: { fields: { date: "date!", service: "text:80!", men: "count", women: "count", youth: "count", children: "count", first_timers: "count", vehicles: "count", ushers: "text:300", notes: "long:2000" }, order: "date DESC, id DESC" },
  income: { fields: { date: "date!", service: "text:80!", offering: "money", tithe: "money", thanksgiving: "money", building: "money", seed: "money", other: "money", counted_by: "text:200", verified_by: "text:200", notes: "long:2000", photo: "file" }, order: "date DESC, id DESC" },
  expenses: { fields: { date: "date!", item: "text:160!", category: "text:60!", amount: "money!", paid_to: "text:160", approved_by: "text:160", receipt: "file", notes: "long:2000" }, order: "date DESC, id DESC" },
};
const FILE_COLS = { income: "photo", expenses: "receipt" };
const SQLT = { date: "TEXT", text: "TEXT", long: "TEXT", money: "REAL", count: "INTEGER", file: "TEXT" };
const ATT_PARTS = ["men", "women", "youth", "children"];
const INC_PARTS = ["offering", "tithe", "thanksgiving", "building", "seed", "other"];
const INC_LABELS = { offering: "Offering", tithe: "Tithe", thanksgiving: "Thanksgiving", building: "Building fund", seed: "Special seed / Pledge", other: "Other" };
const LABELS = { date: "date", service: "service", item: "item", category: "category", amount: "amount" };
const MAX_COLS = 12;

let ready = false;
async function init(env) {
  if (ready) return;
  const stmts = [];
  for (const [name, s] of Object.entries(SECTIONS)) {
    const cols = Object.entries(s.fields).map(([k, t]) => k + " " + SQLT[t.split(":")[0].replace("!", "")]).join(", ");
    stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${name} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${cols}, created_at INTEGER NOT NULL, updated_at INTEGER)`));
    stmts.push(env.DB.prepare(`CREATE INDEX IF NOT EXISTS ${name}_d ON ${name}(date)`));
  }
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS registers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, columns TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER)`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS register_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, register_id INTEGER NOT NULL, cells TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER)`));
  stmts.push(env.DB.prepare(`CREATE INDEX IF NOT EXISTS register_rows_r ON register_rows(register_id)`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, created_at INTEGER, expires_at INTEGER)`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS ratelimit (k TEXT NOT NULL, ts INTEGER NOT NULL)`));
  stmts.push(env.DB.prepare(`CREATE INDEX IF NOT EXISTS ratelimit_k ON ratelimit(k, ts)`));
  stmts.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`));
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
  ready = true;
}
async function setting(env, k, dflt) { const r = await env.DB.prepare("SELECT v FROM settings WHERE k = ?").bind(k).first(); return r ? r.v : dflt; }
async function setSetting(env, k, v) { await env.DB.prepare("INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v).run(); }

// ---------- auth ----------
async function pwMatches(env, role, pw) {
  const over = await setting(env, "pw_" + role, "");
  if (over) { const [s, h] = over.split(":"); return eq(await sha(s + pw), h); }
  return eq(await sha(SALT + pw), role === "admin" ? ADMIN_HASH : MEMBER_HASH);
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
  if (pw && await pwMatches(env, "admin", pw)) role = "admin";
  else if (pw && await pwMatches(env, "member", pw)) role = "member";
  if (!role) {
    await env.DB.prepare("INSERT INTO ratelimit (k, ts) VALUES (?, ?)").bind(lk, now).run();
    return J({ ok: false, error: "That password is not right." }, 401);
  }
  const payload = b64u(JSON.stringify({ r: role, e: now + SESSION_MS, n: randHex(12) }));
  const tok = payload + "." + await hmac(payload);
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, role, created_at, expires_at) VALUES (?,?,?,?)").bind(await sha(tok), role, now, now + SESSION_MS).run();
  return J({ ok: true, token: tok, role });
}
async function session(req, env) {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const dot = tok.lastIndexOf(".");
  if (dot < 10) return null;
  const payload = tok.slice(0, dot), sig = tok.slice(dot + 1);
  if (!eq(await hmac(payload), sig)) return null;
  let p; try { p = JSON.parse(unb64u(payload)); } catch (e) { return null; }
  if (!p || (p.r !== "member" && p.r !== "admin") || !(p.e > Date.now())) return null;
  const th = await sha(tok);
  const row = await env.DB.prepare("SELECT role, expires_at FROM sessions WHERE token_hash = ?").bind(th).first();
  if (!row || row.expires_at < Date.now() || row.role !== p.r) return null;
  return { role: p.r, th };
}

// ---------- validation ----------
function parseField(type, v, label) {
  const req = type.endsWith("!"); const t = type.replace("!", ""); const [kind, nStr] = t.split(":"); const n = +nStr || 200;
  let out;
  if (kind === "date") { out = String(v || "").trim(); if (out && !isDate(out)) return { err: "Pick a valid date." }; }
  else if (kind === "text") out = clip1(v, n);
  else if (kind === "long") out = clipN(v, n);
  else if (kind === "money") {
    const s = String(v == null ? "" : v).replace(/[\u20A6,\s]/g, "").replace(/^N(?=\d)/i, "");
    if (s === "") out = null; else { const x = Number(s); if (!isFinite(x) || x < 0 || x > 1e11) return { err: "Enter the " + label + " in Naira, for example 25000." }; out = Math.round(x * 100) / 100; }
  }
  else if (kind === "count") {
    const s = String(v == null ? "" : v).replace(/[,\s]/g, "");
    if (s === "") out = null; else { if (!/^\d{1,6}$/.test(s)) return { err: "The " + label + " must be a whole number, for example 45." }; out = parseInt(s, 10); }
  }
  else if (kind === "file") { out = String(v || "").trim(); if (out && !/^up\/[a-f0-9]{24}\.(jpg|png|webp|pdf)$/.test(out)) return { err: "That upload was not recognised. Please upload it again." }; }
  if (req && (out === "" || out === null)) return { err: "missing" };
  return { val: out };
}
const FIELD_LABELS = { men: "number of men", women: "number of women", youth: "number of youth", children: "number of children", first_timers: "number of first-timers", vehicles: "number of vehicles", offering: "offering", tithe: "tithe", thanksgiving: "thanksgiving", building: "building fund", seed: "special seed / pledge", other: "other income", amount: "amount" };

function attTotal(r) { return ATT_PARTS.reduce((a, k) => a + (Number(r[k]) || 0), 0); }
function incTotal(r) { return r2(INC_PARTS.reduce((a, k) => a + (Number(r[k]) || 0), 0)); }
function decorate(name, r) {
  if (name === "attendance") r.total = attTotal(r);
  if (name === "income") r.total = incTotal(r);
  return r;
}
async function listSection(env, name) {
  const { results } = await env.DB.prepare(`SELECT * FROM ${name} ORDER BY ${SECTIONS[name].order}`).all();
  return results.map(r => decorate(name, r));
}
async function saveRow(env, name, body) {
  const s = SECTIONS[name];
  const id = parseInt(body.id, 10) || 0;
  let old = null;
  if (id) { old = await env.DB.prepare(`SELECT * FROM ${name} WHERE id = ?`).bind(id).first(); if (!old) return J({ ok: false, error: "That record no longer exists. Refresh the page." }, 404); }
  const vals = {};
  for (const [k, t] of Object.entries(s.fields)) {
    if (id && !(k in body)) continue; // partial update keeps the old value
    const r = parseField(t, body[k], FIELD_LABELS[k] || k);
    if (r.err) return J({ ok: false, error: r.err === "missing" ? "Please fill in the " + (LABELS[k] || k.replace("_", " ")) + "." : r.err }, 400);
    vals[k] = r.val;
  }
  const merged = { ...(old || {}), ...vals };
  if (name === "attendance" && attTotal(merged) <= 0 && !(Number(merged.first_timers) > 0)) return J({ ok: false, error: "Enter at least one count (men, women, youth or children)." }, 400);
  if (name === "attendance" && Number(merged.first_timers) > attTotal(merged) && attTotal(merged) > 0) return J({ ok: false, error: "First-timers cannot be more than the total attendance." }, 400);
  if (name === "income" && incTotal(merged) <= 0) return J({ ok: false, error: "Enter at least one amount (offering, tithe, thanksgiving, building fund, seed or other)." }, 400);
  if (name === "expenses" && !(Number(merged.amount) > 0)) return J({ ok: false, error: "The amount must be more than zero." }, 400);
  const now = Date.now();
  const keys = Object.keys(vals);
  if (id) {
    if (keys.length) await env.DB.prepare(`UPDATE ${name} SET ${keys.map(k => k + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...keys.map(k => vals[k]), now, id).run();
    const fc = FILE_COLS[name];
    if (old && fc && fc in vals && old[fc] && old[fc] !== vals[fc]) await dropFile(env, old[fc]);
    return J({ ok: true, id });
  }
  for (const [k, t] of Object.entries(s.fields)) if (!(k in vals)) vals[k] = /^(money|count)/.test(t) ? null : "";
  const ks = Object.keys(vals);
  const r = await env.DB.prepare(`INSERT INTO ${name} (${ks.join(", ")}, created_at) VALUES (${ks.map(() => "?").join(", ")}, ?)`).bind(...ks.map(k => vals[k]), now).run();
  return J({ ok: true, id: r.meta.last_row_id });
}
async function dropFile(env, key) { if (key && env.FILES) { try { await env.FILES.delete(key); } catch (e) {} } }
async function deleteRow(env, name, body) {
  const id = parseInt(body.id, 10) || 0;
  const old = await env.DB.prepare(`SELECT * FROM ${name} WHERE id = ?`).bind(id).first();
  if (!old) return J({ ok: true, gone: true });
  await env.DB.prepare(`DELETE FROM ${name} WHERE id = ?`).bind(id).run();
  const fc = FILE_COLS[name];
  if (fc && old[fc]) await dropFile(env, old[fc]);
  return J({ ok: true });
}

// ---------- other records (flexible registers) ----------
function parseCols(v) {
  const arr = (Array.isArray(v) ? v : String(v || "").split(/[\n,]/)).map(x => clip1(x, 60)).filter(Boolean);
  const seen = new Set(); const out = [];
  for (const c of arr) { const k = c.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(c); } }
  return out;
}
async function listRegisters(env) {
  const { results: regs } = await env.DB.prepare("SELECT * FROM registers ORDER BY name COLLATE NOCASE ASC, id ASC").all();
  const { results: rows } = await env.DB.prepare("SELECT * FROM register_rows ORDER BY id ASC").all();
  const by = {};
  for (const r of rows) { let c; try { c = JSON.parse(r.cells); } catch (e) { c = []; } (by[r.register_id] = by[r.register_id] || []).push({ id: r.id, cells: Array.isArray(c) ? c : [], created_at: r.created_at }); }
  return regs.map(g => { let cols; try { cols = JSON.parse(g.columns); } catch (e) { cols = []; } return { id: g.id, name: g.name, note: g.note || "", columns: cols, rows: by[g.id] || [] }; });
}
async function saveRegister(env, body) {
  const id = parseInt(body.id, 10) || 0;
  const name = clip1(body.name, 80);
  if (name.length < 2) return J({ ok: false, error: "Give the table a name." }, 400);
  const cols = parseCols(body.columns);
  if (!cols.length) return J({ ok: false, error: "Add at least one column name." }, 400);
  if (cols.length > MAX_COLS) return J({ ok: false, error: "A table can have up to " + MAX_COLS + " columns." }, 400);
  const note = clipN(body.note, 500), now = Date.now();
  if (id) {
    const old = await env.DB.prepare("SELECT id FROM registers WHERE id = ?").bind(id).first();
    if (!old) return J({ ok: false, error: "That table no longer exists. Refresh the page." }, 404);
    await env.DB.prepare("UPDATE registers SET name = ?, columns = ?, note = ?, updated_at = ? WHERE id = ?").bind(name, JSON.stringify(cols), note, now, id).run();
    return J({ ok: true, id });
  }
  const r = await env.DB.prepare("INSERT INTO registers (name, columns, note, created_at) VALUES (?,?,?,?)").bind(name, JSON.stringify(cols), note, now).run();
  return J({ ok: true, id: r.meta.last_row_id });
}
async function deleteRegister(env, body) {
  const id = parseInt(body.id, 10) || 0;
  await env.DB.batch([env.DB.prepare("DELETE FROM register_rows WHERE register_id = ?").bind(id), env.DB.prepare("DELETE FROM registers WHERE id = ?").bind(id)]);
  return J({ ok: true });
}
async function saveRegRow(env, body) {
  const id = parseInt(body.id, 10) || 0;
  let rid = parseInt(body.register_id, 10) || 0;
  if (id) { const o = await env.DB.prepare("SELECT register_id FROM register_rows WHERE id = ?").bind(id).first(); if (!o) return J({ ok: false, error: "That row no longer exists. Refresh the page." }, 404); rid = o.register_id; }
  const g = await env.DB.prepare("SELECT columns FROM registers WHERE id = ?").bind(rid).first();
  if (!g) return J({ ok: false, error: "That table no longer exists. Refresh the page." }, 404);
  let cols; try { cols = JSON.parse(g.columns); } catch (e) { cols = []; }
  const inCells = Array.isArray(body.cells) ? body.cells : [];
  const cells = cols.map((_, i) => clipN(inCells[i], 1000));
  if (!cells.some(c => c)) return J({ ok: false, error: "Fill in at least one column." }, 400);
  const now = Date.now();
  if (id) { await env.DB.prepare("UPDATE register_rows SET cells = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(cells), now, id).run(); return J({ ok: true, id }); }
  const r = await env.DB.prepare("INSERT INTO register_rows (register_id, cells, created_at) VALUES (?,?,?)").bind(rid, JSON.stringify(cells), now).run();
  return J({ ok: true, id: r.meta.last_row_id });
}

// ---------- summaries ----------
async function monthSummary(env, ym) {
  const { results: inc } = await env.DB.prepare("SELECT * FROM income WHERE substr(date, 1, 7) = ?").bind(ym).all();
  const { results: ex } = await env.DB.prepare("SELECT category, amount FROM expenses WHERE substr(date, 1, 7) = ?").bind(ym).all();
  const { results: att } = await env.DB.prepare("SELECT * FROM attendance WHERE substr(date, 1, 7) = ?").bind(ym).all();
  const byType = {}; for (const k of INC_PARTS) byType[k] = 0;
  for (const r of inc) for (const k of INC_PARTS) byType[k] += Number(r[k]) || 0;
  for (const k of INC_PARTS) byType[k] = r2(byType[k]);
  const income = r2(INC_PARTS.reduce((a, k) => a + byType[k], 0));
  const cat = {}; let expenses = 0;
  for (const r of ex) { const k = r.category || "Other"; cat[k] = (cat[k] || 0) + (Number(r.amount) || 0); expenses += Number(r.amount) || 0; }
  expenses = r2(expenses);
  const cats = Object.entries(cat).map(([category, t]) => ({ category, total: r2(t) })).sort((a, b) => b.total - a.total);
  const attTotals = att.map(attTotal);
  const attSum = attTotals.reduce((a, b) => a + b, 0);
  return { month: ym, income, income_by_type: byType, income_records: inc.length, expenses, expense_by_category: cats, expense_records: ex.length, balance: r2(income - expenses), services: att.length, attendance_total: attSum, attendance_avg: att.length ? Math.round(attSum / att.length) : 0, first_timers: att.reduce((a, r) => a + (Number(r.first_timers) || 0), 0) };
}
async function yearSummary(env, y) {
  const months = [];
  const T = { income: 0, expenses: 0, balance: 0 };
  const { results: inc } = await env.DB.prepare("SELECT * FROM income WHERE substr(date, 1, 4) = ?").bind(String(y)).all();
  const { results: ex } = await env.DB.prepare("SELECT date, amount FROM expenses WHERE substr(date, 1, 4) = ?").bind(String(y)).all();
  for (let m = 1; m <= 12; m++) {
    const ym = y + "-" + String(m).padStart(2, "0");
    const i = r2(inc.filter(r => r.date.slice(0, 7) === ym).reduce((a, r) => a + incTotal(r), 0));
    const e = r2(ex.filter(r => r.date.slice(0, 7) === ym).reduce((a, r) => a + (Number(r.amount) || 0), 0));
    months.push({ month: ym, income: i, expenses: e, balance: r2(i - e) });
    T.income += i; T.expenses += e;
  }
  T.income = r2(T.income); T.expenses = r2(T.expenses); T.balance = r2(T.income - T.expenses);
  const { results: ys } = await env.DB.prepare("SELECT DISTINCT substr(date, 1, 4) AS y FROM income UNION SELECT DISTINCT substr(date, 1, 4) AS y FROM expenses ORDER BY y").all();
  return { year: y, months, total: T, years: ys.map(r => +r.y).filter(Boolean) };
}

// ---------- CSV ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function csvCell(v) { let s = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function csvResp(lines, fname) {
  return new Response("\ufeff" + lines.map(l => l.map(csvCell).join(",")).join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${fname}"`, "cache-control": "no-store" } });
}
async function rowsFor(env, name, u) {
  const ym = u.searchParams.get("month"), yr = parseInt(u.searchParams.get("year"), 10);
  if (isMonth(ym)) { const { results } = await env.DB.prepare(`SELECT * FROM ${name} WHERE substr(date, 1, 7) = ? ORDER BY date ASC, id ASC`).bind(ym).all(); return { rows: results, tag: ym }; }
  if (yr >= 2000 && yr <= 2100) { const { results } = await env.DB.prepare(`SELECT * FROM ${name} WHERE substr(date, 1, 4) = ? ORDER BY date ASC, id ASC`).bind(String(yr)).all(); return { rows: results, tag: String(yr) }; }
  const { results } = await env.DB.prepare(`SELECT * FROM ${name} ORDER BY date ASC, id ASC`).all(); return { rows: results, tag: "all" };
}
async function csv(env, kind, u) {
  if (kind === "attendance") {
    const { rows, tag } = await rowsFor(env, "attendance", u);
    const L = [["Date", "Service", "Men", "Women", "Youth", "Children", "Total", "First-timers", "Vehicles", "Ushers on duty", "Notes"]];
    const T = [0, 0, 0, 0, 0, 0, 0];
    for (const r of rows) { const t = attTotal(r); L.push([r.date, r.service, r.men, r.women, r.youth, r.children, t, r.first_timers, r.vehicles, r.ushers, r.notes]); [r.men, r.women, r.youth, r.children, t, r.first_timers, r.vehicles].forEach((v, i) => T[i] += Number(v) || 0); }
    const n = rows.length || 1;
    L.push(["Total", "", ...T]);
    if (rows.length) L.push(["Average per service", "", ...T.map(v => Math.round(v / n))]);
    return csvResp(L, `rlw-attendance-${tag}.csv`);
  }
  if (kind === "income") {
    const { rows, tag } = await rowsFor(env, "income", u);
    const L = [["Date", "Service", ...INC_PARTS.map(k => INC_LABELS[k] + " (NGN)"), "Total (NGN)", "Counted by", "Verified by", "Notes", "Count sheet attached"]];
    const T = Array(INC_PARTS.length + 1).fill(0);
    for (const r of rows) { const t = incTotal(r); L.push([r.date, r.service, ...INC_PARTS.map(k => r[k]), t, r.counted_by, r.verified_by, r.notes, r.photo ? "Yes" : "No"]); [...INC_PARTS.map(k => r[k]), t].forEach((v, i) => T[i] += Number(v) || 0); }
    L.push(["Total", "", ...T.map(r2)]);
    return csvResp(L, `rlw-income-${tag}.csv`);
  }
  if (kind === "expenses") {
    const { rows, tag } = await rowsFor(env, "expenses", u);
    const L = [["Date", "Item", "Category", "Amount (NGN)", "Paid to", "Approved by", "Notes", "Receipt attached"]];
    let t = 0;
    for (const r of rows) { L.push([r.date, r.item, r.category, r.amount, r.paid_to, r.approved_by, r.notes, r.receipt ? "Yes" : "No"]); t += Number(r.amount) || 0; }
    L.push(["Total", "", "", r2(t)]);
    return csvResp(L, `rlw-expenses-${tag}.csv`);
  }
  if (kind === "summary") {
    const ym = u.searchParams.get("month"), yr = parseInt(u.searchParams.get("year"), 10);
    if (isMonth(ym)) {
      const d = await monthSummary(env, ym);
      const lab = MONTHS[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4);
      const L = [["Financial summary", lab], [], ["Income by type", "Amount (NGN)"], ...INC_PARTS.map(k => [INC_LABELS[k], d.income_by_type[k]]), ["Total income", d.income], [],
        ["Expenses by category", "Amount (NGN)"], ...d.expense_by_category.map(c => [c.category, c.total]), ["Total expenses", d.expenses], [], ["Balance (income - expenses)", d.balance]];
      return csvResp(L, `rlw-financial-summary-${ym}.csv`);
    }
    if (yr >= 2000 && yr <= 2100) {
      const d = await yearSummary(env, yr);
      const L = [["Month", "Income (NGN)", "Expenses (NGN)", "Balance (NGN)"], ...d.months.map((m, i) => [MONTHS[i] + " " + yr, m.income, m.expenses, m.balance]), ["Year total", d.total.income, d.total.expenses, d.total.balance]];
      return csvResp(L, `rlw-financial-summary-${yr}.csv`);
    }
    return J({ ok: false, error: "Pick a month or a year." }, 400);
  }
  const rm = kind.match(/^register-(\d+)$/);
  if (rm) {
    const regs = await listRegisters(env); const g = regs.find(x => x.id === +rm[1]);
    if (!g) return J({ ok: false, error: "That table no longer exists." }, 404);
    const L = [g.columns, ...g.rows.map(r => g.columns.map((_, i) => r.cells[i] || ""))];
    const slug = g.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "table";
    return csvResp(L, `rlw-${slug}.csv`);
  }
  return J({ ok: false, error: "not found" }, 404);
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
  const keys = new Set();
  for (const [t, c] of Object.entries(FILE_COLS)) {
    const { results } = await env.DB.prepare(`SELECT ${c} AS f FROM ${t} WHERE ${c} != ''`).all();
    for (const r of results) keys.add(r.f);
  }
  return keys;
}
async function serveFile(env, key) {
  if (!/^up\/[a-f0-9]{24}\.(jpg|png|webp|pdf)$/.test(key)) return new Response("Not found", { status: 404 });
  const o = env.FILES ? await env.FILES.get(key) : null;
  if (!o) return new Response("Not found", { status: 404 });
  return new Response(o.body, { headers: { "content-type": (o.httpMetadata && o.httpMetadata.contentType) || "application/octet-stream", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
}
async function countFiles(env) {
  if (!env.FILES) return null;
  let n = 0, cursor;
  do { const l = await env.FILES.list({ prefix: "up/", cursor }); n += l.objects.length; cursor = l.truncated ? l.cursor : null; } while (cursor);
  return n;
}
async function cleanup(env, minAgeMs) {
  if (!env.FILES) return { removed: 0 };
  const keys = await referenced(env);
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
async function counts(env) {
  const c = {};
  for (const t of ["attendance", "income", "expenses", "registers", "register_rows"]) { const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first(); c[t] = r ? r.n : 0; }
  return c;
}

// ---------- router ----------
async function api(req, env, path, u) {
  if (path === "/api/login" && req.method === "POST") return login(req, env);
  const ses = await session(req, env);
  if (!ses) return J({ ok: false, error: "Please sign in again.", auth: true }, 401);
  const admin = ses.role === "admin";
  let body = {};
  if (req.method === "POST" && path !== "/api/upload") { try { body = await req.json(); } catch (e) { body = {}; } }

  if (path === "/api/me") return J({ ok: true, role: ses.role, base: pubBase(req), today: lagosDate(Date.now()) });
  if (path === "/api/logout" && req.method === "POST") { await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(ses.th).run(); return J({ ok: true }); }
  if (path === "/api/all" && req.method === "GET") {
    const out = { ok: true, role: ses.role, today: lagosDate(Date.now()), base: pubBase(req) };
    for (const n of Object.keys(SECTIONS)) out[n] = await listSection(env, n);
    out.registers = await listRegisters(env);
    return J(out);
  }
  if (path === "/api/summary" && req.method === "GET") {
    let ym = u.searchParams.get("month"); if (!isMonth(ym)) ym = lagosDate(Date.now()).slice(0, 7);
    let y = parseInt(u.searchParams.get("year"), 10); if (!(y >= 2000 && y <= 2100)) y = +ym.slice(0, 4);
    return J({ ok: true, month: await monthSummary(env, ym), year: await yearSummary(env, y) });
  }
  const cm = path.match(/^\/api\/csv\/([a-z0-9-]+)\.csv$/);
  if (cm && req.method === "GET") return csv(env, cm[1], u);
  const fm = path.match(/^\/api\/file\/(up\/[a-z0-9.]+)$/);
  if (fm && req.method === "GET") return serveFile(env, fm[1]);

  // everything below is Ushers/Admin only
  if (!admin) return J({ ok: false, error: "Only Ushers/Admin can make changes." }, 403);
  if (path === "/api/upload" && req.method === "POST") return upload(req, env);
  const sm = path.match(/^\/api\/(save|delete)\/([a-z_]+)$/);
  if (sm && req.method === "POST") {
    const [, op, n] = sm;
    if (n === "registers") return op === "save" ? saveRegister(env, body) : deleteRegister(env, body);
    if (n === "register_rows") {
      if (op === "save") return saveRegRow(env, body);
      await env.DB.prepare("DELETE FROM register_rows WHERE id = ?").bind(parseInt(body.id, 10) || 0).run(); return J({ ok: true });
    }
    if (!SECTIONS[n]) return J({ ok: false, error: "not found" }, 404);
    return op === "save" ? saveRow(env, n, body) : deleteRow(env, n, body);
  }
  if (path === "/api/settings" && req.method === "GET") return J({ ok: true, base: pubBase(req), counts: await counts(env), files: await countFiles(env) });
  if (path === "/api/password" && req.method === "POST") {
    const which = body.which === "admin" ? "admin" : body.which === "member" ? "member" : null;
    const pw = String(body.password || "").trim();
    if (!which) return J({ ok: false, error: "Pick which password to change." }, 400);
    if (pw.length < 8 || pw.length > 100) return J({ ok: false, error: "Use at least 8 characters." }, 400);
    const other = which === "admin" ? "member" : "admin";
    if (await pwMatches(env, other, pw)) return J({ ok: false, error: "The Members and Ushers/Admin passwords must be different." }, 400);
    const s = randHex(16);
    await setSetting(env, "pw_" + which, s + ":" + await sha(s + pw));
    // everyone signed in with the old password signs in again (this admin session stays)
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
