// ============================================================
//  YOUR SHOP SETTINGS — edit these
// ============================================================
const SHOP = {
  name: "Bargin",
  tagline: "Handpicked products, honest prices.",
  currency: "€",
  // How people contact you to buy (leave "" to hide)
  email: "arman.niaruhi@gmail.com",
  phone: "",            // e.g. "+49 123 456789"
  whatsapp: "",         // number with country code, digits only, e.g. "49123456789"
  instagram: "",        // username without @
};

// ============================================================
//  YOUR PRODUCTS — copy one { ... } block to add a new product
//
//  id:      unique short name, no spaces (used in the link)
//  images:  put your photos in the "images" folder and list them here.
//           The first image is shown on the main page.
// ============================================================
const PRODUCTS = [
  {
    id: "product-1",
    name: "Product One",
    price: 25,
    short: "A short one-line description of this product.",
    details:
      "Write the full description here: material, size, condition, " +
      "what is included, and anything else a buyer should know.",
    specs: { Size: "Medium", Color: "Black", Condition: "New" },
    images: ["images/placeholder.svg"],
    soldOut: false,
  },
  {
    id: "product-2",
    name: "Product Two",
    price: 40,
    short: "A short one-line description of this product.",
    details: "Full description of product two.",
    specs: { Size: "Large", Color: "White" },
    images: ["images/placeholder.svg"],
    soldOut: false,
  },
  {
    id: "product-3",
    name: "Product Three",
    price: 15.5,
    short: "A short one-line description of this product.",
    details: "Full description of product three.",
    specs: {},
    images: ["images/placeholder.svg"],
    soldOut: true,
  },
];
