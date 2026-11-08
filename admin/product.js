// «بررسی یه محصول» (owner approved 2026-11-08): the numbers of ONE product in the «گزارش» tab.
// PURE: no page, no network. It gets the same sale lines as analysis.js (from the read-only server action
// getReport with analysis:true; lines hold customer ids only) and returns plain numbers; report.js draws them.
// SALES only, money = the stored rowToman. ES2017, no libraries.
(function () {
  'use strict';

  var LIMIT = {
    trendLines: 5,     // trend arrow: at least this many lines of the product in BOTH periods
    trendMove: 15,     // % change that counts as up / down (smaller = flat)
    pairOrders: 3,     // "bought with it": a product must share at least this many orders with it
    weekdayDays: 28,   // weekday block: the data of the period spans at least 4 weeks ...
    weekdayOrders: 5,  // ... and the product has at least this many orders
    topCustomers: 10,
    withMax: 5,
    priceMax: 40       // most price points drawn (the newest)
  };
  var CH = { s: 'site', p: 'person', u: 'unknown' };
  var UNITS = ['pack', 'kg', 'g', 'piece'];
  var OTHER = '*سایر*';

  // The key of a ledger item: the shop id, or 'x:' + the typed name for «سایر» (and for rows without an id).
  function keyOf(item) {
    return item && item.i && item.i !== OTHER ? item.i : 'x:' + (item ? item.n : '');
  }

  // Dropdown entries: every current shop product (shop order), then the sold items that are not in the shop list
  // (typed «سایر» names, products that were removed from the shop). [{key, name, other}]
  function options(A) {
    var out = [], seen = {};
    ((A && A.shop) || []).forEach(function (s) {
      if (s && s.id && !seen[s.id]) { seen[s.id] = true; out.push({ key: s.id, name: s.name, other: false }); }
    });
    var extra = [];
    ((A && A.items) || []).forEach(function (it) {
      var k = keyOf(it);
      if (seen[k]) return;
      seen[k] = true;
      extra.push({ key: k, name: it.n, other: k.slice(0, 2) === 'x:' });
    });
    extra.sort(function (a, b) { return a.other === b.other ? 0 : (a.other ? 1 : -1); });
    return out.concat(extra);
  }

  function sum(list, f) { var t = 0; list.forEach(function (x) { t += f(x); }); return t; }
  function round2(x) { return Math.round(x * 100) / 100; }

  // The work that is the same for every product: the period split, lines grouped by product key and by order,
  // the totals. analyzeAll() does it once; analyze() does it itself when it gets no `pre`.
  function prepare(A, ctx) {
    var from = ctx.from || '', to = ctx.to || '';
    var all = (A && A.lines) || [], items = (A && A.items) || [];
    var pre = { all: all, items: items, P: [], byP: {}, byQ: {}, byOrder: {}, totalToman: 0, totalOrders: 0, first: '', last: '', keys: [] };
    all.forEach(function (l) {
      var k = keyOf(items[l[2]]);
      if (from && l[0] < from) { (pre.byQ[k] || (pre.byQ[k] = [])).push(l); return; }
      if (to && l[0] > to) return;
      pre.P.push(l);
      if (!pre.byP[k]) { pre.byP[k] = []; pre.keys.push(k); }
      pre.byP[k].push(l);
      var o = pre.byOrder[l[1]];
      if (!o) { o = pre.byOrder[l[1]] = []; pre.totalOrders += 1; }
      o.push(l);
      pre.totalToman += l[5];
      if (!pre.first || l[0] < pre.first) pre.first = l[0];
      if (l[0] > pre.last) pre.last = l[0];
    });
    return pre;
  }

  // ctx = {from, to, today, H:{dayDiff, weekdayOf}}, key = a key from options(), pre = prepare() result (optional).
  function analyze(A, ctx, key, pre) {
    var H = ctx.H, from = ctx.from || '';
    pre = pre || prepare(A, ctx);
    var all = pre.all, items = pre.items, P = pre.P;
    var PL = pre.byP[key] || [], QL = pre.byQ[key] || [];
    var isMine = function (l) { return keyOf(items[l[2]]) === key; };
    var name = '', other = key.slice(0, 2) === 'x:';
    items.forEach(function (it) { if (!name && keyOf(it) === key) name = it.n; });
    if (!name) ((A && A.shop) || []).forEach(function (s) { if (!name && s.id === key) name = s.name; });
    var out = { key: key, name: name, other: other, found: PL.length > 0, lines: PL.length, hasPrev: !!(from && A && A.prevFrom), cut: !!(A && A.cut), periodLines: P.length };
    if (!PL.length) { var ls = ''; all.forEach(function (l) { if (isMine(l) && l[0] > ls) ls = l[0]; }); out.lastSale = ls; }   // the last sale in all the data (also before the period)

    // period totals (all products) for the share
    out.totalToman = pre.totalToman;
    out.totalOrders = pre.totalOrders;
    if (!PL.length) return out;

    // ---- orders of this product (lines with one order key are ONE order) ----
    var orders = {}, order = [];
    PL.forEach(function (l) {
      var o = orders[l[1]];
      if (!o) { o = orders[l[1]] = { key: l[1], date: l[0], toman: 0, ch: CH[l[8]] || 'unknown', cust: l[7] }; order.push(o); }
      o.toman += l[5];
    });
    out.orders = order.length;
    out.toman = sum(PL, function (l) { return l[5]; });
    out.avgOrder = Math.round(out.toman / order.length);
    out.share = out.totalToman > 0 ? out.toman * 100 / out.totalToman : 0;
    out.qty = { pack: 0, kg: 0, g: 0, piece: 0 };
    PL.forEach(function (l) { if (UNITS.indexOf(l[3]) >= 0 && l[4] > 0) out.qty[l[3]] += l[4]; });
    UNITS.forEach(function (u) { out.qty[u] = round2(out.qty[u]); });

    // ---- profit (the server's costing rule: pack sales of shop products with a raw price) ----
    var costed = PL.filter(function (l) { return l[6] !== null; });
    out.costedLines = costed.length;
    out.uncosted = PL.length - costed.length;
    out.costedToman = sum(costed, function (l) { return l[5]; });
    out.profit = sum(costed, function (l) { return l[6]; });
    out.cost = out.costedToman - out.profit;
    out.margin = out.costedToman > 0 ? Math.round(out.profit * 100 / out.costedToman) : null;
    out.profitReady = !!(A && A.profitReady);

    // ---- trend against the period before (sales of this product) ----
    var prevToman = sum(QL, function (l) { return l[5]; });
    out.prevToman = prevToman; out.prevLines = QL.length; out.trend = null;
    if (out.hasPrev && PL.length >= LIMIT.trendLines && QL.length >= LIMIT.trendLines && prevToman > 0) {
      var ch = Math.round((out.toman - prevToman) * 100 / prevToman);
      out.trend = { pct: ch, dir: ch >= LIMIT.trendMove ? 'up' : (ch <= -LIMIT.trendMove ? 'down' : 'flat') };
    }

    // ---- by day (for the time chart: same shape as the report's byDay) ----
    var days = {};
    PL.forEach(function (l) {
      var d = days[l[0]] || (days[l[0]] = { d: l[0], toman: 0, orders: 0, cost: 0, profit: 0, seen: {} });
      d.toman += l[5];
      if (!d.seen[l[1]]) { d.seen[l[1]] = true; d.orders += 1; }
      if (l[6] !== null) { d.profit += l[6]; d.cost += l[5] - l[6]; }
    });
    out.byDay = Object.keys(days).sort().map(function (k) { var d = days[k]; return { d: d.d, toman: d.toman, orders: d.orders, cost: d.cost, profit: d.profit }; });

    // ---- price of one pack over time (pack lines: rowToman ÷ qty, per day) ----
    var pr = {};
    PL.forEach(function (l) {
      if (l[3] !== 'pack' || !(l[4] > 0)) return;
      var x = pr[l[0]] || (pr[l[0]] = { d: l[0], toman: 0, qty: 0 });
      x.toman += l[5]; x.qty += l[4];
    });
    var pts = Object.keys(pr).sort().map(function (k) { return { d: k, price: Math.round(pr[k].toman / pr[k].qty) }; });
    out.prices = { list: pts.slice(-LIMIT.priceMax), n: pts.length };
    if (pts.length) {
      out.prices.min = Math.min.apply(null, pts.map(function (p) { return p.price; }));
      out.prices.max = Math.max.apply(null, pts.map(function (p) { return p.price; }));
      out.prices.last = pts[pts.length - 1].price;
    }

    // ---- customers (ids; report.js adds the names) ----
    var custs = {}, noCust = 0;
    order.forEach(function (o) {
      if (!o.cust) { noCust += 1; return; }
      var c = custs[o.cust] || (custs[o.cust] = { id: o.cust, toman: 0, orders: 0 });
      c.toman += o.toman; c.orders += 1;
    });
    var cl = Object.keys(custs).map(function (k) { return custs[k]; });
    cl.sort(function (a, b) { return b.toman - a.toman || b.orders - a.orders || (+a.id - +b.id); });
    out.customers = { n: cl.length, top: cl.slice(0, LIMIT.topCustomers), noId: noCust };

    // ---- bought with it: the other products in the same orders ----
    var seenWith = {}, withCount = {};
    order.forEach(function (o) {
      pre.byOrder[o.key].forEach(function (l) {
        if (isMine(l)) return;
        var k = keyOf(items[l[2]]), s = k + '|' + l[1];
        if (seenWith[s]) return;
        seenWith[s] = true;
        var w = withCount[k] || (withCount[k] = { key: k, name: items[l[2]].n, n: 0 });
        w.n += 1;
      });
    });
    var wl = Object.keys(withCount).map(function (k) { return withCount[k]; });
    wl.sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); });
    out.withOthers = { all: wl.length, list: wl.filter(function (x) { return x.n >= LIMIT.pairOrders; }).slice(0, LIMIT.withMax) };

    // ---- weekdays (Saturday = 0 … Friday = 6) ----
    var first = pre.first, last = pre.last;
    var wd = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return { i: i, toman: 0, orders: 0 }; });
    order.forEach(function (o) { var w = wd[H.weekdayOf(o.date)]; w.toman += o.toman; w.orders += 1; });
    out.weekdays = { ok: H.dayDiff(first, last) + 1 >= LIMIT.weekdayDays && order.length >= LIMIT.weekdayOrders, days: wd, best: wd.slice().sort(function (x, y) { return y.toman - x.toman; })[0] };

    // ---- channels ----
    out.channels = { site: { toman: 0, orders: 0 }, person: { toman: 0, orders: 0 }, unknown: { toman: 0, orders: 0 } };
    order.forEach(function (o) { var c = out.channels[o.ch]; c.toman += o.toman; c.orders += 1; });
    return out;
  }

    // One row per product SOLD in the period (shop products and each «سایر» name): the same numbers as analyze(),
  // reduced to what the comparison table shows. Unsold shop products are not listed.
  // Row: {key, name, other, toman, orders, qty, avgOrder, share, trend, profit|null, margin|null, price|null (latest pack price),
  //       topCust: {id, toman, orders}|null, with: {key, name, n}|null, bestDay: weekday index|null}
  function analyzeAll(A, ctx) {
    var pre = prepare(A, ctx), nameOf = {};
    pre.items.forEach(function (it) { var k = keyOf(it); if (!nameOf[k]) nameOf[k] = it.n; });
    return pre.keys.map(function (k) {
      var a = analyze(A, ctx, k, pre);
      return {
        key: k, name: a.name, other: a.other, lines: a.lines, toman: a.toman, orders: a.orders, qty: a.qty, avgOrder: a.avgOrder, share: a.share, trend: a.trend,
        profit: a.costedLines > 0 ? a.profit : null, margin: a.costedLines > 0 ? a.margin : null,
        price: a.prices.n ? a.prices.last : null,
        topCust: a.customers.top.length ? a.customers.top[0] : null,
        with: a.withOthers.list.length ? a.withOthers.list[0] : null,
        bestDay: a.weekdays.ok ? a.weekdays.best.i : null
      };
    });
  }

  window.barginProduct = { LIMIT: LIMIT, keyOf: keyOf, options: options, analyze: analyze, analyzeAll: analyzeAll };
})();
