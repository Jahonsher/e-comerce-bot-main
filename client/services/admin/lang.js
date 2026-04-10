/**
 * ServiX — Til tizimi (i18n)
 * 
 * t('key') — tarjima olish
 * setLang('uz') — til o'zgartirish
 * 
 * admin.js dan oldin yuklanishi kerak:
 * <script src="/static/lang.js"></script>
 */

var _lang = localStorage.getItem('servix_lang') || 'uz';

var LANGS = {
  uz: {
    // SIDEBAR
    nav_main: "Asosiy", nav_dashboard: "Dashboard", nav_orders: "Buyurtmalar",
    nav_management: "Boshqaruv", nav_products: "Mahsulotlar", nav_categories: "Kategoriyalar",
    nav_notifications: "Bildirishnomalar", nav_ratings: "Reytinglar", nav_users: "Foydalanuvchilar",
    nav_staff: "ISHCHILAR", nav_branches: "Filiallar", nav_employees: "Ishchilar",
    nav_attendance: "Davomat", nav_reports: "Hisobot & Maosh",
    nav_service: "XIZMAT", nav_waiters: "Ofitsiantlar", nav_chefs: "Oshpazlar",
    btn_logout: "Chiqish",

    // DASHBOARD
    dash_title: "Dashboard", dash_sub: "Bugungi holat va statistika",
    dash_today: "Bugun", dash_yesterday: "Kecha", dash_week: "Hafta",
    dash_month: "Oy", dash_prevMonth: "O'tgan oy", dash_show: "Ko'rsatish",
    dash_orders: "Buyurtmalar", dash_revenue: "Daromad",
    dash_online: "Online / Restoranda", dash_avg: "O'rtacha chek",
    dash_rating: "Reyting", dash_users: "Foydalanuvchilar",
    dash_trend: "Kunlik trend", dash_type: "Buyurtma turi",
    dash_top: "Ko'p sotilgan (TOP 10)", dash_recent: "Oxirgi buyurtmalar",

    // BUYURTMALAR
    page_orders: "Buyurtmalar", page_orders_sub: "Barcha buyurtmalar",
    ord_new: "Yangi", ord_accepted: "Qabul qilindi", ord_rejected: "Bekor qilindi",
    ord_ready: "Tayyor", ord_cooking: "Tayyorlanmoqda", ord_all: "Barchasi",
    ord_client: "Mijoz", ord_products: "Mahsulotlar", ord_total: "Jami",
    ord_table: "Stol", ord_type: "Tur", ord_status: "Status", ord_time: "Vaqt", ord_action: "Amal",
    ord_online: "Online", ord_dinein: "Restoran", ord_no_orders: "Buyurtmalar yo'q",

    // MAHSULOTLAR
    page_menu: "Mahsulotlar boshqaruvi", page_menu_sub: "Mahsulotlarni qo'shish, tahrirlash, o'chirish",
    prod_add: "+ Mahsulot qo'shish", prod_edit: "Tahrirlash", prod_new: "Yangi mahsulot",
    prod_name: "Nomi", prod_name_ru: "Nomi (ru)", prod_price: "Narxi",
    prod_category: "Kategoriya", prod_image: "Rasm URL", prod_type: "Turi",
    prod_hidden: "YASHIRILGAN", prod_confirm_delete: "Mahsulotni o'chirishni tasdiqlaysizmi?",

    // KATEGORIYALAR
    page_categories: "Kategoriyalar", page_categories_sub: "Filtr tugmalarini boshqaring",
    cat_add: "+ Kategoriya qo'shish", cat_edit: "Kategoriyani tahrirlash",
    cat_new: "Yangi kategoriya", cat_name: "Nomi", cat_name_ru: "Nomi (ru)", cat_emoji: "Emoji",

    // ISHCHILAR
    page_employees: "Ishchilar", page_employees_sub: "Xodimlar boshqaruvi",
    emp_add: "+ Ishchi qo'shish", emp_new: "Yangi ishchi", emp_edit: "Ishchini tahrirlash",
    emp_name: "Ism", emp_phone: "Telefon", emp_position: "Lavozim", emp_salary: "Maosh",
    emp_branch: "Filial", emp_login: "Login", emp_password: "Parol",
    emp_work_start: "Ish boshlanishi", emp_work_end: "Ish tugashi", emp_weekly_off: "Dam olish kuni",
    emp_select_branch: "— Filial tanlang —", emp_branch_warn: "Avval Filiallar bo'limidan filial qo'shing",
    emp_no_branch: "Filial tanlanmagan!", emp_confirm_delete: "Ishchini o'chirishni tasdiqlaysizmi?",
    emp_no_employees: "Ishchilar yo'q",

    // FILIALLAR
    page_branches: "Filiallar", page_branches_sub: "Filiallar boshqaruvi",
    br_add: "+ Filial qo'shish", br_new: "Yangi filial", br_edit: "Filial tahrirlash",
    br_name: "Filial nomi", br_address: "Manzil", br_phone: "Telefon",
    br_no_name: "Filial nomi kiritilmagan", br_confirm_delete: "Filialni o'chirishni tasdiqlaysizmi?",

    // DAVOMAT
    page_attendance: "Davomat", page_attendance_sub: "Bugungi davomat",
    att_total: "Jami", att_present: "Keldi", att_late: "Kechikdi", att_absent: "Kelmadi",
    att_manual: "Qo'lda belgilash", att_status: "Holat",
    att_checkin: "Keldi", att_checkout: "Ketdi", att_late_min: "Kechikish",

    // HISOBOT
    page_reports: "Hisobot & Maosh",
    rep_period: "Davr", rep_branch: "Filial", rep_all: "Barchasi",
    rep_working_days: "Ish kunlari", rep_present: "Keldi", rep_absent: "Kelmadi",
    rep_late: "Kechikdi", rep_hours: "Soat", rep_salary: "Maosh", rep_attendance: "Davomat",
    rep_total_salary: "Jami maosh fondi", rep_employee: "Ishchi",

    // REYTINGLAR
    page_ratings: "Reytinglar", page_ratings_sub: "Mijozlar baholari",
    rat_client: "Mijoz", rat_products: "Mahsulotlar", rat_score: "Baho", rat_time: "Vaqt",

    // FOYDALANUVCHILAR
    page_users: "Foydalanuvchilar", page_users_sub: "Ro'yxatdan o'tgan mijozlar",
    usr_name: "Ism", usr_phone: "Telefon", usr_orders: "Buyurtmalar", usr_joined: "Qo'shildi",

    // OFITSIANTLAR
    page_waiters: "Ofitsiantlar",
    wt_add: "+ Ofitsiant qo'shish", wt_new: "Yangi ofitsiant", wt_edit: "Ofitsiantni tahrirlash",
    wt_tables: "Stollar", wt_confirm_delete: "Ofitsiantni o'chirishni tasdiqlaysizmi?",
    wt_hint: "Ofitsiant — /waiter/ panelidan foydalanadi.",
    wt_no_waiters: "Ofitsiantlar yo'q",

    // OSHPAZLAR
    page_chefs: "Oshpazlar",
    ch_add: "+ Oshpaz qo'shish", ch_new: "Yangi oshpaz", ch_edit: "Oshpazni tahrirlash",
    ch_confirm_delete: "Oshpazni o'chirishni tasdiqlaysizmi?",
    ch_hint: "Oshpaz — /kitchen/ panelidan foydalanadi.",
    ch_no_chefs: "Oshpazlar yo'q",

    // BILDIRISHNOMALAR
    page_notifications: "Bildirishnomalar", page_notifications_sub: "Tizim bildirishnomalari",
    notif_mark_read: "Barchasini o'qilgan deb belgilash", notif_clear: "Tozalash",
    notif_empty: "Bildirishnomalar yo'q",

    // UMUMIY
    all: "Barchasi", save: "Saqlash", cancel: "Bekor", delete: "O'chirish",
    edit: "Tahrirlash", add: "+ Qo'shish", search: "Qidirish", loading: "Yuklanmoqda...",
    saving: "Saqlanmoqda...", confirm_delete: "O'chirilsinmi?",
    no_data: "Ma'lumot yo'q", total: "Jami", name: "Nomi", price: "Narxi",
    status: "Holat", date: "Sana", actions: "Amallar", confirm: "Tasdiqlash", close: "Yopish",
    som: "so'm", ta: "ta", pieces: "dona", minute: "daqiqa", hour: "soat",
    name_required: "Nom majburiy", server_error: "Server javob bermadi", load_error: "Yuklanmadi",

    // Orders qo'shimcha
    ord_list: "Ro'yxat", ord_change: "O'zgartir",

    // Products qo'shimcha
    prod_add: "+ Mahsulot qo'shish",
    prod_edit_title: "Mahsulotni tahrirlash",
    prod_new: "Yangi mahsulot",
    prod_hidden: "Yashirilgan",
    prod_name_price_required: "Nom va narx majburiy",

    // Categories qo'shimcha
    cat_drag_hint: "tartibini o'zgartirish uchun sudrang",
    cat_order: "Tartib",
    cat_visible: "Ko'rinadi",

    // Ratings qo'shimcha
    rat_rated_orders: "Baholangan buyurtmalar",

    // Users qo'shimcha
    usr_name: "Ism", usr_phone: "Telefon",

    // Employees qo'shimcha
    emp_active: "Faol", emp_inactive: "Faol emas",
    emp_work_time: "Ish vaqti",
    emp_name_required: "Ism kiritilmagan",
    emp_login_required: "Login kiritilmagan",
    emp_password_required: "Parol kiritilmagan",
    emp_photo_label: "Ishchi rasmi (Yuz ID uchun)",
    emp_upload_photo: "Rasm yuklash", emp_camera: "Kamera",
    emp_photo_loaded: "Rasm yuklangan",

    // Attendance qo'shimcha
    att_dayoff: "Dam", att_working: "Ishlayapti",
    att_checkin: "Keldi", att_checkout: "Ketdi", att_worked: "Ishlagan",
    att_manual: "Qo'lda kiritish",
    att_came_time: "Kelgan vaqt", att_left_time: "Ketgan vaqt", att_note: "Izoh",

    // Report qo'shimcha
    rep_error: "Hisobot yuklanmadi",
    rep_module_disabled: "Hisobot moduli yoqilmagan",

    // AI
    ai_title: "AI Yordamchi", ai_placeholder: "Har qanday savol bering...",
    ai_send: "Yuborish", ai_download: "Excelga yuklab olish", ai_clear: "Tozalash",
    ai_welcome: "Salom! Men ServiX AI yordamchisiman.",
    ai_cleared: "Chat tozalandi. Yangi savol bering!",
    ai_error: "Server bilan aloqa uzildi",
  },

  ru: {
    // SIDEBAR
    nav_main: "Основное", nav_dashboard: "Панель", nav_orders: "Заказы",
    nav_management: "Управление", nav_products: "Продукты", nav_categories: "Категории",
    nav_notifications: "Уведомления", nav_ratings: "Рейтинги", nav_users: "Пользователи",
    nav_staff: "СОТРУДНИКИ", nav_branches: "Филиалы", nav_employees: "Сотрудники",
    nav_attendance: "Посещаемость", nav_reports: "Отчёт и зарплата",
    nav_service: "СЕРВИС", nav_waiters: "Официанты", nav_chefs: "Повара",
    btn_logout: "Выход",

    // DASHBOARD
    dash_title: "Панель управления", dash_sub: "Текущее состояние и статистика",
    dash_today: "Сегодня", dash_yesterday: "Вчера", dash_week: "Неделя",
    dash_month: "Месяц", dash_prevMonth: "Прошлый месяц", dash_show: "Показать",
    dash_orders: "Заказы", dash_revenue: "Доход",
    dash_online: "Онлайн / В ресторане", dash_avg: "Средний чек",
    dash_rating: "Рейтинг", dash_users: "Пользователи",
    dash_trend: "Дневной тренд", dash_type: "Тип заказа",
    dash_top: "Популярные (ТОП 10)", dash_recent: "Последние заказы",

    // ЗАКАЗЫ
    page_orders: "Заказы", page_orders_sub: "Все заказы",
    ord_new: "Новый", ord_accepted: "Принят", ord_rejected: "Отменён",
    ord_ready: "Готов", ord_cooking: "Готовится", ord_all: "Все",
    ord_client: "Клиент", ord_products: "Продукты", ord_total: "Итого",
    ord_table: "Стол", ord_type: "Тип", ord_status: "Статус", ord_time: "Время", ord_action: "Действие",
    ord_online: "Онлайн", ord_dinein: "Ресторан", ord_no_orders: "Нет заказов",

    // ПРОДУКТЫ
    page_menu: "Управление продуктами", page_menu_sub: "Добавление, редактирование, удаление",
    prod_add: "+ Добавить продукт", prod_edit: "Редактировать", prod_new: "Новый продукт",
    prod_name: "Название", prod_name_ru: "Название (ру)", prod_price: "Цена",
    prod_category: "Категория", prod_image: "URL изображения", prod_type: "Тип",
    prod_hidden: "СКРЫТ", prod_confirm_delete: "Подтвердите удаление продукта",

    // КАТЕГОРИИ
    page_categories: "Категории", page_categories_sub: "Управление фильтрами",
    cat_add: "+ Добавить категорию", cat_edit: "Редактировать категорию",
    cat_new: "Новая категория", cat_name: "Название", cat_name_ru: "Название (ру)", cat_emoji: "Эмодзи",

    // СОТРУДНИКИ
    page_employees: "Сотрудники", page_employees_sub: "Управление сотрудниками",
    emp_add: "+ Добавить сотрудника", emp_new: "Новый сотрудник", emp_edit: "Редактировать",
    emp_name: "Имя", emp_phone: "Телефон", emp_position: "Должность", emp_salary: "Зарплата",
    emp_branch: "Филиал", emp_login: "Логин", emp_password: "Пароль",
    emp_work_start: "Начало работы", emp_work_end: "Конец работы", emp_weekly_off: "Выходной",
    emp_select_branch: "— Выберите филиал —", emp_branch_warn: "Сначала добавьте филиал",
    emp_no_branch: "Филиал не выбран!", emp_confirm_delete: "Подтвердите удаление сотрудника",
    emp_no_employees: "Нет сотрудников",

    // ФИЛИАЛЫ
    page_branches: "Филиалы", page_branches_sub: "Управление филиалами",
    br_add: "+ Добавить филиал", br_new: "Новый филиал", br_edit: "Редактировать филиал",
    br_name: "Название", br_address: "Адрес", br_phone: "Телефон",
    br_no_name: "Название не указано", br_confirm_delete: "Подтвердите удаление филиала",

    // ПОСЕЩАЕМОСТЬ
    page_attendance: "Посещаемость", page_attendance_sub: "Сегодняшняя посещаемость",
    att_total: "Всего", att_present: "Пришёл", att_late: "Опоздал", att_absent: "Отсутствует",
    att_manual: "Отметить вручную", att_status: "Статус",
    att_checkin: "Пришёл", att_checkout: "Ушёл", att_late_min: "Опоздание",

    // ОТЧЁТ
    page_reports: "Отчёт и зарплата",
    rep_period: "Период", rep_branch: "Филиал", rep_all: "Все",
    rep_working_days: "Рабочие дни", rep_present: "Пришёл", rep_absent: "Отсутствовал",
    rep_late: "Опоздал", rep_hours: "Часы", rep_salary: "Зарплата", rep_attendance: "Посещаемость",
    rep_total_salary: "Общий фонд зарплаты", rep_employee: "Сотрудник",

    // РЕЙТИНГИ
    page_ratings: "Рейтинги", page_ratings_sub: "Оценки клиентов",
    rat_client: "Клиент", rat_products: "Продукты", rat_score: "Оценка", rat_time: "Время",

    // ПОЛЬЗОВАТЕЛИ
    page_users: "Пользователи", page_users_sub: "Зарегистрированные клиенты",
    usr_name: "Имя", usr_phone: "Телефон", usr_orders: "Заказы", usr_joined: "Присоединился",

    // ОФИЦИАНТЫ
    page_waiters: "Официанты",
    wt_add: "+ Добавить официанта", wt_new: "Новый официант", wt_edit: "Редактировать",
    wt_tables: "Столы", wt_confirm_delete: "Подтвердите удаление официанта",
    wt_hint: "Официант использует панель /waiter/.",
    wt_no_waiters: "Нет официантов",

    // ПОВАРА
    page_chefs: "Повара",
    ch_add: "+ Добавить повара", ch_new: "Новый повар", ch_edit: "Редактировать",
    ch_confirm_delete: "Подтвердите удаление повара",
    ch_hint: "Повар использует панель /kitchen/.",
    ch_no_chefs: "Нет поваров",

    // УВЕДОМЛЕНИЯ
    page_notifications: "Уведомления", page_notifications_sub: "Системные уведомления",
    notif_mark_read: "Отметить все прочитанными", notif_clear: "Очистить",
    notif_empty: "Нет уведомлений",

    // ОБЩЕЕ
    all: "Все", save: "Сохранить", cancel: "Отмена", delete: "Удалить",
    edit: "Редактировать", add: "+ Добавить", search: "Поиск", loading: "Загрузка...",
    saving: "Сохранение...", confirm_delete: "Удалить?",
    no_data: "Нет данных", total: "Итого", name: "Название", price: "Цена",
    status: "Статус", date: "Дата", actions: "Действия", confirm: "Подтвердить", close: "Закрыть",
    som: "сум", ta: "шт", pieces: "шт", minute: "минута", hour: "час",
    name_required: "Название обязательно", server_error: "Сервер не отвечает", load_error: "Ошибка загрузки",

    // Orders доп
    ord_list: "Список", ord_change: "Изменить",

    // Products доп
    prod_add: "+ Добавить продукт",
    prod_edit_title: "Редактировать продукт",
    prod_new: "Новый продукт",
    prod_hidden: "Скрыт",
    prod_name_price_required: "Название и цена обязательны",

    // Categories доп
    cat_drag_hint: "перетащите для изменения порядка",
    cat_order: "Порядок",
    cat_visible: "Видимый",

    // Ratings доп
    rat_rated_orders: "Оценённые заказы",

    // Users доп
    usr_name: "Имя", usr_phone: "Телефон",

    // Employees доп
    emp_active: "Активен", emp_inactive: "Неактивен",
    emp_work_time: "Рабочее время",
    emp_name_required: "Имя не указано",
    emp_login_required: "Логин не указан",
    emp_password_required: "Пароль не указан",
    emp_photo_label: "Фото сотрудника (Face ID)",
    emp_upload_photo: "Загрузить фото", emp_camera: "Камера",
    emp_photo_loaded: "Фото загружено",

    // Attendance доп
    att_dayoff: "Выходной", att_working: "На работе",
    att_checkin: "Пришёл", att_checkout: "Ушёл", att_worked: "Отработал",
    att_manual: "Ручной ввод",
    att_came_time: "Время прихода", att_left_time: "Время ухода", att_note: "Заметка",

    // Report доп
    rep_error: "Ошибка загрузки отчёта",
    rep_module_disabled: "Модуль отчётов не активирован",

    // AI
    ai_title: "AI Помощник", ai_placeholder: "Задайте любой вопрос...",
    ai_send: "Отправить", ai_download: "Скачать Excel", ai_clear: "Очистить",
    ai_welcome: "Здравствуйте! Я AI помощник ServiX.",
    ai_cleared: "Чат очищен. Задайте новый вопрос!",
    ai_error: "Потеряна связь с сервером",
  },
};

// ===== t() — tarjima olish =====
function t(key) {
  return (LANGS[_lang] && LANGS[_lang][key]) || (LANGS.uz && LANGS.uz[key]) || key;
}

// ===== setLang() — til o'zgartirish =====
function setLang(lang) {
  _lang = lang;
  localStorage.setItem('servix_lang', lang);

  // Til tugmalari
  var uzBtn = document.getElementById('langUz');
  var ruBtn = document.getElementById('langRu');
  if (uzBtn && ruBtn) {
    uzBtn.style.background = lang === 'uz' ? 'rgba(6,182,212,0.15)' : 'transparent';
    uzBtn.style.color = lang === 'uz' ? '#22d3ee' : '#64748b';
    ruBtn.style.background = lang === 'ru' ? 'rgba(6,182,212,0.15)' : 'transparent';
    ruBtn.style.color = lang === 'ru' ? '#22d3ee' : '#64748b';
  }

  // data-i18n elementlarni yangilash (sidebar)
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var val = t(key);
    if (val !== key) el.textContent = val;
  });

  // AI chat
  var aiInput = document.getElementById('aiInput');
  if (aiInput) aiInput.placeholder = t('ai_placeholder');
  var aiSendBtn = document.getElementById('aiSendBtn');
  if (aiSendBtn) aiSendBtn.textContent = t('ai_send');

  // Hozirgi sahifani qayta yuklash (content tilini yangilash uchun)
  if (typeof _currentPage !== 'undefined' && _currentPage && typeof clearPageCache === 'function') {
    clearPageCache(_currentPage);
    if (typeof showPage === 'function') showPage(_currentPage);
  }
}