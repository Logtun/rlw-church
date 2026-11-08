/* RLW Birthdays — 12 monthly designs. Drawn on canvas; the only image is the church logo. Loaded after art.js. */
(function () {
  var RLW = window.RLW, F = RLW.F, font = RLW.font, spaced = RLW.spaced, wrap = RLW.wrap, TAU = Math.PI * 2;
  function base(o) { var t = {}, k; for (k in RLW.CLASSIC) t[k] = RLW.CLASSIC[k]; for (k in o) t[k] = o[k]; return t; }
  function lin(ctx, x0, y0, x1, y1, cols) { var g = ctx.createLinearGradient(x0, y0, x1, y1); cols.forEach(function (c, i) { g.addColorStop(i / (cols.length - 1), c); }); return g; }
  function radial(ctx, x, y, r0, r1, cols) { var g = ctx.createRadialGradient(x, y, r0, x, y, r1); cols.forEach(function (c, i) { g.addColorStop(i / (cols.length - 1), c); }); return g; }
  function rr(seed) { return RLW.rng(seed); }
  // ---------- shapes ----------
  function shapePath(ctx, shape, cx, cy, w, h) {
    var x = cx - w / 2, y = cy - h / 2, k;
    ctx.beginPath();
    if (shape === "circle") ctx.arc(cx, cy, w / 2, 0, TAU);
    else if (shape === "oval") ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, TAU);
    else if (shape === "arch") { ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(cx, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }
    else if (shape === "gothic") { var sh = w * 0.62; ctx.moveTo(x, y + h); ctx.lineTo(x, y + sh); ctx.quadraticCurveTo(x, y + sh * 0.25, cx, y); ctx.quadraticCurveTo(x + w, y + sh * 0.25, x + w, y + sh); ctx.lineTo(x + w, y + h); ctx.closePath(); }
    else if (shape === "octagon") { var c = w * 0.29; ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath(); }
    else { k = Math.min(w, h) * (shape === "square" ? 0.02 : 0.11); RLW.roundRect(ctx, x, y, w, h, k); }
  }
  // photo in any shape: outer ring (3-colour gradient), a gap, then the photo (cover)
  function shapePhoto(ctx, img, shape, cx, cy, w, h, o) {
    o = o || {}; var T = RLW.T, ring = o.ring || T.ring, rw = o.ringW == null ? 16 : o.ringW, gw = o.gapW == null ? 5 : o.gapW;
    ctx.save();
    if (o.glow !== false) { ctx.shadowColor = o.glowCol || T.glow; ctx.shadowBlur = o.glowBlur || 46; ctx.shadowOffsetY = o.glowY || 0; }
    shapePath(ctx, shape, cx, cy, w + 2 * rw, h + 2 * rw); ctx.fillStyle = lin(ctx, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, ring); ctx.fill();
    ctx.restore();
    if (gw) { shapePath(ctx, shape, cx, cy, w + 2 * gw, h + 2 * gw); ctx.fillStyle = o.gap || T.gap; ctx.fill(); }
    ctx.save(); shapePath(ctx, shape, cx, cy, w, h); ctx.clip();
    if (img) {
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, sc = Math.max(w / iw, h / ih);
      ctx.drawImage(img, cx - iw * sc / 2, cy - ih * sc / 2 + (o.shiftY || 0) * h, iw * sc, ih * sc);
    } else {
      ctx.fillStyle = lin(ctx, 0, cy - h / 2, 0, cy + h / 2, T.phBg); ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.fillStyle = T.phInk; font(ctx, "700", Math.min(w, h) * 0.34, F.serif); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(o.initials || "", cx, cy); ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }
  RLW.shapePhoto = shapePhoto;
  function logoAt(ctx, logo, x, y, h, align) { if (!logo) return 0; var w = h * logo.width / logo.height, lx = align === "left" ? x : align === "right" ? x - w : x - w / 2; ctx.drawImage(logo, lx, y, w, h); return w; }
  // one line of letter-spaced text shrunk to fit maxW
  function fitSpaced(ctx, text, x, y, size, w, fam, sp, maxW, align) {
    for (var s = size; s > 12; s -= 1) { font(ctx, w, s, fam); var tw = 0; for (var i = 0; i < text.length; i++) tw += ctx.measureText(text[i]).width; tw += sp * s / size * (text.length - 1); if (tw <= maxW) break; }
    var spp = sp * s / size;
    if (align === "left") spaced(ctx, text, x, y, spp, "left"); else if (align === "right") { var w2 = 0; for (var j = 0; j < text.length; j++) w2 += ctx.measureText(text[j]).width; w2 += spp * (text.length - 1); spaced(ctx, text, x - w2, y, spp, "left"); } else spaced(ctx, text, x, y, spp);
    return s;
  }
  function fitText(ctx, text, x, y, size, w, fam, maxW, style) { for (var s = size; s > 12; s -= 2) { font(ctx, w, s, fam, style); if (ctx.measureText(text).width <= maxW) break; } ctx.fillText(text, x, y); return s; }
  // name + department; returns the y under the block
  function nameBlock(ctx, m, o) {
    var T = RLW.T, al = o.align || "center";
    var fit = RLW.fitName(ctx, m.name, o.w, o.size || 72, o.min || 44, o.fam || F.serif, o.weight || "800", o.lines || 2);
    ctx.textAlign = al; ctx.fillStyle = o.ink || T.ink; font(ctx, o.weight || "800", fit.size, o.fam || F.serif);
    if (o.shadow) { ctx.save(); ctx.shadowColor = o.shadow; ctx.shadowBlur = 10; }
    var y = o.y; fit.lines.forEach(function (l, i) { ctx.fillText(l, o.x, y + i * fit.size * 1.06); });
    if (o.shadow) ctx.restore();
    y += (fit.lines.length - 1) * fit.size * 1.06;
    if (m.dept) { ctx.fillStyle = o.deptCol || T.accTxt; ctx.textAlign = "center"; var d = String(m.dept).toUpperCase().slice(0, 40);
      y += o.deptGap || 50; fitSpaced(ctx, d, o.x, y, o.deptSize || 28, "600", F.sans, 2, o.w, al); }
    return y;
  }
  // KJV line anchored to a bottom baseline (the reference line); returns the top of the block
  function verse(ctx, m, o) {
    var T = RLW.T, b = o.b || RLW.blessFor(m.name, m.day, m.month), size = o.size || 29, lh = size * 1.32, al = o.align || "center";
    font(ctx, "500", size, F.serif, "italic"); var q = "\u201C" + b.t + "\u201D", lines = wrap(ctx, q, o.w, 2);
    if (lines.length === 2 && q.indexOf("\u2026") < 0) { for (var bw = o.w - 10; bw > o.w * 0.5; bw -= 10) { var l2 = wrap(ctx, q, bw, 99); if (l2.length > 2) break; lines = l2; } }
    var top = o.bottom - 6 - lines.length * lh;
    ctx.textAlign = al; ctx.fillStyle = o.ink || T.ink2; font(ctx, "500", size, F.serif, "italic");
    lines.forEach(function (l, i) { ctx.fillText(l, o.x, top + size + i * lh); });
    ctx.fillStyle = o.refCol || T.acc; ctx.textAlign = "center"; font(ctx, "700", size * 0.74, F.sans);
    if (al === "left") spaced(ctx, b.r.toUpperCase(), o.x, o.bottom + size * 0.35, 2, "left"); else spaced(ctx, b.r.toUpperCase(), o.x, o.bottom + size * 0.35, 2);
    return top;
  }
  function pillAt(ctx, m, x, y, size, fill, ink, align) {
    var T = RLW.T; font(ctx, "700", size, F.sans); var w = ctx.measureText(RLW.dateText(m.day, m.month)).width + size * 1.6;
    var cx = align === "left" ? x + w / 2 : align === "right" ? x - w / 2 : x;
    return RLW.pill(ctx, RLW.dateText(m.day, m.month), cx, y, size, fill || T.pill, ink || T.pillInk);
  }
  function parishLines(ctx, x, y, align, col, size) {
    ctx.fillStyle = col; ctx.textAlign = "left"; font(ctx, "800", size * 1.25, F.sans);
    spaced(ctx, "RCCG", x, y, size * 0.25, align === "left" ? "left" : undefined);
    font(ctx, "600", size, F.sans); spaced(ctx, "RIVERS OF LIVING WATER PARISH", x, y + size * 1.6, size * 0.12, align === "left" ? "left" : undefined);
  }
  // ---------- motifs ----------
  function snowflake(ctx, x, y, r, rot, col, lw) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = "round";
    for (var i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r);
      ctx.moveTo(0, -r * 0.5); ctx.lineTo(-r * 0.22, -r * 0.7); ctx.moveTo(0, -r * 0.5); ctx.lineTo(r * 0.22, -r * 0.7);
      ctx.moveTo(0, -r * 0.75); ctx.lineTo(-r * 0.13, -r * 0.88); ctx.moveTo(0, -r * 0.75); ctx.lineTo(r * 0.13, -r * 0.88); ctx.stroke(); }
    ctx.restore();
  }
  function leafShape(ctx, x, y, len, wid, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(wid, -len * 0.45, 0, -len); ctx.quadraticCurveTo(-wid, -len * 0.45, 0, 0); ctx.closePath(); ctx.restore();
  }
  function leaf(ctx, x, y, len, wid, rot, col, vein) {
    leafShape(ctx, x, y, len, wid, rot); ctx.fillStyle = col; ctx.fill();
    if (vein) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = vein; ctx.lineWidth = Math.max(1, len * 0.03); ctx.beginPath(); ctx.moveTo(0, len * 0.12); ctx.lineTo(0, -len * 0.85);
      for (var k = 1; k < 4; k++) { var yy = -len * k * 0.2; ctx.moveTo(0, yy); ctx.lineTo(wid * 0.45, yy - len * 0.12); ctx.moveTo(0, yy); ctx.lineTo(-wid * 0.45, yy - len * 0.12); } ctx.stroke(); ctx.restore(); }
  }
  function mapleLeaf(ctx, x, y, s, rot, col, vein) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s / 100, s / 100); ctx.beginPath();
    var p = [[0,-100],[14,-62],[36,-72],[30,-36],[64,-48],[56,-20],[84,-16],[46,10],[54,26],[12,18],[6,48],[0,48],[-6,48],[-12,18],[-54,26],[-46,10],[-84,-16],[-56,-20],[-64,-48],[-30,-36],[-36,-72],[-14,-62]];
    ctx.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    if (vein) { ctx.strokeStyle = vein; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(0, -80); ctx.moveTo(0, 5); ctx.lineTo(60, -36); ctx.moveTo(0, 5); ctx.lineTo(-60, -36); ctx.moveTo(0, 20); ctx.lineTo(40, 20); ctx.moveTo(0, 20); ctx.lineTo(-40, 20); ctx.stroke(); }
    ctx.restore();
  }
  function flower(ctx, x, y, r, n, col, mid, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    for (var i = 0; i < n; i++) { ctx.rotate(TAU / n); ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.32, r * 0.55, 0, 0, TAU); ctx.fillStyle = col; ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.fillStyle = mid; ctx.fill(); ctx.restore();
  }
  function wheat(ctx, x, y, len, ang, col, grain) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = col; ctx.lineWidth = len * 0.012 + 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.04, -len * 0.5, 0, -len); ctx.stroke();
    ctx.fillStyle = grain || col;
    for (var k = 0; k < 8; k++) { var yy = -len * (0.62 + k * 0.05), g = len * 0.05;
      ctx.beginPath(); ctx.ellipse(-g * 0.55, yy, g * 0.32, g * 0.75, -0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(g * 0.55, yy - g * 0.3, g * 0.32, g * 0.75, 0.5, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0, -len * 1.02, len * 0.016, len * 0.04, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function hollyLeaf(ctx, x, y, s, rot, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s / 100, s / 100); ctx.beginPath(); ctx.moveTo(0, 0);
    var pts = [[18,-14],[30,-10],[34,-32],[50,-30],[52,-52],[68,-50],[78,-72],[100,-80],[90,-58],[74,-48],[72,-28],[56,-24],[52,-6],[36,-2],[30,10],[0,0]];
    pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); }); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(92, -74); ctx.stroke(); ctx.restore();
  }
  function holly(ctx, x, y, s, rot) {
    hollyLeaf(ctx, x, y, s, rot - 0.2, "#1F6B33"); hollyLeaf(ctx, x, y, s * 0.92, rot + Math.PI + 0.5, "#185A2B"); hollyLeaf(ctx, x, y, s * 0.8, rot - 1.5, "#2A7D3E");
    [[0, 0], [s * 0.14, s * 0.06], [-s * 0.06, s * 0.13]].forEach(function (p) { ctx.beginPath(); ctx.arc(x + p[0], y + p[1], s * 0.09, 0, TAU); ctx.fillStyle = radial(ctx, x + p[0] - s * 0.03, y + p[1] - s * 0.03, 1, s * 0.1, ["#ff5a5a", "#C4101C", "#7a0008"]); ctx.fill(); });
  }
  function crown(ctx, cx, by, w, h) {
    ctx.save(); var x = cx - w / 2;
    ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x - w * 0.04, by - h * 0.72); ctx.lineTo(x + w * 0.22, by - h * 0.42); ctx.lineTo(x + w * 0.5, by - h); ctx.lineTo(x + w * 0.78, by - h * 0.42); ctx.lineTo(x + w * 1.04, by - h * 0.72); ctx.lineTo(x + w, by); ctx.closePath();
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; ctx.fillStyle = lin(ctx, 0, by - h, 0, by, ["#FFF0B3", "#E9B949", "#A8770F"]); ctx.fill(); ctx.restore();
    ctx.fillStyle = lin(ctx, 0, by - h * 0.2, 0, by + h * 0.12, ["#F7D774", "#B8861A"]); RLW.roundRect(ctx, x - w * 0.02, by - h * 0.16, w * 1.04, h * 0.26, h * 0.08); ctx.fill();
    [[x - w * 0.04, by - h * 0.72], [x + w * 0.5, by - h], [x + w * 1.04, by - h * 0.72]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], h * 0.085, 0, TAU); ctx.fillStyle = "#FFF4CC"; ctx.fill(); });
    [[0.2, "#C0183C"], [0.5, "#2B6BD6"], [0.8, "#C0183C"]].forEach(function (j) { ctx.beginPath(); ctx.arc(x + w * j[0], by - h * 0.03, h * 0.075, 0, TAU); ctx.fillStyle = j[1]; ctx.fill(); ctx.strokeStyle = "#FFF0B3"; ctx.lineWidth = 2; ctx.stroke(); });
  }
  function rays(ctx, cx, cy, n, len, half, col, rot) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot || 0); ctx.fillStyle = col;
    for (var i = 0; i < n; i++) { ctx.rotate(TAU / n); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-half, -len); ctx.lineTo(half, -len); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function wave(ctx, W, y0, amp, len, ph, col, H) {
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, y0);
    for (var x = 0; x <= W + 10; x += 10) ctx.lineTo(x, y0 + Math.sin(x / len * TAU + ph) * amp + Math.sin(x / (len * 0.47) * TAU + ph * 1.7) * amp * 0.3);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  function ankaraTile(ctx, x, y, s, k) {
    var G = "#008751", Y = "#F2B705", O = "#C8471E", K = "#1b1b1b", Wt = "#FFFDF5";
    ctx.fillStyle = k % 2 ? G : K; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = Y; ctx.beginPath(); ctx.moveTo(x + s / 2, y + s * 0.1); ctx.lineTo(x + s * 0.9, y + s / 2); ctx.lineTo(x + s / 2, y + s * 0.9); ctx.lineTo(x + s * 0.1, y + s / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = O; ctx.beginPath(); ctx.moveTo(x + s / 2, y + s * 0.26); ctx.lineTo(x + s * 0.74, y + s / 2); ctx.lineTo(x + s / 2, y + s * 0.74); ctx.lineTo(x + s * 0.26, y + s / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = Wt; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.09, 0, TAU); ctx.fill();
    ctx.fillStyle = k % 2 ? Y : G; [[0, 0], [s, 0], [0, s], [s, s]].forEach(function (p) { ctx.beginPath(); ctx.moveTo(x + p[0], y + p[1]); ctx.lineTo(x + p[0] + (p[0] ? -s * 0.22 : s * 0.22), y + p[1]); ctx.lineTo(x + p[0], y + p[1] + (p[1] ? -s * 0.22 : s * 0.22)); ctx.closePath(); ctx.fill(); });
  }
  function ankaraBand(ctx, x, y, w, h, s) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    var k = 0; for (var yy = y; yy < y + h; yy += s) for (var xx = x; xx < x + w; xx += s) ankaraTile(ctx, xx, yy, s, k++ + Math.round(yy / s));
    ctx.restore();
  }
  function curl(ctx, x, y, s, flipX, flipY, col, lw) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flipX ? -s : s, flipY ? -s : s); ctx.strokeStyle = col; ctx.lineWidth = lw / s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 120); ctx.bezierCurveTo(0, 40, 40, 0, 120, 0);
    ctx.moveTo(10, 70); ctx.bezierCurveTo(30, 40, 70, 40, 70, 70); ctx.bezierCurveTo(70, 90, 45, 92, 42, 74);
    ctx.moveTo(70, 10); ctx.bezierCurveTo(40, 30, 40, 70, 70, 70);
    ctx.moveTo(120, 0); ctx.bezierCurveTo(150, 0, 170, 18, 160, 36); ctx.bezierCurveTo(152, 50, 132, 40, 140, 28);
    ctx.moveTo(0, 120); ctx.bezierCurveTo(0, 150, 18, 170, 36, 160); ctx.bezierCurveTo(50, 152, 40, 132, 28, 140);
    ctx.stroke(); ctx.beginPath(); ctx.arc(22, 22, 6, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.restore();
  }
  function dust(ctx, W, H, seed, n, col, maxR, t, avoid) {
    var r = rr(seed); ctx.fillStyle = col;
    for (var i = 0; i < n; i++) { var x = r() * W, y = r() * H, rad0 = (0.6 + r() * maxR), tw = t == null ? 1 : 0.45 + 0.55 * Math.sin(t * 2 + i);
      if (avoid && avoid(x, y)) continue; ctx.globalAlpha = (0.35 + r() * 0.6) * tw; ctx.beginPath(); ctx.arc(x, y, rad0, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function arcText(ctx, text, cx, cy, r, sp) {
    var ws = text.split("").map(function (c) { return ctx.measureText(c).width; }), tot = ws.reduce(function (a, b) { return a + b; }, 0) + sp * (text.length - 1), a = -Math.PI / 2 - tot / r / 2;
    ctx.textAlign = "center";
    for (var i = 0; i < text.length; i++) { var aa = a + ws[i] / 2 / r; ctx.save(); ctx.translate(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r); ctx.rotate(aa + Math.PI / 2); ctx.fillText(text[i], 0, 0); ctx.restore(); a += (ws[i] + sp) / r; }
  }
  function star5(ctx, x, y, R, r, rot) { ctx.beginPath(); for (var i = 0; i < 10; i++) { var rad1 = i % 2 ? r : R, a = i * Math.PI / 5 - Math.PI / 2 + (rot || 0); ctx.lineTo(x + Math.cos(a) * rad1, y + Math.sin(a) * rad1); } ctx.closePath(); }
  function fall(r, W, H, t, sp) { var x = r() * W, y0 = r() * H, v = (sp || 50) * (0.6 + r()), sw = r() * TAU; if (t == null) return [x, y0, r() * TAU]; return [x + Math.sin(t * 0.8 + sw) * 24, (y0 + v * t) % (H + 80) - 40, r() * TAU + t * (0.4 + r())]; }
  var M = RLW.MONTHS;

  // =============== JANUARY — New Beginnings (ice blue and silver) ===============
  RLW.THEMES[1] = base({ key: "jan", name: "New Beginnings", dark: false,
    ink: "#13306B", ink2: "#2B4A82", head: "#13306B", accTxt: "#3E7CC4", acc: "#5B8FC9", acc3: ["#2F64B5", "#163E86", "#0E2A63"],
    pill: "#1E4FA3", pillInk: "#ffffff", ring: ["#FFFFFF", "#AFC3D9", "#E9F1FA"], glow: "rgba(70,120,190,.35)", gap: "#ffffff", dash: "rgba(91,143,201,.8)",
    phBg: ["#cfe0f3", "#9db9da"], phInk: "#13306B", conf: ["#ffffff", "#CFE3F7", "#9EC3EA", "#B9C6D3", "#E8EEF4", "#5B8FC9"], burst: ["#ffffff", "#BFD7F0", "#7FAAD9", "#C9D2DC"],
    spark: ["#9EC3EA", "#5B8FC9"], footBg: "#13306B", footInk: "#ffffff", footLine: ["#ffffff", "#C9D6E4", "#8FA6C0"], shadow: "rgba(19,48,107,.18)",
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = lin(ctx, 0, 0, W * 0.3, H, ["#F7FBFF", "#E3EFFB", "#C4DBF2"]); ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2;
      for (var i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(W * 1.02, -H * 0.02, W * (0.22 + i * 0.13) + (t ? (t * 18) % (W * 0.13) : 0), 0, TAU); ctx.stroke(); }
      ctx.fillStyle = "rgba(255,255,255,.35)"; for (var k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-W * 0.1 + k * W * 0.32, H); ctx.lineTo(W * 0.1 + k * W * 0.32, H); ctx.lineTo(W * 0.62 + k * W * 0.32, 0); ctx.lineTo(W * 0.56 + k * W * 0.32, 0); ctx.closePath(); ctx.fill(); }
      var r = rr(11), s = W / 1080;
      for (var j = 0; j < 22; j++) { var p = fall(r, W, H, t, 26), sz = (14 + r() * 30) * s; snowflake(ctx, p[0], p[1], sz, p[2], j % 3 ? "rgba(255,255,255,.95)" : "rgba(120,160,205,.55)", (1.5 + sz / 18)); }
    },
    single: function (ctx, W, H, m, photo, logo) {
      RLW.bg(ctx, W, H, 0);
      logoAt(ctx, logo, 66, 46, 116, "left"); parishLines(ctx, 66 + 116 * logo_r(logo) + 22, 92, "left", "#13306B", 21);
      var px = 800, pw = 420, ph = 600, py = 640;
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, py, pw / 2 + 44, ph / 2 + 44, 0, 0, TAU); ctx.stroke(); ctx.restore();
      shapePhoto(ctx, photo, "oval", px, py, pw, ph, { ringW: 14, glowBlur: 40, initials: RLW.initials(m.name) });
      snowflake(ctx, px + 190, py - 290, 34, 0.2, "#ffffff", 4); snowflake(ctx, px - 205, py + 270, 24, 0.5, "#9EC3EA", 3);
      ctx.textAlign = "left"; ctx.fillStyle = RLW.goldFill(ctx, 320, 440); font(ctx, "400", 150, F.script); ctx.fillText("Happy", 60, 432);
      ctx.fillStyle = "#13306B"; fitSpaced(ctx, "BIRTHDAY", 72, 512, 74, "800", F.sans, 9, 480, "left");
      ctx.fillStyle = "#8FA6C0"; ctx.fillRect(74, 546, 120, 4); ctx.fillStyle = "#5B8FC9"; ctx.fillRect(200, 546, 40, 4);
      pillAt(ctx, m, 72, 626, 34, null, null, "left");
      nameBlock(ctx, m, { x: 72, y: 750, w: 480, size: 66, min: 40, align: "left", deptGap: 50, lines: 3 });
      ctx.save(); ctx.fillStyle = "rgba(255,255,255,.62)"; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2; RLW.roundRect(ctx, 60, 1046, W - 120, 168, 28); ctx.fill(); ctx.stroke(); ctx.restore();
      verse(ctx, m, { x: W / 2, w: W - 220, bottom: 1170, size: 31 });
      RLW.footer(ctx, W, H, 72);
    }
  });
  function logo_r(logo) { return logo ? logo.width / logo.height : 0.76; }

  // =============== FEBRUARY — Grace and Love (rose and gold) ===============
  RLW.THEMES[2] = base({ key: "feb", name: "Grace and Love", dark: false,
    ink: "#6B1E3A", ink2: "#7E3552", head: "#6B1E3A", accTxt: "#B07A1E", acc: "#B8862B", acc3: ["#E9C46A", "#C0902F", "#8A5F12"],
    pill: "#8E2B4D", pillInk: "#FFF4E6", ring: ["#F6DC9A", "#C0902F", "#FBEBC2"], glow: "rgba(176,90,120,.35)", gap: "#FFF7F3", dash: "rgba(192,144,47,.85)",
    phBg: ["#F5C9D3", "#C97B92"], phInk: "#6B1E3A", conf: ["#E9C46A", "#F2B8C6", "#E7879F", "#FFFFFF", "#C0902F", "#F9D9E0"], burst: ["#E9C46A", "#F2B8C6", "#E7879F", "#FFFFFF"],
    spark: ["#E9C46A", "#C0902F"], footBg: "#6B1E3A", footInk: "#FFF4E6", footLine: ["#F6DC9A", "#C0902F", "#8A5F12"], shadow: "rgba(107,30,58,.18)",
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = radial(ctx, W / 2, H * 0.4, 0, Math.max(W, H) * 0.8, ["#FFF8F5", "#FBE3E6", "#F1C2CC"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080, c = "rgba(184,134,43,.8)";
      curl(ctx, 26 * s, 26 * s, 1.3 * s, false, false, c, 3 * s); curl(ctx, W - 26 * s, 26 * s, 1.3 * s, true, false, c, 3 * s);
      curl(ctx, 26 * s, H - 100 * s, 1.3 * s, false, true, c, 3 * s); curl(ctx, W - 26 * s, H - 100 * s, 1.3 * s, true, true, c, 3 * s);
      var r = rr(22); for (var i = 0; i < 18; i++) { var p = fall(r, W, H, t, 30); ctx.globalAlpha = 0.55; leaf(ctx, p[0], p[1], (26 + r() * 22) * s, (14 + r() * 8) * s, p[2], i % 2 ? "#E7879F" : "#F2B8C6"); }
      ctx.globalAlpha = 1; dust(ctx, W, H, 23, 70, "#C0902F", 2.6 * s, t);
    },
    single: function (ctx, W, H, m, photo, logo) {
      RLW.bg(ctx, W, H, 0);
      logoAt(ctx, logo, W / 2, 24, 104); ctx.fillStyle = "#6B1E3A"; ctx.textAlign = "center"; font(ctx, "600", 20, F.sans); spaced(ctx, "RCCG  RIVERS OF LIVING WATER PARISH", W / 2, 154, 3);
      var aw = 500, ah = 540, acx = W / 2, acy = 222 + ah / 2;
      ctx.save(); ctx.strokeStyle = "#C0902F"; ctx.lineWidth = 2.5; shapePath(ctx, "arch", acx, acy, aw + 70, ah + 70); ctx.stroke(); ctx.restore();
      shapePhoto(ctx, photo, "arch", acx, acy, aw, ah, { ringW: 12, gapW: 6, initials: RLW.initials(m.name), shiftY: 0.02 });
      RLW.sparkle(ctx, acx + aw / 2 + 30, 250, 24); RLW.sparkle(ctx, acx - aw / 2 - 22, 560, 16);
      ctx.textAlign = "center"; ctx.save(); ctx.shadowColor = "rgba(255,255,255,.9)"; ctx.shadowBlur = 14; ctx.fillStyle = RLW.goldFill(ctx, 780, 880); font(ctx, "400", 128, F.script); ctx.fillText("Happy Birthday", W / 2, 872); ctx.restore();
      pillAt(ctx, m, W / 2, 930, 32);
      var vt = 1150; var y = nameBlock(ctx, m, { x: W / 2, y: 1030, w: 900, size: 66, min: 42, deptGap: 46 });
      ctx.fillStyle = "#C0902F"; ctx.fillRect(W / 2 - 60, Math.max(y + 30, 1120), 120, 2);
      verse(ctx, m, { x: W / 2, w: 780, bottom: 1240, size: 28 });
      RLW.footer(ctx, W, H, 64);
    }
  });

  // =============== MARCH — Spring Blessings (green florals) ===============
  function wreath(ctx, cx, cy, R, t) {
    var n = 34, s = R / 230;
    for (var i = 0; i < n; i++) { var a = i / n * TAU + (t ? Math.sin(t) * 0.02 : 0), x = cx + Math.cos(a) * (R + 30 * s), y = cy + Math.sin(a) * (R + 30 * s);
      leaf(ctx, x, y, 58 * s, 20 * s, a + (i % 2 ? 0.6 : 2.5), i % 3 ? "#3F8F4E" : "#6DB36A", "rgba(255,255,255,.35)"); }
    for (var k = 0; k < 9; k++) { var b = k / 9 * TAU + 0.35, fx = cx + Math.cos(b) * (R + 38 * s), fy = cy + Math.sin(b) * (R + 38 * s);
      flower(ctx, fx, fy, 30 * s, 5, k % 3 === 0 ? "#F7C6D0" : k % 3 === 1 ? "#FFFFFF" : "#FFE08A", "#F2A93B", b + (t || 0) * 0.3); }
  }
  RLW.THEMES[3] = base({ key: "mar", name: "Spring Blessings", dark: false,
    ink: "#1E4D2B", ink2: "#2F5E3B", head: "#1E4D2B", accTxt: "#4E8F3A", acc: "#5E9E45", acc3: ["#7CBF5A", "#3F8F4E", "#22602F"],
    pill: "#3F8F4E", pillInk: "#ffffff", ring: ["#FFFFFF", "#CFE8C4", "#FFFFFF"], glow: "rgba(63,143,78,.3)", gap: "#ffffff", dash: "rgba(63,143,78,.7)",
    phBg: ["#d9efcf", "#a9d29a"], phInk: "#1E4D2B", conf: ["#F7C6D0", "#FFFFFF", "#FFE08A", "#9ED38C", "#6DB36A"], burst: ["#F7C6D0", "#FFE08A", "#9ED38C", "#FFFFFF"],
    spark: ["#FFE08A", "#F2A93B"], footBg: "#1E4D2B", footInk: "#ffffff", footLine: ["#BFE3A8", "#6DB36A", "#3F8F4E"], shadow: "rgba(30,77,43,.15)",
    deco: function (ctx, cx, cy, R, t) { wreath(ctx, cx, cy, R, t); },
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, ["#FBFDF5", "#EEF7E4", "#D6EBC7"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080, sway = t ? Math.sin(t * 0.9) * 0.05 : 0;
      [[0, 0, 0.6], [W, 0, 2.5], [0, H - 20 * s, -0.6], [W, H - 20 * s, 3.8]].forEach(function (c, ci) {
        for (var i = 0; i < 9; i++) { var a = c[2] + (i - 4) * 0.16 + sway, d = (60 + i * 14) * s; leaf(ctx, c[0] + Math.cos(a) * d * 0.4, c[1] + Math.sin(a) * d * 0.4, (80 + (i % 3) * 22) * s, 24 * s, a + Math.PI / 2, i % 2 ? "#4E9A57" : "#7DBE6E", "rgba(255,255,255,.3)"); }
        for (var f = 0; f < 3; f++) { var b = c[2] + (f - 1) * 0.38 + sway; flower(ctx, c[0] + Math.cos(b) * 140 * s, c[1] + Math.sin(b) * 140 * s, (34 - f * 4) * s, 5, ["#F7C6D0", "#FFFFFF", "#FFE08A"][(f + ci) % 3], "#F2A93B", b); }
      });
      var r = rr(33); for (var j = 0; j < 14; j++) { var p = fall(r, W, H, t, 22); ctx.globalAlpha = 0.6; leaf(ctx, p[0], p[1], 20 * s, 9 * s, p[2], j % 2 ? "#F7C6D0" : "#A6D68F"); } ctx.globalAlpha = 1;
    },
    single: function (ctx, W, H, m, photo, logo) {
      RLW.bg(ctx, W, H, 0);
      logoAt(ctx, logo, W / 2, 30, 112); ctx.fillStyle = "#1E4D2B"; ctx.textAlign = "center"; font(ctx, "600", 20, F.sans); spaced(ctx, "RCCG  RIVERS OF LIVING WATER PARISH", W / 2, 170, 3);
      ctx.fillStyle = RLW.goldFill(ctx, 200, 300); font(ctx, "400", 124, F.script); ctx.fillText("Happy Birthday", W / 2, 296);
      var cy = 600, R = 200; wreath(ctx, W / 2, cy, R, 0); RLW.photoFrame(ctx, photo, W / 2, cy, R, { initials: RLW.initials(m.name) });
      pillAt(ctx, m, W / 2, cy + R + 82, 32);
      nameBlock(ctx, m, { x: W / 2, y: cy + R + 178, w: 900, size: 68, min: 42, deptGap: 48 });
      verse(ctx, m, { x: W / 2, w: 760, bottom: 1232, size: 28 });
      RLW.footer(ctx, W, H, 66);
    }
  });

  // =============== APRIL — Risen Light (Easter lilac, cross and rays) ===============
  function cross(ctx, cx, cy, h, col, glow) { var w = h * 0.62, b = h * 0.16; ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = h * 0.5; ctx.fillStyle = col; ctx.fillRect(cx - b / 2, cy - h / 2, b, h); ctx.fillRect(cx - w / 2, cy - h / 2 + h * 0.24, w, b); ctx.restore(); }
  RLW.THEMES[4] = base({ key: "apr", name: "Risen Light", dark: true,
    ink: "#ffffff", ink2: "rgba(255,255,255,.92)", head: "rgba(255,255,255,.9)", accTxt: "#F3DFA2", acc: "#E8C66A", acc3: ["#FFF3C9", "#EBC968", "#B98F2A"],
    pill: "#F3DFA2", pillInk: "#3B2468", ring: ["#FFF3C9", "#D9B5F0", "#FFFFFF"], glow: "rgba(255,240,200,.65)", gap: "#ffffff", dash: "rgba(255,243,201,.9)",
    phBg: ["#8A6BC4", "#3B2468"], conf: ["#FFF3C9", "#E8C66A", "#D9B5F0", "#FFFFFF", "#B79BE0"], burst: ["#FFF3C9", "#E8C66A", "#D9B5F0", "#FFFFFF"],
    spark: ["#FFFBEA", "#F3DFA2"], footBg: "rgba(36,18,70,.9)", footLine: ["#FFF3C9", "#E8C66A", "#B98F2A"], shadow: "rgba(30,10,60,.4)",
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, ["#2E1A5C", "#5B3F99", "#A88BD6"]); ctx.fillRect(0, 0, W, H);
      var cx = W / 2, cy = H * 0.3; ctx.globalAlpha = 0.13; rays(ctx, cx, cy, 24, Math.max(W, H) * 1.2, Math.max(W, H) * 0.07, "#FFF3C9", (t || 0) * 0.04); ctx.globalAlpha = 1;
      ctx.fillStyle = radial(ctx, cx, cy, 0, Math.min(W, H) * 0.65, ["rgba(255,246,214,.55)", "rgba(255,246,214,.12)", "rgba(255,246,214,0)"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080; ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.ellipse(W * 0.2, H, W * 0.5, 160 * s, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(W * 0.85, H, W * 0.45, 130 * s, 0, 0, TAU); ctx.fill();
      dust(ctx, W, H, 44, 60, "#FFF3C9", 2.4 * s, t);
    },
    single: function (ctx, W, H, m, photo, logo) {
      RLW.bg(ctx, W, H, 0);
      logoAt(ctx, logo, 60, 44, 112, "left"); parishLines(ctx, 60 + 112 * logo_r(logo) + 20, 88, "left", "rgba(255,255,255,.92)", 20);
      var gw = 470, gh = 600, gx = W / 2, gy = 250 + gh / 2;
      ctx.globalAlpha = 0.22; rays(ctx, gx, gy - 40, 16, 560, 46, "#FFF3C9", 0.1); ctx.globalAlpha = 1;
      shapePhoto(ctx, photo, "gothic", gx, gy, gw, gh, { ringW: 14, gapW: 5, initials: RLW.initials(m.name), glowBlur: 70, shiftY: 0.03 });
      cross(ctx, gx, 200, 84, "#FFF3C9", "rgba(255,240,190,.9)");
      ctx.textAlign = "center"; ctx.fillStyle = "#ffffff"; fitSpaced(ctx, "HAPPY BIRTHDAY", W / 2, 940, 64, "700", F.serif, 10, 960);
      ctx.fillStyle = "#F3DFA2"; ctx.fillRect(W / 2 - 200, 968, 140, 2); ctx.fillRect(W / 2 + 60, 968, 140, 2); RLW.sparkle(ctx, W / 2, 969, 14);
      nameBlock(ctx, m, { x: W / 2, y: 1050, w: 900, size: 62, min: 40, fam: F.script === "" ? F.serif : F.serif, deptGap: 44, shadow: "rgba(30,10,60,.5)" });
      pillAt(ctx, m, W / 2, gy + gh / 2 + 6, 30);
      verse(ctx, m, { x: W / 2, w: 880, bottom: 1240, size: 27 });
      RLW.footer(ctx, W, H, 64);
    }
  });

  // =============== MAY — Sunshine (sunflower yellow) ===============
  function sunflower(ctx, cx, cy, R, t) {
    var s = R / 200, rot = (t || 0) * 0.15;
    for (var layer = 0; layer < 2; layer++) for (var i = 0; i < 22; i++) { var a = i / 22 * TAU + layer * (TAU / 44) + rot; leafShape(ctx, cx + Math.cos(a) * (R - 6 * s), cy + Math.sin(a) * (R - 6 * s), (layer ? 92 : 108) * s, 30 * s, a + Math.PI / 2); ctx.fillStyle = layer ? "#F9C623" : "#E9A40C"; ctx.fill(); }
  }
  RLW.THEMES[5] = base({ key: "may", name: "Sunshine of Favour", dark: false,
    ink: "#4A2C0B", ink2: "#5C3A13", head: "#4A2C0B", accTxt: "#A0620A", acc: "#B87111", acc3: ["#C27A12", "#8F520A", "#5A3005"],
    pill: "#5A3A13", pillInk: "#FFE58A", ring: ["#6B4314", "#3E2507", "#7A4E18"], glow: "rgba(160,100,10,.35)", gap: "#FFF4C2", dash: "rgba(90,58,19,.8)",
    phBg: ["#FFE58A", "#E9A40C"], phInk: "#4A2C0B", conf: ["#F9C623", "#E9A40C", "#FFFFFF", "#7FB241", "#5A3A13"], burst: ["#F9C623", "#E9A40C", "#FFFFFF", "#7FB241"],
    spark: ["#FFF8DC", "#E9A40C"], footBg: "#4A2C0B", footInk: "#FFE58A", footLine: ["#F9C623", "#E9A40C", "#A0620A"], shadow: "rgba(74,44,11,.15)",
    deco: function (ctx, cx, cy, R, t) { sunflower(ctx, cx, cy, R + 14, t); },
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = lin(ctx, 0, 0, W, H, ["#FFFBE6", "#FFEFA6", "#FFD95A"]); ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.18; rays(ctx, W * 0.3, H * 0.44, 28, Math.max(W, H) * 1.3, Math.max(W, H) * 0.05, "#FFFFFF", (t || 0) * 0.05); ctx.globalAlpha = 1;
      var s = Math.min(W, H) / 1080;
      [[W + 30 * s, H * 0.06, 120], [-40 * s, H * 0.82, 100], [W * 0.96, H * 0.76, 70]].forEach(function (f, i) { ctx.globalAlpha = 0.5; sunflower(ctx, f[0], f[1], f[2] * s * 0.7, (t || 0) * (i % 2 ? -1 : 1)); ctx.beginPath(); ctx.arc(f[0], f[1], f[2] * s * 0.62, 0, TAU); ctx.fillStyle = "#6B4314"; ctx.fill(); });
      ctx.globalAlpha = 1;
      var r = rr(55); for (var j = 0; j < 12; j++) { var p = fall(r, W, H, t, 24); ctx.globalAlpha = 0.5; leaf(ctx, p[0], p[1], 24 * s, 9 * s, p[2], "#F9C623"); } ctx.globalAlpha = 1;
    },
    single: function (ctx, W, H, m, photo, logo) {
      RLW.bg(ctx, W, H, 0);
      var cx = 330, cy = 610, R = 205; sunflower(ctx, cx, cy, R + 14, 0); RLW.photoFrame(ctx, photo, cx, cy, R, { initials: RLW.initials(m.name) });
      logoAt(ctx, logo, W - 60, 40, 118, "right"); ctx.fillStyle = "#4A2C0B"; font(ctx, "600", 18, F.sans); ctx.textAlign = "right"; ctx.fillText("RCCG RIVERS OF LIVING WATER PARISH", W - 60, 190);
      var x = 640, w = 380; ctx.textAlign = "left"; ctx.fillStyle = RLW.goldFill(ctx, 300, 420); font(ctx, "400", 142, F.script); ctx.fillText("Happy", x - 20, 400);
      ctx.fillStyle = "#4A2C0B"; fitSpaced(ctx, "BIRTHDAY", x, 476, 64, "800", F.sans, 6, w, "left");
      ctx.fillStyle = "#E9A40C"; ctx.fillRect(x, 506, 90, 6);
      pillAt(ctx, m, x, 586, 30, null, null, "left");
      nameBlock(ctx, m, { x: x, y: 690, w: w, size: 60, min: 36, align: "left", deptGap: 48, deptSize: 25, lines: 3 });
      ctx.fillStyle = "rgba(255,255,255,.55)"; RLW.roundRect(ctx, 60, 1046, W - 120, 168, 84); ctx.fill();
      verse(ctx, m, { x: W / 2, w: W - 260, bottom: 1170, size: 30 });
      RLW.footer(ctx, W, H, 70);
    }
  });

  // =============== JUNE — Living Water (teal waves) ===============
  RLW.THEMES[6] = base({ key: "jun", name: "Living Water", dark: true,
    ink: "#ffffff", ink2: "rgba(235,255,255,.92)", head: "rgba(255,255,255,.9)", accTxt: "#8FF0E4", acc: "#5FD8C9", acc3: ["#E8FFFB", "#9DEDE2", "#4CC3B3"],
    pill: "#FFFFFF", pillInk: "#075A66", ring: ["#E8FFFB", "#5FD8C9", "#FFFFFF"], glow: "rgba(140,240,228,.5)", gap: "#ffffff", dash: "rgba(180,255,245,.9)",
    phBg: ["#1A8C9A", "#063F4A"], conf: ["#FFFFFF", "#8FF0E4", "#5FD8C9", "#BDF7FF", "#F6D77A"], burst: ["#FFFFFF", "#8FF0E4", "#5FD8C9", "#F6D77A"],
    spark: ["#FFFFFF", "#8FF0E4"], footBg: "rgba(2,30,38,.88)", footLine: ["#E8FFFB", "#5FD8C9", "#2E9C8F"], shadow: "rgba(0,30,40,.45)",
    deco: function (ctx, cx, cy, R, t) { ctx.strokeStyle = "rgba(180,255,245,.5)"; ctx.lineWidth = 3; for (var i = 0; i < 3; i++) { var d = ((t || 0) * 30 + i * 40) % 120; ctx.globalAlpha = 1 - d / 120; ctx.beginPath(); ctx.arc(cx, cy, R + 30 + d, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1; },
    bg: function (ctx, W, H, t) {
      t = t || 0; ctx.fillStyle = lin(ctx, 0, 0, 0, H, ["#0B6E7F", "#075666", "#033640"]); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = radial(ctx, W * 0.5, H * 0.32, 0, Math.max(W, H) * 0.6, ["rgba(140,240,228,.35)", "rgba(140,240,228,0)"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080, y0 = H * 0.66;
      wave(ctx, W, y0, 22 * s, 700 * s, t * 0.9, "rgba(95,216,201,.22)", H);
      wave(ctx, W, y0 + 50 * s, 26 * s, 560 * s, -t * 1.1 + 1, "rgba(30,150,160,.45)", H);
      wave(ctx, W, y0 + 110 * s, 20 * s, 820 * s, t * 0.7 + 2, "rgba(3,60,72,.8)", H);
      var r = rr(66); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2 * s;
      for (var i = 0; i < 16; i++) { var x = r() * W, sp = 30 + r() * 50, y = H - ((r() * H + t * sp * s) % (H * 0.55)), rad0 = (4 + r() * 10) * s; ctx.beginPath(); ctx.arc(x + Math.sin(t + i) * 8 * s, y, rad0, 0, TAU); ctx.stroke(); }
    },
    single: function (ctx, W, H, m, photo, logo) {
      RLW.bg(ctx, W, H, 0);
      logoAt(ctx, logo, 58, 40, 112, "left"); parishLines(ctx, 58 + 112 * logo_r(logo) + 20, 84, "left", "rgba(255,255,255,.92)", 20);
      var cy = 470, R = 225; RLW.THEMES[6].deco(ctx, W / 2, cy, R, 1.2); RLW.photoFrame(ctx, photo, W / 2, cy, R, { initials: RLW.initials(m.name) });
      pillAt(ctx, m, W / 2, cy + R + 22, 32);
      ctx.textAlign = "center"; ctx.save(); ctx.shadowColor = "rgba(0,30,40,.5)"; ctx.shadowBlur = 16; ctx.fillStyle = RLW.goldFill(ctx, 800, 900); font(ctx, "400", 130, F.script); ctx.fillText("Happy Birthday", W / 2, 880); ctx.restore();
      nameBlock(ctx, m, { x: W / 2, y: 980, w: 920, size: 66, min: 42, deptGap: 46, shadow: "rgba(0,30,40,.5)" });
      verse(ctx, m, { x: W / 2, w: 880, bottom: 1240, size: 28 });
      RLW.footer(ctx, W, H, 64);
    }
  });

  // =============== JULY — Crowned with Favour (royal purple and gold) ===============
  RLW.THEMES[7] = base({ key: "jul", name: "Crowned with Favour", dark: true,
    ink: "#ffffff", ink2: "rgba(255,255,255,.9)", head: "rgba(255,255,255,.9)", accTxt: "#F2CF6B", acc: "#E2B13C", acc3: ["#FFF0B3", "#E9B949", "#A8770F"],
    pill: "#E2B13C", pillInk: "#2A0F4F", ring: ["#FFF0B3", "#C8961F", "#FBE7A1"], glow: "rgba(246,215,122,.55)", gap: "#2A0F4F", dash: "rgba(246,215,122,.9)",
    phBg: ["#5B2A99", "#22083F"], conf: ["#E2B13C", "#F6D77A", "#B58CFF", "#FFFFFF", "#7B3FD1"], burst: ["#E2B13C", "#F6D77A", "#B58CFF", "#FFFFFF"],
    spark: ["#FFF4CC", "#F6D77A"], footBg: "rgba(18,4,36,.9)", shadow: "rgba(0,0,0,.45)",
    decoTop: function (ctx, cx, cy, R, t) { crown(ctx, cx, cy - R - 2, R * 0.78, R * 0.5 + Math.sin((t || 0) * 3) * 2); },
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = radial(ctx, W / 2, H * 0.42, 0, Math.max(W, H) * 0.8, ["#5A2A9C", "#34106A", "#14042B"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080, d = 90 * s; ctx.strokeStyle = "rgba(226,177,60,.12)"; ctx.lineWidth = 1.5 * s; ctx.beginPath();
      for (var x = -H; x < W + H; x += d) { ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.moveTo(x + H, 0); ctx.lineTo(x, H); } ctx.stroke();
      ctx.fillStyle = "rgba(226,177,60,.16)"; for (var yy = 0; yy < H + d; yy += d) for (var xx = 0; xx < W + d; xx += d) { ctx.beginPath(); ctx.arc(xx + ((yy / d) % 2 ? d / 2 : 0), yy, 3 * s, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = "rgba(226,177,60,.7)"; ctx.lineWidth = 3 * s; ctx.strokeRect(22 * s, 22 * s, W - 44 * s, H - 44 * s); ctx.lineWidth = 1.2 * s; ctx.strokeRect(34 * s, 34 * s, W - 68 * s, H - 68 * s);
      dust(ctx, W, H, 77, 40, "#F6D77A", 2.4 * s, t);
    },
    single: function (ctx, W, H, m, photo, logo) {
      RLW.bg(ctx, W, H, 0);
      logoAt(ctx, logo, W / 2, 48, 100); ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.textAlign = "center"; font(ctx, "600", 18, F.sans); spaced(ctx, "RCCG  RIVERS OF LIVING WATER PARISH", W / 2, 172, 3);
      var cy = 625, R = 205;
      ctx.fillStyle = RLW.goldFill(ctx, 230, 330); font(ctx, "700", 74, F.serif); arcText(ctx, "HAPPY BIRTHDAY", W / 2, cy + 40, R + 175, 8);
      RLW.photoFrame(ctx, photo, W / 2, cy, R, { initials: RLW.initials(m.name) });
      crown(ctx, W / 2, cy - R - 2, 160, 104);
      // ribbon banner with the name
      var fit = RLW.fitName(ctx, m.name, 760, 62, 38, F.serif, "800", 2), bh = 74 + (fit.lines.length - 1) * fit.size * 1.06 + 20, by = cy + R + 56, bw = 860, bx = W / 2 - bw / 2;
      ctx.fillStyle = "#8F6512"; [[bx - 60, bx + 10], [bx + bw + 60, bx + bw - 10]].forEach(function (e, i) { ctx.beginPath(); ctx.moveTo(e[1], by + 18); ctx.lineTo(e[0], by + 18); ctx.lineTo(e[0] + (i ? -26 : 26), by + 18 + bh / 2); ctx.lineTo(e[0], by + 18 + bh); ctx.lineTo(e[1], by + 18 + bh); ctx.closePath(); ctx.fill(); });
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 16; ctx.fillStyle = lin(ctx, 0, by, 0, by + bh, ["#FFE79A", "#E2B13C", "#B8861A"]); ctx.fillRect(bx, by, bw, bh); ctx.restore();
      ctx.fillStyle = "#2A0F4F"; ctx.textAlign = "center"; font(ctx, "800", fit.size, F.serif); fit.lines.forEach(function (l, i) { ctx.fillText(l, W / 2, by + bh / 2 + fit.size * 0.35 - (fit.lines.length - 1) * fit.size * 0.53 + i * fit.size * 1.06); });
      var y = by + bh;
      if (m.dept) { ctx.fillStyle = "#F2CF6B"; fitSpaced(ctx, String(m.dept).toUpperCase().slice(0, 40), W / 2, y + 50, 26, "600", F.sans, 2, 900); y += 50; }
      pillAt(ctx, m, W / 2, y + 58, 28);
      verse(ctx, m, { x: W / 2, w: 860, bottom: 1236, size: 27 });
      RLW.footer(ctx, W, H, 62);
    }
  });

  // =============== AUGUST — Heritage Pride (green and white, ankara border) ===============
  RLW.THEMES[8] = base({ key: "aug", name: "Heritage Pride", dark: false,
    ink: "#0B3D22", ink2: "#1F4A31", head: "#0B3D22", accTxt: "#008751", acc: "#C8471E", acc3: ["#13A866", "#008751", "#005C37"],
    pill: "#008751", pillInk: "#ffffff", ring: ["#F2B705", "#008751", "#F2B705"], glow: "rgba(0,0,0,.18)", gap: "#ffffff", dash: "rgba(0,135,81,.8)",
    phBg: ["#d6f0e1", "#8fd1ac"], phInk: "#0B3D22", conf: ["#008751", "#F2B705", "#C8471E", "#1b1b1b", "#13A866"], burst: ["#008751", "#F2B705", "#C8471E", "#13A866"],
    spark: ["#F2B705", "#C8471E"], footBg: "#0B3D22", footInk: "#ffffff", footLine: ["#F2B705", "#C8471E", "#F2B705"], shadow: "rgba(0,0,0,.12)",
    bg: function (ctx, W, H, t) {
      var s = Math.min(W, H) / 1080, b = 34 * s;
      ctx.fillStyle = "#FFFDF7"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,135,81,.06)"; for (var x = -H; x < W; x += 60 * s) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + 24 * s, H); ctx.lineTo(x + 24 * s + H, 0); ctx.lineTo(x + H, 0); ctx.closePath(); ctx.fill(); }
      var off = t ? (t * 20 * s) % (b * 2) : 0;
      ankaraBand(ctx, -off, 0, W + b * 2, b, b); ankaraBand(ctx, 0, 0, b, H, b); ankaraBand(ctx, W - b, 0, b, H, b);
      ctx.fillStyle = "#008751"; ctx.fillRect(b, b, W - 2 * b, 6 * s); ctx.fillRect(b, 0, 6 * s, H); ctx.fillRect(W - b - 6 * s, 0, 6 * s, H);
    },
    single: function (ctx, W, H, m, photo, logo) {
      var b = 52; ctx.fillStyle = "#FFFDF7"; ctx.fillRect(0, 0, W, H);
      ankaraBand(ctx, 0, 0, W, b, b); ankaraBand(ctx, 0, 0, b, H, b); ankaraBand(ctx, W - b, 0, b, H, b); ankaraBand(ctx, 0, H - 72 - b, W, b, b);
      ctx.fillStyle = "#008751"; ctx.fillRect(b, b, W - 2 * b, 8); ctx.fillRect(b, b, 8, H - 72 - 2 * b); ctx.fillRect(W - b - 8, b, 8, H - 72 - 2 * b); ctx.fillRect(b, H - 72 - b - 8, W - 2 * b, 8);
      ctx.fillStyle = "rgba(0,135,81,.05)"; ctx.fillRect(b + 8, b + 8, 300, 0);
      logoAt(ctx, logo, W / 2, 80, 102); ctx.fillStyle = "#0B3D22"; ctx.textAlign = "center"; font(ctx, "600", 19, F.sans); spaced(ctx, "RCCG  RIVERS OF LIVING WATER PARISH", W / 2, 208, 3);
      ctx.fillStyle = "#008751"; fitSpaced(ctx, "HAPPY BIRTHDAY", W / 2, 286, 66, "900", F.sans, 6, 880);
      var pw = 430, cy = 560;
      ctx.fillStyle = "#F2B705"; RLW.roundRect(ctx, W / 2 - pw / 2 + 22, cy - pw / 2 + 22, pw + 20, pw + 20, 44); ctx.fill();
      ctx.fillStyle = "#C8471E"; RLW.roundRect(ctx, W / 2 - pw / 2 - 40, cy + pw / 2 - 60, 90, 90, 18); ctx.fill();
      shapePhoto(ctx, photo, "roundsq", W / 2, cy, pw, pw, { ring: ["#008751", "#006B40", "#008751"], ringW: 12, gapW: 5, glowBlur: 24, glowY: 8, initials: RLW.initials(m.name) });
      pillAt(ctx, m, W / 2, cy + pw / 2 + 16, 32);
      nameBlock(ctx, m, { x: W / 2, y: cy + pw / 2 + 112, w: 860, size: 66, min: 40, deptGap: 46, deptCol: "#C8471E" });
      verse(ctx, m, { x: W / 2, w: 840, bottom: H - 72 - b - 44, size: 27 });
      RLW.footer(ctx, W, H, 72);
    }
  });

  // =============== SEPTEMBER — Season of Harvest (orange autumn leaves) ===============
  var LEAF_C = ["#F2A93B", "#D9541E", "#B23A12", "#F5C04A", "#8E3B12"];
  RLW.THEMES[9] = base({ key: "sep", name: "Season of Harvest", dark: true,
    ink: "#FFF6E8", ink2: "rgba(255,246,232,.92)", head: "#FFF6E8", accTxt: "#FFD48A", acc: "#F5C04A", acc3: ["#FFE7B0", "#F5C04A", "#C98516"],
    pill: "#FFF6E8", pillInk: "#8E3B12", ring: ["#FFFFFF", "#F1E6D6", "#FFFFFF"], glow: "rgba(60,20,0,.45)", gap: "#ffffff", dash: "rgba(255,212,138,.9)",
    phBg: ["#E07A2E", "#8E3B12"], conf: LEAF_C.concat(["#FFF6E8"]), burst: ["#F2A93B", "#D9541E", "#F5C04A", "#FFF6E8"],
    spark: ["#FFF6E8", "#F5C04A"], footBg: "rgba(60,20,4,.9)", footLine: ["#FFE7B0", "#F5C04A", "#C98516"], shadow: "rgba(60,20,0,.45)",
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = lin(ctx, 0, 0, W * 0.4, H, ["#5E200A", "#A8411A", "#E07A2E"]); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = radial(ctx, W * 0.75, H * 0.2, 0, Math.max(W, H) * 0.7, ["rgba(255,210,120,.35)", "rgba(255,210,120,0)"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080, r = rr(99);
      for (var i = 0; i < 18; i++) { var p = fall(r, W, H, t, 40), sz = (30 + r() * 40) * s, c = LEAF_C[i % 5]; ctx.globalAlpha = 0.55; if (i % 2) mapleLeaf(ctx, p[0], p[1], sz, p[2], c, "rgba(90,30,5,.35)"); else leaf(ctx, p[0], p[1], sz * 1.2, sz * 0.45, p[2], c, "rgba(90,30,5,.35)"); }
      ctx.globalAlpha = 1;
    },
    single: function (ctx, W, H, m, photo, logo) {
      ctx.fillStyle = lin(ctx, 0, 0, W * 0.4, H, ["#5E200A", "#A8411A", "#E07A2E"]); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = radial(ctx, W * 0.75, H * 0.2, 0, 900, ["rgba(255,210,120,.35)", "rgba(255,210,120,0)"]); ctx.fillRect(0, 0, W, H);
      var r = rr(RLW.hash(m.name) + 9), spots = [[60, 1000], [140, 1180], [990, 980], [1020, 1160], [60, 620], [1030, 560], [880, 260], [520, 120], [80, 440], [980, 760], [40, 820], [1040, 1250]];
      spots.forEach(function (p, i) { var c = LEAF_C[i % 5], sz = 50 + r() * 40; ctx.globalAlpha = 0.85; if (i % 2) mapleLeaf(ctx, p[0], p[1], sz, r() * 6, c, "rgba(90,30,5,.35)"); else leaf(ctx, p[0], p[1], sz * 1.3, sz * 0.5, r() * 6, c, "rgba(90,30,5,.35)"); });
      ctx.globalAlpha = 1;
      logoAt(ctx, logo, W - 64, 44, 120, "right"); ctx.fillStyle = "rgba(255,246,232,.9)"; ctx.textAlign = "right"; font(ctx, "600", 17, F.sans); ctx.fillText("RCCG RIVERS OF LIVING WATER PARISH", W - 64, 192);
      ctx.textAlign = "left"; ctx.fillStyle = RLW.goldFill(ctx, 100, 220); font(ctx, "400", 140, F.script); ctx.fillText("Happy", 62, 190);
      ctx.fillStyle = "#FFF6E8"; fitSpaced(ctx, "BIRTHDAY", 76, 268, 66, "800", F.sans, 10, 560, "left");
      // polaroid
      var pw = 430, cx = W / 2 + 10, cy = 618;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.06);
      ctx.save(); ctx.shadowColor = "rgba(40,10,0,.55)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16; ctx.fillStyle = "#FFFBF3"; ctx.fillRect(-pw / 2 - 26, -pw / 2 - 26, pw + 52, pw + 130); ctx.restore();
      shapePhoto(ctx, photo, "square", 0, 0, pw, pw, { ringW: 0, gapW: 0, glow: false, initials: RLW.initials(m.name) });
      ctx.fillStyle = "#8E3B12"; ctx.textAlign = "center"; fitText(ctx, String(m.name).split(/\s+/)[0], 0, pw / 2 + 74, 60, "400", F.script, pw - 20);
      ctx.fillStyle = "rgba(255,226,170,.8)"; ctx.fillRect(-70, -pw / 2 - 44, 140, 36);
      ctx.restore();
      mapleLeaf(ctx, cx + pw / 2 + 10, cy - pw / 2 + 10, 70, 0.5, "#F5C04A", "rgba(90,30,5,.35)");
      pillAt(ctx, m, W / 2, 960, 30);
      nameBlock(ctx, m, { x: W / 2, y: 1052, w: 920, size: 60, min: 40, deptGap: 44, shadow: "rgba(60,20,0,.5)" });
      verse(ctx, m, { x: W / 2, w: 900, bottom: 1240, size: 26 });
      RLW.footer(ctx, W, H, 62);
    }
  });

  // =============== OCTOBER — Grace and Glory (burgundy and gold, art deco) ===============
  function fan(ctx, cx, cy, R, n, col, lw) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); for (var i = 0; i <= n; i++) { var a = Math.PI + i / n * Math.PI; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } ctx.stroke(); for (var k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, R * k / 3, Math.PI, TAU); ctx.stroke(); } }
  function decoFrame(ctx, x, y, w, h, c, s) {
    ctx.strokeStyle = c; ctx.lineWidth = 3 * s; ctx.strokeRect(x, y, w, h); ctx.lineWidth = 1.4 * s; ctx.strokeRect(x + 12 * s, y + 12 * s, w - 24 * s, h - 24 * s);
    var k = 46 * s; [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(function (p) { ctx.beginPath(); ctx.moveTo(p[0], p[1] + p[3] * k); ctx.lineTo(p[0] + p[2] * k * 0.5, p[1] + p[3] * k); ctx.lineTo(p[0] + p[2] * k * 0.5, p[1] + p[3] * k * 0.5); ctx.lineTo(p[0] + p[2] * k, p[1] + p[3] * k * 0.5); ctx.lineTo(p[0] + p[2] * k, p[1]); ctx.lineWidth = 3 * s; ctx.stroke(); ctx.beginPath(); ctx.arc(p[0] + p[2] * 24 * s, p[1] + p[3] * 24 * s, 5 * s, 0, TAU); ctx.fillStyle = c; ctx.fill(); });
  }
  RLW.THEMES[10] = base({ key: "oct", name: "Grace and Glory", dark: true,
    ink: "#FFF5E6", ink2: "rgba(255,245,230,.9)", head: "rgba(255,245,230,.9)", accTxt: "#E9C46A", acc: "#D4A63A", acc3: ["#FFF0C2", "#E2B13C", "#A0761A"],
    pill: "#D4A63A", pillInk: "#4A0D1E", ring: ["#FFF0C2", "#B8861A", "#F6D77A"], glow: "rgba(226,177,60,.45)", gap: "#4A0D1E", dash: "rgba(233,196,106,.9)",
    phBg: ["#8A1F38", "#3A0715"], conf: ["#E2B13C", "#F6D77A", "#FFF5E6", "#B8861A", "#C2415E"], burst: ["#E2B13C", "#F6D77A", "#FFF5E6", "#C2415E"],
    spark: ["#FFF4CC", "#E2B13C"], footBg: "rgba(30,3,10,.92)", footLine: ["#FFF0C2", "#E2B13C", "#A0761A"], shadow: "rgba(0,0,0,.5)",
    deco: function (ctx, cx, cy, R, t) { ctx.globalAlpha = 0.5; fan(ctx, cx, cy + R * 0.2, R * 1.75, 18, "#D4A63A", 2); ctx.globalAlpha = 1; },
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = radial(ctx, W / 2, H * 0.4, 0, Math.max(W, H) * 0.8, ["#7A1730", "#4A0D1E", "#22040D"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080; ctx.globalAlpha = 0.18; fan(ctx, W / 2, H, Math.max(W, H) * 0.7, 30, "#D4A63A", 2 * s); ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(212,166,58,.18)"; ctx.lineWidth = 2 * s; for (var x = 60 * s; x < W; x += 120 * s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H * 0.12); ctx.stroke(); }
      decoFrame(ctx, 28 * s, 28 * s, W - 56 * s, H - 56 * s, "rgba(226,177,60,.8)", s);
      dust(ctx, W, H, 1010, 34, "#F6D77A", 2 * s, t);
    },
    single: function (ctx, W, H, m, photo, logo) {
      ctx.fillStyle = radial(ctx, W / 2, 560, 0, 1100, ["#7A1730", "#4A0D1E", "#22040D"]); ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.16; fan(ctx, W / 2, H, 980, 30, "#D4A63A", 2); ctx.globalAlpha = 1;
      decoFrame(ctx, 34, 34, W - 68, H - 72 - 64, "#D4A63A", 1);
      logoAt(ctx, logo, W / 2, 60, 116);
      ctx.textAlign = "center"; ctx.fillStyle = RLW.goldFill(ctx, 200, 260); fitSpaced(ctx, "HAPPY", W / 2, 256, 58, "700", F.serif, 26, 600);
      ctx.fillStyle = "#D4A63A"; ctx.fillRect(W / 2 - 290, 236, 150, 2); ctx.fillRect(W / 2 + 140, 236, 150, 2);
      ctx.fillStyle = "#FFF5E6"; font(ctx, "400", 132, F.script); ctx.fillText("Birthday", W / 2, 368);
      var cy = 640, pw = 400; ctx.globalAlpha = 0.55; fan(ctx, W / 2, cy + 60, 380, 22, "#D4A63A", 2); ctx.globalAlpha = 1;
      shapePhoto(ctx, photo, "octagon", W / 2, cy, pw, pw, { ringW: 14, gapW: 6, initials: RLW.initials(m.name) });
      pillAt(ctx, m, W / 2, cy + pw / 2 + 20, 30);
      nameBlock(ctx, m, { x: W / 2, y: cy + pw / 2 + 118, w: 860, size: 64, min: 40, ink: "#E9C46A", deptCol: "#FFF5E6", deptGap: 46 });
      verse(ctx, m, { x: W / 2, w: 840, bottom: 1204, size: 27 });
      RLW.footer(ctx, W, H, 64);
    }
  });

  // =============== NOVEMBER — Grateful Hearts (thanksgiving amber and brown) ===============
  RLW.THEMES[11] = base({ key: "nov", name: "Grateful Hearts", dark: true,
    ink: "#FFF3DF", ink2: "rgba(255,243,223,.9)", head: "rgba(255,243,223,.9)", accTxt: "#F2B84B", acc: "#E59B2E", acc3: ["#FFE1A3", "#F2A93B", "#B8701A"],
    pill: "#F2A93B", pillInk: "#3E2410", ring: ["#FFE1A3", "#C9821F", "#FFE9BC"], glow: "rgba(242,169,59,.45)", gap: "#3E2410", dash: "rgba(255,225,163,.9)",
    phBg: ["#8A5A2B", "#3E2410"], conf: ["#F2A93B", "#FFE1A3", "#C9821F", "#B8501A", "#FFF3DF"], burst: ["#F2A93B", "#FFE1A3", "#C9821F", "#FFF3DF"],
    spark: ["#FFF3DF", "#F2A93B"], footBg: "rgba(30,16,6,.92)", footLine: ["#FFE1A3", "#F2A93B", "#B8701A"], shadow: "rgba(0,0,0,.45)",
    deco: function (ctx, cx, cy, R, t) { for (var i = 0; i < 7; i++) { var sw = Math.sin((t || 0) * 1.5 + i) * 0.03; wheat(ctx, cx - R * 0.95, cy + R * 0.85, R * 1.25, -0.75 + i * 0.12 + sw, "#E8B866", "#F2C46B"); wheat(ctx, cx + R * 0.95, cy + R * 0.85, R * 1.25, 0.75 - i * 0.12 - sw, "#E8B866", "#F2C46B"); } },
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, ["#2A170A", "#5A3414", "#8A5422"]); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = radial(ctx, W / 2, H * 0.45, 0, Math.max(W, H) * 0.6, ["rgba(242,169,59,.35)", "rgba(242,169,59,0)"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080, sw = t ? Math.sin(t * 1.2) * 0.04 : 0;
      for (var i = 0; i < 9; i++) { wheat(ctx, -10 * s, H + 10 * s, 260 * s, 0.15 + i * 0.1 + sw, "rgba(232,184,102,.5)", "rgba(242,196,107,.55)"); wheat(ctx, W + 10 * s, H + 10 * s, 260 * s, -0.15 - i * 0.1 - sw, "rgba(232,184,102,.5)", "rgba(242,196,107,.55)"); }
      var r = rr(111); for (var j = 0; j < 12; j++) { var p = fall(r, W, H, t, 30); ctx.globalAlpha = 0.45; mapleLeaf(ctx, p[0], p[1], (26 + r() * 22) * s, p[2], j % 2 ? "#C9821F" : "#B8501A"); } ctx.globalAlpha = 1;
    },
    single: function (ctx, W, H, m, photo, logo) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, H, ["#4A2A10", "#7A4A1E", "#9A6128"]); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = radial(ctx, W / 2, 640, 0, 700, ["rgba(242,169,59,.4)", "rgba(242,169,59,0)"]); ctx.fillRect(0, 0, W, H);
      // header band
      ctx.fillStyle = "#24130A"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 280); for (var x = W; x >= 0; x -= 60) ctx.quadraticCurveTo(x - 30, 312, x - 60, 280); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#F2A93B"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 268); for (var x2 = 0; x2 <= W; x2 += 60) ctx.quadraticCurveTo(x2 + 30, 300, x2 + 60, 268); ctx.stroke();
      var lw = logoAt(ctx, logo, 64, 40, 190, "left");
      var tx = 64 + lw + 34; ctx.textAlign = "left"; ctx.fillStyle = RLW.goldFill(ctx, 70, 170); font(ctx, "400", 124, F.script); ctx.fillText("Happy", tx - 10, 152);
      ctx.fillStyle = "#FFF3DF"; fitSpaced(ctx, "BIRTHDAY", tx, 222, 62, "800", F.sans, 8, W - tx - 60, "left");
      ctx.fillStyle = "rgba(255,243,223,.7)"; font(ctx, "600", 16, F.sans); spaced(ctx, "RCCG RIVERS OF LIVING WATER PARISH", tx, 254, 2, "left");
      var cy = 640, ow = 400, oh = 500;
      for (var i = 0; i < 7; i++) { wheat(ctx, W / 2 - 250, cy + 250, 340, -0.55 + i * 0.09, "#E8B866", "#F2C46B"); wheat(ctx, W / 2 + 250, cy + 250, 340, 0.55 - i * 0.09, "#E8B866", "#F2C46B"); }
      ctx.fillStyle = "#C9821F"; ctx.beginPath(); ctx.ellipse(W / 2 - 250, cy + 250, 30, 14, -0.3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(W / 2 + 250, cy + 250, 30, 14, 0.3, 0, TAU); ctx.fill();
      shapePhoto(ctx, photo, "oval", W / 2, cy, ow, oh, { ringW: 14, gapW: 6, initials: RLW.initials(m.name) });
      pillAt(ctx, m, W / 2, cy + oh / 2 + 18, 30);
      nameBlock(ctx, m, { x: W / 2, y: cy + oh / 2 + 114, w: 900, size: 64, min: 40, deptGap: 46 });
      verse(ctx, m, { x: W / 2, w: 880, bottom: 1240, size: 27 });
      RLW.footer(ctx, W, H, 64);
    }
  });

  // =============== DECEMBER — Joy to the World (Christmas red, green and gold) ===============
  function garland(ctx, x0, x1, y, sag, s, t) {
    var n = 60; for (var i = 0; i <= n; i++) { var f = i / n, x = x0 + (x1 - x0) * f, yy = y + Math.sin(f * Math.PI) * sag;
      for (var k = 0; k < 5; k++) { var a = k / 5 * TAU + i; leaf(ctx, x, yy, 34 * s, 7 * s, a, k % 2 ? "#1F6B33" : "#2E8B47"); } }
    var cols = ["#E2B13C", "#C4101C", "#F6D77A", "#C4101C"];
    for (var b = 1; b < 8; b++) { var f2 = b / 8, bx = x0 + (x1 - x0) * f2, by = y + Math.sin(f2 * Math.PI) * sag + 22 * s + Math.sin((t || 0) * 2 + b) * 3 * s;
      ctx.beginPath(); ctx.arc(bx, by, 14 * s, 0, TAU); ctx.fillStyle = radial(ctx, bx - 4 * s, by - 4 * s, 1, 16 * s, ["#ffffff", cols[b % 4], "rgba(0,0,0,.4)"]); ctx.fill(); }
  }
  RLW.THEMES[12] = base({ key: "dec", name: "Joy to the World", dark: true,
    ink: "#ffffff", ink2: "rgba(255,255,255,.92)", head: "rgba(255,255,255,.9)", accTxt: "#F6D77A", acc: "#E2B13C", acc3: ["#FFF0B3", "#E2B13C", "#A8770F"],
    pill: "#1F6B33", pillInk: "#FFF0B3", ring: ["#FFF0B3", "#C8961F", "#FBE7A1"], glow: "rgba(246,215,122,.55)", gap: "#ffffff", dash: "rgba(246,215,122,.9)",
    phBg: ["#B0151F", "#5A0409"], conf: ["#E2B13C", "#F6D77A", "#FFFFFF", "#2E8B47", "#E2B13C"], burst: ["#E2B13C", "#F6D77A", "#FFFFFF", "#2E8B47"],
    spark: ["#FFF4CC", "#F6D77A"], footBg: "rgba(20,40,22,.95)", footLine: ["#FFF0B3", "#E2B13C", "#A8770F"], shadow: "rgba(0,0,0,.45)",
    decoTop: function (ctx, cx, cy, R, t) { ctx.fillStyle = lin(ctx, cx - 40, 0, cx + 40, 0, ["#A8770F", "#FFF0B3", "#A8770F"]); RLW.roundRect(ctx, cx - R * 0.2, cy - R - 34, R * 0.4, 44, 8); ctx.fill(); ctx.strokeStyle = "#E2B13C"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy - R - 44, 16, 0, TAU); ctx.stroke(); holly(ctx, cx + R * 0.72, cy + R * 0.72, R * 0.42, 0.3); },
    bg: function (ctx, W, H, t) {
      ctx.fillStyle = radial(ctx, W / 2, H * 0.42, 0, Math.max(W, H) * 0.8, ["#B0151F", "#7A0E14", "#3A0508"]); ctx.fillRect(0, 0, W, H);
      var s = Math.min(W, H) / 1080, r = rr(1212);
      for (var i = 0; i < 40; i++) { var p = fall(r, W, H, t, 34), R0 = (5 + r() * 12) * s; ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin((t || 0) * 2 + i)); ctx.fillStyle = i % 4 ? "#F6D77A" : "#FFFFFF"; star5(ctx, p[0], p[1], R0, R0 * 0.45, p[2]); ctx.fill(); }
      ctx.globalAlpha = 1; holly(ctx, 40 * s, H - 120 * s, 110 * s, -0.4); holly(ctx, W - 40 * s, 60 * s, 110 * s, 2.6);
    },
    single: function (ctx, W, H, m, photo, logo) {
      ctx.fillStyle = radial(ctx, W / 2, 600, 0, 1100, ["#B0151F", "#7A0E14", "#3A0508"]); ctx.fillRect(0, 0, W, H);
      var r = rr(RLW.hash(m.name) + 12);
      for (var i = 0; i < 46; i++) { var x = r() * W, y = r() * H, R0 = 5 + r() * 12; if (Math.abs(x - W / 2) < 300 && y > 300 && y < 1250) continue; ctx.globalAlpha = 0.5 + r() * 0.5; ctx.fillStyle = i % 4 ? "#F6D77A" : "#FFFFFF"; star5(ctx, x, y, R0, R0 * 0.45, r()); ctx.fill(); }
      ctx.globalAlpha = 1;
      logoAt(ctx, logo, 60, 34, 112, "left"); parishLines(ctx, 60 + 112 * logo_r(logo) + 20, 80, "left", "rgba(255,255,255,.92)", 20);
      // star of Bethlehem
      ctx.save(); ctx.shadowColor = "rgba(255,240,180,.95)"; ctx.shadowBlur = 40; ctx.fillStyle = "#FFF0B3"; RLW.star(ctx, W - 150, 110, 64, 12); ctx.restore();
      garland(ctx, -20, W + 20, 182, 70, 1, 0);
      var cy = 600, R = 192; ctx.strokeStyle = "#E2B13C"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W / 2, 252); ctx.lineTo(W / 2, cy - R - 60); ctx.stroke();
      RLW.photoFrame(ctx, photo, W / 2, cy, R, { initials: RLW.initials(m.name) });
      RLW.THEMES[12].decoTop(ctx, W / 2, cy, R, 0);
      pillAt(ctx, m, W / 2, cy + R + 16, 30);
      ctx.textAlign = "center"; ctx.fillStyle = RLW.goldFill(ctx, 850, 940); font(ctx, "400", 118, F.script); ctx.fillText("Happy Birthday", W / 2, 934);
      nameBlock(ctx, m, { x: W / 2, y: 1022, w: 900, size: 62, min: 40, deptGap: 44, shadow: "rgba(0,0,0,.4)" });
      verse(ctx, m, { x: W / 2, w: 880, bottom: 1240, size: 26 });
      RLW.footer(ctx, W, H, 62);
    }
  });
})();
