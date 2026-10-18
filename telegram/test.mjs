// Local test of worker.js: fakes Telegram and reads the local products.js.
// Taps every button once and prints each screen. Run: node test.mjs
import { readFileSync } from "node:fs";
import worker, { readConst, parseCSV, productFromRow, categoriesOf } from "./worker.js";

const env = { TELEGRAM_BOT_TOKEN: "TEST", WEBHOOK_SECRET: "s3cret", SITE_URL: "https://arman-niaruhi.github.io/bargin/" };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const files = { "products.js": read("products.js"), "data/products.csv": read("data/products.csv") };
const js = files["products.js"];
const sent = [];
globalThis.fetch = async (url, opts) => {
  const file = Object.keys(files).find((f) => String(url).endsWith(f));
  if (file) return new Response(files[file]);
  const method = String(url).split("/").pop();
  sent.push({ method, body: JSON.parse(opts.body) });
  return Response.json({ ok: true, result: {} });
};

// the bot must read the data exactly like the website (app.js) does
const vm = await import("node:vm");
const ctx = { fetch: async (f) => ({ ok: true, text: async () => files[f] }) };
vm.runInNewContext(read("app.js") + ";this.load=async()=>{await loadData();return [PRODUCTS,CATEGORIES]}", ctx);
vm.runInNewContext(js + ";this.S=SHOP", ctx);
const [siteP, siteC] = await ctx.load();
const botP = parseCSV(files["data/products.csv"]).filter((r) => r.id && r.name).map(productFromRow);
const botC = categoriesOf(botP);
for (const [n, a, b] of [["SHOP", readConst(js, "SHOP"), ctx.S], ["products", botP, siteP], ["categories", botC, siteC]]) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("bot reads " + n + " differently from the site");
}
console.log("data OK: bot reads SHOP, products and categories exactly like the website");

const post = (update, secret = env.WEBHOOK_SECRET) => worker.fetch(new Request("https://x/", {
  method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret }, body: JSON.stringify(update),
}), env);

const bad = await post({}, "wrong");
console.log("wrong secret →", bad.status);

const screens = [];
const msg = { chat: { id: 1 }, message_id: 5 };
await post({ message: { chat: { id: 1 }, text: "/start" } });
const seen = new Set(), queue = [];
function collect() {
  for (const s of sent.splice(0)) {
    if (s.method === "answerCallbackQuery") continue;
    const photo = s.body.photo || s.body.media.media, caption = s.body.caption || s.body.media.caption;
    screens.push({ via: s.via, photo, caption, keyboard: s.body.reply_markup.inline_keyboard });
    for (const row of s.body.reply_markup.inline_keyboard) for (const b of row) {
      if (b.callback_data && !seen.has(b.callback_data)) { seen.add(b.callback_data); queue.push(b.callback_data); }
      if (b.url) new URL(b.url); // every link must be a valid URL
      if (b.callback_data && new TextEncoder().encode(b.callback_data).length > 64) throw new Error("callback_data too long");
    }
    if (caption.length > 1024) throw new Error("caption too long");
  }
}
collect(); screens[0].via = "/start";
while (queue.length) {
  const data = queue.shift();
  await post({ callback_query: { id: "q", data, message: msg } });
  const n = screens.length; collect(); screens[n].via = data;
}
for (const s of screens) {
  console.log(`\n=== ${s.via} ===\n[photo] ${s.photo.replace(env.SITE_URL, "")}\n${s.caption}`);
  for (const row of s.keyboard) console.log("  " + row.map((b) => `[${b.text}]${b.url ? "→" + b.url.replace(env.SITE_URL, "site/").slice(0, 45) : ""}`).join(" "));
}
console.log(`\n${screens.length} screens, all buttons OK`);
