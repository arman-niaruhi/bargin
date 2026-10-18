// برگین Telegram bot — a Cloudflare Worker that answers button taps.
//
// Telegram sends every message / button tap here (webhook). The bot reads the
// products live from the website (data/products.csv, products.js),
// so it always matches the site.
// Plain JavaScript, no libraries. Deployed by deploy.py.
//
// Env (set by deploy.py): TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET, SITE_URL

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("برگین bot");
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const update = await request.json();
    try {
      await handle(update, env);
    } catch (e) {
      console.log("error", e && e.stack || e);
    }
    return new Response("ok"); // always 200, or Telegram retries the same update
  },
};

// ---------- reading the website's data ----------
// data/products.csv (products + categories) and products.js (SHOP contacts),
// fetched live from the site so the bot always matches it.

let cache = { at: 0, data: null };

async function loadShop(env) {
  if (cache.data && Date.now() - cache.at < 60 * 1000) return cache.data;
  const get = (f) => fetch(env.SITE_URL + f, { cf: { cacheTtl: 60 } }).then((r) => r.text());
  const [js, csv] = await Promise.all([get("products.js"), get("data/products.csv")]);
  const products = parseCSV(csv).filter((r) => r.id && r.name).map(productFromRow);
  cache = {
    at: Date.now(),
    data: {
      shop: readConst(js, "SHOP"),
      categories: categoriesOf(products),
      products,
    },
  };
  return cache.data;
}

// Same CSV reading as the website's app.js (keep the two in sync).
// Reads CSV text (as saved by Excel / LibreOffice) into a list of objects,
// one per row, keyed by the header row. Handles quotes, line breaks inside
// quotes, a leading BOM, and ";" as separator (some Excel versions use it).
export function parseCSV(text) {
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
    .map((r) => {
      const obj = {};
      for (let k = 0; k < head.length; k++) obj[head[k]] = (r[k] || "").trim();
      return obj;
    });
}

// one products.csv row → the product object the pages use
export function productFromRow(r) {
  const digits = String(r.price).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/\D/g, "");
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    price: Number(digits),
    unit: r.unit,
    serves: r.serves || "",
    recipe: r.recipe || "",
    short: r.short,
    details: r.details,
    specs: {},  // owner removed the «واحد فروش» row
    images: r.images.split("|").map((s) => s.trim()).filter(Boolean),
    soldOut: /^(yes|true|1|بله|آره)$/i.test(r.soldOut),
  };
}

export function categoriesOf(products) {
  return [...new Set(products.map((p) => p.category).filter(Boolean))].map((name) => ({ id: name, name }));
}

// Parses `const NAME = <object/array literal>;` from products.js.
// Handles comments, unquoted keys, trailing commas and "a" + "b" strings.
// (Workers can't eval code, so this small parser reads the data instead.)
export function readConst(js, name) {
  const start = js.indexOf("const " + name + " =");
  if (start < 0) return null;
  let i = js.indexOf("=", start) + 1;

  function skip() {
    for (;;) {
      while (i < js.length && /\s/.test(js[i])) i++;
      if (js.startsWith("//", i)) { while (i < js.length && js[i] !== "\n") i++; continue; }
      if (js.startsWith("/*", i)) { i = js.indexOf("*/", i) + 2; continue; }
      return;
    }
  }
  function str() {
    const q = js[i++];
    let out = "";
    while (js[i] !== q) {
      if (js[i] === "\\") {
        const c = js[++i];
        out += c === "n" ? "\n" : c === "t" ? "\t" : c;
      } else out += js[i];
      i++;
    }
    i++;
    return out;
  }
  function value() {
    skip();
    const c = js[i];
    if (c === "{") {
      i++;
      const obj = {};
      for (;;) {
        skip();
        if (js[i] === "}") { i++; return obj; }
        let key;
        if (js[i] === '"' || js[i] === "'") key = str();
        else { const m = /^[\w$]+/.exec(js.slice(i)); key = m[0]; i += key.length; }
        skip(); i++; // ':'
        obj[key] = value();
        skip();
        if (js[i] === ",") i++;
      }
    }
    if (c === "[") {
      i++;
      const arr = [];
      for (;;) {
        skip();
        if (js[i] === "]") { i++; return arr; }
        arr.push(value());
        skip();
        if (js[i] === ",") i++;
      }
    }
    if (c === '"' || c === "'") {
      let s = str();
      for (;;) { // "a" + "b"
        const save = i;
        skip();
        if (js[i] === "+") { i++; skip(); s += str(); } else { i = save; return s; }
      }
    }
    const m = /^(-?\d+(\.\d+)?|true|false|null)/.exec(js.slice(i));
    i += m[0].length;
    return JSON.parse(m[0]);
  }
  return value();
}

// ---------- Telegram ----------

async function tg(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json();
  if (!out.ok) console.log(method, out.description);
  return out;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

// same format as the website: «۹۰۰,۰۰۰ تومان / کیلو»
function price(p, shop) {
  const unit = p.unit ? ` / ${p.unit}` : "";
  return `${Number(p.price).toLocaleString("fa-IR")} ${shop.currency}${unit}`;
}

function orderUrl(shop, subject) {
  const msg = encodeURIComponent(`سلام، می‌خوام «${subject}» رو سفارش بدم.`);
  return `https://wa.me/${shop.whatsapp}?text=${msg}`;
}

const BACK_HOME = { text: "🔙 منوی اصلی", callback_data: "home" };

// Each screen is { photo, caption, keyboard }. Every screen is a photo message,
// so moving between screens just edits the same message.

function homeScreen(env, data) {
  const { shop, categories, products } = data;
  const cats = categories.filter((c) => products.some((p) => p.category === c.id));
  const rows = [[{ text: "🛒 همه محصولات", callback_data: "cat:all" }]];
  for (let k = 0; k < cats.length; k += 2) {
    rows.push(cats.slice(k, k + 2).map((c) => ({ text: "🌿 " + c.name, callback_data: "cat:" + categories.indexOf(c) })));
  }
  rows.push([{ text: "📞 ثبت سفارش و تماس", callback_data: "contact" }]);
  rows.push([{ text: "🌐 سایت برگین", url: env.SITE_URL }]);
  return {
    photo: env.SITE_URL + "images/logo.jpg",
    caption: `🌿 <b>${esc(shop.name)}</b> — ${esc(shop.tagline)}\n\nچی می‌خوای ببینی؟ 👇`,
    keyboard: rows,
  };
}

// Buttons carry the category's position ("cat:0"), not its Persian name, because
// Telegram limits button data to 64 bytes.
function categoryScreen(env, data, key) {
  const { shop, categories, products } = data;
  const cat = key === "all" ? null : categories[Number(key)];
  if (key !== "all" && !cat) return homeScreen(env, data);
  const list = cat ? products.filter((p) => p.category === cat.id) : products;
  const title = cat ? cat.name : "همه محصولات";
  const lines = list.map((p) =>
    `• ${esc(p.name)} — ${esc(price(p, shop))}${p.soldOut ? " (ناموجود)" : ""}`);
  return {
    photo: env.SITE_URL + "images/logo.jpg",
    caption: `🌿 <b>${esc(title)}</b>\n\n${lines.join("\n")}\n\nروی هر محصول بزن تا جزئیاتشو ببینی 👇`,
    keyboard: [
      ...list.map((p) => [{ text: p.name + (p.soldOut ? " (ناموجود)" : ""), callback_data: `p:${p.id}:${key}` }]),
      [BACK_HOME],
    ],
  };
}

function productScreen(env, data, id, from) {
  const { shop, categories, products } = data;
  const p = products.find((x) => x.id === id);
  if (!p) return homeScreen(env, data);
  const cat = categories.find((c) => c.id === p.category);
  const parts = [`<b>${esc(p.name)}</b>`];
  if (cat) parts.push(`دسته‌بندی: ${esc(cat.name)}`);
  parts.push("", `💰 ${esc(price(p, shop))}`);
  if (p.serves && !p.recipe) parts.push("", `👥 ${esc(p.serves)}`);
  if (p.soldOut) parts.push("❌ <b>ناموجود</b>");
  if (p.details) parts.push("", esc(p.details));
  const rows = [[{ text: "🌐 مشاهده در سایت", url: `${env.SITE_URL}product.html?id=${p.id}` }]];
  const prepOnly = /^طرز تهیه\s*:/.test(p.recipe);
  if (p.recipe) rows.unshift([{ text: prepOnly ? "🥗 طرز تهیه" : "🍲 دستور پخت", callback_data: `r:${p.id}:${from || ""}` }]);
  if (!p.soldOut && shop.whatsapp) rows.push([{ text: "💬 سفارش در واتساپ", url: orderUrl(shop, p.name) }]);
  const back = from || String(categories.indexOf(cat));
  rows.push([{ text: "🔙 بازگشت", callback_data: "cat:" + back }, BACK_HOME]);
  return {
    photo: env.SITE_URL + (p.images && p.images[0] ? p.images[0] : "images/logo.jpg"),
    caption: parts.join("\n").slice(0, 1024), // Telegram caption limit
    keyboard: rows,
  };
}

// recipe text: first line = dish, "- " = ingredients, numbered = steps, rest = tips
function recipeScreen(env, data, id, from) {
  const p = data.products.find((x) => x.id === id);
  if (!p || !p.recipe) return homeScreen(env, data);
  const lines = p.recipe.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  if (p.serves) out.push(`👥 <b>چقدر برای هر نفر؟</b>`, esc(p.serves), "");
  // «طرز تهیه: X» (not cooked, e.g. دلال‌ها) → title «طرز تهیه», steps heading «مراحل»
  let title = lines.shift();
  const prep = /^طرز تهیه\s*:/.test(title);
  if (prep) title = title.replace(/^طرز تهیه\s*:\s*/, "");
  out.push(`${prep ? "🥗" : "🍲"} <b>${prep ? "طرز تهیه" : "دستور پخت"}: ${esc(title)}</b>`);
  const items = lines.filter((l) => /^[-•]/.test(l));
  const steps = lines.filter((l) => /^[0-9۰-۹]+[.)\-]/.test(l));
  const tips = lines.filter((l) => !/^[-•]/.test(l) && !/^[0-9۰-۹]+[.)\-]/.test(l));
  if (items.length) out.push("", "<b>مواد لازم:</b>", ...items.map((l) => "▫️ " + esc(l.replace(/^[-•]\s*/, ""))));
  if (steps.length) out.push("", `<b>${prep ? "مراحل" : "طرز تهیه"}:</b>`, ...steps.map(esc));
  if (tips.length) out.push("", ...tips.map((t) => "💡 " + esc(t)));
  return {
    photo: env.SITE_URL + (p.images && p.images[0] ? p.images[0] : "images/logo.jpg"),
    caption: out.join("\n").slice(0, 1024),
    keyboard: [[{ text: "🔙 بازگشت", callback_data: `p:${p.id}:${from}` }, BACK_HOME]],
  };
}

function contactScreen(env, data) {
  const { shop } = data;
  const rows = [];
  if (shop.whatsapp) rows.push([{ text: "💬 سفارش در واتساپ", url: orderUrl(shop, shop.name) }]);
  if (shop.telegram) rows.push([{ text: "تلگرام", url: "https://t.me/" + shop.telegram }]);
  if (shop.instagram) rows.push([{ text: "📷 اینستاگرام", url: "https://instagram.com/" + shop.instagram }]);
  rows.push([BACK_HOME]);
  // Telegram buttons can't dial a number, so the phone is shown as text
  const phone = shop.phone ? `\n\n📞 تماس: ${esc(String(shop.phone).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]))}` : "";
  return {
    photo: env.SITE_URL + "images/logo.jpg",
    caption: `🌿 <b>${esc(shop.name)}</b>\n\nسؤالی داری یا می‌خوای سفارش بدی؟ بهمون پیام بده:${phone}`,
    keyboard: rows,
  };
}

function screenFor(env, data, action) {
  if (action.startsWith("cat:")) return categoryScreen(env, data, action.slice(4));
  if (action.startsWith("p:")) {
    const [, id, from] = action.split(":");
    return productScreen(env, data, id, from);
  }
  if (action.startsWith("r:")) {
    const [, id, from] = action.split(":");
    return recipeScreen(env, data, id, from);
  }
  if (action === "contact") return contactScreen(env, data);
  return homeScreen(env, data);
}

function sendScreen(env, chatId, s) {
  return tg(env, "sendPhoto", {
    chat_id: chatId, photo: s.photo, caption: s.caption, parse_mode: "HTML",
    reply_markup: { inline_keyboard: s.keyboard },
  });
}

function editScreen(env, msg, s) {
  return tg(env, "editMessageMedia", {
    chat_id: msg.chat.id, message_id: msg.message_id,
    media: { type: "photo", media: s.photo, caption: s.caption, parse_mode: "HTML" },
    reply_markup: { inline_keyboard: s.keyboard },
  });
}

export async function handle(update, env) {
  const data = await loadShop(env);
  if (update.message) {
    // /start or anything typed → main menu
    await sendScreen(env, update.message.chat.id, homeScreen(env, data));
  } else if (update.callback_query) {
    const q = update.callback_query;
    await tg(env, "answerCallbackQuery", { callback_query_id: q.id });
    if (q.message) {
      const s = screenFor(env, data, q.data || "home");
      const res = await editScreen(env, q.message, s);
      // an old message that can't be edited any more → send a fresh one
      if (!res.ok && !/not modified/.test(res.description || "")) await sendScreen(env, q.message.chat.id, s);
    }
  }
}
