// Products come from data/products.csv. Categories are the category names used
// there, in the order they first appear (id = name, so links are ?cat=<name>).
let PRODUCTS = [];
let CATEGORIES = [];

// Reads CSV text (as saved by Excel / LibreOffice) into a list of objects,
// one per row, keyed by the header row. Handles quotes, line breaks inside
// quotes, a leading BOM, and ";" as separator (some Excel versions use it).
function parseCSV(text) {
  text = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  const firstLine = text.split("\n", 1)[0];
  const sep = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ",";
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(head.map((h, k) => [h, (r[k] || "").trim()])));
}

// one products.csv row → the product object the pages use
function productFromRow(r) {
  const digits = String(r.price).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/\D/g, "");
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    price: Number(digits),
    unit: r.unit,
    short: r.short,
    details: r.details,
    specs: r.unit ? { "واحد فروش": r.unit } : {},
    images: r.images.split("|").map((s) => s.trim()).filter(Boolean),
    soldOut: /^(yes|true|1|بله|آره)$/i.test(r.soldOut),
  };
}

function categoriesOf(products) {
  return [...new Set(products.map((p) => p.category).filter(Boolean))].map((name) => ({ id: name, name }));
}

async function loadData() {
  const get = (f) => fetch(f, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(f);
    return r.text();
  });
  try {
    PRODUCTS = parseCSV(await get("data/products.csv")).filter((r) => r.id && r.name).map(productFromRow);
    CATEGORIES = categoriesOf(PRODUCTS);
  } catch (e) {
    console.error("could not load products", e);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function price(p) {
  const unit = p.unit ? ` / ${esc(p.unit)}` : "";
  return `${Number(p.price).toLocaleString("fa-IR")} ${esc(SHOP.currency)}${unit}`;
}

// small inline icons for the contact buttons (currentColor, so they follow the button)
const ICONS = {
  whatsapp: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z"/></svg>',
  instagram: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2c-2.7 0-3 0-4.1.1C4.3 2.2 2.3 4.2 2.1 7.9 2 9 2 9.3 2 12s0 3 .1 4.1c.2 3.6 2.2 5.6 5.8 5.8 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c3.6-.2 5.6-2.2 5.8-5.8.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c-.2-3.6-2.2-5.6-5.8-5.8C15 2 14.7 2 12 2Zm0 1.8c2.7 0 3 0 4 .1 2.7.1 4 1.4 4.1 4.1.1 1 .1 1.3.1 4s0 3-.1 4c-.1 2.7-1.4 4-4.1 4.1-1 .1-1.3.1-4 .1s-3 0-4-.1c-2.7-.1-4-1.4-4.1-4.1-.1-1-.1-1.3-.1-4s0-3 .1-4C4 5.3 5.3 4 8 3.9c1-.1 1.3-.1 4-.1Z"/></svg>',
  phone: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/></svg>',
  telegram: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9 4.6 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2l-11 6.9-4.7-1.5c-1-.3-1-1 .2-1.5L20.6 3.4c.8-.3 1.6.2 1.3 1.2Z"/></svg>',
};

function contactLinks(subject) {
  const msg = encodeURIComponent(`سلام، می‌خوام «${subject}» رو سفارش بدم.`);
  const links = [];
  if (SHOP.whatsapp) {
    links.push(`<a class="btn" href="https://wa.me/${esc(SHOP.whatsapp)}?text=${msg}" target="_blank" rel="noopener">${ICONS.whatsapp}سفارش در واتساپ</a>`);
  }
  if (SHOP.telegram) {
    links.push(`<a class="btn" href="https://t.me/${esc(SHOP.telegram)}" target="_blank" rel="noopener">${ICONS.telegram}تلگرام</a>`);
  }
  if (SHOP.phone) {
    links.push(`<a class="btn" href="tel:${esc(SHOP.phone)}">${ICONS.phone}تماس: <span dir="ltr">${esc(SHOP.phone)}</span></a>`);
  }
  if (SHOP.instagram) {
    links.push(`<a class="btn" href="https://instagram.com/${esc(SHOP.instagram)}" target="_blank" rel="noopener">${ICONS.instagram}اینستاگرام</a>`);
  }
  if (SHOP.email) {
    links.push(`<a class="btn" href="mailto:${esc(SHOP.email)}?subject=${encodeURIComponent(subject)}">ایمیل</a>`);
  }
  // first button is filled, the rest are outlined
  return links.map((l, i) => i ? l.replace('class="btn"', 'class="btn btn-ghost"') : l).join("");
}

// showContact: false on product pages that already have the order box
function renderShell(showContact = true) {
  const year = new Date().getFullYear().toLocaleString("fa-IR", { useGrouping: false });
  const links = showContact ? contactLinks(SHOP.name) : "";
  document.getElementById("footer").innerHTML =
    `<div class="ornament"></div>` +
    `<p class="footer-tagline">${esc(SHOP.tagline)}</p>` +
    (links
      ? `<p class="footer-cta">سؤالی داری یا می‌خوای سفارش بدی؟ بهمون پیام بده:</p>` +
        `<div class="contact">${links}</div>`
      : "") +
    `<p>&copy; ${year} ${esc(SHOP.name)}</p>`;
}

function categoryOf(p) {
  return (typeof CATEGORIES !== "undefined" ? CATEGORIES : []).find((c) => c.id === p.category);
}

function renderHome() {
  renderShell();
  document.title = `${SHOP.name} | ${SHOP.tagline}`;

  // only show categories that have at least one product
  const cats = (typeof CATEGORIES !== "undefined" ? CATEGORIES : [])
    .filter((c) => PRODUCTS.some((p) => p.category === c.id));
  const filters = document.getElementById("filters");
  const grid = document.getElementById("product-grid");

  function show(catId) {
    if (!cats.some((c) => c.id === catId)) catId = "";
    const list = catId ? PRODUCTS.filter((p) => p.category === catId) : PRODUCTS;
    grid.innerHTML = list.map((p, i) => `
    <a class="card${p.soldOut ? " sold-out" : ""}" style="--i:${i}" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="card-img">
        <img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
        ${p.soldOut ? '<span class="badge">ناموجود</span>' : ""}
      </div>
      <div class="card-body">
        <h3>${esc(p.name)}</h3>
        <p class="short">${esc(p.short || "")}</p>
        <div class="card-foot">
          <span class="price">${price(p)}</span>
          <span class="more">بیشتر ببین</span>
        </div>
      </div>
    </a>`).join("") || `<p class="empty">فعلاً محصولی اینجا نیست.</p>`;
    if (filters) {
      filters.querySelectorAll(".chip").forEach((b) => {
        const on = b.dataset.cat === catId;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    return catId;
  }

  if (filters && cats.length > 1) {
    filters.innerHTML = [{ id: "", name: "همه" }, ...cats].map((c) =>
      `<button type="button" class="chip" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join("");
    filters.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const catId = show(b.dataset.cat);
      const url = new URL(location.href);
      if (catId) url.searchParams.set("cat", catId); else url.searchParams.delete("cat");
      history.replaceState(null, "", url);
    });
  } else if (filters) {
    filters.hidden = true;
  }

  show(new URLSearchParams(location.search).get("cat") || "");
}

function renderProduct() {
  const id = new URLSearchParams(location.search).get("id");
  const p = PRODUCTS.find((x) => x.id === id);
  const hasBuyBox = Boolean(p && !p.soldOut && contactLinks(p.name));
  renderShell(!hasBuyBox);
  const box = document.getElementById("product-detail");

  if (!p) {
    box.innerHTML = `<p class="empty">محصول پیدا نشد.</p>`;
    return;
  }
  document.title = `${p.name} | ${SHOP.name}`;

  const cat = categoryOf(p);
  const specs = Object.entries(p.specs || {});
  const thumbs = p.images.length > 1
    ? `<div class="thumbs">${p.images.map((src, i) =>
        `<button class="thumb ${i === 0 ? "active" : ""}" data-src="${esc(src)}">
           <img src="${esc(src)}" alt="">
         </button>`).join("")}</div>`
    : "";

  box.innerHTML = `
    <div class="detail">
      <div class="gallery">
        <div class="main-img${p.soldOut ? " sold-out" : ""}"><img id="main-img" src="${esc(p.images[0])}" alt="${esc(p.name)}"></div>
        ${thumbs}
        ${(p.credits || []).length ? `<p class="credits">عکس: ${p.credits.map((c) =>
          `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.by)}</a> (${esc(c.license)})`).join("، ")}</p>` : ""}
      </div>
      <div class="info">
        <h1>${esc(p.name)}</h1>
        ${cat ? `<p class="category">دسته‌بندی: <a href="index.html?cat=${encodeURIComponent(cat.id)}">${esc(cat.name)}</a></p>` : ""}
        <p class="price big">${price(p)} ${p.soldOut ? '<span class="badge inline">ناموجود</span>' : ""}</p>
        <p class="details">${esc(p.details || p.short || "")}</p>
        ${specs.length ? `<table class="specs">${specs.map(([k, v]) =>
          `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
        ${p.soldOut || !contactLinks(p.name) ? "" : `<div class="buy"><p>برای سفارش بهمون پیام بده:</p><div class="contact">${contactLinks(p.name)}</div></div>`}
      </div>
    </div>`;

  box.querySelectorAll(".thumb").forEach((t) => t.addEventListener("click", () => {
    document.getElementById("main-img").src = t.dataset.src;
    box.querySelectorAll(".thumb").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
  }));
}
