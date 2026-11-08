// «بخش‌بندی» of the «گزارش» tab (owner approved 2026-11-08, phase 2): weakest products, quantity share per unit and
// products grouped by pack price. PURE: no page, no network. It works on what getReport already sends (the summary
// and the sale lines) and returns plain numbers; report.js draws them. SALES only, money = rowToman. ES2017.
(function () {
  'use strict';

  var LIMIT = {
    unitLines: 3,      // a unit gets its pill (and its quantity chart) from this many sale lines
    weakLines: 5,      // a product with fewer sale lines gets the «کم‌داده» tag in the weakest list
    bandProducts: 6,   // price bands need at least this many products with a pack price
    bands: 3,          // thirds
    top: 8,            // products drawn (the rest of the best list is summed in «بقیه»)
    customers: 8,      // customer bands: at least this many customers with a customer id
    topShare: 0.2,     // «۲۰٪ اول از نظر خرج»
    orders: 15,        // order-size bands: at least this many sale orders (5 per band)
    months: 6,         // months shown in «عملکرد ماه‌ها»
    avgMonths: 3,      // the average of full months needs at least this many full months
    monthFlat: 5       // a month-to-month change smaller than this % reads «ثابت»
  };
  var CH = { s: 'site', p: 'person', u: 'unknown' };
  var UNITS = ['pack', 'kg', 'g', 'piece'];

  // Sale lines per unit in the period: {pack: {lines, qty}, kg: …}. raw = the analysis part of getReport (may be null:
  // an old server); then the lines are unknown (null) and the unit counts when any product sold it.
  function unitStats(raw, from, to, byProduct) {
    var s = {};
    UNITS.forEach(function (u) { s[u] = { lines: raw && raw.lines ? 0 : null, qty: 0 }; });
    (byProduct || []).forEach(function (p) { UNITS.forEach(function (u) { s[u].qty += p.qty[u] || 0; }); });
    if (raw && raw.lines) raw.lines.forEach(function (l) {
      if ((from && l[0] < from) || (to && l[0] > to)) return;
      if (s[l[3]] && l[4] > 0) s[l[3]].lines += 1;
    });
    UNITS.forEach(function (u) {
      s[u].qty = Math.round(s[u].qty * 100) / 100;
      s[u].ok = s[u].lines === null ? s[u].qty > 0 : s[u].lines >= LIMIT.unitLines;
    });
    return s;
  }
  function defaultUnit(stats, wanted) {
    if (wanted && stats[wanted] && stats[wanted].ok) return wanted;
    var i;
    for (i = 0; i < UNITS.length; i++) if (stats[UNITS[i]].ok) return UNITS[i];
    return '';
  }

  // All products in the order of the chosen measure, BEST first (end 'top') or WEAKEST first (end 'bottom').
  // mode 'toman' (sales), 'count' (quantity in `unit`; only products that sold that unit), 'profit' (only costed products).
  function rankProducts(byProduct, mode, end, unit) {
    var list;
    if (mode === 'count') {
      unit = unit || 'pack';
      list = byProduct.filter(function (p) { return p.qty[unit] > 0; }).sort(function (a, b) { return b.qty[unit] - a.qty[unit] || b.lines - a.lines || b.toman - a.toman; });
    } else if (mode === 'profit') {
      list = byProduct.filter(function (p) { return p.costedLines > 0; }).sort(function (a, b) { return b.profit - a.profit || (a.name < b.name ? -1 : 1); });
    } else {
      list = byProduct.slice().sort(function (a, b) { return b.toman - a.toman || (a.name < b.name ? -1 : 1); });
    }
    return end === 'bottom' ? list.reverse() : list;
  }

  // Share of each product in the TOTAL of one unit (units are never added together): [{p, qty, share}] best first.
  function unitShares(list, unit) {
    var total = 0;
    list.forEach(function (p) { total += p.qty[unit] || 0; });
    return { total: Math.round(total * 100) / 100, rows: list.map(function (p) { return { p: p, qty: p.qty[unit], share: total > 0 ? p.qty[unit] * 100 / total : 0 }; }) };
  }

  // Products grouped in thirds by the latest pack price. rows = analyzeAll rows (price = latest pack price or null,
  // other = a typed «سایر» item). Returns {ok, n, noPrice (shop products without a pack price), bands:[{i, from, to, n, toman, share,
  // margin|null, names}] cheap first, total}. Under 6 priced products: ok false.
  function priceBands(rows) {
    var shop = rows.filter(function (r) { return !r.other; });
    var priced = shop.filter(function (r) { return r.price !== null && r.price > 0; });
    var out = { ok: priced.length >= LIMIT.bandProducts, n: priced.length, noPrice: shop.length - priced.length, bands: [], total: 0 };
    if (!out.ok) return out;
    priced.sort(function (a, b) { return a.price - b.price || (a.name < b.name ? -1 : 1); });
    var n = priced.length, k;
    for (k = 0; k < LIMIT.bands; k++) out.bands.push({ i: k, from: 0, to: 0, n: 0, toman: 0, share: 0, margin: null, names: [], profit: 0, costed: 0 });
    priced.forEach(function (r, idx) {
      var b = out.bands[Math.floor(idx * LIMIT.bands / n)];
      if (!b.n) b.from = r.price;
      b.to = r.price; b.n += 1; b.toman += r.toman; b.names.push(r);
      if (r.profit !== null) { b.profit += r.profit; b.costed += r.costedToman || 0; }
      out.total += r.toman;
    });
    out.bands.forEach(function (b) {
      b.share = out.total > 0 ? b.toman * 100 / out.total : 0;
      b.margin = b.costed > 0 ? Math.round(b.profit * 100 / b.costed) : null;
      b.names.sort(function (x, y) { return y.toman - x.toman; });
      b.names = b.names.map(function (r) { return { key: r.key, name: r.name, toman: r.toman, price: r.price }; });
    });
    return out;
  }

  // The sale orders of the period from the sale lines (lines with one order key are ONE order): [{key, date, toman, lines, cust, ch}].
  function ordersOf(raw, from, to) {
    var map = {}, list = [];
    ((raw && raw.lines) || []).forEach(function (l) {
      if ((from && l[0] < from) || (to && l[0] > to)) return;
      var o = map[l[1]];
      if (!o) { o = map[l[1]] = { key: l[1], date: l[0], toman: 0, lines: 0, cust: l[7] || '', ch: CH[l[8]] || 'unknown' }; list.push(o); }
      o.toman += l[5]; o.lines += 1;
    });
    return list;
  }

  // Customers in bands (customer ids only; names are added by report.js). By number of orders: 1 / 2–3 / 4+; by spend: the first 20% of
  // buyers (by money, at least one) against the rest. Orders without a customer id are left out and counted (noId).
  function customerBands(raw, from, to) {
    var orders = ordersOf(raw, from, to), custs = {}, noId = 0;
    orders.forEach(function (o) {
      if (!o.cust) { noId += 1; return; }
      var c = custs[o.cust] || (custs[o.cust] = { id: o.cust, orders: 0, toman: 0 });
      c.orders += 1; c.toman += o.toman;
    });
    var list = Object.keys(custs).map(function (k) { return custs[k]; });
    var out = { ok: list.length >= LIMIT.customers, n: list.length, noId: noId, orders: 0, toman: 0, byOrders: [], spend: null };
    if (!out.ok) return out;
    list.forEach(function (c) { out.orders += c.orders; out.toman += c.toman; });
    var defs = [[1, 1], [2, 3], [4, 1e9]];
    out.byOrders = defs.map(function (d, i) { return { i: i, min: d[0], max: d[1], n: 0, orders: 0, toman: 0, shareCust: 0, shareSales: 0, avg: 0 }; });
    list.forEach(function (c) {
      var b = out.byOrders[c.orders >= 4 ? 2 : (c.orders >= 2 ? 1 : 0)];
      b.n += 1; b.orders += c.orders; b.toman += c.toman;
    });
    out.byOrders.forEach(function (b) {
      b.shareCust = b.n * 100 / out.n; b.shareSales = out.toman > 0 ? b.toman * 100 / out.toman : 0; b.avg = b.orders ? Math.round(b.toman / b.orders) : 0;
    });
    list.sort(function (a, b) { return b.toman - a.toman || b.orders - a.orders || (+a.id - +b.id); });
    var k = Math.max(1, Math.ceil(list.length * LIMIT.topShare)), top = list.slice(0, k), rest = list.slice(k);
    function grp(g) {
      var t = 0, o = 0;
      g.forEach(function (c) { t += c.toman; o += c.orders; });
      return { n: g.length, toman: t, orders: o, share: out.toman > 0 ? t * 100 / out.toman : 0, avgCust: g.length ? Math.round(t / g.length) : 0 };
    }
    out.spend = { top: grp(top), rest: grp(rest), names: top.map(function (c) { return { id: c.id, toman: c.toman, orders: c.orders }; }) };
    return out;
  }

  // Order size in thirds of THIS period's orders (smallest third, middle, biggest), cut points taken from the data. Needs 15 orders.
  function orderBands(raw, from, to) {
    var orders = ordersOf(raw, from, to), out = { ok: orders.length >= LIMIT.orders, n: orders.length, bands: [], total: 0 };
    if (!out.ok) return out;
    orders.sort(function (a, b) { return a.toman - b.toman || (a.key < b.key ? -1 : 1); });
    var k;
    for (k = 0; k < 3; k++) out.bands.push({ i: k, from: 0, to: 0, n: 0, toman: 0, share: 0, lines: 0, avgLines: 0, ch: { site: 0, person: 0, unknown: 0 } });
    orders.forEach(function (o, idx) {
      var b = out.bands[Math.floor(idx * 3 / orders.length)];
      if (!b.n) b.from = o.toman;
      b.to = o.toman; b.n += 1; b.toman += o.toman; b.lines += o.lines; b.ch[o.ch] += 1;
      out.total += o.toman;
    });
    out.bands.forEach(function (b) { b.share = out.total > 0 ? b.toman * 100 / out.total : 0; b.avgLines = Math.round(b.lines * 10 / b.n) / 10; });
    return out;
  }

  // ---- «عملکرد ماه‌ها»: Jalali months against the month before, the same month last year and the average of full months ----
  // raw = the analysis part of getReport (lines of the period AND the period before it, items, prevFrom, cut); ctx = {from, to, today,
  // H: {addDays, monthKey}}; key = a product key (product.js keyOf) or '' for the whole shop. The newest LIMIT.months months that the loaded
  // lines cover completely, newest first. A month that is not over yet (partial) is compared with the SAME first N days of the other month
  // (N = the day of the last day of the period), never projected, and not compared with the average. A month that the loaded lines do not
  // cover (before the window, before the first sale) is unknown: null → «—».
  function monthly(raw, ctx, key) {
    var H = ctx.H, lines = (raw && raw.lines) || [], from = ctx.from || '', to = ctx.to || '', today = ctx.today || '';
    var out = { ok: false, months: [], fullN: 0, avg: null, avgOk: false, noYear: false, cut: !!(raw && raw.cut) };
    if (!lines.length) return out;
    var items = raw.items || [], PVk = window.barginProduct;
    function nextMonth(ms) { return H.monthKey(H.addDays(ms, 31)); }
    function prevMonth(ms) { return H.monthKey(H.addDays(ms, -1)); }
    function monthEnd(ms) { return H.addDays(nextMonth(ms), -1); }
    function lastYear(ms) { return (parseInt(ms.slice(0, 4), 10) - 1) + ms.slice(4); }
    var oldest = lines[0][0];
    lines.forEach(function (l) { if (l[0] < oldest) oldest = l[0]; });
    var low = (raw && raw.prevFrom) || from || '';
    if (out.cut) { var nm = nextMonth(H.monthKey(oldest)); if (nm > low) low = nm; }
    var firstMonth = H.monthKey(oldest);
    function known(ms) { return ms >= firstMonth && (!low || ms >= low); }
    var mine = key && PVk ? lines.filter(function (l) { return PVk.keyOf(items[l[2]]) === key; }) : lines;
    var byMonth = {};
    mine.forEach(function (l) { var m = H.monthKey(l[0]); byMonth[m] = (byMonth[m] || 0) + l[5]; });
    function range(a, b) { var t = 0; mine.forEach(function (l) { if (l[0] >= a && l[0] <= b) t += l[5]; }); return t; }
    var endDate = to && to < today ? to : today, lastM = H.monthKey(endDate), nDay = parseInt(endDate.slice(8), 10);
    function partial(ms) { return monthEnd(ms) > endDate; }
    function obj(cur, ref) {
      if (ref === null) return null;
      if (!(ref > 0)) return { ref: ref, pct: null, dir: '' };
      var pc = Math.round((cur - ref) * 100 / ref);
      return { ref: ref, pct: pc, dir: pc >= LIMIT.monthFlat ? 'up' : (pc <= -LIMIT.monthFlat ? 'down' : 'flat') };
    }
    function refSum(ms, part) {
      if (!known(ms)) return null;
      return part ? range(ms, H.addDays(ms, Math.min(nDay, parseInt(monthEnd(ms).slice(8), 10)) - 1)) : (byMonth[ms] || 0);
    }
    // the average of every full month the lines cover
    var fulls = [], ms = firstMonth, guard = 0;
    while (ms <= lastM && guard < 400) { if (known(ms) && !partial(ms)) fulls.push(byMonth[ms] || 0); ms = nextMonth(ms); guard += 1; }
    out.fullN = fulls.length;
    out.avgOk = fulls.length >= LIMIT.avgMonths;
    if (out.avgOk) { var t = 0; fulls.forEach(function (v) { t += v; }); out.avg = Math.round(t / fulls.length); }
    // the months shown, newest first
    var cur = lastM, shown = 0;
    while (shown < LIMIT.months && known(cur)) {
      var part = partial(cur), v = part ? range(cur, endDate) : (byMonth[cur] || 0);
      var m = { key: cur, toman: v, partial: part, days: part ? nDay : 0 };
      m.vsPrev = obj(v, refSum(prevMonth(cur), part));
      m.vsYear = obj(v, refSum(lastYear(cur), part));
      m.vsAvg = !part && out.avgOk ? obj(v, out.avg) : null;
      if (m.vsYear === null) out.noYear = true;
      out.months.push(m);
      cur = prevMonth(cur); shown += 1;
    }
    out.ok = out.months.length > 0;
    return out;
  }

  window.barginSegments = { monthly: monthly, customerBands: customerBands, orderBands: orderBands, ordersOf: ordersOf, LIMIT: LIMIT, UNITS: UNITS, unitStats: unitStats, defaultUnit: defaultUnit, rankProducts: rankProducts, unitShares: unitShares, priceBands: priceBands };
})();
