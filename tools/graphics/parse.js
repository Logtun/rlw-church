/* RLW Graphics: turns a plain description into flyer fields. Rule-based, runs in the browser (and in node for tests). */
(function (root) {
  var DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  var MON3 = MONTHS.map(function (m) { return m.slice(0, 3); });
  function cap(w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }
  function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  var SMALL = { a: 1, an: 1, and: 1, of: 1, the: 1, in: 1, on: 1, at: 1, to: 1, for: 1, with: 1, by: 1, or: 1 };
  var KEEP = { rccg: "RCCG", yaya: "YAYA", rlw: "RLW", picp: "PICP", ii: "II", iii: "III", iv: "IV", agm: "AGM", nifes: "NIFES", cac: "CAC", ccc: "CCC", dcm: "DCM" };
  function titleCase(s) {
    var w = s.trim().split(/\s+/);
    return w.map(function (x, i) {
      var l = x.toLowerCase(), core = l.replace(/[^a-z0-9']/g, "");
      if (KEEP[core]) return x.replace(new RegExp(core, "i"), KEEP[core]);
      if (i > 0 && SMALL[l]) return l;
      if (/^[A-Z0-9]{2,}$/.test(x) && x.length <= 5) return x;
      return x.split("-").map(function (y) { return y.charAt(0).toUpperCase() + y.slice(1).toLowerCase(); }).join("-");
    }).join(" ");
  }
  function fmtTime(h, m, ap) {
    h = +h; m = m ? +m : 0; ap = ap ? ap.toLowerCase().replace(/\./g, "") : "";
    if (!ap) { if (h > 12) { ap = "pm"; h -= 12; } else if (h === 12) ap = "pm"; else if (h === 0) { h = 12; ap = "am"; } }
    return h + ":" + (m < 10 ? "0" : "") + m + (ap ? " " + (ap.charAt(0) === "a" ? "AM" : "PM") : "");
  }
  function fmtDate(d, withYear) {
    return cap(DAYS[d.getDay()]) + ", " + ordinal(d.getDate()) + " " + cap(MONTHS[d.getMonth()]) + (withYear ? " " + d.getFullYear() : "");
  }
  // categories for the photo library: words in the description -> photo theme
  var CAT_WORDS = {
    youth: "youth youths teen teens teenager teenagers young campus student students singles yaya fellowship hangout teenz jcc junior juniors boys girls",
    family: "family families children child kids kid couples couple marriage married mothers mother fathers father mums mum dads dad parents women men men's women's sunday school naming dedication baby",
    prayer: "prayer prayers pray praying vigil night intercession intercessory watch fasting fast tarry tarrying hour supplication",
    worship: "worship praise music choir singing sing songs song hymn hymns concert musical",
    bible: "bible word scripture scriptures study teaching teach seminar class school sermon doctrine discipleship training workshop",
    cross: "cross easter good friday calvary resurrection risen passion salvation redemption redeemed communion holy communion blood",
    light: "light lights shine shining arise glory candle candles lamp illuminate bright brightness dawn new beginning",
    water: "water waters river rivers living flow flowing baptism baptismal stream streams sea rain overflow",
    thanksgiving: "thanksgiving thanks thank grateful gratitude harvest bazaar bounty fruitful fruitfulness abundance offering",
    spirit: "spirit holy ghost fire pentecost revival dove anointing power outpouring tongues flame flames",
    sky: "hope heaven heavenly sky skies faith rise higher soar wings eagle elevation lifting new year beyond",
    crowd: "crusade conference convention congress outreach evangelism rally gathering summit festival program programme rccg holy ghost congress",
    christmas: "christmas carol carols nativity xmas advent noel",
    celebration: "anniversary celebration celebrate birthday jubilee party dinner award awards gala graduation wedding launch dedication victory",
    church: "service church sunday parish meeting general"
  };
  var CATS = Object.keys(CAT_WORDS);
  function pickCategory(title, theme, rest) {
    var score = {};
    function add(txt, w) {
      var t = " " + String(txt || "").toLowerCase().replace(/'s\b/g, "").replace(/[^a-z' ]+/g, " ") + " ";
      CATS.forEach(function (c) {
        CAT_WORDS[c].split(" ").forEach(function (k) { if (k && t.indexOf(" " + k + " ") >= 0) score[c] = (score[c] || 0) + w * (c === "church" ? 0.4 : 1); });
      });
      if (/holy ghost (service|night|congress)/.test(t)) score.spirit = (score.spirit || 0) + w;
    }
    add(title, 3); add(theme, 2); add(rest, 1);
    var best = "church", bs = 0;
    CATS.forEach(function (c) { if ((score[c] || 0) > bs) { bs = score[c]; best = c; } });
    return best;
  }

  function parse(input, now) {
    now = now || new Date();
    var s = " " + String(input || "").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim() + " ";
    var out = { title: "", theme: "", date: "", time: "", venue: "", minister: "", extra: "", scripture: "" };
    var cut = function (re, fn) { s = s.replace(re, function () { var r = fn.apply(null, arguments); return r == null ? " " : r; }); };
    // theme: "theme: X" or "theme - X" or anything in quotes
    cut(/\btheme\s*(?:is|:|-|=)?\s*["\u201c]([^"\u201d]+)["\u201d]/i, function (m, t) { out.theme = t.trim(); return " , "; });
    if (!out.theme) cut(/\btheme\s*(?::|-|=|is)\s*([^,;.\n]+?)(?=\s*(?:[,;.]|$|\b(?:on|at|by|with|minister|speaker|venue|time|date)\b\s*[:A-Z0-9]))/i, function (m, t) { out.theme = t.trim(); return " , "; });
    if (!out.theme) cut(/["\u201c]([^"\u201d]{2,80})["\u201d]/, function (m, t) { out.theme = t.trim(); return " , "; });
    // scripture reference (e.g. John 3:16, 1 Cor 13:4-7, Isaiah 60:1)
    cut(/\b(?:scripture|text|bible text|anchor)\s*[:\-]?\s*((?:[1-3]\s?)?[A-Z][a-z]+\.?\s+\d{1,3}:\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?)/i, function (m, t) { out.scripture = t.trim(); return " , "; });
    if (!out.scripture) cut(/\b((?:[1-3]\s?)?(?:Genesis|Gen|Exodus|Exo|Leviticus|Numbers|Deuteronomy|Deut|Joshua|Judges|Ruth|Samuel|Sam|Kings|Chronicles|Chron|Ezra|Nehemiah|Esther|Job|Psalms?|Ps|Proverbs|Prov|Ecclesiastes|Song of Solomon|Isaiah|Isa|Jeremiah|Jer|Lamentations|Ezekiel|Ezek|Daniel|Dan|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Hab|Zephaniah|Haggai|Zechariah|Zech|Malachi|Mal|Matthew|Matt|Mark|Luke|John|Acts|Romans|Rom|Corinthians|Cor|Galatians|Gal|Ephesians|Eph|Philippians|Phil|Colossians|Col|Thessalonians|Thess|Timothy|Tim|Titus|Philemon|Hebrews|Heb|James|Peter|Pet|Jude|Revelation|Rev)\.?\s+\d{1,3}:\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?)\b/i, function (m, t) { out.scripture = t.trim().replace(/^([1-3])(?=[A-Za-z])/, "$1 "); return " , "; });
    // minister / speaker
    cut(/\b(?:minister(?:ing)?|speaker|preacher|guest|host(?:ed)? by|special guest)\s*[:\-]\s*([^,;\n]+)/i, function (m, t) { out.minister = t.trim(); return " , "; });
    if (!out.minister) cut(/\b(?:with|by|featuring|ft\.?)\s+((?:the\s+)?(?:pastor|pst\.?|rev(?:erend)?\.?|evang(?:elist)?\.?|bishop|apostle|prophet(?:ess)?|dr\.?|deacon(?:ess)?|elder|minister|brother|bro\.?|sister|sis\.?|mr\.?|mrs\.?|min\.?)\s+[^,;\n]+?)(?=\s*(?:[,;]|\.\s*$|$|\b(?:on|at|this|next|from|by|time|venue)\b))/i, function (m, t) { out.minister = t.trim(); return " , "; });
    if (out.minister) out.minister = titleCase(out.minister.replace(/^the\s+/i, "").replace(/\.$/, ""));
    // venue
    cut(/\b(?:venue|location|place|where)\s*[:\-]\s*([^,;\n]+)/i, function (m, t) { out.venue = t.trim(); return " , "; });
    if (!out.venue) cut(/\b(?:at|@)\s+(the\s+)?((?:church|parish|main|youth|children'?s?|cathedral|hall|auditorium|chapel|ground|grounds|arena|camp|resort|hotel|stadium|school|centre|center)[^,;.\n]*|[A-Z][\w'&-]*(?:\s+[A-Z][\w'&-]*){0,5})(?=\s*(?:[,;.]|$|\b(?:on|this|next|from|by|with|by)\b))/, function (m, the, t) {
      if (/^(?:\d|noon|midnight|night)/i.test(t)) return m;
      out.venue = titleCase(((the || "") + t).trim()); return " , ";
    });
    // extra line
    var EXTRA = [[/\ball[\s-]?night\b/i, "All Night"], [/\b(?:free (?:entry|admission)|admission (?:is )?free)\b/i, "Admission Free"], [/\bcome with a friend\b/i, "Come with a friend"], [/\bbring a friend\b/i, "Bring a friend"], [/\brefreshments?\b/i, "Refreshments will be served"], [/\blive on youtube\b/i, "Live on YouTube"], [/\bonline\b/i, "Online"]];
    var extras = [];
    EXTRA.forEach(function (e) { if (e[0].test(s)) { extras.push(e[1]); s = s.replace(e[0], " , "); } });
    out.extra = extras.join(" | ");
    // time (one or a range)
    var T = "(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?";
    var tr = new RegExp("\\b(?:from\\s+|by\\s+|@\\s*|at\\s+)?" + T + "\\s*(?:-|\\u2013|to|till|until)\\s*" + T + "(?=\\W)", "i");
    var t1 = new RegExp("\\b(?:from\\s+|by\\s+|@\\s*|at\\s+|time\\s*:?\\s*)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)(?=\\W)", "i");
    var t2 = new RegExp("\\b(?:time\\s*:?\\s*|by\\s+|at\\s+)(\\d{1,2})[:.](\\d{2})(?=\\W)", "i");
    var m;
    if ((m = s.match(tr)) && (m[3] || m[6])) { out.time = fmtTime(m[1], m[2], m[3] || m[6]) + " \u2013 " + fmtTime(m[4], m[5], m[6] || m[3]); s = s.replace(m[0], " , "); }
    else if ((m = s.match(t1))) { out.time = fmtTime(m[1], m[2], m[3]); s = s.replace(m[0], " , "); }
    else if ((m = s.match(t2))) { out.time = fmtTime(m[1], m[2], ""); s = s.replace(m[0], " , "); }
    else if ((m = s.match(/\b(?:at\s+)?(noon|midday|midnight)\b/i))) { out.time = /mid ?night/i.test(m[1]) ? "12:00 AM" : "12:00 PM"; s = s.replace(m[0], " , "); }
    // date
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var dRe = new RegExp("\\b(?:on\\s+)?(?:(this|next|coming|this coming)\\s+)?(" + DAYS.join("|") + "|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\\b,?(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(?:of\\s+)?(" + MONTHS.join("|") + "|" + MON3.join("|") + ")\\.?)?)?", "i");
    var mdRe = new RegExp("\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(" + MONTHS.join("|") + "|" + MON3.join("|") + ")\\.?(?:,?\\s+(\\d{4}))?\\b", "i");
    var dmRe = new RegExp("\\b(?:on\\s+)?(" + MONTHS.join("|") + "|" + MON3.join("|") + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b", "i");
    var numRe = /\b(?:on\s+)?(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/;
    function mIndex(w) { w = w.toLowerCase().slice(0, 3); return MON3.indexOf(w); }
    function fromDM(d, mo, y) {
      var dt = new Date(y || today.getFullYear(), mo, d);
      if (!y && dt < today) dt = new Date(today.getFullYear() + 1, mo, d);
      return dt;
    }
    var dt = null, dayOnly = null;
    if ((m = s.match(mdRe))) { dt = fromDM(+m[1], mIndex(m[2]), m[3] ? +m[3] : 0); s = s.replace(m[0], " , "); }
    else if ((m = s.match(dmRe))) { dt = fromDM(+m[2], mIndex(m[1]), m[3] ? +m[3] : 0); s = s.replace(m[0], " , "); }
    if (!dt && (m = s.match(/\b(every|each)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/i))) { dayOnly = "Every " + cap(m[2].toLowerCase()); s = s.replace(m[0], " , "); }
    if (!dt && !dayOnly && (m = s.match(dRe))) {
      var wd = DAYS.map(function (d) { return d.slice(0, 3); }).indexOf(m[2].toLowerCase().slice(0, 3));
      if (m[3]) {
        var mo = m[4] ? mIndex(m[4]) : -1;
        if (mo < 0) { dt = new Date(today.getFullYear(), today.getMonth(), +m[3]); if (dt < today) dt = new Date(today.getFullYear(), today.getMonth() + 1, +m[3]); }
        else dt = fromDM(+m[3], mo, 0);
      } else {
        var add = (wd - today.getDay() + 7) % 7;
        if (m[1] && /^next$/i.test(m[1]) && add === 0) add = 7;
        dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + add);
      }
      s = s.replace(m[0], " , ");
    }
    if (!dt && (m = s.match(/\b(today|tonight|tomorrow)\b/i))) {
      dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (/tomorrow/i.test(m[1]) ? 1 : 0)); s = s.replace(m[0], " , ");
    }
    if (!dt && (m = s.match(numRe)) && +m[2] <= 12 && +m[1] <= 31) {
      var yy = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : 0; dt = fromDM(+m[1], +m[2] - 1, yy); s = s.replace(m[0], " , ");
    }
    if (!dt && (m = s.match(/\b(sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)\b/i))) { dayOnly = "Every " + cap(m[1].toLowerCase().replace(/s$/, "")); s = s.replace(m[0], " , "); }
    if (dt && !isNaN(dt)) out.date = fmtDate(dt, dt.getFullYear() !== today.getFullYear());
    else if (dayOnly) out.date = dayOnly;
    // title: what is left
    var t = s.replace(/\b(?:join us(?: for)?|you are (?:invited|welcome)(?: to)?|invitation to|come for|please come|we invite you to|it'?s|there(?:'s| is| will be)|holding|hold|we are having|we're having|make a|create a|design a|flyer for|flier for|graphic for|graphics for|poster for|banner for|a flyer|a flier|a graphic|a poster|flyer|flier|poster|graphic|graphics|banner)\b/gi, " ")
      .replace(/\b(?:on|at|by|from|this|next|coming|with)\s*(?=[,;.]|$)/gi, " ")
      .replace(/\s*[,;.]\s*/g, " , ").replace(/(?:\s*,\s*)+/g, " , ").replace(/^\s*,\s*|\s*,\s*$/g, "").trim();
    var parts = t.split(/\s*,\s*/).filter(function (p) { return p && !/^(?:on|at|by|from|this|next|and|the|for|to|a|an|is|of)$/i.test(p); });
    var title = (parts[0] || "").replace(/^(?:the|a|an|our)\s+/i, "").replace(/\s+(?:on|at|by|from|this|next|and|for|to|is|of|with)$/i, "").trim();
    if (!title && out.theme) { title = out.theme; out.theme = ""; }
    out.title = titleCase(title || "Special Service");
    if (parts.length > 1 && !out.extra) out.extra = parts.slice(1).join(", ").replace(/^./, function (c) { return c.toUpperCase(); }).slice(0, 80);
    if (out.theme) out.theme = /[a-z]/.test(out.theme) && out.theme === out.theme.toLowerCase() ? titleCase(out.theme) : out.theme;
    out.category = pickCategory(out.title, out.theme, input);
    return out;
  }
  var api = { parse: parse, pickCategory: pickCategory, CATS: CATS, titleCase: titleCase };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RLWParse = api;
})(this);
