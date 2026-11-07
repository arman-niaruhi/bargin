// «تحلیل و پیشنهاد» (owner approved 2026-11-07): the numbers and the rule-based tips of the «گزارش» tab.
// PURE: no page, no network. It gets the sale lines that the read-only server action getReport sends
// (no customer names) and returns plain numbers; report.js draws them. ES2017, no libraries.
// Every tip comes from a fixed rule on those numbers, with the numbers inside the text. Nothing is guessed:
// below the thresholds in LIMIT a block stays silent and says that there is not enough data.
(function () {
  'use strict';

  var LIMIT = {
    orders: 20,        // the whole analysis needs this many sale orders in the period
    productLines: 5,   // a product needs this many sale lines to be ranked / put in a group
    profitLines: 3,    // ... and this many costed lines to have a margin
    quadProducts: 4,   // the quadrant needs this many products with a margin
    trendLines: 5,     // trend arrow: this many lines in BOTH periods
    trendMove: 15,     // % change that counts as up / down (smaller = flat)
    tipMove: 30,       // % change that makes a tip
    pairOrders: 3,     // two products bought together in at least this many orders
    weekdayDays: 28,   // weekday block: at least 4 weeks of sales
    weekdayShare: 22,  // % of sales on one weekday that makes a tip (an even week is about 14%)
    months: 3,         // month block: at least this many full months
    monthRatio: 1.3,   // best month this many times the average month makes a tip
    customers: 8,      // repeat-customer block: at least this many customers with a customer id
    idleWindow: 56,    // «never / rarely sold»: the data must reach back at least this many days
    idleDays: 28,      // ... and «rarely» = no sale for this many days
    channelOrders: 5,  // channel tip: at least this many orders in each channel
    channelGap: 25,    // % difference of the average order that makes a tip
    tips: 5            // at most this many tips
  };
  var CH = { s: 'site', p: 'person', u: 'unknown' };
  var GROUPS = { star: 'star', volume: 'volume', profit: 'profit', weak: 'weak' };

  function sum(list, f) { var t = 0; list.forEach(function (x) { t += f(x); }); return t; }
  function pctChange(now, before) { return before > 0 ? Math.round((now - before) * 100 / before) : null; }
  function median(nums) {
    var a = nums.slice().sort(function (x, y) { return x - y; }), n = a.length;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  // 1 for the best, 0 for the worst (ties keep list order); a single item is 1
  function percentiles(list, value) {
    var sorted = list.slice().sort(function (a, b) { return value(b) - value(a); }), out = [];
    sorted.forEach(function (x, r) { out.push({ x: x, p: sorted.length > 1 ? (sorted.length - 1 - r) / (sorted.length - 1) : 1 }); });
    return out;
  }

  // A = {lines, items, shop, prevFrom}; ctx = {from, to, today, H:{dayDiff, addDays, weekdayOf, monthKey}}.
  // Lines before `from` are the previous period (the same number of days), lines from `from` to `to` are the period.
  function analyze(A, ctx) {
    var H = ctx.H, from = ctx.from || '', to = ctx.to || '';
    var all = (A && A.lines) || [], items = (A && A.items) || [];
    var P = [], Q = [];
    all.forEach(function (l) {
      if (from && l[0] < from) Q.push(l);
      else if (!to || l[0] <= to) P.push(l);
    });
    var hasPrev = !!(from && A.prevFrom);
    // ---- orders (lines with the same order key are ONE order) ----
    var orders = {}, order = [];
    P.forEach(function (l) {
      var o = orders[l[1]];
      if (!o) { o = orders[l[1]] = { key: l[1], date: l[0], toman: 0, lines: 0, ch: CH[l[8]] || 'unknown', cust: l[7], items: {}, itemList: [] }; order.push(o); }
      o.toman += l[5]; o.lines += 1;
      if (!o.items[l[2]]) { o.items[l[2]] = true; o.itemList.push(l[2]); }
    });
    var prevOrders = {};
    Q.forEach(function (l) { prevOrders[l[1]] = true; });
    var a = { enough: order.length >= LIMIT.orders, orders: order.length, need: LIMIT.orders, lines: P.length, hasPrev: hasPrev, prevOrders: Object.keys(prevOrders).length };
    a.totalToman = sum(P, function (l) { return l[5]; });
    if (!a.enough) return a;

    // ---- products ----
    var prods = {};
    function prod(i) {
      return prods[i] || (prods[i] = { idx: i, id: items[i].i, name: items[i].n, toman: 0, lines: 0, orders: 0, costedLines: 0, costedToman: 0, profit: 0, prevToman: 0, prevLines: 0, margin: null, trend: null, group: '', score: null, seen: {} });
    }
    P.forEach(function (l) {
      var p = prod(l[2]);
      p.toman += l[5]; p.lines += 1;
      if (!p.seen[l[1]]) { p.seen[l[1]] = true; p.orders += 1; }
      if (l[6] !== null) { p.costedLines += 1; p.costedToman += l[5]; p.profit += l[6]; }
    });
    Q.forEach(function (l) { var p = prod(l[2]); p.prevToman += l[5]; p.prevLines += 1; });
    var plist = Object.keys(prods).map(function (k) { return prods[k]; }).filter(function (p) { return p.lines > 0; });
    plist.forEach(function (p) {
      p.share = a.totalToman > 0 ? p.toman * 100 / a.totalToman : 0;
      if (p.costedLines >= LIMIT.profitLines && p.costedToman > 0) p.margin = Math.round(p.profit * 100 / p.costedToman);
      if (hasPrev && p.lines >= LIMIT.trendLines && p.prevLines >= LIMIT.trendLines) {
        var ch = pctChange(p.toman, p.prevToman);
        if (ch !== null) p.trend = { pct: ch, dir: ch >= LIMIT.trendMove ? 'up' : (ch <= -LIMIT.trendMove ? 'down' : 'flat') };
      }
    });
    plist.sort(function (x, y) { return y.toman - x.toman || (x.name < y.name ? -1 : 1); });
    a.products = plist;
    a.profitRows = sum(P, function (l) { return l[6] !== null ? 1 : 0; });
    var eligible = plist.filter(function (p) { return p.lines >= LIMIT.productLines; });
    a.eligible = eligible.length;

    // quadrant: volume (orders containing the product) against margin; the dividing lines are the middle volume
    // (median) and the shop's overall margin of the same products
    var withMargin = eligible.filter(function (p) { return p.margin !== null; });
    a.quad = { ok: withMargin.length >= LIMIT.quadProducts, n: withMargin.length };
    if (a.quad.ok) {
      a.quad.medVolume = median(withMargin.map(function (p) { return p.orders; }));
      var ct = sum(withMargin, function (p) { return p.costedToman; });
      a.quad.avgMargin = ct > 0 ? Math.round(sum(withMargin, function (p) { return p.profit; }) * 100 / ct) : 0;
      withMargin.forEach(function (p) {
        var hv = p.orders >= a.quad.medVolume, hp = p.margin >= a.quad.avgMargin;
        p.group = hv && hp ? GROUPS.star : (hv ? GROUPS.volume : (hp ? GROUPS.profit : GROUPS.weak));
      });
    }
    // score 0-100: the average of the position by money (profit, or sales when there is no quadrant), by volume and by trend
    var scored = a.quad.ok ? withMargin : eligible;
    var money = function (p) { return a.quad.ok ? p.profit : p.toman; };
    var pm = percentiles(scored, money), pv = percentiles(scored, function (p) { return p.orders; });
    scored.forEach(function (p) {
      var parts = [], i;
      for (i = 0; i < pm.length; i++) if (pm[i].x === p) parts.push(pm[i].p);
      for (i = 0; i < pv.length; i++) if (pv[i].x === p) parts.push(pv[i].p);
      if (p.trend) parts.push(p.trend.dir === 'up' ? 1 : (p.trend.dir === 'down' ? 0 : 0.5));
      p.score = Math.round(sum(parts, function (x) { return x; }) * 100 / parts.length);
    });
    a.ranked = scored.slice().sort(function (x, y) { return y.score - x.score || y.toman - x.toman; });

    // ABC (Pareto) on sales: A = the products that make the first 80%, B up to 95%, C the rest
    var cum = 0;
    a.abc = { a: { n: 0, share: 0 }, b: { n: 0, share: 0 }, c: { n: 0, share: 0 }, total: plist.length };
    plist.forEach(function (p) {
      var cls = cum < 80 ? 'a' : (cum < 95 ? 'b' : 'c');
      a.abc[cls].n += 1; a.abc[cls].share += p.share; cum += p.share;
    });

    // ---- customers (ids only) ----
    var custs = {}, prevCusts = {}, noCust = 0;
    order.forEach(function (o) {
      if (!o.cust) { noCust += 1; return; }
      var c = custs[o.cust] || (custs[o.cust] = { orders: 0, toman: 0 });
      c.orders += 1; c.toman += o.toman;
    });
    Q.forEach(function (l) { if (l[7]) prevCusts[l[7]] = true; });
    var cids = Object.keys(custs), repeat = cids.filter(function (k) { return custs[k].orders >= 2; });
    a.customers = {
      ok: cids.length >= LIMIT.customers, n: cids.length, repeat: repeat.length, noId: noCust,
      repeatPct: cids.length ? Math.round(repeat.length * 100 / cids.length) : 0,
      returning: hasPrev ? cids.filter(function (k) { return prevCusts[k]; }).length : null,
      avgOrder: Math.round(a.totalToman / order.length), avgLines: Math.round(P.length * 10 / order.length) / 10
    };

    // ---- bought together ----
    var pairCount = {}, multi = 0;
    order.forEach(function (o) {
      var l = o.itemList.slice().sort(function (x, y) { return x - y; }), i, j;
      if (l.length > 1) multi += 1;
      for (i = 0; i < l.length; i++) for (j = i + 1; j < l.length; j++) { var k = l[i] + ',' + l[j]; pairCount[k] = (pairCount[k] || 0) + 1; }
    });
    a.pairs = {
      multi: multi,
      list: Object.keys(pairCount).map(function (k) { var s = k.split(','); return { a: items[+s[0]].n, b: items[+s[1]].n, n: pairCount[k] }; })
        .filter(function (x) { return x.n >= LIMIT.pairOrders; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 5)
    };

    // ---- weekdays (Saturday = 0) and months ----
    var first = order[0].date, last = order[0].date;
    order.forEach(function (o) { if (o.date < first) first = o.date; if (o.date > last) last = o.date; });
    var wd = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return { i: i, toman: 0, orders: 0 }; });
    order.forEach(function (o) { var w = wd[H.weekdayOf(o.date)]; w.toman += o.toman; w.orders += 1; });
    a.weekdays = { ok: H.dayDiff(first, last) + 1 >= LIMIT.weekdayDays, days: wd, best: wd.slice().sort(function (x, y) { return y.toman - x.toman; })[0] };
    a.weekdays.bestShare = a.totalToman > 0 ? Math.round(a.weekdays.best.toman * 100 / a.totalToman) : 0;
    var mm = {};
    order.forEach(function (o) { var k = H.monthKey(o.date), m = mm[k] || (mm[k] = { key: k, toman: 0, orders: 0 }); m.toman += o.toman; m.orders += 1; });
    var curMonth = H.monthKey(ctx.today || last);
    var months = Object.keys(mm).sort().map(function (k) { return mm[k]; });
    var full = months.filter(function (m) { return m.key !== curMonth; });
    a.months = { ok: full.length >= LIMIT.months, list: months, full: full };
    if (a.months.ok) {
      a.months.avg = Math.round(sum(full, function (m) { return m.toman; }) / full.length);
      a.months.best = full.slice().sort(function (x, y) { return y.toman - x.toman; })[0];
    }

    // ---- channels ----
    a.channels = { site: null, person: null, unknown: null };
    order.forEach(function (o) {
      var c = a.channels[o.ch] || (a.channels[o.ch] = { orders: 0, toman: 0, profit: 0, costedToman: 0 });
      c.orders += 1; c.toman += o.toman;
    });
    P.forEach(function (l) {
      if (l[6] === null) return;
      var c = a.channels[CH[l[8]] || 'unknown'];
      if (c) { c.profit += l[6]; c.costedToman += l[5]; }
    });
    Object.keys(a.channels).forEach(function (k) {
      var c = a.channels[k];
      if (!c) return;
      c.avg = Math.round(c.toman / c.orders);
      c.margin = c.costedToman > 0 ? Math.round(c.profit * 100 / c.costedToman) : null;
      c.share = a.totalToman > 0 ? Math.round(c.toman * 100 / a.totalToman) : 0;
    });

    // ---- products that never / rarely sell (only when the data reaches far enough back) ----
    var ref = to && ctx.today && to < ctx.today ? to : (ctx.today || last);
    var winStart = (A.prevFrom && from) ? A.prevFrom : (from || first);
    a.idle = { ok: false, none: [], rare: [] };
    if ((A.shop || []).length && H.dayDiff(winStart, ref) >= LIMIT.idleWindow) {
      a.idle.ok = true;
      var lastSale = {};
      all.forEach(function (l) { var id = items[l[2]].i; if (id && (!lastSale[id] || l[0] > lastSale[id])) lastSale[id] = l[0]; });
      A.shop.forEach(function (s) {
        if (!lastSale[s.id]) a.idle.none.push(s.name);
        else {
          var d = H.dayDiff(lastSale[s.id], ref);
          if (d >= LIMIT.idleDays) a.idle.rare.push({ name: s.name, days: d });
        }
      });
      a.idle.rare.sort(function (x, y) { return y.days - x.days; });
      a.idle.windowDays = H.dayDiff(winStart, ref) + 1;
    }
    return a;
  }

  // The tips (at most LIMIT.tips) in a fixed order of importance. F = the formatters of report.js:
  // {fa(n) Persian digits, money(n) compact signed money, pct(n) percent with a minus, q(name) quoted name, day(i) weekday name, month(key) month name}.
  function tips(a, F) {
    var out = [];
    if (!a || !a.enough) return out;
    function add(id, text) { out.push({ id: id, text: text }); }
    var prods = a.products, tm = F.toman;
    var worst = prods.filter(function (p) { return p.costedLines >= LIMIT.profitLines && p.profit < 0; }).sort(function (x, y) { return x.profit - y.profit; })[0];
    if (worst) add('loss', F.q(worst.name) + ' زیر قیمت اولیه فروش رفته: ' + F.money(-worst.profit) + ' ' + tm + ' ضرر تو ' + F.fa(worst.costedLines) + ' ردیف. قیمت فروش یا قیمت اولیه‌ش رو چک کن.');
    var stars = prods.filter(function (p) { return p.group === GROUPS.star; }).sort(function (x, y) { return y.profit - x.profit; });
    if (stars.length) add('star', F.q(stars[0].name) + ' ستاره‌ی فروشته: ' + F.fa(Math.round(stars[0].share)) + '٪ فروش و ' + F.money(stars[0].profit) + ' ' + tm + ' سود. سعی کن همیشه موجود باشه.');
    else if (!a.quad.ok && prods[0] && prods[0].share >= 20 && prods[0].lines >= LIMIT.productLines) add('top', F.q(prods[0].name) + ' ' + F.fa(Math.round(prods[0].share)) + '٪ فروشت رو می‌سازه (' + F.money(prods[0].toman) + ' ' + tm + '). سعی کن همیشه موجود باشه.');
    var lowM = prods.filter(function (p) { return p.group === GROUPS.volume; }).sort(function (x, y) { return y.orders - x.orders; })[0];
    if (lowM) add('lowmargin', F.q(lowM.name) + ' تو ' + F.fa(lowM.orders) + ' سفارش بوده ولی حاشیه‌ی سودش فقط ' + F.pct(lowM.margin) + ' هست (میانگین ' + F.pct(a.quad.avgMargin) + '). قیمت فروش یا قیمت اولیه‌ش رو یه نگاه بنداز.');
    var down = prods.filter(function (p) { return p.trend && p.trend.pct <= -LIMIT.tipMove; }).sort(function (x, y) { return x.trend.pct - y.trend.pct; })[0];
    if (down) add('falling', 'فروش ' + F.q(down.name) + ' نسبت به دوره‌ی قبل ' + F.pct(-down.trend.pct) + ' کم شده (' + F.money(down.toman) + ' در برابر ' + F.money(down.prevToman) + ' ' + tm + ').');
    if (a.idle.ok) {
      var nn = a.idle.none.length + a.idle.rare.length;
      if (nn) add('idle', F.fa(nn) + ' محصول تو ' + F.fa(LIMIT.idleDays) + ' روز اخیر فروش نرفته: ' + a.idle.none.concat(a.idle.rare.map(function (x) { return x.name; })).slice(0, 3).map(F.q).join('، ') + (nn > 3 ? ' و ' + F.fa(nn - 3) + ' تای دیگه' : '') + '.');
    }
    if (a.pairs.list.length) add('pairs', F.q(a.pairs.list[0].a) + ' و ' + F.q(a.pairs.list[0].b) + ' تو ' + F.fa(a.pairs.list[0].n) + ' سفارش با هم خریده شدن. می‌تونی موقع سفارش با هم پیشنهادشون بدی.');
    if (a.weekdays.ok && a.weekdays.bestShare >= LIMIT.weekdayShare) add('weekday', F.day(a.weekdays.best.i) + ' بهترین روز فروشته: ' + F.fa(a.weekdays.bestShare) + '٪ فروش (' + F.fa(a.weekdays.best.orders) + ' سفارش).');
    if (a.customers.ok) {
      var c = a.customers;
      if (c.repeatPct < 30) add('repeat', F.fa(c.repeatPct) + '٪ مشتری‌هات (' + F.fa(c.repeat) + ' از ' + F.fa(c.n) + ') بیشتر از یه بار خرید کردن.');
      else if (c.repeatPct >= 50) add('repeat', F.fa(c.repeatPct) + '٪ مشتری‌هات (' + F.fa(c.repeat) + ' از ' + F.fa(c.n) + ') بیشتر از یه بار خرید کردن؛ مشتری ثابت داری.');
    }
    var cs = a.channels.site, cp = a.channels.person;
    if (cs && cp && cs.orders >= LIMIT.channelOrders && cp.orders >= LIMIT.channelOrders) {
      var big = cs.avg >= cp.avg ? cs : cp, small = big === cs ? cp : cs, gap = Math.round((big.avg - small.avg) * 100 / small.avg);
      if (gap >= LIMIT.channelGap) add('channel', 'میانگین هر سفارش ' + (big === cs ? F.names.site : F.names.person) + ' (' + F.money(big.avg) + ' ' + tm + ') ' + F.fa(gap) + '٪ بیشتر از ' + (big === cs ? F.names.person : F.names.site) + ' (' + F.money(small.avg) + ' ' + tm + ') هست.');
    }
    var hp = prods.filter(function (p) { return p.group === GROUPS.profit; }).sort(function (x, y) { return y.margin - x.margin; })[0];
    if (hp) add('highprofit', F.q(hp.name) + ' حاشیه‌ی سودش ' + F.pct(hp.margin) + ' هست ولی فقط تو ' + F.fa(hp.orders) + ' سفارش بوده. می‌ارزه بیشتر معرفیش کنی.');
    if (a.abc.a.n <= 2 && a.abc.total >= 5) add('concentration', 'فقط ' + F.fa(a.abc.a.n) + ' محصول ' + F.fa(Math.round(a.abc.a.share)) + '٪ فروشت رو می‌سازن؛ سعی کن همیشه موجود باشن.');
    if (a.months.ok && a.months.best.toman >= a.months.avg * LIMIT.monthRatio) add('month', F.month(a.months.best.key) + ' بهترین ماه فروشته: ' + F.money(a.months.best.toman) + ' ' + tm + ' (میانگین ماه‌ها ' + F.money(a.months.avg) + ').');
    var up = prods.filter(function (p) { return p.trend && p.trend.pct >= LIMIT.tipMove; }).sort(function (x, y) { return y.trend.pct - x.trend.pct; })[0];
    if (up) add('rising', 'فروش ' + F.q(up.name) + ' نسبت به دوره‌ی قبل ' + F.pct(up.trend.pct) + ' بیشتر شده (' + F.money(up.toman) + ' در برابر ' + F.money(up.prevToman) + ' ' + tm + ').');
    return out.slice(0, LIMIT.tips);
  }

  window.barginAnalysis = { LIMIT: LIMIT, analyze: analyze, tips: tips };
})();
