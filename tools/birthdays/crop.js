/* RLW Birthdays — photo loader + square cropper (drag / zoom), face-aware where the browser can */
(function () {
  var RLW = window.RLW = window.RLW || {};
  function loadFile(file) {
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error("No file"));
      if (file.size > 40 * 1024 * 1024) return rej(new Error("That photo is too large. Please choose a smaller one."));
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("We couldn't open this photo. Please choose a JPG or PNG photo. On iPhone, pick the photo from your Photos library (it is converted automatically), or take a screenshot of it and upload that.")); };
      im.src = u;
    });
  }
  RLW.loadFile = loadFile;
  // scale down to a canvas of max side `max`
  function toCanvas(img, max) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, sc = Math.min(1, max / Math.max(w, h));
    var cv = document.createElement("canvas"); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
    var c = cv.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(img, 0, 0, cv.width, cv.height); return cv;
  }
  RLW.toCanvas = toCanvas;
  async function autoCrop(cv) {
    var w = cv.width, h = cv.height, side = Math.min(w, h), cx = w / 2, cy = h / 2, how = "centre";
    if (h > w) { cy = Math.min(h - side / 2, Math.max(side / 2, h * 0.40)); how = "upper"; }
    if ("FaceDetector" in window) {
      try {
        var fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
        var faces = await fd.detect(cv);
        if (faces && faces.length) {
          var f = faces.reduce(function (a, b) { return a.boundingBox.width * a.boundingBox.height > b.boundingBox.width * b.boundingBox.height ? a : b; }).boundingBox;
          side = Math.min(Math.min(w, h), Math.max(f.width, f.height) * 2.6);
          cx = f.x + f.width / 2; cy = f.y + f.height / 2 + f.height * 0.18; how = "face";
        }
      } catch (e) {}
    }
    return clamp({ cx: cx, cy: cy, side: side, how: how }, w, h);
  }
  function clamp(st, w, h) {
    st.side = Math.max(Math.min(w, h) / 4, Math.min(st.side, Math.min(w, h)));
    st.cx = Math.max(st.side / 2, Math.min(w - st.side / 2, st.cx));
    st.cy = Math.max(st.side / 2, Math.min(h - st.side / 2, st.cy));
    return st;
  }
  // Cropper UI: box element gets a canvas, zoom input controls zoom
  function Cropper(box, zoomInput) {
    this.box = box; this.zoom = zoomInput; this.cv = document.createElement("canvas"); this.cv.className = "cropcv";
    this.cv.setAttribute("role", "img"); this.cv.setAttribute("aria-label", "Photo preview. Drag to move the photo.");
    box.innerHTML = ""; box.appendChild(this.cv);
    var ring = document.createElement("div"); ring.className = "cropring"; ring.setAttribute("aria-hidden", "true"); box.appendChild(ring);
    this.src = null; this.st = null; this.base = 0; var self = this, drag = null, pts = {};
    this.cv.addEventListener("pointerdown", function (e) { self.cv.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; drag = { x: e.clientX, y: e.clientY, cx: self.st && self.st.cx, cy: self.st && self.st.cy, d: dist(), side: self.st && self.st.side }; });
    this.cv.addEventListener("pointermove", function (e) {
      if (!drag || !self.st) return; pts[e.pointerId] = [e.clientX, e.clientY];
      var k = Object.keys(pts);
      if (k.length >= 2 && drag.d) { var d = dist(); self.setSide(drag.side * drag.d / d); return; }
      var per = self.st.side / self.cv.getBoundingClientRect().width;
      self.st.cx = drag.cx - (e.clientX - drag.x) * per; self.st.cy = drag.cy - (e.clientY - drag.y) * per; self.fix(); self.draw();
    });
    function end(e) { delete pts[e.pointerId]; if (!Object.keys(pts).length) drag = null; else drag = { x: e.clientX, y: e.clientY, cx: self.st.cx, cy: self.st.cy, d: dist(), side: self.st.side }; }
    this.cv.addEventListener("pointerup", end); this.cv.addEventListener("pointercancel", end);
    function dist() { var k = Object.keys(pts); if (k.length < 2) return 0; var a = pts[k[0]], b = pts[k[1]]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }
    this.cv.addEventListener("wheel", function (e) { if (!self.st) return; e.preventDefault(); self.setSide(self.st.side * (e.deltaY > 0 ? 1.06 : 0.94)); }, { passive: false });
    this.cv.tabIndex = 0;
    this.cv.addEventListener("keydown", function (e) {
      if (!self.st) return; var step = self.st.side * 0.04, k = e.key;
      if (k === "ArrowLeft") self.st.cx -= step; else if (k === "ArrowRight") self.st.cx += step; else if (k === "ArrowUp") self.st.cy -= step; else if (k === "ArrowDown") self.st.cy += step; else if (k === "+" || k === "=") self.setSide(self.st.side * 0.94); else if (k === "-") self.setSide(self.st.side * 1.06); else return;
      e.preventDefault(); self.fix(); self.draw();
    });
    if (zoomInput) zoomInput.addEventListener("input", function () { if (!self.st) return; self.setSide(self.base / Number(zoomInput.value)); });
  }
  Cropper.prototype.setSide = function (side) { this.st.side = side; this.fix(); if (this.zoom) this.zoom.value = String(Math.max(1, Math.min(3, this.base / this.st.side))); this.draw(); };
  Cropper.prototype.fix = function () { clamp(this.st, this.src.width, this.src.height); };
  Cropper.prototype.load = async function (img) {
    this.src = toCanvas(img, 1600); this.st = await autoCrop(this.src); this.base = Math.min(this.src.width, this.src.height);
    if (this.zoom) this.zoom.value = String(this.base / this.st.side); this.draw(); return this.st.how;
  };
  Cropper.prototype.draw = function () {
    var px = Math.round(Math.min(600, this.box.clientWidth * (window.devicePixelRatio || 1))) || 600;
    this.cv.width = px; this.cv.height = px;
    var c = this.cv.getContext("2d"), st = this.st; c.imageSmoothingQuality = "high";
    c.drawImage(this.src, st.cx - st.side / 2, st.cy - st.side / 2, st.side, st.side, 0, 0, px, px);
  };
  Cropper.prototype.square = function (size) {
    size = size || 1080; var cv = document.createElement("canvas"); cv.width = size; cv.height = size;
    var c = cv.getContext("2d"), st = this.st; c.imageSmoothingQuality = "high";
    c.fillStyle = "#fff"; c.fillRect(0, 0, size, size);
    c.drawImage(this.src, st.cx - st.side / 2, st.cy - st.side / 2, st.side, st.side, 0, 0, size, size); return cv;
  };
  Cropper.prototype.blobs = async function () {
    var sq = this.square(1080);
    var o = document.createElement("canvas"); o.width = this.src.width; o.height = this.src.height; var oc = o.getContext("2d"); oc.fillStyle = "#fff"; oc.fillRect(0, 0, o.width, o.height); oc.drawImage(this.src, 0, 0);
    var a = await RLW.canvasBlob(sq, "image/jpeg", 0.86), b = await RLW.canvasBlob(o, "image/jpeg", 0.82);
    return { photo: a, orig: b, square: sq };
  };
  RLW.Cropper = Cropper;
})();
