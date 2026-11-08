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
    top: 8             // products drawn (the rest of the best list is summed in «بقیه»)
  };
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

  window.barginSegments = { LIMIT: LIMIT, UNITS: UNITS, unitStats: unitStats, defaultUnit: defaultUnit, rankProducts: rankProducts, unitShares: unitShares, priceBands: priceBands };
})();
