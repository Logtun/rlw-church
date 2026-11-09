(function () {
"use strict";
var TK = "rlwYouthCaveToken";
var token = null; try { token = localStorage.getItem(TK); } catch (e) {}
var ME = { role: "youth", money: "all", today: "" };
var D = {};            // data from api/all
var cur = "home";
var fileUrls = {};
var $ = function (id) { return document.getElementById(id); };
var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var MONTHS_L = ["January","February","March","April","May","June","July","August","September","October","November","December"];
var DUTIES = ["Ushering","Media","Drama","Choir","Prayer","Sanitation","Welcome","Bible reading"];
var SILH = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#1B2A6B"/><circle cx="50" cy="38" r="17" fill="#dfe5f7"/><path d="M18 92c2-19 15-31 32-31s30 12 32 31z" fill="#dfe5f7"/><rect y="94" width="100" height="6" fill="#0A8F4A"/></svg>';

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function naira(n) { n = Number(n) || 0; return "\u20A6" + n.toLocaleString("en-NG", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
function pdate(s) { var p = String(s || "").split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function fdate(s, long) { if (!s) return ""; var d = pdate(s); return d.toLocaleDateString("en-GB", { weekday: long ? "long" : "short", day: "numeric", month: long ? "long" : "short", year: "numeric", timeZone: "UTC" }); }
function ftime(t) { if (!t) return ""; var p = t.split(":"), h = +p[0], ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + ":" + p[1] + " " + ap; }
function addDays(s, n) { var d = pdate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekStart(s) { var d = pdate(s); var w = (d.getUTCDay() + 6) % 7; return addDays(s, -w); } // Monday
function isExco() { return ME.role === "exco"; }
function canMoney() { return isExco() || ME.money === "all"; }
function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("on"); }, 2600); }

function api(path, body, raw) {
  var opt = { headers: { authorization: "Bearer " + (token || "") } };
  if (body !== undefined) {
    opt.method = "POST";
    if (raw) { opt.body = body; opt.headers["content-type"] = raw; }
    else { opt.body = JSON.stringify(body); opt.headers["content-type"] = "application/json"; }
  }
  return fetch(path, opt).then(function (r) {
    if (r.status === 401 && path !== "api/login") { signOut(true); throw new Error("auth"); }
    return r.json();
  }).catch(function (e) { if (e.message === "auth") throw e; return { ok: false, error: "Network problem. Please check your connection and try again." }; });
}

// ---------- login ----------
$("showpw").addEventListener("change", function () { $("pw").type = this.checked ? "text" : "password"; });
// Welcome voice: plays once after each successful password login (not on reloads, not on failed tries).
// Primed silently inside the tap so iPhone allows the later play; Exco can switch it off in Settings.
var WV = { a: null, want: false, pend: false };
function wvEl() {
  if (!WV.a) { try { var a = new Audio("bg/welcome.mp3?v=1"); a.preload = "auto"; a.load(); WV.a = a; } catch (e) { WV.a = null; } }
  return WV.a;
}
function wvPrime() {
  var a = wvEl(); if (!a) return; WV.want = false;
  try {
    a.muted = true; var p = a.play();
    if (p && p.then) p.then(function () { if (!WV.want) { a.pause(); try { a.currentTime = 0; } catch (e) {} a.muted = false; } }, function () { a.muted = false; });
  } catch (e) { a.muted = false; }
}
function wvStop() { var a = WV.a; WV.want = false; if (!a) return; try { a.pause(); a.currentTime = 0; a.muted = false; } catch (e) {} }
function wvPlay() {
  var a = wvEl(); if (!a) return; WV.want = true;
  try {
    a.muted = false; a.volume = 0.9; try { a.currentTime = 0; } catch (e) {}
    var p = a.play(); if (p && p.catch) p.catch(function () {});
  } catch (e) {}
}
$("lform").addEventListener("submit", function (e) {
  e.preventDefault();
  var b = $("lbtn"); b.disabled = true; $("lerr").textContent = "";
  wvPrime();
  fetch("api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("pw").value }) })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      b.disabled = false;
      if (!r.ok) { wvStop(); $("lerr").textContent = r.error || "Could not sign in."; return; }
      token = r.token; try { localStorage.setItem(TK, token); } catch (e2) {}
      ME.voice = r.voice !== false;
      if (ME.voice) WV.pend = true; else wvStop();
      $("pw").value = ""; cur = "home"; start();
    }).catch(function () { wvStop(); b.disabled = false; $("lerr").textContent = "Network problem. Please try again."; });
});
function signOut(expired) {
  token = null; try { localStorage.removeItem(TK); } catch (e) {}
  $("app").hidden = true; $("login").hidden = false; closeModal(); wvEl();
  if (expired) $("lerr").textContent = "Please sign in again.";
}
$("logout").addEventListener("click", function () { api("api/logout", {}).catch(function () {}); signOut(false); });

// ---------- boot ----------
var TABS = [
  ["home", "Home"], ["notices", "Announcements"], ["polls", "Polls"], ["plans", "Plans"], ["events", "Events"], ["roster", "Duty roster"], ["minutes", "Minutes"],
  ["offering", "Offering"], ["contrib", "Contributions"], ["expenses", "Expenses"], ["exco", "Exco"], ["jobs", "Jobs"], ["suggest", "Suggestion box"], ["settings", "Settings"]
];
function visibleTabs() { return TABS.filter(function (t) { if ((t[0] === "offering" || t[0] === "contrib" || t[0] === "expenses") && !canMoney()) return false; if (t[0] === "settings" && !isExco()) return false; return true; }); }
function drawTabs() {
  $("tabs").innerHTML = visibleTabs().map(function (t) {
    var dot = t[0] === "suggest" && isExco() && D.new_suggestions ? '<span class="dot">' + D.new_suggestions + "</span>" : "";
    return '<button class="tab" type="button" data-tab="' + t[0] + '"' + (t[0] === cur ? ' aria-current="page"' : "") + ">" + t[1] + dot + "</button>";
  }).join("");
}
$("tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) go(b.getAttribute("data-tab")); });
function go(t) {
  if (t === "plans") PN.open = 0;
  cur = t; TX = true; try { history.replaceState(null, "", "#" + t); } catch (e) {}
  drawTabs(); render();
  var a = document.querySelector('.tab[aria-current="page"]'); if (a && a.scrollIntoView) a.scrollIntoView({ block: "nearest", inline: "center" });
  window.scrollTo(0, 0);
}
function load() {
  return api("api/all?voter=" + voterId()).then(function (r) {
    if (!r.ok) { $("main").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    D = r; ME.role = r.role; ME.money = r.money; ME.today = r.today; ME.base = r.base; ME.voice = r.voice !== false;
    $("roleLbl").textContent = isExco() ? "Exco" : "Member";
    if (!visibleTabs().some(function (t) { return t[0] === cur; })) cur = "home";
    drawTabs(); render();
    // Welcome voice waits until the page content has loaded and drawn.
    if (WV.pend) { WV.pend = false; if (ME.voice) setTimeout(function () { requestAnimationFrame(function () { wvPlay(); }); }, 400); else wvStop(); }
  });
}
// Welcome video: plays all clips one after the other; the next starts as soon as one finishes, then repeats.
var BG_VIDS = ["youth_bg", "youth_bg_2", "youth_bg_3", "youth_bg_4", "youth_bg_1"];
var BG_I = Math.floor(Date.now() / 86400000) % BG_VIDS.length;
function bgPick() { return BG_VIDS[BG_I]; }
function bgNext() {
  var v = document.querySelector("video.hero-bg");
  if (!v) return;
  BG_I = (BG_I + 1) % BG_VIDS.length;
  var want = BG_VIDS[BG_I];
  v.setAttribute("data-bg", want);
  v.poster = "bg/" + want + "_poster.jpg";
  v.src = "bg/" + want + ".mp4";
  try { v.load(); var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
}
function bgStart() {
  if (window.BG_ON) return; window.BG_ON = true;
  document.addEventListener("ended", function (e) { if (e.target && e.target.classList && e.target.classList.contains("hero-bg")) bgNext(); }, true);
}
function start() {
  $("login").hidden = true; $("app").hidden = false;
  bgStart();
  routeHash();
  $("main").innerHTML = '<p class="muted">Loading...</p>';
  load().catch(function () {});
}
function refresh() { return load().catch(function () {}); }

// ---------- deep links ----------
// #announcements/5, #polls/8, #events/3, #roster/2026-11-22, #jobs (older #notices/5 also works).
// Opened logged-out, the hash survives the login and the app lands on the item.
var ALIAS = { announcements: "notices", announcement: "notices", notices: "notices", polls: "polls", poll: "polls", events: "events", event: "events", roster: "roster", duty: "roster", jobs: "jobs" };
var ITEMPRE = { notices: "ann-", events: "ev-", polls: "poll-", roster: "rday-" };
var PEND = null;
function routeHash() {
  var h = ""; try { h = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { h = (location.hash || "").slice(1); }
  var p = h.split("/"), t = ALIAS[p[0]] || p[0];
  if (!t || !TABS.some(function (x) { return x[0] === t; })) return false;
  cur = t; TX = true;
  PEND = p[1] && /^[\w-]{1,40}$/.test(p[1]) && ITEMPRE[t] ? { tab: t, id: p[1] } : null;
  return true;
}
function applyPending() {
  if (!PEND || PEND.tab !== cur) return;
  var el = document.querySelector('#main [data-item="' + ITEMPRE[cur] + PEND.id + '"]');
  PEND = null;
  if (!el) return;
  var d = el.closest("details"); if (d) { d.open = true; if (d.id === "plPast") PL.pastOpen = true; }
  setTimeout(function () {
    el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    el.classList.remove("hl"); void el.offsetWidth; el.classList.add("hl");
    clearTimeout(applyPending.t); applyPending.t = setTimeout(function () { el.classList.remove("hl"); }, 2600);
  }, 280);
}
window.addEventListener("hashchange", function () {
  if (!token || $("app").hidden) return;
  if (routeHash()) { closeModal(); drawTabs(); render(); window.scrollTo(0, 0); }
});

// ---------- files ----------
function fileSrc(key) {
  if (fileUrls[key]) return Promise.resolve(fileUrls[key]);
  return fetch("api/file/" + key, { headers: { authorization: "Bearer " + token } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
    .then(function (b) { fileUrls[key] = URL.createObjectURL(b); return fileUrls[key]; });
}
function hydrateFiles(root) {
  (root || document).querySelectorAll("[data-file]").forEach(function (el) {
    var k = el.getAttribute("data-file"); el.removeAttribute("data-file");
    fileSrc(k).then(function (u) {
      if (el.tagName === "IMG") el.src = u; else el.href = u;
    }).catch(function () { if (el.tagName === "IMG") el.replaceWith(document.createTextNode("")); });
  });
}
function fileBlock(key, label) {
  if (!key) return "";
  if (/\.pdf$/.test(key)) return '<a class="btn ghost sm fbtn" target="_blank" rel="noopener" data-file="' + esc(key) + '" href="#">Open ' + esc(label || "PDF") + "</a>";
  return '<a target="_blank" rel="noopener" data-file="' + esc(key) + '" href="#"><img class="thumb" alt="' + esc(label || "Photo") + '" data-file="' + esc(key) + '"></a>';
}
function shrink(file) {
  return new Promise(function (res) {
    if (!/^image\/(jpeg|png|webp|heic|heif)/i.test(file.type) || file.size < 400 * 1024) return res(file);
    var img = new Image(), u = URL.createObjectURL(file);
    img.onload = function () {
      var M = 1600, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, M / Math.max(w, h));
      var c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(function (b) { res(b && b.size < file.size ? b : file); }, "image/jpeg", 0.85);
    };
    img.onerror = function () { URL.revokeObjectURL(u); res(file); };
    img.src = u;
  });
}
function uploadFile(file) {
  return shrink(file).then(function (b) {
    var type = b.type || file.type;
    if (/heic|heif/i.test(type)) type = "image/jpeg";
    return api("api/upload", b, type);
  });
}

// ---------- modal form ----------
var FORMS = {
  announcements: { title: "announcement", f: [["title", "Title", "text", 1], ["body", "Message", "long"], ["date", "Date", "date", 1], ["pinned", "Pin this to the top", "bool"], ["_evh", "Event date and time (optional). Fill these in to show a Remind Me button, so youth can add it to their calendar with alerts 1 hour before, 30 minutes before and at the start.", "hint"], ["ev_date", "Event date", "date"], ["ev_time", "Start time", "time"], ["ev_end", "End time (optional, 1 hour if blank)", "time"], ["ev_loc", "Location or online link (optional)", "text", 0, "Church hall, or a Zoom / Google Meet link"]] },
  events: { title: "event", f: [["title", "Event title", "text", 1], ["date", "Date", "date", 1], ["time", "Time", "time"], ["venue", "Venue", "text"], ["description", "Description", "long"], ["photo", "Flyer (optional)", "image"]] },
  offerings: { title: "offering record", f: [["date", "Date", "date", 1], ["title", "Service or meeting", "text", 1, "Sunday service"], ["amount", "Amount (\u20A6)", "money", 1], ["counted_by", "Counted by", "text", 0, "Names of the counters"], ["notes", "Notes", "long"], ["photo", "Photo or receipt (optional)", "doc"]] },
  minutes: { title: "meeting", f: [["date", "Meeting date", "date", 1], ["title", "Meeting", "text", 0, "Youth Exco meeting"], ["attendees", "Attendees", "long", 0, "Who was there"], ["body", "Minutes", "long", 0, "What was discussed"]] },
  actions: { title: "decision or action item", f: [["what", "Decision or action", "text", 1], ["who", "Who is responsible", "text"], ["due", "Due date", "date"], ["done", "Done", "bool"]] },
  roster: { title: "duty", f: [["date", "Date", "date", 1], ["duty", "Duty", "duty", 1], ["person", "Assigned to", "text"]] },
  exco: { title: "Exco member", f: [["name", "Name", "text", 1], ["role", "Role", "text", 1], ["phone", "Phone (optional)", "tel"], ["photo", "Photo", "image"], ["sort", "Order on the page (lower shows first)", "num"]] },
  members: { title: "member", f: [["name", "Member name", "text", 1], ["sort", "Order (optional, lower shows first)", "num"]] },
  expenses: { title: "expense", f: [["date", "Date", "date", 1], ["item", "Item or description", "text", 1, "Bus hire to youth rally"], ["category", "Category (pick one or type your own)", "cat", 1], ["amount", "Amount (\u20A6)", "money", 1], ["paid_to", "Paid to (optional)", "text", 0, "Shop, driver or vendor"], ["approved_by", "Approved by / paid by (optional)", "text", 0, "Name"], ["notes", "Notes (optional)", "long"], ["receipt", "Receipt photo or PDF (optional)", "doc"]] }
};
var EXP_CATS = ["Transport", "Refreshments", "Events", "Welfare", "Printing & Publicity", "Media & Equipment", "Outreach", "Other"];
var modalSubmit = null;
function openModal(title, html, onSubmit) {
  $("mh").textContent = title; $("mform").innerHTML = html; modalSubmit = onSubmit;
  $("modal").hidden = false; document.body.style.overflow = "hidden";
  var f = $("mform").querySelector("input:not([type=hidden]):not([type=checkbox]),textarea,select"); if (f && window.innerWidth > 700) f.focus();
}
function closeModal() { $("modal").hidden = true; document.body.style.overflow = ""; modalSubmit = null; }
$("mclose").addEventListener("click", closeModal);
$("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
$("mform").addEventListener("submit", function (e) { e.preventDefault(); if (modalSubmit) modalSubmit(); });

function fieldHtml(fd, v) {
  var k = fd[0], lab = fd[1], t = fd[2], req = fd[3], ph = fd[4] || "";
  var id = "f_" + k, rq = req ? " required" : "", val = v == null ? "" : v;
  if (t === "hint") return '<p class="hint fsec">' + esc(lab) + "</p>";
  if (t === "bool") return '<label class="ck"><input type="checkbox" id="' + id + '"' + (val ? " checked" : "") + "> " + esc(lab) + "</label>";
  var h = '<label for="' + id + '">' + esc(lab) + (req ? "" : "") + "</label>";
  if (t === "long") return h + '<textarea id="' + id + '" placeholder="' + esc(ph) + '"' + rq + ">" + esc(val) + "</textarea>";
  if (t === "image" || t === "doc") {
    return h + '<input type="file" id="' + id + '" accept="' + (t === "doc" ? "image/*,application/pdf" : "image/*") + '"><input type="hidden" id="' + id + '_key" value="' + esc(val) + '">' +
      '<div class="fprev" id="' + id + '_prev">' + (val ? (/\.pdf$/.test(val) ? "PDF attached" : '<img alt="" data-file="' + esc(val) + '">') + ' <button type="button" class="btn ghost sm" data-clear="' + id + '">Remove</button>' : "") + "</div>";
  }
  if (t === "cat") { var cl = EXP_CATS.slice(); ((EX && EX.used_categories) || []).forEach(function (c) { if (c && cl.indexOf(c) < 0) cl.push(c); });
    return h + '<input id="' + id + '" list="catlist" maxlength="40" autocomplete="off" value="' + esc(val) + '"' + rq + ' placeholder="Transport"><datalist id="catlist">' + cl.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + "</datalist>"; }
  if (t === "duty") return h + '<input id="' + id + '" list="dutylist" value="' + esc(val) + '"' + rq + ' placeholder="Ushering"><datalist id="dutylist">' + DUTIES.map(function (d) { return "<option value=\"" + d + "\">"; }).join("") + "</datalist>";
  var type = t === "date" ? "date" : t === "time" ? "time" : t === "tel" ? "tel" : t === "num" ? "number" : "text";
  var extra = t === "money" ? ' inputmode="decimal" placeholder="25000"' : (ph ? ' placeholder="' + esc(ph) + '"' : "");
  return h + '<input type="' + type + '" id="' + id + '" value="' + esc(val) + '"' + rq + extra + ">";
}
function wireFiles() {
  $("mform").querySelectorAll("input[type=file]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var prev = $(inp.id + "_prev"); prev.textContent = "Uploading...";
      uploadFile(f).then(function (r) {
        if (!r.ok) { prev.innerHTML = '<span class="err">' + esc(r.error) + "</span>"; return; }
        $(inp.id + "_key").value = r.key;
        prev.innerHTML = (/\.pdf$/.test(r.key) ? "PDF attached" : '<img alt="" data-file="' + r.key + '">') + ' <button type="button" class="btn ghost sm" data-clear="' + inp.id + '">Remove</button>';
        hydrateFiles(prev);
      });
    });
  });
  hydrateFiles($("mform"));
}
$("mform").addEventListener("click", function (e) {
  var b = e.target.closest("[data-clear]"); if (!b) return;
  var id = b.getAttribute("data-clear"); $(id + "_key").value = ""; $(id).value = ""; $(id + "_prev").innerHTML = "";
});
function readForm(sec) {
  var o = {};
  FORMS[sec].f.forEach(function (fd) {
    var k = fd[0], t = fd[2], el = $("f_" + k);
    if (t === "hint") return;
    if (t === "bool") o[k] = el.checked; else if (t === "image" || t === "doc") o[k] = $("f_" + k + "_key").value; else o[k] = el.value;
  });
  return o;
}
function editRow(sec, row, extra, after) {
  var F = FORMS[sec]; row = row || {};
  var html = F.f.map(function (fd) { return fieldHtml(fd, row[fd[0]]); }).join("") +
    '<p class="err" id="merr" role="alert"></p><div class="mf-actions">' +
    (row.id ? '<button type="button" class="btn danger" id="mdel">Delete</button>' : "") +
    '<button type="submit" class="btn pri" id="msave">' + (row.id ? "Save changes" : "Add") + "</button></div>";
  openModal((row.id ? "Edit " : "Add ") + F.title, html, function () {
    var body = readForm(sec); if (row.id) body.id = row.id; if (extra) for (var k in extra) body[k] = extra[k];
    $("msave").disabled = true;
    api("api/save/" + sec, body).then(function (r) {
      $("msave").disabled = false;
      if (!r.ok) { $("merr").textContent = r.error; return; }
      closeModal(); toast(row.id ? "Saved" : "Added");
      var done = (after || refresh)();
      if (!row.id && r.id && isExco() && (sec === "announcements" || sec === "events" || sec === "roster")) {
        var nb = body; nb.id = r.id;
        Promise.resolve(done).then(function () {
          if (sec === "roster") return openShare("roster", nb.date, true);
          openShare(sec === "events" ? "event" : "announcement", find(D[sec], r.id) || nb, true);
        });
      }
    }).catch(function () {});
  });
  wireFiles();
  if (row.id) $("mdel").addEventListener("click", function () { delRow(sec, row.id, after); });
}
function delRow(sec, id, after) {
  if (!confirm("Delete this " + FORMS[sec].title + "? This cannot be undone.")) return;
  api("api/delete/" + sec, { id: id }).then(function (r) {
    if (!r.ok) { toast(r.error); return; }
    closeModal(); toast("Deleted"); (after || refresh)();
  }).catch(function () {});
}
function find(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }

// ---------- render ----------
function head(title, sub, btn) {
  return '<div class="ph"><h2>' + title + "</h2>" + (btn && isExco() ? btn : "") + (sub ? "<p>" + sub + "</p>" : "") + "</div>";
}
function addBtn(sec, label) { return '<button class="btn grn sm" type="button" data-add="' + sec + '">' + label + "</button>"; }
function editBtns(sec, id) { return isExco() ? '<div class="acts">' + (sec === "announcements" ? shareBtn("announcement", id) : sec === "events" ? shareBtn("event", id) : "") + '<button class="btn ghost sm" type="button" data-edit="' + sec + '" data-id="' + id + '">Edit</button><button class="btn danger sm" type="button" data-del="' + sec + '" data-id="' + id + '">Delete</button></div>' : ""; }
var R = {};
function kickHeroVideo() {
  var v = document.querySelector(".hero-bg"); if (!v) return;
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = false;
  v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", ""); v.removeAttribute("controls");
  try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
}
document.addEventListener("touchstart", kickHeroVideo, { passive: true });
document.addEventListener("click", kickHeroVideo);
document.addEventListener("visibilitychange", function () { if (!document.hidden) kickHeroVideo(); });
window.addEventListener("pageshow", kickHeroVideo);

var TICON = {"notices": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z\"/><path d=\"M15.5 8.5a5 5 0 0 1 0 7\"/><path d=\"M18.5 5.5a9 9 0 0 1 0 13\"/></svg>", "polls": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 20V10\"/><path d=\"M10 20V4\"/><path d=\"M16 20v-7\"/><path d=\"M21 20H3\"/></svg>", "plans": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4V2.8h6V4\"/><path d=\"M8.5 11l1.8 1.8 3.4-3.4\"/><path d=\"M8.5 16.5h7\"/></svg>", "events": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2\"/><path d=\"M3.5 10h17\"/><path d=\"M8 3v4M16 3v4\"/><path d=\"M8 14h2M14 14h2M8 17h2\"/></svg>", "roster": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"4\" y=\"3.5\" width=\"16\" height=\"17\" rx=\"2\"/><path d=\"M8 8h8M8 12h8M8 16h5\"/></svg>", "minutes": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z\"/><path d=\"M14 3v5h5\"/><path d=\"M9 13h6M9 17h4\"/></svg>", "offering": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3.5\" y=\"9\" width=\"17\" height=\"11.5\" rx=\"1.5\"/><path d=\"M2.5 9h19V6.5h-19z\"/><path d=\"M12 6.5v14\"/><path d=\"M12 6.5C10.5 3 7 3.3 7.3 5.3 7.5 6.6 12 6.5 12 6.5zM12 6.5c1.5-3.5 5-3.2 4.7-1.2-.2 1.3-4.7 1.2-4.7 1.2z\"/></svg>", "contrib": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 14h3l3.5 1.5h3a1.5 1.5 0 0 1 0 3H9\"/><path d=\"M12.5 18.5l5-2.2a1.6 1.6 0 0 1 1.8 2.5L14 22H6l-3-2\"/><circle cx=\"14\" cy=\"7\" r=\"4\"/><path d=\"M14 5.5v3\"/></svg>", "expenses": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 2.5h12v19l-2.5-1.6L13 21.5l-2.5-1.6L8.5 21.5 6 19.9z\"/><path d=\"M9 7.5h6M9 11h6M9 14.5h4\"/></svg>", "exco": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"9\" cy=\"8\" r=\"3.2\"/><path d=\"M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6\"/><circle cx=\"17\" cy=\"9\" r=\"2.5\"/><path d=\"M16.5 14.1A5 5 0 0 1 21 19\"/></svg>", "jobs": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"7\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2\"/><path d=\"M3 12.5h18\"/><path d=\"M11 12.5v1.5h2v-1.5\"/></svg>", "suggest": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9 18h6\"/><path d=\"M10 21h4\"/><path d=\"M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z\"/></svg>", "settings": "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/></svg>"};
// Verse of the week: KJV text (checked list from the parish homepage + bible-api.com KJV), picked by ISO week of the Lagos date.
var VW = [{"t": "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.", "r": "Jeremiah 29:11"}, {"t": "I can do all things through Christ which strengtheneth me.", "r": "Philippians 4:13"}, {"t": "Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", "r": "Joshua 1:9"}, {"t": "Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.", "r": "Proverbs 3:5-6"}, {"t": "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.", "r": "Isaiah 40:31"}, {"t": "And be not conformed to this world: but be ye transformed by the renewing of your mind, that ye may prove what is that good, and acceptable, and perfect, will of God.", "r": "Romans 12:2"}, {"t": "Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.", "r": "Matthew 5:16"}, {"t": "Thy word is a lamp unto my feet, and a light unto my path.", "r": "Psalm 119:105"}, {"t": "For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.", "r": "2 Timothy 1:7"}, {"t": "Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.", "r": "Isaiah 41:10"}, {"t": "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.", "r": "Matthew 6:33"}, {"t": "Commit thy way unto the LORD; trust also in him; and he shall bring it to pass.", "r": "Psalm 37:5"}, {"t": "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.", "r": "Romans 8:28"}, {"t": "Wherewithal shall a young man cleanse his way? by taking heed thereto according to thy word.", "r": "Psalm 119:9"}, {"t": "These things I have spoken unto you, that in me ye might have peace. In the world ye shall have tribulation: but be of good cheer; I have overcome the world.", "r": "John 16:33"}, {"t": "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", "r": "Galatians 6:9"}, {"t": "God is our refuge and strength, a very present help in trouble.", "r": "Psalm 46:1"}, {"t": "Finally, my brethren, be strong in the Lord, and in the power of his might.", "r": "Ephesians 6:10"}, {"t": "Commit thy works unto the LORD, and thy thoughts shall be established.", "r": "Proverbs 16:3"}, {"t": "Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.", "r": "John 14:27"}, {"t": "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.", "r": "2 Corinthians 5:17"}, {"t": "Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.", "r": "Philippians 4:6"}, {"t": "The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?", "r": "Psalm 27:1"}, {"t": "If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.", "r": "James 1:5"}, {"t": "Ye are the light of the world. A city that is set on an hill cannot be hid.", "r": "Matthew 5:14"}, {"t": "Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee.", "r": "Isaiah 26:3"}, {"t": "Nay, in all these things we are more than conquerors through him that loved us.", "r": "Romans 8:37"}, {"t": "Create in me a clean heart, O God; and renew a right spirit within me.", "r": "Psalm 51:10"}, {"t": "Flee also youthful lusts: but follow righteousness, faith, charity, peace, with them that call on the Lord out of a pure heart.", "r": "2 Timothy 2:22"}, {"t": "It is of the LORD’S mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.", "r": "Lamentations 3:22-23"}, {"t": "The thief cometh not, but for to steal, and to kill, and to destroy: I am come that they might have life, and that they might have it more abundantly.", "r": "John 10:10"}, {"t": "Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.", "r": "Deuteronomy 31:6"}, {"t": "What time I am afraid, I will trust in thee.", "r": "Psalm 56:3"}, {"t": "But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, Meekness, temperance: against such there is no law.", "r": "Galatians 5:22-23"}, {"t": "Now unto him that is able to do exceeding abundantly above all that we ask or think, according to the power that worketh in us,", "r": "Ephesians 3:20"}, {"t": "Arise, shine; for thy light is come, and the glory of the LORD is risen upon thee.", "r": "Isaiah 60:1"}, {"t": "I will instruct thee and teach thee in the way which thou shalt go: I will guide thee with mine eye.", "r": "Psalm 32:8"}, {"t": "I am the vine, ye are the branches: He that abideth in me, and I in him, the same bringeth forth much fruit: for without me ye can do nothing.", "r": "John 15:5"}, {"t": "Looking unto Jesus the author and finisher of our faith; who for the joy that was set before him endured the cross, despising the shame, and is set down at the right hand of the throne of God.", "r": "Hebrews 12:2"}, {"t": "Being confident of this very thing, that he which hath begun a good work in you will perform it until the day of Jesus Christ:", "r": "Philippians 1:6"}, {"t": "What shall we then say to these things? If God be for us, who can be against us?", "r": "Romans 8:31"}, {"t": "Let all your things be done with charity.", "r": "1 Corinthians 16:14"}, {"t": "Then he said unto them, Go your way, eat the fat, and drink the sweet, and send portions unto them for whom nothing is prepared: for this day is holy unto our Lord: neither be ye sorry; for the joy of the LORD is your strength.", "r": "Nehemiah 8:10"}, {"t": "He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?", "r": "Micah 6:8"}, {"t": "Delight thyself also in the LORD; and he shall give thee the desires of thine heart.", "r": "Psalm 37:4"}, {"t": "Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.", "r": "1 Timothy 4:12"}, {"t": "Now faith is the substance of things hoped for, the evidence of things not seen.", "r": "Hebrews 11:1"}, {"t": "Casting all your care upon him; for he careth for you.", "r": "1 Peter 5:7"}, {"t": "And if it seem evil unto you to serve the LORD, choose you this day whom ye will serve; whether the gods which your fathers served that were on the other side of the flood, or the gods of the Amorites, in whose land ye dwell: but as for me and my house, we will serve the LORD.", "r": "Joshua 24:15"}, {"t": "A friend loveth at all times, and a brother is born for adversity.", "r": "Proverbs 17:17"}, {"t": "Come unto me, all ye that labour and are heavy laden, and I will give you rest.", "r": "Matthew 11:28"}, {"t": "And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ’s sake hath forgiven you.", "r": "Ephesians 4:32"}, {"t": "Therefore, my beloved brethren, be ye stedfast, unmovable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.", "r": "1 Corinthians 15:58"}, {"t": "Thou wilt shew me the path of life: in thy presence is fulness of joy; at thy right hand there are pleasures for evermore.", "r": "Psalm 16:11"}, {"t": "When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee: when thou walkest through the fire, thou shalt not be burned; neither shall the flame kindle upon thee.", "r": "Isaiah 43:2"}, {"t": "Jesus Christ the same yesterday, and to day, and for ever.", "r": "Hebrews 13:8"}, {"t": "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.", "r": "Acts 1:8"}];

// ---------- look: motion, count-up, tiles, countdown, verse ----------
var TX = true; // animate the next render (first load and every tab switch)
function reduceMotion() { try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
var CU = {}; // last value shown per counter key, so 15-second poll refreshes don't re-run the count
function cuFmt(el, v) { return el.getAttribute("data-cuf") === "n" ? naira(v) : String(Math.round(v)); }
function countUp(root) {
  var els = (root || document).querySelectorAll("[data-cu]"), rm = reduceMotion();
  Array.prototype.forEach.call(els, function (el) {
    var to = Number(el.getAttribute("data-cu")) || 0, key = el.getAttribute("data-cuk");
    if (key && CU[key] === to) { el.textContent = cuFmt(el, to); return; }
    if (key) CU[key] = to;
    if (rm || to <= 0) { el.textContent = cuFmt(el, to); return; }
    var t0 = null, dur = to > 20 ? 900 : 650;
    el.textContent = cuFmt(el, 0);
    function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = cuFmt(el, k < 1 ? Math.floor(to * e) : to);
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
function cuNum(n, key) { n = Number(n) || 0; return '<span class="cu" data-cu="' + n + '"' + (key ? ' data-cuk="' + key + '"' : "") + ">" + n + "</span>"; }

// tiles: one per tab the current role can see (same list as the tab bar)
function tileInfo(id) {
  var n = 0, cap = "", pill = "";
  if (id === "notices") { n = (D.announcements || []).length; var pc = (D.announcements || []).filter(function (a) { return a.pinned; }).length; cap = pc ? pc + " pinned" : "Latest news"; pill = n ? cuNum(n) + " posted" : ""; if (pill) cap = ""; }
  else if (id === "polls") { n = (D.polls_open || []).length; pill = n ? cuNum(n) + " open" : ""; cap = "Have your say"; }
  else if (id === "plans") { var s = D.plans_sum || {}; pill = s.in_progress ? cuNum(s.in_progress) + " in progress" : (s.total ? cuNum(s.total) + " plan" + (s.total === 1 ? "" : "s") : ""); cap = "Youth department"; }
  else if (id === "events") { n = (D.events || []).filter(function (e) { return e.date >= ME.today; }).length; pill = n ? cuNum(n) + " coming up" : ""; cap = "None coming up"; }
  else if (id === "roster") { cap = rosterGroups().week.length ? "This week is set" : "Not set this week"; }
  else if (id === "minutes") { n = (D.actions || []).filter(function (a) { return !a.done; }).length; pill = n ? cuNum(n) + " open action" + (n === 1 ? "" : "s") : ""; cap = "Meetings & decisions"; }
  else if (id === "offering") cap = "Sunday records";
  else if (id === "contrib") cap = "Who gave what";
  else if (id === "expenses") cap = "Spending records";
  else if (id === "exco") cap = "Meet the Exco";
  else if (id === "jobs") { pill = JB.loaded && JB.rows.length ? cuNum(JB.rows.length) + " listed" : ""; cap = "Updated daily"; }
  else if (id === "suggest") { n = isExco() ? (D.new_suggestions || 0) : 0; pill = n ? cuNum(n) + " new" : ""; cap = "Share an idea"; }
  else if (id === "settings") cap = "Passwords & options";
  return pill ? '<span class="tl-b" id="tlb-' + id + '">' + pill + "</span>" : '<span class="tl-c" id="tlb-' + id + '">' + esc(cap) + "</span>";
}
function tilesHTML() {
  var t = visibleTabs().filter(function (x) { return x[0] !== "home"; });
  return '<nav class="tiles" aria-label="Youth Cave sections">' + t.map(function (x, i) {
    return '<button type="button" class="tile" data-go="' + x[0] + '" style="--j:' + i + '"><span class="tl-i">' + (TICON[x[0]] || "") + '</span><span class="tl-n' + (x[1].length > 12 ? " lg" : "") + '">' + x[1] + "</span>" + tileInfo(x[0]) + "</button>";
  }).join("") + "</nav>";
}
function homeJobsCount() {
  if (JB.loaded) return;
  api("api/jobs").then(function (r) {
    if (!r || !r.ok) return;
    if (!JB.loaded) JB = { rows: r.rows || [], updated: r.updated || 0, loaded: true };
    var el = $("tlb-jobs"); if (cur !== "home" || !el || !JB.rows.length) return;
    var w = document.createElement("span"); w.innerHTML = tileInfo("jobs"); var nb = w.firstChild;
    el.parentNode.replaceChild(nb, el); countUp(nb);
  }).catch(function () {});
}

// countdown: soonest upcoming dated announcement or event (Lagos time)
var CDN = { timer: 0, item: null, state: "" };
function cdItems() {
  var now = Date.now(), out = [];
  (D.announcements || []).forEach(function (a) {
    if (!a.ev_date || !a.ev_time) return;
    var s = lagosUtc(a.ev_date, a.ev_time), e = a.ev_end && a.ev_end > a.ev_time ? lagosUtc(a.ev_date, a.ev_end) : s + 3600000;
    out.push({ kind: "announcement", x: a, title: a.title, date: a.ev_date, time: a.ev_time, endT: a.ev_end && a.ev_end > a.ev_time ? a.ev_end : "", loc: a.ev_loc || "", start: s, end: e });
  });
  (D.events || []).forEach(function (ev) {
    if (!ev.date) return;
    var s = lagosUtc(ev.date, ev.time || "00:00"), e = ev.time ? s + 3600000 : s + 86400000;
    out.push({ kind: "event", x: ev, title: ev.title, date: ev.date, time: ev.time || "", endT: "", loc: ev.venue || "", start: s, end: e });
  });
  return out.filter(function (c) { return c.end > now; }).sort(function (a, b) { return a.start - b.start; });
}
function cdState(c) { return !c ? "" : (Date.now() >= c.start ? "now" : "soon"); }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function cdHTML() {
  var c = cdItems()[0]; CDN.item = c || null; CDN.state = cdState(c);
  if (!c) return '<section class="cd" id="cdCard" hidden></section>';
  var when = fdate(c.date, true) + (c.time ? ", " + ftime(c.time) : "") + (c.endT ? " to " + ftime(c.endT) : "");
  var h = '<section class="cd" id="cdCard" aria-label="Next event countdown"><div class="cd-hd"><span class="cd-l">' + (CDN.state === "now" ? "Happening now" : "Next event") + '</span><h3 class="cd-t">' + esc(c.title) + '</h3><p class="cd-w">' + esc(when) + (c.loc ? " &middot; " + esc(c.loc) : "") + "</p></div>";
  if (CDN.state === "now") h += '<p class="cd-now"><span class="cd-dot" aria-hidden="true"></span>Happening now</p>';
  else h += '<div class="cd-bx" role="timer" aria-live="off">' + [["cdD", "days"], ["cdH", "hrs"], ["cdM", "mins"], ["cdS", "secs"]].map(function (u) { return '<div><b id="' + u[0] + '">00</b><small>' + u[1] + "</small></div>"; }).join("") + "</div>";
  h += '<div class="cd-ft">' + remindBtn(c.kind, c.x) + '<button type="button" class="btn ghost sm cd-more" data-go="' + (c.kind === "announcement" ? "notices" : "events") + '">Details</button></div>';
  return h + "</section>";
}
function cdTick() {
  var el = $("cdCard"); if (!el) { clearInterval(CDN.timer); CDN.timer = 0; return; }
  var c = CDN.item;
  if (c && Date.now() >= c.end || cdState(c) !== CDN.state) { // started or ended: redraw the card (rolls to the next item)
    var w = document.createElement("div"); w.innerHTML = cdHTML(); el.parentNode.replaceChild(w.firstChild, el); el = $("cdCard"); c = CDN.item;
    if (!c) return;
  }
  if (!c || CDN.state !== "soon") return;
  var ms = Math.max(0, c.start - Date.now()), s = Math.floor(ms / 1000);
  var d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
  var v = [["cdD", String(d)], ["cdH", pad2(hh)], ["cdM", pad2(mm)], ["cdS", pad2(ss)]];
  v.forEach(function (p) { var b = $(p[0]); if (b && b.textContent !== p[1]) b.textContent = p[1]; });
}
function startCountdown() {
  clearInterval(CDN.timer); CDN.timer = 0;
  if (!$("cdCard")) return;
  cdTick(); CDN.timer = setInterval(cdTick, 1000);
}

// verse of the week (changes every Monday, ISO week of the Lagos date)
function lagosToday() { return ME.today || new Date(Date.now() + 3600000).toISOString().slice(0, 10); }
function weekVerse() { var w = isoWeekN(lagosToday()); return VW[(w - 1) % VW.length]; }
function isoWeekN(ymd) {
  var d = pdate(ymd), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  var y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((d - y0) / 86400000 / 7);
}
function verseHTML() {
  var v = weekVerse(); if (!v) return "";
  return '<section class="vw" aria-label="Verse of the week"><span class="vw-l">Verse of the week</span><blockquote class="vw-t">\u201C' + esc(v.t) + '\u201D</blockquote><div class="vw-f"><p class="vw-r">' + esc(v.r) + ' <span>KJV</span></p><button type="button" class="btn ghost sm vw-sh" id="vwShare">Share</button></div></section>';
}
function copyText(t) {
  function fb() {
    var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "0"; ta.style.left = "0"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { ta.setSelectionRange(0, t.length); } catch (e) {}
    var ok = false; try { ok = document.execCommand("copy"); } catch (e2) {}
    document.body.removeChild(ta); return ok;
  }
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fb(); });
  return Promise.resolve(fb());
}
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("#vwShare"); if (!b) return;
  var v = weekVerse(); if (!v) return;
  copyText("\u201C" + v.t + "\u201D\n" + v.r + " (KJV)\n\nRLW Youth Cave: verse of the week").then(function (ok) { toast(ok ? "Verse copied. Paste it anywhere to share." : "Could not copy. Press and hold the verse to copy it."); });
});
function animateIn(m) {
  m.classList.remove("tx", "stg");
  if (!TX) return; TX = false;
  if (reduceMotion()) return;
  void m.offsetWidth;
  if (cur === "home") {
    Array.prototype.forEach.call(m.children, function (el, i) { el.style.setProperty("--i", Math.min(i, 8)); });
    m.classList.add("stg");
  } else m.classList.add("tx");
}

function render() {
  var m = $("main");
  CU = {};
  m.innerHTML = (R[cur] || R.home)();
  hydrateFiles(m);
  kickHeroVideo();
  animateIn(m);
  startCountdown();
  countUp(m);
  if (cur === "home") homeJobsCount();
  if (cur === "contrib") loadContrib();
  if (cur === "expenses") loadExpenses();
  if (cur === "suggest" && isExco()) loadSuggestions();
  if (cur === "settings") loadSettings();
  if (cur === "jobs") { if (JB.loaded) drawJobs(); loadJobs(); }
  if (cur === "polls") { if (PL.loaded) drawPolls(); loadPolls(); }
  if (cur === "plans") { if (PN.loaded) drawPlans(); loadPlans(); }
  if (cur === "notices" || cur === "events" || cur === "roster") applyPending();
}
$("main").addEventListener("click", function (e) {
  var b;
  if ((b = e.target.closest("[data-add]"))) {
    var s = b.getAttribute("data-add");
    if (s === "rosterday") return rosterDay();
    if (s === "actions") return editRow("actions", { minute_id: +b.getAttribute("data-mid") }, { minute_id: +b.getAttribute("data-mid") });
    var defaults = {}; if (s === "announcements" || s === "offerings" || s === "minutes" || s === "roster") defaults.date = ME.today;
    if (s === "offerings") defaults.title = "Sunday service";
    if (s === "expenses") defaults.date = (exMonth && exMonth !== ME.today.slice(0, 7)) ? exMonth + "-01" : ME.today;
    if (s === "minutes") defaults.title = "Youth Exco meeting";
    return editRow(s, defaults);
  }
  if ((b = e.target.closest("[data-edit]"))) { var s2 = b.getAttribute("data-edit"), id = +b.getAttribute("data-id"); return editRow(s2, find(D[s2], id)); }
  if ((b = e.target.closest("[data-del]"))) { return delRow(b.getAttribute("data-del"), +b.getAttribute("data-id")); }
  if ((b = e.target.closest("[data-go]"))) { return go(b.getAttribute("data-go")); }
  if ((b = e.target.closest("[data-remind]"))) { return openRemind(b.getAttribute("data-remind"), +b.getAttribute("data-id")); }
  if ((b = e.target.closest("[data-done]"))) {
    if (!isExco()) { e.preventDefault(); return; }
    var aid = +b.getAttribute("data-done"); api("api/save/actions", { id: aid, done: b.checked }).then(function (r) { if (!r.ok) toast(r.error); refresh(); }); return;
  }
});


// ---------- polls ----------
// One vote per device per poll: a random voter id lives in localStorage (no accounts; everyone shares the Youth password).
var VK = "rlwYouthVoter", VN = "rlwYouthVoterName";
function voterId() {
  var v = ""; try { v = localStorage.getItem(VK) || ""; } catch (e) {}
  if (!/^[a-f0-9]{32}$/.test(v)) {
    var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
    v = Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    try { localStorage.setItem(VK, v); } catch (e2) {}
  }
  return v;
}
function voterName() { try { return localStorage.getItem(VN) || ""; } catch (e) { return ""; } }
var PL = { rows: [], loaded: false, now: 0, change: {}, sel: {}, peek: {}, busy: false };
function pollWhen(ms) { return new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).replace(" am", " AM").replace(" pm", " PM"); }
function loadPolls() {
  return api("api/polls?voter=" + voterId()).then(function (r) {
    if (!r.ok) { if ($("plList")) $("plList").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    PL.rows = r.polls || []; PL.now = r.now || Date.now(); PL.loaded = true;
    if (cur === "polls") { drawPolls(); applyPending(); }
  }).catch(function () {});
}
R.polls = function () {
  var nm = voterName();
  var h = head("Polls", "Tap an option to vote. One vote per phone, and you can change it while the poll is open.", '<button class="btn grn sm" type="button" id="plNew">New poll</button>');
  h += '<p class="meta pl-me" id="plMe">' + (nm ? "Voting as <b>" + esc(nm) + '</b> &middot; <button type="button" class="lnk" id="plName">Change name</button>' : "") + "</p>";
  h += '<div id="plList">' + (PL.loaded ? "" : '<p class="muted">Loading...</p>') + "</div>";
  return h;
};
function pollBars(p) {
  if (!p.results) return '<p class="pl-hid">Results show after you vote.</p>';
  var max = Math.max.apply(null, p.counts.concat([0]));
  return '<div class="pl-res">' + p.options.map(function (o, i) {
    var c = p.counts[i], pct = p.total ? Math.round(c * 100 / p.total) : 0, lead = max > 0 && c === max;
    var mine = p.mine && p.mine.indexOf(i) >= 0;
    var who = isExco() && p.voters && p.voters[i].length ? '<p class="pl-who">' + p.voters[i].map(esc).join(", ") + "</p>" : "";
    return '<div class="pl-bar' + (lead ? " lead" : "") + '"><div class="pl-bt"><span class="pl-o">' + esc(o) + (mine ? ' <span class="pl-mine">Your vote</span>' : "") + '</span><span class="pl-n">' + c + " &middot; " + pct + '%</span></div><div class="pl-tr"><span style="width:' + pct + '%"></span></div>' + who + "</div>";
  }).join("") + "</div>";
}
function pollVoteForm(p) {
  var sel = PL.sel[p.id] || p.mine || [];
  if (!p.multi) return '<div class="pl-opts">' + p.options.map(function (o, i) {
    return '<button type="button" class="pl-opt' + (sel.indexOf(i) >= 0 ? " on" : "") + '" data-pvote="' + p.id + '" data-i="' + i + '">' + esc(o) + "</button>";
  }).join("") + "</div>";
  return '<div class="pl-opts">' + p.options.map(function (o, i) {
    return '<label class="pl-ck"><input type="checkbox" data-pck="' + p.id + '" value="' + i + '"' + (sel.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(o) + "</label>";
  }).join("") + '</div><button type="button" class="btn pri wide" data-psub="' + p.id + '">Submit my vote</button>';
}
function pollCard(p) {
  var voted = !!p.mine, voting = p.open && (!voted || PL.change[p.id]);
  var st = p.open ? (p.closes_at ? "Closes " + pollWhen(p.closes_at) : "Open") : "Closed";
  var h = '<article class="card pl' + (p.pinned ? " pinned" : "") + (p.open ? "" : " closed") + '" id="poll-' + p.id + '" data-item="poll-' + p.id + '">';
  h += (p.pinned ? '<span class="pin">Pinned</span>' : "") + '<h4 class="pl-q">' + esc(p.question) + "</h4>";
  h += '<p class="meta"><span class="pl-st' + (p.open ? " open" : "") + '">' + st + "</span> &middot; " + cuNum(p.total, "pt" + p.id) + " vote" + (p.total === 1 ? "" : "s") + " &middot; " + (p.multi ? "Choose one or more" : "Choose one") + "</p>";
  if (voting) {
    h += pollVoteForm(p) + (voted ? '<button type="button" class="btn ghost sm pl-cx" data-pcancel="' + p.id + '">Keep my vote</button>' : "");
    if (p.results) h += '<details class="pl-ex"' + (PL.peek[p.id] === 1 || (isExco() && PL.peek[p.id] !== 0) ? " open" : "") + ' data-ppeek="' + p.id + '"><summary>' + (isExco() ? "Live results" : "See results so far") + "</summary>" + pollBars(p) + "</details>";
  } else h += pollBars(p);
  if (!voting && p.open && voted) h += '<div class="acts"><button type="button" class="btn ghost sm" data-pchange="' + p.id + '">Change my vote</button></div>';
  if (isExco()) {
    h += '<div class="acts pl-adm">' + shareBtn("poll", p.id) +
      (p.open ? '<button type="button" class="btn ghost sm" data-pact="close" data-id="' + p.id + '">Close now</button>' : '<button type="button" class="btn ghost sm" data-pact="reopen" data-id="' + p.id + '">Reopen</button>') +
      (p.pinned ? '<button type="button" class="btn ghost sm" data-pact="unpin" data-id="' + p.id + '">Unpin</button>' : '<button type="button" class="btn ghost sm" data-pact="pin" data-id="' + p.id + '">Pin</button>') +
      (p.total ? "" : '<button type="button" class="btn ghost sm" data-pedit="' + p.id + '">Edit</button>') +
      '<button type="button" class="btn ghost sm" data-pcsv="' + p.id + '">Download CSV</button>' +
      '<button type="button" class="btn danger sm" data-pact="delete" data-id="' + p.id + '">Delete</button></div>';
  }
  return h + "</article>";
}
function drawPolls() {
  var el = $("plList"); if (!el) return;
  var open = PL.rows.filter(function (p) { return p.open; }), shut = PL.rows.filter(function (p) { return !p.open; });
  open.sort(function (a, b) { return (b.pinned - a.pinned) || (b.created_at - a.created_at); });
  shut.sort(function (a, b) { return b.created_at - a.created_at; });
  var h = open.length ? open.map(pollCard).join("") : '<p class="empty">No open polls right now.' + (isExco() ? " Tap New poll to ask the youth a question." : " Check back soon.") + "</p>";
  if (shut.length) h += '<details class="past"' + (PL.pastOpen ? " open" : "") + ' id="plPast"><summary>Closed polls (' + shut.length + ")</summary>" + shut.map(pollCard).join("") + "</details>";
  el.innerHTML = h; countUp(el);
  var me = $("plMe"), nm = voterName();
  if (me) me.innerHTML = nm ? "Voting as <b>" + esc(nm) + '</b> &middot; <button type="button" class="lnk" id="plName">Change name</button>' : "";
}
function askName(then) {
  openModal("Your name", '<label for="vn">Your name</label><input type="text" id="vn" maxlength="60" autocomplete="name" value="' + esc(voterName()) + '" placeholder="e.g. Tolu Adebayo" required><p class="hint">The Exco will see your name next to your vote. Other youth only see the totals.</p><p class="err" id="merr" role="alert"></p><div class="mf-actions"><button type="submit" class="btn pri" id="msave">Continue</button></div>', function () {
    var v = $("vn").value.trim().replace(/\s+/g, " ");
    if (v.length < 2) { $("merr").textContent = "Please type your name."; return; }
    try { localStorage.setItem(VN, v); } catch (e) {}
    closeModal(); if (then) then(); else drawPolls();
  });
  setTimeout(function () { var f = $("vn"); if (f) f.focus(); }, 30);
}
function castVote(id, choices) {
  if (!voterName()) return askName(function () { castVote(id, choices); });
  if (PL.busy) return; PL.busy = true;
  api("api/polls/vote", { poll_id: id, voter: voterId(), name: voterName(), choices: choices }).then(function (r) {
    PL.busy = false;
    if (!r.ok) { toast(r.error || "Could not save your vote."); loadPolls(); return; }
    delete PL.change[id]; delete PL.sel[id]; toast("Vote saved"); loadPolls(); refreshQuiet();
  }).catch(function () { PL.busy = false; });
}
function pollForm(p) {
  p = p || {}; var opts = p.options && p.options.length ? p.options.slice() : ["", ""];
  var cd = "", ct = "";
  if (p.closes_at) { var d = new Date(p.closes_at + 3600000).toISOString(); cd = d.slice(0, 10); ct = d.slice(11, 16); }
  var html = '<label for="pq">Question</label><input type="text" id="pq" maxlength="200" required placeholder="e.g. Which Saturday for the youth retreat?" value="' + esc(p.question || "") + '">' +
    '<label>Options (2 to 8)</label><div id="pOpts">' + opts.map(function (o, i) { return pollOptRow(i, o); }).join("") + "</div>" +
    '<button type="button" class="btn ghost sm" id="pAdd">Add option</button>' +
    '<p class="hint fsec">Closing date and time (optional, Lagos time). Leave blank to keep the poll open until you close it.</p>' +
    '<div class="pl-dt"><div><label for="pcd">Closing date</label><input type="date" id="pcd" value="' + cd + '"></div><div><label for="pct">Closing time</label><input type="time" id="pct" value="' + ct + '"></div></div>' +
    '<label class="ck"><input type="checkbox" id="pmulti"' + (p.multi ? " checked" : "") + "> Allow more than one choice</label>" +
    '<label class="ck"><input type="checkbox" id="phide"' + (p.hide_results ? " checked" : "") + "> Show results only after voting</label>" +
    (p.id ? "" : '<label class="ck"><input type="checkbox" id="ppin"> Pin this poll to the top</label>') +
    '<p class="err" id="merr" role="alert"></p><div class="mf-actions"><button type="submit" class="btn pri" id="msave">' + (p.id ? "Save changes" : "Create poll") + "</button></div>";
  openModal(p.id ? "Edit poll" : "New poll", html, function () {
    var body = { question: $("pq").value, options: [].map.call(document.querySelectorAll("#pOpts input"), function (x) { return x.value; }),
      closes_date: $("pcd").value, closes_time: $("pct").value, multi: $("pmulti").checked, hide_results: $("phide").checked };
    if (p.id) body.id = p.id; else body.pinned = $("ppin").checked;
    $("msave").disabled = true;
    api("api/polls/save", body).then(function (r) {
      $("msave").disabled = false;
      if (!r.ok) { $("merr").textContent = r.error; return; }
      closeModal(); toast(p.id ? "Poll saved" : "Poll created");
      var pl = loadPolls(); refreshQuiet();
      if (!p.id && r.id) { var nq = { id: r.id, question: body.question }; pl.then(function () { openShare("poll", find(PL.rows, r.id) || nq, true); }); }
    }).catch(function () {});
  });
  wireOpts();
}
function pollOptRow(i, v) { return '<div class="pl-or"><input type="text" maxlength="120" aria-label="Option ' + (i + 1) + '" placeholder="Option ' + (i + 1) + '" value="' + esc(v || "") + '"><button type="button" class="btn ghost sm" data-prm="1" aria-label="Remove option ' + (i + 1) + '">Remove</button></div>'; }
function wireOpts() {
  var box = $("pOpts");
  function sync() { var rows = box.querySelectorAll(".pl-or"); [].forEach.call(rows, function (r, i) { var inp = r.querySelector("input"); inp.placeholder = "Option " + (i + 1); inp.setAttribute("aria-label", "Option " + (i + 1)); r.querySelector("button").disabled = rows.length <= 2; }); $("pAdd").disabled = rows.length >= 8; }
  $("pAdd").addEventListener("click", function () { if (box.children.length >= 8) return; box.insertAdjacentHTML("beforeend", pollOptRow(box.children.length, "")); sync(); var l = box.lastElementChild.querySelector("input"); if (l) l.focus(); });
  box.addEventListener("click", function (e) { var b = e.target.closest("[data-prm]"); if (!b || box.children.length <= 2) return; b.parentNode.remove(); sync(); });
  sync();
}
function refreshQuiet() { api("api/all?voter=" + voterId()).then(function (r) { if (r && r.ok) D.polls_open = r.polls_open || []; }).catch(function () {}); }
$("main").addEventListener("click", function (e) {
  var b;
  if ((b = e.target.closest("#plNew"))) return pollForm();
  if ((b = e.target.closest("#plName"))) return askName();
  if ((b = e.target.closest("[data-pvote]"))) { var id = +b.getAttribute("data-pvote"); return castVote(id, [+b.getAttribute("data-i")]); }
  if ((b = e.target.closest("[data-psub]"))) {
    var pid = +b.getAttribute("data-psub");
    var ch = [].map.call(document.querySelectorAll('[data-pck="' + pid + '"]:checked'), function (x) { return +x.value; });
    if (!ch.length) { toast("Tick at least one option."); return; }
    return castVote(pid, ch);
  }
  if ((b = e.target.closest("[data-pchange]"))) { PL.change[+b.getAttribute("data-pchange")] = 1; return drawPolls(); }
  if ((b = e.target.closest("[data-pcancel]"))) { var c = +b.getAttribute("data-pcancel"); delete PL.change[c]; delete PL.sel[c]; return drawPolls(); }
  if ((b = e.target.closest("[data-pedit]"))) return pollForm(find(PL.rows, +b.getAttribute("data-pedit")));
  if ((b = e.target.closest("[data-pcsv]"))) {
    var cid = +b.getAttribute("data-pcsv");
    fetch("api/polls.csv?id=" + cid, { headers: { authorization: "Bearer " + token } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (bl) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "rlw-youth-poll-" + cid + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }).catch(function () { toast("Could not download. Please try again."); });
    return;
  }
  if ((b = e.target.closest("[data-pact]"))) {
    var op = b.getAttribute("data-pact"), aid = +b.getAttribute("data-id");
    if (op === "delete" && !confirm("Delete this poll and all its votes? This cannot be undone.")) return;
    if (op === "close" && !confirm("Close this poll now? Youth will no longer be able to vote.")) return;
    b.disabled = true;
    api("api/polls/action", { id: aid, op: op }).then(function (r) {
      if (!r.ok) { b.disabled = false; toast(r.error); return; }
      toast({ close: "Poll closed", reopen: "Poll reopened", pin: "Poll pinned", unpin: "Poll unpinned", delete: "Poll deleted" }[op]); loadPolls(); refreshQuiet();
    }).catch(function () {});
  }
});
$("main").addEventListener("change", function (e) {
  var x = e.target; if (!x.matches || !x.matches("[data-pck]")) return;
  var pid = +x.getAttribute("data-pck");
  PL.sel[pid] = [].map.call(document.querySelectorAll('[data-pck="' + pid + '"]:checked'), function (y) { return +y.value; });
});
$("main").addEventListener("toggle", function (e) { var t = e.target; if (!t || !t.getAttribute) return; if (t.id === "plPast") PL.pastOpen = t.open; var k = t.getAttribute("data-ppeek"); if (k) PL.peek[k] = t.open ? 1 : 0; }, true);
// live results: refresh the Polls tab every 15 seconds while it is on screen
setInterval(function () {
  if (cur !== "polls" || !token || document.hidden || !$("modal").hidden || PL.busy) return;
  var a = document.activeElement; if (a && a.matches && a.matches("[data-pck]")) return;
  loadPolls();
}, 15000);
function pollHomeCard() {
  var o = (D.polls_open || []).slice();
  if (!o.length) return "";
  o.sort(function (a, b) { return (b.pinned - a.pinned) || (b.id - a.id); });
  var p = o[0], more = o.length - 1;
  return '<button type="button" class="pl-home" data-go="polls"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="4" width="13" height="3.2" rx="1.6" fill="currentColor"/><rect x="3" y="10.4" width="18" height="3.2" rx="1.6" fill="currentColor" opacity=".75"/><rect x="3" y="16.8" width="8" height="3.2" rx="1.6" fill="currentColor" opacity=".5"/></svg>' +
    '<span class="pl-ht"><small>' + (p.voted ? "Youth poll &middot; you voted" : "Youth poll &middot; have your say") + "</small><b>" + esc(p.question) + "</b>" + (more ? "<small>+" + more + " more open poll" + (more === 1 ? "" : "s") + "</small>" : "") + "</span>" +
    '<span class="pl-go">' + (p.voted ? "See results" : "Vote now") + "</span></button>";
}

// ---------- plans (Youth department plans and programmes; Exco adds and edits, youth view) ----------
var PN = { rows: [], loaded: false, f: "all", open: 0, busy: false };
var PN_ST = ["Not started", "In progress", "Done", "Paused"];
function pnDate(s) { if (!s) return ""; return pdate(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
function pnFrame(p) {
  if (p.start_date && p.target_date) return pnDate(p.start_date) + " to " + pnDate(p.target_date);
  if (p.target_date) return "By " + pnDate(p.target_date);
  if (p.start_date) return "From " + pnDate(p.start_date);
  return "No dates set";
}
function pnOver(p) { return !!(p.target_date && p.status !== "Done" && ME.today && p.target_date < ME.today); }
function pnPill(p) { var c = { "Not started": "ns", "In progress": "ip", "Done": "dn", "Paused": "pa" }[p.status] || "ns"; return '<span class="pn-pill ' + c + '">' + esc(p.status) + "</span>"; }
function pnBar(p) { var v = Math.max(0, Math.min(100, +p.progress || 0)); return '<div class="pn-prog"><div class="pn-tr" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" aria-label="Progress"><span style="width:' + v + '%"></span></div><b>' + v + "%</b></div>"; }
function pnStepsLine(p) { var d = p.steps.filter(function (s) { return s.d; }).length; return p.steps.length ? d + " of " + p.steps.length + " steps done" : "No steps added yet"; }
function loadPlans() {
  return api("api/plans").then(function (r) {
    if (!r.ok) { if ($("pnList")) $("pnList").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    PN.rows = r.plans || []; PN.loaded = true; if (r.today) ME.today = r.today;
    var ip = PN.rows.filter(function (p) { return p.status === "In progress"; }).length;
    D.plans_sum = { total: PN.rows.length, in_progress: ip };
    if (PN.open && !find(PN.rows, PN.open)) PN.open = 0;
    if (cur === "plans") drawPlans();
  }).catch(function () {});
}
R.plans = function () {
  return '<div id="pnList">' + (PN.loaded ? "" : '<p class="muted">Loading...</p>') + "</div>";
};
function pnCard(p) {
  return '<button type="button" class="card pn-card" data-pnopen="' + p.id + '">' +
    '<span class="pn-top">' + pnPill(p) + (pnOver(p) ? '<span class="pn-over">Overdue</span>' : "") + "</span>" +
    '<span class="pn-t">' + esc(p.title) + "</span>" +
    (p.responsible ? '<span class="meta">Responsible: ' + esc(p.responsible) + "</span>" : "") +
    '<span class="meta">' + pnFrame(p) + "</span>" + pnBar(p) +
    '<span class="pn-foot"><span>' + pnStepsLine(p) + "</span><span>" + (p.reports.length ? p.reports.length + " report" + (p.reports.length === 1 ? "" : "s") : "No reports yet") + "</span></span></button>";
}
function drawPlans() {
  var el = $("pnList"); if (!el) return;
  if (PN.open) { var op = find(PN.rows, PN.open); if (op) { el.innerHTML = pnDetail(op); return; } PN.open = 0; }
  var all = PN.rows, ip = all.filter(function (p) { return p.status === "In progress"; }), dn = all.filter(function (p) { return p.status === "Done"; });
  var list = PN.f === "ip" ? ip : PN.f === "done" ? dn : all;
  var h = head("Plans", "The Youth department's plans and programmes: what we will do, by when, and how far we have got.", '<button class="btn grn sm" type="button" id="pnNew">New plan</button>');
  if (all.length) {
    h += '<div class="chips pn-f" role="group" aria-label="Filter plans">' + [["all", "All", all.length], ["ip", "In progress", ip.length], ["done", "Done", dn.length]].map(function (c) {
      return '<button type="button" class="chip" data-pnf="' + c[0] + '" aria-pressed="' + (PN.f === c[0]) + '">' + c[1] + " (" + c[2] + ")</button>";
    }).join("") + (isExco() ? '<button type="button" class="btn ghost sm pn-csv" id="pnCsv">Download CSV</button>' : "") + "</div>";
  }
  if (list.length) h += list.map(pnCard).join("");
  else if (!all.length) h += '<p class="empty">No plans yet.' + (isExco() ? " Tap New plan to add the first one." : " The Exco will add the department's plans here.") + "</p>";
  else h += '<p class="empty">No plans ' + (PN.f === "done" ? "are done yet." : "are in progress right now.") + "</p>";
  el.innerHTML = h;
}
function pnDetail(p) {
  var ex = isExco();
  var h = '<button type="button" class="lnk pn-back" data-pnback="1">&larr; All plans</button>';
  h += '<div class="card pn-d"><div class="pn-top">' + pnPill(p) + (pnOver(p) ? '<span class="pn-over">Overdue</span>' : "") + "</div>";
  h += "<h2>" + esc(p.title) + "</h2>";
  if (p.responsible) h += '<p class="meta">Responsible: <b>' + esc(p.responsible) + "</b></p>";
  h += '<p class="meta">Timeframe: <b>' + pnFrame(p) + "</b></p>" + pnBar(p);
  if (ex) h += '<div class="acts"><button class="btn grn sm" type="button" data-pnrep="' + p.id + '">Add report</button><button class="btn ghost sm" type="button" data-pnedit="' + p.id + '">Edit plan</button><button class="btn danger sm" type="button" data-pndel="' + p.id + '">Delete</button></div>';
  h += "</div>";
  h += '<div class="card"><h3 class="pn-h">What to do to achieve it</h3><p class="meta">' + pnStepsLine(p) + "</p>";
  h += p.steps.length ? '<ul class="pn-steps">' + p.steps.map(function (s, i) {
    return '<li><label class="pn-step' + (s.d ? " done" : "") + '"><input type="checkbox" data-pnstep="' + p.id + '" data-i="' + i + '"' + (s.d ? " checked" : "") + (ex ? "" : ' disabled aria-disabled="true"') + "><span>" + esc(s.t) + "</span></label></li>";
  }).join("") + "</ul>" : '<p class="empty">No steps added yet.</p>';
  h += "</div>";
  h += '<div class="card"><h3 class="pn-h">Progress / report log</h3>';
  h += p.reports.length ? '<ol class="pn-log">' + p.reports.map(function (r) {
    return '<li><div class="pn-ld"><b>' + pnDate(r.date) + "</b>" + (r.reported_by ? '<span class="meta">Reported by ' + esc(r.reported_by) + "</span>" : "") + "</div><p>" + esc(r.body) + "</p>" +
      (ex ? '<button type="button" class="lnk pn-rdel" data-pnrdel="' + r.id + '">Delete report</button>' : "") + "</li>";
  }).join("") + "</ol>" : '<p class="empty">No reports yet.' + (ex ? " Tap Add report after each meeting or milestone." : "") + "</p>";
  h += "</div>";
  return h;
}
function pnStepRow(s) { s = s || { t: "", d: 0 }; return '<div class="pn-sr"><input type="checkbox" aria-label="Done"' + (s.d ? " checked" : "") + '><input type="text" maxlength="200" placeholder="e.g. Book the venue" value="' + esc(s.t) + '"><button type="button" class="btn ghost sm" data-psrm="1">Remove</button></div>'; }
function planForm(p) {
  p = p || {}; var steps = p.steps && p.steps.length ? p.steps : [{ t: "", d: 0 }, { t: "", d: 0 }];
  var html = '<label for="pnt">Plan title</label><input type="text" id="pnt" maxlength="140" required placeholder="e.g. Youth Week 2026" value="' + esc(p.title || "") + '">' +
    '<label for="pnr">Person/unit responsible (optional)</label><input type="text" id="pnr" maxlength="120" placeholder="e.g. Welfare Director, Media unit" value="' + esc(p.responsible || "") + '">' +
    '<label>What to do to achieve it</label><p class="hint">One step per line. Tick a step when it is done.</p><div id="pnSteps">' + steps.map(pnStepRow).join("") + "</div>" +
    '<button type="button" class="btn ghost sm" id="pnAddStep">Add step</button>' +
    '<div class="pl-dt fsec"><div><label for="pns">Start date</label><input type="date" id="pns" value="' + esc(p.start_date || (p.id ? "" : ME.today)) + '"></div><div><label for="pne">Target date</label><input type="date" id="pne" value="' + esc(p.target_date || "") + '"></div></div>' +
    '<label for="pnst">Status</label><select id="pnst">' + PN_ST.map(function (s) { return "<option" + ((p.status || "Not started") === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
    '<label for="pnp">Progress: <b id="pnpv">' + (+p.progress || 0) + '%</b></label><input type="range" id="pnp" class="pn-range" min="0" max="100" step="5" value="' + (+p.progress || 0) + '">' +
    '<p class="err" id="merr" role="alert"></p><div class="mf-actions"><button type="submit" class="btn pri" id="msave">' + (p.id ? "Save changes" : "Create plan") + "</button></div>";
  openModal(p.id ? "Edit plan" : "New plan", html, function () {
    var steps2 = [].map.call(document.querySelectorAll("#pnSteps .pn-sr"), function (r) { var i = r.querySelectorAll("input"); return { t: i[1].value, d: i[0].checked ? 1 : 0 }; }).filter(function (s) { return s.t.trim(); });
    var body = { title: $("pnt").value, responsible: $("pnr").value, steps: steps2, start_date: $("pns").value, target_date: $("pne").value, status: $("pnst").value, progress: +$("pnp").value };
    if (p.id) body.id = p.id;
    $("msave").disabled = true;
    api("api/plans/save", body).then(function (r) {
      $("msave").disabled = false;
      if (!r.ok) { $("merr").textContent = r.error; return; }
      closeModal(); toast(p.id ? "Plan saved" : "Plan created"); if (!p.id && r.id) PN.open = r.id; loadPlans();
    }).catch(function () {});
  });
  var box = $("pnSteps");
  $("pnAddStep").addEventListener("click", function () { if (box.children.length >= 30) return; box.insertAdjacentHTML("beforeend", pnStepRow()); var l = box.lastElementChild.querySelector("input[type=text]"); if (l) l.focus(); });
  box.addEventListener("click", function (e) { var b = e.target.closest("[data-psrm]"); if (b) b.parentNode.remove(); });
  $("pnp").addEventListener("input", function () { $("pnpv").textContent = this.value + "%"; });
}
function reportForm(p) {
  var html = '<p class="meta" style="margin-top:0">' + esc(p.title) + "</p>" +
    '<label for="prd">Date</label><input type="date" id="prd" value="' + esc(ME.today) + '">' +
    '<label for="prb">Report</label><textarea id="prb" rows="4" maxlength="2000" placeholder="e.g. Venue booked. 40 youth registered so far."></textarea>' +
    '<label for="prw">Reported by (optional)</label><input type="text" id="prw" maxlength="100" placeholder="e.g. Gen. Secretary">' +
    '<div class="pl-dt fsec"><div><label for="prst">Status</label><select id="prst">' + PN_ST.map(function (s) { return "<option" + (p.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></div><div><label for="prp">Progress: <b id="prpv">' + (+p.progress || 0) + '%</b></label><input type="range" id="prp" class="pn-range" min="0" max="100" step="5" value="' + (+p.progress || 0) + '"></div></div>' +
    '<p class="err" id="merr" role="alert"></p><div class="mf-actions"><button type="submit" class="btn pri" id="msave">Save report</button></div>';
  openModal("Add report", html, function () {
    $("msave").disabled = true;
    api("api/plans/report", { plan_id: p.id, date: $("prd").value, body: $("prb").value, reported_by: $("prw").value, status: $("prst").value, progress: +$("prp").value }).then(function (r) {
      $("msave").disabled = false;
      if (!r.ok) { $("merr").textContent = r.error; return; }
      closeModal(); toast("Report added"); loadPlans();
    }).catch(function () {});
  });
  $("prp").addEventListener("input", function () { $("prpv").textContent = this.value + "%"; });
  setTimeout(function () { var f = $("prb"); if (f && window.innerWidth > 700) f.focus(); }, 30);
}
$("main").addEventListener("click", function (e) {
  var b;
  if ((b = e.target.closest("[data-pnopen]"))) { PN.open = +b.getAttribute("data-pnopen"); drawPlans(); window.scrollTo(0, 0); return; }
  if ((b = e.target.closest("[data-pnback]"))) { PN.open = 0; drawPlans(); window.scrollTo(0, 0); return; }
  if ((b = e.target.closest("[data-pnf]"))) { PN.f = b.getAttribute("data-pnf"); return drawPlans(); }
  if ((b = e.target.closest("#pnNew"))) return planForm();
  if ((b = e.target.closest("[data-pnedit]"))) return planForm(find(PN.rows, +b.getAttribute("data-pnedit")));
  if ((b = e.target.closest("[data-pnrep]"))) return reportForm(find(PN.rows, +b.getAttribute("data-pnrep")));
  if ((b = e.target.closest("#pnCsv"))) {
    fetch("api/plans.csv", { headers: { authorization: "Bearer " + token } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (bl) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "rlw-youth-plans-" + ME.today + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }).catch(function () { toast("Could not download. Please try again."); });
    return;
  }
  if ((b = e.target.closest("[data-pndel]"))) {
    if (!confirm("Delete this plan and all its reports? This cannot be undone.")) return;
    b.disabled = true;
    api("api/plans/delete", { id: +b.getAttribute("data-pndel") }).then(function (r) { if (!r.ok) { b.disabled = false; toast(r.error); return; } PN.open = 0; toast("Plan deleted"); loadPlans(); }).catch(function () {});
    return;
  }
  if ((b = e.target.closest("[data-pnrdel]"))) {
    if (!confirm("Delete this report?")) return;
    api("api/plans/report-delete", { id: +b.getAttribute("data-pnrdel") }).then(function (r) { if (!r.ok) { toast(r.error); return; } toast("Report deleted"); loadPlans(); }).catch(function () {});
    return;
  }
});
$("main").addEventListener("change", function (e) {
  var x = e.target; if (!x.matches || !x.matches("[data-pnstep]")) return;
  if (!isExco()) { x.checked = !x.checked; return; }
  var lab = x.closest(".pn-step"); if (lab) lab.classList.toggle("done", x.checked);
  api("api/plans/step", { id: +x.getAttribute("data-pnstep"), i: +x.getAttribute("data-i"), done: x.checked }).then(function (r) { if (!r.ok) toast(r.error); loadPlans(); }).catch(function () {});
});
function planHomeCard() {
  var s = D.plans_sum || {}; if (!s.total) return "";
  return '<button type="button" class="pl-home pn-home" data-go="plans"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9l1.6 1.6L12.5 7.7M8 15l1.6 1.6 2.9-2.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 9.5H17M14.5 15.5H17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
    '<span class="pl-ht"><small>Youth department</small><b>Youth plans: ' + cuNum(s.in_progress || 0) + " in progress</b><small>" + cuNum(s.total) + " plan" + (s.total === 1 ? "" : "s") + " in total</small></span>" +
    '<span class="pl-go">View plans</span></button>';
}

// ---------- Remind Me (calendar) ----------
var BELL = '<svg class="bell" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.6V9a6 6 0 0 0-6-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function lagosUtc(date, time) { var p = date.split("-"), q = time.split(":"); return Date.UTC(+p[0], +p[1] - 1, +p[2], +q[0], +q[1]) - 3600000; } // Lagos is UTC+1
function evInfo(kind, x) {
  if (!x || !x.ics_k) return null;
  var date = kind === "announcement" ? x.ev_date : x.date, time = kind === "announcement" ? x.ev_time : x.time;
  if (!date || !time) return null;
  var start = lagosUtc(date, time), endT = kind === "announcement" && x.ev_end && x.ev_end > time ? x.ev_end : "";
  var end = endT ? lagosUtc(date, endT) : start + 3600000;
  return { kind: kind, id: x.id, k: x.ics_k, title: x.title, date: date, time: time, endT: endT, start: start, end: end,
    loc: (kind === "announcement" ? x.ev_loc : x.venue) || "", note: (kind === "announcement" ? x.body : x.description) || "" };
}
function evLine(a) {
  if (!a.ev_date || !a.ev_time) return "";
  return '<p class="evl"><b>Event:</b> ' + fdate(a.ev_date, true) + ", " + ftime(a.ev_time) + (a.ev_end && a.ev_end > a.ev_time ? " to " + ftime(a.ev_end) : "") + (a.ev_loc ? " &middot; " + esc(a.ev_loc) : "") + "</p>";
}
function remindBtn(kind, x) {
  var e = evInfo(kind, x); if (!e || e.start <= Date.now()) return "";
  return '<button class="btn remind sm" type="button" data-remind="' + kind + '" data-id="' + x.id + '">' + BELL + "Remind Me</button>";
}
function gdate(ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function openRemind(kind, id) {
  var x = find(kind === "announcement" ? D.announcements : D.events, id), e = evInfo(kind, x);
  if (!e) { toast("This event has no date and time yet."); return; }
  var ics = "api/ics/" + kind + "/" + e.id + ".ics?k=" + encodeURIComponent(e.k);
  var link = location.href.split("#")[0] + "#" + (kind === "announcement" ? "notices" : "events");
  var note = String(e.note || "").trim(); if (note.length > 500) note = note.slice(0, 497) + "...";
  var g = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(e.title) +
    "&dates=" + gdate(e.start) + "/" + gdate(e.end) + "&ctz=Africa%2FLagos" +
    "&details=" + encodeURIComponent((note ? note + "\n\n" : "") + "RLW Youth Cave: " + link) +
    (e.loc ? "&location=" + encodeURIComponent(e.loc) : "");
  var when = fdate(e.date, true) + ", " + ftime(e.time) + (e.endT ? " to " + ftime(e.endT) : "");
  var html = '<div class="rm"><p class="rm-t">' + esc(e.title) + '</p><p class="rm-w">' + esc(when) + (e.loc ? "<br>" + esc(e.loc) : "") + "</p>" +
    '<a class="btn grn wide" id="rm_ics" href="' + esc(ics) + '">Add to my phone calendar (iPhone &amp; Android)</a>' +
    '<p class="rm-s">Your phone will alert you 1 hour before, 30 minutes before and when it starts. On Android, open the downloaded file and choose your Calendar app.</p>' +
    '<a class="btn ghost wide" id="rm_g" href="' + esc(g) + '" target="_blank" rel="noopener">Add to Google Calendar</a>' +
    '<p class="rm-s">Google Calendar uses its own default reminder. For the 1 hour, 30 minute and start alerts, use the phone calendar option above.</p></div>';
  openModal("Remind me", html, null);
}
function announcementCard(a) {
  return '<article class="card' + (a.pinned ? " pinned" : "") + '" data-item="ann-' + a.id + '"><h4>' + (a.pinned ? '<span class="pin">Pinned</span>' : "") + esc(a.title) + '</h4><div class="meta">' + fdate(a.date) + "</div>" + (a.body ? '<p class="body">' + esc(a.body) + "</p>" : "") + evLine(a) + remindBtn("announcement", a) + editBtns("announcements", a.id) + "</article>";
}
function eventCard(ev) {
  return '<article class="card" data-item="ev-' + ev.id + '"><h4>' + esc(ev.title) + '</h4><div class="meta">' + fdate(ev.date, true) + (ev.time ? " at " + ftime(ev.time) : "") + (ev.venue ? " &middot; " + esc(ev.venue) : "") + "</div>" + (ev.description ? '<p class="body">' + esc(ev.description) + "</p>" : "") + fileBlock(ev.photo, "Flyer for " + ev.title) + remindBtn("event", ev) + editBtns("events", ev.id) + "</article>";
}
function rosterGroups() {
  var by = {}; (D.roster || []).forEach(function (r) { (by[r.date] = by[r.date] || []).push(r); });
  var ws = weekStart(ME.today), we = addDays(ws, 6);
  var dates = Object.keys(by);
  return {
    by: by,
    week: dates.filter(function (d) { return d >= ws && d <= we; }).sort(),
    next: dates.filter(function (d) { return d > we; }).sort(),
    past: dates.filter(function (d) { return d < ws; }).sort().reverse(),
    ws: ws, we: we
  };
}
function rosterDayCard(d, rows, thisWeek) {
  rows = rows.slice().sort(function (a, b) { return a.duty.localeCompare(b.duty); });
  return '<article class="card rday' + (thisWeek ? " this" : "") + '" data-item="rday-' + d + '"><h4><span>' + fdate(d, true) + "</span>" + (d === ME.today ? '<span class="tag g">Today</span>' : "") + "</h4>" +
    rows.map(function (r) {
      return '<div class="rl2"><b>' + esc(r.duty) + "</b><span>" + (r.person ? esc(r.person) : '<span class="muted">Not assigned</span>') + "</span>" +
        (isExco() ? '<span class="mini"><button class="btn ghost sm" data-edit="roster" data-id="' + r.id + '" type="button">Edit</button><button class="btn danger sm" data-del="roster" data-id="' + r.id + '" type="button" aria-label="Delete ' + esc(r.duty) + '">Del</button></span>' : "") + "</div>";
    }).join("") + (isExco() ? '<div class="acts">' + shareBtn("roster", d) + "</div>" : "") + "</article>";
}

R.home = function () {
  var pinned = (D.announcements || []).filter(function (a) { return a.pinned; }).slice(0, 3);
  var latest = pinned.length ? pinned : (D.announcements || []).slice(0, 2);
  var up = (D.events || []).filter(function (e) { return e.date >= ME.today; }).slice(0, 3);
  var g = rosterGroups();
  var open = (D.actions || []).filter(function (a) { return !a.done; }).length;
  var h = '<section class="hero hero-vid"><video class="hero-bg" autoplay muted playsinline preload="auto" data-bg="' + bgPick() + '" poster="bg/' + bgPick() + '_poster.jpg" src="bg/' + bgPick() + '.mp4" aria-hidden="true"></video><div class="hero-ov"></div><div class="hero-in"><p class="eyebrow">Welcome to the</p><h2>Youth Cave</h2><p>' + fdate(ME.today, true) + ".<br>Everything for our youth in one place.</p></div></section>";
  h += '<a class="wa-join" href="https://chat.whatsapp.com/GZ4hiqMFYqNL0cRPoIWazG" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.5-.3z"/></svg><span><b>Join the Youth WhatsApp group</b><small>Chat, updates and reminders with everyone</small></span><span class="wa-go">Join</span></a>';
  h += tilesHTML();
  h += cdHTML();
  h += pollHomeCard();
  h += planHomeCard();
  h += verseHTML();
  h += '<div class="grid2"><div><h3>' + (pinned.length ? "Pinned notices" : "Latest announcements") + "</h3>" + (latest.length ? latest.map(announcementCard).join("") : '<p class="empty">No announcements yet.</p>') + "</div>";
  h += "<div><h3>Next events</h3>" + (up.length ? up.map(eventCard).join("") : '<p class="empty">No upcoming events yet.</p>') + "</div></div>";
  h += "<h3>This week's duties</h3>" + (g.week.length ? g.week.map(function (d) { return rosterDayCard(d, g.by[d], true); }).join("") : '<p class="empty">The roster for this week has not been added yet.</p>');
  return h;
};
R.notices = function () {
  var a = D.announcements || [];
  return head("Announcements", "Pinned notices stay at the top. Newest first.", addBtn("announcements", "New announcement")) + (a.length ? a.map(announcementCard).join("") : '<p class="empty">No announcements yet.</p>');
};
R.events = function () {
  var up = (D.events || []).filter(function (e) { return e.date >= ME.today; });
  var past = (D.events || []).filter(function (e) { return e.date < ME.today; }).reverse();
  return head("Upcoming events", "", addBtn("events", "Add event")) + (up.length ? up.map(eventCard).join("") : '<p class="empty">No upcoming events yet.</p>') +
    (past.length ? '<details class="past"><summary>Past events (' + past.length + ")</summary>" + past.map(eventCard).join("") + "</details>" : "");
};
R.roster = function () {
  var g = rosterGroups();
  var h = head("Duty roster", "This week (" + fdate(g.ws) + " to " + fdate(g.we) + ") shows first.", addBtn("rosterday", "Add roster"));
  h += "<h3>This week</h3>" + (g.week.length ? g.week.map(function (d) { return rosterDayCard(d, g.by[d], true); }).join("") : '<p class="empty">Nothing on the roster for this week yet.</p>');
  if (g.next.length) h += "<h3>Coming up</h3>" + g.next.map(function (d) { return rosterDayCard(d, g.by[d]); }).join("");
  if (g.past.length) h += '<details class="past"><summary>Past weeks (' + g.past.length + " day" + (g.past.length === 1 ? "" : "s") + ")</summary>" + g.past.map(function (d) { return rosterDayCard(d, g.by[d]); }).join("") + "</details>";
  return h;
};
function rosterDay() {
  var next = ME.today; var d = pdate(next); var add = (7 - d.getUTCDay()) % 7; next = addDays(next, add); // next Sunday (or today if Sunday)
  var std = ["Ushering", "Media", "Drama", "Choir", "Prayer", "Sanitation"];
  var html = '<label for="rd_date">Date</label><input type="date" id="rd_date" value="' + next + '" required><p class="hint">Fill in the names for each duty. Leave a name blank to skip that duty.</p><div id="rd_rows">' +
    std.map(function (s, i) { return rdPair(i, s); }).join("") + '</div><button type="button" class="btn ghost sm" id="rd_more" style="margin-top:10px">Add another duty</button><p class="err" id="merr" role="alert"></p><div class="mf-actions"><button class="btn pri" type="submit" id="msave">Save roster</button></div>';
  var n = std.length;
  openModal("Add roster for a day", html, function () {
    var date = $("rd_date").value, rows = [];
    $("rd_rows").querySelectorAll(".dpair").forEach(function (p) { var duty = p.querySelector(".rdd").value.trim(), person = p.querySelector(".rdp").value.trim(); if (duty && person) rows.push({ date: date, duty: duty, person: person }); });
    if (!date) { $("merr").textContent = "Pick a date."; return; }
    if (!rows.length) { $("merr").textContent = "Add at least one name."; return; }
    $("msave").disabled = true;
    var p = Promise.resolve(), bad = null;
    rows.forEach(function (r) { p = p.then(function () { return api("api/save/roster", r).then(function (x) { if (!x.ok) bad = x.error; }); }); });
    p.then(function () { $("msave").disabled = false; if (bad) { $("merr").textContent = bad; return; } closeModal(); toast("Roster saved"); refresh().then(function () { openShare("roster", date, true); }); });
  });
  $("rd_more").addEventListener("click", function () { $("rd_rows").insertAdjacentHTML("beforeend", rdPair(n++, "")); });
}
function rdPair(i, duty) { return '<div class="dpair"><input class="rdd" list="dutylist2" aria-label="Duty" value="' + esc(duty) + '" placeholder="Duty"><input class="rdp" aria-label="Assigned to" placeholder="Name"></div>' + (i === 0 ? '<datalist id="dutylist2">' + DUTIES.map(function (d) { return "<option value=\"" + d + "\">"; }).join("") + "</datalist>" : ""); }

R.minutes = function () {
  var ms = D.minutes || [];
  var h = head("Meeting minutes and decisions", "Each meeting with what was agreed and who is doing what.", addBtn("minutes", "Add meeting"));
  if (!ms.length) return h + '<p class="empty">No meetings recorded yet.</p>';
  return h + ms.map(function (m) {
    var acts = (D.actions || []).filter(function (a) { return a.minute_id === m.id; });
    var ai = acts.map(function (a) {
      var late = !a.done && a.due && a.due < ME.today;
      return '<div class="ai"><input type="checkbox" data-done="' + a.id + '" aria-label="Done: ' + esc(a.what) + '"' + (a.done ? " checked" : "") + (isExco() ? "" : " disabled") + '><div class="grow"><div class="' + (a.done ? "done" : "") + '">' + esc(a.what) + '</div><div class="meta">' + (a.who ? esc(a.who) : "No one assigned") + (a.due ? ' &middot; <span class="tag' + (late ? " late" : "") + '">Due ' + fdate(a.due) + "</span>" : "") + (a.done ? ' &middot; <span class="tag g">Done</span>' : "") + "</div></div>" +
        (isExco() ? '<button class="btn ghost sm" type="button" data-edit="actions" data-id="' + a.id + '">Edit</button>' : "") + "</div>";
    }).join("");
    return '<article class="card"><h4>' + esc(m.title || "Meeting") + '</h4><div class="meta">' + fdate(m.date, true) + "</div>" +
      (m.attendees ? '<p class="body"><b>Attendees:</b> ' + esc(m.attendees) + "</p>" : "") + (m.body ? '<p class="body">' + esc(m.body) + "</p>" : "") +
      "<h3 style=\"font-size:15px;margin:14px 0 4px\">Decisions and action items</h3>" + (ai || '<p class="meta">None recorded.</p>') +
      (isExco() ? '<div class="acts"><button class="btn grn sm" type="button" data-add="actions" data-mid="' + m.id + '">Add decision or action</button><button class="btn ghost sm" type="button" data-edit="minutes" data-id="' + m.id + '">Edit meeting</button><button class="btn danger sm" type="button" data-del="minutes" data-id="' + m.id + '">Delete</button></div>' : "") + "</article>";
  }).join("");
};

var offYear = null;
R.offering = function () {
  var rows = D.offerings || [];
  var years = {}; rows.forEach(function (r) { years[r.date.slice(0, 4)] = 1; }); years[ME.today.slice(0, 4)] = 1;
  var ys = Object.keys(years).sort().reverse(); if (!offYear || ys.indexOf(offYear) < 0) offYear = ME.today.slice(0, 4);
  var yr = rows.filter(function (r) { return r.date.slice(0, 4) === offYear; });
  var mt = Array(12).fill(0); yr.forEach(function (r) { mt[+r.date.slice(5, 7) - 1] += Number(r.amount) || 0; });
  var tot = mt.reduce(function (a, b) { return a + b; }, 0), max = Math.max.apply(null, mt.concat([1]));
  var cm = +ME.today.slice(5, 7) - 1, isCurYear = offYear === ME.today.slice(0, 4);
  var h = head("Offering breakdown", "Each Sunday or meeting, with who counted it. Amounts in Naira.", addBtn("offerings", "Add record"));
  h += '<div class="tools"><label for="offY" style="margin:0">Year</label><select id="offY">' + ys.map(function (y) { return "<option" + (y === offYear ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select></div>";
  h += '<div class="stats"><div class="stat"><small>' + (isCurYear ? MONTHS_L[cm] + " total" : "Records") + "</small><b>" + (isCurYear ? naira(mt[cm]) : yr.length) + '</b></div><div class="stat"><small>' + offYear + " total</small><b>" + naira(tot) + "</b></div></div>";
  h += '<div class="card"><h4>Monthly totals, ' + offYear + '</h4><div class="chart" role="img" aria-label="Bar chart of monthly offering totals">' + mt.map(function (v, i) { return '<div class="bar' + (isCurYear && i === cm ? " cur" : "") + '" title="' + MONTHS[i] + ": " + naira(v) + '"><i style="height:' + (v ? Math.max(3, Math.round(v / max * 100)) : 0) + '%"></i></div>'; }).join("") + '</div><div class="blbl">' + MONTHS.map(function (m) { return "<span>" + m[0] + "</span>"; }).join("") + "</div>" +
    '<table class="tbl" style="margin-top:10px"><thead><tr><th>Month</th><th class="n">Total</th></tr></thead><tbody>' + mt.map(function (v, i) { return v ? "<tr><td>" + MONTHS_L[i] + '</td><td class="n">' + naira(v) + "</td></tr>" : ""; }).join("") + '</tbody><tfoot><tr><td>Year total</td><td class="n">' + naira(tot) + "</td></tr></tfoot></table></div>";
  h += "<h3>Records</h3>" + (yr.length ? yr.map(function (r) {
    return '<article class="card"><div class="row"><div class="grow"><h4>' + esc(r.title) + '</h4><div class="meta">' + fdate(r.date, true) + "</div></div><div class=\"amt\">" + naira(r.amount) + "</div></div>" +
      (r.counted_by ? '<div class="meta" style="margin-top:6px">Counted by: ' + esc(r.counted_by) + "</div>" : "") + (r.notes ? '<p class="body">' + esc(r.notes) + "</p>" : "") + fileBlock(r.photo, "Receipt for " + r.title) + editBtns("offerings", r.id) + "</article>";
  }).join("") : '<p class="empty">No offering records for ' + offYear + " yet.</p>");
  return h;
};
document.addEventListener("change", function (e) {
  if (e.target.id === "offY") { offYear = e.target.value; render(); }
  if (e.target.id === "cY") { cYear = +e.target.value; loadContrib(); }
});

var cYear = null, CD = null;
R.contrib = function () {
  if (!cYear) cYear = +ME.today.slice(0, 4);
  return head("Monthly contributions", "Each member's contribution per month, in Naira.", addBtn("members", "Add member")) +
    '<div class="tools"><label for="cY" style="margin:0">Year</label><select id="cY"></select><button class="btn ghost sm" type="button" id="cCsv">Download CSV</button></div>' +
    (isExco() ? '<p class="note">Tap a cell to enter or change an amount. Tap a name to rename or remove a member.</p>' : "") + '<div id="cWrap"><p class="muted">Loading...</p></div>';
};
function loadContrib() {
  api("api/contrib?year=" + cYear).then(function (r) {
    if (!r.ok) { $("cWrap").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    CD = r; D.members = r.members;
    var ys = {}; r.years.forEach(function (y) { ys[y] = 1; }); var cy = +ME.today.slice(0, 4); ys[cy] = 1; ys[cy - 1] = 1; ys[cy + 1] = 1; ys[cYear] = 1;
    var sel = $("cY"); if (sel) sel.innerHTML = Object.keys(ys).sort().reverse().map(function (y) { return "<option" + (+y === cYear ? " selected" : "") + ">" + y + "</option>"; }).join("");
    drawContrib();
  }).catch(function () {});
}
function drawContrib() {
  var r = CD, grid = {}; r.cells.forEach(function (c) { grid[c.member_id + ":" + c.month] = c.amount; });
  if (!r.members.length) { $("cWrap").innerHTML = '<p class="empty">No members in the table yet.' + (isExco() ? " Use Add member to start." : "") + "</p>"; return; }
  var col = Array(12).fill(0), all = 0;
  var body = r.members.map(function (m) {
    var t = 0;
    var tds = MONTHS.map(function (mn, i) {
      var a = grid[m.id + ":" + (i + 1)]; if (a != null) { t += a; col[i] += a; }
      var txt = a == null ? "-" : naira(a);
      return '<td class="' + (a == null ? "e" : "c") + '">' + (isExco() ? '<button class="cellbtn" type="button" data-cell="' + m.id + ":" + (i + 1) + '" aria-label="' + esc(m.name) + ", " + MONTHS_L[i] + '">' + txt + "</button>" : txt) + "</td>";
    }).join("");
    all += t;
    return '<tr><td class="nm">' + (isExco() ? '<button class="namebtn" type="button" data-mem="' + m.id + '">' + esc(m.name) + "</button>" : esc(m.name)) + "</td>" + tds + '<td class="tot">' + naira(t) + "</td></tr>";
  }).join("");
  $("cWrap").innerHTML = '<div class="tscroll"><table class="ctbl"><thead><tr><th class="nm">Member</th>' + MONTHS.map(function (m) { return "<th>" + m + "</th>"; }).join("") + '<th>Total</th></tr></thead><tbody>' + body +
    '</tbody><tfoot><tr><td class="nm">Total</td>' + col.map(function (v) { return "<td>" + naira(v) + "</td>"; }).join("") + "<td>" + naira(all) + "</td></tr></tfoot></table></div>" +
    '<p class="meta" style="margin-top:8px">' + r.members.length + " member" + (r.members.length === 1 ? "" : "s") + " &middot; " + cYear + " total " + naira(all) + "</p>";
}
$("main").addEventListener("click", function (e) {
  var b;
  if ((b = e.target.closest("#cCsv"))) {
    fetch("api/contrib.csv?year=" + cYear, { headers: { authorization: "Bearer " + token } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (bl) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "rlw-youth-contributions-" + cYear + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }).catch(function () { toast("Could not download. Please try again."); });
    return;
  }
  if ((b = e.target.closest("[data-mem]"))) { return editRow("members", find(CD.members, +b.getAttribute("data-mem")), null, loadContrib); }
  if ((b = e.target.closest("[data-cell]"))) {
    var p = b.getAttribute("data-cell").split(":"), mid = +p[0], mo = +p[1], mem = find(CD.members, mid);
    var curv = (CD.cells.filter(function (c) { return c.member_id === mid && c.month === mo; })[0] || {}).amount;
    openModal(mem.name + ", " + MONTHS_L[mo - 1] + " " + cYear, '<label for="cAmt">Amount (\u20A6)</label><input id="cAmt" inputmode="decimal" value="' + (curv == null ? "" : curv) + '" placeholder="Leave blank for no contribution"><p class="err" id="merr" role="alert"></p><div class="mf-actions">' + (curv != null ? '<button type="button" class="btn danger" id="cClr">Clear</button>' : "") + '<button class="btn pri" type="submit" id="msave">Save</button></div>', function () {
      saveCell(mid, mo, $("cAmt").value);
    });
    if ($("cClr")) $("cClr").addEventListener("click", function () { saveCell(mid, mo, ""); });
    setTimeout(function () { var i = $("cAmt"); if (i) i.focus(); }, 50);
  }
});
function saveCell(mid, mo, v) {
  api("api/contrib/cell", { member_id: mid, year: cYear, month: mo, amount: v }).then(function (r) {
    if (!r.ok) { $("merr").textContent = r.error; return; }
    closeModal(); loadContrib();
  }).catch(function () {});
}

// ---------- expenses ----------
var exMonth = null, EX = null;
function monthLabel(ym) { return MONTHS_L[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4); }
function shiftMonth(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + "-" + (m < 9 ? "0" : "") + (m + 1); }
R.expenses = function () {
  if (!exMonth) exMonth = ME.today.slice(0, 7);
  return head("Monthly expenses", "What the youth spent each month, with receipts. Amounts in Naira.", addBtn("expenses", "Add expense")) +
    '<div class="tools exmon"><button class="btn ghost sm" type="button" data-exm="-1" aria-label="Previous month">&lsaquo;</button><label for="exM" class="sr">Month</label><input type="month" id="exM" value="' + exMonth + '"><button class="btn ghost sm" type="button" data-exm="1" aria-label="Next month">&rsaquo;</button></div>' +
    '<div id="exWrap"><p class="muted">Loading...</p></div>';
};
function loadExpenses() {
  var want = exMonth;
  api("api/expenses?month=" + want).then(function (r) {
    if (want !== exMonth || cur !== "expenses" || !$("exWrap")) return;
    if (!r.ok) { $("exWrap").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    EX = r; D.expenses = r.rows; drawExpenses();
  }).catch(function () {});
}
function drawExpenses() {
  var r = EX, lbl = monthLabel(r.month), max = Math.max.apply(null, r.cats.map(function (c) { return c.total; }).concat([1]));
  var h = '<div class="card exsum"><h4>Month summary, ' + lbl + '</h4>' +
    '<div class="sline"><span>Income</span><b>' + naira(r.income.total) + '</b></div>' +
    '<div class="ssub">Offering ' + naira(r.income.offering) + ' + contributions ' + naira(r.income.contrib) + '</div>' +
    '<div class="sline"><span>Expenses</span><b class="neg">&minus; ' + naira(r.total) + '</b></div>' +
    '<div class="sline bal' + (r.balance < 0 ? " under" : "") + '"><span>Balance</span><b>' + (r.balance < 0 ? "&minus; " + naira(-r.balance) : naira(r.balance)) + "</b></div>" +
    (r.balance < 0 ? '<p class="ssub">Spending is more than the income recorded for this month.</p>' : "") + "</div>";
  h += '<div class="stats"><div class="stat"><small>' + MONTHS_L[+r.month.slice(5, 7) - 1] + ' total</small><b>' + naira(r.total) + '</b></div><div class="stat"><small>Entries</small><b>' + r.rows.length + "</b></div></div>";
  if (r.cats.length) h += '<div class="card"><h4>By category</h4><div class="cbars">' + r.cats.map(function (c) {
    return '<div class="cbar"><div class="cl"><span>' + esc(c.category) + "</span><b>" + naira(c.total) + '</b></div><div class="ct"><i style="width:' + Math.max(2, Math.round(c.total / max * 100)) + '%"></i></div></div>';
  }).join("") + "</div></div>";
  h += '<div class="tools"><button class="btn ghost sm" type="button" data-excsv="month">Download ' + MONTHS[+r.month.slice(5, 7) - 1] + " CSV</button>" +
    '<button class="btn ghost sm" type="button" data-excsv="year">Download ' + r.month.slice(0, 4) + " CSV (whole year)</button></div>";
  h += "<h3>Entries</h3>" + (r.rows.length ? r.rows.map(function (x) {
    var meta = [fdate(x.date, true)]; if (x.paid_to) meta.push("Paid to " + esc(x.paid_to));
    return '<article class="card"><div class="row"><div class="grow"><h4>' + esc(x.item) + '</h4><div class="meta"><span class="tag">' + esc(x.category) + "</span> " + meta.join(" &middot; ") + '</div></div><div class="amt neg">' + naira(x.amount) + "</div></div>" +
      (x.approved_by ? '<div class="meta" style="margin-top:6px">Approved / paid by: ' + esc(x.approved_by) + "</div>" : "") + (x.notes ? '<p class="body">' + esc(x.notes) + "</p>" : "") + fileBlock(x.receipt, "Receipt for " + x.item) + editBtns("expenses", x.id) + "</article>";
  }).join("") : '<p class="empty">No expenses recorded for ' + lbl + " yet." + (isExco() ? " Use Add expense to record one." : "") + "</p>");
  $("exWrap").innerHTML = h; hydrateFiles($("exWrap"));
}
document.addEventListener("change", function (e) {
  if (e.target.id === "exM") { var v = e.target.value; if (/^\d{4}-\d{2}$/.test(v)) { exMonth = v; $("exWrap").innerHTML = '<p class="muted">Loading...</p>'; loadExpenses(); } }
});
$("main").addEventListener("click", function (e) {
  var b;
  if ((b = e.target.closest("[data-exm]"))) { exMonth = shiftMonth(exMonth || ME.today.slice(0, 7), +b.getAttribute("data-exm")); $("exM").value = exMonth; $("exWrap").innerHTML = '<p class="muted">Loading...</p>'; loadExpenses(); return; }
  if ((b = e.target.closest("[data-excsv]"))) {
    var yr = b.getAttribute("data-excsv") === "year", q = yr ? "year=" + exMonth.slice(0, 4) : "month=" + exMonth, fn = "rlw-youth-expenses-" + (yr ? exMonth.slice(0, 4) : exMonth) + ".csv";
    fetch("api/expenses.csv?" + q, { headers: { authorization: "Bearer " + token } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (bl) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = fn; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }).catch(function () { toast("Could not download. Please try again."); });
  }
});

R.exco = function () {
  var ex = D.exco || [];
  return head("Youth Exco", "Our Youth Executive Committee.", addBtn("exco", "Add Exco member")) + (ex.length ? '<div class="exgrid">' + ex.map(function (x) {
    var ph = /^name to be added$/i.test(x.name);
    return '<article class="ex"><div class="av">' + (x.photo ? '<img alt="Photo of ' + esc(x.name) + '" data-file="' + esc(x.photo) + '">' : SILH) + '</div><div class="rl">' + esc(x.role) + '</div><div class="nmx' + (ph ? " ph" : "") + '">' + esc(x.name) + "</div>" +
      (x.phone ? '<a href="tel:' + esc(x.phone.replace(/[^\d+]/g, "")) + '">' + esc(x.phone) + "</a>" : "") + editBtns("exco", x.id) + "</article>";
  }).join("") + "</div>" : '<p class="empty">No Exco members listed yet.</p>');
};

var sgFilter = "new";
R.suggest = function () {
  var h = head("Suggestion box", "Share an idea, a concern or a prayer point with the Exco.");
  h += '<div class="card"><form id="sgForm"><label for="sgText">Your suggestion</label><textarea id="sgText" maxlength="3000" placeholder="Write your idea or concern here" required></textarea><p class="hint">This is anonymous. Your name is not asked for and is not recorded. Only the Exco can read suggestions.</p><button class="btn pri wide" type="submit" id="sgBtn">Send anonymously</button><p class="err" id="sgErr" role="alert"></p></form></div>';
  if (isExco()) h += '<h3>Inbox</h3><div class="tools"><div class="seg" role="group" aria-label="Filter suggestions">' + [["new", "New"], ["read", "Read"], ["archived", "Archived"]].map(function (f) { return '<button type="button" data-sgf="' + f[0] + '" aria-pressed="' + (sgFilter === f[0]) + '">' + f[1] + "</button>"; }).join("") + '</div></div><div id="sgList"><p class="muted">Loading...</p></div>';
  return h;
};
var SG = [];
function loadSuggestions() {
  api("api/list/suggestions").then(function (r) {
    if (!r.ok) { $("sgList").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    SG = r.rows; D.new_suggestions = SG.filter(function (s) { return s.status === "new"; }).length; drawTabs(); drawSg();
  }).catch(function () {});
}
function drawSg() {
  var list = SG.filter(function (s) { return s.status === sgFilter; });
  $("sgList").innerHTML = list.length ? list.map(function (s) {
    var d = new Date(s.created_at);
    return '<article class="card sg ' + s.status + '"><div class="meta">' + d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) + '</div><p class="body">' + esc(s.body) + '</p><div class="acts">' +
      (s.status !== "read" ? '<button class="btn ghost sm" type="button" data-sgs="' + s.id + ':read">Mark read</button>' : "") +
      (s.status === "read" ? '<button class="btn ghost sm" type="button" data-sgs="' + s.id + ':new">Mark unread</button>' : "") +
      (s.status !== "archived" ? '<button class="btn ghost sm" type="button" data-sgs="' + s.id + ':archived">Archive</button>' : "") +
      '<button class="btn danger sm" type="button" data-sgd="' + s.id + '">Delete</button></div></article>';
  }).join("") : '<p class="empty">No ' + (sgFilter === "new" ? "new" : sgFilter) + " suggestions.</p>";
}
document.addEventListener("submit", function (e) {
  if (e.target.id !== "sgForm") return; e.preventDefault();
  var t = $("sgText").value.trim(); if (t.length < 3) { $("sgErr").textContent = "Please write your suggestion first."; return; }
  $("sgBtn").disabled = true; $("sgErr").textContent = "";
  api("api/suggest", { body: t }).then(function (r) {
    $("sgBtn").disabled = false;
    if (!r.ok) { $("sgErr").textContent = r.error; return; }
    $("sgText").value = ""; toast("Thank you. Your suggestion was sent anonymously."); if (isExco()) loadSuggestions();
  }).catch(function () {});
});
$("main").addEventListener("click", function (e) {
  var b;
  if ((b = e.target.closest("[data-sgf]"))) { sgFilter = b.getAttribute("data-sgf"); document.querySelectorAll("[data-sgf]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); drawSg(); return; }
  if ((b = e.target.closest("[data-sgs]"))) { var p = b.getAttribute("data-sgs").split(":"); api("api/save/suggestions", { id: +p[0], status: p[1] }).then(function () { loadSuggestions(); }); return; }
  if ((b = e.target.closest("[data-sgd]"))) { if (!confirm("Delete this suggestion?")) return; api("api/delete/suggestions", { id: +b.getAttribute("data-sgd") }).then(function () { loadSuggestions(); }); return; }
});

R.settings = function () {
  return head("Exco settings", "Only Exco can see this page.") +
    '<div class="card"><h4>Money pages (offering, contributions and expenses) visible to</h4><form id="stMoney"><label class="radio"><input type="radio" name="money" value="exco"' + (ME.money === "exco" ? " checked" : "") + '><span><b>Exco only</b><br><span class="meta">Members will not see the Offering, Contributions and Expenses pages.</span></span></label><label class="radio"><input type="radio" name="money" value="all"' + (ME.money === "all" ? " checked" : "") + '><span><b>All youth (view only)</b><br><span class="meta">Members can see them but cannot change anything.</span></span></label><button class="btn pri" type="submit">Save</button> <span id="stMsg" class="ok"></span></form></div>' +
    '<div class="card"><h4>Welcome voice</h4><label class="radio"><input type="checkbox" id="stVoice"' + (ME.voice !== false ? " checked" : "") + '><span><b>Play "Welcome to the Youth Cave" after login</b><br><span class="meta">A short welcome voice plays once each time someone signs in with a password. It does not play when the page is reopened.</span></span></label><span id="stVMsg" class="ok"></span></div>' +
    pwCard("youth", "Youth password", "The password members use. Everyone signed in with the old one will need the new one.") +
    pwCard("exco", "Exco password", "The password for Exco. Other Exco members signed in with the old one will need the new one.") +
    '<div class="card"><h4>Link to share</h4><p class="body" id="stLink"></p><h4 style="margin-top:14px">What is stored</h4><p class="meta" id="stCounts">Loading...</p></div>';
};
function pwCard(w, t, s) { return '<div class="card"><h4>Change ' + t + '</h4><p class="meta">' + s + '</p><form data-pw="' + w + '"><label for="pw_' + w + '">New ' + t.toLowerCase() + '</label><input type="text" id="pw_' + w + '" autocomplete="new-password" minlength="8" required><label for="pw2_' + w + '">Type it again</label><input type="text" id="pw2_' + w + '" autocomplete="new-password" minlength="8" required><button class="btn pri wide" type="submit">Change ' + t.toLowerCase() + '</button><p class="err" id="pwm_' + w + '" role="alert"></p></form></div>'; }
function loadSettings() {
  $("stLink").textContent = (ME.base || location.origin) + "/";
  api("api/settings").then(function (r) {
    if (!r.ok) return;
    var c = r.counts;
    $("stCounts").textContent = "Announcements " + c.announcements + ", events " + c.events + ", roster entries " + c.roster + ", meetings " + c.minutes + ", action items " + c.actions + ", offering records " + c.offerings + ", contribution members " + c.members + ", contribution cells " + c.contrib + ", expenses " + c.expenses + ", Exco " + c.exco + ", suggestions " + c.suggestions + (r.files != null ? ", uploaded files " + r.files : "") + ".";
  }).catch(function () {});
}
document.addEventListener("submit", function (e) {
  var f = e.target;
  if (f.id === "stMoney") {
    e.preventDefault(); var v = (f.querySelector("input[name=money]:checked") || {}).value;
    api("api/settings", { money: v }).then(function (r) { if (!r.ok) { toast(r.error); return; } ME.money = r.money; $("stMsg").textContent = "Saved"; toast("Saved"); });
    return;
  }
  var w = f.getAttribute && f.getAttribute("data-pw");
  if (w) {
    e.preventDefault(); var a = $("pw_" + w).value.trim(), b2 = $("pw2_" + w).value.trim(), m = $("pwm_" + w);
    m.className = "err";
    if (a.length < 8) { m.textContent = "Use at least 8 characters."; return; }
    if (a !== b2) { m.textContent = "The two passwords do not match."; return; }
    if (!confirm("Change the " + (w === "exco" ? "Exco" : "Youth") + " password now?")) return;
    api("api/password", { which: w, password: a }).then(function (r) {
      if (!r.ok) { m.textContent = r.error; return; }
      $("pw_" + w).value = ""; $("pw2_" + w).value = ""; m.className = "ok"; m.textContent = "Changed. Share the new password with " + (w === "exco" ? "the Exco." : "the youth.");
    });
  }
});

document.addEventListener("change", function (e) {
  var c = e.target; if (!c || c.id !== "stVoice") return;
  var on = !!c.checked; c.disabled = true; $("stVMsg").textContent = "";
  api("api/settings", { voice: on }).then(function (r) {
    c.disabled = false;
    if (!r.ok) { c.checked = !on; toast(r.error || "Could not save."); return; }
    ME.voice = r.voice !== false; $("stVMsg").textContent = ME.voice ? "On" : "Off"; toast(ME.voice ? "Welcome voice on" : "Welcome voice off");
  }).catch(function () { c.disabled = false; c.checked = !on; });
});

// ---------- jobs & opportunities ----------
var JB = { rows: [], updated: 0, loaded: false }, jbCat = "all", jbQ = "";
var JCATS = [["all", "All"], ["jobs", "Jobs & Internships"], ["tech", "Tech"], ["remote", "Remote"], ["scholarships", "Scholarships"]];
var JLAB = { jobs: "Jobs & Internships", tech: "Tech", remote: "Remote", scholarships: "Scholarships" };
R.jobs = function () {
  var h = head("Jobs &amp; Opportunities", "Entry-level jobs, internships and graduate trainee roles in Lagos and Ogun, remote jobs open to Nigerians, tech roles and scholarships. Updated every morning.", '<button class="btn grn sm" type="button" data-jbadd="1">Add listing</button>');
  h += '<p class="jupd" id="jbUpd">' + (JB.loaded ? jbUpdText() : "Loading...") + "</p>";
  h += '<div class="chips" role="group" aria-label="Filter listings">' + JCATS.map(function (c) { return '<button type="button" class="chip" data-jbc="' + c[0] + '" aria-pressed="' + (jbCat === c[0]) + '">' + c[1] + "</button>"; }).join("") + "</div>";
  h += '<label class="sr" for="jbQ">Search listings</label><input id="jbQ" class="jsearch" type="search" placeholder="Search title, company or place" value="' + esc(jbQ) + '" autocomplete="off">';
  h += '<div id="jbList">' + (JB.loaded ? "" : '<p class="muted">Loading...</p>') + "</div>";
  h += '<p class="jnote">Always confirm details on the official site. Never pay anyone to get a job or scholarship.</p>';
  return h;
};
function jbUpdText() {
  if (!JB.updated) return "Not updated yet.";
  var d = new Date(JB.updated);
  return "Updated " + d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) + " at " + d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).toUpperCase();
}
function loadJobs() {
  api("api/jobs").then(function (r) {
    if (!r.ok) { if ($("jbList")) $("jbList").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    JB = { rows: r.rows || [], updated: r.updated || 0, loaded: true };
    if (cur !== "jobs") return;
    if ($("jbUpd")) $("jbUpd").textContent = jbUpdText();
    drawJobs();
  }).catch(function () {});
}
function jbMatch(j) {
  if (jbCat !== "all" && j.category !== jbCat && ("," + (j.tags || "") + ",").indexOf("," + jbCat + ",") < 0) return false;
  if (!jbQ) return true;
  var hay = (j.title + " " + (j.org || "") + " " + (j.location || "") + " " + (j.source || "") + " " + (j.summary || "")).toLowerCase();
  return jbQ.toLowerCase().split(/\s+/).every(function (w) { return !w || hay.indexOf(w) >= 0; });
}
function jobCard(j) {
  var safe = /^https?:\/\//i.test(j.url) ? j.url : "#";
  var tags = '<span class="tag' + (j.category === "scholarships" ? " g" : "") + '">' + esc(JLAB[j.category] || "Jobs") + "</span>";
  (j.tags || "").split(",").forEach(function (t) { if (JLAB[t]) tags += ' <span class="tag">' + esc(JLAB[t]) + "</span>"; });
  var bits = [];
  if (j.deadline) bits.push("<b>Deadline:</b> " + fdate(j.deadline));
  bits.push("Found " + fdate(j.found));
  if (j.source) bits.push(esc(j.source));
  return '<article class="card job' + (j.hidden ? " hid" : "") + '">' + (j.hidden ? '<span class="tag r">Hidden from members</span>' : "") +
    "<h4>" + esc(j.title) + "</h4>" + (j.org ? '<div class="jorg">' + esc(j.org) + "</div>" : "") +
    '<div class="meta">' + esc(j.location || (j.category === "remote" ? "Remote" : "Nigeria")) + "</div>" +
    '<div class="jtags">' + tags + "</div>" + (j.summary ? '<p class="jsum">' + esc(j.summary) + "</p>" : "") +
    '<div class="meta">' + bits.join(" &middot; ") + "</div>" +
    '<div class="acts"><a class="btn pri sm" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">Apply / Details</a>' +
    (isExco() ? '<button class="btn ghost sm" type="button" data-jbe="' + j.id + '">Edit</button><button class="btn ghost sm" type="button" data-jbh="' + j.id + '">' + (j.hidden ? "Show" : "Hide") + '</button><button class="btn danger sm" type="button" data-jbd="' + j.id + '">Delete</button>' : "") +
    "</div></article>";
}
function drawJobs() {
  var el = $("jbList"); if (!el) return;
  var list = JB.rows.filter(jbMatch);
  el.innerHTML = '<p class="muted jcount">' + list.length + " listing" + (list.length === 1 ? "" : "s") + "</p>" +
    (list.length ? list.map(jobCard).join("") : '<p class="empty">' + (JB.rows.length ? "Nothing matches. Try another filter or search." : "No listings yet. New ones are added every morning.") + "</p>");
}
function editJob(j) {
  j = j || {};
  var opts = JCATS.slice(1).map(function (c) { return '<option value="' + c[0] + '"' + ((j.category || "jobs") === c[0] ? " selected" : "") + ">" + c[1] + "</option>"; }).join("");
  var html = '<label for="jf_title">Title</label><input id="jf_title" maxlength="200" required value="' + esc(j.title || "") + '">' +
    '<label for="jf_org">Organisation</label><input id="jf_org" maxlength="160" value="' + esc(j.org || "") + '">' +
    '<label for="jf_location">Location</label><input id="jf_location" maxlength="120" placeholder="Lagos, Ogun or Remote" value="' + esc(j.location || "") + '">' +
    '<label for="jf_category">Category</label><select id="jf_category">' + opts + "</select>" +
    '<label for="jf_deadline">Deadline (if known)</label><input id="jf_deadline" type="date" value="' + esc(j.deadline || "") + '">' +
    '<label for="jf_url">Link to apply or read more</label><input id="jf_url" type="url" inputmode="url" maxlength="600" placeholder="https://" required value="' + esc(j.url || "") + '">' +
    '<label for="jf_summary">Short note (optional)</label><textarea id="jf_summary" maxlength="600">' + esc(j.summary || "") + "</textarea>" +
    '<p class="err" id="merr" role="alert"></p><div class="mf-actions"><button type="submit" class="btn pri" id="msave">' + (j.id ? "Save changes" : "Add") + "</button></div>";
  openModal(j.id ? "Edit listing" : "Add a listing", html, function () {
    var body = { title: $("jf_title").value, org: $("jf_org").value, location: $("jf_location").value, category: $("jf_category").value, deadline: $("jf_deadline").value, url: $("jf_url").value.trim(), summary: $("jf_summary").value };
    if (j.id) body.id = j.id;
    $("msave").disabled = true;
    api("api/jobs/save", body).then(function (r) {
      $("msave").disabled = false;
      if (!r.ok) { $("merr").textContent = r.error; return; }
      closeModal(); toast(j.id ? "Saved" : "Added"); loadJobs();
    }).catch(function () { $("msave").disabled = false; });
  });
}
$("main").addEventListener("click", function (e) {
  var b;
  if ((b = e.target.closest("[data-jbc]"))) { jbCat = b.getAttribute("data-jbc"); document.querySelectorAll("[data-jbc]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); drawJobs(); return; }
  if ((b = e.target.closest("[data-jbadd]"))) { if (isExco()) editJob(null); return; }
  if ((b = e.target.closest("[data-jbe]"))) { editJob(find(JB.rows, +b.getAttribute("data-jbe"))); return; }
  if ((b = e.target.closest("[data-jbh]"))) {
    var j = find(JB.rows, +b.getAttribute("data-jbh")); if (!j) return;
    api("api/jobs/hide", { id: j.id, hidden: !j.hidden }).then(function (r) { if (!r.ok) { toast(r.error); return; } toast(j.hidden ? "Shown to members" : "Hidden from members"); loadJobs(); }).catch(function () {});
    return;
  }
  if ((b = e.target.closest("[data-jbd]"))) {
    var jd = find(JB.rows, +b.getAttribute("data-jbd")); if (!jd) return;
    if (!confirm("Delete this listing? It will not be added again by the daily update.")) return;
    api("api/jobs/delete", { id: jd.id }).then(function (r) { if (!r.ok) { toast(r.error); return; } toast("Deleted"); loadJobs(); }).catch(function () {});
    return;
  }
});
$("main").addEventListener("input", function (e) { if (e.target.id === "jbQ") { jbQ = e.target.value.trim(); drawJobs(); } });

// ---------- share to WhatsApp ----------
// Tab cannot post into the WhatsApp group, so after Exco creates an item a sheet offers a ready message
// with the direct link to that item. One tap opens WhatsApp with the text filled in.
var SHARE_BASE = "https://rlw-parish.vercel.app/youth/";
var WA_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.2-.3-.2-.5-.3z"/></svg>';
var SHARE_TAB = { announcement: "announcements", event: "events", poll: "polls", roster: "roster", jobs: "jobs" };
var PW_LINE = "Use the Youth Cave password to log in.";
function shareBtn(kind, id) { return '<button class="btn ghost sm shr" type="button" data-share="' + kind + '" data-id="' + esc(id) + '" aria-label="Share to WhatsApp">' + WA_SVG + "Share</button>"; }
function itemLink(kind, id) { return SHARE_BASE + "#" + SHARE_TAB[kind] + (id != null && id !== "" ? "/" + id : ""); }
function clip(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s;
  var c = s.slice(0, n), j = Math.max(c.lastIndexOf(". "), c.lastIndexOf("! "), c.lastIndexOf("? "));
  if (j >= n * 0.5) return c.slice(0, j + 1);
  var i = c.lastIndexOf(" "); if (i > n * 0.6) c = c.slice(0, i);
  return c.replace(/[\s,.;:!?|\-]+$/, "") + "...";
}
function noDot(s) { return String(s || "").trim().replace(/[.\s]+$/, ""); }
function shareText(kind, x) {
  var L2 = [];
  if (kind === "announcement") {
    L2.push("New announcement on the Youth Cave: " + noDot(x.title));
    if (x.body) L2.push("", clip(x.body, 110));
    L2.push("", "Check it out: " + itemLink(kind, x.id));
  } else if (kind === "poll") {
    L2.push("New poll on the Youth Cave: " + String(x.question || "").trim());
    if (x.closes_at && x.open !== false) L2.push("Voting closes " + pollWhen(x.closes_at) + ".");
    L2.push("", "Cast your vote here: " + itemLink(kind, x.id));
  } else if (kind === "event") {
    var w = fdate(x.date, true) + (x.time ? ", " + ftime(x.time) : "");
    L2.push("New event: " + noDot(x.title) + " on " + w + (x.venue ? " at " + noDot(x.venue) : "") + ".");
    if (x.description) L2.push("", clip(x.description, 110));
    L2.push("", "Details: " + itemLink(kind, x.id));
  } else if (kind === "roster") {
    var duties = []; (x.rows || []).forEach(function (r) { if (duties.indexOf(r.duty) < 0) duties.push(r.duty); });
    duties.sort(function (a, b) { return a.localeCompare(b); });
    var sm = duties.length > 3 ? duties.slice(0, 3).join(", ") + " and " + (duties.length - 3) + " more" : duties.length > 1 ? duties.slice(0, -1).join(", ") + " and " + duties[duties.length - 1] : duties.join("");
    L2.push("Duty roster updated: " + fdate(x.date, true) + (sm ? " (" + sm + ")" : "") + ".");
    L2.push("", "See your duty: " + itemLink(kind, x.date));
  } else if (kind === "jobs") {
    L2.push("New jobs and opportunities on the Youth Cave.", "", "Check them out: " + itemLink("jobs"));
  }
  L2.push(PW_LINE);
  return L2.join("\n");
}
function waHref(t) { return "https://wa.me/?text=" + encodeURIComponent(t); }
function shareItem(kind, ref) {
  if (kind === "roster") { var date = typeof ref === "object" ? ref.date : ref; return { date: date, rows: (D.roster || []).filter(function (r) { return r.date === date; }) }; }
  if (ref && typeof ref === "object") return ref;
  var id = +ref;
  if (kind === "announcement") return find(D.announcements, id);
  if (kind === "event") return find(D.events, id);
  if (kind === "poll") return find(PL.rows, id) || find(D.polls_open, id);
  return null;
}
function openShare(kind, ref, isNew) {
  if (!isExco()) return;
  var x = shareItem(kind, ref); if (!x) { toast("Could not find that item."); return; }
  var t = shareText(kind, x);
  var html = '<div class="shr-s"><p class="shr-h">' + (isNew ? "Let everyone know. " : "") + "This message has the direct link. You can edit it before sending.</p>" +
    '<label class="sr" for="shTxt">Message</label><textarea id="shTxt" class="shr-t" rows="8" spellcheck="true">' + esc(t) + "</textarea>" +
    '<a class="btn grn wide shr-wa" id="shWa" href="' + esc(waHref(t)) + '" target="_blank" rel="noopener">' + WA_SVG.replace('width="18" height="18"', 'width="22" height="22"') + "Share to WhatsApp</a>" +
    '<p class="rm-s shr-n">WhatsApp opens with the message ready. Pick the Youth group and tap send.</p>' +
    '<div class="mf-actions"><button type="button" class="btn ghost" id="shCopy">Copy message</button><button type="button" class="btn ghost" id="shNo">Not now</button></div></div>';
  openModal("Share with the youth group?", html, null);
  var ta = $("shTxt"), wa = $("shWa");
  function fit() { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 2, Math.round(window.innerHeight * 0.5)) + "px"; }
  ta.addEventListener("input", function () { wa.href = waHref(ta.value); fit(); }); fit();
  wa.addEventListener("click", function () { setTimeout(closeModal, 400); });
  $("shCopy").addEventListener("click", function () { copyText(ta.value).then(function (ok) { toast(ok ? "Message copied. Paste it in the Youth group." : "Could not copy. Press and hold the text to copy it."); }); });
  $("shNo").addEventListener("click", closeModal);
}
$("main").addEventListener("click", function (e) {
  var b = e.target.closest("[data-share]"); if (!b) return;
  openShare(b.getAttribute("data-share"), b.getAttribute("data-id"), false);
});

// ---------- go ----------
if (token) start(); else { $("login").hidden = false; wvEl(); }
})();
