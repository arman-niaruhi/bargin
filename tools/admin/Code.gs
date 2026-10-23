// Bargin product admin (Google Apps Script). Bind this project to the products Google Sheet.
// Only the owner can open the page or call these functions. The Sheet is the editor;
// publishCsv() checks the rows and builds data/products.csv for download.
// The pure functions (validateRows, buildCsv and the cell helpers) make no Apps Script
// calls, so tools/admin/test.mjs can run them in Node.
// Style: ES2017 only, like the site (no newer syntax or methods).

// The owner's Google account. Nobody else can open the page or call the functions.
var OWNER_EMAIL = 'arman.niaruhi@gmail.com';

// The CSV columns, in this order (same as data/products.csv).
var HEADER = ['id', 'name', 'category', 'price', 'unit', 'serves', 'short', 'details', 'recipe', 'images', 'soldOut'];

// Line ending between CSV records: CRLF, like data/products.csv (owner's choice, 2026-10-23).
var EOL = '\r\n';

// Persian texts shown to the owner, in one place.
// TODO: bargin-content to review the wording.
var MSG = {
  pageTitle: 'مدیریت محصولات برگین',
  notOwner: 'این صفحه فقط برای مالک برگین است.',
  missingColumn: 'ستون «{name}» توی شیت پیدا نشد.',
  missingId: 'شناسه (id) خالیه.',
  missingName: 'اسم (name) خالیه.',
  missingCategory: 'دسته‌بندی (category) خالیه.',
  missingPrice: 'قیمت خالیه.',
  badPrice: 'قیمت باید فقط عدد باشه: «{value}»',
  badId: 'شناسه باید انگلیسی و بدون فاصله باشه: «{value}»',
  duplicateId: 'شناسه تکراری: «{value}» (سطر {first} هم همینه).',
  badSoldOut: 'ناموجود (soldOut) باید yes یا no باشه، یا خالی: «{value}»'
};

var PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

// Fills {placeholders} in a message.
function fill(template, vars) {
  var s = template;
  Object.keys(vars).forEach(function (k) {
    s = s.split('{' + k + '}').join(String(vars[k]));
  });
  return s;
}

// Persian and Arabic digits → ASCII digits.
function toAsciiDigits(s) {
  return s.replace(/[۰-۹٠-٩]/g, function (d) {
    var i = PERSIAN_DIGITS.indexOf(d);
    if (i < 0) i = ARABIC_DIGITS.indexOf(d);
    return String(i);
  });
}

// A cell as text, trimmed. Empty cells (null, undefined, blank) give ''.
function cellText(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// A row where every column is empty is skipped.
function isBlankRow(r) {
  return HEADER.every(function (h) { return cellText(r[h]) === ''; });
}

// The rows that count as products (blank rows left out).
function productRows(rows) {
  return rows.filter(function (r) { return !isBlankRow(r); });
}

// One CSV field: quoted only when it has a comma, double quote, CR or LF.
function csvField(v) {
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// Checks the rows. Each row is an object keyed by HEADER names, with its
// sheet row number in `row`. Returns a list of {row, message}, in row order.
function validateRows(rows) {
  var issues = [];
  var seen = Object.create(null);
  rows.forEach(function (r) {
    if (isBlankRow(r)) return;
    var row = r.row;
    function add(message) { issues.push({ row: row, message: message }); }

    var id = cellText(r.id);
    if (!id) {
      add(MSG.missingId);
    } else {
      if (/\s/.test(id) || /[^\x00-\x7F]/.test(id)) add(fill(MSG.badId, { value: id }));
      if (seen[id] !== undefined) add(fill(MSG.duplicateId, { value: id, first: seen[id] }));
      else seen[id] = row;
    }

    if (!cellText(r.name)) add(MSG.missingName);
    if (!cellText(r.category)) add(MSG.missingCategory);

    var price = cellText(r.price);
    if (!price) add(MSG.missingPrice);
    else if (!/^\d+$/.test(toAsciiDigits(price).replace(/,/g, ''))) add(fill(MSG.badPrice, { value: price }));

    var soldOut = cellText(r.soldOut).toLowerCase();
    if (soldOut && soldOut !== 'yes' && soldOut !== 'no') add(fill(MSG.badSoldOut, { value: cellText(r.soldOut) }));
  });
  return issues;
}

// Builds the CSV text: UTF-8 BOM, the header, then one line per product.
// Empty soldOut becomes "no". Price is written as typed. `eol` is the line
// ending for records and for line breaks inside a cell (default CRLF, like data/products.csv).
function buildCsv(rows, eol) {
  eol = eol || '\r\n';
  var lines = [HEADER.join(',')];
  productRows(rows).forEach(function (r) {
    lines.push(HEADER.map(function (h) {
      var v = cellText(r[h]).replace(/\r\n?|\n/g, eol);
      if (h === 'soldOut') v = v.toLowerCase() === 'yes' ? 'yes' : 'no';
      return csvField(v);
    }).join(','));
  });
  return '﻿' + lines.join(eol) + eol;
}

// ---- Apps Script only below this line ----

function isOwner() {
  var email = Session.getActiveUser().getEmail();
  return String(email || '').trim().toLowerCase() === OWNER_EMAIL;
}

function assertOwner() {
  if (!isOwner()) throw new Error(MSG.notOwner);
}

// Serves the admin page to the owner only.
function doGet() {
  if (!isOwner()) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><meta charset="utf-8"><p dir="rtl" style="font-family:sans-serif">' + MSG.notOwner + '</p>'
    );
  }
  return HtmlService.createHtmlOutputFromFile('admin').setTitle(MSG.pageTitle);
}

// Reads the first sheet. Returns {rows, issues}. Row 1 is the header; the
// header can have the columns in any order, but all of them must be there.
function readSheetRows() {
  var values = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getValues();
  var issues = [];
  if (!values.length) return { rows: [], issues: issues };
  var head = values[0].map(function (h) { return cellText(h); });
  var index = {};
  HEADER.forEach(function (name) {
    index[name] = head.indexOf(name);
    if (index[name] < 0) issues.push({ row: 1, message: fill(MSG.missingColumn, { name: name }) });
  });
  var rows = values.slice(1).map(function (v, k) {
    var o = { row: k + 2 };
    HEADER.forEach(function (name) {
      o[name] = index[name] < 0 ? '' : cellText(v[index[name]]);
    });
    return o;
  });
  return { rows: rows, issues: issues };
}

// Called by the page: the sheet rows and every issue found.
function getProducts() {
  assertOwner();
  var data = readSheetRows();
  if (data.issues.length) return { rows: data.rows, issues: data.issues };
  return { rows: data.rows, issues: validateRows(data.rows) };
}

// Called by the page on «ساخت فایل». Blocked when there are issues.
// Returns {ok:true, csv, count} or {ok:false, issues}.
function publishCsv() {
  assertOwner();
  var data = getProducts();
  if (data.issues.length) return { ok: false, issues: data.issues };
  return { ok: true, csv: buildCsv(data.rows, EOL), count: productRows(data.rows).length };
}
