/* RLW Birthdays — monthly motion video, drawn on canvas and recorded in the browser (MediaRecorder) */
(function () {
  var RLW = window.RLW = window.RLW || {};
  var INTRO = 4.5, PER = 3.6, OUTRO = 5.5;
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function easeBack(x) { var c1 = 1.70158, c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  function bounce(x) { var n1 = 7.5625, d1 = 2.75; if (x < 1 / d1) return n1 * x * x; if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75; if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375; return n1 * (x -= 2.625 / d1) * x + 0.984375; }
  RLW.aacOK = function () { try { return !!window.MediaRecorder && (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01F,mp4a.40.2") || MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")); } catch (e) { return false; } };
  RLW.videoDuration = function (n) { return INTRO + n * PER + OUTRO; };
  RLW.pickMime = function () {
    if (!window.MediaRecorder) return null;
    var list = ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (var i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) {} }
    return "";
  };
  function Scene(cv, opt) {
    this.cv = cv; this.ctx = cv.getContext("2d"); this.o = opt;
    var W = this.W = cv.width, H = this.H = cv.height; this.s = Math.min(W, H) / 1080; this.land = W > H * 1.3; this.portrait = H > W * 1.3;
    var s = this.s; this.T = RLW.useTheme(opt.month); var BC = this.T.burst;
    this.L = this.portrait
      ? { top: H * 0.115, topSize: 112 * s, cy: H * 0.395, R: 300 * s, nameSize: 88 * s, bless: H * 0.80, blessSize: 36 * s, foot: 86 * s }
      : { top: H * 0.115, topSize: 82 * s, cy: H * 0.40, R: 196 * s, nameSize: 66 * s, bless: H * 0.855, blessSize: 27 * s, foot: 64 * s };
    // per-celebrant bursts
    this.bursts = opt.members.map(function (m, i) {
      var r = RLW.rng(1000 + i * 7919), ps = [];
      for (var k = 0; k < 70; k++) { var a = r() * 6.283, v = (380 + r() * 820) * s; ps.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - 260 * s, c: BC[(r() * BC.length) | 0], sz: (8 + r() * 14) * s, rot: r() * 6, kind: r() }); }
      return ps;
    });
  }
  Scene.prototype.total = function () { return RLW.videoDuration(this.o.members.length); };
  Scene.prototype.draw = function (t) {
    var ctx = this.ctx, W = this.W, H = this.H, n = this.o.members.length;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    RLW.T = this.T;
    RLW.bg(ctx, W, H, t);
    RLW.confetti(ctx, W, H, 4242 + this.o.month, this.portrait ? 85 : 60, t);
    if (t < INTRO) this.intro(t);
    else if (t < INTRO + n * PER) { var i = Math.floor((t - INTRO) / PER); this.person(i, t - INTRO - i * PER); }
    else this.outro(t - INTRO - n * PER);
    ctx.globalAlpha = 1; RLW.footer(ctx, W, H, this.L.foot);
    var tot = this.total(); if (t > tot - 0.6) { ctx.fillStyle = "rgba(0,0,0," + seg(t, tot - 0.6, tot) + ")"; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  };
  Scene.prototype.intro = function (lt) {
    var T = this.T, ctx = this.ctx, W = this.W, H = this.H, s = this.s, P = this.portrait, logo = RLW.lg(this.o.logo);
    var out = 1 - seg(lt, INTRO - 0.45, INTRO); ctx.textAlign = "center";
    var e = easeBack(seg(lt, 0, 0.8));
    if (logo && e > 0) { var lh = (P ? 230 : 170) * s * e, lw = lh * logo.width / logo.height; ctx.globalAlpha = out; ctx.drawImage(logo, W / 2 - lw / 2, H * (P ? 0.17 : 0.10) + ((P ? 230 : 170) * s - lh) / 2, lw, lh); }
    var a = easeOut(seg(lt, 0.5, 1.3));
    ctx.globalAlpha = a * out; ctx.fillStyle = RLW.goldFill(ctx, H * 0.36, H * 0.46); RLW.font(ctx, "400", (P ? 210 : 165) * s, RLW.F.script);
    ctx.fillText("Happy", W / 2, H * (P ? 0.43 : 0.47) + (1 - a) * 60 * s);
    var word = "BIRTHDAY", fs = (P ? 128 : 104) * s; RLW.font(ctx, "800", fs, RLW.F.sans);
    var sp = 12 * s, widths = word.split("").map(function (c) { return ctx.measureText(c).width; }), tw = widths.reduce(function (x, y) { return x + y; }, 0) + sp * (word.length - 1);
    var x = W / 2 - tw / 2, y = H * (P ? 0.52 : 0.62);
    ctx.textAlign = "left";
    for (var k = 0; k < word.length; k++) {
      var p = easeBack(seg(lt, 0.9 + k * 0.08, 1.3 + k * 0.08));
      if (p > 0) { ctx.save(); ctx.globalAlpha = clamp01(p) * out; ctx.translate(x + widths[k] / 2, y - fs * 0.35); ctx.scale(p, p); ctx.fillStyle = T.ink; ctx.fillText(word[k], -widths[k] / 2, fs * 0.35); ctx.restore(); }
      x += widths[k] + sp;
    }
    ctx.textAlign = "center";
    var b = easeOut(seg(lt, 1.8, 2.6));
    ctx.globalAlpha = b * out; ctx.fillStyle = T.ink; RLW.font(ctx, "600", (P ? 48 : 38) * s, RLW.F.sans);
    ctx.fillText("to our " + RLW.MONTHS[this.o.month - 1] + " celebrants", W / 2, H * (P ? 0.60 : 0.73) + (1 - b) * 40 * s);
    ctx.globalAlpha = b * out; ctx.fillStyle = T.accTxt; RLW.font(ctx, "600", (P ? 30 : 24) * s, RLW.F.sans);
    RLW.spaced(ctx, "RCCG RIVERS OF LIVING WATER PARISH", W / 2, H * (P ? 0.655 : 0.80), 3 * s);
    for (var j = 0; j < 7; j++) { var tw2 = 0.5 + 0.5 * Math.sin(lt * 4 + j * 1.7); var r = RLW.rng(50 + j); RLW.sparkle(ctx, W * (0.12 + r() * 0.76), H * (0.3 + r() * 0.4), (14 + r() * 20) * s * tw2, out * b * tw2); }
    ctx.globalAlpha = 1;
  };
  Scene.prototype.person = function (i, lt) {
    var T = this.T, ctx = this.ctx, W = this.W, H = this.H, s = this.s, L = this.L, m = this.o.members[i], img = this.o.photos[i];
    var out = 1 - seg(lt, PER - 0.38, PER), n = this.o.members.length;
    ctx.textAlign = "center";
    // header, constant
    ctx.globalAlpha = i === 0 ? easeOut(seg(lt, 0, 0.5)) : 1; ctx.fillStyle = RLW.goldFill(ctx, L.top - L.topSize, L.top); RLW.font(ctx, "400", L.topSize, RLW.F.script);
    ctx.fillText("Happy Birthday", W / 2, L.top);
    // photo entry, three styles in turn
    var v = i % 3, p = seg(lt, 0, 0.75), cx = W / 2, cy = L.cy, sc = 1;
    if (v === 0) sc = easeBack(p);
    else if (v === 1) { cx = W / 2 + (1 - easeOut(p)) * W * 0.9 * (i % 2 ? -1 : 1); }
    else { cy = L.cy - (1 - bounce(p)) * H * 0.55; }
    var exitS = 1 - 0.08 * seg(lt, PER - 0.38, PER);
    ctx.save(); ctx.globalAlpha = out; ctx.translate(cx, cy); ctx.scale(sc * exitS, sc * exitS);
    if (T.deco) { ctx.save(); T.deco(ctx, 0, 0, L.R, lt); ctx.restore(); }
    RLW.photoFrame(ctx, img, 0, 0, L.R, { initials: RLW.initials(m.name), spin: lt, zoom: 1 + 0.06 * seg(lt, 0, PER) });
    if (T.decoTop) { ctx.save(); T.decoTop(ctx, 0, 0, L.R, lt); ctx.restore(); }
    ctx.restore();
    // burst
    var bt = lt - 0.35;
    if (bt > 0 && bt < 2.4) {
      var ps = this.bursts[i], g = 900 * s, fade = 1 - seg(bt, 1.4, 2.4);
      for (var k = 0; k < ps.length; k++) {
        var q = ps[k], x = W / 2 + q.vx * bt * 0.9, y = L.cy + q.vy * bt + 0.5 * g * bt * bt;
        ctx.save(); ctx.globalAlpha = fade * out; ctx.translate(x, y); ctx.rotate(q.rot + bt * 6); ctx.fillStyle = q.c;
        if (q.kind < 0.5) ctx.fillRect(-q.sz / 2, -q.sz / 4, q.sz, q.sz / 2); else { RLW.star(ctx, 0, 0, q.sz * 0.6, q.sz * 0.22); }
        ctx.restore();
      }
    }
    for (var j = 0; j < 4; j++) { var tw = 0.5 + 0.5 * Math.sin(lt * 5 + j * 2.1), a = j * 1.57 + 0.6; RLW.sparkle(ctx, W / 2 + Math.cos(a) * (L.R + 70 * s), L.cy + Math.sin(a) * (L.R + 70 * s), 22 * s * tw, out * seg(lt, 0.5, 0.9) * tw); }
    // date pill
    var pp = easeBack(seg(lt, 0.95, 1.35));
    if (pp > 0) { ctx.save(); ctx.globalAlpha = out * clamp01(pp); ctx.translate(W / 2, L.cy + L.R + 26 * s); ctx.scale(pp, pp); RLW.pill(ctx, RLW.dateText(m.day, m.month), 0, 0, (this.portrait ? 42 : 34) * s, T.pill); ctx.restore(); }
    // name wipe
    var nw = easeOut(seg(lt, 0.55, 1.25));
    var fit = RLW.fitName(ctx, m.name, W * 0.88, L.nameSize, L.nameSize * 0.55, RLW.F.serif, "800", 2);
    var ny = L.cy + L.R + (this.portrait ? 150 : 112) * s;
    ctx.save(); ctx.beginPath(); ctx.rect(0, ny - fit.size * 1.1, W * nw, fit.size * 2.4 * fit.lines.length); ctx.clip();
    ctx.globalAlpha = out; ctx.fillStyle = T.ink; RLW.font(ctx, "800", fit.size, RLW.F.serif); ctx.textAlign = "center";
    ctx.shadowColor = T.shadow; ctx.shadowBlur = 10 * s;
    fit.lines.forEach(function (l, k) { ctx.fillText(l, W / 2, ny + (1 - nw) * 20 * s + k * fit.size * 1.05); });
    ctx.restore();
    var y2 = ny + (fit.lines.length - 1) * fit.size * 1.05;
    if (m.dept) { ctx.globalAlpha = out * seg(lt, 1.2, 1.6); ctx.fillStyle = T.accTxt; RLW.font(ctx, "600", (this.portrait ? 32 : 26) * s, RLW.F.sans); RLW.spaced(ctx, String(m.dept).toUpperCase().slice(0, 40), W / 2, y2 + (this.portrait ? 62 : 48) * s, 2 * s); }
    // blessing
    var b = RLW.blessFor(m.name, m.day, m.month), ba = out * easeOut(seg(lt, 1.4, 2.0));
    if (ba > 0) {
      ctx.globalAlpha = ba; ctx.fillStyle = T.ink2; RLW.font(ctx, "500", L.blessSize, RLW.F.serif, "italic"); ctx.textAlign = "center";
      var lines = RLW.wrap(ctx, "\u201C" + b.t + "\u201D", W * 0.84, 3), by = Math.max(L.bless, y2 + (this.portrait ? 140 : 96) * s);
      if (!this.portrait) by = Math.min(by, H - L.foot - 30 * s - lines.length * L.blessSize * 1.3);
      lines.forEach(function (l, k) { ctx.fillText(l, W / 2, by + k * L.blessSize * 1.3); });
      ctx.fillStyle = T.acc; RLW.font(ctx, "700", L.blessSize * 0.7, RLW.F.sans); RLW.spaced(ctx, b.r.toUpperCase(), W / 2, by + lines.length * L.blessSize * 1.3 + 2 * s, 2 * s);
    }
    ctx.globalAlpha = 0.75 * out; ctx.fillStyle = T.ink; RLW.font(ctx, "600", 24 * s, RLW.F.sans); ctx.textAlign = "right";
    ctx.fillText((i + 1) + " of " + n, W - 34 * s, this.portrait ? H - L.foot - 22 * s : 48 * s); ctx.textAlign = "center"; ctx.globalAlpha = 1;
  };
  Scene.prototype.outro = function (lt) {
    var T = this.T, ctx = this.ctx, W = this.W, H = this.H, s = this.s, P = this.portrait, logo = RLW.lg(this.o.logo), o = this.o;
    ctx.textAlign = "center";
    var e = easeBack(seg(lt, 0, 0.7));
    if (logo && e > 0) { var lh = (P ? 200 : 130) * s * e, lw = lh * logo.width / logo.height; ctx.drawImage(logo, W / 2 - lw / 2, H * (P ? 0.08 : 0.05) + ((P ? 200 : 130) * s - lh) / 2, lw, lh); }
    var a = easeOut(seg(lt, 0.3, 1.0));
    ctx.globalAlpha = a; ctx.fillStyle = RLW.goldFill(ctx, H * 0.22, H * 0.3); RLW.font(ctx, "400", (P ? 150 : 112) * s, RLW.F.script);
    ctx.fillText("Happy Birthday", W / 2, H * (P ? 0.27 : 0.33));
    ctx.fillStyle = T.ink; RLW.font(ctx, "800", (P ? 62 : 48) * s, RLW.F.sans); RLW.spaced(ctx, "TO YOU ALL!", W / 2, H * (P ? 0.32 : 0.41), 8 * s);
    // mosaic of celebrants
    var n = Math.min(o.members.length, P ? 18 : 12), per = Math.min(n, P ? 6 : 6), rows = Math.ceil(n / per), r = (P ? 62 : 44) * s, gap = r * 2.5;
    var top = H * (P ? 0.40 : 0.50);
    for (var k = 0; k < n; k++) {
      var row = Math.floor(k / per), inRow = Math.min(per, n - row * per), col = k % per;
      var x = W / 2 + (col - (inRow - 1) / 2) * gap, y = top + row * gap * 0.95;
      var p = easeBack(seg(lt, 0.6 + k * 0.06, 1.0 + k * 0.06));
      if (p <= 0) continue;
      ctx.save(); ctx.globalAlpha = clamp01(p); ctx.translate(x, y); ctx.scale(p, p); RLW.photoFrame(ctx, o.photos[k], 0, 0, r, { initials: RLW.initials(o.members[k].name) }); ctx.restore();
    }
    var vy = top + rows * gap * 0.95 + (P ? 60 : 20) * s;
    var b = RLW.OUTRO_BLESS, ba = easeOut(seg(lt, 1.4, 2.2));
    ctx.globalAlpha = ba; ctx.fillStyle = T.ink2; RLW.font(ctx, "500", (P ? 38 : 28) * s, RLW.F.serif, "italic");
    var fs = (P ? 38 : 28) * s, lines = RLW.wrap(ctx, "\u201C" + b.t + "\u201D", W * 0.82, 4);
    vy = Math.min(vy, H - this.L.foot - 50 * s - lines.length * fs * 1.32);
    lines.forEach(function (l, k) { ctx.fillText(l, W / 2, vy + k * fs * 1.32); });
    ctx.fillStyle = T.acc; RLW.font(ctx, "700", fs * 0.68, RLW.F.sans); RLW.spaced(ctx, b.r.toUpperCase(), W / 2, vy + lines.length * fs * 1.32 + 4 * s, 2 * s);
    ctx.globalAlpha = 1;
  };
  RLW.Scene = Scene;

  // Record the video. opt: {canvas, month, members, photos, logo, songUrl, track:{loop_start,loop_end,duration}, onProgress}
  RLW.makeVideo = async function (opt) {
    var mime = RLW.pickMime();
    if (mime === null) throw new Error("This browser cannot record video. Please use Chrome or Safari.");
    var cv = opt.canvas, sc = new Scene(cv, opt), total = sc.total();
    var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
    if (ac.state === "suspended") { try { await ac.resume(); } catch (e) {} }
    var buf = null;
    if (opt.songUrl) {
      try { var r = await fetch(opt.songUrl); var ab = await r.arrayBuffer(); buf = await new Promise(function (res, rej) { var p = ac.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); }
      catch (e) { buf = null; }
    }
    if (opt.songUrl && !buf) { ac.close(); throw new Error("The song for this month could not be loaded. Check your connection, or reset the month's song in Songs."); }
    var dest = ac.createMediaStreamDestination(), gain = ac.createGain(); gain.connect(dest);
    var src = null;
    if (buf) {
      src = ac.createBufferSource(); src.buffer = buf; src.connect(gain);
      var usable = opt.track && opt.track.duration ? opt.track.duration - 2 : buf.duration;
      if (total > usable) {
        src.loop = true;
        if (opt.track && opt.track.loop_end) { src.loopStart = opt.track.loop_start; src.loopEnd = opt.track.loop_end; }
      }
    }
    var vstream = cv.captureStream(30);
    var tracks = vstream.getVideoTracks().concat(dest.stream.getAudioTracks());
    var stream = new MediaStream(tracks);
    var vbps = Math.round(Math.max(1500000, Math.min(6000000, 14.5 * 8e6 / total - 128000)));
    var rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: vbps, audioBitsPerSecond: 128000 } : { videoBitsPerSecond: vbps });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    var stopped = new Promise(function (res) { rec.onstop = res; });
    sc.draw(0);
    rec.start(1000);
    var t0 = ac.currentTime + 0.12;
    gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(1, t0 + 0.4);
    gain.gain.setValueAtTime(1, t0 + Math.max(0.5, total - 2.4)); gain.gain.linearRampToValueAtTime(0, t0 + total);
    if (src) src.start(t0);
    await new Promise(function (done) {
      var finished = false;
      function frame() {
        if (finished) return;
        var t = Math.max(0, ac.currentTime - t0);
        sc.draw(Math.min(t, total));
        if (opt.onProgress) opt.onProgress(Math.min(1, t / total), t, total);
        if (t >= total + 0.15) { finished = true; done(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    rec.stop(); await stopped;
    try { if (src) src.stop(); } catch (e) {}
    stream.getTracks().forEach(function (t) { t.stop(); });
    ac.close();
    var type = (rec.mimeType || mime || "video/webm").split(";")[0];
    var blob = new Blob(chunks, { type: type });
    var mt = rec.mimeType || mime || "";
    return { blob: blob, mime: mt, ext: type.indexOf("mp4") >= 0 ? "mp4" : "webm", aac: /mp4a/i.test(mt) || (type.indexOf("mp4") >= 0 && !/opus/i.test(mt) && RLW.aacOK()), duration: total };
  };
})();
