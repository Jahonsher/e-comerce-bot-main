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
        label: { uz: "Tur paketlar", ru: "Тур-пакеты" },
        icon: "🗺️",
        default: true,
        core: true,
        description: { uz: "Tur paketlar, yo'nalishlar, narxlar", ru: "Тур-пакеты, направления, цены" },
      },
      categories: {
        label: { uz: "Yo'nalishlar", ru: "Направления" },
        icon: "🌍",
        default: true,
        core: true,
        description: { uz: "Davlatlar, shaharlar, tur turlari", ru: "Страны, города, типы туров" },
      },
      orders: {
        label: { uz: "Bronlar", ru: "Бронирования" },
        icon: "📋",
        default: true,
        core: true,
        description: { uz: "Tur bronlarini boshqarish", ru: "Управление бронированиями туров" },
      },
      // O'ZIGA XOS
      tourCalendar: {
        label: { uz: "Tur kalendari", ru: "Календарь туров" },
        icon: "📅",
        default: true,
        core: false,
        description: { uz: "Turlar jadvali — qachon, qayerga, nechta joy", ru: "Расписание туров — когда, куда, мест" },
      },
      visaTracker: {
        label: { uz: "Viza nazorati", ru: "Контроль виз" },
        icon: "🛂",
        default: true,
        core: false,
        description: { uz: "Mijozlar vizalari holati — kutilmoqda, tayyor, rad etildi", ru: "Статус виз клиентов — ожидание, готово, отказ" },
      },
      hotelBooking: {
        label: { uz: "Mehmonxonalar", ru: "Отели" },
        icon: "🏨",
        default: true,
        core: false,
        description: { uz: "Mehmonxona bronlari va hamkorlar", ru: "Бронирование отелей и партнёры" },
      },
      transportBooking: {
        label: { uz: "Transport", ru: "Транспорт" },
        icon: "🚌",
        default: true,
        core: false,
        description: { uz: "Avtobus, samolyot, transfer bronlari", ru: "Бронирование автобусов, авиа, трансферов" },
      },
      guides: {
        label: { uz: "Gidlar", ru: "Гиды" },
        icon: "🧑‍🏫",
        default: true,
        core: false,
        description: { uz: "Gidlar boshqaruvi va birikma", ru: "Управление гидами и назначение" },
      },
      documents: {
        label: { uz: "Hujjatlar", ru: "Документы" },
        icon: "📄",
        default: true,
        core: false,
        description: { uz: "Shartnomalar, chiptalar, sug'urta", ru: "Договоры, билеты, страховки" },
      },
      // STANDARD
      users: {
        label: { uz: "Mijozlar", ru: "Клиенты" },
        icon: "👥",
        default: true,
        core: false,
        description: { uz: "Mijozlar bazasi va tarix", ru: "База клиентов и история" },
      },
      ratings: {
        label: { uz: "Sharhlar", ru: "Отзывы" },
        icon: "⭐",
        default: true,
        core: false,
        description: { uz: "Tur sharhlari va baholar", ru: "Отзывы и оценки туров" },
      },
      employees: {
        label: { uz: "Xodimlar", ru: "Сотрудники" },
        icon: "👨‍💼",
        default: true,
        core: false,
        description: { uz: "Menejerlar va xodimlar", ru: "Менеджеры и сотрудники" },
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
        description: { uz: "Telegram orqali bron va aloqa", ru: "Бронирование через Telegram" },
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
        description: { uz: "Xizmatlar ro'yxati, narxlar, davomiyligi", ru: "Список услуг, цены, длительность" },
      },
      categories: {
        label: { uz: "Xizmat turlari", ru: "Типы услуг" },
        icon: "📂",
        default: true,
        core: true,
        description: { uz: "Soch, tirnoq, yuz, tana kabi turlar", ru: "Волосы, ногти, лицо, тело" },
      },
      orders: {
        label: { uz: "Bronlar", ru: "Записи" },
        icon: "📋",
        default: true,
        core: true,
        description: { uz: "Mijoz bronlari va uchrashuvlar", ru: "Записи клиентов и встречи" },
      },
      // O'ZIGA XOS
      booking: {
        label: { uz: "Onlayn bron", ru: "Онлайн-запись" },
        icon: "📅",
        default: true,
        core: false,
        description: { uz: "Mijozlar onlayn bron qiladi — vaqt, master, xizmat tanlash", ru: "Онлайн-запись — выбор времени, мастера, услуги" },
      },
      masters: {
        label: { uz: "Masterlar", ru: "Мастера" },
        icon: "👨‍🎨",
        default: true,
        core: false,
        description: { uz: "Masterlar profili, ish grafigi, mutaxassisligi", ru: "Профили мастеров, график, специализация" },
      },
      masterSchedule: {
        label: { uz: "Ish grafigi", ru: "Рабочий график" },
        icon: "🕐",
        default: true,
        core: false,
        description: { uz: "Har bir masterning haftalik ish grafigi", ru: "Еженедельный график каждого мастера" },
      },
      clientHistory: {
        label: { uz: "Mijoz tarixi", ru: "История клиента" },
        icon: "📖",
        default: true,
        core: false,
        description: { uz: "Har bir mijozning barcha tashriflari va xizmatlari", ru: "Все визиты и услуги каждого клиента" },
      },
      loyaltyProgram: {
        label: { uz: "Bonus tizimi", ru: "Бонусная система" },
        icon: "🎁",
        default: false,
        core: false,
        description: { uz: "Chegirmalar, bonuslar, doimiy mijoz kartalari", ru: "Скидки, бонусы, карты постоянных клиентов" },
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
        label: { uz: "Baholar", ru: "Оценки" },
        icon: "⭐",
        default: true,
        core: false,
        description: { uz: "Mijoz baholari", ru: "Оценки клиентов" },
      },
      employees: {
        label: { uz: "Xodimlar", ru: "Сотрудники" },
        icon: "👨‍💼",
        default: true,
        core: false,
        description: { uz: "Administrator va xodimlar", ru: "Администраторы и сотрудники" },
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
        description: { uz: "Eslatmalar va bildirishnomalar", ru: "Напоминания и уведомления" },
      },
      telegramBot: {
        label: { uz: "Telegram Bot", ru: "Телеграм Бот" },
        icon: "🤖",
        default: true,
        core: false,
        description: { uz: "Telegram orqali bron", ru: "Запись через Telegram" },
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
        label: { uz: "Mahsulotlar", ru: "Товары" },
        icon: "📦",
        default: true,
        core: true,
        description: { uz: "Mahsulotlar katalogi, narxlar, shtrixkod", ru: "Каталог товаров, цены, штрихкоды" },
      },
      categories: {
        label: { uz: "Kategoriyalar", ru: "Категории" },
        icon: "📂",
        default: true,
        core: true,
        description: { uz: "Mahsulot kategoriyalari", ru: "Категории товаров" },
      },
      orders: {
        label: { uz: "Sotuvlar", ru: "Продажи" },
        icon: "🛒",
        default: true,
        core: true,
        description: { uz: "Sotuv tarixi va kassir paneli", ru: "История продаж и панель кассира" },
      },
      // O'ZIGA XOS
      inventory: {
        label: { uz: "Ombor", ru: "Склад" },
        icon: "🏭",
        default: true,
        core: true,
        description: { uz: "Ombor nazorati, qoldiqlar, kam bo'lganda ogohlantirish", ru: "Контроль склада, остатки, оповещения" },
      },
      suppliers: {
        label: { uz: "Yetkazib beruvchilar", ru: "Поставщики" },
        icon: "🚚",
        default: true,
        core: false,
        description: { uz: "Yetkazib beruvchilar bazasi, buyurtmalar, qarzdorlik", ru: "База поставщиков, заказы, задолженности" },
      },
      priceManagement: {
        label: { uz: "Narx boshqaruvi", ru: "Управление ценами" },
        icon: "💲",
        default: true,
        core: false,
        description: { uz: "Ulgurji/chakana narxlar, chegirmalar, aksiyalar", ru: "Оптовые/розничные цены, скидки, акции" },
      },
      returns: {
        label: { uz: "Qaytarishlar", ru: "Возвраты" },
        icon: "↩️",
        default: true,
        core: false,
        description: { uz: "Mahsulot qaytarish va almashtirish", ru: "Возврат и обмен товаров" },
      },
      cashRegister: {
        label: { uz: "Kassa", ru: "Касса" },
        icon: "💵",
        default: true,
        core: false,
        description: { uz: "Kassa operatsiyalari, naqd/karta/QR to'lov", ru: "Кассовые операции, наличные/карта/QR" },
      },
      debtTracker: {
        label: { uz: "Qarzlar", ru: "Долги" },
        icon: "📝",
        default: false,
        core: false,
        description: { uz: "Mijoz va yetkazib beruvchi qarzlari", ru: "Долги клиентов и поставщиков" },
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
        label: { uz: "Baholar", ru: "Оценки" },
        icon: "⭐",
        default: true,
        core: false,
        description: { uz: "Mahsulot baholari", ru: "Оценки товаров" },
      },
      employees: {
        label: { uz: "Xodimlar", ru: "Сотрудники" },
        icon: "👨‍💼",
        default: true,
        core: false,
        description: { uz: "Sotuvchilar va kassirlar", ru: "Продавцы и кассиры" },
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
        description: { uz: "Tibbiy xizmatlar, narxlar, muddatlar", ru: "Медуслуги, цены, сроки" },
      },
      categories: {
        label: { uz: "Bo'limlar", ru: "Отделения" },
        icon: "📂",
        default: true,
        core: true,
        description: { uz: "Klinika bo'limlari — terapiya, stomatologiya, lab", ru: "Отделения — терапия, стоматология, лаб" },
      },
      orders: {
        label: { uz: "Qabullar", ru: "Приёмы" },
        icon: "📋",
        default: true,
        core: true,
        description: { uz: "Bemorlar qabulini boshqarish", ru: "Управление приёмами пациентов" },
      },
      // O'ZIGA XOS
      patientCard: {
        label: { uz: "Bemor kartasi", ru: "Карта пациента" },
        icon: "🏥",
        default: true,
        core: false,
        description: { uz: "Bemor tibbiy kartasi — diagnozlar, dorilar, allergiya, tarix", ru: "Медкарта пациента — диагнозы, лекарства, аллергии, история" },
      },
      appointments: {
        label: { uz: "Navbat tizimi", ru: "Система очереди" },
        icon: "🔢",
        default: true,
        core: false,
        description: { uz: "Elektron navbat, eslatma, onlayn yozilish", ru: "Электронная очередь, напоминания, онлайн-запись" },
      },
      prescriptions: {
        label: { uz: "Retseptlar", ru: "Рецепты" },
        icon: "💉",
        default: true,
        core: false,
        description: { uz: "Shifokor retseptlari, dori tayinlash", ru: "Рецепты врача, назначение лекарств" },
      },
      labResults: {
        label: { uz: "Tahlillar", ru: "Анализы" },
        icon: "🔬",
        default: true,
        core: false,
        description: { uz: "Lab natijalar, fayllar, tarix", ru: "Результаты анализов, файлы, история" },
      },
      doctorSchedule: {
        label: { uz: "Shifokor grafigi", ru: "График врачей" },
        icon: "🕐",
        default: true,
        core: false,
        description: { uz: "Har bir shifokorning qabul grafigi", ru: "График приёма каждого врача" },
      },
      medicalHistory: {
        label: { uz: "Kasallik tarixi", ru: "История болезни" },
        icon: "📖",
        default: true,
        core: false,
        description: { uz: "Bemorning to'liq kasallik tarixi", ru: "Полная история болезни пациента" },
      },
      // STANDARD
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
        description: { uz: "Eslatmalar va bildirishnomalar", ru: "Напоминания и уведомления" },
      },
      telegramBot: {
        label: { uz: "Telegram Bot", ru: "Телеграм Бот" },
        icon: "🤖",
        default: true,
        core: false,
        description: { uz: "Telegram orqali yozilish", ru: "Запись через Telegram" },
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