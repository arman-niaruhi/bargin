# Product admin (admin page on the site + Google Sheet + Apps Script)

The admin page is **`/admin/`** on the site (`admin/index.html` + `admin/admin.js`). The people on the allowed list log in with a
**one-time code sent by email** (the list is `ALLOWED_EMAILS` in `Code.gs`: arman.niaruhi@gmail.com and zeinabkia023@gmail.com), edit products there, and can download a CSV
backup. The Google Sheet is the product data; the site reads its published CSV.
Owner decision 2026-10-23: email-code login. No Google sign-in, no Google Cloud project, no OAuth client.

## How it works
1. The person TYPES their email on the login screen (nothing on the page lists the allowed emails). The page asks the
   Apps Script web app (`doPost` in `tools/admin/Code.gs`) for a code (`requestCode` with `{email}`).
2. The email is trimmed and lowercased; malformed input is refused at once. If it is on `ALLOWED_EMAILS`, the script emails a
   **6-digit code to that list entry only** (never to the raw text of the request). The code is in the mail subject
   («کد ورود برگین: 123456»). If it is NOT on the list, nothing is mailed but the answer looks the same (same shape, a
   decoy challenge that never logs in, a short pause like a real send, same cooldown and caps), so nobody can find out
   which emails are allowed.
3. The person types the code (`verifyCode`). The challenge remembers its email, so a code for one address cannot log in as
   the other. Right code = a random **session token** (stored hashed) that remembers the email.
4. Every other action (getProducts, saveProduct, deleteProduct, publishCsv) needs that token. The check is in one
   place (`handleRequest_`) and again inside each sheet function; both checks need the session's email to still be on
   `ALLOWED_EMAILS`. No valid session = `NO_SESSION`, nothing is read or written.

Rules in `Code.gs`:
- Code: 6 digits, only from `Utilities.getUuid()` with rejection sampling; stored hashed (SHA-256 with its challenge id)
  in CacheService; valid **10 minutes**, **5 tries**, **single use**; constant-time compare; Persian/Arabic digits accepted.
  A new code cancels the old one.
- Sending caps (kept in script properties, so a cache reset does not lift them): **60 s** between sends, **10 per hour**,
  **30 per day**. A send that fails (MailApp error) is not counted and does not start the 60 s wait. (MailApp's own limit for a normal account is about 100 mails a day.)
- Session: **1 hour idle** (each use renews it) and **6 hours absolute**; stored hashed; `logout` deletes it on the server.
- `LockService` around every read-modify-write (sending, checking a code, save, delete). If the lock cannot be taken the
  answer is `BUSY` and nothing changes (fail closed).
- `doGet` returns only `{"ok":true,"service":"bargin-admin"}`. No page, no data. Codes and tokens are never logged.
- In the browser the session is in `sessionStorage` (stays on reload in the same tab, gone when the tab closes), with a
  memory fallback. If the session ends while a form is open, the page goes to the login and keeps what was typed.

Settings (not secret) are in `products.js`: `SHOP.adminApi` (the web app `/exec` URL). Empty = the page shows
«صفحه‌ی مدیریت هنوز راه‌اندازی نشده…».

## Allowed emails
- `ALLOWED_EMAILS` at the top of `Code.gs` (lowercase). **To add or remove someone: edit that list, then deploy a New
  version** (Manage deployments). Removing an address also ends that person's sessions at the next request.
- **Everyone on the list has full admin access** (edit and delete every product, download the CSV). There are no roles.
- The send caps (60 s apart, 10/hour, 30/day) are shared by all addresses. Requests for unknown addresses also start the
  60 s cooldown but are not counted in the hour/day send log.

## Residual risks (accepted)
- **Each listed Gmail account is a way in.** Anyone who can read any listed mailbox can log in, so each person needs a strong
  password and 2-step verification on their own account. Remove addresses that are no longer needed.
- Timing of the answer for an unknown address is only about the same as for a real one (a 0.7 s pause); a very careful
  observer might still tell them apart. The page itself never lists the emails, and the code is in this repo, so the list is
  not secret from someone who can read the code.
- Whoever can read the owner's mailbox can log in (that is the whole point of the email code). Use a strong password and
  2-step verification on the Gmail account.
- Someone who knows the web app URL can make the script email a code to the owner (up to 10 per hour / 30 per day). It is only
  annoying. A guess needs the right 6 digits in 5 tries: about 5 in a million per code, at most 50 guesses an hour.
- CacheService is not a guaranteed store: Google may drop a code or session early (the owner just logs in again). It can never
  make a session last longer than 6 hours. The sending caps are in script properties and survive it.
- The page and the URL are public (`ANYONE_ANONYMOUS`); the protection is the code and session, not a secret URL.
- Browser extensions or malware on the owner's computer can read the page and the session while it is open.

## One-time setup
1. Open the Google Sheet (first sheet header: `id, name, category, price, unit, serves, short, details, recipe, images, soldOut`,
   formatted as plain text) → **Extensions → Apps Script**.
2. Put `tools/admin/Code.gs` into `Code.gs`. **Delete the old `admin` HTML file** if the project still has one.
3. **Project Settings → Show "appsscript.json" manifest file**, and paste in `tools/admin/appsscript.json` (web app runs as you,
   access Anyone, time zone Asia/Tehran, V8, scopes: spreadsheets + send mail).
4. **Authorize once:** in the editor pick the function **`authorizeOnce`** and press **Run**. Google says "Authorization
   required" → **Review permissions** → pick arman.niaruhi@gmail.com → "Google hasn't verified this app" → **Advanced** →
   **Go to <project name> (unsafe)** → **Allow**. (It is your own script; this is normal.) It only reads the sheet name and
   the mail quota and sends nothing.
5. **Deploy → New deployment (or Manage deployments → Edit → New version) → Web app:** Execute as **Me**, Who has access
   **Anyone**. Copy the **Web app URL** (ends with `/exec`) and send it to the programmer.
6. The programmer puts it in `products.js` as `adminApi` and pushes to `main`. Open
   <https://arman-niaruhi.github.io/bargin/admin/>, press «ارسال کد به ایمیل», type the code from your email.

## Each time you change products
Open `/admin/`, log in, edit / add / delete. Changes go to the Sheet. The site shows them when the published sheet updates
(a few minutes). **دانلود فایل CSV** downloads `products.csv` as a backup. After changing `Code.gs`, always deploy a
**New version** (Manage deployments → pencil → Version: New version).

## Checks
`id`, `name`, `category`, `price` not empty; `price` a number (Persian digits and «,» fine); `id` English, no spaces,
unique; `soldOut` is `yes`, `no` or empty. Blank rows are skipped. Problems are listed with their row numbers.

## If something goes wrong (recovery)
- **No email arrives:** look in spam; wait for the 60 s countdown and press «ارسال دوباره». «نتونستیم ایمیل رو بفرستیم» means
  MailApp failed: run `authorizeOnce` again (permissions) and check the daily mail quota in Apps Script.
- **«تو این یه ساعت چند بار کد خواستی» / «امروز زیاد کد خواستی»:** the caps. Wait an hour / a day. To reset by hand: Apps Script →
  Project Settings → Script properties → delete `sendLog2`.
- **«کد منقضی شده» / «چند بار اشتباه زدی»:** press «ارسال دوباره» for a new code.
- **«نشستت تموم شد»:** 1 hour idle or 6 hours passed. Log in again; an open form keeps what you typed.
- **«به سرور وصل نشدیم» / the page says not set up:** `adminApi` in `products.js` is empty or wrong, or the deployment is archived.
- **Nothing works after a code change:** deploy a **New version** in Manage deployments.
- **Suspect someone else got in / lost the email account:** Apps Script → **Deploy → Manage deployments → Archive** the deployment
  (all requests stop at once), or remove the address from `ALLOWED_EMAILS` and deploy again. To end every session at once, change the `'ss_'`
  prefix in `Code.gs` (two places) or wait up to 6 hours. Then deploy again and send the new URL if it changed.
- **Bad edit in the Sheet:** use the Sheet's **File → Version history**. `data/products.csv` is also a backup.

## Customer activity log («log» tab, owner approved 2026-11-04)
The shop pages load `log.js`, which sends a few anonymous events to the same Apps Script web app (`SHOP.logApi` in
`products.js`, the same URL as `adminApi`; action `logEvent`, no login needed). The script writes them to the tab
**`log`**, which `setupLog` puts as the **last** tab (the products must stay the first tab).
- Events:
  - `view`: home or product page.
  - `search`: the word, at most 40 characters, after typing stops for 1.5 s.
  - `no_results`: the «چیزی پیدا نکردیم» card was shown, with the word (also after a 1.5 s pause).
  - `category`: a category button.
  - `cart_add` (add or «+», new qty), `cart_dec` («−», new qty), `cart_remove` (bin, or «−» down to 0; qty = how many
    were removed), `cart_clear` («آره، خالیش کن»; qty = items that were in the cart), `cart_open`.
  - `whatsapp` (drawer or footer button; qty = items), `instagram` and `phone` (footer links). These three are sent at
    once, because the visitor is leaving.
  - `load_error`: the products sheet could not be loaded; `reason` is `http-<status>`, `network`, `no-products` or `no-url`.
- Columns: `time` (Tehran), `session` (random id per browser tab, not a person), `event`, `page`, `product`, `category`,
  `search`, `qty`, `from` (card / product / bar / drawer / footer / fab), `device` (phone / computer), `source` (the site
  the visitor came from, host only, e.g. `instagram.com`; owner kept it 2026-11-04), `reason` (only for `load_error`).
- Never logged: names, phone numbers, cart contents beyond the product id, IP, cookies. Nothing is sent on localhost,
  `file:`, from bots / headless browsers / link previews, or when the browser asks for Do Not Track or Global Privacy Control.
- Limits: at most 20 events per request, 300 per visitor an hour, 600 a minute and 20,000 a day for everyone. The tab keeps
  **every row**; when it has **50,000 rows** new events are silently dropped (nothing is deleted automatically). To make
  room: download or copy the old rows somewhere, then delete them by hand (keep row 1, the header).
- Test locally: `python3 -m http.server 8000`, open `http://localhost:8000/?logdebug=1`; the batches are printed in the
  browser console (`[bargin-log] …`) instead of being sent. `?logdebug=1` does nothing on the live site.

- Cells that start with `= + - @` get an apostrophe, so Sheets never runs them as formulas.

## Buys and sells («خرید و فروش» tab, owner approved 2026-11-07)
On `/admin/`, the switch at the top opens **«خرید و فروش»**: a list of buys and sells, newest first, with filters
«همه / خرید / فروش». Each row has: date (Persian calendar), type, product (only from the current products; the name is
copied from the products tab, so renamed or deleted products still show their old name), quantity + unit (بسته/ظرف,
کیلو, گرم, عدد), the **unit price** (typed in «هزار تومان» or «میلیون تومان», stored in toman plus what was typed),
the row's own total (quantity × unit price, rounded to a whole toman), and an optional name (60 characters) and
description (300). Rows can be added, edited and deleted (delete asks first). **No sums or totals over rows anywhere.**
- Tab **`خرید و فروش`**, made by **`setupLedger`** as the **2nd** tab (products first, `log` last). It is **private:
  never publish it to the web.**
- Columns: `id` (random, `L` + 32 hex; edit and delete find the row by it, never by row number), `created` (Tehran time),
  `date` (`1405-08-16`, text), `type` (خرید / فروش), `productId`, `productName`, `qty`, `qtyUnit`, `priceToman` (unit
  price), `priceAmount` + `priceUnit` (as typed), `rowToman`, `party`, `note`, `by` (the admin's email), then
  `customerId` and `channel` (سایت / حضوری; both on sales only). On a sale `party` is a copy of the customer's name;
  on a buy it is the optional «اسم فروشنده». Sales saved before the customers list keep their old typed `party`; editing
  one asks for a customer and a channel first (the old name is shown as «اسم قبلی: …»).
- Running `setupLedger` on a tab made before the customers (15 columns) adds `customerId` and `channel` at the end of
  row 1; it never changes the data rows.

## Customers («مشتری‌ها» tab, owner approved 2026-11-07)
- Every **sale** needs a customer and a channel («سایت» / «حضوری»). In the form the customer is picked from a
  dropdown (with a search box above it, by name or number) or with «+ مشتری جدید» (first and last name, **English
  letters only**, space, `-` and `'`, 1–30 characters each). Names are **stored in lowercase** and shown as stored,
  e.g. «۱۲ — zahra ahmadi». A new name that is already on the list (case ignored) reuses that customer and the page
  says «این مشتری از قبل بود (۱۲)؛ همونو استفاده کردیم». Buys have no customer.
- Tab **`مشتری‌ها`**, made by **`setupCustomers`** right after «خرید و فروش» (products first, `log` last). Columns:
  `id` (1, 2, 3…), `firstName`, `lastName`, `created` (Tehran time), `by` (the admin's email). **Private: never publish
  it to the web.** The customer row and the sale are written in the same lock.
- Numbers are never given out twice: the next id is one more than the larger of the script property `customerSeq` and
  the largest id in the tab, so deleting a row by hand never frees its number. There is no edit/delete screen for
  customers (owner's choice); fix a typo by hand in the tab (keep it lowercase, don't change the `id`).
- Same security as the products: session checked in `handleRequest_` and again in each function (`assertSession_`),
  saves and deletes under the lock, every check done again on the server, `= + - @` at the start get an apostrophe,
  at most 20,000 rows (then new rows are refused; nothing is deleted). Do not edit the header row by hand; if it gets
  broken the page says so and `setupLedger` fixes it (when the tab has no other data).

## Owner's checklist: deploy the customers update (once; do the Apps Script steps 1–5 BEFORE the new page goes live)
1. **Extensions → Apps Script.** Open `Code.gs`, select everything, delete it, paste the new `tools/admin/Code.gs`,
   press **Save**.
2. Pick **`setupLedger`** → **Run**. The log says `OK: «خرید و فروش» is tab 2 of N…`; row 1 of «خرید و فروش» now ends
   with `customerId`, `channel`. Your old rows stay as they are.
3. Pick **`setupCustomers`** → **Run**. The log says `OK: «مشتری‌ها» is tab 3 of N…`.
4. Pick **`setupLog`** → **Run** (keeps **log** as the last tab). Check the order: products, خرید و فروش, مشتری‌ها, log.
5. **Deploy → Manage deployments →** pencil **→ Version: New version → Deploy**, with "Execute as: **Me**" and "Who has
   access: **Anyone**". The URL stays the same.
6. **File → Share → Publish to web:** still the **products tab only** (not "Entire document"); otherwise press
   **Republish** with the products tab.
7. Try it: `/admin/` → «خرید و فروش» → «ثبت خرید یا فروش جدید» → فروش → «+ مشتری جدید», save a test sale, check
   both tabs in the Sheet, then delete the test sale (and the test customer row by hand, if you like).
Why this order: an old Apps Script would save a sale from the new page without its customer and channel. After step 5
and before the page is pushed, the old page can still save buys, but the new script refuses its sales (no channel or
customer), so nothing half-filled is ever stored. Products are not affected at any point.

## Owner's checklist: deploy the log + «خرید و فروش» together (once, after the code is pushed)
1. **Extensions → Apps Script.** Open `Code.gs`, select everything, delete it, and paste the new `tools/admin/Code.gs`.
   Press **Save** (the disk icon).
2. In the function box at the top pick **`setupLog`** and press **Run**. If Google asks for permission, allow it as in
   "Authorize once" above. The log at the bottom says `OK: «log» is tab N of N…`.
3. Pick **`setupLedger`** and press **Run**. The log says `OK: «خرید و فروش» is tab 2 of N; products tab is «…»`.
   Check the Sheet: the products tab is still the **first** tab, then **خرید و فروش**, and **log** is the last tab.
4. **Deploy → Manage deployments →** the pencil (Edit) on the current web app **→ Version: New version → Deploy.**
   Keep "Execute as: Me" and "Who has access: Anyone". The URL stays the same, so nothing else changes.
5. **Google Sheet → File → Share → Publish to web.** Under "Link", the first box must say the **products tab only**
   (not "Entire document"), format "Comma-separated values (.csv)". Under "Published content and settings" also pick
   the products tab only. If it says "Entire document", change it to the products tab and press **Republish**.
   (Otherwise anyone could read the log and your buys and sells.)
6. Try it: open the live site on your phone, look at a product; after a few seconds new rows appear in **log**. Then open
   `/admin/` → «خرید و فروش» → «ثبت خرید یا فروش جدید», save one test row, check it in the Sheet, and delete it again.

## Notes for the programmer
- Persian texts: `MSG` in `Code.gs` and `TEXT` in `admin/admin.js` (for `bargin-content` to review).
- `admin/index.html` has a CSP meta tag; `connect-src` allows `script.google.com` and `*.googleusercontent.com` (Apps Script
  answers through a redirect to `script.googleusercontent.com`). If the host changes, update it.
- Do not run `clasp` against the live project without the owner's OK.
- Tests: `node tools/admin/test.mjs` (CSV and checks, plus the login with stubbed CacheService, LockService, MailApp,
  PropertiesService, Utilities, Session and a fake clock, plus the activity log: `logEvent`, `setupLog` and `log.js`, plus the
  «خرید و فروش» tab: `ledgerMath_`, `ledgerDate_`, `planLedgerRow_`, save / edit / delete, `setupLedger`, plus the customers: `customerName_`, `nextCustomerId_`,
  `planCustomer_`, new / reused customers, the 15→17 column migration, `setupCustomers`).
- The calendar, number parsing, row total and customer-name check are in a block shared by `Code.gs` and `admin/admin.js` (marked
  `shared with admin/admin.js`); keep both copies identical, the tests check it.

## Product versions (owner approved 2026-11-07)
- Private tab **`تاریخچه محصولات`**, made by **`setupVersioning`** right after «مشتری‌ها» (before `log`), never first, never published.
  Columns: `versionId` (`<id>-v<n>`), `productId`, `name`, `category`, `price` (digits), `unit`, `soldOut`, `valid_from`, `valid_to`, `is_current`.
  One row per version. The products tab (Sheet1) is never changed by this.
- A new version starts when **name, price, unit or soldOut** changes. Category changes only update the category on every row of that product.
  Text, recipe and image changes are not tracked.
- Admin saves/deletes are captured at once. Hand edits in the Sheet are captured by the hourly trigger `hourlyVersioning`
  (installed by `setupVersioning`, exactly one) and before every product save and ledger save.
  A hand-typed product gets v1; a row deleted by hand closes its version; hand edits of an OLD history row are left as typed.
- Each ledger line stores `productVersion` (the version valid on the sale date, else the current one); old lines stay empty.
- Deploy steps: paste `Code.gs` + `appsscript.json` → run `setupVersioning` (allow the new permission) → run `setupLedger`
  → Deploy → New version (Execute as: Me, Anyone) → push the site/admin.

## Raw price «قیمت اولیه (خام)» (owner approved 2026-11-07)
- An optional buy/cost price per product (same pack as the sale price), shown and edited **only on `/admin/`**, next to the
  sale price. The profit (sale − raw) is computed live, never stored.
- It lives in the private tab **`قیمت اولیه محصولات`**, made by **`setupRawPrices`** (after `تاریخچه محصولات`, before `log`, never
  first, never published). It is NOT a column of the products tab, because that tab is published to the web as CSV.
  Columns: `productId`, `rawToman`, `typed`, `typedUnit` (`thousand` / `million`), `updated`, `by`. One row per product.
- Saving a product writes or removes its row; an id change moves the row; deleting the product deletes the row.
  `getProducts` (admin session only) merges it in. No new API action.
- The admin «دانلود فایل CSV» file has one extra last column `rawPrice` (toman). That file is private: never copy it to
  `data/products.csv`. The public Sheet and `data/products.csv` stay with the 11 columns.
- Setup: paste `Code.gs` → run `setupRawPrices` once → Deploy → New version → check Publish to web = products tab only.
  Until then the form says to run it when a raw price is typed; leaving the field empty always works.
