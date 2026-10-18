// ============================================================
//  سبد خرید — CART
//  Stores only {id: qty} in localStorage ("bargin-cart"). Name, price and stock
//  always come fresh from data/products.csv (PRODUCTS in app.js). The order is
//  sent as one WhatsApp message. Needs products.js and app.js loaded first.
//  ES2017 only (old phones).
// ============================================================
const CART_KEY = "bargin-cart";
const CART_MAX = 99;
let cartMem = {};          // used when localStorage is blocked (private mode, old browser)
let cartStorageOK = true;

const CART_TEXT = {
  add: "بنداز تو سبد",
  toast: "به سبدت اضافه شد 🌿",
  title: "سبد خریدت",
  close: "بستن",
  more: (name) => `یکی بیشتر از ${name}`,
  less: (name) => `یکی کمتر از ${name}`,
  remove: (name) => `حذف ${name} از سبد`,
  fab: (n) => `سبد خرید؛ ${n} محصول`,
  bar: (n) => `سبد خرید (${n}) — ارسال در واتساپ`,
  soldOut: "این محصول الان ناموجوده و تو سفارشت نمیاد.",
  total: "جمع تقریبی",
  send: "ارسال سفارش در واتساپ",
  clear: "خالی کردن سبد",
  confirm: "مطمئنی می‌خوای سبدتو خالی کنی؟",
  yes: "آره، خالیش کن",
  no: "نه",
  empty: "سبدت هنوز خالیه! یه سر به محصولات بزن 🌿",
  browse: "دیدن محصولات",
};

const CART_ICONS = {
  cart: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM1 2v2h2l3.6 7.6-1.4 2.4A2 2 0 0 0 7 17h12v-2H7.4l1.1-2h7.5a2 2 0 0 0 1.7-1l3.6-6.5A1 1 0 0 0 20.4 4H5.2l-.9-2H1Z"/></svg>',
  bin: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9Zm-2 3h10v13H7V6Zm2 2v9h2V8H9Zm4 0v9h2V8h-2Z"/></svg>',
};

// 1234567 → «۱,۲۳۴,۵۶۷» (same «,» in every browser, as in the approved message)
function faNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",").replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function cartProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

// keep only real products with a whole quantity 1..99
function cartClean(obj) {
  const out = {};
  const canCheck = !LOAD_FAILED && PRODUCTS.length > 0;
  if (obj && typeof obj === "object") {
    Object.keys(obj).forEach((id) => {
      const q = Math.floor(Number(obj[id]));
      if (!(q > 0)) return;
      if (canCheck && !cartProduct(id)) return; // product removed from the CSV
      out[id] = Math.min(q, CART_MAX);
    });
  }
  return out;
}

function cartGet() {
  let raw = null;
  if (cartStorageOK) {
    try {
      raw = localStorage.getItem(CART_KEY);
    } catch (e) {
      cartStorageOK = false;
    }
  }
  let data = cartMem;
  if (cartStorageOK) {
    try { data = raw ? JSON.parse(raw) : {}; } catch (e) { data = {}; }
  }
  const clean = cartClean(data);
  if (JSON.stringify(clean) !== JSON.stringify(data)) cartSet(clean); // drop stale rows silently
  return clean;
}

function cartSet(obj) {
  cartMem = obj;
  if (!cartStorageOK) return;
  try {
    if (Object.keys(obj).length) localStorage.setItem(CART_KEY, JSON.stringify(obj));
    else localStorage.removeItem(CART_KEY);
  } catch (e) {
    cartStorageOK = false;
  }
}

function cartQty(id) {
  return cartGet()[id] || 0;
}

function cartChange(id, qty) {
  const c = cartGet();
  qty = Math.min(Math.max(0, qty), CART_MAX);
  if (qty) c[id] = qty; else delete c[id];
  cartSet(c);
}

// rows in cart order, with the product read fresh from the CSV
function cartRows() {
  const c = cartGet();
  return Object.keys(c).map((id) => ({ p: cartProduct(id), qty: c[id] })).filter((r) => r.p);
}

function cartCount() {
  return cartRows().reduce((n, r) => n + r.qty, 0);
}

// the add button, or − qty + once the product is in the cart (home cards, product page)
function cartCtlHTML(p) {
  return `<div class="cart-ctl" data-id="${esc(p.id)}">${cartCtlInner(p)}</div>`;
}

function cartCtlInner(p) {
  const q = cartQty(p.id);
  if (!q) return `<button type="button" class="cart-add" data-cart="add">${CART_ICONS.cart}${CART_TEXT.add}</button>`;
  return qtyHTML(p, q);
}

// RTL: + sits on the right, − on the left
function qtyHTML(p, q) {
  return `<div class="qty">` +
    `<button type="button" class="qty-btn qty-plus" data-cart="inc" aria-label="${esc(CART_TEXT.more(p.name))}"${q >= CART_MAX ? " disabled" : ""}>+</button>` +
    `<span class="qty-num" aria-live="polite">${faNum(q)}</span>` +
    `<button type="button" class="qty-btn qty-minus" data-cart="dec" aria-label="${esc(CART_TEXT.less(p.name))}">−</button>` +
    `</div>`;
}

// the order as text; withPrices: false drops the per-line prices (very long orders)
function cartMessage(withPrices) {
  const rows = cartRows().filter((r) => !r.p.soldOut);
  const lines = rows.map((r) => {
    const line = r.p.price * r.qty;
    return `${faNum(r.qty)} × ${r.p.name}${r.p.unit ? ` (${r.p.unit})` : ""}` +
      (withPrices && line ? ` — ${faNum(line)} ${SHOP.currency}` : "");
  });
  return `سلام! می‌خواستم از محصولات ${SHOP.name} سفارش بدم\n\n${lines.join("\n")}`;
}

function cartWhatsAppUrl() {
  const base = `https://wa.me/${SHOP.whatsapp}?text=`;
  const url = base + encodeURIComponent(cartMessage(true));
  return url.length > 7000 ? base + encodeURIComponent(cartMessage(false)) : url;
}

// ---------- page parts (built once by initCart) ----------
let cartEls = null;
let cartOpener = null;
let cartToastTimer = 0;

function cartBuild() {
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "cart-fab";
  fab.hidden = true;
  fab.innerHTML = `${CART_ICONS.cart}<span class="cart-badge" aria-hidden="true"></span>`;

  const backdrop = document.createElement("div");
  backdrop.className = "cart-backdrop";
  backdrop.hidden = true;

  const drawer = document.createElement("aside");
  drawer.className = "cart-drawer";
  drawer.hidden = true;
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-labelledby", "cart-title");
  drawer.tabIndex = -1;
  drawer.innerHTML =
    `<div class="cart-head">` +
      `<h2 class="cart-title" id="cart-title">${CART_TEXT.title}</h2>` +
      `<button type="button" class="cart-close" aria-label="${CART_TEXT.close}">×</button>` +
    `</div>` +
    `<div class="cart-body"><ul class="cart-list"></ul>` +
      `<div class="cart-empty" hidden><p>${CART_TEXT.empty}</p><a class="btn" href="index.html">${CART_TEXT.browse}</a></div>` +
    `</div>` +
    `<div class="cart-foot">` +
      `<p class="cart-total"><span class="cart-total-label">${CART_TEXT.total}:</span> <span class="cart-total-value"></span></p>` +
      `<a class="btn cart-send" target="_blank" rel="noopener">${ICONS.whatsapp}${CART_TEXT.send}</a>` +
      `<button type="button" class="cart-clear">${CART_TEXT.clear}</button>` +
      `<div class="cart-confirm" hidden><p>${CART_TEXT.confirm}</p>` +
        `<button type="button" class="btn cart-confirm-yes">${CART_TEXT.yes}</button>` +
        `<button type="button" class="btn btn-ghost cart-confirm-no">${CART_TEXT.no}</button>` +
      `</div>` +
    `</div>`;

  const toast = document.createElement("div");
  toast.className = "cart-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;

  [fab, backdrop, drawer, toast].forEach((el) => document.body.appendChild(el));
  const q = (s) => drawer.querySelector(s);
  cartEls = {
    fab, backdrop, drawer, toast,
    badge: fab.querySelector(".cart-badge"),
    list: q(".cart-list"), empty: q(".cart-empty"), foot: q(".cart-foot"),
    totalLine: q(".cart-total"), totalValue: q(".cart-total-value"),
    send: q(".cart-send"), clear: q(".cart-clear"), confirm: q(".cart-confirm"),
    close: q(".cart-close"),
  };
}

function cartRowHTML(r) {
  const p = r.p;
  const line = p.price * r.qty;
  return `<li class="cart-row${p.soldOut ? " is-sold-out" : ""}" data-id="${esc(p.id)}">` +
    `<img class="cart-thumb" src="${esc(p.images[0] || "")}" alt="" loading="lazy">` +
    `<div class="cart-row-info">` +
      `<a class="cart-row-name" href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a>` +
      (line && !p.soldOut ? `<span class="cart-row-price">${faNum(line)} ${esc(SHOP.currency)}</span>` : "") +
      (p.soldOut ? `<p class="cart-row-note">${CART_TEXT.soldOut}</p>` : "") +
    `</div>` +
    (p.soldOut ? "" : qtyHTML(p, r.qty)) +
    `<button type="button" class="cart-remove" data-cart="remove" aria-label="${esc(CART_TEXT.remove(p.name))}">${CART_ICONS.bin}</button>` +
    `</li>`;
}

// redraw everything that shows the cart
function cartRefresh() {
  document.querySelectorAll(".cart-ctl[data-id]").forEach((el) => {
    const p = cartProduct(el.getAttribute("data-id"));
    if (p) el.innerHTML = cartCtlInner(p);
  });
  if (!cartEls) return;
  const rows = cartRows();
  const n = rows.reduce((s, r) => s + r.qty, 0);
  const e = cartEls;

  e.fab.hidden = !n;
  e.badge.textContent = faNum(n);
  e.fab.setAttribute("aria-label", CART_TEXT.fab(faNum(n)));

  // phones, product page: the sticky order bar adds this product while the cart is
  // empty, then opens the cart
  const bar = document.querySelector(".order-bar[data-id]");
  if (bar) {
    if (!bar.querySelector(".order-bar-cart")) {
      bar.innerHTML =
        `<button type="button" class="btn order-bar-add" data-cart="add">${CART_ICONS.cart}${CART_TEXT.add}</button>` +
        `<button type="button" class="btn order-bar-cart"></button>`;
    }
    bar.querySelector(".order-bar-cart").innerHTML = `${CART_ICONS.cart}${CART_TEXT.bar(faNum(n))}`;
    bar.querySelector(".order-bar-cart").hidden = !n;
    bar.querySelector(".order-bar-add").hidden = Boolean(n);
  }

  // footer «سفارش در واتساپ»: the cart message when it has items, else the general one
  const okCount = rows.reduce((s, r) => s + (r.p.soldOut ? 0 : r.qty), 0);
  document.querySelectorAll("a.wa-order").forEach((a) => {
    a.href = okCount ? cartWhatsAppUrl() : orderUrl();
    const c = a.querySelector(".wa-count");
    if (c) c.textContent = okCount ? ` (${faNum(okCount)})` : "";
  });

  e.list.innerHTML = rows.map(cartRowHTML).join("");
  e.empty.hidden = Boolean(rows.length);
  e.foot.hidden = !rows.length;
  const ok = rows.filter((r) => !r.p.soldOut);
  const total = ok.reduce((s, r) => s + r.p.price * r.qty, 0);
  e.totalLine.hidden = !total;
  e.totalValue.textContent = `${faNum(total)} ${SHOP.currency}`;
  e.send.hidden = !SHOP.whatsapp || !ok.length;
  if (SHOP.whatsapp && ok.length) e.send.href = cartWhatsAppUrl();
  if (!rows.length) e.confirm.hidden = true;
  e.clear.hidden = !e.confirm.hidden;
}

function cartToast(text) {
  const t = cartEls.toast;
  t.textContent = text;
  t.hidden = false;
  t.classList.remove("is-show");
  void t.offsetWidth; // restart the CSS animation
  t.classList.add("is-show");
  clearTimeout(cartToastTimer);
  cartToastTimer = setTimeout(() => { t.classList.remove("is-show"); t.hidden = true; }, 2200);
}

// offsetParent is null for position:fixed elements, so check the layout boxes instead
function cartVisible(el) {
  return Boolean(el && el.getClientRects().length);
}

function cartFocusables() {
  return Array.prototype.filter.call(
    cartEls.drawer.querySelectorAll("a[href], button:not([disabled])"),
    cartVisible);
}

function cartOpen() {
  cartOpener = document.activeElement;
  cartRefresh();
  cartEls.backdrop.hidden = false;
  cartEls.drawer.hidden = false;
  document.body.classList.add("cart-open");
  requestAnimationFrame(() => cartEls.drawer.classList.add("is-open"));
  cartEls.close.focus();
}

function cartClose() {
  if (cartEls.drawer.hidden) return;
  cartEls.drawer.classList.remove("is-open");
  cartEls.drawer.hidden = true;
  cartEls.backdrop.hidden = true;
  cartEls.confirm.hidden = true;
  cartEls.clear.hidden = false;
  document.body.classList.remove("cart-open");
  const o = cartOpener;
  cartOpener = null;
  if (o && o !== document.body && document.body.contains(o) && cartVisible(o)) o.focus();
  else if (cartVisible(cartEls.fab)) cartEls.fab.focus();
  else if (cartVisible(document.querySelector(".order-bar-cart"))) document.querySelector(".order-bar-cart").focus();
}

// after a redraw, put focus back on the matching button
function cartRefocus(scope, id, action) {
  if (scope === "bar") {
    const c = document.querySelector(".order-bar-cart");
    if (cartVisible(c)) c.focus();
    return;
  }
  let box = null;
  const sel = scope === "row" ? ".cart-row[data-id]" : ".cart-ctl[data-id]";
  document.querySelectorAll(sel).forEach((el) => { if (!box && el.getAttribute("data-id") === id) box = el; });
  if (!box) { if (scope === "row") (cartFocusables()[1] || cartEls.close).focus(); return; }
  const want = action === "add" ? "inc" : action;
  const el = box.querySelector(`[data-cart="${want}"]:not([disabled])`) ||
    box.querySelector("[data-cart]:not([disabled])");
  if (el) el.focus();
}

function initCart() {
  if (cartEls || LOAD_FAILED) return;
  cartBuild();
  const e = cartEls;

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-cart]");
    if (b) {
      const box = b.closest(".cart-ctl, .cart-row, .order-bar");
      const id = box && box.getAttribute("data-id");
      const p = id && cartProduct(id);
      if (!p) return;
      ev.preventDefault();
      const action = b.getAttribute("data-cart");
      const q = cartQty(id);
      if (action === "add") cartChange(id, Math.max(1, q));
      else if (action === "inc") cartChange(id, q + 1);
      else if (action === "dec") cartChange(id, q - 1);
      else if (action === "remove") cartChange(id, 0);
      cartRefresh();
      cartRefocus(box.classList.contains("cart-row") ? "row" : box.classList.contains("order-bar") ? "bar" : "ctl", id, action);
      if (action === "add") cartToast(CART_TEXT.toast);
      return;
    }
    if (ev.target.closest(".cart-fab, .order-bar-cart")) cartOpen();
  });

  e.backdrop.addEventListener("click", cartClose);
  e.close.addEventListener("click", cartClose);
  e.clear.addEventListener("click", () => {
    e.confirm.hidden = false;
    e.clear.hidden = true;
    e.confirm.querySelector(".cart-confirm-no").focus();
  });
  e.confirm.querySelector(".cart-confirm-no").addEventListener("click", () => {
    e.confirm.hidden = true;
    e.clear.hidden = false;
    e.clear.focus();
  });
  e.confirm.querySelector(".cart-confirm-yes").addEventListener("click", () => {
    cartSet({});
    cartRefresh();
    (e.empty.querySelector("a") || e.close).focus();
  });

  // Esc closes; Tab stays inside the open drawer
  document.addEventListener("keydown", (ev) => {
    if (e.drawer.hidden) return;
    if (ev.key === "Escape" || ev.key === "Esc") { ev.preventDefault(); cartClose(); return; }
    if (ev.key !== "Tab") return;
    const f = cartFocusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!e.drawer.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
    else if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });

  // another tab changed the cart
  window.addEventListener("storage", (ev) => {
    if (ev.key === CART_KEY || ev.key === null) cartRefresh();
  });

  cartRefresh();
}
