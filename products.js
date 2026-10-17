// ============================================================
//  تنظیمات فروشگاه — SHOP SETTINGS (edit these)
// ============================================================
const SHOP = {
  name: "برگین",
  tagline: "از طبیعت تا خانه شما",
  currency: "تومان",      // shown after the price
  // How people contact you to buy (leave "" to hide)
  email: "",           // not used
  phone: "",            // شماره تماس، e.g. "09121234567"
  whatsapp: "989000000000", // TEST — replace before going live (شماره واتساپ با کد کشور، فقط عدد)
  telegram: "",         // username without @
  instagram: "bargin.shop", // TEST — replace before going live (آیدی اینستاگرام بدون @)
};

// ============================================================
//  دسته‌بندی‌ها — CATEGORIES (buttons on the main page, in this order)
//  id:   short English name, no spaces (used in the link, e.g. index.html?cat=sabzi)
//  name: what customers see
// ============================================================
const CATEGORIES = [
  { id: "sabzi", name: "سبزی‌ها" },
  { id: "rob",   name: "رب‌ها" },
  { id: "moraba", name: "مرباها" },
];

// ============================================================
//  محصولات — PRODUCTS (copy one { ... } block to add a new product)
//
//  id:      unique short English name, no spaces (used in the link)
//  category: the id of one of the CATEGORIES above, e.g. "sabzi"
//  price:   plain number, e.g. 250000
//  unit:    what the price is for, e.g. "کیلو" (leave "" for none)
//  images:  put your photos in the "images" folder and list them here.
//           The first image is shown on the main page.
//  credits: only needed for photos taken from the internet (photographer + license)
// ============================================================
const PRODUCTS = [
  {
    id: "sabzi-ghormeh",
    name: "سبزی قورمه",
    category: "sabzi",
    price: 900000,
    unit: "کیلو",
    short: "سبزی قورمه شمالی، آماده برای قورمه‌سبزی.",
    details:
      "سبزی قورمه شمالی، تمیز و آماده برای پخت قورمه‌سبزی.\n" +
      "فروش به صورت کیلویی.",
    specs: { "واحد فروش": "کیلو" },
    images: ["images/sabzi-ghormeh.jpg"],
    soldOut: true,
  },
  {
    id: "sabzi-morgh-torsh",
    name: "سبزی مرغ ترش",
    category: "sabzi",
    price: 1000000,
    unit: "کیلو",
    short: "سبزی معطر شمالی، آماده برای مرغ ترش.",
    details:
      "سبزی مرغ ترش شمالی، تمیز و آماده برای پخت مرغ ترش.\n" +
      "فروش به صورت کیلویی.",
    specs: { "واحد فروش": "کیلو" },
    images: ["images/sabzi-morgh-torsh.jpg"],
    soldOut: false,
  },
  {
    id: "rob-anar",
    name: "رب انار شمالی",
    category: "rob",
    price: 1300000,
    unit: "کیلو",
    short: "رب انار شمالی، برای خورش، سالاد و غذاهای شمالی.",
    details:
      "رب انار شمالی، مناسب برای فسنجان، زیتون پرورده، سالاد و غذاهای شمالی.\n" +
      "فروش به صورت کیلویی.",
    specs: { "واحد فروش": "کیلو" },
    images: ["images/rob-anar.jpg"],
    soldOut: false,
  },
  {
    id: "moraba-havij",
    name: "مربای هویج",
    category: "moraba",
    price: 500000,
    unit: "نیم کیلو",
    short: "مربای هویج، در بسته‌بندی نیم کیلویی.",
    details:
      "مربای هویج.\n" +
      "فروش در بسته‌بندی نیم کیلویی.",
    specs: { "واحد فروش": "نیم کیلو" },
    images: ["images/moraba-havij.jpg"],
    soldOut: false,
  },
];
