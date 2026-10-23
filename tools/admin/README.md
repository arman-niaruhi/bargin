# Product admin (admin page on the site + Google Sheet + Apps Script)

The admin page is **`/admin/`** on the site (`admin/index.html` + `admin/admin.js`). The owner signs in
with Google (arman.niaruhi@gmail.com only), edits products there, and can download a CSV backup.
The Google Sheet is the product data; the site reads its published CSV.

How it works: the page gets a Google **ID token** (Google Identity Services) and sends it with every
request to the Apps Script web app (`doPost` in `tools/admin/Code.gs`). Apps Script checks the token with
Google, checks it belongs to `OWNER_EMAIL`, and only then runs one of 4 actions (getProducts, saveProduct,
deleteProduct, publishCsv). Everything else is refused. The token stays in memory only.

Settings (not secret) are in `products.js`: `SHOP.adminClientId` and `SHOP.adminApi`. Empty = the page
shows «صفحه‌ی مدیریت هنوز راه‌اندازی نشده…».

## One-time setup

### 1. Google Cloud (OAuth client)
1. Open <https://console.cloud.google.com/> with arman.niaruhi@gmail.com. Create a project (e.g. `bargin-admin`).
2. **APIs & Services → OAuth consent screen** (or *Google Auth Platform*): User type **External**, app name
   «Bargin admin», support and developer email = yours. Scopes: leave the defaults (no extra scopes needed).
3. **Audience / Test users:** keep **Publishing status = Testing** and add `arman.niaruhi@gmail.com` as a test user.
   (Testing mode is fine for one person. Do not click "Publish app".)
4. **Credentials → Create credentials → OAuth client ID → Web application.** Name: `bargin-admin-web`.
   **Authorized JavaScript origins:** `https://arman-niaruhi.github.io` (and `http://localhost:8000` if you want to test locally).
   No redirect URIs needed.
5. Copy the **Client ID** (ends with `.apps.googleusercontent.com`) and send it to the programmer.

### 2. Apps Script
1. In the Sheet: **Extensions → Apps Script** (project bound to the sheet; the first sheet has the header
   `id, name, category, price, unit, serves, short, details, recipe, images, soldOut`, formatted as plain text).
2. Replace `Code.gs` with `tools/admin/Code.gs`, with `ADMIN_CLIENT_ID` at the top set to the Client ID.
   **Delete the old `admin` HTML file** in the project (it is not used any more).
3. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**, with
   **Execute as: Me** and **Who has access: Anyone**. ("Anyone" is needed because the browser calls it from the site;
   the Google ID token check is what keeps everybody but the owner out.) The first time, allow the permissions
   (Sheets, "connect to an external service" for the token check).
4. Copy the **Web app URL** (ends with `/exec`) and send it to the programmer.

### 3. The site
The programmer puts both values in `products.js` (`adminClientId`, `adminApi`) and pushes to `main`.
Then open <https://arman-niaruhi.github.io/bargin/admin/> and sign in.

## Each time you change products
Open `/admin/`, sign in, edit / add / delete. Changes go to the Sheet. The site shows them when the published
sheet updates (a few minutes). **دانلود فایل CSV** downloads `products.csv` as a backup (replace `data/products.csv`
by hand if you want the backup updated). After changing `Code.gs`, always deploy a **New version**.

## Checks
`id`, `name`, `category`, `price` not empty; `price` a number (Persian digits and «,» fine); `id` English, no spaces,
unique; `soldOut` is `yes`, `no` or empty. Blank rows are skipped. Problems are listed with their row numbers.

## If something goes wrong (recovery)
- **«این حساب اجازه نداره»**: you signed in with another Google account. Press «حساب دیگه».
- **«نشستت تموم شد»**: the token lasts about an hour. Sign in again.
- **Sign-in button missing / «نتونستیم ورود با گوگل…»**: an ad blocker or offline. Turn it off and reload.
- **Google says "access blocked / app not verified"**: the account is not in Test users (step 1.3), or the origin
  is missing (step 1.4).
- **Nothing works after a code change**: Apps Script needs **New version** in Manage deployments; also check
  `ADMIN_CLIENT_ID` equals `SHOP.adminClientId`.
- **Locked out / suspect a leak**: in Apps Script **Deploy → Manage deployments → Archive** the deployment (all
  requests stop at once), or delete the OAuth client in Google Cloud. Then deploy again and send the new URL.
- **Bad edit in the Sheet**: use the Sheet's **File → Version history**. `data/products.csv` is also a backup.

## Notes for the programmer
- Persian texts: `MSG` in `Code.gs` and `TEXT` in `admin/admin.js` (for `bargin-content` to review).
- `admin/index.html` has a CSP meta tag (Google sign-in and the Apps Script URL allowed). If the Apps Script host changes, update `connect-src`.
- Tests: `node tools/admin/test.mjs` (checks, token claims, dispatcher: no action runs on a failed verify).
