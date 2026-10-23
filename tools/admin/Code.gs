// Bargin product admin API (Google Apps Script). Bind this project to the products Google Sheet.
// Login (owner decision 2026-10-23): a one-time code sent by email. The admin page (admin/index.html)
// asks for an email address and a code (requestCode); if the address is on ALLOWED_EMAILS the script emails a
// 6-digit code to THAT list entry only, the person types it (verifyCode) and gets a random session token
// that remembers the email. An address that is not on the list gets the same answer but no mail, so the
// page never reveals who is allowed. Every other action needs that token. No Google sign-in,
// no OAuth client, no ID tokens.
// Rules: codes and sessions are stored hashed (CacheService), a code lives 10 minutes, allows 5 tries and
// works once; sends are capped (60 s apart, 10 per hour, 30 per day, shared by all addresses); a session lasts 1 hour idle and
// 6 hours at most; the session is checked in ONE place (handleRequest_) before every sheet action;
// read-modify-write runs under LockService and fails closed. Codes and tokens are never logged.
// The pure functions (validateRows, buildCsv, handleRequest_ and the cell helpers) make no Apps Script
// calls at load time, so tools/admin/test.mjs can run them in Node with stubbed services.
// Style: ES2017 only, like the site (no newer syntax or methods).

// The people who may log in (owner decision 2026-10-23). All of them get FULL admin access.
// Lowercase only. To add or remove someone: edit this list and deploy a new version.
// The code is mailed to the list entry that matches, never to the raw text of the request.
var ALLOWED_EMAILS = ['arman.niaruhi@gmail.com', 'zeinamkia023@gmail.com'];
var MAX_EMAIL_LENGTH = 254;
var FAKE_SEND_DELAY_MS = 700;    // an unknown address waits about as long as a real mail send takes

// Actions that need no session: ask for a code, send the code, log out.
var PUBLIC_ACTIONS = ['requestCode', 'verifyCode', 'logout'];
// Actions that need a valid session (checked once, in handleRequest_).
var PROTECTED_ACTIONS = ['getProducts', 'saveProduct', 'deleteProduct', 'publishCsv'];

// Limits checked before anything else happens.
var MAX_BODY = 200000;   // characters in the request body

// Code and session rules.
var CODE_LENGTH = 6;
var CODE_TTL_S = 600;            // a code works for 10 minutes
var CODE_MAX_TRIES = 5;          // wrong tries per code
var COOLDOWN_MS = 60 * 1000;     // minimum time between two sends
var HOUR_MS = 3600 * 1000;
var DAY_MS = 24 * HOUR_MS;
var MAX_PER_HOUR = 10;
var MAX_PER_DAY = 30;
var SESSION_IDLE_MS = HOUR_MS;       // logged out after 1 hour without use
var SESSION_MAX_MS = 6 * HOUR_MS;    // and after 6 hours whatever happens (CacheService's own maximum)
var LOCK_WAIT_MS = 10000;

// The CSV columns, in this order (same as data/products.csv).
var HEADER = ['id', 'name', 'category', 'price', 'unit', 'serves', 'short', 'details', 'recipe', 'images', 'soldOut'];

// Line ending between CSV records: CRLF, like data/products.csv (owner's choice, 2026-10-23).
var EOL = '\r\n';

// Persian texts shown to the owner, in one place.
// TODO: bargin-content to review the wording.
var MSG = {
  pageTitle: 'مدیریت محصولات برگین',
  noSession: 'نشستت تموم شده. دوباره وارد شو.',
  mailSubject: 'کد ورود برگین: {code}',
  mailBody: 'این کد ورود به صفحه‌ی مدیریت برگینه. ده دقیقه اعتبار داره و فقط یک بار کار می‌کنه.\nاگه خودت درخواستش نکردی، به این ایمیل کاری نداشته باش.',
  missingColumn: 'ستون «{name}» توی شیت پیدا نشد.',
  missingId: 'شناسه (id) خالیه.',
  missingName: 'اسم (name) خالیه.',
  missingCategory: 'دسته‌بندی (category) خالیه.',
  missingPrice: 'قیمت خالیه.',
  badPrice: 'قیمت باید فقط عدد باشه: «{value}»',
  badId: 'شناسه باید انگلیسی و بدون فاصله باشه: «{value}»',
  duplicateId: 'شناسه تکراری: «{value}» (سطر {first} هم همینه).',
  badSoldOut: 'ناموجود (soldOut) باید yes یا no باشه، یا خالی: «{value}»',
  notFound: 'این محصول توی شیت پیدا نشد: «{value}». شاید قبلاً پاکش کرده باشی. صفحه رو دوباره بارگذاری کن.',
  blankItem: 'هیچ اطلاعاتی برای ذخیره داده نشده.',
  noDeleteId: 'شناسه‌ای برای حذف داده نشده.',
  manyIds: 'چند سطر با شناسه «{value}» هست. اول توی شیت درستش کن.',
  sheetProblems: 'اول مشکل‌های شیت رو درست کن، بعد ذخیره کن.'
};

var PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

// Fills {placeholders} in a message.
function fill(template, vars) {
  var s = template;
  Object.keys(vars).forEach(function (k) {
    s = s.split('{' + k + '}').join(String(vars[k]));
  });
  return s;
}

// Persian and Arabic digits → ASCII digits.
function toAsciiDigits(s) {
  return s.replace(/[۰-۹٠-٩]/g, function (d) {
    var i = PERSIAN_DIGITS.indexOf(d);
    if (i < 0) i = ARABIC_DIGITS.indexOf(d);
    return String(i);
  });
}

// A cell as text, trimmed. Empty cells (null, undefined, blank) give ''.
function cellText(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// A row where every column is empty is skipped.
function isBlankRow(r) {
  return HEADER.every(function (h) { return cellText(r[h]) === ''; });
}

// The rows that count as products (blank rows left out).
function productRows(rows) {
  return rows.filter(function (r) { return !isBlankRow(r); });
}

// One CSV field: quoted only when it has a comma, double quote, CR or LF.
function csvField(v) {
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// Checks the rows. Each row is an object keyed by HEADER names, with its
// sheet row number in `row`. Returns a list of {row, message}, in row order.
function validateRows(rows) {
  var issues = [];
  var seen = Object.create(null);
  rows.forEach(function (r) {
    if (isBlankRow(r)) return;
    var row = r.row;
    function add(message) { issues.push({ row: row, message: message }); }

    var id = cellText(r.id);
    if (!id) {
      add(MSG.missingId);
    } else {
      if (/\s/.test(id) || /[^\x00-\x7F]/.test(id)) add(fill(MSG.badId, { value: id }));
      if (seen[id] !== undefined) add(fill(MSG.duplicateId, { value: id, first: seen[id] }));
      else seen[id] = row;
    }

    if (!cellText(r.name)) add(MSG.missingName);
    if (!cellText(r.category)) add(MSG.missingCategory);

    var price = cellText(r.price);
    if (!price) add(MSG.missingPrice);
    else if (!/^\d+$/.test(toAsciiDigits(price).replace(/,/g, ''))) add(fill(MSG.badPrice, { value: price }));

    var soldOut = cellText(r.soldOut).toLowerCase();
    if (soldOut && soldOut !== 'yes' && soldOut !== 'no') add(fill(MSG.badSoldOut, { value: cellText(r.soldOut) }));
  });
  return issues;
}

// Checks one product before it is saved (pure: no sheet calls).
// `rows` are the sheet rows ({row, id, ...}). `item` is the product from the form
// (keys in HEADER). `originalId` is the id the product had before the edit, or ''
// for a new product. Returns {issues, target, row}: `target` is the sheet row to
// update (null = append), `row` is the sheet row the product will be written to.
function planSave(rows, item, originalId) {
  var clean = {};
  HEADER.forEach(function (h) { clean[h] = cellText(item[h]); });
  var from = cellText(originalId);

  var target = null;
  if (from) {
    rows.forEach(function (r) {
      if (target === null && !isBlankRow(r) && cellText(r.id) === from) target = r.row;
    });
    if (target === null) {
      return { issues: [{ row: null, message: fill(MSG.notFound, { value: from }) }], target: null, row: null };
    }
  }

  var nextRow = rows.reduce(function (max, r) { return Math.max(max, r.row); }, 1) + 1;
  var row = target || nextRow;
  clean.row = row;

  var issues = validateRows([clean]);
  if (isBlankRow(clean)) issues.push({ row: row, message: MSG.blankItem });

  // Same id on another row is a duplicate (validateRows only sees this one row).
  if (clean.id) {
    for (var i = 0; i < rows.length; i++) {
      var other = rows[i];
      if (other.row !== target && !isBlankRow(other) && cellText(other.id) === clean.id) {
        issues.push({ row: row, message: fill(MSG.duplicateId, { value: clean.id, first: other.row }) });
        break;
      }
    }
  }
  return { issues: issues, target: target, row: row };
}

// Builds the CSV text: UTF-8 BOM, the header, then one line per product.
// Empty soldOut becomes "no". Price is written as typed. `eol` is the line
// ending for records and for line breaks inside a cell (default CRLF, like data/products.csv).
function buildCsv(rows, eol) {
  eol = eol || '\r\n';
  var lines = [HEADER.join(',')];
  productRows(rows).forEach(function (r) {
    lines.push(HEADER.map(function (h) {
      var v = cellText(r[h]).replace(/\r\n?|\n/g, eol);
      if (h === 'soldOut') v = v.toLowerCase() === 'yes' ? 'yes' : 'no';
      return csvField(v);
    }).join(','));
  });
  return '﻿' + lines.join(eol) + eol;
}

// ---- Request handling (pure; services are passed in `deps`) ----

// Reads the request body and runs one allowed action. Returns a plain object: {ok:true, data} or
// {ok:false, error}. error: bad_request, unknown_action, NO_SESSION, BUSY, server, or a login code from
// the public actions (COOLDOWN, LIMIT_HOUR, LIMIT_DAY, MAIL_FAIL, BAD_CODE, CODE_EXPIRED, TOO_MANY).
// deps: {publicActions: {name: fn(data)}, actions: {name: fn(data)}, requireSession: fn(token) -> bool}.
// THE ONE PLACE where a session is required: no protected action runs unless requireSession says yes.
function handleRequest_(body, deps) {
  try {
    if (typeof body !== 'string' || !body || body.length > MAX_BODY) return { ok: false, error: 'bad_request' };
    var req;
    try { req = JSON.parse(body); } catch (err) { return { ok: false, error: 'bad_request' }; }
    if (!req || typeof req !== 'object' || Array.isArray(req)) return { ok: false, error: 'bad_request' };
    if (req.data !== undefined && (req.data === null || typeof req.data !== 'object' || Array.isArray(req.data))) return { ok: false, error: 'bad_request' };
    if (req.session !== undefined && typeof req.session !== 'string') return { ok: false, error: 'bad_request' };
    var action = req.action;
    var data = req.data || {};

    if (typeof action === 'string' && PUBLIC_ACTIONS.indexOf(action) >= 0) {
      var pub = deps.publicActions[action];
      if (typeof pub !== 'function') return { ok: false, error: 'unknown_action' };
      return pub(data, req.session || '');
    }
    if (typeof action !== 'string' || PROTECTED_ACTIONS.indexOf(action) < 0) return { ok: false, error: 'unknown_action' };

    if (deps.requireSession(req.session || '') !== true) return { ok: false, error: 'NO_SESSION' };
    var fn = deps.actions[action];
    if (typeof fn !== 'function') return { ok: false, error: 'unknown_action' };
    return { ok: true, data: fn(data) };
  } catch (e) {
    return { ok: false, error: e && e.message === 'BUSY' ? 'BUSY' : 'server' };
  }
}

// ---- Login: codes, sessions, limits (Apps Script services; stubbed in the tests) ----

function nowMs_() { return Date.now(); }

// Bytes (signed, as Utilities gives them) → lowercase hex.
function toHex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}

function sha256Hex_(text) {
  return toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text));
}

// Compares two strings without stopping at the first difference.
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length === b.length ? 0 : 1;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Random hex from Utilities.getUuid() only. The version and variant characters of a UUID are fixed,
// so they are skipped. `count` hex characters.
function randomHex_(count) {
  var out = '';
  while (out.length < count) {
    var u = String(Utilities.getUuid()).replace(/-/g, '');
    out += u.slice(0, 12) + u.slice(13, 16) + u.slice(17);
  }
  return out.slice(0, count);
}

// A uniform 6-digit code by rejection sampling: 32 random bits, values from the uneven top are thrown away.
function randomCode_() {
  var limit = Math.floor(4294967296 / 1000000) * 1000000;
  for (var i = 0; i < 100; i++) {
    var v = parseInt(randomHex_(8), 16);
    if (v < limit) {
      var s = String(v % 1000000);
      while (s.length < CODE_LENGTH) s = '0' + s;
      return s;
    }
  }
  throw new Error('random');
}

// What the owner typed → 6 ASCII digits, or '' if it is not a code. Persian and Arabic digits are accepted.
function normalizeCode_(input) {
  if (typeof input !== 'string' || input.length > 40) return '';
  var s = toAsciiDigits(input).replace(/[\s‌‏‎٬,\-]/g, '');
  return /^[0-9]{6}$/.test(s) ? s : '';
}

// Runs fn while holding the script lock. No lock within LOCK_WAIT_MS = fail closed (throws BUSY).
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new Error('BUSY');
  try { return fn(); } finally { lock.releaseLock(); }
}

function cache_() { return CacheService.getScriptCache(); }

// What was typed as the email → trimmed lowercase address, or '' if it is not an email-looking string.
function normalizeEmail_(input) {
  if (typeof input !== 'string' || input.length > MAX_EMAIL_LENGTH + 40) return '';
  var s = input.trim().toLowerCase();
  if (!s || s.length > MAX_EMAIL_LENGTH) return '';
  return /^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$/.test(s) ? s : '';
}

// The ALLOWED_EMAILS entry equal to this address, or '' (the entry itself is returned, not the input).
function allowedEntry_(email) {
  for (var i = 0; i < ALLOWED_EMAILS.length; i++) {
    if (typeof email === 'string' && email !== '' && safeEqual_(ALLOWED_EMAILS[i], email)) return ALLOWED_EMAILS[i];
  }
  return '';
}

// requestCode: data = {email}. A malformed email is refused at once (bad_request). Otherwise the answer has the
// same shape for every address: {ok:true, data:{challenge, cooldown, expiresIn}}. Only if the address is on
// ALLOWED_EMAILS a code is mailed (to that list entry only); for any other address nothing is mailed and the
// challenge is a decoy that never verifies. Caps and cooldown are shared by all addresses and also hit
// unknown ones (the cooldown time is kept in script properties, so a cache reset does not lift it); only real
// sends go into the hour/day send log. A new code cancels the old one of the same address.
// Returns {ok:true, data} or {ok:false, error, retryAfter?}.
function requestCode(data) {
  var email = normalizeEmail_(data && data.email);
  if (!email) return { ok: false, error: 'bad_request' };
  var entry = allowedEntry_(email);
  var out = withLock_(function () {
    var now = nowMs_();
    var props = PropertiesService.getScriptProperties();
    var log = [];
    // Key renamed from 'sendLog' on 2026-10-23 to reset the counter: the old log also counted failed sends.
    try { log = JSON.parse(props.getProperty('sendLog2') || '[]'); } catch (err) { log = []; }
    if (!Array.isArray(log)) log = [];
    log = log.filter(function (t) { return typeof t === 'number' && now - t < DAY_MS && t <= now + 60000; });
    var lastAny = parseInt(props.getProperty('lastReq') || '0', 10);
    if (!(lastAny > 0) || lastAny > now + 60000) lastAny = 0;
    var last = Math.max(lastAny, log.length ? Math.max.apply(null, log) : 0);
    if (last && now - last < COOLDOWN_MS) return { ok: false, error: 'COOLDOWN', retryAfter: Math.ceil((COOLDOWN_MS - (now - last)) / 1000) };
    var inHour = log.filter(function (t) { return now - t < HOUR_MS; });
    if (inHour.length >= MAX_PER_HOUR) return { ok: false, error: 'LIMIT_HOUR', retryAfter: Math.ceil((HOUR_MS - (now - Math.min.apply(null, inHour))) / 1000) };
    if (log.length >= MAX_PER_DAY) return { ok: false, error: 'LIMIT_DAY', retryAfter: Math.ceil((DAY_MS - (now - Math.min.apply(null, log))) / 1000) };

    var code = randomCode_();
    var challenge = randomHex_(32);
    var c = cache_();
    var key = 'ch_' + sha256Hex_(challenge);
    var activeKey = entry ? 'active_' + sha256Hex_(entry) : '';
    if (entry) {
      var oldKey = c.get(activeKey);
      if (oldKey) c.remove(oldKey);
    }
    // The challenge remembers its address ('' for a decoy). A decoy holds a code nobody receives.
    c.put(key, JSON.stringify({ h: sha256Hex_(challenge + ':' + code), tries: 0, exp: now + CODE_TTL_S * 1000, e: entry }), CODE_TTL_S);
    var shape = { ok: true, data: { challenge: challenge, cooldown: COOLDOWN_MS / 1000, expiresIn: CODE_TTL_S } };
    if (!entry) {
      props.setProperty('lastReq', String(now));   // starts the cooldown, not the hour/day log
      shape.decoy = true;
      return shape;
    }
    c.put(activeKey, key, CODE_TTL_S);
    try {
      MailApp.sendEmail(entry, MSG.mailSubject.replace('{code}', code), MSG.mailBody);
      log.push(now);   // counted only after the mail was really sent: a failed send does not count
      props.setProperty('sendLog2', JSON.stringify(log));
      props.setProperty('lastReq', String(now));
    } catch (err) {
      c.remove(key);
      c.remove(activeKey);
      return { ok: false, error: 'MAIL_FAIL' };
    }
    return shape;
  });
  if (out.decoy) {
    delete out.decoy;
    Utilities.sleep(FAKE_SEND_DELAY_MS);   // roughly the time a real send takes
  }
  return out;
}

// verifyCode: check the typed code for this challenge. Hashed, 5 tries, 10 minutes, single use,
// constant-time compare. On success a session token is returned (stored hashed).
function verifyCode(data) {
  var challenge = data && typeof data.challenge === 'string' ? data.challenge : '';
  if (!/^[0-9a-f]{32}$/.test(challenge)) return { ok: false, error: 'CODE_EXPIRED' };
  var code = normalizeCode_(data.code);
  if (!code) return { ok: false, error: 'BAD_CODE' };
  return withLock_(function () {
    var now = nowMs_();
    var c = cache_();
    var key = 'ch_' + sha256Hex_(challenge);
    var raw = c.get(key);
    var st = null;
    try { st = raw ? JSON.parse(raw) : null; } catch (err) { st = null; }
    if (!st || typeof st.h !== 'string' || !(st.exp > now)) { c.remove(key); return { ok: false, error: 'CODE_EXPIRED' }; }
    if (st.tries >= CODE_MAX_TRIES) { c.remove(key); return { ok: false, error: 'TOO_MANY' }; }
    st.tries += 1;   // counted before the compare
    var good = safeEqual_(st.h, sha256Hex_(challenge + ':' + code));
    if (!good) {
      if (st.tries >= CODE_MAX_TRIES) { c.remove(key); return { ok: false, error: 'TOO_MANY' }; }
      c.put(key, JSON.stringify(st), Math.max(1, Math.ceil((st.exp - now) / 1000)));
      return { ok: false, error: 'BAD_CODE', triesLeft: CODE_MAX_TRIES - st.tries };
    }
    var who = allowedEntry_(st.e);   // a decoy challenge has no address, so it never logs in
    if (!who) { c.remove(key); return { ok: false, error: 'BAD_CODE', triesLeft: 0 }; }
    c.remove(key);   // single use
    c.remove('active_' + sha256Hex_(who));
    var token = randomHex_(64);
    c.put('ss_' + sha256Hex_(token), JSON.stringify({ c: now, l: now, e: who }), SESSION_IDLE_MS / 1000);
    return { ok: true, data: { session: token, idle: SESSION_IDLE_MS / 1000, max: SESSION_MAX_MS / 1000 } };
  });
}

// requireSession_: true only for a live session (under 1 hour idle and under 6 hours old) whose email is on
// ALLOWED_EMAILS (so removing someone from the list ends their session at once). Each good check renews the
// idle time (sliding). On success sessionEmail_ is set for the second guard. Anything wrong = false.
function requireSession_(token) {
  sessionEmail_ = '';
  try {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
    var now = nowMs_();
    var c = cache_();
    var key = 'ss_' + sha256Hex_(token);
    var raw = c.get(key);
    if (!raw) return false;
    var s = JSON.parse(raw);
    if (!s || !allowedEntry_(s.e)) { c.remove(key); return false; }
    if (!(now - s.c < SESSION_MAX_MS) || !(now - s.l < SESSION_IDLE_MS) || now < s.c) { c.remove(key); return false; }
    s.l = now;
    var ttl = Math.min(SESSION_IDLE_MS, SESSION_MAX_MS - (now - s.c)) / 1000;
    c.put(key, JSON.stringify(s), Math.max(1, Math.floor(ttl)));
    sessionEmail_ = allowedEntry_(s.e);
    return sessionEmail_ !== '';
  } catch (e) {
    return false;
  }
}

// logout: forget the session on the server. Always answers ok.
function logout(data, token) {
  try {
    if (typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)) cache_().remove('ss_' + sha256Hex_(token));
  } catch (e) { /* nothing to do */ }
  return { ok: true, data: {} };
}

// Set while doPost runs a protected action: the email of the checked session. The sheet functions check it
// again (second guard): it must still be on ALLOWED_EMAILS.
var sessionEmail_ = '';

function assertSession_() {
  if (allowedEntry_(sessionEmail_) === '') throw new Error(MSG.noSession);
}

// The API: the admin page sends POST {action, data, session} as text/plain JSON.
function doPost(e) {
  var body = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  sessionEmail_ = '';
  var out = handleRequest_(body, {
    publicActions: {
      requestCode: function (d) { return requestCode(d); },
      verifyCode: function (d) { return verifyCode(d); },
      logout: function (d, token) { return logout(d, token); }
    },
    requireSession: function (token) {
      return requireSession_(token);
    },
    actions: {
      getProducts: function () { return getProducts(); },
      saveProduct: function (d) { return withLock_(function () { return saveProduct(d.item, d.originalId); }); },
      deleteProduct: function (d) { return withLock_(function () { return deleteProduct(d.id); }); },
      publishCsv: function () { return publishCsv(); }
    }
  });
  sessionEmail_ = '';
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Opening the link in a browser: only harmless JSON, no page and no data.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'bargin-admin' })).setMimeType(ContentService.MimeType.JSON);
}

// Run this ONCE in the Apps Script editor (Run → authorizeOnce → Review permissions → Advanced →
// Go to project → Allow). It only touches the services the web app needs, so Google asks for the
// permissions now instead of failing on the first request. It sends nothing.
function authorizeOnce() {
  SpreadsheetApp.getActiveSpreadsheet().getName();
  MailApp.getRemainingDailyQuota();
  return 'OK';
}

// Reads the first sheet. Returns {rows, issues}. Row 1 is the header; the
// header can have the columns in any order, but all of them must be there.
function productSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function readSheetRows() {
  var values = productSheet().getDataRange().getValues();
  var issues = [];
  if (!values.length) return { rows: [], issues: issues };
  var head = values[0].map(function (h) { return cellText(h); });
  var index = {};
  HEADER.forEach(function (name) {
    index[name] = head.indexOf(name);
    if (index[name] < 0) issues.push({ row: 1, message: fill(MSG.missingColumn, { name: name }) });
  });
  var rows = values.slice(1).map(function (v, k) {
    var o = { row: k + 2 };
    HEADER.forEach(function (name) {
      o[name] = index[name] < 0 ? '' : cellText(v[index[name]]);
    });
    return o;
  });
  return { rows: rows, issues: issues };
}

// Action getProducts: the sheet rows and every issue found.
function getProducts() {
  assertSession_();
  var data = readSheetRows();
  if (data.issues.length) return { rows: data.rows, issues: data.issues };
  return { rows: data.rows, issues: validateRows(data.rows) };
}

// Called by the page on «ساخت فایل». Blocked when there are issues.
// Returns {ok:true, csv, count} or {ok:false, issues}.
function publishCsv() {
  assertSession_();
  var data = getProducts();
  if (data.issues.length) return { ok: false, issues: data.issues };
  return { ok: true, csv: buildCsv(data.rows, EOL), count: productRows(data.rows).length };
}

// Called by the page on «ذخیره». `item` has the 11 columns (HEADER keys) as text.
// `originalId` is the id before the edit ('' or missing for a new product).
// An existing id is updated in place (the id can be changed too); a new id is appended.
// Columns that are not in HEADER keep their old value. Returns {ok:true, row, updated}
// or {ok:false, issues} (issues have row numbers, same as the checks).
function saveProduct(item, originalId) {
  assertSession_();
  var sheet = productSheet();
  var data = readSheetRows();
  if (data.issues.length) return { ok: false, issues: data.issues };

  var plan = planSave(data.rows, item || {}, originalId);
  if (plan.issues.length) return { ok: false, issues: plan.issues };

  var width = sheet.getLastColumn();
  var head = sheet.getRange(1, 1, 1, width).getValues()[0].map(cellText);
  var values = plan.target
    ? sheet.getRange(plan.target, 1, 1, width).getValues()[0]
    : head.map(function () { return ''; });

  HEADER.forEach(function (h) {
    var v = cellText(item[h]);
    if (h === 'soldOut') v = v.toLowerCase() === 'yes' ? 'yes' : 'no';
    values[head.indexOf(h)] = v;
  });

  sheet.getRange(plan.row, 1, 1, width).setValues([values]);
  return { ok: true, row: plan.row, updated: !!plan.target };
}

// Called by the page on «حذف» (after the owner confirmed). Deletes the sheet row with this id.
// Returns {ok:true, row} or {ok:false, message}.
function deleteProduct(id) {
  assertSession_();
  var key = cellText(id);
  if (!key) return { ok: false, message: MSG.noDeleteId };
  var data = readSheetRows();
  if (data.issues.length) return { ok: false, message: MSG.sheetProblems };
  var hits = data.rows.filter(function (r) { return !isBlankRow(r) && cellText(r.id) === key; });
  if (!hits.length) return { ok: false, message: fill(MSG.notFound, { value: key }) };
  if (hits.length > 1) return { ok: false, message: fill(MSG.manyIds, { value: key }) };
  productSheet().deleteRow(hits[0].row);
  return { ok: true, row: hits[0].row };
}
