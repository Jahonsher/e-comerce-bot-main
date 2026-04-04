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
  // KELAJAKDAGI BIZNES TURLARI (SHABLON)
  // ========================================
  //
  // salon: {
  //   label: { uz: "Salon", ru: "Салон" },
  //   icon: "💇",
  //   description: { uz: "Go'zallik saloni, barbershop", ru: "Салон красоты, барбершоп" },
  //   modules: {
  //     services: { label: { uz: "Xizmatlar", ru: "Услуги" }, icon: "✂️", default: true, core: true },
  //     booking: { label: { uz: "Bron", ru: "Бронирование" }, icon: "📅", default: true, core: true },
  //     masters: { label: { uz: "Masterlar", ru: "Мастера" }, icon: "👨‍🎨", default: true, core: true },
  //     clients: { label: { uz: "Mijozlar", ru: "Клиенты" }, icon: "👥", default: true, core: false },
  //     employees: { ... }, attendance: { ... }, branches: { ... }, notifications: { ... },
  //   },
  // },
  //
  // shop: {
  //   label: { uz: "Do'kon", ru: "Магазин" },
  //   icon: "🏪",
  //   modules: { ... }
  // },
  //
  // clinic: {
  //   label: { uz: "Klinika", ru: "Клиника" },
  //   icon: "🏥",
  //   modules: { ... }
  // },
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