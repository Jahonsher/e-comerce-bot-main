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
function initTelegramUser() {
  if (!window.Telegram || !window.Telegram.WebApp) {
    showNotTelegramWarning();
    return;
  }

  const tg = window.Telegram.WebApp;
  tg.expand();
  tg.setHeaderColor("#0d0a07");
  tg.setBackgroundColor("#0d0a07");

  // ✅ 1-usul: initDataUnsafe.user dan olish
  let tgUser = tg.initDataUnsafe?.user;

  // ✅ 2-usul: initData string dan parse qilish (ba'zi versiyalarda kerak)
  if (!tgUser && tg.initData) {
    try {
      const params = new URLSearchParams(tg.initData);
      const userStr = params.get("user");
      if (userStr) tgUser = JSON.parse(decodeURIComponent(userStr));
    } catch(e) {
      console.warn("initData parse xato:", e);
    }
  }

  console.log("🔍 tgUser:", tgUser);
  console.log("🔍 initData:", tg.initData?.substring(0, 100));

  if (tgUser && tgUser.id) {
    telegramId = tgUser.id;
    userData   = tgUser;

    fetch(API + "/auth", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        id:         tgUser.id,
        first_name: tgUser.first_name || "",
        last_name:  tgUser.last_name  || "",
        username:   tgUser.username   || ""
      })
    })
    .then(r => r.json())
    .then(() => fetch(API + "/user/" + telegramId).then(r => r.json()))
    .then(fullUser => {
      userProfile = fullUser;
      userData    = { ...userData, phone: fullUser.phone || "" };
      renderProfile();
    })
    .catch(err => console.error("AUTH ERROR:", err));

  } else {
    // Telegram WebApp bor lekin user kelmadi — ehtimol eski versiya
    // Shunda ham mahsulotlarni ko'rsatamiz
    console.warn("⚠️ tgUser kelmadi, initData:", tg.initData);
    showNotTelegramWarning();
  }
}

function showNotTelegramWarning() {
  const warning = document.getElementById("tgWarning");
  if (warning) warning.style.display = "flex";
  telegramId = null;
}

initTelegramUser();

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
        <button class="add-btn" data-id="${p.id}" onclick="addToCart(${p.id})">Qo'shish</button>
      </div>`;
    container.appendChild(card);
  });
  updateProductButtons(); // render bo'lgandan keyin holat yangilanadi
}

/* ===== FILTER ===== */
function filterCategory(cat, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderProducts(cat === "all" ? products : products.filter(p => p.category === cat));
}

/* ===== CART ===== */
function addToCart(id, btnEl) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const ex = cart.find(p => p.id === id);
  if (ex) ex.quantity++;
  else cart.push({ ...product, quantity: 1 });
  updateCart();
  updateProductButtons(); // barcha tugmalarni yangilash
}

function changeQty(id, delta) {
  const item = cart.find(p => p.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(p => p.id !== id);
  updateCart();
  updateProductButtons();
}

// Savatchadagi mahsulotlarga qarab tugmalarni yangilash
function updateProductButtons() {
  document.querySelectorAll(".add-btn").forEach(btn => {
    const id = Number(btn.dataset.id);
    const inCart = cart.find(p => p.id === id);
    if (inCart) {
      btn.innerHTML = "✓ Qo'shildi";
      btn.style.background = "linear-gradient(135deg, #4ade80, #16a34a)";
      btn.style.color = "#0d0a07";
    } else {
      btn.innerHTML = "Qo'shish";
      btn.style.background = "";
      btn.style.color = "";
    }
  });
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
  if (!telegramId) {
    alert("⚠️ Buyurtma berish uchun Telegram bot orqali kiring!\n\n@mini_shop_jahonsher_bot ga /start yuboring");
    return;
  }

  const btn = document.getElementById("checkoutBtn");
  if (btn) { btn.disabled = true; btn.innerText = "Yuborilmoqda..."; }

  const userToSend = {
    first_name: userProfile?.first_name || userData?.first_name || "",
    last_name:  userProfile?.last_name  || userData?.last_name  || "",
    username:   userProfile?.username   || userData?.username   || "",
    phone:      userProfile?.phone      || userData?.phone      || ""
  };
  console.log("📤 userToSend:", userToSend);

  fetch(API + "/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId, items: cart, user: userToSend })
  })
  .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  .then(() => {
    cart = [];
    updateCart();
    updateProductButtons();
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