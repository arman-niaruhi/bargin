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
    lSum: '{qty} {unit}{pack} × {price} تومان = {total} تومان',
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
    lPickCustomer: 'مشتری رو انتخاب کن',
    lNoCustomerMatch: 'مشتری‌ای با این اسم پیدا نشد',
    lNewCustomer: '+ مشتری جدید',
    lCustomerOption: '{n} — {name}',
    lCustomerLine: 'مشتری: ',
    lOldName: 'اسم قبلی: {name}',
    lNeedCustomer: 'مشتری رو انتخاب کن.',
    lNeedFirst: 'اسم مشتری رو بنویس.',
    lNeedLast: 'فامیل مشتری رو بنویس.',
    lLongName: 'اسم و فامیل هر کدوم حداکثر ۳۰ حرف.',
    lPersianName: 'اسم و فامیل مشتری رو با حروف انگلیسی بنویس، مثلاً zahra ahmadi.',
    lBadName: 'توی اسم و فامیل فقط حروف انگلیسی، فاصله، - و \' قبوله.',
    lNeedChannel: 'بگو فروش از کجا بود: سایت یا حضوری.',
    lReused: 'این مشتری از قبل بود ({n})؛ همونو استفاده کردیم',
    lMerged: 'به سفارش {n} همون روز اضافه شد 🌿',
    lOldServer: 'برای ثبت فروش، اول Apps Script رو به‌روز کن (Code.gs تازه، setupLedger، setupCustomers، نسخه‌ی جدید).',
    // multi-product orders (TODO: bargin-content to review the wording)
    lNewOrderBtn: 'سفارش جدید',
    lNewOrder: 'سفارش جدید',
    lEditOrder: 'ویرایش سفارش {n}',
    lOrderNo: 'سفارش {n}',
    lOrderConfirm: 'مطمئنی می‌خوای کل سفارش رو پاک کنی؟ این کار برگشت نداره.',
    lOrderTotal: 'جمع این سفارش: {total} تومان',
    lOrderCount: '{n} قلم',
    oTotalNone: 'هنوز محصولی انتخاب نشده.',
    oTotalNoPrice: 'قیمت بعضی خط‌ها رو هم بنویس.',
    oSelected: '{n} تا انتخاب شده',
    oShopPrice: 'قیمت توی فروشگاه: {price}',
    oGoneGroup: 'از قبل تو این سفارش بودن',
    oGoneTag: 'الان تو لیست فروشگاه نیست',
    oQty: 'تعداد',
    oQtyUnit: 'واحد',
    oPrice: 'قیمت هر واحد',
    oPriceUnit: 'تومان',
    oPack: 'وزن هر بسته',   // TODO: bargin-content to review the wording
    oPackHint: 'اختیاری، مثلاً ۵۰۰ گرم',
    lLongPack: 'وزن هر بسته حداکثر ۲۰ حرف.',
    lOldServer4: 'برای ثبت نسخه‌ی قیمت محصول، اول Apps Script رو به‌روز کن (Code.gs تازه، setupVersioning، setupLedger، نسخه‌ی جدید).',
    lOldServer3: 'برای ثبت وزن هر بسته، اول Apps Script رو به‌روز کن (Code.gs تازه، setupLedger، نسخه‌ی جدید).',
    oOtherName: 'اسم محصول',
    oOtherRemove: 'حذف این مورد',
    oNeedLines: 'حداقل یه محصول با تعداد بنویس.',
    oTooMany: 'یه سفارش حداکثر ۵۰ خط می‌تونه داشته باشه.',
    oLineIssue: '«{name}»: {msg}',
    oNeedPrice: 'قیمت این خط رو هم بنویس.',
    lOldServer2: 'برای ثبت سفارش، اول Apps Script رو به‌روز کن (Code.gs تازه، setupLedger، نسخه‌ی جدید).',
    // the simple buy (owner approved 2026-11-07; TODO: bargin-content to review the wording)
    bNewBtn: 'ثبت خرید',
    bNewTitle: 'خرید جدید',
    bEditTitle: 'ویرایش خرید',
    bTotalLine: 'مبلغ کل: {total} تومان',
    bPreview: 'یعنی {total} تومان',
    bNeedName: 'بنویس چی خریدی.',
    bLongName: 'اسم خیلی بلنده (حداکثر ۶۰ حرف).',
    bBadTotal: 'مبلغ کل باید یه عدد بزرگ‌تر از صفر باشه (حداکثر سه رقم اعشار).',
    bNeedTotal: 'مبلغ کل رو بنویس.',
    bOldNote: 'این یه خرید قدیمیه. اگه ذخیره‌ش کنی فقط اسم و مبلغ کل می‌مونه؛ تعداد، فروشنده و توضیحات پاک می‌شن.',
    bOldServer: 'برای ثبت خرید ساده، اول Apps Script رو به‌روز کن (Code.gs تازه، نسخه‌ی جدید).',
    channels: { site: 'سایت', person: 'حضوری' },
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
  var lEdit = { orderId: null, rowId: '' };   // the open order form: an order number, or an old single row's id
  var ledgerVersion = false;  // the server fills productVersion (an older Apps Script would leave it empty)
  var ledgerPack = false;     // the server knows the pack size (an older Apps Script would silently drop it)
  var ledgerSimpleBuy = false; // the server knows the simple buy (an old Apps Script would refuse saveLedgerBuy)
  var bEdit = { id: '' };      // the open simple-buy form: the row's id when editing
  var ledgerOrders = false;   // the server knows orders (an old Apps Script does not send `orders`)
  var LEDGER_MAX_LINES = 50;  // lines in one order (same as Code.gs)
  var oModels = [];        // the product lines of the open order form
  var oOthers = [];        // the «سایر» lines of the open order form
  var LEDGER_YEAR_MIN = 1395;
  // «سایر»: a ledger-only item with a typed name (not a shop product). Same reserved id as LEDGER_OTHER_ID in
  // Code.gs; it has non-ASCII letters, so no shop product can have it.
  var LEDGER_OTHER_ID = '*سایر*';
  var LEDGER_PACK_MAX = 20;
  var LEDGER_OTHER_MAX = 60;
  var customers = [];      // the «مشتری‌ها» list [{id, firstName, lastName}], from getLedger
  var NEW_CUSTOMER = '__newcust__';   // value of the «+ مشتری جدید» option (never a customer id)
  var customersReady = false;         // the server sent the customers list (an old Apps Script does not)
  // Same cleaning as ledgerText_ in Code.gs: no control characters or line breaks, single spaces, trimmed.
  // packSizeOf (begin): the shop unit «۵۰۰ گرم» / «۴۰۰گرم» / «۱ کیلو» → «۵۰۰ گرم» / «۴۰۰ گرم» / «۱ کیلو» (Persian
  // digits, one space); '' for «ظرف», a plain «کیلو», empty or anything else.
  function packSizeOf(unit) {
    var t = String(unit === undefined || unit === null ? '' : unit)
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/[\s\u200c]/g, '');
    var mt = /^([0-9]+(?:\.[0-9]+)?)(گرم|کیلوگرم|کیلو)$/.exec(t);
    if (!mt || !(parseFloat(mt[1]) > 0)) return '';
    return mt[1].replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(d); }) + ' ' + (mt[2] === 'گرم' ? 'گرم' : 'کیلو');
  }
  // packSizeOf (end)

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
    if (id !== 's-app' && window.barginReport) window.barginReport.reset();   // no report data stays on the login screen
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
    ['reload', 'add-new', 'download', 'save', 'delete', 'confirm-yes', 'l-reload', 'l-add', 'b-add', 'b-save', 'l-save'].forEach(function (id) { $(id).disabled = on; });
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
    $('v-report').hidden = v !== 'report';
    $('tab-products').setAttribute('aria-pressed', String(v === 'products'));
    $('tab-ledger').setAttribute('aria-pressed', String(v === 'ledger'));
    $('tab-report').setAttribute('aria-pressed', String(v === 'report'));
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

  // The «گزارش» tab: the code is in report.js (loaded after this file); it gets a few helpers from here.
  function openReportView() {
    if (busy || view === 'report') return;
    showView('report');
    if (window.barginReport) window.barginReport.open();
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
      customers = r.customers || [];
      customersReady = Array.isArray(r.customers) && !r.customersMessage;
      ledgerOrders = r.orders === true;
      ledgerPack = r.packSize === true;
      ledgerVersion = r.productVersion === true;
      ledgerSimpleBuy = r.simpleBuy === true;
      ledgerLoaded = true;
      renderLedger();
      if (r.customersMessage) setStatus(r.customersMessage, 'err');
      else if (!Array.isArray(r.customers)) setStatus(TEXT.lOldServer, 'err');
      else if (!ledgerOrders) setStatus(TEXT.lOldServer2, 'err');
      else if (!ledgerPack) setStatus(TEXT.lOldServer3, 'err');
      else if (!ledgerVersion) setStatus(TEXT.lOldServer4, 'err');
      else if (!ledgerSimpleBuy) setStatus(TEXT.bOldServer, 'err');
      else if (!keepMessage) setStatus('');
    }, function (err) {
      setBusy(false);
      onApiError(err, TEXT.lLoadFail);
    });
  }

  // Rows with the same orderId are ONE order (in the order they come); old rows without one stay single entries.
  function groupLedger(rows) {
    var out = [], byOrder = {};
    rows.forEach(function (e) {
      if (e.orderId === null || e.orderId === undefined) { out.push({ single: e, type: e.type }); return; }
      var g = byOrder[e.orderId];
      if (!g) { g = byOrder[e.orderId] = { orderId: e.orderId, rows: [], type: e.type }; out.push(g); }
      g.rows.push(e);
    });
    return out;
  }

  function renderLedger() {
    var ul = $('l-list');
    ul.textContent = '';
    var all = groupLedger(ledger);
    var items = all.filter(function (g) { return ledgerFilter === 'all' || g.type === ledgerFilter; });
    var count;
    if (!all.length) count = TEXT.lEmpty;
    else if (ledgerFilter === 'all') count = fill(TEXT.lCount, { n: toFa(all.length) });
    else count = items.length ? fill(TEXT.lCountFiltered, { n: toFa(items.length), all: toFa(all.length) }) : TEXT.lEmptyFilter;
    if (ledgerMore) count += ' ' + fill(TEXT.lMore, { n: toFa(ledger.length) });
    $('l-count').textContent = count;
    var btns = document.querySelectorAll('[data-filter]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', String(btns[i].getAttribute('data-filter') === ledgerFilter));
    items.forEach(function (g) { ul.appendChild(g.single ? ledgerItem(g.single) : orderCard(g)); });
  }

  // Edit + delete buttons and the inline confirm, shared by single entries and order cards.
  function addActions(li, onEdit, confirmText, onDelete) {
    var actions = el('div', 'l-actions');
    var edit = el('button', 'btn btn-ghost', TEXT.edit);
    edit.type = 'button';
    edit.addEventListener('click', onEdit);
    var del = el('button', 'btn btn-danger', TEXT.lDelete);
    del.type = 'button';
    actions.appendChild(edit);
    actions.appendChild(del);
    li.appendChild(actions);

    var confirmBox = el('div', 'adm-confirm');
    confirmBox.hidden = true;
    confirmBox.appendChild(el('p', '', confirmText));
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
    yes.addEventListener('click', onDelete);
  }

  // « (۵۰۰ گرم)» after the quantity unit, or '' when the line has no pack size.
  function packPart(p) {
    var t = cleanLedgerText(p);
    return t ? ' (' + t + ')' : '';
  }

  // The line «۲ بسته × ۴۵۰,۰۰۰ تومان = ۹۰۰,۰۰۰ تومان» of one row, or null when the row has no numbers.
  function sumLine(e) {
    if (e.qty === null || e.priceToman === null || e.rowToman === null) return null;
    var sum = el('div', 'l-sum');
    sum.appendChild(el('bdi', '', fill(TEXT.lSum, {
      qty: decFa(e.qty), unit: TEXT.qtyUnits[e.qtyUnit] || e.qtyUnitText || '', pack: packPart(e.packSize),
      price: groupFa(e.priceToman), total: groupFa(e.rowToman)
    })));
    return sum;
  }

  // One order = one card: «سفارش ۱۲», date, customer / seller, the lines, «جمع این سفارش».
  function orderCard(g) {
    var first = g.rows[0];
    var li = el('li', 'o-card');
    var top = el('div', 'l-top');
    top.appendChild(el('span', 'o-card-title', fill(TEXT.lOrderNo, { n: toFa(g.orderId) })));
    top.appendChild(el('span', 'l-date', dateFa(first.date)));
    top.appendChild(el('span', 'tag' + (first.type ? ' t-' + first.type : ''), TEXT.types[first.type] || first.typeText || ''));
    li.appendChild(top);
    if (first.type === 'sell' && (first.customerId || first.channel)) li.appendChild(customerLine(first));
    else if (first.party) li.appendChild(el('small', 'l-more', fill(TEXT.lParty, { name: first.party })));
    var ul = el('ul', 'o-lines');
    var total = 0, complete = true;
    g.rows.forEach(function (e) {
      var row = el('li');
      var isOther = e.productId === LEDGER_OTHER_ID;
      var prod = el('div', 'l-prod', e.productName || (isOther ? TEXT.lOther : e.productId) || '');
      if (isOther) {
        prod.appendChild(document.createTextNode(' '));
        prod.appendChild(el('span', 'tag t-other', TEXT.lOther));
      }
      row.appendChild(prod);
      var sum = sumLine(e);
      if (sum) row.appendChild(sum);
      ul.appendChild(row);
      if (e.rowToman === null) complete = false; else total += e.rowToman;
    });
    li.appendChild(ul);
    if (complete) li.appendChild(el('div', 'o-sum-total', fill(TEXT.lOrderTotal, { total: groupFa(total) }) + ' (' + fill(TEXT.lOrderCount, { n: toFa(g.rows.length) }) + ')'));
    if (first.note) li.appendChild(el('small', 'l-more', first.note));
    addActions(li, function () { openLedgerForm(g); }, TEXT.lOrderConfirm, function () { deleteOrder(g.orderId); });
    return li;
  }

  // An old single entry (before orders): shown as it was; its edit opens the order form as a one-line order.
  function ledgerItem(e) {
    if (isSimpleBuy(e)) return simpleBuyItem(e);
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

    var sum = sumLine(e);
    if (sum) li.appendChild(sum);
    if (e.priceAmount) {
      li.appendChild(el('small', 'l-more', fill(TEXT.lTyped, { amount: decFa(e.priceAmount), unit: TEXT.priceUnits[e.priceUnit] || e.priceUnitText || '' })));
    }
    if (e.type === 'sell' && (e.customerId || e.channel)) li.appendChild(customerLine(e));
    else if (e.party) li.appendChild(el('small', 'l-more', fill(TEXT.lParty, { name: e.party })));
    if (e.note) li.appendChild(el('small', 'l-more', e.note));
    addActions(li, function () { if (e.type === 'buy') openBuyForm(e); else openLedgerForm({ single: e }); }, TEXT.lConfirm, function () { deleteLedger(e.id); });
    return li;
  }

  // ---- the simple buy (owner approved 2026-11-07): date, what was bought, total paid ----
  // A buy saved by the simple form: one item named by hand, qty 1 «عدد», no seller, note or pack size.
  function isSimpleBuy(e) {
    return e.type === 'buy' && e.productId === LEDGER_OTHER_ID && e.qty === 1 && e.qtyUnit === 'piece' && !e.party && !e.note &&
      !e.packSize && e.rowToman !== null && e.rowToman === e.priceToman && (e.orderId === null || e.orderId === undefined);
  }
  function simpleBuyItem(e) {
    var li = el('li');
    var top = el('div', 'l-top');
    top.appendChild(el('span', 'l-date', dateFa(e.date)));
    top.appendChild(el('span', 'tag t-buy', TEXT.types.buy));
    li.appendChild(top);
    li.appendChild(el('div', 'l-prod', e.productName || ''));
    var sum = el('div', 'l-sum');
    sum.appendChild(el('bdi', '', fill(TEXT.bTotalLine, { total: groupFa(e.rowToman) })));
    li.appendChild(sum);
    addActions(li, function () { openBuyForm(e); }, TEXT.lConfirm, function () { deleteLedger(e.id); });
    return li;
  }
  // toman → {price, unit} as typed in the form («۱٫۲» + million, or «۱۲۰۰» + thousand).
  function typedTotal(toman) {
    if (toman >= 1000000 && toman % 1000 === 0) return { price: String(+(toman / 1000000).toFixed(3)), unit: 'million' };
    return { price: String(+(toman / 1000).toFixed(3)), unit: 'thousand' };
  }
  function refreshBuyPreview() {
    var m = ledgerMath_(1, $('b-total').value, $('b-unit').value);
    $('b-preview').textContent = m.rowToman !== null ? fill(TEXT.bPreview, { total: groupFa(m.rowToman) }) : '';
  }
  // e = a stored single buy to edit, or null for a new one.
  function openBuyForm(e) {
    if (busy) return;
    bEdit = { id: e ? e.id : '' };
    showIssues([]);
    var parts = e ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.date) : null;
    var t = todayJ();
    if (parts) setDateFields(parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3], 10), 'b-');
    else setDateFields(t.y, t.m, t.d, 'b-');
    var simple = !!e && isSimpleBuy(e);
    var typed = e ? (simple && e.priceAmount ? { price: String(e.priceAmount), unit: e.priceUnit === 'million' ? 'million' : 'thousand' }
      : (e.rowToman !== null ? typedTotal(e.rowToman) : { price: '', unit: 'thousand' })) : { price: '', unit: 'thousand' };
    $('b-name').value = e ? e.productName || '' : '';
    $('b-total').value = typed.price;
    $('b-unit').value = typed.unit;
    $('b-old-note').textContent = e && !simple ? TEXT.bOldNote : '';
    $('b-old-note').hidden = !(e && !simple);
    refreshBuyPreview();
    $('b-form-title').textContent = e ? TEXT.bEditTitle : TEXT.bNewTitle;
    $('b-save').textContent = TEXT.bNewBtn;
    $('b-form').hidden = false;
    $('l-form').hidden = true;
    $('l-list-card').hidden = true;
    setStatus(ledgerSimpleBuy ? '' : TEXT.bOldServer, ledgerSimpleBuy ? '' : 'err');
    $('b-form').scrollIntoView();
    $('b-name').focus();
  }
  function buyIssues(b) {
    var out = [];
    function add(m) { out.push({ row: null, message: m }); }
    if (!ledgerDate_(b.date)) add(TEXT.lNeedDate);
    if (!b.name) add(TEXT.bNeedName);
    else if (b.name.length > LEDGER_OTHER_MAX) add(TEXT.bLongName);
    var m = ledgerMath_(1, b.total, b.totalUnit);
    if (m.tooBig) add(TEXT.lTooBig);
    else if (m.unitToman === null) add(String(b.total).trim() === '' ? TEXT.bNeedTotal : TEXT.bBadTotal);
    if (!ledgerSimpleBuy) add(TEXT.bOldServer);
    return out;
  }
  function saveBuy(ev) {
    ev.preventDefault();
    if (busy) return;
    var buy = {
      date: $('b-year').value + '-' + pad2(parseInt($('b-month').value, 10)) + '-' + pad2(parseInt($('b-day').value, 10)),
      name: cleanLedgerText($('b-name').value), total: $('b-total').value, totalUnit: $('b-unit').value
    };
    var issues = buyIssues(buy);
    if (issues.length) { setStatus(TEXT.lSaveBlocked, 'err'); showIssues(issues); return; }
    var wasEdit = !!bEdit.id;
    setBusy(true);
    setStatus(TEXT.saving);
    showIssues([]);
    api('saveLedgerBuy', { buy: buy, id: bEdit.id }, true).then(function (r) {
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
      onApiError(err, err && err.code === 'unknown_action' ? TEXT.bOldServer : undefined);
    });
  }

  // ---- customers (sales only) ----
  function customerById(id) {
    for (var i = 0; i < customers.length; i++) if (String(customers[i].id) === String(id)) return customers[i];
    return null;
  }
  function customerFullName(c) { return (String(c.firstName || '') + ' ' + String(c.lastName || '')).trim(); }

  // «مشتری: ۱۲ — zahra ahmadi · سایت». The Latin name sits in its own <bdi dir="ltr">, so the RTL line never
  // mixes up its order. A sale saved before the customers list (no customerId) shows its old typed name.
  function customerLine(e) {
    var line = el('small', 'l-more l-cust');
    line.appendChild(document.createTextNode(TEXT.lCustomerLine));
    var c = e.customerId ? customerById(e.customerId) : null;
    var name = c ? customerFullName(c) : e.party;
    if (e.customerId) line.appendChild(document.createTextNode(toFa(e.customerId) + ' — '));
    if (name) {
      var b = el('bdi', '', name);
      if (/^[A-Za-z]/.test(name)) b.setAttribute('dir', 'ltr');
      line.appendChild(b);
    }
    var ch = TEXT.channels[e.channel] || e.channelText;
    if (ch) line.appendChild(document.createTextNode(' · ' + ch));
    return line;
  }

  // Lowercase, ASCII digits, single spaces: the filter text and the names are compared this way.
  function customerQuery(v) {
    return String(v || '').replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); }).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // The customer dropdown, filtered by the search box (name or number). An <option> can't hold markup, so the
  // name is wrapped in the Unicode isolate marks FSI … PDI: «۱۲ — zahra ahmadi» stays in order on the RTL page.
  function fillCustomerOptions(keep) {
    var sel = $('l-customer');
    var current = keep !== undefined ? keep : sel.value;
    var q = customerQuery($('l-cust-filter').value);
    sel.textContent = '';
    var list = customers.filter(function (c) {
      if (!q) return true;
      return String(c.id).indexOf(q) === 0 || customerQuery(customerFullName(c)).indexOf(q) >= 0;
    });
    list.sort(function (a, b) {
      var x = customerQuery(customerFullName(a)), y = customerQuery(customerFullName(b));
      return x < y ? -1 : (x > y ? 1 : Number(a.id) - Number(b.id));
    });
    addOption(sel, '', q && !list.length ? TEXT.lNoCustomerMatch : TEXT.lPickCustomer);
    var found = false;
    list.forEach(function (c) {
      addOption(sel, String(c.id), fill(TEXT.lCustomerOption, { n: toFa(c.id), name: '\u2068' + customerFullName(c) + '\u2069' }));
      if (String(c.id) === current) found = true;
    });
    addOption(sel, NEW_CUSTOMER, TEXT.lNewCustomer);
    if (current === NEW_CUSTOMER) sel.value = NEW_CUSTOMER;
    else if (found) sel.value = current;
    else if (q && list.length) sel.value = String(list[0].id);
    else sel.value = '';
    syncCustomer();
  }

  // The name boxes are shown only while «+ مشتری جدید» is selected.
  function syncCustomer() {
    $('l-newcust-wrap').hidden = $('l-customer').value !== NEW_CUSTOMER;
  }

  // Sale-only fields (customer, channel) and the buy-only «اسم فروشنده» box. Hidden fields keep their values.
  function syncType() {
    var sell = $('l-type-sell').checked, buy = $('l-type-buy').checked;
    $('l-sell-wrap').hidden = !sell;
    $('l-party-wrap').hidden = !buy;
  }

  // ---- «خرید و فروش» form ----
  function addOption(sel, value, text) {
    var op = document.createElement('option');
    op.value = value;
    op.textContent = text;
    sel.appendChild(op);
  }

  function rebuildDays(pfx) {
    pfx = typeof pfx === 'string' ? pfx : 'l-';
    var y = parseInt($(pfx + 'year').value, 10), m = parseInt($(pfx + 'month').value, 10);
    var sel = $(pfx + 'day');
    var keep = parseInt(sel.value, 10) || 1;
    var max = jalaliMonthDays_(y, m);
    sel.textContent = '';
    for (var d = 1; d <= max; d++) addOption(sel, String(d), toFa(d));
    sel.value = String(Math.min(keep, max));
  }

  function setDateFields(y, m, d, pfx) {
    pfx = typeof pfx === 'string' ? pfx : 'l-';
    var ys = $(pfx + 'year');
    var t = todayJ();
    ys.textContent = '';
    var from = Math.min(LEDGER_YEAR_MIN, y), to = Math.max(t.y + 1, y);
    for (var k = to; k >= from; k--) addOption(ys, String(k), toFa(k));
    ys.value = String(y);
    $(pfx + 'month').value = String(m);
    $(pfx + 'day').value = String(d);
    rebuildDays(pfx);
    $(pfx + 'day').value = String(Math.min(d, jalaliMonthDays_(y, m)));
  }

  function syncPills() {
    ['l-type-buy', 'l-type-sell', 'l-ch-site', 'l-ch-person'].forEach(function (id) {
      var input = $(id);
      input.parentNode.className = input.checked ? 'on' : '';
    });
    syncType();
  }

  // ---- order form: all in-stock products as lines (owner approved 2026-11-07) ----
  function asciiDigits(v) {
    return String(v === undefined || v === null ? '' : v).replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
  }
  // The qty unit a product starts with: only «کیلو» / «۱ کیلو» (per kilo) is 'kg'; everything else
  // («۵۰۰ گرم», «ظرف», «۴۰۰گرم», empty…) is a pack ('pack').
  function unitKindOf(unit) {
    var t = asciiDigits(unit).replace(/[\s‌]/g, '');
    return /^1?(کیلو|کیلوگرم|kg)$/i.test(t) ? 'kg' : 'pack';
  }
  // The shop price (toman, from the products sheet) → {toman, price, unit} typed in «هزار» or «میلیون» تومان.
  function shopPriceOf(r) {
    var p = parseDecimal_(r.price, 9, 3);
    var toman = p ? p.i + p.f / 1000 : 0;
    if (!(toman > 0) || Math.floor(toman) !== toman) return { toman: 0, price: '', unit: 'thousand' };
    if (toman >= 1000000 && toman % 1000 === 0) return { toman: toman, price: decFa(String(+(toman / 1000000).toFixed(3))), unit: 'million' };
    return { toman: toman, price: decFa(String(+(toman / 1000).toFixed(3))), unit: 'thousand' };
  }
  function priceWords(toman, unitText) {
    var w = toman >= 1000000 && toman % 1000 === 0 ? decFa(String(+(toman / 1000000).toFixed(3))) + ' میلیون تومان'
      : decFa(String(+(toman / 1000).toFixed(3))) + ' هزار تومان';
    return w + (unitText ? ' / ' + toFa(unitText) : '');
  }
  function isSoldOut(r) { return String(r.soldOut || '').trim().toLowerCase() === 'yes'; }
  function currentType() { return $('l-type-buy').checked ? 'buy' : ($('l-type-sell').checked ? 'sell' : ''); }

  function newModel(o) {
    var m = { other: false, group: '', id: '', productId: '', name: '', category: '', shop: null, shopUnit: '', defKind: 'pack',
      qty: '', qtyUnit: 'pack', pack: '', packTouched: false, price: '', priceUnit: 'thousand', stored: false, priceTouched: false, qtyUnitTouched: false, gone: false, els: {} };
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) m[k] = o[k];
    return m;
  }

  function cellWrap(labelText, control, id) {
    var w = el('div', 'o-cell');
    var l = el('label', '', labelText);
    l.setAttribute('for', id);
    w.appendChild(l);
    w.appendChild(control);
    return w;
  }
  var lineSeq = 0;
  function mkInput(cls, aria) {
    var i = el('input', cls);
    i.type = 'text';
    i.setAttribute('inputmode', 'decimal');
    i.autocomplete = 'off';
    i.setAttribute('maxlength', '16');
    i.id = 'o-i' + (++lineSeq);
    return i;
  }
  function mkSelect(map) {
    var sel = el('select');
    Object.keys(map).forEach(function (k) { addOption(sel, k, map[k]); });
    sel.id = 'o-i' + (++lineSeq);
    return sel;
  }

  // One line: name (+ shop price hint), qty + unit, price + unit, the line total.
  function buildLine(m) {
    var box = el('div', 'o-line' + (m.other ? ' o-other' : ''));
    if (m.other) {
      var nm = el('input', 'o-name-in');
      nm.type = 'text';
      nm.maxLength = LEDGER_OTHER_MAX;
      nm.autocomplete = 'off';
      nm.id = 'o-i' + (++lineSeq);
      nm.value = m.name || '';
      nm.setAttribute('aria-label', TEXT.oOtherName);
      nm.placeholder = TEXT.oOtherName;
      nm.addEventListener('input', function () { m.name = nm.value; });
      m.els.name = nm;
      box.appendChild(nm);
    } else {
      var nameEl = el('div', 'o-name', m.name);
      if (m.shop && m.shop.toman) nameEl.appendChild(el('span', 'o-hint', fill(TEXT.oShopPrice, { price: priceWords(m.shop.toman, m.shopUnit) })));
      if (m.gone) nameEl.appendChild(el('span', 'o-hint', TEXT.oGoneTag));
      box.appendChild(nameEl);
    }
    var ctl = el('div', 'o-ctl');
    var q = mkInput('o-qty'), qu = mkSelect(TEXT.qtyUnits), pr = mkInput('o-price'), pu = mkSelect(TEXT.priceUnits);
    q.value = m.qty; qu.value = m.qtyUnit; pr.value = m.price; pu.value = m.priceUnit;
    q.setAttribute('aria-label', (m.other ? TEXT.lOther : m.name) + ' — ' + TEXT.oQty);
    qu.setAttribute('aria-label', (m.other ? TEXT.lOther : m.name) + ' — ' + TEXT.oQtyUnit);
    pr.setAttribute('aria-label', (m.other ? TEXT.lOther : m.name) + ' — ' + TEXT.oPrice);
    pu.setAttribute('aria-label', (m.other ? TEXT.lOther : m.name) + ' — ' + TEXT.oPriceUnit);
    ctl.appendChild(cellWrap(TEXT.oQty, q, q.id));
    ctl.appendChild(cellWrap(TEXT.oQtyUnit, qu, qu.id));
    ctl.appendChild(cellWrap(TEXT.oPrice, pr, pr.id));
    ctl.appendChild(cellWrap(TEXT.oPriceUnit, pu, pu.id));
    var pk = el('input', 'o-pack-in');
    pk.type = 'text';
    pk.maxLength = LEDGER_PACK_MAX;
    pk.autocomplete = 'off';
    pk.id = 'o-i' + (++lineSeq);
    pk.value = m.pack;
    pk.placeholder = TEXT.oPackHint;
    pk.setAttribute('aria-label', (m.other ? TEXT.lOther : m.name) + ' — ' + TEXT.oPack);
    var pkCell = cellWrap(TEXT.oPack, pk, pk.id);
    pkCell.className += ' o-pack';
    ctl.appendChild(pkCell);
    box.appendChild(ctl);
    var sum = el('div', 'o-sum');
    box.appendChild(sum);
    q.addEventListener('input', function () { m.qty = q.value; refreshOrder(); });
    qu.addEventListener('change', function () { m.qtyUnit = qu.value; m.qtyUnitTouched = true; refreshOrder(); });
    pr.addEventListener('input', function () { m.price = pr.value; m.priceTouched = true; refreshOrder(); });
    pu.addEventListener('change', function () { m.priceUnit = pu.value; m.priceTouched = true; refreshOrder(); });
    pk.addEventListener('input', function () { m.pack = pk.value; m.packTouched = true; refreshOrder(); });
    m.els = { box: box, qty: q, qtyUnit: qu, pack: pk, price: pr, priceUnit: pu, sum: sum, name: m.els.name };
    if (m.other) {
      var rm = el('button', 'btn btn-danger o-rm', TEXT.oOtherRemove);
      rm.type = 'button';
      rm.addEventListener('click', function () {
        oOthers.splice(oOthers.indexOf(m), 1);
        if (box.parentNode) box.parentNode.removeChild(box);
        refreshOrder();
      });
      box.appendChild(rm);
    }
    return box;
  }

  // Sale: the shop price per pack (or per kilo); buy: price empty. Lines the owner typed in, or that were saved
  // before, are never overwritten.
  function applyDefaults() {
    var type = currentType();
    oModels.forEach(function (m) {
      if (m.stored) return;
      if (!m.qtyUnitTouched) { m.qtyUnit = m.defKind; m.els.qtyUnit.value = m.qtyUnit; }
      if (!m.packTouched) { m.pack = type === 'sell' ? packSizeOf(m.shopUnit) : ''; m.els.pack.value = m.pack; }
      if (m.priceTouched) return;
      if (type === 'sell' && m.shop) { m.price = m.shop.price; m.priceUnit = m.shop.unit; }
      else { m.price = ''; m.priceUnit = 'thousand'; }
      m.els.price.value = m.price;
      m.els.priceUnit.value = m.priceUnit;
    });
    refreshOrder();
  }

  function lineMath(m) { return ledgerMath_(m.qty, m.price, m.priceUnit); }
  function hasQty(m) { return String(m.qty).trim() !== ''; }

  // Totals, per-line sums, the «n تا انتخاب شده» counters and the filter. No total over all orders anywhere.
  function refreshOrder() {
    var total = 0, n = 0, noPrice = 0;
    var counts = {};
    oModels.concat(oOthers).forEach(function (m) {
      var on = hasQty(m);
      m.els.box.className = 'o-line' + (m.other ? ' o-other' : '') + (on ? ' has-qty' : '');
      var math = lineMath(m);
      if (on) {
        n++;
        if (math.rowToman === null) noPrice++; else total += math.rowToman;
        if (!m.other) counts[m.group] = (counts[m.group] || 0) + 1;
      }
      m.els.sum.textContent = on && math.rowToman !== null ? fill(TEXT.lSum, {
        qty: decFa(math.qtyText), unit: TEXT.qtyUnits[m.qtyUnit] || '', pack: packPart(m.pack), price: groupFa(math.unitToman), total: groupFa(math.rowToman)
      }) : '';
    });
    var groups = $('o-groups').querySelectorAll('.o-cat');
    for (var i = 0; i < groups.length; i++) {
      var c = counts[groups[i].getAttribute('data-group')] || 0;
      groups[i].querySelector('.o-count').textContent = c ? fill(TEXT.oSelected, { n: toFa(c) }) : '';
    }
    var tot = $('o-total');
    if (!n) tot.textContent = TEXT.oTotalNone;
    else {
      tot.textContent = fill(TEXT.lOrderTotal, { total: groupFa(total) }) + ' (' + fill(TEXT.lOrderCount, { n: toFa(n) }) + ')' + (noPrice ? ' — ' + TEXT.oTotalNoPrice : '');
    }
    applyFilter();
  }

  // The name search and «فقط انتخاب‌شده‌ها»: hide lines; a category with a visible line is opened while filtering.
  function normName(v) {
    return customerQuery(String(v || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌]/g, ' '));
  }
  function applyFilter() {
    var q = normName($('o-search').value), only = $('o-only').getAttribute('aria-pressed') === 'true';
    var filtering = !!q || only, any = false;
    var groups = $('o-groups').querySelectorAll('.o-cat');
    for (var i = 0; i < groups.length; i++) groups[i].setAttribute('data-vis', '0');
    oModels.forEach(function (m) {
      var show = (!q || normName(m.name).indexOf(q) >= 0) && (!only || hasQty(m));
      m.els.box.hidden = !show;
      if (show) { any = true; m.els.box.parentNode.parentNode.setAttribute('data-vis', '1'); }
    });
    for (var k = 0; k < groups.length; k++) {
      var vis = groups[k].getAttribute('data-vis') === '1';
      groups[k].hidden = !vis;
      if (filtering && vis) groups[k].open = true;
    }
    $('o-empty').hidden = any || !oModels.length;
  }

  function addOtherLine(stored) {
    var m = newModel({ other: true, productId: LEDGER_OTHER_ID, stored: !!stored, priceTouched: true, qtyUnitTouched: true, packTouched: true });
    if (stored) {
      m.id = stored.id; m.name = stored.productName || ''; m.pack = stored.packSize || '';
      m.qty = stored.qty !== null ? decFa(stored.qty) : '';
      m.qtyUnit = stored.qtyUnit || 'pack';
      m.price = stored.priceAmount ? decFa(stored.priceAmount) : '';
      m.priceUnit = stored.priceUnit || 'thousand';
    }
    oOthers.push(m);
    $('o-others').appendChild(buildLine(m));
    return m;
  }

  // Builds the product list (grouped by category, in sheet order) and fills it from the stored rows when editing.
  function buildOrderLines(rows) {
    var groupsBox = $('o-groups');
    groupsBox.textContent = '';
    $('o-others').textContent = '';
    oModels = [];
    oOthers = [];
    var seen = {}, order = [], byGroup = {};
    products.forEach(function (r) {
      var id = String(r.id || '').trim(), name = String(r.name || '').trim();
      if (!id || !name || seen[id] || id === LEDGER_OTHER_ID || isSoldOut(r)) return;
      seen[id] = true;
      var cat = String(r.category || '').trim();
      var shop = shopPriceOf(r);
      var unit = String(r.unit || '').trim();
      var m = newModel({ productId: id, name: name, group: cat, shop: shop, shopUnit: unit, defKind: unitKindOf(unit), qtyUnit: unitKindOf(unit) });
      oModels.push(m);
      if (!byGroup[cat]) { byGroup[cat] = []; order.push(cat); }
      byGroup[cat].push(m);
    });
    var extras = [];
    (rows || []).forEach(function (e) {
      if (e.productId === LEDGER_OTHER_ID) { addOtherLine(e); return; }
      var m = null;
      for (var i = 0; i < oModels.length; i++) if (oModels[i].productId === e.productId && !oModels[i].stored) { m = oModels[i]; break; }
      if (!m) {
        m = newModel({ productId: e.productId, name: e.productName || e.productId, group: TEXT.oGoneGroup, gone: true });
        oModels.push(m);
        extras.push(m);
      }
      m.id = e.id; m.stored = true; m.priceTouched = true; m.qtyUnitTouched = true; m.packTouched = true;
      m.pack = e.packSize || '';
      m.qty = e.qty !== null ? decFa(e.qty) : '';
      m.qtyUnit = e.qtyUnit || 'pack';
      m.price = e.priceAmount ? decFa(e.priceAmount) : '';
      m.priceUnit = e.priceUnit || 'thousand';
    });
    if (extras.length) { byGroup[TEXT.oGoneGroup] = extras; order.push(TEXT.oGoneGroup); }
    order.forEach(function (cat, gi) {
      var det = el('details', 'o-cat');
      det.setAttribute('data-group', cat);
      var sum = el('summary');
      sum.appendChild(el('span', '', cat || '—'));
      sum.appendChild(el('span', 'o-count'));
      det.appendChild(sum);
      var inner = el('div', 'o-cat-lines');
      byGroup[cat].forEach(function (m) { inner.appendChild(buildLine(m)); });
      det.appendChild(inner);
      var hasOn = byGroup[cat].some(hasQty);
      det.open = hasOn || (!rows && gi === 0);
      groupsBox.appendChild(det);
    });
  }

  // target: null = a new order; {orderId, rows} = an order; {single} = an old entry (opens as a one-line order).
  function openLedgerForm(target) {
    if (busy) return;
    var rows = target ? (target.single ? [target.single] : target.rows) : null;
    var e = rows ? rows[0] : null;
    lEdit = { orderId: target && !target.single ? target.orderId : null, rowId: target && target.single ? target.single.id : '' };
    showIssues([]);
    $('o-lines-note').textContent = '';
    var parts = e ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.date) : null;
    var t = todayJ();
    if (parts) setDateFields(parseInt(parts[1], 10), parseInt(parts[2], 10), parseInt(parts[3], 10));
    else setDateFields(t.y, t.m, t.d);
    $('l-type-buy').checked = !!e && e.type === 'buy';
    $('l-type-sell').checked = !e || e.type === 'sell';   // a new order here is a sale (buys have their own form)
    $('l-type-wrap').hidden = !e;
    $('l-ch-site').checked = !!e && e.channel === 'site';
    $('l-ch-person').checked = !!e && e.channel === 'person';
    syncPills();
    $('l-cust-filter').value = '';
    $('l-first').value = '';
    $('l-last').value = '';
    var known = e && e.customerId && customerById(e.customerId);
    fillCustomerOptions(known ? String(e.customerId) : '');
    // An old sale (from before the customers list): a customer must be chosen; its old typed name is a hint.
    var oldName = e && e.type === 'sell' && !known ? e.party || '' : '';
    $('l-old-name').textContent = oldName ? fill(TEXT.lOldName, { name: oldName }) : '';
    $('l-old-name').hidden = !oldName;
    $('l-party').value = e && (e.type !== 'sell' || !e.customerId) ? e.party || '' : '';
    $('l-note').value = e ? e.note || '' : '';
    $('o-search').value = '';
    $('o-only').setAttribute('aria-pressed', 'false');
    buildOrderLines(rows);
    applyDefaults();
    $('l-form-title').textContent = lEdit.orderId !== null ? fill(TEXT.lEditOrder, { n: toFa(lEdit.orderId) }) : (e ? TEXT.lEditTitle : TEXT.lNewOrder);
    $('l-form').hidden = false;
    $('b-form').hidden = true;
    $('l-list-card').hidden = true;
    setStatus(products.length ? '' : TEXT.lNoProducts, products.length ? '' : 'err');
    $('l-form').scrollIntoView();
    $('l-day').focus();
  }

  function closeLedgerForm() {
    lEdit = { orderId: null, rowId: '' };
    oModels = [];
    oOthers = [];
    bEdit = { id: '' };
    $('l-form').hidden = true;
    $('b-form').hidden = true;
    $('l-list-card').hidden = false;
  }

  // The order from the form: shared fields + the lines that have a quantity. `names` = the name of each line.
  function collectOrder() {
    var type = currentType();
    var order = {
      date: $('l-year').value + '-' + pad2(parseInt($('l-month').value, 10)) + '-' + pad2(parseInt($('l-day').value, 10)),
      type: type,
      party: type === 'sell' ? '' : $('l-party').value,
      note: $('l-note').value,
      lines: []
    };
    if (type === 'sell') {
      order.channel = $('l-ch-site').checked ? 'site' : ($('l-ch-person').checked ? 'person' : '');
      if ($('l-customer').value === NEW_CUSTOMER) {
        var f = customerName_($('l-first').value), l = customerName_($('l-last').value);
        order.newCustomer = { firstName: f.value || $('l-first').value, lastName: l.value || $('l-last').value };
      } else {
        order.customerId = $('l-customer').value;
      }
    }
    var names = [], models = [];
    oModels.concat(oOthers).forEach(function (m) {
      if (!hasQty(m)) return;
      var line = { productId: m.productId, qty: m.qty, qtyUnit: m.qtyUnit, packSize: cleanLedgerText(m.pack), price: m.price, priceUnit: m.priceUnit };
      if (m.stored && m.id) line.id = m.id;
      if (m.other) line.productName = cleanLedgerText(m.name);
      order.lines.push(line);
      names.push(m.other ? (cleanLedgerText(m.name) || TEXT.lOther) : m.name);
      models.push(m);
    });
    return { order: order, names: names, models: models };
  }

  // The same checks as the server (the server checks again; it is the real guard).
  function orderIssues(built) {
    var entry = built.order, out = [];
    function add(m) { out.push({ row: null, message: m }); }
    function addLine(i, m) { out.push({ row: null, message: fill(TEXT.oLineIssue, { name: built.names[i], msg: m }) }); }
    if (!ledgerDate_(entry.date)) add(TEXT.lNeedDate);
    if (!entry.type) add(TEXT.lNeedType);
    if (!entry.lines.length) add(TEXT.oNeedLines);
    else if (entry.lines.length > LEDGER_MAX_LINES) add(TEXT.oTooMany);
    entry.lines.forEach(function (ln, i) {
      if (ln.productId === LEDGER_OTHER_ID) {
        if (!ln.productName) addLine(i, TEXT.lNeedOtherName);
        else if (ln.productName.length > LEDGER_OTHER_MAX) addLine(i, TEXT.lLongOtherName);
      }
      if (ln.packSize.length > LEDGER_PACK_MAX) addLine(i, TEXT.lLongPack);
      var m = ledgerMath_(ln.qty, ln.price, ln.priceUnit);
      if (m.qty === null) addLine(i, TEXT.lBadQty);
      if (m.tooBig) addLine(i, TEXT.lTooBig);
      else if (m.unitToman === null) addLine(i, String(ln.price).trim() === '' ? TEXT.oNeedPrice : TEXT.lBadPrice);
    });
    if (!ledgerOrders) add(TEXT.lOldServer2);
    else if (!ledgerPack) add(TEXT.lOldServer3);
    else if (!ledgerVersion) add(TEXT.lOldServer4);
    if (entry.type === 'sell' && !customersReady) add(TEXT.lOldServer);
    else if (entry.type === 'sell') {
      if (entry.newCustomer) {
        var msgs = { long: TEXT.lLongName, persian: TEXT.lPersianName, bad: TEXT.lBadName };
        var f = customerName_(entry.newCustomer.firstName), l = customerName_(entry.newCustomer.lastName);
        if (f.error) add(f.error === 'need' ? TEXT.lNeedFirst : msgs[f.error]);
        if (l.error && !(f.error && f.error === l.error && f.error !== 'need')) add(l.error === 'need' ? TEXT.lNeedLast : msgs[l.error]);
      } else if (!entry.customerId) add(TEXT.lNeedCustomer);
      if (!entry.channel) add(TEXT.lNeedChannel);
    }
    return out;
  }

  function saveLedger(ev) {
    ev.preventDefault();
    if (busy) return;
    var built = collectOrder();
    var issues = orderIssues(built);
    if (issues.length) { setStatus(TEXT.lSaveBlocked, 'err'); showIssues(issues); return; }
    var wasEdit = lEdit.orderId !== null || !!lEdit.rowId;
    setBusy(true);
    setStatus(TEXT.saving);
    showIssues([]);
    api('saveLedgerOrder', { order: built.order, orderId: lEdit.orderId === null ? '' : lEdit.orderId, rowId: lEdit.rowId }, true).then(function (r) {
      if (r && r.ok) {
        closeLedgerForm();
        var done = wasEdit ? TEXT.lUpdated : TEXT.lSaved;
        if (r.reusedCustomer) done = fill(TEXT.lReused, { n: toFa(r.reusedCustomer) }) + '. ' + done;
        if (r.mergedInto) done = fill(TEXT.lMerged, { n: toFa(r.mergedInto) });
        setStatus(done, 'ok');
        return loadLedger(true);
      }
      setBusy(false);
      setStatus(TEXT.lSaveBlocked, 'err');
      var list = (r && r.issues) || (r && r.message ? [{ row: null, message: r.message }] : []);
      showIssues(list.map(function (it) {
        var name = typeof it.line === 'number' ? built.names[it.line] : '';
        return { row: null, message: name ? fill(TEXT.oLineIssue, { name: name, msg: it.message }) : it.message };
      }));
    }, function (err) {
      setBusy(false);
      onApiError(err, err && err.code === 'unknown_action' ? TEXT.lOldServer2 : undefined);
    });
  }

  function deleteOrder(orderId) {
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.deleting);
    api('deleteLedgerOrder', { orderId: orderId }, true).then(function (r) {
      if (r && r.ok) {
        setStatus(TEXT.lDeleted, 'ok');
        return loadLedger(true);
      }
      setBusy(false);
      setStatus((r && r.message) || TEXT.deleteFail, 'err');
    }, function (err) {
      setBusy(false);
      onApiError(err, err && err.code === 'unknown_action' ? TEXT.lOldServer2 : TEXT.deleteFail);
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
    $('tab-report').addEventListener('click', openReportView);
    $('l-reload').addEventListener('click', function () {
      if (busy) return;
      closeLedgerForm();
      showIssues([]);
      load(true).then(function () { if (getSession()) loadLedger(); });
    });
    $('l-add').addEventListener('click', function () { openLedgerForm(null); });
    TEXT.months.forEach(function (name, i) { addOption($('b-month'), String(i + 1), name); });
    $('b-add').addEventListener('click', function () { openBuyForm(null); });
    $('b-form').addEventListener('submit', saveBuy);
    $('b-cancel').addEventListener('click', function () { closeLedgerForm(); showIssues([]); setStatus(''); });
    $('b-year').addEventListener('change', function () { rebuildDays('b-'); });
    $('b-month').addEventListener('change', function () { rebuildDays('b-'); });
    $('b-total').addEventListener('input', refreshBuyPreview);
    $('b-unit').addEventListener('change', refreshBuyPreview);
    $('l-logout').addEventListener('click', logout);
    $('l-form').addEventListener('submit', saveLedger);
    $('l-cancel').addEventListener('click', function () { closeLedgerForm(); showIssues([]); setStatus(''); });
    $('l-year').addEventListener('change', function () { rebuildDays('l-'); });
    $('l-month').addEventListener('change', function () { rebuildDays('l-'); });
    ['l-type-buy', 'l-type-sell', 'l-ch-site', 'l-ch-person'].forEach(function (id) { $(id).addEventListener('change', syncPills); });
    ['l-type-buy', 'l-type-sell'].forEach(function (id) { $(id).addEventListener('change', applyDefaults); });
    $('o-search').addEventListener('input', applyFilter);
    $('o-only').addEventListener('click', function () {
      this.setAttribute('aria-pressed', String(this.getAttribute('aria-pressed') !== 'true'));
      applyFilter();
    });
    $('o-add-other').addEventListener('click', function () {
      if (oModels.length + oOthers.length >= 400) return;
      var m = addOtherLine(null);
      refreshOrder();
      m.els.name.focus();
    });
    $('l-cust-filter').addEventListener('input', function () { fillCustomerOptions(); });
    $('l-customer').addEventListener('change', function () {
      syncCustomer();
      if (this.value !== NEW_CUSTOMER) return;
      // Start the new name from what was typed in the search box (Latin words only).
      var words = cleanLedgerText($('l-cust-filter').value).split(' ');
      if (!$('l-first').value && !$('l-last').value && /^[A-Za-z]/.test(words[0] || '')) {
        $('l-first').value = words[0];
        $('l-last').value = words.slice(1).join(' ');
      }
      $('l-first').focus();
    });
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

  // What report.js may use (nothing that writes to the Sheet).
  window.barginAdmin = {
    api: api, onApiError: onApiError, setStatus: setStatus, logout: logout, getSession: getSession,
    toFa: toFa, fill: fill, months: TEXT.months,
    toJalali_: toJalali_, jalCal_: jalCal_, g2d_: g2d_, jalaliMonthDays_: jalaliMonthDays_
  };

  init();
})();
