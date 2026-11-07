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
    noCustomer: 'مشتری‌ها فقط از فروش‌هایی حساب می‌شن که مشتری دارن.'
  };

  var DAY_MS = 86400000;
  var MAX_BARS = 60;
  var COLORS = { site: '#2f7a1f', person: '#4a2c1a', unknown: '#d2ad6c', bar: '#2f7a1f', grid: '#d9bd8c', rest: '#9b8160' };
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
    return { from: '', to: '' };
  }

  // ---- series for the time chart ----
  function keyOf(day, grain) { return grain === 'week' ? weekStartKey(day) : (grain === 'month' ? monthKey(day) : day); }
  function nextKey(k, grain) {
    if (grain === 'day') return addDays(k, 1);
    if (grain === 'week') return addDays(k, 7);
    var j = jparse(k);
    return j.m === 12 ? jkey(j.y + 1, 1, 1) : jkey(j.y, j.m + 1, 1);
  }
  // byDay [{d, toman, orders}] → oldest-first [{key, toman, orders}] with empty days/weeks/months filled in
  // between `from` and `to` (or between the first and last sale when there is no limit).
  function buildSeries(byDay, grain, from, to) {
    if (!byDay.length) return [];
    var map = {}, first = byDay[0].d, last = byDay[byDay.length - 1].d;
    byDay.forEach(function (x) {
      var k = keyOf(x.d, grain), c = map[k] || (map[k] = { key: k, toman: 0, orders: 0 });
      c.toman += x.toman; c.orders += x.orders;
    });
    var a = keyOf(from || first, grain), b = keyOf(to || last, grain), out = [], k = a, guard = 0;
    while (k <= b && guard < 5000) { out.push(map[k] || { key: k, toman: 0, orders: 0 }); k = nextKey(k, grain); guard += 1; }
    return out;
  }
  function labelOf(key, grain) {
    var j = jparse(key), names = ad.months || [];
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
  function productRows(byProduct, mode) {
    var list = mode === 'count' ? rankByCount(byProduct) : byProduct.slice().sort(function (a, b) { return b.toman - a.toman; });
    var top = list.slice(0, 8), rest = list.slice(8);
    var rows = top.map(function (p) { return { name: p.name, toman: p.toman, qty: p.qty, lines: p.lines }; });
    if (rest.length) {
      var t = 0, l = 0;
      rest.forEach(function (p) { t += p.toman; l += p.lines; });
      rows.push({ name: TEXT.bunch + ' (' + toFa(rest.length) + ')', toman: t, qty: sumQty(rest), lines: l, rest: true });
    }
    return { rows: rows, all: list };
  }

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
  // because the page reads right to left (oldest on the right).
  function drawTime(host, series, grain) {
    clear(host);
    if (!series.length) return 0;
    var shown = series.slice(-MAX_BARS).reverse();   // newest first = left to right
    var n = shown.length, left = 62, right = 8, top = 26, bottom = 46, H = 230;
    var slotMin = grain === 'day' ? 18 : (grain === 'week' ? 30 : 44);
    var avail = host.clientWidth || 320;
    var W = Math.max(avail, left + right + n * slotMin);
    var slot = (W - left - right) / n, bw = Math.min(40, slot * 0.7);
    var max = 0;
    shown.forEach(function (x) { if (x.toman > max) max = x.toman; });
    var top1 = niceMax(max), ch = H - top - bottom;
    var svg = svgBox(host, W, H, 'نمودار فروش');
    var t;
    for (t = 0; t <= 4; t++) {
      var y = top + ch - ch * t / 4;
      svg.appendChild(S('line', { x1: left - 4, x2: W - right, y1: y, y2: y, stroke: COLORS.grid, 'stroke-width': 1, 'stroke-dasharray': t ? '3 4' : '' }));
      svg.appendChild(S('text', { x: 2, y: y + 4, 'font-size': 11, 'text-anchor': 'start' }, rtl(fmtMoney(top1 * t / 4))));
    }
    var labelW = grain === 'day' ? 16 : (grain === 'week' ? 54 : 50), step = Math.max(1, Math.ceil(labelW / slot));
    var showVals = n <= 12;
    shown.forEach(function (x, i) {
      var cx = left + slot * i + slot / 2, bh = top1 > 0 ? ch * x.toman / top1 : 0;
      var rect = S('rect', { x: cx - bw / 2, y: top + ch - bh, width: bw, height: Math.max(0, bh), rx: 3, fill: COLORS.bar });
      rect.appendChild(S('title', null, rtl(labelOf(x.key, grain) + ' — ' + groupFa(x.toman) + ' ' + TEXT.toman)));
      svg.appendChild(rect);
      if (showVals && x.toman > 0) svg.appendChild(S('text', { x: cx, y: top + ch - bh - 5, 'font-size': 10, 'text-anchor': 'middle' }, rtl(fmtMoney(x.toman))));
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
  var st = { period: 'd90', grain: 'day', mode: 'toman', cache: {}, token: 0, data: null, range: null };
  function $(id) { return document.getElementById(id); }

  function tile(label, big, full) {
    var d = document.createElement('div'), b = document.createElement('b'), s = document.createElement('span');
    d.className = 'rp-tile';
    b.textContent = big;
    if (full) d.title = full;
    s.textContent = label;
    d.appendChild(b); d.appendChild(s);
    return d;
  }

  function renderTime() {
    var sum = st.data, series = buildSeries(sum.byDay, st.grain, st.range.from, st.range.to);
    var total = drawTime($('r-time'), series, st.grain);
    $('r-time-hint').textContent = total > MAX_BARS ? fill(TEXT.more60, { n: toFa(MAX_BARS) }) : '';
    var head = st.grain === 'week' ? TEXT.thWeek : (st.grain === 'month' ? TEXT.thMonth : TEXT.thDate);
    var rows = series.slice().reverse().map(function (x) {
      var j = jparse(x.key);
      return [st.grain === 'month' ? (ad.months[j.m - 1] + ' ' + toFa(j.y)) : toFa(x.key.replace(/-/g, '/')), groupFa(x.toman), toFa(x.orders)];
    });
    drawTable($('r-time-table'), [head, TEXT.thSales, TEXT.thOrders], rows);
  }

  function renderProducts() {
    var sum = st.data, pr = productRows(sum.byProduct, st.mode), count = st.mode === 'count';
    var rows = pr.rows.map(function (r) {
      return { label: r.name, value: count ? r.qty.pack : r.toman, text: count ? fmtQty(r.qty) : fmtMoney(r.toman) + ' ' + TEXT.toman, color: r.rest ? COLORS.rest : COLORS.bar };
    });
    if (!rows.length) { clear($('r-prod')); } else drawRows($('r-prod'), rows, 'پرفروش‌ترین محصولات');
    $('r-prod-hint').textContent = count ? TEXT.perUnit + ' ' + TEXT.barsOnlyPacks : '';
    drawTable($('r-prod-table'), [TEXT.thProduct, count ? TEXT.thQty : TEXT.thSales, count ? TEXT.thSales : TEXT.thQty],
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
    renderTime(); renderProducts(); renderChannel(); renderCustomers();
    var range = st.range.from ? fill(TEXT.rangeFromTo, { a: toFa(st.range.from.replace(/-/g, '/')), b: toFa(st.range.to.replace(/-/g, '/')) }) : TEXT.rangeAll;
    var line = fill(TEXT.used, { n: toFa(sum.rows.used), range: range });
    var sk = sum.rows.skipped.noDate + sum.rows.skipped.noTotal;
    if (sk) line += ' ' + fill(TEXT.skipped, { n: toFa(sk) });
    if (sum.rows.buysIgnored) line += ' ' + fill(TEXT.buys, { n: toFa(sum.rows.buysIgnored) });
    $('r-used').textContent = line + ' ' + TEXT.noCustomer;
  }

  function setPressed(sel, attr, val) {
    var b = document.querySelectorAll(sel), i;
    for (i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', String(b[i].getAttribute(attr) === val));
  }

  function show(summary) {
    st.data = summary;
    var any = summary.rows.used > 0;
    $('r-body').hidden = !any;
    $('r-note').textContent = any ? '' : TEXT.empty;
    $('r-note').className = 'adm-status';
    if (any) renderAll();
    else $('r-used').textContent = '';
  }

  function load(force) {
    var today = todayKey(), range = rangeFor(st.period, today), key = st.period + '|' + today;
    st.range = range;
    var mine = ++st.token;
    if (!force && st.cache[key]) { show(st.cache[key]); return; }
    $('r-note').textContent = TEXT.loading;
    $('r-note').className = 'adm-status';
    $('r-body').hidden = true;
    ad.api('getReport', { from: range.from, to: range.to }, true).then(function (r) {
      if (mine !== st.token) return;
      if (!r || !r.ok) { $('r-note').textContent = ''; ad.setStatus((r && r.message) || TEXT.loadFail, 'err'); return; }
      if (r.report !== true || !r.summary) { $('r-note').textContent = ''; ad.setStatus(TEXT.oldServer, 'err'); return; }
      st.cache[key] = r.summary;
      ad.setStatus('');
      show(r.summary);
    }, function (err) {
      if (mine !== st.token) return;
      $('r-note').textContent = '';
      if (err && err.code === 'unknown_action') { ad.setStatus(TEXT.oldServer, 'err'); return; }
      ad.onApiError(err, TEXT.loadFail);
    });
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
      if (st.data && st.data.rows.used) renderTime();
    });
    b = document.querySelectorAll('[data-mode]');
    for (i = 0; i < b.length; i++) b[i].addEventListener('click', function () {
      st.mode = this.getAttribute('data-mode');
      setPressed('[data-mode]', 'data-mode', st.mode);
      if (st.data && st.data.rows.used) renderProducts();
    });
    $('r-reload').addEventListener('click', function () { load(true); });
    $('r-logout').addEventListener('click', function () { ad.logout(); });
    window.addEventListener('resize', function () {
      if (!$('v-report').hidden && st.data && st.data.rows.used) renderAll();
    });
  }

  window.barginReport = {
    open: function () { load(false); },
    reset: function () {
      st.cache = {}; st.data = null; st.token += 1;
      if ($('r-body')) { $('r-body').hidden = true; clear($('r-tiles')); }   // nothing of the report stays after logout
      ['r-time', 'r-prod', 'r-chan', 'r-chan-legend', 'r-cust', 'r-time-table', 'r-prod-table', 'r-chan-table', 'r-cust-table'].forEach(function (id) { if ($(id)) clear($(id)); });
    },
    util: {
      fmtMoney: fmtMoney, fmtQty: fmtQty, fmtNum: fmtNum, weekStartKey: weekStartKey, monthKey: monthKey, rangeFor: rangeFor, addDays: addDays,
      dayDiff: dayDiff, buildSeries: buildSeries, productRows: productRows, rankByCount: rankByCount, todayKey: todayKey, labelOf: labelOf
    }
  };
  if ($('r-periods')) wire();
})();
