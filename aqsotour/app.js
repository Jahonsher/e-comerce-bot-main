// ===================================================
// ===== CONFIG — index.html da beriladi =============
// ===================================================
const _cfg = window.__CONFIG__ || {};

const API           = _cfg.API_URL       || "https://e-comerce-bot-main-production.up.railway.app";
const RESTAURANT_ID = _cfg.RESTAURANT_ID || "imperial";
const BOT_USERNAME  = _cfg.BOT_USERNAME  || "mini_shop_jahonsher_bot";
const ADMIN_TG      = _cfg.ADMIN_TG      || "Jahonsher";
const PHONE         = _cfg.PHONE         || "+998770083413";
const ADDRESS_UZ    = _cfg.ADDRESS_UZ    || "Toshkent, Chilonzor tumani, Navroz ko'chasi 15-uy";
const ADDRESS_RU    = _cfg.ADDRESS_RU    || "Ташкент, Чиланзарский район, ул. Навруз 15";
const METRO_UZ      = _cfg.METRO_UZ      || "Chilonzor (5 daqiqa yurish)";
const METRO_RU      = _cfg.METRO_RU      || "Чиланзар (5 минут пешком)";
const WORK_HOURS_UZ = _cfg.WORK_HOURS_UZ || "Du–Ju: 10:00–23:00  |  Sh–Ya: 09:00–00:00";
const WORK_HOURS_RU = _cfg.WORK_HOURS_RU || "Пн–Пт: 10:00–23:00  |  Сб–Вс: 09:00–00:00";
const REST_NAME_UZ  = _cfg.REST_NAME_UZ  || "Imperial Restoran";
const REST_NAME_RU  = _cfg.REST_NAME_RU  || "Ресторан Imperial";
const HERO_BADGE_UZ = _cfg.HERO_BADGE_UZ || "Toshkent, O'zbekiston";
const HERO_BADGE_RU = _cfg.HERO_BADGE_RU || "Ташкент, Узбекистан";
const SUBTITLE_UZ   = _cfg.SUBTITLE_UZ   || "Eng yaxshi ta'm — eng yaxshi xizmat";
const SUBTITLE_RU   = _cfg.SUBTITLE_RU   || "Лучший вкус — лучший сервис";
const WORK_START    = _cfg.WORK_START    || 10;
const WORK_END      = _cfg.WORK_END      || 23;

// ===================================================
// ===== STATE =======================================
// ===================================================
let products    = [];
let cart        = [];
let telegramId  = null;
let userData    = null;
let userProfile = null;
let orderType   = null;
let tableNumber = null;

// ===================================================
// ===== I18N ========================================
// ===================================================
const translations = {
  uz: {
    "nav.title":            "✦ " + REST_NAME_UZ,
    "hero.badge":           HERO_BADGE_UZ,
    "hero.title":           REST_NAME_UZ,
    "hero.subtitle":        SUBTITLE_UZ,
    "hero.btn":             "Menuni Ko'rish",
    "hero.bookbtn":         "Biz bilan bog\x27laning",
    "menu.sub":             "Bizning turlar",
    "menu.title":           "Turlar",
    "tab.all":              "Barchasi",
    "product.add":          "Qo'shish",
    "product.added":        "✓ Qo'shildi",
    "product.loading":      "Yuklanmoqda...",
    "product.notfound":     "Turlar topilmadi",
    "product.error":        "Turlar yuklanmadi",
    "cart.title":           "Tanlangan turlar",
    "cart.empty":           "Savatcha bo'sh",
    "cart.total":           "Jami:",
    "cart.currency":        "so'm",
    "cart.ordertype":       "📍 Buyurtma turi",
    "cart.dinein":          "🪑 Restoranda",
    "cart.online":          "🌐 Online",
    "cart.tableplaceholder":"Stol raqamini kiriting...",
    "cart.checkout":        "Bron Qilish",
    "cart.sending":         "Yuborilmoqda...",
    "user.title":           "Profilim",
    "user.loading":         "Yuklanmoqda...",
    "user.nophone":         "📱 Telefon yo'q",
    "user.orders":          "Bronlarim",
    "user.noorders":        "Hali buyurtma yo'q",
    "profile.guest":        "Mehmon",
    "alert.emptycart":      "⚠️ Savatcha bo'sh!",
    "alert.notelegram":     "⚠️ Buyurtma berish uchun Telegram bot orqali kiring!\n\n@" + BOT_USERNAME + " ga /start yuboring",
    "alert.selecttype":     "⚠️ Buyurtma turini tanlang: Restoranda yoki Online",
    "alert.entertable":     "⚠️ Stol raqamini kiriting!",
    "alert.success":        "✅ Buyurtma muvaffaqiyatli qabul qilindi!",
    "alert.error":          "❌ Xato: ",
    "tg.title":             "Telegram orqali kiring",
    "tg.desc":              "Bu ilova faqat Telegram bot orqali ishlaydi.<br><br>Quyidagi botga o'ting va <strong style=\"color:#c9a84c\">/start</strong> bosing:",
    "tg.btn":               "Botga o'tish →",
    "events.sub":           "Maxsus tadbirlar",
    "events.title":         "Tadbirlar",
    "events.from":          "Narx kelishiladi",
    "events.book":          "Biz bilan bog\x27laning",
    "events.birthday.title":"Tug'ilgan kun ziyofati",
    "events.birthday.desc": "Yaqinlaringiz bilan unutilmas tug'ilgan kunni " + REST_NAME_UZ + "da nishonlang.",
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
    "location.addr.val":    ADDRESS_UZ,
    "location.hours.label": "Ish vaqti",
    "location.hours.val":   WORK_HOURS_UZ,
    "location.phone.label": "Telefon",
    "location.metro.label": "Metro",
    "location.metro.val":   METRO_UZ,
    "footer.nav":           "Tezkor o'tish",
    "footer.actions":       "Amallar",
    "footer.admin":         "Admin @" + ADMIN_TG,
    "footer.bot":           "Telegram Bot",
    "footer.order":         "Bron qilish",
    "footer.book":          "Zal band qilish",
    "footer.callus":        "Qo'ng'iroq qilish",
    "footer.contact":       "Bog'lanish",
    "footer.text":          "Barcha huquqlar himoyalangan",
  },
  ru: {
    "nav.title":            "✦ " + REST_NAME_RU,
    "hero.badge":           HERO_BADGE_RU,
    "hero.title":           REST_NAME_RU,
    "hero.subtitle":        SUBTITLE_RU,
    "hero.btn":             "Смотреть туры",
    "hero.bookbtn":         "Связаться с нами",
    "menu.sub":             "Наши туры",
    "menu.title":           "Туры",
    "tab.all":              "Все",
    "product.add":          "Добавить",
    "product.added":        "✓ Добавлено",
    "product.loading":      "Загрузка...",
    "product.notfound":     "Туры не найдены",
    "product.error":        "Не удалось загрузить туры",
    "cart.title":           "Выбранные туры",
    "cart.empty":           "Туры не выбраны",
    "cart.total":           "Итого:",
    "cart.currency":        "сум",
    "cart.ordertype":       "📍 Тип заказа",
    "cart.dinein":          "🪑 В ресторане",
    "cart.online":          "🌐 Онлайн",
    "cart.tableplaceholder":"Введите номер стола...",
    "cart.checkout":        "Связаться с нами",
    "cart.sending":         "Отправляем...",
    "user.title":           "Мой профиль",
    "user.loading":         "Загрузка...",
    "user.nophone":         "📱 Телефон не указан",
    "user.orders":          "Мои бронирования",
    "user.noorders":        "Бронирований пока нет",
    "profile.guest":        "Гость",
    "alert.emptycart":      "⚠️ Корзина пуста!",
    "alert.notelegram":     "⚠️ Для заказа войдите через Telegram бот!\n\nОтправьте /start боту @" + BOT_USERNAME,
    "alert.selecttype":     "⚠️ Выберите тип заказа: В ресторане или Онлайн",
    "alert.entertable":     "⚠️ Введите номер стола!",
    "alert.success":        "✅ Заказ успешно принят!",
    "alert.error":          "❌ Ошибка: ",
    "tg.title":             "Войдите через Telegram",
    "tg.desc":              "Это приложение работает только через Telegram бот.<br><br>Перейдите к боту и нажмите <strong style=\"color:#c9a84c\">/start</strong>:",
    "tg.btn":               "Перейти к боту →",
    "events.sub":           "Специальные мероприятия",
    "events.title":         "Мероприятия",
    "events.from":          "Цена договорная",
    "events.book":          "Связаться с нами",
    "events.birthday.title":"День рождения",
    "events.birthday.desc": "Отпразднуйте незабываемый день рождения в " + REST_NAME_RU + " с близкими.",
    "events.birthday.f1":   "Специальное оформление стола",
    "events.birthday.f2":   "Индивидуальный выбор меню",
    "events.birthday.f3":   "Свечи и поздравительная песня",
    "events.private.title": "Частный банкет",
    "events.private.desc":  "Забронируйте весь зал только для вас и ваших гостей.",
    "events.private.f1":    "Аренда всего зала",
    "events.private.f2":    "Персональный официант",
    "events.private.f3":    "Аудиосистема и проектор",
    "events.corporate.title":"Корпоратив",
    "events.corporate.desc":"Идеальная атмосфера для деловых встреч.",
    "events.corporate.f1":  "Экран для презентаций",
    "events.corporate.f2":  "Бизнес-меню и фуршет",
    "events.corporate.f3":  "Отдельный вход и обслуживание",
    "gallery.sub":          "Атмосфера ресторана",
    "gallery.title":        "Галерея",
    "location.sub":         "Найдите нас",
    "location.title":       "Адрес",
    "location.addr.label":  "Адрес",
    "location.addr.val":    ADDRESS_RU,
    "location.hours.label": "Часы работы",
    "location.hours.val":   WORK_HOURS_RU,
    "location.phone.label": "Телефон",
    "location.metro.label": "Метро",
    "location.metro.val":   METRO_RU,
    "footer.nav":           "Быстрый переход",
    "footer.actions":       "Действия",
    "footer.admin":         "Админ @" + ADMIN_TG,
    "footer.bot":           "Telegram Бот",
    "footer.order":         "Забронировать",
    "footer.book":          "Забронировать зал",
    "footer.callus":        "Позвонить",
    "footer.contact":       "Связаться",
    "footer.text":          "Все права защищены",
  }
};

let currentLang = localStorage.getItem("lang") || "uz";

function t(key) {
  return (translations[currentLang] && translations[currentLang][key])
    || (translations["uz"] && translations["uz"][key])
    || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  applyTranslations();
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
  renderProducts(activeCat === "all" ? products : products.filter(p => p.category === activeCat));
  updateCart();
  updateProductButtons();
  renderProfile();

  // Til tugmalarini yangilash (Tailwind class bilan)
  document.querySelectorAll(".lang-b").forEach(btn => {
    const isActive = btn.dataset.lang === lang;
    btn.classList.toggle("active", isActive);
    btn.classList.toggle("!bg-ared", isActive);
    btn.classList.toggle("!text-white", isActive);
    if (!isActive) {
      btn.classList.remove("!bg-ared", "!text-white");
    }
  });

  // Services cardlarni qayta render qilish
  var cfg = window.__CONFIG__ || {};
  var sg = document.getElementById('servicesGrid');
  if (sg && cfg.SERVICES) {
    sg.innerHTML = cfg.SERVICES.map(function(s) {
      return '<div class="bg-white rounded-2xl p-6 mb-3.5 transition-transform hover:-translate-y-1">' +
        '<div class="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 text-2xl">' + s.icon + '</div>' +
        '<div class="text-base font-bold text-gray-900 mb-2">' + (lang==='ru' ? s.title_ru : s.title_uz) + '</div>' +
        '<div class="text-sm text-gray-500 leading-relaxed">' + (lang==='ru' ? s.desc_ru : s.desc_uz) + '</div>' +
      '</div>';
    }).join('');
  }

  // FAQ qayta render qilish
  var fl = document.getElementById('faqList');
  if (fl && cfg.FAQ) {
    fl.innerHTML = cfg.FAQ.map(function(f, i) {
      return '<div class="faq-item bg-white rounded-xl mb-2.5 overflow-hidden" id="faq-'+i+'">' +
        '<div class="faq-q flex items-center justify-between px-5 py-4 cursor-pointer" onclick="toggleFaq('+i+')">' +
          '<span class="text-sm font-medium text-gray-900">' + (lang==='ru' ? f.q_ru : f.q_uz) + '</span>' +
          '<span class="faq-plus text-xl text-gray-400 transition-transform ml-3 shrink-0 font-light">+</span>' +
        '</div>' +
        '<div class="faq-a">' +
          '<div class="text-sm text-gray-500 leading-relaxed px-5 pb-4 border-t border-gray-100 pt-3">' + (lang==='ru' ? f.a_ru : f.a_uz) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }
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

// ===================================================
// ===== TELEGRAM AUTH ===============================
// ===================================================
function initTelegramUser() {
  if (!window.Telegram || !window.Telegram.WebApp) {
    showNotTelegramWarning();
    return;
  }
  const tg = window.Telegram.WebApp;
  tg.expand();

  // Rang — index.html dagi CSS o'zgaruvchilaridan olinadi
  const bgColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--tg-bg').trim() || "#0d0a07";
  tg.setHeaderColor(bgColor);
  tg.setBackgroundColor(bgColor);

  let tgUser = tg.initDataUnsafe?.user;
  if (!tgUser && tg.initData) {
    try {
      const params  = new URLSearchParams(tg.initData);
      const userStr = params.get("user");
      if (userStr) tgUser = JSON.parse(decodeURIComponent(userStr));
    } catch(e) { console.warn("initData parse xato:", e); }
  }

  if (tgUser && tgUser.id) {
    telegramId = tgUser.id;
    userData   = tgUser;
    if (!localStorage.getItem("lang")) {
      currentLang = (tgUser.language_code === "ru") ? "ru" : "uz";
      localStorage.setItem("lang", currentLang);
    }
    fetch(API + "/auth", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        id:           tgUser.id,
        first_name:   tgUser.first_name || "",
        last_name:    tgUser.last_name  || "",
        username:     tgUser.username   || "",
        restaurantId: RESTAURANT_ID
      })
    })
    .then(r => r.json())
    .then(() => fetch(API + "/user/" + telegramId + "?restaurantId=" + RESTAURANT_ID))
    .then(r => r.json())
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

// Blok tekshiruvi
fetch(API + "/check-block/" + RESTAURANT_ID)
  .then(r => r.json())
  .then(d => { if (d.blocked) showBlockedPage(d.reason); })
  .catch(() => {});

initTelegramUser();

// ===================================================
// ===== PROFILE =====================================
// ===================================================
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

// ===================================================
// ===== CATEGORIES ==================================
// ===================================================
function loadCategories() {
  fetch(API + "/categories?restaurantId=" + RESTAURANT_ID)
    .then(res => res.json())
    .then(cats => {
      const tabsContainer = document.getElementById("filterTabs");
      if (!tabsContainer) return;
      let html = '<button class="tab-btn active" data-cat="all" onclick="filterCategory(\'all\',this)">' + t("tab.all") + '</button>';
      cats.forEach(cat => {
        const name   = cat.name || cat;
        const nameRu = cat.name_ru || name;
        const display = (currentLang === "ru" && nameRu) ? nameRu : name;
        html += '<button class="tab-btn" data-cat="' + name + '" data-name-ru="' + nameRu + '" onclick="filterCategory(\'' + name + '\',this)">' + display + '</button>';
      });
      tabsContainer.innerHTML = html;
    })
    .catch(() => {
      const el = document.getElementById("filterTabs");
      if (el) el.innerHTML = '<button class="tab-btn active" data-cat="all" onclick="filterCategory(\'all\',this)">' + t("tab.all") + '</button>';
    });
}

// ===================================================
// ===== PRODUCTS ====================================
// ===================================================
function loadProducts() {
  fetch(API + "/products?restaurantId=" + RESTAURANT_ID)
    .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(data => { products = data; renderProducts(products); })
    .catch(err => {
      const c = document.getElementById("products");
      if (c) c.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><p>' + t("product.error") + ' (' + err.message + ')</p></div>';
    });
}

function renderProducts(list) {
  const container = document.getElementById("products");
  if (!container) return;
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
      '<img src="' + p.image + '" alt="' + displayName + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
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

function filterCategory(cat, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderProducts(cat === "all" ? products : products.filter(p => p.category === cat));
}

// ===================================================
// ===== CART ========================================
// ===================================================
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
      btn.style.background = "linear-gradient(135deg,#e8c86e,#c8a84e)";
      btn.style.color = "var(--dark)";
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
  const badge   = document.getElementById("cartCount");
  const totalEl = document.getElementById("cartTotal");
  if (badge)   badge.textContent   = count;
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
        '<button class="qty-btn" onclick="changeQty(' + item.id + ',-1)">−</button>' +
        '<span class="qty-num">' + item.quantity + '</span>' +
        '<button class="qty-btn" onclick="changeQty(' + item.id + ',1)">+</button>' +
      '</div>' +
    '</div>';
  }).join("");
}

// ===================================================
// ===== PANELS ======================================
// ===================================================
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

// ===================================================
// ===== ORDER TYPE ==================================
// ===================================================
function selectOrderType(type) {
  orderType = type;
  const btnDineIn  = document.getElementById("btnDineIn");
  const btnOnline  = document.getElementById("btnOnline");
  const tableWrap  = document.getElementById("tableInputWrap");
  const activeStyle   = "background:var(--gold);color:var(--dark);border-color:var(--gold);font-weight:500;";
  const inactiveStyle = "background:rgba(201,168,76,0.08);color:var(--muted);border-color:var(--border);font-weight:300;";
  if (type === "dine_in") {
    btnDineIn.style.cssText += activeStyle;
    btnOnline.style.cssText += inactiveStyle;
    tableWrap.style.display  = "block";
    tableNumber = null;
  } else {
    btnOnline.style.cssText += activeStyle;
    btnDineIn.style.cssText += inactiveStyle;
    tableWrap.style.display  = "none";
    tableNumber = "Online";
    document.getElementById("tableInput").value = "";
  }
}

// ===================================================
// ===== CHECKOUT ====================================
// ===================================================
function checkout() {
  if (!cart.length) { alert(t("alert.emptycart")); return; }
  if (!telegramId)  { alert(t("alert.notelegram")); return; }
  if (!orderType)   { alert(t("alert.selecttype")); return; }
  if (orderType === "dine_in") {
    const tableVal = document.getElementById("tableInput")?.value?.trim();
    if (!tableVal) { alert(t("alert.entertable")); document.getElementById("tableInput")?.focus(); return; }
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
    body:    JSON.stringify({ telegramId, items: cart, user: userToSend, orderType, tableNumber, restaurantId: RESTAURANT_ID })
  })
  .then(res => res.json())
  .then(data => {
    if (data.blocked || data.error === "BLOCKED") {
      showBlockedPage(data.message || "Restoran vaqtincha ishlamayapti");
      if (btn) { btn.disabled = false; btn.textContent = t("cart.checkout"); }
      return;
    }
    if (!data.success) throw new Error(data.error || "Xato");
    cart = []; orderType = null; tableNumber = null;
    const btnDI = document.getElementById("btnDineIn");
    const btnON = document.getElementById("btnOnline");
    const tWrap = document.getElementById("tableInputWrap");
    const tInp  = document.getElementById("tableInput");
    if (btnDI) btnDI.style.cssText = "";
    if (btnON) btnON.style.cssText = "";
    if (tWrap) tWrap.style.display = "none";
    if (tInp)  tInp.value = "";
    updateCart();
    updateProductButtons();
    closePanels();
    alert(t("alert.success"));
  })
  .catch(err => alert(t("alert.error") + err.message))
  .finally(() => { if (btn) { btn.disabled = false; btn.textContent = t("cart.checkout"); } });
}

function showBlockedPage(reason) {
  const old = document.getElementById("blockedOverlay");
  if (old) old.remove();
  const el = document.createElement("div");
  el.id = "blockedOverlay";
  el.style.cssText = "position:fixed;inset:0;background:#0a0f1e;display:flex;align-items:center;justify-content:center;z-index:99999;padding:24px;text-align:center";
  el.innerHTML =
    '<div style="max-width:320px">' +
    '<div style="font-size:56px;margin-bottom:16px">🔒</div>' +
    '<div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:12px">Restoran vaqtincha yopiq</div>' +
    '<div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:14px;margin-bottom:16px">' +
    '<div style="font-size:13px;color:#fca5a5;line-height:1.6">' + (reason || "") + '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:#475569">Iltimos, keyinroq qayta urinib ko\'ring</div>' +
    '</div>';
  document.body.appendChild(el);
}

// ===================================================
// ===== USER ORDERS =================================
// ===================================================
function loadUserOrders() {
  if (!telegramId) return;
  const c = document.getElementById("userOrders");
  if (c) c.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>' + t("user.loading") + '</p></div>';
  fetch(API + "/orders/user/" + telegramId + "?restaurantId=" + RESTAURANT_ID)
    .then(r => r.json())
    .then(data => {
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
    .catch(() => {
      if (c) c.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>' + t("user.noorders") + '</p></div>';
    });
}

// ===================================================
// ===== SCROLL & MISC ===============================
// ===================================================
function scrollToMenu() {
  document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function bookEvent() {
  window.open("https://t.me/" + ADMIN_TG, "_blank");
}

document.addEventListener("DOMContentLoaded", () => {
  applyTranslations();
  document.querySelectorAll(".lang-b").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });

  // Ish vaqtini dinamik ko'rsatish
  const h = (new Date().getUTCHours() + 5) % 24;
  const isOpen = h >= WORK_START && h < WORK_END;
  const workStatusEl = document.getElementById("workStatus");
  if (workStatusEl) {
    workStatusEl.textContent = isOpen ? "✅ Hozir OCHIQ" : "❌ Hozir YOPIQ";
    workStatusEl.style.color = isOpen ? "#e8c86e" : "#f87171";
  }
});

loadCategories();
loadProducts();