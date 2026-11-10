/* RLW Graphics Generator: page logic. Everything runs on the device; nothing is sent anywhere. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var LIB = window.RLW_LIB || {}, P = window.RLWParse, D = window.RLWDraw;
  var CAT_NAMES = { worship: "Worship and praise", prayer: "Prayer", bible: "Bible and the Word", cross: "Cross and Easter", light: "Light", water: "Water and river",
    youth: "Youth", family: "Family and children", thanksgiving: "Thanksgiving and harvest", spirit: "Holy Spirit and fire", sky: "Sky and hope",
    crowd: "Crusade and conference", christmas: "Christmas", celebration: "Celebration and anniversary", church: "Church (general)" };
  var CAT_ORDER = ["church", "worship", "prayer", "bible", "cross", "light", "water", "youth", "family", "thanksgiving", "spirit", "sky", "crowd", "christmas", "celebration"].filter(function (c) { return LIB[c] && LIB[c].length; });
  var FIELDS = ["title", "theme", "date", "time", "minister", "venue", "extra", "scripture"];
  var st = { started: false, auto: "church", cat: "auto", idx: 0, layout: 0, upload: null, uploadUrl: null, imgs: {}, blobs: {}, urls: {}, seq: 0 };
  var logoW = new Image(), logoD = new Image();
  logoW.src = "logo-w.png"; logoD.src = "logo-d.png";
  function loaded(img) { return new Promise(function (res) { if (img.complete && img.naturalWidth) res(img); else { img.onload = function () { res(img); }; img.onerror = function () { res(null); }; } }); }
  var fontsReady = (document.fonts && document.fonts.load ? Promise.all(["900 40px Montserrat", "800 40px Montserrat", "700 40px Montserrat", "500 40px Montserrat", "600 40px Montserrat", "italic 700 40px 'Playfair Display'"].map(function (f) { return document.fonts.load(f).catch(function () {}); })) : Promise.resolve())
    .then(function () { return document.fonts && document.fonts.ready; }).catch(function () {});
  var ready = Promise.all([fontsReady, loaded(logoW), loaded(logoD)]);

  function toast(t) { var e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(function () { e.classList.remove("on"); }, 2600); }
  function sizeMode() { var c = document.querySelector('input[name="sz"]:checked'); return c ? c.value : "portrait"; }
  function sizes() { var m = sizeMode(); return m === "both" ? ["portrait", "landscape"] : [m]; }
  function curCat() { return st.cat === "auto" ? st.auto : st.cat; }
  function photoEntry() { var l = LIB[curCat()] || LIB.church || []; return l.length ? l[st.idx % l.length] : null; }
  function loadPhoto(e) {
    if (!e) return Promise.resolve(null);
    if (st.imgs[e.f]) return st.imgs[e.f];
    var im = new Image(); im.decoding = "async"; im.src = e.f;
    st.imgs[e.f] = loaded(im);
    return st.imgs[e.f];
  }
  function fillCats() {
    var s = $("cat"), h = '<option value="auto">Auto: ' + CAT_NAMES[st.auto] + "</option>";
    CAT_ORDER.forEach(function (c) { h += '<option value="' + c + '">' + CAT_NAMES[c] + "</option>"; });
    s.innerHTML = h; s.value = st.cat;
  }
  function data() { var d = {}; FIELDS.forEach(function (f) { d[f] = $("f-" + f).value.trim(); }); return d; }
  function slug(t) { return (t || "graphic").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "graphic"; }

  function setCredit() {
    var c = $("credit");
    if (st.upload) { c.textContent = "Photo: your own upload."; return; }
    var e = photoEntry();
    c.innerHTML = e ? 'Photo: <a href="' + e.src + '" target="_blank" rel="noopener">Pexels</a> (free to use). Theme: ' + CAT_NAMES[curCat()] + "." : "";
  }
  var timer = null;
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(draw, ms == null ? 160 : ms); }
  function draw() {
    if (!st.started) return;
    var seq = ++st.seq, d = data(), layout = D.LAYOUTS[st.layout % D.LAYOUTS.length];
    var photoP = st.upload ? Promise.resolve(st.upload) : loadPhoto(photoEntry());
    Promise.all([ready, photoP]).then(function (r) {
      if (seq !== st.seq) return;
      var img = r[1], list = sizes(), pv = $("pv");
      // keep one figure per size
      Array.prototype.slice.call(pv.children).forEach(function (f) { if (list.indexOf(f.getAttribute("data-k")) < 0) pv.removeChild(f); });
      list.forEach(function (k, i) {
        var fig = pv.querySelector('[data-k="' + k + '"]');
        if (!fig) {
          fig = document.createElement("figure"); fig.setAttribute("data-k", k);
          var wh = D.SIZES[k];
          fig.innerHTML = '<img alt="" width="' + wh[0] + '" height="' + wh[1] + '"><figcaption><span>' + k.charAt(0).toUpperCase() + k.slice(1) + " " + wh[0] + " \u00d7 " + wh[1] + '</span><button type="button" class="btn ghost dl" data-dl="' + k + '">Download</button></figcaption>';
          pv.appendChild(fig);
        }
        if (pv.children[i] !== fig) pv.insertBefore(fig, pv.children[i]);
      });
      var jobs = list.map(function (k) {
        var wh = D.SIZES[k], cv = document.createElement("canvas");
        D.render(cv, wh[0], wh[1], d, { layout: layout, photo: img, logoW: logoW.naturalWidth ? logoW : null, logoD: logoD.naturalWidth ? logoD : null });
        return new Promise(function (res) {
          if (cv.toBlob) cv.toBlob(function (b) { res([k, b, cv]); }, "image/png");
          else res([k, dataToBlob(cv.toDataURL("image/png")), cv]);
        });
      });
      return Promise.all(jobs).then(function (out) {
        if (seq !== st.seq) return;
        st.blobs = {};
        out.forEach(function (o) {
          var k = o[0], b = o[1]; st.blobs[k] = b;
          if (st.urls[k]) URL.revokeObjectURL(st.urls[k]);
          st.urls[k] = URL.createObjectURL(b);
          var img = $("pv").querySelector('[data-k="' + k + '"] img');
          img.src = st.urls[k];
          img.alt = (d.title || "Church graphic") + ", " + k + " design";
        });
        $("dlall-t").textContent = out.length > 1 ? "Download both" : "Download";
        updateShare(); setCredit();
        document.documentElement.setAttribute("data-rendered", String(seq));
      });
    }).catch(function (e) { toast("Could not draw the design. Please try again."); if (window.console) console.error(e); });
  }
  function dataToBlob(u) { var p = u.split(","), b = atob(p[1]), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Blob([a], { type: "image/png" }); }
  function files() {
    var t = slug($("f-title").value);
    return Object.keys(st.blobs).map(function (k) { return new File([st.blobs[k]], "rlw-" + t + "-" + k + ".png", { type: "image/png" }); });
  }
  function canShareFiles() { try { var f = files(); return !!(f.length && navigator.canShare && navigator.canShare({ files: f })); } catch (e) { return false; } }
  function updateShare() { $("share").hidden = !canShareFiles(); }
  function download(k) {
    var b = st.blobs[k]; if (!b) return;
    var a = document.createElement("a"); a.href = st.urls[k]; a.download = "rlw-" + slug($("f-title").value) + "-" + k + ".png";
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
  }

  function create() {
    var txt = $("desc").value.trim();
    if (!txt) { $("desc").focus(); toast("Type a short description first, e.g. Youth meeting Saturday 5pm"); return; }
    var p = P.parse(txt, new Date());
    FIELDS.forEach(function (f) { $("f-" + f).value = p[f] || ""; });
    st.auto = p.category || "church"; st.cat = "auto"; st.idx = 0; st.started = true;
    fillCats();
    $("details").hidden = false; $("pvwrap").hidden = false; $("empty").hidden = true;
    schedule(0);
    if (window.matchMedia && matchMedia("(max-width: 899px)").matches) setTimeout(function () { $("h-pv").scrollIntoView({ behavior: "smooth", block: "start" }); }, 120);
  }

  $("go").addEventListener("click", create);
  $("desc").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); create(); } });
  Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) { c.addEventListener("click", function () { $("desc").value = c.textContent; create(); }); });
  FIELDS.forEach(function (f) { $("f-" + f).addEventListener("input", function () { schedule(); }); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="sz"]'), function (r) { r.addEventListener("change", function () { schedule(0); }); });
  $("lay").addEventListener("click", function () { st.layout = (st.layout + 1) % D.LAYOUTS.length; toast("Layout: " + D.LAYOUT_NAMES[D.LAYOUTS[st.layout]]); schedule(0); });
  $("shuf").addEventListener("click", function () {
    if (st.upload) { clearUpload(); schedule(0); return; }
    var l = LIB[curCat()] || [];
    st.idx++;
    if (st.idx >= l.length) { // went through this theme's photos: move on to the next theme
      st.idx = 0;
      var i = CAT_ORDER.indexOf(curCat()); st.cat = CAT_ORDER[(i + 1) % CAT_ORDER.length]; $("cat").value = st.cat;
      toast("Photo theme: " + CAT_NAMES[st.cat]);
    }
    schedule(0);
  });
  $("cat").addEventListener("change", function () { st.cat = $("cat").value; st.idx = 0; clearUpload(); schedule(0); });
  function clearUpload() { st.upload = null; if (st.uploadUrl) URL.revokeObjectURL(st.uploadUrl); st.uploadUrl = null; $("uplbl").textContent = "Upload photo"; $("up").value = ""; }
  $("up").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (!/^image\//.test(f.type || "image/")) { toast("Please choose a photo."); return; }
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () { if (st.uploadUrl) URL.revokeObjectURL(st.uploadUrl); st.upload = im; st.uploadUrl = url; $("uplbl").textContent = "Change photo"; toast("Using your photo. Tap Shuffle photo to go back to the library."); schedule(0); };
    im.onerror = function () { URL.revokeObjectURL(url); toast("That photo could not be opened. Try a JPG or PNG."); };
    im.src = url;
  });
  $("pv").addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-dl]"); if (b) download(b.getAttribute("data-dl")); });
  $("dlall").addEventListener("click", function () {
    var ks = Object.keys(st.blobs);
    ks.forEach(function (k, i) { setTimeout(function () { download(k); }, i * 700); });
  });
  $("share").addEventListener("click", function () {
    var f = files(); if (!f.length) return;
    navigator.share({ files: f, title: $("f-title").value || "Church graphic" }).catch(function (e) { if (e && e.name !== "AbortError") toast("Sharing did not work here. Use Download instead."); });
  });
  // let the page be prefilled with ?d=... (handy for sharing a starting point)
  try { var q = new URLSearchParams(location.search).get("d"); if (q) { $("desc").value = q.slice(0, 300); create(); } } catch (e) {}
})();
