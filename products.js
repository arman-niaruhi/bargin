// ============================================================
//  تنظیمات فروشگاه — SHOP SETTINGS (edit these)
// ============================================================
const SHOP = {
  name: "برگین",
  tagline: "از طبیعت تا خانه شما",
  currency: "تومان",      // shown after the price
  // How people contact you to buy (leave "" to hide)
  email: "",           // not used
  phone: "09117139108",  // شماره تماس
  whatsapp: "989117139108", // شماره واتساپ با کد کشور، فقط عدد
  instagram: "Bargiiin", // آیدی اینستاگرام بدون @
  // Published Google Sheet (products tab) as CSV: the source of all product data.
  // The website reads it live. data/products.csv is only a backup.
  productsUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRl4UhLXduBOizYvVqQgkOk6oOEPTOTvBavPSB77XzpJEnOTOYYeTLU9w_qKDrZ2tMC6VgPLIo3xfLT/pub?output=csv",
  // Admin page (/admin): Google sign-in client ID (from Google Cloud) and the Apps Script web app URL
  // (the /exec link). Both empty = the admin page shows "not set up yet". Not secret.
  adminClientId: "",
  adminApi: "",
};

// ============================================================
//  محصولات و دسته‌بندی‌ها — PRODUCTS & CATEGORIES
//  come from the published Google Sheet in SHOP.productsUrl (no categories file).
//  The website reads it. data/products.csv is a backup.
// ============================================================
