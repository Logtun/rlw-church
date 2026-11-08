/* RLW Birthdays — shared drawing (flyers, video frames). Canvas only, no external assets. */
(function () {
  var RLW = window.RLW = window.RLW || {};
  RLW.MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  RLW.MSHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  RLW.DIM = [31,29,31,30,31,30,31,31,30,31,30,31];
  RLW.C = { navy: "#1B2A6B", navyD: "#0b1338", navyM: "#14205a", green: "#0A8F4A", gold: "#E2B13C", goldL: "#F6D77A", goldD: "#A87A12", white: "#ffffff" };
  // ---------- themes: RLW.T is the theme in force for the drawing in progress ----------
  RLW.CLASSIC = { key: "classic", name: "Classic navy and gold", dark: true,
    ink: "#ffffff", ink2: "rgba(255,255,255,.9)", head: "rgba(255,255,255,.88)", accTxt: "#F6D77A", acc: "#E2B13C", acc3: ["#FBE7A1", "#E2B13C", "#B9871A"],
    pill: "#0A8F4A", pillInk: "#ffffff", ring: ["#F6D77A", "#C8961F", "#FBE7A1"], glow: "rgba(246,215,122,.55)", gap: "#ffffff", dash: "rgba(246,215,122,.9)",
    phBg: ["#2a3d93", "#0b1338"], phInk: "rgba(255,255,255,.75)", conf: ["#E2B13C", "#F6D77A", "#0A8F4A", "#19b866", "#ffffff", "#c9d4ff", "#E2B13C"],
    burst: ["#E2B13C", "#F6D77A", "#0A8F4A", "#ffffff", "#19b866"], spark: ["#FFF4CC", "#F6D77A"], footBg: "rgba(4,7,22,.82)", footInk: "#ffffff", footLine: ["#FBE7A1", "#E2B13C", "#B9871A"], shadow: "rgba(0,0,0,.35)" };
  RLW.THEMES = {};
  RLW.CLASSIC_ON = false;
  RLW.T = RLW.CLASSIC;
  RLW.themeFor = function (month) { return (!RLW.CLASSIC_ON && RLW.THEMES[month]) || RLW.CLASSIC; };
  RLW.useTheme = function (month) { RLW.T = RLW.themeFor(+month); return RLW.T; };
  RLW.themeName = function (month) { var t = RLW.themeFor(+month); return t.name; };
  // the white-ink logo on dark designs, the navy-ink logo on light ones
  RLW.lg = function (logo) { return RLW.T.dark === false ? (RLW._logoD || logo) : logo; };
  // KJV lines, each checked against bible-api.com (translation=kjv)
  RLW.BLESS = [
    { t: "The LORD bless thee, and keep thee.", r: "Numbers 6:24" },
    { t: "Grant thee according to thine own heart, and fulfil all thy counsel.", r: "Psalm 20:4" },
    { t: "This is the day which the LORD hath made; we will rejoice and be glad in it.", r: "Psalm 118:24" },
    { t: "Beloved, I wish above all things that thou mayest prosper and be in health.", r: "3 John 1:2" },
    { t: "For length of days, and long life, and peace, shall they add to thee.", r: "Proverbs 3:2" },
    { t: "The LORD make his face shine upon thee, and be gracious unto thee.", r: "Numbers 6:25" },
    { t: "Thou crownest the year with thy goodness.", r: "Psalm 65:11" }
  ];
  RLW.GROUP_BLESS = { t: "This is the day which the LORD hath made; we will rejoice and be glad in it.", r: "Psalm 118:24" };
  RLW.OUTRO_BLESS = { t: "The LORD bless thee, and keep thee: the LORD make his face shine upon thee, and be gracious unto thee.", r: "Numbers 6:24-25" };
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  RLW.hash = hash;
  RLW.blessFor = function (name, day, month) { return RLW.BLESS[hash(String(name).toLowerCase() + "|" + day + "|" + month) % RLW.BLESS.length]; };
  RLW.ord = function (d) { var s = ["th","st","nd","rd"], v = d % 100; return d + (s[(v - 20) % 10] || s[v] || s[0]); };
  RLW.dateText = function (d, m) { return RLW.ord(d) + " " + RLW.MONTHS[m - 1]; };
  RLW.rng = function (seed) { var a = seed >>> 0 || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  var fontsReady = null;
  RLW.fonts = function () {
    if (fontsReady) return fontsReady;
    var list = [
      ["RLWScript", "fonts/GreatVibes-Regular.woff2", {}],
      ["RLWSerif", "fonts/PlayfairDisplay.woff2", { weight: "400 900" }],
      ["RLWSerif", "fonts/PlayfairDisplay-Italic.woff2", { weight: "400 900", style: "italic" }],
      ["RLWSans", "fonts/Montserrat.woff2", { weight: "100 900" }]
    ];
    fontsReady = Promise.all(list.map(function (f) {
      try { var ff = new FontFace(f[0], "url(" + f[1] + ")", f[2]); return ff.load().then(function (x) { document.fonts.add(x); }).catch(function () {}); } catch (e) { return Promise.resolve(); }
    }).concat([
      RLW.loadImg("logo-d.png").then(function (im) { RLW._logoD = im; }),
      fetch("api/design", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) RLW.CLASSIC_ON = !!j.classic; }).catch(function () {})
    ]));
    return fontsReady;
  };
  RLW.F = { script: '"RLWScript", "Brush Script MT", cursive', serif: '"RLWSerif", Georgia, "Times New Roman", serif', sans: '"RLWSans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' };
  RLW.loadImg = function (src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var im = new Image(); im.decoding = "async";
      im.onload = function () { res(im); }; im.onerror = function () { res(null); };
      im.src = src;
    });
  };
  var logoP = null;
  RLW.logo = function () { if (!logoP) logoP = RLW.loadImg("logo-w.png"); return logoP; };

  // ---------- primitives ----------
  function font(ctx, w, size, fam, style) { ctx.font = (style || "") + " " + w + " " + size + "px " + fam; }
  RLW.font = font;
  function spaced(ctx, text, x, y, sp, align) {
    // letter-spaced text centred/left at x
    var chars = text.split(""), w = 0, i;
    for (i = 0; i < chars.length; i++) w += ctx.measureText(chars[i]).width + (i < chars.length - 1 ? sp : 0);
    var sx = align === "left" ? x : x - w / 2, oldA = ctx.textAlign; ctx.textAlign = "left";
    for (i = 0; i < chars.length; i++) { ctx.fillText(chars[i], sx, y); sx += ctx.measureText(chars[i]).width + sp; }
    ctx.textAlign = oldA; return w;
  }
  RLW.spaced = spaced;
  function wrap(ctx, text, maxW, maxLines) {
    var words = String(text).split(/\s+/), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + " " + words[i] : words[i];
      if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) { var rest = lines.slice(maxLines - 1).join(" "); lines = lines.slice(0, maxLines - 1); while (ctx.measureText(rest + "…").width > maxW && rest.length > 1) rest = rest.slice(0, -1); lines.push(rest + "…"); }
    return lines;
  }
  RLW.wrap = wrap;
  // fit a name into maxW at up to 2 lines, shrinking the font
  RLW.fitName = function (ctx, text, maxW, size, minSize, fam, weight, lines) {
    lines = lines || 2;
    for (var s = size; s >= minSize; s -= 2) {
      font(ctx, weight, s, fam);
      if (ctx.measureText(text).width <= maxW) return { size: s, lines: [text] };
      var l = wrap(ctx, text, maxW, 99);
      if (l.length <= lines && l.every(function (x) { return ctx.measureText(x).width <= maxW; }) && s <= size * 0.86) return { size: s, lines: l };
    }
    font(ctx, weight, minSize, fam); return { size: minSize, lines: wrap(ctx, text, maxW, lines) };
  };
  RLW.bg = function (ctx, W, H, t) {
    t = t || 0;
    if (RLW.T.bg) { ctx.save(); RLW.T.bg(ctx, W, H, t); ctx.restore(); return; }
    var g = ctx.createRadialGradient(W * (0.5 + 0.08 * Math.sin(t * 0.4)), H * 0.38, 0, W / 2, H * 0.45, Math.max(W, H) * 0.85);
    g.addColorStop(0, "#2a3d93"); g.addColorStop(0.45, RLW.C.navy); g.addColorStop(1, "#070c26");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // soft light rays
    ctx.save(); ctx.globalAlpha = 0.07; ctx.translate(W / 2, -H * 0.05); ctx.rotate(t * 0.05);
    for (var i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-W * 0.09, H * 1.3); ctx.lineTo(W * 0.09, H * 1.3); ctx.closePath(); ctx.fillStyle = "#F6D77A"; ctx.fill(); }
    ctx.restore();
  };
  // static or falling confetti; t in seconds (null = static)
  RLW.confetti = function (ctx, W, H, seed, n, t, avoid) {
    var r = RLW.rng(seed), s = W / 1080;
    for (var i = 0; i < n; i++) {
      var x = r() * W, y0 = r() * H, sz = (6 + r() * 14) * s, kind = r(), col = RLW.T.conf[(r() * RLW.T.conf.length) | 0], rot = r() * 6.28, sp = 40 + r() * 90, sw = r() * 6.28;
      var y = y0, a = rot;
      if (t != null) { y = (y0 + sp * s * t) % (H + 40 * s) - 20 * s; x += Math.sin(t * 1.3 + sw) * 18 * s; a = rot + t * (1 + r() * 2); }
      if (avoid && (typeof avoid === "function" ? avoid(x, y) : Math.hypot(x - avoid.x, y - avoid.y) < avoid.r)) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col; ctx.globalAlpha = 0.85 * (ctx.__a == null ? 1 : ctx.__a);
      if (kind < 0.45) ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2);
      else if (kind < 0.75) { ctx.beginPath(); ctx.arc(0, 0, sz / 3, 0, 6.283); ctx.fill(); }
      else { star(ctx, 0, 0, sz * 0.55, sz * 0.22); }
      ctx.restore();
    }
  };
  function star(ctx, x, y, R, r) {
    ctx.beginPath();
    for (var i = 0; i < 8; i++) { var rr = i % 2 ? r : R, a = i * Math.PI / 4 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  RLW.star = star;
  RLW.sparkle = function (ctx, x, y, R, alpha) {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.fillStyle = RLW.T.spark[0];
    ctx.shadowColor = RLW.T.spark[1]; ctx.shadowBlur = R * 1.2; star(ctx, x, y, R, R * 0.18); ctx.restore();
  };
  // circular photo with gold ring; img may be null
  RLW.photoFrame = function (ctx, img, cx, cy, R, opts) {
    opts = opts || {};
    var s = R / 230;
    ctx.save();
    // glow
    var T = RLW.T;
    ctx.shadowColor = T.glow; ctx.shadowBlur = 50 * s;
    ctx.beginPath(); ctx.arc(cx, cy, R + 16 * s, 0, 6.283); ctx.fillStyle = T.ring[1]; ctx.fill();
    ctx.restore();
    // gold ring gradient
    var g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    g.addColorStop(0, T.ring[0]); g.addColorStop(0.5, T.ring[1]); g.addColorStop(1, T.ring[2]);
    ctx.beginPath(); ctx.arc(cx, cy, R + 16 * s, 0, 6.283); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, R + 4 * s, 0, 6.283); ctx.fillStyle = T.gap; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.clip();
    if (img) {
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, sc = Math.max(2 * R / iw, 2 * R / ih) * (opts.zoom || 1);
      ctx.drawImage(img, cx - iw * sc / 2, cy - ih * sc / 2, iw * sc, ih * sc);
    } else {
      var gg = ctx.createLinearGradient(0, cy - R, 0, cy + R); gg.addColorStop(0, T.phBg[0]); gg.addColorStop(1, T.phBg[1]);
      ctx.fillStyle = gg; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.fillStyle = T.phInk; font(ctx, "700", R * 0.7, RLW.F.serif); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(opts.initials || "", cx, cy + R * 0.04); ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    // dashed rotating accent ring
    if (opts.spin != null) {
      ctx.save(); ctx.strokeStyle = T.dash; ctx.lineWidth = 4 * s; ctx.setLineDash([18 * s, 14 * s]); ctx.lineDashOffset = -opts.spin * 60 * s;
      ctx.beginPath(); ctx.arc(cx, cy, R + 34 * s, 0, 6.283); ctx.stroke(); ctx.restore();
    }
  };
  RLW.initials = function (name) { return String(name).trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join(""); };
  RLW.pill = function (ctx, text, cx, cy, size, fill, color) {
    font(ctx, "700", size, RLW.F.sans);
    var w = ctx.measureText(text).width + size * 1.6, h = size * 1.75;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = size * 0.5; ctx.shadowOffsetY = size * 0.12;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = fill || RLW.T.pill; ctx.fill(); ctx.restore();
    ctx.fillStyle = color || RLW.T.pillInk; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, cx, cy + size * 0.04); ctx.textBaseline = "alphabetic";
    return w;
  };
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  RLW.roundRect = roundRect;
  function goldFill(ctx, y0, y1, c) { c = c || RLW.T.acc3; var g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c[0]); g.addColorStop(0.55, c[1]); g.addColorStop(1, c[2]); return g; }
  RLW.goldFill = goldFill;
  RLW.footer = function (ctx, W, H, h) {
    var s = W / 1080; h = h || 74 * s;
    var T = RLW.T;
    ctx.fillStyle = T.footBg; ctx.fillRect(0, H - h, W, h);
    ctx.fillStyle = goldFill(ctx, H - h, H - h + 4 * s, T.footLine); ctx.fillRect(0, H - h, W, 4 * s);
    ctx.fillStyle = T.footInk; ctx.textAlign = "center"; font(ctx, "600", 26 * s, RLW.F.sans);
    spaced(ctx, "RIVERS OF LIVING WATER PARISH", W / 2, H - h / 2 + 11 * s, 3 * s);
  };
  RLW.header = function (ctx, W, y, logo, s) {
    logo = RLW.lg(logo);
    if (logo) { var lh = 118 * s, lw = lh * (logo.width / logo.height); ctx.drawImage(logo, W / 2 - lw / 2, y, lw, lh); }
    ctx.fillStyle = RLW.T.head; ctx.textAlign = "center"; font(ctx, "600", 21 * s, RLW.F.sans);
    spaced(ctx, "RCCG  RIVERS OF LIVING WATER PARISH", W / 2, y + 150 * s, 3.2 * s);
  };

  // ---------- single flyer 1080x1350 ----------
  RLW.drawSingle = function (cv, m, photo, logo) {
    var W = 1080, H = 1350, s = 1; cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");
    var T = RLW.useTheme(m.month);
    if (T.single) { ctx.save(); T.single(ctx, W, H, m, photo, RLW.lg(logo)); ctx.restore(); return cv; }
    RLW.bg(ctx, W, H, 0);
    RLW.confetti(ctx, W, H, RLW.hash(m.name) + 7, 90, null, function (x, y) { return Math.hypot(x - W / 2, y - 700) < 300 || (y > 990 && y < H - 60 && x > 70 && x < W - 70) || (y > 170 && y < 450 && x > 180 && x < W - 180); });
    RLW.header(ctx, W, 38, logo, s);
    ctx.textAlign = "center";
    ctx.fillStyle = goldFill(ctx, 230, 360); font(ctx, "400", 148, RLW.F.script);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 12; ctx.fillText("Happy", W / 2 - 6, 330); ctx.restore();
    ctx.fillStyle = "#fff"; font(ctx, "800", 92, RLW.F.sans); spaced(ctx, "BIRTHDAY", W / 2, 432, 14);
    RLW.photoFrame(ctx, photo, W / 2, 700, 225, { initials: RLW.initials(m.name) });
    RLW.sparkle(ctx, W / 2 + 230, 520, 26); RLW.sparkle(ctx, W / 2 - 250, 860, 20); RLW.sparkle(ctx, W / 2 + 275, 830, 14, .8);
    RLW.pill(ctx, RLW.dateText(m.day, m.month), W / 2, 948, 38, RLW.C.green);
    var fit = RLW.fitName(ctx, m.name, 940, 74, 46, RLW.F.serif, "800", 2);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; font(ctx, "800", fit.size, RLW.F.serif);
    var y = 1060; fit.lines.forEach(function (l, i) { ctx.fillText(l, W / 2, y + i * fit.size * 1.05); }); y += (fit.lines.length - 1) * fit.size * 1.05;
    if (m.dept) { ctx.fillStyle = "#F6D77A"; font(ctx, "600", 28, RLW.F.sans); spaced(ctx, String(m.dept).toUpperCase().slice(0, 40), W / 2, y + 48, 2); y += 48; }
    var b = RLW.blessFor(m.name, m.day, m.month);
    ctx.fillStyle = "rgba(255,255,255,.9)"; font(ctx, "500", 29, RLW.F.serif, "italic");
    var bl = wrap(ctx, "\u201C" + b.t + "\u201D", 880, 2); var by = Math.max(y + 66, 1150);
    bl.forEach(function (l, i) { ctx.fillText(l, W / 2, by + i * 38); });
    ctx.fillStyle = "#E2B13C"; font(ctx, "700", 22, RLW.F.sans); spaced(ctx, b.r.toUpperCase(), W / 2, by + bl.length * 38 + 4, 2);
    RLW.footer(ctx, W, H, 72);
    return cv;
  };

  // ---------- group flyer pages 1080x1350 ----------
  RLW.groupPlan = function (n) {
    if (n <= 12) return [n];
    var pages = Math.ceil(n / 12), per = Math.ceil(n / pages), out = [];
    for (var i = 0; i < pages; i++) out.push(Math.min(per, n - i * per));
    return out;
  };
  function gridFor(n) {
    if (n <= 1) return [1, 1]; if (n === 2) return [2, 1]; if (n <= 4) return [2, 2]; if (n <= 6) return [3, 2]; if (n <= 9) return [3, 3]; return [4, 3];
  }
  RLW.drawGroup = function (cv, month, list, photos, logo, page, pages) {
    var W = 1080, H = 1350; cv.width = W; cv.height = H; var ctx = cv.getContext("2d"), T = RLW.useTheme(month);
    RLW.bg(ctx, W, H, 0); RLW.confetti(ctx, W, H, month * 31 + page, 70, null, function (x, y) { return (y > H - 215 && y < H - 60 && x > 50 && x < W - 50) || (y > 150 && y < 330 && x > 120 && x < W - 120); });
    if (T.groupDeco) { ctx.save(); T.groupDeco(ctx, W, H); ctx.restore(); }
    RLW.header(ctx, W, 30, logo, 0.82);
    ctx.textAlign = "center";
    ctx.fillStyle = goldFill(ctx, 180, 290); font(ctx, "400", 120, RLW.F.script); ctx.fillText("Happy Birthday", W / 2, 262);
    ctx.fillStyle = T.ink; font(ctx, "700", 30, RLW.F.sans); spaced(ctx, ("TO OUR " + RLW.MONTHS[month - 1] + " CELEBRANTS").toUpperCase(), W / 2, 318, 4);
    var n = list.length, g = gridFor(n), cols = g[0], rows = g[1];
    var top = 360, bottom = H - 205, gw = W - 80, cellW = gw / cols, cellH = (bottom - top) / rows;
    var R = Math.min(cellW * 0.36, (cellH - 120) / 2.2, 200);
    list.forEach(function (m, i) {
      var r = Math.floor(i / cols), c = i % cols;
      var inRow = Math.min(cols, n - r * cols), off = (cols - inRow) * cellW / 2;
      var cx = 40 + off + c * cellW + cellW / 2, cy = top + r * cellH + R + 22;
      RLW.photoFrame(ctx, photos[i], cx, cy, R, { initials: RLW.initials(m.name) });
      var dy = cy + R + 36 + R * 0.04;
      var nm = RLW.fitName(ctx, m.name, cellW - 22, Math.min(34, 12 + R * 0.16), 18, RLW.F.serif, "800", 2);
      ctx.fillStyle = T.ink; ctx.textAlign = "center"; font(ctx, "800", nm.size, RLW.F.serif);
      nm.lines.forEach(function (l, k) { ctx.fillText(l, cx, dy + k * nm.size * 1.05); });
      ctx.fillStyle = T.accTxt; font(ctx, "700", Math.max(17, Math.min(26, nm.size * 0.78)), RLW.F.sans);
      ctx.fillText(RLW.dateText(m.day, m.month), cx, dy + (nm.lines.length - 1) * nm.size * 1.05 + nm.size * 1.12);
    });
    var b = RLW.GROUP_BLESS;
    ctx.save(); ctx.fillStyle = T.dark === false ? "rgba(255,255,255,.6)" : "rgba(0,0,0,.28)"; roundRect(ctx, 70, H - 202, W - 140, 122, 30); ctx.fill(); ctx.restore();
    ctx.fillStyle = T.ink2; font(ctx, "500", 26, RLW.F.serif, "italic"); ctx.textAlign = "center";
    var bl = wrap(ctx, "\u201C" + b.t + "\u201D", 990, 2); bl.forEach(function (l, i) { ctx.fillText(l, W / 2, H - 160 + i * 34); });
    ctx.fillStyle = T.acc; font(ctx, "700", 20, RLW.F.sans); spaced(ctx, b.r.toUpperCase(), W / 2, H - 160 + bl.length * 34 + 2, 2);
    if (pages > 1) { ctx.fillStyle = T.ink2; font(ctx, "600", 20, RLW.F.sans); ctx.textAlign = "right"; ctx.fillText("Page " + page + " of " + pages, W - 30, 40); }
    RLW.footer(ctx, W, H, 66);
    return cv;
  };
  RLW.canvasBlob = function (cv, type, q) { return new Promise(function (res) { cv.toBlob(res, type || "image/png", q || 0.92); }); };
  RLW.download = function (blob, name) {
    var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000);
  };
  RLW.slug = function (s) { return String(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "member"; };

  // ---------- tiny ZIP writer (stored) ----------
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  RLW.zip = async function (files) {
    var parts = [], central = [], off = 0, enc = new TextEncoder();
    for (var i = 0; i < files.length; i++) {
      var data = new Uint8Array(await files[i].blob.arrayBuffer()), nm = enc.encode(files[i].name), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  };
})();
