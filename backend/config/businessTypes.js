/**
 * ServiX — Universal Business Types Registry
 *
 * Har bir biznes turi uchun:
 *   - label: ko'rsatiladigan nom (uz/ru)
 *   - icon: emoji
 *   - modules: mavjud modullar ro'yxati
 *     - key: modul nomi (Admin.modules ichidagi field)
 *     - label: ko'rsatiladigan nom
 *     - icon: emoji
 *     - default: yangi biznes yaratilganda yoqilganmi
 *     - core: true bo'lsa, o'chirib bo'lmaydi
 *     - description: qisqa tavsif
 *
 * Yangi biznes turi qo'shish:
 *   1. Shu faylga yangi type qo'shing
 *   2. Kerakli model/route/service yarating
 *   3. moduleGuard middleware orqali himoyalang
 */

const BUSINESS_TYPES = {
  restaurant: {
    label: { uz: "Restoran", ru: "Ресторан" },
    icon: "🍽️",
    description: {
      uz: "Restoran, kafe, fast-food, oshxona boshqaruvi",
      ru: "Управление рестораном, кафе, фаст-фудом",
    },
    modules: {
      // === CORE (o'chirib bo'lmaydi) ===
      menu: {
        label: { uz: "Menyu", ru: "Меню" },
        icon: "📋",
        default: true,
        core: true,
        description: { uz: "Mahsulotlar va kategoriyalar boshqaruvi", ru: "Управление продуктами и категориями" },
      },
      categories: {
        label: { uz: "Kategoriyalar", ru: "Категории" },
        icon: "📂",
        default: true,
        core: true,
        description: { uz: "Menyu kategoriyalari", ru: "Категории меню" },
      },
      orders: {
        label: { uz: "Buyurtmalar", ru: "Заказы" },
        icon: "🛒",
        default: true,
        core: true,
        description: { uz: "Buyurtmalarni qabul qilish va boshqarish", ru: "Приём и управление заказами" },
      },

      // === STANDARD (default yoqiq) ===
      users: {
        label: { uz: "Foydalanuvchilar", ru: "Пользователи" },
        icon: "👥",
        default: true,
        core: false,
        description: { uz: "Telegram foydalanuvchilari ro'yxati", ru: "Список пользователей Telegram" },
      },
      ratings: {
        label: { uz: "Baholar", ru: "Оценки" },
        icon: "⭐",
        default: true,
        core: false,
        description: { uz: "Foydalanuvchi baholari va fikrlari", ru: "Оценки и отзывы пользователей" },
      },
      employees: {
        label: { uz: "Xodimlar", ru: "Сотрудники" },
        icon: "👨‍💼",
        default: true,
        core: false,
        description: { uz: "Xodimlar boshqaruvi", ru: "Управление сотрудниками" },
      },
      attendance: {
        label: { uz: "Davomat", ru: "Посещаемость" },
        icon: "📅",
        default: true,
        core: false,
        description: { uz: "Keldi-ketdi tizimi (Face ID)", ru: "Система учёта рабочего времени (Face ID)" },
      },
      empReport: {
        label: { uz: "Xodim hisoboti", ru: "Отчёт сотрудников" },
        icon: "📊",
        default: true,
        core: false,
        description: { uz: "Oylik hisobot va ish vaqti", ru: "Ежемесячный отчёт и рабочее время" },
      },
      branches: {
        label: { uz: "Filiallar", ru: "Филиалы" },
        icon: "🏢",
        default: true,
        core: false,
        description: { uz: "Ko'p filial boshqaruvi", ru: "Управление несколькими филиалами" },
      },
      broadcast: {
        label: { uz: "Xabar yuborish", ru: "Рассылка" },
        icon: "📢",
        default: true,
        core: false,
        description: { uz: "Telegram orqali ommaviy xabar", ru: "Массовая рассылка через Telegram" },
      },
      notifications: {
        label: { uz: "Bildirishnomalar", ru: "Уведомления" },
        icon: "🔔",
        default: true,
        core: false,
        description: { uz: "Tizim bildirishnomalari", ru: "Системные уведомления" },
      },
      inventory: {
        label: { uz: "Ombor", ru: "Склад" },
        icon: "📦",
        default: false,
        core: false,
        description: { uz: "Mahsulot ombori va hisoboti", ru: "Складской учёт" },
      },

      // === ADVANCED (default o'chiq) ===
      waiter: {
        label: { uz: "Ofitsiant panel", ru: "Панель официанта" },
        icon: "🧑‍🍳",
        default: false,
        core: false,
        description: { uz: "Stol va shot boshqaruvi", ru: "Управление столами и заказами" },
      },
      kitchen: {
        label: { uz: "Oshxona panel", ru: "Панель кухни" },
        icon: "🔥",
        default: false,
        core: false,
        description: { uz: "Oshpaz uchun buyurtma paneli", ru: "Панель заказов для повара" },
      },
      aiAgent: {
        label: { uz: "AI Yordamchi", ru: "AI Помощник" },
        icon: "🤖",
        default: false,
        core: false,
        description: { uz: "Sun'iy intellekt yordamchisi — statistika, tahlil, prognoz", ru: "AI помощник — статистика, анализ, прогнозы" },
      },
    },
  },

  // ========================================
  // TURIZM
  // ========================================
  tourism: {
    label: { uz: "Turizm", ru: "Туризм" },
    icon: "✈️",
    description: {
      uz: "Tur agentlik, mehmonxona, sayohat xizmatlari",
      ru: "Турагентство, гостиница, туристические услуги",
    },
    modules: {
      // CORE
      menu: {
        label: { uz: "Turlar / Xizmatlar", ru: "Туры / Услуги" },
        icon: "🗺️",
        default: true,
        core: true,
        description: { uz: "Tur paketlar va xizmatlar boshqaruvi", ru: "Управление турпакетами и услугами" },
      },
      categories: {
        label: { uz: "Kategoriyalar", ru: "Категории" },
        icon: "📂",
        default: true,
        core: true,
        description: { uz: "Tur kategoriyalari (davlatlar, shaharlar)", ru: "Категории туров (страны, города)" },
      },
      orders: {
        label: { uz: "Bronlar", ru: "Бронирования" },
        icon: "📋",
        default: true,
        core: true,
        description: { uz: "Mijozlar bronlarini boshqarish", ru: "Управление бронированиями клиентов" },
      },
      // STANDARD
      users: {
        label: { uz: "Mijozlar", ru: "Клиенты" },
        icon: "👥",
        default: true,
        core: false,
        description: { uz: "Mijozlar bazasi", ru: "База клиентов" },
      },
      ratings: {
        label: { uz: "Sharhlar", ru: "Отзывы" },
        icon: "⭐",
        default: true,
        core: false,
        description: { uz: "Mijozlar sharhlari va baholari", ru: "Отзывы и оценки клиентов" },
      },
      employees: {
        label: { uz: "Xodimlar", ru: "Сотрудники" },
        icon: "👨‍💼",
        default: true,
        core: false,
        description: { uz: "Menejerlar va gidlar", ru: "Менеджеры и гиды" },
      },
      attendance: {
        label: { uz: "Davomat", ru: "Посещаемость" },
        icon: "📅",
        default: true,
        core: false,
        description: { uz: "Xodimlar davomati", ru: "Посещаемость сотрудников" },
      },
      branches: {
        label: { uz: "Filiallar", ru: "Филиалы" },
        icon: "🏢",
        default: true,
        core: false,
        description: { uz: "Filiallar va ofislar", ru: "Филиалы и офисы" },
      },
      salary: {
        label: { uz: "Hisobot & Maosh", ru: "Отчёт и зарплата" },
        icon: "💰",
        default: true,
        core: false,
        description: { uz: "Moliyaviy hisobotlar", ru: "Финансовые отчёты" },
      },
      notifications: {
        label: { uz: "Bildirishnomalar", ru: "Уведомления" },
        icon: "🔔",
        default: true,
        core: false,
        description: { uz: "Tizim bildirishnomalari", ru: "Системные уведомления" },
      },
      telegramBot: {
        label: { uz: "Telegram Bot", ru: "Телеграм Бот" },
        icon: "🤖",
        default: true,
        core: false,
        description: { uz: "Telegram orqali bron va aloqa", ru: "Бронирование и связь через Telegram" },
      },
      aiAgent: {
        label: { uz: "AI Yordamchi", ru: "AI Помощник" },
        icon: "🤖",
        default: false,
        core: false,
        description: { uz: "AI tahlil va maslahat", ru: "AI анализ и рекомендации" },
      },
    },
  },

  // ========================================
  // SALON
  // ========================================
  salon: {
    label: { uz: "Salon", ru: "Салон" },
    icon: "💇",
    description: {
      uz: "Go'zallik saloni, barbershop, SPA",
      ru: "Салон красоты, барбершоп, SPA",
    },
    modules: {
      menu: {
        label: { uz: "Xizmatlar", ru: "Услуги" },
        icon: "✂️",
        default: true,
        core: true,
        description: { uz: "Xizmatlar ro'yxati va narxlar", ru: "Список услуг и цены" },
      },
      categories: {
        label: { uz: "Kategoriyalar", ru: "Категории" },
        icon: "📂",
        default: true,
        core: true,
        description: { uz: "Xizmat kategoriyalari", ru: "Категории услуг" },
      },
      orders: {
        label: { uz: "Buyurtmalar", ru: "Заказы" },
        icon: "📋",
        default: true,
        core: true,
        description: { uz: "Bron va buyurtmalar", ru: "Бронирования и заказы" },
      },
      users: {
        label: { uz: "Mijozlar", ru: "Клиенты" },
        icon: "👥",
        default: true,
        core: false,
        description: { uz: "Mijozlar bazasi", ru: "База клиентов" },
      },
      ratings: {
        label: { uz: "Baholar", ru: "Оценки" },
        icon: "⭐",
        default: true,
        core: false,
        description: { uz: "Mijoz baholari", ru: "Оценки клиентов" },
      },
      employees: {
        label: { uz: "Masterlar", ru: "Мастера" },
        icon: "👨‍🎨",
        default: true,
        core: false,
        description: { uz: "Masterlar boshqaruvi", ru: "Управление мастерами" },
      },
      attendance: {
        label: { uz: "Davomat", ru: "Посещаемость" },
        icon: "📅",
        default: true,
        core: false,
        description: { uz: "Masterlar davomati", ru: "Посещаемость мастеров" },
      },
      branches: {
        label: { uz: "Filiallar", ru: "Филиалы" },
        icon: "🏢",
        default: true,
        core: false,
        description: { uz: "Salon filiallari", ru: "Филиалы салона" },
      },
      salary: {
        label: { uz: "Hisobot & Maosh", ru: "Отчёт и зарплата" },
        icon: "💰",
        default: true,
        core: false,
        description: { uz: "Moliyaviy hisobotlar", ru: "Финансовые отчёты" },
      },
      notifications: {
        label: { uz: "Bildirishnomalar", ru: "Уведомления" },
        icon: "🔔",
        default: true,
        core: false,
        description: { uz: "Tizim bildirishnomalari", ru: "Системные уведомления" },
      },
      telegramBot: {
        label: { uz: "Telegram Bot", ru: "Телеграм Бот" },
        icon: "🤖",
        default: true,
        core: false,
        description: { uz: "Telegram orqali bron", ru: "Бронирование через Telegram" },
      },
      aiAgent: {
        label: { uz: "AI Yordamchi", ru: "AI Помощник" },
        icon: "🤖",
        default: false,
        core: false,
        description: { uz: "AI tahlil va maslahat", ru: "AI анализ и рекомендации" },
      },
    },
  },

  // ========================================
  // DO'KON
  // ========================================
  shop: {
    label: { uz: "Do'kon", ru: "Магазин" },
    icon: "🏪",
    description: {
      uz: "Chakana do'kon, supermarket, onlayn do'kon",
      ru: "Розничный магазин, супермаркет, онлайн-магазин",
    },
    modules: {
      menu: {
        label: { uz: "Mahsulotlar", ru: "Продукты" },
        icon: "📦",
        default: true,
        core: true,
        description: { uz: "Mahsulotlar katalogi", ru: "Каталог продуктов" },
      },
      categories: {
        label: { uz: "Kategoriyalar", ru: "Категории" },
        icon: "📂",
        default: true,
        core: true,
        description: { uz: "Mahsulot kategoriyalari", ru: "Категории продуктов" },
      },
      orders: {
        label: { uz: "Buyurtmalar", ru: "Заказы" },
        icon: "🛒",
        default: true,
        core: true,
        description: { uz: "Buyurtmalar boshqaruvi", ru: "Управление заказами" },
      },
      users: {
        label: { uz: "Mijozlar", ru: "Клиенты" },
        icon: "👥",
        default: true,
        core: false,
        description: { uz: "Mijozlar bazasi", ru: "База клиентов" },
      },
      ratings: {
        label: { uz: "Baholar", ru: "Оценки" },
        icon: "⭐",
        default: true,
        core: false,
        description: { uz: "Mahsulot baholari", ru: "Оценки продуктов" },
      },
      employees: {
        label: { uz: "Xodimlar", ru: "Сотрудники" },
        icon: "👨‍💼",
        default: true,
        core: false,
        description: { uz: "Sotuvchilar va xodimlar", ru: "Продавцы и сотрудники" },
      },
      attendance: {
        label: { uz: "Davomat", ru: "Посещаемость" },
        icon: "📅",
        default: true,
        core: false,
        description: { uz: "Xodimlar davomati", ru: "Посещаемость сотрудников" },
      },
      inventory: {
        label: { uz: "Ombor", ru: "Склад" },
        icon: "📦",
        default: true,
        core: false,
        description: { uz: "Ombor nazorati", ru: "Управление складом" },
      },
      branches: {
        label: { uz: "Filiallar", ru: "Филиалы" },
        icon: "🏢",
        default: true,
        core: false,
        description: { uz: "Do'kon filiallari", ru: "Филиалы магазина" },
      },
      salary: {
        label: { uz: "Hisobot & Maosh", ru: "Отчёт и зарплата" },
        icon: "💰",
        default: true,
        core: false,
        description: { uz: "Moliyaviy hisobotlar", ru: "Финансовые отчёты" },
      },
      notifications: {
        label: { uz: "Bildirishnomalar", ru: "Уведомления" },
        icon: "🔔",
        default: true,
        core: false,
        description: { uz: "Tizim bildirishnomalari", ru: "Системные уведомления" },
      },
      telegramBot: {
        label: { uz: "Telegram Bot", ru: "Телеграм Бот" },
        icon: "🤖",
        default: true,
        core: false,
        description: { uz: "Telegram orqali buyurtma", ru: "Заказы через Telegram" },
      },
      aiAgent: {
        label: { uz: "AI Yordamchi", ru: "AI Помощник" },
        icon: "🤖",
        default: false,
        core: false,
        description: { uz: "AI tahlil va maslahat", ru: "AI анализ и рекомендации" },
      },
    },
  },

  // ========================================
  // KLINIKA
  // ========================================
  clinic: {
    label: { uz: "Klinika", ru: "Клиника" },
    icon: "🏥",
    description: {
      uz: "Tibbiyot markazi, stomatologiya, laboratoriya",
      ru: "Медцентр, стоматология, лаборатория",
    },
    modules: {
      menu: {
        label: { uz: "Xizmatlar", ru: "Услуги" },
        icon: "💊",
        default: true,
        core: true,
        description: { uz: "Tibbiy xizmatlar va narxlar", ru: "Медицинские услуги и цены" },
      },
      categories: {
        label: { uz: "Bo'limlar", ru: "Отделения" },
        icon: "📂",
        default: true,
        core: true,
        description: { uz: "Klinika bo'limlari", ru: "Отделения клиники" },
      },
      orders: {
        label: { uz: "Qabullar", ru: "Приёмы" },
        icon: "📋",
        default: true,
        core: true,
        description: { uz: "Bemorlar qabulini boshqarish", ru: "Управление приёмами пациентов" },
      },
      users: {
        label: { uz: "Bemorlar", ru: "Пациенты" },
        icon: "🧑‍⚕️",
        default: true,
        core: false,
        description: { uz: "Bemorlar bazasi", ru: "База пациентов" },
      },
      ratings: {
        label: { uz: "Sharhlar", ru: "Отзывы" },
        icon: "⭐",
        default: true,
        core: false,
        description: { uz: "Bemorlar sharhlari", ru: "Отзывы пациентов" },
      },
      employees: {
        label: { uz: "Shifokorlar", ru: "Врачи" },
        icon: "👨‍⚕️",
        default: true,
        core: false,
        description: { uz: "Shifokorlar va tibbiy xodimlar", ru: "Врачи и медперсонал" },
      },
      attendance: {
        label: { uz: "Davomat", ru: "Посещаемость" },
        icon: "📅",
        default: true,
        core: false,
        description: { uz: "Xodimlar davomati", ru: "Посещаемость сотрудников" },
      },
      branches: {
        label: { uz: "Filiallar", ru: "Филиалы" },
        icon: "🏢",
        default: true,
        core: false,
        description: { uz: "Klinika filiallari", ru: "Филиалы клиники" },
      },
      salary: {
        label: { uz: "Hisobot & Maosh", ru: "Отчёт и зарплата" },
        icon: "💰",
        default: true,
        core: false,
        description: { uz: "Moliyaviy hisobotlar", ru: "Финансовые отчёты" },
      },
      notifications: {
        label: { uz: "Bildirishnomalar", ru: "Уведомления" },
        icon: "🔔",
        default: true,
        core: false,
        description: { uz: "Tizim bildirishnomalari", ru: "Системные уведомления" },
      },
      telegramBot: {
        label: { uz: "Telegram Bot", ru: "Телеграм Бот" },
        icon: "🤖",
        default: true,
        core: false,
        description: { uz: "Telegram orqali qabul", ru: "Запись через Telegram" },
      },
      aiAgent: {
        label: { uz: "AI Yordamchi", ru: "AI Помощник" },
        icon: "🤖",
        default: false,
        core: false,
        description: { uz: "AI tahlil va maslahat", ru: "AI анализ и рекомендации" },
      },
    },
  },
};

/**
 * Biznes turi uchun default modullarni olish
 * @param {string} type - biznes turi (restaurant, salon, ...)
 * @returns {Object} - { orders: true, menu: true, waiter: false, ... }
 */
function getDefaultModules(type) {
  const bt = BUSINESS_TYPES[type];
  if (!bt) return {};
  const result = {};
  for (const [key, mod] of Object.entries(bt.modules)) {
    result[key] = mod.default;
  }
  return result;
}

/**
 * Biznes turi uchun mavjud modul kalitlarini olish
 * @param {string} type - biznes turi
 * @returns {string[]} - ["orders", "menu", "waiter", ...]
 */
function getAvailableModuleKeys(type) {
  const bt = BUSINESS_TYPES[type];
  if (!bt) return [];
  return Object.keys(bt.modules);
}

/**
 * Core modulmi tekshirish (o'chirib bo'lmaydi)
 * @param {string} type - biznes turi
 * @param {string} moduleKey - modul nomi
 * @returns {boolean}
 */
function isCoreModule(type, moduleKey) {
  const bt = BUSINESS_TYPES[type];
  if (!bt || !bt.modules[moduleKey]) return false;
  return bt.modules[moduleKey].core === true;
}

/**
 * Biznes turi mavjudligini tekshirish
 * @param {string} type
 * @returns {boolean}
 */
function isValidBusinessType(type) {
  return !!BUSINESS_TYPES[type];
}

/**
 * Barcha biznes turlarini olish (superadmin dropdown uchun)
 * @returns {Array} [{ key, label, icon, description, moduleCount }]
 */
function getAllBusinessTypes() {
  return Object.entries(BUSINESS_TYPES).map(([key, bt]) => ({
    key,
    label: bt.label,
    icon: bt.icon,
    description: bt.description,
    moduleCount: Object.keys(bt.modules).length,
  }));
}

/**
 * Biznes turining to'liq modul ma'lumotlari (superadmin panel uchun)
 * @param {string} type
 * @returns {Array} [{ key, label, icon, default, core, description }]
 */
function getModuleDetails(type) {
  const bt = BUSINESS_TYPES[type];
  if (!bt) return [];
  return Object.entries(bt.modules).map(([key, mod]) => ({
    key,
    label: mod.label,
    icon: mod.icon,
    default: mod.default,
    core: mod.core,
    description: mod.description,
  }));
}

module.exports = {
  BUSINESS_TYPES,
  getDefaultModules,
  getAvailableModuleKeys,
  isCoreModule,
  isValidBusinessType,
  getAllBusinessTypes,
  getModuleDetails,
};