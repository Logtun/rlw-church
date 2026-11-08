// RLW Bible Quiz Night: personalised end-of-game share card (added 2026-11-07).
// Drawn on a canvas in the player's browser (1080x1350, portrait for WhatsApp status). No emojis, parish branding only.
(function () {
  const W = 1080, H = 1350, NAVY = "#1B2A6B", GREEN = "#0A8F4A", GREEN2 = "#19B864";
  const SANS = '"Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif';
  const SERIF = 'Georgia, "Noto Serif", "Times New Roman", serif';
  // KJV lines, checked against the KJV text (bible-api.com, translation=kjv) on 2026-11-07.
  const VERSES = {
    first: { t: "Well done, thou good and faithful servant.", r: "Matthew 25:21" },
    podium: { t: "I have fought a good fight, I have finished my course, I have kept the faith.", r: "2 Timothy 4:7" },
    upper: { t: "So run, that ye may obtain.", r: "1 Corinthians 9:24" },
    rest: { t: "Let us not be weary in well doing: for in due season we shall reap, if we faint not.", r: "Galatians 6:9" },
    practice: { t: "Study to shew thyself approved unto God.", r: "2 Timothy 2:15" },
  };
  function verseFor(o) {
    if (o.practice) return VERSES.practice;
    if (o.rank === 1) return VERSES.first;
    if (o.rank <= 3) return VERSES.podium;
    if (o.players > 0 && o.rank <= Math.ceil(o.players / 2)) return VERSES.upper;
    return VERSES.rest;
  }
  const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const nf = (n) => Number(n || 0).toLocaleString("en-US");
  const clean = (s) => String(s == null ? "" : s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
  function dateStr(d) { try { return (d || new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } }
  const imgCache = {};
  function loadImg(src) {
    if (!imgCache[src]) imgCache[src] = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    return imgCache[src];
  }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function fitFont(c, text, weight, max, min, maxW, fam) {
    let s = max; for (; s > min; s -= 2) { c.font = `${weight} ${s}px ${fam || SANS}`; if (c.measureText(text).width <= maxW) return s; }
    c.font = `${weight} ${min}px ${fam || SANS}`; return min;
  }
  function ellipsize(c, text, maxW) { if (c.measureText(text).width <= maxW) return text; let t = text; while (t.length > 1 && c.measureText(t + "…").width > maxW) t = t.slice(0, -1); return t.trim() + "…"; }
  function wrap(c, text, maxW) { const words = text.split(" "), out = []; let line = ""; for (const w of words) { const t = line ? line + " " + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
  function spaced(c, text, x, y, sp) { // letter-spaced, centred on x
    const chars = [...text]; const w = chars.reduce((a, ch) => a + c.measureText(ch).width, 0) + sp * (chars.length - 1);
    let cx = x - w / 2; c.textAlign = "left"; for (const ch of chars) { c.fillText(ch, cx, y); cx += c.measureText(ch).width + sp; } c.textAlign = "center";
  }

  async function draw(o) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    const emblem = await loadImg("card-emblem.jpg?v=1");
    // background: black with navy and green glows
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    let g = c.createRadialGradient(W / 2, 250, 40, W / 2, 250, 760); g.addColorStop(0, "rgba(27,42,107,0.85)"); g.addColorStop(1, "rgba(27,42,107,0)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createRadialGradient(W / 2, H + 120, 40, W / 2, H + 120, 760); g.addColorStop(0, "rgba(10,143,74,0.55)"); g.addColorStop(1, "rgba(10,143,74,0)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    // top and bottom bands
    g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, NAVY); g.addColorStop(1, GREEN); c.fillStyle = g; c.fillRect(0, 0, W, 14); c.fillRect(0, H - 14, W, 14);
    // frame
    c.strokeStyle = "rgba(255,255,255,0.14)"; c.lineWidth = 2; rrect(c, 40, 40, W - 80, H - 80, 36); c.stroke();
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    // emblem (the logo is white on black, so "lighten" drops the black box onto the glow)
    if (emblem) { const ew = 210, eh = ew * emblem.height / emblem.width; c.save(); c.globalCompositeOperation = "lighten"; c.drawImage(emblem, (W - ew) / 2, 78, ew, eh); c.restore(); }
    // title
    c.fillStyle = GREEN2; c.font = `800 34px ${SANS}`; spaced(c, "RLW BIBLE QUIZ NIGHT", W / 2, 352, 6);
    const meta = [o.practice ? "Solo practice" : o.ep > 0 ? "EP " + o.ep : "", clean(o.set)].filter(Boolean).join("  ·  ");
    c.fillStyle = "rgba(255,255,255,0.78)"; fitFont(c, meta, 600, 32, 22, W - 200); c.fillText(ellipsize(c, meta, W - 200), W / 2, 402);
    c.fillStyle = "rgba(255,255,255,0.55)"; c.font = `500 28px ${SANS}`; c.fillText(o.date || dateStr(), W / 2, 444);
    // player name
    const name = clean(o.name) || "Player";
    c.fillStyle = "#fff"; fitFont(c, name, 800, 92, 54, W - 180); c.fillText(ellipsize(c, name, W - 180), W / 2, 566);
    // big number: rank (live) or correct (practice)
    let big, small;
    if (o.practice) { big = `${o.correct}/${o.total}`; small = "correct"; }
    else { big = ord(o.rank); small = `of ${o.players} player${o.players === 1 ? "" : "s"}`; }
    const tg = c.createLinearGradient(0, 600, 0, 800); tg.addColorStop(0, "#FFFFFF"); tg.addColorStop(1, o.rank === 1 && !o.practice ? "#7FE0A8" : "#C9D2FF");
    c.fillStyle = tg; fitFont(c, big, 900, 230, 120, W - 200); c.fillText(big, W / 2, 790);
    c.fillStyle = "rgba(255,255,255,0.8)"; c.font = `600 40px ${SANS}`; c.fillText(o.practice ? small : "out of " + small.slice(3), W / 2, 852);
    // stat boxes
    const boxes = o.practice ? [["SCORE", nf(o.score)], ["BEST STREAK", String(o.best_streak || 0)]] : [["SCORE", nf(o.score)], ["CORRECT", `${o.correct}/${o.total}`]];
    const bw = 400, bh = 150, gap = 40, bx = (W - (bw * 2 + gap)) / 2, by = 900;
    boxes.forEach(([lab, val], k) => {
      const x = bx + k * (bw + gap);
      c.fillStyle = k === 0 ? "rgba(27,42,107,0.92)" : "rgba(10,143,74,0.88)"; rrect(c, x, by, bw, bh, 26); c.fill();
      c.fillStyle = "rgba(255,255,255,0.75)"; c.font = `700 26px ${SANS}`; spaced(c, lab, x + bw / 2, by + 50, 3);
      c.fillStyle = "#fff"; fitFont(c, val, 800, 64, 36, bw - 40); c.fillText(val, x + bw / 2, by + 122);
    });
    // verse
    const v = verseFor(o);
    c.fillStyle = "#fff"; c.font = `italic 500 38px ${SERIF}`;
    let lines = wrap(c, "\u201C" + v.t + "\u201D", W - 220);
    if (lines.length > 3) { c.font = `italic 500 32px ${SERIF}`; lines = wrap(c, "\u201C" + v.t + "\u201D", W - 200); }
    const lh = lines.length > 2 ? 46 : 52; let vy = 1132 - (lines.length - 1) * lh / 2;
    lines.forEach((ln) => { c.fillText(ln, W / 2, vy); vy += lh; });
    c.fillStyle = GREEN2; c.font = `700 30px ${SANS}`; c.fillText(v.r + " (KJV)", W / 2, vy + 2);
    // footer
    c.fillStyle = "rgba(255,255,255,0.88)"; c.font = `700 30px ${SANS}`; c.fillText("Rivers of Living Water Parish", W / 2, H - 84);
    c.fillStyle = "rgba(255,255,255,0.5)"; c.font = `500 24px ${SANS}`; c.fillText(o.site || "rlw-bible-quiz.sites.tab.bot", W / 2, H - 52);
    return cv;
  }
  const toBlob = (cv, type, q) => new Promise((res) => cv.toBlob((b) => res(b), type, q));
  const fileName = (o) => "RLW-quiz-card-" + (clean(o.name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player") + ".png";

  // Mounts the "Get my card" panel into `host`. opts: card fields + shareText(link) + upload(jpegBlob) -> Promise<url|null>
  function mount(host, o) {
    let saved = ""; try { saved = localStorage.getItem("rlw_card_name") || ""; } catch (e) {}
    host.innerHTML = `${o.askName ? `<div class="field" style="text-align:left;max-width:360px;margin:0 auto 10px"><label for="cardName">Your name for the card</label><input id="cardName" maxlength="40" autocomplete="name" placeholder="Your name"></div>` : ""}<button class="btn primary big" type="button" id="cardGo">Get my card</button>`;
    const go = host.querySelector("#cardGo"), ni = host.querySelector("#cardName");
    if (ni) ni.value = saved;
    go.onclick = async () => {
      if (ni) { o.name = clean(ni.value) || "Bible student"; try { localStorage.setItem("rlw_card_name", o.name); } catch (e) {} }
      go.disabled = true; go.textContent = "Making your card…";
      let cv;
      try { cv = await draw(o); } catch (e) { go.disabled = false; go.textContent = "Get my card"; host.insertAdjacentHTML("beforeend", `<p class="err">Couldn't make the card on this phone.</p>`); return; }
      const png = await toBlob(cv, "image/png");
      const url = URL.createObjectURL(png), fname = fileName(o);
      const file = typeof File === "function" ? new File([png], fname, { type: "image/png" }) : null;
      const canFiles = !!(file && navigator.canShare && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })());
      let link = o.link;
      const waHref = () => "https://wa.me/?text=" + encodeURIComponent(o.shareText(link));
      host.innerHTML = `<div class="rlw-card-wrap"><img class="rlw-card-img" id="cardImg" src="${url}" width="1080" height="1350" alt="Your RLW Bible Quiz Night card"></div>
        <div class="row" style="justify-content:center;margin-top:14px;flex-wrap:wrap;gap:10px">
          ${canFiles ? `<button class="btn primary" type="button" id="cardShare">Share my card</button>` : ""}
          <a class="btn ${canFiles ? "" : "primary"}" id="cardDl" href="${url}" download="${fname}">Download image</a>
        </div>
        <p class="muted" style="margin:12px 0 0;font-size:14px">${canFiles ? "Share opens WhatsApp, your status and other apps." : "Download the image, then post it on your WhatsApp status."} You can also press and hold the card to save it.</p>
        <p style="margin:10px 0 0"><a id="cardWa" target="_blank" rel="noopener" href="${waHref()}">Share on WhatsApp as a link</a></p>`;
      if (canFiles) host.querySelector("#cardShare").onclick = async () => {
        try { await navigator.share({ files: [file], title: "RLW Bible Quiz Night", text: o.shareText(link) }); }
        catch (e) { if (e && e.name !== "AbortError") { try { await navigator.share({ files: [file] }); } catch (e2) {} } }
      };
      if (o.upload) {
        try {
          const jpg = await toBlob(cv, "image/jpeg", 0.88);
          const u = jpg && (await o.upload(jpg));
          if (u) { link = u; const a = host.querySelector("#cardWa"); if (a) a.href = waHref(); host.dataset.link = u; }
        } catch (e) {}
      }
      host.dataset.ready = "1";
    };
  }
  try {
    const st = document.createElement("style");
    st.textContent = ".rlw-card-wrap{display:flex;justify-content:center}.rlw-card-img{display:block;width:100%;max-width:340px;height:auto;border-radius:18px;border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 36px rgba(10,143,74,.25)}#cardWa{color:#4CC27E;font-weight:700}";
    document.head.appendChild(st);
  } catch (e) {}
  window.RLWCard = { draw, mount, verseFor, VERSES };
})();
