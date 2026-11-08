// «نمای کلی» of the «گزارش» tab (owner approved 2026-11-08, phase 1 of the data-analysis framework).
// PURE: no page, no network. It works on what getReport already sends (the summary and the sale lines) and returns
// plain numbers and sentences; report.js draws them. SALES only, money = the stored rowToman. ES2017, no libraries.
// Every sentence comes from a fixed rule on the numbers and carries them; below a data limit a sentence is left out.
(function () {
  'use strict';

  var LIMIT = {
    cmpLines: 5,        // «compared with the period before»: at least this many sale lines in BOTH periods
    cmpMove: 15,        // % change smaller than this reads «about the same»
    profitLines: 3,     // profit sentence: at least this many costed lines
    productLines: 5,    // best-product sentence: the product has at least this many sale lines
    channelOrders: 5,   // channel sentence: at least this many orders in each of سایت and حضوری
    maxOther: 8,        // «سایر» names listed in the data card
    maWindow: 7,        // moving average over this many days
    weeklyOver: 120     // more days than this: the running-total chart draws one point per week
  };
  var UNITS = ['pack', 'kg', 'g', 'piece'];

  function sum(list, f) { var t = 0; list.forEach(function (x) { t += f(x); }); return t; }
  function keyOf(item) { var P = window.barginProduct; return P ? P.keyOf(item) : (item && item.i ? item.i : 'x:' + (item ? item.n : '')); }

  // The sentences of «خلاصه». S = getReport summary, A = the analysis part (lines…), ctx = {from, to}, a = AN.analyze result (or null),
  // F = formatters {fa, money (signed, compact), pct, q, toman, day, names}.
  function sentences(S, A, ctx, a, F) {
    var out = [];
    if (!S || !S.rows || !S.rows.used) return out;
    var t = S.totals, tm = F.toman;
    function add(id, text, product) { var x = { id: id, text: text }; if (product) x.product = product; out.push(x); }
    add('sales', 'تو این بازه ' + F.money(t.toman) + ' ' + tm + ' فروختی؛ ' + F.fa(t.orders) + ' سفارش.');

    var from = ctx.from || '', to = ctx.to || '', now = 0, nowN = 0, before = 0, beforeN = 0;
    if (from && A && A.prevFrom) {
      ((A && A.lines) || []).forEach(function (l) {
        if (l[0] < from) { before += l[5]; beforeN += 1; } else if (!to || l[0] <= to) { now += l[5]; nowN += 1; }
      });
      if (nowN >= LIMIT.cmpLines && beforeN >= LIMIT.cmpLines && before > 0) {
        var ch = Math.round((now - before) * 100 / before);
        if (Math.abs(ch) < LIMIT.cmpMove) add('compare', 'فروشت تقریباً مثل بازه‌ی قبلی بوده (' + F.money(before) + ' ' + tm + ').');
        else add('compare', 'فروشت ' + F.pct(Math.abs(ch)) + (ch > 0 ? ' بیشتر' : ' کمتر') + ' از بازه‌ی قبلی بوده (' + F.money(before) + ' ' + tm + ').');
      }
    }

    var pf = S.profit;
    if (pf && pf.ready && pf.rows >= LIMIT.profitLines && pf.sales > 0) {
      var mg = Math.round(pf.profit * 100 / pf.sales);
      if (pf.profit >= 0) add('profit', 'سود فروش‌هایی که قیمت اولیه داشتن: ' + F.money(pf.profit) + ' ' + tm + ' (حاشیه‌ی ' + F.pct(mg) + ').');
      else add('profit', 'رو فروش‌هایی که قیمت اولیه داشتن، ' + F.money(-pf.profit) + ' ' + tm + ' ضرر کردی (حاشیه‌ی ' + F.pct(mg) + ').');
    }

    var best = null;
    (S.byProduct || []).forEach(function (p) { if (!best && p.id && p.id !== '*سایر*') best = p; });
    if (best && best.lines >= LIMIT.productLines && t.toman > 0) add('product', 'پرفروش‌ترین محصولت: ' + F.q(best.name) + '؛ ' + F.fa(Math.round(best.toman * 100 / t.toman)) + '٪ فروش (' + F.money(best.toman) + ' ' + tm + ').', best.name);

    if (a && a.enough) {
      if (a.weekdays.ok && a.weekdays.best && a.weekdays.best.toman > 0) add('weekday', 'بهترین روز هفته برای فروش: ' + F.day(a.weekdays.best.i) + '؛ ' + F.fa(a.weekdays.bestShare) + '٪ فروش (' + F.fa(a.weekdays.best.orders) + ' سفارش).');
      var cs = a.channels.site, cp = a.channels.person;
      if (cs && cp && cs.orders >= LIMIT.channelOrders && cp.orders >= LIMIT.channelOrders) add('channel', 'میانگین هر سفارش ' + F.names.site + ' ' + F.money(cs.avg) + ' ' + tm + 'ه و ' + F.names.person + ' ' + F.money(cp.avg) + ' ' + tm + '.');
      if (a.customers.ok) add('customers', F.fa(a.customers.repeatPct) + '٪ مشتری‌هات (' + F.fa(a.customers.repeat) + ' از ' + F.fa(a.customers.n) + ') بیشتر از یه بار خرید کردن.');
    }
    if (pf && pf.ready && pf.rows > 0 && pf.noCost.rows > 0) add('note', F.fa(pf.noCost.rows) + ' ردیف فروش قیمت اولیه نداشتن و تو سود حساب نشدن.');
    return out.slice(0, 8);
  }

  // The counts of «داده‌هامون» (of the chosen period): from the summary and the sale lines.
  function counts(S, A) {
    var c = { rows: S.rows.used, skipped: S.rows.skipped.noDate + S.rows.skipped.noTotal, buys: S.rows.buysIgnored, orders: S.totals.orders, customers: S.totals.customers };
    c.qty = { pack: 0, kg: 0, g: 0, piece: 0 };
    (S.byProduct || []).forEach(function (p) { UNITS.forEach(function (u) { c.qty[u] += p.qty[u]; }); });
    UNITS.forEach(function (u) { c.qty[u] = Math.round(c.qty[u] * 100) / 100; });
    c.channels = { site: S.byChannel.site.orders, person: S.byChannel.person.orders, unknown: S.byChannel.unknown.orders };
    c.costed = S.profit && S.profit.ready ? S.profit.rows : null;
    c.uncosted = S.profit && S.profit.ready ? S.profit.noCost.rows : null;
    c.lines = !!(A && A.lines);
    c.cut = !!(A && A.cut);
    if (A && A.lines) {
      var from = (S.from || ''), to = (S.to || ''), items = A.items || [], shopIds = {}, seen = {}, soldShop = 0, other = {}, noCust = 0, n = 0;
      (A.shop || []).forEach(function (s) { shopIds[s.id] = true; });
      A.lines.forEach(function (l) {
        if (from && l[0] < from) return;
        if (to && l[0] > to) return;
        n += 1;
        if (!l[7]) noCust += 1;
        var k = keyOf(items[l[2]]);
        if (seen[k]) return;
        seen[k] = true;
        if (shopIds[k]) soldShop += 1;
        else if (k.slice(0, 2) === 'x:') other[k.slice(2)] = true;
      });
      var names = Object.keys(other).sort();
      c.noCustomer = noCust;
      c.products = { soldShop: soldShop, shop: (A.shop || []).length, other: names.slice(0, LIMIT.maxOther), otherMore: Math.max(0, names.length - LIMIT.maxOther), otherN: names.length };
    }
    return c;
  }

  // Date exploration of the sales in the chosen period. H = {dayDiff, addDays}. null when there is no sale.
  function dates(S, H) {
    var days = (S && S.byDay) || [];
    if (!days.length) return null;
    var first = days[0].d, last = days[days.length - 1].d, gap = 0, gapFrom = '', gapTo = '', best = days[0], i;
    for (i = 1; i < days.length; i++) {
      var g = H.dayDiff(days[i - 1].d, days[i].d) - 1;
      if (g > gap) { gap = g; gapFrom = H.addDays(days[i - 1].d, 1); gapTo = H.addDays(days[i].d, -1); }
    }
    days.forEach(function (x) { if (x.toman > best.toman) best = x; });
    var span = H.dayDiff(first, last) + 1;
    return { first: first, last: last, span: span, days: days.length, share: Math.round(days.length * 100 / span), gap: gap, gapFrom: gapFrom, gapTo: gapTo, best: { d: best.d, toman: best.toman } };
  }

  // Running total (and 7-day moving average of the daily value). series = oldest-first DAILY buckets
  // [{key, toman, profit}] without holes (report.js buildSeries(…, 'day')); metric 'toman' or 'profit'.
  // More than 120 days: only every 7th day (and the last one) is returned, so the chart stays readable.
  function cumulative(series, metric) {
    metric = metric === 'profit' ? 'profit' : 'toman';
    var run = 0, all = series.map(function (x, i) {
      run += x[metric];
      var ma = null;
      if (i >= LIMIT.maWindow - 1) { var s = 0, k; for (k = i - LIMIT.maWindow + 1; k <= i; k++) s += series[k][metric]; ma = s / LIMIT.maWindow; }
      return { key: x.key, v: x[metric], run: run, ma: ma };
    });
    var weekly = all.length > LIMIT.weeklyOver, pts = all;
    if (weekly) pts = all.filter(function (p, i) { return i % 7 === 6 || i === all.length - 1; });
    return { pts: pts, all: all, weekly: weekly, total: run, hasMa: all.length >= LIMIT.maWindow, last7: all.length >= LIMIT.maWindow ? all[all.length - 1].ma : null };
  }

  window.barginOverview = { LIMIT: LIMIT, sentences: sentences, counts: counts, dates: dates, cumulative: cumulative };
})();
