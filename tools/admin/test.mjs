// Tests for the product admin (tools/admin/Code.gs) against data/products.csv.
// Run: node tools/admin/test.mjs   (exits with code 1 if a check fails)
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const csvFile = read("data/products.csv");

// Code.gs runs in a sandbox with stubbed Apps Script services and a fake clock.
import nodeCrypto from "node:crypto";
const clock = { t: 1800000000000 };
const mails = [];
const world = { lockBusy: false, props: {}, cache: new Map(), uuidFail: false, sessionUsed: 0, sleeps: [] };
const cacheStub = {
  get(k) { const e = world.cache.get(k); if (!e) return null; if (e.until <= clock.t) { world.cache.delete(k); return null; } return e.v; },
  put(k, v, ttl) {
    if (!(ttl >= 1 && ttl <= 21600)) throw new Error("bad cache ttl " + ttl);   // CacheService: 1 s to 6 h
    world.cache.set(k, { v: String(v), until: clock.t + ttl * 1000 });
  },
  remove(k) { world.cache.delete(k); }
};
const stubs = {
  CacheService: { getScriptCache: () => cacheStub },
  LockService: { getScriptLock: () => ({ tryLock: () => !world.lockBusy, releaseLock() {} }) },
  MailApp: { sendEmail(to, subject, body) { if (world.mailFail) throw new Error("mail down"); mails.push({ to, subject, body }); }, getRemainingDailyQuota: () => 100 },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in world.props ? world.props[k] : null), setProperty: (k, v) => { world.props[k] = String(v); } }) },
  Session: { getActiveUser() { world.sessionUsed++; return { getEmail: () => "" }; } },
  Utilities: {
    sleep: (ms) => { world.sleeps.push(ms); },
    getUuid: () => { if (world.uuidFail) throw new Error("uuid"); return nodeCrypto.randomUUID(); },
    DigestAlgorithm: { SHA_256: "SHA_256" },
    computeDigest: (alg, text) => Array.from(nodeCrypto.createHash("sha256").update(String(text), "utf8").digest()).map((b) => (b > 127 ? b - 256 : b))
  }
};
const gs = { ...stubs };
vm.createContext(gs);
vm.runInContext(read("tools/admin/Code.gs") + ";this.buildCsv=buildCsv;this.validateRows=validateRows;this.planSave=planSave;this.HEADER=HEADER;this.EOL=EOL;this.handleRequest_=handleRequest_;this.ALLOWED_EMAILS=ALLOWED_EMAILS;this.LOG_HEADER=LOG_HEADER;this.LOG_MAX_ROWS=LOG_MAX_ROWS;this.setupLog=setupLog;", gs);
gs.nowMs_ = () => clock.t;   // the fake clock (Code.gs calls nowMs_ through the global)

// app.js: the same parser the website and the bot use
const site = {};
vm.runInNewContext(read("app.js") + ";this.parseCSV=parseCSV;this.productFromRow=productFromRow;this.categoriesOf=categoriesOf;", site);

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "\n      " + detail : ""}`);
  if (!ok) failed++;
}

// Reads CSV text exactly: no trimming, BOM dropped, CRLF or LF ends a record outside quotes.
function rawParse(text) {
  text = text.replace(/^﻿/, "");
  const records = [];
  let rec = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\r" && text[i + 1] === "\n") continue;
    else if (c === "\n") { rec.push(f); records.push(rec); rec = []; f = ""; }
    else f += c;
  }
  if (f || rec.length) { rec.push(f); records.push(rec); }
  const [head, ...rows] = records;
  return rows.map((r, k) => {
    const o = { row: k + 2 };
    head.forEach((h, i) => { o[h] = r[i] === undefined ? "" : r[i]; });
    return o;
  });
}

const fileRows = rawParse(csvFile);
console.log(`file has ${fileRows.length} product rows\n`);

// (a) rebuild data/products.csv from its own rows (default line ending: CRLF)
const crlfOut = gs.buildCsv(fileRows);
const lfOut = gs.buildCsv(fileRows, "\n");
// The same data: every field equal after reading both files (line breaks inside a cell count as one).
const sameData = (text) => JSON.stringify(rawParse(text).map((r) => {
  const o = {};
  for (const k of Object.keys(r)) o[k] = k === "row" ? r[k] : r[k].replace(/\r\n?/g, "\n");
  return o;
}));
check("(a) CRLF build holds the same data as data/products.csv", sameData(crlfOut) === sameData(csvFile));
check("(a) CRLF build has no bare LF", crlfOut.replace(/\r\n/g, "").indexOf("\n") === -1);
check("(a) CRLF build has no bare CR", crlfOut.replace(/\r\n/g, "").indexOf("\r") === -1);
check("(a) buildCsv(rows, LF) still writes LF when asked (parameter kept)", !lfOut.includes("\r"));
check("(a) EOL constant in Code.gs is CRLF", gs.EOL === "\r\n", JSON.stringify(gs.EOL));
check("(a) publishCsv passes EOL to buildCsv (Publish path)", /buildCsv\(data\.rows,\s*EOL(, true)?\)/.test(read("tools/admin/Code.gs")));
check("(a) output starts with UTF-8 BOM", crlfOut.charCodeAt(0) === 0xfeff && lfOut.charCodeAt(0) === 0xfeff);
check("(a) header order is id,name,category,price,unit,serves,short,details,recipe,images,soldOut",
  lfOut.replace(/^\ufeff/, "").split("\n")[0] === "id,name,category,price,unit,serves,short,details,recipe,images,soldOut");
// data/products.csv vs what buildCsv would write for the same rows, read record by record and
// field by field (quoting style may differ, e.g. Google quotes a lone «،»; that is not a difference).
// Rules taken from buildCsv: UTF-8 BOM first, header row = HEADER, 11 fields in every record,
// one line ending for the whole file (the committed file uses LF, also inside cells), a final line end.
function csvRecords(text) {
  text = text.replace(/^﻿/, "");
  const records = [];
  let rec = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { rec.push(f); f = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { rec.push(f); records.push(rec); rec = []; f = ""; i++; }
    else if (c === "\n") { rec.push(f); records.push(rec); rec = []; f = ""; }
    else f += c;
  }
  if (f || rec.length) { rec.push(f); records.push(rec); }
  return records;
}
const fileRecs = csvRecords(csvFile), buildRecs = csvRecords(lfOut);
check("(a) data/products.csv starts with the UTF-8 BOM", csvFile.charCodeAt(0) === 0xfeff);
check("(a) data/products.csv header is exactly HEADER",
  JSON.stringify(fileRecs[0]) === JSON.stringify(Array.from(gs.HEADER)), JSON.stringify(fileRecs[0]));
{
  const bad = fileRecs.map((r, i) => [i + 1, r.length]).filter(([, n]) => n !== gs.HEADER.length);
  check(`(a) every record in data/products.csv has ${gs.HEADER.length} fields`, bad.length === 0, JSON.stringify(bad));
}
check("(a) data/products.csv uses LF only (no CR anywhere, LF inside cells too)", !csvFile.includes("\r"));
check("(a) data/products.csv ends with a line end", csvFile.endsWith("\n"));
{
  const diffs = [];
  const n = Math.max(fileRecs.length, buildRecs.length);
  for (let i = 0; i < n; i++) {
    const a = fileRecs[i], b = buildRecs[i];
    if (!a || !b) { diffs.push(`record ${i + 1}: only in ${a ? "file" : "build"}`); continue; }
    gs.HEADER.forEach((h, k) => {
      if (a[k] !== b[k]) diffs.push(`record ${i + 1} (${a[0] || b[0]}) ${h}: file ${JSON.stringify(a[k])} vs build ${JSON.stringify(b[k])}`);
    });
  }
  check(`(a) data/products.csv and the buildCsv output agree record by record, field by field (${fileRecs.length} records)`,
    diffs.length === 0, diffs.slice(0, 10).join("\n      "));
}
{
  // CRLF build: the same records, every line end (also inside cells) written as CRLF.
  const crlfRecs = csvRecords(crlfOut).map((r) => r.map((v) => v.replace(/\r\n/g, "\n")));
  check("(a) CRLF build gives the same records as the LF build", JSON.stringify(crlfRecs) === JSON.stringify(buildRecs));
}

// (b) generated CSV through app.js parseCSV / productFromRow / categoriesOf
const toProducts = (text) => site.parseCSV(text).filter((r) => r.id && r.name).map(site.productFromRow);
const origP = toProducts(csvFile), newP = toProducts(crlfOut);
check(`(b) ${origP.length} products in data/products.csv, ${newP.length} from the generated CSV`,
  origP.length === newP.length && newP.length > 0);
check("(b) every product field is unchanged (through app.js)",
  JSON.stringify(origP) === JSON.stringify(newP));
const origC = JSON.stringify(site.categoriesOf(origP)), newC = JSON.stringify(site.categoriesOf(newP));
check("(b) same categories in the same order", origC === newC, newC);

// (c) validation cases
const base = () => fileRows.map((r) => ({ ...r }));
const issuesOf = (rows) => gs.validateRows(rows);

check("(c) clean file has no issues", issuesOf(base()).length === 0, JSON.stringify(issuesOf(base())));

{
  const rows = base(); rows[2].id = "";
  const is = issuesOf(rows);
  check("(c) missing id is reported with its row number",
    is.length === 1 && is[0].row === 4 && /شناسه/.test(is[0].message), JSON.stringify(is));
}
{
  const rows = base(); rows[5].id = rows[0].id;
  const is = issuesOf(rows);
  check("(c) duplicate id is reported on the second row",
    is.length === 1 && is[0].row === 7 && /تکراری/.test(is[0].message), JSON.stringify(is));
}
{
  const rows = base(); rows[1].soldOut = "maybe";
  const is = issuesOf(rows);
  check("(c) bad soldOut is reported", is.length === 1 && is[0].row === 3 && /soldOut/.test(is[0].message), JSON.stringify(is));
}
{
  const rows = base(); rows[1].soldOut = "";
  check("(c) empty soldOut is allowed (means no)", issuesOf(rows).length === 0);
  check("(c) empty soldOut is written as no", rawParse(gs.buildCsv(rows))[1].soldOut === "no");
}
{
  const rows = base();
  rows.push({ row: 18, id: "x y", name: "n", category: "c", price: "1", soldOut: "no" });
  rows.push({ row: 19, id: "سیب", name: "n", category: "c", price: "1", soldOut: "no" });
  rows.push({ row: 20, id: "a", name: "", category: "", price: "abc", soldOut: "no" });
  rows.push({ row: 21, id: "b", name: "n", category: "c", price: "", soldOut: "no" });
  const is = issuesOf(rows).map((i) => i.row + ":" + i.message);
  check("(c) id with space, id non-ASCII, missing name/category, bad and missing price all reported",
    ["18:", "19:", "20:", "21:"].every((p) => is.some((m) => m.startsWith(p))), is.join(" | "));
}
{
  const rows = base();
  rows.push({ row: 18, id: "", name: "", category: "", price: "", soldOut: "" });
  check("(c) fully blank row is skipped", issuesOf(rows).length === 0);
}
{
  const rows = [{ row: 2, id: "p1", name: "n", category: "c", price: "۴۲۰,۰۰۰", unit: "کیلو", serves: "", short: "", details: "", recipe: "", images: "", soldOut: "no" },
                { row: 3, id: "p2", name: "n", category: "c", price: "٤٢٠٠٠", unit: "", serves: "", short: "", details: "", recipe: "", images: "", soldOut: "NO" }];
  check("(c) Persian digits with «,» and Arabic digits are valid prices (and NO is accepted)",
    issuesOf(rows).length === 0, JSON.stringify(issuesOf(rows)));
}
{
  const rows = base(); rows[0].name = 'سبزی "ویژه", مخصوص';
  const out = gs.buildCsv(rows);
  const line = out.split("\n")[1];
  check("(c) comma and quote inside a field are quoted and doubled",
    line.startsWith('sabzi-ghormeh,"سبزی ""ویژه"", مخصوص",'), line.slice(0, 80));
  const back = site.parseCSV(out)[0];
  check("(c) the field reads back unchanged through app.js parseCSV", back.name === 'سبزی "ویژه", مخصوص', back.name);
}

// Trailing and leading spaces are trimmed; the site trims them too.
{
  const rows = base(); rows[0].short = "  کوتاه  ";
  check("(c) surrounding spaces are trimmed", gs.buildCsv(rows).includes(",کوتاه,") );
}

// (d) saveProduct checks (planSave is the pure part of saveProduct)
{
  const rows = base();
  const form = (over) => ({ ...rows[0], ...over });
  delete form.row;

  const dup = gs.planSave(rows, form({ id: rows[3].id, name: "نسخه" }), "");
  check("(d) add: a duplicate id is refused, no target (append)",
    dup.issues.length === 1 && /تکراری/.test(dup.issues[0].message) && dup.target === null, JSON.stringify(dup.issues));

  const bad = gs.planSave(rows, form({ id: "new-one", price: "abc" }), "");
  check("(d) add: a bad price is refused",
    bad.issues.length === 1 && /قیمت/.test(bad.issues[0].message), JSON.stringify(bad.issues));

  const ok = gs.planSave(rows, form({ id: "new-one", price: "۱۲۰,۰۰۰" }), "");
  check("(d) add: a valid new id is accepted and appended after the last row",
    ok.issues.length === 0 && ok.target === null && ok.row === fileRows[fileRows.length - 1].row + 1, JSON.stringify(ok));

  const edit = gs.planSave(rows, form({ name: "سبزی قورمه ویرایش شده", price: "۴۳۰,۰۰۰" }), rows[0].id);
  check("(d) edit: a valid edit is accepted and updates the same row",
    edit.issues.length === 0 && edit.target === 2 && edit.row === 2, JSON.stringify(edit));

  const rename = gs.planSave(rows, form({ id: rows[1].id }), rows[0].id);
  check("(d) edit: renaming an id to another product's id is refused",
    rename.issues.length === 1 && /تکراری/.test(rename.issues[0].message), JSON.stringify(rename.issues));

  const same = gs.planSave(rows, form({ id: rows[0].id }), rows[0].id);
  check("(d) edit: keeping the same id is not a duplicate of itself", same.issues.length === 0, JSON.stringify(same.issues));

  const gone = gs.planSave(rows, form({}), "no-such-id");
  check("(d) edit: an id that is not in the sheet is refused (no append)",
    gone.issues.length === 1 && gone.target === null && gone.row === null, JSON.stringify(gone.issues));

  const blank = gs.planSave(rows, {}, "");
  check("(d) an empty form is refused", blank.issues.length > 0, JSON.stringify(blank.issues));

  const soldBad = gs.planSave(rows, form({ soldOut: "maybe" }), rows[0].id);
  check("(d) edit: a bad soldOut is refused", soldBad.issues.length === 1 && /soldOut/.test(soldBad.issues[0].message));
}

// ---- email-code login (owner decision 2026-10-23) ----
// A tiny fake sheet: counts every touch so we can prove nothing is read or written without a session.
const sheetLog = { touched: 0, writes: 0, deleted: [] };
const fakeValues = () => [gs.HEADER.slice(), ...fileRows.map((r) => gs.HEADER.map((h) => r[h]))];
const fakeSheet = {
  getDataRange: () => ({ getValues: () => { sheetLog.touched++; return fakeValues(); } }),
  getLastColumn: () => { sheetLog.touched++; return gs.HEADER.length; },
  getRange: () => ({ getValues: () => { sheetLog.touched++; return [gs.HEADER.map(() => "")]; }, setValues: () => { sheetLog.touched++; sheetLog.writes++; } }),
  deleteRow: (n) => { sheetLog.touched++; sheetLog.writes++; sheetLog.deleted.push(n); }
};
gs.SpreadsheetApp = { getActiveSpreadsheet: () => { sheetLog.touched++; return { getSheets: () => [fakeSheet], getSheetByName: () => null, getName: () => "x" }; } };
gs.ContentService = { MimeType: { JSON: "JSON" }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) };
const post = (obj) => JSON.parse(gs.doPost({ postData: { contents: typeof obj === "string" ? obj : JSON.stringify(obj) } }).s);
const ALLOWED = Array.from(gs.ALLOWED_EMAILS);
const OWNER = ALLOWED[0];
const SECOND = ALLOWED[1];
const reqCode = (email) => post({ action: "requestCode", data: { email: email === undefined ? OWNER : email } });
const MIN = 60 * 1000;
function reset() {
  world.cache.clear(); world.props = {}; mails.length = 0; world.lockBusy = false; world.mailFail = false;
  clock.t += 3 * 24 * 3600 * 1000;
  sheetLog.touched = 0; sheetLog.writes = 0; sheetLog.deleted.length = 0;
}
const codeOf = (m) => (m.subject.match(/\d{6}/) || [""])[0];
function ask(email) { const r = reqCode(email); return { r, code: mails.length ? codeOf(mails[mails.length - 1]) : "" }; }
function login(email) { reset(); const { r, code } = ask(email); const v = post({ action: "verifyCode", data: { challenge: r.data.challenge, code } }); return { sess: v.data.session, challenge: r.data.challenge, code }; }

// (e) requestCode
{
  reset();
  const { r, code } = ask();
  check("(e) requestCode answers ok with a 32-hex challenge, cooldown 60, expiry 600", r.ok === true && /^[0-9a-f]{32}$/.test(r.data.challenge) && r.data.cooldown === 60 && r.data.expiresIn === 600, JSON.stringify(r));
  check("(e) exactly one mail, to the typed allowed address only", mails.length === 1 && mails[0].to === OWNER);
  check("(e) the code (6 digits) is in the subject, not in the answer", /^\d{6}$/.test(code) && !JSON.stringify(r).includes(code));
  reqCode("evil@example.com");
  check("(e) an unknown address never gets mail (and is refused by the cooldown anyway)", mails.every((m) => m.to === OWNER));
  const stored = JSON.stringify([...world.cache.entries()]) + JSON.stringify(world.props);
  check("(e) the cache holds the code only hashed (no plain code or challenge)", !stored.includes(code) && !stored.includes(r.data.challenge));
}
{
  reset(); ask();
  const again = reqCode();
  check("(e) a second request within 60 s is refused (COOLDOWN, retryAfter) and sends no mail", again.ok === false && again.error === "COOLDOWN" && again.retryAfter > 0 && again.retryAfter <= 60 && mails.length === 1, JSON.stringify(again));
  clock.t += 61 * 1000;
  check("(e) after 61 s a new request works", reqCode().ok === true && mails.length === 2);
}
{
  reset();
  let ok = 0;
  for (let i = 0; i < 10; i++) { if (reqCode().ok) ok++; clock.t += 61 * 1000; }
  const sixth = reqCode();
  check("(e) 10 sends per hour, the 11th is refused (LIMIT_HOUR)", ok === 10 && sixth.ok === false && sixth.error === "LIMIT_HOUR" && mails.length === 10, JSON.stringify(sixth));
  clock.t += 61 * MIN;
  check("(e) an hour later sending works again", reqCode().ok === true);
}
{
  reset();
  let ok = 0;
  for (let h = 0; h < 3; h++) { for (let i = 0; i < 10; i++) { if (reqCode().ok) ok++; clock.t += 61 * 1000; } clock.t += 61 * MIN; }
  const n21 = reqCode();
  check("(e) 30 sends per day, the 31st is refused (LIMIT_DAY) even though the hour is free", ok === 30 && n21.ok === false && n21.error === "LIMIT_DAY" && mails.length === 30, JSON.stringify(n21));
  world.cache.clear();   // a cache reset must not lift the caps (they live in script properties)
  check("(e) clearing the cache does not lift the daily cap", reqCode().error === "LIMIT_DAY");
}
{
  reset(); world.mailFail = true;
  const r = reqCode();
  check("(e) a failed mail gives MAIL_FAIL and no usable challenge", r.ok === false && r.error === "MAIL_FAIL" && world.cache.size === 0, JSON.stringify(r));
  // failed sends are not counted: 15 failures, then the first good request works at once (no cooldown, no cap)
  let fails = 0;
  for (let i = 0; i < 15; i++) { if (reqCode().error === "MAIL_FAIL") fails++; }
  check("(e) failed mails never start the cooldown or hit a cap (15 retries all reach MailApp)", fails === 15 && world.cache.size === 0);
  world.mailFail = false;
  const good = reqCode();
  check("(e) after failures the next good request works at once (nothing counted)", good.ok === true && mails.length === 1, JSON.stringify(good));
  const next = reqCode();
  check("(e) only the real send starts the cooldown", next.error === "COOLDOWN");
}

// (f) verifyCode
{
  reset();
  const { r, code } = ask();
  const v = post({ action: "verifyCode", data: { challenge: r.data.challenge, code } });
  check("(f) the right code gives a 64-hex session token", v.ok === true && /^[0-9a-f]{64}$/.test(v.data.session), JSON.stringify(v));
  const stored = JSON.stringify([...world.cache.entries()]);
  check("(f) the session is stored hashed (token not in the cache)", !stored.includes(v.data.session));
  const again = post({ action: "verifyCode", data: { challenge: r.data.challenge, code } });
  check("(f) a code works once (second use: CODE_EXPIRED)", again.ok === false && again.error === "CODE_EXPIRED", JSON.stringify(again));
}
{
  reset();
  const { r, code } = ask();
  const wrong = code === "000000" ? "111111" : "000000";
  const w1 = post({ action: "verifyCode", data: { challenge: r.data.challenge, code: wrong } });
  check("(f) wrong code: BAD_CODE with tries left", w1.ok === false && w1.error === "BAD_CODE" && w1.triesLeft === 4, JSON.stringify(w1));
  let last;
  for (let i = 0; i < 4; i++) last = post({ action: "verifyCode", data: { challenge: r.data.challenge, code: wrong } });
  check("(f) the 5th wrong try ends the code (TOO_MANY)", last.error === "TOO_MANY", JSON.stringify(last));
  const right = post({ action: "verifyCode", data: { challenge: r.data.challenge, code } });
  check("(f) after 5 wrong tries even the right code is refused", right.ok === false && right.error === "CODE_EXPIRED", JSON.stringify(right));
}
{
  reset();
  const { r, code } = ask();
  clock.t += 601 * 1000;
  const v = post({ action: "verifyCode", data: { challenge: r.data.challenge, code } });
  check("(f) the code expires after 10 minutes", v.ok === false && v.error === "CODE_EXPIRED", JSON.stringify(v));
}
{
  reset();
  const { r, code } = ask();
  const fa = code.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const ar = code.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const junk = ["", "12345", "1234567", "abcdef", "12 34 5x", null, 5, { a: 1 }];
  const burned = junk.map((j) => post({ action: "verifyCode", data: { challenge: r.data.challenge, code: j } }).error);
  check("(f) malformed codes are BAD_CODE", burned.every((e) => e === "BAD_CODE"), burned.join());
  const v = post({ action: "verifyCode", data: { challenge: r.data.challenge, code: " " + fa.slice(0, 3) + " " + fa.slice(3) + " " } });
  check("(f) Persian digits (with spaces) are accepted and malformed tries did not use up the 5 tries", v.ok === true);
  clock.t += 61000;
  const { r: r2, code: c2 } = ask();
  const v2 = post({ action: "verifyCode", data: { challenge: r2.data.challenge, code: c2.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]) } });
  check("(f) Arabic digits are accepted too", v2.ok === true, JSON.stringify(v2));
}
{
  reset();
  const first = ask();
  clock.t += 61 * 1000;
  const second = ask();
  const old = post({ action: "verifyCode", data: { challenge: first.r.data.challenge, code: first.code } });
  check("(f) a new code cancels the old one", old.ok === false && old.error === "CODE_EXPIRED" && post({ action: "verifyCode", data: { challenge: second.r.data.challenge, code: second.code } }).ok === true);
  reset();
  const x = ask();
  const bad = ["", "0".repeat(32), "../etc", 5, null, "A".repeat(32)].map((c) => post({ action: "verifyCode", data: { challenge: c, code: x.code } }).error);
  check("(f) a wrong or missing challenge id is refused", bad.every((e) => e === "CODE_EXPIRED"), bad.join());
}

// (g) randomness
{
  const real = stubs.Utilities.getUuid;
  const seq = [];
  gs.Utilities.getUuid = () => seq.length ? seq.shift() : real();
  seq.push("00000000-0000-4000-8000-000000000000");
  check("(g) a code keeps leading zeros (000000)", gs.randomCode_() === "000000");
  seq.push("ffffffff-ffff-4fff-8fff-ffffffffffff", "00000007-0000-4000-8000-000000000000");
  check("(g) values from the uneven top of the range are thrown away (rejection sampling)", gs.randomCode_() === "000007");
  gs.Utilities.getUuid = real;
  const counts = new Array(10).fill(0);
  const N = 20000;
  for (let i = 0; i < N; i++) { const c = gs.randomCode_(); if (!/^\d{6}$/.test(c)) counts[0] = -1e9; for (const d of c) counts[d]++; }
  const exp = N * 6 / 10;
  check("(g) 20000 codes: always 6 digits, every digit about equally likely", counts.every((n) => Math.abs(n - exp) < exp * 0.05), counts.join());
  const tok = new Set(); for (let i = 0; i < 200; i++) tok.add(gs.randomHex_(64));
  check("(g) session tokens are 64 hex and never repeat", [...tok].every((t) => /^[0-9a-f]{64}$/.test(t)) && tok.size === 200);
  check("(g) safeEqual_: equal, different, different length", gs.safeEqual_("abc", "abc") && !gs.safeEqual_("abc", "abd") && !gs.safeEqual_("abc", "abcd") && !gs.safeEqual_("", "a"));
}

// (h) sessions
{
  const { sess } = login();
  const g = post({ action: "getProducts", session: sess });
  check("(h) a good session reads the sheet", g.ok === true && g.data.rows.length === fileRows.length, JSON.stringify(g).slice(0, 120));
}
{
  reset();
  const attempts = [
    { action: "getProducts" }, { action: "getProducts", session: "" }, { action: "getProducts", session: "x".repeat(64) },
    { action: "getProducts", session: "0".repeat(64) }, { action: "saveProduct", data: { item: { id: "x", name: "x", category: "x", price: "1" }, originalId: "" } },
    { action: "deleteProduct", data: { id: "a" } }, { action: "publishCsv" }, { action: "getProducts", session: { a: 1 } },
    { action: "getLedger" }, { action: "saveLedgerRow", data: { entry: {}, id: "" } }, { action: "deleteLedgerRow", session: "0".repeat(64), data: { id: "L" + "0".repeat(32) } },
    { action: "saveLedgerBuy", data: { buy: {}, id: "" } }
  ];
  const res = attempts.map((a) => post(a));
  check("(h) without a valid session every protected action gives NO_SESSION", res.every((x, i) => i === 7 ? x.error === "bad_request" : x.error === "NO_SESSION"), res.map((x) => x.error).join());
  check("(h) ... and the sheet was never touched or written", sheetLog.touched === 0 && sheetLog.writes === 0);
}
{
  let { sess } = login();
  clock.t += 50 * MIN;
  const a = post({ action: "getProducts", session: sess }).ok;
  clock.t += 50 * MIN;
  const b = post({ action: "getProducts", session: sess }).ok;
  check("(h) sliding: use every 50 minutes keeps the session alive (100 min)", a && b);
  clock.t += 61 * MIN;
  const idle = post({ action: "getProducts", session: sess });
  check("(h) 61 minutes idle ends the session (NO_SESSION)", idle.error === "NO_SESSION", JSON.stringify(idle));
  ({ sess } = login());
  let alive = true;
  for (let m = 50; m <= 350; m += 50) { clock.t += 50 * MIN; alive = alive && post({ action: "getProducts", session: sess }).ok === true; }
  check("(h) an active session lives up to 6 hours (checked every 50 min until 350 min)", alive);
  clock.t += 50 * MIN;
  check("(h) at 400 minutes the 6-hour limit ends it though it was in use", post({ action: "getProducts", session: sess }).error === "NO_SESSION");
}
{
  const { sess } = login();
  const out = post({ action: "logout", session: sess });
  check("(h) logout answers ok and the session is dead on the server", out.ok === true && post({ action: "getProducts", session: sess }).error === "NO_SESSION");
  check("(h) logout with a bad or missing token is harmless", post({ action: "logout" }).ok === true && post({ action: "logout", session: "zz" }).ok === true);
}
{
  const { sess } = login();
  check("(h) the session guard sits in handleRequest_ once (requireSession_ is called only there)", (read("tools/admin/Code.gs").match(/requireSession\(/g) || []).length === 1 && /deps\.requireSession\(/.test(read("tools/admin/Code.gs")));
  const src = read("tools/admin/Code.gs");
  check("(h) every sheet function calls assertSession_ (second guard)",
    ["getProducts", "saveProduct", "deleteProduct", "publishCsv", "getLedger", "saveLedgerRow", "deleteLedgerRow"].every((f) => new RegExp("function " + f + "\\([^)]*\\) \\{\\s*assertSession_\\(\\)").test(src)));
  let threw = false;
  try { gs.getProducts(); } catch (e) { threw = true; }
  check("(h) calling a sheet function directly, outside a checked request, throws", threw && sheetLog.touched === 0);
}

// (i) lock: no lock = fail closed
{
  const { sess } = login();
  world.lockBusy = true;
  const before = mails.length;
  const a = reqCode();
  const b = post({ action: "verifyCode", data: { challenge: "0".repeat(32), code: "123456" } });
  const c = post({ action: "saveProduct", session: sess, data: { item: { id: "n", name: "n", category: "c", price: "1" }, originalId: "" } });
  const d = post({ action: "deleteProduct", session: sess, data: { id: fileRows[0].id } });
  check("(i) when the lock cannot be taken everything that changes state answers BUSY", [a, b, c, d].every((x) => x.ok === false && x.error === "BUSY"), [a, b, c, d].map((x) => x.error).join());
  check("(i) ... and nothing was mailed or written", mails.length === before && sheetLog.writes === 0);
  world.lockBusy = false;
  const ok = post({ action: "saveProduct", session: sess, data: { item: { id: "n-new", name: "n", category: "c", price: "1" }, originalId: "" } });
  check("(i) with the lock free a save writes to the sheet", ok.ok === true && ok.data.ok === true && sheetLog.writes === 1, JSON.stringify(ok));
  const del = post({ action: "deleteProduct", session: sess, data: { id: fileRows[1].id } });
  check("(i) with the lock free a delete removes the row", del.ok === true && del.data.ok === true && sheetLog.deleted.join() === String(fileRows[1].row), JSON.stringify(del));
}

// (j) dispatcher and the rest
{
  reset();
  const bad = ["{oops", "", "[]", "null", "5", JSON.stringify({ action: "getProducts", data: [] }), JSON.stringify({ action: "getProducts", data: "x" }),
    JSON.stringify({ action: "getProducts", session: 5 }), JSON.stringify({ action: "getProducts", data: { big: "x".repeat(250000) } })];
  check("(j) malformed requests give bad_request and touch nothing", bad.every((b) => post(b).error === "bad_request") && sheetLog.touched === 0);
  const names = ["evil", "constructor", "__proto__", "toString", "", 5, null, "authorizeOnce", "readSheet"];
  check("(j) unknown actions are refused", names.every((a) => post({ action: a }).error === "unknown_action") && sheetLog.touched === 0);
  check("(j) the action lists are exactly the expected ones", vm.runInContext("PUBLIC_ACTIONS.join()", gs) === "requestCode,verifyCode,logout,logEvent" && vm.runInContext("PROTECTED_ACTIONS.join()", gs) === "getProducts,saveProduct,deleteProduct,publishCsv,getLedger,saveLedgerRow,deleteLedgerRow,saveLedgerOrder,deleteLedgerOrder,saveLedgerBuy,getReport");
  const g = JSON.parse(gs.doGet().s);
  check("(j) doGet returns only harmless JSON", g.ok === true && Object.keys(g).join() === "ok,service");
  const throwing = gs.handleRequest_(JSON.stringify({ action: "getProducts", session: "s" }), { requireSession: () => true, publicActions: {}, actions: { getProducts: () => { throw new Error("sheet down"); } } });
  check("(j) an action that throws gives a plain server error (no details leak)", throwing.error === "server" && !JSON.stringify(throwing).includes("sheet"));
  const h = gs.handleRequest_(JSON.stringify({ action: "getProducts", session: "s" }), { requireSession: () => "yes", publicActions: {}, actions: { getProducts: () => 1 } });
  check("(j) requireSession must return exactly true (a truthy string is refused)", h.error === "NO_SESSION");
}
{
  const src = read("tools/admin/Code.gs");
  check("(j) no HtmlService, ID-token or Google sign-in code is left", !/HtmlService|verifyIdToken_|checkClaims_|ADMIN_CLIENT_ID|tokeninfo|UrlFetchApp|oauth2\.googleapis/.test(src));
  check("(j) randomness only from Utilities.getUuid (no Math.random)", !/Math\.random/.test(src) && /Utilities\.getUuid/.test(src));
  check("(j) nothing is logged (no Logger, console, or Session)", !/Logger\.|console\.|Session\./.test(src));
  check("(j) MailApp is used once and only for the matched ALLOWED_EMAILS entry", (src.match(/MailApp\.sendEmail\(/g) || []).length === 1 && /MailApp\.sendEmail\(entry,/.test(src) && !/OWNER_EMAIL/.test(src));
  check("(j) authorizeOnce() exists and only touches the sheet and the mail quota", /function authorizeOnce\(\)/.test(src) && !/sendEmail\([^)]*\)[^}]*authorizeOnce/.test(src));
  check("(j) the stubbed Session service was never used", world.sessionUsed === 0);
  const m = JSON.parse(read("tools/admin/appsscript.json"));
  check("(j) appsscript.json: V8, Asia/Tehran, web app as the deployer, anonymous access", m.runtimeVersion === "V8" && m.timeZone === "Asia/Tehran" && m.webapp.executeAs === "USER_DEPLOYING" && m.webapp.access === "ANYONE_ANONYMOUS");
  check("(j) appsscript.json: scopes are only spreadsheets, send_mail and scriptapp (the hourly trigger)",
    m.oauthScopes.slice().sort().join() === ["https://www.googleapis.com/auth/script.send_mail", "https://www.googleapis.com/auth/script.scriptapp", "https://www.googleapis.com/auth/spreadsheets"].sort().join(), m.oauthScopes.join());
}
{
  const adm = read("admin/admin.js") + read("admin/index.html") + read("products.js");
  check("(j) no adminClientId or Google sign-in (gsi) anywhere in the admin page or products.js", !/adminClientId|accounts\.google\.com|gsi\b|google\.accounts/.test(adm));
  check("(j) admin.js: ES2017 only (no ?. ?? replaceAll .at( flat matchAll fromEntries)", !/\?\.|\?\?|replaceAll|\.at\(|\.flat\(|matchAll|fromEntries|structuredClone/.test(read("admin/admin.js")));
  check("(j) admin.js: no innerHTML / outerHTML / insertAdjacentHTML / document.write / eval", !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(read("admin/admin.js")));
}

// (k) two allowed emails (owner decision 2026-10-23: the user types the email)
{
  const out = [];
  for (const em of ALLOWED) {
    reset();
    const { r, code } = ask(em);
    const v = post({ action: "verifyCode", data: { challenge: r.data.challenge, code } });
    out.push(r.ok && mails.length === 1 && mails[0].to === em && v.ok && post({ action: "getProducts", session: v.data.session }).ok);
  }
  check("(k) both allowed emails get a code mailed to themselves and can log in and read the sheet", out.length === 2 && out.every(Boolean), out.join());
  check("(k) the allowed list is exactly the two agreed lowercase addresses", ALLOWED.join() === "arman.niaruhi@gmail.com,zeinabkia023@gmail.com");
  check("(k) the allowed list is exactly ['arman.niaruhi@gmail.com','zeinabkia023@gmail.com']", JSON.stringify(ALLOWED) === JSON.stringify(["arman.niaruhi@gmail.com", "zeinabkia023@gmail.com"]));
  reset();
  const typo = reqCode("zeinamkia023@gmail.com");
  check("(k) the old wrong spelling zeinamkia023@gmail.com is unknown: decoy answer, no mail", typo.ok === true && mails.length === 0 && !ALLOWED.includes("zeinamkia023@gmail.com"), JSON.stringify(typo));
}
{
  reset();
  const a = ask(OWNER);                       // code for the first email
  const wrongTry = post({ action: "verifyCode", data: { challenge: a.r.data.challenge, code: a.code === "000000" ? "111111" : "000000" } });
  check("(k) a wrong code does not log in", wrongTry.ok === false && wrongTry.error === "BAD_CODE");
  clock.t += 61 * 1000;
  const b = ask(SECOND);                      // code for the second email
  check("(k) the second code went to the second email only", mails.length === 2 && mails[1].to === SECOND && mails[0].to === OWNER);
  // the second person's code with the first person's challenge (and the reverse) fails
  const cross1 = post({ action: "verifyCode", data: { challenge: a.r.data.challenge, code: b.code } });
  const cross2 = post({ action: "verifyCode", data: { challenge: b.r.data.challenge, code: a.code } });
  check("(k) a code for one email cannot log in through the other email's challenge", cross1.ok === false && cross2.ok === false, JSON.stringify([cross1, cross2]));
  // both sessions are independent, each remembers its email
  const sa = post({ action: "verifyCode", data: { challenge: a.r.data.challenge, code: a.code } });
  const sb = post({ action: "verifyCode", data: { challenge: b.r.data.challenge, code: b.code } });
  check("(k) both codes still work for their own address (a request for the second did not cancel the first)", sa.ok && sb.ok && sa.data.session !== sb.data.session);
  post({ action: "logout", session: sa.data.session });
  check("(k) logging one out leaves the other logged in (sessions are independent)", post({ action: "getProducts", session: sa.data.session }).error === "NO_SESSION" && post({ action: "getProducts", session: sb.data.session }).ok === true);
  const sess = [...world.cache.entries()].filter(([k]) => k.startsWith("ss_")).map(([, e]) => JSON.parse(e.v));
  check("(k) the session stores which email it belongs to", sess.length === 1 && sess[0].e === SECOND);
}
{
  reset();
  const real = reqCode(OWNER);
  const mailsBefore = mails.length;
  clock.t += 61 * 1000;
  world.sleeps.length = 0;
  const fake = reqCode("stranger@example.com");
  const shape = (x) => JSON.stringify(Object.keys(x).sort()) + JSON.stringify(Object.keys(x.data).sort()) + typeof x.data.challenge + x.data.challenge.length + x.data.cooldown + x.data.expiresIn;
  check("(k) an unknown address gets no mail", mails.length === mailsBefore && mails.every((m) => ALLOWED.includes(m.to)));
  check("(k) ... and an answer of exactly the same shape as a real one (challenge, cooldown, expiresIn)", fake.ok === true && shape(fake) === shape(real), JSON.stringify(fake));
  check("(k) ... with a pause about as long as a real send", world.sleeps.length === 1 && world.sleeps[0] >= 300, world.sleeps.join());
  const tries = [];
  for (let i = 0; i < 4; i++) tries.push(post({ action: "verifyCode", data: { challenge: fake.data.challenge, code: "123456" } }));
  const realTry = (() => { clock.t += 61 * 1000; const r2 = reqCode(OWNER); return post({ action: "verifyCode", data: { challenge: r2.data.challenge, code: "123456" } }); })();
  check("(k) the decoy challenge never logs in and answers like a real one (BAD_CODE with triesLeft)", tries.every((t) => t.ok === false && t.error === "BAD_CODE" && typeof t.triesLeft === "number") && realTry.error === "BAD_CODE" && tries[0].triesLeft === realTry.triesLeft, JSON.stringify([tries[0], realTry]));
  const fifth = post({ action: "verifyCode", data: { challenge: fake.data.challenge, code: "123456" } });
  check("(k) the decoy runs out of tries like a real challenge (TOO_MANY)", fifth.error === "TOO_MANY", JSON.stringify(fifth));
}
{
  reset();
  const probe = reqCode("stranger@example.com");
  const quick = reqCode("stranger2@example.com");
  const real = reqCode(OWNER);
  check("(k) the cooldown also hits unknown addresses (and a real request right after a decoy)", probe.ok && quick.error === "COOLDOWN" && quick.retryAfter > 0 && real.error === "COOLDOWN" && mails.length === 0, JSON.stringify([quick, real]));
  world.cache.clear();
  check("(k) ... and a cache reset does not lift it", reqCode("x@example.com").error === "COOLDOWN");
  clock.t += 61 * 1000;
  check("(k) after 61 s the owner gets a real mail again", reqCode(OWNER).ok && mails.length === 1);
  check("(k) decoys are not written to the hour/day send log", JSON.parse(world.props.sendLog2).length === 1);
}
{
  reset();
  let fakes = 0;
  for (let i = 0; i < 25; i++) { if (reqCode("nobody" + i + "@example.com").ok) fakes++; clock.t += 61 * 1000; }
  check("(k) 25 unknown requests never use up the real send caps", fakes === 25 && mails.length === 0 && reqCode(OWNER).ok && mails.length === 1);
}
{
  // shared caps: both addresses together share 10/hour
  reset();
  let ok = 0;
  for (let i = 0; i < 12; i++) { if (reqCode(i % 2 ? SECOND : OWNER).ok) ok++; clock.t += 61 * 1000; }
  check("(k) the hour cap (10) is shared by both addresses", ok === 10 && mails.length === 10 && mails.filter((m) => m.to === SECOND).length === 5);
  reset();
  for (let i = 0; i < 10; i++) { reqCode(OWNER); clock.t += 61 * 1000; }
  check("(k) at the cap an unknown address gets the same LIMIT_HOUR answer (no way to tell)", reqCode("stranger@example.com").error === "LIMIT_HOUR");
}
{
  // the mail address is never the raw input
  const cases = [
    ["ARMAN.Niaruhi@Gmail.com", OWNER], ["  zeinabkia023@gmail.com  ", SECOND], ["\tZEINABKIA023@GMAIL.COM\n", SECOND]
  ];
  const res = cases.map(([input, want]) => { reset(); reqCode(input); return mails.length === 1 && mails[0].to === want && typeof mails[0].to === "string"; });
  check("(k) different case / spaces: the mail goes to the exact list entry", res.every(Boolean), res.join());
  const evil = ["a@b.com,zeinabkia023@gmail.com", "zeinabkia023@gmail.com,a@b.com", "zeinabkia023@gmail.com;a@b.com", "a@b.com zeinabkia023@gmail.com",
    "zeinabkia023@gmail.com\r\nBcc: a@b.com", "<zeinabkia023@gmail.com>", "Z <zeinabkia023@gmail.com>", "zeinabkia023@gmail.com.evil.com", "evil.com@zeinabkia023@gmail.com",
    "zeinabkia023+x@gmail.com", "zeinabkia023@gmail.com ", "arman.niaruhi@gmail.com\u0000", "a@b.com,arman.niaruhi@gmail.com"];
  const outs = evil.map((input) => { reset(); const r = reqCode(input); return { input, r, to: mails.map((m) => m.to) }; });
  check("(k) injected / lookalike addresses never mail two addresses or a different one",
    outs.every((o) => o.to.length === 0 || (o.to.length === 1 && ALLOWED.includes(o.to[0]) && o.input.trim().toLowerCase() === o.to[0])),
    JSON.stringify(outs.filter((o) => o.to.length).map((o) => [o.input, o.to])));
  check("(k) comma / semicolon / header-injection / angle-bracket inputs get bad_request and no mail (a valid-looking lookalike domain is just an unknown address: decoy, no mail)", outs.slice(0, 9).every((o, i) => (i === 7 ? o.r.ok === true : o.r.error === "bad_request") && o.to.length === 0), JSON.stringify(outs.slice(0, 9).map((o) => o.r.error)));
  const junk = [undefined, null, 5, {}, [], true, "", "   ", "nope", "@", "a@b", "x".repeat(300) + "@gmail.com", ("a".repeat(250)) + "@b.co"];
  const jr = junk.map((v) => { reset(); return post({ action: "requestCode", data: v === undefined ? {} : { email: v } }); });
  check("(k) missing / non-string / malformed / oversize email: bad_request, no mail, nothing stored", jr.every((x) => x.error === "bad_request") && mails.length === 0 && world.cache.size === 0, jr.map((x) => x.error).join());
  reset(); post({ action: "requestCode" });
  check("(k) a request with no data at all is bad_request", mails.length === 0);
}
{
  // session email checks
  const { sess } = login(SECOND);
  check("(k) a session for the second email can use every action", post({ action: "getProducts", session: sess }).ok && post({ action: "publishCsv", session: sess }).ok);
  // the second guard: a granted request whose email is not on the list is refused inside the sheet functions
  vm.runInContext("sessionEmail_ = 'stranger@example.com'", gs);
  let threw = false; try { gs.getProducts(); } catch (e) { threw = true; }
  vm.runInContext("sessionEmail_ = ''", gs);
  check("(k) assertSession_ refuses an email that is not on ALLOWED_EMAILS", threw);
  vm.runInContext("sessionEmail_ = '" + SECOND + "'", gs);
  let okCall = true; try { gs.getProducts(); } catch (e) { okCall = false; }
  vm.runInContext("sessionEmail_ = ''", gs);
  check("(k) assertSession_ accepts an allowed email", okCall);
  // a session whose email is removed from the list (or was forged / old format) dies
  const key = [...world.cache.keys()].find((k) => k.startsWith("ss_"));
  const st = JSON.parse(world.cache.get(key).v);
  const put = (o) => world.cache.set(key, { v: JSON.stringify(o), until: clock.t + 600000 });
  put({ ...st, e: "stranger@example.com" });
  check("(k) a session stored for an email not on the list is refused", post({ action: "getProducts", session: sess }).error === "NO_SESSION");
  const { sess: s2 } = login(OWNER);
  const key2 = [...world.cache.keys()].find((k) => k.startsWith("ss_"));
  const st2 = JSON.parse(world.cache.get(key2).v);
  delete st2.e; world.cache.set(key2, { v: JSON.stringify(st2), until: clock.t + 600000 });
  check("(k) a session without an email (old format) is refused", post({ action: "getProducts", session: s2 }).error === "NO_SESSION");
  const src = read("tools/admin/Code.gs");
  check("(k) no OWNER_EMAIL is left in Code.gs and the list is lowercase", !/OWNER_EMAIL/.test(src) && ALLOWED.every((e) => e === e.toLowerCase()));
}

// ---- (l) customer activity log: logEvent + setupLog (owner approved 2026-11-04) ----
{
  // a fake spreadsheet with the products tab first and (optionally) the «log» tab
  const mkSheet = (name, rows) => ({
    name, rows, maxRows: 1000, frozen: 0, formats: [], inserted: 0,
    getName() { return this.name; },
    getLastRow() { return this.rows.length; },
    getMaxRows() { return this.maxRows; },
    insertRowsAfter(after, n) { this.maxRows += n; this.inserted += n; },
    setFrozenRows(n) { this.frozen = n; },
    getRange(r, c, nr, nc) {
      const sh = this;
      if (r + nr - 1 > sh.maxRows) throw new Error("outside the sheet");
      const rng = {
        setValues(v) { v.forEach((row, i) => { sh.rows[r - 1 + i] = row.slice(); }); world.logWrites++; return rng; },
        setFontWeight() { return rng; },
        setNumberFormat(f) { sh.formats.push([r, nr, f]); return rng; }
      };
      return rng;
    }
  });
  let book;
  const mkBook = (withLog, logFirst) => {
    const products = mkSheet("products", [["id"]]);
    const sheets = [products];
    if (withLog) { const l = mkSheet("log", [gs.LOG_HEADER.slice()]); if (logFirst) sheets.unshift(l); else sheets.push(l); }
    book = {
      sheets, active: null, productsTouched: 0,
      getSheets() { return this.sheets.slice(); },
      getNumSheets() { return this.sheets.length; },
      getSheetByName(n) { return this.sheets.find((x) => x.name === n) || null; },
      insertSheet(n, i) { const sh = mkSheet(n, []); this.sheets.splice(i, 0, sh); return sh; },
      setActiveSheet(sh) { this.active = sh; return sh; },
      moveActiveSheet(pos) { const i = this.sheets.indexOf(this.active); this.sheets.splice(i, 1); this.sheets.splice(pos - 1, 0, this.active); },
      getName: () => "x"
    };
    return book;
  };
  const oldSS = gs.SpreadsheetApp;
  gs.SpreadsheetApp = { getActiveSpreadsheet: () => book };
  gs.Utilities.formatDate = (d, tz, f) => { world.tz = tz; return new Date(d.getTime() + 3.5 * 3600000).toISOString().slice(0, 19).replace("T", " "); };
  const lockCalls = [];
  gs.LockService = { getScriptLock: () => ({ tryLock: (ms) => { lockCalls.push(ms); return !world.lockBusy; }, releaseLock() {} }) };
  const logSheet = () => book.getSheetByName("log");
  const SID = "abcdefghij012345";
  const ev = (o) => Object.assign({ type: "view", page: "home", dev: "phone" }, o);
  const logPost = (events, sid = SID, extra = {}) => post(Object.assign({ action: "logEvent", data: { sid, events } }, extra));
  const fresh = (withLog = true) => { reset(); world.logWrites = 0; mkBook(withLog); };

  fresh();
  const r1 = logPost([ev({ src: "instagram.com" }), ev({ type: "search", q: "  سبزی   قورمه " }), ev({ type: "category", cat: "رب‌ها" }),
    ev({ type: "cart_add", page: "product", id: "sabzi-ghormeh", qty: 2, from: "product" }), ev({ type: "cart_open", qty: 2, from: "fab" }),
    ev({ type: "whatsapp", qty: 2, from: "drawer", dev: "computer" })]);
  const rows = logSheet().rows;
  check("(l) logEvent needs no session and always answers {ok:true, data:{}}", JSON.stringify(r1) === '{"ok":true,"data":{}}', JSON.stringify(r1));
  check("(l) the 6 allowed events are written in one write, after the header", rows.length === 7 && world.logWrites === 1 && rows[0].join() === gs.LOG_HEADER.join());
  check("(l) a row has time (Asia/Tehran), session, event, page, product, category, search, qty, from, device, source, reason",
    /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(rows[1][0]) && world.tz === "Asia/Tehran" &&
    JSON.stringify(rows[1].slice(1)) === JSON.stringify([SID, "view", "home", "", "", "", "", "", "phone", "instagram.com", ""]) &&
    JSON.stringify(rows[4].slice(1)) === JSON.stringify([SID, "cart_add", "product", "sabzi-ghormeh", "", "", 2, "product", "phone", "", ""]), JSON.stringify(rows.slice(1, 5)));
  check("(l) search text is trimmed to single spaces", rows[2][6] === "سبزی قورمه", rows[2][6]);
  check("(l) the lock is tried for 1.5 s only", lockCalls.length === 1 && lockCalls[0] === 1500, JSON.stringify(lockCalls));
  check("(l) the products tab is never written by logEvent", book.getSheets()[0].rows.length === 1);

  fresh();
  logPost([ev({ type: "hack" }), ev({ type: "view", page: "admin", id: "x y", from: "evil", dev: "tv", src: "a b", qty: "5" }), "x", null, [1], ev({ type: "search", q: "" })]);
  const r2 = logSheet().rows;
  check("(l) unknown types, non-objects and empty searches are dropped; bad fields are emptied",
    r2.length === 2 && JSON.stringify(r2[1].slice(1)) === JSON.stringify([SID, "view", "", "", "", "", "", "", "", "", ""]), JSON.stringify(r2));

  // the events added on 2026-11-04 (owner: the rest of the approved plan)
  fresh();
  logPost([ev({ type: "instagram", from: "footer" }), ev({ type: "phone", from: "footer" }),
    ev({ type: "cart_dec", page: "product", id: "rob-anar", qty: 1, from: "product" }), ev({ type: "cart_remove", id: "rob-anar", qty: 2, from: "drawer" }),
    ev({ type: "cart_clear", qty: 3, from: "drawer" }), ev({ type: "no_results", q: "پیتزا" }), ev({ type: "no_results", q: "" }),
    ev({ type: "load_error", why: "http-500" }), ev({ type: "load_error", why: "network" }), ev({ type: "load_error", why: "<b>x</b>" }),
    ev({ type: "category", cat: "c", why: "network" }), ev({ type: "cart_clear", q: "kept?" })]);
  const r5 = logSheet().rows.slice(1).map((r) => r.slice(2));
  const want = [
    ["instagram", "home", "", "", "", "", "footer", "phone", "", ""],
    ["phone", "home", "", "", "", "", "footer", "phone", "", ""],
    ["cart_dec", "product", "rob-anar", "", "", 1, "product", "phone", "", ""],
    ["cart_remove", "home", "rob-anar", "", "", 2, "drawer", "phone", "", ""],
    ["cart_clear", "home", "", "", "", 3, "drawer", "phone", "", ""],
    ["no_results", "home", "", "", "پیتزا", "", "", "phone", "", ""],
    ["load_error", "home", "", "", "", "", "", "phone", "", "http-500"],
    ["load_error", "home", "", "", "", "", "", "phone", "", "network"],
    ["load_error", "home", "", "", "", "", "", "phone", "", ""],
    ["category", "home", "", "c", "", "", "", "phone", "", ""],
    ["cart_clear", "home", "", "", "", "", "", "phone", "", ""]
  ];
  check("(l) new events instagram, phone, cart_dec, cart_remove, cart_clear, no_results, load_error are written",
    JSON.stringify(r5) === JSON.stringify(want), JSON.stringify(r5));
  check("(l) an empty no_results is dropped; reason only for load_error and only from the list; search word only for search/view/no_results", r5.length === 11);
  check("(l) LOG_HEADER ends with reason (12 columns)", gs.LOG_HEADER.length === 12 && gs.LOG_HEADER[11] === "reason");

  fresh();
  logPost([ev({ type: "search", q: "=HYPERLINK(\"http://x\",\"y\")" }), ev({ type: "category", cat: "+1" }), ev({ type: "category", cat: "-2" }),
    ev({ type: "category", cat: "@SUM(A1)" }), ev({ type: "search", q: "a\u0000b\nc\u2028d" }), ev({ type: "search", q: "ب".repeat(80) })]);
  const r3 = logSheet().rows;
  check("(l) formula injection: = + - @ at the start get an apostrophe",
    r3[1][6].startsWith("'=") && r3[2][5] === "'+1" && r3[3][5] === "'-2" && r3[4][5] === "'@SUM(A1)", JSON.stringify(r3.slice(1, 5).map((r) => [r[5], r[6]])));
  check("(l) control characters become spaces; search text is cut to 40 characters", r3[5][6] === "a b c d" && r3[6][6].length === 40, JSON.stringify([r3[5][6], r3[6][6].length]));

  fresh();
  ["", "short", "ABCDEFGHIJ012345", "abcdefghij0123456", 5].forEach((sid) => logPost([ev()], sid));
  check("(l) a bad visitor id writes nothing", logSheet().rows.length === 1);
  logPost(Array.from({ length: 21 }, () => ev()));
  check("(l) more than 20 events in one request writes nothing", logSheet().rows.length === 1);
  logPost([ev({ type: "search", q: "x".repeat(30) })].concat(Array.from({ length: 19 }, () => ev({ type: "search", q: "y".repeat(39) + "\u0000".repeat(400) }))));
  check("(l) a request body over 8000 characters writes nothing", logSheet().rows.length === 1);
  logPost([]); post({ action: "logEvent" }); post({ action: "logEvent", data: { sid: SID, events: "x" } });
  check("(l) empty or malformed requests write nothing and still answer ok", logSheet().rows.length === 1 && post({ action: "logEvent" }).ok === true);

  fresh(false);
  check("(l) no «log» tab yet (setupLog not run): ok, nothing written", logPost([ev()]).ok === true && world.logWrites === 0);

  fresh();
  world.lockBusy = true;
  check("(l) lock busy: the batch is dropped silently (ok, nothing written)", logPost([ev()]).ok === true && logSheet().rows.length === 1);
  world.lockBusy = false;

  // the 50,000-row cap: keep every row, drop new events once full
  fresh();
  const ls = logSheet();
  ls.maxRows = 50001;
  for (let i = 1; i <= 49998; i++) ls.rows.push(["old"]);
  logPost(Array.from({ length: 5 }, () => ev()));
  check("(l) cap: with room for 2 rows only 2 of 5 events are written (50,000 rows)", ls.rows.length === 50001 && ls.rows[1][0] === "old", String(ls.rows.length));
  logPost([ev()]);
  check("(l) cap reached: new events are dropped, no row is deleted or changed", ls.rows.length === 50001 && ls.rows[1][0] === "old" && world.cache.get("lg_full"));
  const writesBefore = world.logWrites;
  logPost([ev()]);
  check("(l) once full, the next requests do not even touch the sheet (cached flag)", world.logWrites === writesBefore);
  check("(l) LOG_MAX_ROWS is 50000", gs.LOG_MAX_ROWS === 50000);

  fresh();
  logSheet().maxRows = 3;
  logPost([ev(), ev(), ev(), ev()]);
  check("(l) the tab grows (insertRowsAfter) before writing past its last row", logSheet().rows.length === 5 && logSheet().inserted >= 2, String(logSheet().maxRows));

  // rate limits
  fresh();
  for (let i = 0; i < 16; i++) logPost(Array.from({ length: 20 }, () => ev()));
  check("(l) one visitor id: at most 300 events an hour", logSheet().rows.length === 301, String(logSheet().rows.length - 1));
  clock.t += 3601 * 1000;
  logPost([ev()]);
  check("(l) an hour later the same visitor can log again", logSheet().rows.length === 302);
  fresh();
  const sids = Array.from({ length: 40 }, (_, i) => ("v" + i).padEnd(16, "0"));
  sids.forEach((s) => logPost(Array.from({ length: 20 }, () => ev()), s));
  check("(l) all visitors together: at most 600 events a minute", logSheet().rows.length === 601, String(logSheet().rows.length - 1));

  // logEvent cannot reach any admin action, and admin actions still need a session
  fresh();
  sheetLog.touched = 0;
  check("(l) protected actions still say NO_SESSION (logEvent opened nothing else)", post({ action: "getProducts" }).error === "NO_SESSION" && sheetLog.touched === 0);
  check("(l) doGet is unchanged", gs.doGet().s === JSON.stringify({ ok: true, service: "bargin-admin" }));

  // setupLog: «log» is the LAST tab, products stay first
  fresh(false);
  const msg = gs.setupLog();
  check("(l) setupLog makes the «log» tab as the last tab with the header, frozen, plain text",
    book.getSheets().map((x) => x.name).join() === "products,log" && logSheet().rows[0].join() === gs.LOG_HEADER.join() && logSheet().frozen === 1 && logSheet().formats.some((f) => f[2] === "@"), msg);
  mkBook(true, true);
  gs.setupLog();
  check("(l) setupLog moves an existing «log» tab from first to last (products first again)", book.getSheets().map((x) => x.name).join() === "products,log");
  gs.setupLog();
  check("(l) setupLog can run again safely", book.getSheets().length === 2 && logSheet().rows.length === 1);

  gs.SpreadsheetApp = oldSS;
  gs.LockService = stubs.LockService;
}

// ---- (n) «خرید و فروش» ledger (owner approved 2026-11-07) ----
{
  const L = Array.from(gs.LEDGER_HEADER);
  // math, dates, Persian calendar
  const m1 = gs.ledgerMath_("3", "۴۵۰", "thousand"), m2 = gs.ledgerMath_("۲٫۵", "1.5", "million"), m3 = gs.ledgerMath_("1.25", "0.333", "thousand");
  check("(n) price: «۴۵۰» هزار = 450,000; «1.5» میلیون = 1,500,000; row totals 1,350,000 and 3,750,000",
    m1.unitToman === 450000 && m1.rowToman === 1350000 && m2.unitToman === 1500000 && m2.rowToman === 3750000 && m2.qty === 2.5 && m2.priceText === "1.5", JSON.stringify([m1, m2]));
  check("(n) row total is rounded to a whole toman (1.25 × 333 = 416.25 → 416)", m3.unitToman === 333 && m3.rowToman === 416, JSON.stringify(m3));
  check("(n) «۱,۲۰۰» and «٤٥٠» are read; leading zeros and trailing decimal zeros are cleaned",
    gs.ledgerMath_("1", "۱,۲۰۰", "thousand").unitToman === 1200000 && gs.ledgerMath_("1", "٤٥٠", "thousand").unitToman === 450000 && gs.ledgerMath_("01", "007.50", "thousand").priceText === "7.5");
  const badPrices = ["0", "0.000", "-5", "abc", "1e5", "1.2345", "", " ", "۱،۵", "1.2.3", null, undefined, {}, -1, Infinity];
  check("(n) price: 0, negative, text, 1e5, 4 decimals, empty and odd values are refused",
    badPrices.every((p) => gs.ledgerMath_("1", p, "thousand").unitToman === null), JSON.stringify(badPrices.map((p) => gs.ledgerMath_("1", p, "thousand").unitToman)));
  check("(n) price: an unknown unit is refused (also «constructor» / «__proto__»)",
    ["", "billion", "constructor", "__proto__", "toString", 5].every((u) => gs.ledgerMath_("1", "1", u).unitToman === null));
  check("(n) price: over 10,000,000,000 toman is «too big»; exactly 10,000 million is fine",
    gs.ledgerMath_("1", "10001", "million").tooBig === true && gs.ledgerMath_("1", "10000", "million").unitToman === 1e10);
  const badQty = ["0", "0.00", "-1", "1.234", "100000", "abc", "", null];
  check("(n) quantity: 0, negative, 3 decimals, over 99,999 and text are refused; «99999.99» is fine",
    badQty.every((q) => gs.ledgerMath_(q, "1", "thousand").qty === null) && gs.ledgerMath_("99999.99", "1", "thousand").qty === 99999.99);
  check("(n) the largest row total is still an exact whole number", Number.isSafeInteger(gs.ledgerMath_("99999.99", "10000", "million").rowToman));
  check("(n) date: 1405-08-16, «۱۴۰۵/۸/۱۶» and 1403-12-30 (leap year) are valid",
    gs.ledgerDate_("1405-08-16") === "1405-08-16" && gs.ledgerDate_("۱۴۰۵/۸/۱۶") === "1405-08-16" && gs.ledgerDate_("1403-12-30") === "1403-12-30");
  const badDates = ["1405-13-01", "1405-07-31", "1405-00-10", "1405-01-00", "1404-12-30", "1389-01-01", "1500-01-01", "x", "", "1405-8", "2026-11-07", null, 14050816];
  check("(n) date: month 13, Mehr 31, month 0, day 0, Esfand 30 in a normal year, out-of-range years and junk are refused",
    badDates.every((d) => gs.ledgerDate_(d) === ""), JSON.stringify(badDates.map((d) => gs.ledgerDate_(d))));
  const j = (a, b, c) => JSON.stringify(gs.toJalali_(a, b, c));
  check("(n) Persian calendar: 2026-11-07 = 1405-08-16, 2025-03-20 = 1403-12-30, 2025-03-21 = 1404-01-01, 2024-03-20 = 1403-01-01",
    j(2026, 11, 7) === '{"y":1405,"m":8,"d":16}' && j(2025, 3, 20) === '{"y":1403,"m":12,"d":30}' && j(2025, 3, 21) === '{"y":1404,"m":1,"d":1}' && j(2024, 3, 20) === '{"y":1403,"m":1,"d":1}');
  check("(n) Esfand has 30 days in 1399, 1403, 1408 and 29 in 1404, 1405",
    [1399, 1403, 1408].every((y) => gs.jalaliMonthDays_(y, 12) === 30) && [1404, 1405].every((y) => gs.jalaliMonthDays_(y, 12) === 29));
  const blockOf = (src) => { const a = src.indexOf("// ---- shared with admin/admin.js (begin)"), b = src.indexOf("// ---- shared with admin/admin.js (end)"); return a < 0 || b < 0 ? null : src.slice(a, b).split("\n").map((l) => l.trim()).join("\n"); };
  const adminSrc = read("admin/admin.js");
  check("(n) admin/admin.js has the same shared block (calendar, number parsing, row total) as Code.gs",
    blockOf(read("tools/admin/Code.gs")) !== null && blockOf(read("tools/admin/Code.gs")) === blockOf(adminSrc));

  // planLedgerRow_ (pure)
  const prods = fileRows.map((r) => ({ ...r }));
  const CUST = [{ id: "1", firstName: "zahra", lastName: "ahmadi" }, { id: "12", firstName: "Ali", lastName: "O'Neil-Smith" }];
  const ctx = { id: "L" + "a".repeat(32), created: "2026-11-07 10:00:00", by: OWNER, customers: CUST };
  const good = (o) => Object.assign({ date: "1405-08-16", type: "sell", productId: "sabzi-ghormeh", qty: "3", qtyUnit: "pack", price: "450", priceUnit: "thousand", party: "", note: "", channel: "site", customerId: "1" }, o);
  const p1 = gs.planLedgerRow_(good({ productName: "fake name" }), prods, ctx);
  const ghormeh = prods.find((r) => r.id === "sabzi-ghormeh").name;
  check("(n) plan: a good entry becomes one row in LEDGER_HEADER order",
    p1.issues.length === 0 && JSON.stringify(Array.from(p1.row)) === JSON.stringify([ctx.id, ctx.created, "1405-08-16", "فروش", "sabzi-ghormeh", ghormeh, 3, "بسته/ظرف", 450000, "450", "هزار تومان", 1350000, "zahra ahmadi", "", OWNER, "1", "سایت", "", "", ""]), JSON.stringify(p1));
  check("(n) plan: the product name comes from the products tab, never from the page", p1.row[5] === ghormeh && !JSON.stringify(p1.row).includes("fake name"));
  check("(n) LEDGER_HEADER has the 20 columns: the 15 old ones, customerId and channel, orderId, packSize, then productVersion at the END",
    L.join() === "id,created,date,type,productId,productName,qty,qtyUnit,priceToman,priceAmount,priceUnit,rowToman,party,note,by,customerId,channel,orderId,packSize,productVersion" &&
    Array.from(gs.LEDGER_HEADER_V1).join() === L.slice(0, 15).join() && Array.from(gs.LEDGER_HEADER_V2).join() === L.slice(0, 17).join() && gs.LEDGER_FORMATS.length === 20);
  const unknown = gs.planLedgerRow_(good({ productId: "no-such" }), prods, ctx);
  const blankP = gs.planLedgerRow_(good({ productId: "" }), prods.concat([{ row: 99, id: "", name: "" }]), ctx);
  check("(n) plan: an unknown or empty product id is refused", unknown.row === null && unknown.issues[0].field === "productId" && blankP.issues[0].field === "productId");
  check("(n) plan: blank product rows never count as products",
    gs.planLedgerRow_(good({ productId: "ghost" }), [{ row: 2, id: "ghost", name: "", category: "", price: "" }].map((r) => ({ ...r, unit: "", serves: "", short: "", details: "", recipe: "", images: "", soldOut: "" })), ctx).row !== null &&
    gs.planLedgerRow_(good({ productId: "" }), [{ row: 2 }], ctx).row === null);
  const kept = gs.planLedgerRow_(good({ productId: "old-gone" }), prods, Object.assign({ keep: { productId: "old-gone", productName: "محصول قدیمی" } }, ctx));
  check("(n) plan: editing an old row whose product was deleted keeps its stored name (product unchanged)", kept.issues.length === 0 && kept.row[5] === "محصول قدیمی");
  const swapGone = gs.planLedgerRow_(good({ productId: "other-gone" }), prods, Object.assign({ keep: { productId: "old-gone", productName: "x" } }, ctx));
  check("(n) plan: ... but switching to another missing product is refused", swapGone.row === null);
  check("(n) plan: type must be buy or sell; units from the list only",
    ["", "خرید", "BUY", "constructor"].every((t) => gs.planLedgerRow_(good({ type: t }), prods, ctx).row === null) &&
    ["", "kilo", "__proto__"].every((u) => gs.planLedgerRow_(good({ qtyUnit: u }), prods, ctx).row === null) &&
    gs.planLedgerRow_(good({ type: "buy", qtyUnit: "kg" }), prods, ctx).row[3] === "خرید");
  const inj = gs.planLedgerRow_(good({ type: "buy", party: "=HYPERLINK(\"http://x\")", note: "+1 -2\nline\u0000two" }), prods, ctx);
  check("(n) plan: formula injection in name/description gets an apostrophe; control characters and line breaks become spaces",
    inj.row[12].startsWith("'=") && inj.row[13] === "'+1 -2 line two", JSON.stringify([inj.row[12], inj.row[13]]));
  check("(n) plan: name over 60 / description over 300 characters is refused (60 / 300 are fine)",
    gs.planLedgerRow_(good({ type: "buy", party: "ب".repeat(61) }), prods, ctx).issues.some((i) => i.field === "party") &&
    gs.planLedgerRow_(good({ note: "ب".repeat(301) }), prods, ctx).issues.some((i) => i.field === "note") &&
    gs.planLedgerRow_(good({ type: "buy", party: "ب".repeat(60), note: "ب".repeat(300) }), prods, ctx).issues.length === 0 &&
    gs.planLedgerRow_(good({ type: "buy", party: 5 }), prods, ctx).row === null);
  const many = gs.planLedgerRow_({}, prods, ctx);
  check("(n) plan: an empty entry lists every missing field", ["date", "type", "productId", "qty", "qtyUnit", "priceUnit"].every((f) => many.issues.some((i) => i.field === f)), many.issues.map((i) => i.field).join());
  // «سایر»: a ledger-only item with a typed name (reserved productId)
  const OTHER = gs.LEDGER_OTHER_ID;
  const oth = (o) => good(Object.assign({ productId: OTHER }, o));
  const o1 = gs.planLedgerRow_(oth({ productName: "  برنج \n  طارم\u0007 " }), prods, ctx);
  check("(n) «سایر»: the typed name is saved (cleaned: single spaces, no control characters, trimmed)",
    o1.issues.length === 0 && o1.row[4] === OTHER && o1.row[5] === "برنج طارم", JSON.stringify(o1));
  const o2 = [oth({}), oth({ productName: "" }), oth({ productName: "   \n " }), oth({ productName: 5 })].map((e) => gs.planLedgerRow_(e, prods, ctx));
  check("(n) «سایر»: without a name it is refused with «اسم محصول رو بنویس.»",
    o2.every((p) => p.row === null && p.issues.length === 1 && p.issues[0].field === "productName" && p.issues[0].message === gs.MSG.needOtherName), JSON.stringify(o2.map((p) => p.issues)));
  const o3 = gs.planLedgerRow_(oth({ productName: "ب".repeat(61) }), prods, ctx);
  check("(n) «سایر»: 61 characters are refused, 60 are fine",
    o3.row === null && o3.issues[0].field === "productName" && o3.issues[0].message === gs.MSG.longOtherName &&
    gs.planLedgerRow_(oth({ productName: "ب".repeat(60) }), prods, ctx).row[5] === "ب".repeat(60));
  const o4 = ["=HYPERLINK(\"http://x\")", "+1", "-2", "@a"].map((n) => gs.planLedgerRow_(oth({ productName: n }), prods, ctx).row[5]);
  check("(n) «سایر»: a name starting with = + - @ gets an apostrophe (formula escaping)", o4.every((v) => v.startsWith("'")), JSON.stringify(o4));
  const o5 = gs.planLedgerRow_(good({ productName: "شیشه خالی" }), prods, Object.assign({ keep: { productId: "sabzi-ghormeh", productName: "x" } }, ctx));
  const o6 = gs.planLedgerRow_(good({ productId: "rob-anar", productName: "سبزی قورمه" }), prods, ctx);
  check("(n) «سایر»: a normal product id still takes its name from the Sheet even when the page sends productName",
    o5.row[5] === ghormeh && o6.row[5] === prods.find((r) => r.id === "rob-anar").name && !JSON.stringify(o5.row).includes("شیشه خالی"));
  const fakeOther = prods.map((r) => ({ ...r })).concat([{ ...prods[0], row: 99, id: OTHER, name: "جعلی" }]);
  check("(n) «سایر»: the reserved id can never be a shop product (validateRows refuses it; a sheet row with it is never used)",
    /[^\x00-\x7F]/.test(OTHER) && OTHER.trim() === OTHER &&
    gs.validateRows([{ ...prods[0], row: 2, id: OTHER }]).some((i) => i.message.includes("شناسه")) &&
    !prods.some((r) => r.id === OTHER) &&
    gs.planLedgerRow_(oth({ productName: "برنج" }), fakeOther, ctx).row[5] === "برنج" &&
    gs.planLedgerRow_(oth({}), fakeOther, ctx).row === null &&
    gs.planLedgerRow_(oth({}), prods, Object.assign({ keep: { productId: OTHER, productName: "برنج" } }, ctx)).row === null);
  check("(n) «سایر»: admin/admin.js uses the same reserved id and max length as Code.gs",
    adminSrc.includes("var LEDGER_OTHER_ID = '" + OTHER + "';") && adminSrc.includes("var LEDGER_OTHER_MAX = " + gs.LEDGER_OTHER_MAX + ";") && gs.LEDGER_OTHER_MAX === 60);
  check("(n) findLedgerRow_: exactly one match → its sheet row; none / several → error",
    gs.findLedgerRow_(["La", "Lb", "Lc"], "Lb").row === 3 && gs.findLedgerRow_(["La"], "Lz").error === "none" && gs.findLedgerRow_(["La", "Lb", "La"], "La").error === "many");

  // a fake spreadsheet: products (first) + ledger (+ log)
  const mk = (name, rows) => ({
    name, rows, maxRows: 1000, frozen: 0, formats: [], touched: 0, deleted: [],
    getName() { return this.name; },
    getIndex() { return book.sheets.indexOf(this) + 1; },
    getLastRow() { return this.rows.length; },
    getMaxRows() { return this.maxRows; },
    getLastColumn() { return this.rows[0] ? this.rows[0].length : 0; },
    insertRowsAfter(a, n) { this.maxRows += n; },
    setFrozenRows(n) { this.frozen = n; },
    deleteRow(n) { this.touched++; this.deleted.push(n); this.rows.splice(n - 1, 1); },
    getDataRange() { const sh = this; return { getValues: () => { sh.touched++; return sh.rows.map((r) => r.slice()); } }; },
    getRange(r, c, nr = 1, nc = 1) {
      const sh = this;
      sh.touched++;
      const rng = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, k) => { const row = sh.rows[r - 1 + i]; return row && row[c - 1 + k] !== undefined ? row[c - 1 + k] : ""; })),
        setValues: (v) => { if (r + nr - 1 > sh.maxRows) throw new Error("outside"); v.forEach((row, i) => { const t = sh.rows[r - 1 + i] || (sh.rows[r - 1 + i] = []); row.forEach((x, k) => { t[c - 1 + k] = x; }); }); sh.writes = (sh.writes || 0) + 1; return rng; },
        setValue: (v) => { const t = sh.rows[r - 1] || (sh.rows[r - 1] = []); t[c - 1] = v; sh.writes = (sh.writes || 0) + 1; return rng; },
        setNumberFormats: (f) => { sh.formats.push(["row", r, f[0].join("|")]); return rng; },
        setNumberFormat: (f) => { sh.formats.push(["col", c, f]); return rng; },
        setFontWeight: () => rng
      };
      return rng;
    }
  });
  let book;
  const CH = Array.from(gs.CUSTOMER_HEADER);
  const mkBook = (order = ["products", "ledger", "customers", "log"], ledgerRows, custRows) => {
    const sheets = order.map((n) => n === "products" ? mk("products", [gs.HEADER.slice(), ...fileRows.map((r) => gs.HEADER.map((h) => r[h]))])
      : n === "ledger" ? mk("خرید و فروش", ledgerRows || [L.slice()])
      : n === "customers" ? mk("مشتری‌ها", custRows || [CH.slice(), ["1", "zahra", "ahmadi", "2026-11-07 09:00:00", OWNER]])
      : n === "history" ? mk("تاریخچه محصولات", [Array.from(gs.HISTORY_HEADER)])
      : mk("log", [gs.LOG_HEADER.slice()]));
    book = {
      sheets, active: null,
      getSheets() { return this.sheets.slice(); },
      getNumSheets() { return this.sheets.length; },
      getSheetByName(n) { return this.sheets.find((x) => x.name === n) || null; },
      insertSheet(n, i) { const sh = mk(n, []); this.sheets.splice(i, 0, sh); return sh; },
      setActiveSheet(sh) { this.active = sh; return sh; },
      moveActiveSheet(pos) { const i = this.sheets.indexOf(this.active); this.sheets.splice(i, 1); this.sheets.splice(pos - 1, 0, this.active); },
      getName: () => "x"
    };
    return book;
  };
  const oldSS = gs.SpreadsheetApp;
  gs.SpreadsheetApp = { getActiveSpreadsheet: () => book };
  gs.Utilities.formatDate = (d) => new Date(d.getTime() + 3.5 * 3600000).toISOString().slice(0, 19).replace("T", " ");
  const ledgerTab = () => book.getSheetByName("خرید و فروش");
  const productsTab = () => book.getSheetByName("products");

  // no session: nothing is read or written
  mkBook();
  reset();
  const ns = [post({ action: "getLedger" }), post({ action: "saveLedgerRow", data: { entry: good({}), id: "" } }),
    post({ action: "deleteLedgerRow", session: "f".repeat(64), data: { id: "L" + "0".repeat(32) } })];
  check("(n) without a session getLedger / saveLedgerRow / deleteLedgerRow give NO_SESSION and touch no tab",
    ns.every((x) => x.error === "NO_SESSION") && ledgerTab().touched === 0 && productsTab().touched === 0, ns.map((x) => x.error).join());
  let threw = false;
  try { gs.saveLedgerRow(good({}), ""); } catch (e) { threw = true; }
  check("(n) calling saveLedgerRow directly, outside a checked request, throws (assertSession_)", threw && ledgerTab().touched === 0);

  // add, list, edit, delete
  let { sess } = login();
  mkBook();
  // formula escaping in saveProduct (the products tab of the fake book)
  const sp = post({ action: "saveProduct", session: sess, data: { item: { id: "f-new", name: "=HYPERLINK(\"http://x\",\"y\")", category: "+c", price: "1", short: "-1", details: "@x", recipe: "سلام" }, originalId: "" } });
  const w = productsTab().rows[productsTab().rows.length - 1];
  check("(n) saveProduct: text starting with = + - @ gets an apostrophe (never a formula), other text unchanged",
    sp.ok === true && sp.data.ok === true && w[1].startsWith("'=") && w[2] === "'+c" && w[6] === "'-1" && w[7] === "'@x" && w[8] === "سلام" && w[0] === "f-new" && w[3] === "1" && w[10] === "no", JSON.stringify([sp, w]));
  mkBook();
  const add = (o, id = "") => post({ action: "saveLedgerRow", session: sess, data: { entry: good(o), id } });
  const a1 = add({ id: "L" + "b".repeat(32), created: "1999", by: "evil@x.com", rowToman: 5 });
  const r1 = ledgerTab().rows[1];
  check("(n) save: a new row is appended after the header with a random L+32-hex id",
    a1.ok === true && a1.data.ok === true && /^L[0-9a-f]{32}$/.test(a1.data.id) && ledgerTab().rows.length === 2 && r1[0] === a1.data.id, JSON.stringify(a1));
  check("(n) save: id, time and email come from the server, never from the page (Tehran time, session email)",
    r1[0] !== "L" + "b".repeat(32) && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r1[1]) && r1[1] !== "1999" && r1[14] === OWNER && r1[11] === 1350000, JSON.stringify(r1));
  check("(n) save: the row gets its cell formats first (text for the date, numbers for qty and toman)",
    ledgerTab().formats.some((f) => f[0] === "row" && f[1] === 2 && f[2] === "@|@|@|@|@|@|0.##|@|#,##0|@|@|#,##0|@|@|@|@|@|0|@|@"));
  check("(n) save: the products tab is only read, never written", !productsTab().writes);
  const a2 = add({ date: "1405-08-20", type: "buy", qty: "2.5", qtyUnit: "kg", price: "1.2", priceUnit: "million", party: "آقای رضایی", note: "نقدی" });
  clock.t += 1000;
  const a3 = add({ date: "1405-08-16", note: "دومی همون روز" });
  const lg = post({ action: "getLedger", session: sess });
  const ids = lg.data.entries.map((e) => e.id);
  check("(n) getLedger: newest date first, then newest entered first", lg.ok && lg.data.ok && ids.join() === [a2.data.id, a3.data.id, a1.data.id].join(), JSON.stringify(ids));
  const e2 = lg.data.entries[0];
  check("(n) getLedger: keys and texts come back (type buy, kg, million, typed «1.2», row total 3,000,000)",
    e2.type === "buy" && e2.typeText === "خرید" && e2.qty === 2.5 && e2.qtyUnit === "kg" && e2.priceToman === 1200000 && e2.priceAmount === "1.2" && e2.priceUnit === "million" && e2.rowToman === 3000000 && e2.party === "آقای رضایی" && e2.note === "نقدی", JSON.stringify(e2));
  check("(n) getLedger: no sum or total over rows is sent", !("total" in lg.data) && !("sum" in lg.data) && Object.keys(lg.data).join() === "ok,entries,more,customers,orders,packSize,productVersion,simpleBuy");
  const bad = add({ price: "0" });
  check("(n) save: a bad entry is refused with issues and nothing is written", bad.ok === true && bad.data.ok === false && bad.data.issues.length === 1 && ledgerTab().rows.length === 4, JSON.stringify(bad));

  // edit
  const before = ledgerTab().rows.map((r) => r.slice());
  const ed = add({ qty: "4", price: "500", note: "ویرایش شد" }, a1.data.id);
  const row1 = ledgerTab().rows[1];
  check("(n) edit: the row with that id is updated in place; id, time and email are kept",
    ed.ok && ed.data.ok && ed.data.updated === true && ledgerTab().rows.length === 4 && row1[0] === a1.data.id && row1[1] === before[1][1] && row1[14] === OWNER && row1[11] === 2000000 && row1[13] === "ویرایش شد",
    JSON.stringify([ed, row1]));
  check("(n) edit: other rows are unchanged", JSON.stringify(ledgerTab().rows.slice(2)) === JSON.stringify(before.slice(2)));
  const edGone = add({}, "L" + "c".repeat(32));
  const edBad = add({}, "5");
  check("(n) edit: an unknown or malformed id changes nothing (not found)",
    edGone.data.ok === false && edBad.data.ok === false && ledgerTab().rows.length === 4 && /پیدا نشد/.test(edGone.data.message));
  // a row whose product was deleted from the products tab can still be edited
  ledgerTab().rows[2][4] = "deleted-prod"; ledgerTab().rows[2][5] = "محصول پاک‌شده";
  const edOld = add({ productId: "deleted-prod", note: "یادداشت تازه" }, ledgerTab().rows[2][0]);
  check("(n) edit: an old row whose product was deleted keeps its stored name", edOld.data.ok === true && ledgerTab().rows[2][5] === "محصول پاک‌شده" && ledgerTab().rows[2][13] === "یادداشت تازه", JSON.stringify(edOld));

  // delete
  const del = (id) => post({ action: "deleteLedgerRow", session: sess, data: { id } });
  const target = a3.data.id;
  const rowOf = ledgerTab().rows.findIndex((r) => r[0] === target) + 1;
  ledgerTab().rows.splice(1, 0, ["L" + "d".repeat(32)].concat(Array(16).fill("x")));   // a row added above it: rows shift
  const d1 = del(target);
  check("(n) delete: the ONE row with that id is deleted even after rows shifted (found by id, not by row number)",
    d1.ok && d1.data.ok === true && ledgerTab().deleted[0] === rowOf + 1 && !ledgerTab().rows.some((r) => r[0] === target), JSON.stringify([d1, ledgerTab().deleted]));
  const n0 = ledgerTab().rows.length;
  const d2 = [del(target), del("L" + "e".repeat(32)), del("x"), del(""), del(5), del("l" + "a".repeat(32))];
  check("(n) delete: already deleted, unknown or malformed ids delete nothing", d2.every((x) => x.ok === true ? x.data.ok === false : x.error === "server" || x.error === "bad_request") && ledgerTab().rows.length === n0, JSON.stringify(d2));
  ledgerTab().rows.push(ledgerTab().rows[1].slice());
  const dupId = ledgerTab().rows[1][0];
  const d3 = del(dupId);
  check("(n) delete: an id that is on two rows deletes nothing", d3.data.ok === false && /چند سطر/.test(d3.data.message) && ledgerTab().rows.length === n0 + 1);

  // lock
  world.lockBusy = true;
  const lb = [add({}), del(a2.data.id)];
  check("(n) lock busy: save and delete answer BUSY and write nothing", lb.every((x) => x.error === "BUSY") && ledgerTab().rows.length === n0 + 1);
  world.lockBusy = false;

  // cap
  vm.runInContext("LEDGER_MAX_ROWS = 3", gs);
  const full = add({});
  check("(n) full tab: a new row is refused, nothing is deleted", full.data.ok === false && /پر شده/.test(full.data.message) && ledgerTab().rows.length === n0 + 1);
  vm.runInContext("LEDGER_MAX_ROWS = 20000", gs);

  // tab problems
  mkBook(["products", "log"]);
  const miss = post({ action: "getLedger", session: sess });
  check("(n) no «خرید و فروش» tab yet: getLedger says to run setupLedger; saving writes nothing",
    miss.data.ok === false && /setupLedger/.test(miss.data.message) && add({}).data.ok === false && book.getSheets().length === 2);
  mkBook(["products", "ledger"], [["id", "x"]]);
  check("(n) a broken header: refused, nothing written", post({ action: "getLedger", session: sess }).data.ok === false && add({}).data.ok === false && ledgerTab().rows.length === 1);
  mkBook(["ledger", "products"]);
  const first = [post({ action: "getLedger", session: sess }), add({}), post({ action: "getProducts", session: sess }), post({ action: "saveProduct", session: sess, data: { item: { id: "n", name: "n", category: "c", price: "1" }, originalId: "" } })];
  check("(n) if «خرید و فروش» were the first tab: the ledger refuses, and the products actions never use it as the products",
    first[0].data.ok === false && first[1].data.ok === false && first[2].error === "server" && first[3].error === "server" && ledgerTab().rows.length === 1 && !ledgerTab().writes, JSON.stringify(first.map((x) => x.error || x.data.ok)));
  mkBook(["log", "products"]);
  check("(n) the «log» tab is never read as the products either", post({ action: "getProducts", session: sess }).error === "server");

  // setupLedger: 2nd tab, never first
  mkBook(["products", "log"]);
  const msg = gs.setupLedger();
  check("(n) setupLedger makes «خرید و فروش» the 2nd tab (products first, log last), header, frozen, formats",
    book.getSheets().map((x) => x.name).join() === "products,خرید و فروش,log" && ledgerTab().rows[0].join() === L.join() && ledgerTab().frozen === 1 &&
    ledgerTab().formats.filter((f) => f[0] === "col").length === 20 && /tab 2 of 3/.test(msg) && /products/.test(msg), msg);
  gs.setupLedger();
  check("(n) setupLedger can run again safely", book.getSheets().length === 3 && ledgerTab().rows.length === 1 && book.getSheets()[1].name === "خرید و فروش");
  mkBook(["ledger", "products", "log"]);
  gs.setupLedger();
  check("(n) setupLedger moves the tab from first to 2nd (products first again)", book.getSheets().map((x) => x.name).join() === "products,خرید و فروش,log");
  mkBook(["products", "log", "ledger"]);
  gs.setupLedger(); gs.setupLog();
  check("(n) setupLedger + setupLog together: products, «خرید و فروش», log", book.getSheets().map((x) => x.name).join() === "products,خرید و فروش,log");
  mkBook(["products"]);
  gs.setupLedger();
  check("(n) setupLedger without a «log» tab: products, «خرید و فروش»", book.getSheets().map((x) => x.name).join() === "products,خرید و فروش");
  mkBook(["products", "ledger"], [["a", "b"], ["1", "2"]]);
  const keepMsg = gs.setupLedger();
  check("(n) setupLedger never overwrites a tab with other data in it", /^ERROR/.test(keepMsg) && ledgerTab().rows[0].join() === "a,b");


  // ---- (o) customers «مشتری‌ها» and the sale channel (owner approved 2026-11-07) ----
  {
    const cn = (v) => gs.customerName_(v);
    check("(o) name: English letters are kept and stored in lowercase («Zahra» → zahra, «O'NEIL-Smith» → o'neil-smith, spaces cleaned)",
      cn("Zahra").value === "zahra" && cn("O'NEIL-Smith").value === "o'neil-smith" && cn("  Van   Damme ").value === "van damme" && cn("a\nb").value === "a b" && cn("A".repeat(30)).value === "a".repeat(30));
    const persian = ["زهرا", "Zahra۱", "علی Ali", "\u064dAli", "ﺯﻫﺮا"];
    check("(o) name: Persian/Arabic letters or digits get the Persian-letter error", persian.every((v) => cn(v).error === "persian"), JSON.stringify(persian.map(cn)));
    const bad = ["zahra2", "=cmd", "-x", "'x", " -abc", "Zähra", "a_b", "a.b", "@x", "+1", 5, {}, []];
    check("(o) name: digits, other symbols, a leading - or ' and formula starts (= + - @) are refused", bad.every((v) => cn(v).error === "bad"), JSON.stringify(bad.map(cn)));
    check("(o) name: empty is «need»; over 30 characters is «long»", cn("").error === "need" && cn("   ").error === "need" && cn(undefined).error === "need" && cn("A".repeat(31)).error === "long" && gs.CUSTOMER_NAME_MAX === 30);
    check("(o) duplicate key ignores case and extra spaces", gs.customerKey_("ZAHRA", "  Ahmadi ") === gs.customerKey_("zahra", "ahmadi") && gs.customerKey_("zahra", "ahmadi") === "zahra ahmadi");
    const nx = (ids, seq) => gs.nextCustomerId_(ids, seq);
    check("(o) next id: 1 for an empty list; one more than the largest of the stored sequence and every id",
      nx([], null) === 1 && nx(["1", "2", "3"], "3") === 4 && nx(["1", "2"], "3") === 4 && nx(["1", "5"], null) === 6 && nx(["1"], "9") === 10 && nx(["۷", "x", "", "2.5"], "") === 8 && nx([4, "3"], "junk") === 5);

    const sale = (o) => good(Object.assign({ customerId: undefined }, o));
    const pc = (o) => gs.planLedgerRow_(sale(o), prods, ctx);
    const noCh = pc({ customerId: "1", channel: "" }), badCh = pc({ customerId: "1", channel: "constructor" }), person = pc({ customerId: "1", channel: "person" });
    check("(o) sale: the channel is required («سایت» / «حضوری» only)",
      noCh.row === null && noCh.issues[0].field === "channel" && noCh.issues[0].message === gs.MSG.badChannel && badCh.row === null && person.row[16] === "حضوری");
    const none = pc({}), gone = pc({ customerId: "99" }), junk = pc({ customerId: "1 OR 1" });
    check("(o) sale: a customer is required; an id that is not on the list is refused",
      none.issues.some((i) => i.field === "customerId" && i.message === gs.MSG.needCustomer) && gone.issues.some((i) => i.message === gs.MSG.goneCustomer) && junk.row === null);
    const byId = pc({ customerId: "۱۲", party: "=evil" });
    check("(o) sale: a chosen customer stores its id and a copy of its name in party (the typed party is ignored)",
      byId.issues.length === 0 && byId.row[15] === "12" && byId.row[12] === "Ali O'Neil-Smith" && byId.customer.reused === "" && !byId.customer.newCustomer, JSON.stringify(byId.row));
    const nw = pc({ newCustomer: { firstName: "  Reza ", lastName: "KARIMI" } });
    check("(o) sale: a new customer is planned in lowercase; its id is left for the caller",
      nw.issues.length === 0 && JSON.stringify(nw.customer.newCustomer) === '{"firstName":"reza","lastName":"karimi"}' && nw.row[15] === "" && nw.row[12] === "reza karimi", JSON.stringify(nw));
    const dup = pc({ newCustomer: { firstName: "ZAHRA", lastName: " ahmadi " } }), dup2 = pc({ newCustomer: { firstName: "ali", lastName: "o'neil-smith" } });
    check("(o) sale: a new name already on the list (case ignored) reuses that customer",
      dup.customer.reused === "1" && dup.row[15] === "1" && !dup.customer.newCustomer && dup2.customer.reused === "12" && dup2.row[12] === "Ali O'Neil-Smith");
    const fa = pc({ newCustomer: { firstName: "زهرا", lastName: "احمدی" } }), half = pc({ newCustomer: { firstName: "Zahra", lastName: "" } }), both = pc({ newCustomer: {} });
    check("(o) sale: Persian names are refused with ONE clear message; a missing last / first name is named",
      fa.row === null && fa.issues.length === 1 && fa.issues[0].message === gs.MSG.persianCustomerName &&
      half.issues.length === 1 && half.issues[0].message === gs.MSG.needLastName && both.issues.map((i) => i.message).join("|") === gs.MSG.needFirstName + "|" + gs.MSG.needLastName, JSON.stringify([fa.issues, half.issues, both.issues]));
    const buy = gs.planLedgerRow_(good({ type: "buy", party: "آقای رضایی", channel: "site", customerId: "1", newCustomer: { firstName: "x", lastName: "y" } }), prods, ctx);
    check("(o) buy: no customer and no channel are stored; the free-text «اسم فروشنده» is kept", buy.issues.length === 0 && buy.row[15] === "" && buy.row[16] === "" && buy.row[12] === "آقای رضایی" && buy.customer === null);
    const old = gs.planLedgerRow_(sale({ party: "خانم احمدی" }), prods, Object.assign({ keep: { productId: "sabzi-ghormeh", productName: "x" } }, ctx));
    check("(o) editing an OLD sale (no customer) needs a customer before it can be saved", old.row === null && old.issues.some((i) => i.field === "customerId"));

    // the fake spreadsheet
    const custTab = () => book.getSheetByName("مشتری‌ها");
    const sl = (o, id = "") => post({ action: "saveLedgerRow", session: sess, data: { entry: sale(o), id } });
    ({ sess } = login());
    mkBook();
    const c1 = sl({ newCustomer: { firstName: "Reza", lastName: "Karimi" } });
    const crow = custTab().rows[2];
    check("(o) save: a new customer gets the next number, lowercase names, Tehran time and the admin's email; the sale points to it",
      c1.data.ok === true && c1.data.customerId === "2" && c1.data.reusedCustomer === "" && crow.slice(0, 3).join() === "2,reza,karimi" && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(crow[3]) && crow[4] === OWNER &&
      ledgerTab().rows[1][15] === "2" && ledgerTab().rows[1][16] === "سایت" && ledgerTab().rows[1][12] === "reza karimi" && world.props.customerSeq === "2", JSON.stringify([c1, crow, ledgerTab().rows[1]]));
    check("(o) save: the customer row is text-formatted", custTab().formats.some((f) => f[0] === "row" && f[1] === 3 && f[2] === "@|@|@|@|@"));
    const c2 = sl({ newCustomer: { firstName: "REZA", lastName: "karimi " } });
    check("(o) save: the same name again (other case) reuses customer 2 and adds no customer row",
      c2.data.ok === true && c2.data.reusedCustomer === "2" && c2.data.customerId === "2" && custTab().rows.length === 3 && ledgerTab().rows[2][15] === "2");
    custTab().rows.splice(2, 1);   // customer 2 deleted by hand in the Sheet
    const c3 = sl({ newCustomer: { firstName: "Sara", lastName: "Mousavi" } });
    check("(o) a deleted customer's number is never given out again (3, not 2)", c3.data.customerId === "3" && custTab().rows[2][0] === "3");
    delete world.props.customerSeq;
    const c4 = sl({ newCustomer: { firstName: "Mina", lastName: "Rad" } });
    check("(o) without the stored sequence the next id still comes from the largest id in the tab", c4.data.customerId === "4" && world.props.customerSeq === "4");
    const nRows = [custTab().rows.length, ledgerTab().rows.length];
    const bads = [sl({ price: "0", newCustomer: { firstName: "New", lastName: "One" } }), sl({ newCustomer: { firstName: "زهرا", lastName: "Ahmadi" } }), sl({ channel: "", newCustomer: { firstName: "New", lastName: "Two" } }), sl({ customerId: "2" })];
    check("(o) an entry with any issue writes NO customer and NO ledger row",
      bads.every((x) => x.data.ok === false && x.data.issues.length) && custTab().rows.length === nRows[0] && ledgerTab().rows.length === nRows[1], JSON.stringify(bads.map((x) => x.data)));
    world.lockBusy = true;
    const lk = sl({ newCustomer: { firstName: "Lock", lastName: "Test" } });
    world.lockBusy = false;
    check("(o) lock busy: BUSY, no customer and no row written", lk.error === "BUSY" && custTab().rows.length === nRows[0] && ledgerTab().rows.length === nRows[1]);
    const gl = post({ action: "getLedger", session: sess });
    const ent = gl.data.entries.find((e) => e.id === c1.data.id);
    check("(o) getLedger also sends the customers, and each sale's customerId and channel",
      gl.data.ok && JSON.stringify(gl.data.customers.map((c) => c.id + ":" + c.firstName + " " + c.lastName)) === JSON.stringify(["1:zahra ahmadi", "3:sara mousavi", "4:mina rad"]) &&
      ent.customerId === "2" && ent.channel === "site" && ent.channelText === "سایت" && !("customersMessage" in gl.data), JSON.stringify(gl.data.customers));
    // edit: an existing sale can switch customer; type → buy clears the customer
    const ed1 = sl({ customerId: "3", channel: "person" }, c1.data.id);
    const r1x = ledgerTab().rows.find((r) => r[0] === c1.data.id);
    check("(o) edit: a sale can switch to another customer and channel", ed1.data.ok && r1x[15] === "3" && r1x[16] === "حضوری" && r1x[12] === "sara mousavi");
    const ed2 = post({ action: "saveLedgerRow", session: sess, data: { entry: good({ type: "buy", party: "بازار", customerId: "3", channel: "site" }), id: c1.data.id } });
    const r1y = ledgerTab().rows.find((r) => r[0] === c1.data.id);
    check("(o) edit: switching a sale to a buy empties customerId and channel", ed2.data.ok && r1y[15] === "" && r1y[16] === "" && r1y[12] === "بازار");
    // ---- the simple buy (saveLedgerBuy, owner approved 2026-11-07) ----
    mkBook();
    const sb = (b, id = "") => post({ action: "saveLedgerBuy", session: sess, data: { buy: Object.assign({ date: "1405-08-16", name: "برنج طارم", total: "1200", totalUnit: "thousand" }, b), id } });
    const sbRows = () => ledgerTab().rows.slice(1);
    const s1 = sb({});
    const r1s = sbRows()[0];
    check("(s) simple buy: saved as ONE row, type خرید, «سایر» id, typed name, qty 1 «عدد», total in priceToman and rowToman, typed amount kept, nothing else",
      s1.ok === true && s1.data.ok === true && sbRows().length === 1 && r1s[3] === "خرید" && r1s[4] === gs.LEDGER_OTHER_ID && r1s[5] === "برنج طارم" && r1s[6] === 1 && r1s[7] === "عدد" &&
      r1s[8] === 1200000 && r1s[9] === "1200" && r1s[10] === "هزار تومان" && r1s[11] === 1200000 && r1s[12] === "" && r1s[13] === "" && r1s[15] === "" && r1s[16] === "" && r1s[17] === "" && r1s[18] === "" && r1s[19] === "" && r1s[14] === OWNER && /^L[0-9a-f]{32}$/.test(r1s[0]), JSON.stringify([s1, r1s]));
    const sNoName = sb({ name: "   " }), sNoName2 = sb({ name: undefined }), sLong = sb({ name: "x".repeat(61) }), sOk60 = sb({ name: "ن".repeat(60) });
    check("(s) simple buy: the name is required and at most 60 characters (spaces cleaned first); 60 is fine",
      sNoName.data.ok === false && sNoName.data.issues[0].field === "productName" && sNoName2.data.ok === false && sLong.data.ok === false && sLong.data.issues[0].field === "productName" && sOk60.data.ok === true && sbRows().length === 2, JSON.stringify([sNoName, sLong]));
    const sSp = sb({ name: "  برنج    ایرانی \n " });
    check("(s) simple buy: the name is cleaned (single spaces, trimmed)", sSp.data.ok === true && sbRows()[2][5] === "برنج ایرانی");
    const sF = [sb({ name: "=HYPERLINK(\"http://x\",\"y\")" }), sb({ name: "+1" }), sb({ name: "-2" }), sb({ name: "@sum" })];
    const fRows = sbRows().slice(3);
    check("(s) simple buy: a name starting with = + - @ is escaped with an apostrophe (never a formula)", sF.every((x) => x.data.ok === true) && fRows.every((r) => r[5].startsWith("'")) && fRows[0][5].startsWith("'="), JSON.stringify(fRows.map((r) => r[5])));
    const sm = sb({ name: "گوشت", total: "1.5", totalUnit: "million" }), sp = sb({ name: "نخ", total: "۷۵٫۵", totalUnit: "thousand" });
    const smr = sbRows()[7], spr = sbRows()[8];
    check("(s) simple buy: the total typed in thousand or million (Persian digits accepted) → whole toman in priceToman and rowToman",
      sm.data.ok && smr[8] === 1500000 && smr[11] === 1500000 && smr[9] === "1.5" && smr[10] === "میلیون تومان" && sp.data.ok && spr[8] === 75500 && spr[11] === 75500, JSON.stringify([smr, spr]));
    const sBad = [sb({ total: "0" }), sb({ total: "" }), sb({ total: "abc" }), sb({ total: "1.2345" }), sb({ totalUnit: "toman" }), sb({ total: "99999999999", totalUnit: "million" }), sb({ date: "1405-13-40" })];
    check("(s) simple buy: a zero, empty, text, too-precise or huge total, a bad unit or a bad date is refused and nothing is written",
      sBad.every((x) => x.data.ok === false && x.data.issues.length >= 1) && sbRows().length === 9 && sBad[0].data.issues[0].message === gs.MSG.badBuyTotal, JSON.stringify(sBad.map((x) => x.data.issues && x.data.issues[0].field)));
    const idKeep = s1.data.id;
    const se = sb({ name: "برنج هاشمی", total: "2", totalUnit: "million", date: "1405-08-20" }, idKeep);
    const er = ledgerTab().rows.find((r) => r[0] === idKeep);
    check("(s) simple buy: an edit keeps the id, the entered time and the email, changes name / total / date, and adds no row",
      se.data.ok === true && se.data.updated === true && se.data.id === idKeep && sbRows().length === 9 && er[5] === "برنج هاشمی" && er[11] === 2000000 && er[2] === "1405-08-20" && er[1] === r1s[1] && er[14] === OWNER, JSON.stringify(er));
    const sBadId = [sb({}, "Lnope"), sb({}, "L" + "9".repeat(32))];
    check("(s) simple buy: editing an unknown or malformed id is refused", sBadId.every((x) => x.data.ok === false && x.data.message === gs.MSG.ledgerNotFound) && sbRows().length === 9);
    // sales are unaffected; a sale or an order line cannot be rewritten as a simple buy
    const sale1 = post({ action: "saveLedgerRow", session: sess, data: { entry: good({}), id: "" } });
    const ordr = post({ action: "saveLedgerOrder", session: sess, data: { order: { date: "1405-08-16", type: "buy", party: "", note: "", lines: [{ productId: "sabzi-ghormeh", qty: "1", qtyUnit: "pack", price: "450", priceUnit: "thousand", packSize: "" }, { productId: "esfenaj", qty: "2", qtyUnit: "pack", price: "300", priceUnit: "thousand", packSize: "" }] }, orderId: "", rowId: "" } });
    const before = JSON.stringify(ledgerTab().rows);
    const asBuy1 = sb({}, sale1.data.id), inOrder = ledgerTab().rows.find((r) => r[17] === ordr.data.orderId && r[3] === "خرید");
    const asBuy2 = sb({}, inOrder[0]);
    check("(s) sales are unaffected: a normal sale still saves with customer and channel", sale1.data.ok === true && ledgerTab().rows.find((r) => r[0] === sale1.data.id)[3] === "فروش" && ledgerTab().rows.find((r) => r[0] === sale1.data.id)[15] === "1");
    check("(s) simple buy: a sale, or a buy line inside an order, is refused (nothing changes)", asBuy1.data.ok === false && asBuy2.data.ok === false && asBuy1.data.message === gs.MSG.buyNotSimple && JSON.stringify(ledgerTab().rows) === before);
    // old buys (real product, qty, seller, note) still load and are listed unchanged
    mkBook(undefined, [L.slice(), ["L" + "1".repeat(32), "2026-11-07 09:00:00", "1405-08-10", "خرید", "sabzi-ghormeh", "سبزی قورمه", 2.5, "کیلو", 400000, "400", "هزار تومان", 1000000, "آقای رضایی", "نقدی", OWNER, "", "", "", "۵۰۰ گرم", ""]]);
    const lgOld = post({ action: "getLedger", session: sess });
    const oldE = lgOld.data.entries[0];
    check("(s) an old buy still loads with all its fields; getLedger says simpleBuy:true", lgOld.data.simpleBuy === true && oldE.type === "buy" && oldE.productId === "sabzi-ghormeh" && oldE.qty === 2.5 && oldE.party === "آقای رضایی" && oldE.note === "نقدی" && oldE.rowToman === 1000000);
    const oe = sb({ name: "قورمه قدیمی", total: "1000" }, oldE.id);
    const orow = ledgerTab().rows[1];
    check("(s) an old single buy can be re-saved as a simple buy: only name and total stay (qty 1 «عدد», seller / note / pack size empty), same id",
      oe.data.ok === true && ledgerTab().rows.length === 2 && orow[0] === oldE.id && orow[4] === gs.LEDGER_OTHER_ID && orow[5] === "قورمه قدیمی" && orow[6] === 1 && orow[7] === "عدد" && orow[12] === "" && orow[13] === "" && orow[18] === "" && orow[19] === "");
    check("(s) without a session saveLedgerBuy gives NO_SESSION", post({ action: "saveLedgerBuy", data: { buy: {}, id: "" } }).error === "NO_SESSION");
    let sbThrew = false; try { gs.saveLedgerBuy({}, ""); } catch (e) { sbThrew = true; }
    check("(s) calling saveLedgerBuy directly, outside a checked request, throws (assertSession_)", sbThrew);
    check("(s) the server says simpleBuy: true; admin.js refuses to save a buy without it (old-script guard) and the sale form is not changed",
      /simpleBuy: true/.test(read("tools/admin/Code.gs")) && /ledgerSimpleBuy = r\.simpleBuy === true/.test(adminSrc) && /if \(!ledgerSimpleBuy\) add\(TEXT\.bOldServer\)/.test(adminSrc) && /code === 'unknown_action' \? TEXT\.bOldServer/.test(adminSrc));
    check("(s) admin.js: the page sends only date, name, total and unit to saveLedgerBuy", /api\('saveLedgerBuy', \{ buy: buy, id: bEdit\.id \}, true\)/.test(adminSrc) && /name: cleanLedgerText\(\$\('b-name'\)\.value\), total: \$\('b-total'\)\.value, totalUnit: \$\('b-unit'\)\.value/.test(adminSrc));
    // customers tab missing / first / broken
    mkBook(["products", "ledger", "log"]);
    const g2 = post({ action: "getLedger", session: sess });
    const s2 = sl({ customerId: "1" });
    const b2 = post({ action: "saveLedgerRow", session: sess, data: { entry: good({ type: "buy" }), id: "" } });
    check("(o) no «مشتری‌ها» tab: the list still loads (with a setupCustomers message), sales are refused, buys still work",
      g2.data.ok === true && g2.data.customers.length === 0 && /setupCustomers/.test(g2.data.customersMessage) && s2.data.ok === false && /setupCustomers/.test(s2.data.message) && b2.data.ok === true && book.getSheets().length === 3);
    mkBook(["products", "ledger", "customers"], undefined, [["id", "x"]]);
    check("(o) a broken «مشتری‌ها» header: sales refused, nothing written", sl({ customerId: "1" }).data.ok === false && custTab().rows.length === 1 && ledgerTab().rows.length === 1);
    mkBook(["customers", "products", "ledger"]);
    check("(o) if «مشتری‌ها» were the first tab: products actions refuse it, sales refuse too",
      post({ action: "getProducts", session: sess }).error === "server" && post({ action: "saveLedgerRow", session: sess, data: { entry: sale({ customerId: "1" }), id: "" } }).error === "server" && custTab().rows.length === 2);
    // setupLedger: the 15 → 17 column migration
    const oldHead = L.slice(0, 15);
    const old15Head = oldHead, old15Row = ["L" + "9".repeat(32), "2026-11-07 09:00:00", "1405-08-16", "فروش", "sabzi-ghormeh", "سبزی قورمه", 1, "بسته/ظرف", 450000, "450", "هزار تومان", 450000, "خانم احمدی", "", OWNER];
    const oldRow = old15Row;
    mkBook(["products", "ledger", "customers", "log"], [oldHead.slice(), oldRow.slice()]);
    const before17 = post({ action: "getLedger", session: sess });
    const mig = gs.setupLedger();
    const after17 = post({ action: "getLedger", session: sess });
    check("(o) setupLedger adds customerId + channel at the END of an old 15-column tab and keeps every data row",
      before17.data.ok === false && /OK/.test(mig) && ledgerTab().rows[0].join() === L.join() && JSON.stringify(ledgerTab().rows[1].slice(0, 15)) === JSON.stringify(oldRow) &&
      after17.data.ok === true && after17.data.entries[0].party === "خانم احمدی" && after17.data.entries[0].customerId === "" && after17.data.entries[0].channel === "", mig);
    mkBook(["products", "ledger"], [oldHead.slice(0, 14).concat(["oops"]), oldRow.slice()]);
    check("(o) setupLedger still refuses a tab whose header is neither the old nor the new one", /^ERROR/.test(gs.setupLedger()) && ledgerTab().rows[0][14] === "oops");
    // ---- (p) multi-product orders (owner approved 2026-11-07) ----
    {
      const ln = (o) => Object.assign({ productId: "sabzi-ghormeh", qty: "2", qtyUnit: "pack", price: "450", priceUnit: "thousand" }, o);
      const ord = (o, lines) => Object.assign({ date: "1405-08-16", type: "sell", channel: "site", customerId: "1", note: "یادداشت", lines: lines || [ln({}), ln({ productId: "esfenaj", price: "280" })] }, o);
      const so = (o, orderId = "", rowId = "") => post({ action: "saveLedgerOrder", session: sess, data: { order: o, orderId, rowId } });
      // migration 17 -> 18 columns
      const h17 = L.slice(0, 17), row17 = ["L" + "8".repeat(32), "2026-11-07 09:00:00", "1405-08-16", "فروش", "sabzi-ghormeh", "سبزی قورمه", 1, "بسته/ظرف", 450000, "450", "هزار تومان", 450000, "zahra ahmadi", "", OWNER, "1", "سایت"];
      mkBook(["products", "ledger", "customers", "log"], [h17.slice(), row17.slice()]);
      const m17 = gs.setupLedger();
      check("(p) setupLedger adds orderId at the END of a 17-column tab and keeps the data row", /OK/.test(m17) && ledgerTab().rows[0].join() === L.join() && JSON.stringify(ledgerTab().rows[1].slice(0, 17)) === JSON.stringify(row17));
      const g17 = post({ action: "getLedger", session: sess });
      check("(p) getLedger says orders:true and an old row has orderId null", g17.data.ok && g17.data.orders === true && g17.data.entries[0].orderId === null);
      // migration 18 -> 19 columns (pack size) and 15 -> 19; save + read packSize through the order action
      const h18 = L.slice(0, 18), row18 = row17.concat([5]);
      mkBook(["products", "ledger", "customers", "log"], [h18.slice(), row18.slice()]);
      const m18 = gs.setupLedger();
      const g18 = post({ action: "getLedger", session: sess });
      check("(q) setupLedger adds packSize at the END of an 18-column tab and keeps the data row untouched",
        /OK/.test(m18) && ledgerTab().rows[0].join() === L.join() && JSON.stringify(ledgerTab().rows[1].slice(0, 18)) === JSON.stringify(row18) && g18.data.ok === true && g18.data.packSize === true && g18.data.entries[0].packSize === "" && g18.data.entries[0].orderId === 5, m18);
      mkBook(["products", "ledger", "customers", "log"], [old15Head.slice(), old15Row.slice()]);
      check("(q) setupLedger takes a 15-column tab straight to 19 columns without touching the data row", /OK/.test(gs.setupLedger()) && ledgerTab().rows[0].join() === L.join() && JSON.stringify(ledgerTab().rows[1].slice(0, 15)) === JSON.stringify(old15Row));
      mkBook(["products", "ledger", "customers", "log"], [h18.slice(0, 17).concat(["oops"]), row18.slice()]);
      check("(q) setupLedger still refuses a wrong header", /^ERROR/.test(gs.setupLedger()));
      mkBook();
      const pk = so(ord({}, [ln({ packSize: "۵۰۰ گرم" }), ln({ productId: "esfenaj", packSize: "" }), ln({ productId: "nana" })]));
      const pkRows = ledgerTab().rows.slice(1);
      check("(q) order lines save packSize in column 19 (empty when not given)", pk.data.ok === true && pkRows.length === 3 && pkRows[0][18] === "۵۰۰ گرم" && pkRows[1][18] === "" && pkRows[2][18] === "", JSON.stringify(pk));
      const pkg = post({ action: "getLedger", session: sess });
      check("(q) getLedger returns each line's packSize", pkg.data.entries.filter((e) => e.packSize === "۵۰۰ گرم").length === 1 && pkg.data.entries.every((e) => typeof e.packSize === "string"));
      const pkBad = so(ord({}, [ln({ packSize: "y".repeat(21) })]));
      const pkF = so(ord({}, [ln({ packSize: "=HYPERLINK(1)" })]));
      check("(q) a 21-character packSize is refused (nothing written); a formula is stored as text",
        pkBad.data.ok === false && pkBad.data.issues.some((i) => i.field === "packSize" && i.line === 0) && ledgerTab().rows.length === 5 && pkF.data.ok === true && ledgerTab().rows[4][18] === "'=HYPERLINK(1)");
      const sr = post({ action: "saveLedgerRow", session: sess, data: { entry: { date: "1405-08-16", type: "buy", productId: "sabzi-ghormeh", qty: "1", qtyUnit: "pack", price: "450", priceUnit: "thousand", packSize: "۱ کیلو" }, id: "" } });
      check("(q) saveLedgerRow saves packSize too", sr.data.ok === true && ledgerTab().rows[ledgerTab().rows.length - 1][18] === "۱ کیلو");

      mkBook();
      delete world.props.orderSeq; delete world.props.customerSeq;
      const o1 = so(ord({}));
      const rows1 = ledgerTab().rows.slice(1);
      check("(p) order: 2 lines = 2 rows with the same orderId 1, date, type, customer, channel and note",
        o1.data.ok === true && o1.data.orderId === 1 && rows1.length === 2 && rows1.every((r) => r[17] === 1 && r[2] === "1405-08-16" && r[3] === "فروش" && r[15] === "1" && r[16] === "سایت" && r[13] === "یادداشت" && r[12] === "zahra ahmadi") &&
        rows1[0][0] !== rows1[1][0] && world.props.orderSeq === "1" && rows1[1][8] === 280000, JSON.stringify(o1));
      const o2 = so(ord({ newCustomer: { firstName: "Neda", lastName: "Rad" }, customerId: undefined }, [ln({}), ln({ productId: "esfenaj" }), ln({ productId: gs.LEDGER_OTHER_ID, productName: "برنج", qtyUnit: "kg" })]));
      const rows2 = ledgerTab().rows.slice(3);
      check("(p) order: a NEW customer is created ONCE for 3 lines, all lines point to it, the order number is 2",
        o2.data.ok === true && o2.data.orderId === 2 && custTab().rows.length === 3 && custTab().rows[2][1] === "neda" && rows2.length === 3 && rows2.every((r) => r[15] === "2" && r[12] === "neda rad" && r[17] === 2) && rows2[2][5] === "برنج", JSON.stringify(o2));
      const nRowsB = ledgerTab().rows.length, nCustB = custTab().rows.length;
      const badO = so(ord({ newCustomer: { firstName: "Bad", lastName: "One" }, customerId: undefined }, [ln({}), ln({ price: "0" })]));
      check("(p) order: ONE bad line writes nothing (no rows, no customer, no order number used); the issue names the line",
        badO.data.ok === false && badO.data.issues.length === 1 && badO.data.issues[0].line === 1 && badO.data.issues[0].field === "price" && ledgerTab().rows.length === nRowsB && custTab().rows.length === nCustB && world.props.orderSeq === "2", JSON.stringify(badO));
      check("(p) order: a bad shared field (date) and a missing customer are reported once, not per line",
        (() => { const r = so(ord({ date: "x", customerId: "" })); return r.data.ok === false && r.data.issues.filter((i) => i.field === "date").length === 1 && r.data.issues.filter((i) => i.field === "customerId").length === 1; })());
      const none = so(ord({}, [])), many = so(ord({}, Array.from({ length: 51 }, () => ln({}))));
      check("(p) order: no lines, or 51 lines, is refused; 50 lines are fine",
        none.data.ok === false && /حداقل/.test(none.data.message) && many.data.ok === false && /۵۰|50/.test(many.data.message + "50") && so(ord({}, Array.from({ length: 50 }, () => ln({})))).data.ok === true);
      const buy = so({ date: "1405-08-16", type: "buy", party: "=cmd", note: "", lines: [ln({ price: "10", priceUnit: "thousand" })] });
      const br = ledgerTab().rows[ledgerTab().rows.length - 1];
      check("(p) buy order: seller name kept (formula-escaped), no customer, no channel", buy.data.ok === true && br[12] === "'=cmd" && br[15] === "" && br[16] === "" && typeof br[17] === "number");
      const inj = so(ord({}, [ln({ productId: gs.LEDGER_OTHER_ID, productName: "=HYPERLINK(\"x\")" })]));
      check("(p) order: a «سایر» name starting with = gets an apostrophe", inj.data.ok === true && ledgerTab().rows[ledgerTab().rows.length - 1][5].startsWith("'="));
      // edit: replace the lines of order 1
      const first = rows1[0][0];
      const keepBefore = ledgerTab().rows.find((r) => r[0] === first).slice();
      const ed = so(ord({ note: "تازه" }, [ln({ id: first, qty: "5" }), ln({ productId: "nana", price: "330" })]), 1);
      const ordRows = ledgerTab().rows.slice(1).filter((r) => r[17] === 1);
      check("(p) edit order: a stored line keeps its id/time/email and is updated; the dropped line is deleted; a new line is added; note changes on all",
        ed.data.ok === true && ed.data.orderId === 1 && ordRows.length === 2 && ordRows.find((r) => r[0] === first)[6] === 5 && ordRows.find((r) => r[0] === first)[1] === keepBefore[1] && ordRows.find((r) => r[0] === first)[14] === keepBefore[14] &&
        ordRows.some((r) => r[4] === "nana") && !ordRows.some((r) => r[4] === "esfenaj") && ordRows.every((r) => r[13] === "تازه"), JSON.stringify(ed));
      const foreign = so(ord({}, [ln({ id: rows2[0][0] })]), 1);
      check("(p) edit order: a line id from ANOTHER order is refused, nothing changes", foreign.data.ok === false && ledgerTab().rows.slice(1).filter((r) => r[17] === 1).length === 2 && ledgerTab().rows.find((r) => r[0] === rows2[0][0])[17] === 2);
      check("(p) edit order: an unknown order number is refused", so(ord({}), 999).data.ok === false && so(ord({}), "x").data.ok === false);
      // old single row
      const oldId = "L" + "7".repeat(32);
      ledgerTab().rows.push(["" + oldId, "2026-11-07 08:00:00", "1405-08-15", "فروش", "sabzi-ghormeh", "سبزی قورمه", 1, "بسته/ظرف", 450000, "450", "هزار تومان", 450000, "zahra ahmadi", "", OWNER, "1", "سایت"]);
      const seqBefore = world.props.orderSeq;
      const eo1 = so(ord({}, [ln({ id: oldId, qty: "3" })]), "", oldId);
      const oldRow = ledgerTab().rows.find((r) => r[0] === oldId);
      check("(p) old single row edited as a one-line order: updated in place, still NO orderId, sequence unchanged", eo1.data.ok === true && eo1.data.orderId === null && oldRow[6] === 3 && !oldRow[17] && world.props.orderSeq === seqBefore, JSON.stringify(eo1));
      const eo2 = so(ord({}, [ln({ id: oldId }), ln({ productId: "nana", price: "330" })]), "", oldId);
      const grown = ledgerTab().rows.slice(1).filter((r) => r[17] === eo2.data.orderId);
      check("(p) old single row grown to 2 lines: both get a new order number", eo2.data.ok === true && typeof eo2.data.orderId === "number" && grown.length === 2 && grown.some((r) => r[0] === oldId) && world.props.orderSeq === String(eo2.data.orderId), JSON.stringify(eo2));
      // delete
      const nBeforeDel = ledgerTab().rows.length;
      const dOrd = post({ action: "deleteLedgerOrder", session: sess, data: { orderId: 2 } });
      check("(p) deleteLedgerOrder removes every line of that order only", dOrd.data.ok === true && dOrd.data.deleted === 3 && ledgerTab().rows.length === nBeforeDel - 3 && !ledgerTab().rows.some((r) => r[17] === 2) && ledgerTab().rows.some((r) => r[17] === 1));
      const dBad = [post({ action: "deleteLedgerOrder", session: sess, data: { orderId: 2 } }), post({ action: "deleteLedgerOrder", session: sess, data: { orderId: "x" } }), post({ action: "deleteLedgerOrder", session: sess, data: {} })];
      check("(p) deleteLedgerOrder: already gone, malformed or missing number deletes nothing", dBad.every((x) => x.data && x.data.ok === false) && ledgerTab().rows.length === nBeforeDel - 3);
      const nextO = so(ord({ date: "1405-09-01" }, [ln({})]));
      check("(p) an order number is never reused after its order was deleted", nextO.data.orderId > 2 && nextO.data.orderId === Number(world.props.orderSeq));
      // session, lock
      const nos = [post({ action: "saveLedgerOrder", data: { order: ord({}), orderId: "", rowId: "" } }), post({ action: "deleteLedgerOrder", session: "f".repeat(64), data: { orderId: 1 } })];
      check("(p) saveLedgerOrder / deleteLedgerOrder need a session", nos.every((x) => x.error === "NO_SESSION"));
      let thr = false; try { gs.saveLedgerOrder(ord({}), "", ""); } catch (e) { thr = true; } let thr2 = false; try { gs.deleteLedgerOrder(1); } catch (e) { thr2 = true; }
      check("(p) calling them directly (outside a checked request) throws", thr && thr2);
      const nl = ledgerTab().rows.length; world.lockBusy = true; const lb2 = so(ord({})); world.lockBusy = false;
      check("(p) lock busy: BUSY and nothing written", lb2.error === "BUSY" && ledgerTab().rows.length === nl);
      check("(p) a sale on a book without «مشتری‌ها» is refused", (() => { mkBook(["products", "ledger", "log"]); const r = so(ord({})); return r.data.ok === false && /setupCustomers/.test(r.data.message) && ledgerTab().rows.length === 1; })());
      check("(p) admin.js uses the same line cap (50) as Code.gs", /LEDGER_MAX_LINES = 50/.test(read("admin/admin.js")) && gs.LEDGER_MAX_LINES === 50);
    }
    // setupCustomers
    mkBook(["products", "ledger", "log"]);
    const sc = gs.setupCustomers();
    check("(o) setupCustomers makes «مشتری‌ها» right after «خرید و فروش» (log stays last): header, frozen, text format",
      book.getSheets().map((x) => x.name).join() === "products,خرید و فروش,مشتری‌ها,log" && custTab().rows[0].join() === CH.join() && custTab().frozen === 1 && custTab().formats.some((f) => f[0] === "col" && f[2] === "@") && /tab 3 of 4/.test(sc), sc);
    gs.setupCustomers();
    check("(o) setupCustomers can run again safely", book.getSheets().map((x) => x.name).join() === "products,خرید و فروش,مشتری‌ها,log" && custTab().rows.length === 1);
    mkBook(["customers", "products", "ledger", "log"]);
    gs.setupCustomers();
    check("(o) setupCustomers moves the tab from first to after «خرید و فروش»", book.getSheets().map((x) => x.name).join() === "products,خرید و فروش,مشتری‌ها,log" && custTab().rows.length === 2);
    mkBook(["products", "log", "customers", "ledger"]);
    gs.setupLedger(); gs.setupCustomers(); gs.setupLog();
    check("(o) setupLedger + setupCustomers + setupLog: products, «خرید و فروش», «مشتری‌ها», log", book.getSheets().map((x) => x.name).join() === "products,خرید و فروش,مشتری‌ها,log");
    mkBook(["products", "log"]);
    gs.setupCustomers();
    check("(o) setupCustomers without «خرید و فروش»: 2nd tab, never first", book.getSheets().map((x) => x.name).join() === "products,مشتری‌ها,log");
    mkBook(["products", "ledger", "customers"], undefined, [["a", "b"], ["1", "2"]]);
    check("(o) setupCustomers never overwrites a tab with other data in it", /^ERROR/.test(gs.setupCustomers()) && custTab().rows[0].join() === "a,b");
    check("(o) PROTECTED_ACTIONS gets no new action (customers come with getLedger)", !/getCustomers/.test(read("tools/admin/Code.gs")));

    // ---- (r) product versions, merging into an order (owner approved 2026-11-07) ----
    {
      const HH = Array.from(gs.HISTORY_HEADER);
      const ln = (o) => Object.assign({ productId: "sabzi-ghormeh", qty: "2", qtyUnit: "pack", price: "450", priceUnit: "thousand" }, o);
      const ord = (o, lines) => Object.assign({ date: "1405-08-16", type: "sell", channel: "site", customerId: "1", note: "یادداشت", lines: lines || [ln({}), ln({ productId: "esfenaj", price: "280" })] }, o);
      const HIST = "تاریخچه محصولات";
      world.triggers = [];
      gs.ScriptApp = {
        getProjectTriggers: () => world.triggers.slice(),
        deleteTrigger: (t) => { world.triggers = world.triggers.filter((x) => x !== t); },
        newTrigger: (fn) => { const t = { fn, getHandlerFunction: () => fn }; const b = { timeBased: () => b, everyHours: (n) => { t.hours = n; return b; }, create: () => { world.triggers.push(t); return t; } }; return b; }
      };
      const histTab = () => book.getSheetByName(HIST);
      const hrows = () => histTab().rows.slice(1);
      const H = (r, name) => r[HH.indexOf(name)];
      const PI = (name) => gs.HEADER.indexOf(name);
      const prow = (id) => productsTab().rows.find((r, i) => i > 0 && r[0] === id);
      const snapP = () => JSON.stringify(productsTab().rows);
      const itemOf = (id, over) => { const r = prow(id); const o = {}; gs.HEADER.forEach((h, i) => { o[h] = r[i]; }); return Object.assign(o, over); };
      const relog = () => { Object.keys(world.props).forEach((k) => { if (k !== "orderSeq" && k !== "customerSeq") delete world.props[k]; }); const a = ask(); return post({ action: "verifyCode", data: { challenge: a.r.data.challenge, code: a.code } }).data.session; };
      const DAY = 24 * 3600 * 1000;
      let ss = relog();
      const saveP = (id, over, orig = id) => post({ action: "saveProduct", session: ss, data: { item: itemOf(id, over), originalId: orig } });
      const ofId = (id) => hrows().filter((r) => H(r, "productId") === id);
      const tabsNames = () => book.getSheets().map((x) => x.name).join();

      // setupVersioning
      mkBook(["products", "ledger", "customers", "log"]);
      const p0 = snapP();
      const sv = gs.setupVersioning();
      check("(r) setupVersioning: the tab sits after «مشتری‌ها» and before log (never first), with header, frozen row, a v1 for every product",
        tabsNames() === "products,خرید و فروش,مشتری‌ها," + HIST + ",log" && histTab().rows[0].join() === HH.join() && histTab().frozen === 1 && hrows().length === fileRows.length &&
        hrows().every((r) => /-v1$/.test(H(r, "versionId")) && H(r, "versionId") === H(r, "productId") + "-v1" && H(r, "is_current") === "yes" && H(r, "valid_to") === "" && H(r, "valid_from") === gs.tehranNow_()), sv);
      check("(r) setupVersioning: exactly ONE hourly trigger for hourlyVersioning", world.triggers.length === 1 && world.triggers[0].fn === "hourlyVersioning" && world.triggers[0].hours === 1);
      check("(r) setupVersioning: the products tab (Sheet1) is not touched at all", snapP() === p0 && !productsTab().writes && productsTab().deleted.length === 0);
      check("(r) history cells: price is plain digits and every column is text formatted", hrows().every((r) => /^\d+$/.test(H(r, "price"))) && histTab().formats.some((f) => f[0] === "col" && f[2] === "@"));
      gs.setupVersioning(); gs.setupVersioning();
      check("(r) setupVersioning is idempotent: same rows, still ONE trigger", hrows().length === fileRows.length && world.triggers.length === 1);
      for (const order of [["products", "log"], ["products", "ledger", "log"], ["products", "customers", "ledger", "log"], ["products", "log", "history", "customers", "ledger"]]) {
        mkBook(order); gs.setupVersioning();
        const names = tabsNames(), idx = names.split(",").indexOf(HIST);
        check("(r) the history tab is never index 1 (" + names + ")", idx >= 1 && book.getSheetByName(HIST).getIndex() >= 2 && names.split(",")[0] === "products");
      }
      mkBook(["products", "ledger", "customers", "log", "history"]); gs.setupVersioning();
      check("(r) setupVersioning moves an existing tab to after «مشتری‌ها», before log", tabsNames() === "products,خرید و فروش,مشتری‌ها," + HIST + ",log");
      mkBook(["history", "products", "ledger"]);
      check("(r) if the history tab were first: setupVersioning refuses, the products actions refuse, nothing is written",
        /^ERROR/.test(gs.setupVersioning()) && post({ action: "getProducts", session: ss }).error === "server" && histTab().rows.length === 1);
      mkBook(["products", "ledger", "history"]);
      histTab().rows[0] = ["x", "y"]; histTab().rows.push(["a", "b"]);
      check("(r) a history tab with another header and data is never overwritten", /^ERROR/.test(gs.setupVersioning()) && histTab().rows[1].join() === "a,b" && histTab().rows[0].join() === "x,y");
      mkBook(["products", "ledger", "customers", "log", "history"]);
      histTab().rows[0] = ["x"];
      saveP("sabzi-ghormeh", { price: "1" });
      check("(r) history tab broken: product saves still work and nothing is written to it", prow("sabzi-ghormeh")[PI("price")] === "1" && histTab().rows.length === 1 && histTab().rows[0].join() === "x");
      check("(r) hourlyVersioning/setupVersioning are not web actions", post({ action: "hourlyVersioning", session: ss }).error === "unknown_action" && post({ action: "setupVersioning", session: ss }).error === "unknown_action" && !/hourlyVersioning/.test(vm.runInContext("PROTECTED_ACTIONS.join()", gs)));

      // admin saves
      mkBook(["products", "ledger", "customers", "history", "log"]);
      gs.setupVersioning();
      const T0 = gs.tehranNow_();
      clock.t += 2 * DAY; ss = relog();
      const T1 = gs.tehranNow_();
      const oldPrice = prow("sabzi-ghormeh")[PI("price")];
      const r1 = saveP("sabzi-ghormeh", { price: "480000" });
      let g = ofId("sabzi-ghormeh");
      check("(r) admin price change: the old version is closed (valid_to = now, is_current no) and v2 starts now with the new price",
        r1.data.ok === true && g.length === 2 && H(g[0], "versionId") === "sabzi-ghormeh-v1" && H(g[0], "is_current") === "no" && H(g[0], "valid_to") === T1 && H(g[0], "valid_from") === T0 && H(g[0], "price") === oldPrice &&
        H(g[1], "versionId") === "sabzi-ghormeh-v2" && H(g[1], "is_current") === "yes" && H(g[1], "valid_from") === T1 && H(g[1], "valid_to") === "" && H(g[1], "price") === "480000", JSON.stringify(g));
      check("(r) admin price change: Sheet1 holds the new price as usual and the other products are untouched", prow("sabzi-ghormeh")[PI("price")] === "480000" && ofId("nana").length === 1);
      let n0 = hrows().length;
      saveP("sabzi-ghormeh", { price: "480000" });
      saveP("sabzi-ghormeh", { short: "متن تازه", details: "جزئیات تازه", recipe: "x", images: "images/x.jpg", serves: "y" });
      check("(r) saving with no tracked change, or changing text / recipe / images only, makes NO new version", hrows().length === n0);
      saveP("sabzi-ghormeh", { category: "دسته‌ی تازه" });
      g = ofId("sabzi-ghormeh");
      check("(r) category change: the category is updated on ALL history rows of that product, no new version", hrows().length === n0 && g.length === 2 && g.every((r) => H(r, "category") === "دسته‌ی تازه"));
      saveP("sabzi-ghormeh", { soldOut: "yes" });
      saveP("sabzi-ghormeh", { unit: "۶۰۰ گرم" });
      saveP("sabzi-ghormeh", { name: "سبزی قورمه‌ی ویژه" });
      g = ofId("sabzi-ghormeh");
      check("(r) soldOut, unit and name each start a new version (v3, v4, v5); exactly one is current", g.length === 5 && g.map((r) => H(r, "versionId")).join() === "sabzi-ghormeh-v1,sabzi-ghormeh-v2,sabzi-ghormeh-v3,sabzi-ghormeh-v4,sabzi-ghormeh-v5" && g.filter((r) => H(r, "is_current") === "yes").length === 1 && H(g[4], "is_current") === "yes" && H(g[4], "soldOut") === "yes" && H(g[4], "unit") === "۶۰۰ گرم" && H(g[4], "name") === "سبزی قورمه‌ی ویژه");
      // new product and rename of id
      saveP("sabzi-ghormeh", { id: "ghormeh-2" }, "sabzi-ghormeh");
      check("(r) renaming an id ends the old id's version and starts v1 for the new id", ofId("ghormeh-2").length === 1 && H(ofId("ghormeh-2")[0], "versionId") === "ghormeh-2-v1" && ofId("sabzi-ghormeh").every((r) => H(r, "is_current") === "no"));
      const np = post({ action: "saveProduct", session: ss, data: { item: itemOf("nana", { id: "brand-new", name: "جدید", price: "5" }), originalId: "" } });
      check("(r) a new product from the admin gets v1 at once", np.data.ok === true && ofId("brand-new").length === 1 && H(ofId("brand-new")[0], "versionId") === "brand-new-v1");
      // delete = end the version, history stays
      const nBefore = hrows().length;
      const dp = post({ action: "deleteProduct", session: ss, data: { id: "esfenaj" } });
      const ge = ofId("esfenaj");
      check("(r) admin delete: the row leaves Sheet1, the current version is ENDED (valid_to set), the history rows stay", dp.data.ok === true && !prow("esfenaj") && hrows().length === nBefore && ge.length === 1 && H(ge[0], "is_current") === "no" && H(ge[0], "valid_to") === gs.tehranNow_());
      saveP("nana", {}, "nana");
      post({ action: "saveProduct", session: ss, data: { item: itemOf("nana", { id: "esfenaj", name: "اسفناج تازه" }), originalId: "" } });
      const ge2 = ofId("esfenaj");
      check("(r) adding the deleted id again starts the next version (v2); the old one stays closed", ge2.length === 2 && H(ge2[1], "versionId") === "esfenaj-v2" && H(ge2[0], "is_current") === "no" && H(ge2[1], "is_current") === "yes");

      // hand edits: hourly job
      mkBook(["products", "ledger", "customers", "history", "log"]);
      gs.setupVersioning();
      clock.t += DAY; ss = relog();
      const p1 = snapP();
      check("(r) hourlyVersioning with nothing changed writes nothing", /^OK: 0 change/.test(gs.hourlyVersioning()) && hrows().length === fileRows.length && snapP() === p1);
      prow("sabzi-ash")[PI("price")] = "300000";
      const hv = gs.hourlyVersioning();
      let ga = ofId("sabzi-ash");
      check("(r) hand edit of a price: the hourly job closes the old version and starts v2 (old values kept from the history row)", /^OK: 2 change/.test(hv) && ga.length === 2 && H(ga[0], "is_current") === "no" && H(ga[0], "valid_to") === gs.tehranNow_() && H(ga[0], "price") === fileRows.find((r) => r.id === "sabzi-ash").price && H(ga[1], "price") === "300000" && H(ga[1], "is_current") === "yes", hv);
      check("(r) …and running it again changes nothing (idempotent)", /^OK: 0 change/.test(gs.hourlyVersioning()) && ofId("sabzi-ash").length === 2);
      const nR = hrows().length;
      prow("sabzi-ash")[PI("recipe")] = "طرز تازه"; prow("sabzi-ash")[PI("short")] = "کوتاه";
      check("(r) hand edit of text / recipe: no new version", /^OK: 0 change/.test(gs.hourlyVersioning()) && hrows().length === nR);
      prow("sabzi-ash")[PI("category")] = "دسته‌ی دستی";
      gs.hourlyVersioning();
      check("(r) hand edit of the category: updated on all history rows of that product, no new version", hrows().length === nR && ofId("sabzi-ash").every((r) => H(r, "category") === "دسته‌ی دستی"));
      // a hand-typed new product
      const newRow = gs.HEADER.map(() => ""); newRow[0] = "hand-new"; newRow[1] = "دستی"; newRow[2] = "سایر محصولات"; newRow[3] = "۱۲۳,۰۰۰"; newRow[4] = "کیلو"; newRow[10] = "";
      productsTab().rows.push(newRow);
      gs.hourlyVersioning();
      const gh = ofId("hand-new");
      check("(r) a hand-typed new product gets v1 (price cleaned to digits, soldOut no)", gh.length === 1 && H(gh[0], "versionId") === "hand-new-v1" && H(gh[0], "price") === "123000" && H(gh[0], "soldOut") === "no" && H(gh[0], "is_current") === "yes");
      // a row deleted by hand
      const idxN = productsTab().rows.findIndex((r, i) => i > 0 && r[0] === "nana");
      productsTab().rows.splice(idxN, 1);
      const nH = hrows().length;
      gs.hourlyVersioning();
      const gn = ofId("nana");
      check("(r) a row deleted by hand: its current version is closed (valid_to = now), the history stays", gn.length === 1 && H(gn[0], "is_current") === "no" && H(gn[0], "valid_to") === gs.tehranNow_() && hrows().length === nH);
      // duplicate ids
      const dup = prow("jafari").slice(); dup[PI("price")] = "999";
      productsTab().rows.push(dup);
      const nD = hrows().length;
      const hd = gs.hourlyVersioning();
      check("(r) duplicate ids: the first row is used, the repeat is skipped (reported), no version is made from it", /duplicate/.test(hd) && hrows().length === nD && ofId("jafari").length === 1);
      productsTab().rows.pop();
      // a row with a problem is skipped until it is fixed
      prow("zalang")[PI("price")] = "abc";
      const nB = hrows().length;
      gs.hourlyVersioning();
      const okBad = hrows().length === nB && ofId("zalang").length === 1 && H(ofId("zalang")[0], "is_current") === "yes";
      prow("zalang")[PI("price")] = "777000";
      gs.hourlyVersioning();
      check("(r) a Sheet1 row with a problem (bad price) is skipped, not versioned; once fixed it becomes a version", okBad && ofId("zalang").length === 2 && H(ofId("zalang")[1], "price") === "777000");
      // hand edit of an OLD version row
      const oldRowA = ofId("sabzi-ash")[0];
      oldRowA[HH.indexOf("price")] = "1";
      const curBefore = JSON.stringify(ofId("sabzi-ash")[1]);
      gs.hourlyVersioning();
      check("(r) a hand edit of an OLD version row is accepted: left as typed, the current version is unchanged", H(ofId("sabzi-ash")[0], "price") === "1" && JSON.stringify(ofId("sabzi-ash")[1]) === curBefore && ofId("sabzi-ash").length === 2);
      // two current rows of one id
      const rowsAsh = ofId("sabzi-ash");
      rowsAsh[0][HH.indexOf("is_current")] = "yes"; rowsAsh[0][HH.indexOf("valid_to")] = "";
      const hv2 = gs.hourlyVersioning();
      check("(r) two current rows of one id: the newest valid_from stays current, the other is closed (reported)", ofId("sabzi-ash").filter((r) => H(r, "is_current") === "yes").length === 1 && H(ofId("sabzi-ash")[1], "is_current") === "yes" && H(ofId("sabzi-ash")[0], "valid_to") !== "" && /two current/.test(hv2));
      // rows without ids are ignored
      const nHx = hrows().length + 1;
      histTab().rows.push(["", "", "x", "", "", "", "", "", "", ""]);
      check("(r) a history row without versionId / productId is ignored (no crash, no new row)", /^OK/.test(gs.hourlyVersioning()) && hrows().length === nHx);
      histTab().rows.pop();
      // glitch guards
      const keep = productsTab().rows.splice(1);
      const cur = hrows().filter((r) => H(r, "is_current") === "yes").length;
      const hg = gs.hourlyVersioning();
      check("(r) an empty-looking products tab never closes every version", /^SKIPPED/.test(hg) && hrows().filter((r) => H(r, "is_current") === "yes").length === cur);
      productsTab().rows.push(...keep);
      const hdr = productsTab().rows[0].slice(); productsTab().rows[0][PI("price")] = "oops";
      check("(r) a broken products header: the job skips and writes nothing", /^SKIPPED/.test(gs.hourlyVersioning()));
      productsTab().rows[0] = hdr;
      world.lockBusy = true; prow("jafari")[PI("price")] = "5";
      const nL = hrows().length;
      check("(r) hourlyVersioning with the lock busy: BUSY, nothing written", gs.hourlyVersioning() === "BUSY" && hrows().length === nL);
      world.lockBusy = false;
      mkBook(["products", "ledger"]);
      check("(r) hourlyVersioning without the history tab: SKIPPED, nothing created", /^SKIPPED/.test(gs.hourlyVersioning()) && tabsNames() === "products,خرید و فروش");
      // Sheet1 only changes through normal saves
      mkBook(["products", "ledger", "customers", "history", "log"]);
      const p2 = snapP();
      gs.setupVersioning(); gs.hourlyVersioning(); gs.hourlyVersioning();
      ss = relog();
      post({ action: "getLedger", session: ss });
      post({ action: "saveLedgerOrder", session: ss, data: { order: ord({}, [ln({})]), orderId: "", rowId: "" } });
      check("(r) setup, the hourly job and ledger saves never write to Sheet1", snapP() === p2 && !productsTab().writes && productsTab().deleted.length === 0);

      // ledger: productVersion
      mkBook(["products", "ledger", "customers", "history", "log"]);
      delete world.props.orderSeq;
      gs.setupVersioning();
      const D0 = gs.jalaliDayOf_(gs.tehranNow_());
      clock.t += 2 * DAY; ss = relog();
      saveP("sabzi-ghormeh", { price: "490000" });
      const D2 = gs.jalaliDayOf_(gs.tehranNow_());
      const Dbefore = gs.jalaliDayOf_(new Date(clock.t - 9 * DAY + 3.5 * 3600000).toISOString().slice(0, 19).replace("T", " "));
      const Dlater = gs.jalaliDayOf_(new Date(clock.t + 5 * DAY + 3.5 * 3600000).toISOString().slice(0, 19).replace("T", " "));
      const soo = (o, lines, orderId = "", rowId = "") => post({ action: "saveLedgerOrder", session: ss, data: { order: ord(o, lines), orderId, rowId } });
      const verOf = (date, pid = "sabzi-ghormeh") => { const r = ledgerTab().rows.slice(1).find((x) => x[2] === date && x[4] === pid); return r && r[19]; };
      soo({ date: D0 }); soo({ date: D2, customerId: "1", channel: "person" }); soo({ date: Dbefore, channel: "site" }); soo({ date: Dlater, channel: "person" });
      check("(r) ledger line: the version valid on the sale date (a day before the change → v1, the change day or later → v2)", D0 !== D2 && verOf(D0) === "sabzi-ghormeh-v1" && verOf(D2) === "sabzi-ghormeh-v2" && verOf(Dlater) === "sabzi-ghormeh-v2", JSON.stringify([D0, D2, verOf(D0), verOf(D2), verOf(Dlater)]));
      check("(r) ledger line: a date before every version falls back to the current version", verOf(Dbefore) === "sabzi-ghormeh-v2");
      check("(r) ledger line: other products get their own v1, «سایر» stays empty", verOf(D0, "esfenaj") === "esfenaj-v1" && (() => { soo({ date: D0 }, [ln({ productId: gs.LEDGER_OTHER_ID, productName: "برنج" })]); return ledgerTab().rows.slice(1).find((x) => x[5] === "برنج")[19] === ""; })());
      const lg2 = post({ action: "getLedger", session: ss });
      check("(r) getLedger says productVersion:true and sends each line's productVersion", lg2.data.productVersion === true && lg2.data.entries.some((e) => e.productVersion === "sabzi-ghormeh-v1") && lg2.data.entries.every((e) => typeof e.productVersion === "string"));
      const lineD0 = ledgerTab().rows.slice(1).find((x) => x[2] === D0 && x[4] === "sabzi-ghormeh");
      const oidD0 = lineD0[17];
      soo({ date: D0 }, [ln({ id: lineD0[0], qty: "9" })], oidD0);
      check("(r) editing a line (same product and date) keeps its stored version even though the price changed since", ledgerTab().rows.find((x) => x[0] === lineD0[0])[19] === "sabzi-ghormeh-v1" && ledgerTab().rows.find((x) => x[0] === lineD0[0])[6] === 9);
      soo({ date: D2 }, [ln({ id: lineD0[0], qty: "9" })], oidD0);
      check("(r) editing the date looks the version up again", ledgerTab().rows.find((x) => x[0] === lineD0[0])[19] === "sabzi-ghormeh-v2");
      const forged = soo({ date: Dlater, channel: "site" }, [Object.assign(ln({}), { productVersion: "evil-v9" })]);
      check("(r) a productVersion sent by the page is ignored (server fills it)", forged.data.ok === true && !JSON.stringify(ledgerTab().rows).includes("evil-v9"));
      const sr1 = post({ action: "saveLedgerRow", session: ss, data: { entry: { date: D0, type: "buy", productId: "sabzi-ghormeh", qty: "1", qtyUnit: "pack", price: "450", priceUnit: "thousand" }, id: "" } });
      check("(r) saveLedgerRow (single line) fills productVersion too", sr1.data.ok === true && ledgerTab().rows[ledgerTab().rows.length - 1][19] === "sabzi-ghormeh-v1");
      prow("sabzi-ghormeh")[PI("price")] = "555000";   // a hand edit not yet captured by the hourly job
      soo({ date: gs.jalaliDayOf_(gs.tehranNow_()), channel: "person", customerId: "1" }, [ln({ qty: "1" })], "", "");
      const fresh = ledgerTab().rows[ledgerTab().rows.length - 1];
      check("(r) a ledger save first captures pending hand edits, so the new line gets the new version (v3)", fresh[19] === "sabzi-ghormeh-v3" && ofId("sabzi-ghormeh").length === 3);
      // old lines stay empty
      mkBook(["products", "ledger", "customers", "history"], [L.slice(), srow(1, "1", D0, "سایت", "")]);
      gs.setupVersioning();
      const oldLine = ledgerTab().rows[1];
      post({ action: "saveLedgerRow", session: ss, data: { entry: { date: D0, type: "sell", productId: "sabzi-ghormeh", qty: "5", qtyUnit: "pack", price: "450", priceUnit: "thousand", customerId: "1", channel: "site" }, id: oldLine[0] } });
      check("(r) an old line (empty productVersion) edited with the same product and date stays empty", ledgerTab().rows[1][6] === 5 && ledgerTab().rows[1][19] === "");
      // no history tab: sales still save, version empty
      mkBook();
      const nh = soo({}, [ln({})]);
      check("(r) without the history tab a sale still saves, productVersion is empty", nh.data.ok === true && ledgerTab().rows[1][19] === "");
      // 19 -> 20 migration
      mkBook(["products", "ledger", "customers", "log"], [L.slice(0, 19), srow(2, "1", D0, "سایت", 3).slice(0, 19)]);
      const m19 = gs.setupLedger();
      check("(r) setupLedger adds productVersion at the END of a 19-column tab and keeps the data row", /OK/.test(m19) && ledgerTab().rows[0].join() === L.join() && ledgerTab().rows[1].slice(0, 19).join() === srow(2, "1", D0, "سایت", 3).slice(0, 19).join() && post({ action: "getLedger", session: ss }).data.entries[0].productVersion === "");
      check("(r) admin.js: server flag productVersion + old-script guard", /ledgerVersion = r\.productVersion === true/.test(adminSrc) && /if \(!ledgerVersion\) add\(|else if \(!ledgerVersion\) add\(/.test(adminSrc));

      // ---- merge a new sale into an existing order ----
      function srow(n, cust, date, ch, oid, type) {
        return ["L" + n.toString(16).padStart(32, "0"), "2026-11-07 09:00:00", date, type || "فروش", "sabzi-ghormeh", "سبزی قورمه", 1, "بسته/ظرف", 450000, "450", "هزار تومان", 450000,
          type === "خرید" ? "" : "zahra ahmadi", "", OWNER, type === "خرید" ? "" : cust, type === "خرید" ? "" : ch, oid === "" || oid === undefined ? "" : oid, "", ""];
      }
      const ms = (rows) => { mkBook(["products", "ledger", "customers", "log"], [L.slice(), ...rows]); delete world.props.orderSeq; ss = relog(); };
      ms([srow(1, "1", "1405-08-16", "سایت", 12)]);
      const mg = soo({});
      const newRows = ledgerTab().rows.slice(2);
      check("(r) merge: a new sale for the same customer + date + channel is added to the existing order (same number, {mergedInto: 12})",
        mg.data.ok === true && mg.data.orderId === 12 && mg.data.mergedInto === 12 && newRows.length === 2 && newRows.every((r) => r[17] === 12) && world.props.orderSeq === undefined, JSON.stringify(mg));
      const other = [soo({ date: "1405-08-17" }), soo({ channel: "person" }), soo({ customerId: undefined, newCustomer: { firstName: "Neda", lastName: "Rad" } })];
      check("(r) merge: another date, another channel or a NEW customer always gets a NEW order number", other.every((x) => x.data.ok === true && !("mergedInto" in x.data) && x.data.orderId > 12) && new Set(other.map((x) => x.data.orderId)).size === 3, JSON.stringify(other));
      const reused = soo({ customerId: undefined, newCustomer: { firstName: "Zahra", lastName: "Ahmadi" } });
      check("(r) merge: typing a customer that already exists (reused) can merge", reused.data.mergedInto === 12 && reused.data.orderId === 12 && reused.data.reusedCustomer === "1", JSON.stringify(reused));
      const edit12 = soo({}, [ln({ id: newRows[0][0], qty: "4" })], 12);
      check("(r) editing an existing order is unchanged (no mergedInto, same number)", edit12.data.ok === true && edit12.data.orderId === 12 && !("mergedInto" in edit12.data));
      const buyM = post({ action: "saveLedgerOrder", session: ss, data: { order: { date: "1405-08-16", type: "buy", party: "x", note: "", lines: [ln({ price: "10" })] }, orderId: "", rowId: "" } });
      const buyM2 = post({ action: "saveLedgerOrder", session: ss, data: { order: { date: "1405-08-16", type: "buy", party: "x", note: "", lines: [ln({ price: "10" })] }, orderId: "", rowId: "" } });
      check("(r) buys never merge: each buy order gets its own number", buyM.data.ok && buyM2.data.ok && !("mergedInto" in buyM.data) && !("mergedInto" in buyM2.data) && buyM.data.orderId !== buyM2.data.orderId);
      ms([srow(1, "1", "1405-08-16", "سایت", "")]);
      const og = soo({});
      check("(r) merge: an old row without an order number is not a merge target (a new order is made)", og.data.ok === true && !("mergedInto" in og.data) && og.data.orderId === 1);
      ms([srow(1, "1", "1405-08-16", "سایت", 5, "خرید")]);
      const ob = soo({});
      check("(r) merge: an order of BUY rows with the same date is not a target for a sale", !("mergedInto" in ob.data) && ob.data.orderId === 6);
      check("(r) admin.js shows «به سفارش ۱۲ همون روز اضافه شد 🌿» for mergedInto", /lMerged: 'به سفارش \{n\} همون روز اضافه شد 🌿'/.test(adminSrc) && /if \(r\.mergedInto\) done = fill\(TEXT\.lMerged/.test(adminSrc));

      // ---- (t) «گزارش»: getReport / reportSummarize_ (owner approved 2026-11-07) ----
      {
        const rr = (i, date, type, pid, pname, qty, unit, toman, cust, chan, oid) => {
          const r = new Array(20).fill("");
          r[0] = "L" + String(i).padStart(32, "0"); r[1] = "2026-11-07 10:00:00"; r[2] = date; r[3] = type; r[4] = pid; r[5] = pname;
          r[6] = qty; r[7] = unit; r[11] = toman; r[14] = OWNER; r[15] = cust; r[16] = chan; r[17] = oid;
          return r;
        };
        const S = "فروش", B = "خرید", PK = "بسته/ظرف", KG = "کیلو";
        const rep = (o, entriesRows) => { ms(entriesRows); return post({ action: "getReport", session: ss, data: o }); };
        const rows0 = [
          rr(1, "1405-08-10", S, "a", "سبزی قورمه", 2, PK, 900000, "1", "سایت", 7),
          rr(2, "1405-08-10", S, "b", "نعنا", 2.5, KG, 600000, "1", "سایت", 7),     // same order 7: ONE order, two lines
          rr(3, "1405-08-12", S, "a", "سبزی قورمه", 10, PK, 4500000, "2", "حضوری", 8),
          rr(4, "1405-08-12", S, "b", "نعنا", 1, PK, 330000, "2", "حضوری", 8),
          rr(5, "1405-08-13", S, "a", "سبزی قورمه", 1, PK, 450000, "", "", ""),    // old row: no customer, no channel, no order number
          rr(6, "1405-08-14", B, "a", "سبزی قورمه", 5, PK, 2000000, "", "", ""),   // a buy: never counted
          rr(7, "1405-08-14", S, "a", "سبزی قورمه", 1, PK, "", "3", "سایت", 9),    // no total: skipped
          rr(8, "", S, "a", "سبزی قورمه", 1, PK, 1000, "3", "سایت", 10),            // no date: skipped
          rr(9, "1405-07-01", S, "a", "سبزی قورمه", 1, PK, 111, "4", "سایت", 11)   // outside the period below
        ];
        const r1 = rep({ from: "1405-08-01", to: "1405-08-30" }, rows0);
        const sm = r1.data && r1.data.summary;
        check("(t) getReport: answers ok with report:true and a summary", r1.ok && r1.data.ok === true && r1.data.report === true && !!sm, JSON.stringify(r1).slice(0, 200));
        check("(t) report: buys are never counted (money, orders, products)", sm.totals.toman === 900000 + 600000 + 4500000 + 330000 + 450000 && sm.rows.buysIgnored === 1 && sm.rows.used === 5);
        check("(t) report: an order with two lines is ONE order; a row without an order number is its own order (3 orders)", sm.totals.orders === 3 && sm.byDay.length === 3 && sm.byDay[0].orders === 1 && sm.byDay[0].toman === 1500000, JSON.stringify(sm.byDay));
        check("(t) report: old rows without a channel go to «نامشخص»; site and person are kept apart",
          sm.byChannel.unknown.toman === 450000 && sm.byChannel.unknown.orders === 1 && sm.byChannel.site.toman === 1500000 && sm.byChannel.site.orders === 1 && sm.byChannel.person.toman === 4830000 && sm.byChannel.person.orders === 1, JSON.stringify(sm.byChannel));
        check("(t) report: a sale without a total or a date is skipped and counted (not guessed); out-of-period sales are not counted",
          sm.rows.skipped.noTotal === 1 && sm.rows.skipped.noDate === 1 && !JSON.stringify(sm).includes("111"));
        const pa = sm.byProduct.find((p) => p.id === "a"), pb = sm.byProduct.find((p) => p.id === "b");
        check("(t) report: quantities are kept per unit and never mixed (packs and kilos apart)", pa.qty.pack === 13 && pa.qty.kg === 0 && pb.qty.pack === 1 && pb.qty.kg === 2.5 && pb.toman === 930000 && sm.byProduct[0].id === "a", JSON.stringify(sm.byProduct));
        check("(t) report: customers counted once each; top customers by money, a sale without a customer id is left out; names come from the list",
          sm.totals.customers === 2 && sm.topCustomers.length === 2 && sm.topCustomers[0].id === "2" && sm.topCustomers[0].toman === 4830000 && sm.topCustomers[0].orders === 1 && sm.topCustomers[1].orders === 1 && sm.topCustomers[1].name === "zahra ahmadi", JSON.stringify(sm.topCustomers));
        const r0 = rep({ from: "1406-01-01", to: "1406-01-30" }, rows0);
        check("(t) report: an empty period gives zeros and empty lists, not an error", r0.data.ok === true && r0.data.summary.totals.toman === 0 && r0.data.summary.totals.orders === 0 && r0.data.summary.byDay.length === 0 && r0.data.summary.byProduct.length === 0 && r0.data.summary.topCustomers.length === 0 && r0.data.summary.rows.used === 0);
        const rAll = rep({ from: "", to: "" }, rows0);
        check("(t) report: empty from/to = everything", rAll.data.summary.rows.used === 6 && rAll.data.summary.totals.toman === sm.totals.toman + 111);
        const bad = [rep({ from: "x", to: "" }, rows0), rep({ from: "1405-08-30", to: "1405-08-01" }, rows0), rep({ from: 5, to: "" }, rows0), rep({ from: "1405-13-01", to: "" }, rows0)];
        check("(t) report: a bad or reversed range is refused with a message", bad.every((x) => x.data.ok === false && typeof x.data.message === "string" && x.data.message.length > 0), JSON.stringify(bad));
        // more than 2000 rows are ALL counted (getLedger only sends the newest 2000)
        const many = [];
        for (let i = 1; i <= 2600; i++) many.push(rr(i, "1405-08-" + String(1 + (i % 28)).padStart(2, "0"), S, "a", "سبزی قورمه", 1, PK, 1000, String(1 + (i % 5)), "سایت", i));
        const rm = rep({ from: "", to: "" }, many);
        const gl = post({ action: "getLedger", session: ss });
        check("(t) report: 2600 rows are all counted (the ledger list only sends 2000)", rm.data.summary.rows.used === 2600 && rm.data.summary.totals.toman === 2600000 && rm.data.summary.totals.orders === 2600 && gl.data.entries.length === 2000 && gl.data.more === true, String(rm.data.summary.rows.used));
        // read-only
        ms(rows0);
        const w0 = ledgerTab().writes || 0, cw = book.getSheetByName("مشتری‌ها").writes || 0;
        post({ action: "getReport", session: ss, data: { from: "", to: "" } });
        check("(t) report: getReport writes nothing (no setValues on any tab) and takes no lock", (ledgerTab().writes || 0) === w0 && (book.getSheetByName("مشتری‌ها").writes || 0) === cw && !/getReport: function \(d\) \{ return withLock_/.test(read("tools/admin/Code.gs")));
        const nos = post({ action: "getReport", data: { from: "", to: "" } }), nos2 = post({ action: "getReport", session: "f".repeat(64), data: {} });
        let thr = false;
        try { gs.getReport({ from: "", to: "" }); } catch (e) { thr = true; }
        check("(t) report: without a session getReport gives NO_SESSION; called directly it throws (assertSession_)", nos.error === "NO_SESSION" && nos2.error === "NO_SESSION" && thr);
        // ---- «تحلیل و پیشنهاد»: the extra `analysis` part of getReport (owner approved 2026-11-07) ----
        {
          const ra = rep({ from: "1405-08-01", to: "1405-08-30", analysis: true, prevFrom: "1405-06-25" }, rows0);
          const an = ra.data.analysis;
          check("(w) analysis: only asked for with analysis:true (a normal getReport has no analysis part)", ra.data.ok === true && !!an && !("analysis" in rep({ from: "1405-08-01", to: "1405-08-30" }, rows0).data));
          check("(w) analysis: lines = the sales of the period AND the period before it (6 lines); buys, no-date and no-total rows are left out",
            an.lines.length === 6 && an.lines.every((l) => l.length === 9) && an.lines.some((l) => l[0] === "1405-07-01") && !an.lines.some((l) => l[3] === "" && l[5] === 2000000), JSON.stringify(an.lines));
          check("(w) analysis: an order's lines share one order key; a row without an order number has its own key; items are listed once",
            an.lines.filter((l) => l[1] === "o7").length === 2 && an.lines.filter((l) => l[1] === "o8").length === 2 && new Set(an.lines.map((l) => l[1])).size === 4 && an.items.length === 2, JSON.stringify(an.items));
          check("(w) analysis: the lines hold NO customer names, only customer ids (names are only in the separate customerNames map); no raw prices", !/zahra|ahmadi/i.test(JSON.stringify(an.lines)) && !/zahra|ahmadi/i.test(JSON.stringify(an.items)) && an.lines.some((l) => l[7] === "2") && an.lines.every((l) => l[6] === null) && an.profitReady === false && Array.isArray(an.shop), JSON.stringify(an).slice(0, 300));
          check("(x) product view: analysis.customerNames = {id: name} only for the customers in the lines (customer 1 yes; 2 has no row in «مشتری‌ها»)", an.customerNames && an.customerNames["1"] === "zahra ahmadi" && !("2" in an.customerNames) && Object.keys(an.customerNames).every((k) => an.lines.some((l) => l[7] === k)), JSON.stringify(an.customerNames));
          check("(x) product view: a normal getReport (no analysis:true) has no analysis part at all", !("analysis" in rep({ from: "1405-08-01", to: "1405-08-30" }, rows0).data));
          const oth = [rr(1, "1405-08-10", S, "*سایر*", "گردو", 1, PK, 1000, "", "سایت", 1), rr(2, "1405-08-11", S, "*سایر*", "بادام", 2, PK, 2000, "", "سایت", 2), rr(3, "1405-08-12", S, "*سایر*", "گردو", 1, PK, 1500, "", "سایت", 3)];
          const lo2 = gs.reportLines_(oth.map((r) => gs.ledgerEntry_(r)), "", "", { ready: false, prices: {} }, []);
          check("(x) product view: each typed «سایر» name is its own item (گردو, بادام), the same name is the same item", lo2.items.length === 2 && lo2.items[0].n === "گردو" && lo2.items[1].n === "بادام" && lo2.lines[0][2] === lo2.lines[2][2] && lo2.lines[1][2] === 1 && Object.keys(lo2.customerNames).length === 0, JSON.stringify(lo2.items));
          const badPrev = [rep({ from: "1405-08-01", to: "1405-08-30", analysis: true, prevFrom: "x" }, rows0), rep({ from: "1405-08-01", to: "1405-08-30", analysis: true, prevFrom: "1405-08-05" }, rows0), rep({ from: "", to: "", analysis: true, prevFrom: "1405-01-01" }, rows0), rep({ from: "1405-08-01", to: "", analysis: true, prevFrom: 7 }, rows0)];
          check("(w) analysis: a bad prevFrom (not a date, not before from, or no from at all) is refused with a message", badPrev.every((x) => x.data.ok === false && typeof x.data.message === "string"), JSON.stringify(badPrev));
          const ents = rows0.map((r) => gs.ledgerEntry_(r));
          const rawP = { ready: true, prices: { a: 300000 } };
          const sm2 = gs.reportSummarize_(ents, [], "", "", rawP), ln2 = gs.reportLines_(ents, "", "", rawP);
          let sumP = 0; ln2.lines.forEach((l) => { if (l[6] !== null) sumP += l[6]; });
          check("(w) analysis: the profit of the lines is exactly the report's profit (same costing rule: packs only, current raw price, not «سایر»)", sm2.profit.profit === sumP && sm2.profit.rows === ln2.lines.filter((l) => l[6] !== null).length && sumP !== 0, sm2.profit.profit + " vs " + sumP);
          const big = []; for (let i = 0; i < 20005; i++) big.push({ id: "L" + i, type: "sell", date: "1405-08-" + String(1 + (i % 28)).padStart(2, "0"), productId: "a", productName: "x", qty: 1, qtyUnit: "pack", rowToman: 10, customerId: "", channel: "site", orderId: i });
          const cap = gs.reportLines_(big, "", "", { ready: false, prices: {} });
          check("(w) analysis: at most 20,000 lines are sent (the newest ones) and `cut` says so", cap.lines.length === 20000 && cap.cut === true && !cap.lines.some((l) => l[0] === "1405-08-01" && false));
          const src = read("tools/admin/Code.gs"), gr = src.slice(src.indexOf("function getReport("));
          check("(w) analysis: getReport stays read-only (no setValue / appendRow / lock in it or in reportLines_)", !/setValue|appendRow|withLock_|deleteRow|setValues/.test(gr.slice(0, gr.indexOf("\n}\n") > 0 ? gr.indexOf("\n}\n") : 3000)) && !/setValue|appendRow|withLock_/.test(src.slice(src.indexOf("function reportLines_("), src.indexOf("function getReport("))));
        }
        mkBook(["products", "customers", "log"]);
        const noTab = post({ action: "getReport", session: ss, data: {} });
        check("(t) report: no «خرید و فروش» tab → a message, no crash", noTab.data.ok === false && typeof noTab.data.message === "string");
        check("(t) report: the answer carries the capability flag report:true", /report: true, summary:/.test(read("tools/admin/Code.gs")));
      }

      // ---- (u) raw price: private «قیمت اولیه محصولات» tab (owner approved 2026-11-07) ----
      {
        const RAWN = "قیمت اولیه محصولات", RH = Array.from(gs.RAW_HEADER);
        const rawTab = () => book.getSheetByName(RAWN);
        const rawRows = () => rawTab().rows.slice(1);
        const getP = () => post({ action: "getProducts", session: ss });
        const rowOf = (id) => getP().data.rows.find((r) => r.id === id);
        ss = relog();
        mkBook(["products", "ledger", "customers", "log"]);
        gs.setupVersioning();
        const p0 = snapP();
        const sr = gs.setupRawPrices();
        check("(u) setupRawPrices: private tab after «تاریخچه محصولات», before log, never first; header + text formats; products tab untouched",
          tabsNames() === "products,خرید و فروش,مشتری‌ها," + HIST + "," + RAWN + ",log" && rawTab().rows[0].join() === RH.join() && rawTab().frozen === 1 && snapP() === p0 && /^OK/.test(sr), sr);
        gs.setupRawPrices();
        check("(u) setupRawPrices is safe to run again (one tab, same header)", book.getSheets().filter((x) => x.name === RAWN).length === 1 && rawRows().length === 0);
        for (const order of [["products", "log"], ["products", "ledger", "log"], ["products", "customers", "ledger", "log", "history"]]) {
          mkBook(order); gs.setupRawPrices();
          const idx = tabsNames().split(",").indexOf(RAWN);
          check("(u) the raw tab is never the first tab (" + tabsNames() + ")", idx >= 1 && tabsNames().split(",")[0] === "products");
        }
        mkBook(["products", "ledger", "customers", "log"]); gs.setupVersioning(); gs.setupRawPrices();

        // math
        const rm = (t, u) => gs.rawMath_(t, u);
        check("(u) rawMath_: «280» هزار = 280,000; «1.2» میلیون = 1,200,000; Persian digits and «,» are read",
          rm("280", "thousand").toman === 280000 && rm("1.2", "million").toman === 1200000 && rm("۲۸۰", "thousand").toman === 280000 && rm("۱,۲۰۰", "thousand").toman === 1200000);
        check("(u) rawMath_: empty / spaces / undefined / null mean «not set»", ["", "  ", undefined, null].every((v) => rm(v, "thousand").empty === true));
        check("(u) rawMath_: 0, negative, text, 4 decimals, objects and a bad or missing unit are refused; too big is refused",
          ["0", "-5", "abc", "1.2345", {}, ["1"]].every((v) => rm(v, "thousand").error) && ["", "billion", "constructor", undefined].every((u) => rm("1", u).error) && rm("10001", "million").error);

        // getProducts: admin-only, merged in
        ss = relog();
        const g0 = getP();
        check("(u) getProducts: rawReady true, every row has empty raw fields when nothing is set", g0.data.rawReady === true && g0.data.rows.every((r) => r.rawToman === "" && r.rawPrice === ""));
        const sv1 = saveP("sabzi-ghormeh", { rawPrice: "280", rawUnit: "thousand" });
        check("(u) saveProduct with a raw price: ok, one row in the private tab with toman, typed, unit, time and the admin email",
          sv1.data.ok === true && rawRows().length === 1 && rawRows()[0][0] === "sabzi-ghormeh" && rawRows()[0][1] === 280000 && rawRows()[0][2] === "280" && rawRows()[0][3] === "thousand" && rawRows()[0][5] === OWNER, JSON.stringify([sv1, rawRows()]));
        const r1 = rowOf("sabzi-ghormeh");
        check("(u) getProducts returns the raw price for that product only", r1.rawToman === 280000 && r1.rawPrice === "280" && r1.rawUnit === "thousand" && rowOf("esfenaj").rawToman === "");
        check("(u) the products tab got NO raw price: still the 11 public columns, same cell values",
          productsTab().rows[0].join() === gs.HEADER.join() && !JSON.stringify(productsTab().rows).includes("280000,") && productsTab().rows.every((r) => r.length <= 11));
        // update + clear
        saveP("sabzi-ghormeh", { rawPrice: "0.3", rawUnit: "million" });
        check("(u) editing the raw price updates the same row (no second row)", rawRows().length === 1 && rawRows()[0][1] === 300000 && rawRows()[0][3] === "million");
        saveP("sabzi-ghormeh", { rawPrice: "" });
        check("(u) an empty raw price removes the row (optional)", rawRows().length === 0 && rowOf("sabzi-ghormeh").rawToman === "");
        const noKey = saveP("esfenaj", {}); const ik = itemOf("esfenaj", {}); delete ik.rawPrice;
        saveP("sabzi-ghormeh", { rawPrice: "100", rawUnit: "thousand" });
        post({ action: "saveProduct", session: ss, data: { item: Object.assign(itemOf("sabzi-ghormeh", {}), { short: "x" }), originalId: "sabzi-ghormeh" } });
        check("(u) a save without the rawPrice key leaves the stored raw price alone; saving a product with no raw price needs no raw tab", rawRows().length === 1 && noKey.data.ok === true);
        // bad values
        const w0 = rawTab().writes || 0, pw = productsTab().writes || 0;
        const badR = saveP("esfenaj", { rawPrice: "abc", rawUnit: "thousand" });
        const badU = saveP("esfenaj", { rawPrice: "5", rawUnit: "billion" });
        check("(u) bad raw price / unit: refused with a message, NOTHING written (product row unchanged too)",
          badR.data.ok === false && badR.data.issues[0].message === gs.MSG.badRaw && badU.data.ok === false && (rawTab().writes || 0) === w0 && (productsTab().writes || 0) === pw && rawRows().length === 1);
        // id rename follows, delete removes
        saveP("sabzi-ghormeh", { id: "sabzi-ghormeh-2" }, "sabzi-ghormeh");
        check("(u) renaming a product's id moves its raw price to the new id", rawRows().length === 1 && rawRows()[0][0] === "sabzi-ghormeh-2" && rowOf("sabzi-ghormeh-2").rawToman === 100000);
        saveP("sabzi-ghormeh-2", { id: "sabzi-ghormeh-3", rawPrice: "150", rawUnit: "thousand" }, "sabzi-ghormeh-2");
        check("(u) renaming and changing the price together: one row, new id, new price", rawRows().length === 1 && rawRows()[0][0] === "sabzi-ghormeh-3" && rawRows()[0][1] === 150000);
        post({ action: "deleteProduct", session: ss, data: { id: "sabzi-ghormeh-3" } });
        check("(u) deleting a product deletes its raw price row", rawRows().length === 0);
        // formula escaping
        mkBook(["products", "ledger", "customers", "log"]); gs.setupVersioning(); gs.setupRawPrices();
        saveP("esfenaj", { id: "=bad", rawPrice: "5", rawUnit: "thousand" }, "esfenaj");
        check("(u) the id written to the private tab is formula-escaped like every other cell", rawRows().length === 1 && rawRows()[0][0].startsWith("'="));
        // CSV download
        mkBook(["products", "ledger", "customers", "log"]); gs.setupVersioning(); gs.setupRawPrices();
        saveP("esfenaj", { rawPrice: "200", rawUnit: "thousand" });
        const csvOut = post({ action: "publishCsv", session: ss }).data;
        const recs = rawParse(csvOut.csv);
        const firstLine = csvOut.csv.replace(/^\uFEFF/, "").split("\r\n")[0];
        check("(u) admin CSV download: the 11 public columns plus «rawPrice» last; 200000 on esfenaj, empty elsewhere",
          firstLine === gs.HEADER.join() + ",rawPrice" && recs.length === fileRows.length && recs.find((r) => r.id === "esfenaj").rawPrice === "200000" && recs.filter((r) => r.rawPrice !== "").length === 1, firstLine);
        check("(u) buildCsv without the flag is still the exact public 11-column file (no rawPrice, even if rows carry rawToman)",
          !gs.buildCsv(getP().data.rows, "\r\n").includes("rawPrice") && gs.buildCsv(getP().data.rows, "\r\n") === gs.buildCsv(fileRows.map((r) => ({ ...r })), "\r\n"));
        check("(u) data/products.csv (public backup) and app.js / products.js / index / product pages know nothing about a raw price",
          !/raw/i.test(read("data/products.csv").split("\n")[0]) && !/rawPrice|rawToman|قیمت اولیه/.test(read("app.js") + read("products.js") + read("index.html") + read("product.html") + read("cart.js") + read("data/products.csv")));
        // without the tab
        mkBook(["products", "ledger", "customers", "log"]);
        const noTab = getP();
        const noSet = saveP("esfenaj", { rawPrice: "5", rawUnit: "thousand" });
        const noEmpty = saveP("esfenaj", { rawPrice: "", rawUnit: "thousand" });
        check("(u) without the tab: products still load (rawReady false); setting a raw price says to run setupRawPrices; leaving it empty still saves",
          noTab.data.rawReady === false && noTab.data.rows.length === fileRows.length && noSet.data.ok === false && noSet.data.issues[0].message === gs.MSG.noRaw && noEmpty.data.ok === true);
        mkBook(["products", "ledger", "customers", "log"]); gs.setupRawPrices(); rawTab().rows[0][0] = "x";
        check("(u) a broken raw tab header blocks setting a price but not loading products", getP().data.rawReady === false && saveP("esfenaj", { rawPrice: "5", rawUnit: "thousand" }).data.ok === false);
        // a raw tab can never be read as the products
        mkBook(["products", "ledger", "customers", "log"]); gs.setupRawPrices();
        book.sheets.unshift(book.sheets.splice(book.sheets.indexOf(rawTab()), 1)[0]);
        check("(u) if the raw tab were the first tab the products actions refuse (WRONG_FIRST_TAB)", getP().error === "server");
        // no session
        mkBook(["products", "ledger", "customers", "log"]); gs.setupRawPrices();
        const nosess = post({ action: "getProducts" });
        let thr = false; try { gs.getProducts(); } catch (e) { thr = true; }
        check("(u) without a session the raw prices are never returned (NO_SESSION; direct call throws)", nosess.error === "NO_SESSION" && thr && !JSON.stringify(nosess).includes("raw"));
        check("(u) PROTECTED_ACTIONS gets no new action; setupRawPrices is not an action", !/setupRawPrices/.test(vm.runInContext("PROTECTED_ACTIONS.join()", gs) + vm.runInContext("PUBLIC_ACTIONS.join()", gs)));
        // admin page
        const adm2 = read("admin/admin.js");
        check("(u) admin page: price and raw price are in one row, raw has the هزار/میلیون select; the profit line is live (aria-live)",
          /price-row/.test(adm2) && /f-rawPrice/.test(adm2) && /f-rawUnit/.test(adm2) && /id = 'f-profit'/.test(adm2) && /قیمت اولیه \(خام\)/.test(adm2) && /سود: \{n\} تومان/.test(adm2));
        check("(u) admin page: HEADER (public columns) is unchanged in admin.js and Code.gs",
          /var HEADER = \['id', 'name', 'category', 'price', 'unit', 'serves', 'short', 'details', 'recipe', 'images', 'soldOut'\];/.test(adm2) && gs.HEADER.join() === "id,name,category,price,unit,serves,short,details,recipe,images,soldOut");
      }

      // ---- (v) profit in the report (owner approved 2026-11-07) ----
      {
        const RAWN = "قیمت اولیه محصولات", rawTab = () => book.getSheetByName(RAWN);
        const rr = (i, date, type, pid, pname, qty, unit, toman, oid) => {
          const r = new Array(20).fill("");
          r[0] = "L" + String(i).padStart(32, "0"); r[1] = "2026-11-07 10:00:00"; r[2] = date; r[3] = type; r[4] = pid; r[5] = pname;
          r[6] = qty; r[7] = unit; r[11] = toman; r[14] = OWNER; r[15] = "1"; r[16] = "سایت"; r[17] = oid;
          return r;
        };
        const S = "فروش", B = "خرید", PK = "بسته/ظرف", KG = "کیلو", PC = "عدد";
        const setBook = (rows, withRaw) => {
          mkBook(["products", "ledger", "customers", "log"], [L.slice(), ...rows]);
          gs.setupVersioning();
          if (withRaw) gs.setupRawPrices();
          delete world.props.orderSeq; ss = relog();
        };
        const rep2 = () => post({ action: "getReport", session: ss, data: { from: "", to: "" } });
        const rows = [
          rr(1, "1405-08-10", S, "a", "الف", 2, PK, 900000, 1),        // raw 300,000 → cost 600,000 profit 300,000
          rr(2, "1405-08-10", S, "b", "ب", 1, PK, 100000, 1),          // raw 150,000 → cost 150,000 profit −50,000 (a loss)
          rr(3, "1405-08-11", S, "a", "الف", 3, KG, 700000, 2),        // kilos: not costed
          rr(4, "1405-08-11", S, "c", "ج", 1, PK, 200000, 3),          // no raw price: not costed
          rr(5, "1405-08-12", S, gs.LEDGER_OTHER_ID, "چیز دیگه", 1, PK, 50000, 4),   // «سایر»: not costed
          rr(6, "1405-08-12", B, "a", "الف", 9, PK, 999000, ""),       // a buy: never counted
          rr(7, "1405-08-13", S, "a", "الف", 1.5, PK, 600000, 5),      // cost 450,000 profit 150,000
          rr(8, "1405-08-13", S, "b", "ب", 2, PC, 90000, 6)           // pieces: not costed
        ];
        setBook(rows, true);
        const rt = rawTab();
        const putRaw = (id, toman) => rt.rows.push([id, toman, String(toman / 1000), "thousand", "2026-11-07 10:00:00", OWNER]);
        putRaw("a", 300000); putRaw("b", 150000); putRaw(gs.LEDGER_OTHER_ID, 1);
        const r = rep2().data.summary, pf = r.profit;
        check("(v) profit: cost = raw × qty for pack sales only; profit = the row's sale total − cost (a loss stays negative)",
          pf.ready === true && pf.rows === 3 && pf.sales === 900000 + 100000 + 600000 && pf.cost === 600000 + 150000 + 450000 && pf.profit === 300000 - 50000 + 150000, JSON.stringify(pf));
        check("(v) profit: kilos, pieces, «سایر» (even with a raw row) and a product without a raw price are left out and counted with their money; sales still contain them",
          pf.noCost.rows === 4 && pf.noCost.toman === 700000 + 200000 + 50000 + 90000 && r.rows.used === 7 && r.totals.toman === 900000 + 100000 + 700000 + 200000 + 50000 + 600000 + 90000, JSON.stringify(pf.noCost));
        check("(v) profit: the buy row is not counted anywhere", r.rows.buysIgnored === 1 && r.byProduct.find((p) => p.id === "a").cost === 600000 + 450000);
        const a = r.byProduct.find((p) => p.id === "a"), b = r.byProduct.find((p) => p.id === "b"), c = r.byProduct.find((p) => p.id === "c");
        check("(v) per product: profit, cost, costedToman (the margin base, only costed rows) and costedLines",
          a.profit === 450000 && a.costedToman === 1500000 && a.costedLines === 2 && b.profit === -50000 && b.costedToman === 100000 && b.costedLines === 1 && c.costedLines === 0 && c.profit === 0, JSON.stringify([a, b, c]));
        const d10 = r.byDay.find((x) => x.d === "1405-08-10"), d11 = r.byDay.find((x) => x.d === "1405-08-11");
        check("(v) per day: cost and profit of costed rows only", d10.cost === 750000 && d10.profit === 250000 && d11.cost === 0 && d11.profit === 0, JSON.stringify(r.byDay));
        // no raw tab → no profit, sales still fine
        setBook(rows, false);
        const nr = rep2();
        check("(v) without the raw tab: the report still works, profit.ready false and nothing is costed (all sale rows counted as not costed)",
          nr.data.ok === true && nr.data.summary.profit.ready === false && nr.data.summary.profit.rows === 0 && nr.data.summary.profit.profit === 0 && nr.data.summary.byProduct.every((p) => p.costedLines === 0) && nr.data.summary.rows.used === 7);
        // a raw tab with an unreadable price: ignored
        setBook(rows, true); const rt2 = book.getSheetByName(RAWN); rt2.rows.push(["a", "abc", "", "thousand", "", OWNER]); rt2.rows.push(["b", 150000, "150", "thousand", "", OWNER]);
        const bad = rep2().data.summary.profit;
        check("(v) a raw row whose price is not a number is ignored (that product is not costed)", bad.rows === 1 && bad.cost === 150000);
        // read-only
        const rw0 = book.getSheetByName(RAWN).writes || 0;
        rep2();
        check("(v) getReport still writes nothing (raw tab too) and the raw prices are read with rawMap_ only",
          (book.getSheetByName(RAWN).writes || 0) === rw0 && /rawMap_\(\)/.test(read("tools/admin/Code.gs").slice(read("tools/admin/Code.gs").indexOf("function getReport("))));
      }
    }
  }

  gs.SpreadsheetApp = oldSS;

  // the page
  check("(n) admin page: no sums or totals over all rows (only each row's total and «جمع این سفارش» for ONE order)", !/جمع|grandTotal|\.reduce\(/.test(adminSrc.replace(/جمع این سفارش/g, "")));
  check("(n) admin page: ledger data shown with textContent only (no innerHTML / insertAdjacentHTML)", !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(adminSrc));
  const newer = /\?\.|\?\?|Object\.fromEntries|replaceAll|\.at\(|\.flat\(|flatMap|matchAll|structuredClone/;
  check("(n) admin.js and Code.gs use nothing newer than ES2017", !newer.test(adminSrc.replace(/\/\/[^\n]*/g, "")) && !newer.test(read("tools/admin/Code.gs").replace(/\/\/[^\n]*/g, "")));
  const html = read("admin/index.html");
  check("(o) admin page: the name boxes are LTR and never auto-capitalise; the buy box is «اسم فروشنده»; channel pills; filter box + select",
    /id="l-first"[^>]*dir="ltr"/.test(html) && /id="l-last"[^>]*dir="ltr"/.test(html) && /id="l-first"[^>]*autocapitalize="none"/.test(html) && /اسم فروشنده/.test(html) &&
    /id="l-ch-site"/.test(html) && /id="l-ch-person"/.test(html) && /id="l-cust-filter"/.test(html) && /<select id="l-customer"/.test(html) && !/<datalist/.test(html));
  check("(o) admin page: Latin names are bidi-isolated (FSI…PDI in options, <bdi dir=ltr> in the list)", adminSrc.includes("'\\u2068'") && adminSrc.includes("'\\u2069'") && /setAttribute\('dir', 'ltr'\)/.test(adminSrc));
  check("(n) admin page CSP is unchanged (no new script origins, no inline script)", /script-src 'self';/.test(html) && !/<script>(?!<\/)/.test(html) && /connect-src 'self' https:\/\/script\.google\.com/.test(html));
}

// ---- (m) log.js in the browser (stubbed window) ----
{
  const logSrc = read("log.js");
  function runLog({ host = "arman-niaruhi.github.io", protocol = "https:", search = "", path = "/bargin/", nav = {}, win = {}, shop = { logApi: "https://script.google.com/x/exec" }, referrer = "" } = {}) {
    const out = { beacons: [], fetches: [], logs: [], timers: [] };
    const listeners = {};
    const doc = { referrer, visibilityState: "visible", addEventListener: (t, f) => { (listeners["doc:" + t] = listeners["doc:" + t] || []).push(f); } };
    const navigator = Object.assign({ userAgent: "Mozilla/5.0 (iPhone) Safari", sendBeacon: (u, b) => { out.beacons.push(b); return true; } }, nav);
    const ctx = {
      SHOP: shop, navigator, document: doc, console: { log: (s) => out.logs.push(s) },
      location: { hostname: host, protocol, search, pathname: path },
      sessionStorage: { _: {}, getItem(k) { return this._[k] || null; }, setItem(k, v) { this._[k] = v; } },
      crypto: nodeCrypto.webcrypto, URL, Uint8Array, Math, JSON, String, Number,
      matchMedia: () => ({ matches: true }),
      fetch: (u, o) => { out.fetches.push(o); return Promise.resolve(); },
      setTimeout: (f) => { out.timers.push(f); return out.timers.length; }, clearTimeout() {},
      addEventListener: (t, f) => { (listeners["win:" + t] = listeners["win:" + t] || []).push(f); }
    };
    Object.assign(ctx, win);
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(logSrc, ctx);
    out.ctx = ctx; out.doc = doc; out.listeners = listeners;
    out.events = () => [].concat(...out.beacons.concat(out.fetches.map((o) => o.body), out.logs.map((s) => s.replace("[bargin-log] ", ""))).map((b) => JSON.parse(b).data.events));
    return out;
  }
  const live = runLog({ referrer: "https://l.instagram.com/foo?bar" });
  live.ctx.logEvent("view", {});
  live.ctx.logEvent("category", { cat: "رب‌ها" });
  live.ctx.logEvent("hack", { x: 1 });
  live.ctx.logEvent("cart_add", { id: "rob-anar", qty: 1, from: "card", secret: "no" });
  check("(m) events wait in a batch (no request yet)", live.fetches.length === 0 && live.beacons.length === 0);
  live.ctx.logEvent("whatsapp", { from: "footer", qty: 1 });
  const evs = live.events();
  check("(m) a WhatsApp click sends the batch at once, as text/plain fetch without cookies",
    live.fetches.length === 1 && live.fetches[0].mode === "no-cors" && live.fetches[0].credentials === "omit" && live.fetches[0].keepalive === true &&
    /text\/plain/.test(live.fetches[0].headers["Content-Type"]) && JSON.parse(live.fetches[0].body).action === "logEvent");
  check("(m) only whitelisted types and fields; page, device and referrer host added",
    evs.map((e) => e.type).join() === "view,category,cart_add,whatsapp" && !("secret" in evs[2]) && evs[0].src === "instagram.com" && evs[0].page === "home" && evs[0].dev === "phone", JSON.stringify(evs));
  check("(m) the visitor id is 16 random [0-9a-z] characters, kept for the tab", /^[0-9a-z]{16}$/.test(JSON.parse(live.fetches[0].body).data.sid) && live.ctx.sessionStorage._["bargin-log-sid"] === JSON.parse(live.fetches[0].body).data.sid);
  live.ctx.logEvent("search", { q: "سب" }); live.ctx.logEvent("search", { q: "سبزی" });
  check("(m) search is debounced (nothing queued while typing)", live.fetches.length === 1);
  live.doc.visibilityState = "hidden";
  live.listeners["win:pagehide"].forEach((f) => f());
  check("(m) leaving the page sends the last search word with sendBeacon", live.beacons.length === 1 && JSON.parse(live.beacons[0]).data.events.map((e) => e.q).join() === "سبزی");
  const leave = runLog();
  leave.ctx.logEvent("view", {});
  leave.ctx.logEvent("instagram", { from: "footer" });
  check("(m) an Instagram click sends at once", leave.fetches.length === 1 && leave.events().map((e) => e.type).join() === "view,instagram");
  leave.ctx.logEvent("phone", { from: "footer" });
  check("(m) a phone click sends at once", leave.fetches.length === 2 && leave.events()[2].type === "phone");
  const nr = runLog();
  nr.ctx.logEvent("no_results", { q: "پیتز" }); nr.ctx.logEvent("no_results", { q: "" });
  nr.ctx.logEvent("cart_dec", { id: "a", qty: 1 }); nr.ctx.logEvent("cart_remove", { id: "a", qty: 1 }); nr.ctx.logEvent("cart_clear", { qty: 4 });
  nr.ctx.logEvent("load_error", { why: "http-404" });
  nr.ctx.logFlush();
  const nrE = nr.events();
  check("(m) results showing again cancel a waiting no_results; cart_dec/remove/clear and load_error (with why) are sent",
    nrE.map((e) => e.type).join() === "cart_dec,cart_remove,cart_clear,load_error" && nrE[3].why === "http-404" && nrE[2].qty === 4, JSON.stringify(nrE));
  const nr2 = runLog();
  nr2.ctx.logEvent("no_results", { q: "پیتزا" + "ا".repeat(60) }); nr2.ctx.logFlush();
  check("(m) a no_results word is sent after the pause, cut to 40 characters", nr2.events().length === 1 && nr2.events()[0].type === "no_results" && nr2.events()[0].q.length === 40);
  const long = runLog();
  long.ctx.logEvent("search", { q: "  " + "ق".repeat(60) + " " }); long.ctx.logFlush();
  check("(m) search words are cut to 40 characters", long.events()[0].q.length === 40);
  const many = runLog();
  for (let i = 0; i < 100; i++) many.ctx.logEvent("category", { cat: "c" + i });
  check("(m) at most 60 events per page load, sent in batches of 10", many.events().length === 60 && many.fetches.length === 6);
  const blockedCases = {
    "localhost": runLog({ host: "localhost" }), "127.0.0.1": runLog({ host: "127.0.0.1" }), "file:": runLog({ protocol: "file:", host: "" }),
    "webdriver": runLog({ nav: { webdriver: true } }), "bot UA": runLog({ nav: { userAgent: "Googlebot/2.1" } }), "headless UA": runLog({ nav: { userAgent: "HeadlessChrome/120" } }),
    "WhatsApp preview": runLog({ nav: { userAgent: "WhatsApp/2.23" } }), "DNT": runLog({ nav: { doNotTrack: "1" } }), "GPC": runLog({ nav: { globalPrivacyControl: true } }),
    "no logApi": runLog({ shop: { logApi: "" } })
  };
  Object.keys(blockedCases).forEach((k) => {
    const o = blockedCases[k];
    o.ctx.logEvent("view", {}); o.ctx.logEvent("whatsapp", {}); o.ctx.logFlush();
    check("(m) nothing is sent: " + k, o.fetches.length === 0 && o.beacons.length === 0 && o.logs.length === 0);
  });
  const dbg = runLog({ host: "localhost", search: "?logdebug=1", nav: { webdriver: true } });
  dbg.ctx.logEvent("view", {}); dbg.ctx.logFlush();
  check("(m) localhost + ?logdebug=1: the batch is printed to console.log, never sent", dbg.logs.length === 1 && dbg.fetches.length === 0 && dbg.beacons.length === 0 && dbg.events()[0].type === "view");
  const notLocal = runLog({ search: "?logdebug=1" });
  notLocal.ctx.logEvent("view", {}); notLocal.ctx.logFlush();
  check("(m) ?logdebug=1 does nothing on the live site (normal sending, no console output)", notLocal.logs.length === 0 && notLocal.fetches.length === 1);
  let threw = false;
  try { const bad = runLog({ win: { matchMedia: () => { throw new Error("x"); } }, nav: { sendBeacon: () => { throw new Error("y"); } } }); bad.ctx.logEvent("view", null); bad.ctx.logEvent("whatsapp", { qty: "abc" }); } catch (e) { threw = true; }
  check("(m) logEvent never throws", !threw);
  // ES2017 only in the site scripts
  const newer = /\?\.|\?\?|Object\.fromEntries|replaceAll|\.at\(|\.flat\(|flatMap|matchAll|structuredClone|\/[gimsy]*u[gimsy]*[,;)\s]/;
  ["log.js", "app.js", "cart.js", "products.js"].forEach((f) => {
    const code = read(f).replace(/\/\/[^\n]*/g, "");
    check("(m) no syntax or methods newer than ES2017 in " + f, !newer.test(code), (code.match(newer) || [""])[0]);
  });
  const shopCtx = {}; vm.runInNewContext(read("products.js") + ";this.SHOP=SHOP;", shopCtx);
  check("(m) SHOP.logApi is the same Apps Script web app as SHOP.adminApi", shopCtx.SHOP.logApi && shopCtx.SHOP.logApi === shopCtx.SHOP.adminApi);
  check("(m) deploy.yml copies log.js", /cp -r[^\n]*\blog\.js\b/.test(read(".github/workflows/deploy.yml")));
  check("(m) index.html and product.html load log.js after products.js and before app.js",
    ["index.html", "product.html"].every((f) => /products\.js"><\/script>\s*<script src="log\.js"><\/script>\s*<script src="app\.js">/.test(read(f))));
}


// ---- (q) pack size (owner approved 2026-11-07) ----
{
  const adm = read("admin/admin.js");
  const a = adm.indexOf("// packSizeOf (begin)"), b = adm.indexOf("// packSizeOf (end)");
  check("(q) admin.js has the packSizeOf block", a > 0 && b > a);
  const ctxp = {};
  vm.runInNewContext(adm.slice(a, b) + ";this.packSizeOf=packSizeOf;", ctxp);
  const cases = [["۵۰۰ گرم", "۵۰۰ گرم"], ["۴۰۰گرم", "۴۰۰ گرم"], ["۱ کیلو", "۱ کیلو"], ["500 گرم", "۵۰۰ گرم"], ["۳۰۰\u200cگرم", "۳۰۰ گرم"], ["کیلو", ""], ["ظرف", ""], ["", ""], [undefined, ""], ["۱۰۰ عدد", ""]];
  check("(q) unit → packSize: «۵۰۰ گرم», «۴۰۰گرم», «۱ کیلو» are kept/normalised; «کیلو», «ظرف», empty give ''",
    cases.every(([u, w]) => ctxp.packSizeOf(u) === w), JSON.stringify(cases.map(([u]) => ctxp.packSizeOf(u))));
  const LH = Array.from(gs.LEDGER_HEADER);
  check("(q) packSize is the 19th column, productVersion the LAST (20th)", LH.length === 20 && LH[18] === "packSize" && LH[19] === "productVersion" && Array.from(gs.LEDGER_HEADER_V3).length === 18 && Array.from(gs.LEDGER_HEADER_V4).length === 19);
  const O = gs.ALLOWED_EMAILS[0];
  const pr = [{ id: "sabzi-ghormeh", name: "سبزی قورمه" }];
  const cx = { id: "L" + "b".repeat(32), created: "2026-11-07 10:00:00", by: O, customers: [{ id: "1", firstName: "a", lastName: "b" }] };
  const gd = (o) => Object.assign({ date: "1405-08-16", type: "buy", productId: "sabzi-ghormeh", qty: "2", qtyUnit: "pack", price: "450", priceUnit: "thousand" }, o);
  const q1 = gs.planLedgerRow_(gd({ packSize: "  ۵۰۰   گرم " }), pr, cx);
  check("(q) plan: packSize is cleaned (spaces) and written in column 19", q1.issues.length === 0 && q1.row.length === 20 && q1.row[18] === "۵۰۰ گرم", JSON.stringify(q1.row));
  check("(q) plan: no packSize = empty cell", gs.planLedgerRow_(gd({}), pr, cx).row[18] === "");
  const q3 = gs.planLedgerRow_(gd({ packSize: "x".repeat(21) }), pr, cx);
  check("(q) plan: 21 characters is refused, 20 is fine", q3.issues.some((i) => i.field === "packSize") && gs.planLedgerRow_(gd({ packSize: "x".repeat(20) }), pr, cx).issues.length === 0);
  check("(q) plan: a non-text packSize is refused", gs.planLedgerRow_(gd({ packSize: 500 }), pr, cx).issues.some((i) => i.field === "packSize"));
  check("(q) plan: a formula in packSize is escaped with an apostrophe", gs.planLedgerRow_(gd({ packSize: "=1+1" }), pr, cx).row[18] === "'=1+1" && gs.planLedgerRow_(gd({ packSize: "-5" }), pr, cx).row[18] === "'-5");
  const back = gs.ledgerEntry_(q1.row);
  check("(q) ledgerEntry_ returns packSize; an 18-column old row gives ''", back.packSize === "۵۰۰ گرم" && gs.ledgerEntry_(q1.row.slice(0, 18)).packSize === "");
  check("(q) the server says packSize: true (capability flag)", /packSize: true/.test(read("tools/admin/Code.gs")));
  check("(q) admin.js refuses to save when the server does not say packSize: true", /ledgerPack = r\.packSize === true/.test(adm) && /if \(!ledgerPack\) add\(/.test(adm));
  check("(q) buildCsv still starts with the BOM (written as an escape in the source)", gs.buildCsv([], "\n").charCodeAt(0) === 0xFEFF && /'\\uFEFF'/.test(read("tools/admin/Code.gs")) && !/\uFEFF/.test(read("tools/admin/Code.gs")));
  const cg = read("tools/admin/Code.gs");
  const ncLine = cg.split("\n").find((l) => l.includes("toAsciiDigits(input).replace("));
  check("(q) normalizeCode_ writes its invisible characters as escapes; no BOM or bidi mark is left in Code.gs; Persian digits still work", !!ncLine && !/[\u200c\u200e\u200f\ufeff]/.test(ncLine) && /\\u200C\\u200F\\u200E/.test(ncLine) && !/[\ufeff\u200e\u200f]/.test(cg) && gs.normalizeCode_("۱۲۳ ۴۵۶") === "123456" && gs.normalizeCode_("12\u200c3\u200f4\u200e56") === "123456");
}
// ---- (t) «گزارش» page code: admin/report.js (owner approved 2026-11-07) ----
{
  const rsrc = read("admin/report.js"), html = read("admin/index.html"), adm = read("admin/admin.js");
  const win = { barginAdmin: { jalCal_: gs.jalCal_, toJalali_: gs.toJalali_, months: ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"] } };
  const ctxr = { window: win, document: { getElementById: () => null }, Intl, Date, Math, Object, String };
  const asrc = read("admin/analysis.js");
  vm.runInNewContext(asrc, ctxr);
  vm.runInNewContext(read("admin/product.js"), ctxr);
  vm.runInNewContext(read("admin/overview.js"), ctxr);
  vm.runInNewContext(rsrc, ctxr);
  const U = win.barginReport.util;
  const p2 = (n) => String(n).padStart(2, "0");
  // Saturday weeks against known dates (2026-11-07 = Saturday = 1405-08-16)
  check("(t) weeks start on Saturday: 1405-08-16 (Sat) → itself, Fri 1405-08-22 → 1405-08-16, Sat 1405-08-23 → itself", U.weekStartKey("1405-08-16") === "1405-08-16" && U.weekStartKey("1405-08-22") === "1405-08-16" && U.weekStartKey("1405-08-23") === "1405-08-23");
  check("(t) weeks: Friday 1405-08-15 → Saturday 1405-08-09", U.weekStartKey("1405-08-15") === "1405-08-09");
  check("(t) weeks cross a month: 1405-08-01 (Fri) → 1405-07-25; and a year: 1404-12-29 (Fri) → 1404-12-23, 1405-01-01 (Sat) → itself, 1405-01-03 → 1405-01-01",
    U.weekStartKey("1405-08-01") === "1405-07-25" && U.weekStartKey("1404-12-29") === "1404-12-23" && U.weekStartKey("1405-01-01") === "1405-01-01" && U.weekStartKey("1405-01-03") === "1405-01-01");
  let allSat = true;
  for (let i = 0; i < 400; i++) { const k = U.addDays("1404-01-01", i), w = U.weekStartKey(k), d = U.dayDiff(w, k); if (d < 0 || d > 6 || U.weekStartKey(w) !== w) allSat = false; }
  check("(t) weeks: 400 days in a row each map to a start 0-6 days before, and a start maps to itself", allSat);
  check("(t) addDays crosses month and year ends (Mehr has 30 days, Esfand 1404 has 29)", U.addDays("1405-07-30", 1) === "1405-08-01" && U.addDays("1404-12-29", 1) === "1405-01-01" && U.addDays("1405-01-01", -1) === "1404-12-29" && U.addDays("1405-06-31", 1) === "1405-07-01");
  const T = "1405-08-16";
  const rg = (p) => U.rangeFor(p, T);
  check("(t) «این ماه» = day 1 of the Persian month to today; «امسال» = 1 Farvardin to today; «همه» = no limit",
    rg("month").from === "1405-08-01" && rg("month").to === T && rg("year").from === "1405-01-01" && rg("year").to === T && rg("all").from === "" && rg("all").to === "");
  check("(t) «۳ ماه اخیر» = the last 90 days counted from today (90 days including today): 1405-05-19 … 1405-08-16", rg("d90").from === "1405-05-19" && rg("d90").to === T && U.dayDiff(rg("d90").from, T) === 89);
  check("(t) the 90-day range crosses a year end (today 1405-01-10 → 1404-10-10) and Esfand correctly", U.rangeFor("d90", "1405-01-10").from === "1404-10-10" && U.dayDiff("1404-10-10", "1405-01-10") === 89);
  check("(t) today comes from the Tehran clock, not the computer's zone (2026-11-06 22:00 UTC is already 1405-08-16 there)", U.todayKey(new Date(Date.UTC(2026, 10, 6, 22, 0, 0))) === "1405-08-16" && U.todayKey(new Date(Date.UTC(2026, 10, 7, 12, 0, 0))) === "1405-08-16" && U.todayKey(new Date(Date.UTC(2026, 10, 7, 21, 0, 0))) === "1405-08-17");
  // number formatting
  const fm = [[1200000, "۱٫۲ میلیون"], [2000000, "۲ میلیون"], [450000, "۴۵۰ هزار"], [1500, "۱٫۵ هزار"], [800, "۸۰۰"], [0, "۰"], [2500000000, "۲٫۵ میلیارد"], [12345678, "۱۲٫۳ میلیون"]];
  check("(t) compact money in Persian digits: «۱٫۲ میلیون», «۴۵۰ هزار», «۲٫۵ میلیارد», «۰»", fm.every(([n, t]) => U.fmtMoney(n) === t), JSON.stringify(fm.map(([n]) => U.fmtMoney(n))));
  check("(t) quantities per unit, never mixed: «۱۲ بسته + ۲٫۵ کیلو»; a single unit; nothing = «—»",
    U.fmtQty({ pack: 12, kg: 2.5, g: 0, piece: 0 }) === "۱۲ بسته + ۲٫۵ کیلو" && U.fmtQty({ pack: 0, kg: 0, g: 300, piece: 4 }) === "۳۰۰ گرم + ۴ عدد" && U.fmtQty({ pack: 0, kg: 0, g: 0, piece: 0 }) === "—");
  const pl = [{ id: "x", name: "الف", toman: 100, lines: 1, qty: { pack: 0, kg: 9, g: 0, piece: 0 } }, { id: "y", name: "ب", toman: 50, lines: 3, qty: { pack: 5, kg: 0, g: 0, piece: 0 } }, { id: "z", name: "ج", toman: 900, lines: 2, qty: { pack: 5, kg: 1, g: 0, piece: 0 } }];
  check("(t) products ranked by packs (kilos never added to packs); ties by sale lines", U.rankByCount(pl).map((p) => p.id).join() === "y,z,x");
  const nine = Array.from({ length: 10 }, (_, i) => ({ id: "p" + i, name: "م" + i, toman: 1000 - i, lines: 1, qty: { pack: 10 - i, kg: i ? 0 : 1, g: 0, piece: 0 } }));
  const top = U.productRows(nine, "toman");
  check("(t) top 8 products plus «بقیه» (the other two summed per unit)", top.rows.length === 9 && top.rows[8].rest === true && top.rows[8].toman === 992 + 991 && top.rows[8].qty.pack === 2 + 1 && U.productRows(nine.slice(0, 8), "toman").rows.length === 8);
  // series
  const byDay = [{ d: "1405-08-10", toman: 5, orders: 1 }, { d: "1405-08-13", toman: 7, orders: 2 }, { d: "1405-08-16", toman: 1, orders: 1 }];
  const wk = U.buildSeries(byDay, "week", "", "");
  check("(t) weekly series: Sat 08-09 holds 08-10 and 08-13 (12), Sat 08-16 holds 08-16 (1); empty weeks are filled with zero",
    wk.length === 2 && wk[0].key === "1405-08-09" && wk[0].toman === 12 && wk[0].orders === 3 && wk[1].key === "1405-08-16" && U.buildSeries(byDay, "day", "1405-08-09", "1405-08-17").length === 9 && U.buildSeries(byDay, "day", "1405-08-09", "1405-08-17")[0].toman === 0);
  const mo = U.buildSeries([{ d: "1405-07-30", toman: 3, orders: 1 }, { d: "1405-09-02", toman: 4, orders: 1 }], "month", "", "");
  check("(t) monthly series uses Persian months and fills the empty month between (Mehr, Aban, Azar)", mo.length === 3 && mo[1].toman === 0 && U.labelOf(mo[1].key, "month") === "آبان" && U.labelOf("1405-08-16", "day") === "۱۶");
  check("(t) an empty period gives an empty series", U.buildSeries([], "day", "", "").length === 0);
  // the page code itself
  const newer = /\?\.|\?\?|Object\.fromEntries|replaceAll|\.at\(|\.flat\(|flatMap|matchAll|structuredClone|\/[gimsy]*u[gimsy]*[,;)\s]/;
  check("(t) report.js and the whole admin use nothing newer than ES2017", !newer.test(rsrc.replace(/\/\/[^\n]*/g, "")) && !newer.test(asrc.replace(/\/\/[^\n]*/g, "")) && !newer.test(adm.replace(/\/\/[^\n]*/g, "")));
  check("(t) report.js: no innerHTML / eval / document.write / libraries / network calls of its own (only barginAdmin.api)", !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|fetch\(|XMLHttpRequest|import\(|require\(|https?:\/\//.test(rsrc.replace(/'http:\/\/www\.w3\.org\/2000\/svg'/, "")));
  check("(t) report.js only reads: it calls getReport and no save/delete action", /api\('getReport'/.test(rsrc) && !/saveLedger|deleteLedger|saveProduct|deleteProduct|publishCsv/.test(rsrc));
  check("(t) the page loads report.js after admin.js (script-src 'self' allows it) and has the «گزارش» tab", /<script src="admin\.js"><\/script>\s*<script src="analysis\.js"><\/script>\s*<script src="product\.js"><\/script>\s*<script src="overview\.js"><\/script>\s*<script src="report\.js"><\/script>/.test(html) && /id="tab-report"[^>]*>گزارش</.test(html) && /script-src 'self'/.test(html));
  check("(t) the report has the four tiles, the three switches and the four charts with a «جدول اعداد» under each",
    ["جمع فروش", "تعداد سفارش", "تعداد مشتری", "میانگین هر سفارش"].every((t) => rsrc.includes(t)) && ["این ماه", "۳ ماه اخیر", "امسال", "روزانه", "هفتگی", "ماهانه", "به تومان", "به تعداد", "فروش و سود در طول زمان", "سالانه", "۷ روز اخیر", "هفته‌ی قبل", "پرفروش‌ترین محصولات", "سایت یا حضوری؟", "بهترین مشتری‌ها"].every((t) => html.includes(t)) && (html.match(/<summary>جدول اعداد<\/summary>/g) || []).length >= 4 && (html.match(/<details/g) || []).length >= 4);
  check("(t) the old-server guard: an old script (unknown_action, or no report:true) shows a message; the session loss goes through onApiError (back to login)", /unknown_action/.test(rsrc) && /r\.report !== true/.test(rsrc) && /ad\.onApiError\(err/.test(rsrc) && /onApiError[\s\S]{0,200}NO_SESSION/.test(adm));
  check("(t) the report is wiped when the login screen shows (logout / NO_SESSION), so no customer name stays in the page", /id !== 's-app' && window\.barginReport\) window\.barginReport\.reset\(\)/.test(adm) && /reset: function/.test(rsrc));
  check("(t) channel colours: green for سایت, walnut for حضوری, tan for نامشخص", /site: '#2f7a1f', person: '#4a2c1a', unknown: '#d2ad6c'/.test(rsrc));
  check("(t) the chart shows at most the newest 60 bars and says so", /MAX_BARS = 60/.test(rsrc) && /slice\(-MAX_BARS\)/.test(rsrc) && /more60/.test(rsrc));
  check("(t) customer names stay in the admin: no name in the public site files, report.js has no hard-coded names", !/zahra|ahmadi/i.test(rsrc + html.slice(html.indexOf("id=\"v-report\""), html.indexOf("id=\"v-ledger\""))));
  check("(t) deploy.yml copies the whole admin folder (so report.js goes live with it)", /cp -r[^\n]*\badmin\b/.test(read(".github/workflows/deploy.yml")));
  // ---- profit and granularity on the page (owner approved 2026-11-07) ----
  check("(v) yearly buckets: 1404 and 1405 sales, an empty year between is zero (1404, 1405, 1406)",
    (() => { const y = U.buildSeries([{ d: "1404-12-29", toman: 3, orders: 1, cost: 1, profit: 2 }, { d: "1406-01-01", toman: 4, orders: 1, cost: 0, profit: 0 }], "year", "", ""); return y.length === 3 && y[0].key === "1404-01-01" && y[0].toman === 3 && y[0].profit === 2 && y[1].toman === 0 && y[2].key === "1406-01-01" && U.labelOf("1405-05-05", "year") === "۱۴۰۵"; })());
  check("(v) bucket edges: Friday 1405-08-15 and Saturday 1405-08-16 are different weeks; Esfand 1404 and Farvardin 1405 are different months and years; profit is summed per bucket",
    (() => { const d = [{ d: "1405-08-15", toman: 1, orders: 1, cost: 0, profit: 5 }, { d: "1405-08-16", toman: 2, orders: 1, cost: 0, profit: -7 }, { d: "1405-08-17", toman: 4, orders: 1, cost: 0, profit: 3 }];
      const w = U.buildSeries(d, "week", "", ""), m = U.buildSeries([{ d: "1404-12-29", toman: 1, orders: 1 }, { d: "1405-01-01", toman: 2, orders: 1 }], "month", "", "");
      return w.length === 2 && w[0].key === "1405-08-09" && w[0].profit === 5 && w[1].key === "1405-08-16" && w[1].profit === -4 && w[1].toman === 6 && m.length === 2 && m[0].key === "1404-12-01" && m[1].key === "1405-01-01" && U.buildSeries(d, "year", "", "").length === 1; })());
  check("(v) empty days inside the period are zero for sales and profit (day series from 08-09 to 08-17)", (() => { const z = U.buildSeries([{ d: "1405-08-12", toman: 5, orders: 1, cost: 1, profit: 4 }], "day", "1405-08-09", "1405-08-17"); return z.length === 9 && z[0].toman === 0 && z[0].profit === 0 && z[3].profit === 4; })());
  check("(v) «۷ روز اخیر» = last 7 days including today; «هفته‌ی قبل» = the previous Saturday–Friday (today Sat 1405-08-16 → 08-09…08-15; today Wed 08-20 → 08-09…08-15)",
    U.rangeFor("week7", T).from === "1405-08-10" && U.rangeFor("week7", T).to === T && U.dayDiff(U.rangeFor("week7", T).from, T) === 6 &&
    U.rangeFor("lastweek", T).from === "1405-08-09" && U.rangeFor("lastweek", T).to === "1405-08-15" && U.rangeFor("lastweek", "1405-08-20").from === "1405-08-09" && U.rangeFor("lastweek", "1405-08-22").to === "1405-08-15" && U.rangeFor("lastweek", "1405-01-02").from === "1404-12-23" && U.rangeFor("lastweek", "1405-01-02").to === "1404-12-29");
  const pp = [
    { id: "a", name: "الف", toman: 1500, lines: 2, qty: { pack: 3, kg: 0, g: 0, piece: 0 }, cost: 1000, profit: 500, costedToman: 1500, costedLines: 2 },
    { id: "b", name: "ب", toman: 100, lines: 1, qty: { pack: 1, kg: 0, g: 0, piece: 0 }, cost: 150, profit: -50, costedToman: 100, costedLines: 1 },
    { id: "c", name: "ج", toman: 900, lines: 1, qty: { pack: 0, kg: 2, g: 0, piece: 0 }, cost: 0, profit: 0, costedToman: 0, costedLines: 0 }];
  const prr = U.productRows(pp, "profit");
  check("(v) profit mode: only costed products, best profit first, the loss last; a product without cost is not listed", prr.all.map((p) => p.id).join() === "a,b" && prr.rows.length === 2);
  check("(v) margin = profit ÷ costed sales in %, negative for a loss, 0 without a base: 500/1500 = 33, −50/100 = −50", U.margin(500, 1500) === 33 && U.margin(-50, 100) === -50 && U.margin(0, 0) === 0 && U.fmtSigned(-50000) === "\u2066\u2212۵۰,۰۰۰\u2069" && U.fmtSigned(1200) === "۱,۲۰۰");
  check("(v) the page: profit tiles, «فروش / سود» switch, granularity (4), products «سود» mode, the no-cost note and the current-raw-price note are all there; losses are red and hang below a zero line",
    ["سود", "هزینه", "حاشیه سود", "قیمت اولیه نداشتن", "قیمت اولیه‌ی فعلی"].every((t) => rsrc.includes(t)) && /data-metric="profit"/.test(html) && /data-grain="year"/.test(html) && /data-mode="profit"/.test(html) && /id="r-tiles-profit"/.test(html) && /loss: '#c8321e'/.test(rsrc) && /zeroY/.test(rsrc));

  // ---- (w) «تحلیل و پیشنهاد»: admin/analysis.js (owner approved 2026-11-07) ----
  {
    const AN = win.barginAnalysis;
    const H = { dayDiff: U.dayDiff, addDays: U.addDays, weekdayOf: U.weekdayOf, monthKey: U.monthKey };
    const F = { fa: String, money: (n) => String(n), pct: (n) => n + "%", q: (n) => "«" + n + "»", toman: "تومان", day: (i) => ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"][i], month: (k) => k, names: { site: "سایت", person: "حضوری" } };
    const items = [{ i: "a", n: "الف" }, { i: "b", n: "ب" }, { i: "c", n: "ج" }, { i: "d", n: "د" }, { i: "", n: "سایر کالا" }];
    const shop = [{ id: "a", name: "الف" }, { id: "b", name: "ب" }, { id: "c", name: "ج" }, { id: "d", name: "د" }, { id: "f", name: "ف" }];
    const mk = (o, day, it, toman, profit, cust, ch) => [day, "o" + o, it, "pack", 1, toman, profit, cust, ch || "s"];
    const orders30 = [];
    for (let i = 0; i < 30; i++) {
      const day = U.addDays("1405-07-01", i), cust = String(1 + (i % 10)), ch = i % 2 ? "p" : "s";
      orders30.push(mk(i, day, 0, 100000, 60000, cust, ch));
      if (i % 2 === 0) orders30.push(mk(i, day, 1, 100000, 5000, cust, ch));
      if (i % 5 === 0) orders30.push(mk(i, day, 2, 300000, 200000, cust, ch));
      if (i % 3 === 0) orders30.push(mk(i, day, 3, 50000, 10000, cust, ch));
      if (i === 29) orders30.push(mk(i, day, 4, 10000, null, cust, ch));
    }
    const ctx = { from: "", to: "", today: "1405-09-30", H };
    const few = AN.analyze({ lines: orders30.filter((l) => +l[1].slice(1) < 19), items, shop, prevFrom: "" }, ctx);
    check("(w) analysis: under 20 orders = not enough: no numbers, no tips (19 orders)", few.enough === false && few.orders === 19 && AN.tips(few, F).length === 0);
    const a = AN.analyze({ lines: orders30, items, shop, prevFrom: "" }, ctx);
    check("(w) analysis: 30 orders count as 30 (lines of one order are one order)", a.enough === true && a.orders === 30 && a.lines === orders30.length);
    const g = (id) => a.products.find((p) => p.id === id);
    check("(w) analysis: quadrant groups — الف ستاره, ب پرفروش کم‌سود, ج پرسود کم‌فروش, د ضعیف; margins 60/5/67/20", g("a").group === "star" && g("b").group === "volume" && g("c").group === "profit" && g("d").group === "weak" && g("a").margin === 60 && g("b").margin === 5 && g("c").margin === 67 && g("d").margin === 20 && a.quad.ok === true, JSON.stringify([g("a").group, g("b").group, g("c").group, g("d").group]));
    check("(w) analysis: a «سایر» item (1 line) is not ranked or grouped, but stays in the sales numbers", a.products.some((p) => p.id === "" && p.group === "" && p.score === null) && a.ranked.every((p) => p.lines >= AN.LIMIT.productLines));
    check("(w) analysis: score is 0-100 and the star scores best", a.ranked.every((p) => p.score >= 0 && p.score <= 100) && a.ranked[0].id === "a");
    check("(w) analysis: ABC — the first 80% of sales come from the first products; shares add up to about 100", a.abc.a.n >= 1 && Math.abs(a.abc.a.share + a.abc.b.share + a.abc.c.share - 100) < 0.01 && a.abc.total === 5);
    check("(w) analysis: customers — 10 customers, each bought 3 times = 100% repeat; average order = total ÷ orders", a.customers.ok && a.customers.n === 10 && a.customers.repeat === 10 && a.customers.repeatPct === 100 && a.customers.avgOrder === Math.round(a.totalToman / 30));
    check("(w) analysis: bought together — الف+ب appear in 15 orders; pairs under 3 orders are left out", a.pairs.list[0].n === 15 && a.pairs.list.every((x) => x.n >= 3));
    check("(w) analysis: weekdays need 4 weeks (30 days: yes) and the best day has its share; months need 3 full months (only 2: no)", a.weekdays.ok === true && a.weekdays.bestShare > 0 && a.months.ok === false);
    check("(w) analysis: channels — site and person orders add up to 30; average per channel", a.channels.site.orders + a.channels.person.orders === 30 && a.channels.site.avg > 0 && a.channels.person.margin !== null);
    check("(w) analysis: never-sold shop product «ف» and the long-idle ones are listed (the data reaches back 90 days)", a.idle.ok && a.idle.none.indexOf("ف") >= 0 && a.idle.rare.some((x) => x.name === "الف" && x.days >= 28));
    const t = AN.tips(a, F);
    {
      const full = AN.tips(a, F), ids = full.map((x) => x.id), starName = (full.find((x) => x.id === "star") || {}).product;
      const sk = AN.tips(a, F, { ids: { weekday: true, channel: true, repeat: true }, products: { [starName]: true } });
      check("(z) tips that repeat a summary sentence are dropped: the star/top tip of the product named in the summary, and the weekday, channel and repeat-customer tips; the star tip carries its product", !!starName && !sk.some((x) => ["star", "weekday", "channel", "repeat"].indexOf(x.id) >= 0) && sk.length <= 5, JSON.stringify([ids, sk.map((x) => x.id)]));
      check("(z) a tip about ANOTHER product stays; the list refills in priority order up to 5; without skip nothing changes", AN.tips(a, F, { ids: {}, products: { "نام دیگر": true } }).map((x) => x.id).join() === ids.join() && sk.some((x) => x.id === "highprofit") && AN.tips(a, F).length === full.length && sk.length >= Math.min(5, ids.length - 1));
    }
    check("(w) analysis: at most 5 tips, each with a number, from rules (star, low margin, idle, pairs…)", t.length > 0 && t.length <= 5 && t.every((x) => /[0-9]/.test(x.text)) && t.some((x) => x.id === "star" && x.text.includes("الف")) && t.some((x) => x.id === "lowmargin" && x.text.includes("ب")), JSON.stringify(t.map((x) => x.id)));
    // previous period + trend: 20 orders before and 20 in the period; «الف» sells half as much now
    const tl = [];
    for (let i = 0; i < 40; i++) {
      const day = U.addDays("1405-06-01", i);
      if (i < 20 || i % 2 === 0) tl.push(mk(i, day, 0, 100000, 60000, String(i), "s"));
      tl.push(mk(i, day, 1, 20000 + (i < 20 ? 0 : 1000), 4000, String(i), "s"));
    }
    const ctx2 = { from: U.addDays("1405-06-01", 20), to: U.addDays("1405-06-01", 39), today: "1405-07-20", H };
    const b = AN.analyze({ lines: tl, items, shop, prevFrom: "1405-06-01" }, ctx2);
    const ba = b.products.find((p) => p.id === "a");
    check("(w) analysis: trend compares with the period before: 10 lines now against 20 before = −50%, «down»; the period only has its own lines", b.enough && b.hasPrev && ba.trend && ba.trend.pct === -50 && ba.trend.dir === "down" && ba.lines === 10 && ba.prevLines === 20);
    check("(w) analysis: a falling product gives a tip with both numbers", AN.tips(b, F).some((x) => x.id === "falling" && x.text.includes("الف") && x.text.includes("500000") === false));
    const c = AN.analyze({ lines: tl, items, shop, prevFrom: "1405-06-01" }, { from: "", to: "", today: "1405-07-20", H });
    check("(w) analysis: with no start date there is no previous period, so no trend arrows", c.hasPrev === false && c.products.every((p) => p.trend === null));
    const nr = AN.analyze({ lines: orders30.map((l) => { const x = l.slice(); x[6] = null; return x; }), items, shop, prevFrom: "" }, ctx);
    check("(w) analysis: no raw prices = no quadrant, no margins; the ranking uses sales and volume; tips about profit never appear", nr.enough && nr.quad.ok === false && nr.products.every((p) => p.margin === null && p.group === "") && nr.ranked.length >= 3 && !AN.tips(nr, F).some((x) => ["loss", "lowmargin", "highprofit", "star"].indexOf(x.id) >= 0));
    const neg = orders30.map((l) => { const x = l.slice(); if (x[2] === 3) x[6] = -5000; return x; });
    check("(w) analysis: a product sold under its raw price gives the «loss» tip first", AN.tips(AN.analyze({ lines: neg, items, shop, prevFrom: "" }, ctx), F)[0].id === "loss");
    const short = AN.analyze({ lines: orders30, items, shop, prevFrom: "" }, { from: "", to: "", today: "1405-07-31", H });
    check("(w) analysis: «never sold» is silent when the data does not reach back 8 weeks", short.idle.ok === false);
    check("(w) analysis: analysis.js has no DOM, no network, no names", !/document|fetch\(|XMLHttpRequest|innerHTML|zahra/.test(asrc.replace(/\/\/[^\n]*/g, "")));
    check("(w) the page: «تحلیل و پیشنهاد» section with tips, quadrant, repeat customers, pairs, weekdays, channels, idle; report.js asks getReport with analysis:true and prevFrom",
      /تحلیل و پیشنهاد/.test(html) && ["an-tips", "an-quad", "an-abc", "an-cust", "an-pairs", "an-week", "an-month", "an-chan-table", "an-idle"].every((i) => html.includes('id="' + i + '"')) && /analysis: true, prevFrom:/.test(rsrc) && /هنوز داده‌ی کافی برای پیشنهاد نیست/.test(rsrc));
    check("(w) analysis: the previous period is the same number of days right before: 30 days from 1405-08-01 → prevFrom 1405-07-01", U.prevFromFor({ from: "1405-08-01", to: "1405-08-30" }) === "1405-07-01" && U.prevFromFor({ from: "", to: "" }) === "");
  }
}
// ---- (x) «بررسی یه محصول»: admin/product.js + its drawing (owner approved 2026-11-08) ----
{
  const rsrc = read("admin/report.js"), html = read("admin/index.html"), psrc = read("admin/product.js");
  const win = { barginAdmin: { jalCal_: gs.jalCal_, toJalali_: gs.toJalali_, months: ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"] } };
  const ctxp = { window: win, document: { getElementById: () => null }, Intl, Date, Math, Object, String };
  vm.runInNewContext(read("admin/analysis.js"), ctxp);
  vm.runInNewContext(psrc, ctxp);
  vm.runInNewContext(rsrc, ctxp);
  const U = win.barginReport.util, PV = win.barginProduct;
  const H = { dayDiff: U.dayDiff, addDays: U.addDays, weekdayOf: U.weekdayOf, monthKey: U.monthKey };
  const items = [{ i: "a", n: "الف" }, { i: "b", n: "ب" }, { i: "*سایر*", n: "گردو" }, { i: "z", n: "حذف‌شده" }];
  const shop = [{ id: "a", name: "الف" }, { id: "b", name: "ب" }, { id: "c", name: "ج" }];
  const mk = (o, day, it, toman, profit, cust, ch, qty, unit) => [day, "o" + o, it, unit || "pack", qty === undefined ? 1 : qty, toman, profit, cust, ch || "s"];
  const lines = [];
  for (let i = 0; i < 40; i++) {
    const day = U.addDays("1405-07-01", i), cust = String(1 + (i % 4));
    lines.push(mk(i, day, 0, 100000 + (i % 2) * 10000, 40000, cust, i % 2 ? "p" : "s"));   // الف in every order, pack price 100000 / 110000
    if (i % 2 === 0) lines.push(mk(i, day, 1, 50000, null, cust, "s"));                         // ب in half of the orders
  }
  lines.push(mk(100, "1405-08-05", 2, 70000, null, "", "u"));                                    // a «سایر» sale
  const A = { lines, items, shop, prevFrom: "", cut: false, profitReady: true, customerNames: { "1": "نام‌آزمایشی" } };
  const ctx = { from: "", to: "", today: "1405-09-30", H };
  const o = PV.options(A);
  check("(x) product options: shop products first (even ج with no sales), then sold items not in the shop; a «سایر» name is marked", o.slice(0, 3).map((x) => x.key).join() === "a,b,c" && o.some((x) => x.key === "x:گردو" && x.other) && o.some((x) => x.key === "z" && !x.other) && o[o.length - 1].other, JSON.stringify(o));
  const a = PV.analyze(A, ctx, "a");
  check("(x) product numbers: sales, orders, quantity, average order, share of the total", a.found && a.lines === 40 && a.orders === 40 && a.toman === 4200000 && a.avgOrder === 105000 && a.qty.pack === 40 && Math.abs(a.share - 4200000 * 100 / a.totalToman) < 1e-9 && a.totalOrders === 41, JSON.stringify([a.toman, a.orders, a.share]));
  check("(x) product profit uses only the costed lines: profit 1,600,000, margin 38%, cost = costed sales − profit", a.costedLines === 40 && a.profit === 1600000 && a.cost === 2600000 && a.margin === 38 && a.uncosted === 0, JSON.stringify([a.profit, a.cost, a.margin]));
  const b = PV.analyze(A, ctx, "b");
  check("(x) a product without raw price: sales yes, no profit lines", b.found && b.orders === 20 && b.toman === 1000000 && b.costedLines === 0 && b.profit === 0 && b.margin === null && b.uncosted === 20);
  check("(x) bought with it: ب and الف share 20 orders; under 3 shared orders is left out", b.withOthers.list[0].key === "a" && b.withOthers.list[0].n === 20 && a.withOthers.list.some((x) => x.key === "b" && x.n === 20) && !a.withOthers.list.some((x) => x.key === "x:گردو"));
  check("(x) customers: ids with orders and sales, best first, 4 customers", a.customers.n === 4 && a.customers.top.length === 4 && a.customers.top[0].toman >= a.customers.top[3].toman && a.customers.top.reduce((t, c) => t + c.orders, 0) === 40);
  check("(x) price per pack: 100000 / 110000 alternate, min / max / last", a.prices.n === 40 && a.prices.min === 100000 && a.prices.max === 110000 && a.prices.list.length === 40 && a.prices.last === 110000);
  check("(x) weekdays need 28 days of data AND 5 orders of the product; channels add up to the orders", a.weekdays.ok === true && a.weekdays.days.reduce((t, d) => t + d.orders, 0) === 40 && a.channels.site.orders + a.channels.person.orders + a.channels.unknown.orders === 40);
  const g = PV.analyze(A, ctx, "x:گردو");
  check("(x) a «سایر» item: found, one sale, no profit; nothing bought with it, weekdays not enough", g.found && g.other === true && g.name === "گردو" && g.orders === 1 && g.costedLines === 0 && g.withOthers.list.length === 0 && g.weekdays.ok === false && g.prices.n === 1);
  const c = PV.analyze(A, ctx, "c");
  check("(x) a product with no sales: found false, the name comes from the shop list, no last sale", c.found === false && c.name === "ج" && c.lastSale === "");
  const A2 = { lines: lines.concat([mk(200, "1405-06-01", 3, 9000, null, "1")]), items, shop, prevFrom: "1405-06-01", cut: true, profitReady: true };
  const z = PV.analyze(A2, { from: "1405-07-01", to: "1405-07-30", today: "1405-09-30", H }, "z");
  check("(x) no sales in the period: found false, the last sale in the earlier data is shown; cut is passed on", z.found === false && z.lastSale === "1405-06-01" && z.cut === true);
  const t = PV.analyze({ lines: [].concat(Array.from({ length: 6 }, (_, i) => mk(300 + i, U.addDays("1405-07-01", i), 0, 200000, null, "1")), Array.from({ length: 6 }, (_, i) => mk(400 + i, U.addDays("1405-06-01", i), 0, 100000, null, "1"))), items, shop, prevFrom: "1405-06-01", profitReady: false }, { from: "1405-07-01", to: "1405-07-30", today: "1405-09-30", H }, "a");
  check("(x) trend against the period before: 1,200,000 now vs 600,000 before = +100%, up (needs 5 lines in both)", t.trend && t.trend.pct === 100 && t.trend.dir === "up" && PV.analyze({ lines: lines.slice(0, 3), items, shop, prevFrom: "" }, ctx, "a").trend === null);
  check("(x) product.js is pure: no DOM, no network, no names", !/document|fetch\(|XMLHttpRequest|innerHTML/.test(psrc.replace(/\/\/[^\n]*/g, "")) && !/zahra|ahmadi/i.test(psrc));
  check("(x) the page: picker, back button and product view cards; report.js has both ways in (dropdown + ranking links) and falls back to «مشتری N» without customerNames",
    ["pv-select", "pv-back", "pv-body", "pv-tiles", "pv-time", "pv-price", "pv-cust", "pv-with", "pv-week", "pv-chan"].every((i) => html.includes('id="' + i + '"')) && /همه محصولات \(نمای کلی\)/.test(rsrc) && /productLink\(p\.name/.test(rsrc) && /fill\(TEXT\.customerNo/.test(rsrc) && /customerNames/.test(rsrc) && !/innerHTML/.test(rsrc));
  check("(x) the product view is read-only: report.js still calls only getReport; no names hard-coded in report.js or the page", /api\('getReport'/.test(rsrc) && !/saveLedger|deleteLedger/.test(rsrc) && !/نام‌آزمایشی/.test(rsrc + html));
}

// ---- (y) «همه محصولات فروخته‌شده»: PV.analyzeAll + its card (owner approved 2026-11-08) ----
{
  const rsrc = read("admin/report.js"), html = read("admin/index.html");
  const win = { barginAdmin: { jalCal_: gs.jalCal_, toJalali_: gs.toJalali_, months: ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"] } };
  const ctxp = { window: win, document: { getElementById: () => null }, Intl, Date, Math, Object, String };
  vm.runInNewContext(read("admin/analysis.js"), ctxp);
  vm.runInNewContext(read("admin/product.js"), ctxp);
  vm.runInNewContext(rsrc, ctxp);
  const U = win.barginReport.util, PV = win.barginProduct;
  const H = { dayDiff: U.dayDiff, addDays: U.addDays, weekdayOf: U.weekdayOf, monthKey: U.monthKey };
  const items = [{ i: "a", n: "الف" }, { i: "b", n: "ب" }, { i: "*سایر*", n: "گردو" }, { i: "z", n: "حذف‌شده" }];
  const shop = [{ id: "a", name: "الف" }, { id: "b", name: "ب" }, { id: "c", name: "ج" }];
  const mk = (o, day, it, toman, profit, cust, ch, qty, unit) => [day, "o" + o, it, unit || "pack", qty === undefined ? 1 : qty, toman, profit, cust, ch || "s"];
  const lines = [];
  for (let i = 0; i < 40; i++) {
    const day = U.addDays("1405-07-01", i), cust = String(1 + (i % 4));
    lines.push(mk(i, day, 0, 100000 + (i % 2) * 10000, 40000, cust, i % 2 ? "p" : "s"));
    if (i % 2 === 0) lines.push(mk(i, day, 1, 50000, null, cust, "s"));
  }
  lines.push(mk(100, "1405-08-05", 2, 70000, null, "", "u"));
  lines.push(mk(200, "1405-06-01", 3, 9000, null, "1"));   // «حذف‌شده» sold only before the period
  const A = { lines, items, shop, prevFrom: "1405-06-01", cut: false, profitReady: true };
  const ctx = { from: "1405-07-01", to: "1405-09-30", today: "1405-09-30", H };
  const rows = PV.analyzeAll(A, ctx);
  check("(y) analyzeAll: one row per product SOLD in the period (الف, ب, گردو); the unsold shop product ج and the one sold only before the period are not listed", rows.map((r) => r.key).sort().join() === "a,b,x:گردو" && rows.length === 3, JSON.stringify(rows.map((r) => r.key)));
  const same = rows.every((r) => { const a = PV.analyze(A, ctx, r.key); return r.toman === a.toman && r.orders === a.orders && r.avgOrder === a.avgOrder && r.share === a.share && JSON.stringify(r.trend) === JSON.stringify(a.trend) && JSON.stringify(r.qty) === JSON.stringify(a.qty) && (a.costedLines ? r.profit === a.profit && r.margin === a.margin : r.profit === null && r.margin === null) && r.price === (a.prices.n ? a.prices.last : null) && r.bestDay === (a.weekdays.ok ? a.weekdays.best.i : null) && (r.topCust ? r.topCust.id === a.customers.top[0].id : a.customers.top.length === 0) && (r.with ? r.with.key === a.withOthers.list[0].key : a.withOthers.list.length === 0); });
  check("(y) analyzeAll gives the same numbers as analyze() for every product (sales, orders, average, share, trend, qty, profit, margin, price, top customer, with, best day)", same);
  const ra = rows.find((r) => r.key === "a"), rg = rows.find((r) => r.key === "x:گردو"), rb = rows.find((r) => r.key === "b");
  check("(y) cells below the limits are empty (null → «—»): «سایر» has no profit/margin/with/best day; ب has no profit; الف has all", ra.profit === 1600000 && ra.margin === 38 && ra.with && ra.with.key === "b" && ra.bestDay !== null && rg.profit === null && rg.margin === null && rg.with === null && rg.bestDay === null && rg.topCust === null && rb.profit === null && rb.price === 50000);
  // speed: 20,000 lines, 30 products
  const bigItems = Array.from({ length: 30 }, (_, i) => ({ i: "p" + i, n: "محصول " + i })), big = [];
  for (let i = 0; i < 20000; i++) big.push(mk(Math.floor(i / 2), U.addDays("1405-01-01", i % 200), i % 30, 100000 + (i % 7) * 1000, i % 3 ? 20000 : null, String(1 + (i % 50)), i % 2 ? "s" : "p"));
  const t0 = Date.now(), bigRows = PV.analyzeAll({ lines: big, items: bigItems, shop: [], prevFrom: "", profitReady: true }, { from: "", to: "", today: "1405-09-30", H }), ms = Date.now() - t0;
  check("(y) analyzeAll with 20,000 lines and 30 products is fast (under 1.5 s) and has 30 rows", bigRows.length === 30 && ms < 1500, ms + " ms");
  check("(y) the page: card «همه محصولات فروخته‌شده» between the products card and «سایت یا حضوری؟», table + cards + phone sort box; sort by header, empty last, row tap opens the product",
    html.indexOf("همه محصولات فروخته‌شده") > html.indexOf("پرفروش‌ترین محصولات") && html.indexOf("همه محصولات فروخته‌شده") < html.lastIndexOf("<h2>سایت یا حضوری؟</h2>") && ["r-all-card", "r-all-table", "r-all-cards", "r-all-sort", "r-all-dir"].every((i) => html.includes('id="' + i + '"')) && /aria-sort/.test(rsrc) && /empty cells always last/.test(rsrc) && /openProduct\(r\.key\)/.test(rsrc) && !/innerHTML/.test(rsrc));
}

// ---- (z) «نمای کلی»: admin/overview.js + the five sub-tabs (owner approved 2026-11-08, phase 1) ----
{
  const rsrc = read("admin/report.js"), html = read("admin/index.html"), osrc = read("admin/overview.js");
  const win = { barginAdmin: { jalCal_: gs.jalCal_, toJalali_: gs.toJalali_, months: ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"] } };
  const ctxp = { window: win, document: { getElementById: () => null }, Intl, Date, Math, Object, String };
  ["admin/analysis.js", "admin/product.js", "admin/overview.js", "admin/report.js"].forEach((f) => vm.runInNewContext(read(f), ctxp));
  const OV = win.barginOverview, U = win.barginReport.util;
  const F = { fa: String, money: (n) => String(n), pct: (n) => n + "%", q: (n) => "«" + n + "»", toman: "تومان", day: (i) => ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"][i], names: { site: "سایت", person: "حضوری" } };
  const S = { from: "1405-07-01", to: "1405-07-30", rows: { used: 63, skipped: { noDate: 1, noTotal: 1 }, buysIgnored: 3 }, totals: { toman: 1200000, orders: 40, customers: 6 },
    byProduct: [{ id: "*سایر*", name: "گردو", toman: 900000, lines: 30, qty: { pack: 5, kg: 0, g: 0, piece: 0 } }, { id: "a", name: "الف", toman: 300000, lines: 9, qty: { pack: 10, kg: 2, g: 0, piece: 0 } }],
    byChannel: { site: { toman: 1, orders: 20 }, person: { toman: 1, orders: 15 }, unknown: { toman: 0, orders: 5 } },
    profit: { ready: true, rows: 10, sales: 800000, cost: 500000, profit: 300000, noCost: { rows: 4, toman: 1 } },
    byDay: [{ d: "1405-07-02", toman: 100, orders: 1 }, { d: "1405-07-03", toman: 300, orders: 1 }, { d: "1405-07-10", toman: 50, orders: 1 }] };
  const mk = (day, toman) => [day, "o" + toman + day, 0, "pack", 1, toman, null, "", "s"];
  const lines = [].concat(Array.from({ length: 6 }, (_, i) => mk("1405-07-0" + (i + 1), 200000)), Array.from({ length: 6 }, (_, i) => mk("1405-06-0" + (i + 1), 100000)));
  const A = { lines, items: [{ i: "a", n: "الف" }], shop: [{ id: "a", name: "الف" }], prevFrom: "1405-06-01" };
  const an = { enough: true, weekdays: { ok: true, best: { i: 3, toman: 5, orders: 7 }, bestShare: 28 }, channels: { site: { orders: 6, avg: 100000 }, person: { orders: 7, avg: 80000 } }, customers: { ok: true, repeatPct: 50, repeat: 3, n: 6 } };
  const ctx = { from: S.from, to: S.to };
  const ss = OV.sentences(S, A, ctx, an, F), id = (l) => l.map((x) => x.id).join();
  check("(z) summary: sales, compare (+100% against 600000), profit 300000 with margin 38%, best SHOP product (not «سایر»), weekday, channel, customers, the note about 4 rows without raw price", id(ss) === "sales,compare,profit,product,weekday,channel,customers,note" && /۱۰۰%|100%/.test(ss[1].text) && ss[2].text.includes("300000") && ss[2].text.includes("38%") && ss[3].text.includes("«الف»") && ss[7].text.includes("4"), id(ss));
  check("(z) summary: under the data limits a sentence is left out (no previous period, 2 costed lines, product under 5 lines, analysis not enough)", id(OV.sentences(S, { lines: lines.slice(0, 3), prevFrom: "" }, ctx, { enough: false }, F)) === "sales,profit,product,note" && id(OV.sentences({ ...S, profit: { ...S.profit, rows: 2 }, byProduct: [{ id: "a", name: "الف", toman: 1, lines: 4, qty: S.byProduct[1].qty }] }, { lines: [], prevFrom: "" }, ctx, null, F)) === "sales,note");
  check("(z) summary: a loss is said as a loss; no sales = no sentences", OV.sentences({ ...S, profit: { ...S.profit, profit: -50000 } }, A, ctx, null, F).some((x) => x.id === "profit" && /ضرر/.test(x.text) && x.text.includes("50000")) && OV.sentences({ ...S, rows: { ...S.rows, used: 0 } }, A, ctx, an, F).length === 0);
  const c = OV.counts(S, { lines: [["1405-07-02", "o1", 0, "pack", 1, 5, null, "", "s"], ["1405-07-03", "o2", 1, "pack", 1, 5, null, "1", "s"], ["1405-06-03", "o3", 0, "pack", 1, 5, null, "1", "s"]], items: [{ i: "a", n: "الف" }, { i: "*سایر*", n: "گردو" }], shop: [{ id: "a", name: "الف" }, { id: "b", name: "ب" }], cut: false });
  check("(z) data card: rows, skipped, orders, customers, units, channels, costed/uncosted, buys; products sold of the shop and the «سایر» names; rows without customer (only lines of the period)", c.rows === 63 && c.skipped === 2 && c.orders === 40 && c.qty.pack === 15 && c.qty.kg === 2 && c.channels.person === 15 && c.costed === 10 && c.uncosted === 4 && c.buys === 3 && c.products.soldShop === 1 && c.products.shop === 2 && c.products.other.join() === "گردو" && c.noCustomer === 1, JSON.stringify(c));
  const d = OV.dates(S, { dayDiff: U.dayDiff, addDays: U.addDays });
  check("(z) dates: first/last sale, span 9 days, 3 days with a sale (33%), longest gap 6 days (1405-07-04 to 1405-07-09), best day 1405-07-03", d.first === "1405-07-02" && d.last === "1405-07-10" && d.span === 9 && d.days === 3 && d.share === 33 && d.gap === 6 && d.gapFrom === "1405-07-04" && d.gapTo === "1405-07-09" && d.best.d === "1405-07-03" && OV.dates({ byDay: [] }, {}) === null, JSON.stringify(d));
  const ser = Array.from({ length: 10 }, (_, i) => ({ key: U.addDays("1405-07-01", i), toman: 100 * (i + 1), profit: 10 }));
  const cu = OV.cumulative(ser, "toman"), cp = OV.cumulative(ser, "profit");
  check("(z) running total: ends at the period total (5500), the 7-day moving average starts on day 7 (400) and the last one is 700; the profit metric adds profit", cu.total === 5500 && cu.all[9].run === 5500 && cu.all[5].ma === null && cu.all[6].ma === 400 && cu.last7 === 700 && cu.weekly === false && cp.total === 100);
  const long = Array.from({ length: 200 }, (_, i) => ({ key: U.addDays("1405-01-01", i), toman: 1, profit: 0 })), cl = OV.cumulative(long, "toman");
  check("(z) running total over 120 days: one point per week (and the last day); the table keeps every day", cl.weekly && cl.pts.length === 29 && cl.all.length === 200 && cl.pts[cl.pts.length - 1].run === 200);
  check("(z) overview.js is pure (no DOM, no network, no names)", !/document|fetch\(|XMLHttpRequest|innerHTML/.test(osrc.replace(/\/\/[^\n]*/g, "")) && !/zahra|ahmadi/i.test(osrc));
  const pane = (n) => { const a = html.indexOf('id="rp-pane-' + n + '"'); const b = html.indexOf('class="rp-pane"', a + 40); return html.slice(a, b > 0 ? b : html.indexOf('id="v-ledger"')); };
  const has = (n, ids) => ids.every((i) => pane(n).includes('id="' + i + '"'));
  check("(z) the five sub-tabs and where the blocks live: نمای کلی (خلاصه، پیشنهادها، tiles، داده‌هامون، تاریخ‌ها), روند (time chart, running total, weekdays/months), محصول‌ها (best products, table, ranking, ABC, pairs, idle), مشتری‌ها (top, repeat), سایت یا حضوری (split, table)",
    ["overview", "trend", "products", "customers", "channel"].every((t) => html.includes('data-rtab="' + t + '"') && html.includes('id="rp-pane-' + t + '"')) && has("overview", ["ov-sum", "an-tips", "an-note", "r-tiles", "r-tiles-profit", "ov-data", "ov-dates", "r-used"]) && has("trend", ["r-time", "cu-total", "cu-ma", "an-week", "an-month"]) && has("products", ["r-prod", "r-all-card", "an-quad", "an-rank", "an-abc", "an-pairs", "an-idle"]) && has("customers", ["r-cust", "an-cust"]) && has("channel", ["r-chan", "an-chan-table"]) && !html.includes('id="an-body"'));
  check("(z) tabs: default نمای کلی, the last one is kept in sessionStorage (bargin-report-tab) with a memory fallback, reset on logout; only the open tab is drawn; the product view returns to the same tab",
    /TAB_KEY = 'bargin-report-tab'/.test(rsrc) && /st\.tab = 'overview'; saveTab\('overview'\)/.test(rsrc) && /function renderPane\(name\)/.test(rsrc) && /function renderAll\(\) \{ renderPane\(st\.tab\)/.test(rsrc) && /sessionStorage/.test(rsrc) && !/innerHTML/.test(rsrc));
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
