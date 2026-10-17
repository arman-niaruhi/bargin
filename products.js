// ============================================================
//  تنظیمات فروشگاه — SHOP SETTINGS (edit these)
// ============================================================
const SHOP = {
  name: "برگین",
  tagline: "از طبیعت تا خانه شما",
  currency: "تومان",      // shown after the price
  // How people contact you to buy (leave "" to hide)
  email: "arman.niaruhi@gmail.com",
  phone: "",            // e.g. "+989121234567"
  whatsapp: "",         // number with country code, digits only, e.g. "989121234567"
  telegram: "",         // username without @
  instagram: "",        // username without @
};

// ============================================================
//  محصولات — PRODUCTS (copy one { ... } block to add a new product)
//
//  id:      unique short English name, no spaces (used in the link)
//  price:   plain number, e.g. 250000
//  images:  put your photos in the "images" folder and list them here.
//           The first image is shown on the main page.
// ============================================================
const PRODUCTS = [
  {
    id: "product-1",
    name: "محصول اول",
    price: 250000,
    short: "توضیح کوتاه یک‌خطی درباره این محصول.",
    details:
      "توضیحات کامل محصول را اینجا بنویسید: جنس، اندازه، " +
      "شرایط نگهداری و هر چیزی که خریدار باید بداند.",
    specs: { "وزن": "۵۰۰ گرم", "جنس": "طبیعی" },
    images: ["images/placeholder.svg"],
    soldOut: false,
  },
  {
    id: "product-2",
    name: "محصول دوم",
    price: 480000,
    short: "توضیح کوتاه یک‌خطی درباره این محصول.",
    details: "توضیحات کامل محصول دوم.",
    specs: { "اندازه": "متوسط" },
    images: ["images/placeholder.svg"],
    soldOut: false,
  },
  {
    id: "product-3",
    name: "محصول سوم",
    price: 120000,
    short: "توضیح کوتاه یک‌خطی درباره این محصول.",
    details: "توضیحات کامل محصول سوم.",
    specs: {},
    images: ["images/placeholder.svg"],
    soldOut: true,
  },
];
