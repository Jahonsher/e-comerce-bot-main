const API =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://e-comerce-bot-main-production.up.railway.app";

let products = [];
let cart = [];
let telegramId = null;
let userData = null;

/* ===========================
   TELEGRAM AUTH
=========================== */
if (window.Telegram && Telegram.WebApp) {

  const tg = Telegram.WebApp;
  tg.expand();

  if (tg.initDataUnsafe.user) {

    userData = tg.initDataUnsafe.user;
    telegramId = userData.id;

    fetch(API + "/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData)
    });
  }
}

if (!telegramId) {
  telegramId = 8523270760; // test
}

/* ===========================
   LOAD PRODUCTS
=========================== */
function loadProducts() {

  fetch(API + "/products")
    .then(res => res.json())
    .then(data => {
      console.log("PRODUCTS:", data);
      products = data;
      renderProducts(products);
    })
    .catch(err => console.log("PRODUCT FETCH ERROR:", err));
}

/* ===========================
   RENDER PRODUCTS
=========================== */
function renderProducts(list) {

  const container = document.getElementById("products");
  container.innerHTML = "";

  list.forEach(product => {

    container.innerHTML += `
      <div class="bg-[#1e293b] p-6 rounded-xl shadow-lg">

        <img src="${product.image}" 
             class="w-full h-48 object-cover rounded-lg mb-4">

        <h3 class="text-lg font-bold">${product.name}</h3>
        <p class="text-gray-400 mb-2">${product.category}</p>
        <p class="text-emerald-400 font-semibold mb-4">
          ${product.price} so'm
        </p>

        <button onclick="addToCart(${product.id})"
          class="bg-emerald-600 w-full py-2 rounded hover:bg-emerald-700">
          Savatchaga qo‘shish
        </button>
      </div>
    `;
  });
}

/* ===========================
   FILTER
=========================== */
function filterCategory(category) {

  if (category === "all") {
    renderProducts(products);
    return;
  }

  const filtered = products.filter(p =>
    p.category === category
  );

  renderProducts(filtered);
}

/* ===========================
   CART LOGIC
=========================== */
function addToCart(id) {

  const product = products.find(p => p.id === id);
  if (!product) return;

  const existing = cart.find(p => p.id === id);

  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  updateCart();
}

function changeQty(id, delta) {

  const item = cart.find(p => p.id === id);
  if (!item) return;

  item.quantity += delta;

  if (item.quantity <= 0) {
    cart = cart.filter(p => p.id !== id);
  }

  updateCart();
}

function updateCart() {

  const container = document.getElementById("cartItems");
  if (!container) return;

  container.innerHTML = "";

  let total = 0;

  cart.forEach(item => {

    total += item.price * item.quantity;

    container.innerHTML += `
      <div class="bg-[#1e293b] p-4 rounded-lg flex justify-between items-center">

        <div>
          <h4>${item.name}</h4>
          <p>${item.price} so'm</p>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="changeQty(${item.id}, -1)"
            class="bg-gray-700 px-3 rounded">-</button>
          <span>${item.quantity}</span>
          <button onclick="changeQty(${item.id}, 1)"
            class="bg-gray-700 px-3 rounded">+</button>
        </div>

      </div>
    `;
  });

  document.getElementById("cartCount").innerText =
    cart.reduce((sum, i) => sum + i.quantity, 0);

  document.getElementById("cartTotal").innerText = total;
}

/* ===========================
   PANEL CONTROL
=========================== */
function toggleCart() {
  openPanel("cartPanel");
}

function openUserPanel() {
  openPanel("userPanel");
  loadUserOrders();
}

function openPanel(id) {
  document.getElementById(id).classList.remove("translate-x-full");
  document.getElementById("overlay").classList.remove("hidden");
}

function closePanels() {
  document.getElementById("cartPanel").classList.add("translate-x-full");
  document.getElementById("userPanel").classList.add("translate-x-full");
  document.getElementById("overlay").classList.add("hidden");
}

/* ===========================
   CHECKOUT
=========================== */
function checkout() {

  if (!cart.length) {
    alert("Savatcha bo‘sh!");
    return;
  }

  fetch(API + "/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telegramId,
      items: cart,
      user: userData
    })
  })
  .then(res => res.json())
  .then(data => {
    console.log("ORDER RESPONSE:", data);
    cart = [];
    updateCart();
    closePanels();
    loadUserOrders();
  })
  .catch(err => console.log("ORDER ERROR:", err));
}

/* ===========================
   USER ORDERS
=========================== */
function loadUserOrders() {

  fetch(API + "/user/" + telegramId)
    .then(res => res.json())
    .then(data => {

      const container =
        document.getElementById("userOrders");

      if (!container) return;

      container.innerHTML = "";

      data.forEach(order => {

        const items = order.items
          .map(i => `${i.name} (${i.quantity})`)
          .join(", ");

        container.innerHTML += `
          <div class="bg-[#1e293b] p-4 rounded-lg">
            <p>${items}</p>
            <p class="text-emerald-400">
              ${order.total} so'm
            </p>
            <p class="text-sm text-gray-400">
              ${order.status}
            </p>
          </div>
        `;
      });
    })
    .catch(err => console.log("USER ORDER ERROR:", err));
}

function scrollToMenu() {
  document.getElementById("menu")
    .scrollIntoView({ behavior: "smooth" });
}

loadProducts();