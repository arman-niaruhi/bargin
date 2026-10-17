function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function price(p) {
  const unit = p.unit ? ` / ${esc(p.unit)}` : "";
  return `${Number(p.price).toLocaleString("fa-IR")} ${esc(SHOP.currency)}${unit}`;
}

function contactLinks(subject) {
  const msg = encodeURIComponent(`سلام، می‌خواهم «${subject}» را سفارش بدهم.`);
  const links = [];
  if (SHOP.whatsapp) {
    links.push(`<a class="btn" href="https://wa.me/${esc(SHOP.whatsapp)}?text=${msg}" target="_blank" rel="noopener">سفارش در واتساپ</a>`);
  }
  if (SHOP.telegram) {
    links.push(`<a class="btn" href="https://t.me/${esc(SHOP.telegram)}" target="_blank" rel="noopener">تلگرام</a>`);
  }
  if (SHOP.phone) {
    links.push(`<a class="btn" href="tel:${esc(SHOP.phone)}">تماس: <span dir="ltr">${esc(SHOP.phone)}</span></a>`);
  }
  if (SHOP.instagram) {
    links.push(`<a class="btn" href="https://instagram.com/${esc(SHOP.instagram)}" target="_blank" rel="noopener">اینستاگرام</a>`);
  }
  if (SHOP.email) {
    links.push(`<a class="btn" href="mailto:${esc(SHOP.email)}?subject=${encodeURIComponent(subject)}">ایمیل</a>`);
  }
  // first button is filled, the rest are outlined
  return links.map((l, i) => i ? l.replace('class="btn"', 'class="btn btn-ghost"') : l).join("");
}

function renderShell() {
  const year = new Date().getFullYear().toLocaleString("fa-IR", { useGrouping: false });
  document.getElementById("footer").innerHTML =
    `<div class="ornament"></div>` +
    `<p class="footer-tagline">${esc(SHOP.tagline)}</p>` +
    (contactLinks(SHOP.name)
      ? `<p class="footer-cta">برای اطلاعات بیشتر و ثبت سفارش:</p>` +
        `<div class="contact">${contactLinks(SHOP.name)}</div>`
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
    grid.innerHTML = list.map((p) => `
    <a class="card${p.soldOut ? " sold-out" : ""}" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="card-img">
        <img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
        ${p.soldOut ? '<span class="badge">ناموجود</span>' : ""}
      </div>
      <div class="card-body">
        <h3>${esc(p.name)}</h3>
        <p class="short">${esc(p.short || "")}</p>
        <div class="card-foot">
          <span class="price">${price(p)}</span>
          <span class="more">جزئیات &larr;</span>
        </div>
      </div>
    </a>`).join("");
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
  renderShell();
  const id = new URLSearchParams(location.search).get("id");
  const p = PRODUCTS.find((x) => x.id === id);
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
        ${p.soldOut || !contactLinks(p.name) ? "" : `<div class="buy"><p>برای ثبت سفارش با ما در تماس باشید:</p><div class="contact">${contactLinks(p.name)}</div></div>`}
      </div>
    </div>`;

  box.querySelectorAll(".thumb").forEach((t) => t.addEventListener("click", () => {
    document.getElementById("main-img").src = t.dataset.src;
    box.querySelectorAll(".thumb").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
  }));
}
