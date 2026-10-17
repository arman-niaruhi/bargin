function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function price(p) {
  const n = Number(p.price);
  const text = Number.isInteger(n) ? n : n.toFixed(2);
  return SHOP.currency + text;
}

function contactLinks(subject) {
  const links = [];
  if (SHOP.whatsapp) {
    const msg = encodeURIComponent(`Hi, I'm interested in: ${subject}`);
    links.push(`<a class="btn" href="https://wa.me/${esc(SHOP.whatsapp)}?text=${msg}" target="_blank" rel="noopener">WhatsApp</a>`);
  }
  if (SHOP.email) {
    const s = encodeURIComponent(subject);
    links.push(`<a class="btn ${links.length ? "btn-ghost" : ""}" href="mailto:${esc(SHOP.email)}?subject=${s}">Email</a>`);
  }
  if (SHOP.phone) {
    links.push(`<a class="btn btn-ghost" href="tel:${esc(SHOP.phone)}">Call</a>`);
  }
  if (SHOP.instagram) {
    links.push(`<a class="btn btn-ghost" href="https://instagram.com/${esc(SHOP.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
  }
  return links.join("");
}

function renderShell() {
  document.getElementById("shop-name").textContent = SHOP.name;
  const year = new Date().getFullYear();
  document.getElementById("footer").innerHTML =
    `<div class="contact">${contactLinks(SHOP.name)}</div>` +
    `<p>&copy; ${year} ${esc(SHOP.name)}</p>`;
}

function renderHome() {
  renderShell();
  document.title = SHOP.name;
  document.getElementById("shop-title").textContent = SHOP.name;
  document.getElementById("shop-tagline").textContent = SHOP.tagline;

  document.getElementById("product-grid").innerHTML = PRODUCTS.map((p) => `
    <a class="card" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="card-img">
        <img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
        ${p.soldOut ? '<span class="badge">Sold out</span>' : ""}
      </div>
      <div class="card-body">
        <h2>${esc(p.name)}</h2>
        <p class="short">${esc(p.short || "")}</p>
        <div class="card-foot">
          <span class="price">${price(p)}</span>
          <span class="more">Details &rarr;</span>
        </div>
      </div>
    </a>`).join("");
}

function renderProduct() {
  renderShell();
  const id = new URLSearchParams(location.search).get("id");
  const p = PRODUCTS.find((x) => x.id === id);
  const box = document.getElementById("product-detail");

  if (!p) {
    box.innerHTML = `<p class="empty">Product not found.</p>`;
    return;
  }
  document.title = `${p.name} · ${SHOP.name}`;

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
        <div class="main-img"><img id="main-img" src="${esc(p.images[0])}" alt="${esc(p.name)}"></div>
        ${thumbs}
      </div>
      <div class="info">
        <h1>${esc(p.name)}</h1>
        <p class="price big">${price(p)} ${p.soldOut ? '<span class="badge inline">Sold out</span>' : ""}</p>
        <p class="details">${esc(p.details || p.short || "")}</p>
        ${specs.length ? `<table class="specs">${specs.map(([k, v]) =>
          `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
        ${p.soldOut ? "" : `<div class="buy"><p>Interested? Contact me:</p><div class="contact">${contactLinks(p.name)}</div></div>`}
      </div>
    </div>`;

  box.querySelectorAll(".thumb").forEach((t) => t.addEventListener("click", () => {
    document.getElementById("main-img").src = t.dataset.src;
    box.querySelectorAll(".thumb").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
  }));
}
