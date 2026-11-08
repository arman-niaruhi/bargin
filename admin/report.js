// «گزارش» tab of the admin page (owner approved 2026-11-07). Loaded after admin.js.
// Read-only: every number comes from the server action getReport (SALES only, summed on the server).
// This file only draws: plain SVG, no libraries, ES2017, text set with textContent / SVG text only.
(function () {
  'use strict';

  var TEXT = {
    loading: 'در حال گرفتن گزارش…',
    empty: 'تو این بازه فروشی ثبت نشده.',
    oldServer: 'اسکریپت سرور قدیمیه و گزارش رو نمی‌شناسه. نسخه‌ی تازه‌ی Code.gs رو بذار و دوباره دیپلوی کن.',
    loadFail: 'گزارش بارگذاری نشد.',
    tiles: ['جمع فروش', 'تعداد سفارش', 'تعداد مشتری', 'میانگین هر سفارش'],
    toman: 'تومان',
    bunch: 'بقیه',
    customerNo: 'مشتری {n}',
    more60: 'فقط {n} تای آخر کشیده شده (بقیه‌ش توی «جدول اعداد» هست). برای دیدن همه‌ش چارت رو بکش.',
    barsOnlyPacks: 'طول نوار فقط تعداد «بسته» رو نشون می‌ده؛ واحدهای دیگه کنار اسم نوشته شده.',
    perUnit: 'تعداد هر واحد جدا حساب شده و با واحد دیگه جمع نمی‌شه.',
    siteName: 'سایت', personName: 'حضوری', unknownName: 'نامشخص',
    units: { pack: 'بسته', kg: 'کیلو', g: 'گرم', piece: 'عدد' },
    thDate: 'تاریخ', thWeek: 'هفته (از شنبه‌ی)', thMonth: 'ماه', thSales: 'فروش (تومان)', thOrders: 'سفارش',
    thProduct: 'محصول', thQty: 'تعداد', thChannel: 'کانال', thShare: 'سهم', thCustomer: 'مشتری',
    used: 'بر اساس {n} ردیف فروش، {range}.',
    rangeAll: 'از اولین تا آخرین فروش ثبت‌شده',
    rangeFromTo: 'از {a} تا {b}',
    skipped: '{n} ردیف فروش به خاطر نداشتن تاریخ یا مبلغ حساب نشد.',
    buys: 'ردیف‌های خرید ({n}) حساب نمی‌شن.',
    noCustomer: 'مشتری‌ها فقط از فروش‌هایی حساب می‌شن که مشتری دارن.',
    profitTiles: ['سود', 'هزینه', 'حاشیه سود'],
    thProfit: 'سود (تومان)', thCost: 'هزینه (تومان)', thMargin: 'حاشیه سود', thYear: 'سال',
    noProfitData: 'تو این بازه سودی حساب نشد: هیچ فروشی نیست که قیمت اولیه‌ی محصولش پر شده باشه (و واحدش «بسته/ظرف» باشه).',
    noRawTab: 'هنوز تب «قیمت اولیه محصولات» ساخته نشده. برای دیدن سود، setupRawPrices رو یه بار توی Apps Script اجرا کن.',
    noCostRows: '{n} ردیف فروش تو سود حساب نشدن، چون قیمت اولیه نداشتن، «سایر» بودن، یا واحدشون «بسته/ظرف» نبود.',
    rawNow: 'سود با قیمت اولیه‌ی فعلی هر محصول حساب شده: مبلغ فروشِ هر ردیف منهای (قیمت اولیه × تعداد).',
    profitHint: 'سود فقط از ردیف‌هایی که قیمت اولیه دارن حساب شده؛ محصول بدون قیمت اولیه تو این نمودار نیست.',
    marginNote: 'حاشیه سود = سود تقسیم بر فروشِ همون ردیف‌های حساب‌شده.',
    // «تحلیل و پیشنهاد»
    anLittle: 'برای تحلیل دست‌کم {need} سفارش لازمه، ولی تو این بازه فقط {n} سفارش هست. یه بازه‌ی بزرگ‌تر مثل «۳ ماه اخیر» یا «همه» رو انتخاب کن.',
    anOld: 'تحلیل نیاز به نسخه‌ی تازه‌ی Code.gs داره. اون رو بذار و دوباره دیپلوی کن.',
    anBasis: 'تحلیل بر اساس {n} سفارش ({m} ردیف فروش)، {range}.',
    anBasisPrev: ' دوره‌ی قبل: {k} روز قبل از شروع این بازه ({p} سفارش).',
    anNoPrev: ' برای این بازه، دوره‌ی قبلی نداریم؛ برای همین فلش روند نیست.',
    anCut: 'فقط ۲۰,۰۰۰ ردیف آخر خونده شد.',
    tipsTitle: 'پیشنهادها',
    tipsNone: 'هنوز داده‌ی کافی برای پیشنهاد نیست.',
    tipsHint: 'هر پیشنهاد از یه قانون ساده روی همین عددها درمیاد (حداکثر ۵ تا)؛ فقط از روی عددهای خودته، نه حدس.',
    bestTitle: 'کدوم محصول‌ها بهترن؟',
    quadHint: 'هر نقطه یه محصوله. هرچی نقطه رو به راست‌تر باشه فروشش بیشتره، و هرچی بالاتر، سودش. خط‌چین‌ها میانگین محصول‌هان. فقط محصول‌هایی که دست‌کم {n} ردیف فروش و قیمت اولیه دارن.',
    quadNeed: 'برای نمودار گروه‌ها دست‌کم {n} محصول لازمه که قیمت اولیه دارن و دست‌کم {l} ردیف فروش.',
    quadNoRaw: 'قیمت اولیه‌ی محصول‌ها رو وارد کن تا گروه‌بندی سود هم بیاد. فعلاً رتبه فقط از روی فروش و تعداد سفارشه.',
    scoreHint: 'امتیاز (۰ تا ۱۰۰): میانگین رتبه‌ی محصول تو {what}، تعداد سفارش و روند. محصول‌هایی که کمتر از {n} ردیف فروش دارن رتبه نمی‌گیرن.',
    whatProfit: 'سود', whatSales: 'فروش',
    groups: { star: 'ستاره', volume: 'پرفروش کم‌سود', profit: 'پرسود کم‌فروش', weak: 'ضعیف' },
    axisX: 'تعداد سفارش', axisY: 'حاشیه سود',
    scoreLabel: 'امتیاز', shareLabel: 'سهم', trendNone: 'روند: —', trendLabel: 'روند',
    trendWord: { up: 'رو به بالا', down: 'رو به پایین', flat: 'ثابت' },
    abcTitle: 'تمرکز فروش',
    abcLine: '{n} محصول از {m} محصول، {s}٪ فروشت رو می‌سازن.',
    abcA: 'محصول‌های اصلی', abcB: 'میانی', abcC: 'بقیه',
    abcHint: 'اصلی‌ها: اولین ۸۰٪ فروش. میانی‌ها: تا ۹۵٪. بقیه: ۵٪ آخر.',
    custTitle: 'مشتری‌های برگشتی',
    custLittle: 'هنوز مشتری کافی نیست: دست‌کم {n} مشتری با اسم ثبت‌شده لازمه؛ الان {k} تا داری.',
    custTiles: ['خرید دوباره', 'میانگین هر سفارش', 'تعداد محصول تو هر سفارش', 'مشتری‌های دوره‌ی قبل که برگشتن'],
    custRepeat: '{p}٪ ({a} از {b})',
    custNoId: '{n} سفارش بدون اسم مشتری، تو این حساب نیومد.',
    pairsTitle: 'چی با چی خریده می‌شه؟',
    pairsNone: 'هنوز دو محصولی نیست که دست‌کم {n} بار با هم تو یه سفارش خریده شده باشن (تعداد سفارش‌های چندمحصولی: {m}).',
    pairsRow: '{n} سفارش',
    whenTitle: 'کی بهتر می‌فروشیم؟',
    dayNames: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'],
    weekdayLittle: 'برای نتیجه‌ی روزهای هفته دست‌کم ۴ هفته فروش لازمه. بازه‌ی بزرگ‌تری انتخاب کن.',
    weekdayTitle: 'روزهای هفته (جمع فروش)',
    monthTitle: 'ماه‌ها (جمع فروش)',
    monthNote: 'ماه جاری هنوز تموم نشده و تو انتخاب بهترین ماه حساب نمی‌شه.',
    monthLittle: 'برای مقایسه‌ی ماه‌ها دست‌کم {n} ماه کامل لازمه. «همه» رو انتخاب کن.',
    channelTitle: 'سایت یا حضوری؟',
    thOrdersN: 'سفارش', thAvg: 'میانگین سفارش (تومان)', thMarginShort: 'حاشیه سود',
    idleTitle: 'محصول‌های کم‌فروش',
    idleLittle: 'برای این بخش دست‌کم ۸ هفته فروش لازمه. «۳ ماه اخیر» یا «همه» رو انتخاب کن.',
    idleNone: 'همه‌ی محصول‌های فروشگاه تو {k} روز اخیر فروش داشتن.',
    idleNever: 'تو این {k} روز اصلاً فروش نرفتن',
    idleRare: 'بیشتر از ۲۸ روزه فروش نرفتن',
    idleDays: '{n} روز',
    // «بررسی یه محصول»
    pvAll: 'همه محصولات (نمای کلی)', pvOtherTag: 'سایر',
    pvTiles: ['فروش این محصول', 'مقدار فروش', 'تعداد سفارش', 'میانگین هر سفارش', 'سهم از کل فروش', 'روند نسبت به دوره‌ی قبل'],
    pvNone: 'تو این بازه‌ی زمانی از این محصول فروشی ثبت نشده.',
    pvLast: 'آخرین فروشش {d} بوده.',
    pvNoLast: 'تو این بازه و دوره‌ی قبلش هم فروشی ازش ثبت نشده.',
    pvBasis: 'بر اساس {n} ردیف فروش این محصول (از کل {m} ردیف فروش)، {range}.',
    pvCut: 'فقط ۲۰,۰۰۰ ردیف فروشِ آخر حساب شد.',
    pvTrendNeed: 'فلش روند وقتی میاد که تو هر دو دوره دست‌کم {n} ردیف فروش این محصول باشه.',
    pvOther: 'این یه مورد «سایر»ه؛ قیمت اولیه نداره و تو سود حساب نمی‌شه.',
    pvNoRaw: 'این محصول قیمت اولیه نداره (یا واحد فروشش «بسته/ظرف» نیست)، برای همین سودش حساب نشده.',
    pvUncosted: '{n} ردیف فروش این محصول تو سود حساب نشدن، چون قیمت اولیه نداشتن یا واحدشون «بسته/ظرف» نبود.',
    pvPriceTitle: 'قیمت فروش هر بسته',
    pvPriceNone: 'تو این بازه برای این محصول ردیف فروشی با واحد «بسته/ظرف» نیست، پس قیمت هر بسته حساب نمی‌شه.',
    pvPriceOne: 'فقط تو یه روز فروش «بسته/ظرف» داشتیم و قیمت هر بسته {p} تومان بود.',
    pvPriceHint: 'قیمت هر بسته = مبلغ ردیف ÷ تعداد، فقط از ردیف‌های «بسته/ظرف». اگه تو یه روز چند فروش داشتی، میانگینشون حساب می‌شه. کمترین {min}، بیشترین {max}، آخرین {last} تومان.',
    thPrice: 'قیمت هر بسته (تومان)',
    pvCustHint: 'فقط سفارش‌هایی که مشتری ثبت‌شده دارن حساب می‌شن.',
    pvCustNoId: ' {n} سفارش چون مشتری نداشت حساب نشد.',
    pvCustNone: 'هیچ‌کدوم از سفارش‌های این محصول مشتری ثبت‌شده ندارن.',
    pvWithNone: 'هنوز محصولی نیست که دست‌کم {n} بار تو یه سفارش با این محصول خریده شده باشه.',
    pvWithRow: '{n} سفارش · {p}٪ از سفارش‌های این محصول',
    pvWeekLittle: 'برای بهترین روزهای هفته دست‌کم ۴ هفته فروش و {n} سفارش از این محصول لازمه. یه بازه‌ی بزرگ‌تر مثل «۳ ماه اخیر» یا «همه» رو انتخاب کن.',
    // «همه محصولات فروخته‌شده»
    allCols: { name: 'محصول', toman: 'فروش', qty: 'مقدار فروش', orders: 'تعداد سفارش', avg: 'میانگین سفارش', share: 'سهم از فروش', trend: 'روند', profit: 'سود', margin: 'حاشیه سود', price: 'قیمت هر بسته/ظرف', cust: 'بهترین مشتری', withp: 'بیشتر همراه', day: 'بهترین روز هفته' },
    allHint: 'فقط محصول‌هایی که تو این بازه فروش رفتن ({n} تا). برای مرتب کردن، ستونو انتخاب کن (تو گوشی از «مرتب‌سازی»). روی یه محصول بزن تا همه‌ی عددهاش رو ببینی. «—» یعنی داده‌ی کافی نیست یا اون عدد برای این محصول حساب نمی‌شه. قیمت هر بسته/ظرف = آخرین قیمتی که یه بسته/ظرف باهاش فروخته شده (اگه اون روز چند فروش بوده، میانگین همون روزه). مرتب‌سازی «مقدار فروش» فقط بر اساس بسته/ظرفه (کیلو، گرم و عدد توش حساب نمی‌شن).',
    allSort: 'مرتب‌سازی', allMore: 'عددهای بیشتر',
    // direction labels by column type: numbers, text (Persian alphabet), weekday (from Saturday)
    allDir: { num: ['زیاد به کم ↓', 'کم به زیاد ↑', 'از زیاد به کم', 'از کم به زیاد'], text: ['ی تا الف ↓', 'الف تا ی ↑', 'از ی تا الف', 'از الف تا ی'], day: ['جمعه تا شنبه ↓', 'شنبه تا جمعه ↑', 'از جمعه تا شنبه', 'از شنبه تا جمعه'] }
  };

  var DAY_MS = 86400000;
  var MAX_BARS = 60;
  var COLORS = { site: '#2f7a1f', person: '#4a2c1a', unknown: '#d2ad6c', bar: '#2f7a1f', grid: '#d9bd8c', rest: '#9b8160', loss: '#c8321e' };
  var UNITS = ['pack', 'kg', 'g', 'piece'];
  var ad = window.barginAdmin || {};

  // ---- numbers ----
  function toFa(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(d); }); }
  function decFa(n) { return toFa(String(n)).replace('.', '٫'); }
  function groupFa(n) { return toFa(String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')); }
  function round1(x) { return Math.round(x * 10) / 10; }
  // Compact money: 1200000 → «۱٫۲ میلیون», 450000 → «۴۵۰ هزار», 2500000000 → «۲٫۵ میلیارد», 800 → «۸۰۰».
  function fmtMoney(n) {
    var a = Math.abs(n), v;
    if (a >= 1e9) { v = round1(n / 1e9); return decFa(v) + ' میلیارد'; }
    if (a >= 1e6) { v = round1(n / 1e6); return decFa(v) + ' میلیون'; }
    if (a >= 1e3) { v = round1(n / 1e3); return decFa(v) + ' هزار'; }
    return toFa(Math.round(n));
  }
  function fmtNum(n) { return decFa(Math.round(n * 100) / 100); }
  // {pack:12, kg:2.5, g:0, piece:0} → «۱۲ بسته + ۲٫۵ کیلو»; nothing sold in any unit → «—».
  function fmtQty(q) {
    var parts = [];
    UNITS.forEach(function (u) { if (q && q[u] > 0) parts.push(fmtNum(q[u]) + ' ' + TEXT.units[u]); });
    return parts.length ? parts.join(' + ') : '—';
  }
  function pct(part, whole) { return whole > 0 ? Math.round(part * 100 / whole) : 0; }
  function rtl(s) { return '⁧' + s + '⁩'; }   // RTL isolate, so mixed text reads right inside the LTR chart box

  // ---- dates (Persian calendar; the helpers come from admin.js) ----
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function jkey(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function jparse(s) { var p = String(s).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  // Persian date → UTC midnight in ms (via the Gregorian date of 1 Farvardin).
  function jToMs(y, m, d) {
    var r = ad.jalCal_(y);
    var doy = (m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30) + d - 1;
    return Date.UTC(r.gy, 2, r.march + doy);
  }
  function msToJ(ms) {
    var t = new Date(ms);
    return ad.toJalali_(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  // Saturday = 0 … Friday = 6.
  function satIndex(ms) { return (new Date(ms).getUTCDay() + 1) % 7; }
  function weekdayOf(key) { var j = jparse(key); return satIndex(jToMs(j.y, j.m, j.d)); }   // Saturday = 0 … Friday = 6
  function weekStartKey(key) {
    var j = jparse(key), ms = jToMs(j.y, j.m, j.d) - satIndex(jToMs(j.y, j.m, j.d)) * DAY_MS;
    var w = msToJ(ms);
    return jkey(w.y, w.m, w.d);
  }
  function monthKey(key) { return key.slice(0, 7) + '-01'; }
  function addDays(key, n) { var j = jparse(key), w = msToJ(jToMs(j.y, j.m, j.d) + n * DAY_MS); return jkey(w.y, w.m, w.d); }
  function dayDiff(a, b) { var x = jparse(a), y = jparse(b); return Math.round((jToMs(y.y, y.m, y.d) - jToMs(x.y, x.m, x.d)) / DAY_MS); }
  // Today in Tehran (not the computer's own zone) as 'yyyy-mm-dd' in the Persian calendar.
  function todayKey(now) {
    var d = now || new Date(), y, m, dd;
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
      var o = {};
      parts.forEach(function (p) { o[p.type] = +p.value; });
      y = o.year; m = o.month; dd = o.day;
    } catch (e) { y = d.getFullYear(); m = d.getMonth() + 1; dd = d.getDate(); }
    var j = ad.toJalali_(y, m, dd);
    return jkey(j.y, j.m, j.d);
  }
  // The period buttons → {from, to} ('' = no limit). «۳ ماه اخیر» = the last 90 days including today.
  function rangeFor(period, today) {
    var t = jparse(today);
    if (period === 'month') return { from: jkey(t.y, t.m, 1), to: today };
    if (period === 'year') return { from: jkey(t.y, 1, 1), to: today };
    if (period === 'd90') return { from: addDays(today, -89), to: today };
    if (period === 'week7') return { from: addDays(today, -6), to: today };   // the last 7 days including today
    if (period === 'lastweek') { var ws = weekStartKey(today); return { from: addDays(ws, -7), to: addDays(ws, -1) }; }   // previous Saturday–Friday
    return { from: '', to: '' };
  }

  // ---- series for the time chart ----
  function keyOf(day, grain) {
    if (grain === 'week') return weekStartKey(day);
    if (grain === 'month') return monthKey(day);
    if (grain === 'year') return day.slice(0, 4) + '-01-01';
    return day;
  }
  function nextKey(k, grain) {
    if (grain === 'day') return addDays(k, 1);
    if (grain === 'week') return addDays(k, 7);
    var j = jparse(k);
    if (grain === 'year') return jkey(j.y + 1, 1, 1);
    return j.m === 12 ? jkey(j.y + 1, 1, 1) : jkey(j.y, j.m + 1, 1);
  }
  function emptyBucket(k) { return { key: k, toman: 0, orders: 0, cost: 0, profit: 0 }; }
  // byDay [{d, toman, orders, cost, profit}] → oldest-first [{key, toman, orders, cost, profit}] with empty
  // days/weeks/months/years filled in between `from` and `to` (or between the first and last sale when there is no limit).
  function buildSeries(byDay, grain, from, to) {
    if (!byDay.length) return [];
    var map = {}, first = byDay[0].d, last = byDay[byDay.length - 1].d;
    byDay.forEach(function (x) {
      var k = keyOf(x.d, grain), c = map[k] || (map[k] = emptyBucket(k));
      c.toman += x.toman; c.orders += x.orders; c.cost += x.cost || 0; c.profit += x.profit || 0;
    });
    var a = keyOf(from || first, grain), b = keyOf(to || last, grain), out = [], k = a, guard = 0;
    while (k <= b && guard < 5000) { out.push(map[k] || emptyBucket(k)); k = nextKey(k, grain); guard += 1; }
    return out;
  }
  function labelOf(key, grain) {
    var j = jparse(key), names = ad.months || [];
    if (grain === 'year') return toFa(j.y);
    if (grain === 'month') return names[j.m - 1] || '';
    if (grain === 'week') return toFa(j.d) + ' ' + (names[j.m - 1] || '');
    return toFa(j.d);
  }

  // ---- products ----
  function qtyScore(p) { return p.qty.pack; }
  // Rank by packs, then by the number of sale lines, then by money. Units are never mixed.
  function rankByCount(list) {
    return list.slice().sort(function (a, b) {
      return qtyScore(b) - qtyScore(a) || b.lines - a.lines || b.toman - a.toman;
    });
  }
  function sumQty(list) {
    var q = { pack: 0, kg: 0, g: 0, piece: 0 };
    list.forEach(function (p) { UNITS.forEach(function (u) { q[u] += p.qty[u]; }); });
    UNITS.forEach(function (u) { q[u] = Math.round(q[u] * 100) / 100; });
    return q;
  }
  // The rows for the product chart: top 8 plus «بقیه». mode: 'toman' | 'count'.
  // mode 'profit': only products with at least one costed line, best profit first (losses last); each row also
  // carries cost, profit, costedToman (its margin base).
  function productRows(byProduct, mode) {
    var list;
    if (mode === 'count') list = rankByCount(byProduct);
    else if (mode === 'profit') list = byProduct.filter(function (p) { return p.costedLines > 0; }).sort(function (a, b) { return b.profit - a.profit || (a.name < b.name ? -1 : 1); });
    else list = byProduct.slice().sort(function (a, b) { return b.toman - a.toman; });
    var top = list.slice(0, 8), rest = list.slice(8);
    var rows = top.map(function (p) { return { name: p.name, toman: p.toman, qty: p.qty, lines: p.lines, cost: p.cost || 0, profit: p.profit || 0, costedToman: p.costedToman || 0 }; });
    if (rest.length) {
      var t = 0, l = 0, c = 0, pf = 0, ct = 0;
      rest.forEach(function (p) { t += p.toman; l += p.lines; c += p.cost || 0; pf += p.profit || 0; ct += p.costedToman || 0; });
      rows.push({ name: TEXT.bunch + ' (' + toFa(rest.length) + ')', toman: t, qty: sumQty(rest), lines: l, cost: c, profit: pf, costedToman: ct, rest: true });
    }
    return { rows: rows, all: list };
  }
  // margin % of money that was costed (0 when there is none); negative when selling under the cost
  function margin(profit, costedToman) { return costedToman > 0 ? Math.round(profit * 100 / costedToman) : 0; }
  // A negative number is one left-to-right block «−۵۰۰» (isolated with LRI/PDI), so the minus always sits right before the digits,
  // visually on their left, as Persian readers expect; the unit word (هزار / میلیون) stays outside the block.
  function neg(s) { return '\u2066\u2212' + s + '\u2069'; }
  function fmtSigned(n) { return n < 0 ? neg(groupFa(-n)) : groupFa(n); }
  function fmtMoneySigned(n) {
    if (n >= 0) return fmtMoney(n);
    var t = fmtMoney(-n), k = t.indexOf(' ');
    return k < 0 ? neg(t) : neg(t.slice(0, k)) + t.slice(k);
  }
  function fmtPct(n) { return n < 0 ? neg(toFa(-n) + '٪') : toFa(n) + '٪'; }

  // ---- SVG helpers ----
  var NS = 'http://www.w3.org/2000/svg';
  function S(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function niceMax(max) {
    if (!(max > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(max) / Math.LN10)), best = p * 10, i, steps = [1, 2, 2.5, 5, 10];
    for (i = 0; i < steps.length; i++) if (steps[i] * p >= max) { best = steps[i] * p; break; }
    return best;
  }
  function svgBox(host, w, h, label) {
    var svg = S('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': label });
    host.appendChild(svg);
    return svg;
  }

  // Bars over time. series is oldest-first; the NEWEST bars are drawn (at most 60), newest on the left
  // because the page reads right to left (oldest on the right). metric 'toman' (sales) or 'profit' (can be
  // negative: those bars hang below the zero line, in red).
  function drawTime(host, series, grain, metric) {
    clear(host);
    if (!series.length) return 0;
    metric = metric === 'profit' ? 'profit' : 'toman';
    var shown = series.slice(-MAX_BARS).reverse();   // newest first = left to right
    var n = shown.length, left = 62, right = 8, top = 26, bottom = 46, H = 230;
    var slotMin = grain === 'day' ? 18 : (grain === 'week' ? 30 : 44);
    var avail = host.clientWidth || 320;
    var W = Math.max(avail, left + right + n * slotMin);
    var slot = (W - left - right) / n, bw = Math.min(40, slot * 0.7);
    var max = 0, min = 0;
    shown.forEach(function (x) { if (x[metric] > max) max = x[metric]; if (x[metric] < min) min = x[metric]; });
    var posMax = max > 0 ? niceMax(max) : 0, negMax = min < 0 ? niceMax(-min) : 0;
    if (posMax + negMax <= 0) posMax = 1;
    var span = posMax + negMax, ch = H - top - bottom;
    function yOf(v) { return top + ch * (posMax - v) / span; }
    var svg = svgBox(host, W, H, metric === 'profit' ? 'نمودار سود' : 'نمودار فروش');
    var t, zeroY = yOf(0);
    for (t = 0; t <= 4; t++) {
      var v = -negMax + span * t / 4, y = yOf(v);
      if (Math.abs(y - zeroY) < 1) continue;
      svg.appendChild(S('line', { x1: left - 4, x2: W - right, y1: y, y2: y, stroke: COLORS.grid, 'stroke-width': 1, 'stroke-dasharray': '3 4' }));
      if (Math.abs(y - zeroY) > 12) svg.appendChild(S('text', { x: 2, y: y + 4, 'font-size': 11, 'text-anchor': 'start' }, rtl(fmtMoneySigned(v))));
    }
    svg.appendChild(S('line', { x1: left - 4, x2: W - right, y1: zeroY, y2: zeroY, stroke: negMax > 0 ? COLORS.rest : COLORS.grid, 'stroke-width': negMax > 0 ? 1.5 : 1 }));
    svg.appendChild(S('text', { x: 2, y: zeroY + 4, 'font-size': 11, 'text-anchor': 'start' }, rtl('۰')));
    var labelW = grain === 'day' ? 16 : (grain === 'week' ? 54 : 50), step = Math.max(1, Math.ceil(labelW / slot));
    var showVals = n <= 12;
    shown.forEach(function (x, i) {
      var val = x[metric], cx = left + slot * i + slot / 2, bh = ch * Math.abs(val) / span, neg = val < 0;
      var rect = S('rect', { x: cx - bw / 2, y: neg ? zeroY : zeroY - bh, width: bw, height: Math.max(0, bh), rx: 3, fill: neg ? COLORS.loss : COLORS.bar });
      rect.appendChild(S('title', null, rtl(labelOf(x.key, grain) + ' — ' + fmtSigned(val) + ' ' + TEXT.toman)));
      svg.appendChild(rect);
      if (showVals && val !== 0) svg.appendChild(S('text', { x: cx, y: neg ? zeroY + bh + 12 : zeroY - bh - 5, 'font-size': 10, 'text-anchor': 'middle' }, rtl(fmtMoneySigned(val))));
      if (i % step === 0 || i === 0) svg.appendChild(S('text', { x: cx, y: top + ch + 15, 'font-size': 10.5, 'text-anchor': 'middle' }, rtl(labelOf(x.key, grain))));
      if (grain === 'day') {
        var j = jparse(x.key), prev = i + 1 < n ? jparse(shown[i + 1].key) : null;   // the older neighbour is on the right
        if (!prev || prev.m !== j.m) svg.appendChild(S('text', { x: cx, y: top + ch + 32, 'font-size': 10.5, 'font-weight': 700, 'text-anchor': 'middle' }, rtl((ad.months || [])[j.m - 1] || '')));
      } else if (grain === 'week' || grain === 'month') {
        var jj = jparse(x.key), pr = i + 1 < n ? jparse(shown[i + 1].key) : null;
        if (!pr || pr.y !== jj.y) svg.appendChild(S('text', { x: cx, y: top + ch + 32, 'font-size': 10.5, 'font-weight': 700, 'text-anchor': 'middle' }, rtl(toFa(jj.y))));
      }
    });
    host.scrollLeft = 0;
    return series.length;
  }

  // Horizontal bars: rows [{label, value, text, color}], value ≥ 0. Label on the right, value text on the left,
  // the bar starts at the right edge.
  function drawRows(host, rows, label) {
    clear(host);
    var W = Math.max(host.clientWidth || 300, 280), rowH = 46, pad = 4, H = rows.length * rowH + pad * 2;
    var max = 0;
    rows.forEach(function (r) { if (r.value > max) max = r.value; });
    var svg = svgBox(host, W, H, label);
    rows.forEach(function (r, i) {
      var y = pad + i * rowH, full = W - pad * 2;
      var len = max > 0 && r.value > 0 ? Math.max(4, full * r.value / max) : 3;
      svg.appendChild(S('text', { x: W - pad, y: y + 15, 'font-size': 13, 'font-weight': 700, 'text-anchor': 'end' }, rtl(r.label)));
      svg.appendChild(S('text', { x: pad, y: y + 15, 'font-size': 12, 'text-anchor': 'start' }, rtl(r.text)));
      var bar = S('rect', { x: W - pad - len, y: y + 22, width: len, height: 14, rx: 5, fill: r.color || COLORS.bar });
      bar.appendChild(S('title', null, rtl(r.label + ' — ' + r.text)));
      svg.appendChild(bar);
    });
  }

  function drawChannel(host, legend, ch) {
    clear(host); clear(legend);
    var keys = ['site', 'person', 'unknown'], names = { site: TEXT.siteName, person: TEXT.personName, unknown: TEXT.unknownName };
    var total = 0;
    keys.forEach(function (k) { total += ch[k].toman; });
    if (!(total > 0)) return false;
    var W = Math.max(host.clientWidth || 300, 280), H = 52, x = W;
    var svg = svgBox(host, W, H, 'سایت یا حضوری');
    keys.forEach(function (k) {
      var w = W * ch[k].toman / total;
      if (w <= 0) return;
      x -= w;
      var seg = S('rect', { x: x, y: 4, width: w, height: 44, fill: COLORS[k], stroke: '#f8ecd5', 'stroke-width': 1 });
      seg.appendChild(S('title', null, rtl(names[k] + ' — ' + groupFa(ch[k].toman) + ' ' + TEXT.toman)));
      svg.appendChild(seg);
      if (w > 44) svg.appendChild(S('text', { x: x + w / 2, y: 31, 'font-size': 13, 'font-weight': 700, 'text-anchor': 'middle', fill: k === 'unknown' ? '#3b2a1e' : '#ffffff', style: 'fill:' + (k === 'unknown' ? '#3b2a1e' : '#ffffff') }, rtl(toFa(pct(ch[k].toman, total)) + '٪')));
    });
    keys.forEach(function (k) {
      if (!(ch[k].toman > 0) && !(ch[k].orders > 0)) return;
      var s = document.createElement('span'), sw = document.createElement('i');
      sw.style.background = COLORS[k];
      s.appendChild(sw);
      s.appendChild(document.createTextNode(names[k] + ': ' + fmtMoney(ch[k].toman) + ' ' + TEXT.toman + ' — ' + toFa(ch[k].orders) + ' ' + TEXT.thOrders));
      legend.appendChild(s);
    });
    return true;
  }

  // ---- tables (inside <details>) ----
  function drawTable(host, heads, rows) {
    clear(host);
    var tb = document.createElement('table'), tr;
    tb.className = 'rp-table';
    var thead = document.createElement('thead');
    tr = document.createElement('tr');
    heads.forEach(function (h, k) { var th = document.createElement('th'); th.textContent = h; if (k) th.className = 'n'; tr.appendChild(th); });
    thead.appendChild(tr); tb.appendChild(thead);
    var tbody = document.createElement('tbody');
    rows.forEach(function (r) {
      tr = document.createElement('tr');
      r.forEach(function (c, k) { var td = document.createElement('td'); td.textContent = c; if (k) td.className = 'n'; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    host.appendChild(tb);
  }

  // ---- the tab ----
  var st = { period: 'd90', grain: 'day', metric: 'toman', mode: 'toman', cache: {}, token: 0, data: null, range: null, an: null, cut: false, prevDays: 0, raw: null, product: '', pv: null, allRows: null, allSort: { col: 'toman', dir: -1 } };
  function $(id) { return document.getElementById(id); }

  function tile(label, big, full, neg) {
    var d = document.createElement('div'), b = document.createElement('b'), s = document.createElement('span');
    d.className = 'rp-tile' + (neg ? ' rp-neg' : '');
    b.textContent = big;
    if (full) d.title = full;
    s.textContent = label;
    d.appendChild(b); d.appendChild(s);
    return d;
  }

  function hasProfit() { var p = st.data && st.data.profit; return !!(p && p.ready && p.rows > 0); }

  // The time chart + hint + table for the overview (ids r-*) or for one product (ids pv-*); one shared switch.
  function renderTimeFor(ids, byDay, withProfit, noProfitMsg) {
    var series = buildSeries(byDay, st.grain, st.range.from, st.range.to), prof = st.metric === 'profit';
    if (prof && !withProfit) {
      clear($(ids.chart));
      $(ids.hint).textContent = noProfitMsg;
    } else {
      var total = drawTime($(ids.chart), series, st.grain, st.metric);
      $(ids.hint).textContent = (total > MAX_BARS ? fill(TEXT.more60, { n: toFa(MAX_BARS) }) + ' ' : '') + (prof ? TEXT.profitHint : '');
    }
    var head = st.grain === 'week' ? TEXT.thWeek : (st.grain === 'month' ? TEXT.thMonth : (st.grain === 'year' ? TEXT.thYear : TEXT.thDate));
    var rows = series.slice().reverse().map(function (x) {
      var j = jparse(x.key), r = [st.grain === 'year' ? toFa(j.y) : (st.grain === 'month' ? (ad.months[j.m - 1] + ' ' + toFa(j.y)) : toFa(x.key.replace(/-/g, '/'))), groupFa(x.toman), toFa(x.orders)];
      if (withProfit) r.push(fmtSigned(x.profit));
      return r;
    });
    var heads = [head, TEXT.thSales, TEXT.thOrders];
    if (withProfit) heads.push(TEXT.thProfit);
    drawTable($(ids.table), heads, rows);
  }
  function renderTime() {
    var sum = st.data;
    renderTimeFor({ chart: 'r-time', hint: 'r-time-hint', table: 'r-time-table' }, sum.byDay, hasProfit(), sum.profit && !sum.profit.ready ? TEXT.noRawTab : TEXT.noProfitData);
  }

  function renderProducts() {
    var sum = st.data, pr = productRows(sum.byProduct, st.mode), count = st.mode === 'count', prof = st.mode === 'profit';
    var rows = pr.rows.map(function (r) {
      if (prof) return { label: r.name, value: Math.abs(r.profit), text: fmtMoneySigned(r.profit) + ' ' + TEXT.toman + ' · ' + fmtPct(margin(r.profit, r.costedToman)), color: r.profit < 0 ? COLORS.loss : (r.rest ? COLORS.rest : COLORS.bar) };
      return { label: r.name, value: count ? r.qty.pack : r.toman, text: count ? fmtQty(r.qty) : fmtMoney(r.toman) + ' ' + TEXT.toman, color: r.rest ? COLORS.rest : COLORS.bar };
    });
    if (!rows.length) { clear($('r-prod')); } else drawRows($('r-prod'), rows, prof ? 'پرسودترین محصولات' : 'پرفروش‌ترین محصولات');
    if (prof) $('r-prod-hint').textContent = rows.length ? TEXT.profitHint + ' ' + TEXT.marginNote : (sum.profit && !sum.profit.ready ? TEXT.noRawTab : TEXT.noProfitData);
    else $('r-prod-hint').textContent = count ? TEXT.perUnit + ' ' + TEXT.barsOnlyPacks : '';
    if (prof) drawTable($('r-prod-table'), [TEXT.thProduct, TEXT.thProfit, TEXT.thMargin, TEXT.thCost],
      pr.all.map(function (p) { return [p.name, fmtSigned(p.profit), fmtPct(margin(p.profit, p.costedToman)), groupFa(p.cost)]; }));
    else drawTable($('r-prod-table'), [TEXT.thProduct, count ? TEXT.thQty : TEXT.thSales, count ? TEXT.thSales : TEXT.thQty],
      pr.all.map(function (p) { return count ? [p.name, fmtQty(p.qty), groupFa(p.toman)] : [p.name, groupFa(p.toman), fmtQty(p.qty)]; }));
  }

  function renderChannel() {
    var ch = st.data.byChannel, total = ch.site.toman + ch.person.toman + ch.unknown.toman;
    drawChannel($('r-chan'), $('r-chan-legend'), ch);
    drawTable($('r-chan-table'), [TEXT.thChannel, TEXT.thSales, TEXT.thShare, TEXT.thOrders],
      [['site', TEXT.siteName], ['person', TEXT.personName], ['unknown', TEXT.unknownName]].map(function (k) {
        return [k[1], groupFa(ch[k[0]].toman), toFa(pct(ch[k[0]].toman, total)) + '٪', toFa(ch[k[0]].orders)];
      }));
  }

  function custName(c) { return c.name ? '⁨' + c.name + '⁩' : fill(TEXT.customerNo, { n: toFa(c.id) }); }
  function renderCustomers() {
    var list = st.data.topCustomers;
    if (!list.length) { clear($('r-cust')); } else {
      drawRows($('r-cust'), list.map(function (c) {
        return { label: custName(c), value: c.toman, text: fmtMoney(c.toman) + ' ' + TEXT.toman + ' · ' + toFa(c.orders) + ' ' + TEXT.thOrders };
      }), 'بهترین مشتری‌ها');
    }
    drawTable($('r-cust-table'), [TEXT.thCustomer, TEXT.thSales, TEXT.thOrders],
      list.map(function (c) { return [custName(c), groupFa(c.toman), toFa(c.orders)]; }));
  }

  function fill(t, v) { return t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? String(v[k]) : m; }); }

  function renderAll() {
    var sum = st.data, t = sum.totals;
    var tiles = $('r-tiles');
    clear(tiles);
    var avg = t.orders > 0 ? Math.round(t.toman / t.orders) : 0;
    tiles.appendChild(tile(TEXT.tiles[0], fmtMoney(t.toman) + ' ' + TEXT.toman, groupFa(t.toman) + ' ' + TEXT.toman));
    tiles.appendChild(tile(TEXT.tiles[1], toFa(t.orders)));
    tiles.appendChild(tile(TEXT.tiles[2], toFa(t.customers)));
    tiles.appendChild(tile(TEXT.tiles[3], t.orders > 0 ? fmtMoney(avg) + ' ' + TEXT.toman : '—', t.orders > 0 ? groupFa(avg) + ' ' + TEXT.toman : ''));
    var pt = $('r-tiles-profit');
    clear(pt);
    pt.hidden = !hasProfit();
    if (hasProfit()) {
      var pf = sum.profit;
      pt.appendChild(tile(TEXT.profitTiles[0], fmtMoneySigned(pf.profit) + ' ' + TEXT.toman, fmtSigned(pf.profit) + ' ' + TEXT.toman, pf.profit < 0));
      pt.appendChild(tile(TEXT.profitTiles[1], fmtMoney(pf.cost) + ' ' + TEXT.toman, groupFa(pf.cost) + ' ' + TEXT.toman));
      pt.appendChild(tile(TEXT.profitTiles[2], fmtPct(margin(pf.profit, pf.sales)), '', pf.profit < 0));
    }
    renderTime(); renderProducts(); renderAllProducts(); renderChannel(); renderCustomers();
    var range = st.range.from ? fill(TEXT.rangeFromTo, { a: toFa(st.range.from.replace(/-/g, '/')), b: toFa(st.range.to.replace(/-/g, '/')) }) : TEXT.rangeAll;
    var line = fill(TEXT.used, { n: toFa(sum.rows.used), range: range });
    var sk = sum.rows.skipped.noDate + sum.rows.skipped.noTotal;
    if (sk) line += ' ' + fill(TEXT.skipped, { n: toFa(sk) });
    if (sum.rows.buysIgnored) line += ' ' + fill(TEXT.buys, { n: toFa(sum.rows.buysIgnored) });
    if (sum.profit && sum.profit.ready) {
      if (sum.profit.noCost.rows) line += ' ' + fill(TEXT.noCostRows, { n: toFa(sum.profit.noCost.rows) });
      if (sum.profit.rows) line += ' ' + TEXT.rawNow;
    } else if (sum.profit) line += ' ' + TEXT.noRawTab;
    $('r-used').textContent = line + ' ' + TEXT.noCustomer;
    renderAnalysis();
  }


  // ---- «تحلیل و پیشنهاد» (numbers come from analysis.js; this part only draws) ----
  var AN = window.barginAnalysis;
  var GROUP_COLOR = { star: '#2f7a1f', volume: '#a8700f', profit: '#4a2c1a', weak: '#8794a0' };
  var GROUP_ORDER = ['star', 'volume', 'profit', 'weak'];
  function quoted(name) { return '«' + '⁨' + name + '⁩' + '»'; }
  function fmtOf() {
    return {
      fa: toFa, money: fmtMoneySigned, pct: fmtPct, q: quoted, toman: TEXT.toman,
      day: function (i) { return TEXT.dayNames[i]; },
      month: function (key) { var j = jparse(key); return (ad.months || [])[j.m - 1] + ' ' + toFa(j.y); },
      names: { site: TEXT.siteName, person: TEXT.personName }
    };
  }
  function trendText(t) {
    if (!t) return TEXT.trendNone;
    return (t.dir === 'up' ? '↑ ' : (t.dir === 'down' ? '↓ ' : '→ ')) + (t.pct === 0 ? TEXT.trendWord.flat : fmtPct(t.pct));
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function kv(host, label, value) {
    var s = el('span', 'rp-kv');
    if (label) s.appendChild(document.createTextNode(label + ' '));
    s.appendChild(el('b', '', value));
    host.appendChild(s);
  }
  function wrapTrunc(name, n) { return name.length > n ? name.slice(0, n - 1) + '…' : name; }

  // Dots: x = number of orders with the product, y = margin %. Dashed lines = the dividing averages.
  function drawQuad(host, a) {
    clear(host);
    var list = a.products.filter(function (p) { return p.group; }).slice(0, 14);
    if (!list.length) return;
    var W = Math.max(host.clientWidth || 320, 300), H = 320, L = 44, R = 10, T = 22, B = 36;
    var maxX = 0, minY = 0, maxY = 0;
    list.forEach(function (p) { if (p.orders > maxX) maxX = p.orders; if (p.margin < minY) minY = p.margin; if (p.margin > maxY) maxY = p.margin; });
    maxX = Math.max(maxX, a.quad.medVolume) * 1.12; maxY = Math.max(maxY, a.quad.avgMargin, 5) * 1.12; minY = Math.min(minY, a.quad.avgMargin, 0) * 1.12;
    var svg = svgBox(host, W, H, TEXT.bestTitle);
    function X(v) { return L + (W - L - R) * v / maxX; }
    function Y(v) { return T + (H - T - B) * (maxY - v) / (maxY - minY); }
    svg.appendChild(S('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'none', stroke: COLORS.grid, 'stroke-width': 1 }));
    svg.appendChild(S('line', { x1: X(a.quad.medVolume), x2: X(a.quad.medVolume), y1: T, y2: H - B, stroke: COLORS.rest, 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
    svg.appendChild(S('line', { x1: L, x2: W - R, y1: Y(a.quad.avgMargin), y2: Y(a.quad.avgMargin), stroke: COLORS.rest, 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
    if (minY < 0) svg.appendChild(S('line', { x1: L, x2: W - R, y1: Y(0), y2: Y(0), stroke: COLORS.loss, 'stroke-width': 1 }));
    var corner = { 'font-size': 12, 'font-weight': 700, fill: '#7a6446', style: 'fill:#7a6446' };
    svg.appendChild(S('text', Object.assign({ x: W - R - 4, y: T + 15, 'text-anchor': 'end' }, corner), rtl(TEXT.groups.star)));
    svg.appendChild(S('text', Object.assign({ x: L + 4, y: T + 15, 'text-anchor': 'start' }, corner), rtl(TEXT.groups.profit)));
    svg.appendChild(S('text', Object.assign({ x: W - R - 4, y: H - B - 5, 'text-anchor': 'end' }, corner), rtl(TEXT.groups.volume)));
    svg.appendChild(S('text', Object.assign({ x: L + 4, y: H - B - 5, 'text-anchor': 'start' }, corner), rtl(TEXT.groups.weak)));
    svg.appendChild(S('text', { x: (L + W - R) / 2, y: H - 8, 'font-size': 12.5, 'text-anchor': 'middle' }, rtl(TEXT.axisX + ' ←')));
    svg.appendChild(S('text', { x: 2, y: 14, 'font-size': 12.5, 'text-anchor': 'start' }, rtl(TEXT.axisY + ' ↑')));
    svg.appendChild(S('text', { x: L - 4, y: Y(a.quad.avgMargin) + 4, 'font-size': 11.5, 'text-anchor': 'end' }, rtl(fmtPct(a.quad.avgMargin))));
    // slight offsets so dots at the same spot do not hide each other; names only for stars and outliers
    var maxOrders = 0, maxMargin = -1e9, minMargin = 1e9, placed = [], boxes = [];
    list.forEach(function (p) { maxOrders = Math.max(maxOrders, p.orders); maxMargin = Math.max(maxMargin, p.margin); minMargin = Math.min(minMargin, p.margin); });
    var shifts = [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9], [9, 9], [-9, -9], [9, -9], [-9, 9], [18, 0], [-18, 0]];
    list.forEach(function (p) {
      var bx = X(p.orders), by = Y(p.margin), cx = bx, cy = by, k, q, hit;
      for (k = 0; k < shifts.length; k++) {
        cx = bx + shifts[k][0]; cy = by + shifts[k][1]; hit = false;
        for (q = 0; q < placed.length; q++) if (Math.abs(placed[q][0] - cx) < 10 && Math.abs(placed[q][1] - cy) < 10) { hit = true; break; }
        if (!hit) break;
      }
      placed.push([cx, cy]);
      var dot = S('circle', { cx: cx, cy: cy, r: 6.5, fill: GROUP_COLOR[p.group], stroke: '#f8ecd5', 'stroke-width': 1.5 });
      dot.appendChild(S('title', null, rtl(p.name + ' — ' + TEXT.groups[p.group] + ' — ' + toFa(p.orders) + ' ' + TEXT.thOrdersN + ' — ' + fmtPct(p.margin))));
      svg.appendChild(dot);
      var outlier = p.orders === maxOrders || p.margin === maxMargin || p.margin === minMargin || p.margin < 0;
      if (p.group !== 'star' && !outlier) return;
      var txt = wrapTrunc(p.name, 12), w = txt.length * 6.6 + 4, right = cx > W * 0.55, x0 = right ? cx - 10 - w : cx + 10, ok = true;
      boxes.forEach(function (b) { if (x0 < b[0] + b[2] && x0 + w > b[0] && Math.abs(cy - b[1]) < 13) ok = false; });
      if (!ok || x0 < L || x0 + w > W - R + 4) return;
      boxes.push([x0, cy, w]);
      svg.appendChild(S('text', { x: right ? cx - 10 : cx + 10, y: cy + 4, 'font-size': 12, 'font-weight': 700, 'text-anchor': right ? 'end' : 'start' }, rtl(txt)));
    });
  }

  // one bar cut in pieces: segs [{w, color, text}]
  function drawSegBar(host, segs, label) {
    clear(host);
    var total = sumOf(segs, 'w');
    if (!(total > 0)) return;
    var W = Math.max(host.clientWidth || 300, 280), x = W;
    var svg = svgBox(host, W, 40, label);
    segs.forEach(function (g) {
      var w = W * g.w / total;
      if (w <= 0) return;
      x -= w;
      svg.appendChild(S('rect', { x: x, y: 4, width: w, height: 32, fill: g.color, stroke: '#f8ecd5', 'stroke-width': 1 }));
      if (w > 34) svg.appendChild(S('text', { x: x + w / 2, y: 25, 'font-size': 12.5, 'font-weight': 700, 'text-anchor': 'middle', style: 'fill:#ffffff', fill: '#ffffff' }, rtl(g.text)));
    });
  }
  function sumOf(list, k) { var t = 0; list.forEach(function (x) { t += x[k]; }); return t; }

  function legendItem(legend, color, text) {
    var s = el('span'), sw = document.createElement('i');
    sw.style.background = color;
    s.appendChild(sw); s.appendChild(document.createTextNode(text));
    legend.appendChild(s);
  }

  function renderAnalysis() {
    var a = st.an, note = $('an-note'), body = $('an-body');
    if (!note || !body) return;
    clear($('an-tips'));
    if (!a) { body.hidden = true; note.textContent = TEXT.anOld; return; }
    if (!a.enough) { body.hidden = true; note.textContent = fill(TEXT.anLittle, { need: toFa(a.need), n: toFa(a.orders) }); return; }
    body.hidden = false;
    var range = st.range.from ? fill(TEXT.rangeFromTo, { a: toFa(st.range.from.replace(/-/g, '/')), b: toFa(st.range.to.replace(/-/g, '/')) }) : TEXT.rangeAll;
    var basis = fill(TEXT.anBasis, { n: toFa(a.orders), m: toFa(a.lines), range: range });
    if (a.hasPrev) basis += fill(TEXT.anBasisPrev, { k: toFa(st.prevDays), p: toFa(a.prevOrders) }); else basis += TEXT.anNoPrev;
    if (st.cut) basis += ' ' + TEXT.anCut;
    note.textContent = basis;

    // tips
    var tl = AN.tips(a, fmtOf()), ol = $('an-tips'), i;
    if (!tl.length) ol.appendChild(el('li', 'rp-tip-none', TEXT.tipsNone));
    tl.forEach(function (t, k) {
      var li = el('li', '', t.text), n = el('span', 'rp-tip-n', toFa(k + 1));
      n.setAttribute('aria-hidden', 'true');
      li.insertBefore(n, li.firstChild);
      ol.appendChild(li);
    });
    $('an-tips-hint').textContent = TEXT.tipsHint;

    // products
    var hint = [];
    if (a.quad.ok) hint.push(fill(TEXT.quadHint, { n: toFa(AN.LIMIT.productLines) }));
    else if (!st.data.profit || !st.data.profit.ready || !hasProfit()) hint.push(TEXT.quadNoRaw);
    else hint.push(fill(TEXT.quadNeed, { n: toFa(AN.LIMIT.quadProducts), l: toFa(AN.LIMIT.productLines) }));
    hint.push(fill(TEXT.scoreHint, { what: a.quad.ok ? TEXT.whatProfit : TEXT.whatSales, n: toFa(AN.LIMIT.productLines) }));
    $('an-prod-hint').textContent = hint.join(' ');
    var quad = $('an-quad'), leg = $('an-quad-legend');
    clear(quad); clear(leg);
    if (a.quad.ok) {
      drawQuad(quad, a);
      GROUP_ORDER.forEach(function (g) { legendItem(leg, GROUP_COLOR[g], TEXT.groups[g]); });
    }
    var rank = $('an-rank');
    clear(rank);
    a.ranked.slice(0, 8).forEach(function (p) {
      var li = el('li', 'rp-rank-row'), top = el('div', 'rp-rank-top'), nm = productLink(p.name, PV ? PV.keyOf({ i: p.id, n: p.name }) : ''), sub;
      top.appendChild(nm);
      if (p.group) { var chip = el('span', 'rp-chip', TEXT.groups[p.group]); chip.style.background = GROUP_COLOR[p.group]; top.appendChild(chip); }
      li.appendChild(top);
      sub = el('div', 'rp-rank-sub');
      kv(sub, TEXT.scoreLabel, toFa(p.score));
      kv(sub, TEXT.shareLabel, toFa(Math.round(p.share)) + '٪');
      kv(sub, '', fmtMoney(p.toman) + ' ' + TEXT.toman);
      kv(sub, '', toFa(p.orders) + ' ' + TEXT.thOrdersN);
      if (p.margin !== null) kv(sub, TEXT.thMarginShort, fmtPct(p.margin));
      if (p.trend) kv(sub, TEXT.trendLabel, trendText(p.trend));
      li.appendChild(sub);
      rank.appendChild(li);
    });
    drawTable($('an-rank-table'), [TEXT.thProduct, TEXT.scoreLabel, TEXT.thSales, TEXT.thOrdersN, TEXT.thMargin],
      a.ranked.map(function (p) { return [p.name, toFa(p.score), groupFa(p.toman), toFa(p.orders), p.margin === null ? '—' : fmtPct(p.margin)]; }));
    var abc = a.abc;
    drawSegBar($('an-abc'), [
      { w: abc.a.share, color: COLORS.bar, text: toFa(abc.a.n) }, { w: abc.b.share, color: '#a8700f', text: toFa(abc.b.n) }, { w: abc.c.share, color: COLORS.rest, text: toFa(abc.c.n) }
    ], TEXT.abcTitle);
    var abcLeg = $('an-abc-legend');
    clear(abcLeg);
    legendItem(abcLeg, COLORS.bar, TEXT.abcA + ': ' + toFa(abc.a.n) + ' (' + toFa(Math.round(abc.a.share)) + '٪)');
    legendItem(abcLeg, '#a8700f', TEXT.abcB + ': ' + toFa(abc.b.n) + ' (' + toFa(Math.round(abc.b.share)) + '٪)');
    legendItem(abcLeg, COLORS.rest, TEXT.abcC + ': ' + toFa(abc.c.n) + ' (' + toFa(Math.round(abc.c.share)) + '٪)');
    $('an-abc-hint').textContent = fill(TEXT.abcLine, { n: toFa(abc.a.n), m: toFa(abc.total), s: toFa(Math.round(abc.a.share)) }) + ' ' + TEXT.abcHint;

    // customers
    var c = a.customers, ct = $('an-cust'), ch = $('an-cust-hint');
    clear(ct);
    if (c.ok) {
      ct.appendChild(tile(TEXT.custTiles[0], fill(TEXT.custRepeat, { p: toFa(c.repeatPct), a: toFa(c.repeat), b: toFa(c.n) })));
      ct.appendChild(tile(TEXT.custTiles[1], fmtMoney(c.avgOrder) + ' ' + TEXT.toman, groupFa(c.avgOrder) + ' ' + TEXT.toman));
      ct.appendChild(tile(TEXT.custTiles[2], fmtNum(c.avgLines)));
      if (c.returning !== null) ct.appendChild(tile(TEXT.custTiles[3], toFa(c.returning) + ' ' + '/' + ' ' + toFa(c.n)));
      ch.textContent = c.noId ? fill(TEXT.custNoId, { n: toFa(c.noId) }) : '';
    } else {
      ch.textContent = fill(TEXT.custLittle, { n: toFa(AN.LIMIT.customers), k: toFa(c.n) });
      ct.appendChild(tile(TEXT.custTiles[1], fmtMoney(c.avgOrder) + ' ' + TEXT.toman, groupFa(c.avgOrder) + ' ' + TEXT.toman));
      ct.appendChild(tile(TEXT.custTiles[2], fmtNum(c.avgLines)));
    }

    ct.className = 'rp-tiles rp-tiles2' + (ct.children.length === 3 ? ' rp-t3' : (ct.children.length === 2 ? ' rp-t2' : ''));

    // together
    var pl = $('an-pairs');
    clear(pl);
    if (a.pairs.list.length) a.pairs.list.forEach(function (x) {
      var li = el('li', 'rp-rank-row');
      li.appendChild(el('b', '', quoted(x.a) + ' + ' + quoted(x.b)));
      li.appendChild(el('div', 'rp-rank-sub', fill(TEXT.pairsRow, { n: toFa(x.n) })));
      pl.appendChild(li);
    });
    $('an-pairs-hint').textContent = a.pairs.list.length ? '' : fill(TEXT.pairsNone, { n: toFa(AN.LIMIT.pairOrders), m: toFa(a.pairs.multi) });

    // when
    var wk = $('an-week'), wh = $('an-week-hint');
    clear(wk);
    if (a.weekdays.ok) {
      drawRows(wk, a.weekdays.days.map(function (d) {
        return { label: TEXT.dayNames[d.i], value: d.toman, text: fmtMoney(d.toman) + ' ' + TEXT.toman + ' · ' + toFa(d.orders) + ' ' + TEXT.thOrdersN, color: d === a.weekdays.best ? COLORS.bar : COLORS.rest };
      }), TEXT.weekdayTitle);
      wh.textContent = '';
    } else wh.textContent = TEXT.weekdayLittle;
    var mo = $('an-month'), mh = $('an-month-hint');
    clear(mo);
    if (a.months.ok) {
      drawRows(mo, a.months.list.slice(-12).map(function (m) {
        return { label: fmtOf().month(m.key), value: m.toman, text: fmtMoney(m.toman) + ' ' + TEXT.toman + ' · ' + toFa(m.orders) + ' ' + TEXT.thOrdersN, color: m === a.months.best ? COLORS.bar : COLORS.rest };
      }), TEXT.monthTitle);
      mh.textContent = TEXT.monthNote;
    } else mh.textContent = fill(TEXT.monthLittle, { n: toFa(AN.LIMIT.months) });

    // channels
    var rows = [], keys = [['site', TEXT.siteName], ['person', TEXT.personName], ['unknown', TEXT.unknownName]];
    keys.forEach(function (k) {
      var x = a.channels[k[0]];
      if (x) rows.push([k[1], toFa(x.orders), fmtMoney(x.avg), toFa(x.share) + '٪', x.margin === null ? '—' : fmtPct(x.margin)]);
    });
    var chHeads = [TEXT.thChannel, TEXT.thOrdersN, TEXT.thAvg, TEXT.thShare, TEXT.thMarginShort];
    drawTable($('an-chan-table'), chHeads, rows);
    var cards = el('div', 'rp-cards');   // phones: one small card per row instead of the table
    rows.forEach(function (r) {
      var c = el('div', 'rp-mini'), g = el('div', 'rp-mini-grid');
      c.appendChild(el('b', '', r[0]));
      r.slice(1).forEach(function (v, k) { var d = el('div'); d.appendChild(el('span', '', chHeads[k + 1])); d.appendChild(el('b', '', v)); g.appendChild(d); });
      c.appendChild(g);
      cards.appendChild(c);
    });
    $('an-chan-table').appendChild(cards);

    // never / rarely sold
    var idle = $('an-idle'), ih = $('an-idle-hint');
    clear(idle);
    if (!a.idle.ok) ih.textContent = TEXT.idleLittle;
    else if (!a.idle.none.length && !a.idle.rare.length) ih.textContent = fill(TEXT.idleNone, { k: toFa(a.idle.windowDays) });
    else {
      ih.textContent = '';
      if (a.idle.none.length) {
        var d1 = el('div', 'rp-idle'); d1.appendChild(el('b', '', fill(TEXT.idleNever, { k: toFa(a.idle.windowDays) }) + ':'));
        d1.appendChild(el('p', '', a.idle.none.map(quoted).join('، ')));
        idle.appendChild(d1);
      }
      if (a.idle.rare.length) {
        var d2 = el('div', 'rp-idle'); d2.appendChild(el('b', '', TEXT.idleRare + ':'));
        d2.appendChild(el('p', '', a.idle.rare.map(function (x) { return quoted(x.name) + ' (' + fill(TEXT.idleDays, { n: toFa(x.days) }) + ')'; }).join('، ')));
        idle.appendChild(d2);
      }
    }
  }


  // ---- «بررسی یه محصول» (numbers come from product.js; this part only draws) ----
  var PV = window.barginProduct;
  var HELP = { dayDiff: dayDiff, addDays: addDays, weekdayOf: weekdayOf, monthKey: monthKey };
  function productLink(name, key) {
    if (!key) return el('b', '', name);
    var b = el('button', 'rp-link', name);
    b.type = 'button';
    b.addEventListener('click', function () { openProduct(key); });
    return b;
  }
  // customer names come only from the admin session (getReport); an old server has none → «مشتری N»
  function custLabel(id) {
    var m = st.raw && st.raw.customerNames, nm = m && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, id) ? m[id] : '';
    return typeof nm === 'string' && nm ? '⁨' + nm + '⁩' : fill(TEXT.customerNo, { n: toFa(id) });
  }
  function setPicker() {
    var pick = $('pv-pick'), sel = $('pv-select');
    if (!pick || !sel) return;
    if (!st.raw || !PV) { pick.hidden = true; st.product = ''; return; }
    var opts = PV.options(st.raw), found = false, o;
    clear(sel);
    o = document.createElement('option'); o.value = ''; o.textContent = TEXT.pvAll; sel.appendChild(o);
    opts.forEach(function (x) {
      o = document.createElement('option'); o.value = x.key;
      o.textContent = x.name + (x.other ? ' — ' + TEXT.pvOtherTag : '');
      sel.appendChild(o);
      if (x.key === st.product) found = true;
    });
    if (st.product && !found) st.product = '';
    sel.value = st.product;
    pick.hidden = false;
  }
  function openProduct(key) {
    st.product = key;
    if ($('pv-select')) $('pv-select').value = key;
    if (st.data) refreshView();
    try { window.scrollTo(0, 0); } catch (e) { /* old browsers */ }
  }

  function renderProduct() {
    var pv = PV.analyze(st.raw, { from: st.range.from, to: st.range.to, today: todayKey(), H: HELP }, st.product);
    st.pv = pv;
    $('pv-title').textContent = pv.name + (pv.other ? ' — ' + TEXT.pvOtherTag : '');
    var main = $('pv-main'), note = $('pv-note');
    main.hidden = !pv.found;
    if (!pv.found) {
      note.textContent = TEXT.pvNone + ' ' + (pv.lastSale ? fill(TEXT.pvLast, { d: toFa(pv.lastSale.replace(/-/g, '/')) }) : TEXT.pvNoLast) + (pv.cut ? ' ' + TEXT.pvCut : '');
      return;
    }
    note.textContent = '';
    var tiles = $('pv-tiles');
    clear(tiles);
    tiles.className = 'rp-tiles rp-tiles2 rp-t3';
    tiles.appendChild(tile(TEXT.pvTiles[0], fmtMoney(pv.toman) + ' ' + TEXT.toman, groupFa(pv.toman) + ' ' + TEXT.toman));
    tiles.appendChild(tile(TEXT.pvTiles[1], fmtQty(pv.qty)));
    tiles.appendChild(tile(TEXT.pvTiles[2], toFa(pv.orders)));
    tiles.appendChild(tile(TEXT.pvTiles[3], fmtMoney(pv.avgOrder) + ' ' + TEXT.toman, groupFa(pv.avgOrder) + ' ' + TEXT.toman));
    tiles.appendChild(tile(TEXT.pvTiles[4], pv.share < 10 ? decFa(round1(pv.share)) + '٪' : toFa(Math.round(pv.share)) + '٪'));
    tiles.appendChild(tile(TEXT.pvTiles[5], pv.trend ? trendText(pv.trend) : '—'));
    var pt = $('pv-tiles-profit'), withProfit = pv.costedLines > 0;
    clear(pt);
    pt.hidden = !withProfit;
    if (withProfit) {
      pt.appendChild(tile(TEXT.profitTiles[0], fmtMoneySigned(pv.profit) + ' ' + TEXT.toman, fmtSigned(pv.profit) + ' ' + TEXT.toman, pv.profit < 0));
      pt.appendChild(tile(TEXT.profitTiles[1], fmtMoney(pv.cost) + ' ' + TEXT.toman, groupFa(pv.cost) + ' ' + TEXT.toman));
      pt.appendChild(tile(TEXT.profitTiles[2], pv.margin === null ? '—' : fmtPct(pv.margin), '', pv.profit < 0));
    }

    // time chart (shares the روزانه/هفتگی/ماهانه/سالانه and فروش/سود switches)
    var why = pv.other ? TEXT.pvOther : (st.pv.profitReady ? TEXT.pvNoRaw : TEXT.noRawTab);
    renderTimeFor({ chart: 'pv-time', hint: 'pv-time-hint', table: 'pv-time-table' }, pv.byDay, withProfit, why);

    // price of one pack
    var pr = pv.prices, ph = $('pv-price-hint'), pc = $('pv-price');
    clear(pc);
    if (!pr.n) { ph.textContent = TEXT.pvPriceNone; clear($('pv-price-table')); }
    else if (pr.n === 1) { ph.textContent = fill(TEXT.pvPriceOne, { p: groupFa(pr.last) }); drawTable($('pv-price-table'), [TEXT.thDate, TEXT.thPrice], [[toFa(pr.list[0].d.replace(/-/g, '/')), groupFa(pr.list[0].price)]]); }
    else {
      ph.textContent = fill(TEXT.pvPriceHint, { min: groupFa(pr.min), max: groupFa(pr.max), last: groupFa(pr.last) });
      drawPriceLine(pc, pr.list);
      drawTable($('pv-price-table'), [TEXT.thDate, TEXT.thPrice], pr.list.slice().reverse().map(function (x) { return [toFa(x.d.replace(/-/g, '/')), groupFa(x.price)]; }));
    }

    // customers
    var cu = pv.customers, ch = $('pv-cust-hint');
    if (!cu.top.length) { clear($('pv-cust')); clear($('pv-cust-table')); ch.textContent = TEXT.pvCustNone; }
    else {
      ch.textContent = TEXT.pvCustHint + (cu.noId ? fill(TEXT.pvCustNoId, { n: toFa(cu.noId) }) : '');
      drawRows($('pv-cust'), cu.top.map(function (c) {
        return { label: custLabel(c.id), value: c.toman, text: fmtMoney(c.toman) + ' ' + TEXT.toman + ' · ' + toFa(c.orders) + ' ' + TEXT.thOrders };
      }), TEXT.pvTiles[2]);
      drawTable($('pv-cust-table'), [TEXT.thCustomer, TEXT.thSales, TEXT.thOrders], cu.top.map(function (c) { return [custLabel(c.id), groupFa(c.toman), toFa(c.orders)]; }));
    }

    // bought with it
    var wl = $('pv-with');
    clear(wl);
    pv.withOthers.list.forEach(function (x) {
      var li = el('li', 'rp-rank-row'), top = el('div', 'rp-rank-top');
      top.appendChild(productLink(x.name, x.key));
      li.appendChild(top);
      li.appendChild(el('div', 'rp-rank-sub', fill(TEXT.pvWithRow, { n: toFa(x.n), p: toFa(pct(x.n, pv.orders)) })));
      wl.appendChild(li);
    });
    $('pv-with-hint').textContent = pv.withOthers.list.length ? '' : fill(TEXT.pvWithNone, { n: toFa(PV.LIMIT.pairOrders) });

    // best days
    var wk = $('pv-week'), wh = $('pv-week-hint');
    clear(wk);
    if (pv.weekdays.ok) {
      wh.textContent = '';
      drawRows(wk, pv.weekdays.days.map(function (d) {
        return { label: TEXT.dayNames[d.i], value: d.toman, text: fmtMoney(d.toman) + ' ' + TEXT.toman + ' · ' + toFa(d.orders) + ' ' + TEXT.thOrdersN, color: d === pv.weekdays.best ? COLORS.bar : COLORS.rest };
      }), TEXT.dayNames[pv.weekdays.best.i]);
    } else wh.textContent = fill(TEXT.pvWeekLittle, { n: toFa(PV.LIMIT.weekdayOrders) });

    drawChannel($('pv-chan'), $('pv-chan-legend'), pv.channels);

    // the basis line
    var range = st.range.from ? fill(TEXT.rangeFromTo, { a: toFa(st.range.from.replace(/-/g, '/')), b: toFa(st.range.to.replace(/-/g, '/')) }) : TEXT.rangeAll;
    var line = fill(TEXT.pvBasis, { n: toFa(pv.lines), m: toFa(pv.periodLines), range: range });
    if (pv.other) line += ' ' + TEXT.pvOther;
    else if (!pv.costedLines) line += ' ' + (pv.profitReady ? TEXT.pvNoRaw : TEXT.noRawTab);
    else if (pv.uncosted && pv.costedLines) line += ' ' + fill(TEXT.pvUncosted, { n: toFa(pv.uncosted) });
    if (pv.costedLines) line += ' ' + TEXT.rawNow;
    if (!pv.trend) line += ' ' + fill(TEXT.pvTrendNeed, { n: toFa(PV.LIMIT.trendLines) });
    if (pv.cut) line += ' ' + TEXT.pvCut;
    $('pv-used').textContent = line;
  }

  // A simple line of the pack price per day (newest on the left, like the bar charts).
  function drawPriceLine(host, list) {
    clear(host);
    var shown = list.slice().reverse(), n = shown.length;
    var left = 62, right = 14, top = 22, bottom = 40, H = 220, avail = host.clientWidth || 320;
    var W = Math.max(avail, left + right + n * 26), min = shown[0].price, max = shown[0].price;
    shown.forEach(function (x) { if (x.price < min) min = x.price; if (x.price > max) max = x.price; });
    var pad = (max - min) * 0.15 || Math.max(1, max * 0.05), lo = Math.max(0, min - pad), hi = max + pad;
    var svg = svgBox(host, W, H, TEXT.pvPriceTitle), ch = H - top - bottom, t;
    function X(i) { return n === 1 ? (left + W - right) / 2 : left + (W - left - right) * i / (n - 1); }
    function Y(v) { return top + ch * (hi - v) / (hi - lo); }
    for (t = 0; t <= 3; t++) {
      var v = lo + (hi - lo) * t / 3, y = Y(v);
      svg.appendChild(S('line', { x1: left - 4, x2: W - right, y1: y, y2: y, stroke: COLORS.grid, 'stroke-width': 1, 'stroke-dasharray': '3 4' }));
      svg.appendChild(S('text', { x: 2, y: y + 4, 'font-size': 11, 'text-anchor': 'start' }, rtl(fmtMoney(v))));
    }
    var pts = shown.map(function (x, i) { return X(i) + ',' + Y(x.price); }).join(' ');
    svg.appendChild(S('polyline', { points: pts, fill: 'none', stroke: COLORS.bar, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    var step = Math.max(1, Math.ceil(54 / ((W - left - right) / Math.max(1, n - 1))));
    shown.forEach(function (x, i) {
      var dot = S('circle', { cx: X(i), cy: Y(x.price), r: 4.5, fill: COLORS.bar, stroke: '#f8ecd5', 'stroke-width': 1.5 });
      dot.appendChild(S('title', null, rtl(toFa(x.d.replace(/-/g, '/')) + ' — ' + groupFa(x.price) + ' ' + TEXT.toman)));
      svg.appendChild(dot);
      if (i % step === 0 || i === n - 1) {
        var j = jparse(x.d);
        svg.appendChild(S('text', { x: X(i), y: top + ch + 16, 'font-size': 10.5, 'text-anchor': 'middle' }, rtl(toFa(j.d) + ' ' + ((ad.months || [])[j.m - 1] || ''))));
      }
    });
    host.scrollLeft = 0;
  }

  // ---- «همه محصولات فروخته‌شده»: one row per product sold in the period (numbers: product.js analyzeAll) ----
  var ALL_COLS = ['name', 'toman', 'qty', 'orders', 'avg', 'share', 'trend', 'profit', 'margin', 'price', 'cust', 'withp', 'day'];
  var ALL_TEXT_COLS = { name: 1, cust: 1, withp: 1, day: 1 };   // الف→ی (day: Saturday→Friday) first; the numbers biggest first
  function allValue(r, c) {
    switch (c) {
      case 'name': return r.name;
      case 'toman': return r.toman;
      case 'qty': return r.qty.pack;
      case 'orders': return r.orders;
      case 'avg': return r.avgOrder;
      case 'share': return r.share;
      case 'trend': return r.trend ? r.trend.pct : null;
      case 'profit': return r.profit;
      case 'margin': return r.margin;
      case 'price': return r.price;
      case 'cust': return r.topCust ? custLabel(r.topCust.id) : null;
      case 'withp': return r.with ? r.with.name : null;
      default: return r.bestDay;   // 'day': Saturday = 0 … Friday = 6
    }
  }
  function allText(r, c) {
    var none = '—';
    switch (c) {
      case 'name': return r.name + (r.other ? ' — ' + TEXT.pvOtherTag : '');
      case 'toman': return fmtMoney(r.toman);
      case 'qty': return fmtQty(r.qty);
      case 'orders': return toFa(r.orders);
      case 'avg': return fmtMoney(r.avgOrder);
      case 'share': return r.share < 10 ? decFa(round1(r.share)) + '٪' : toFa(Math.round(r.share)) + '٪';
      case 'trend': return r.trend ? trendText(r.trend) : none;
      case 'profit': return r.profit === null ? none : fmtMoneySigned(r.profit);
      case 'margin': return r.margin === null ? none : fmtPct(r.margin);
      case 'price': return r.price === null ? none : groupFa(r.price);
      case 'cust': return r.topCust ? custLabel(r.topCust.id) : none;
      case 'withp': return r.with ? r.with.name : none;
      default: return r.bestDay === null ? none : TEXT.dayNames[r.bestDay];
    }
  }
  function sortedAll(rows) {
    var c = st.allSort.col, dir = st.allSort.dir;
    return rows.slice().sort(function (x, y) {
      var a = allValue(x, c), b = allValue(y, c), ea = a === null || a === undefined, eb = b === null || b === undefined;
      if (ea || eb) return ea && eb ? (y.toman - x.toman) : (ea ? 1 : -1);   // empty cells always last
      var d = typeof a === 'string' ? a.replace(/[\u2066-\u2069]/g, '').localeCompare(b.replace(/[\u2066-\u2069]/g, ''), 'fa') : a - b;   // text: Persian alphabet order
      return d * dir || (y.toman - x.toman) || (x.name < y.name ? -1 : 1);
    });
  }
  function setAllSort(col, dir) {
    st.allSort = { col: col, dir: dir !== undefined ? dir : (ALL_TEXT_COLS[col] ? 1 : -1) };
    renderAllProducts();
  }
  function renderAllProducts() {
    var card = $('r-all-card');
    if (!card) return;
    if (!st.raw || !PV) { card.hidden = true; return; }
    if (!st.allRows) st.allRows = PV.analyzeAll(st.raw, { from: st.range.from, to: st.range.to, today: todayKey(), H: HELP });
    var rows = st.allRows;
    card.hidden = !rows.length;
    if (!rows.length) return;
    $('r-all-hint').textContent = fill(TEXT.allHint, { n: toFa(rows.length) });
    var list = sortedAll(rows), sort = st.allSort;

    // desktop: the table, sticky name column, sortable headers
    var tb = document.createElement('table'), thead = document.createElement('thead'), tr = document.createElement('tr'), tbody = document.createElement('tbody');
    tb.className = 'rp-table rp-alltable';
    ALL_COLS.forEach(function (c) {
      var th = document.createElement('th'), b = el('button', 'rp-th', TEXT.allCols[c] + (sort.col === c ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(sort.col === c));
      b.addEventListener('click', function () { if (st.allSort.col === c) setAllSort(c, -st.allSort.dir); else setAllSort(c); });
      th.setAttribute('aria-sort', sort.col === c ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none');
      th.appendChild(b); tr.appendChild(th);
    });
    thead.appendChild(tr); tb.appendChild(thead);
    list.forEach(function (r) {
      var row = document.createElement('tr');
      ALL_COLS.forEach(function (c) {
        var td = document.createElement('td');
        if (c === 'name') td.appendChild(productLink(allText(r, c), r.key));
        else {
          td.textContent = allText(r, c);
          if (c === 'toman') td.title = groupFa(r.toman) + ' ' + TEXT.toman;
          if ((c === 'profit' && r.profit < 0) || (c === 'margin' && r.margin < 0)) td.className = 'rp-negtxt';
        }
        row.appendChild(td);
      });
      row.addEventListener('click', function (ev) { if (ev.target.tagName !== 'BUTTON') openProduct(r.key); });
      tbody.appendChild(row);
    });
    tb.appendChild(tbody);
    clear($('r-all-table')); $('r-all-table').appendChild(tb);

    // phones: one card per product (name + sales, orders, profit, share, trend; the rest under «بیشتر»), sorted by the dropdown
    var sel = $('r-all-sort');
    clear(sel);
    ALL_COLS.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = TEXT.allCols[c]; sel.appendChild(o); });
    sel.value = sort.col;
    var dirBtn = $('r-all-dir');
    var dl = TEXT.allDir[sort.col === 'day' ? 'day' : (ALL_TEXT_COLS[sort.col] ? 'text' : 'num')], di = sort.dir < 0 ? 0 : 1;
    dirBtn.textContent = dl[di];
    dirBtn.setAttribute('aria-label', TEXT.allSort + ': ' + dl[di + 2]);
    var cards = $('r-all-cards');
    clear(cards);
    list.forEach(function (r) {
      var card2 = el('div', 'rp-acard'), open = el('button', 'rp-aopen'), top = el('div', 'rp-atop'), kvs = el('div', 'rp-akv');
      open.type = 'button';
      top.appendChild(el('b', '', allText(r, 'name')));
      top.appendChild(el('span', '', fmtMoney(r.toman) + ' ' + TEXT.toman));
      open.appendChild(top);
      ['orders', 'profit', 'share', 'trend'].forEach(function (c) { kv(kvs, TEXT.allCols[c] + ':', allText(r, c)); });
      open.appendChild(kvs);
      open.addEventListener('click', function () { openProduct(r.key); });
      card2.appendChild(open);
      var det = el('details'), more = el('div', 'rp-akv');
      det.appendChild(el('summary', '', TEXT.allMore));
      ['qty', 'avg', 'margin', 'price', 'cust', 'withp', 'day'].forEach(function (c) { kv(more, TEXT.allCols[c] + ':', allText(r, c)); });
      det.appendChild(more);
      card2.appendChild(det);
      cards.appendChild(card2);
    });
  }

  function refreshView() {
    var any = st.data.rows.used > 0, open = !!st.product && !!st.raw && !!PV;
    $('pv-body').hidden = !open;
    if (open) {
      $('r-body').hidden = true;
      $('r-note').textContent = '';
      renderProduct();
    } else {
      st.product = '';
      if ($('pv-select')) $('pv-select').value = '';
      $('r-body').hidden = !any;
      $('r-note').textContent = any ? '' : TEXT.empty;
      $('r-note').className = 'adm-status';
      if (any) renderAll(); else $('r-used').textContent = '';
    }
  }

  // The analysis of the loaded period: the previous period = the same number of days right before it.
  function runAnalysis(raw) {
    if (!raw) { st.an = null; return; }
    st.an = AN.analyze(raw, { from: st.range.from, to: st.range.to, today: todayKey(), H: { dayDiff: dayDiff, addDays: addDays, weekdayOf: weekdayOf, monthKey: monthKey } });
  }
  function prevFromFor(range) {
    if (!range.from) return '';
    var len = dayDiff(range.from, range.to) + 1;
    return addDays(range.from, -len);
  }

  function setPressed(sel, attr, val) {
    var b = document.querySelectorAll(sel), i;
    for (i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', String(b[i].getAttribute(attr) === val));
  }

  function show(summary, raw) {
    st.data = summary;
    st.raw = raw || null;
    st.allRows = null;
    st.cut = !!(raw && raw.cut);
    st.prevDays = st.range.from ? dayDiff(st.range.from, st.range.to) + 1 : 0;
    runAnalysis(raw);
    setPicker();
    refreshView();
  }

  function load(force) {
    var today = todayKey(), range = rangeFor(st.period, today), key = st.period + '|' + today;
    st.range = range;
    var mine = ++st.token;
    if (!force && st.cache[key]) { show(st.cache[key].summary, st.cache[key].analysis); return; }
    $('r-note').textContent = TEXT.loading;
    $('r-note').className = 'adm-status';
    $('r-body').hidden = true;
    if ($('pv-body')) $('pv-body').hidden = true;
    ad.api('getReport', { from: range.from, to: range.to, analysis: true, prevFrom: prevFromFor(range) }, true).then(function (r) {
      if (mine !== st.token) return;
      if (!r || !r.ok) { $('r-note').textContent = ''; ad.setStatus((r && r.message) || TEXT.loadFail, 'err'); return; }
      if (r.report !== true || !r.summary) { $('r-note').textContent = ''; ad.setStatus(TEXT.oldServer, 'err'); return; }
      st.cache[key] = { summary: r.summary, analysis: r.analysis || null };
      ad.setStatus('');
      show(r.summary, r.analysis || null);
    }, function (err) {
      if (mine !== st.token) return;
      $('r-note').textContent = '';
      if (err && err.code === 'unknown_action') { ad.setStatus(TEXT.oldServer, 'err'); return; }
      ad.onApiError(err, TEXT.loadFail);
    });
  }

  function rerenderTime() {
    if (!st.data) return;
    if (st.product && st.raw && PV) renderProduct();
    else if (st.data.rows.used) renderTime();
  }

  function wire() {
    var i, b;
    b = document.querySelectorAll('[data-period]');
    for (i = 0; i < b.length; i++) b[i].addEventListener('click', function () {
      st.period = this.getAttribute('data-period');
      setPressed('[data-period]', 'data-period', st.period);
      load(false);
    });
    b = document.querySelectorAll('[data-grain]');
    for (i = 0; i < b.length; i++) b[i].addEventListener('click', function () {
      st.grain = this.getAttribute('data-grain');
      setPressed('[data-grain]', 'data-grain', st.grain);
      rerenderTime();
    });
    b = document.querySelectorAll('[data-metric]');
    for (i = 0; i < b.length; i++) b[i].addEventListener('click', function () {
      st.metric = this.getAttribute('data-metric');
      setPressed('[data-metric]', 'data-metric', st.metric);
      rerenderTime();
    });
    b = document.querySelectorAll('[data-mode]');
    for (i = 0; i < b.length; i++) b[i].addEventListener('click', function () {
      st.mode = this.getAttribute('data-mode');
      setPressed('[data-mode]', 'data-mode', st.mode);
      if (st.data && st.data.rows.used) renderProducts();
    });
    if ($('pv-select')) $('pv-select').addEventListener('change', function () { openProduct(this.value); });
    if ($('pv-back')) $('pv-back').addEventListener('click', function () { openProduct(''); });
    if ($('r-all-sort')) {
      $('r-all-sort').addEventListener('change', function () { setAllSort(this.value); });
      $('r-all-dir').addEventListener('click', function () { setAllSort(st.allSort.col, -st.allSort.dir); });
    }
    $('r-reload').addEventListener('click', function () { load(true); });
    $('r-logout').addEventListener('click', function () { ad.logout(); });
    var lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {   // only a real width change redraws (phone address bars fire resize on scroll and would close the open «بیشتر»)
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      if (!$('v-report').hidden && st.data) refreshView();
    });
  }

  window.barginReport = {
    open: function () { load(false); },
    reset: function () {
      st.cache = {}; st.data = null; st.token += 1;
      if ($('r-body')) { $('r-body').hidden = true; clear($('r-tiles')); if ($('r-tiles-profit')) clear($('r-tiles-profit')); }   // nothing of the report stays after logout
      st.an = null; st.raw = null; st.product = ''; st.pv = null; st.allRows = null;
      if ($('r-all-card')) $('r-all-card').hidden = true;
      ['r-all-table', 'r-all-cards', 'r-all-sort'].forEach(function (id) { if ($(id)) clear($(id)); });
      if ($('pv-body')) $('pv-body').hidden = true;
      if ($('pv-pick')) $('pv-pick').hidden = true;
      if ($('pv-select')) clear($('pv-select'));
      ['pv-tiles', 'pv-tiles-profit', 'pv-time', 'pv-time-table', 'pv-price', 'pv-price-table', 'pv-cust', 'pv-cust-table', 'pv-with', 'pv-week', 'pv-chan', 'pv-chan-legend'].forEach(function (id) { if ($(id)) clear($(id)); });
      if ($('pv-title')) $('pv-title').textContent = '';
      ['pv-note', 'pv-used'].forEach(function (id) { if ($(id)) $(id).textContent = ''; });
      ['an-tips', 'an-quad', 'an-quad-legend', 'an-rank', 'an-rank-table', 'an-abc', 'an-abc-legend', 'an-cust', 'an-pairs', 'an-week', 'an-month', 'an-chan-table', 'an-idle'].forEach(function (id) { if ($(id)) clear($(id)); });
      if ($('an-note')) $('an-note').textContent = '';
      ['r-time', 'r-prod', 'r-chan', 'r-chan-legend', 'r-cust', 'r-time-table', 'r-prod-table', 'r-chan-table', 'r-cust-table'].forEach(function (id) { if ($(id)) clear($(id)); });
    },
    util: {
      fmtMoney: fmtMoney, fmtQty: fmtQty, fmtNum: fmtNum, weekStartKey: weekStartKey, monthKey: monthKey, rangeFor: rangeFor, addDays: addDays,
      dayDiff: dayDiff, weekdayOf: weekdayOf, prevFromFor: prevFromFor, buildSeries: buildSeries, margin: margin, fmtSigned: fmtSigned, productRows: productRows, rankByCount: rankByCount, todayKey: todayKey, labelOf: labelOf
    }
  };
  if ($('r-periods')) wire();
})();
