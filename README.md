# Bargin

A simple personal shop website hosted on GitHub Pages.

## Add or change products

1. Put your product photos in the `images/` folder (e.g. `images/shoes-1.jpg`).
2. Open `products.js` and edit the `PRODUCTS` list: name, price, description, details, and image paths.
3. Change your shop name and contact info in `SHOP` at the top of `products.js`.
4. Commit and push. The site updates in about a minute.

## Turn on GitHub Pages (one time)

On GitHub, open the repo and go to **Settings → Pages**. Under "Build and deployment", set
**Source = GitHub Actions**.

Your site will be at: <https://arman-niaruhi.github.io/bargin/>

## Automatic deploy (CI/CD)

`.github/workflows/deploy.yml` deploys the site every time something lands on `main`:
a direct push or a merged pull request from another branch. Each deploy replaces
the live site with the latest version. You can watch progress in the **Actions** tab,
or rerun it by hand there with **Run workflow**.

## Preview locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>
