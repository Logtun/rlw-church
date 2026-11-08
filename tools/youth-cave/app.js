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
$("lform").addEventListener("submit", function (e) {
  e.preventDefault();
  var b = $("lbtn"); b.disabled = true; $("lerr").textContent = "";
  fetch("api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("pw").value }) })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      b.disabled = false;
      if (!r.ok) { $("lerr").textContent = r.error || "Could not sign in."; return; }
      token = r.token; try { localStorage.setItem(TK, token); } catch (e2) {}
      $("pw").value = ""; cur = "home"; try { history.replaceState(null, "", location.pathname + location.search); } catch (e3) {} start();
    }).catch(function () { b.disabled = false; $("lerr").textContent = "Network problem. Please try again."; });
});
function signOut(expired) {
  token = null; try { localStorage.removeItem(TK); } catch (e) {}
  $("app").hidden = true; $("login").hidden = false; closeModal();
  if (expired) $("lerr").textContent = "Please sign in again.";
}
$("logout").addEventListener("click", function () { api("api/logout", {}).catch(function () {}); signOut(false); });

// ---------- boot ----------
var TABS = [
  ["home", "Home"], ["notices", "Announcements"], ["events", "Events"], ["roster", "Duty roster"], ["minutes", "Minutes"],
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
  cur = t; try { history.replaceState(null, "", "#" + t); } catch (e) {}
  drawTabs(); render();
  var a = document.querySelector('.tab[aria-current="page"]'); if (a && a.scrollIntoView) a.scrollIntoView({ block: "nearest", inline: "center" });
  window.scrollTo(0, 0);
}
function load() {
  return api("api/all").then(function (r) {
    if (!r.ok) { $("main").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    D = r; ME.role = r.role; ME.money = r.money; ME.today = r.today; ME.base = r.base;
    $("roleLbl").textContent = isExco() ? "Exco" : "Member";
    if (!visibleTabs().some(function (t) { return t[0] === cur; })) cur = "home";
    drawTabs(); render();
  });
}
function start() {
  $("login").hidden = true; $("app").hidden = false;
  var h = (location.hash || "").slice(1); if (h && TABS.some(function (t) { return t[0] === h; })) cur = h;
  $("main").innerHTML = '<p class="muted">Loading...</p>';
  load().catch(function () {});
}
function refresh() { return load().catch(function () {}); }

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
  announcements: { title: "announcement", f: [["title", "Title", "text", 1], ["body", "Message", "long"], ["date", "Date", "date", 1], ["pinned", "Pin this to the top", "bool"]] },
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
      closeModal(); toast(row.id ? "Saved" : "Added"); (after || refresh)();
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
function editBtns(sec, id) { return isExco() ? '<div class="acts"><button class="btn ghost sm" type="button" data-edit="' + sec + '" data-id="' + id + '">Edit</button><button class="btn danger sm" type="button" data-del="' + sec + '" data-id="' + id + '">Delete</button></div>' : ""; }
var R = {};
function render() {
  var m = $("main");
  m.innerHTML = (R[cur] || R.home)();
  hydrateFiles(m);
  if (cur === "contrib") loadContrib();
  if (cur === "expenses") loadExpenses();
  if (cur === "suggest" && isExco()) loadSuggestions();
  if (cur === "settings") loadSettings();
  if (cur === "jobs") { if (JB.loaded) drawJobs(); loadJobs(); }
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
  if ((b = e.target.closest("[data-done]"))) {
    if (!isExco()) { e.preventDefault(); return; }
    var aid = +b.getAttribute("data-done"); api("api/save/actions", { id: aid, done: b.checked }).then(function (r) { if (!r.ok) toast(r.error); refresh(); }); return;
  }
});

function announcementCard(a) {
  return '<article class="card' + (a.pinned ? " pinned" : "") + '"><h4>' + (a.pinned ? '<span class="pin">Pinned</span>' : "") + esc(a.title) + '</h4><div class="meta">' + fdate(a.date) + "</div>" + (a.body ? '<p class="body">' + esc(a.body) + "</p>" : "") + editBtns("announcements", a.id) + "</article>";
}
function eventCard(ev) {
  return '<article class="card"><h4>' + esc(ev.title) + '</h4><div class="meta">' + fdate(ev.date, true) + (ev.time ? " at " + ftime(ev.time) : "") + (ev.venue ? " &middot; " + esc(ev.venue) : "") + "</div>" + (ev.description ? '<p class="body">' + esc(ev.description) + "</p>" : "") + fileBlock(ev.photo, "Flyer for " + ev.title) + editBtns("events", ev.id) + "</article>";
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
  return '<article class="card rday' + (thisWeek ? " this" : "") + '"><h4><span>' + fdate(d, true) + "</span>" + (d === ME.today ? '<span class="tag g">Today</span>' : "") + "</h4>" +
    rows.map(function (r) {
      return '<div class="rl2"><b>' + esc(r.duty) + "</b><span>" + (r.person ? esc(r.person) : '<span class="muted">Not assigned</span>') + "</span>" +
        (isExco() ? '<span class="mini"><button class="btn ghost sm" data-edit="roster" data-id="' + r.id + '" type="button">Edit</button><button class="btn danger sm" data-del="roster" data-id="' + r.id + '" type="button" aria-label="Delete ' + esc(r.duty) + '">Del</button></span>' : "") + "</div>";
    }).join("") + "</article>";
}

R.home = function () {
  var pinned = (D.announcements || []).filter(function (a) { return a.pinned; }).slice(0, 3);
  var latest = pinned.length ? pinned : (D.announcements || []).slice(0, 2);
  var up = (D.events || []).filter(function (e) { return e.date >= ME.today; }).slice(0, 3);
  var g = rosterGroups();
  var open = (D.actions || []).filter(function (a) { return !a.done; }).length;
  var h = '<section class="hero hero-vid"><video class="hero-bg" autoplay muted loop playsinline preload="auto" poster="bg/youth_bg_poster.jpg" aria-hidden="true"><source src="bg/youth_bg.mp4" type="video/mp4"></video><div class="hero-ov"></div><div class="hero-in"><p class="eyebrow">Welcome to the</p><h2>Youth Cave</h2><p>' + fdate(ME.today, true) + ". Everything for our youth in one place.</p></div></section>";
  h += '<div class="qk"><button type="button" data-go="events">Events<small>' + up.length + " coming up</small></button>" +
    '<button type="button" data-go="roster">Duty roster<small>' + (g.week.length ? "This week is set" : "Not set for this week") + "</small></button>" +
    '<button type="button" data-go="minutes">Minutes<small>' + open + " open action item" + (open === 1 ? "" : "s") + "</small></button>" +
    '<button type="button" data-go="suggest">Suggestion box<small>Share an idea anonymously</small></button></div>';
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
    p.then(function () { $("msave").disabled = false; if (bad) { $("merr").textContent = bad; return; } closeModal(); toast("Roster saved"); refresh(); });
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

// ---------- go ----------
if (token) start(); else $("login").hidden = false;
})();
