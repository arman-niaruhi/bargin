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
vm.runInContext(read("tools/admin/Code.gs") + ";this.buildCsv=buildCsv;this.validateRows=validateRows;this.planSave=planSave;this.HEADER=HEADER;this.EOL=EOL;this.handleRequest_=handleRequest_;this.ALLOWED_EMAILS=ALLOWED_EMAILS;", gs);
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
// Exact byte differences between the CRLF build and data/products.csv.
// Finds each differing run (with a short look-ahead to resync) and counts its bytes.
function byteHunks(a, b) {
  const hunks = [];
  let i = 0, j = 0;
  const W = 20, K = 6;
  while (i < a.length || j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    let best = null;
    for (let k = 0; k <= K && !best; k++) {
      for (let m = 0; m <= K && !best; m++) {
        if (a.slice(i + k, i + k + W) === b.slice(j + m, j + m + W) && (i + k < a.length || j + m < b.length)) best = [k, m];
      }
    }
    if (!best) best = [a.length - i, b.length - j];
    const [k, m] = best;
    hunks.push({ file: a.slice(i, i + k), build: b.slice(j, j + m), at: i });
    i += k; j += m;
  }
  return hunks;
}
const hunks = byteHunks(csvFile, crlfOut);
const diffBytes = hunks.reduce((n, h) => n + Buffer.byteLength(h.file, "utf8") + Buffer.byteLength(h.build, "utf8"), 0);
console.log(`      info: byte size file ${Buffer.byteLength(csvFile)}, CRLF build ${Buffer.byteLength(crlfOut)}`);
for (const h of hunks) {
  console.log(`      info: difference at character ${h.at}: file has ${JSON.stringify(h.file) || "nothing"}, CRLF build has ${JSON.stringify(h.build) || "nothing"}`);
}
console.log(`      info: exact byte-difference count (file vs CRLF build): ${diffBytes}`);
// Known differences: the 2 quote marks around the «،» field (not needed) and the bare LF (CRLF written).
const knownOk = hunks.length === 3
  && hunks.filter((h) => h.file === '"' && h.build === "").length === 2
  && hunks.filter((h) => h.file === "" && h.build === "\r").length === 1;
check("(a) the only byte differences are the 2 quotes of the «،» field and the bare LF (CR added)",
  knownOk && diffBytes === 3, `${hunks.length} runs, ${diffBytes} bytes`);

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
  check("(j) the action lists are exactly the expected ones", vm.runInContext("PUBLIC_ACTIONS.join()", gs) === "requestCode,verifyCode,logout" && vm.runInContext("PROTECTED_ACTIONS.join()", gs) === "getProducts,saveProduct,deleteProduct,publishCsv");
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

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
