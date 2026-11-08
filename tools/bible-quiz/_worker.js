// RLW Bible Quiz Night (Rivers of Living Water Parish): live multiplayer quiz backend. D1 bound as DB, static files under ASSETS.
// Real-time is short polling against D1; game phases advance lazily on reads (no server timer needed).
const DEFAULT_PW_HASH = "pbkdf2$100000$0pPdBpAXWHnBBI4Uc2knXQ==$geV2QcEAmOX1wixLebtzq0TWo69Iv/5VmIhIJ/EWGA8=";
const MAX_PLAYERS = 200, NAME_MAX = 30, PREVIEW_MS = 4000, SESSION_MS = 7 * 24 * 3600e3, GAME_TTL_MS = 24 * 3600e3;
// auto-advance (2026-11-01): answer reveal shows REVEAL_MS, then the leaderboard LB_MS, then the next question starts by itself
const REVEAL_MS = 4000, LB_MS = 6000, RESUME_MIN_MS = 3000;
const MAX_POINTS = 1000, STREAK_STEP = 100, STREAK_CAP = 500;

const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const err = (msg, status = 400) => J({ ok: false, error: msg }, status);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rid = (n = 18) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64(a).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c])); };

const PROFANE = ["fuck","fucking","fucker","motherfucker","shit","bitch","bastard","asshole","dick","cock","pussy","cunt","whore","slut","twat","wanker","porn","rape","nigger","nigga","faggot","fag","retard","tranny","kike","spic","chink"];
const PROF_RE = new RegExp("(" + PROFANE.map((w) => w.split("").join("[\\W_]*")).join("|") + ")", "i");
function clean(s, max) {
  s = String(s == null ? "" : s).normalize("NFC");
  s = s.replace(/[<>]/g, "").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(s).slice(0, max).join("");
}

let schemaReady = null;
function schema(env) {
  if (!schemaReady) schemaReady = env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, exp INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sets (id TEXT PRIMARY KEY, title TEXT NOT NULL, questions TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS games (pin TEXT PRIMARY KEY, host_key TEXT NOT NULL, title TEXT NOT NULL, questions TEXT NOT NULL, phase TEXT NOT NULL, qi INTEGER NOT NULL, q_start INTEGER NOT NULL DEFAULT 0, q_end INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, pin TEXT NOT NULL, name TEXT NOT NULL, name_lc TEXT NOT NULL, key TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, kicked INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS players_pin ON players (pin, kicked, score DESC)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS xcache (h TEXT PRIMARY KEY, v TEXT NOT NULL, t INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS answers (pin TEXT NOT NULL, pid TEXT NOT NULL, qi INTEGER NOT NULL, choice INTEGER NOT NULL, correct INTEGER NOT NULL, points INTEGER NOT NULL, ms INTEGER NOT NULL, streak INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (pin, pid, qi))"),
  ]).then(async () => {
    // X identity columns (added 2026-10-31). ALTER fails harmlessly when the column already exists.
    for (const col of ["handle TEXT NOT NULL DEFAULT ''", "avatar TEXT NOT NULL DEFAULT ''"]) {
      try { await env.DB.prepare("ALTER TABLE players ADD COLUMN " + col).run(); } catch (e) { /* exists */ }
    }
    // "select two" answers (added 2026-10-31): both picks as "i,j"; choice keeps the first pick for old readers
    try { await env.DB.prepare("ALTER TABLE answers ADD COLUMN choices TEXT NOT NULL DEFAULT ''").run(); } catch (e) { /* exists */ }
    // "type the answer" (added 2026-10-31): what the player typed (cleaned, max 60 chars)
    try { await env.DB.prepare("ALTER TABLE answers ADD COLUMN typed TEXT NOT NULL DEFAULT ''").run(); } catch (e) { /* exists */ }
    // episodes + live-card design (added 2026-11-01): ep = episode number, design = card design "A".."D" fixed per game.
    // The episode counter lives in settings (k='ep_seq', v = last episode number handed out).
    for (const col of ["ep INTEGER NOT NULL DEFAULT 0", "design TEXT NOT NULL DEFAULT ''"]) {
      try { await env.DB.prepare("ALTER TABLE games ADD COLUMN " + col).run(); } catch (e) { /* exists */ }
    }
    // auto-advance (added 2026-11-01): auto_at = server time the current reveal/leaderboard moves on by itself (0 = not scheduled);
    // paused = host paused the auto-advance; pause_left = ms that were left on the step when paused (used on resume)
    for (const col of ["auto_at INTEGER NOT NULL DEFAULT 0", "paused INTEGER NOT NULL DEFAULT 0", "pause_left INTEGER NOT NULL DEFAULT 0"]) {
      try { await env.DB.prepare("ALTER TABLE games ADD COLUMN " + col).run(); } catch (e) { /* exists */ }
    }
  }).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

// ---------- password + sessions ----------
async function pbkdf2(pw, salt, iter) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, 256));
}
async function hashPw(pw) { const salt = new Uint8Array(16); crypto.getRandomValues(salt); return "pbkdf2$100000$" + b64(salt) + "$" + b64(await pbkdf2(pw, salt, 100000)); }
async function checkPw(pw, stored) {
  const [, it, s, h] = stored.split("$"); const got = await pbkdf2(pw, unb64(s), +it); const want = unb64(h);
  if (got.length !== want.length) return false; let d = 0; for (let i = 0; i < got.length; i++) d |= got[i] ^ want[i]; return d === 0;
}
async function pwHash(env) { const r = await env.DB.prepare("SELECT v FROM settings WHERE k='pw'").first(); return r ? r.v : DEFAULT_PW_HASH; }
async function isHost(req, env) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return false;
  const r = await env.DB.prepare("SELECT exp FROM sessions WHERE token = ?").bind(t).first();
  return !!(r && r.exp > Date.now());
}

// ---------- "type the answer" matching (server side) ----------
const TEXT_MAX = 60, TEXT_ACCEPT_MAX = 5;
// lowercase, strip accents + punctuation, drop a leading "the"/"a"/"an", ignore spaces
function normAns(s) {
  let t = String(s == null ? "" : s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  t = t.replace(/&/g, " and ").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^(the|a|an) (?=\S)/, "");
  return t.replace(/\s/g, "");
}
function lev1(a, b) { // true when edit distance <= 1
  if (a === b) return true;
  const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return d + (la - i) + (lb - j) <= 1;
}
function textCorrect(typed, accept) {
  const t = normAns(typed); if (!t) return false;
  return (Array.isArray(accept) ? accept : []).some((a) => { const k = normAns(a); return k && (t === k || (k.length >= 6 && !/^\d+$/.test(k) && lev1(t, k))); });
}
const maskWord = (s) => PROF_RE.test(s) ? "(hidden)" : s;

// ---------- question sets ----------
function validQuestions(qs) {
  if (!Array.isArray(qs) || qs.length < 1 || qs.length > 100) throw new Error("A set needs 1 to 100 questions.");
  return qs.map((q, i) => {
    const type = q.type === "tf" ? "tf" : q.type === "multi" ? "multi" : q.type === "text" ? "text" : "mc";
    const text = clean(q.q, 200); if (!text) throw new Error(`Question ${i + 1} has no text.`);
    const time0 = [5, 10, 15, 20, 30, 45, 60, 90, 120].includes(Number(q.time)) ? Number(q.time) : 20;
    if (type === "text") {
      // "Type the answer": accept[0] is the main answer shown at the reveal; the rest are extra accepted spellings
      const raw = Array.isArray(q.accept) ? q.accept : typeof q.answer === "string" ? [q.answer] : [];
      const seen = new Set(), accept = [];
      for (const a of raw) { const c = clean(a, TEXT_MAX); const k = normAns(c); if (c && k && !seen.has(k)) { seen.add(k); accept.push(c); } }
      if (!accept.length) throw new Error(`Question ${i + 1} (type the answer) needs at least one accepted answer.`);
      if (accept.length > TEXT_ACCEPT_MAX) throw new Error(`Question ${i + 1} (type the answer) can have up to ${TEXT_ACCEPT_MAX} accepted answers.`);
      return { q: text, type, options: [], accept, time: time0, source: clean(q.source, 300), note: clean(q.note, 400) };
    }
    let options = (Array.isArray(q.options) ? q.options : []).map((o) => clean(o, 80));
    if (type === "tf") options = ["True", "False"];
    if (options.length < 2 || options.length > 4 || options.some((o) => !o)) throw new Error(`Question ${i + 1} needs 2 to 4 filled answers.`);
    let answer;
    if (type === "multi") {
      // "Select two answers": exactly 2 distinct correct options, stored sorted as [i, j]
      if (options.length < 3) throw new Error(`Question ${i + 1} (select two) needs at least 3 filled answers.`);
      const a = Array.isArray(q.answer) ? [...new Set(q.answer.map(Number))] : [];
      if (a.length !== 2 || a.some((x) => !Number.isInteger(x) || x < 0 || x >= options.length)) throw new Error(`Question ${i + 1} (select two) needs exactly 2 correct answers ticked.`);
      answer = a.sort((x, y) => x - y);
    } else {
      answer = Number(q.answer); if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw new Error(`Question ${i + 1} has no correct answer marked.`);
    }
    const time = [5, 10, 15, 20, 30, 45, 60, 90, 120].includes(Number(q.time)) ? Number(q.time) : 20;
    return { q: text, type, options, answer, time, source: clean(q.source, 300), note: clean(q.note, 400) };
  });
}
async function ensureSeed(env, origin) {
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM sets").first();
  if (c.n > 0) return;
  const seeded = await env.DB.prepare("SELECT v FROM settings WHERE k='seeded'").first();
  if (seeded) return;
  const r = await env.ASSETS.fetch(new Request(origin + "/default-questions.json"));
  const data = await r.json();
  const now = Date.now();
  // seeded sets: 3 ready rounds of 10 + a mixed bank. featured = the one solo practice opens by default.
  await env.DB.batch([
    ...data.sets.map((s, i) => env.DB.prepare("INSERT OR IGNORE INTO sets (id, title, questions, featured, updated_at) VALUES (?, ?, ?, ?, ?)").bind(s.id, s.title, JSON.stringify(validQuestions(s.questions)), s.featured ? 1 : 0, now - i * 1000)),
    env.DB.prepare("INSERT OR REPLACE INTO settings (k, v) VALUES ('seeded', '1')"),
  ]);
}


// ---------- player identity: players join with a plain name (no social lookups, no outside calls) ----------
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const normHandle = (s) => String(s == null ? "" : s).trim();
const xProfile = async () => ({ unavailable: true });
const avatarPath = () => "";
const pubP = (p) => ({ name: p.name, handle: "", av: "" });


// ---------- shareable result pages (/r/<id>) — 2026-10-31 ----------
// The card image is drawn in the browser, uploaded once, and served back with server-rendered X/OG meta tags,
// so a post with the /r/<id> link shows the player's card as its preview. Text on the page uses SERVER values.
const CARD_MAX_BYTES = 500 * 1024, CARD_TTL_MS = 180 * 24 * 3600e3, CARD_RL_PER_HOUR = 40;
const ID_ALPH = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// ----- episodes (2026-11-01) -----
// Card design rotates with the episode number: EP1->A, EP2->B, EP3->C, EP4->D, EP5->A ...
const DESIGNS = ["A", "B", "C", "D"];
const designFor = (ep) => DESIGNS[((Math.max(1, ep) - 1) % 4 + 4) % 4];
const epLabel = (ep) => (ep > 0 ? "EP " + ep : "");
// Atomic: one statement increments and returns the counter, so two games created at once never share a number.
async function nextEp(env) {
  const r = await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('ep_seq', '1') ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT) RETURNING v").first();
  return Math.trunc(Number(r && r.v)) || 1;
}
async function epSeq(env) { const r = await env.DB.prepare("SELECT v FROM settings WHERE k='ep_seq'").first(); return r ? Math.trunc(Number(r.v)) || 0 : 0; }
function cardId() { const a = new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a, (b) => ID_ALPH[b % ID_ALPH.length]).join(""); }
let cardSchemaReady = null;
function cardSchema(env) {
  if (!cardSchemaReady) cardSchemaReady = env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, handle TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, descr TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, img BLOB, game_pid TEXT, ip TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS cards_created ON cards (created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS cards_ip ON cards (ip, created_at)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS cards_pid ON cards (game_pid) WHERE game_pid IS NOT NULL"),
  ]).catch((e) => { cardSchemaReady = null; throw e; });
  return cardSchemaReady;
}
const fmtN = (n) => Number(n || 0).toLocaleString("en-US");
const ordinalS = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
function sniffImage(u8) {
  if (u8.length > 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "image/jpeg";
  if (u8.length > 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return "image/png";
  return null;
}
async function ipKey(req) {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ip = (viaProxy(req) && xff) || req.headers.get("cf-connecting-ip") || xff || "?";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pq-card:" + ip));
  return b64(h).slice(0, 16);
}
async function cardUpload(req, env, url) {
  await cardSchema(env);
  const ct = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (ct !== "image/jpeg" && ct !== "image/png") return err("Send the card as image/jpeg or image/png.", 415);
  const len = Number(req.headers.get("content-length") || 0);
  if (len > CARD_MAX_BYTES) return err("Card image is too big (max 500 KB).", 413);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return err("Empty image.");
  if (buf.length > CARD_MAX_BYTES) return err("Card image is too big (max 500 KB).", 413);
  const mime = sniffImage(buf);
  if (!mime) return err("That file isn't a JPEG or PNG image.", 415);
  const now = Date.now(), ip = await ipKey(req);
  const rl = await env.DB.prepare("SELECT COUNT(*) AS n FROM cards WHERE ip = ? AND created_at > ?").bind(ip, now - 3600e3).first();
  if (rl.n >= CARD_RL_PER_HOUR) return err("Too many cards from here in the last hour. Try again later.", 429);
  const q = url.searchParams, kind = q.get("kind") === "mp" ? "mp" : "solo";
  if (kind !== "mp") return err("Score cards are only for live games.", 403);
  let name, handle = "", title, descr, gamePid = null;
  if (kind === "mp") {
    const pin = String(q.get("pin") || ""), pid = String(q.get("pid") || ""), key = String(q.get("key") || "");
    const g = await loadGame(env, pin);
    if (!g) return err("Game not found.", 404);
    if (g.phase !== "podium") return err("The game hasn't finished yet.", 409);
    const p = await env.DB.prepare("SELECT id, key, kicked, name, handle FROM players WHERE id = ? AND pin = ?").bind(pid, pin).first();
    if (!p || p.key !== key || p.kicked) return err("Player not found in this game.", 403);
    gamePid = pin + ":" + pid;
    const ex = await env.DB.prepare("SELECT id FROM cards WHERE game_pid = ?").bind(gamePid).first();
    if (ex) return J({ ok: true, id: ex.id, url: pubBase(req) + "/r/" + ex.id, existing: true });
    const players = (await env.DB.prepare("SELECT id, score, correct, best_streak FROM players WHERE pin = ? AND kicked = 0 ORDER BY score DESC, joined_at ASC").bind(pin).all()).results;
    const rank = players.findIndex((x) => x.id === pid) + 1, me = players[rank - 1];
    const played = g.qi + 1;
    name = p.name; handle = p.handle || "";
    title = `${name} finished ${ordN(rank)} of ${players.length} at RLW Bible Quiz Night`;
    descr = `${me.correct}/${played} correct · ${fmtN(me.score)} points${me.best_streak > 1 ? ` · best streak ${me.best_streak}` : ""}. Live RLW Bible Quiz Night game, Rivers of Living Water Parish.`;
  } else {
    const correct = Math.trunc(Number(q.get("correct"))), total = Math.trunc(Number(q.get("total"))), score = Math.trunc(Number(q.get("score")) || 0), streak = Math.trunc(Number(q.get("streak")) || 0);
    if (!(total >= 1 && total <= 100 && correct >= 0 && correct <= total && score >= 0 && score <= total * 1500 && streak >= 0 && streak <= correct)) return err("Those score numbers don't add up.");
    const setId = q.get("set");
    if (setId) {
      const s = await env.DB.prepare("SELECT questions FROM sets WHERE id = ?").bind(setId).first();
      if (s && JSON.parse(s.questions).length !== total) return err("Those score numbers don't match the question set.");
    }
    const h = normHandle(q.get("h"));
    if (h && HANDLE_RE.test(h)) {
      const prof = await xProfile(h, env);
      if (prof.found) { handle = HANDLE_RE.test(prof.handle) ? prof.handle : h; name = clean(prof.name, NAME_MAX) || handle; }
      else if (!prof.notFound) { handle = h; name = "@" + h; }
    }
    if (!name) name = "A player";
    title = `${name} scored ${correct}/${total} at RLW Bible Quiz Night`;
    descr = `${fmtN(score)} points${streak > 1 ? ` · best streak ${streak}` : ""} in solo practice at RLW Bible Quiz Night.`;
  }
  let id = cardId();
  for (let i = 0; i < 3; i++) { const ex = await env.DB.prepare("SELECT id FROM cards WHERE id = ?").bind(id).first(); if (!ex) break; id = cardId(); }
  const useR2 = !!env.FILES;
  if (useR2) await env.FILES.put("cards/" + id, buf, { httpMetadata: { contentType: mime } });
  await env.DB.prepare("INSERT INTO cards (id, kind, name, handle, title, descr, mime, bytes, img, game_pid, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, kind, name, handle, title, descr, mime, buf.length, useR2 ? null : buf, gamePid, ip, now).run();
  // housekeeping: drop cards past their keep window (cheap, indexed)
  const old = (await env.DB.prepare("SELECT id FROM cards WHERE created_at < ? LIMIT 50").bind(now - CARD_TTL_MS).all()).results;
  if (old.length) {
    if (useR2) await env.FILES.delete(old.map((o) => "cards/" + o.id)).catch(() => {});
    await env.DB.prepare(`DELETE FROM cards WHERE id IN (${old.map(() => "?").join(",")})`).bind(...old.map((o) => o.id)).run();
  }
  return J({ ok: true, id, url: pubBase(req) + "/r/" + id });
}
const ordN = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const hesc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function cardRow(env, id) {
  await cardSchema(env);
  const r = await env.DB.prepare("SELECT id, kind, name, handle, title, descr, mime, bytes, created_at FROM cards WHERE id = ?").bind(id).first();
  if (!r || r.created_at < Date.now() - CARD_TTL_MS) return null;
  return r;
}
async function cardImage(env, id) {
  const r = await cardRow(env, id);
  if (!r) return new Response("Card not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60" } });
  let body = null;
  if (env.FILES) { const o = await env.FILES.get("cards/" + id); if (o) body = o.body; }
  if (!body) { const b = await env.DB.prepare("SELECT img FROM cards WHERE id = ?").bind(id).first(); if (b && b.img) body = new Uint8Array(b.img); }
  if (!body) return new Response("Card not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(body, { headers: { "content-type": r.mime, "content-length": String(r.bytes), "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*", "x-content-type-options": "nosniff" } });
}
function pageShell(origin, meta, inner) {
  const B = meta.base || "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${hesc(meta.title)}</title>
<meta name="description" content="${hesc(meta.descr)}">
<meta name="theme-color" content="#0E0E0E">
<link rel="canonical" href="${hesc(meta.url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="RLW Bible Quiz Night">
<meta property="og:url" content="${hesc(meta.url)}">
<meta property="og:title" content="${hesc(meta.ogTitle || meta.title)}">
<meta property="og:description" content="${hesc(meta.descr)}">
<meta property="og:image" content="${hesc(meta.image)}">
<meta property="og:image:secure_url" content="${hesc(meta.image)}">
<meta property="og:image:type" content="${hesc(meta.mime || "image/png")}">
<meta property="og:image:width" content="${meta.w || 1200}">
<meta property="og:image:height" content="${meta.h || 675}">
<meta property="og:image:alt" content="${hesc(meta.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${hesc(meta.ogTitle || meta.title)}">
<meta name="twitter:description" content="${hesc(meta.descr)}">
<meta name="twitter:image" content="${hesc(meta.image)}">
<meta name="twitter:image:alt" content="${hesc(meta.alt)}">
<link rel="icon" href="${B}/favicon.png">
<link rel="apple-touch-icon" href="${B}/apple-touch-icon.png">
<style>
*{box-sizing:border-box}html,body{margin:0}body{background:#0E0E0E;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column}
a{color:#4CC27E}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #222}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none;color:#fff;font-weight:800;font-size:20px}.brand .q{color:#4CC27E}
main{flex:1;width:100%;max-width:820px;margin:0 auto;padding:22px 16px 30px}
.card-img{display:block;width:100%;height:auto;border-radius:16px;border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 40px rgba(10,143,74,.25);background:#171819;aspect-ratio:1080/1350;max-width:440px;margin:0 auto}
h1{font-size:clamp(22px,5vw,32px);line-height:1.2;margin:22px 0 6px;text-align:center}.sub{color:#c9cad3;margin:0 0 22px;font-size:17px;line-height:1.45}
.cta{display:flex;flex-wrap:wrap;gap:12px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:56px;padding:0 26px;border-radius:14px;font-weight:800;font-size:18px;text-decoration:none;color:#fff;background:#303236}
.btn.primary{background:#0A8F4A;flex:1 1 260px;font-size:20px}.btn.primary:hover{background:#19B864}.btn:focus-visible{outline:3px solid #4CC27E;outline-offset:2px}
footer{color:#8b8d98;font-size:13px;text-align:center;padding:18px;border-top:1px solid #222;line-height:1.6}
</style>
</head>
<body>
<header class="top"><a class="brand" href="${B}/"><img src="${B}/logo.png" alt="Rivers of Living Water Parish" height="36"><span class="q">Bible Quiz</span></a></header>
<main>${inner}</main>
<footer><div>Rivers of Living Water Parish</div><div style="margin-top:6px;font-size:.85em;opacity:.8">© 2026 Rivers Of Living Water</div></footer>
</body>
</html>`;
}
const PUBQ = "https://rlw-bible-quiz.sites.tab.bot"; // public address used in shared links
const PROXY_KEY = "REPLACE_WITH_YOUR_PROXY_KEY"; // shared with the unified parish site (rlw-church) proxy
const viaProxy = (req) => req.headers.get("x-rlw-proxy") === PROXY_KEY;
// public base for links: the unified site address (e.g. https://<parish site>/quiz) when served through its proxy, else this site
function pubBase(req) { const b = req && viaProxy(req) ? (req.headers.get("x-rlw-base") || "") : ""; return /^https:\/\/[^\s"'<>]+$/.test(b) ? b.replace(/\/+$/, "") : PUBQ; }
async function cardPage(env, id, origin, req) {
  const PUBQ = pubBase(req);
  const r = await cardRow(env, id);
  const html = (s, status, cache) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache } });
  if (!r) {
    const meta = { title: "RLW Bible Quiz Night", descr: "A live Bible quiz for the members of RCCG Rivers of Living Water Parish. Join with the game PIN.", url: PUBQ + "/", image: PUBQ + "/og.png?v=3", mime: "image/png", h: 630, alt: "RLW Bible Quiz Night", base: PUBQ };
    return html(pageShell(origin, meta, `<h1>This score card has expired or doesn't exist</h1><p class="sub">Score cards are kept for 180 days. You can still play.</p><div class="cta"><a class="btn primary" href="${PUBQ}/">Play RLW Bible Quiz</a><a class="btn" href="${PUBQ}/solo.html">Play solo</a></div>`), 404, "public, max-age=60");
  }
  const image = `${PUBQ}/r/${r.id}.${r.mime === "image/png" ? "png" : "jpg"}`;
  const meta = { title: r.title, ogTitle: r.title, descr: r.descr, url: `${PUBQ}/r/${r.id}`, image, mime: r.mime, w: 1080, h: 1350, alt: `${r.title}. ${r.descr}`, base: PUBQ };
  const who = r.handle && r.name.replace(/^@/, "").toLowerCase() !== r.handle.toLowerCase() ? ` <a href="https://x.com/${hesc(r.handle)}" target="_blank" rel="noopener">@${hesc(r.handle)}</a>` : "";
  const inner = `<img class="card-img" src="${hesc(image)}" width="1080" height="1350" alt="${hesc(meta.alt)}">
<h1>${hesc(r.title)}</h1>
<p class="sub">${hesc(r.descr)}${who ? `<br>Player:${who}` : ""}</p>
<div class="cta"><a class="btn primary" href="${PUBQ}/">Play RLW Bible Quiz</a><a class="btn" href="${PUBQ}/solo.html">Play solo</a></div>`;
  return html(pageShell(origin, meta, inner), 200, "public, max-age=300");
}
const ROBOTS = "User-agent: *\nAllow: /\nDisallow: /api/\n\nUser-agent: Twitterbot\nAllow: /\n";

// ---------- game engine ----------
// never carries q.answer / q.accept: those only go out at the reveal
function publicQ(q) { return { q: q.q, type: q.type, options: q.type === "text" ? [] : q.options, time: q.time }; }
async function loadGame(env, pin) { return env.DB.prepare("SELECT * FROM games WHERE pin = ?").bind(pin).first(); }
async function activeCount(env, pin) { return (await env.DB.prepare("SELECT COUNT(*) AS n FROM players WHERE pin = ? AND kicked = 0").bind(pin).first()).n; }

// Close the running question: once only (guarded UPDATE), then break the streak of everyone who did not answer.
// The answer reveal is scheduled to move on to the leaderboard by itself after REVEAL_MS (held while paused).
async function closeQuestion(env, g) {
  const now = Date.now();
  const r = await env.DB.prepare("UPDATE games SET phase='reveal', q_end = MIN(q_end, ?), auto_at = CASE WHEN paused = 1 THEN 0 ELSE ? END, pause_left = ?, updated_at=? WHERE pin=? AND phase='question' AND qi=?").bind(now, now + REVEAL_MS, REVEAL_MS, now, g.pin, g.qi).run();
  if (r.meta.changes === 1) {
    await env.DB.prepare("UPDATE players SET streak = 0 WHERE pin = ? AND id NOT IN (SELECT pid FROM answers WHERE pin = ? AND qi = ?)").bind(g.pin, g.pin, g.qi).run();
  }
  return loadGame(env, g.pin);
}
// One step forward from reveal or leaderboard: reveal -> leaderboard -> next question (or podium after the last one).
// Guarded on (phase, qi) so the auto-advance and the host's Next can never both move the game (no double skip).
async function advance(env, g) {
  const now = Date.now(), qs = JSON.parse(g.questions);
  if (g.phase === "reveal") {
    await env.DB.prepare("UPDATE games SET phase='leaderboard', auto_at = CASE WHEN paused = 1 THEN 0 ELSE ? END, pause_left = ?, updated_at=? WHERE pin=? AND phase='reveal' AND qi=?").bind(now + LB_MS, LB_MS, now, g.pin, g.qi).run();
  } else if (g.phase === "leaderboard") {
    if (g.qi + 1 < qs.length) {
      const qStart = now + PREVIEW_MS;
      await env.DB.prepare("UPDATE games SET phase='question', qi=?, q_start=?, q_end=?, auto_at=0, pause_left=0, updated_at=? WHERE pin=? AND phase='leaderboard' AND qi=?").bind(g.qi + 1, qStart, qStart + qs[g.qi + 1].time * 1000, now, g.pin, g.qi).run();
    } else {
      await env.DB.prepare("UPDATE games SET phase='podium', auto_at=0, pause_left=0, updated_at=? WHERE pin=? AND phase='leaderboard' AND qi=?").bind(now, g.pin, g.qi).run();
    }
  } else return g;
  return loadGame(env, g.pin);
}
// Phases advance lazily on any read (host or any player polling), so the game keeps moving even when the host tab sleeps.
async function tick(env, g) {
  if ((g.phase === "reveal" || g.phase === "leaderboard") && !g.paused && g.auto_at > 0 && Date.now() >= g.auto_at) return advance(env, g);
  if (g.phase !== "question") return g;
  const now = Date.now();
  if (now >= g.q_end) return closeQuestion(env, g);
  if (now >= g.q_start) {
    const [a, p] = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS n FROM answers a JOIN players p ON p.id = a.pid WHERE a.pin = ? AND a.qi = ? AND p.kicked = 0").bind(g.pin, g.qi),
      env.DB.prepare("SELECT COUNT(*) AS n FROM players WHERE pin = ? AND kicked = 0").bind(g.pin),
    ]);
    if (p.results[0].n > 0 && a.results[0].n >= p.results[0].n) return closeQuestion(env, g);
  }
  return g;
}

async function snapshot(env, g, who) {
  // who: {host:true} or {pid}
  const qs = JSON.parse(g.questions);
  const out = { ok: true, now: Date.now(), pin: g.pin, title: g.title, phase: g.phase, qi: g.qi, total: qs.length, ep: g.ep || 0, design: g.design || "A" };
  // auto-advance clock: clients draw the "next question in…" countdown from these server values
  out.auto_at = g.auto_at || 0; out.paused = !!g.paused; out.pause_left = g.pause_left || 0; out.auto_ms = { reveal: REVEAL_MS, leaderboard: LB_MS };
  if (g.phase === "podium") out.played = g.played || g.qi + 1;
  const showQ = g.phase === "question" || g.phase === "reveal";
  if (showQ) {
    const q = qs[g.qi];
    out.question = publicQ(q); out.q_start = g.q_start; out.q_end = g.q_end;
    if (g.phase === "reveal") { out.answer = q.type === "text" ? (q.accept || [])[0] || "" : q.answer; out.ref = q.source || ""; }
  }
  const stmts = [env.DB.prepare("SELECT id, name, handle, avatar, score, streak, best_streak, correct, joined_at FROM players WHERE pin = ? AND kicked = 0 ORDER BY score DESC, joined_at ASC").bind(g.pin)];
  const isLb = g.phase === "leaderboard";
  if (isLb) stmts.push(env.DB.prepare("SELECT pid, points FROM answers WHERE pin = ? AND qi = ?").bind(g.pin, g.qi));
  else if (showQ) stmts.push(env.DB.prepare("SELECT a.pid, a.choice, a.choices, a.typed, a.correct, a.points, a.ms, a.streak FROM answers a JOIN players p ON p.id = a.pid WHERE a.pin = ? AND a.qi = ? AND p.kicked = 0").bind(g.pin, g.qi));
  const res = await env.DB.batch(stmts);
  const players = res[0].results;
  const answers = showQ ? res[1].results : [];
  out.player_count = players.length;
  // rank movement on the leaderboard: rank before this question (score minus this question's points) vs now; + = moved up
  const moveOf = new Map();
  if (isLb && g.qi > 0) {
    const pts = new Map(res[1].results.map((a) => [a.pid, a.points]));
    const before = players.slice().sort((x, y) => (y.score - (pts.get(y.id) || 0)) - (x.score - (pts.get(x.id) || 0)) || x.joined_at - y.joined_at);
    before.forEach((p, i) => moveOf.set(p.id, i - players.findIndex((q) => q.id === p.id)));
  }
  out.answered = answers.length;
  const rankOf = (id) => players.findIndex((p) => p.id === id) + 1;
  if (who.host) {
    if (g.phase === "lobby") out.players = players.map((p) => ({ id: p.id, ...pubP(p) }));
    if (g.phase === "reveal" && qs[g.qi].type === "text") {
      // most common wrong answers (grouped by their normalized form), masked when rude; rendered as text by the host page
      const groups = new Map();
      answers.filter((a) => !a.correct && a.typed).forEach((a) => { const k = normAns(a.typed); if (!k) return; const gr = groups.get(k) || { text: a.typed, n: 0 }; gr.n++; groups.set(k, gr); });
      out.wrong_top = [...groups.values()].sort((x, y) => y.n - x.n).slice(0, 3).map((x) => ({ text: maskWord(x.text), n: x.n }));
      out.accept = qs[g.qi].accept || [];
      out.correct_count = answers.filter((a) => a.correct).length;
      out.wrong_count = answers.length - out.correct_count;
    } else if (g.phase === "reveal") {
      const dist = qs[g.qi].options.map(() => 0);
      answers.forEach((a) => { const picks = a.choices ? a.choices.split(",").map(Number) : [a.choice]; picks.forEach((c) => { if (dist[c] != null) dist[c]++; }); });
      out.distribution = dist; out.correct_count = answers.filter((a) => a.correct).length;
    }
    if (g.phase === "leaderboard" || g.phase === "reveal") out.leaderboard = players.slice(0, 10).map((p) => ({ ...pubP(p), score: p.score, streak: p.streak, move: moveOf.get(p.id) || 0 }));
    if (g.phase === "podium") out.ranking = players.map((p) => ({ ...pubP(p), score: p.score, correct: p.correct, best_streak: p.best_streak }));
  } else {
    const me = players.find((p) => p.id === who.pid);
    if (!me) { out.kicked = true; return out; }
    out.me = { ...pubP(me), score: me.score, streak: me.streak, correct: me.correct, best_streak: me.best_streak, rank: rankOf(me.id) };
    // lobby "who's here" list for players (2026-11-01): same public fields the host list shows, oldest first; no ids/keys — j (join time) is only a render key, you marks this phone's own entry
    if (g.phase === "lobby") out.lobby = players.slice().sort((x, y) => x.joined_at - y.joined_at).map((p) => ({ ...pubP(p), j: p.joined_at, ...(p.id === me.id ? { you: true } : {}) }));
    const mine = answers.find((a) => a.pid === who.pid);
    if (mine) {
      out.my_answer = { choice: mine.choice };
      if (mine.choices) out.my_answer.choices = mine.choices.split(",").map(Number);
      if (mine.typed) out.my_answer.typed = mine.typed;
      if (g.phase === "reveal") Object.assign(out.my_answer, { correct: !!mine.correct, points: mine.points, streak: mine.streak, ms: mine.ms });
    }
    if (g.phase === "leaderboard" || g.phase === "podium" || g.phase === "reveal") {
      const ahead = players[rankOf(me.id) - 2];
      if (ahead) out.me.behind = { name: ahead.name, by: ahead.score - me.score };
    }
    if (isLb) { // players see the leaderboard on their own phone too (top 10 since 2026-11-01 evening; their own row flagged)
      out.leaderboard = players.slice(0, 10).map((p) => ({ ...pubP(p), score: p.score, move: moveOf.get(p.id) || 0, me: p.id === me.id }));
      out.me.move = moveOf.get(me.id) || 0;
    }
    if (g.phase === "podium") out.podium = players.slice(0, 3).map((p) => ({ ...pubP(p), score: p.score }));
  }
  return out;
}

function points(ms, limitMs, streakAfter) {
  const base = Math.round(MAX_POINTS * (1 - Math.min(1, Math.max(0, ms / limitMs)) / 2));
  const bonus = Math.min(STREAK_CAP, Math.max(0, streakAfter - 1) * STREAK_STEP);
  return { base, bonus };
}

async function newPin(env) {
  for (let i = 0; i < 20; i++) {
    const a = new Uint32Array(1); crypto.getRandomValues(a);
    const pin = String(100000 + (a[0] % 900000));
    const ex = await env.DB.prepare("SELECT pin FROM games WHERE pin = ?").bind(pin).first();
    if (!ex) return pin;
  }
  throw new Error("Could not find a free PIN, try again.");
}

async function body(req) { try { return await req.json(); } catch { return {}; } }

async function api(req, env, url, ctx) {
  await schema(env);
  const path = url.pathname.replace(/^\/api\//, "");
  const m = req.method;

  // ----- host auth -----
  if (path === "login" && m === "POST") {
    const b = await body(req);
    if (!(await checkPw(String(b.password || ""), await pwHash(env)))) return err("Wrong host password.", 401);
    const token = rid(24);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO sessions (token, exp) VALUES (?, ?)").bind(token, Date.now() + SESSION_MS),
      env.DB.prepare("DELETE FROM sessions WHERE exp < ?").bind(Date.now()),
    ]);
    return J({ ok: true, token });
  }
  if (path === "password" && m === "POST") {
    if (!(await isHost(req, env))) return err("Host login needed.", 401);
    const b = await body(req);
    if (!(await checkPw(String(b.current || ""), await pwHash(env)))) return err("Current password is wrong.", 401);
    const pw = String(b.next || "");
    if (pw.length < 8) return err("Use at least 8 characters.");
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO settings (k, v) VALUES ('pw', ?)").bind(await hashPw(pw)),
      env.DB.prepare("DELETE FROM sessions WHERE token != ?").bind((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")),
    ]);
    return J({ ok: true });
  }
  if (path === "me") return J({ ok: true, host: await isHost(req, env) });

  // ----- question sets -----
  if (path === "solosets" && m === "GET") {
    await ensureSeed(env, url.origin);
    const rows = (await env.DB.prepare("SELECT id, title, questions FROM sets WHERE featured = 1 ORDER BY updated_at DESC LIMIT 1").all()).results;
    return J({ ok: true, sets: rows.map((s) => ({ id: s.id, title: s.title, n: JSON.parse(s.questions).length })) });
  }
  if (path === "solo" && m === "GET") {
    await ensureSeed(env, url.origin);
    const id = url.searchParams.get("set");
    // solo only ever serves the set the host marked "Used for solo play" in the editor
    const s = await env.DB.prepare("SELECT id, title, questions FROM sets WHERE featured = 1 ORDER BY updated_at DESC LIMIT 1").first();
    if (!s) return err("Solo practice isn't open yet. Check back soon.", 404);
    return J({ ok: true, id: s.id, title: s.title, questions: JSON.parse(s.questions).map((q) => (q.type === "text" ? { ...publicQ(q), answer: (q.accept || [])[0] || "", accept: q.accept || [] } : { ...publicQ(q), answer: q.answer, ref: q.source || "" })) });
  }
  if (path === "sets") {
    if (!(await isHost(req, env))) return err("Host login needed.", 401);
    await ensureSeed(env, url.origin);
    if (m === "GET") {
      const rows = (await env.DB.prepare("SELECT id, title, questions, featured, updated_at FROM sets ORDER BY featured DESC, updated_at DESC").all()).results;
      return J({ ok: true, sets: rows.map((r) => ({ id: r.id, title: r.title, featured: !!r.featured, updated_at: r.updated_at, questions: JSON.parse(r.questions) })) });
    }
    if (m === "POST") {
      const b = await body(req);
      let qs; try { qs = validQuestions(b.questions); } catch (e) { return err(e.message); }
      const title = clean(b.title, 80) || "Untitled quiz";
      const id = b.id ? clean(b.id, 40) : "set-" + rid(6);
      const stmts = [env.DB.prepare("INSERT INTO sets (id, title, questions, featured, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, questions=excluded.questions, featured=excluded.featured, updated_at=excluded.updated_at").bind(id, title, JSON.stringify(qs), b.featured ? 1 : 0, Date.now())];
      if (b.featured) stmts.unshift(env.DB.prepare("UPDATE sets SET featured = 0 WHERE id != ?").bind(id));
      await env.DB.batch(stmts);
      return J({ ok: true, id });
    }
    if (m === "DELETE") {
      const id = url.searchParams.get("id");
      const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM sets").first()).n;
      if (n <= 1) return err("Keep at least one question set.");
      await env.DB.prepare("DELETE FROM sets WHERE id = ?").bind(id).run();
      return J({ ok: true });
    }
  }

  // ----- games -----
  if (path === "game" && m === "POST") {
    if (!(await isHost(req, env))) return err("Host login needed.", 401);
    await ensureSeed(env, url.origin);
    const b = await body(req);
    const s = await env.DB.prepare("SELECT title, questions FROM sets WHERE id = ?").bind(String(b.set || "")).first();
    if (!s) return err("Pick a question set.");
    const pin = await newPin(env), key = rid(24), now = Date.now();
    const ep = await nextEp(env), design = designFor(ep);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO games (pin, host_key, title, questions, phase, qi, created_at, updated_at, ep, design) VALUES (?, ?, ?, ?, 'lobby', 0, ?, ?, ?, ?)").bind(pin, key, s.title, s.questions, now, now, ep, design),
      env.DB.prepare("DELETE FROM answers WHERE pin IN (SELECT pin FROM games WHERE created_at < ?)").bind(now - GAME_TTL_MS),
      env.DB.prepare("DELETE FROM players WHERE pin IN (SELECT pin FROM games WHERE created_at < ?)").bind(now - GAME_TTL_MS),
      env.DB.prepare("DELETE FROM games WHERE created_at < ?").bind(now - GAME_TTL_MS),
    ]);
    return J({ ok: true, pin, host_key: key, ep, design });
  }
  // episode counter (host only, 2026-11-01): GET -> { next }, POST { next: n } -> the next new game is EP n
  if (path === "episode" && (m === "GET" || m === "POST")) {
    if (!(await isHost(req, env))) return err("Host login needed.", 401);
    if (m === "POST") {
      const n = Math.trunc(Number((await body(req)).next));
      if (!(n >= 1 && n <= 100000)) return err("Episode must be a number from 1 up.");
      await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('ep_seq', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(n - 1)).run();
    }
    return J({ ok: true, next: (await epSeq(env)) + 1 });
  }
  if (path === "join" && m === "POST") {
    const b = await body(req);
    const pin = String(b.pin || "").replace(/\D/g, "");
    let g = await loadGame(env, pin);
    if (!g) return J({ ok: false, error: "Game not found — check the PIN.", not_found: true }, 404);
    // late joining (2026-11-01): a running game (question / reveal / leaderboard, paused or not) can be joined; the player
    // lands on the current screen and plays the remaining questions (missed ones = no answer = 0 points). Ended = podium.
    g = await tick(env, g);
    if (g.phase === "podium") return J({ ok: false, error: "This game has ended.", ended: true, ep: g.ep || 0, title: g.title }, 409);
    if (!["lobby", "question", "reveal", "leaderboard"].includes(g.phase)) return err("That game has already started.", 409);
    // where the game is right now (re-read after the X lookup, which can take a few seconds) -> the late joiner's note
    const lateNow = async () => { const g2 = (await loadGame(env, pin)) || g; return g2.phase === "lobby" ? null : { phase: g2.phase, qi: g2.qi, total: JSON.parse(g2.questions).length }; };
    const name = clean(b.name, NAME_MAX), handle = "", avatar = "";
    if (!name) return err("Enter your name.");
    if (PROF_RE.test(name)) return err("Please use a different name.");
    if ((await activeCount(env, pin)) >= MAX_PLAYERS) return err("This game is full.", 409);
    const dupe = await env.DB.prepare("SELECT id, key, name FROM players WHERE pin = ? AND name_lc = ? AND kicked = 0").bind(pin, name.toLowerCase()).first();
    if (dupe) {
      // same device rejoining (it still holds this player's id + key): hand back the existing player, never a second one
      if (b.pid && b.key && String(b.pid) === dupe.id && String(b.key) === dupe.key)
        return J({ ok: true, pid: dupe.id, key: dupe.key, name: dupe.name, handle: "", av: "", title: g.title, ep: g.ep || 0, rejoined: true, late: await lateNow() });
      return err(`Someone called "${name}" is already in this game. Add your surname or initial.`, 409);
    }
    const id = rid(9), key = rid(18);
    await env.DB.prepare("INSERT INTO players (id, pin, name, name_lc, handle, avatar, key, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, pin, name, name.toLowerCase(), handle, avatar, key, Date.now()).run();
    return J({ ok: true, pid: id, key, name, handle, av: "", title: g.title, ep: g.ep || 0, late: await lateNow() });
  }
  // public PIN check for the join screen (2026-11-01): ended games get a friendly "This game has ended" screen.
  // Games are deleted after 24 h, so a deleted PIN and a PIN that never existed both answer not_found.
  if (path === "pin" && m === "GET") {
    const pin = (url.searchParams.get("pin") || "").replace(/\D/g, "");
    let g = pin.length === 6 ? await loadGame(env, pin) : null;
    if (!g) return J({ ok: false, error: "Game not found — check the PIN.", not_found: true }); // 200 so the check doesn't log a console error
    g = await tick(env, g);
    const out = { ok: true, now: Date.now(), pin: g.pin, ep: g.ep || 0, title: g.title, game_state: g.phase === "podium" ? "ended" : g.phase === "lobby" ? "lobby" : "running" };
    if (out.game_state === "ended") {
      const top = await env.DB.prepare("SELECT name, handle, avatar, score FROM players WHERE pin = ? AND kicked = 0 ORDER BY score DESC, joined_at ASC LIMIT 3").bind(g.pin).all();
      out.podium = (top.results || []).map((p) => ({ ...pubP(p), score: p.score }));
    }
    return J(out);
  }
  if (path === "state" && m === "GET") {
    const pin = url.searchParams.get("pin") || "";
    let g = await loadGame(env, pin);
    if (!g) return err("Game not found (games are kept for 24 hours).", 404);
    const hk = url.searchParams.get("hk");
    if (hk) { if (hk !== g.host_key) return err("Not the host of this game.", 403); g = await tick(env, g); return J(await snapshot(env, g, { host: true })); }
    const pid = url.searchParams.get("pid"), key = url.searchParams.get("key");
    const p = await env.DB.prepare("SELECT key, kicked FROM players WHERE id = ? AND pin = ?").bind(pid, pin).first();
    if (!p || p.key !== key) return err("Player not found in this game.", 403);
    if (p.kicked) return J({ ok: true, kicked: true, now: Date.now() });
    g = await tick(env, g);
    return J(await snapshot(env, g, { pid }));
  }
  if (path === "answer" && m === "POST") {
    const b = await body(req);
    const g = await loadGame(env, String(b.pin || ""));
    if (!g) return err("Game not found.", 404);
    const p = await env.DB.prepare("SELECT id, key, streak, kicked FROM players WHERE id = ? AND pin = ?").bind(String(b.pid || ""), g.pin).first();
    if (!p || p.key !== b.key || p.kicked) return err("Player not found in this game.", 403);
    const now = Date.now();
    if (g.phase !== "question" || Number(b.qi) !== g.qi) return err("Too late, that question is closed.", 409);
    if (now < g.q_start) return err("Wait for the answers to appear.", 409);
    if (now > g.q_end + 400) return err("Time's up.", 409);
    const q = JSON.parse(g.questions)[g.qi];
    let choice, choices = "", typed = "", correct;
    if (q.type === "text") {
      typed = clean(b.text, TEXT_MAX);
      if (!normAns(typed)) return err("Type an answer first.");
      choice = -1; correct = textCorrect(typed, q.accept);
    } else if (q.type === "multi") {
      const raw = Array.isArray(b.choices) ? b.choices.map(Number) : [];
      const picks = [...new Set(raw)].sort((x, y) => x - y);
      if (raw.length !== 2 || picks.length !== 2 || picks.some((c) => !Number.isInteger(c) || c < 0 || c >= q.options.length)) return err("Pick exactly 2 different answers.");
      const want = (Array.isArray(q.answer) ? q.answer : []).map(Number).sort((x, y) => x - y);
      choice = picks[0]; choices = picks.join(",");
      correct = want.length === 2 && picks[0] === want[0] && picks[1] === want[1];
    } else {
      choice = Number(b.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return err("Pick one of the answers.");
      correct = choice === q.answer;
    }
    const ms = Math.min(now - g.q_start, q.time * 1000);
    const streak = correct ? p.streak + 1 : 0;
    const pt = correct ? points(ms, q.time * 1000, streak) : { base: 0, bonus: 0 };
    const total = pt.base + pt.bonus;
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO answers (pin, pid, qi, choice, choices, typed, correct, points, ms, streak) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(g.pin, p.id, g.qi, choice, choices, typed, correct ? 1 : 0, total, ms, streak).run();
    if (ins.meta.changes !== 1) return err("You already answered this one.", 409);
    await env.DB.prepare("UPDATE players SET score = score + ?, streak = ?, best_streak = MAX(best_streak, ?), correct = correct + ? WHERE id = ?").bind(total, streak, streak, correct ? 1 : 0, p.id).run();
    return J({ ok: true, locked: true });
  }
  if (path === "host" && m === "POST") {
    const b = await body(req);
    let g = await loadGame(env, String(b.pin || ""));
    if (!g || b.hk !== g.host_key) return err("Not the host of this game.", 403);
    const qs = JSON.parse(g.questions), now = Date.now();
    const go = async (phase, qi, extra = "") => {
      if (phase === "question") {
        const q = qs[qi], qStart = now + PREVIEW_MS;
        await env.DB.prepare("UPDATE games SET phase='question', qi=?, q_start=?, q_end=?, auto_at=0, pause_left=0, updated_at=? WHERE pin=?").bind(qi, qStart, qStart + q.time * 1000, now, g.pin).run();
      } else await env.DB.prepare("UPDATE games SET phase=?, qi=?, auto_at=0, updated_at=? WHERE pin=?").bind(phase, qi, now, g.pin).run();
    };
    const a = b.action;
    if (a === "kick") { await env.DB.prepare("UPDATE players SET kicked = 1 WHERE id = ? AND pin = ?").bind(String(b.player || ""), g.pin).run(); }
    else if (a === "start" && g.phase === "lobby") {
      if ((await activeCount(env, g.pin)) < 1) return err("Wait for at least one player to join.");
      await go("question", 0);
    }
    else if (a === "set_ep" && g.phase === "lobby") { // host corrects the episode before starting (2026-11-01)
      const n = Math.trunc(Number(b.ep));
      if (!(n >= 1 && n <= 100000)) return err("Episode must be a number from 1 up.");
      await env.DB.batch([
        env.DB.prepare("UPDATE games SET ep=?, design=?, updated_at=? WHERE pin=?").bind(n, designFor(n), now, g.pin),
        // keep the counter ahead so the next new game continues after this one
        env.DB.prepare("INSERT INTO settings (k, v) VALUES ('ep_seq', ?) ON CONFLICT(k) DO UPDATE SET v = CAST(MAX(CAST(v AS INTEGER), ?) AS TEXT)").bind(String(n), n),
      ]);
    }
    else if (a === "skip" && g.phase === "question") { await closeQuestion(env, g); }
    else if (a === "next") {
      // manual "go now" override; if the auto-advance already moved this very step, the guarded update is a no-op (no double skip)
      const fromPhase = b.from_phase, fromQi = b.from_qi;
      g = await tick(env, g);
      if (fromPhase != null && (g.phase !== fromPhase || g.qi !== Number(fromQi))) { /* already moved on by itself */ }
      else if (g.phase === "reveal" || g.phase === "leaderboard") await advance(env, g);
      else if (g.phase === "question") return err("Question still running. Use Skip to end it early.", 409);
    }
    else if (a === "pause" && g.phase !== "lobby" && g.phase !== "podium") {
      // hold on the current screen; remember how long was left on this step
      await env.DB.prepare("UPDATE games SET paused=1, pause_left = CASE WHEN auto_at > 0 THEN MAX(0, auto_at - ?) ELSE pause_left END, auto_at=0, updated_at=? WHERE pin=? AND paused=0").bind(now, now, g.pin).run();
    }
    else if (a === "resume") {
      await env.DB.prepare("UPDATE games SET paused=0, auto_at = CASE WHEN phase IN ('reveal','leaderboard') THEN ? + MAX(pause_left, ?) ELSE 0 END, updated_at=? WHERE pin=? AND paused=1").bind(now, RESUME_MIN_MS, now, g.pin).run();
    }
    else if (a === "end") { if (g.phase === "question") await closeQuestion(env, g); await go("podium", g.qi); }
    else return err("Nothing to do from here.", 409);
    g = await loadGame(env, g.pin);
    return J(await snapshot(env, g, { host: true }));
  }
  if (path === "card" && m === "POST") return cardUpload(req, env, url);
  return err("Not found.", 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request, env, url, ctx); }
      catch (e) { return err("Server hiccup: " + (e && e.message ? e.message : "unknown"), 500); }
    }
    const rm = url.pathname.match(/^\/r\/([A-Za-z0-9]{8})(\.(?:jpg|png))?\/?$/);
    if (rm && (request.method === "GET" || request.method === "HEAD")) {
      try { await schema(env); return rm[2] ? await cardImage(env, rm[1]) : await cardPage(env, rm[1], url.origin, request); }
      catch (e) { return new Response("Server hiccup", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }); }
    }
    if (url.pathname === "/robots.txt") return new Response(ROBOTS, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
    return env.ASSETS.fetch(request);
  },
};
