# Product admin (Google Sheet + Apps Script)

A small page to check the product sheet and make `data/products.csv`. Only the owner
can open it. The Sheet is where you edit products. The page checks the rows and, when
they are fine, gives you a file named `products.csv` to download.

Nothing here is deployed to the live site (`tools/` is not in the deploy copy list).
The file you download replaces `data/products.csv` in the repo by hand. Then the
change goes to the site through the normal git steps.

## One-time setup

1. **Make the Sheet.** Create a Google Sheet. The first sheet must have this header in row 1,
   in any column order (all 11 names must be there):

   `id, name, category, price, unit, serves, short, details, recipe, images, soldOut`

   Select the whole sheet and format it as **plain text** (Format → Number → Plain text).
   Without this, Google may turn values such as `1/2` or long numbers into something else.

2. **Make the Apps Script project.** In the Sheet open **Extensions → Apps Script**.
   This makes a project that is bound to the Sheet.

3. **Paste the files.**
   - Replace the code in `Code.gs` with the contents of `tools/admin/Code.gs`.
   - Click **+ → HTML** and name it exactly `admin` (the editor adds `.html`).
     Paste the contents of `tools/admin/admin.html` into it.
   - Save (Ctrl+S / Cmd+S).

4. **Deploy as a web app.** Click **Deploy → New deployment**, choose **Web app** and set:
   - **Execute as:** Me (arman.niaruhi@gmail.com)
   - **Who has access:** Only myself

   Click **Deploy**. Google asks you to allow the script the first time. Open the
   web app URL it shows. Bookmark it. Only your Google account can open it.

   Note: after you change the code, use **Deploy → Manage deployments → Edit → New version**
   so the link uses the new code.

## Each time you change products

1. Edit the rows in the Sheet. Keep `soldOut` as `yes` or `no` (empty means `no`).
2. Open the admin page and press **بارگذاری دوباره** (reload).
3. If there are problems, the page lists each one with its row number. Fix them and reload.
4. When the list has no problems, press **ساخت فایل products.csv**. The file downloads.
   If it does not start by itself, press the **دانلود products.csv** button.
5. Replace `data/products.csv` in the repo with the downloaded file (same name, same place).
   Keep the file as it is; do not open and save it in Excel again.
6. Tell the programmer that the file is ready. It is committed and published from there.

## What the checks are

- `id`, `name`, `category`, `price` must not be empty.
- `price` is a number. Persian and Arabic digits and «,» are fine (for example ۴۲۰,۰۰۰).
- `id` has no spaces and only English letters (no Persian letters).
- `id` is unique (capital and small letters count as different).
- `soldOut` is `yes`, `no`, or empty (empty means `no`).
- Rows where every cell is empty are skipped.

Commas and double quotes inside a cell are fine. The file quotes those cells for you.

## Notes for the programmer

- `Code.gs` has the Persian messages in one place (`MSG`). `admin.html` has the page
  texts in one place (`TEXT`). Both are for `bargin-content` to review.
- `EOL` in `Code.gs` sets the line ending of the file: `'\r\n'` (CRLF), matching `data/products.csv`.
- The pure functions (`validateRows`, `buildCsv`) are tested in Node: `node tools/admin/test.mjs`.
