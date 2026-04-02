# ServiX v3.0 — Universal Biznes Platforma

## O'zgartirilgan/yaratilgan fayllar

### YANGI FAYLLAR (qo'shish kerak):
```
backend/config/businessTypes.js    ← Biznes turlari registry
backend/middleware/moduleGuard.js  ← Route-level modul tekshirish
```

### O'ZGARTIRILGAN FAYLLAR (almashtirib qo'yish kerak):
```
backend/models/Admin.js            ← businessType field qo'shildi
backend/models/index.js            ← Restaurant ga businessType qo'shildi
backend/routes/superadmin.routes.js ← 7 ta yangi endpoint + businessType support
backend/routes/admin.routes.js     ← moduleGuard barcha endpointlarga qo'yildi
backend/routes/waiter-employee.routes.js ← moduleGuard qo'shildi
backend/routes/kitchen.routes.js   ← moduleGuard qo'shildi
backend/package.json               ← description yangilandi
client/superadmin/index.html       ← businessType dropdown, dynamic modullar
client/superadmin/superadmin.js    ← biznes turi tanlash, dynamic modul toggle
client/services/admin/admin.js     ← filterSidebar tuzatildi (inventory, defaultOff)
```

---

## Yangi API Endpointlar

| Method | URL | Tavsif |
|--------|-----|--------|
| GET | `/superadmin/business-types` | Barcha biznes turlari ro'yxati |
| GET | `/superadmin/business-types/:type/modules` | Biznes turi uchun mavjud modullar |
| PUT | `/superadmin/restaurants/:id/business-type` | Biznes turini o'zgartirish |
| GET | `/superadmin/restaurants/:id/modules` | Biznes modullarini olish (hozirgi holat) |
| PUT | `/superadmin/restaurants/:id/modules` | Modullarni bulk yangilash |
| PUT | `/superadmin/restaurants/:id/modules/:key/toggle` | Bitta modulni toggle |

---

## Arxitektura

### businessTypes.js — Markaziy registr
Har bir biznes turi quyidagilarni aniqlaydi:
- `label` (uz/ru), `icon`, `description`
- `modules` — har bir modul uchun:
  - `key` — ichki nom (Admin.modules dagi field)
  - `label` (uz/ru), `icon`
  - `default` — yangi biznes yaratilganda yoqilganmi
  - `core` — o'chirib bo'lmaydigan modul (masalan: menyu, buyurtmalar)
  - `description` (uz/ru)

### moduleGuard middleware
```javascript
// Foydalanish:
router.get("/products", authMiddleware, moduleGuard("menu"), handler);
router.post("/waiter/shots/open", waiterMiddleware, moduleGuard("waiter", "waiter"), handler);
router.get("/kitchen/orders", kitchenMiddleware, moduleGuard("kitchen", "kitchen"), handler);
```
- Modul o'chirilgan bo'lsa → 403 `MODULE_DISABLED`
- Superadmin har joyga kira oladi
- Source: "admin" | "waiter" | "kitchen" | "employee"

### Admin.modules — Kengaytirilgan
Yangi modullar:
- `inventory: false` (default o'chiq)

Yangi field:
- `businessType: "restaurant"` (default)

### Restaurant model
- `businessType: "restaurant"` (default)

---

## Yangi biznes turi qo'shish qo'llanmasi

1. `backend/config/businessTypes.js` ga yangi tur qo'shing:
```javascript
salon: {
  label: { uz: "Salon", ru: "Салон" },
  icon: "💇",
  description: { uz: "Go'zallik saloni", ru: "Салон красоты" },
  modules: {
    services: { label: { uz: "Xizmatlar" }, icon: "✂️", default: true, core: true },
    booking:  { label: { uz: "Bron" },      icon: "📅", default: true, core: true },
    // ... shared modullar ham qo'shish mumkin (employees, attendance, ...)
  },
}
```

2. Kerakli modellar yarating: `backend/models/Booking.js` va h.k.

3. Route yarating: `backend/routes/salon.routes.js`
   - Barcha endpointlarga `moduleGuard("booking")` qo'ying

4. `server.js` ga route ulang:
```javascript
const salonRoutes = require("./routes/salon.routes");
app.use("/", salonRoutes);
```

5. Client yarating: `client/services/salon/`

---

## Deploy qilish

1. Fayllarni repo ga qo'ying (yuqoridagi ro'yxat bo'yicha)
2. `git add . && git commit -m "v3.0: Universal business platform" && git push`
3. Railway avtomatik deploy qiladi
4. MongoDB da eski adminlar uchun: `businessType` field avtomatik `"restaurant"` default oladi
5. Eski `modules` ham saqlanib qoladi — hech narsa buzilmaydi

## Backward Compatibility
- Barcha eski endpointlar avvalgidek ishlaydi
- `Restaurant` model va `restaurantId` field nomlari saqlanib qoldi
- Eski adminlar `businessType: "restaurant"` default oladi
- `modules` da yangi `inventory` field — eski adminlarda `undefined` → `false` deb hisoblanadi
- Superadmin eski funksional to'liq saqlanib qoldi (CRUD, block, payment, bots, audit)