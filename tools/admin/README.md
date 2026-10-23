# Product admin (admin page on the site + Google Sheet + Apps Script)

The admin page is **`/admin/`** on the site (`admin/index.html` + `admin/admin.js`). The owner logs in with a
**one-time code sent by email** (arman.niaruhi@gmail.com only), edits products there, and can download a CSV
backup. The Google Sheet is the product data; the site reads its published CSV.
Owner decision 2026-10-23: email-code login. No Google sign-in, no Google Cloud project, no OAuth client.

## How it works
1. The page asks the Apps Script web app (`doPost` in `tools/admin/Code.gs`) for a code (`requestCode`).
2. The script emails a **6-digit code to `OWNER_EMAIL` only** (never to an address from the request). The code is in
   the mail subject («کد ورود برگین: 123456») so the phone notification shows it.
3. The owner types the code (`verifyCode`). Right code = a random **session token** (stored hashed on the server).
4. Every other action (getProducts, saveProduct, deleteProduct, publishCsv) needs that token. The check is in one
   place (`handleRequest_`) and again inside each sheet function. No valid session = `NO_SESSION`, nothing is read or written.

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

## Residual risks (accepted)
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
  (all requests stop at once), or change `OWNER_EMAIL` and deploy again. To end every session at once, change the `'ss_'`
  prefix in `Code.gs` (two places) or wait up to 6 hours. Then deploy again and send the new URL if it changed.
- **Bad edit in the Sheet:** use the Sheet's **File → Version history**. `data/products.csv` is also a backup.

## Notes for the programmer
- Persian texts: `MSG` in `Code.gs` and `TEXT` in `admin/admin.js` (for `bargin-content` to review).
- `admin/index.html` has a CSP meta tag; `connect-src` allows `script.google.com` and `*.googleusercontent.com` (Apps Script
  answers through a redirect to `script.googleusercontent.com`). If the host changes, update it.
- Do not run `clasp` against the live project without the owner's OK.
- Tests: `node tools/admin/test.mjs` (CSV and checks, plus the login with stubbed CacheService, LockService, MailApp,
  PropertiesService, Utilities, Session and a fake clock).
