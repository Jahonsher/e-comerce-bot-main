// ===================================================
// ===== IMPERIAL RESTORAN APP.JS — ALOHIDA ==========
// ===================================================
var API = "https://e-comerce-bot-main-production.up.railway.app";
var RESTAURANT_ID = "imperial";
var BOT_USERNAME = "mini_shop_jahonsher_bot";

var products = [];
var cart = [];
var telegramId = null;
var userData = null;
var userProfile = null;
var orderType = null;
var tableNumber = null;
var currentLang = localStorage.getItem("lang") || "uz";

// ===================================================
// ===== TARJIMALAR — FAQAT IMPERIAL =================
// ===================================================
var TR = {
  uz: {
    "nav.title":            "✦ Imperial",
    "hero.badge":           "Toshkent, O'zbekiston",
    "hero.title":           "Imperial Restoran",
    "hero.subtitle":        "Eng yaxshi ta'm — eng yaxshi xizmat",
    "hero.btn":             "Menuni Ko'rish",
    "hero.bookbtn":         "Zal band qilish",
    "menu.sub":             "Bizning taomlar",
    "menu.title":           "Menyu",
    "tab.all":              "Barchasi",
    "product.add":          "Qo'shish",
    "product.soldout":      "Tugagan",
    "product.added":        "✓ Qo'shildi",
    "product.loading":      "Yuklanmoqda...",
    "product.notfound":     "Hozircha menyu qo'shilmagan",
    "product.error":        "Menyu yuklanmadi",
    "cart.title":           "Savatcha",
    "cart.empty":           "Savatcha bo'sh",
    "cart.total":           "Jami:",
    "cart.currency":        "so'm",
    "cart.ordertype":       "📍 Buyurtma turi",
    "cart.dinein":          "🪑 Restoranda",
    "cart.online":          "🌐 Online",
    "cart.checkout":        "Buyurtma Berish",
    "cart.sending":         "Yuborilmoqda...",
    "user.title":           "Profilim",
    "user.loading":         "Yuklanmoqda...",
    "user.nophone":         "📱 Telefon yo'q",
    "user.orders":          "Buyurtmalarim",
    "user.noorders":        "Hali buyurtma yo'q",
    "profile.guest":        "Mehmon",
    "alert.emptycart":      "⚠️ Savatcha bo'sh!",
    "alert.notelegram":     "⚠️ Buyurtma berish uchun Telegram bot orqali kiring!\n\n@mini_shop_jahonsher_bot ga /start yuboring",
    "alert.selecttype":     "⚠️ Buyurtma turini tanlang: Restoranda yoki Online",
    "alert.entertable":     "⚠️ Stol raqamini kiriting!",
    "alert.success":        "✅ Buyurtma muvaffaqiyatli qabul qilindi!",
    "alert.error":          "❌ Xato: ",
    "tg.title":             "Telegram orqali kiring",
    "tg.desc":              "Bu ilova faqat Telegram bot orqali ishlaydi.<br><br>Quyidagi botga o'ting va <strong style='color:#d4aa4e'>/start</strong> bosing:",
    "tg.btn":               "Botga o'tish →",
    "events.sub":           "Maxsus tadbirlar",
    "events.title":         "Tadbirlar",
    "events.from":          "Narx kelishiladi",
    "events.book":          "Band qilish",
    "events.birthday.title":"Tug'ilgan kun ziyofati",
    "events.birthday.desc": "Yaqinlaringiz bilan unutilmas tug'ilgan kunni Imperial Restorangda nishonlang.",
    "events.birthday.f1":   "Maxsus stol bezagi",
    "events.birthday.f2":   "Individual menyu tanlash",
    "events.birthday.f3":   "Tortga shamlar va qo'shiq",
    "events.private.title": "Xususiy ziyofat",
    "events.private.desc":  "Butun zalimizni faqat siz va mehmonlaringiz uchun band qiling.",
    "events.private.f1":    "Butun zal ijarasi",
    "events.private.f2":    "Shaxsiy ofitsiant xizmati",
    "events.private.f3":    "Audio tizim va proyektor",
    "events.corporate.title":"Korporativ tadbir",
    "events.corporate.desc":"Biznes uchrashuvlar va korporativ ziyofatlar uchun ideal muhit.",
    "events.corporate.f1":  "Biznes prezentatsiya uchun ekran",
    "events.corporate.f2":  "Biznes menyu va bufet",
    "events.corporate.f3":  "Alohida kirish va xizmat",
    "gallery.sub":          "Restoran muhiti",
    "gallery.title":        "Galereya",
    "location.sub":         "Bizni toping",
    "location.title":       "Manzil",
    "location.addr.label":  "Manzil",
    "location.addr.val":    "Toshkent, Chilonzor tumani, Navroz ko'chasi 15-uy",
    "location.hours.label": "Ish vaqti",
    "location.hours.val":   "Du–Ju: 10:00–23:00  |  Sh–Ya: 09:00–00:00",
    "location.phone.label": "Telefon",
    "location.metro.label": "Metro",
    "location.metro.val":   "Chilonzor (5 daqiqa yurish)",
    "footer.nav":           "Tezkor o'tish",
    "footer.actions":       "Amallar",
    "footer.admin":         "Admin @Jahonsher",
    "footer.bot":           "Telegram Bot",
    "footer.order":         "Buyurtma berish",
    "footer.book":          "Zal band qilish",
    "footer.callus":        "Qo'ng'iroq qilish",
    "footer.contact":       "Bog'lanish",
    "footer.text":          "Barcha huquqlar himoyalangan"
  },
  ru: {
    "nav.title":            "✦ Imperial",
    "hero.badge":           "Ташкент, Узбекистан",
    "hero.title":           "Ресторан Imperial",
    "hero.subtitle":        "Лучший вкус — лучший сервис",
    "hero.btn":             "Смотреть меню",
    "hero.bookbtn":         "Забронировать зал",
    "menu.sub":             "Наши блюда",
    "menu.title":           "Меню",
    "tab.all":              "Все",
    "product.add":          "Добавить",
    "product.soldout":      "Закончилось",
    "product.added":        "✓ Добавлено",
    "product.loading":      "Загрузка...",
    "product.notfound":     "Меню пока не добавлено",
    "product.error":        "Не удалось загрузить меню",
    "cart.title":           "Корзина",
    "cart.empty":           "Корзина пуста",
    "cart.total":           "Итого:",
    "cart.currency":        "сум",
    "cart.ordertype":       "📍 Тип заказа",
    "cart.dinein":          "🪑 В ресторане",
    "cart.online":          "🌐 Онлайн",
    "cart.checkout":        "Заказать",
    "cart.sending":         "Отправляем...",
    "user.title":           "Мой профиль",
    "user.loading":         "Загрузка...",
    "user.nophone":         "📱 Телефон не указан",
    "user.orders":          "Мои заказы",
    "user.noorders":        "Заказов пока нет",
    "profile.guest":        "Гость",
    "alert.emptycart":      "⚠️ Корзина пуста!",
    "alert.notelegram":     "⚠️ Для заказа войдите через Telegram бот!\n\nОтправьте /start боту @mini_shop_jahonsher_bot",
    "alert.selecttype":     "⚠️ Выберите тип заказа: В ресторане или Онлайн",
    "alert.entertable":     "⚠️ Введите номер стола!",
    "alert.success":        "✅ Заказ успешно принят!",
    "alert.error":          "❌ Ошибка: ",
    "tg.title":             "Войдите через Telegram",
    "tg.desc":              "Это приложение работает только через Telegram бот.<br><br>Перейдите к боту и нажмите <strong style='color:#d4aa4e'>/start</strong>:",
    "tg.btn":               "Перейти к боту →",
    "events.sub":           "Специальные мероприятия",
    "events.title":         "Мероприятия",
    "events.from":          "Цена договорная",
    "events.book":          "Забронировать",
    "events.birthday.title":"День рождения",
    "events.birthday.desc": "Отпразднуйте незабываемый день рождения в Ресторане Imperial с близкими.",
    "events.birthday.f1":   "Специальное оформление стола",
    "events.birthday.f2":   "Индивидуальный выбор меню",
    "events.birthday.f3":   "Свечи и поздравительная песня",
    "events.private.title": "Частный банкет",
    "events.private.desc":  "Забронируйте весь зал только для вас и ваших гостей.",
    "events.private.f1":    "Аренда всего зала",
    "events.private.f2":    "Персональный официант",
    "events.private.f3":    "Аудиосистема и проектор",
    "events.corporate.title":"Корпоратив",
    "events.corporate.desc":"Идеальная атмосфера для деловых встреч и корпоративных мероприятий.",
    "events.corporate.f1":  "Экран для презентаций",
    "events.corporate.f2":  "Бизнес-меню и фуршет",
    "events.corporate.f3":  "Отдельный вход и обслуживание",
    "gallery.sub":          "Атмосфера ресторана",
    "gallery.title":        "Галерея",
    "location.sub":         "Найдите нас",
    "location.title":       "Адрес",
    "location.addr.label":  "Адрес",
    "location.addr.val":    "Ташкент, Чиланзарский район, ул. Навруз 15",
    "location.hours.label": "Часы работы",
    "location.hours.val":   "Пн–Пт: 10:00–23:00  |  Сб–Вс: 09:00–00:00",
    "location.phone.label": "Телефон",
    "location.metro.label": "Метро",
    "location.metro.val":   "Чиланзар (5 минут пешком)",
    "footer.nav":           "Быстрый переход",
    "footer.actions":       "Действия",
    "footer.admin":         "Админ @Jahonsher",
    "footer.bot":           "Telegram Бот",
    "footer.order":         "Заказать",
    "footer.book":          "Забронировать зал",
    "footer.callus":        "Позвонить",
    "footer.contact":       "Контакты",
    "footer.text":          "Все права защищены"
  }
};

function t(key) {
  return (TR[currentLang] && TR[currentLang][key]) || (TR["uz"] && TR["uz"][key]) || key;
}

// ===================================================
// ===== LANG ========================================
// ===================================================
function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  applyTranslations();

  // Tab buttonlarni yangilash
  document.querySelectorAll(".tab-btn[data-cat]").forEach(function(btn) {
    var cat = btn.dataset.cat;
    if (cat === "all") btn.textContent = t("tab.all");
    else {
      var nameRu = btn.dataset.nameRu || cat;
      btn.textContent = (lang === "ru" && nameRu) ? nameRu : cat;
    }
  });

  var activeTab = document.querySelector(".tab-btn.active");
  var activeCat = activeTab ? activeTab.dataset.cat : "all";
  renderProducts(activeCat === "all" ? products : products.filter(function(p) { return p.category === activeCat; }));
  updateCart();
  updateProductButtons();
  renderProfile();

  // Lang tugmalarini yangilash — inline style bilan
  document.querySelectorAll(".lang-btn, .lang-b").forEach(function(btn) {
    if (btn.dataset.lang === lang) {
      btn.style.background = "#d4aa4e";
      btn.style.color = "#0d0a07";
      btn.style.fontWeight = "700";
    } else {
      btn.style.background = "transparent";
      btn.style.color = "#b09a7a";
      btn.style.fontWeight = "500";
    }
  });
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(function(el) {
    var key = el.dataset.i18n;
    if (el.tagName === "INPUT") el.placeholder = t(key);
    else if (el.dataset.i18nHtml) el.innerHTML = t(key);
    else el.textContent = t(key);
  });
}

// ===================================================
// ===== TELEGRAM ====================================
// ===================================================
function initTelegramUser() {
  if (!window.Telegram || !window.Telegram.WebApp) {
    var w = document.getElementById("tgWarning");
    if (w) w.style.display = "flex";
    return;
  }
  var tg = window.Telegram.WebApp;
  tg.expand();
  tg.setHeaderColor("#0d0a07");
  tg.setBackgroundColor("#0d0a07");

  var tgUser = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (!tgUser && tg.initData) {
    try {
      var params = new URLSearchParams(tg.initData);
      var userStr = params.get("user");
      if (userStr) tgUser = JSON.parse(decodeURIComponent(userStr));
    } catch(e) {}
  }

  if (tgUser && tgUser.id) {
    telegramId = tgUser.id;
    userData = tgUser;
    if (!localStorage.getItem("lang")) {
      currentLang = (tgUser.language_code === "ru") ? "ru" : "uz";
      localStorage.setItem("lang", currentLang);
    }
    fetch(API + "/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tgUser.id, first_name: tgUser.first_name || "", last_name: tgUser.last_name || "", username: tgUser.username || "", restaurantId: RESTAURANT_ID })
    })
    .then(function(r) { return r.json(); })
    .then(function() { return fetch(API + "/user/" + telegramId + "?restaurantId=" + RESTAURANT_ID); })
    .then(function(r) { return r.json(); })
    .then(function(u) { userProfile = u; userData = Object.assign({}, userData, { phone: u.phone || "" }); renderProfile(); })
    .catch(function(e) { console.error("AUTH:", e); });
  } else {
    var w = document.getElementById("tgWarning");
    if (w) w.style.display = "flex";
  }
}

// ===================================================
// ===== PROFILE =====================================
// ===================================================
function renderProfile() {
  var u = userProfile || userData;
  if (!u) return;
  var n = document.getElementById("profileName");
  var un = document.getElementById("profileUsername");
  var ph = document.getElementById("profilePhone");
  if (n) n.textContent = ((u.first_name || "") + " " + (u.last_name || "")).trim() || t("profile.guest");
  if (un) un.textContent = u.username ? "@" + u.username : "";
  if (ph) ph.textContent = u.phone ? "📱 " + u.phone : t("user.nophone");
}

// ===================================================
// ===== CATEGORIES ==================================
// ===================================================
function loadCategories() {
  fetch(API + "/categories?restaurantId=" + RESTAURANT_ID)
    .then(function(r) { return r.json(); })
    .then(function(cats) {
      var el = document.getElementById("filterTabs");
      if (!el) return;
      el.innerHTML = "";
      var allBtn = document.createElement("button");
      allBtn.className = "tab-btn active";
      allBtn.dataset.cat = "all";
      allBtn.textContent = t("tab.all");
      el.appendChild(allBtn);
      cats.forEach(function(cat) {
        var name = cat.name || cat;
        var nameRu = cat.name_ru || name;
        var display = (currentLang === "ru" && nameRu) ? nameRu : name;
        var btn = document.createElement("button");
        btn.className = "tab-btn";
        btn.dataset.cat = name;
        btn.dataset.nameRu = nameRu;
        btn.textContent = display;
        el.appendChild(btn);
      });
      if (!el._hasListener) {
        el._hasListener = true;
        el.addEventListener("click", function(e) {
          var btn = e.target.closest(".tab-btn");
          if (!btn) return;
          var cat = btn.dataset.cat;
          document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
          btn.classList.add("active");
          renderProducts(cat === "all" ? products : products.filter(function(p) { return p.category === cat; }));
        });
      }
    })
    .catch(function() {});
}

// ===================================================
// ===== PRODUCTS ====================================
// ===================================================
function loadProducts() {
  fetch(API + "/products?restaurantId=" + RESTAURANT_ID)
    .then(function(r) { return r.json(); })
    .then(function(data) { products = data; renderProducts(products); })
    .catch(function(e) {
      var c = document.getElementById("products");
      if (c) c.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><p>' + t("product.error") + '</p></div>';
    });
}

function renderProducts(list) {
  var el = document.getElementById("products");
  if (!el) return;
  el.innerHTML = "";
  if (!list || !list.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">🍽</div><p>' + t("product.notfound") + '</p></div>';
    return;
  }
  list.forEach(function(p, i) {
    var card = document.createElement("div");
    var isActive = p.active !== false;
    card.className = "product-card" + (isActive ? "" : " product-soldout");
    card.style.animationDelay = (i * 60) + "ms";
    card.style.animation = "fadeUp .4s ease both";
    var dn = (currentLang === "ru" && p.name_ru) ? p.name_ru : p.name;

    if (isActive) {
      card.innerHTML =
        (p.image ? '<img src="' + p.image + '" alt="' + dn + '" style="width:100%;height:140px;object-fit:cover;display:block" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : '') +
        '<div class="img-placeholder"' + (p.image ? ' style="display:none"' : '') + '>🍽</div>' +
        '<div class="product-info"><h3>' + dn + '</h3><div class="cat">' + (p.category || '') + '</div>' +
        '<span class="price">' + Number(p.price).toLocaleString() + ' ' + t("cart.currency") + '</span>' +
        '<button class="add-btn" data-id="' + p.id + '" onclick="addToCart(' + p.id + ')">' + t("product.add") + '</button></div>';
    } else {
      card.innerHTML =
        (p.image ? '<img src="' + p.image + '" alt="' + dn + '" style="width:100%;height:140px;object-fit:cover;display:block;filter:grayscale(70%) brightness(0.6)" onerror="this.style.display=\'none\'">' : '') +
        '<div class="img-placeholder"' + (p.image ? ' style="display:none"' : '') + '>🍽</div>' +
        '<div class="product-info"><h3>' + dn + '</h3><div class="cat">' + (p.category || '') + '</div>' +
        '<span class="price" style="opacity:0.4;text-decoration:line-through">' + Number(p.price).toLocaleString() + ' ' + t("cart.currency") + '</span>' +
        '<div class="soldout-label">' + t("product.soldout") + '</div></div>';
    }
    el.appendChild(card);
  });
  updateProductButtons();
}

function filterCategory(cat, btn) {
  document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
  if (btn) btn.classList.add("active");
  renderProducts(cat === "all" ? products : products.filter(function(p) { return p.category === cat; }));
}

// ===================================================
// ===== CART ========================================
// ===================================================
function addToCart(id) {
  var p = products.find(function(x) { return x.id === id; });
  if (!p) return;
  var ex = cart.find(function(x) { return x.id === id; });
  if (ex) ex.quantity++;
  else cart.push(Object.assign({}, p, { quantity: 1 }));
  updateCart();
  updateProductButtons();
}

function changeQty(id, delta) {
  var item = cart.find(function(x) { return x.id === id; });
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(function(x) { return x.id !== id; });
  updateCart();
  updateProductButtons();
}

function updateProductButtons() {
  document.querySelectorAll(".add-btn").forEach(function(btn) {
    var id = Number(btn.dataset.id);
    var inCart = cart.find(function(x) { return x.id === id; });
    if (inCart) {
      btn.innerHTML = t("product.added");
      btn.style.background = "linear-gradient(135deg,#d4aa4e,#a07830)";
      btn.style.color = "#0d0a07";
      btn.style.opacity = "0.8";
    } else {
      btn.innerHTML = t("product.add");
      btn.style.background = "";
      btn.style.color = "";
      btn.style.opacity = "";
    }
  });
}

function updateCart() {
  var el = document.getElementById("cartItems");
  if (!el) return;
  var total = cart.reduce(function(s, i) { return s + i.price * i.quantity; }, 0);
  var count = cart.reduce(function(s, i) { return s + i.quantity; }, 0);
  var badge = document.getElementById("cartCount");
  var totalEl = document.getElementById("cartTotal");
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? "flex" : "none"; }
  if (totalEl) totalEl.textContent = Number(total).toLocaleString();
  if (!cart.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>' + t("cart.empty") + '</p></div>';
    return;
  }
  el.innerHTML = cart.map(function(item) {
    var name = (currentLang === "ru" && item.name_ru) ? item.name_ru : item.name;
    return '<div class="cart-item"><div><div class="cart-item-name">' + name + '</div>' +
      '<div class="cart-item-price">' + Number(item.price).toLocaleString() + ' ' + t("cart.currency") + '</div></div>' +
      '<div class="qty-controls">' +
        '<button class="qty-btn" onclick="changeQty(' + item.id + ',-1)">−</button>' +
        '<span class="qty-num">' + item.quantity + '</span>' +
        '<button class="qty-btn" onclick="changeQty(' + item.id + ',1)">+</button>' +
      '</div></div>';
  }).join("");
}

// ===================================================
// ===== PANELS ======================================
// ===================================================
function toggleCart() { openPanel("cartPanel"); }
function openUserPanel() { openPanel("userPanel"); renderProfile(); loadUserOrders(); }

function openPanel(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add("open");
  var ov = document.getElementById("overlay");
  if (ov) ov.classList.add("show");
}

function closePanels() {
  var cp = document.getElementById("cartPanel"); if (cp) cp.classList.remove("open");
  var up = document.getElementById("userPanel"); if (up) up.classList.remove("open");
  var ov = document.getElementById("overlay"); if (ov) ov.classList.remove("show");
}

// ===================================================
// ===== ORDER TYPE — RESTORAN MODE ==================
// ===================================================
function selectOrderType(type) {
  orderType = type;
  var btnDI = document.getElementById("btnDineIn");
  var btnON = document.getElementById("btnOnline");
  var wrap = document.getElementById("tableInputWrap");
  var goldActive = "background:#d4aa4e;color:#0d0a07;border-color:#d4aa4e;font-weight:600;";
  var inactive = "background:rgba(201,168,76,0.08);color:#b09a7a;border-color:rgba(212,170,78,0.3);font-weight:500;";
  if (type === "dine_in") {
    btnDI.style.cssText += goldActive;
    btnON.style.cssText += inactive;
    wrap.style.display = "block";
    tableNumber = null;
  } else {
    btnON.style.cssText += goldActive;
    btnDI.style.cssText += inactive;
    wrap.style.display = "none";
    tableNumber = "Online";
    document.getElementById("tableInput").value = "";
  }
}

// ===================================================
// ===== CHECKOUT ====================================
// ===================================================
function checkout() {
  if (!cart.length) { alert(t("alert.emptycart")); return; }
  if (!telegramId) { alert(t("alert.notelegram")); return; }
  if (!orderType) { alert(t("alert.selecttype")); return; }
  if (orderType === "dine_in") {
    var tableVal = document.getElementById("tableInput").value.trim();
    if (!tableVal) { alert(t("alert.entertable")); document.getElementById("tableInput").focus(); return; }
    tableNumber = tableVal;
  }
  var btn = document.getElementById("checkoutBtn");
  if (btn) { btn.disabled = true; btn.textContent = t("cart.sending"); }
  var user = {
    first_name: (userProfile && userProfile.first_name) || (userData && userData.first_name) || "",
    last_name: (userProfile && userProfile.last_name) || (userData && userData.last_name) || "",
    username: (userProfile && userProfile.username) || (userData && userData.username) || "",
    phone: (userProfile && userProfile.phone) || (userData && userData.phone) || ""
  };
  fetch(API + "/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId: telegramId, items: cart, user: user, orderType: orderType, tableNumber: tableNumber, restaurantId: RESTAURANT_ID })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.blocked || data.error === "BLOCKED") { showBlockedPage(data.message); if (btn) { btn.disabled = false; btn.textContent = t("cart.checkout"); } return; }
    if (!data.success) throw new Error(data.error || "Xato");
    cart = []; orderType = null; tableNumber = null;
    var btnDI = document.getElementById("btnDineIn");
    var btnON = document.getElementById("btnOnline");
    if (btnDI) btnDI.style.cssText = "";
    if (btnON) btnON.style.cssText = "";
    var tw = document.getElementById("tableInputWrap"); if (tw) tw.style.display = "none";
    var ti = document.getElementById("tableInput"); if (ti) ti.value = "";
    updateCart(); updateProductButtons(); closePanels();
    alert(t("alert.success"));
  })
  .catch(function(e) { alert(t("alert.error") + e.message); })
  .finally(function() { if (btn) { btn.disabled = false; btn.textContent = t("cart.checkout"); } });
}

function showBlockedPage(reason) {
  var el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;background:#0d0a07;display:flex;align-items:center;justify-content:center;z-index:99999;padding:24px;text-align:center";
  el.innerHTML = '<div><div style="font-size:56px;margin-bottom:16px">🔒</div><div style="font-size:20px;font-weight:700;color:#faf3e0;margin-bottom:12px">Restoran vaqtincha yopiq</div><div style="font-size:13px;color:#b09a7a">' + (reason || "") + '</div></div>';
  document.body.appendChild(el);
}

// ===================================================
// ===== USER ORDERS =================================
// ===================================================
function loadUserOrders() {
  if (!telegramId) return;
  var c = document.getElementById("userOrders");
  if (c) c.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>' + t("user.loading") + '</p></div>';
  fetch(API + "/orders/user/" + telegramId + "?restaurantId=" + RESTAURANT_ID)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!c) return;
      if (!data || !data.length) {
        c.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>' + t("user.noorders") + '</p></div>';
        return;
      }
      c.innerHTML = data.map(function(order) {
        var items = order.items.map(function(i) {
          return ((currentLang === "ru" && i.name_ru) ? i.name_ru : i.name) + " × " + i.quantity;
        }).join(", ");
        var date = new Date(order.createdAt).toLocaleDateString(currentLang === "ru" ? "ru-RU" : "uz-UZ");
        return '<div class="order-card">' +
          '<div class="order-items">' + items + '</div>' +
          '<div class="order-total">' + Number(order.total).toLocaleString() + ' ' + t("cart.currency") + '</div>' +
          '<div><span class="order-status">' + (order.status || "Yangi") + '</span></div>' +
          '<div class="order-date">🕐 ' + date + '</div></div>';
      }).join("");
    })
    .catch(function() {
      if (c) c.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>' + t("user.noorders") + '</p></div>';
    });
}

// ===================================================
// ===== SCROLL & MISC ===============================
// ===================================================
function scrollToSection(id) { var el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth" }); }
function bookEvent() { window.open("https://t.me/Jahonsher", "_blank"); }

// ===================================================
// ===== INIT ========================================
// ===================================================
fetch(API + "/check-block/" + RESTAURANT_ID)
  .then(function(r) { return r.json(); })
  .then(function(d) { if (d.blocked) showBlockedPage(d.reason); })
  .catch(function() {});

initTelegramUser();

document.addEventListener("DOMContentLoaded", function() {
  applyTranslations();
  // Lang tugmalarni boshlang'ich holatga
  document.querySelectorAll(".lang-btn, .lang-b").forEach(function(btn) {
    if (btn.dataset.lang === currentLang) {
      btn.style.background = "#d4aa4e";
      btn.style.color = "#0d0a07";
      btn.style.fontWeight = "700";
    }
  });
  // Ish vaqti
  var h = (new Date().getUTCHours() + 5) % 24;
  var isOpen = h >= 10 && h < 23;
  var ws = document.getElementById("workStatus");
  if (ws) { ws.textContent = isOpen ? "✅ Hozir OCHIQ" : "❌ Hozir YOPIQ"; ws.style.color = isOpen ? "#d4aa4e" : "#f87171"; }
});

loadCategories();
loadProducts();