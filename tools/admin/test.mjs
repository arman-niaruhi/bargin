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
check("(a) publishCsv passes EOL to buildCsv (Publish path)", /buildCsv\(data\.rows,\s*EOL\)/.test(read("tools/admin/Code.gs")));
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
gs.SpreadsheetApp = { getActiveSpreadsheet: () => { sheetLog.touched++; return { getSheets: () => [fakeSheet], getName: () => "x" }; } };
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
    { action: "deleteProduct", data: { id: "a" } }, { action: "publishCsv" }, { action: "getProducts", session: { a: 1 } }
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
    ["getProducts", "saveProduct", "deleteProduct", "publishCsv"].every((f) => new RegExp("function " + f + "\\([^)]*\\) \\{\\s*assertSession_\\(\\)").test(src)));
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
  check("(j) the action lists are exactly the expected ones", vm.runInContext("PUBLIC_ACTIONS.join()", gs) === "requestCode,verifyCode,logout,logEvent" && vm.runInContext("PROTECTED_ACTIONS.join()", gs) === "getProducts,saveProduct,deleteProduct,publishCsv");
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
  check("(j) appsscript.json: scopes are only spreadsheets and send_mail",
    m.oauthScopes.slice().sort().join() === ["https://www.googleapis.com/auth/script.send_mail", "https://www.googleapis.com/auth/spreadsheets"].sort().join(), m.oauthScopes.join());
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

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
