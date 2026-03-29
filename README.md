# ServiX — To'liq Platforma Hujjati

## Umumiy ko'rinish

**ServiX** — restoran va bizneslar uchun multi-tenant SaaS platformasi. Telegram bot, web buyurtma, ofitsiant tizimi, oshxona paneli, ishchi boshqaruvi, davomat, inventar va boshqa ko'plab modullarni o'z ichiga oladi.

**Texnologiyalar:** Node.js, Express, MongoDB (Mongoose), Socket.IO, Telegram Bot API, JWT, bcrypt, Face++ (yuz tanish), vanilla JS frontend

**Hosting:** Backend — Railway, Frontend panellar — Vercel

---

## Panellar va URL'lar

| Panel | URL | Maqsad |
|---|---|---|
| **Admin** | https://e-comerce-bot-main.vercel.app/ | Restoran egasi — menyu, buyurtmalar, ishchilar, statistika |
| **Superadmin** | https://e-comerce-bot-main-superadmin.vercel.app/ | Platforma boshqaruvi — restoranlar CRUD, obuna, modullar |
| **Ishchi** | https://e-comerce-bot-main-employee.vercel.app/ | Ishchi — davomat, check-in/out, yuz tanish |
| **Ofitsiant** | https://servix-ofitsant.vercel.app/ | Ofitsiant — shotlar, buyurtma qo'shish, oshpazga yuborish |
| **Oshxona** | https://servix-oshxona.vercel.app/ | Oshpaz — buyurtmalar oqimi, tayyorlash, tayyor qilish |
| **Webapp** | Telegram bot orqali ochiladi | Mijoz — menyu ko'rish, buyurtma berish (online/dine-in) |

**Backend API:** `https://e-comerce-bot-main-production.up.railway.app`

---

## Loyiha fayl tuzilmasi

```
e-comerce-bot-main/
├── backend/
│   ├── server.js          — Asosiy server (2866 qator) — barcha model, API, Socket.IO
│   ├── package.json       — Dependencies (express, mongoose, socket.io, telegram, jwt...)
│   ├── models/            — (Eski, ishlatilmaydi — hamma narsa server.js da)
│   ├── routes/            — (Eski, ishlatilmaydi)
│   └── public/app.js      — Webapp frontend JS
│
├── admin/
│   ├── index.html         — Admin panel UI (Tailwind + inline styles)
│   └── admin.js           — Admin logika (2072 qator)
│
├── superadmin/
│   ├── index.html         — Superadmin panel UI
│   └── superadmin.js      — Superadmin logika
│
├── employee/
│   ├── index.html         — Ishchi panel UI
│   └── app.js             — Ishchi logika (check-in/out, yuz tanish)
│
├── waiter/
│   ├── index.html         — Ofitsiant panel UI (dark theme, mobile-first)
│   └── app.js             — Ofitsiant logika + Socket.IO client (492 qator)
│
├── kitchen/
│   ├── index.html         — Oshxona panel UI (3 ustunli layout)
│   └── app.js             — Oshxona logika + Socket.IO client (281 qator)
│
├── frond-end/
│   ├── index.html         — Webapp (Telegram WebApp) — mijoz buyurtma beradi
│   └── app.js             — Webapp logika (ko'p tilli: UZ/RU)
│
├── gavali/                — Gavali shirinliklar landing page
│   └── index.html
│
└── aqsotour/              — AqsoTour sayohat landing page
    ├── index.html
    └── app.js
```

---

## Ma'lumotlar modeli (MongoDB)

### User
```
telegramId, first_name, last_name, username, phone, restaurantId
Index: { telegramId + restaurantId } unique
```

### Order
```
telegramId, items[], total, userInfo, orderType (online/dine_in),
tableNumber, status (Yangi/Qabul/Rad), rating, ratingComment, restaurantId
```

### Product
```
id, name, name_ru, price, category, image, active, restaurantId
Index: { id + restaurantId } unique
```

### Category
```
name, name_ru, emoji, order, active, restaurantId
```

### Restaurant
```
restaurantId (unique), name, blocked, blockReason
```

### Admin
```
username (unique), password (hashed), restaurantName, restaurantId,
botToken, chefId, phone, address, webappUrl, role (admin/superadmin),
active, blockReason, subscriptionEnd,
— Sayt sozlamalari: botUsername, adminTg, metro, workHours, heroImage, theme...
— Modullar: modules { orders, menu, categories, ratings, users, employees,
             attendance, empReport, branches, broadcast, notifications,
             waiter, kitchen }
```

### Employee
```
name, phone, position, username (unique), password (hashed),
restaurantId, role (employee/waiter/chef), tables[] (ofitsiant uchun),
workStart, workEnd, salary, telegramId, branchId, weeklyOff,
photo (base64), faceDescriptor[], active
```

### Shot (Ofitsiant tizimi)
```
restaurantId, tableNumber, waiterId (→Employee), waiterName,
status (open/closed),
items: [{ name, name_ru, price, quantity, addedBy (customer/waiter),
          sentToKitchen, kitchenStatus (pending/cooking/ready), addedAt }],
total, customerTelegramId, openedAt, closedAt
Index: { restaurantId + status }, { restaurantId + tableNumber + status }
```

### Branch
```
name, restaurantId, address, lat, lng, radius, active
```

### Attendance
```
employeeId (→Employee), restaurantId, date, checkIn, checkOut,
checkInPhoto, checkInLat, checkInLng, lateMinutes, totalMinutes,
status, isWeeklyOff, overtimeMinutes, note
```

### Inventory
```
productId (→Product), restaurantId, productName, unit, currentStock,
minStock, maxStock, costPrice, lastRestocked, active
```

### InventoryLog
```
inventoryId (→Inventory), restaurantId, type (in/out/adjust), quantity, note, createdBy
```

### Notification
```
restaurantId, type, title, message, icon, read, targetRole, targetId, data
```

### AuditLog
```
action, actor, actorRole, restaurantId, details, ip
```

### Payment
```
restaurantId, amount, type (subscription/custom/refund), method, days, note, createdBy
```

### SANotification (superadmin uchun)
```
type, title, message, icon, read, data
```

---

## Autentifikatsiya tizimi

Barcha panellar **JWT** token ishlatadi. Token `Authorization: Bearer <token>` header orqali yuboriladi.

| Panel | Login endpoint | Middleware | Token payload |
|---|---|---|---|
| Admin | `POST /admin/login` | `authMiddleware` | id, username, role, restaurantName, restaurantId |
| Superadmin | `POST /superadmin/login` | `superMiddleware` | id, username, role:"superadmin" |
| Ishchi | `POST /employee/login` | `empMiddleware` | id, restaurantId, name |
| Ofitsiant | `POST /waiter/login` | `waiterMiddleware` | id, restaurantId, name, role:"waiter" |
| Oshpaz | `POST /kitchen/login` | `kitchenMiddleware` | id, restaurantId, name, role:"chef" |

**Muhim qoidalar:**
- Bitta login/parol — employee, waiter va chef barchasi Employee jadvalida saqlanadi
- `role` farqlaydi: `employee` (oddiy ishchi), `waiter` (ofitsiant), `chef` (oshpaz)
- Ofitsiant login qilganda `modules.waiter === true` tekshiriladi
- Oshpaz login qilganda `modules.kitchen === true` tekshiriladi
- Restoran bloklangan bo'lsa — barcha panellar bloklanadi

---

## Socket.IO real-time tizimi

### Server sozlash
```javascript
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" }, transports: ["websocket", "polling"] });
```

### Room tuzilmasi
Har bir restoran + panel = alohida room: `{restaurantId}:{panel}`

Masalan: `imperial:waiter`, `imperial:kitchen`, `imperial:customer`

### Ulanish jarayoni
1. Client `io(API)` bilan ulanadi
2. `socket.emit("join", { token, panel })` yuboradi
3. Server token ni verify qiladi → `socket.join(restaurantId + ":" + panel)`

### Eventlar

| Event | Kim yuboradi | Kim oladi | Ma'lumot |
|---|---|---|---|
| `new-order` | Server (mijoz buyurtma bersa) | Waiter, Kitchen | Shot object |
| `shot-updated` | Server | Waiter, Kitchen, Customer | Yangilangan shot |
| `to-kitchen` | Server (ofitsiant yuborsa) | Kitchen | { shotId, tableNumber, items, sentAt } |
| `kitchen-ready` | Server (oshpaz tayyor desa) | Waiter | { shotId, tableNumber, items } |
| `shot-closed` | Server (ofitsiant yopsa) | Waiter, Kitchen, Customer | Yopilgan shot |
| `new-shot` | Server (yangi stol ochilsa) | Waiter | Shot object |

---

## API Endpointlar

### Umumiy (autentifikatsiyasiz)
```
GET  /                              — Server status
GET  /products?restaurantId=xxx     — Mahsulotlar ro'yxati
GET  /categories?restaurantId=xxx   — Kategoriyalar
POST /auth                          — Telegram user ro'yxatdan o'tishi
GET  /user/:telegramId              — Foydalanuvchi ma'lumoti
GET  /orders/user/:telegramId       — Buyurtmalar tarixi
POST /order                         — Yangi buyurtma (online yoki dine_in)
GET  /check-block/:restaurantId     — Restoran bloklangan-bloqlanmaganini tekshirish
GET  /site/:restaurantId            — Sayt sozlamalari (public)
POST /wh/:restaurantId/:token       — Telegram webhook
```

### Admin panel
```
POST /admin/login                   — Admin kirish
GET  /admin/me                      — Joriy admin ma'lumoti + modullar
GET  /admin/stats/fast              — Tezkor statistika (dashboard)
GET  /admin/stats                   — To'liq oylik statistika

— Mahsulotlar
GET    /admin/products              — Ro'yxat
POST   /admin/products              — Qo'shish
PUT    /admin/products/:id          — Tahrirlash
DELETE /admin/products/:id          — O'chirish

— Kategoriyalar
GET    /admin/categories
POST   /admin/categories
PUT    /admin/categories/:id
DELETE /admin/categories/:id
PUT    /admin/categories/reorder/save — Tartibni saqlash (drag & drop)

— Buyurtmalar
GET    /admin/orders                — Ro'yxat (filter: status)
PUT    /admin/orders/:id/status     — Statusni o'zgartirish

— Foydalanuvchilar
GET    /admin/users

— Filiallar
GET    /admin/branches
POST   /admin/branches
PUT    /admin/branches/:id
DELETE /admin/branches/:id

— Ishchilar (employee, waiter, chef barchasi)
GET    /admin/employees             — Barcha ishchilar
POST   /admin/employees             — Yangi ishchi (role: employee/waiter/chef)
PUT    /admin/employees/:id         — Tahrirlash (role, tables va boshqalar)
DELETE /admin/employees/:id         — O'chirish
GET    /admin/employees/:id/face    — Yuz rasmi
PUT    /admin/employees/:id/face    — Yuz rasmi yangilash

— Davomat
GET    /admin/attendance/today      — Bugungi davomat
GET    /admin/attendance/report     — Oylik hisobot
POST   /admin/attendance/manual     — Qo'lda yozish
GET    /admin/attendance/branches-summary — Filiallar bo'yicha

— Inventar
GET    /admin/inventory
POST   /admin/inventory
PUT    /admin/inventory/:id
DELETE /admin/inventory/:id
POST   /admin/inventory/:id/stock   — Zaxira qo'shish/chiqarish
GET    /admin/inventory/:id/logs    — Tarix
GET    /admin/inventory/summary/all — Umumiy holat

— Bildirishnomalar
GET    /admin/notifications
PUT    /admin/notifications/read-all
PUT    /admin/notifications/:id/read
DELETE /admin/notifications/clear

— Sayt sozlamalari
GET    /admin/site-settings
PUT    /admin/site-settings

— Broadcast
POST   /admin/broadcast             — Barcha foydalanuvchilarga xabar

— Analitika
GET    /admin/analytics/advanced    — Kengaytirilgan analitika

— Superadminga xabar
POST   /admin/send-to-superadmin
```

### Superadmin panel
```
POST /superadmin/login
GET  /superadmin/restaurants        — Barcha restoranlar
POST /superadmin/restaurants        — Yangi restoran + admin yaratish
PUT  /superadmin/restaurants/:id    — Tahrirlash (modules, botToken, ...)
DELETE /superadmin/restaurants/:id  — O'chirish
POST /superadmin/block/:restaurantId — Bloklash/faollashtirish
GET  /superadmin/stats              — Umumiy statistika
GET  /superadmin/analytics          — Kengaytirilgan analitika
GET  /superadmin/audit-log          — Audit log
GET  /superadmin/payments           — To'lovlar tarixi
POST /superadmin/payments           — Yangi to'lov yozish
GET  /superadmin/notifications
PUT  /superadmin/notifications/read-all
POST /superadmin/send-message       — Restoranga xabar
GET  /superadmin/bots               — Bot holatlari
POST /superadmin/bots/:id/restart   — Botni qayta ishga tushirish
POST /superadmin/bots/:id/stop      — Botni to'xtatish
PUT  /superadmin/change-password    — Parolni o'zgartirish
```

### Ishchi panel
```
POST /employee/login
GET  /employee/face-descriptor      — Yuz deskriptori
GET  /employee/today                — Bugungi davomat holati
POST /employee/checkin              — Ishga kelish (yuz + lokatsiya)
POST /employee/checkout             — Ishdan ketish
GET  /employee/stats                — Oylik statistika
```

### Ofitsiant panel
```
POST /waiter/login
GET  /waiter/shots                  — Ochiq shotlar ro'yxati
GET  /waiter/shots/:id              — Bitta shot tafsiloti
POST /waiter/shots/open             — Yangi stol ochish
POST /waiter/shots/:id/add-item     — Mahsulot qo'shish
POST /waiter/shots/:id/to-kitchen   — Oshpazga yuborish
POST /waiter/shots/:id/close        — Shot yopish (to'lov)
GET  /waiter/products               — Mahsulotlar + kategoriyalar
GET  /waiter/stats?month=2026-03    — Oylik hisobot
```

### Oshxona panel
```
POST /kitchen/login
GET  /kitchen/orders                — Faol buyurtmalar (pending + cooking)
GET  /kitchen/recent                — Tayyor buyurtmalar (oxirgi 1 soat)
POST /kitchen/orders/:shotId/cooking — "Tayyorlash" — pending → cooking
POST /kitchen/orders/:shotId/ready   — "Tayyor" — cooking → ready
```

---

## Ofitsiant + Oshxona tizimi (Shot lifecycle)

### Asosiy oqim

```
Mijoz (Telegram)          Ofitsiant                  Oshpaz
      │                       │                         │
      │ Buyurtma beradi       │                         │
      │ POST /order           │                         │
      │──────────────────────►│ new-order event          │
      │                       │◄────────────────────────│
      │                       │                         │
      │                       │ Mahsulot qo'shadi       │
      │                       │ POST /shots/:id/add-item│
      │                       │                         │
      │                       │ Oshpazga yuboradi       │
      │                       │ POST /shots/:id/to-kitchen
      │                       │────────────────────────►│
      │                       │         to-kitchen event │
      │                       │                         │
      │                       │                         │ "Tayyorlash" bosadi
      │                       │                         │ POST /cooking
      │                       │◄────────────────────────│
      │                       │                         │
      │                       │                         │ "Tayyor" bosadi
      │                       │ kitchen-ready event      │ POST /ready
      │                       │◄────────────────────────│
      │                       │                         │
      │                       │ Shot yopadi (to'lov)    │
      │                       │ POST /shots/:id/close   │
      │◄──────────────────────│ shot-closed event       │
```

### Muhim qoidalar

1. **Bitta stol = bitta ochiq shot** — yangi buyurtma kelsa avvalgiga qo'shiladi
2. **Shot yopilgandan keyin** — shu stoldan yangi buyurtma kelsa yangi shot ochiladi
3. **Online buyurtma** — shotga tushmaydi, eski tizimda ishlaydi (Telegram xabar)
4. **Ofitsiant topish** — avval stolga biriktirilgan, keyin eng kam band, aks holda ofitsiantsiz
5. **Item statuslari:** `pending` → `cooking` → `ready` (har biri alohida)
6. **Shot yopish** — barcha itemlarning yakuniy narxi hisoblanadi

---

## Modullar tizimi

Superadmin har bir restoran uchun modullarni yoqadi/o'chiradi. Admin panelda faqat yoqilgan bo'limlar ko'rinadi.

| Modul | Default | Tasvirlanishi |
|---|---|---|
| `orders` | ✅ | Buyurtmalar boshqaruvi |
| `menu` | ✅ | Menyu (mahsulotlar) |
| `categories` | ✅ | Kategoriyalar |
| `ratings` | ✅ | Reytinglar |
| `users` | ✅ | Foydalanuvchilar ro'yxati |
| `employees` | ✅ | Ishchilar boshqaruvi |
| `attendance` | ✅ | Davomat tizimi |
| `empReport` | ✅ | Hisobot & Maosh |
| `branches` | ✅ | Filiallar |
| `broadcast` | ✅ | Ommaviy xabar |
| `notifications` | ✅ | Bildirishnomalar |
| `waiter` | ❌ | Ofitsiant tizimi (shotlar) |
| `kitchen` | ❌ | Oshxona paneli |

**Waiter va Kitchen** default o'chirilgan — superadmin yoqishi kerak.

---

## Admin panelda ofitsiant/oshpaz boshqaruvi

`modules.waiter === true` bo'lganda admin panelda **"🧑‍🍳 Ofitsiantlar"** bo'limi paydo bo'ladi:
- Ofitsiant qo'shish (ism, telefon, login, parol, **stollar biriktiruvi**)
- Ofitsiantni tahrirlash/o'chirish
- Stollar vergul bilan kiritiladi: `1, 2, 3, 4, 5`

`modules.kitchen === true` bo'lganda **"🍳 Oshpazlar"** bo'limi paydo bo'ladi:
- Oshpaz qo'shish (ism, telefon, login, parol)
- Oshpazni tahrirlash/o'chirish

Ikkalasi ham Employee jadvalida saqlanadi, faqat `role` farqlanadi.

---

## Telegram Bot tizimi

### Multi-bot arxitektura
Har bir restoranning o'z Telegram boti bor. Server ishga tushganda barcha faol restoranlarning botlarini webhook rejimida ishga tushiradi.

```
Webhook URL: https://{DOMAIN}/wh/{restaurantId}/{botToken}
```

### Bot funksiyalari
- `/start` — foydalanuvchi ro'yxatdan o'tadi, WebApp tugmasi ko'rinadi
- Buyurtma qabul/rad — inline keyboard orqali admin (chefId) ga xabar boradi
- Broadcast — admin barcha foydalanuvchilarga xabar yuboradi

---

## Davomat tizimi (Employee panel)

### Check-in jarayoni
1. Ishchi employee panelga kiradi
2. **Yuz tanish** — Face++ API orqali rasmni solishtiradi
3. **Geolokatsiya** — filial koordinatalaridan masofa tekshiriladi
4. Kechikish avtomatik hisoblanadi (`workStart` bilan solishtirish)

### Check-out jarayoni
- Umumiy ishlagan vaqt hisoblanadi
- Overtime — belgilangan `workEnd` dan keyin ishlagan daqiqalar

---

## Deploy qilish

### Backend (Railway)
```bash
cd backend
# Environment variables:
# MONGO_URI, BOT_TOKEN, CHEF_ID, WEBAPP_URL, RESTAURANT_ID,
# RESTAURANT_NAME, JWT_SECRET, RAILWAY_PUBLIC_DOMAIN,
# FACEPP_API_KEY, FACEPP_API_SECRET, SUPER_USERNAME, SUPER_PASSWORD

npm install   # socket.io avtomatik o'rnatiladi
npm start     # node server.js
```

### Frontend panellar (Vercel)
Har bir panel alohida Vercel proyekt sifatida deploy qilinadi. API URL `window.__CONFIG__` yoki `window.location.origin` orqali aniqlanadi.

---

## Xavfsizlik

- Parollar **bcrypt** bilan hash qilinadi (salt rounds: 10)
- JWT tokenlar **7 kun** (admin/superadmin) yoki **30 kun** (employee/waiter/chef) amal qiladi
- Restoran bloklanganda — barcha panellar (admin, employee, waiter, kitchen) bloklanadi
- Face++ API orqali yuz tanish — threshold 73% dan past bo'lsa rad etiladi
- Geofencing — filial radiusidan tashqarida check-in qilish mumkin emas
- CORS — `origin: "*"` (hozircha ochiq)

---

## Rivojlantirish rejalari

- [ ] Webapp da "Mening shotim" bo'limi (mijoz o'z shotini ko'radi, qo'shimcha buyurtma beradi)
- [ ] Admin panelda ofitsiant hisoboti (nechta shot, qancha summa, kunlik breakdown)
- [ ] Webapp Socket.IO client (real-time shot yangilanishi)
- [ ] Oshpaz panelda ovqat kategoriyalari bo'yicha filter
- [ ] Push notification (Service Worker)