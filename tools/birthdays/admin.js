(function () {
  var $ = function (id) { return document.getElementById(id); };
  var TOKEN = localStorage.getItem("rlwb_token") || "", MEMBERS = [], CUR = 1, TRACKS = [], CUSTOM = {};
  RLW.fonts();
  function show(el, on) { el.classList.toggle("hidden", !on); }
  function msg(el, text) { el.textContent = text || ""; show(el, !!text); }
  async function api(path, opt) {
    opt = opt || {}; opt.headers = opt.headers || {}; opt.headers.authorization = "Bearer " + TOKEN;
    if (opt.json !== undefined) { opt.method = opt.method || "POST"; opt.headers["content-type"] = "application/json"; opt.body = JSON.stringify(opt.json); }
    var r = await fetch(path, opt);
    if (r.status === 401) { TOKEN = ""; localStorage.removeItem("rlwb_token"); showLogin(); throw new Error("Please sign in again."); }
    if ((r.headers.get("content-type") || "").indexOf("json") < 0) return r;
    var j = await r.json(); if (!j.ok) throw new Error(j.error || "Something went wrong."); return j;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function showLogin() { show($("loginView"), true); show($("appView"), false); }
  $("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault(); msg($("loginErr"), "");
    try {
      var r = await fetch("api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("pw").value }) });
      var j = await r.json(); if (!j.ok) throw new Error(j.error || "Sign-in failed.");
      TOKEN = j.token; localStorage.setItem("rlwb_token", TOKEN); $("pw").value = ""; start();
    } catch (er) { msg($("loginErr"), er.message); }
  });
  $("logout").addEventListener("click", async function () { try { await api("api/admin/logout", { json: {} }); } catch (e) {} TOKEN = ""; localStorage.removeItem("rlwb_token"); showLogin(); });
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".tabs button").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); show($("p-" + x.dataset.tab), x === b); });
      if (b.dataset.tab === "songs") renderSongs();
    });
  });
  document.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
  function fillDM(dSel, mSel) {
    for (var d = 1; d <= 31; d++) dSel.add(new Option(String(d), String(d)));
    RLW.MONTHS.forEach(function (m, i) { mSel.add(new Option(m, String(i + 1))); });
  }
  fillDM($("aDay"), $("aMonth")); fillDM($("eDay"), $("eMonth"));

  async function load() {
    var j = await api("api/admin/members"); MEMBERS = j.members;
    if (!load.done) { CUR = j.month_now; load.done = true; }
    try { var s = await api("api/admin/songs"); CUSTOM = {}; s.custom.forEach(function (c) { CUSTOM[c.month] = c; }); } catch (e) {}
    renderMonths();
  }
  function inMonth(m) { return MEMBERS.filter(function (x) { return x.month === m; }).sort(function (a, b) { return a.day - b.day || a.name.localeCompare(b.name); }); }
  function visible(m) { return inMonth(m).filter(function (x) { return !x.hidden; }); }
  function renderMonths() {
    var box = $("mtabs"); box.innerHTML = "";
    RLW.MSHORT.forEach(function (s, i) {
      var n = inMonth(i + 1).length, b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(CUR === i + 1)); if (n) b.className = "has";
      b.innerHTML = "<b>" + s + "</b><span>" + n + "</span>"; b.setAttribute("aria-label", RLW.MONTHS[i] + ", " + n + " celebrants");
      b.addEventListener("click", function () { CUR = i + 1; show($("groupPanel"), false); resetVideo(); renderMonths(); });
      box.appendChild(b);
    });
    var list = inMonth(CUR), vis = visible(CUR);
    $("mDesign").textContent = "Card design this month: " + RLW.themeName(CUR) + (RLW.CLASSIC_ON ? " (the classic design is on for all months in Settings)" : "") + ".";
    $("mTitle").textContent = RLW.MONTHS[CUR - 1] + " celebrants"; $("vMonth").textContent = RLW.MONTHS[CUR - 1];
    $("mSub").textContent = list.length ? list.length + " celebrant" + (list.length > 1 ? "s" : "") + (list.length !== vis.length ? " (" + (list.length - vis.length) + " hidden from flyers and video)" : "") + ", sorted by day. " + MEMBERS.length + " people registered in total." : "No birthdays in " + RLW.MONTHS[CUR - 1] + " yet.";
    var ppl = $("people"); ppl.innerHTML = "";
    if (!list.length) ppl.innerHTML = '<div class="empty">No one has registered a ' + RLW.MONTHS[CUR - 1] + ' birthday yet. Share the form link or the QR poster, or use Add member.</div>';
    list.forEach(function (m) {
      var d = document.createElement("div"); d.className = "pcard" + (m.hidden ? " off" : "");
      d.innerHTML = '<div class="top">' + (m.photo ? '<img src="' + esc(m.photo) + '" alt="" loading="lazy">' : '<div class="ph">' + esc(RLW.initials(m.name)) + '</div>') +
        '<div><div class="nm">' + esc(m.name) + '</div><div class="dt">' + esc(RLW.dateText(m.day, m.month)) + '</div><div class="meta">' + esc([m.dept, m.phone].filter(Boolean).join(" · ")) + '</div>' + (m.hidden ? '<span class="badge">Hidden</span>' : "") + '</div></div>' +
        '<div class="acts"><button class="btn sm" data-a="flyer">Flyer</button><button class="btn sm ghost" data-a="edit">Edit</button><button class="btn sm ghost" data-a="photo">' + (m.photo ? "Photo" : "Add photo") + '</button><button class="btn sm ghost" data-a="hide">' + (m.hidden ? "Show" : "Hide") + '</button><button class="btn sm danger" data-a="del">Delete</button></div>';
      d.querySelectorAll("[data-a]").forEach(function (b) { b.addEventListener("click", function () { act(b.dataset.a, m); }); });
      ppl.appendChild(d);
    });
    var tr = TRACKS[CUR - 1], cu = CUSTOM[CUR], dur = RLW.videoDuration(vis.length);
    $("vInfo").textContent = vis.length ? vis.length + " celebrant" + (vis.length > 1 ? "s" : "") + ", about " + Math.round(dur) + " seconds. Song: " + (cu ? cu.name + " (uploaded)" : (tr ? tr.name : "this month's tune")) + "." : "Add celebrants to this month to make a video.";
    $("makeVid").disabled = !vis.length; $("groupBtn").disabled = !vis.length; $("allBtn").disabled = !vis.length;
  }
  async function flyerFor(m) { await RLW.fonts(); var logo = await RLW.logo(), ph = await RLW.loadImg(m.photo); return RLW.drawSingle(document.createElement("canvas"), m, ph, logo); }
  var editing = null, photoTarget = null, pCrop = null, pChanged = false, pNewOrig = false;
  async function act(a, m) {
    try {
      if (a === "flyer") {
        var cv = await flyerFor(m), blob = await RLW.canvasBlob(cv, "image/png");
        $("dfTitle").textContent = m.name; $("dfImg").src = URL.createObjectURL(blob);
        $("dfDl").onclick = function () { RLW.download(blob, "Happy_Birthday_" + RLW.slug(m.name) + ".png"); };
        $("dlgFlyer").showModal();
      } else if (a === "edit") {
        editing = m; $("eName").value = m.name; $("eDay").value = String(m.day); $("eMonth").value = String(m.month); $("ePhone").value = m.phone; $("eDept").value = m.dept; $("eHidden").checked = m.hidden; msg($("eErr"), "");
        $("dlgEdit").showModal();
      } else if (a === "hide") { await api("api/admin/update", { json: { id: m.id, hidden: !m.hidden } }); await load(); }
      else if (a === "del") { if (!confirm("Delete " + m.name + " and their photo? This cannot be undone.")) return; await api("api/admin/delete", { json: { id: m.id } }); await load(); }
      else if (a === "photo") {
        photoTarget = m; pChanged = false; pNewOrig = false; msg($("pErr"), ""); $("dpTitle").textContent = "Photo for " + m.name;
        $("dlgPhoto").showModal();
        if (!pCrop) pCrop = new RLW.Cropper($("pCropbox"), $("pZoom"));
        var src = m.orig || m.photo;
        if (src) { var im = await RLW.loadImg(src); if (im) { await pCrop.load(im); pChanged = true; } }
        else { $("pCropbox").querySelector("canvas").getContext("2d").clearRect(0, 0, 9999, 9999); pChanged = false; }
      }
    } catch (e) { alert(e.message); }
  }
  $("eSave").addEventListener("click", async function () {
    try { await api("api/admin/update", { json: { id: editing.id, name: $("eName").value, day: $("eDay").value, month: $("eMonth").value, phone: $("ePhone").value, dept: $("eDept").value, hidden: $("eHidden").checked } }); $("dlgEdit").close(); await load(); }
    catch (e) { msg($("eErr"), e.message); }
  });
  $("pFile").addEventListener("change", async function () {
    var f = this.files && this.files[0]; if (!f) return; msg($("pErr"), "");
    try { var im = await RLW.loadFile(f); await pCrop.load(im); pChanged = true; pNewOrig = true; } catch (e) { msg($("pErr"), e.message); }
    this.value = "";
  });
  $("pSave").addEventListener("click", async function () {
    if (!pChanged) { msg($("pErr"), "Choose a photo first."); return; }
    var b = this; b.disabled = true;
    try {
      var bl = await pCrop.blobs(), fd = new FormData(); fd.append("id", String(photoTarget.id)); fd.append("photo", bl.photo, "photo.jpg");
      if (pNewOrig || !photoTarget.orig) fd.append("orig", bl.orig, "orig.jpg");
      await api("api/admin/photo", { method: "POST", body: fd }); $("dlgPhoto").close(); await load();
    } catch (e) { msg($("pErr"), e.message); } finally { b.disabled = false; }
  });
  // add member
  var aCrop = null, aHas = false;
  $("aFile").addEventListener("change", async function () {
    var f = this.files && this.files[0]; if (!f) return; msg($("aErr"), "");
    try { var im = await RLW.loadFile(f); show($("aCropArea"), true); if (!aCrop) aCrop = new RLW.Cropper($("aCropbox"), $("aZoom")); await aCrop.load(im); aHas = true; } catch (e) { msg($("aErr"), e.message); }
    this.value = "";
  });
  $("addForm").addEventListener("submit", async function (e) {
    e.preventDefault(); msg($("aErr"), ""); msg($("aOk"), "");
    var b = $("aGo"); b.disabled = true;
    try {
      var fd = new FormData(); fd.append("name", $("aName").value); fd.append("day", $("aDay").value); fd.append("month", $("aMonth").value); fd.append("phone", $("aPhone").value); fd.append("dept", $("aDept").value);
      if (aHas) { var bl = await aCrop.blobs(); fd.append("photo", bl.photo, "photo.jpg"); fd.append("orig", bl.orig, "orig.jpg"); }
      await api("api/admin/add", { method: "POST", body: fd });
      msg($("aOk"), "Added " + $("aName").value.trim() + " to " + RLW.MONTHS[+$("aMonth").value - 1] + ".");
      $("addForm").reset(); aHas = false; show($("aCropArea"), false); await load();
    } catch (er) { msg($("aErr"), er.message); } finally { b.disabled = false; }
  });
  // exports
  async function csv(m) { var r = await api("api/admin/export.csv" + (m ? "?m=" + m : "")); var bl = await r.blob(); RLW.download(bl, m ? "RLW_Birthdays_" + RLW.MONTHS[m - 1] + ".csv" : "RLW_Birthdays_all.csv"); }
  $("csvMonth").addEventListener("click", function () { csv(CUR).catch(function (e) { alert(e.message); }); });
  $("csvAll").addEventListener("click", function () { csv(0).catch(function (e) { alert(e.message); }); });
  // group flyer
  async function groupCanvases() {
    await RLW.fonts(); var logo = await RLW.logo(), vis = visible(CUR), plan = RLW.groupPlan(vis.length), out = [], k = 0;
    var photos = await Promise.all(vis.map(function (m) { return RLW.loadImg(m.photo); }));
    for (var p = 0; p < plan.length; p++) { out.push(RLW.drawGroup(document.createElement("canvas"), CUR, vis.slice(k, k + plan[p]), photos.slice(k, k + plan[p]), logo, p + 1, plan.length)); k += plan[p]; }
    return out;
  }
  $("groupBtn").addEventListener("click", async function () {
    var b = this; b.disabled = true;
    try {
      var cvs = await groupCanvases(), blobs = [];
      for (var i = 0; i < cvs.length; i++) blobs.push(await RLW.canvasBlob(cvs[i], "image/png"));
      var mn = RLW.MONTHS[CUR - 1], th = $("groupThumbs"), acts = $("groupActs"); th.innerHTML = ""; acts.innerHTML = "";
      $("groupInfo").textContent = blobs.length > 1 ? "There are many celebrants, so the group flyer is split into " + blobs.length + " images." : "One image with every celebrant this month.";
      blobs.forEach(function (bl, i) {
        var im = document.createElement("img"); im.src = URL.createObjectURL(bl); im.alt = mn + " group flyer " + (i + 1); th.appendChild(im);
        var d = document.createElement("button"); d.className = "btn sm"; d.type = "button"; d.textContent = blobs.length > 1 ? "Download image " + (i + 1) : "Download group flyer";
        d.onclick = function () { RLW.download(bl, "RLW_" + mn + "_Birthdays" + (blobs.length > 1 ? "_" + (i + 1) : "") + ".png"); }; acts.appendChild(d);
      });
      if (blobs.length > 1) { var z = document.createElement("button"); z.className = "btn sm navy"; z.type = "button"; z.textContent = "Download all (zip)"; z.onclick = async function () { RLW.download(await RLW.zip(blobs.map(function (bl, i) { return { name: "RLW_" + mn + "_Birthdays_" + (i + 1) + ".png", blob: bl }; })), "RLW_" + mn + "_Group_Flyers.zip"); }; acts.appendChild(z); }
      show($("groupPanel"), true); $("groupPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { alert(e.message); } finally { b.disabled = false; }
  });
  $("allBtn").addEventListener("click", async function () {
    var b = this, label = b.textContent; b.disabled = true;
    try {
      var vis = visible(CUR), files = [], mn = RLW.MONTHS[CUR - 1];
      for (var i = 0; i < vis.length; i++) { b.textContent = "Making " + (i + 1) + " of " + vis.length + "..."; files.push({ name: String(vis[i].day).padStart(2, "0") + "_" + RLW.slug(vis[i].name) + ".png", blob: await RLW.canvasBlob(await flyerFor(vis[i]), "image/png") }); }
      var g = await groupCanvases(); for (var k = 0; k < g.length; k++) files.push({ name: "00_" + mn + "_Group" + (g.length > 1 ? "_" + (k + 1) : "") + ".png", blob: await RLW.canvasBlob(g[k], "image/png") });
      RLW.download(await RLW.zip(files), "RLW_" + mn + "_Birthday_Flyers.zip");
    } catch (e) { alert(e.message); } finally { b.disabled = false; b.textContent = label; }
  });
  // video
  var busy = false;
  function resetVideo() { if (busy) return; show($("vOut"), false); show($("vProg"), false); $("vStage").innerHTML = ""; $("vDone").innerHTML = ""; }
  function fmtNote() {
    var mm = RLW.pickMime();
    $("vFormat").textContent = mm === null ? "This browser cannot record video. Please use Chrome or Safari." :
      (mm.indexOf("mp4") >= 0 ? (RLW.aacOK() ? "This browser makes MP4 videos with standard (AAC) sound, the format WhatsApp asks for." : "This browser makes MP4 videos, but with Opus sound instead of the usual AAC. Most phones play it. If WhatsApp refuses it or there is no sound, make the video in Safari on an iPhone or Mac.") : "This browser can only make WebM videos, which WhatsApp does not accept. To get an MP4, use Safari on an iPhone or Mac, or an up-to-date Google Chrome.");
  }
  $("makeVid").addEventListener("click", async function () {
    if (busy) return; var b = this; busy = true; b.disabled = true;
    try {
      await RLW.fonts();
      var vis = visible(CUR), fmt = document.querySelector("input[name=fmt]:checked").value, mn = RLW.MONTHS[CUR - 1];
      var cv = document.createElement("canvas"); cv.width = fmt === "landscape" ? 1920 : 1080; cv.height = fmt === "square" ? 1080 : (fmt === "landscape" ? 1080 : 1920);
      $("vStage").innerHTML = ""; $("vStage").appendChild(cv); $("vDone").innerHTML = '<p class="small">Recording the video. You can watch it being made on the left.</p>';
      show($("vOut"), true); show($("vProg"), true); $("vStatus").textContent = "Loading photos and music...";
      var photos = await Promise.all(vis.map(function (m) { return RLW.loadImg(m.photo); })), logo = await RLW.logo();
      var cu = CUSTOM[CUR], tr = TRACKS[CUR - 1];
      var res = await RLW.makeVideo({ canvas: cv, month: CUR, members: vis, photos: photos, logo: logo, songUrl: cu ? cu.url : "music/m" + String(CUR).padStart(2, "0") + ".mp3", track: cu ? null : tr,
        onProgress: function (f, t, tot) { var pc = Math.round(f * 100); $("vBar").firstChild.style.width = pc + "%"; $("vBar").setAttribute("aria-valuenow", String(pc)); $("vStatus").textContent = "Recording... " + pc + "% (" + Math.max(0, Math.ceil(tot - t)) + " s left)"; } });
      $("vStatus").textContent = "Done. " + Math.round(res.duration) + " seconds, " + (res.blob.size / 1048576).toFixed(1) + " MB, " + res.ext.toUpperCase() + ".";
      var url = URL.createObjectURL(res.blob), name = "RLW_" + mn + "_Birthdays_" + (fmt === "square" ? "square" : (fmt === "landscape" ? "landscape" : "status")) + "." + res.ext;
      var vid = document.createElement("video"); vid.controls = true; vid.playsInline = true; vid.src = url; $("vStage").innerHTML = ""; $("vStage").appendChild(vid);
      $("vDone").innerHTML = "";
      var dl = document.createElement("a"); dl.className = "btn"; dl.href = url; dl.download = name; dl.textContent = "Download video (" + res.ext.toUpperCase() + ")"; dl.id = "vDownload";
      $("vDone").appendChild(dl);
      var p = document.createElement("p"); p.className = "small"; p.style.marginTop = "10px";
      p.textContent = (res.ext === "mp4" ? (res.aac ? "Ready for WhatsApp. " : "MP4 with Opus sound. Most phones play it; if WhatsApp refuses it or it has no sound, make it again in Safari on an iPhone or Mac. ") + (res.blob.size > 16 * 1048576 ? "It is over 16 MB, so WhatsApp may compress it, or send it as a document." : "") : "This browser made a WebM file, which WhatsApp does not accept. Use Safari on an iPhone or Mac, or an up-to-date Google Chrome, to get an MP4.");
      $("vDone").appendChild(p);
      window.__lastVideo = { size: res.blob.size, ext: res.ext, mime: res.mime, aac: res.aac, name: name, duration: res.duration };
    } catch (e) { $("vStatus").textContent = e.message || "The video could not be made."; }
    finally { busy = false; b.disabled = false; }
  });
  // songs
  function renderSongs() {
    var box = $("songs"); box.innerHTML = "";
    RLW.MONTHS.forEach(function (mn, i) {
      var m = i + 1, tr = TRACKS[i], cu = CUSTOM[m], d = document.createElement("div"); d.className = "s";
      d.innerHTML = '<div><div class="nm">' + mn + '</div><div class="small">' + (cu ? "Your upload: " + esc(cu.name) : "Default: " + esc(tr ? tr.name : "") + (tr ? " (" + tr.bpm + " bpm)" : "")) + '</div></div>' +
        '<audio controls preload="none" src="' + (cu ? esc(cu.url) : "music/m" + String(m).padStart(2, "0") + ".mp3") + '" aria-label="Play the ' + mn + ' song"></audio>' +
        '<div class="row" style="gap:6px"><label class="btn sm ghost">Upload song<input type="file" accept="audio/*,.mp3,.m4a" class="hp"></label>' + (cu ? '<button class="btn sm ghost" type="button" data-reset>Use default</button>' : "") + '</div>';
      d.querySelector("input").addEventListener("change", async function () {
        var f = this.files && this.files[0]; if (!f) return;
        try {
          if (f.size > 20 * 1048576) throw new Error("Please choose a song under 20 MB.");
          var type = f.type || (/\.m4a$/i.test(f.name) ? "audio/mp4" : "audio/mpeg");
          await api("api/admin/song?m=" + m + "&name=" + encodeURIComponent(f.name.replace(/\.[^.]+$/, "").slice(0, 80)), { method: "POST", headers: { "content-type": type }, body: f });
          await load(); renderSongs();
        } catch (e) { alert(e.message); }
      });
      var rb = d.querySelector("[data-reset]"); if (rb) rb.addEventListener("click", async function () { await api("api/admin/song/reset", { json: { m: m } }); await load(); renderSongs(); });
      box.appendChild(d);
    });
  }
  $("classicToggle").addEventListener("change", async function () {
    var on = this.checked, box = this; msg($("classicOk"), ""); msg($("classicErr"), "");
    try { var j = await api("api/admin/design", { json: { classic: on } }); RLW.CLASSIC_ON = !!j.classic; msg($("classicOk"), RLW.CLASSIC_ON ? "Saved. Every month now uses the classic navy and gold design." : "Saved. Each month now has its own design."); renderMonths(); }
    catch (e) { box.checked = !on; msg($("classicErr"), e.message); }
  });
  $("pwForm").addEventListener("submit", async function (e) {
    e.preventDefault(); msg($("pwErr"), ""); msg($("pwOk"), "");
    if ($("pwNew").value !== $("pwNew2").value) { msg($("pwErr"), "The two new passwords are not the same."); return; }
    try { await api("api/admin/password", { json: { current: $("pwCur").value, next: $("pwNew").value } }); msg($("pwOk"), "Password changed."); $("pwForm").reset(); } catch (er) { msg($("pwErr"), er.message); }
  });
  async function start() {
    show($("loginView"), false); show($("appView"), true); fmtNote();
    try { TRACKS = await (await fetch("music/tracks.json")).json(); } catch (e) { TRACKS = []; }
    try { await RLW.fonts(); } catch (e) {}
    $("classicToggle").checked = !!RLW.CLASSIC_ON;
    try { await load(); } catch (e) { if (TOKEN) alert(e.message); }
  }
  if (TOKEN) start(); else showLogin();
})();
