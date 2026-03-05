const API =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://e-comerce-bot-main-production.up.railway.app";

let products   = [];
let cart       = [];
let telegramId = null;
let userData   = null;
let userProfile = null;

/* ===== TELEGRAM AUTH ===== */
// 1. Telegram WebApp dan ID olamiz
// 2. /auth orqali DB ga yozamiz (ism/username yangilanadi, telefon saqlanib qoladi)
// 3. /user/:id dan to'liq profil olamiz (telefon bilan)

if (window.Telegram && Telegram.WebApp) {
  const tg = Telegram.WebApp;
  tg.expand();
  tg.setHeaderColor("#0d0a07");
  tg.setBackgroundColor("#0d0a07");

  // DEBUG — konsolda ko'rsatish
  console.log("🔍 Telegram.WebApp mavjud:", !!tg);
  console.log("🔍 initData:", tg.initData);
  console.log("🔍 initDataUnsafe:", JSON.stringify(tg.initDataUnsafe));
  console.log("🔍 initDataUnsafe.user:", JSON.stringify(tg.initDataUnsafe?.user));

  if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userData   = tg.initDataUnsafe.user;
    telegramId = userData.id;

    // Auth — DB ga yozamiz
    fetch(API + "/auth", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(userData)
    })
    .then(r => r.json())
    .then(() => {
      // Auth dan keyin to'liq profil olamiz (telefon ham bor)
      return fetch(API + "/user/" + telegramId).then(r => r.json());
    })
    .then(fullUser => {
      userProfile = fullUser;
      userData    = { ...userData, ...fullUser }; // telefonni ham qo'shamiz
      console.log("✅ User profil yuklandi:", userProfile);
      renderProfile();
    })
    .catch(err => console.error("AUTH ERROR:", err));
  }
}

// Test mode (bot orqali emas, to'g'ridan brauzerda ochilganda)
if (!telegramId) {
  telegramId = 8523270760;
  console.warn("⚠️ Test mode, telegramId:", telegramId);
  fetch(API + "/user/" + telegramId)
    .then(r => r.json())
    .then(data => {
      userProfile = data;
      userData    = { id: telegramId, ...data };
      renderProfile();
    })
    .catch(() => {});
}

/* ===== PROFILE ===== */
function renderProfile() {
  const u = userProfile || userData;
  if (!u) return;

  const nameEl   = document.getElementById("profileName");
  const unameEl  = document.getElementById("profileUsername");
  const phoneEl  = document.getElementById("profilePhone");

  if (nameEl)  nameEl.innerText  = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Mehmon";
  if (unameEl) unameEl.innerText = u.username ? `@${u.username}` : "";
  if (phoneEl) phoneEl.innerText = u.phone    ? `📱 ${u.phone}`  : "📱 Telefon biriktirilmagan";
}

/* ===== LOAD PRODUCTS ===== */
function loadProducts() {
  fetch(API + "/products")
    .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(data => {
      products = data;
      renderProducts(products);
    })
    .catch(err => {
      document.getElementById("products").innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon">⚠️</div>
          <p>Mahsulotlar yuklanmadi (${err.message})</p>
        </div>`;
    });
}

/* ===== RENDER PRODUCTS ===== */
function renderProducts(list) {
  const container = document.getElementById("products");
  container.innerHTML = "";

  if (!list || !list.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon">🍽</div><p>Mahsulotlar topilmadi</p></div>`;
    return;
  }

  list.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.style.animationDelay = `${i * 60}ms`;
    card.innerHTML = `
      <img src="${p.image}" alt="${p.name}"
           onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
      <div class="img-placeholder" style="display:none">🍽</div>
      <div class="product-info">
        <h3>${p.name}</h3>
        <div class="cat">${p.category}</div>
        <span class="price">${Number(p.price).toLocaleString()} so'm</span>
        <button class="add-btn" onclick="addToCart(${p.id})">Qo'shish</button>
      </div>`;
    container.appendChild(card);
  });
}

/* ===== FILTER ===== */
function filterCategory(cat, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderProducts(cat === "all" ? products : products.filter(p => p.category === cat));
}

/* ===== CART ===== */
function addToCart(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const ex = cart.find(p => p.id === id);
  if (ex) ex.quantity++;
  else cart.push({ ...product, quantity: 1 });
  updateCart();

  // mini feedback
  const btns = document.querySelectorAll(".add-btn");
  // find the right button visually
}

function changeQty(id, delta) {
  const item = cart.find(p => p.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(p => p.id !== id);
  updateCart();
}

function updateCart() {
  const container = document.getElementById("cartItems");
  if (!container) return;

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = cart.reduce((s, i) => s + i.quantity, 0);

  // Badge
  const badge = document.getElementById("cartCount");
  if (badge) badge.innerText = count;

  // Total
  const totalEl = document.getElementById("cartTotal");
  if (totalEl) totalEl.innerText = Number(total).toLocaleString();

  if (!cart.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🛒</div><p>Savatcha bo'sh</p></div>`;
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${Number(item.price).toLocaleString()} so'm</div>
      </div>
      <div class="qty-controls">
        <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
        <span class="qty-num">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
      </div>
    </div>`).join("");
}

/* ===== PANELS ===== */
function toggleCart()    { openPanel("cartPanel"); }
function openUserPanel() { openPanel("userPanel"); renderProfile(); loadUserOrders(); }

function openPanel(id) {
  document.getElementById(id)?.classList.add("open");
  document.getElementById("overlay")?.classList.add("show");
}

function closePanels() {
  document.getElementById("cartPanel")?.classList.remove("open");
  document.getElementById("userPanel")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("show");
}

/* ===== CHECKOUT ===== */
function checkout() {
  if (!cart.length) { alert("⚠️ Savatcha bo'sh!"); return; }

  const btn = document.getElementById("checkoutBtn");
  if (btn) { btn.disabled = true; btn.innerText = "Yuborilmoqda..."; }

  const userToSend = {
    first_name: userProfile?.first_name || userData?.first_name || "",
    last_name:  userProfile?.last_name  || userData?.last_name  || "",
    username:   userProfile?.username   || userData?.username   || "",
    phone:      userProfile?.phone      || ""
  };

  fetch(API + "/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId, items: cart, user: userToSend })
  })
  .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  .then(() => {
    cart = [];
    updateCart();
    closePanels();
    alert("✅ Buyurtma muvaffaqiyatli qabul qilindi!");
  })
  .catch(err => alert("❌ Xato: " + err.message))
  .finally(() => {
    if (btn) { btn.disabled = false; btn.innerText = "Buyurtma Berish"; }
  });
}

/* ===== USER ORDERS ===== */
function loadUserOrders() {
  fetch(API + "/user/" + telegramId + "/orders")
    .then(r => r.json())
    .then(data => {
      const c = document.getElementById("userOrders");
      if (!c) return;

      if (!data || !data.length) {
        c.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>Hali buyurtma yo'q</p></div>`;
        return;
      }

      c.innerHTML = data.map(order => {
        const items = order.items.map(i => `${i.name} × ${i.quantity}`).join(", ");
        const date  = new Date(order.createdAt).toLocaleDateString("uz-UZ");
        return `
          <div class="order-card">
            <div class="order-items">${items}</div>
            <div class="order-total">${Number(order.total).toLocaleString()} so'm</div>
            <div><span class="order-status">${order.status || "Yangi"}</span></div>
            <div class="order-date">🕐 ${date}</div>
          </div>`;
      }).join("");
    })
    .catch(err => console.error("USER ORDERS ERROR:", err));
}

function scrollToMenu() {
  document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
}

loadProducts();