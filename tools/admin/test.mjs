// Tests for the product admin (tools/admin/Code.gs) against data/products.csv.
// Run: node tools/admin/test.mjs   (exits with code 1 if a check fails)
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const csvFile = read("data/products.csv");

// Code.gs: pure functions only (no Apps Script calls at load time)
const gs = {};
vm.runInNewContext(read("tools/admin/Code.gs") + ";this.buildCsv=buildCsv;this.validateRows=validateRows;this.planSave=planSave;this.HEADER=HEADER;this.EOL=EOL;this.checkClaims_=checkClaims_;this.handleRequest_=handleRequest_;this.tokenShapeOk_=tokenShapeOk_;this.ACTION_NAMES=ACTION_NAMES;this.ADMIN_CLIENT_ID=ADMIN_CLIENT_ID;this.OWNER_EMAIL=OWNER_EMAIL;", gs);

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

// (e) token claims (checkClaims_ is pure)
const OWNER = gs.OWNER_EMAIL, CID = "123-abc.apps.googleusercontent.com", NOW = 1800000000;
const good = () => ({ iss: "https://accounts.google.com", aud: CID, exp: String(NOW + 600), email: OWNER, email_verified: "true" });
const cc = (over, cid = CID) => gs.checkClaims_({ ...good(), ...over }, NOW, cid, OWNER);
check("(e) good claims are accepted", cc({}).ok === true && cc({}).email === OWNER);
check("(e) iss accounts.google.com is accepted too", cc({ iss: "accounts.google.com" }).ok === true);
check("(e) email_verified true (boolean) is accepted", cc({ email_verified: true }).ok === true);
check("(e) owner email in other case is accepted", cc({ email: OWNER.toUpperCase() }).ok === true);
check("(e) wrong audience refused", cc({ aud: "other" }).reason === "audience");
check("(e) wrong issuer refused", cc({ iss: "https://evil.example" }).reason === "issuer");
check("(e) expired refused", cc({ exp: String(NOW - 1) }).reason === "expired");
check("(e) exp missing or not a number refused", cc({ exp: undefined }).ok === false && cc({ exp: "abc" }).ok === false);
check("(e) email not verified refused", cc({ email_verified: "false" }).reason === "unverified" && cc({ email_verified: undefined }).ok === false);
check("(e) other account refused (forbidden)", cc({ email: "someone@gmail.com" }).reason === "forbidden");
check("(e) missing email refused", cc({ email: undefined }).ok === false);
check("(e) empty client ID in settings refuses everything", cc({ aud: "" }, "").reason === "config");
check("(e) null / non-object claims refused", gs.checkClaims_(null, NOW, CID, OWNER).ok === false && gs.checkClaims_("x", NOW, CID, OWNER).ok === false);
check("(e) ADMIN_CLIENT_ID placeholder in Code.gs is empty (owner fills it in)", gs.ADMIN_CLIENT_ID === "");

// (f) token shape
const TOK = "aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc";
check("(f) a JWT-shaped token passes", gs.tokenShapeOk_(TOK));
check("(f) empty, non-string, no dots, bad characters, oversized tokens fail",
  ["", null, 5, "abc", "a.b", "aaaaaaaaaaaa.bbbbbbbbbbbb.cccc cccccccc", "aaaaaaaaaaaa.bbbbbbbbbbbb.cccccc!ccccc", "a".repeat(5000) + ".b.c"].every((t) => !gs.tokenShapeOk_(t)));

// (g) dispatcher: no action runs unless the token is verified and is the owner's
function harness(verifyResult) {
  const calls = { verify: 0, ran: [] };
  const actions = {};
  for (const name of ["getProducts", "saveProduct", "deleteProduct", "publishCsv", "evil"]) {
    actions[name] = (d) => { calls.ran.push(name); return { name, d }; };
  }
  const deps = { owner: OWNER, actions, verify: (t) => { calls.verify++; return typeof verifyResult === "function" ? verifyResult(t) : verifyResult; } };
  return { calls, run: (body) => gs.handleRequest_(typeof body === "string" ? body : JSON.stringify(body), deps) };
}
const okWho = { ok: true, email: OWNER };
const req = (action, data) => ({ token: TOK, action, ...(data === undefined ? {} : { data }) });
{
  const h = harness(okWho);
  const r = h.run(req("saveProduct", { item: { id: "x" }, originalId: "" }));
  check("(g) verified owner: the action runs once with its data", r.ok === true && h.calls.ran.join() === "saveProduct" && r.data.d.item.id === "x", JSON.stringify(r));
  for (const a of ["getProducts", "deleteProduct", "publishCsv"]) {
    check(`(g) allow-list action ${a} runs`, harness(okWho).run(req(a, {})).ok === true);
  }
}
{
  const failures = [
    ["token rejected by Google", { ok: false, reason: "rejected" }, "auth"],
    ["token expired", { ok: false, reason: "expired" }, "auth"],
    ["wrong audience", { ok: false, reason: "audience" }, "auth"],
    ["other Google account", { ok: false, reason: "forbidden" }, "forbidden"],
    ["verify returns nothing", undefined, "auth"],
    ["verify says ok for another email (second guard)", { ok: true, email: "x@gmail.com" }, "forbidden"],
    ["verify throws", () => { throw new Error("boom"); }, "server"]
  ];
  for (const [name, result, want] of failures) {
    const h = harness(result);
    const r = h.run(req("deleteProduct", { id: "a" }));
    check(`(g) failed verify (${name}): refused as ${want}, no write function ran`,
      r.ok === false && r.error === want && h.calls.ran.length === 0, JSON.stringify(r));
  }
}
{
  const bad = [
    ["not JSON", "{oops"], ["empty body", ""], ["JSON array", "[]"], ["JSON null", "null"], ["number", "5"],
    ["no token", { action: "getProducts" }], ["token not JWT-shaped", { token: "abc", action: "getProducts" }],
    ["token not a string", { token: 5, action: "getProducts" }], ["oversized token", { token: "a".repeat(5000) + ".b.c", action: "getProducts" }],
    ["data is an array", { token: TOK, action: "getProducts", data: [] }], ["data is a string", { token: TOK, action: "getProducts", data: "x" }],
    ["body over the size limit", JSON.stringify({ token: TOK, action: "getProducts", data: { big: "x".repeat(250000) } })]
  ];
  for (const [name, body] of bad) {
    const h = harness(okWho);
    const r = h.run(body);
    check(`(g) malformed request (${name}) refused before any fetch or action`,
      r.ok === false && r.error === "bad_request" && h.calls.verify === 0 && h.calls.ran.length === 0, JSON.stringify(r));
  }
  for (const a of ["evil", "constructor", "__proto__", "toString", "", 5, null]) {
    const h = harness(okWho);
    const r = h.run({ token: TOK, action: a });
    check(`(g) unknown action ${JSON.stringify(a)} refused before verify`,
      r.ok === false && r.error === "unknown_action" && h.calls.verify === 0 && h.calls.ran.length === 0, JSON.stringify(r));
  }
  const h = harness(okWho);
  h.run("{oops");
  check("(g) only the 4 allowed actions exist", gs.ACTION_NAMES.join() === "getProducts,saveProduct,deleteProduct,publishCsv");
}
{
  const throwing = { owner: OWNER, verify: () => okWho, actions: { getProducts: () => { throw new Error("sheet down"); } } };
  const r = gs.handleRequest_(JSON.stringify(req("getProducts")), throwing);
  check("(g) an action that throws gives a plain server error (no details leak)", r.ok === false && r.error === "server" && !JSON.stringify(r).includes("sheet"), JSON.stringify(r));
}

// (h) no old HtmlService page; doGet is plain text
{
  const src = read("tools/admin/Code.gs");
  check("(h) Code.gs no longer uses HtmlService", !/HtmlService/.test(src));
  check("(h) every sheet function still calls assertOwner (second guard)",
    ["getProducts", "saveProduct", "deleteProduct", "publishCsv"].every((f) => new RegExp("function " + f + "\\([^)]*\\) \\{\\s*assertOwner\\(\\)").test(src)));
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
