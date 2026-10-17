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
  whatsapp: "",         // شماره واتساپ با کد کشور، فقط عدد، e.g. "989121234567"
  telegram: "",         // username without @
  instagram: "",        // آیدی اینستاگرام بدون @، e.g. "bargin.shop"
};

// ============================================================
//  محصولات — PRODUCTS (copy one { ... } block to add a new product)
//
//  id:      unique short English name, no spaces (used in the link)
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
    price: 900000,
    unit: "کیلو",
    short: "سبزی قورمه شمالی، آماده برای قورمه‌سبزی.",
    details:
      "سبزی قورمه شمالی، تمیز و آماده برای پخت قورمه‌سبزی.\n" +
      "فروش به صورت کیلویی.",
    specs: { "واحد فروش": "کیلو" },
    images: ["images/sabzi-ghormeh.jpg", "images/ghormeh-sabzi-dish.jpg"],
    credits: [
      { by: "Nikowsk", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Fresh_green_chopped_herbs_on_wooden_board.jpg" },
      { by: "Amin Majidi", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Ghormeh_Sabzi.JPG" },
    ],
    soldOut: false,
  },
  {
    id: "sabzi-morgh-torsh",
    name: "سبزی مرغ ترش",
    price: 1000000,
    unit: "کیلو",
    short: "سبزی معطر شمالی، آماده برای مرغ ترش.",
    details:
      "سبزی مرغ ترش شمالی، تمیز و آماده برای پخت مرغ ترش.\n" +
      "فروش به صورت کیلویی.",
    specs: { "واحد فروش": "کیلو" },
    images: ["images/sabzi-morgh-torsh.jpg"],
    credits: [
      { by: "Thomas Rehehäuser", license: "CC0", url: "https://commons.wikimedia.org/wiki/File:Fresh_Herbs_(Unsplash).jpg" },
    ],
    soldOut: false,
  },
  {
    id: "rob-anar",
    name: "رب انار شمالی",
    price: 1300000,
    unit: "کیلو",
    short: "رب انار شمالی، برای خورش، سالاد و غذاهای شمالی.",
    details:
      "رب انار شمالی، مناسب برای فسنجان، زیتون پرورده، سالاد و غذاهای شمالی.\n" +
      "فروش به صورت کیلویی.",
    specs: { "واحد فروش": "کیلو" },
    images: ["images/rob-anar.jpg"],
    credits: [
      { by: "El Mono Español", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Pomegranate_molasses_in_a_chinese_spoon.jpg" },
    ],
    soldOut: false,
  },
];
