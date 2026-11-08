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

  // ctx = {from, to, today, H:{dayDiff, weekdayOf}}, key = a key from options().
  function analyze(A, ctx, key) {
    var H = ctx.H, from = ctx.from || '', to = ctx.to || '';
    var all = (A && A.lines) || [], items = (A && A.items) || [];
    var P = [], Q = [];
    all.forEach(function (l) {
      if (from && l[0] < from) Q.push(l);
      else if (!to || l[0] <= to) P.push(l);
    });
    var isMine = function (l) { return keyOf(items[l[2]]) === key; };
    var PL = P.filter(isMine), QL = Q.filter(isMine);
    var name = '', other = key.slice(0, 2) === 'x:';
    items.forEach(function (it) { if (!name && keyOf(it) === key) name = it.n; });
    if (!name) ((A && A.shop) || []).forEach(function (s) { if (!name && s.id === key) name = s.name; });
    var out = { key: key, name: name, other: other, found: PL.length > 0, lines: PL.length, hasPrev: !!(from && A && A.prevFrom), cut: !!(A && A.cut), periodLines: P.length };

    // the last sale in all the data we have (also before the period)
    var lastSale = '';
    all.forEach(function (l) { if (isMine(l) && l[0] > lastSale) lastSale = l[0]; });
    out.lastSale = lastSale;

    // period totals (all products) for the share
    var orderAll = {};
    P.forEach(function (l) { orderAll[l[1]] = true; });
    out.totalToman = sum(P, function (l) { return l[5]; });
    out.totalOrders = Object.keys(orderAll).length;
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
    var mine = {};
    order.forEach(function (o) { mine[o.key] = true; });
    var seenWith = {}, withCount = {};
    P.forEach(function (l) {
      if (!mine[l[1]] || isMine(l)) return;
      var k = keyOf(items[l[2]]), s = k + '|' + l[1];
      if (seenWith[s]) return;
      seenWith[s] = true;
      var w = withCount[k] || (withCount[k] = { key: k, name: items[l[2]].n, n: 0 });
      w.n += 1;
    });
    var wl = Object.keys(withCount).map(function (k) { return withCount[k]; });
    wl.sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); });
    out.withOthers = { all: wl.length, list: wl.filter(function (x) { return x.n >= LIMIT.pairOrders; }).slice(0, LIMIT.withMax) };

    // ---- weekdays (Saturday = 0 … Friday = 6) ----
    var first = P[0][0], last = P[0][0];
    P.forEach(function (l) { if (l[0] < first) first = l[0]; if (l[0] > last) last = l[0]; });
    var wd = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return { i: i, toman: 0, orders: 0 }; });
    order.forEach(function (o) { var w = wd[H.weekdayOf(o.date)]; w.toman += o.toman; w.orders += 1; });
    out.weekdays = { ok: H.dayDiff(first, last) + 1 >= LIMIT.weekdayDays && order.length >= LIMIT.weekdayOrders, days: wd, best: wd.slice().sort(function (x, y) { return y.toman - x.toman; })[0] };

    // ---- channels ----
    out.channels = { site: { toman: 0, orders: 0 }, person: { toman: 0, orders: 0 }, unknown: { toman: 0, orders: 0 } };
    order.forEach(function (o) { var c = out.channels[o.ch]; c.toman += o.toman; c.orders += 1; });
    return out;
  }

  window.barginProduct = { LIMIT: LIMIT, keyOf: keyOf, options: options, analyze: analyze };
})();
