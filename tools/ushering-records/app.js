(function () {
"use strict";
var TK = "rlwRecordsToken";
var token = null; try { token = localStorage.getItem(TK); } catch (e) {}
var ME = { role: "member", today: "", base: "" };
var D = { attendance: [], income: [], expenses: [], registers: [] };
var cur = "overview";
var fileUrls = {};
var $ = function (id) { return document.getElementById(id); };
var MONTHS_L = ["January","February","March","April","May","June","July","August","September","October","November","December"];
var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var SERVICES = ["Sunday Service", "Digging Deep (Bible Study)", "Faith Clinic", "Special Service/Programme"];
var EXP_CATS = ["Maintenance", "Utilities", "Welfare", "Transport", "Programmes/Events", "Media & Equipment", "Outreach/Evangelism", "Remittance to Zone/Region", "Other"];
var ATT = [["men", "Men"], ["women", "Women"], ["youth", "Youth"], ["children", "Children"]];
var INC = [["offering", "Offering"], ["tithe", "Tithe"], ["thanksgiving", "Thanksgiving"], ["building", "Building fund"], ["seed", "Special seed / Pledge"], ["other", "Other"]];

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function naira(n) { n = Number(n) || 0; var neg = n < 0; n = Math.abs(n); return (neg ? "-" : "") + "\u20A6" + n.toLocaleString("en-NG", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
function num(n) { return (Number(n) || 0).toLocaleString("en-NG"); }
function cnt(v) { return v == null || v === "" ? "-" : num(v); }
function mny(v) { return v == null || v === "" ? "-" : naira(v); }
function pdate(s) { var p = String(s || "").split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function fdate(s) { if (!s) return ""; return pdate(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
function tdate(s) { if (!s) return ""; return pdate(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }); }
function sdate(s) { if (!s) return ""; return pdate(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }); }
function monthLabel(ym) { return MONTHS_L[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4); }
function shiftMonth(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + "-" + String(m + 1).padStart(2, "0"); }
function isAdmin() { return ME.role === "admin"; }
function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("on"); }, 2600); }
function attTotal(r) { return ATT.reduce(function (a, k) { return a + (Number(r[k[0]]) || 0); }, 0); }
function incTotal(r) { return Math.round(INC.reduce(function (a, k) { return a + (Number(r[k[0]]) || 0); }, 0) * 100) / 100; }
function inMonth(list, ym) { return (list || []).filter(function (r) { return (r.date || "").slice(0, 7) === ym; }); }

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
function download(path, fname) {
  fetch(path, { headers: { authorization: "Bearer " + token } }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (bl) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = fname; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }).catch(function () { toast("Could not download. Please try again."); });
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
      $("pw").value = ""; cur = "overview"; try { history.replaceState(null, "", location.pathname + location.search); } catch (e3) {} start();
    }).catch(function () { b.disabled = false; $("lerr").textContent = "Network problem. Please try again."; });
});
function signOut(expired) {
  token = null; try { localStorage.removeItem(TK); } catch (e) {}
  $("app").hidden = true; $("login").hidden = false; closeModal();
  if (expired) $("lerr").textContent = "Please sign in again.";
}
$("logout").addEventListener("click", function () { api("api/logout", {}).catch(function () {}); signOut(false); });

// ---------- boot ----------
var TABS = [["overview", "Overview"], ["attendance", "Attendance"], ["income", "Offerings & Income"], ["expenses", "Expenses"], ["summary", "Financial Summary"], ["other", "Other Records"], ["settings", "Settings"]];
function visibleTabs() { return TABS.filter(function (t) { return t[0] !== "settings" || isAdmin(); }); }
function drawTabs() {
  $("tabs").innerHTML = visibleTabs().map(function (t) {
    return '<button class="tab" type="button" data-tab="' + t[0] + '"' + (t[0] === cur ? ' aria-current="page"' : "") + ">" + esc(t[1]) + "</button>";
  }).join("");
}
$("tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) go(b.getAttribute("data-tab")); });
function go(t) {
  cur = t; try { history.replaceState(null, "", "#" + t); } catch (e) {}
  drawTabs(); render(); window.scrollTo(0, 0);
}
var mon = null, sumYear = null, regSel = 0;
function load() {
  return api("api/all").then(function (r) {
    if (!r.ok) { $("main").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    D = r; ME.role = r.role; ME.today = r.today; ME.base = r.base;
    if (!mon) mon = r.today.slice(0, 7);
    if (!sumYear) sumYear = +r.today.slice(0, 4);
    $("roleLbl").textContent = isAdmin() ? "Ushers / Admin" : "Member (view only)";
    if (!visibleTabs().some(function (t) { return t[0] === cur; })) cur = "overview";
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
    fileSrc(k).then(function (u) { if (el.tagName === "IMG") el.src = u; else el.href = u; })
      .catch(function () { if (el.tagName === "IMG") el.replaceWith(document.createTextNode("")); });
  });
}
function fileLink(key, label) {
  if (!key) return '<span class="muted">-</span>';
  return '<a class="flink" target="_blank" rel="noopener" data-file="' + esc(key) + '" href="#">' + (/\.pdf$/.test(key) ? "PDF" : "Photo") + '<span class="sr"> of the ' + esc(label) + "</span></a>";
}
function shrink(file) {
  return new Promise(function (res) {
    if (!/^image\/(jpeg|png|webp)/i.test(file.type) || file.size < 400 * 1024) return res(file);
    var img = new Image(), u = URL.createObjectURL(file);
    img.onload = function () {
      var M = 1800, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, M / Math.max(w, h));
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
    if (/heic|heif/i.test(type)) return { ok: false, error: "That photo format is not supported. Take a screenshot of it or save it as JPG, then upload again." };
    return api("api/upload", b, type);
  });
}

// ---------- modal form ----------
var FORMS = {
  attendance: { title: "attendance record", f: [["date", "Date", "date", 1], ["service", "Service (pick one or type your own)", "svc", 1], ["_h1", "Head count", "hint"], ["men", "Men", "count"], ["women", "Women", "count"], ["youth", "Youth", "count"], ["children", "Children", "count"], ["first_timers", "First-timers (already counted above)", "count"], ["vehicles", "Vehicles (optional)", "count"], ["ushers", "Ushers on duty", "text", 0, "Names of the ushers"], ["notes", "Notes", "long"]] },
  income: { title: "income record", f: [["date", "Date", "date", 1], ["service", "Service (pick one or type your own)", "svc", 1], ["_h1", "Amounts in Naira. Leave blank what was not collected.", "hint"], ["offering", "Offering (\u20A6)", "money"], ["tithe", "Tithe (\u20A6)", "money"], ["thanksgiving", "Thanksgiving (\u20A6)", "money"], ["building", "Building fund (\u20A6)", "money"], ["seed", "Special seed / Pledge (\u20A6)", "money"], ["other", "Other (\u20A6)", "money"], ["counted_by", "Counted by", "text", 0, "Names of the counters"], ["verified_by", "Verified by", "text", 0, "Name"], ["notes", "Notes", "long"], ["photo", "Photo of the count sheet (optional)", "doc"]] },
  expenses: { title: "expense", f: [["date", "Date", "date", 1], ["item", "Item or description", "text", 1, "Generator repair"], ["category", "Category (pick one or type your own)", "cat", 1], ["amount", "Amount (\u20A6)", "money", 1], ["paid_to", "Paid to", "text", 0, "Shop, vendor or person"], ["approved_by", "Approved by", "text", 0, "Name"], ["receipt", "Receipt photo or PDF (optional)", "doc"], ["notes", "Notes", "long"]] }
};
var modalSubmit = null;
function openModal(title, html, onSubmit) {
  $("mh").textContent = title; $("mform").innerHTML = html; modalSubmit = onSubmit;
  $("modal").hidden = false; document.body.style.overflow = "hidden";
  var f = $("mform").querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=file]),textarea,select");
  if (f && window.innerWidth > 700) f.focus();
}
function closeModal() { $("modal").hidden = true; document.body.style.overflow = ""; modalSubmit = null; }
$("mclose").addEventListener("click", closeModal);
$("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
$("mform").addEventListener("submit", function (e) { e.preventDefault(); if (modalSubmit) modalSubmit(); });

function usedValues(list, key, base) {
  var out = base.slice();
  (list || []).forEach(function (r) { var v = r[key]; if (v && out.indexOf(v) < 0) out.push(v); });
  return out;
}
function fieldHtml(fd, v) {
  var k = fd[0], lab = fd[1], t = fd[2], req = fd[3], ph = fd[4] || "";
  var id = "f_" + k, rq = req ? " required" : "", val = v == null ? "" : v;
  if (t === "hint") return '<p class="hint fsec">' + esc(lab) + "</p>";
  var h = '<label for="' + id + '">' + esc(lab) + "</label>";
  if (t === "long") return h + '<textarea id="' + id + '" placeholder="' + esc(ph) + '">' + esc(val) + "</textarea>";
  if (t === "doc") {
    return h + '<input type="file" id="' + id + '" accept="image/jpeg,image/png,image/webp,application/pdf"><input type="hidden" id="' + id + '_key" value="' + esc(val) + '">' +
      '<div class="fprev" id="' + id + '_prev">' + (val ? (/\.pdf$/.test(val) ? "PDF attached" : '<img alt="" data-file="' + esc(val) + '">') + ' <button type="button" class="btn ghost sm" data-clear="' + id + '">Remove</button>' : "") + "</div>";
  }
  if (t === "svc" || t === "cat") {
    var opts = t === "svc" ? usedValues((D.attendance || []).concat(D.income || []), "service", SERVICES) : usedValues(D.expenses, "category", EXP_CATS);
    return h + '<input id="' + id + '" list="' + id + '_l" maxlength="' + (t === "svc" ? 80 : 60) + '" autocomplete="off" value="' + esc(val) + '"' + rq + ' placeholder="' + (t === "svc" ? "Sunday Service" : "Maintenance") + '"><datalist id="' + id + '_l">' + opts.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + "</datalist>";
  }
  var type = t === "date" ? "date" : "text";
  var extra = t === "money" ? ' inputmode="decimal" placeholder="0"' : t === "count" ? ' inputmode="numeric" pattern="[0-9]*" placeholder="0"' : (ph ? ' placeholder="' + esc(ph) + '"' : "");
  return h + '<input type="' + type + '" id="' + id + '" value="' + esc(val) + '"' + rq + extra + ">";
}
function wireFiles() {
  $("mform").querySelectorAll("input[type=file]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var prev = $(inp.id + "_prev"); prev.textContent = "Uploading...";
      $("msave").disabled = true;
      uploadFile(f).then(function (r) {
        $("msave").disabled = false;
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
    var k = fd[0], t = fd[2];
    if (t === "hint") return;
    o[k] = t === "doc" ? $("f_" + k + "_key").value : $("f_" + k).value;
  });
  return o;
}
function editRow(sec, row) {
  var F = FORMS[sec]; row = row || {};
  var html = F.f.map(function (fd) { return fieldHtml(fd, row[fd[0]]); }).join("") +
    '<p class="err" id="merr" role="alert"></p><div class="mf-actions">' +
    (row.id ? '<button type="button" class="btn danger" id="mdel">Delete</button>' : "") +
    '<button type="submit" class="btn pri" id="msave">' + (row.id ? "Save changes" : "Add") + "</button></div>";
  openModal((row.id ? "Edit " : "Add ") + F.title, html, function () {
    var body = readForm(sec); if (row.id) body.id = row.id;
    $("msave").disabled = true; $("merr").textContent = "";
    api("api/save/" + sec, body).then(function (r) {
      $("msave").disabled = false;
      if (!r.ok) { $("merr").textContent = r.error; return; }
      if (body.date) mon = body.date.slice(0, 7);
      closeModal(); toast(row.id ? "Saved" : "Added"); refresh();
    }).catch(function () {});
  });
  wireFiles();
  if (row.id) $("mdel").addEventListener("click", function () { delRow(sec, row.id, F.title); });
}
function delRow(sec, id, title) {
  if (!confirm("Delete this " + title + "? This cannot be undone.")) return;
  api("api/delete/" + sec, { id: id }).then(function (r) {
    if (!r.ok) { toast(r.error); return; }
    closeModal(); toast("Deleted"); refresh();
  }).catch(function () {});
}
function find(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }

// ---------- render helpers ----------
function head(title, sub, btn) {
  return '<div class="ph"><h2>' + title + "</h2>" + (btn && isAdmin() ? btn : "") + (sub ? "<p>" + sub + "</p>" : "") + "</div>";
}
function addBtn(sec, label) { return '<button class="btn grn sm" type="button" data-add="' + sec + '">' + label + "</button>"; }
function editCell(sec, id) { return isAdmin() ? '<td class="act"><button class="btn ghost xs" type="button" data-edit="' + sec + '" data-id="' + id + '">Edit</button></td>' : ""; }
function monthBar(csvKind) {
  return '<div class="mbar"><div class="row exmon"><button class="btn ghost" type="button" data-mon="-1" aria-label="Previous month">&lsaquo;</button><label class="sr" for="monIn">Month</label><input type="month" id="monIn" value="' + mon + '"><button class="btn ghost" type="button" data-mon="1" aria-label="Next month">&rsaquo;</button></div>' +
    (csvKind ? '<div class="csvs"><button class="btn ghost sm" type="button" data-csv="' + csvKind + '" data-scope="month">This month (CSV)</button><button class="btn ghost sm" type="button" data-csv="' + csvKind + '" data-scope="year">Whole ' + mon.slice(0, 4) + " (CSV)</button></div>" : "") + "</div>";
}
function stat(label, value, cls, sub) { return '<div class="stat' + (cls ? " " + cls : "") + '"><span>' + esc(label) + "</span><b>" + value + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; }
function emptyRow(cols, text) { return '<tr><td class="none" colspan="' + cols + '">' + text + "</td></tr>"; }
var R = {};

// ---------- overview ----------
R.overview = function () {
  var ym = ME.today.slice(0, 7);
  var att = inMonth(D.attendance, ym), inc = inMonth(D.income, ym), ex = inMonth(D.expenses, ym);
  var attSum = att.reduce(function (a, r) { return a + attTotal(r); }, 0);
  var avg = att.length ? Math.round(attSum / att.length) : 0;
  var ti = inc.reduce(function (a, r) { return a + incTotal(r); }, 0), te = ex.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
  var bal = Math.round((ti - te) * 100) / 100;
  var h = head("Overview", monthLabel(ym) + " at a glance. " + (isAdmin() ? "You are signed in as Ushers / Admin and can add and edit records." : "You are signed in as a member and can view the records."));
  h += '<div class="stats s4">' + stat("Attendance average", att.length ? num(avg) : "-", "", att.length ? att.length + " service" + (att.length === 1 ? "" : "s") : "No services yet") + stat("Total income", naira(ti), "g", inc.length + " record" + (inc.length === 1 ? "" : "s")) + stat("Total expenses", naira(te), "", ex.length + " record" + (ex.length === 1 ? "" : "s")) + stat("Balance", naira(bal), bal < 0 ? "neg" : "b", "Income minus expenses") + "</div>";
  if (isAdmin()) h += '<div class="qadd">' + addBtn("attendance", "Add attendance") + addBtn("income", "Add income") + addBtn("expenses", "Add expense") + "</div>";
  var all = [];
  (D.attendance || []).forEach(function (r) { all.push({ d: r.date, c: r.created_at, t: "Attendance", w: r.service, v: num(attTotal(r)) + " people", go: "attendance" }); });
  (D.income || []).forEach(function (r) { all.push({ d: r.date, c: r.created_at, t: "Income", w: r.service, v: naira(incTotal(r)), go: "income" }); });
  (D.expenses || []).forEach(function (r) { all.push({ d: r.date, c: r.created_at, t: "Expense", w: r.item + (r.category ? " (" + r.category + ")" : ""), v: naira(r.amount), go: "expenses" }); });
  all.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : (b.c || 0) - (a.c || 0); });
  h += '<h3 class="sh">Latest records</h3>';
  if (!all.length) h += '<p class="empty">No records yet. ' + (isAdmin() ? "Use the buttons above to add the first attendance, income or expense record." : "Records will show here once the Ushers / Admin add them.") + "</p>";
  else h += '<div class="tscroll"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Details</th><th class="n">Figure</th></tr></thead><tbody>' + all.slice(0, 5).map(function (x) {
    return '<tr><td class="nw">' + esc(sdate(x.d) + " " + x.d.slice(0, 4)) + '</td><td><button class="lnk" type="button" data-go="' + x.go + '">' + x.t + "</button></td><td>" + esc(x.w) + '</td><td class="n">' + x.v + "</td></tr>";
  }).join("") + "</tbody></table></div>";
  return h;
};

// ---------- attendance ----------
R.attendance = function () {
  var rows = inMonth(D.attendance, mon);
  var h = head("Attendance", "One row per service. The total adds men, women, youth and children.", addBtn("attendance", "Add attendance"));
  h += monthBar("attendance");
  var T = { men: 0, women: 0, youth: 0, children: 0, total: 0, first_timers: 0, vehicles: 0 };
  rows.forEach(function (r) { ATT.forEach(function (k) { T[k[0]] += Number(r[k[0]]) || 0; }); T.total += attTotal(r); T.first_timers += Number(r.first_timers) || 0; T.vehicles += Number(r.vehicles) || 0; });
  var n = rows.length, avg = function (v) { return n ? num(Math.round(v / n)) : "-"; };
  var cols = 11 + (isAdmin() ? 1 : 0);
  h += '<div class="tscroll"><table class="tbl"><thead><tr><th>Date</th><th>Service</th><th class="n">Men</th><th class="n">Women</th><th class="n">Youth</th><th class="n">Children</th><th class="n tc">Total</th><th class="n">First-timers</th><th class="n">Vehicles</th><th>Ushers on duty</th><th>Notes</th>' + (isAdmin() ? '<th><span class="sr">Edit</span></th>' : "") + "</tr></thead><tbody>" +
    (n ? rows.map(function (r) {
      return '<tr><td class="nw" title="' + esc(fdate(r.date)) + '">' + esc(tdate(r.date)) + '</td><td class="sv">' + esc(r.service) + '</td><td class="n">' + cnt(r.men) + '</td><td class="n">' + cnt(r.women) + '</td><td class="n">' + cnt(r.youth) + '</td><td class="n">' + cnt(r.children) + '</td><td class="n tc">' + num(attTotal(r)) + '</td><td class="n">' + cnt(r.first_timers) + '</td><td class="n">' + cnt(r.vehicles) + "</td><td>" + esc(r.ushers) + '</td><td class="nt">' + esc(r.notes) + "</td>" + editCell("attendance", r.id) + "</tr>";
    }).join("") : emptyRow(cols, "No attendance records for " + esc(monthLabel(mon)) + " yet.")) + "</tbody>" +
    (n ? '<tfoot><tr><td colspan="2">Total</td><td class="n">' + num(T.men) + '</td><td class="n">' + num(T.women) + '</td><td class="n">' + num(T.youth) + '</td><td class="n">' + num(T.children) + '</td><td class="n tc">' + num(T.total) + '</td><td class="n">' + num(T.first_timers) + '</td><td class="n">' + num(T.vehicles) + '</td><td colspan="' + (2 + (isAdmin() ? 1 : 0)) + '"></td></tr>' +
      '<tr class="avg"><td colspan="2">Average per service</td><td class="n">' + avg(T.men) + '</td><td class="n">' + avg(T.women) + '</td><td class="n">' + avg(T.youth) + '</td><td class="n">' + avg(T.children) + '</td><td class="n tc">' + avg(T.total) + '</td><td class="n">' + avg(T.first_timers) + '</td><td class="n">' + avg(T.vehicles) + '</td><td colspan="' + (2 + (isAdmin() ? 1 : 0)) + '"></td></tr></tfoot>' : "") + "</table></div>";
  if (n) h += '<p class="meta tmeta">' + n + " service" + (n === 1 ? "" : "s") + " in " + esc(monthLabel(mon)) + " &middot; " + num(T.total) + " total attendance &middot; average " + avg(T.total) + " per service</p>";
  return h;
};

// ---------- income ----------
R.income = function () {
  var rows = inMonth(D.income, mon);
  var h = head("Offerings &amp; Income", "One row per service. The total adds every column.", addBtn("income", "Add income"));
  h += monthBar("income");
  var T = {}; INC.forEach(function (k) { T[k[0]] = 0; }); var all = 0;
  rows.forEach(function (r) { INC.forEach(function (k) { T[k[0]] += Number(r[k[0]]) || 0; }); all += incTotal(r); });
  var cols = 14 + (isAdmin() ? 1 : 0);
  h += '<div class="tscroll"><table class="tbl"><thead><tr><th>Date</th><th>Service</th>' + INC.map(function (k) { return '<th class="n">' + k[1] + "</th>"; }).join("") + '<th class="n tc">Total</th><th>Counted by</th><th>Verified by</th><th>Count sheet</th><th>Notes</th>' + (isAdmin() ? '<th><span class="sr">Edit</span></th>' : "") + "</tr></thead><tbody>" +
    (rows.length ? rows.map(function (r) {
      return '<tr><td class="nw" title="' + esc(fdate(r.date)) + '">' + esc(tdate(r.date)) + '</td><td class="sv">' + esc(r.service) + "</td>" + INC.map(function (k) { return '<td class="n">' + mny(r[k[0]]) + "</td>"; }).join("") + '<td class="n tc">' + naira(incTotal(r)) + "</td><td>" + esc(r.counted_by) + "</td><td>" + esc(r.verified_by) + "</td><td>" + fileLink(r.photo, "count sheet") + '</td><td class="nt">' + esc(r.notes) + "</td>" + editCell("income", r.id) + "</tr>";
    }).join("") : emptyRow(cols, "No income records for " + esc(monthLabel(mon)) + " yet.")) + "</tbody>" +
    (rows.length ? '<tfoot><tr><td colspan="2">Month total</td>' + INC.map(function (k) { return '<td class="n">' + naira(T[k[0]]) + "</td>"; }).join("") + '<td class="n tc">' + naira(all) + '</td><td colspan="' + (4 + (isAdmin() ? 1 : 0)) + '"></td></tr></tfoot>' : "") + "</table></div>";
  if (rows.length) h += '<p class="meta tmeta">' + rows.length + " record" + (rows.length === 1 ? "" : "s") + " in " + esc(monthLabel(mon)) + " &middot; total income " + naira(all) + "</p>";
  return h;
};

// ---------- expenses ----------
R.expenses = function () {
  var rows = inMonth(D.expenses, mon);
  var h = head("Expenses", "Every payment the church made, with its receipt.", addBtn("expenses", "Add expense"));
  h += monthBar("expenses");
  var total = 0, by = {};
  rows.forEach(function (r) { var a = Number(r.amount) || 0; total += a; by[r.category || "Other"] = (by[r.category || "Other"] || 0) + a; });
  var cols = 8 + (isAdmin() ? 1 : 0);
  h += '<div class="tscroll"><table class="tbl"><thead><tr><th>Date</th><th>Item</th><th>Category</th><th class="n tc">Amount</th><th>Paid to</th><th>Approved by</th><th>Receipt</th><th>Notes</th>' + (isAdmin() ? '<th><span class="sr">Edit</span></th>' : "") + "</tr></thead><tbody>" +
    (rows.length ? rows.map(function (r) {
      return '<tr><td class="nw" title="' + esc(fdate(r.date)) + '">' + esc(tdate(r.date)) + '</td><td class="sv">' + esc(r.item) + "</td><td>" + esc(r.category) + '</td><td class="n tc">' + naira(r.amount) + "</td><td>" + esc(r.paid_to) + "</td><td>" + esc(r.approved_by) + "</td><td>" + fileLink(r.receipt, "receipt") + '</td><td class="nt">' + esc(r.notes) + "</td>" + editCell("expenses", r.id) + "</tr>";
    }).join("") : emptyRow(cols, "No expenses for " + esc(monthLabel(mon)) + " yet.")) + "</tbody>" +
    (rows.length ? '<tfoot><tr><td colspan="3">Month total</td><td class="n tc">' + naira(total) + '</td><td colspan="' + (4 + (isAdmin() ? 1 : 0)) + '"></td></tr></tfoot>' : "") + "</table></div>";
  if (rows.length) {
    var cats = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    h += '<h3 class="sh">By category</h3><div class="tscroll"><table class="tbl"><thead><tr><th>Category</th><th class="n">Amount</th><th class="n">Share</th></tr></thead><tbody>' + cats.map(function (c) { return "<tr><td>" + esc(c) + '</td><td class="n">' + naira(by[c]) + '</td><td class="n">' + (total ? Math.round(by[c] / total * 100) : 0) + "%</td></tr>"; }).join("") + '</tbody><tfoot><tr><td>Total</td><td class="n">' + naira(total) + '</td><td class="n">100%</td></tr></tfoot></table></div>';
  }
  return h;
};

// ---------- financial summary ----------
var SUM = null;
R.summary = function () {
  var h = head("Financial Summary", "Income, expenses and the balance for the month, and the whole year at a glance.");
  h += monthBar("");
  h += '<div class="csvs solo"><button class="btn ghost sm" type="button" data-csv="summary" data-scope="month">Download ' + esc(monthLabel(mon)) + ' summary (CSV)</button></div>';
  h += '<div id="sumWrap"><p class="muted">Loading...</p></div>';
  return h;
};
function loadSummary() {
  var y = sumYear || +mon.slice(0, 4);
  api("api/summary?month=" + mon + "&year=" + y).then(function (r) {
    if (!r.ok) { $("sumWrap").innerHTML = '<p class="err">' + esc(r.error) + "</p>"; return; }
    SUM = r; drawSummary();
  }).catch(function () {});
}
function drawSummary() {
  var w = $("sumWrap"); if (!w || !SUM) return;
  var m = SUM.month, Y = SUM.year;
  var h = '<div class="stats s3">' + stat("Income", naira(m.income), "g", m.income_records + " record" + (m.income_records === 1 ? "" : "s")) + stat("Expenses", naira(m.expenses), "", m.expense_records + " record" + (m.expense_records === 1 ? "" : "s")) + stat("Balance", naira(m.balance), m.balance < 0 ? "neg" : "b", m.balance < 0 ? "Spending was more than income this month" : "Income minus expenses") + "</div>";
  h += '<div class="grid2"><div><h3 class="sh">Income by type</h3><div class="tscroll"><table class="tbl"><tbody>' + INC.map(function (k) { return "<tr><td>" + k[1] + '</td><td class="n">' + naira(m.income_by_type[k[0]]) + "</td></tr>"; }).join("") + '</tbody><tfoot><tr><td>Total income</td><td class="n">' + naira(m.income) + "</td></tr></tfoot></table></div></div>";
  h += '<div><h3 class="sh">Expenses by category</h3><div class="tscroll"><table class="tbl"><tbody>' + (m.expense_by_category.length ? m.expense_by_category.map(function (c) { return "<tr><td>" + esc(c.category) + '</td><td class="n">' + naira(c.total) + "</td></tr>"; }).join("") : emptyRow(2, "No expenses this month.")) + '</tbody><tfoot><tr><td>Total expenses</td><td class="n">' + naira(m.expenses) + "</td></tr></tfoot></table></div></div></div>";
  h += '<div class="balline' + (m.balance < 0 ? " neg" : "") + '"><span>Balance for ' + esc(monthLabel(m.month)) + "</span><b>" + naira(m.balance) + "</b></div>";
  var years = (Y.years || []).slice(); [+ME.today.slice(0, 4), Y.year].forEach(function (y) { if (years.indexOf(y) < 0) years.push(y); }); years.sort();
  h += '<div class="ph yh"><h3 class="sh">Year ' + Y.year + '</h3><label class="sr" for="sumY">Year</label><select id="sumY">' + years.map(function (y) { return '<option value="' + y + '"' + (y === Y.year ? " selected" : "") + ">" + y + "</option>"; }).join("") + '</select><button class="btn ghost sm" type="button" data-csv="summary" data-scope="year">Download ' + Y.year + " (CSV)</button></div>";
  h += '<div class="tscroll"><table class="tbl"><thead><tr><th>Month</th><th class="n">Income</th><th class="n">Expenses</th><th class="n">Balance</th></tr></thead><tbody>' + Y.months.map(function (x, i) {
    return "<tr" + (x.month === m.month ? ' class="this"' : "") + "><td>" + MONTHS_L[i] + '</td><td class="n">' + naira(x.income) + '</td><td class="n">' + naira(x.expenses) + '</td><td class="n' + (x.balance < 0 ? " neg" : "") + '">' + naira(x.balance) + "</td></tr>";
  }).join("") + '</tbody><tfoot><tr><td>Year total</td><td class="n">' + naira(Y.total.income) + '</td><td class="n">' + naira(Y.total.expenses) + '</td><td class="n' + (Y.total.balance < 0 ? " neg" : "") + '">' + naira(Y.total.balance) + "</td></tr></tfoot></table></div>";
  w.innerHTML = h;
}

// ---------- other records ----------
R.other = function () {
  var regs = D.registers || [];
  var h = head("Other Records", "Extra registers the Ushers / Admin keep, each as its own table.", '<button class="btn grn sm" type="button" data-newreg="1">New table</button>');
  if (!regs.length) {
    return h + '<div class="empty">No extra tables yet.' + (isAdmin() ? " Tap <b>New table</b>, give it a name and its column names. Ideas:" : " Tables the Ushers / Admin create will show here. For example:") + '<ul class="ideas"><li>Ushers\u2019 duty roster</li><li>Equipment inventory</li><li>Dedications / Weddings register</li></ul></div>';
  }
  if (!regs.some(function (g) { return g.id === regSel; })) regSel = regs[0].id;
  h += '<div class="chips" role="group" aria-label="Pick a table">' + regs.map(function (g) { return '<button type="button" class="chip" data-reg="' + g.id + '" aria-pressed="' + (g.id === regSel) + '">' + esc(g.name) + ' <span class="cc">' + g.rows.length + "</span></button>"; }).join("") + "</div>";
  var g = find(regs, regSel);
  h += '<div class="rhd"><h3 class="sh">' + esc(g.name) + "</h3>" + (g.note ? '<p class="meta">' + esc(g.note) + "</p>" : "") + '<div class="acts">' + (isAdmin() ? '<button class="btn grn sm" type="button" data-addrow="' + g.id + '">Add row</button><button class="btn ghost sm" type="button" data-editreg="' + g.id + '">Edit table</button>' : "") + '<button class="btn ghost sm" type="button" data-csv="register-' + g.id + '" data-scope="all">Download (CSV)</button></div></div>';
  h += '<div class="tscroll"><table class="tbl"><thead><tr><th class="n">#</th>' + g.columns.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + (isAdmin() ? '<th><span class="sr">Edit</span></th>' : "") + "</tr></thead><tbody>" +
    (g.rows.length ? g.rows.map(function (r, i) { return '<tr><td class="n">' + (i + 1) + "</td>" + g.columns.map(function (_, j) { return '<td class="nt">' + esc(r.cells[j] || "") + "</td>"; }).join("") + (isAdmin() ? '<td class="act"><button class="btn ghost xs" type="button" data-editrow="' + r.id + '">Edit</button></td>' : "") + "</tr>"; }).join("") : emptyRow(g.columns.length + 1 + (isAdmin() ? 1 : 0), "No rows yet.")) + "</tbody></table></div>";
  h += '<p class="meta tmeta">' + g.rows.length + " row" + (g.rows.length === 1 ? "" : "s") + "</p>";
  return h;
};
function editReg(g) {
  g = g || {};
  var html = '<label for="rg_name">Table name</label><input id="rg_name" maxlength="80" required value="' + esc(g.name || "") + '" placeholder="Ushers\u2019 duty roster">' +
    '<label for="rg_cols">Column names, one per line (up to 12)</label><textarea id="rg_cols" rows="6" placeholder="Date&#10;Service&#10;Usher&#10;Position">' + esc((g.columns || []).join("\n")) + "</textarea>" +
    (g.id ? '<p class="hint">Renaming a column keeps its data. Removing a column from the end hides that column\u2019s data.</p>' : "") +
    '<label for="rg_note">Short note (optional)</label><input id="rg_note" maxlength="500" value="' + esc(g.note || "") + '">' +
    '<p class="err" id="merr" role="alert"></p><div class="mf-actions">' + (g.id ? '<button type="button" class="btn danger" id="mdel">Delete table</button>' : "") + '<button type="submit" class="btn pri" id="msave">' + (g.id ? "Save changes" : "Create table") + "</button></div>";
  openModal(g.id ? "Edit table" : "New table", html, function () {
    var body = { name: $("rg_name").value, columns: $("rg_cols").value.split("\n"), note: $("rg_note").value }; if (g.id) body.id = g.id;
    $("msave").disabled = true;
    api("api/save/registers", body).then(function (r) {
      $("msave").disabled = false;
      if (!r.ok) { $("merr").textContent = r.error; return; }
      regSel = r.id; closeModal(); toast(g.id ? "Saved" : "Table created"); refresh();
    });
  });
  if (g.id) $("mdel").addEventListener("click", function () {
    if (!confirm("Delete the table \u201C" + g.name + "\u201D and all " + g.rows.length + " of its rows? This cannot be undone.")) return;
    api("api/delete/registers", { id: g.id }).then(function (r) { if (!r.ok) { toast(r.error); return; } closeModal(); toast("Table deleted"); regSel = 0; refresh(); });
  });
}
function editRegRow(g, row) {
  row = row || {}; var cells = row.cells || [];
  var html = g.columns.map(function (c, i) { return '<label for="rc_' + i + '">' + esc(c) + '</label><input id="rc_' + i + '" maxlength="1000" value="' + esc(cells[i] || "") + '">'; }).join("") +
    '<p class="err" id="merr" role="alert"></p><div class="mf-actions">' + (row.id ? '<button type="button" class="btn danger" id="mdel">Delete row</button>' : "") + '<button type="submit" class="btn pri" id="msave">' + (row.id ? "Save changes" : "Add row") + "</button></div>";
  openModal((row.id ? "Edit row: " : "Add row: ") + g.name, html, function () {
    var body = { register_id: g.id, cells: g.columns.map(function (_, i) { return $("rc_" + i).value; }) }; if (row.id) body.id = row.id;
    $("msave").disabled = true;
    api("api/save/register_rows", body).then(function (r) {
      $("msave").disabled = false;
      if (!r.ok) { $("merr").textContent = r.error; return; }
      closeModal(); toast(row.id ? "Saved" : "Added"); refresh();
    });
  });
  if (row.id) $("mdel").addEventListener("click", function () {
    if (!confirm("Delete this row? This cannot be undone.")) return;
    api("api/delete/register_rows", { id: row.id }).then(function (r) { if (!r.ok) { toast(r.error); return; } closeModal(); toast("Deleted"); refresh(); });
  });
}

// ---------- settings ----------
R.settings = function () {
  return head("Settings", "Only Ushers / Admin can see this page.") +
    pwCard("member", "Members password", "The password members use to view the records. Everyone signed in with the old one will need the new one.") +
    pwCard("admin", "Ushers / Admin password", "The password for adding and editing records. Others signed in with the old one will need the new one.") +
    '<div class="card"><h4>Link to share</h4><p class="body" id="stLink"></p><h4 style="margin-top:14px">What is stored</h4><p class="meta" id="stCounts">Loading...</p></div>';
};
function pwCard(w, t, s) { return '<div class="card"><h4>Change the ' + t + '</h4><p class="meta">' + s + '</p><form data-pw="' + w + '"><label for="pw_' + w + '">New ' + t + '</label><input type="text" id="pw_' + w + '" autocomplete="new-password" minlength="8" required><label for="pw2_' + w + '">Type it again</label><input type="text" id="pw2_' + w + '" autocomplete="new-password" minlength="8" required><button class="btn pri wide" type="submit">Change the ' + t + '</button><p class="err" id="pwm_' + w + '" role="alert"></p></form></div>'; }
function loadSettings() {
  $("stLink").textContent = (ME.base || location.origin) + "/";
  api("api/settings").then(function (r) {
    if (!r.ok) return;
    var c = r.counts;
    $("stCounts").textContent = "Attendance records " + c.attendance + ", income records " + c.income + ", expenses " + c.expenses + ", other tables " + c.registers + " (with " + c.register_rows + " rows)" + (r.files != null ? ", uploaded files " + r.files : "") + ".";
  }).catch(function () {});
}
document.addEventListener("submit", function (e) {
  var f = e.target, w = f.getAttribute && f.getAttribute("data-pw");
  if (!w) return;
  e.preventDefault(); var a = $("pw_" + w).value.trim(), b2 = $("pw2_" + w).value.trim(), m = $("pwm_" + w);
  m.className = "err";
  if (a.length < 8) { m.textContent = "Use at least 8 characters."; return; }
  if (a !== b2) { m.textContent = "The two passwords do not match."; return; }
  if (!confirm("Change the " + (w === "admin" ? "Ushers / Admin" : "Members") + " password now?")) return;
  api("api/password", { which: w, password: a }).then(function (r) {
    if (!r.ok) { m.textContent = r.error; return; }
    $("pw_" + w).value = ""; $("pw2_" + w).value = ""; m.className = "ok"; m.textContent = "Changed. Share the new password with " + (w === "admin" ? "the ushers and admin." : "the members.");
  });
});

// ---------- render + events ----------
function render() {
  var m = $("main");
  m.innerHTML = (R[cur] || R.overview)();
  hydrateFiles(m);
  if (cur === "summary") loadSummary();
  if (cur === "settings") loadSettings();
}
$("main").addEventListener("click", function (e) {
  var b;
  if ((b = e.target.closest("[data-add]"))) { var s = b.getAttribute("data-add"); var dd = (mon && mon !== ME.today.slice(0, 7) && cur !== "overview") ? mon + "-01" : ME.today; return editRow(s, { date: dd, service: s === "expenses" ? undefined : "Sunday Service" }); }
  if ((b = e.target.closest("[data-edit]"))) { var s2 = b.getAttribute("data-edit"); return editRow(s2, find(D[s2], +b.getAttribute("data-id"))); }
  if ((b = e.target.closest("[data-go]"))) return go(b.getAttribute("data-go"));
  if ((b = e.target.closest("[data-mon]"))) { mon = shiftMonth(mon, +b.getAttribute("data-mon")); sumYear = +mon.slice(0, 4); return render(); }
  if ((b = e.target.closest("[data-csv]"))) {
    var k = b.getAttribute("data-csv"), sc = b.getAttribute("data-scope"), q, nm;
    if (sc === "month") { q = "?month=" + mon; nm = mon; } else if (sc === "year") { var yy = k === "summary" && SUM ? SUM.year.year : +mon.slice(0, 4); q = "?year=" + yy; nm = String(yy); } else { q = ""; nm = ""; }
    var base = { attendance: "rlw-attendance", income: "rlw-income", expenses: "rlw-expenses", summary: "rlw-financial-summary" }[k];
    if (!base) { var g = find(D.registers, +k.split("-")[1]); base = "rlw-" + (g ? g.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "table"); }
    return download("api/csv/" + k + ".csv" + q, base + (nm ? "-" + nm : "") + ".csv");
  }
  if ((b = e.target.closest("[data-reg]"))) { regSel = +b.getAttribute("data-reg"); return render(); }
  if (!isAdmin()) return;
  if ((b = e.target.closest("[data-newreg]"))) return editReg(null);
  if ((b = e.target.closest("[data-editreg]"))) return editReg(find(D.registers, +b.getAttribute("data-editreg")));
  if ((b = e.target.closest("[data-addrow]"))) return editRegRow(find(D.registers, +b.getAttribute("data-addrow")), null);
  if ((b = e.target.closest("[data-editrow]"))) { var g2 = find(D.registers, regSel), rr = g2 && find(g2.rows, +b.getAttribute("data-editrow")); if (g2 && rr) editRegRow(g2, rr); }
});
$("main").addEventListener("change", function (e) {
  if (e.target.id === "monIn" && /^\d{4}-\d{2}$/.test(e.target.value)) { mon = e.target.value; sumYear = +mon.slice(0, 4); render(); }
  if (e.target.id === "sumY") { sumYear = +e.target.value; loadSummary(); }
});

if (token) start(); else { $("login").hidden = false; }
})();
