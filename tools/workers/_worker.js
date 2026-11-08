// RLW Workers' Attendance — Worker (D1 storage)
const SALT = "REPLACE_WITH_SALT";
const PW_HASH = "REPLACE_WITH_PASSWORD_HASH";
const LAGOS = 3600 * 1000; // Africa/Lagos is UTC+1, no DST
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: HEADERS });
const DEFAULTS = { start: "08:00", open: "05:00", close: "14:00", grace: "0", extra_days: "[]" };

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function eq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, "0")).join(""); }
const clip = (v, n) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, n);

let ready = false;
async function init(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, unit TEXT, phone TEXT, active INTEGER NOT NULL DEFAULT 1, since TEXT NOT NULL, created_at INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS attendance (worker_id INTEGER NOT NULL, service_date TEXT NOT NULL, arrived_at INTEGER, excused INTEGER NOT NULL DEFAULT 0, note TEXT, device TEXT, edited_by_admin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY (worker_id, service_date))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS att_date ON attendance(service_date)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS att_dev ON attendance(device, service_date)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, created_at INTEGER, expires_at INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ratelimit (k TEXT NOT NULL, ts INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS ratelimit_k ON ratelimit(k, ts)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`),
  ]);
  ready = true;
}

function clientIp(req) {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (req.headers.get("x-vercel-id") && xff) return xff;
  if (xff && req.headers.get("x-rlw-proxy") === "REPLACE_WITH_YOUR_PROXY_KEY") return xff; // via the unified parish site (rlw-church) proxy: real visitor IP
  return req.headers.get("cf-connecting-ip") || xff || "unknown";
}
async function limited(env, key, max, windowMs) {
  const k = (await sha(SALT + key)).slice(0, 32);
  const now = Date.now();
  if (Math.random() < 0.1) await env.DB.prepare("DELETE FROM ratelimit WHERE ts < ?").bind(now - 86400000).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM ratelimit WHERE k = ? AND ts > ?").bind(k, now - windowMs).first();
  if ((row && row.n) >= max) return true;
  await env.DB.prepare("INSERT INTO ratelimit (k, ts) VALUES (?, ?)").bind(k, now).run();
  return false;
}

// ---- time helpers (all in Lagos time) ----
const lagosDate = ts => new Date(ts + LAGOS).toISOString().slice(0, 10);
const lagosMin = ts => { const d = new Date(ts + LAGOS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hm2min = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const tsOf = (date, hm) => Date.parse(date + "T" + hm + ":00Z") - LAGOS;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !isNaN(Date.parse(s + "T00:00:00Z"));
const dow = date => new Date(date + "T00:00:00Z").getUTCDay();
function fmt12(ts) { const d = new Date(ts + LAGOS); let h = d.getUTCHours(); const m = d.getUTCMinutes(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + " " + ap; }
function fmtHM(hm) { const v = hm2min(hm); let h = Math.floor(v / 60), m = v % 60; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + " " + ap; }

async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT k, v FROM settings").all();
  const s = { ...DEFAULTS };
  for (const r of results) if (r.k in DEFAULTS) s[r.k] = r.v;
  let extra = [];
  try { extra = JSON.parse(s.extra_days).filter(x => x && isDate(x.date)); } catch (e) { extra = []; }
  return { start: s.start, open: s.open, close: s.close, grace: Math.max(0, parseInt(s.grace, 10) || 0), extra };
}
function isServiceDay(date, st) { return dow(date) === 0 || st.extra.some(x => x.date === date); }
function dayLabel(date, st) { const x = st.extra.find(e => e.date === date); return x ? (x.label || "Special service") : (dow(date) === 0 ? "Sunday service" : ""); }
function windowState(date, st, now) {
  const today = lagosDate(now);
  if (date < today) return "closed";
  if (date > today) return "future";
  const m = lagosMin(now);
  if (m < hm2min(st.open)) return "before";
  if (m >= hm2min(st.close)) return "closed";
  return "open";
}
// minutes after start (negative = early); late if over grace
function evalArrival(ts, date, st) {
  const diff = Math.floor((ts - tsOf(date, st.start)) / 60000);
  const late = diff > st.grace;
  const score = late ? Math.max(0, 100 - 2 * diff) : 100;
  return { diff, late, score };
}
function statusOf(rec, date, st, now) {
  if (rec && rec.excused) return { status: "excused", label: "Excused", score: null };
  if (rec && rec.arrived_at != null) {
    const e = evalArrival(rec.arrived_at, date, st);
    return { status: e.late ? "late" : "ontime", label: e.late ? "Late (" + e.diff + " min)" : "On time", diff: e.diff, score: e.score, time: fmt12(rec.arrived_at) };
  }
  const w = windowState(date, st, now);
  if (w === "closed") return { status: "absent", label: "Absent", score: 0 };
  return { status: "notyet", label: "Not yet", score: null };
}

// ---- public: workers list, status, check-in ----
async function publicWorkers(env) {
  const { results } = await env.DB.prepare("SELECT id, name, unit FROM workers WHERE active = 1 ORDER BY name COLLATE NOCASE").all();
  return J({ ok: true, workers: results });
}
async function publicStatus(req, env, u) {
  const now = Date.now();
  const st = await getSettings(env);
  const today = lagosDate(now);
  const service = isServiceDay(today, st);
  const out = { ok: true, today, now: fmt12(now), service_day: service, label: dayLabel(today, st), window: service ? windowState(today, st, now) : "none", opens: fmtHM(st.open), closes: fmtHM(st.close), start: fmtHM(st.start) };
  const wid = Number(u.searchParams.get("w"));
  if (Number.isInteger(wid) && wid > 0) {
    const w = await env.DB.prepare("SELECT id, name, active FROM workers WHERE id = ?").bind(wid).first();
    out.worker = w && w.active ? { id: w.id, name: w.name } : null;
    if (w && w.active) {
      const rec = await env.DB.prepare("SELECT arrived_at, excused FROM attendance WHERE worker_id = ? AND service_date = ?").bind(wid, today).first();
      if (rec && rec.arrived_at != null) { const s = statusOf(rec, today, st, now); out.checked = { time: s.time, label: s.label, status: s.status }; }
    }
  }
  return J(out);
}
async function checkin(req, env) {
  let d; try { d = await req.json(); } catch (e) { return J({ ok: false, error: "Could not read the request." }, 400); }
  const ip = clientIp(req);
  if (await limited(env, "ci-ip:" + ip, 300, 10 * 60 * 1000)) return J({ ok: false, error: "Too many check-ins from this network. Please wait a few minutes and try again." }, 429);
  const dev = String(d.device || "");
  if (!/^[0-9a-f]{32}$/.test(dev)) return J({ ok: false, error: "Please reload the page and try again." }, 400);
  const devh = (await sha(SALT + "dev:" + dev)).slice(0, 40);
  if (await limited(env, "ci-dev:" + devh, 12, 10 * 60 * 1000)) return J({ ok: false, error: "Too many tries from this phone. Please wait a few minutes." }, 429);
  const wid = Number(d.worker_id);
  if (!Number.isInteger(wid) || wid < 1) return J({ ok: false, error: "Please pick your name." }, 400);
  const w = await env.DB.prepare("SELECT id, name, active FROM workers WHERE id = ?").bind(wid).first();
  if (!w || !w.active) return J({ ok: false, code: "no_worker", error: "That name is not on the workers list. Please pick your name again or see the admin." }, 404);
  const now = Date.now();
  const st = await getSettings(env);
  const today = lagosDate(now);
  if (!isServiceDay(today, st)) return J({ ok: false, code: "closed", error: "Check-in is only open on service days." }, 403);
  const ws = windowState(today, st, now);
  if (ws === "before") return J({ ok: false, code: "closed", error: "Check-in opens at " + fmtHM(st.open) + " today." }, 403);
  if (ws !== "open") return J({ ok: false, code: "closed", error: "Check-in for today closed at " + fmtHM(st.close) + "." }, 403);
  const existing = await env.DB.prepare("SELECT arrived_at, excused FROM attendance WHERE worker_id = ? AND service_date = ?").bind(wid, today).first();
  if (existing && existing.arrived_at != null) {
    const s = statusOf(existing, today, st, now);
    return J({ ok: true, already: true, name: w.name, time: s.time, label: s.label, status: s.status });
  }
  const other = await env.DB.prepare("SELECT w.name FROM attendance a JOIN workers w ON w.id = a.worker_id WHERE a.device = ? AND a.service_date = ? AND a.worker_id != ? LIMIT 1").bind(devh, today, wid).first();
  if (other) return J({ ok: false, code: "device_used", error: "This phone already checked in " + other.name + " today. Each worker checks in on their own phone." }, 409);
  if (existing) await env.DB.prepare("UPDATE attendance SET arrived_at = ?, device = ?, excused = 0 WHERE worker_id = ? AND service_date = ? AND arrived_at IS NULL").bind(now, devh, wid, today).run();
  else await env.DB.prepare("INSERT OR IGNORE INTO attendance (worker_id, service_date, arrived_at, excused, device, created_at) VALUES (?,?,?,0,?,?)").bind(wid, today, now, devh, now).run();
  const rec = await env.DB.prepare("SELECT arrived_at, excused FROM attendance WHERE worker_id = ? AND service_date = ?").bind(wid, today).first();
  const s = statusOf({ arrived_at: rec.arrived_at, excused: 0 }, today, st, now);
  return J({ ok: true, already: rec.arrived_at !== now, name: w.name, time: s.time, label: s.label, status: s.status });
}

// ---- admin ----
async function authed(req, env) {
  const h = req.headers.get("authorization") || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!/^[0-9a-f]{64}$/.test(tok)) return false;
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").bind(await sha(tok)).first();
  return !!(row && row.expires_at > Date.now());
}
async function login(req, env) {
  let d; try { d = await req.json(); } catch (e) { d = {}; }
  const lk = (await sha(SALT + "login:" + clientIp(req))).slice(0, 32);
  const fails = await env.DB.prepare("SELECT COUNT(*) AS n FROM ratelimit WHERE k = ? AND ts > ?").bind(lk, Date.now() - 15 * 60 * 1000).first();
  if ((fails && fails.n) >= 10) return J({ ok: false, error: "Too many wrong attempts. Wait 15 minutes and try again." }, 429);
  const pw = String(d.password || "").trim();
  if (!eq(await sha(SALT + pw), PW_HASH)) {
    await env.DB.prepare("INSERT INTO ratelimit (k, ts) VALUES (?, ?)").bind(lk, Date.now()).run();
    return J({ ok: false, error: "That password is not right." }, 401);
  }
  const tok = randHex(32), now = Date.now();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?,?,?)").bind(await sha(tok), now, now + 30 * 86400000).run();
  return J({ ok: true, token: tok });
}

function serviceDaysInMonth(month, st) {
  const [y, m] = month.split("-").map(Number);
  const days = [];
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let i = 1; i <= n; i++) {
    const date = month + "-" + String(i).padStart(2, "0");
    if (isServiceDay(date, st)) days.push(date);
  }
  return days;
}

async function dayTable(env, date, st, now) {
  const { results: ws } = await env.DB.prepare("SELECT id, name, unit, since FROM workers WHERE active = 1 ORDER BY name COLLATE NOCASE").all();
  const { results: recs } = await env.DB.prepare("SELECT * FROM attendance WHERE service_date = ?").bind(date).all();
  const byW = {}; for (const r of recs) byW[r.worker_id] = r;
  const rows = [];
  const counts = { ontime: 0, late: 0, absent: 0, excused: 0, notyet: 0 };
  
  const service = isServiceDay(date, st);
  for (const w of ws) {
    const rec = byW[w.id];
    if (w.since > date && !rec) continue; // not a worker yet on this date
    if (!service && !rec) { rows.push({ id: w.id, name: w.name, unit: w.unit || "", time: "", status: "notyet", label: "No service", diff: null, note: "", edited: false, arrived_at: null }); continue; }
    const s = statusOf(rec, date, st, now);
    counts[s.status]++;
    rows.push({ id: w.id, name: w.name, unit: w.unit || "", time: s.time || "", status: s.status, label: s.label, diff: s.diff == null ? null : s.diff, note: rec ? rec.note || "" : "", edited: rec ? !!rec.edited_by_admin : false, arrived_at: rec ? rec.arrived_at : null });
  }
  const order = { ontime: 0, late: 1, notyet: 2, excused: 3, absent: 4 };
  rows.sort((a, b) => (a.arrived_at != null && b.arrived_at != null) ? a.arrived_at - b.arrived_at : (order[a.status] - order[b.status]) || a.name.localeCompare(b.name));
  return { rows, counts };
}

async function monthReport(env, month, st, now) {
  const days = serviceDaysInMonth(month, st);
  const counted = days.filter(d => { const w = windowState(d, st, now); return w === "closed"; });
  const openDay = days.find(d => windowState(d, st, now) === "open");
  const { results: ws } = await env.DB.prepare("SELECT id, name, unit, since FROM workers WHERE active = 1").all();
  const { results: recs } = days.length ? await env.DB.prepare("SELECT * FROM attendance WHERE service_date >= ? AND service_date <= ?").bind(days[0], days[days.length - 1]).all() : { results: [] };
  const map = {}; for (const r of recs) map[r.worker_id + "|" + r.service_date] = r;
  const rows = [];
  for (const w of ws) {
    const o = { id: w.id, name: w.name, unit: w.unit || "", services: 0, ontime: 0, late: 0, absent: 0, excused: 0, scoreSum: 0, diffSum: 0, diffN: 0 };
    const useDays = counted.slice(); if (openDay) useDays.push(openDay);
    for (const d of useDays) {
      const rec = map[w.id + "|" + d];
      if (w.since > d && !rec) continue;
      const s = statusOf(rec, d, st, now);
      if (s.status === "notyet") continue; // today, still open, not checked in yet
      if (s.status === "excused") { o.excused++; continue; }
      o.services++;
      if (s.status === "ontime") o.ontime++;
      else if (s.status === "late") o.late++;
      else o.absent++;
      o.scoreSum += s.score;
      if (s.diff != null) { o.diffSum += s.diff; o.diffN++; }
    }
    o.score = o.services ? Math.round(o.scoreSum / o.services * 10) / 10 : null;
    o.avgDiff = o.diffN ? Math.round(o.diffSum / o.diffN * 10) / 10 : null;
    delete o.scoreSum; delete o.diffSum; delete o.diffN;
    rows.push(o);
  }
  rows.sort((a, b) => {
    if (a.score == null || b.score == null) return (a.score == null) - (b.score == null) || a.name.localeCompare(b.name);
    if (b.score !== a.score) return b.score - a.score;
    const ad = a.avgDiff == null ? 1e9 : a.avgDiff, bd = b.avgDiff == null ? 1e9 : b.avgDiff;
    return ad - bd || a.name.localeCompare(b.name);
  });
  let rank = 0;
  for (const r of rows) r.rank = r.score == null ? null : ++rank;
  const ranked = rows.filter(r => r.score != null);
  const top = ranked.slice(0, 3);
  const topIds = new Set(top.map(r => r.id));
  const bottom = ranked.filter(r => !topIds.has(r.id) && r.score < 100).slice(-3).reverse();
  return { month, service_days: days, counted_days: counted.concat(openDay ? [openDay] : []), open_day: openDay || null, rows, top: top.map(r => r.id), bottom: bottom.map(r => r.id) };
}

const lagosStr = ts => ts ? new Date(ts + LAGOS).toISOString().slice(0, 16).replace("T", " ") : "";
function csvCell(v) { let s = String(v == null ? "" : v); if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
const csvResp = (lines, name) => new Response("\ufeff" + lines.map(l => l.map(csvCell).join(",")).join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="${name}"` } });

async function admin(req, env, path, u) {
  if (!(await authed(req, env))) return J({ ok: false, error: "Please sign in." }, 401);
  const now = Date.now();
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const st = await getSettings(env);

  if (path === "/api/admin/overview") {
    const today = lagosDate(now);
    // most recent service day on or before today
    let d = today; for (let i = 0; i < 60 && !isServiceDay(d, st); i++) d = lagosDate(Date.parse(d + "T12:00:00Z") - 86400000 - LAGOS + LAGOS);
    return J({ ok: true, today, last_service: d, settings: { start: st.start, open: st.open, close: st.close, grace: st.grace, extra: st.extra } });
  }
  if (path === "/api/admin/workers" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT w.*, (SELECT COUNT(*) FROM attendance a WHERE a.worker_id = w.id AND a.arrived_at IS NOT NULL) AS checkins FROM workers w ORDER BY w.active DESC, w.name COLLATE NOCASE").all();
    return J({ ok: true, workers: results, today: lagosDate(now) });
  }
  if (path === "/api/admin/workers/add" && req.method === "POST") {
    const since = isDate(body.since) ? body.since : lagosDate(now);
    const unit = clip(body.unit, 60);
    const names = (Array.isArray(body.names) ? body.names : [body.name]).map(n => clip(n, 80)).filter(n => n.length >= 2).slice(0, 300);
    if (!names.length) return J({ ok: false, error: "Please enter at least one name (2 letters or more)." }, 400);
    const { results: ex } = await env.DB.prepare("SELECT name FROM workers").all();
    const have = new Set(ex.map(r => r.name.toLowerCase()));
    const added = [], skipped = [];
    const stmts = [];
    for (const n of names) {
      if (have.has(n.toLowerCase())) { skipped.push(n); continue; }
      have.add(n.toLowerCase()); added.push(n);
      stmts.push(env.DB.prepare("INSERT INTO workers (name, unit, phone, active, since, created_at) VALUES (?,?,?,1,?,?)").bind(n, unit, names.length === 1 ? clip(body.phone, 20) : "", since, now));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return J({ ok: true, added, skipped });
  }
  if (path === "/api/admin/workers/update" && req.method === "POST") {
    const id = Number(body.id); if (!Number.isInteger(id)) return J({ ok: false, error: "bad id" }, 400);
    const w = await env.DB.prepare("SELECT * FROM workers WHERE id = ?").bind(id).first();
    if (!w) return J({ ok: false, error: "Worker not found." }, 404);
    const name = body.name !== undefined ? clip(body.name, 80) : w.name;
    if (name.length < 2) return J({ ok: false, error: "Name is too short." }, 400);
    const dup = await env.DB.prepare("SELECT id FROM workers WHERE lower(name) = lower(?) AND id != ?").bind(name, id).first();
    if (dup) return J({ ok: false, error: "Another worker already has that name." }, 400);
    const unit = body.unit !== undefined ? clip(body.unit, 60) : w.unit;
    const phone = body.phone !== undefined ? clip(body.phone, 20) : w.phone;
    const active = body.active !== undefined ? (body.active ? 1 : 0) : w.active;
    const since = body.since !== undefined && isDate(body.since) ? body.since : w.since;
    await env.DB.prepare("UPDATE workers SET name = ?, unit = ?, phone = ?, active = ?, since = ? WHERE id = ?").bind(name, unit, phone, active, since, id).run();
    return J({ ok: true });
  }
  if (path === "/api/admin/workers/delete" && req.method === "POST") {
    const id = Number(body.id); if (!Number.isInteger(id)) return J({ ok: false, error: "bad id" }, 400);
    await env.DB.batch([env.DB.prepare("DELETE FROM attendance WHERE worker_id = ?").bind(id), env.DB.prepare("DELETE FROM workers WHERE id = ?").bind(id)]);
    return J({ ok: true });
  }
  if (path === "/api/admin/day" && req.method === "GET") {
    const date = u.searchParams.get("d");
    if (!isDate(date)) return J({ ok: false, error: "Pick a date." }, 400);
    const t = await dayTable(env, date, st, now);
    return J({ ok: true, date, service_day: isServiceDay(date, st), label: dayLabel(date, st), window: windowState(date, st, now), start: fmtHM(st.start), grace: st.grace, closes: fmtHM(st.close), ...t });
  }
  if (path === "/api/admin/day.csv" && req.method === "GET") {
    const date = u.searchParams.get("d");
    if (!isDate(date)) return J({ ok: false, error: "Pick a date." }, 400);
    const t = await dayTable(env, date, st, now);
    const lines = [["Date", "Name", "Unit", "Arrival", "Status", "Minutes after start", "Note"]];
    for (const r of t.rows) lines.push([date, r.name, r.unit, r.time, r.label, r.diff == null ? "" : r.diff, r.note]);
    return csvResp(lines, `rlw-workers-${date}.csv`);
  }
  if (path === "/api/admin/mark" && req.method === "POST") {
    const id = Number(body.worker_id), date = body.date;
    if (!Number.isInteger(id) || !isDate(date)) return J({ ok: false, error: "bad request" }, 400);
    const w = await env.DB.prepare("SELECT id FROM workers WHERE id = ?").bind(id).first();
    if (!w) return J({ ok: false, error: "Worker not found." }, 404);
    const note = clip(body.note, 300);
    const rec = await env.DB.prepare("SELECT * FROM attendance WHERE worker_id = ? AND service_date = ?").bind(id, date).first();
    if (body.action === "clear") {
      await env.DB.prepare("DELETE FROM attendance WHERE worker_id = ? AND service_date = ?").bind(id, date).run();
      return J({ ok: true });
    }
    let arrived = rec ? rec.arrived_at : null, excused = 0;
    if (body.action === "excuse") { excused = 1; arrived = null; }
    else if (body.action === "time") {
      const m = hm2min(body.time);
      if (m == null || m >= 1440) return J({ ok: false, error: "Enter a time like 07:45." }, 400);
      arrived = tsOf(date, String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
    } else if (body.action === "unexcuse") { excused = 0; }
    else return J({ ok: false, error: "bad action" }, 400);
    if (rec) await env.DB.prepare("UPDATE attendance SET arrived_at = ?, excused = ?, note = ?, edited_by_admin = 1 WHERE worker_id = ? AND service_date = ?").bind(arrived, excused, note, id, date).run();
    else await env.DB.prepare("INSERT INTO attendance (worker_id, service_date, arrived_at, excused, note, device, edited_by_admin, created_at) VALUES (?,?,?,?,?,NULL,1,?)").bind(id, date, arrived, excused, note, now).run();
    return J({ ok: true });
  }
  if (path === "/api/admin/month" && req.method === "GET") {
    const month = u.searchParams.get("m");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) return J({ ok: false, error: "Pick a month." }, 400);
    return J({ ok: true, ...(await monthReport(env, month, st, now)) });
  }
  if (path === "/api/admin/month.csv" && req.method === "GET") {
    const month = u.searchParams.get("m");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) return J({ ok: false, error: "Pick a month." }, 400);
    const r = await monthReport(env, month, st, now);
    const lines = [["Month", "Rank", "Name", "Unit", "Services", "On time", "Late", "Absent", "Excused", "Average arrival (min after start; negative = early)", "Punctuality score"]];
    for (const x of r.rows) lines.push([month, x.rank == null ? "" : x.rank, x.name, x.unit, x.services, x.ontime, x.late, x.absent, x.excused, x.avgDiff == null ? "" : x.avgDiff, x.score == null ? "" : x.score]);
    return csvResp(lines, `rlw-workers-${month}.csv`);
  }
  if (path === "/api/admin/settings" && req.method === "POST") {
    const start = body.start, open = body.open, close = body.close;
    for (const v of [start, open, close]) if (hm2min(v) == null || hm2min(v) >= 1440) return J({ ok: false, error: "Times must look like 08:00." }, 400);
    if (hm2min(open) >= hm2min(close)) return J({ ok: false, error: "The check-in window must open before it closes." }, 400);
    const grace = Math.min(60, Math.max(0, parseInt(body.grace, 10) || 0));
    const pad = v => { const m = hm2min(v); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
    const stmt = (k, v) => env.DB.prepare("INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, v);
    await env.DB.batch([stmt("start", pad(start)), stmt("open", pad(open)), stmt("close", pad(close)), stmt("grace", String(grace))]);
    return J({ ok: true });
  }
  if (path === "/api/admin/extra" && req.method === "POST") {
    let extra = st.extra.slice();
    if (!isDate(body.date)) return J({ ok: false, error: "Pick a date." }, 400);
    if (body.remove) extra = extra.filter(x => x.date !== body.date);
    else {
      if (dow(body.date) === 0) return J({ ok: false, error: "Sundays are already service days." }, 400);
      extra = extra.filter(x => x.date !== body.date); extra.push({ date: body.date, label: clip(body.label, 60) || "Special service" });
    }
    extra.sort((a, b) => a.date.localeCompare(b.date));
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('extra_days', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(extra)).run();
    return J({ ok: true, extra });
  }
  if (path === "/api/admin/logout" && req.method === "POST") {
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
        if (path === "/api/workers" && req.method === "GET") return await publicWorkers(env);
        if (path === "/api/status" && req.method === "GET") return await publicStatus(req, env, u);
        if (path === "/api/checkin" && req.method === "POST") return await checkin(req, env);
        if (path === "/api/login" && req.method === "POST") return await login(req, env);
        if (path.startsWith("/api/admin/")) return await admin(req, env, path, u);
        return J({ ok: false, error: "not found" }, 404);
      }
      if (/^\/(_worker|tab-site|\.)/.test(path)) return new Response("Not found", { status: 404 });
      const res = await env.ASSETS.fetch(req);
      const out = new Response(res.body, res);
      if (path === "/admin" || path === "/admin.html") { out.headers.set("x-robots-tag", "noindex"); out.headers.set("cache-control", "no-store"); }
      if (path === "/" || path === "/index.html") out.headers.set("cache-control", "no-store");
      out.headers.set("x-content-type-options", "nosniff");
      out.headers.set("referrer-policy", "same-origin");
      return out;
    } catch (e) {
      return J({ ok: false, error: "Something went wrong on our side. Please try again." }, 500);
    }
  }
};
