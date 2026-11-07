// Admin page for the Bargin products sheet.
// Login: the person types their email; if it is allowed, a one-time 6-digit code is emailed to it by the Apps Script web app (SHOP.adminApi).
// The code gives a random session token; the page sends it with every request. The token is kept in
// sessionStorage (survives a reload in this tab, gone when the tab closes), with a memory fallback.
// Sheet data is shown with textContent only.
// Style: ES2017 only, like the rest of the site.
(function () {
  'use strict';

  var TEXT = {
    notSetUp: 'صفحه‌ی مدیریت هنوز راه‌اندازی نشده. لینک Apps Script رو توی products.js بذار.',
    loginIntro: 'برای ورود، ایمیلتو بنویس تا یه کد ۶ رقمی برات بفرستیم.',
    needEmail: 'ایمیلتو بنویس.',
    badEmail: 'این ایمیل درست به نظر نمی‌رسه. دوباره چکش کن.',
    codeSentTo: 'کد به {email} فرستاده شد (اگه این ایمیل مجاز باشه).',
    sendCode: 'ارسال کد به ایمیل',
    sendingCode: 'در حال فرستادن کد…',
    codeSent: 'ایمیلتو چک کن (پوشه‌ی اسپم رو هم نگاه کن). کد ده دقیقه اعتبار داره.',
    codeLabel: 'کد ۶ رقمی',
    codeHint: 'مثلاً ۱۲۳۴۵۶',
    login: 'ورود',
    checking: 'در حال بررسی کد…',
    resend: 'ارسال دوباره',
    resendIn: 'ارسال دوباره ({n})',
    needCode: 'کد ۶ رقمی رو وارد کن.',
    badCode: 'کد درست نیست. {n} بار دیگه می‌تونی امتحان کنی.',
    codeExpired: 'کد منقضی شده. یه کد تازه بخواه.',
    tooMany: 'چند بار اشتباه زدی و این کد باطل شد. یه کد تازه بخواه.',
    cooldown: 'تازه کد فرستادیم. {n} ثانیه دیگه می‌تونی دوباره بخوای.',
    limitHour: 'تو این یه ساعت چند بار کد خواستی. یه ساعت دیگه امتحان کن.',
    limitDay: 'امروز زیاد کد خواستی. فردا دوباره امتحان کن.',
    mailFail: 'نتونستیم ایمیل رو بفرستیم. چند دقیقه دیگه دوباره امتحان کن.',
    busy: 'سرور الان مشغوله. چند لحظه بعد دوباره امتحان کن.',
    expired: 'نشستت تموم شد. دوباره وارد شو. چیزی که نوشته بودی از بین نمی‌ره.',
    loggedOut: 'از حساب اومدی بیرون.',
    loading: 'در حال خوندن شیت…',
    saving: 'در حال ذخیره…',
    deleting: 'در حال حذف…',
    working: 'یه لحظه صبر کن…',
    count: 'تعداد محصول: {n}',
    empty: 'هنوز محصولی توی شیت نیست.',
    issuesTitle: 'این موارد باید درست بشن:',
    rowLabel: 'سطر {n}',
    noId: '(بدون شناسه)',
    inStock: 'موجود',
    soldOut: 'ناموجود',
    edit: 'ویرایش',
    editTitle: 'ویرایش: {name}',
    newTitle: 'محصول جدید',
    confirmDelete: 'مطمئنی می‌خوای «{name}» رو از شیت پاک کنی؟ این کار برگشت نداره.',
    saved: 'ذخیره شد. لیست به‌روز شد.',
    deleted: 'محصول پاک شد. لیست به‌روز شد.',
    saveBlocked: 'ذخیره نشد. اول مشکل‌ها رو درست کن.',
    deleteFail: 'پاک نشد.',
    loadFail: 'نتونستیم شیت رو بخونیم. دوباره امتحان کن.',
    network: 'به سرور وصل نشدیم. اینترنتت رو چک کن و دوباره امتحان کن.',
    serverFail: 'یه مشکلی پیش اومد. دوباره امتحان کن.',
    csvReady: 'فایل CSV آماده شد ({n} محصول).',
    csvBlocked: 'فایل ساخته نشد. اول مشکل‌ها رو درست کن.',
    newCategory: 'دسته‌بندی جدید…',
    newUnit: 'واحد جدید…',
    noUnit: 'بدون واحد',
    newCategoryHint: 'اسم دسته‌بندی جدید رو بنویس',
    newUnitHint: 'واحد جدید رو بنویس، مثلاً ۲۵۰ گرم',
    noIdEdit: 'این ردیف شناسه نداره. اول توی شیت شناسه بذار، بعد بارگذاری دوباره رو بزن.',
    fieldLabel: {
      id: 'شناسه (id)', name: 'اسم (name)', category: 'دسته‌بندی (category)', price: 'قیمت (price)',
      unit: 'واحد (unit)', serves: 'چقدر برای هر نفر؟ (serves)', short: 'متن کوتاه (short)',
      details: 'توضیحات (details)', recipe: 'دستور پخت (recipe)', images: 'عکس‌ها (images)', soldOut: 'ناموجود (soldOut)'
    },
    fieldHint: {
      id: 'انگلیسی و بدون فاصله. اگه عوضش کنی، ردیف همین‌جا تغییر می‌کنه.',
      price: 'فقط عدد. «,» و رقم فارسی اشکالی نداره. مثلاً ۴۲۰,۰۰۰',
      unit: 'مثلاً کیلو یا ۴۰۰ گرم',
      serves: 'مثلاً: هر نفر حدود ۱۰۰ گرم. یه پک برای ۴ نفر کافیه.',
      images: 'مسیر عکس‌ها رو با | از هم جدا کن. اولی روی کارت می‌آد.',
      recipe: 'خط اول: اسم غذا. خط‌های «- » مواد. خط‌های شماره‌دار: مراحل. بقیه: نکته.',
      soldOut: 'yes یا no. خالی یعنی no.'
    },
    // «خرید و فروش» (TODO: bargin-content to review the wording)
    lLoading: 'در حال خوندن خرید و فروش‌ها…',
    lCount: '{n} مورد',
    lCountFiltered: '{n} مورد از {all}',
    lEmpty: 'هنوز چیزی ثبت نکردی.',
    lEmptyFilter: 'تو این دسته چیزی نیست.',
    lMore: 'فقط {n} مورد آخر نشون داده شده.',
    lNewTitle: 'ثبت خرید یا فروش جدید',
    lEditTitle: 'ویرایش این مورد',
    lPickProduct: 'یه محصول انتخاب کن',
    lGone: '{name} (دیگه توی لیست محصولات نیست)',
    lNowNamed: '(الان: {name})',
    lSum: '{qty} {unit} × {price} تومان = {total} تومان',
    lTyped: 'قیمت هر واحد: {amount} {unit}',
    lParty: 'طرف حساب: {name}',
    lDelete: 'حذف',
    lConfirm: 'مطمئنی می‌خوای این مورد رو پاک کنی؟ این کار برگشت نداره.',
    lYes: 'آره، پاکش کن',
    lNo: 'نه',
    lSaved: 'ثبت شد 🌿',
    lUpdated: 'ذخیره شد 🌿',
    lDeleted: 'پاک شد.',
    lSaveBlocked: 'ثبت نشد. این موارد رو درست کن.',
    lLoadFail: 'نتونستیم خرید و فروش‌ها رو بخونیم. دوباره امتحان کن.',
    lNoProducts: 'اول باید محصولات خونده بشن. «بارگذاری دوباره» رو بزن.',
    lNeedDate: 'تاریخ رو کامل انتخاب کن.',
    lNeedType: 'نوع رو انتخاب کن: خرید یا فروش.',
    lNeedProduct: 'یه محصول از لیست انتخاب کن.',
    lBadQty: 'تعداد یا مقدار باید یه عدد بزرگ‌تر از صفر باشه (حداکثر دو رقم اعشار).',
    lBadPrice: 'قیمت هر واحد باید یه عدد بزرگ‌تر از صفر باشه (حداکثر سه رقم اعشار).',
    lTooBig: 'قیمت خیلی بزرگه. یه بار دیگه چکش کن.',
    lOther: 'سایر',
    lNeedOtherName: 'اسم محصول رو بنویس.',
    lLongOtherName: 'اسم محصول خیلی بلنده (حداکثر ۶۰ حرف).',
    months: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'],
    types: { buy: 'خرید', sell: 'فروش' },
    qtyUnits: { pack: 'بسته/ظرف', kg: 'کیلو', g: 'گرم', piece: 'عدد' },
    priceUnits: { thousand: 'هزار تومان', million: 'میلیون تومان' }
  };

  var HEADER = ['id', 'name', 'category', 'price', 'unit', 'serves', 'short', 'details', 'recipe', 'images', 'soldOut'];
  var TEXTAREA_ROWS = { serves: 2, short: 2, details: 4, recipe: 7, images: 2 };
  var LTR_FIELDS = { id: true, price: true, images: true, soldOut: true };
  var CHOICE_FIELDS = { category: true, unit: true };
  var NEW_VALUE = '__new__';   // value of the «new…» option (never a real category or unit)
  var SESSION_KEY = 'bargin-admin-session';
  var COOLDOWN_DEFAULT = 60;

  var memSession = '';     // fallback when sessionStorage is not available
  var EMAIL_KEY = 'bargin-admin-email';
  var memEmail = '';       // the typed email (fallback when sessionStorage is not available)
  var challenge = '';      // the id of the code we asked for
  var resendAt = 0;        // time (ms) when «ارسال دوباره» is allowed
  var resendTimer = 0;
  var loaded = false;      // the list was read at least once
  var products = [];       // rows from the sheet
  var editId = '';         // the id of the open product ('' = new)
  var busy = false;
  var view = 'products';   // the open section: 'products' or 'ledger'
  var ledger = [];         // rows of the «خرید و فروش» tab, newest first
  var ledgerMore = false;  // the server sent only the newest rows
  var ledgerLoaded = false;
  var ledgerFilter = 'all';
  var lEditId = '';        // the id of the open ledger row ('' = new)
  var lEditRow = null;     // the open ledger row (for its stored product name)
  var LEDGER_YEAR_MIN = 1395;
  // «سایر»: a ledger-only item with a typed name (not a shop product). Same reserved id as LEDGER_OTHER_ID in
  // Code.gs; it has non-ASCII letters, so no shop product can have it.
  var LEDGER_OTHER_ID = '*سایر*';
  var LEDGER_OTHER_MAX = 60;
  // Same cleaning as ledgerText_ in Code.gs: no control characters or line breaks, single spaces, trimmed.
  function cleanLedgerText(v) {
    return String(v || '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  }

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
  // ---- shared with admin/admin.js (end) ----

  function $(id) { return document.getElementById(id); }
  function fill(t, v) {
    return t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? String(v[k]) : m; });
  }
  function conf(name) {
    return (typeof SHOP !== 'undefined' && SHOP && SHOP[name]) ? String(SHOP[name]) : '';
  }
  function toFa(n) {
    return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(d); });
  }

  // ---- session (sessionStorage, memory fallback) ----
  function getSession() {
    try { var v = window.sessionStorage.getItem(SESSION_KEY); if (v) return v; } catch (e) { /* use memory */ }
    return memSession;
  }
  function setSession(v) {
    memSession = v || '';
    try {
      if (v) window.sessionStorage.setItem(SESSION_KEY, v); else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* memory only */ }
  }

  // The email typed on the login screen, kept only for this tab so the code screen can show it.
  function getEmail() {
    try { var v = window.sessionStorage.getItem(EMAIL_KEY); if (v) return v; } catch (e) { /* use memory */ }
    return memEmail;
  }
  function setEmail(v) {
    memEmail = v || '';
    try {
      if (v) window.sessionStorage.setItem(EMAIL_KEY, v); else window.sessionStorage.removeItem(EMAIL_KEY);
    } catch (e) { /* memory only */ }
  }
  function showSentTo() {
    var p = $('code-sent');
    var parts = TEXT.codeSentTo.split('{email}');
    p.textContent = '';
    p.appendChild(document.createTextNode(parts[0]));
    var b = document.createElement('bdi');
    b.textContent = getEmail();
    p.appendChild(b);
    p.appendChild(document.createTextNode(parts.slice(1).join('{email}')));
  }

  // ---- screens ----
  var SCREENS = ['s-setup', 's-login', 's-code', 's-app'];
  function show(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
  }
  function setStatus(text, kind) {
    var el = $('status');
    el.textContent = text || '';
    el.className = 'adm-status' + (kind ? ' ' + kind : '');
  }
  function setLoginStatus(id, text, kind) {
    var el = $(id);
    el.textContent = text || '';
    el.className = 'adm-status' + (kind ? ' ' + kind : '');
  }
  function setBusy(on) {
    busy = on;
    ['reload', 'add-new', 'download', 'save', 'delete', 'confirm-yes', 'l-reload', 'l-add', 'l-save'].forEach(function (id) { $(id).disabled = on; });
    var yes = document.querySelectorAll('.l-yes');
    for (var i = 0; i < yes.length; i++) yes[i].disabled = on;
  }
  function showSetup(text) {
    $('setup-msg').textContent = text;
    show('s-setup');
  }

  // ---- API ----
  // Sends {action, data, session} as text/plain (no CORS preflight). Resolves with the answer's
  // `data`, or rejects with the whole answer plus {code}. Codes: NO_SESSION, BUSY, network, server,
  // bad_request, unknown_action and the login codes (COOLDOWN, LIMIT_HOUR, LIMIT_DAY, MAIL_FAIL,
  // BAD_CODE, CODE_EXPIRED, TOO_MANY).
  function api(action, data, needSession) {
    var session = getSession();
    if (needSession && !session) return Promise.reject({ code: 'NO_SESSION' });
    return fetch(conf('adminApi'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, data: data || {}, session: session }),
      redirect: 'follow'
    }).then(function (res) {
      return res.json();
    }, function () {
      throw { code: 'network' };
    }).then(function (json) {
      if (!json || json.ok !== true) {
        var e = { code: (json && json.error) || 'server' };
        if (json && typeof json.retryAfter === 'number') e.retryAfter = json.retryAfter;
        if (json && typeof json.triesLeft === 'number') e.triesLeft = json.triesLeft;
        throw e;
      }
      return json.data;
    }, function (err) {
      throw err && err.code ? err : { code: 'server' };
    });
  }

  // Handles an API error: back to login (the form stays as it is) or a message.
  function onApiError(err, fallbackText) {
    var code = err && err.code;
    if (code === 'NO_SESSION') { backToLogin(TEXT.expired); return; }
    if (code === 'network') { setStatus(TEXT.network, 'err'); return; }
    if (code === 'BUSY') { setStatus(TEXT.busy, 'err'); return; }
    setStatus(fallbackText || TEXT.serverFail, 'err');
  }

  // The session ended: show the login again but keep the list and the open form.
  function backToLogin(message) {
    setSession('');
    setBusy(false);
    challenge = '';
    stopCountdown();
    $('code').value = '';
    setLoginStatus('login-status', message || '', message ? 'err' : '');
    setLoginStatus('code-status', '');
    show('s-login');
  }

  // ---- login ----
  function stopCountdown() {
    if (resendTimer) { clearInterval(resendTimer); resendTimer = 0; }
  }

  function tickResend() {
    var left = Math.ceil((resendAt - Date.now()) / 1000);
    var btn = $('resend');
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = fill(TEXT.resendIn, { n: toFa(left) });
    } else {
      stopCountdown();
      btn.disabled = false;
      btn.textContent = TEXT.resend;
    }
  }

  function startCountdown(seconds) {
    resendAt = Date.now() + seconds * 1000;
    stopCountdown();
    tickResend();
    resendTimer = setInterval(tickResend, 500);
  }

  function codeError(err) {
    switch (err && err.code) {
      case 'COOLDOWN': return fill(TEXT.cooldown, { n: toFa(err.retryAfter || COOLDOWN_DEFAULT) });
      case 'LIMIT_HOUR': return TEXT.limitHour;
      case 'LIMIT_DAY': return TEXT.limitDay;
      case 'MAIL_FAIL': return TEXT.mailFail;
      case 'BAD_CODE': return err.triesLeft !== undefined ? fill(TEXT.badCode, { n: toFa(err.triesLeft) }) : TEXT.needCode;
      case 'CODE_EXPIRED': return TEXT.codeExpired;
      case 'TOO_MANY': return TEXT.tooMany;
      case 'bad_request': return TEXT.badEmail;
      case 'BUSY': return TEXT.busy;
      case 'network': return TEXT.network;
      default: return TEXT.serverFail;
    }
  }

  // Asks the server to email a code. `fromCodeScreen` = the «ارسال دوباره» button.
  function sendCode(fromCodeScreen) {
    if (busy) return;
    var statusId = fromCodeScreen ? 'code-status' : 'login-status';
    var email = fromCodeScreen ? getEmail() : $('email').value.trim();
    if (!email) { setLoginStatus('login-status', TEXT.needEmail, 'err'); if (fromCodeScreen) { show('s-login'); } $('email').focus(); return; }
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) { setLoginStatus('login-status', TEXT.badEmail, 'err'); $('email').focus(); return; }
    setEmail(email);
    $('email').value = email;
    busy = true;
    $('send').disabled = true;
    setLoginStatus(statusId, TEXT.sendingCode);
    api('requestCode', { email: email }, false).then(function (d) {
      busy = false;
      $('send').disabled = false;
      challenge = String(d && d.challenge || '');
      $('code').value = '';
      show('s-code');
      showSentTo();
      setLoginStatus('code-status', TEXT.codeSent, 'ok');
      setLoginStatus('login-status', '');
      startCountdown(d && typeof d.cooldown === 'number' ? d.cooldown : COOLDOWN_DEFAULT);
      $('code').focus();
    }, function (err) {
      busy = false;
      $('send').disabled = false;
      setLoginStatus(statusId, codeError(err), 'err');
      if (err && err.code === 'COOLDOWN' && fromCodeScreen) startCountdown(err.retryAfter || COOLDOWN_DEFAULT);
    });
  }

  function onLoggedIn() {
    show('s-app');
    if (!loaded) {
      setStatus(TEXT.loading);
      load().then(function () { if (view === 'ledger' && !ledgerLoaded) loadLedger(); });
    } else if (view === 'ledger' && !ledgerLoaded) {
      loadLedger();
    } else { setStatus(''); }
  }

  function verify(ev) {
    ev.preventDefault();
    if (busy) return;
    var code = $('code').value.replace(/[\s\u200c\u200f\u200e]/g, '');
    if (!code) { setLoginStatus('code-status', TEXT.needCode, 'err'); return; }
    busy = true;
    $('verify').disabled = true;
    setLoginStatus('code-status', TEXT.checking);
    api('verifyCode', { challenge: challenge, code: code }, false).then(function (d) {
      busy = false;
      $('verify').disabled = false;
      if (!d || typeof d.session !== 'string' || !d.session) { setLoginStatus('code-status', TEXT.serverFail, 'err'); return; }
      setSession(d.session);
      challenge = '';
      stopCountdown();
      $('code').value = '';
      setLoginStatus('code-status', '');
      onLoggedIn();
    }, function (err) {
      busy = false;
      $('verify').disabled = false;
      setLoginStatus('code-status', codeError(err), 'err');
      if (err && (err.code === 'CODE_EXPIRED' || err.code === 'TOO_MANY')) { challenge = ''; }
      $('code').select();
    });
  }

  // Logout goes through the server (the session is deleted there), then everything is cleared.
  function logout() {
    var done = function () {
      setSession('');
      challenge = '';
      loaded = false;
      products = [];
      renderList();
      showIssues([]);
      closeForm();
      ledger = [];
      ledgerLoaded = false;
      ledgerMore = false;
      closeLedgerForm();
      renderLedger();
      showView('products');
      setStatus('');
      setBusy(false);
      $('code').value = '';
      stopCountdown();
      setLoginStatus('code-status', '');
      setLoginStatus('login-status', TEXT.loggedOut, 'ok');
      show('s-login');
    };
    api('logout', {}, false).then(done, done);
  }

  // ---- list ----
  function showIssues(issues) {
    var box = $('issues');
    var ul = $('issues-list');
    ul.textContent = '';
    if (!issues || !issues.length) { box.hidden = true; return; }
    $('issues-title').textContent = TEXT.issuesTitle;
    issues.forEach(function (it) {
      var li = document.createElement('li');
      if (it.row) {
        var no = document.createElement('span');
        no.className = 'row-no';
        no.textContent = fill(TEXT.rowLabel, { n: toFa(it.row) }) + ':';
        li.appendChild(no);
        li.appendChild(document.createTextNode(' '));
      }
      li.appendChild(document.createTextNode(String(it.message)));
      ul.appendChild(li);
    });
    box.hidden = false;
  }

  function renderList() {
    var ul = $('list');
    ul.textContent = '';
    var rows = products.filter(function (r) {
      return HEADER.some(function (h) { return String(r[h] || '').trim() !== ''; });
    });
    $('count').textContent = rows.length ? fill(TEXT.count, { n: toFa(rows.length) }) : TEXT.empty;
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.appendChild(document.createTextNode(String(r.name || '') || TEXT.noId));
      var small = document.createElement('small');
      small.textContent = [r.id || TEXT.noId, r.category, r.price].filter(function (x) { return x; }).join(' · ');
      nm.appendChild(small);
      var tag = document.createElement('span');
      var out = String(r.soldOut || '').toLowerCase() === 'yes';
      tag.className = 'tag' + (out ? ' out' : '');
      tag.textContent = out ? TEXT.soldOut : TEXT.inStock;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost';
      btn.textContent = TEXT.edit;
      btn.addEventListener('click', function () { openForm(r); });
      li.appendChild(nm);
      li.appendChild(tag);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function load(keepMessage) {
    setBusy(true);
    if (!keepMessage) setStatus(TEXT.loading);
    return api('getProducts', {}, true).then(function (d) {
      products = (d && d.rows) || [];
      loaded = true;
      renderList();
      showIssues((d && d.issues) || []);
      if (!keepMessage) setStatus('');
      setBusy(false);
    }, function (err) {
      setBusy(false);
      onApiError(err, TEXT.loadFail);
    });
  }

  // ---- form ----
  function buildFields() {
    var box = $('fields');
    box.textContent = '';
    HEADER.forEach(function (h) {
      var label = document.createElement('label');
      label.setAttribute('for', 'f-' + h);
      label.appendChild(document.createTextNode(TEXT.fieldLabel[h]));
      if (TEXT.fieldHint[h]) {
        var hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = TEXT.fieldHint[h];
        label.appendChild(hint);
      }
      if (CHOICE_FIELDS[h] || h === 'soldOut') {
        var sel = document.createElement('select');
        sel.id = 'f-' + h;
        if (h === 'soldOut') {
          [['no', 'no'], ['yes', 'yes']].forEach(function (o) {
            var op = document.createElement('option');
            op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
          });
          sel.className = 'ltr';
        } else {
          sel.addEventListener('change', function () { syncChoice(h); });
        }
        box.appendChild(label);
        box.appendChild(sel);
        if (CHOICE_FIELDS[h]) {
          var extra = document.createElement('input');
          extra.type = 'text';
          extra.id = 'f-' + h + '-new';
          extra.autocomplete = 'off';
          extra.hidden = true;
          extra.setAttribute('aria-label', h === 'category' ? TEXT.newCategoryHint : TEXT.newUnitHint);
          extra.placeholder = h === 'category' ? TEXT.newCategoryHint : TEXT.newUnitHint;
          box.appendChild(extra);
        }
        return;
      }
      var input = TEXTAREA_ROWS[h] ? document.createElement('textarea') : document.createElement('input');
      if (TEXTAREA_ROWS[h]) input.rows = TEXTAREA_ROWS[h]; else input.type = 'text';
      input.id = 'f-' + h;
      input.autocomplete = 'off';
      if (LTR_FIELDS[h]) input.className = 'ltr';
      box.appendChild(label);
      box.appendChild(input);
    });
  }

  function syncChoice(h) {
    var isNew = $('f-' + h).value === NEW_VALUE;
    $('f-' + h + '-new').hidden = !isNew;
    if (isNew) $('f-' + h + '-new').focus();
  }

  // Fill a category/unit dropdown from the loaded products (order of first appearance).
  function fillChoice(h, current) {
    var sel = $('f-' + h);
    var seen = {}, list = [];
    products.forEach(function (r) {
      var v = String(r[h] || '').trim();
      if (v && !seen[v]) { seen[v] = true; list.push(v); }
    });
    current = String(current || '').trim();
    if (current && !seen[current]) list.push(current);
    sel.textContent = '';
    function add(value, text) {
      var op = document.createElement('option');
      op.value = value;
      op.textContent = text;
      sel.appendChild(op);
    }
    if (h === 'unit') add('', TEXT.noUnit);
    list.forEach(function (v) { add(v, v); });
    add(NEW_VALUE, h === 'category' ? TEXT.newCategory : TEXT.newUnit);
    sel.value = current;
    if (sel.value !== current) sel.value = h === 'unit' ? '' : (list[0] !== undefined ? list[0] : NEW_VALUE);
    $('f-' + h + '-new').value = '';
    syncChoice(h);
  }

  function openForm(row) {
    editId = row ? String(row.id || '') : '';
    if (row && !editId) { setStatus(TEXT.noIdEdit, 'err'); return; }
    HEADER.forEach(function (h) {
      if (CHOICE_FIELDS[h]) { fillChoice(h, row ? row[h] : ''); return; }
      $('f-' + h).value = row ? String(row[h] || '') : '';
    });
    if (!row) $('f-soldOut').value = 'no';
    else if (String(row.soldOut || '').toLowerCase() === 'yes') $('f-soldOut').value = 'yes';
    else $('f-soldOut').value = 'no';
    $('form-title').textContent = row ? fill(TEXT.editTitle, { name: row.name || row.id }) : TEXT.newTitle;
    $('delete').hidden = !row;
    $('confirm').hidden = true;
    $('form').hidden = false;
    $('list-card').hidden = true;
    setStatus('');
    $('f-' + (row ? 'name' : 'id')).focus();
    $('form').scrollIntoView();
  }

  function closeForm() {
    editId = '';
    $('form').hidden = true;
    $('confirm').hidden = true;
    $('list-card').hidden = false;
  }

  function collect() {
    var item = {};
    HEADER.forEach(function (h) {
      var v = $('f-' + h).value;
      if (CHOICE_FIELDS[h] && v === NEW_VALUE) v = $('f-' + h + '-new').value;
      item[h] = CHOICE_FIELDS[h] ? String(v).trim() : v;
    });
    return item;
  }

  function save(ev) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.saving);
    showIssues([]);
    api('saveProduct', { item: collect(), originalId: editId }, true).then(function (r) {
      if (r && r.ok) {
        closeForm();
        setStatus(TEXT.saved, 'ok');
        return load(true);
      }
      setBusy(false);
      setStatus(TEXT.saveBlocked, 'err');
      showIssues((r && r.issues) || (r && r.message ? [{ row: null, message: r.message }] : []));
    }, function (err) {
      setBusy(false);
      onApiError(err);
    });
  }

  function askDelete() {
    var name = $('f-name').value || editId;
    $('confirm-text').textContent = fill(TEXT.confirmDelete, { name: name });
    $('confirm').hidden = false;
  }

  function doDelete() {
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.deleting);
    api('deleteProduct', { id: editId }, true).then(function (r) {
      if (r && r.ok) {
        closeForm();
        setStatus(TEXT.deleted, 'ok');
        return load(true);
      }
      setBusy(false);
      $('confirm').hidden = true;
      setStatus((r && r.message) || TEXT.deleteFail, 'err');
    }, function (err) {
      setBusy(false);
      onApiError(err, TEXT.deleteFail);
    });
  }

  // ---- «خرید و فروش» (buys and sells, owner approved 2026-11-07) ----
  // Every row shows its own total (qty × unit price). No sums over rows anywhere (owner's rule).
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function groupFa(n) { return toFa(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')); }
  function decFa(text) { return toFa(String(text)).replace('.', '٫'); }
  function dateFa(d) { return toFa(String(d).replace(/-/g, '/')); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayJ() { var d = new Date(); return toJalali_(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function productById(id) {
    for (var i = 0; i < products.length; i++) if (String(products[i].id || '').trim() === id) return products[i];
    return null;
  }

  function showView(v) {
    view = v;
    $('v-products').hidden = v !== 'products';
    $('v-ledger').hidden = v !== 'ledger';
    $('tab-products').setAttribute('aria-pressed', String(v === 'products'));
    $('tab-ledger').setAttribute('aria-pressed', String(v === 'ledger'));
    showIssues([]);
    setStatus('');
  }

  function openLedgerView() {
    if (busy || view === 'ledger') return;
    showView('ledger');
    if (ledgerLoaded) return;
    if (loaded) { loadLedger(); return; }
    load().then(function () { if (getSession() && view === 'ledger') loadLedger(); });
  }

  function loadLedger(keepMessage) {
    setBusy(true);
    if (!keepMessage) setStatus(TEXT.lLoading);
    return api('getLedger', {}, true).then(function (r) {
      setBusy(false);
      if (!r || !r.ok) {
        ledger = [];
        ledgerLoaded = false;
        renderLedger();
        setStatus((r && r.message) || TEXT.lLoadFail, 'err');
        return;
      }
      ledger = r.entries || [];
      ledgerMore = !!r.more;
      ledgerLoaded = true;
      renderLedger();
      if (!keepMessage) setStatus('');
    }, function (err) {
      setBusy(false);
      onApiError(err, TEXT.lLoadFail);
    });
  }

  function renderLedger() {
    var ul = $('l-list');
    ul.textContent = '';
    var rows = ledger.filter(function (e) { return ledgerFilter === 'all' || e.type === ledgerFilter; });
    var count;
    if (!ledger.length) count = TEXT.lEmpty;
    else if (ledgerFilter === 'all') count = fill(TEXT.lCount, { n: toFa(ledger.length) });
    else count = rows.length ? fill(TEXT.lCountFiltered, { n: toFa(rows.length), all: toFa(ledger.length) }) : TEXT.lEmptyFilter;
    if (ledgerMore) count += ' ' + fill(TEXT.lMore, { n: toFa(ledger.length) });
    $('l-count').textContent = count;
    var btns = document.querySelectorAll('[data-filter]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-filter') === ledgerFilter));
    rows.forEach(function (e) { ul.appendChild(ledgerItem(e)); });
  }

  function ledgerItem(e) {
    var li = el('li');
    var top = el('div', 'l-top');
    top.appendChild(el('span', 'l-date', dateFa(e.date)));
    top.appendChild(el('span', 'tag' + (e.type ? ' t-' + e.type : ''), TEXT.types[e.type] || e.typeText || ''));
    li.appendChild(top);

    var isOther = e.productId === LEDGER_OTHER_ID;
    var prod = el('div', 'l-prod', e.productName || (isOther ? TEXT.lOther : e.productId) || '');
    var now = isOther ? null : productById(e.productId);
    if (isOther) {
      prod.appendChild(document.createTextNode(' '));
      prod.appendChild(el('span', 'tag t-other', TEXT.lOther));
    }
    if (now && now.name && String(now.name).trim() !== e.productName) {
      prod.appendChild(document.createTextNode(' '));
      prod.appendChild(el('small', '', fill(TEXT.lNowNamed, { name: String(now.name).trim() })));
    }
    li.appendChild(prod);

    if (e.qty !== null && e.priceToman !== null && e.rowToman !== null) {
      var sum = el('div', 'l-sum');
      sum.appendChild(el('bdi', '', fill(TEXT.lSum, {
        qty: decFa(e.qty), unit: TEXT.qtyUnits[e.qtyUnit] || e.qtyUnitText || '',
        price: groupFa(e.priceToman), total: groupFa(e.rowToman)
      })));
      li.appendChild(sum);
    }
    if (e.priceAmount) {
      li.appendChild(el('small', 'l-more', fill(TEXT.lTyped, { amount: decFa(e.priceAmount), unit: TEXT.priceUnits[e.priceUnit] || e.priceUnitText || '' })));
    }
    if (e.party) li.appendChild(el('small', 'l-more', fill(TEXT.lParty, { name: e.party })));
    if (e.note) li.appendChild(el('small', 'l-more', e.note));

    var actions = el('div', 'l-actions');
    var edit = el('button', 'btn btn-ghost', TEXT.edit);
    edit.type = 'button';
    edit.addEventListener('click', function () { openLedgerForm(e); });
    var del = el('button', 'btn btn-danger', TEXT.lDelete);
    del.type = 'button';
    actions.appendChild(edit);
    actions.appendChild(del);
    li.appendChild(actions);

    var confirmBox = el('div', 'adm-confirm');
    confirmBox.hidden = true;
    confirmBox.appendChild(el('p', '', TEXT.lConfirm));
    var bar = el('div', 'adm-bar');
    var yes = el('button', 'btn btn-danger l-yes', TEXT.lYes);
    yes.type = 'button';
    var no = el('button', 'btn btn-ghost', TEXT.lNo);
    no.type = 'button';
    bar.appendChild(yes);
    bar.appendChild(no);
    confirmBox.appendChild(bar);
    li.appendChild(confirmBox);
    del.addEventListener('click', function () { confirmBox.hidden = false; no.focus(); });
    no.addEventListener('click', function () { confirmBox.hidden = true; del.focus(); });
    yes.addEventListener('click', function () { deleteLedger(e.id); });
    return li;
  }

  // ---- «خرید و فروش» form ----
  function addOption(sel, value, text) {
    var op = document.createElement('option');
    op.value = value;
    op.textContent = text;
    sel.appendChild(op);
  }

  function rebuildDays() {
    var y = parseInt($('l-year').value, 10), m = parseInt($('l-month').value, 10);
    var sel = $('l-day');
    var keep = parseInt(sel.value, 10) || 1;
    var max = jalaliMonthDays_(y, m);
    sel.textContent = '';
    for (var d = 1; d <= max; d++) addOption(sel, String(d), toFa(d));
    sel.value = String(Math.min(keep, max));
  }

  function setDateFields(y, m, d) {
    var ys = $('l-year');
    var t = todayJ();
    ys.textContent = '';
    var from = Math.min(LEDGER_YEAR_MIN, y), to = Math.max(t.y + 1, y);
    for (var k = to; k >= from; k--) addOption(ys, String(k), toFa(k));
    ys.value = String(y);
    $('l-month').value = String(m);
    $('l-day').value = String(d);
    rebuildDays();
    $('l-day').value = String(Math.min(d, jalaliMonthDays_(y, m)));
  }

  function fillProductOptions(keepId, keepName) {
    var sel = $('l-product');
    sel.textContent = '';
    addOption(sel, '', TEXT.lPickProduct);
    var seen = {};
    products.forEach(function (r) {
      var id = String(r.id || '').trim(), name = String(r.name || '').trim();
      if (!id || !name || seen[id] || id === LEDGER_OTHER_ID) return;
      seen[id] = true;
      addOption(sel, id, name);
    });
    if (keepId && !seen[keepId] && keepId !== LEDGER_OTHER_ID) addOption(sel, keepId, fill(TEXT.lGone, { name: keepName || keepId }));
    addOption(sel, LEDGER_OTHER_ID, TEXT.lOther);
    sel.value = keepId || '';
    $('l-other-name').value = keepId === LEDGER_OTHER_ID ? keepName || '' : '';
    syncOther();
  }

  // The «اسم محصول» box is shown only while «سایر» is selected.
  function syncOther() {
    $('l-other-wrap').hidden = $('l-product').value !== LEDGER_OTHER_ID;
  }

  function syncPills() {
    ['buy', 'sell'].forEach(function (t) {
      var input = $('l-type-' + t);
      input.parentNode.className = input.checked ? 'on' : '';
    });
  }

  function updatePreview() {
    var m = ledgerMath_($('l-qty').value, $('l-price').value, $('l-price-unit').value);
    $('l-preview').textContent = m.rowToman === null ? '' : fill(TEXT.lSum, {
      qty: decFa(m.qtyText), unit: TEXT.qtyUnits[$('l-qty-unit').value] || '',
      price: groupFa(m.unitToman), total: groupFa(m.rowToman)
    });
  }

  function openLedgerForm(e) {
    if (busy) return;
    lEditId = e ? e.id : '';
    lEditRow = e || null;
    showIssues([]);
    var parts = e ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.date) : null;
    var t = todayJ();
    if (parts) setDateFields(parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3], 10));
    else setDateFields(t.y, t.m, t.d);
    $('l-type-buy').checked = !!e && e.type === 'buy';
    $('l-type-sell').checked = !!e && e.type === 'sell';
    syncPills();
    fillProductOptions(e ? e.productId : '', e ? e.productName : '');
    $('l-qty').value = e && e.qty !== null ? decFa(e.qty) : '';
    $('l-qty-unit').value = e && e.qtyUnit ? e.qtyUnit : 'pack';
    $('l-price').value = e && e.priceAmount ? decFa(e.priceAmount) : '';
    $('l-price-unit').value = e && e.priceUnit ? e.priceUnit : 'thousand';
    $('l-party').value = e ? e.party || '' : '';
    $('l-note').value = e ? e.note || '' : '';
    $('l-form-title').textContent = e ? TEXT.lEditTitle : TEXT.lNewTitle;
    updatePreview();
    $('l-form').hidden = false;
    $('l-list-card').hidden = true;
    setStatus(products.length ? '' : TEXT.lNoProducts, products.length ? '' : 'err');
    $('l-form').scrollIntoView();
    $('l-day').focus();
  }

  function closeLedgerForm() {
    lEditId = '';
    lEditRow = null;
    $('l-form').hidden = true;
    $('l-list-card').hidden = false;
  }

  function collectLedger() {
    var type = $('l-type-buy').checked ? 'buy' : ($('l-type-sell').checked ? 'sell' : '');
    return {
      date: $('l-year').value + '-' + pad2(parseInt($('l-month').value, 10)) + '-' + pad2(parseInt($('l-day').value, 10)),
      type: type,
      productId: $('l-product').value,
      productName: $('l-product').value === LEDGER_OTHER_ID ? cleanLedgerText($('l-other-name').value) : '',
      qty: $('l-qty').value,
      qtyUnit: $('l-qty-unit').value,
      price: $('l-price').value,
      priceUnit: $('l-price-unit').value,
      party: $('l-party').value,
      note: $('l-note').value
    };
  }

  // The same checks as the server (the server checks again; it is the real guard).
  function ledgerIssues(entry) {
    var out = [];
    function add(m) { out.push({ row: null, message: m }); }
    if (!ledgerDate_(entry.date)) add(TEXT.lNeedDate);
    if (!entry.type) add(TEXT.lNeedType);
    if (!entry.productId) add(TEXT.lNeedProduct);
    else if (entry.productId === LEDGER_OTHER_ID) {
      if (!entry.productName) add(TEXT.lNeedOtherName);
      else if (entry.productName.length > LEDGER_OTHER_MAX) add(TEXT.lLongOtherName);
    }
    var m = ledgerMath_(entry.qty, entry.price, entry.priceUnit);
    if (m.qty === null) add(TEXT.lBadQty);
    if (m.tooBig) add(TEXT.lTooBig);
    else if (m.unitToman === null) add(TEXT.lBadPrice);
    return out;
  }

  function saveLedger(ev) {
    ev.preventDefault();
    if (busy) return;
    var entry = collectLedger();
    var issues = ledgerIssues(entry);
    if (issues.length) { setStatus(TEXT.lSaveBlocked, 'err'); showIssues(issues); return; }
    var wasEdit = !!lEditId;
    setBusy(true);
    setStatus(TEXT.saving);
    showIssues([]);
    api('saveLedgerRow', { entry: entry, id: lEditId }, true).then(function (r) {
      if (r && r.ok) {
        closeLedgerForm();
        setStatus(wasEdit ? TEXT.lUpdated : TEXT.lSaved, 'ok');
        return loadLedger(true);
      }
      setBusy(false);
      setStatus(TEXT.lSaveBlocked, 'err');
      showIssues((r && r.issues) || (r && r.message ? [{ row: null, message: r.message }] : []));
    }, function (err) {
      setBusy(false);
      onApiError(err);
    });
  }

  function deleteLedger(id) {
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.deleting);
    api('deleteLedgerRow', { id: id }, true).then(function (r) {
      if (r && r.ok) {
        setStatus(TEXT.lDeleted, 'ok');
        return loadLedger(true);
      }
      setBusy(false);
      setStatus((r && r.message) || TEXT.deleteFail, 'err');
    }, function (err) {
      setBusy(false);
      onApiError(err, TEXT.deleteFail);
    });
  }

  function initLedger() {
    TEXT.months.forEach(function (name, i) { addOption($('l-month'), String(i + 1), name); });
    $('tab-products').addEventListener('click', function () { if (!busy && view !== 'products') showView('products'); });
    $('tab-ledger').addEventListener('click', openLedgerView);
    $('l-reload').addEventListener('click', function () {
      if (busy) return;
      closeLedgerForm();
      showIssues([]);
      load(true).then(function () { if (getSession()) loadLedger(); });
    });
    $('l-add').addEventListener('click', function () { openLedgerForm(null); });
    $('l-logout').addEventListener('click', logout);
    $('l-form').addEventListener('submit', saveLedger);
    $('l-cancel').addEventListener('click', function () { closeLedgerForm(); showIssues([]); setStatus(''); });
    $('l-year').addEventListener('change', rebuildDays);
    $('l-month').addEventListener('change', rebuildDays);
    $('l-product').addEventListener('change', function () {
      syncOther();
      if (this.value === LEDGER_OTHER_ID) $('l-other-name').focus();
    });
    ['l-type-buy', 'l-type-sell'].forEach(function (id) { $(id).addEventListener('change', syncPills); });
    ['l-qty', 'l-price'].forEach(function (id) { $(id).addEventListener('input', updatePreview); });
    ['l-qty-unit', 'l-price-unit'].forEach(function (id) { $(id).addEventListener('change', updatePreview); });
    var btns = document.querySelectorAll('[data-filter]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { ledgerFilter = this.getAttribute('data-filter'); renderLedger(); });
    }
  }

  // ---- CSV backup ----
  function download() {
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.working);
    api('publishCsv', {}, true).then(function (r) {
      setBusy(false);
      if (!r || !r.ok) {
        setStatus(TEXT.csvBlocked, 'err');
        showIssues((r && r.issues) || []);
        return;
      }
      showIssues([]);
      var blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'products.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      setStatus(fill(TEXT.csvReady, { n: toFa(r.count) }), 'ok');
    }, function (err) {
      setBusy(false);
      onApiError(err);
    });
  }

  // ---- start ----
  function init() {
    buildFields();
    initLedger();
    $('reload').addEventListener('click', function () { if (!busy) { closeForm(); showIssues([]); load(); } });
    $('add-new').addEventListener('click', function () { openForm(null); });
    $('download').addEventListener('click', download);
    $('logout').addEventListener('click', logout);
    $('email-form').addEventListener('submit', function (ev) { ev.preventDefault(); sendCode(false); });
    $('resend').addEventListener('click', function () { sendCode(true); });
    $('code-form').addEventListener('submit', verify);
    $('form').addEventListener('submit', save);
    $('cancel').addEventListener('click', closeForm);
    $('delete').addEventListener('click', askDelete);
    $('confirm-no').addEventListener('click', function () { $('confirm').hidden = true; });
    $('confirm-yes').addEventListener('click', doDelete);

    if (!conf('adminApi')) { showSetup(TEXT.notSetUp); return; }
    $('email').value = getEmail();
    if (getSession()) { onLoggedIn(); } else { show('s-login'); }
  }

  init();
})();
