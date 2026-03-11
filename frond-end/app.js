const API =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://e-comerce-bot-main-production.up.railway.app";

let products    = [];
let cart        = [];
let telegramId  = null;
let userData    = null;
let userProfile = null;
let orderType   = null;
let tableNumber = null;

/* ===== I18N — TIL TARJIMALARI ===== */
const translations = {
  uz: {
    "nav.title": "✦ Imperial",
    "hero.badge": "Toshkent, O'zbekiston",
    "hero.title": "Imperial Restoran",
    "hero.subtitle": "Eng yaxshi ta'm — eng yaxshi xizmat",
    "hero.btn": "Menuni Ko'rish",
    "menu.sub": "Bizning taomlar",
    "menu.title": "Menyu",
    "tab.all": "Barchasi",
    "tab.food": "Taomlar",
    "tab.drink": "Ichimliklar",
    "product.add": "Qo'shish",
    "product.added": "✓ Qo'shildi",
    "product.loading": "Yuklanmoqda...",
    "product.notfound": "Mahsulotlar topilmadi",
    "product.error": "Mahsulotlar yuklanmadi",
    "cart.title": "Savatcha",
    "cart.empty": "Savatcha bo'sh",
    "cart.total": "Jami:",
    "cart.currency": "so'm",
    "cart.ordertype": "📍 Buyurtma turi",
    "cart.dinein": "🪑 Restoranda",
    "cart.online": "🌐 Online",
    "cart.tableplaceholder": "Stol raqamini kiriting...",
    "cart.checkout": "Buyurtma Berish",
    "cart.sending": "Yuborilmoqda...",
    "user.title": "Profilim",
    "user.loading": "Yuklanmoqda...",
    "user.nophone": "📱 Telefon yo'q",
    "user.orders": "Buyurtmalarim",
    "user.noorders": "Hali buyurtma yo'q",
    "alert.emptycart": "⚠️ Savatcha bo'sh!",
    "alert.notelegram": "⚠️ Buyurtma berish uchun Telegram bot orqali kiring!\n\n@mini_shop_jahonsher_bot ga /start yuboring",
    "alert.selecttype": "⚠️ Buyurtma turini tanlang: Restoranda yoki Online",
    "alert.entertable": "⚠️ Stol raqamini kiriting!",
    "alert.success": "✅ Buyurtma muvaffaqiyatli qabul qilindi!",
    "alert.error": "❌ Xato: ",
    "tg.title": "Telegram orqali kiring",
    "tg.desc": "Bu ilova faqat Telegram bot orqali ishlaydi.<br><br>Quyidagi botga o'ting va <strong style=\"color:#c9a84c\">/start</strong> bosing:",
    "tg.btn": "Botga o'tish →",
    "events.sub": "Maxsus tadbirlar",
    "events.title": "Tadbirlar",
    "events.from": "Narx kelishiladi",
    "events.book": "Band qilish",
    "events.birthday.title": "Tug\'ilgan kun ziyofati",
    "events.birthday.desc": "Yaqinlaringiz bilan unutilmas tug\'ilgan kunni Imperial Restoranda nishonlang. Maxsus bezak, tort va individual menyu bilan.",
    "events.birthday.f1": "Maxsus stol bezagi",
    "events.birthday.f2": "Individual menyu tanlash",
    "events.birthday.f3": "Tortga shamlar va qo\'shiq",
    "events.private.title": "Xususiy ziyofat",
    "events.private.desc": "Butun zalimizni faqat siz va mehmonlaringiz uchun band qiling. Maxsus xizmat va to\'liq maxfiylik kafolatlanadi.",
    "events.private.f1": "Butun zal ijarasi",
    "events.private.f2": "Shaxsiy ofitsiant xizmati",
    "events.private.f3": "Audio tizim va proyektor",
    "events.corporate.title": "Korporativ tadbir",
    "events.corporate.desc": "Biznes uchrashuvlar va korporativ ziyofatlar uchun ideal muhit. Professional xizmat va qulay sharoitlar.",
    "events.corporate.f1": "Biznes prezentatsiya uchun ekran",
    "events.corporate.f2": "Biznes menyu va bufet",
    "events.corporate.f3": "Alohida kirish va xizmat",
    "gallery.sub": "Restoran muhiti",
    "gallery.title": "Galereya",
    "location.sub": "Bizni toping",
    "location.title": "Manzil",
    "location.addr.label": "Manzil",
    "location.addr.val": "Toshkent, Chilonzor tumani, Navroz ko'chasi 15-uy",
    "location.hours.label": "Ish vaqti",
    "location.hours.val": "Du–Ju: 10:00–23:00  |  Sh–Ya: 09:00–00:00",
    "location.phone.label": "Telefon",
    "location.metro.label": "Metro",
    "location.metro.val": "Chilonzor (5 daqiqa yurish)",
    "hero.bookbtn": "Band qilish",
    "footer.nav": "Tezkor o'tish",
    "footer.actions": "Amallar",
    "footer.admin": "Admin @Jahonsher",
    "footer.bot": "Telegram Bot",
    "footer.order": "Buyurtma berish",
    "footer.book": "Zal band qilish",
    "footer.callus": "Qo'ng'iroq qilish",
    "footer.contact": "Bog'lanish",
    "footer.text": "Barcha huquqlar himoyalangan",
    "profile.guest": "Mehmon",
  },
  ru: {
    "nav.title": "✦ Imperial",
    "hero.badge": "Ташкент, Узбекистан",
    "hero.title": "Ресторан Imperial",
    "hero.subtitle": "Лучший вкус — лучший сервис",
    "hero.btn": "Смотреть меню",
    "menu.sub": "Наши блюда",
    "menu.title": "Меню",
    "tab.all": "Все",
    "tab.food": "Блюда",
    "tab.drink": "Напитки",
    "product.add": "Добавить",
    "product.added": "✓ Добавлено",
    "product.loading": "Загрузка...",
    "product.notfound": "Товары не найдены",
    "product.error": "Не удалось загрузить товары",
    "cart.title": "Корзина",
    "cart.empty": "Корзина пуста",
    "cart.total": "Итого:",
    "cart.currency": "сум",
    "cart.ordertype": "📍 Тип заказа",
    "cart.dinein": "🪑 В ресторане",
    "cart.online": "🌐 Онлайн",
    "cart.tableplaceholder": "Введите номер стола...",
    "cart.checkout": "Оформить заказ",
    "cart.sending": "Отправляем...",
    "user.title": "Мой профиль",
    "user.loading": "Загрузка...",
    "user.nophone": "📱 Телефон не указан",
    "user.orders": "Мои заказы",
    "user.noorders": "Заказов пока нет",
    "alert.emptycart": "⚠️ Корзина пуста!",
    "alert.notelegram": "⚠️ Для заказа войдите через Telegram бот!\n\nОтправьте /start боту @mini_shop_jahonsher_bot",
    "alert.selecttype": "⚠️ Выберите тип заказа: В ресторане или Онлайн",
    "alert.entertable": "⚠️ Введите номер стола!",
    "alert.success": "✅ Заказ успешно принят!",
    "alert.error": "❌ Ошибка: ",
    "tg.title": "Войдите через Telegram",
    "tg.desc": "Это приложение работает только через Telegram бот.<br><br>Перейдите к боту и нажмите <strong style=\"color:#c9a84c\">/start</strong>:",
    "tg.btn": "Перейти к боту →",
    "events.sub": "Специальные мероприятия",
    "events.title": "Мероприятия",
    "events.from": "Цена договорная",
    "events.book": "Забронировать",
    "events.birthday.title": "День рождения",
    "events.birthday.desc": "Отпразднуйте незабываемый день рождения в Imperial Ресторане с близкими.",
    "events.birthday.f1": "Специальное оформление стола",
    "events.birthday.f2": "Индивидуальный выбор меню",
    "events.birthday.f3": "Свечи и поздравительная песня",
    "events.private.title": "Частный банкет",
    "events.private.desc": "Забронируйте весь зал только для вас и ваших гостей.",
    "events.private.f1": "Аренда всего зала",
    "events.private.f2": "Персональный официант",
    "events.private.f3": "Аудиосистема и проектор",
    "events.corporate.title": "Корпоратив",
    "events.corporate.desc": "Идеальная атмосфера для деловых встреч и корпоративных мероприятий.",
    "events.corporate.f1": "Экран для презентаций",
    "events.corporate.f2": "Бизнес-меню и фуршет",
    "events.corporate.f3": "Отдельный вход и обслуживание",
    "gallery.sub": "Атмосфера ресторана",
    "gallery.title": "Галерея",
    "location.sub": "Найдите нас",
    "location.title": "Адрес",
    "location.addr.label": "Адрес",
    "location.addr.val": "Ташкент, Чиланзарский район, ул. Навруз 15",
    "location.hours.label": "Часы работы",
    "location.hours.val": "Пн–Пт: 10:00–23:00  |  Сб–Вс: 09:00–00:00",
    "location.phone.label": "Телефон",
    "location.metro.label": "Метро",
    "location.metro.val": "Чиланзар (5 минут пешком)",
    "hero.bookbtn": "Забронировать",
    "footer.nav": "Быстрый переход",
    "footer.actions": "Действия",
    "footer.admin": "Админ @Jahonsher",
    "footer.bot": "Telegram Бот",
    "footer.order": "Сделать заказ",
    "footer.book": "Забронировать зал",
    "footer.callus": "Позвонить",
    "footer.contact": "Связаться",
    "footer.text": "Все права защищены",
    "profile.guest": "Гость",
  }
};

let currentLang = localStorage.getItem("lang") || "uz";

function t(key) {
  return translations[currentLang][key] || translations["uz"][key] || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  applyTranslations();

  // Filter tugmalar nomini yangilash
  document.querySelectorAll(".tab-btn[data-cat]").forEach(btn => {
    const cat = btn.dataset.cat;
    if (cat === "all") {
      btn.textContent = t("tab.all");
    } else {
      const nameRu = btn.dataset.nameRu || cat;
      btn.textContent = (lang === "ru" && nameRu) ? nameRu : cat;
    }
  });

  const activeTab = document.querySelector(".tab-btn.active");
  const activeCat = activeTab?.dataset?.cat || "all";
  const filtered  = activeCat === "all" ? products : products.filter(p => p.category === activeCat);
  renderProducts(filtered);
  updateCart();
  updateProductButtons();
  renderProfile();
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (el.tagName === "INPUT") {
      el.placeholder = t(key);
    } else if (el.dataset.i18nHtml) {
      el.innerHTML = t(key);
    } else {
      el.textContent = t(key);
    }
  });
}

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

  let tgUser = tg.initDataUnsafe?.user;

  if (!tgUser && tg.initData) {
    try {
      const params  = new URLSearchParams(tg.initData);
      const userStr = params.get("user");
      if (userStr) tgUser = JSON.parse(decodeURIComponent(userStr));
    } catch(e) {
      console.warn("initData parse xato:", e);
    }
  }

  if (tgUser && tgUser.id) {
    telegramId = tgUser.id;
    userData   = tgUser;

    if (!localStorage.getItem("lang")) {
      const tgLang = tgUser.language_code || "uz";
      currentLang = tgLang === "ru" ? "ru" : "uz";
      localStorage.setItem("lang", currentLang);
    }

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
    showNotTelegramWarning();
  }
}

function showNotTelegramWarning() {
  const w = document.getElementById("tgWarning");
  if (w) w.style.display = "flex";
  telegramId = null;
}

// Sahifa ochilganda blok tekshiruvi
fetch(API + '/check-block/imperial')
  .then(function(r){ return r.json(); })
  .then(function(d){ if (d.blocked) showBlockedPage(d.reason); })
  .catch(function(){});

initTelegramUser();

/* ===== PROFILE ===== */
function renderProfile() {
  const u = userProfile || userData;
  if (!u) return;
  const nameEl  = document.getElementById("profileName");
  const unameEl = document.getElementById("profileUsername");
  const phoneEl = document.getElementById("profilePhone");
  if (nameEl)  nameEl.textContent  = `${u.first_name || ""} ${u.last_name || ""}`.trim() || t("profile.guest");
  if (unameEl) unameEl.textContent = u.username ? `@${u.username}` : "";
  if (phoneEl) phoneEl.textContent = u.phone    ? `📱 ${u.phone}`  : t("user.nophone");
}

/* ===== LOAD CATEGORIES — DINAMIK ===== */
function loadCategories() {
  fetch(API + "/categories?restaurantId=imperial")
    .then(res => res.json())
    .then(cats => {
      const tabsContainer = document.getElementById("filterTabs");
      if (!tabsContainer) return;

      // "Barchasi" tugmasi (doim birinchi)
      let html = '<button class="tab-btn active" data-cat="all" onclick="filterCategory(\'all\',this)">' + t("tab.all") + '</button>';

      // Har bir kategoriya uchun tugma
      cats.forEach(cat => {
        const name    = cat.name || cat;
        const nameRu  = cat.name_ru || name;
        const display = (currentLang === 'ru' && nameRu) ? nameRu : name;
        html += '<button class="tab-btn" data-cat="' + name + '" data-name-ru="' + nameRu + '" onclick="filterCategory(\'' + name + '\',this)">' + display + '</button>';
      });

      tabsContainer.innerHTML = html;
    })
    .catch(err => {
      console.error("Kategoriyalar yuklanmadi:", err);
      // Xato bo'lsa standart ko'rinishi qolsin
      const tabsContainer = document.getElementById("filterTabs");
      if (tabsContainer) {
        tabsContainer.innerHTML =
          '<button class="tab-btn active" data-cat="all" onclick="filterCategory(\'all\',this)">' + t("tab.all") + '</button>';
      }
    });
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
      const c = document.getElementById("products");
      if (c) c.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><p>' + t("product.error") + ' (' + err.message + ')</p></div>';
    });
}

/* ===== RENDER PRODUCTS ===== */
function renderProducts(list) {
  const container = document.getElementById("products");
  container.innerHTML = "";

  if (!list || !list.length) {
    container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">🍽</div><p>' + t("product.notfound") + '</p></div>';
    return;
  }

  list.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.style.animationDelay = (i * 60) + "ms";
    const displayName = (currentLang === "ru" && p.name_ru) ? p.name_ru : p.name;
    card.innerHTML =
      '<img src="' + p.image + '" alt="' + displayName + '" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\'">' +
      '<div class="img-placeholder" style="display:none">🍽</div>' +
      '<div class="product-info">' +
        '<h3>' + displayName + '</h3>' +
        '<div class="cat">' + p.category + '</div>' +
        '<span class="price">' + Number(p.price).toLocaleString() + ' ' + t("cart.currency") + '</span>' +
        '<button class="add-btn" data-id="' + p.id + '" onclick="addToCart(' + p.id + ')">' + t("product.add") + '</button>' +
      '</div>';
    container.appendChild(card);
  });

  updateProductButtons();
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
  updateProductButtons();
}

function changeQty(id, delta) {
  const item = cart.find(p => p.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(p => p.id !== id);
  updateCart();
  updateProductButtons();
}

function updateProductButtons() {
  document.querySelectorAll(".add-btn").forEach(btn => {
    const id     = Number(btn.dataset.id);
    const inCart = cart.find(p => p.id === id);
    if (inCart) {
      btn.innerHTML = t("product.added");
      btn.style.background = "linear-gradient(135deg, #4ade80, #16a34a)";
      btn.style.color = "#0d0a07";
    } else {
      btn.innerHTML = t("product.add");
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

  const badge = document.getElementById("cartCount");
  if (badge) badge.textContent = count;

  const totalEl = document.getElementById("cartTotal");
  if (totalEl) totalEl.textContent = Number(total).toLocaleString();

  if (!cart.length) {
    container.innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>' + t("cart.empty") + '</p></div>';
    return;
  }

  container.innerHTML = cart.map(item => {
    const name = (currentLang === "ru" && item.name_ru) ? item.name_ru : item.name;
    return '<div class="cart-item">' +
      '<div>' +
        '<div class="cart-item-name">' + name + '</div>' +
        '<div class="cart-item-price">' + Number(item.price).toLocaleString() + ' ' + t("cart.currency") + '</div>' +
      '</div>' +
      '<div class="qty-controls">' +
        '<button class="qty-btn" onclick="changeQty(' + item.id + ', -1)">−</button>' +
        '<span class="qty-num">' + item.quantity + '</span>' +
        '<button class="qty-btn" onclick="changeQty(' + item.id + ', 1)">+</button>' +
      '</div>' +
    '</div>';
  }).join("");
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

/* ===== ORDER TYPE ===== */
function selectOrderType(type) {
  orderType = type;
  const btnDineIn  = document.getElementById("btnDineIn");
  const btnOnline  = document.getElementById("btnOnline");
  const tableWrap  = document.getElementById("tableInputWrap");
  const activeStyle   = "background:var(--gold); color:var(--dark); border-color:var(--gold); font-weight:500;";
  const inactiveStyle = "background:rgba(201,168,76,0.08); color:var(--muted); border-color:var(--border); font-weight:300;";
  if (type === "dine_in") {
    btnDineIn.style.cssText  += activeStyle;
    btnOnline.style.cssText  += inactiveStyle;
    tableWrap.style.display   = "block";
    tableNumber = null;
  } else {
    btnOnline.style.cssText  += activeStyle;
    btnDineIn.style.cssText  += inactiveStyle;
    tableWrap.style.display   = "none";
    tableNumber = "Online";
    document.getElementById("tableInput").value = "";
  }
}

/* ===== CHECKOUT ===== */
function checkout() {
  if (!cart.length) { alert(t("alert.emptycart")); return; }
  if (!telegramId)  { alert(t("alert.notelegram")); return; }
  if (!orderType)   { alert(t("alert.selecttype")); return; }

  if (orderType === "dine_in") {
    const tableVal = document.getElementById("tableInput")?.value?.trim();
    if (!tableVal) {
      alert(t("alert.entertable"));
      document.getElementById("tableInput")?.focus();
      return;
    }
    tableNumber = tableVal;
  }

  const btn = document.getElementById("checkoutBtn");
  if (btn) { btn.disabled = true; btn.textContent = t("cart.sending"); }

  const userToSend = {
    first_name: userProfile?.first_name || userData?.first_name || "",
    last_name:  userProfile?.last_name  || userData?.last_name  || "",
    username:   userProfile?.username   || userData?.username   || "",
    phone:      userProfile?.phone      || userData?.phone      || ""
  };

  fetch(API + "/order", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ telegramId, items: cart, user: userToSend, orderType, tableNumber })
  })
  .then(res => res.json())
  .then(data => {
    if (data.blocked || data.error === "BLOCKED") {
      // Restoran bloklangan — to'liq ekran
      showBlockedPage(data.message || "Restoran vaqtincha ishlamayapti");
      if (btn) { btn.disabled = false; btn.textContent = t("cart.checkout"); }
      return;
    }
    if (!data.success) throw new Error(data.error || "Xato");
    cart = [];
    orderType  = null;
    tableNumber = null;
    const btnDineIn = document.getElementById("btnDineIn");
    const btnOnline = document.getElementById("btnOnline");
    const tableWrap = document.getElementById("tableInputWrap");
    const tableInp  = document.getElementById("tableInput");
    if (btnDineIn) btnDineIn.style.cssText = "";
    if (btnOnline) btnOnline.style.cssText = "";
    if (tableWrap) tableWrap.style.display = "none";
    if (tableInp)  tableInp.value = "";
    updateCart();
    updateProductButtons();
    closePanels();
    alert(t("alert.success"));
  })
  .catch(err => alert(t("alert.error") + err.message))
  .finally(() => {
    if (btn) { btn.disabled = false; btn.textContent = t("cart.checkout"); }
  });
}


function showBlockedPage(reason) {
  var old = document.getElementById('blockedOverlay');
  if (old) old.remove();
  var el = document.createElement('div');
  el.id = 'blockedOverlay';
  el.style.cssText = 'position:fixed;inset:0;background:#0a0f1e;display:flex;align-items:center;justify-content:center;z-index:99999;padding:24px;text-align:center';
  el.innerHTML =
    '<div style="max-width:320px">' +
    '<div style="font-size:56px;margin-bottom:16px">🔒</div>' +
    '<div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:12px">Restoran vaqtincha yopiq</div>' +
    '<div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:14px;margin-bottom:16px">' +
    '<div style="font-size:13px;color:#fca5a5;line-height:1.6">' + (reason || "") + '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:#475569">Iltimos, keyinroq qayta urinib koring</div>' +
    '</div>';
  document.body.appendChild(el);
}

/* ===== USER ORDERS ===== */
function loadUserOrders() {
  if (!telegramId) return;
  fetch(API + "/user/" + telegramId + "/orders")
    .then(r => r.json())
    .then(data => {
      const c = document.getElementById("userOrders");
      if (!c) return;
      if (!data || !data.length) {
        c.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>' + t("user.noorders") + '</p></div>';
        return;
      }
      c.innerHTML = data.map(order => {
        const items = order.items.map(i => {
          const n = (currentLang === "ru" && i.name_ru) ? i.name_ru : i.name;
          return n + " × " + i.quantity;
        }).join(", ");
        const date = new Date(order.createdAt).toLocaleDateString(currentLang === "ru" ? "ru-RU" : "uz-UZ");
        return '<div class="order-card">' +
          '<div class="order-items">' + items + '</div>' +
          '<div class="order-total">' + Number(order.total).toLocaleString() + ' ' + t("cart.currency") + '</div>' +
          '<div><span class="order-status">' + (order.status || "Yangi") + '</span></div>' +
          '<div class="order-date">🕐 ' + date + '</div>' +
        '</div>';
      }).join("");
    })
    .catch(err => console.error("USER ORDERS ERROR:", err));
}

function scrollToMenu() {
  document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", () => {
  applyTranslations();
  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
});

// Kategoriyalar va mahsulotlarni yuklash
loadCategories();
loadProducts();