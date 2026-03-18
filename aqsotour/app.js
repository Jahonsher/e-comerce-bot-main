// ===================================================
// ===== AQSOTOUR APP.JS — ALOHIDA ==================
// ===================================================
var API = "https://e-comerce-bot-main-production.up.railway.app";
var RESTAURANT_ID = "aqsotour";
var BOT_USERNAME = "AqsoTour_bot";

var products = [];
var cart = [];
var telegramId = null;
var userData = null;
var userProfile = null;
var orderType = null;
var tableNumber = null;
var currentLang = localStorage.getItem("lang") || "uz";

// ===================================================
// ===== TARJIMALAR — FAQAT AQSOTOUR ================
// ===================================================
var TR = {
  uz: {
    "tab.all":          "Barchasi",
    "product.add":      "Tanlash",
    "product.soldout":  "Mavjud emas",
    "product.added":    "✓ Tanlandi",
    "product.loading":  "Yuklanmoqda...",
    "product.notfound": "Hozircha turlar qo'shilmagan",
    "product.error":    "Turlar yuklanmadi",
    "cart.title":       "Tanlangan turlar",
    "cart.empty":       "Hali tur tanlanmagan",
    "cart.total":       "Jami:",
    "cart.currency":    "so'm",
    "cart.dinein":      "🏢 Ofisdan buyurtma",
    "cart.online":      "🌐 Online",
    "cart.checkout":    "Bron Qilish",
    "cart.sending":     "Yuborilmoqda...",
    "user.title":       "Profilim",
    "user.loading":     "Yuklanmoqda...",
    "user.nophone":     "📱 Telefon yo'q",
    "user.orders":      "Bronlarim",
    "user.noorders":    "Hali bron yo'q",
    "profile.guest":    "Mehmon",
    "alert.emptycart":  "⚠️ Hali tur tanlanmagan!",
    "alert.notelegram": "⚠️ Bron qilish uchun Telegram bot orqali kiring!\n\n@AqsoTour_bot ga /start yuboring",
    "alert.selecttype": "⚠️ Buyurtma turini tanlang: Ofisdan yoki Online",
    "alert.success":    "✅ Bron muvaffaqiyatli qabul qilindi!",
    "alert.error":      "❌ Xato: ",
    "tg.title":         "Telegram orqali kiring",
    "tg.desc":          "Bu ilova faqat Telegram bot orqali ishlaydi.<br><br>Quyidagi botga o'ting va <strong style='color:#e53935'>/start</strong> bosing:",
    "tg.btn":           "Botga o'tish →",
    "menu.title":       "Turlar & Paketlar",
    "services.title":   "Bizning eng yaxshi xizmatlarimiz",
    "gallery.title":    "Bizning galleriyamiz",
    "faq.heading":      "Tez-tez so'raladigan savollar",
    "contact.heading":  "Aloqa",
    "footer.desc":      "Aqso Tour — sizning orzudagi sayohatlaringizni amalga oshirish uchun ishonchli hamkoringiz.",
    "footer.quicklinks":"Tezkor havola",
    "footer.home":      "Bosh sahifa",
    "footer.services":  "Xizmatlar",
    "footer.contactus": "Biz bilan bog'laning",
    "footer.copyright": "© 2026 Aqso Tour. Barcha huquqlar himoyalangan.",
    "hero.subtitle":    "Biz bilan sayohatingizni mukammal rejalashtiring!",
    "location.addr.val":"Andijon, O'zbekiston"
  },
  ru: {
    "tab.all":          "Все",
    "product.add":      "Выбрать",
    "product.soldout":  "Недоступно",
    "product.added":    "✓ Выбрано",
    "product.loading":  "Загрузка...",
    "product.notfound": "Туры пока не добавлены",
    "product.error":    "Не удалось загрузить туры",
    "cart.title":       "Выбранные туры",
    "cart.empty":       "Туры не выбраны",
    "cart.total":       "Итого:",
    "cart.currency":    "сум",
    "cart.dinein":      "🏢 Из офиса",
    "cart.online":      "🌐 Онлайн",
    "cart.checkout":    "Забронировать",
    "cart.sending":     "Отправляем...",
    "user.title":       "Мой профиль",
    "user.loading":     "Загрузка...",
    "user.nophone":     "📱 Телефон не указан",
    "user.orders":      "Мои бронирования",
    "user.noorders":    "Бронирований пока нет",
    "profile.guest":    "Гость",
    "alert.emptycart":  "⚠️ Туры не выбраны!",
    "alert.notelegram": "⚠️ Для бронирования войдите через Telegram бот!\n\nОтправьте /start боту @AqsoTour_bot",
    "alert.selecttype": "⚠️ Выберите тип заказа: Из офиса или Онлайн",
    "alert.success":    "✅ Бронь успешно принята!",
    "alert.error":      "❌ Ошибка: ",
    "tg.title":         "Войдите через Telegram",
    "tg.desc":          "Это приложение работает только через Telegram бот.<br><br>Перейдите к боту и нажмите <strong style='color:#e53935'>/start</strong>:",
    "tg.btn":           "Перейти к боту →",
    "menu.title":       "Туры & Пакеты",
    "services.title":   "Наши лучшие услуги",
    "gallery.title":    "Наша галерея",
    "faq.heading":      "Часто задаваемые вопросы",
    "contact.heading":  "Контакты",
    "footer.desc":      "Aqso Tour — ваш надёжный партнёр для путешествий мечты.",
    "footer.quicklinks":"Быстрые ссылки",
    "footer.home":      "Главная",
    "footer.services":  "Услуги",
    "footer.contactus": "Свяжитесь с нами",
    "footer.copyright": "© 2026 Aqso Tour. Все права защищены.",
    "hero.subtitle":    "Планируйте идеальное путешествие с нами!",
    "location.addr.val":"Андижан, Узбекистан"
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
    if (cat === "all") {
      btn.textContent = t("tab.all");
    } else {
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

  // Lang tugmalarini yangilash
  document.querySelectorAll(".lang-b").forEach(function(btn) {
    if (btn.dataset.lang === lang) {
      btn.style.background = "#e53935";
      btn.style.color = "#fff";
      btn.style.fontWeight = "700";
    } else {
      btn.style.background = "transparent";
      btn.style.color = "#9ca3af";
      btn.style.fontWeight = "500";
    }
  });

  // Services re-render
  var cfg = window.__CONFIG__ || {};
  var sg = document.getElementById("servicesGrid");
  if (sg && cfg.SERVICES) {
    sg.innerHTML = cfg.SERVICES.map(function(s) {
      return '<div class="bg-white rounded-2xl p-6 mb-3.5 transition-transform hover:-translate-y-1">' +
        '<div class="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 text-2xl">' + s.icon + '</div>' +
        '<div class="text-base font-bold text-gray-900 mb-2">' + (lang === "ru" ? s.title_ru : s.title_uz) + '</div>' +
        '<div class="text-sm text-gray-500 leading-relaxed">' + (lang === "ru" ? s.desc_ru : s.desc_uz) + '</div>' +
      '</div>';
    }).join("");
  }

  // FAQ re-render
  var fl = document.getElementById("faqList");
  if (fl && cfg.FAQ) {
    fl.innerHTML = cfg.FAQ.map(function(f, i) {
      return '<div class="faq-item bg-white rounded-xl mb-2.5 overflow-hidden" id="faq-' + i + '">' +
        '<div class="faq-q flex items-center justify-between px-5 py-4 cursor-pointer" onclick="toggleFaq(' + i + ')">' +
          '<span class="text-sm font-medium text-gray-900">' + (lang === "ru" ? f.q_ru : f.q_uz) + '</span>' +
          '<span class="faq-plus text-xl text-gray-400 transition-transform ml-3 shrink-0 font-light">+</span>' +
        '</div>' +
        '<div class="faq-a"><div class="text-sm text-gray-500 leading-relaxed px-5 pb-4 border-t border-gray-100 pt-3">' + (lang === "ru" ? f.a_ru : f.a_uz) + '</div></div>' +
      '</div>';
    }).join("");
  }

  // Lucide
  if (window.lucide) lucide.createIcons();
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(function(el) {
    var key = el.dataset.i18n;
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
  tg.setHeaderColor("#0a0e27");
  tg.setBackgroundColor("#0a0e27");

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
      var html = '<button class="tab-btn active" data-cat="all" onclick="filterCategory(\'all\',this)">' + t("tab.all") + '</button>';
      cats.forEach(function(cat) {
        var name = cat.name || cat;
        var nameRu = cat.name_ru || name;
        var display = (currentLang === "ru" && nameRu) ? nameRu : name;
        html += '<button class="tab-btn" data-cat="' + name + '" data-name-ru="' + nameRu + '" onclick="filterCategory(\'' + name + '\',this)">' + display + '</button>';
      });
      el.innerHTML = html;
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
      if (c) c.innerHTML = '<div class="col-span-2 text-center py-16 text-gray-500"><span class="text-3xl block mb-3">⚠️</span><span class="text-sm">' + t("product.error") + '</span></div>';
    });
}

function renderProducts(list) {
  var el = document.getElementById("products");
  if (!el) return;
  el.innerHTML = "";
  if (!list || !list.length) {
    el.innerHTML = '<div class="col-span-2 text-center py-16 text-gray-500"><div class="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center text-3xl">✈️</div><span class="text-sm font-medium">' + t("product.notfound") + '</span></div>';
    return;
  }
  list.forEach(function(p, i) {
    var card = document.createElement("div");
    var isActive = p.active !== false;
    card.className = "product-card fade-up" + (isActive ? "" : " product-soldout");
    card.style.animationDelay = (i * 60) + "ms";
    var dn = (currentLang === "ru" && p.name_ru) ? p.name_ru : p.name;

    if (isActive) {
      card.innerHTML =
        '<div class="product-img-wrap"><img src="' + p.image + '" alt="' + dn + '" onerror="this.style.display=\'none\';this.parentElement.nextElementSibling.style.display=\'flex\'"></div>' +
        '<div class="img-placeholder" style="display:none">✈️</div>' +
        '<div class="product-info"><h3>' + dn + '</h3><div class="cat">' + p.category + '</div>' +
        '<span class="price">' + Number(p.price).toLocaleString() + ' ' + t("cart.currency") + '</span>' +
        '<button class="add-btn" data-id="' + p.id + '" onclick="addToCart(' + p.id + ')">' + t("product.add") + '</button></div>';
    } else {
      card.innerHTML =
        '<div class="product-img-wrap"><img src="' + p.image + '" alt="' + dn + '" style="filter:grayscale(80%) brightness(0.6)" onerror="this.style.display=\'none\'"><div class="soldout-badge">' + t("product.soldout") + '</div></div>' +
        '<div class="img-placeholder" style="display:none">✈️</div>' +
        '<div class="product-info"><h3 style="opacity:0.5">' + dn + '</h3><div class="cat">' + p.category + '</div>' +
        '<span class="price" style="opacity:0.4;text-decoration:line-through">' + Number(p.price).toLocaleString() + ' ' + t("cart.currency") + '</span>' +
        '<div class="soldout-btn">' + t("product.soldout") + '</div></div>';
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
      btn.style.background = "linear-gradient(135deg,#10b981,#059669)";
      btn.style.color = "#fff";
    } else {
      btn.innerHTML = t("product.add");
      btn.style.background = "";
      btn.style.color = "";
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
    el.innerHTML = '<div class="text-center py-16 text-gray-500"><div class="w-14 h-14 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center text-2xl">✈️</div><span class="text-sm font-medium">' + t("cart.empty") + '</span></div>';
    return;
  }
  el.innerHTML = cart.map(function(item) {
    var name = (currentLang === "ru" && item.name_ru) ? item.name_ru : item.name;
    return '<div class="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3.5 mb-2.5 flex justify-between items-center">' +
      '<div><div class="text-sm font-semibold text-white mb-1">' + name + '</div>' +
      '<div class="text-[15px] font-bold text-ared">' + Number(item.price).toLocaleString() + ' ' + t("cart.currency") + '</div></div>' +
      '<div class="flex items-center gap-2">' +
        '<button onclick="changeQty(' + item.id + ',-1)" class="w-8 h-8 rounded-lg border border-white/10 bg-white/5 text-white text-base flex items-center justify-center cursor-pointer">−</button>' +
        '<span class="text-sm font-bold min-w-[24px] text-center text-white">' + item.quantity + '</span>' +
        '<button onclick="changeQty(' + item.id + ',1)" class="w-8 h-8 rounded-lg border border-ared/30 bg-ared/10 text-ared text-base flex items-center justify-center cursor-pointer">+</button>' +
      '</div></div>';
  }).join("");
}

// ===================================================
// ===== PANELS ======================================
// ===================================================
function toggleCart() { openPanel("cartPanel"); }
function openUserPanel() { openPanel("userPanel"); renderProfile(); loadUserOrders(); }

function openPanel(id) {
  document.getElementById(id).classList.add("open");
  document.getElementById("overlay").classList.add("show");
}

function closePanels() {
  document.getElementById("cartPanel").classList.remove("open");
  document.getElementById("userPanel").classList.remove("open");
  document.getElementById("overlay").classList.remove("show");
}

// ===================================================
// ===== ORDER TYPE ==================================
// ===================================================
function selectOrderType(type) {
  orderType = type;
  var btnDI = document.getElementById("btnDineIn");
  var btnON = document.getElementById("btnOnline");
  var wrap = document.getElementById("tableInputWrap");
  if (type === "dine_in") {
    btnDI.style.cssText += "background:#e53935;color:#fff;border-color:#e53935;font-weight:600;";
    btnON.style.cssText += "background:rgba(255,255,255,0.03);color:#9ca3af;border-color:rgba(255,255,255,0.1);";
    wrap.style.display = "block";
    tableNumber = null;
  } else {
    btnON.style.cssText += "background:#e53935;color:#fff;border-color:#e53935;font-weight:600;";
    btnDI.style.cssText += "background:rgba(255,255,255,0.03);color:#9ca3af;border-color:rgba(255,255,255,0.1);";
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
    tableNumber = document.getElementById("tableInput").value.trim() || "Ofisdan";
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
    if (data.blocked || data.error === "BLOCKED") {
      showBlockedPage(data.message || "Xizmat vaqtincha to'xtatilgan");
      if (btn) { btn.disabled = false; btn.textContent = t("cart.checkout"); }
      return;
    }
    if (!data.success) throw new Error(data.error || "Xato");
    cart = []; orderType = null; tableNumber = null;
    var btnDI = document.getElementById("btnDineIn");
    var btnON = document.getElementById("btnOnline");
    var tw = document.getElementById("tableInputWrap");
    var ti = document.getElementById("tableInput");
    if (btnDI) btnDI.style.cssText = "";
    if (btnON) btnON.style.cssText = "";
    if (tw) tw.style.display = "none";
    if (ti) ti.value = "";
    updateCart();
    updateProductButtons();
    closePanels();
    alert(t("alert.success"));
  })
  .catch(function(e) { alert(t("alert.error") + e.message); })
  .finally(function() { if (btn) { btn.disabled = false; btn.textContent = t("cart.checkout"); } });
}

function showBlockedPage(reason) {
  var old = document.getElementById("blockedOverlay");
  if (old) old.remove();
  var el = document.createElement("div");
  el.id = "blockedOverlay";
  el.style.cssText = "position:fixed;inset:0;background:#0a0e27;display:flex;align-items:center;justify-content:center;z-index:99999;padding:24px;text-align:center";
  el.innerHTML = '<div style="max-width:320px"><div style="font-size:56px;margin-bottom:16px">🔒</div><div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:12px">Xizmat vaqtincha to\'xtatilgan</div><div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:14px;margin-bottom:16px"><div style="font-size:13px;color:#fca5a5;line-height:1.6">' + (reason || "") + '</div></div></div>';
  document.body.appendChild(el);
}

// ===================================================
// ===== USER ORDERS =================================
// ===================================================
function loadUserOrders() {
  if (!telegramId) return;
  var c = document.getElementById("userOrders");
  if (c) c.innerHTML = '<div class="text-center py-12 text-gray-500"><span class="text-sm">' + t("user.loading") + '</span></div>';
  fetch(API + "/orders/user/" + telegramId + "?restaurantId=" + RESTAURANT_ID)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!c) return;
      if (!data || !data.length) {
        c.innerHTML = '<div class="text-center py-12 text-gray-500"><span class="text-3xl block mb-3 opacity-50">📦</span><span class="text-sm">' + t("user.noorders") + '</span></div>';
        return;
      }
      c.innerHTML = data.map(function(order) {
        var items = order.items.map(function(i) {
          var n = (currentLang === "ru" && i.name_ru) ? i.name_ru : i.name;
          return n + " × " + i.quantity;
        }).join(", ");
        var date = new Date(order.createdAt).toLocaleDateString(currentLang === "ru" ? "ru-RU" : "uz-UZ");
        return '<div class="mx-4 mb-3 p-4 bg-navy border border-white/10 rounded-xl">' +
          '<div class="text-sm text-gray-300 mb-1">' + items + '</div>' +
          '<div class="text-lg font-bold text-ared mb-1">' + Number(order.total).toLocaleString() + ' ' + t("cart.currency") + '</div>' +
          '<div class="flex items-center gap-2"><span class="text-[10px] tracking-wider uppercase px-2.5 py-0.5 border border-ared/30 text-ared rounded">' + (order.status || "Yangi") + '</span>' +
          '<span class="text-xs text-gray-500">🕐 ' + date + '</span></div></div>';
      }).join("");
    })
    .catch(function() {
      if (c) c.innerHTML = '<div class="text-center py-12 text-gray-500"><span class="text-sm">' + t("user.noorders") + '</span></div>';
    });
}

// ===================================================
// ===== INIT ========================================
// ===================================================
// Bloklash tekshiruvi
fetch(API + "/check-block/" + RESTAURANT_ID)
  .then(function(r) { return r.json(); })
  .then(function(d) { if (d.blocked) showBlockedPage(d.reason); })
  .catch(function() {});

initTelegramUser();

document.addEventListener("DOMContentLoaded", function() {
  applyTranslations();
  // Lang tugmalarni boshlang'ich holatga qo'yish
  document.querySelectorAll(".lang-b").forEach(function(btn) {
    if (btn.dataset.lang === currentLang) {
      btn.style.background = "#e53935";
      btn.style.color = "#fff";
      btn.style.fontWeight = "700";
    }
  });
});

loadCategories();
loadProducts();