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
// Customer activity log (owner approved 2026-11-04): the public action logEvent writes anonymous events
// from log.js (view, search, category, cart_add/dec/remove/clear, cart_open, whatsapp, instagram, phone,
// no_results, load_error) to the «log» tab (made by setupLog,
// always the LAST tab, so the products stay the first sheet). Whitelisted fields only, formula-escaped,
// rate-limited in CacheService, at most LOG_MAX_ROWS rows (when full, new events are dropped; nothing is
// ever deleted automatically). It never needs a session and never reads the products.
// Buys and sells (owner approved 2026-11-07): the protected actions getLedger, saveLedgerRow and deleteLedgerRow
// keep a «خرید و فروش» tab (made by setupLedger, always the 2ND tab, never first, never published). One row per
// buy or sell: Persian date, type, product (id + name taken from the products tab), quantity + unit, unit price in
// toman (plus what was typed), the row's own total (qty × unit price). Rows are found by a random id, never by
// row number. No sums or totals over rows anywhere.
// Customers (owner approved 2026-11-07): every SALE has a customer from the private «مشتری‌ها» tab (made by
// setupCustomers, right after «خرید و فروش», never first, never published) and a channel («سایت» / «حضوری»).
// Customers get a whole-number id (1, 2, 3…) that is never given out twice, even after a row is deleted. Names
// are English letters only, stored in lowercase. A new customer is added by saveLedgerRow in the same lock as the
// sale; a name that is already on the list (case ignored) reuses that customer.
// Product versions (owner approved 2026-11-07, SCD type 2): a private «تاریخچه محصولات» tab (made by setupVersioning,
// after «مشتری‌ها», before «log», never first, never published) keeps one row per VERSION of a product. A new version
// starts when name, price, unit or soldOut changes (category changes only update the category on every row of that
// product). The products tab is never changed by this: it is compared with the current history row. Admin saves
// and deletes are captured at once; hand edits in the Sheet are captured by an hourly trigger (hourlyVersioning) and
// before every product save and ledger save. Each ledger line stores the productVersion valid on its sale date.
// Style: ES2017 only, like the site (no newer syntax or methods).

// The people who may log in (owner decision 2026-10-23). All of them get FULL admin access.
// Lowercase only. To add or remove someone: edit this list and deploy a new version.
// The code is mailed to the list entry that matches, never to the raw text of the request.
var ALLOWED_EMAILS = ['arman.niaruhi@gmail.com', 'zeinabkia023@gmail.com'];
var MAX_EMAIL_LENGTH = 254;
var FAKE_SEND_DELAY_MS = 700;    // an unknown address waits about as long as a real mail send takes

// Actions that need no session: ask for a code, send the code, log out, write customer activity.
var PUBLIC_ACTIONS = ['requestCode', 'verifyCode', 'logout', 'logEvent'];
// Actions that need a valid session (checked once, in handleRequest_).
var PROTECTED_ACTIONS = ['getProducts', 'saveProduct', 'deleteProduct', 'publishCsv', 'getLedger', 'saveLedgerRow', 'deleteLedgerRow', 'saveLedgerOrder', 'deleteLedgerOrder', 'saveLedgerBuy', 'getReport'];
// (hourlyVersioning is NOT an action: it is only started by its time trigger.)

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
  sheetProblems: 'اول مشکل‌های شیت رو درست کن، بعد ذخیره کن.',
  // «خرید و فروش» (TODO: bargin-content to review)
  reportRange: 'بازه‌ی تاریخ درست نیست.',
  noLedger: 'تب «خرید و فروش» هنوز ساخته نشده. توی Apps Script یه بار تابع setupLedger رو اجرا کن.',
  ledgerFirst: 'تب «خرید و فروش» نباید اولین تب شیت باشه. یه بار تابع setupLedger رو اجرا کن تا درست بشه.',
  ledgerHeader: 'سطر اول تب «خرید و فروش» به‌هم ریخته. تابع setupLedger رو اجرا کن یا سرستون‌ها رو درست کن.',
  badDate: 'تاریخ درست نیست.',
  badType: 'نوع رو انتخاب کن: خرید یا فروش.',
  badProduct: 'یه محصول از لیست انتخاب کن.',
  goneProduct: 'این محصول دیگه توی لیست محصولات نیست. صفحه رو دوباره بارگذاری کن.',
  badQty: 'تعداد یا مقدار باید یه عدد بزرگ‌تر از صفر باشه (حداکثر دو رقم اعشار).',
  badQtyUnit: 'واحد تعداد رو انتخاب کن.',
  badLedgerPrice: 'قیمت هر واحد باید یه عدد بزرگ‌تر از صفر باشه (حداکثر سه رقم اعشار).',
  badPriceUnit: 'واحد قیمت رو انتخاب کن: هزار تومان یا میلیون تومان.',
  priceTooBig: 'قیمت خیلی بزرگه. یه بار دیگه چکش کن.',
  longParty: 'اسم خیلی بلنده (حداکثر ۶۰ حرف).',
  needOtherName: 'اسم محصول رو بنویس.',
  longOtherName: 'اسم محصول خیلی بلنده (حداکثر ۶۰ حرف).',
  longNote: 'توضیحات خیلی بلنده (حداکثر ۳۰۰ حرف).',
  longPack: 'وزن هر بسته خیلی بلنده (حداکثر ۲۰ حرف).',
  needLines: 'حداقل یه محصول با تعداد بنویس.',
  tooManyLines: 'یه سفارش حداکثر {n} تا خط می‌تونه داشته باشه.',
  orderNotFound: 'این سفارش پیدا نشد؛ شاید قبلاً پاکش کردی. لیست رو دوباره بارگذاری کن.',
  badOrder: 'سفارش درست نرسید. صفحه رو دوباره باز کن.',
  badBuyTotal: 'مبلغ کل باید یه عدد بزرگ‌تر از صفر باشه (حداکثر سه رقم اعشار).',
  buyNotSimple: 'این خرید جزو یه سفارش چندقلمیه یا خرید نیست؛ با فرم سفارش ویرایشش کن.',
  ledgerNotFound: 'این مورد پیدا نشد؛ شاید قبلاً پاکش کردی. لیست رو دوباره بارگذاری کن.',
  ledgerMany: 'چند سطر با همین شناسه هست. اول توی شیت درستش کن.',
  ledgerFull: 'جدول خرید و فروش پر شده ({n} سطر). اول چند سطر قدیمی رو توی شیت جابه‌جا کن.',
  // مشتری‌ها (TODO: bargin-content to review)
  noCustomers: 'تب «مشتری‌ها» هنوز ساخته نشده. توی Apps Script یه بار تابع setupCustomers رو اجرا کن.',
  customersFirst: 'تب «مشتری‌ها» نباید اولین تب شیت باشه. یه بار تابع setupCustomers رو اجرا کن تا درست بشه.',
  customersHeader: 'سطر اول تب «مشتری‌ها» به‌هم ریخته. تابع setupCustomers رو اجرا کن یا سرستون‌ها رو درست کن.',
  customersFull: 'لیست مشتری‌ها پر شده ({n} نفر).',
  needCustomer: 'مشتری رو انتخاب کن.',
  goneCustomer: 'این مشتری توی لیست مشتری‌ها پیدا نشد. صفحه رو دوباره بارگذاری کن.',
  needFirstName: 'اسم مشتری رو بنویس.',
  needLastName: 'فامیل مشتری رو بنویس.',
  longCustomerName: 'اسم و فامیل هر کدوم حداکثر ۳۰ حرف.',
  persianCustomerName: 'اسم و فامیل مشتری رو با حروف انگلیسی بنویس، مثلاً zahra ahmadi.',
  badCustomerName: 'توی اسم و فامیل فقط حروف انگلیسی، فاصله، - و \' قبوله.',
  badChannel: 'بگو فروش از کجا بود: سایت یا حضوری.',
  // تاریخچه محصولات (TODO: bargin-content to review)
  noHistory: 'تب «تاریخچه محصولات» هنوز ساخته نشده. توی Apps Script یه بار تابع setupVersioning رو اجرا کن.',
  historyFirst: 'تب «تاریخچه محصولات» نباید اولین تب شیت باشه. یه بار تابع setupVersioning رو اجرا کن.',
  historyHeader: 'سطر اول تب «تاریخچه محصولات» به‌هم ریخته. تابع setupVersioning رو اجرا کن یا سرستون‌ها رو درست کن.'
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

// Text for a cell written from the admin: never read as a formula by Sheets (a leading = + - @ gets an
// apostrophe in front; Sheets stores it as plain text and does not show or export the apostrophe).
function sheetText_(v) {
  var s = cellText(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
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
  return '\uFEFF' + lines.join(eol) + eol;
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

// ---- Customer activity log (log.js → «log» tab) ----

var LOG_SHEET = 'log';
var LOG_HEADER = ['time', 'session', 'event', 'page', 'product', 'category', 'search', 'qty', 'from', 'device', 'source', 'reason'];
var LOG_MAX_ROWS = 50000;        // owner 2026-11-04: keep every row; when full, new events are dropped
var LOG_MAX_BODY = 8000;         // characters in one logEvent request
var LOG_MAX_BATCH = 20;          // events in one request
var LOG_LOCK_MS = 1500;          // wait for the lock this long, then drop the batch (never blocks the admin)
var LOG_PER_SID_HOUR = 300;      // events per visitor id per hour
var LOG_PER_MINUTE = 600;        // events per minute, all visitors together
var LOG_PER_DAY = 20000;         // events per day, all visitors together
var LOG_TYPES = ['view', 'search', 'category', 'cart_add', 'cart_dec', 'cart_remove', 'cart_clear', 'cart_open',
  'whatsapp', 'instagram', 'phone', 'no_results', 'load_error'];
var LOG_SEARCH_TYPES = ['search', 'view', 'no_results'];   // the only events that keep a search word
var LOG_REASON = /^(http-[0-9]{3}|network|no-products|no-url)$/;   // load_error reasons
var LOG_PAGES = ['home', 'product'];
var LOG_FROM = ['card', 'product', 'bar', 'drawer', 'footer', 'fab'];
var LOG_DEVICES = ['phone', 'computer'];

// Text for a log cell: no control characters, single spaces, at most `max` characters, and never read as a
// formula by Sheets (a leading = + - @ gets an apostrophe in front, which Sheets does not show).
function logText_(v, max) {
  if (typeof v !== 'string') return '';
  var s = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// One event from log.js → a row (LOG_HEADER order without the time), or null if it is not allowed.
// Only whitelisted types and fields; everything else is dropped.
function logRow_(ev, sid) {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return null;
  if (LOG_TYPES.indexOf(ev.type) < 0) return null;
  var page = LOG_PAGES.indexOf(ev.page) >= 0 ? ev.page : '';
  var id = typeof ev.id === 'string' && /^[A-Za-z0-9_\-]{1,40}$/.test(ev.id) ? ev.id : '';
  var qty = typeof ev.qty === 'number' && isFinite(ev.qty) ? Math.max(0, Math.min(999, Math.floor(ev.qty))) : '';
  var from = LOG_FROM.indexOf(ev.from) >= 0 ? ev.from : '';
  var dev = LOG_DEVICES.indexOf(ev.dev) >= 0 ? ev.dev : '';
  var src = typeof ev.src === 'string' && /^[a-z0-9.\-]{1,60}$/.test(ev.src) ? ev.src : '';
  var q = LOG_SEARCH_TYPES.indexOf(ev.type) >= 0 ? logText_(ev.q, 40) : '';
  if ((ev.type === 'search' || ev.type === 'no_results') && !q) return null;
  var why = ev.type === 'load_error' && typeof ev.why === 'string' && LOG_REASON.test(ev.why) ? ev.why : '';
  return [sid, ev.type, page, id, logText_(ev.cat, 40), q, qty, from, dev, src, why];
}

// Pure part of logEvent: the request data → the rows to write ([] = nothing). Checks the visitor id and
// the batch size; bad events are skipped one by one.
function logRows_(data) {
  if (!data || typeof data !== 'object') return [];
  var sid = typeof data.sid === 'string' && /^[0-9a-z]{16}$/.test(data.sid) ? data.sid : '';
  if (!sid || !Array.isArray(data.events) || !data.events.length || data.events.length > LOG_MAX_BATCH) return [];
  var rows = [];
  data.events.forEach(function (ev) {
    var r = logRow_(ev, sid);
    if (r) rows.push(r);
  });
  return rows;
}

// Rate limits (CacheService counters; approximate on purpose, no lock): per visitor id per hour, all visitors
// per minute and per day. Returns how many of `n` events may be written now (0 = drop the batch).
function logAllowance_(sid, n) {
  var c = cache_();
  var now = nowMs_();
  var keys = [
    { k: 'lg_s_' + sid, max: LOG_PER_SID_HOUR, ttl: 3600 },
    { k: 'lg_m_' + Math.floor(now / 60000), max: LOG_PER_MINUTE, ttl: 120 },
    { k: 'lg_d_' + Math.floor(now / DAY_MS), max: LOG_PER_DAY, ttl: 21600 }
  ];
  var allow = n;
  keys.forEach(function (o) {
    o.used = parseInt(c.get(o.k) || '0', 10) || 0;
    allow = Math.min(allow, Math.max(0, o.max - o.used));
  });
  if (allow > 0) keys.forEach(function (o) { c.put(o.k, String(o.used + allow), o.ttl); });
  return allow;
}

// logEvent: data = {sid, events:[{type, page, id?, cat?, q?, qty?, from?, dev?, src?, why?}]}. Always answers
// {ok:true, data:{}} (it never tells a visitor whether something was written). Writes nothing when: the
// request is bad, the rate limits are hit, the «log» tab is missing, the tab already has LOG_MAX_ROWS
// rows (the 50,000 cap: new events are dropped, old rows are kept), or the lock is busy for 1.5 s.
function logEvent(data, body) {
  var done = { ok: true, data: {} };
  try {
    if (typeof body === 'string' && body.length > LOG_MAX_BODY) return done;
    var rows = logRows_(data);
    if (!rows.length) return done;
    var c = cache_();
    if (c.get('lg_full') === '1') return done;
    var allow = logAllowance_(rows[0][0], rows.length);
    if (!allow) return done;
    rows = rows.slice(0, allow);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET);
    if (!sheet) return done;
    var time = Utilities.formatDate(new Date(nowMs_()), 'Asia/Tehran', 'yyyy-MM-dd HH:mm:ss');
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(LOG_LOCK_MS)) return done;
    try {
      var last = sheet.getLastRow();          // row 1 is the header
      var room = LOG_MAX_ROWS - Math.max(0, last - 1);
      if (room <= 0) { c.put('lg_full', '1', 600); return done; }
      rows = rows.slice(0, room).map(function (r) { return [time].concat(r); });
      var need = last + rows.length - sheet.getMaxRows();
      if (need > 0) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(need, 500));   // grow in steps of 500
      sheet.getRange(last + 1, 1, rows.length, LOG_HEADER.length).setValues(rows);
    } finally {
      lock.releaseLock();
    }
  } catch (e) { /* the log is best effort; never an error for the visitor */ }
  return done;
}

// Run this ONCE in the Apps Script editor after pasting Code.gs: makes the «log» tab (or fixes its header),
// as the LAST tab, so the products stay the first sheet. Plain-text cells, bold frozen header. Safe to run again.
function setupLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) sheet = ss.insertSheet(LOG_SHEET, ss.getSheets().length);
  sheet.getRange(1, 1, 1, LOG_HEADER.length).setValues([LOG_HEADER]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, sheet.getMaxRows(), LOG_HEADER.length).setNumberFormat('@');
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(ss.getNumSheets());
  ss.setActiveSheet(ss.getSheets()[0]);
  return 'OK: «' + LOG_SHEET + '» is tab ' + ss.getNumSheets() + ' of ' + ss.getNumSheets() + '; products tab is «' + ss.getSheets()[0].getName() + '»';
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
  var s = toAsciiDigits(input).replace(/[\s\u200C\u200F\u200E\u066C,\-]/g, '');
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
      logout: function (d, token) { return logout(d, token); },
      logEvent: function (d) { return logEvent(d, body); }
    },
    requireSession: function (token) {
      return requireSession_(token);
    },
    actions: {
      getProducts: function () { return getProducts(); },
      saveProduct: function (d) { return withLock_(function () { return saveProduct(d.item, d.originalId); }); },
      deleteProduct: function (d) { return withLock_(function () { return deleteProduct(d.id); }); },
      publishCsv: function () { return publishCsv(); },
      getLedger: function () { return getLedger(); },
      saveLedgerRow: function (d) { return withLock_(function () { return saveLedgerRow(d.entry, d.id); }); },
      deleteLedgerRow: function (d) { return withLock_(function () { return deleteLedgerRow(d.id); }); },
      saveLedgerOrder: function (d) { return withLock_(function () { return saveLedgerOrder(d.order, d.orderId, d.rowId); }); },
      deleteLedgerOrder: function (d) { return withLock_(function () { return deleteLedgerOrder(d.orderId); }); },
      saveLedgerBuy: function (d) { return withLock_(function () { return saveLedgerBuy(d.buy, d.id); }); },
      getReport: function (d) { return getReport(d); }
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
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  // The log and the buys/sells tabs must never be read or written as the products.
  var name = sheet && typeof sheet.getName === 'function' ? sheet.getName() : '';
  if (name === LOG_SHEET || name === LEDGER_SHEET || name === CUSTOMER_SHEET || name === HISTORY_SHEET) throw new Error('WRONG_FIRST_TAB');
  return sheet;
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
  captureQuiet_();   // hand edits made in the Sheet first, so they get their own version
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
    values[head.indexOf(h)] = sheetText_(v);
  });

  sheet.getRange(plan.row, 1, 1, width).setValues([values]);
  captureQuiet_();   // and this save becomes a version at once (if name, price, unit or soldOut changed)
  return { ok: true, row: plan.row, updated: !!plan.target };
}

// Called by the page on «حذف» (after the owner confirmed). Deletes the sheet row with this id.
// Returns {ok:true, row} or {ok:false, message}.
function deleteProduct(id) {
  assertSession_();
  var key = cellText(id);
  if (!key) return { ok: false, message: MSG.noDeleteId };
  captureQuiet_();
  var data = readSheetRows();
  if (data.issues.length) return { ok: false, message: MSG.sheetProblems };
  var hits = data.rows.filter(function (r) { return !isBlankRow(r) && cellText(r.id) === key; });
  if (!hits.length) return { ok: false, message: fill(MSG.notFound, { value: key }) };
  if (hits.length > 1) return { ok: false, message: fill(MSG.manyIds, { value: key }) };
  productSheet().deleteRow(hits[0].row);
  captureQuiet_();   // ends the product's current version; the history rows stay
  return { ok: true, row: hits[0].row };
}

// ---- Buys and sells: the «خرید و فروش» tab (owner approved 2026-11-07) ----
// The tab is made by setupLedger (run once in the editor) as the 2ND tab: never first (the products tab must stay
// getSheets()[0]) and never published to the web. Every action needs a session (handleRequest_ + assertSession_);
// saves and deletes run under the script lock. A row is found by its random id (column A), never by row number.

var LEDGER_SHEET = 'خرید و فروش';
// The first 15 columns (the tab as made on 2026-11-07); setupLedger adds the two new ones at the END of such a tab.
var LEDGER_HEADER_V1 = ['id', 'created', 'date', 'type', 'productId', 'productName', 'qty', 'qtyUnit', 'priceToman',
  'priceAmount', 'priceUnit', 'rowToman', 'party', 'note', 'by'];
// customerId + channel: filled on sales only. On a sale, party holds a copy of the customer's name at save time.
var LEDGER_HEADER_V2 = LEDGER_HEADER_V1.concat(['customerId', 'channel']);
// orderId (owner 2026-11-07, multi-product orders): a whole number shared by every line of one order; empty on old
// single rows. Appended at the END; setupLedger adds it to a 15- or 17-column tab.
var LEDGER_HEADER_V3 = LEDGER_HEADER_V2.concat(['orderId']);
// packSize (owner 2026-11-07): the pack size of a line, e.g. «۵۰۰ گرم» (optional text, max 20). Appended at the END;
// setupLedger adds it to a 15-, 17- or 18-column tab. Old rows have it empty.
var LEDGER_HEADER_V4 = LEDGER_HEADER_V3.concat(['packSize']);
// productVersion (owner 2026-11-07): the versionId (from «تاریخچه محصولات») valid on the sale date, filled by the server
// (never typed). Appended at the END; setupLedger adds it to a 15-, 17-, 18- or 19-column tab. Old rows have it empty.
var LEDGER_HEADER = LEDGER_HEADER_V4.concat(['productVersion']);
// Cell formats per column: text everywhere (so 1405-08-16 never turns into a date), numbers for qty and toman.
var LEDGER_FORMATS = ['@', '@', '@', '@', '@', '@', '0.##', '@', '#,##0', '@', '@', '#,##0', '@', '@', '@', '@', '@', '0', '@', '@'];
var LEDGER_TYPES = { buy: 'خرید', sell: 'فروش' };
var LEDGER_QTY_UNITS = { pack: 'بسته/ظرف', kg: 'کیلو', g: 'گرم', piece: 'عدد' };
var LEDGER_PRICE_UNITS = { thousand: 'هزار تومان', million: 'میلیون تومان' };
var LEDGER_CHANNELS = { site: 'سایت', person: 'حضوری' };
var LEDGER_ID = /^L[0-9a-f]{32}$/;
var LEDGER_PARTY_MAX = 60;
// «سایر» (owner approved 2026-11-07): a ledger-only item that is not a shop product (e.g. «برنج», «شیشه خالی»),
// with a typed name. Its productId is this reserved value: it has non-ASCII letters, which validateRows never
// allows in a shop id, so it can never be a real product (and saveLedgerRow refuses while the sheet has issues).
var LEDGER_OTHER_ID = '*سایر*';
var LEDGER_OTHER_MAX = 60;
var LEDGER_NOTE_MAX = 300;
var LEDGER_PACK_MAX = 20;
var LEDGER_MAX_ROWS = 20000;     // rows in the tab; when full, new rows are refused (nothing is deleted)
var LEDGER_MAX_LINES = 50;       // lines in one order
var ORDER_SEQ_KEY = 'orderSeq';  // last order number given out (never reused, like customerSeq)
var LEDGER_MAX_RETURN = 2000;    // newest rows sent to the page
var LEDGER_YEAR_MIN = 1390;
var LEDGER_YEAR_MAX = 1499;

// The customers tab «مشتری‌ها» (sales only). Ids are whole numbers kept as text; the last id given out is also kept
// in the script property CUSTOMER_SEQ_KEY, so a number is never given out again after its row was deleted.
var CUSTOMER_SHEET = 'مشتری‌ها';
var CUSTOMER_HEADER = ['id', 'firstName', 'lastName', 'created', 'by'];
var CUSTOMER_ID = /^[1-9][0-9]{0,8}$/;
var CUSTOMER_SEQ_KEY = 'customerSeq';
var CUSTOMER_MAX_ROWS = 5000;

// ---- shared with admin/admin.js (begin): keep both copies identical (tools/admin/test.mjs checks it) ----
// Persian (Jalali) calendar, after the jalaali-js algorithm (breaks table, valid for years 1178-3177).
var JAL_BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function jDiv_(a, b) { return ~~(a / b); }
function jMod_(a, b) { return a - ~~(a / b) * b; }
function jalCal_(jy) {
  var gy = jy + 621, leapJ = -14, jp = JAL_BREAKS[0], jm, jump = 0, leap, leapG, march, n, i;
  for (i = 1; i < JAL_BREAKS.length; i += 1) {
    jm = JAL_BREAKS[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + jDiv_(jump, 33) * 8 + jDiv_(jMod_(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + jDiv_(n, 33) * 8 + jDiv_(jMod_(n, 33) + 3, 4);
  if (jMod_(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  leapG = jDiv_(gy, 4) - jDiv_((jDiv_(gy, 100) + 1) * 3, 4) - 150;
  march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + jDiv_(jump + 4, 33) * 33;
  leap = jMod_(jMod_(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap: leap, gy: gy, march: march };
}
function g2d_(gy, gm, gd) {
  var d = jDiv_((gy + jDiv_(gm - 8, 6) + 100100) * 1461, 4) + jDiv_(153 * jMod_(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - jDiv_(jDiv_(gy + 100100 + jDiv_(gm - 8, 6), 100) * 3, 4) + 752;
}
// Gregorian year, month (1-12), day → {y, m, d} in the Persian calendar.
function toJalali_(gy, gm, gd) {
  var jdn = g2d_(gy, gm, gd), jy = gy - 621, r = jalCal_(jy), k = jdn - g2d_(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { y: jy, m: 1 + jDiv_(k, 31), d: jMod_(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  return { y: jy, m: 7 + jDiv_(k, 30), d: jMod_(k, 30) + 1 };
}
// Days in a Persian month: 31 (months 1-6), 30 (7-11), 29 or 30 in Esfand (30 in a leap year).
function jalaliMonthDays_(y, m) {
  if (m <= 6) return 31;
  if (m <= 11) return 30;
  return jalCal_(y).leap === 0 ? 30 : 29;
}
// A typed date → 'yyyy-mm-dd' (ASCII, zero-padded) or '' if it is not a real Persian date in the allowed years.
// Accepts Persian/Arabic digits and - or / between the parts.
function ledgerDate_(v) {
  if (typeof v !== 'string' || v.length > 20) return '';
  var s = v.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
    .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); }).trim();
  var m = /^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/.exec(s);
  if (!m) return '';
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
  if (y < 1390 || y > 1499 || mo < 1 || mo > 12 || d < 1 || d > jalaliMonthDays_(y, mo)) return '';
  return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
}
// A typed number → {i, f, text} (whole part, decimals as an integer padded to `decMax` digits, clean text) or null.
// Persian/Arabic digits, «٫» or «.» as the decimal point and «,» / «٬» between thousands are accepted.
function parseDecimal_(v, intMax, decMax) {
  if (typeof v === 'number') v = isFinite(v) && v >= 0 ? String(v) : '';
  if (typeof v !== 'string' || v.length > 40) return null;
  var s = v.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
    .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
    .replace(/[\s\u200c\u200e\u200f]/g, '').replace(/\u066b/g, '.').replace(/[,\u066c]/g, '');
  var m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  var ip = m[1].replace(/^0+(?=\d)/, ''), fp = (m[2] || '').replace(/0+$/, '');
  if (ip.length > intMax || fp.length > decMax) return null;
  var pad = fp;
  while (pad.length < decMax) pad += '0';
  return { i: parseInt(ip, 10), f: pad ? parseInt(pad, 10) : 0, text: ip + (fp ? '.' + fp : '') };
}
// Quantity (> 0, up to 99,999 with 2 decimals) and unit price (> 0, typed in «هزار» or «میلیون» تومان, up to 3
// decimals, at most 10,000,000,000 toman) → {qty, qtyText, unitToman, priceText, tooBig, rowToman}. Each part is
// null / '' when it is not valid. rowToman = qty × unit price, rounded to a whole toman, exact integer math.
function ledgerMath_(qty, price, priceUnit) {
  var mults = { thousand: 1000, million: 1000000 };
  var q = parseDecimal_(qty, 5, 2), p = parseDecimal_(price, 9, 3);
  var mult = typeof priceUnit === 'string' && Object.prototype.hasOwnProperty.call(mults, priceUnit) ? mults[priceUnit] : 0;
  var out = { qty: null, qtyText: '', unitToman: null, priceText: '', tooBig: false, rowToman: null };
  if (q && (q.i > 0 || q.f > 0)) { out.qty = (q.i * 100 + q.f) / 100; out.qtyText = q.text; }
  if (p && mult && (p.i > 0 || p.f > 0)) {
    var toman = p.i * mult + p.f * mult / 1000;
    if (toman > 10000000000) out.tooBig = true;
    else { out.unitToman = toman; out.priceText = p.text; }
  }
  if (out.qty !== null && out.unitToman !== null) out.rowToman = q.i * out.unitToman + Math.round(q.f * out.unitToman / 100);
  return out;
}
// A customer's first or last name (owner 2026-11-07): English letters, space, - and ' only, starting with a letter,
// 1-30 characters after cleaning (no control characters, single spaces, trimmed), stored in lowercase.
// Returns {value} or {error: 'need' | 'long' | 'persian' | 'bad'}.
var CUSTOMER_NAME_MAX = 30;
function customerName_(v) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') return { error: 'bad' };
  var s = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s === '') return { error: 'need' };
  if (/[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/.test(s)) return { error: 'persian' };
  if (s.length > CUSTOMER_NAME_MAX) return { error: 'long' };
  if (!/^[A-Za-z][A-Za-z' -]*$/.test(s)) return { error: 'bad' };
  return { value: s.toLowerCase() };
}
// ---- shared with admin/admin.js (end) ----

// Text for a ledger cell: no control characters or line breaks, single spaces, trimmed. Too long = null.
function ledgerText_(v, max) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  var s = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? null : s;
}

function ledgerKey_(map, v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(map, v) ? v : '';
}

function ledgerKeyOf_(map, label) {
  var key = '';
  Object.keys(map).forEach(function (k) { if (map[k] === label) key = k; });
  return key;
}

// The customer key used to find a name that is already on the list: lowercase, single spaces.
function customerKey_(first, last) {
  return (cellText(first) + ' ' + cellText(last)).replace(/\s+/g, ' ').trim().toLowerCase();
}

// The next customer id: one more than the largest of the stored sequence and every id in column A
// (so a deleted customer's number, or one typed by hand, is never given out again).
function nextCustomerId_(ids, seq) {
  var max = /^[0-9]+$/.test(cellText(seq)) ? parseInt(cellText(seq), 10) : 0;
  ids.forEach(function (v) {
    var t = toAsciiDigits(cellText(v));
    if (/^[0-9]{1,9}$/.test(t) && parseInt(t, 10) > max) max = parseInt(t, 10);
  });
  return max + 1;
}

// The rows of the customers tab → [{id, firstName, lastName}] (rows without an id are left out).
function customerList_(values) {
  return values.map(function (v) {
    return { id: toAsciiDigits(cellText(v[0])), firstName: cellText(v[1]), lastName: cellText(v[2]) };
  }).filter(function (c) { return c.id !== ''; });
}

// The customer part of a SALE (pure): `input.customerId` (an id from the list) or `input.newCustomer`
// {firstName, lastName}. A new name that is already on the list (case ignored) reuses that customer.
// Returns {issues, customerId, name, reused, newCustomer}: newCustomer = {firstName, lastName} (lowercase) when a
// new row must be added (its id is given by the caller, under the lock).
function planCustomer_(input, customers) {
  var out = { issues: [], customerId: '', name: '', reused: '', newCustomer: null };
  function add(field, message) { out.issues.push({ field: field, row: null, message: message }); }
  customers = customers || [];
  var nc = input.newCustomer;
  if (nc && typeof nc === 'object' && !Array.isArray(nc)) {
    var msgs = { need: null, long: MSG.longCustomerName, persian: MSG.persianCustomerName, bad: MSG.badCustomerName };
    var f = customerName_(nc.firstName), l = customerName_(nc.lastName);
    if (f.error) add('firstName', f.error === 'need' ? MSG.needFirstName : msgs[f.error]);
    if (l.error && !(f.error && f.error === l.error && f.error !== 'need')) add('lastName', l.error === 'need' ? MSG.needLastName : msgs[l.error]);
    if (out.issues.length) return out;
    var key = customerKey_(f.value, l.value);
    for (var i = 0; i < customers.length; i++) {
      if (customerKey_(customers[i].firstName, customers[i].lastName) === key) {
        out.customerId = customers[i].id;
        out.reused = customers[i].id;
        out.name = cellText(customers[i].firstName) + ' ' + cellText(customers[i].lastName);
        return out;
      }
    }
    out.newCustomer = { firstName: f.value, lastName: l.value };
    out.name = f.value + ' ' + l.value;
    return out;
  }
  var cid = typeof input.customerId === 'string' || typeof input.customerId === 'number' ? toAsciiDigits(String(input.customerId).trim()) : '';
  if (!cid) { add('customerId', MSG.needCustomer); return out; }
  for (var k = 0; k < customers.length; k++) {
    if (CUSTOMER_ID.test(cid) && customers[k].id === cid) {
      out.customerId = cid;
      out.name = cellText(customers[k].firstName) + ' ' + cellText(customers[k].lastName);
      return out;
    }
  }
  add('customerId', MSG.goneCustomer);
  return out;
}

// Checks one entry from the form and builds its sheet row (pure: no sheet calls).
// `input` = {date, type, productId, qty, qtyUnit, price, priceUnit, party, note} as typed; a SALE also has
// channel ('site' | 'person') and customerId or newCustomer (see planCustomer_; ctx.customers = the list).
// On a sale, party is the customer's name (a copy) and the typed party is ignored; on a buy the customer and
// channel are left empty. Returns also `customer` (planCustomer_'s result) for a sale.
// `products` = the products tab rows ({id, name, ...}). `ctx` = {id, created, by, keep}: `keep` is the stored
// {productId, productName} of the row being edited, so an old row whose product was deleted can still be edited
// as long as its product is left unchanged. The product name always comes from the products tab, never from the page,
// except for the reserved LEDGER_OTHER_ID («سایر»), whose name is input.productName (required, max 60, cleaned).
// Returns {issues: [{field, message}], row: [LEDGER_HEADER order]}; row is null when there are issues. For a new
// customer the row's customerId cell is '' and the caller fills it in.
function planLedgerRow_(input, products, ctx) {
  var issues = [];
  function add(field, message) { issues.push({ field: field, row: null, message: message }); }
  input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  ctx = ctx || {};

  var date = ledgerDate_(input.date);
  if (!date) add('date', MSG.badDate);
  var type = ledgerKey_(LEDGER_TYPES, input.type);
  if (!type) add('type', MSG.badType);

  var pid = typeof input.productId === 'string' ? input.productId.trim() : '';
  var pname = '';
  if (!pid) add('productId', MSG.badProduct);
  else if (pid === LEDGER_OTHER_ID) {
    var other = typeof input.productName === 'string' ? ledgerText_(input.productName, LEDGER_OTHER_MAX) : '';
    if (other === null) add('productName', MSG.longOtherName);
    else if (!other) add('productName', MSG.needOtherName);
    else pname = other;
  } else {
    for (var i = 0; i < products.length; i++) {
      var r = products[i];
      if (!isBlankRow(r) && cellText(r.id) === pid) { pname = cellText(r.name) || pid; break; }
    }
    if (!pname && ctx.keep && ctx.keep.productId === pid && ctx.keep.productName) pname = ctx.keep.productName;
    if (!pname) add('productId', MSG.goneProduct);
  }

  var math = ledgerMath_(input.qty, input.price, input.priceUnit);
  if (math.qty === null) add('qty', MSG.badQty);
  var qtyUnit = ledgerKey_(LEDGER_QTY_UNITS, input.qtyUnit);
  if (!qtyUnit) add('qtyUnit', MSG.badQtyUnit);
  var priceUnit = ledgerKey_(LEDGER_PRICE_UNITS, input.priceUnit);
  if (!priceUnit) add('priceUnit', MSG.badPriceUnit);
  else if (math.tooBig) add('price', MSG.priceTooBig);
  else if (math.unitToman === null) add('price', MSG.badLedgerPrice);

  var party = '', channel = '', customer = null;
  if (type === 'sell') {
    channel = ledgerKey_(LEDGER_CHANNELS, input.channel);
    if (!channel) add('channel', MSG.badChannel);
    customer = planCustomer_(input, ctx.customers);
    customer.issues.forEach(function (x) { issues.push(x); });
    party = customer.name;
  } else {
    party = ledgerText_(input.party, LEDGER_PARTY_MAX);
    if (party === null) add('party', MSG.longParty);
  }
  var note = ledgerText_(input.note, LEDGER_NOTE_MAX);
  if (note === null) add('note', MSG.longNote);
  var pack = ledgerText_(input.packSize, LEDGER_PACK_MAX);
  if (pack === null) add('packSize', MSG.longPack);

  if (issues.length) return { issues: issues, row: null };
  // the product version valid on the sale date; an edit that keeps the same product and date keeps the stored one
  var version = '';
  if (pid !== LEDGER_OTHER_ID) {
    if (ctx.keep && ctx.keep.productId === pid && ctx.keep.date === date) version = cellText(ctx.keep.version);
    else version = versionFor_(ctx.versions, pid, date);
  }
  return {
    issues: [],
    customer: customer,
    row: [ctx.id, ctx.created, date, LEDGER_TYPES[type], sheetText_(pid), sheetText_(pname), math.qty,
      LEDGER_QTY_UNITS[qtyUnit], math.unitToman, math.priceText, LEDGER_PRICE_UNITS[priceUnit], math.rowToman,
      sheetText_(party), sheetText_(note), cellText(ctx.by),
      customer ? customer.customerId : '', channel ? LEDGER_CHANNELS[channel] : '',
      ctx.orderId ? ctx.orderId : '', sheetText_(pack), sheetText_(version)]
  };
}

// The sheet row of the ledger id among the values of column A (index 0 = sheet row 2):
// {row} for exactly one match, {error: 'none' | 'many'} otherwise.
function findLedgerRow_(ids, id) {
  var hits = [];
  ids.forEach(function (v, k) { if (cellText(v) === id) hits.push(k + 2); });
  if (hits.length === 1) return { row: hits[0] };
  return { error: hits.length ? 'many' : 'none' };
}

// The order number of a cell: a whole number 1..999999999, or null (old single rows).
function orderIdOf_(x) {
  var t = toAsciiDigits(cellText(x));
  return /^[1-9][0-9]{0,8}$/.test(t) ? parseInt(t, 10) : null;
}

// The next order number: one more than the largest of the stored sequence and every orderId in column R.
function nextOrderId_(ids, seq) {
  var max = /^[0-9]+$/.test(cellText(seq)) ? parseInt(cellText(seq), 10) : 0;
  ids.forEach(function (v) { var n = orderIdOf_(v); if (n !== null && n > max) max = n; });
  return max + 1;
}

// A sheet row (array) → the object sent to the page.
function ledgerEntry_(v) {
  var num = function (x) { return typeof x === 'number' ? x : (cellText(x) === '' ? null : Number(toAsciiDigits(cellText(x)).replace(/,/g, ''))); };
  return {
    id: cellText(v[0]), created: cellText(v[1]), date: cellText(v[2]),
    type: ledgerKeyOf_(LEDGER_TYPES, cellText(v[3])), typeText: cellText(v[3]),
    productId: cellText(v[4]), productName: cellText(v[5]),
    qty: num(v[6]), qtyUnit: ledgerKeyOf_(LEDGER_QTY_UNITS, cellText(v[7])), qtyUnitText: cellText(v[7]),
    priceToman: num(v[8]), priceAmount: cellText(v[9]),
    priceUnit: ledgerKeyOf_(LEDGER_PRICE_UNITS, cellText(v[10])), priceUnitText: cellText(v[10]),
    rowToman: num(v[11]), party: cellText(v[12]), note: cellText(v[13]), by: cellText(v[14]),
    customerId: toAsciiDigits(cellText(v[15])), channel: ledgerKeyOf_(LEDGER_CHANNELS, cellText(v[16])), channelText: cellText(v[16]),
    orderId: orderIdOf_(v[17]), packSize: cellText(v[18]), productVersion: cellText(v[19])
  };
}

// The «خرید و فروش» tab, checked: {sheet} or {message} (missing, first tab, or a broken header).
function ledgerSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEDGER_SHEET);
  if (!sheet) return { message: MSG.noLedger };
  if (sheet.getIndex() === 1) return { message: MSG.ledgerFirst };
  var head = sheet.getRange(1, 1, 1, LEDGER_HEADER.length).getValues()[0].map(cellText);
  if (head.join('\n') !== LEDGER_HEADER.join('\n')) return { message: MSG.ledgerHeader };
  return { sheet: sheet };
}

// The «مشتری‌ها» tab, checked: {sheet} or {message} (missing, first tab, or a broken header).
function customersSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CUSTOMER_SHEET);
  if (!sheet) return { message: MSG.noCustomers };
  if (sheet.getIndex() === 1) return { message: MSG.customersFirst };
  var head = sheet.getRange(1, 1, 1, CUSTOMER_HEADER.length).getValues()[0].map(cellText);
  if (head.join('\n') !== CUSTOMER_HEADER.join('\n')) return { message: MSG.customersHeader };
  return { sheet: sheet };
}

function customerValues_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, CUSTOMER_HEADER.length).getValues();
}

// The data rows of the tab (row 1 is the header), as arrays.
function ledgerValues_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, LEDGER_HEADER.length).getValues();
}

// Action getLedger: the newest LEDGER_MAX_RETURN rows (by date, then time entered), newest first.
// Also the customers list (for the sale form): customers = [{id, firstName, lastName}], or [] plus
// customersMessage when the «مشتری‌ها» tab is missing or broken (buys still work then).
// Returns {ok:true, entries, more, customers[, customersMessage]} or {ok:false, message} (e.g. setupLedger not run yet).
function getLedger() {
  assertSession_();
  var t = ledgerSheet_();
  if (!t.sheet) return { ok: false, message: t.message };
  var entries = ledgerValues_(t.sheet).map(ledgerEntry_).filter(function (e) { return e.id !== ''; });
  entries.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.created !== b.created) return a.created < b.created ? 1 : -1;
    return 0;
  });
  var out = { ok: true, entries: entries.slice(0, LEDGER_MAX_RETURN), more: entries.length > LEDGER_MAX_RETURN, customers: [], orders: true, packSize: true, productVersion: true, simpleBuy: true };
  var c = customersSheet_();
  if (c.sheet) out.customers = customerList_(customerValues_(c.sheet));
  else out.customersMessage = c.message;
  return out;
}

// ---- «گزارش» (reports, owner approved 2026-11-07): read-only, SALES only ----
var REPORT_TOP_CUSTOMERS = 10;
var REPORT_UNITS = ['pack', 'kg', 'g', 'piece'];

// Pure: ledger entries (as from ledgerEntry_) + the customers list → small summaries of the SALES between
// `from` and `to` ('yyyy-mm-dd', '' = no limit, both ends included). Buys are never counted. A sale whose date
// or total is missing/not a number is left out and counted in `skipped`. An order (several lines with the same
// orderId) counts as ONE order; a row without an orderId counts as one order. Money is the stored rowToman.
// Quantities are summed per unit and units are never mixed. Returns:
// {from, to, rows:{used, skipped:{noDate, noTotal}, buysIgnored (buys in the period, not counted)}, totals:{toman, orders, customers},
//  byDay:[{d, toman, orders}], byProduct:[{id, name, toman, lines, qty:{pack,kg,g,piece}}],
//  byChannel:{site:{toman,orders}, person:{...}, unknown:{...}}, topCustomers:[{id, name, toman, orders}]}
function reportSummarize_(entries, customers, from, to) {
  var names = {};
  (customers || []).forEach(function (c) { names[c.id] = (c.firstName + ' ' + c.lastName).replace(/\s+/g, ' ').trim(); });
  var out = {
    from: from || '', to: to || '',
    rows: { used: 0, skipped: { noDate: 0, noTotal: 0 }, buysIgnored: 0 },
    totals: { toman: 0, orders: 0, customers: 0 },
    byDay: [], byProduct: [], byChannel: { site: { toman: 0, orders: 0 }, person: { toman: 0, orders: 0 }, unknown: { toman: 0, orders: 0 } },
    topCustomers: []
  };
  var orderSeen = {}, days = {}, prods = {}, custs = {}, chanSeen = { site: {}, person: {}, unknown: {} }, daySeen = {}, custSeen = {};
  (entries || []).forEach(function (e) {
    if (!e || e.id === '') return;
    var date = typeof e.date === 'string' && /^\d{4}-\d\d-\d\d$/.test(e.date) ? e.date : '';
    if (e.type === 'sell' && !date) { out.rows.skipped.noDate += 1; return; }
    if ((from && date < from) || (to && date > to)) return;
    if (e.type !== 'sell') { if (e.type === 'buy' && date) out.rows.buysIgnored += 1; return; }
    if (typeof e.rowToman !== 'number' || !isFinite(e.rowToman) || e.rowToman < 0) { out.rows.skipped.noTotal += 1; return; }
    var key = typeof e.orderId === 'number' ? 'o' + e.orderId : 'r' + e.id;
    var toman = e.rowToman;
    out.rows.used += 1;
    out.totals.toman += toman;
    if (!orderSeen[key]) { orderSeen[key] = true; out.totals.orders += 1; }
    var day = days[date] || (days[date] = { d: date, toman: 0, orders: 0 });
    day.toman += toman;
    if (!daySeen[date + key]) { daySeen[date + key] = true; day.orders += 1; }
    var ch = e.channel === 'site' || e.channel === 'person' ? e.channel : 'unknown';
    out.byChannel[ch].toman += toman;
    if (!chanSeen[ch][key]) { chanSeen[ch][key] = true; out.byChannel[ch].orders += 1; }
    var pid = e.productId !== '' ? e.productId : e.productName;
    var p = prods[pid] || (prods[pid] = { id: e.productId, name: e.productName || e.productId, toman: 0, lines: 0, qty: { pack: 0, kg: 0, g: 0, piece: 0 } });
    p.toman += toman;
    p.lines += 1;
    if (REPORT_UNITS.indexOf(e.qtyUnit) >= 0 && typeof e.qty === 'number' && isFinite(e.qty) && e.qty > 0) p.qty[e.qtyUnit] += e.qty;
    if (e.customerId !== '') {
      var c = custs[e.customerId] || (custs[e.customerId] = { id: e.customerId, name: names[e.customerId] || '', toman: 0, orders: 0 });
      c.toman += toman;
      if (!custSeen[e.customerId + key]) { custSeen[e.customerId + key] = true; c.orders += 1; }
    }
  });
  Object.keys(days).sort().forEach(function (d) { out.byDay.push(days[d]); });
  Object.keys(prods).forEach(function (k) {
    REPORT_UNITS.forEach(function (u) { prods[k].qty[u] = Math.round(prods[k].qty[u] * 100) / 100; });
    out.byProduct.push(prods[k]);
  });
  out.byProduct.sort(function (a, b) { return b.toman - a.toman || (a.name < b.name ? -1 : 1); });
  var list = Object.keys(custs).map(function (k) { return custs[k]; });
  out.totals.customers = list.length;
  list.sort(function (a, b) { return b.toman - a.toman || b.orders - a.orders || (a.id - b.id); });
  out.topCustomers = list.slice(0, REPORT_TOP_CUSTOMERS);
  return out;
}

// Action getReport (read-only): data = {from, to} Persian dates 'yyyy-mm-dd' (either may be '' = no limit).
// Reads ALL ledger rows (not only the newest 2000). Returns {ok:true, report:true, summary} or {ok:false, message}.
function getReport(data) {
  assertSession_();
  var from = data && data.from !== undefined && data.from !== null ? data.from : '';
  var to = data && data.to !== undefined && data.to !== null ? data.to : '';
  if (typeof from !== 'string' || typeof to !== 'string' || (from !== '' && ledgerDate_(from) !== from) || (to !== '' && ledgerDate_(to) !== to) || (from && to && from > to)) return { ok: false, message: MSG.reportRange };
  var t = ledgerSheet_();
  if (!t.sheet) return { ok: false, message: t.message };
  var entries = ledgerValues_(t.sheet).map(ledgerEntry_);
  var customers = [];
  var c = customersSheet_();
  if (c.sheet) customers = customerList_(customerValues_(c.sheet));
  return { ok: true, report: true, summary: reportSummarize_(entries, customers, from, to) };
}

// Action saveLedgerRow (under the lock): `entry` from the form; `id` = the row's id when editing, '' for a new row.
// A new row gets a random id, the Tehran time and the admin's email; an edit keeps id, time and email.
// A sale with a new customer first adds the customer (next id, lowercase names) and then writes the row, all in
// the same lock; nothing is written when the entry has issues.
// Returns {ok:true, id, updated, customerId, reusedCustomer} or {ok:false, issues} / {ok:false, message}.
function saveLedgerRow(entry, id) {
  assertSession_();
  captureQuiet_();   // hand edits first, so the line gets the right product version
  var t = ledgerSheet_();
  if (!t.sheet) return { ok: false, message: t.message };
  var sheet = t.sheet;
  var data = readSheetRows();
  if (data.issues.length) return { ok: false, message: MSG.sheetProblems };

  var editing = typeof id === 'string' && id !== '';
  if (editing && !LEDGER_ID.test(id)) return { ok: false, message: MSG.ledgerNotFound };
  var values = ledgerValues_(sheet);
  var target = null, ctx;
  if (editing) {
    var found = findLedgerRow_(values.map(function (v) { return v[0]; }), id);
    if (!found.row) return { ok: false, message: found.error === 'many' ? MSG.ledgerMany : MSG.ledgerNotFound };
    target = found.row;
    var old = values[target - 2];
    ctx = { id: id, created: cellText(old[1]), by: cellText(old[14]), orderId: orderIdOf_(old[17]),
      keep: { productId: cellText(old[4]), productName: cellText(old[5]), date: cellText(old[2]), version: cellText(old[19]) } };
  } else {
    if (values.length >= LEDGER_MAX_ROWS) return { ok: false, message: fill(MSG.ledgerFull, { n: LEDGER_MAX_ROWS }) };
    ctx = {
      id: 'L' + randomHex_(32),
      created: Utilities.formatDate(new Date(nowMs_()), 'Asia/Tehran', 'yyyy-MM-dd HH:mm:ss'),
      by: sessionEmail_
    };
  }
  ctx.versions = versionMap_();
  var isSale = !!entry && typeof entry === 'object' && entry.type === 'sell';
  var cust = null, custValues = [];
  if (isSale) {
    cust = customersSheet_();
    if (!cust.sheet) return { ok: false, message: cust.message };
    custValues = customerValues_(cust.sheet);
    ctx.customers = customerList_(custValues);
  }
  var plan = planLedgerRow_(entry, data.rows, ctx);
  if (plan.issues.length) return { ok: false, issues: plan.issues };

  var c = plan.customer;
  if (c && c.newCustomer) {
    if (custValues.length >= CUSTOMER_MAX_ROWS) return { ok: false, message: fill(MSG.customersFull, { n: CUSTOMER_MAX_ROWS }) };
    var props = PropertiesService.getScriptProperties();
    var cid = String(nextCustomerId_(custValues.map(function (v) { return v[0]; }), props.getProperty(CUSTOMER_SEQ_KEY)));
    var crow = cust.sheet.getLastRow() + 1;
    if (crow > cust.sheet.getMaxRows()) cust.sheet.insertRowsAfter(cust.sheet.getMaxRows(), 100);
    var crange = cust.sheet.getRange(crow, 1, 1, CUSTOMER_HEADER.length);
    crange.setNumberFormats([CUSTOMER_HEADER.map(function () { return '@'; })]);
    crange.setValues([[cid, sheetText_(c.newCustomer.firstName), sheetText_(c.newCustomer.lastName),
      Utilities.formatDate(new Date(nowMs_()), 'Asia/Tehran', 'yyyy-MM-dd HH:mm:ss'), cellText(sessionEmail_)]]);
    props.setProperty(CUSTOMER_SEQ_KEY, cid);
    c.customerId = cid;
    plan.row[15] = cid;
  }

  var row = target || sheet.getLastRow() + 1;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  var range = sheet.getRange(row, 1, 1, LEDGER_HEADER.length);
  range.setNumberFormats([LEDGER_FORMATS]);
  range.setValues([plan.row]);
  return { ok: true, id: ctx.id, updated: !!target, customerId: c ? c.customerId : '', reusedCustomer: c ? c.reused : '' };
}

// Action saveLedgerBuy (under the lock; owner approved 2026-11-07): the SIMPLE buy = one item, one total.
// `buy` = {date, name, total, totalUnit} (totalUnit 'thousand' | 'million'); `id` = the row's id when editing, '' for new.
// It is stored as one ordinary ledger row: type خرید, productId LEDGER_OTHER_ID, productName = the typed name
// (required, max 60, cleaned, formula-escaped), qty 1, qtyUnit «عدد», priceToman = rowToman = the total, priceAmount /
// priceUnit as typed, no seller, note, pack size, order number or product version. Everything else is checked by
// saveLedgerRow / planLedgerRow_. Only a single buy row (no order number) can be saved this way; a sale or a row
// inside an order is refused. Returns what saveLedgerRow returns.
function saveLedgerBuy(buy, id) {
  assertSession_();
  if (!buy || typeof buy !== 'object' || Array.isArray(buy)) return { ok: false, message: MSG.badOrder };
  if (id !== undefined && id !== null && id !== '') {
    if (typeof id !== 'string' || !LEDGER_ID.test(id)) return { ok: false, message: MSG.ledgerNotFound };
    var t = ledgerSheet_();
    if (!t.sheet) return { ok: false, message: t.message };
    var values = ledgerValues_(t.sheet);
    var found = findLedgerRow_(values.map(function (v) { return v[0]; }), id);
    if (!found.row) return { ok: false, message: found.error === 'many' ? MSG.ledgerMany : MSG.ledgerNotFound };
    var old = values[found.row - 2];
    if (ledgerKeyOf_(LEDGER_TYPES, cellText(old[3])) !== 'buy' || orderIdOf_(old[17]) !== null) return { ok: false, message: MSG.buyNotSimple };
  }
  var res = saveLedgerRow({
    date: buy.date, type: 'buy', productId: LEDGER_OTHER_ID, productName: buy.name,
    qty: '1', qtyUnit: 'piece', price: buy.total, priceUnit: buy.totalUnit
  }, id || '');
  if (res && res.issues) {
    res.issues.forEach(function (x) { if (x.field === 'price' && x.message === MSG.badLedgerPrice) x.message = MSG.badBuyTotal; });
  }
  return res;
}

// Action deleteLedgerRow (under the lock, after the owner confirmed on the page): deletes the ONE row whose
// column A is this id. A malformed id, no match or several matches delete nothing.
// Returns {ok:true} or {ok:false, message}.
function deleteLedgerRow(id) {
  assertSession_();
  if (typeof id !== 'string' || !LEDGER_ID.test(id)) return { ok: false, message: MSG.ledgerNotFound };
  var t = ledgerSheet_();
  if (!t.sheet) return { ok: false, message: t.message };
  var last = t.sheet.getLastRow();
  var ids = last < 2 ? [] : t.sheet.getRange(2, 1, last - 1, 1).getValues().map(function (v) { return v[0]; });
  var found = findLedgerRow_(ids, id);
  if (!found.row) return { ok: false, message: found.error === 'many' ? MSG.ledgerMany : MSG.ledgerNotFound };
  t.sheet.deleteRow(found.row);
  return { ok: true };
}

// Action saveLedgerOrder (under the lock; owner approved 2026-11-07): ONE order = shared fields + 1..50 lines.
// order = {date, type, party | customerId | newCustomer, channel, note, lines: [{id?, productId, productName?, qty,
// qtyUnit, price, priceUnit}]}. Every line is checked with planLedgerRow_; the customer is planned ONCE (a new one
// is created once, after all lines passed). All rows or none: nothing is written when anything has an issue.
// New order: orderId '' and rowId ''. Edit an order: orderId = its number; its stored lines are REPLACED by the
// submitted ones (a line with its stored `id` is updated in place, a line without id is new, a stored line that is
// not submitted is deleted). Edit an old single row (no orderId): rowId = its id; it is treated as a one-line order
// (a single line stays without an order number; more lines get a new number).
// Returns {ok:true, orderId, ids, customerId, reusedCustomer} or {ok:false, issues[{field,line?,message}]} / {ok:false, message}.
function saveLedgerOrder(order, orderId, rowId) {
  assertSession_();
  captureQuiet_();   // hand edits first, so every line gets the right product version
  var t = ledgerSheet_();
  if (!t.sheet) return { ok: false, message: t.message };
  var sheet = t.sheet;
  if (!order || typeof order !== 'object' || Array.isArray(order) || !Array.isArray(order.lines)) return { ok: false, message: MSG.badOrder };
  if (!order.lines.length) return { ok: false, message: MSG.needLines };
  if (order.lines.length > LEDGER_MAX_LINES) return { ok: false, message: fill(MSG.tooManyLines, { n: LEDGER_MAX_LINES }) };
  var data = readSheetRows();
  if (data.issues.length) return { ok: false, message: MSG.sheetProblems };

  var values = ledgerValues_(sheet);
  var editOrder = orderId !== undefined && orderId !== null && orderId !== '' ? orderIdOf_(orderId) : null;
  if (orderId !== undefined && orderId !== null && orderId !== '' && editOrder === null) return { ok: false, message: MSG.orderNotFound };
  var editRow = typeof rowId === 'string' && rowId !== '' ? rowId : '';
  if (editRow && (!LEDGER_ID.test(editRow) || editOrder !== null)) return { ok: false, message: MSG.ledgerNotFound };

  // the stored rows this save may touch: [{idx (values index), id}]
  var existing = [];
  values.forEach(function (v, k) {
    var oid = orderIdOf_(v[17]);
    if (editOrder !== null ? oid === editOrder : (editRow && cellText(v[0]) === editRow)) existing.push(k);
  });
  if (editOrder !== null && !existing.length) return { ok: false, message: MSG.orderNotFound };
  if (editRow) {
    if (!existing.length) return { ok: false, message: MSG.ledgerNotFound };
    if (existing.length > 1) return { ok: false, message: MSG.ledgerMany };
    if (orderIdOf_(values[existing[0]][17]) !== null) return { ok: false, message: MSG.ledgerNotFound };
  }
  var byId = {};
  existing.forEach(function (k) { byId[cellText(values[k][0])] = k; });

  var isSale = order.type === 'sell';
  var cust = null, custValues = [], customers = [];
  if (isSale) {
    cust = customersSheet_();
    if (!cust.sheet) return { ok: false, message: cust.message };
    custValues = customerValues_(cust.sheet);
    customers = customerList_(custValues);
  }
  // plan the customer once; every line is then planned against one stand-in customer (replaced after the write)
  var VIRTUAL = '999999999';
  var issues = [];
  var cplan = null, ctxCustomers = [];
  if (isSale) {
    cplan = planCustomer_(order, customers);
    cplan.issues.forEach(function (x) { issues.push(x); });
    var cf = 'x', cl = 'x';
    if (!cplan.issues.length) {
      if (cplan.newCustomer) { cf = cplan.newCustomer.firstName; cl = cplan.newCustomer.lastName; }
      else customers.forEach(function (c) { if (c.id === cplan.customerId) { cf = c.firstName; cl = c.lastName; } });
    }
    ctxCustomers = [{ id: VIRTUAL, firstName: cf, lastName: cl }];
  }
  var created = Utilities.formatDate(new Date(nowMs_()), 'Asia/Tehran', 'yyyy-MM-dd HH:mm:ss');
  var versions = versionMap_();
  var seen = {};
  var plans = [];
  order.lines.forEach(function (ln, i) {
    ln = ln && typeof ln === 'object' && !Array.isArray(ln) ? ln : {};
    var lid = typeof ln.id === 'string' ? ln.id : '';
    var old = null;
    if (lid) {
      if (!LEDGER_ID.test(lid) || !Object.prototype.hasOwnProperty.call(byId, lid) || seen[lid]) {
        issues.push({ field: 'id', line: i, row: null, message: MSG.ledgerNotFound });
        return;
      }
      seen[lid] = true;
      old = values[byId[lid]];
    }
    var input = {
      date: order.date, type: order.type, note: order.note, party: order.party, channel: order.channel,
      customerId: isSale ? VIRTUAL : undefined,
      productId: ln.productId, productName: ln.productName, qty: ln.qty, qtyUnit: ln.qtyUnit, price: ln.price, priceUnit: ln.priceUnit, packSize: ln.packSize
    };
    var ctx = {
      id: lid || 'L' + randomHex_(32), created: old ? cellText(old[1]) : created, by: old ? cellText(old[14]) : sessionEmail_,
      customers: ctxCustomers, versions: versions,
      keep: old ? { productId: cellText(old[4]), productName: cellText(old[5]), date: cellText(old[2]), version: cellText(old[19]) } : null
    };
    var plan = planLedgerRow_(input, data.rows, ctx);
    // customer/channel problems are reported once (the customer part was planned above), not per line
    plan.issues.forEach(function (x) {
      if (x.field === 'customerId') return;
      if (i > 0 && (x.field === 'date' || x.field === 'type' || x.field === 'channel' || x.field === 'party' || x.field === 'note')) return;
      x.line = i; issues.push(x);
    });
    plans.push({ plan: plan, old: old ? byId[lid] : -1, ctx: ctx });
  });
  if (issues.length) return { ok: false, issues: issues };

  var removed = existing.filter(function (k) { return !plans.some(function (p) { return p.old === k; }); });
  var added = plans.filter(function (p) { return p.old < 0; }).length;
  if (values.length - removed.length + added > LEDGER_MAX_ROWS) return { ok: false, message: fill(MSG.ledgerFull, { n: LEDGER_MAX_ROWS }) };

  // an order number: kept when editing an order; new when a new order, or when an old single row grows to 2+ lines
  var props = PropertiesService.getScriptProperties();
  var finalOrder = null, newSeq = false;
  var mergedInto = null;
  if (editOrder !== null) finalOrder = editOrder;
  else if (!editRow || plans.length > 1) {
    // a NEW sale for an existing customer on a day/channel that already has an order joins that order
    if (!editRow && isSale && cplan && !cplan.newCustomer && cplan.customerId && plans.length) {
      mergedInto = findSaleOrder_(values, cplan.customerId, plans[0].plan.row[2], plans[0].plan.row[16]);
    }
    if (mergedInto !== null) finalOrder = mergedInto;
    else {
      finalOrder = nextOrderId_(values.map(function (v) { return v[17]; }), props.getProperty(ORDER_SEQ_KEY));
      newSeq = true;
    }
  }
  // the new customer, once
  var c = cplan, newCid = '';
  if (c && c.newCustomer) {
    if (custValues.length >= CUSTOMER_MAX_ROWS) return { ok: false, message: fill(MSG.customersFull, { n: CUSTOMER_MAX_ROWS }) };
    newCid = String(nextCustomerId_(custValues.map(function (v) { return v[0]; }), props.getProperty(CUSTOMER_SEQ_KEY)));
    var crow = cust.sheet.getLastRow() + 1;
    if (crow > cust.sheet.getMaxRows()) cust.sheet.insertRowsAfter(cust.sheet.getMaxRows(), 100);
    var crange = cust.sheet.getRange(crow, 1, 1, CUSTOMER_HEADER.length);
    crange.setNumberFormats([CUSTOMER_HEADER.map(function () { return '@'; })]);
    crange.setValues([[newCid, sheetText_(c.newCustomer.firstName), sheetText_(c.newCustomer.lastName), created, cellText(sessionEmail_)]]);
    props.setProperty(CUSTOMER_SEQ_KEY, newCid);
  }
  var customerId = isSale ? (newCid || c.customerId) : '';

  // write: updates first (row numbers stay), then new rows at the end, then deletes from the bottom up
  var ids = [];
  var appendAt = sheet.getLastRow() + 1;
  plans.forEach(function (p) {
    var row = p.plan.row;
    if (isSale) row[15] = customerId;
    row[17] = finalOrder !== null ? finalOrder : '';
    ids.push(row[0]);
    var at = p.old >= 0 ? p.old + 2 : appendAt++;
    if (at > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    var range = sheet.getRange(at, 1, 1, LEDGER_HEADER.length);
    range.setNumberFormats([LEDGER_FORMATS]);
    range.setValues([row]);
  });
  removed.sort(function (a, b) { return b - a; }).forEach(function (k) { sheet.deleteRow(k + 2); });
  if (newSeq) props.setProperty(ORDER_SEQ_KEY, String(finalOrder));
  var res = { ok: true, orderId: finalOrder, ids: ids, customerId: customerId, reusedCustomer: c ? c.reused : '' };
  if (mergedInto !== null) res.mergedInto = mergedInto;
  return res;
}

// Action deleteLedgerOrder (under the lock, after the owner confirmed on the page): deletes EVERY row with this
// order number (bottom up). A bad number or no match deletes nothing. Returns {ok:true, deleted} or {ok:false, message}.
function deleteLedgerOrder(orderId) {
  assertSession_();
  var n = orderIdOf_(orderId);
  if (n === null) return { ok: false, message: MSG.orderNotFound };
  var t = ledgerSheet_();
  if (!t.sheet) return { ok: false, message: t.message };
  var values = ledgerValues_(t.sheet);
  var hits = [];
  values.forEach(function (v, k) { if (orderIdOf_(v[17]) === n) hits.push(k + 2); });
  if (!hits.length) return { ok: false, message: MSG.orderNotFound };
  hits.sort(function (a, b) { return b - a; }).forEach(function (r) { t.sheet.deleteRow(r); });
  return { ok: true, deleted: hits.length };
}

// The order number of an existing SALE order with this customer id, date ('yyyy-mm-dd') and channel text, or null.
// When several orders match, the lowest number wins. `values` = the ledger rows (arrays).
function findSaleOrder_(values, customerId, date, channelText) {
  var best = null;
  values.forEach(function (v) {
    var oid = orderIdOf_(v[17]);
    if (oid === null || cellText(v[3]) !== LEDGER_TYPES.sell) return;
    if (toAsciiDigits(cellText(v[15])) !== customerId || cellText(v[2]) !== date || cellText(v[16]) !== channelText) return;
    if (best === null || oid < best) best = oid;
  });
  return best;
}

// Run this ONCE in the Apps Script editor after pasting Code.gs: makes the «خرید و فروش» tab (or fixes its place
// and header) as the 2ND tab, right after the products tab, never first. Bold frozen header, text/number formats.
// Safe to run again; it never changes the data rows. Do NOT publish this tab to the web.
function setupLedger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LEDGER_SHEET);
  if (!sheet) {
    if (ss.getNumSheets() < 1) return 'ERROR: the products tab is missing';
    sheet = ss.insertSheet(LEDGER_SHEET, 1);   // 0-based index: 1 = right after the products tab
  }
  var lastRow = sheet.getLastRow();
  var head = lastRow ? sheet.getRange(1, 1, 1, LEDGER_HEADER.length).getValues()[0].map(cellText) : [];
  // An older tab (15 columns before the customers, 17 before the orders, 18 before the pack size, 19 before the product version): the missing columns are added at the END;
  // data rows are kept. Accepted when the first N columns match an older header and the rest are empty.
  var older = [LEDGER_HEADER_V1, LEDGER_HEADER_V2, LEDGER_HEADER_V3, LEDGER_HEADER_V4].some(function (k) {
    return head.slice(0, k.length).join('\n') === k.join('\n') && head.slice(k.length).every(function (h) { return h === ''; });
  });
  if (lastRow > 1 && head.join('\n') !== LEDGER_HEADER.join('\n') && !older) {
    ss.setActiveSheet(ss.getSheets()[0]);
    return 'ERROR: row 1 of «' + LEDGER_SHEET + '» is not the expected header and the tab has data; fix it by hand';
  }
  sheet.getRange(1, 1, 1, LEDGER_HEADER.length).setValues([LEDGER_HEADER]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  LEDGER_FORMATS.forEach(function (f, i) { sheet.getRange(2, i + 1, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat(f); });
  if (sheet.getIndex() !== 2) {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(2);
  }
  ss.setActiveSheet(ss.getSheets()[0]);
  return 'OK: «' + LEDGER_SHEET + '» is tab ' + sheet.getIndex() + ' of ' + ss.getNumSheets() + '; products tab is «' + ss.getSheets()[0].getName() + '». Do not publish it to the web.';
}

// Run this ONCE in the Apps Script editor after setupLedger: makes the «مشتری‌ها» tab (or fixes its place and header)
// right after «خرید و فروش» (so «log» stays last), never first. Bold frozen header, text format in every column.
// Safe to run again; it never changes the data rows. Do NOT publish this tab to the web.
function setupCustomers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getNumSheets() < 1) return 'ERROR: the products tab is missing';
  var sheet = ss.getSheetByName(CUSTOMER_SHEET);
  var ledger = ss.getSheetByName(LEDGER_SHEET);
  if (!sheet) sheet = ss.insertSheet(CUSTOMER_SHEET, ledger ? ledger.getIndex() : 1);   // 0-based: right after
  var lastRow = sheet.getLastRow();
  var head = lastRow ? sheet.getRange(1, 1, 1, CUSTOMER_HEADER.length).getValues()[0].map(cellText) : [];
  if (lastRow > 1 && head.join('\n') !== CUSTOMER_HEADER.join('\n')) {
    ss.setActiveSheet(ss.getSheets()[0]);
    return 'ERROR: row 1 of «' + CUSTOMER_SHEET + '» is not the expected header and the tab has data; fix it by hand';
  }
  sheet.getRange(1, 1, 1, CUSTOMER_HEADER.length).setValues([CUSTOMER_HEADER]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), CUSTOMER_HEADER.length).setNumberFormat('@');
  // Target place: right after «خرید و فروش» (2nd tab when it is missing), counted without this tab.
  var mine = sheet.getIndex();
  var after = ledger ? ledger.getIndex() : 1;
  if (mine < after) after -= 1;
  var target = Math.max(2, after + 1);
  if (mine !== target) {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(target);
  }
  ss.setActiveSheet(ss.getSheets()[0]);
  return 'OK: «' + CUSTOMER_SHEET + '» is tab ' + sheet.getIndex() + ' of ' + ss.getNumSheets() + '; products tab is «' + ss.getSheets()[0].getName() + '». Do not publish it to the web.';
}

// ---- Product versions: the «تاریخچه محصولات» tab (owner approved 2026-11-07, SCD type 2) ----
// One row per version of a product. Columns: versionId (<id>-v<n>), productId, name, category, price (digits only),
// unit, soldOut (yes/no), valid_from, valid_to (Tehran time, 'yyyy-MM-dd HH:mm:ss'; valid_to empty while current),
// is_current (yes/no). The last known name|price|unit|soldOut of a product is simply its CURRENT row, so the products
// tab needs no extra column and stays exactly as it is. The tab is private: the 3rd/4th tab, never first, never published.

var HISTORY_SHEET = 'تاریخچه محصولات';
var HISTORY_HEADER = ['versionId', 'productId', 'name', 'category', 'price', 'unit', 'soldOut', 'valid_from', 'valid_to', 'is_current'];
var HISTORY_MAX_ROWS = 20000;     // when full, no new version rows are added (nothing is deleted)
var HISTORY_TRIGGER = 'hourlyVersioning';

// The four tracked fields of a products-tab row or a history row, cleaned for comparing.
function trackedOf_(r) {
  var sold = cellText(r.soldOut).toLowerCase() === 'yes' ? 'yes' : 'no';
  return {
    name: cellText(r.name),
    price: toAsciiDigits(cellText(r.price)).replace(/,/g, ''),
    unit: cellText(r.unit),
    soldOut: sold
  };
}
function sameTracked_(a, b) {
  return a.name === b.name && a.price === b.price && a.unit === b.unit && a.soldOut === b.soldOut;
}

// History tab values (rows 2..) → objects {row, versionId, productId, name, category, price, unit, soldOut,
// valid_from, valid_to, current}. `row` is the sheet row number.
function histFromValues_(values) {
  return values.map(function (v, k) {
    var o = { row: k + 2 };
    HISTORY_HEADER.forEach(function (h, i) { o[h] = cellText(v[i]); });
    o.current = o.is_current.toLowerCase() === 'yes';
    return o;
  });
}
// A history object → the cells of its row (text is formula-escaped like every other written cell).
function histRow_(o) {
  return [sheetText_(o.versionId), sheetText_(o.productId), sheetText_(o.name), sheetText_(o.category), o.price, sheetText_(o.unit),
    o.soldOut, o.valid_from, o.valid_to, o.current ? 'yes' : 'no'];
}

// The pure heart: compares the products tab rows with the history objects and says what to change.
// `products` = readSheetRows rows, `hist` = histFromValues_ objects, `now` = the time text for valid_from / valid_to.
// It changes the history objects in memory and returns {dirty: [existing objects that changed], added: [new objects], notes: [text]}.
// - a product with no current version gets one (v1, or the next number after an ended one);
// - tracked fields changed → the current version is closed (valid_to = now, is_current = no) and a new one starts;
// - category changed → the category is updated on EVERY history row of that product, no new version;
// - a product that is gone (deleted by hand or in the admin) → its current version is closed, the history stays;
// - several current rows of one id → the newest valid_from stays current, the others are closed;
// - rows with problems (validateRows) and repeated ids (the 2nd one on) are skipped, never versioned;
// - history rows without versionId or productId are ignored; non-current rows (even hand-edited) are never touched
//   (only their category follows the product).
function planVersions_(products, hist, now) {
  var dirty = [], added = [], notes = [];
  function mark(o) { if (!o.isNew && dirty.indexOf(o) < 0) dirty.push(o); }
  function close(o) { o.current = false; o.is_current = 'no'; if (!o.valid_to) o.valid_to = now; mark(o); }

  var bad = {};
  validateRows(products).forEach(function (i) { bad[i.row] = true; });
  var byId = Object.create(null), order = [];
  products.forEach(function (r) {
    if (isBlankRow(r)) return;
    var id = cellText(r.id);
    if (!id) return;
    if (byId[id]) { notes.push('duplicate id «' + id + '» (row ' + r.row + ') skipped'); return; }
    byId[id] = r; order.push(id);
  });

  var hBy = Object.create(null), hOrder = [], used = Object.create(null);
  hist.forEach(function (h) {
    if (!h.versionId || !h.productId) { notes.push('history row ' + h.row + ' has no versionId or productId, ignored'); return; }
    used[h.versionId] = true;
    if (!hBy[h.productId]) { hBy[h.productId] = []; hOrder.push(h.productId); }
    hBy[h.productId].push(h);
  });

  var ids = order.slice();
  hOrder.forEach(function (id) { if (!byId[id]) ids.push(id); });
  ids.forEach(function (id) {
    var list = hBy[id] || [];
    var row = byId[id];
    var cur = null;
    list.forEach(function (h) { if (h.current && (!cur || h.valid_from >= cur.valid_from)) cur = h; });
    list.forEach(function (h) {
      if (h.current && h !== cur) { close(h); notes.push('two current versions of «' + id + '»: ' + h.versionId + ' closed'); }
    });
    if (!row) { if (cur) close(cur); return; }
    if (bad[row.row]) return;

    var t = trackedOf_(row);
    var fresh = null;
    if (!cur || !sameTracked_(cur, t)) {
      if (cur) close(cur);
      var n = list.length;
      list.forEach(function (h) {
        var m = /-v(\d+)$/.exec(h.versionId);
        if (m && parseInt(m[1], 10) > n) n = parseInt(m[1], 10);
      });
      n += 1;
      while (used[id + '-v' + n]) n += 1;
      fresh = { isNew: true, row: 0, versionId: id + '-v' + n, productId: id, name: t.name, category: cellText(row.category),
        price: t.price, unit: t.unit, soldOut: t.soldOut, valid_from: now, valid_to: '', is_current: 'yes', current: true };
      used[fresh.versionId] = true;
      added.push(fresh);
    }
    var cat = cellText(row.category);
    list.forEach(function (h) { if (h.category !== cat) { h.category = cat; mark(h); } });
  });
  return { dirty: dirty, added: added, notes: notes };
}

// 'yyyy-MM-dd HH:mm:ss' (Tehran, Gregorian) → the Persian day 'yyyy-mm-dd' (the same shape as a ledger date), or ''.
function jalaliDayOf_(t) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(cellText(t));
  if (!m) return '';
  var j = toJalali_(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  return j.y + '-' + (j.m < 10 ? '0' : '') + j.m + '-' + (j.d < 10 ? '0' : '') + j.d;
}

// history objects → {productId: [{id, from, day, current}]}, each list sorted by valid_from (oldest first).
function versionMapOf_(hist) {
  var map = Object.create(null);
  hist.forEach(function (h) {
    if (!h.versionId || !h.productId) return;
    (map[h.productId] = map[h.productId] || []).push({ id: h.versionId, from: h.valid_from, day: jalaliDayOf_(h.valid_from), current: h.current, row: h.row });
  });
  Object.keys(map).forEach(function (k) {
    map[k].sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : a.row - b.row; });
  });
  return map;
}

// The versionId of a product valid on a Persian sale day 'yyyy-mm-dd': the newest version that started on or before
// that day (a version that started on the sale day itself counts). No such version → the current one → ''.
function versionFor_(map, productId, day) {
  var list = map && map[productId];
  if (!list || !list.length) return '';
  var pick = '';
  list.forEach(function (v) { if (v.day && v.day <= day) pick = v.id; });
  if (pick) return pick;
  var current = '';
  list.forEach(function (v) { if (v.current) current = v.id; });
  return current;
}

// The «تاریخچه محصولات» tab, checked: {sheet} or {message} (missing, first tab, or a broken header).
function historySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = typeof ss.getSheetByName === 'function' ? ss.getSheetByName(HISTORY_SHEET) : null;
  if (!sheet) return { message: MSG.noHistory };
  if (sheet.getIndex() === 1) return { message: MSG.historyFirst };
  var head = sheet.getRange(1, 1, 1, HISTORY_HEADER.length).getValues()[0].map(cellText);
  if (head.join('\n') !== HISTORY_HEADER.join('\n')) return { message: MSG.historyHeader };
  return { sheet: sheet };
}
function historyValues_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HISTORY_HEADER.length).getValues();
}

// ledger helper: the version map of every product ({} when the tab is missing or broken).
function versionMap_() {
  try {
    var t = historySheet_();
    if (!t.sheet) return {};
    return versionMapOf_(histFromValues_(historyValues_(t.sheet)));
  } catch (e) { return {}; }
}

function tehranNow_() {
  return Utilities.formatDate(new Date(nowMs_()), 'Asia/Tehran', 'yyyy-MM-dd HH:mm:ss');
}

// Compares the products tab with the history tab and writes the difference (history tab only; the products tab is
// only read). The CALLER holds the script lock. Returns {ok:true, changes, notes} or {ok:false, message} (skipped).
// Skipped (nothing written) when the history tab is missing/broken, the products columns are broken, or the products
// tab looks empty while versions exist (so a glitch can never close every version).
function captureVersions_() {
  var t = historySheet_();
  if (!t.sheet) return { ok: false, message: t.message };
  var data = readSheetRows();
  if (data.issues.length) return { ok: false, message: MSG.sheetProblems };
  var hist = histFromValues_(historyValues_(t.sheet));
  var live = productRows(data.rows);
  if (!live.length && hist.some(function (h) { return h.current; })) return { ok: false, message: 'products tab is empty, nothing changed' };

  var plan = planVersions_(data.rows, hist, tehranNow_());
  var sheet = t.sheet;
  plan.dirty.forEach(function (h) {
    sheet.getRange(h.row, 1, 1, HISTORY_HEADER.length).setValues([histRow_(h)]);
  });
  if (plan.added.length) {
    if (hist.length + plan.added.length > HISTORY_MAX_ROWS) {
      plan.notes.push('history tab is full, new versions not written');
      plan.added = [];
    } else {
      var at = sheet.getLastRow() + 1;
      var need = at + plan.added.length - 1;
      if (need > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(100, need - sheet.getMaxRows()));
      var range = sheet.getRange(at, 1, plan.added.length, HISTORY_HEADER.length);
      range.setNumberFormats(plan.added.map(function () { return HISTORY_HEADER.map(function () { return '@'; }); }));
      range.setValues(plan.added.map(histRow_));
    }
  }
  return { ok: true, changes: plan.dirty.length + plan.added.length, notes: plan.notes };
}

// captureVersions_ for the admin actions (the lock is already held there): best effort. A problem here never stops
// a product or ledger save; the hourly job tries again.
function captureQuiet_() {
  try { return captureVersions_(); } catch (e) { return { ok: false, message: 'capture failed' }; }
}

// The hourly time trigger (installed by setupVersioning): turns hand edits in the products tab into versions.
// Takes the script lock itself; if the admin is busy it simply skips this hour.
function hourlyVersioning() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 'BUSY';
  try {
    var r = captureVersions_();
    return r.ok ? 'OK: ' + r.changes + ' change(s)' + (r.notes.length ? '; ' + r.notes.join('; ') : '') : 'SKIPPED: ' + r.message;
  } finally { lock.releaseLock(); }
}

// Run this ONCE in the Apps Script editor after pasting Code.gs (and allow the new permission it asks for):
// makes the «تاریخچه محصولات» tab (or fixes its place and header) right after «مشتری‌ها» (or «خرید و فروش»), before
// «log», never first; gives every product that has none its first version (v1, valid from now); and installs
// exactly ONE hourly trigger for hourlyVersioning (older copies of it are removed first). Safe to run again; it
// never changes existing history rows. Do NOT publish this tab to the web.
function setupVersioning() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getNumSheets() < 1) return 'ERROR: the products tab is missing';
  var first = ss.getSheets()[0];
  if (first.getName() === HISTORY_SHEET) return 'ERROR: «' + HISTORY_SHEET + '» is the first tab; the products tab must be first';
  var sheet = ss.getSheetByName(HISTORY_SHEET);
  var anchor = ss.getSheetByName(CUSTOMER_SHEET) || ss.getSheetByName(LEDGER_SHEET);
  if (!sheet) sheet = ss.insertSheet(HISTORY_SHEET, anchor ? anchor.getIndex() : 1);   // 0-based: right after the anchor
  var lastRow = sheet.getLastRow();
  var head = lastRow ? sheet.getRange(1, 1, 1, HISTORY_HEADER.length).getValues()[0].map(cellText) : [];
  if (lastRow > 1 && head.join('\n') !== HISTORY_HEADER.join('\n')) {
    ss.setActiveSheet(ss.getSheets()[0]);
    return 'ERROR: row 1 of «' + HISTORY_SHEET + '» is not the expected header and the tab has data; fix it by hand';
  }
  sheet.getRange(1, 1, 1, HISTORY_HEADER.length).setValues([HISTORY_HEADER]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), HISTORY_HEADER.length).setNumberFormat('@');
  var mine = sheet.getIndex();
  var after = anchor ? anchor.getIndex() : 1;
  if (mine < after) after -= 1;
  var target = Math.max(2, after + 1);
  if (mine !== target) {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(target);
  }
  ss.setActiveSheet(ss.getSheets()[0]);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) return 'ERROR: busy, run setupVersioning again';
  var cap;
  try { cap = captureVersions_(); } finally { lock.releaseLock(); }

  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === HISTORY_TRIGGER) ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger(HISTORY_TRIGGER).timeBased().everyHours(1).create();
  return 'OK: «' + HISTORY_SHEET + '» is tab ' + sheet.getIndex() + ' of ' + ss.getNumSheets() + '; products tab is «' + ss.getSheets()[0].getName() +
    '»; ' + (cap.ok ? cap.changes + ' version row(s) written' : 'versions not written: ' + cap.message) + '; hourly trigger installed. Do not publish the history tab to the web.';
}
