(function () {
  var $ = function (id) { return document.getElementById(id); };
  var t0 = Date.now(), cropper = null, hasPhoto = false, flyerBlob = null, lastName = "";
  RLW.fonts();
  var day = $("day"), month = $("month");
  for (var d = 1; d <= 31; d++) day.add(new Option(String(d), String(d)));
  RLW.MONTHS.forEach(function (m, i) { month.add(new Option(m, String(i + 1))); });
  function fixDays() { var m = +month.value, max = m ? RLW.DIM[m - 1] : 31; for (var i = 1; i < day.options.length; i++) day.options[i].disabled = i > max; if (+day.value > max) day.value = ""; }
  month.addEventListener("change", fixDays);
  function show(el, on) { el.classList.toggle("hidden", !on); }
  function err(msg) { $("err").textContent = msg || ""; show($("err"), !!msg); }
  $("file").addEventListener("change", async function () {
    var f = this.files && this.files[0]; $("photoErr").textContent = ""; show($("photoErr"), false);
    if (!f) return;
    try {
      var img = await RLW.loadFile(f);
      show($("cropArea"), true); show($("drop"), false);
      if (!cropper) cropper = new RLW.Cropper($("cropbox"), $("zoom"));
      var how = await cropper.load(img); hasPhoto = true;
      $("cropHint").textContent = (how === "face" ? "We centred the photo on your face. " : "") + "Drag the photo to move it, or zoom. Your face should sit inside the gold circle.";
    } catch (e) {
      hasPhoto = false; show($("cropArea"), false); show($("drop"), true);
      $("photoErr").textContent = e.message || "We couldn't open this photo."; show($("photoErr"), true);
    }
    this.value = "";
  });
  $("another").addEventListener("click", function () { $("file").click(); });
  async function send(confirmDup) {
    err(""); show($("dupBox"), false);
    var name = $("name").value.trim().replace(/\s+/g, " ");
    if (name.length < 2) { err("Please enter your full name."); $("name").focus(); return; }
    if (!day.value || !month.value) { err("Please choose the day and month of your birthday."); (day.value ? month : day).focus(); return; }
    if (!hasPhoto) { err("Please add a photo of yourself."); $("drop").scrollIntoView({ block: "center" }); return; }
    if (!$("consent").checked) { err("Please tick the box to agree your name and photo can be shown."); $("consent").focus(); return; }
    var go = $("go"); go.disabled = true; go.textContent = "Sending...";
    try {
      var b = await cropper.blobs();
      var fd = new FormData();
      fd.append("name", name); fd.append("day", day.value); fd.append("month", month.value);
      fd.append("phone", $("phone").value); fd.append("dept", $("dept").value); fd.append("website", $("website").value);
      fd.append("consent", "1"); fd.append("elapsed", String(Date.now() - t0)); if (confirmDup) fd.append("confirm_dup", "1");
      fd.append("photo", b.photo, "photo.jpg"); fd.append("orig", b.orig, "orig.jpg");
      var r = await fetch("api/submit", { method: "POST", body: fd }), j = await r.json().catch(function () { return {}; });
      if (j.dup) {
        $("dupText").textContent = "Someone named " + name + " with a birthday on " + RLW.dateText(+day.value, +month.value) + " is already registered. If that is you, you don't need to submit again.";
        show($("dupBox"), true); $("dupBox").scrollIntoView({ block: "center" }); return;
      }
      if (!j.ok) { err(j.error || "Something went wrong. Please try again."); return; }
      await RLW.fonts();
      var logo = await RLW.logo(), ph = await RLW.loadImg(b.square.toDataURL("image/jpeg", 0.9));
      var cv = RLW.drawSingle(document.createElement("canvas"), { name: name, day: +day.value, month: +month.value, dept: $("dept").value.trim() }, ph, logo);
      flyerBlob = await RLW.canvasBlob(cv, "image/png"); lastName = name;
      $("flyer").src = URL.createObjectURL(flyerBlob);
      var first = name.split(" ")[0];
      $("doneTitle").textContent = "Thank you, " + first + "!";
      $("doneText").textContent = "You're on the " + RLW.MONTHS[+month.value - 1] + " birthday list. The church will celebrate you on " + RLW.dateText(+day.value, +month.value) + ".";
      show($("f"), false); show($("done"), true); window.scrollTo(0, 0);
    } catch (e) { err("We couldn't send the form. Please check your internet connection and try again."); }
    finally { go.disabled = false; go.textContent = "Submit my birthday"; }
  }
  $("f").addEventListener("submit", function (e) { e.preventDefault(); send(false); });
  $("dupYes").addEventListener("click", function () { send(true); });
  $("dupNo").addEventListener("click", function () { show($("dupBox"), false); });
  $("save").addEventListener("click", function () { if (flyerBlob) RLW.download(flyerBlob, "Happy_Birthday_" + RLW.slug(lastName) + ".png"); });
  $("again").addEventListener("click", function () {
    $("f").reset(); hasPhoto = false; show($("cropArea"), false); show($("drop"), true); show($("done"), false); show($("f"), true); t0 = Date.now(); window.scrollTo(0, 0);
  });
})();
