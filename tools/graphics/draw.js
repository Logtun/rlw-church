/* RLW Graphics: draws a church flyer on a canvas. Everything happens on the device. */
(function (root) {
  var CH = {
    l1: "THE REDEEMED CHRISTIAN CHURCH OF GOD",
    l2: "Rivers of Living Water Parish",
    address: "2, Restoration Avenue, Off Igodo Road, Magboro",
    contact: "riversoflivingwater500@gmail.com",
    yt: "YouTube @riversoflivingwaterparish"
  };
  var NAVY = "#1B2A6B", NAVY_D = "#0F1A4A", GREEN = "#0A8F4A", GOLD = "#D4A62A", GOLD_L = "#F0D78A", CREAM = "#F7F3EA";
  var SANS = "Montserrat, 'Segoe UI', Arial, sans-serif", SERIF = "'Playfair Display', Georgia, serif";
  var LAYOUTS = ["spotlight", "split", "band", "frame"];
  var LAYOUT_NAMES = { spotlight: "Spotlight", split: "Split", band: "Bottom band", frame: "Framed" };
  var HAS_LS = false;
  try { HAS_LS = "letterSpacing" in document.createElement("canvas").getContext("2d"); } catch (e) {}

  function font(ctx, weight, size, family, italic) { ctx.font = (italic ? "italic " : "") + weight + " " + Math.max(1, Math.round(size)) + "px " + family; }
  function spacing(ctx, px) { if (HAS_LS) ctx.letterSpacing = (px || 0) + "px"; }
  function width(ctx, t) { return ctx.measureText(t).width; }
  // wrap words into at most maxLines lines no wider than maxW; null when it cannot
  function wrap(ctx, text, maxW, maxLines) {
    var words = String(text).split(/\s+/).filter(Boolean), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      if (width(ctx, words[i]) > maxW) return null;
      var tryL = cur ? cur + " " + words[i] : words[i];
      if (width(ctx, tryL) <= maxW) cur = tryL; else { lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) return null;
    // balance: avoid a lonely last word when there is room
    if (lines.length === 2) {
      var all = lines.join(" ").split(" ");
      var best = lines, bestD = Math.abs(width(ctx, lines[0]) - width(ctx, lines[1]));
      for (var k = 1; k < all.length; k++) {
        var a = all.slice(0, k).join(" "), b = all.slice(k).join(" ");
        if (width(ctx, a) <= maxW && width(ctx, b) <= maxW) { var d = Math.abs(width(ctx, a) - width(ctx, b)); if (d < bestD) { bestD = d; best = [a, b]; } }
      }
      lines = best;
    }
    return lines;
  }
  // find the largest size (<= size) at which text fits; returns {size, lines}
  function fit(ctx, it, size, maxW) {
    var s = size, lines, ls;
    for (var n = 0; n < 80; n++) {
      font(ctx, it.weight, s, it.family, it.italic); ls = (it.ls || 0) * s; spacing(ctx, ls);
      lines = wrap(ctx, it.text, maxW, it.maxLines || 1);
      if (lines) return { size: s, lines: lines, ls: ls };
      s *= 0.95;
    }
    return { size: s, lines: [it.text], ls: ls };
  }

  // ---------- icons ----------
  function icon(ctx, kind, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 24, s / 24);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    if (kind === "cal") { rr(ctx, 3, 5, 18, 16, 2.5); ctx.moveTo(3, 10); ctx.lineTo(21, 10); ctx.moveTo(8, 3); ctx.lineTo(8, 7); ctx.moveTo(16, 3); ctx.lineTo(16, 7); ctx.stroke(); }
    else if (kind === "clock") { ctx.arc(12, 12, 9, 0, Math.PI * 2); ctx.moveTo(12, 7); ctx.lineTo(12, 12); ctx.lineTo(15.5, 14); ctx.stroke(); }
    else if (kind === "pin") { ctx.moveTo(12, 22); ctx.bezierCurveTo(12, 22, 4.5, 14.5, 4.5, 9.5); ctx.arc(12, 9.5, 7.5, Math.PI, 0); ctx.bezierCurveTo(19.5, 14.5, 12, 22, 12, 22); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(12, 9.5, 2.6, 0, Math.PI * 2); ctx.fill(); }
    else if (kind === "mic") { rr(ctx, 9, 2.5, 6, 11, 3); ctx.moveTo(5.5, 11); ctx.bezierCurveTo(5.5, 19, 18.5, 19, 18.5, 11); ctx.moveTo(12, 17.5); ctx.lineTo(12, 21.5); ctx.stroke(); }
    ctx.restore();
  }
  function rr(ctx, x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function cover(ctx, img, x, y, w, h, fy) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (img && img.width) {
      var sc = Math.max(w / img.width, h / img.height), iw = img.width * sc, ih = img.height * sc;
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) * (fy == null ? 0.4 : fy), iw, ih);
    } else {
      var g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, NAVY); g.addColorStop(1, GREEN); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }
  function vgrad(ctx, x, y, w, h, stops) { var g = ctx.createLinearGradient(0, y, 0, y + h); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); }

  // ---------- header: logo + church name ----------
  function header(ctx, o) {
    // o: x, y, w, align ('center'|'left'), dark (text colour dark), logo, u
    var u = o.u, lh = o.logoH || 118 * u, logo = o.logo;
    var lw = logo && logo.width ? lh * logo.width / logo.height : 0, gap = 22 * u;
    var maxText = o.w - lw - gap;
    var a = fit(ctx, { text: CH.l1, weight: 700, family: SANS, ls: 0.12, maxLines: 1 }, 25 * u, maxText);
    var b = fit(ctx, { text: CH.l2, weight: 800, family: SANS, ls: 0, maxLines: 1 }, 44 * u, maxText);
    font(ctx, 700, a.size, SANS); spacing(ctx, a.ls); var aw = width(ctx, CH.l1);
    font(ctx, 800, b.size, SANS); spacing(ctx, 0); var bw = width(ctx, CH.l2);
    var tw = Math.max(aw, bw), total = lw + gap + tw;
    var x0 = o.align === "center" ? o.x + (o.w - total) / 2 : o.x;
    if (logo && logo.width) ctx.drawImage(logo, x0, o.y, lw, lh);
    var tx = x0 + lw + gap, mid = o.y + lh / 2;
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillStyle = o.dark ? NAVY : "#FFFFFF";
    font(ctx, 800, b.size, SANS); spacing(ctx, 0); ctx.fillText(CH.l2, tx, mid + b.size * 0.78);
    ctx.fillStyle = o.dark ? GREEN : GOLD_L;
    font(ctx, 700, a.size, SANS); spacing(ctx, a.ls); ctx.fillText(CH.l1, tx, mid - a.size * 0.45);
    spacing(ctx, 0);
    return o.y + lh;
  }

  // ---------- footer: venue + contacts ----------
  function footer(ctx, o) {
    // o: x, y, w, h, align, dark, venue, u, bg
    var u = o.u;
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(o.x0 != null ? o.x0 : o.x, o.y, o.bw || o.w, o.h); }
    var venue = o.venue || CH.address, line2 = CH.contact + "   |   " + CH.yt;
    var iconS = 34 * u, pad = 14 * u;
    var v = fit(ctx, { text: venue, weight: 700, family: SANS, maxLines: 1 }, 31 * u, o.w - iconS - pad);
    var c = fit(ctx, { text: line2, weight: 500, family: SANS, maxLines: 1 }, 22 * u, o.w);
    var cy = o.y + o.h / 2;
    font(ctx, 700, v.size, SANS); spacing(ctx, 0);
    var vw = width(ctx, venue) + iconS + pad;
    var vx = o.align === "center" ? o.x + (o.w - vw) / 2 : o.x;
    var y1 = cy - (v.size + c.size + 12 * u) / 2 + v.size * 0.85;
    icon(ctx, "pin", vx, y1 - v.size * 0.85 - (iconS - v.size) / 2 + 2 * u, iconS, o.dark ? GREEN : GOLD);
    ctx.fillStyle = o.dark ? NAVY : "#FFFFFF"; ctx.textAlign = "left"; ctx.fillText(venue, vx + iconS + pad, y1);
    font(ctx, 500, c.size, SANS);
    ctx.fillStyle = o.dark ? "#4a5378" : "rgba(255,255,255,.88)";
    var cw = width(ctx, line2), cx = o.align === "center" ? o.x + (o.w - cw) / 2 : o.x;
    ctx.fillText(line2, cx, y1 + 12 * u + c.size);
  }

  // ---------- the main text stack, auto-fitted to its box ----------
  function buildItems(d, t) {
    var it = [];
    if (d.kicker) it.push({ text: d.kicker.toUpperCase(), weight: 800, family: SANS, size: 30, ls: 0.22, color: t.accent, maxLines: 1, gap: 18 });
    it.push({ text: (d.title || "Special Service").toUpperCase(), weight: 900, family: SANS, size: t.titleSize || 150, color: t.ink, maxLines: (d.title || "").length > 38 ? 4 : 3, lh: 1.02, gap: 26, shadow: t.shadow, title: true, big: true });
    it.push({ rule: true, w: 130, h: 8, color: t.accent, gap: 26 });
    if (d.theme) {
      it.push({ text: "THEME", weight: 800, family: SANS, size: 26, ls: 0.3, color: t.sub, maxLines: 1, gap: 6 });
      it.push({ text: d.theme, weight: 700, family: SERIF, italic: true, size: 92, color: t.accent, maxLines: d.theme.length > 34 ? 3 : 2, lh: 1.08, gap: 30, shadow: t.shadow, big: true });
    }
    var info = [];
    if (d.date) info.push({ icon: "cal", text: d.date });
    if (d.time) info.push({ icon: "clock", text: d.time });
    if (info.length) it.push({ info: info, weight: 700, family: SANS, size: 44, color: t.ink, icolor: t.accent, gap: 22 });
    if (d.minister) it.push({ info: [{ icon: "mic", text: d.minister }], weight: 600, family: SANS, size: 38, color: t.ink, icolor: t.accent, gap: 22 });
    if (d.extra) it.push({ pill: true, text: d.extra.toUpperCase(), weight: 800, family: SANS, size: 30, ls: 0.08, color: "#FFFFFF", bg: GREEN, maxLines: 1, gap: 22 });
    if (d.scripture) it.push({ text: d.scripture, weight: 700, family: SERIF, italic: true, size: 36, color: t.sub, maxLines: 2, gap: 0 });
    return it;
  }
  function measureInfo(ctx, item, s, maxW, u) {
    // try one row; else one per line; shrink until it fits
    var size = item.size * s * u;
    for (var n = 0; n < 60; n++) {
      font(ctx, item.weight, size, item.family); spacing(ctx, 0);
      var is = size * 1.05, gap = size * 0.4, sep = size * 1.1;
      var ws = item.info.map(function (p) { return is + gap + width(ctx, p.text); });
      var row = ws.reduce(function (a, b) { return a + b; }, 0) + sep * (ws.length - 1);
      if (row <= maxW) return { size: size, rows: [item.info], h: size * 1.25, widths: [row], is: is, gap: gap, sep: sep };
      if (Math.max.apply(null, ws) <= maxW) return { size: size, rows: item.info.map(function (p) { return [p]; }), h: size * 1.25 * item.info.length + size * 0.35 * (item.info.length - 1), widths: ws, is: is, gap: gap, sep: sep };
      size *= 0.95;
    }
    return { size: size, rows: item.info.map(function (p) { return [p]; }), h: size * 1.25 * item.info.length, widths: item.info.map(function () { return maxW; }), is: size, gap: size * 0.4, sep: size };
  }
  function layoutStack(ctx, items, box, u) {
    var s = 1, sb = 1, plan, total;
    for (var n = 0; n < 60; n++) {
      plan = []; total = 0;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], p = { it: it }, s0 = s;
        if (it.big) s = s0 * sb;
        if (it.rule) { p.h = it.h * u * Math.max(s, 0.6); }
        else if (it.info) { p.m = measureInfo(ctx, it, s, box.w, u); p.h = p.m.h; }
        else {
          var padX = it.pill ? 2 * 26 * u * s : 0;
          var f = fit(ctx, it, it.size * s * u, box.w - padX);
          p.f = f; var lh = (it.lh || 1.18) * f.size;
          p.h = it.pill ? f.size * 1.9 : lh * (f.lines.length - 1) + f.size * 1.0;
        }
        p.gap = (i === items.length - 1 ? 0 : (it.gap || 0) * u * s);
        p.s = s; s = s0;
        total += p.h + p.gap; plan.push(p);
      }
      if (total <= box.h) break;
      // shrink the big title and theme first, then everything
      if (sb > 0.62) sb *= 0.93; else s *= 0.94;
    }
    return { plan: plan, total: total, s: s };
  }
  function drawStack(ctx, items, box, u) {
    var L = layoutStack(ctx, items, box, u), y = box.y + Math.max(0, (box.h - L.total) * (box.valign == null ? 0.5 : box.valign));
    var cx = box.align === "center";
    ctx.textBaseline = "alphabetic";
    L.plan.forEach(function (p) {
      var it = p.it;
      ctx.save();
      if (it.shadow) { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 3 * u; }
      if (it.rule) {
        var rw = it.w * u; ctx.fillStyle = it.color; ctx.fillRect(cx ? box.x + (box.w - rw) / 2 : box.x, y, rw, p.h);
      } else if (it.info) {
        var m = p.m; font(ctx, it.weight, m.size, it.family); spacing(ctx, 0);
        var yy = y;
        m.rows.forEach(function (row, ri) {
          var rwid = m.rows.length === 1 ? m.widths[0] : m.widths[ri];
          var x = cx ? box.x + (box.w - rwid) / 2 : box.x;
          row.forEach(function (part, pi) {
            if (pi > 0) { ctx.fillStyle = it.icolor; var dx = x + m.sep / 2; ctx.fillRect(dx - 1.5 * u, yy + m.size * 0.15, 3 * u, m.size * 0.95); x += m.sep; }
            ctx.shadowColor = "transparent";
            icon(ctx, part.icon, x, yy + m.size * 0.1, m.is, it.icolor);
            if (it.shadow !== false) { ctx.shadowColor = ctx.shadowColor; }
            ctx.fillStyle = it.color; ctx.textAlign = "left"; ctx.fillText(part.text, x + m.is + m.gap, yy + m.size * 0.98);
            x += m.is + m.gap + width(ctx, part.text);
          });
          yy += m.size * 1.6;
        });
      } else {
        var f = p.f; font(ctx, it.weight, f.size, it.family, it.italic); spacing(ctx, f.ls);
        var lh = (it.lh || 1.18) * f.size;
        if (it.pill) {
          var tw = width(ctx, f.lines[0]), padX = 26 * u * p.s, pw = tw + padX * 2, ph = p.h;
          var px = cx ? box.x + (box.w - pw) / 2 : box.x;
          ctx.fillStyle = it.bg; ctx.beginPath(); rr(ctx, px, y, pw, ph, ph / 2); ctx.fill();
          ctx.fillStyle = it.color; ctx.textAlign = "left"; ctx.fillText(f.lines[0], px + padX + (HAS_LS ? f.ls / 2 : 0), y + ph / 2 + f.size * 0.36);
        } else {
          ctx.fillStyle = it.color;
          f.lines.forEach(function (ln, k) {
            var w = width(ctx, ln);
            var x = cx ? box.x + (box.w - w) / 2 + (HAS_LS ? f.ls / 2 : 0) : box.x;
            ctx.textAlign = "left"; ctx.fillText(ln, x, y + f.size * 0.86 + k * lh);
          });
        }
      }
      ctx.restore();
      y += p.h + p.gap;
    });
    spacing(ctx, 0);
    return L;
  }

  // ---------- layouts ----------
  function render(canvas, W, H, d, o) {
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d"), u = Math.min(W, H) / 1080, land = W > H * 1.2, sq = !land && H < W * 1.1;
    var lay = o.layout || "spotlight", img = o.photo, fy = o.fy;
    ctx.clearRect(0, 0, W, H); spacing(ctx, 0);
    var M = (land ? 70 : 64) * u;
    var footH = (land ? 118 : 132) * u;
    var dark = { ink: "#FFFFFF", accent: GOLD_L, sub: "rgba(255,255,255,.82)", shadow: true };
    if (lay === "spotlight") {
      cover(ctx, img, 0, 0, W, H, fy);
      vgrad(ctx, 0, 0, W, H, [[0, "rgba(12,20,58,.78)"], [0.35, "rgba(12,20,58,.52)"], [0.7, "rgba(10,16,48,.72)"], [1, "rgba(8,12,38,.94)"]]);
      var rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75); rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(0,0,0,.35)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      var hb = header(ctx, { x: M, y: M * 0.8, w: W - 2 * M, align: "center", logo: o.logoW, u: u, logoH: (land ? 110 : 120) * u });
      ctx.fillStyle = GREEN; ctx.fillRect(0, H - footH, W, footH); ctx.fillStyle = GOLD; ctx.fillRect(0, H - footH, W, 6 * u);
      footer(ctx, { x: M, y: H - footH + 6 * u, w: W - 2 * M, h: footH - 6 * u, align: "center", u: u, venue: d.venue });
      var bw = land ? W * 0.78 : W - 2 * M;
      drawStack(ctx, buildItems(d, Object.assign({ titleSize: land ? 140 : (sq ? 125 : 150) }, dark)), { x: (W - bw) / 2, y: hb + 50 * u, w: bw, h: H - footH - hb - 100 * u, align: "center" }, u);
    } else if (lay === "split") {
      var t = { ink: "#FFFFFF", accent: GOLD_L, sub: "rgba(255,255,255,.8)", shadow: false };
      if (land) {
        var pw = W * 0.47;
        cover(ctx, img, W - pw, 0, pw, H, fy);
        ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W - pw, H);
        // a slanted green and gold edge
        ctx.fillStyle = GREEN; ctx.beginPath(); ctx.moveTo(W - pw, 0); ctx.lineTo(W - pw + 70 * u, 0); ctx.lineTo(W - pw, H); ctx.closePath(); ctx.fill();
        ctx.fillStyle = GOLD; ctx.fillRect(W - pw - 6 * u, 0, 6 * u, H);
        var px = M, pW = W - pw - 2 * M;
        var hb2 = header(ctx, { x: px, y: M, w: pW, align: "left", logo: o.logoW, u: u, logoH: 100 * u });
        footer(ctx, { x: px, y: H - footH - 10 * u, w: pW, h: footH, align: "left", u: u, venue: d.venue });
        ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(px, H - footH - 10 * u, pW, 2 * u);
        drawStack(ctx, buildItems(d, Object.assign({ titleSize: 130 }, t)), { x: px, y: hb2 + 46 * u, w: pW, h: H - footH - hb2 - 90 * u, align: "left" }, u);
      } else {
        var ph = H * (sq ? 0.44 : 0.47);
        cover(ctx, img, 0, 0, W, ph, fy);
        vgrad(ctx, 0, 0, W, ph * 0.5, [[0, "rgba(12,20,58,.82)"], [1, "rgba(12,20,58,0)"]]);
        ctx.fillStyle = NAVY; ctx.fillRect(0, ph, W, H - ph);
        ctx.fillStyle = GOLD; ctx.fillRect(0, ph, W, 8 * u); ctx.fillStyle = GREEN; ctx.fillRect(0, ph + 8 * u, W * 0.36, 8 * u);
        header(ctx, { x: M, y: M * 0.75, w: W - 2 * M, align: "center", logo: o.logoW, u: u, logoH: 108 * u });
        footer(ctx, { x: M, y: H - footH, w: W - 2 * M, h: footH - 14 * u, align: "center", u: u, venue: d.venue });
        ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fillRect(M, H - footH, W - 2 * M, 2 * u);
        drawStack(ctx, buildItems(d, Object.assign({ titleSize: sq ? 110 : 128 }, t)), { x: M, y: ph + 50 * u, w: W - 2 * M, h: H - footH - ph - 84 * u, align: "center" }, u);
      }
    } else if (lay === "band") {
      cover(ctx, img, 0, 0, W, H, fy);
      vgrad(ctx, 0, 0, W, H * 0.32, [[0, "rgba(10,16,48,.85)"], [1, "rgba(10,16,48,0)"]]);
      var bandTop = land ? H * 0.43 : H * (sq ? 0.42 : 0.44);
      vgrad(ctx, 0, bandTop - 160 * u, W, 160 * u, [[0, "rgba(15,26,74,0)"], [1, "rgba(15,26,74,.92)"]]);
      ctx.fillStyle = "rgba(15,26,74,.94)"; ctx.fillRect(0, bandTop, W, H - bandTop);
      ctx.fillStyle = GREEN; ctx.fillRect(0, H - 14 * u, W, 14 * u); ctx.fillStyle = GOLD; ctx.fillRect(0, H - 20 * u, W, 6 * u);
      var hb3 = header(ctx, { x: M, y: M * 0.75, w: W - 2 * M, align: "left", logo: o.logoW, u: u, logoH: (land ? 100 : 108) * u });
      var fy0 = H - footH - 24 * u;
      ctx.fillStyle = "rgba(255,255,255,.16)"; ctx.fillRect(M, fy0, W - 2 * M, 2 * u);
      footer(ctx, { x: M, y: fy0, w: W - 2 * M, h: footH, align: "left", u: u, venue: d.venue });
      var by = bandTop - (land ? 150 : 210) * u;
      drawStack(ctx, buildItems(d, Object.assign({ titleSize: land ? 125 : 140 }, dark)), { x: M, y: by, w: W - 2 * M, h: fy0 - by - 30 * u, align: "left", valign: 1 }, u);
    } else { // frame
      ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H);
      var t2 = { ink: NAVY, accent: "#B8891A", sub: GREEN, shadow: false };
      ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, 14 * u); ctx.fillStyle = GOLD; ctx.fillRect(0, 14 * u, W, 5 * u);
      ctx.fillStyle = NAVY; ctx.fillRect(0, H - footH, W, footH); ctx.fillStyle = GREEN; ctx.fillRect(0, H - footH, W, 7 * u);
      footer(ctx, { x: M, y: H - footH + 7 * u, w: W - 2 * M, h: footH - 7 * u, align: "center", u: u, venue: d.venue });
      if (land) {
        var fx = M, fyy = M + 20 * u, fw = W * 0.42, fh = H - footH - fyy - M * 0.9;
        ctx.save(); ctx.beginPath(); rr(ctx, fx, fyy, fw, fh, 28 * u); ctx.clip(); cover(ctx, img, fx, fyy, fw, fh, fy); ctx.restore();
        ctx.strokeStyle = GOLD; ctx.lineWidth = 5 * u; ctx.beginPath(); rr(ctx, fx + 18 * u, fyy + 18 * u, fw, fh, 28 * u); ctx.stroke();
        var tx = fx + fw + 80 * u, tw = W - tx - M;
        var hb4 = header(ctx, { x: tx, y: fyy, w: tw, align: "left", logo: o.logoD, dark: true, u: u, logoH: 96 * u });
        drawStack(ctx, buildItems(d, Object.assign({ titleSize: 120 }, t2)), { x: tx, y: hb4 + 40 * u, w: tw, h: H - footH - hb4 - 80 * u, align: "left" }, u);
      } else {
        var hb5 = header(ctx, { x: M, y: M * 0.9, w: W - 2 * M, align: "center", logo: o.logoD, dark: true, u: u, logoH: 104 * u });
        var fh2 = H * (sq ? 0.33 : 0.36), fyy2 = hb5 + 34 * u;
        ctx.save(); ctx.beginPath(); rr(ctx, M, fyy2, W - 2 * M, fh2, 28 * u); ctx.clip(); cover(ctx, img, M, fyy2, W - 2 * M, fh2, fy); ctx.restore();
        ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 70 * u, fyy2 + fh2 - 4 * u, 140 * u, 8 * u);
        var sy = fyy2 + fh2 + 44 * u;
        drawStack(ctx, buildItems(d, Object.assign({ titleSize: sq ? 100 : 118 }, t2)), { x: M, y: sy, w: W - 2 * M, h: H - footH - sy - 34 * u, align: "center" }, u);
      }
    }
    return canvas;
  }
  root.RLWDraw = { render: render, LAYOUTS: LAYOUTS, LAYOUT_NAMES: LAYOUT_NAMES, CHURCH: CH,
    SIZES: { portrait: [1080, 1350], landscape: [1920, 1080], square: [1080, 1080] } };
})(this);
