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
  telegram: "",         // username without @
  instagram: "Bargiiin", // آیدی اینستاگرام بدون @
  adminUrl: "https://script.google.com/macros/s/AKfycbzY5azMGSGjVMK7MAn5wDcyjX5PlcWVlFVpVdlHYK1IaovqX5-RxcXIt8_rBle0utdj/exec", // Apps Script web app URL for the admin page (/admin redirects here); empty = not set yet
};

// ============================================================
//  محصولات و دسته‌بندی‌ها — PRODUCTS & CATEGORIES
//  are in products.csv and categories.csv (open them in Excel / LibreOffice,
//  save as "CSV UTF-8"). The website and the Telegram bot both read them.
// ============================================================
