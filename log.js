// ============================================================
//  آمار بازدید — CUSTOMER ACTIVITY LOG (owner approved 2026-11-04)
//  Collects a few anonymous events (TYPES below) and sends them in small batches to the
//  Apps Script web app (SHOP.logApi, action "logEvent"), which writes them to the «log» tab.
//  No names, numbers, cookies or IP. A random id per browser tab (sessionStorage) groups the
//  events of one visit. Never logs on localhost / file: / bots / Do Not Track / Global Privacy
//  Control. Test only: on localhost, ?logdebug=1 prints the batches to console.log instead.
//  Load after products.js. Pages call logEvent(type, data) (through track() in app.js).
//  ES2017 only (old phones).
// ============================================================
(function () {
  var TYPES = ["view", "search", "category", "cart_add", "cart_dec", "cart_remove", "cart_clear", "cart_open",
    "whatsapp", "instagram", "phone", "no_results", "load_error"];
  var FIELDS = ["id", "cat", "q", "qty", "from", "why"];   // the only data fields a hook may pass
  var NOW = ["whatsapp", "instagram", "phone"];             // the visitor is leaving: send at once
  var DEBOUNCED = ["search", "no_results"];                 // logged when typing pauses; empty q cancels
  var BATCH_MAX = 10;          // send at once when this many events wait
  var FLUSH_MS = 4000;         // otherwise send this long after the first waiting event
  var PAGE_MAX = 60;           // events per page load at most
  var SEARCH_MS = 1500;        // a search is logged when typing pauses this long
  var SEARCH_MAX = 40;         // characters of a search word kept
  var SID_KEY = "bargin-log-sid";

  var host = location.hostname;
  var local = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/.test(host) || /\.local$/.test(host);
  var debug = local && /[?&]logdebug=1(&|$)/.test(location.search);

  function blocked() {
    if (debug) return false;
    if (typeof SHOP === "undefined" || !SHOP.logApi) return true;
    if (location.protocol !== "https:" && location.protocol !== "http:") return true;
    if (local) return true;
    var n = navigator;
    if (n.webdriver) return true;
    if (/bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|embedly|bingpreview/i.test(n.userAgent || "")) return true;
    var dnt = n.doNotTrack || window.doNotTrack || n.msDoNotTrack;
    if (dnt === "1" || dnt === "yes") return true;
    if (n.globalPrivacyControl === true) return true;
    return false;
  }

  var off = blocked();
  var queue = [];
  var sent = 0;
  var timer = 0;
  var waiting = {};   // debounced type -> {q, timer}
  var lastQ = {};     // debounced type -> last logged text
  var sourceDone = false;
  var sid = "";

  function randomId() {
    var out = "";
    var abc = "0123456789abcdefghijklmnopqrstuvwxyz";
    try {
      var a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      for (var i = 0; i < 16; i++) out += abc.charAt(a[i] % 36);
    } catch (e) {
      for (var j = 0; j < 16; j++) out += abc.charAt(Math.floor(Math.random() * 36));
    }
    return out;
  }

  function sessionId() {
    if (sid) return sid;
    try { sid = sessionStorage.getItem(SID_KEY) || ""; } catch (e) { sid = ""; }
    if (!/^[0-9a-z]{16}$/.test(sid)) {
      sid = randomId();
      try { sessionStorage.setItem(SID_KEY, sid); } catch (e) { /* private mode: one id per page */ }
    }
    return sid;
  }

  function pageName() {
    return /product\.html$/.test(location.pathname) ? "product" : "home";
  }

  function device() {
    try { return window.matchMedia("(max-width: 767px)").matches ? "phone" : "computer"; } catch (e) { return ""; }
  }

  // the site the visitor came from (host only, e.g. "instagram.com"), on the first view only
  function source() {
    if (sourceDone) return "";
    sourceDone = true;
    try {
      if (!document.referrer) return "";
      var h = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, "").replace(/^l\./, "");
      return h && h !== host ? h.slice(0, 60) : "";
    } catch (e) { return ""; }
  }

  function cleanText(s) {
    return String(s === undefined || s === null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
  }

  function send(events) {
    if (!events.length) return;
    var body = JSON.stringify({ action: "logEvent", data: { sid: sessionId(), events: events } });
    if (debug) {
      console.log("[bargin-log] " + body);
      return;
    }
    var url = SHOP.logApi;
    var hidden = document.visibilityState === "hidden";
    // leaving the page: sendBeacon survives the unload. Otherwise fetch (no cookies). Both are
    // text/plain, so the browser sends no CORS preflight.
    if (hidden && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(url, body)) return; } catch (e) { /* try fetch */ }
    }
    try {
      fetch(url, {
        method: "POST", body: body, mode: "no-cors", credentials: "omit", keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
      }).catch(function () { /* best effort only */ });
    } catch (e) {
      try { if (navigator.sendBeacon) navigator.sendBeacon(url, body); } catch (err) { /* give up */ }
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = 0;
    var events = queue;
    queue = [];
    send(events);
  }

  function push(type, data) {
    if (off || sent >= PAGE_MAX || TYPES.indexOf(type) < 0) return;
    var ev = { type: type, page: pageName(), dev: device() };
    data = data || {};
    FIELDS.forEach(function (k) {
      if (data[k] === undefined || data[k] === null || data[k] === "") return;
      ev[k] = k === "qty" ? Math.max(0, Math.min(999, Math.floor(Number(data[k]) || 0))) : cleanText(data[k]);
    });
    if (type === "view") {
      var src = source();
      if (src) ev.src = src;
    }
    sent++;
    queue.push(ev);
    if (NOW.indexOf(type) >= 0 || queue.length >= BATCH_MAX) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }

  function pushWaiting(type) {
    var w = waiting[type];
    if (!w) return;
    clearTimeout(w.timer);
    delete waiting[type];
    if (w.q.length < 2 || w.q === lastQ[type]) return;
    lastQ[type] = w.q;
    push(type, { q: w.q });
  }

  // the one function the pages call. Never throws.
  window.logEvent = function (type, data) {
    try {
      if (off) return;
      if (DEBOUNCED.indexOf(type) >= 0) {
        if (waiting[type]) clearTimeout(waiting[type].timer);
        delete waiting[type];
        var q = cleanText(data && data.q);
        if (!q) return;
        waiting[type] = { q: q, timer: setTimeout(function () { pushWaiting(type); }, SEARCH_MS) };
        return;
      }
      push(type, data);
    } catch (e) { /* logging must never break the shop */ }
  };

  // send what is waiting when the visitor leaves or switches away
  function leave() {
    try {
      DEBOUNCED.forEach(pushWaiting);
      flush();
    } catch (e) { /* nothing */ }
  }
  if (!off) {
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") leave();
    });
  }
  // for tests (?logdebug=1): send now
  window.logFlush = leave;
})();
