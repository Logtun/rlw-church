
const view = $("#view");
let set = null, i = 0, score = 0, correct = 0, streak = 0, best = 0, t0 = 0, raf = null, done = false;
// game sounds (sound.js); safe no-ops if audio is unavailable
function sfx(n, o) { try { return window.PQSound ? PQSound.play(n, o) : false; } catch (e) { return false; } }
function sfx1(k, n, o) { try { return window.PQSound ? PQSound.once(k, n, o) : false; } catch (e) { return false; } }
function shuffle(a) { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
async function boot() {
  const sid = new URLSearchParams(location.search).get("set");
  const r = await api("solo" + (sid ? "?set=" + encodeURIComponent(sid) : ""));
  if (!r.ok) { view.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
  const l = await api("solosets"); if (l.ok) r.list = l.sets;
  set = r; intro();
}
function intro() {
  const opts = (set.list || []).length < 2 ? "" : (set.list || []).map((x) => `<option value="${esc(x.id)}" ${x.id === set.id ? "selected" : ""}>${esc(x.title)} (${x.n} questions)</option>`).join("");
  view.innerHTML = `<div class="card center"><span class="pill">Solo practice</span><h1 style="margin-top:14px">${esc(set.title)}</h1><p class="muted">${set.questions.length} questions · timed · faster right answers score more (up to 1,000), streaks add bonus points.</p>${opts ? `<div class="field" style="text-align:left"><label for="round">Pick a round</label><select id="round">${opts}</select></div>` : ""}<button class="btn primary big" id="go" type="button">Start</button><p class="err" id="soloErr" role="alert"></p></div>`;
  if ($("#round")) $("#round").onchange = async (e) => {
    const r = await api("solo?set=" + encodeURIComponent(e.target.value));
    if (!r.ok) { $("#soloErr").textContent = r.error; return; }
    r.list = set.list; set = r; history.replaceState(null, "", "solo.html?set=" + encodeURIComponent(r.id)); intro();
  };
  $("#go").onclick = () => { i = score = correct = streak = best = 0; set.order = shuffle(set.questions.map((_, k) => k)); sfx("go"); ask(); };
}
function ask() {
  cancelAnimationFrame(raf); done = false;
  const q = set.questions[set.order[i]];
  view.innerHTML = `<div class="card"><div class="qmeta"><span>Question ${i + 1} of ${set.questions.length}${q.type === "multi" ? ' · <span class="badge2">Select 2</span>' : q.type === "text" ? ' · <span class="badge2">Type it</span>' : ""}</span><span>${fmt(score)} pts${streak > 1 ? ` · streak ${streak}` : ""}</span></div><p class="qtext">${esc(q.q)}</p><div class="timerbar"><i id="tb"></i></div><div class="row" style="justify-content:space-between;margin-bottom:12px"><b id="secs"></b></div><div id="ans"></div><div id="fb"></div></div>`;
  if (q.type === "text") $("#ans").appendChild(textPicker({ draft: { v: "" }, onSubmit: (v) => finish({ typed: v }) }));
  else if (q.type === "multi") $("#ans").appendChild(multiPicker(q, { sel: [], onSubmit: (picks) => finish(picks) }));
  else $("#ans").appendChild(answerButtons(q, { onPick: (k) => finish(k) }));
  t0 = performance.now(); const total = q.time * 1000; let lastTick = 0;
  const tick = () => { const left = Math.max(0, total - (performance.now() - t0)); const el = $("#tb"); if (!el) return; el.style.transform = `scaleX(${left / total})`; const n = Math.ceil(left / 1000); $("#secs").textContent = n + "s"; if (n >= 1 && n <= 5 && n !== lastTick) { lastTick = n; sfx("tick", n); } if (left <= 0) return finish(null); raf = requestAnimationFrame(tick); };
  tick();
}
function finish(k) {
  if (done) return; done = true; cancelAnimationFrame(raf);
  const q = set.questions[set.order[i]], ms = Math.min(performance.now() - t0, q.time * 1000);
  let ok;
  if (q.type === "text") ok = !!(k && pqTextCorrect(k.typed, q.accept));
  else if (Array.isArray(k)) { const a = k.map(Number).sort((x, y) => x - y), b = asList(q.answer).sort((x, y) => x - y); ok = a.length === 2 && b.length === 2 && a[0] === b[0] && a[1] === b[1]; }
  else ok = k != null && k === q.answer;
  let pts = 0;
  if (ok) { streak++; best = Math.max(best, streak); correct++; pts = Math.round(1000 * (1 - ms / (q.time * 1000) / 2)) + Math.min(500, Math.max(0, streak - 1) * 100); score += pts; } else streak = 0;
  sfx(k == null ? "timeup" : ok ? "correct" : "wrong");
  $("#ans").innerHTML = "";
  if (q.type === "text") $("#ans").innerHTML = `<div class="text-answer"><span class="muted">The answer</span><b>${esc(q.answer)}</b></div>${k ? `<p class="muted" style="margin:10px 0 0">You typed: <b class="${ok ? "ok-t" : "bad-t"}">${esc(k.typed)}</b></p>` : ""}`;
  else $("#ans").appendChild(answerButtons(q, { answer: q.answer, picked: k }));
  const last = i + 1 >= set.questions.length;
  if (q.ref) $("#ans").insertAdjacentHTML("beforeend", `<p class="ref-line">${esc(q.ref)} (KJV)</p>`);
  $("#fb").innerHTML = `<div class="feedback ${k == null ? "none" : ok ? "good" : "bad"}" style="margin-top:14px;padding:18px"><div class="big" style="font-size:28px">${k == null ? "Time's up" : ok ? "Correct!" : "Wrong"}</div>${!ok && q.type === "multi" ? `<p style="margin:6px 0 0">Both picks had to be right.</p>` : ""}${!ok && q.type === "text" ? `<p style="margin:6px 0 0">The answer was ${esc(q.answer)}</p>` : ""}${ok ? `<div class="plus">+${fmt(pts)}</div>` : ""}${streak > 1 ? `<p style="margin:8px 0 0">Streak: ${streak}</p>` : ""}</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary big" id="nx" type="button">${last ? "See my score" : "Next question"}</button></div>`;
  const nx = $("#nx"), lbl = last ? "See my score" : "Next question";
  let left = 4, moved = false;
  const go = () => { if (moved) return; moved = true; clearInterval(tick); i++; last ? result() : ask(); };
  nx.textContent = `${lbl} (${left})`;
  const tick = setInterval(() => { left--; if (left <= 0) go(); else if (document.body.contains(nx)) nx.textContent = `${lbl} (${left})`; }, 1000);
  nx.onclick = go; nx.focus();
}
function result() {
  const n = set.questions.length, pct = correct / n;
  const verdict = pct === 1 ? "Perfect score. Well done, good and faithful student of the Word!" : pct >= .75 ? "Strong. You know your Bible." : pct >= .5 ? "Not bad. Keep reading and try again." : "Time to read the Bible and try again.";
  const text = `I scored ${correct}/${n} (${fmt(score)} points) on RLW Bible Quiz Night, ${set.title}. Can you beat it? ${QBASE}/solo.html`;
  view.innerHTML = `<div class="card center"><span class="pill">Your result</span><p class="status-big" style="font-size:56px;margin:12px 0 0">${correct}/${n}</p><p style="font-size:20px;font-weight:800;margin:4px 0">${fmt(score)} points · best streak ${best}</p><p class="muted">${verdict}</p></div>
    <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" id="again" type="button">Play again</button></div>`;
  sfx("fanfare");
  $("#again").onclick = intro;
}
boot();
