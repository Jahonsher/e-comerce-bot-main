require("dotenv").config();

const express     = require("express");
const mongoose    = require("mongoose");
const cors        = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const fs          = require("fs");
const path        = require("path");
const jwt         = require("jsonwebtoken");
const bcrypt      = require("bcryptjs");
const http        = require("http");
const { Server }  = require("socket.io");
const https       = require("https");
const FormData    = require("form-data");

// ===================================================
// ===== CONFIG ======================================
// ===================================================
const MONGO_URI  = process.env.MONGO_URI;
const PORT       = process.env.PORT || 5000;
const DOMAIN     = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_URL || "";
const JWT_SECRET = process.env.JWT_SECRET || "saas_secret_2026";
const FACEPP_KEY    = process.env.FACEPP_API_KEY    || "ZCsxfywtcxMPhjeQ5Um1ErEjL-SSm2qz";
const FACEPP_SECRET = process.env.FACEPP_API_SECRET || "ZoMXrDV_OxFs6OiW380vd4oN4bbbQcM5";

// .env dan default restoran uchun
const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN || "";
const DEFAULT_CHEF_ID   = Number(process.env.CHEF_ID) || 0;
const DEFAULT_WEBAPP_URL = process.env.WEBAPP_URL || "";
const DEFAULT_RESTAURANT_ID = process.env.RESTAURANT_ID || "imperial";
const DEFAULT_RESTAURANT_NAME = process.env.RESTAURANT_NAME || "Imperial Restoran";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" }, transports: ["websocket", "polling"] });

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Umumiy static fayllarni serve qilish (app.js barcha restoranlar uchun)
app.use("/static", express.static(path.join(__dirname, "public")));

// Waiter va Kitchen panellar uchun static
app.use("/waiter", express.static(path.join(__dirname, "..", "waiter")));
app.use("/kitchen", express.static(path.join(__dirname, "..", "kitchen")));

// ===================================================
// ===== SOCKET.IO ROOM TIZIMI ======================
// ===================================================
io.on("connection", (socket) => {
  socket.on("join", (data) => {
    try {
      const decoded = jwt.verify(data.token, JWT_SECRET);
      const restaurantId = decoded.restaurantId;
      const panel = data.panel || "unknown";
      const room = restaurantId + ":" + panel;
      socket.join(room);
      socket.restaurantId = restaurantId;
      socket.panel = panel;
      socket.userId = decoded.id;
      console.log("Socket joined:", room, "user:", decoded.name || decoded.username || decoded.id);
    } catch(e) {
      socket.emit("error", { message: "Token yaroqsiz" });
    }
  });

  socket.on("disconnect", () => {
    // console.log("Socket disconnected:", socket.id);
  });
});

// ===================================================
// ===== MULTI-BOT MANAGER ===========================
// ===================================================
const bots = {};

async function startBot(restaurantId, token, webappUrl, chefId) {
  if (!token) return;
  if (bots[restaurantId]) {
    try { await bots[restaurantId].deleteWebHook(); } catch(e) {}
    delete bots[restaurantId];
  }
  try {
    const bot = new TelegramBot(token);
    bots[restaurantId] = bot;
    registerBotHandlers(bot, restaurantId, webappUrl, chefId);
    if (DOMAIN) {
      const wh = "/wh/" + restaurantId + "/" + token;
      await bot.setWebHook("https://" + DOMAIN + wh);
      console.log("✅ Bot webhook set:", "https://" + DOMAIN + wh);
    } else {
      console.warn("⚠️ DOMAIN yo'q - webhook o'rnatilmadi. Bot polling mode da ishlamaydi.");
    }
    console.log("✅ Bot started:", restaurantId);
  } catch(e) {
    console.error("Bot start error:", restaurantId, e.message);
  }
}

async function stopBot(restaurantId) {
  if (bots[restaurantId]) {
    try { await bots[restaurantId].deleteWebHook(); } catch(e) {}
    delete bots[restaurantId];
    console.log("Bot stopped:", restaurantId);
  }
}

// ===================================================
// ===== FACE++ ======================================
// ===================================================
async function faceppCompare(photo1, photo2) {
  return new Promise((resolve) => {
    try {
      const b1 = photo1.replace(/^data:image\/\w+;base64,/, "");
      const b2 = photo2.replace(/^data:image\/\w+;base64,/, "");
      const form = new FormData();
      form.append("api_key",       FACEPP_KEY);
      form.append("api_secret",    FACEPP_SECRET);
      form.append("image_base64_1", b1);
      form.append("image_base64_2", b2);
      const options = {
        hostname: "api-us.faceplusplus.com",
        path:     "/facepp/v3/compare",
        method:   "POST",
        headers:  form.getHeaders()
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            if (result.confidence !== undefined) {
              resolve({ ok: true, confidence: result.confidence, threshold: result.thresholds?.["1e-5"] || 73 });
            } else {
              resolve({ ok: false, error: result.error_message || "Face++ xato" });
            }
          } catch(e) { resolve({ ok: false, error: "JSON parse xato" }); }
        });
      });
      req.on("error", (e) => resolve({ ok: false, error: e.message }));
      form.pipe(req);
    } catch(e) { resolve({ ok: false, error: e.message }); }
  });
}

// ===================================================
// ===== MONGODB CONNECT =============================
// ===================================================
async function connectDB() {
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB ulandi");

  // Eski noto'g'ri unique indexlarni o'chirish
  // (multi-restoran tizimida telegramId va product id yakka unique bo'lmasligi kerak)
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const colNames = collections.map(c => c.name);

    // USERS: telegramId_1 indexni o'chirish
    if (colNames.includes("users")) {
      const col = db.collection("users");
      const indexes = await col.indexes();
      console.log("Users indexlari:", indexes.map(i => i.name + (i.unique ? " (unique)" : "")).join(", "));
      for (const idx of indexes) {
        if (idx.name === "telegramId_1") {
          await col.dropIndex("telegramId_1");
          console.log("✅ Eski telegramId_1 index o'chirildi!");
          break;
        }
      }
    }

    // PRODUCTS: id_1 indexni o'chirish
    if (colNames.includes("products")) {
      const col = db.collection("products");
      const indexes = await col.indexes();
      console.log("Products indexlari:", indexes.map(i => i.name + (i.unique ? " (unique)" : "")).join(", "));
      for (const idx of indexes) {
        if (idx.name === "id_1") {
          await col.dropIndex("id_1");
          console.log("✅ Eski id_1 index o'chirildi!");
          break;
        }
      }
    }

    // ADMINS: username_1 duplicate muammosini tekshirish
    if (colNames.includes("admins")) {
      const col = db.collection("admins");
      const indexes = await col.indexes();
      console.log("Admins indexlari:", indexes.map(i => i.name + (i.unique ? " (unique)" : "")).join(", "));
    }

  } catch(e) {
    console.warn("Index tekshirish:", e.message);
  }
}

// ===================================================
// ===== MODELS ======================================
// ===================================================
const userSchema = new mongoose.Schema({
  telegramId:   Number,
  first_name:   String, last_name: String,
  username:     String, phone: String,
  restaurantId: { type: String, required: true }
}, { timestamps: true });
userSchema.index({ telegramId: 1, restaurantId: 1 }, { unique: true });
const User = mongoose.model("User", userSchema);

const Order = mongoose.model("Order", new mongoose.Schema({
  telegramId:    Number, items: Array, total: Number,
  userInfo:      Object, orderType: String,
  tableNumber:   String,
  status:        { type: String, default: "Yangi" },
  rating:        { type: Number, default: null },
  ratingComment: { type: String, default: "" },
  restaurantId:  { type: String, required: true }
}, { timestamps: true }));

const productSchema = new mongoose.Schema({
  id:           Number,
  name:         String, name_ru: String,
  price:        Number, category: String, image: String,
  active:       { type: Boolean, default: true },
  restaurantId: { type: String, required: true }
}, { timestamps: true });
productSchema.index({ id: 1, restaurantId: 1 }, { unique: true });
const Product = mongoose.model("Product", productSchema);

const Category = mongoose.model("Category", new mongoose.Schema({
  name:         { type: String, required: true },
  name_ru:      String,
  emoji:        { type: String, default: "🍽" },
  order:        { type: Number, default: 0 },
  active:       { type: Boolean, default: true },
  restaurantId: { type: String, required: true }
}, { timestamps: true }));

const restaurantSchema = new mongoose.Schema({
  restaurantId: { type: String, required: true, unique: true },
  name:         String,
  blocked:      { type: Boolean, default: false },
  blockReason:  { type: String, default: "" }
}, { timestamps: true });
const Restaurant = mongoose.model("Restaurant", restaurantSchema);

const adminSchema = new mongoose.Schema({
  username:       { type: String, unique: true },
  password:       String,
  restaurantName: String,
  restaurantId:   String,
  botToken:       String,
  chefId:         Number,
  phone:          String,
  address:        String,
  addressRu:      String,
  webappUrl:      String,
  role:           { type: String, default: "admin" },
  active:         { type: Boolean, default: true },
  blockReason:    { type: String, default: "" },
  subscriptionEnd: Date,
  // ===== SITE SETTINGS =====
  botUsername:     String,
  adminTg:        String,
  metro:          String,
  metroRu:        String,
  workHours:      String,
  workHoursRu:    String,
  nameRu:         String,
  heroBadge:      String,
  heroBadgeRu:    String,
  subtitle:       String,
  subtitleRu:     String,
  workStart:      { type: Number, default: 10 },
  workEnd:        { type: Number, default: 23 },
  mapEmbed:       String,
  heroImage:      String,
  eventsBg:       String,
  gallery:        [String],
  theme:          { type: String, default: "gold" }, // gold, emerald, ruby, ocean, violet
  // ===== MODULLAR — qaysi bo'limlar yoqilgan =====
  modules: {
    orders:        { type: Boolean, default: true },
    menu:          { type: Boolean, default: true },
    categories:    { type: Boolean, default: true },
    ratings:       { type: Boolean, default: true },
    users:         { type: Boolean, default: true },
    employees:     { type: Boolean, default: true },
    attendance:    { type: Boolean, default: true },
    empReport:     { type: Boolean, default: true },
    branches:      { type: Boolean, default: true },
    broadcast:     { type: Boolean, default: true },
    notifications: { type: Boolean, default: true },
    waiter:        { type: Boolean, default: false },
    kitchen:       { type: Boolean, default: false }
  }
}, { timestamps: true });
const Admin = mongoose.model("Admin", adminSchema);

const Branch = mongoose.model("Branch", new mongoose.Schema({
  name:         { type: String, required: true },
  restaurantId: { type: String, required: true },
  address:      String,
  lat:          Number,
  lng:          Number,
  radius:       { type: Number, default: 100 },
  active:       { type: Boolean, default: true }
}, { timestamps: true }));

const employeeSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  phone:          String,
  position:       String,
  username:       { type: String, unique: true },
  password:       String,
  restaurantId:   { type: String, required: true },
  role:           { type: String, enum: ["employee", "waiter", "chef"], default: "employee" },
  tables:         [String],
  workStart:      { type: String, default: "09:00" },
  workEnd:        { type: String, default: "18:00" },
  salary:         { type: Number, default: 0 },
  telegramId:     Number,
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
  weeklyOff:      { type: String, default: "sunday" },
  photo:          String,
  faceDescriptor: [Number],
  active:         { type: Boolean, default: true }
}, { timestamps: true });
const Employee = mongoose.model("Employee", employeeSchema);

const Attendance = mongoose.model("Attendance", new mongoose.Schema({
  employeeId:      { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  restaurantId:    { type: String, required: true },
  date:            { type: String, required: true },
  checkIn:         String,
  checkOut:        String,
  checkInPhoto:    String,
  checkInLat:      Number,
  checkInLng:      Number,
  lateMinutes:     { type: Number, default: 0 },
  totalMinutes:    { type: Number, default: 0 },
  status:          { type: String, default: "keldi" },
  isWeeklyOff:     { type: Boolean, default: false },
  overtimeMinutes: { type: Number, default: 0 },
  note:            String
}, { timestamps: true }));

// ===================================================
// ===== INVENTORY MODEL =============================
// ===================================================
const inventorySchema = new mongoose.Schema({
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  restaurantId: { type: String, required: true },
  productName:  String,
  unit:         { type: String, default: "dona" }, // dona, kg, litr, etc.
  currentStock: { type: Number, default: 0 },
  minStock:     { type: Number, default: 5 },
  maxStock:     { type: Number, default: 1000 },
  costPrice:    { type: Number, default: 0 },
  lastRestocked: Date,
  active:       { type: Boolean, default: true }
}, { timestamps: true });
inventorySchema.index({ productId: 1, restaurantId: 1 }, { unique: true });
const Inventory = mongoose.model("Inventory", inventorySchema);

const inventoryLogSchema = new mongoose.Schema({
  inventoryId:  { type: mongoose.Schema.Types.ObjectId, ref: "Inventory" },
  restaurantId: { type: String, required: true },
  type:         { type: String, enum: ["in", "out", "adjust"], required: true },
  quantity:     { type: Number, required: true },
  note:         String,
  createdBy:    String
}, { timestamps: true });
const InventoryLog = mongoose.model("InventoryLog", inventoryLogSchema);

// ===================================================
// ===== NOTIFICATION MODEL ==========================
// ===================================================
const notificationSchema = new mongoose.Schema({
  restaurantId: { type: String, required: true },
  type:         { type: String, required: true }, // order_new, order_accepted, stock_low, employee_late, broadcast
  title:        { type: String, required: true },
  message:      String,
  icon:         { type: String, default: "🔔" },
  read:         { type: Boolean, default: false },
  targetRole:   { type: String, default: "admin" }, // admin, employee, user
  targetId:     String, // specific user/employee id if needed
  data:         Object  // extra data like orderId, productId, etc.
}, { timestamps: true });
const Notification = mongoose.model("Notification", notificationSchema);

// ===================================================
// ===== SHOT MODEL (Ofitsiant tizimi) ===============
// ===================================================
const shotSchema = new mongoose.Schema({
  restaurantId:      { type: String, required: true },
  tableNumber:       { type: String, required: true },
  waiterId:          { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  waiterName:        String,
  status:            { type: String, enum: ["open", "closed"], default: "open" },
  items: [{
    name:            String,
    name_ru:         String,
    price:           Number,
    quantity:        Number,
    addedBy:         { type: String, enum: ["customer", "waiter"], default: "customer" },
    sentToKitchen:   { type: Boolean, default: false },
    kitchenStatus:   { type: String, enum: ["pending", "cooking", "ready"], default: "pending" },
    addedAt:         { type: Date, default: Date.now }
  }],
  total:             { type: Number, default: 0 },
  customerTelegramId: Number,
  openedAt:          { type: Date, default: Date.now },
  closedAt:          Date
}, { timestamps: true });
shotSchema.index({ restaurantId: 1, status: 1 });
shotSchema.index({ restaurantId: 1, tableNumber: 1, status: 1 });
const Shot = mongoose.model("Shot", shotSchema);

// ===================================================
// ===== AUDIT LOG MODEL =============================
// ===================================================
const auditLogSchema = new mongoose.Schema({
  action:       { type: String, required: true }, // restaurant_create, restaurant_block, payment_add, login, etc.
  actor:        { type: String, required: true }, // username
  actorRole:    { type: String, default: "superadmin" },
  restaurantId: String,
  details:      String,
  ip:           String
}, { timestamps: true });
const AuditLog = mongoose.model("AuditLog", auditLogSchema);

async function logAudit(action, actor, role, restaurantId, details, ip) {
  try { await AuditLog.create({ action, actor, actorRole: role || "superadmin", restaurantId: restaurantId || "", details: details || "", ip: ip || "" }); }
  catch(e) { console.error("AuditLog error:", e.message); }
}

// ===================================================
// ===== PAYMENT MODEL ===============================
// ===================================================
const paymentSchema = new mongoose.Schema({
  restaurantId: { type: String, required: true },
  amount:       { type: Number, required: true },
  type:         { type: String, enum: ["subscription","custom","refund"], default: "subscription" },
  method:       { type: String, default: "cash" }, // cash, card, transfer
  days:         { type: Number, default: 30 },
  note:         String,
  createdBy:    String
}, { timestamps: true });
const Payment = mongoose.model("Payment", paymentSchema);

// ===================================================
// ===== SUPERADMIN NOTIFICATION MODEL ===============
// ===================================================
const saNotifSchema = new mongoose.Schema({
  type:    { type: String, required: true },
  title:   { type: String, required: true },
  message: String,
  icon:    { type: String, default: "🔔" },
  read:    { type: Boolean, default: false },
  data:    Object
}, { timestamps: true });
const SANotification = mongoose.model("SANotification", saNotifSchema);

async function createSANotif(type, title, message, icon, data) {
  try { await SANotification.create({ type, title, message: message || "", icon: icon || "🔔", data }); }
  catch(e) {}
}

// Helper: Create notification
async function createNotification(restaurantId, type, title, message, icon, targetRole, targetId, data) {
  try {
    await Notification.create({ restaurantId, type, title, message: message || "", icon: icon || "🔔", targetRole: targetRole || "admin", targetId, data });
  } catch(e) { console.error("Notification create error:", e.message); }
}

// ===================================================
// ===== HELPERS =====================================
// ===================================================
async function isBotBlocked(restaurantId) {
  const rest = await Restaurant.findOne({ restaurantId });
  if (rest && rest.blocked) {
    return { blocked: true, reason: rest.blockReason || "Xizmat vaqtincha to'xtatilgan" };
  }
  return { blocked: false };
}

async function ensureRestaurant(restaurantId, name) {
  const exists = await Restaurant.findOne({ restaurantId });
  if (!exists) {
    await Restaurant.create({ restaurantId, name: name || restaurantId, blocked: false, blockReason: "" });
  }
}

function calcWorkingDays(yearMonth, weeklyOff) {
  const [y, m] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  let workDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dayNames[dow] !== (weeklyOff || "sunday")) workDays++;
  }
  return workDays;
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ===================================================
// ===== MIDDLEWARE ==================================
// ===================================================
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    if (req.admin.role === "superadmin") return next();
    const restBlock = await isBotBlocked(req.admin.restaurantId);
    if (restBlock.blocked) {
      return res.status(403).json({ error: "BLOCKED", message: restBlock.reason, blocked: true });
    }
    next();
  } catch(e) { res.status(401).json({ error: "Token yaroqsiz" }); }
}

function superMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    if (req.admin.role !== "superadmin") return res.status(403).json({ error: "Ruxsat yo'q" });
    next();
  } catch(e) { res.status(401).json({ error: "Token yaroqsiz" }); }
}

// ===== ADMIN ME — yangi modules olish uchun =====
app.get("/admin/me", authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("username restaurantName role restaurantId modules");
    if (!admin) return res.status(404).json({ error: "Topilmadi" });
    res.json({ ok: true, admin: { username: admin.username, restaurantName: admin.restaurantName, role: admin.role, restaurantId: admin.restaurantId, modules: admin.modules || {} } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

async function empMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try {
    req.employee = jwt.verify(token, JWT_SECRET);
    const emp = await Employee.findById(req.employee.id).select("active restaurantId");
    if (!emp || !emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan", deleted: true });
    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) {
      return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    }
    next();
  } catch(e) { res.status(401).json({ error: "Token yaroqsiz" }); }
}

// ===================================================
// ===== BOT HANDLERS ================================
// ===================================================
const broadcastSessions = {};

function registerBotHandlers(bot, restaurantId, webappUrl, chefId) {
  const menu = {
    keyboard: [[{ text: "Buyurtmalarim" }, { text: "Manzil" }], [{ text: "Ish vaqti" }, { text: "Boglanish" }]],
    resize_keyboard: true
  };

  async function send(id, text, extra) {
    try { await bot.sendMessage(id, text, extra || {}); } catch(e) { console.error("send:", e.message); }
  }

  async function checkBlocked(chatId) {
    const bc = await isBotBlocked(restaurantId);
    if (bc.blocked) {
      await send(chatId, "🔒 Restoran vaqtincha ishlamayapti.\n\n" + (bc.reason || ""));
      return true;
    }
    return false;
  }

  bot.onText(/\/start/, async (msg) => {
    try {
      if (await checkBlocked(msg.chat.id)) return;
      const tgId = Number(msg.from.id);
      const u = await User.findOneAndUpdate(
        { telegramId: tgId, restaurantId },
        { telegramId: tgId, restaurantId,
          first_name: msg.from.first_name || "",
          last_name:  msg.from.last_name  || "",
          username:   msg.from.username   || "" },
        { upsert: true, new: true }
      );
      if (!u.phone) {
        await send(msg.chat.id, "Salom " + (msg.from.first_name || "") + "! Telefon raqamingizni yuboring:", {
          reply_markup: { keyboard: [[{ text: "📱 Telefon yuborish", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        });
      } else {
        await send(msg.chat.id, "Xush kelibsiz " + (msg.from.first_name || "") + "! Bo'lim tanlang:", { reply_markup: menu });
      }
    } catch(e) { console.error("start:", e.message); }
  });

  bot.on("contact", async (msg) => {
    try {
      const tgId = Number(msg.from.id);
      // Telefon raqamini saqlash
      const phone = msg.contact.phone_number;
      await User.findOneAndUpdate(
        { telegramId: tgId, restaurantId },
        { phone: phone },
        { upsert: true }
      );
      await send(msg.chat.id, "✅ Telefon saqlandi! Bo'lim tanlang:", { reply_markup: menu });
    } catch(e) { console.error("contact:", e.message); }
  });

  bot.onText(/Buyurtmalarim/, async (msg) => {
    try {
      if (await checkBlocked(msg.chat.id)) return;
      const list = await Order.find({ telegramId: msg.from.id, restaurantId }).sort({ createdAt: -1 }).limit(5);
      if (!list.length) { await send(msg.chat.id, "Buyurtma yo'q.", { reply_markup: menu }); return; }
      let t = "Buyurtmalar:\n\n";
      list.forEach((o, i) => {
        t += (i+1) + ". " + new Date(o.createdAt).toLocaleDateString() + "\n";
        t += o.items.map(x => x.name + " x" + x.quantity).join(", ") + "\n";
        t += Number(o.total).toLocaleString() + " som | " + o.status + "\n\n";
      });
      await send(msg.chat.id, t, { reply_markup: menu });
    } catch(e) {}
  });

  bot.onText(/Manzil/, async (msg) => {
    try {
      if (await checkBlocked(msg.chat.id)) return;
      const adminInfo = await Admin.findOne({ restaurantId, role: "admin" });
      await send(msg.chat.id, "📍 Manzil:\n" + (adminInfo?.address || "Manzil kiritilmagan"), { reply_markup: menu });
    } catch(e) {}
  });

  bot.onText(/Ish vaqti/, async (msg) => {
    try {
      if (await checkBlocked(msg.chat.id)) return;
      const h = (new Date().getUTCHours() + 5) % 24;
      await send(msg.chat.id, "🕐 Ish vaqti:\nDu-Ju: 10:00-23:00\nSh-Ya: 09:00-00:00\n\n" + (h >= 10 && h < 23 ? "✅ Hozir OCHIQ" : "❌ Hozir YOPIQ"), { reply_markup: menu });
    } catch(e) {}
  });

  bot.onText(/Boglanish/, async (msg) => {
    try {
      if (await checkBlocked(msg.chat.id)) return;
      const adminInfo = await Admin.findOne({ restaurantId, role: "admin" });
      await send(msg.chat.id, "📞 Bog'lanish:\nTelefon: " + (adminInfo?.phone || ""), { reply_markup: menu });
    } catch(e) {}
  });

  bot.onText(/\/broadcast/, async (msg) => {
    if (msg.chat.id !== chefId) return send(msg.chat.id, "⛔ Faqat admin uchun.");
    broadcastSessions[msg.chat.id] = { step: "text", restaurantId };
    send(msg.chat.id, "📢 Broadcast matnini yozing:\n_(Bekor: /cancel)_", { parse_mode: "Markdown" });
  });

  bot.onText(/\/cancel/, async (msg) => {
    if (broadcastSessions[msg.chat.id]) {
      delete broadcastSessions[msg.chat.id];
      send(msg.chat.id, "❌ Bekor qilindi.");
    }
  });

  bot.on("message", async (msg) => {
    const session = broadcastSessions[msg.chat.id];
    if (!session || session.restaurantId !== restaurantId) return;
    if (session.step === "text") {
      if (!msg.text || msg.text.startsWith("/")) return;
      session.text = msg.text; session.step = "photo";
      send(msg.chat.id, "✅ Matn saqlandi. Rasm yuboring yoki /skip yozing.");
      return;
    }
    if (session.step === "photo") {
      if (msg.text === "/skip") session.photoId = null;
      else if (msg.photo) session.photoId = msg.photo[msg.photo.length-1].file_id;
      else { send(msg.chat.id, "Rasm yuboring yoki /skip yozing."); return; }
      session.step = "confirm";
      send(msg.chat.id, "📋 Yuborilsinmi?\n\n" + session.text, {
        reply_markup: { inline_keyboard: [[
          { text: "✅ Ha", callback_data: "bc_confirm_" + restaurantId },
          { text: "❌ Bekor", callback_data: "bc_cancel_" + restaurantId }
        ]]}
      });
    }
  });

  bot.on("callback_query", async (q) => {
    try {
      if (await checkBlocked(q.message.chat.id)) { await bot.answerCallbackQuery(q.id); return; }
      const parts = q.data.split("_");
      const action = parts[0];

      if (action === "accept") {
        const [, orderId, userId] = parts;
        await Order.findByIdAndUpdate(orderId, { status: "Qabul qilindi" });
        await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "✅ Qabul qilindi", callback_data: "done" }]] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
        await send(Number(userId), "✅ Buyurtmangiz qabul qilindi! Tayyorlanmoqda.");
        setTimeout(async () => {
          await send(Number(userId), "Buyurtmangizni baholang:", {
            reply_markup: { inline_keyboard: [[
              { text: "⭐1", callback_data: `rate_${orderId}_1` }, { text: "⭐⭐2", callback_data: `rate_${orderId}_2` },
              { text: "⭐⭐⭐3", callback_data: `rate_${orderId}_3` }, { text: "⭐⭐⭐⭐4", callback_data: `rate_${orderId}_4` },
              { text: "⭐⭐⭐⭐⭐5", callback_data: `rate_${orderId}_5` }
            ]]}
          });
        }, 30000);
      } else if (action === "reject") {
        const [, orderId, userId] = parts;
        await Order.findByIdAndUpdate(orderId, { status: "Bekor qilindi" });
        await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "❌ Bekor qilindi", callback_data: "done" }]] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
        await send(Number(userId), "❌ Buyurtmangiz bekor qilindi.");
      } else if (action === "rate") {
        const [, orderId, stars] = parts;
        await Order.findByIdAndUpdate(orderId, { rating: Number(stars) });
        await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "⭐".repeat(Number(stars)) + " Baholandi!", callback_data: "done" }]] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
        await bot.answerCallbackQuery(q.id, { text: "Rahmat!" });
        return;
      } else if (q.data === "bc_confirm_" + restaurantId) {
        const session = broadcastSessions[q.message.chat.id];
        if (!session) { await bot.answerCallbackQuery(q.id); return; }
        await bot.answerCallbackQuery(q.id, { text: "Yuborilmoqda..." });
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
        const users = await User.find({ restaurantId });
        let sent = 0, failed = 0, cachedId = null;
        for (const user of users) {
          try {
            if (session.photoId || cachedId) {
              const m2 = await bot.sendPhoto(Number(user.telegramId), cachedId || session.photoId, { caption: session.text || "" });
              if (!cachedId && m2.photo) cachedId = m2.photo[m2.photo.length-1].file_id;
            } else {
              await bot.sendMessage(Number(user.telegramId), session.text, { parse_mode: "HTML" });
            }
            sent++;
            await new Promise(r => setTimeout(r, 50));
          } catch(e) { failed++; }
        }
        delete broadcastSessions[q.message.chat.id];
        await send(q.message.chat.id, "✅ Broadcast yakunlandi!\nYuborildi: " + sent + "\nXato: " + failed);
        return;
      } else if (q.data === "bc_cancel_" + restaurantId) {
        delete broadcastSessions[q.message.chat.id];
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
        await send(q.message.chat.id, "❌ Bekor qilindi.");
        await bot.answerCallbackQuery(q.id);
        return;
      }
      await bot.answerCallbackQuery(q.id);
    } catch(e) { console.error("callback:", e.message); }
  });
}

// ===================================================
// ===== PUBLIC ENDPOINTS ============================
// ===================================================
app.get("/", (req, res) => res.json({ status: "OK", bots: Object.keys(bots) }));

// ===== KEEP-ALIVE PING (Railway cold start prevention) =====
// Har 4 daqiqada o'ziga ping yuboradi — server "uxlab qolmaydi"
function startKeepAlive() {
  if (!DOMAIN) return;
  setInterval(function() {
    const https = require("https");
    https.get("https://" + DOMAIN + "/", function() {}).on("error", function() {});
  }, 4 * 60 * 1000); // 4 daqiqa
  console.log("✅ Keep-alive ping ishga tushdi (har 4 daq)");
}

// ===== STATS CACHE — Dashboard uchun tez javob =====
var statsCache = {};
var statsCacheTime = {};
var CACHE_TTL = 30000; // 30 sekund

app.get("/admin/stats/fast", authMiddleware, async (req, res) => {
  try {
    var rId = req.admin.restaurantId;
    var now = Date.now();
    // Cache dan qaytarish (30 sekund ichida)
    if (statsCache[rId] && statsCacheTime[rId] && (now - statsCacheTime[rId]) < CACHE_TTL) {
      return res.json(statsCache[rId]);
    }
    // Yangi hisoblash
    var today = new Date(); today.setHours(0,0,0,0);
    var month = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // PARALLEL — barcha so'rovlar bir vaqtda
    var [todayOrders, monthOrders, ratedOrders, totalUsers, recentOrders] = await Promise.all([
      Order.find({ restaurantId: rId, createdAt: { $gte: today } }).lean(),
      Order.find({ restaurantId: rId, createdAt: { $gte: month } }).lean(),
      Order.find({ restaurantId: rId, rating: { $ne: null } }).select("rating").lean(),
      User.countDocuments({ restaurantId: rId }),
      Order.find({ restaurantId: rId }).sort({ createdAt: -1 }).limit(8).lean()
    ]);

    // Haftalik — oldindan hisoblash
    var weeklyData = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today); d.setDate(d.getDate() - i);
      var dn = new Date(d); dn.setDate(dn.getDate() + 1);
      var dayOrders = monthOrders.filter(function(o) { var ct = new Date(o.createdAt); return ct >= d && ct < dn; });
      weeklyData.push({ date: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }), orders: dayOrders.length, revenue: dayOrders.reduce(function(s,o){return s+(o.total||0)},0) });
    }

    var topProducts = [];
    var itemMap = {};
    monthOrders.forEach(function(o) {
      (o.items || []).forEach(function(item) {
        if (!itemMap[item.name]) itemMap[item.name] = { quantity: 0, total: 0 };
        itemMap[item.name].quantity += item.quantity || 1;
        itemMap[item.name].total += (item.price || 0) * (item.quantity || 1);
      });
    });
    topProducts = Object.keys(itemMap).map(function(k) { return { _id: k, quantity: itemMap[k].quantity, total: itemMap[k].total }; })
      .sort(function(a,b) { return b.quantity - a.quantity; }).slice(0, 5);

    var result = {
      today: { orders: todayOrders.length, revenue: todayOrders.reduce(function(s,o){return s+(o.total||0)},0), online: todayOrders.filter(function(o){return o.orderType==="online"}).length, dineIn: todayOrders.filter(function(o){return o.orderType==="dine_in"}).length },
      month: { orders: monthOrders.length, revenue: monthOrders.reduce(function(s,o){return s+(o.total||0)},0) },
      weekly: weeklyData,
      topProducts: topProducts,
      rating: { avg: ratedOrders.length ? (ratedOrders.reduce(function(s,o){return s+o.rating},0)/ratedOrders.length).toFixed(1) : null, count: ratedOrders.length },
      totalUsers: totalUsers,
      recentOrders: recentOrders
    };

    // Cache ga saqlash
    statsCache[rId] = result;
    statsCacheTime[rId] = now;
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/wh/:restaurantId/:token", (req, res) => {
  const { restaurantId } = req.params;
  if (bots[restaurantId]) {
    try { bots[restaurantId].processUpdate(req.body); } catch(e) {}
  }
  res.sendStatus(200);
});

app.get("/check-block/:restaurantId", async (req, res) => {
  try { res.json(await isBotBlocked(req.params.restaurantId)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/products", async (req, res) => {
  try {
    const rId = req.query.restaurantId;
    if (!rId) return res.status(400).json({ error: "restaurantId kerak" });
    // Barcha mahsulotlarni qaytaramiz (active va inactive)
    // Frontend inactive ni "Tugagan" deb ko'rsatadi
    const products = await Product.find({ restaurantId: rId }).sort({ id: 1 });
    res.json(products);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/categories", async (req, res) => {
  try {
    const rId = req.query.restaurantId;
    if (!rId) return res.status(400).json({ error: "restaurantId kerak" });
    res.json(await Category.find({ restaurantId: rId, active: true }).sort({ order: 1 }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/auth", async (req, res) => {
  try {
    const { id, first_name, last_name, username, restaurantId } = req.body;
    if (!restaurantId) return res.status(400).json({ error: "restaurantId kerak" });
    const numId = Number(id);
    const user = await User.findOneAndUpdate(
      { telegramId: numId, restaurantId },
      { $set: { telegramId: numId, restaurantId, first_name: first_name||"", last_name: last_name||"", username: username||"" } },
      { upsert: true, new: true }
    );
    res.json({ ok: true, user });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/user/:id", async (req, res) => {
  try {
    const rId = req.query.restaurantId;
    const user = await User.findOne({ telegramId: Number(req.params.id), restaurantId: rId });
    res.json(user || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ✅ Foydalanuvchi buyurtmalari tarixi (webapp uchun)
app.get("/orders/user/:telegramId", async (req, res) => {
  try {
    const { restaurantId } = req.query;
    if (!restaurantId) return res.status(400).json({ error: "restaurantId kerak" });
    const orders = await Order.find({
      telegramId: Number(req.params.telegramId),
      restaurantId
    }).sort({ createdAt: -1 }).limit(20);
    res.json(orders);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/order", async (req, res) => {
  try {
    const { telegramId, items, user, orderType, tableNumber, restaurantId } = req.body;
    if (!telegramId || !items?.length || !restaurantId) return res.status(400).json({ error: "Ma'lumot yetarli emas" });
    const blockCheck = await isBotBlocked(restaurantId);
    if (blockCheck.blocked) {
      return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    }
    const db = await User.findOne({ telegramId: Number(telegramId), restaurantId });
    const ui = { first_name: db?.first_name || user?.first_name || "", last_name: db?.last_name || user?.last_name || "", username: db?.username || user?.username || "", phone: db?.phone || user?.phone || "" };
    const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

    // ===== DINE_IN: Shot tizimi =====
    const adminInfo = await Admin.findOne({ restaurantId, role: "admin" });
    if (orderType === "dine_in" && tableNumber && adminInfo?.modules?.waiter) {
      try {
        // 1. Shu stol + restoran uchun OCHIQ shot bormi?
        let shot = await Shot.findOne({ restaurantId, tableNumber: String(tableNumber), status: "open" });
        
        if (shot) {
          // Mavjud shotga itemlarni qo'shish
          const newItems = items.map(i => ({
            name: i.name, name_ru: i.name_ru || "", price: Number(i.price), quantity: Number(i.quantity) || 1,
            addedBy: "customer", sentToKitchen: false, kitchenStatus: "pending", addedAt: new Date()
          }));
          shot.items.push(...newItems);
          shot.total = shot.items.reduce((s, i) => s + (i.price * i.quantity), 0);
          if (!shot.customerTelegramId) shot.customerTelegramId = Number(telegramId);
          await shot.save();
        } else {
          // Yangi shot ochish — ofitsiant topish
          let assignedWaiter = null;
          // a) Stol ga biriktirilgan ofitsiant
          assignedWaiter = await Employee.findOne({ restaurantId, role: "waiter", active: true, tables: String(tableNumber) });
          // b) Eng kam ochiq shoti bor ofitsiant
          if (!assignedWaiter) {
            const waiters = await Employee.find({ restaurantId, role: "waiter", active: true });
            if (waiters.length > 0) {
              const waiterCounts = await Promise.all(waiters.map(async w => ({
                waiter: w, count: await Shot.countDocuments({ restaurantId, waiterId: w._id, status: "open" })
              })));
              waiterCounts.sort((a, b) => a.count - b.count);
              assignedWaiter = waiterCounts[0].waiter;
            }
          }
          const shotItems = items.map(i => ({
            name: i.name, name_ru: i.name_ru || "", price: Number(i.price), quantity: Number(i.quantity) || 1,
            addedBy: "customer", sentToKitchen: false, kitchenStatus: "pending", addedAt: new Date()
          }));
          shot = await Shot.create({
            restaurantId, tableNumber: String(tableNumber),
            waiterId: assignedWaiter?._id || null, waiterName: assignedWaiter?.name || "",
            status: "open", items: shotItems, total,
            customerTelegramId: Number(telegramId)
          });
        }

        // Socket eventlar: ofitsiantga signal
        io.to(restaurantId + ":waiter").emit("new-order", shot);
        io.to(restaurantId + ":customer").emit("shot-updated", shot);

        // Order ham yaratamiz (admin panel uchun)
        const order = await Order.create({ telegramId: Number(telegramId), items, total, userInfo: ui, orderType: "dine_in", tableNumber: String(tableNumber), status: "Yangi", restaurantId });

        // Telegram xabar (adminga)
        const name  = (ui.first_name + " " + ui.last_name).trim() || "ID:" + telegramId;
        const targetChef = adminInfo?.chefId || (restaurantId === DEFAULT_RESTAURANT_ID ? DEFAULT_CHEF_ID : null);
        if (targetChef && bots[restaurantId]) {
          let m = "🆕 Yangi buyurtma (Stol " + tableNumber + ")!\nMijoz: " + name + "\n\nMahsulotlar:\n";
          items.forEach(i => { m += "- " + i.name + " x" + i.quantity + " | " + Number(i.price).toLocaleString() + " som\n"; });
          m += "\nJami: " + total.toLocaleString() + " som";
          await bots[restaurantId].sendMessage(targetChef, m);
        }

        await createNotification(restaurantId, "order_new",
          "🆕 Stol " + tableNumber + " — yangi buyurtma",
          (ui.first_name || "Mijoz") + " — " + total.toLocaleString() + " so'm",
          "🛒", "admin", null, { orderId: order._id, shotId: shot._id }
        );

        return res.json({ success: true, order, shot });
      } catch(shotErr) {
        console.error("Shot xato:", shotErr.message);
        // Shot xato bo'lsa eski logika bilan davom etamiz
      }
    }

    // ===== ONLINE yoki waiter moduli yo'q: Eski logika =====
    const order = await Order.create({ telegramId: Number(telegramId), items, total, userInfo: ui, orderType: orderType||"online", tableNumber: tableNumber||"Online", status: "Yangi", restaurantId });
    const name  = (ui.first_name + " " + ui.last_name).trim() || "ID:" + telegramId;
    const uname = ui.username ? " (@" + ui.username + ")" : "";
    const phone = ui.phone ? "\nTel: " + ui.phone : "";
    const table = orderType === "dine_in" ? "Stol: " + tableNumber : "Online";
    const targetChef = adminInfo?.chefId || (restaurantId === DEFAULT_RESTAURANT_ID ? DEFAULT_CHEF_ID : null);
    let m = "🆕 Yangi buyurtma!\n\n" + table + "\nMijoz: " + name + uname + phone + "\n\nMahsulotlar:\n";
    items.forEach(i => { m += "- " + i.name + " x" + i.quantity + " | " + Number(i.price).toLocaleString() + " som\n"; });
    m += "\nJami: " + total.toLocaleString() + " som";
    if (targetChef && bots[restaurantId]) {
      await bots[restaurantId].sendMessage(targetChef, m, {
        reply_markup: { inline_keyboard: [[
          { text: "✅ Qabul", callback_data: "accept_" + order._id + "_" + telegramId },
          { text: "❌ Rad",   callback_data: "reject_" + order._id + "_" + telegramId }
        ]]}
      });
    }
    res.json({ success: true, order });

    // Create notification for admin
    await createNotification(restaurantId, "order_new",
      "🆕 Yangi buyurtma #" + String(order._id).slice(-6),
      name + " — " + total.toLocaleString() + " so'm",
      "🛒", "admin", null, { orderId: order._id }
    );
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== ADMIN AUTH ==================================
// ===================================================
app.post("/superadmin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username, role: "superadmin" });
    if (!admin) return res.status(401).json({ error: "Superadmin topilmadi" });
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });
    const token = jwt.sign({ id: admin._id, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ ok: true, token, admin: { username: admin.username, role: admin.role } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: "Foydalanuvchi topilmadi" });
    if (admin.role === "superadmin") return res.status(403).json({ error: "Superadmin uchun alohida panel" });
    if (!admin.active) return res.status(403).json({ error: "BLOCKED", message: admin.blockReason || "Xizmat to'xtatilgan", blocked: true });
    const restBlock = await isBotBlocked(admin.restaurantId);
    if (restBlock.blocked) return res.status(403).json({ error: "BLOCKED", message: restBlock.reason, blocked: true });
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });
    const token = jwt.sign({ id: admin._id, username: admin.username, role: admin.role, restaurantName: admin.restaurantName, restaurantId: admin.restaurantId }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ ok: true, token, admin: { username: admin.username, restaurantName: admin.restaurantName, role: admin.role, restaurantId: admin.restaurantId, modules: admin.modules || {} } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== SUPERADMIN ENDPOINTS ========================
// ===================================================
app.get("/superadmin/restaurants", superMiddleware, async (req, res) => {
  try {
    const admins = await Admin.find({ role: "admin" }).select("-password").sort({ createdAt: -1 });
    const rests  = await Restaurant.find({});
    const result = await Promise.all(admins.map(async (a) => {
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const rest = rests.find(r => r.restaurantId === a.restaurantId);
      return {
        ...a.toObject(),
        blocked:      rest?.blocked || false,
        blockReason:  rest?.blockReason || "",
        todayOrders:  await Order.countDocuments({ restaurantId: a.restaurantId, createdAt: { $gte: todayStart } }),
        totalOrders:  await Order.countDocuments({ restaurantId: a.restaurantId })
      };
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/superadmin/restaurants", superMiddleware, async (req, res) => {
  try {
    const { username, password, restaurantName, restaurantId, botToken, chefId, phone, address, webappUrl } = req.body;
    if (!username || !password || !restaurantName || !restaurantId)
      return res.status(400).json({ error: "username, password, restaurantName, restaurantId majburiy" });
    const exists = await Admin.findOne({ $or: [{ username }, { restaurantId, role: "admin" }] });
    if (exists) return res.status(400).json({ error: "Bu username yoki RestaurantID allaqachon mavjud" });
    const hash  = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ username, password: hash, restaurantName, restaurantId, botToken: botToken||"", chefId: Number(chefId)||0, phone: phone||"", address: address||"", webappUrl: webappUrl||"", role: "admin", active: true });
    await ensureRestaurant(restaurantId, restaurantName);
    await Category.insertMany([
      { name: "Taom",     name_ru: "Еда",     emoji: "🍽", order: 1, restaurantId },
      { name: "Ichimlik", name_ru: "Напитки", emoji: "🥤", order: 2, restaurantId }
    ]);
    if (botToken) await startBot(restaurantId, botToken, webappUrl, Number(chefId));
    await logAudit("restaurant_create", req.admin.username, "superadmin", restaurantId, "Yangi restoran: " + restaurantName);
    await createSANotif("restaurant_new", "🏪 Yangi restoran qo'shildi", restaurantName + " (ID: " + restaurantId + ")", "🏪");
    res.json({ ok: true, admin: { username: admin.username, restaurantName: admin.restaurantName, restaurantId: admin.restaurantId } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/superadmin/restaurants/:id", superMiddleware, async (req, res) => {
  try {
    const { password, active, blockReason, ...rest } = req.body;
    const update = { ...rest };
    if (password) update.password = await bcrypt.hash(password, 10);
    if (active !== undefined) update.active = active;
    if (blockReason !== undefined) update.blockReason = blockReason;
    const admin = await Admin.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password");
    if (!admin) return res.status(404).json({ error: "Topilmadi" });
    // Faqat active aniq yuborilganda blocked statusini o'zgartiramiz
    if (active !== undefined) {
      const isBlocked = active === false;
      await Restaurant.findOneAndUpdate(
        { restaurantId: admin.restaurantId },
        { blocked: isBlocked, blockReason: isBlocked ? (blockReason || "Xizmat to'xtatilgan") : "" },
        { upsert: true }
      );
    }
    if (rest.botToken) {
      await startBot(admin.restaurantId, rest.botToken, admin.webappUrl, admin.chefId);
    }
    res.json({ ok: true, admin });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/superadmin/restaurants/:id", superMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (admin) await stopBot(admin.restaurantId);
    await Admin.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Bloklash/faollashtirish — superadmin.js tomonidan chaqiriladi
app.post("/superadmin/block/:restaurantId", superMiddleware, async (req, res) => {
  try {
    const { blocked, reason } = req.body;
    await Restaurant.findOneAndUpdate(
      { restaurantId: req.params.restaurantId },
      { blocked: !!blocked, blockReason: reason || "" },
      { upsert: true }
    );
    // Agar faollashtirilsa — boti ham qayta ishga tushsin
    if (!blocked) {
      const admin = await Admin.findOne({ restaurantId: req.params.restaurantId, role: "admin" });
      if (admin && admin.botToken) {
        await startBot(admin.restaurantId, admin.botToken, admin.webappUrl, admin.chefId);
      }
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/superadmin/stats", superMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthOrders = await Order.find({ createdAt: { $gte: monthStart } });
    const perRestaurant = await Order.aggregate([
      { $group: { _id: "$restaurantId", count: { $sum: 1 }, revenue: { $sum: "$total" } } },
      { $sort: { count: -1 } }
    ]);
    res.json({
      totalRestaurants: await Admin.countDocuments({ role: "admin" }),
      totalOrders:      await Order.countDocuments(),
      todayOrders:      await Order.countDocuments({ createdAt: { $gte: todayStart } }),
      monthRevenue:     monthOrders.reduce((s,o) => s+(o.total||0), 0),
      totalUsers:       await User.countDocuments(),
      perRestaurant
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SUPERADMIN: PLATFORM ANALYTICS =====
app.get("/superadmin/analytics", superMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // 30 kunlik trend
    const dailyTrend = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dn = new Date(d); dn.setDate(dn.getDate() + 1);
      const dayOrders = await Order.countDocuments({ createdAt: { $gte: d, $lt: dn } });
      const dayRevenue = await Order.aggregate([{ $match: { createdAt: { $gte: d, $lt: dn } } }, { $group: { _id: null, total: { $sum: "$total" } } }]);
      const dayUsers = await User.countDocuments({ createdAt: { $gte: d, $lt: dn } });
      dailyTrend.push({
        date: d.toISOString().split("T")[0],
        label: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }),
        orders: dayOrders,
        revenue: dayRevenue[0]?.total || 0,
        newUsers: dayUsers
      });
    }

    // Soatlik (bugun)
    const hourly = [];
    const todayOrders = await Order.find({ createdAt: { $gte: today } });
    for (let h = 0; h < 24; h++) {
      hourly.push({ hour: h, label: String(h).padStart(2,"0")+":00", orders: todayOrders.filter(o => new Date(o.createdAt).getHours() === h).length });
    }

    // Oylik taqqoslash
    const monthOrders = await Order.countDocuments({ createdAt: { $gte: monthStart } });
    const monthRevAgg = await Order.aggregate([{ $match: { createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: "$total" } } }]);
    const monthRev = monthRevAgg[0]?.total || 0;
    const prevOrders = await Order.countDocuments({ createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd } });
    const prevRevAgg = await Order.aggregate([{ $match: { createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd } } }, { $group: { _id: null, total: { $sum: "$total" } } }]);
    const prevRev = prevRevAgg[0]?.total || 0;

    // Per-restoran performance
    const perRest = await Order.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: "$restaurantId", orders: { $sum: 1 }, revenue: { $sum: "$total" } } },
      { $sort: { revenue: -1 } }
    ]);

    // Yangi foydalanuvchilar trend
    const monthUsers = await User.countDocuments({ createdAt: { $gte: monthStart } });
    const prevMonthUsers = await User.countDocuments({ createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd } });

    res.json({
      ok: true,
      dailyTrend, hourly,
      current: { orders: monthOrders, revenue: monthRev, users: monthUsers },
      previous: { orders: prevOrders, revenue: prevRev, users: prevMonthUsers },
      ordersGrowth: prevOrders > 0 ? Math.round(((monthOrders - prevOrders) / prevOrders) * 100) : 0,
      revenueGrowth: prevRev > 0 ? Math.round(((monthRev - prevRev) / prevRev) * 100) : 0,
      perRestaurant: perRest,
      totalUsers: await User.countDocuments(),
      totalOrders: await Order.countDocuments(),
      totalRestaurants: await Admin.countDocuments({ role: "admin" })
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SUPERADMIN: AUDIT LOG =====
app.get("/superadmin/audit-log", superMiddleware, async (req, res) => {
  try {
    const { limit = 50, restaurantId, action } = req.query;
    const filter = {};
    if (restaurantId) filter.restaurantId = restaurantId;
    if (action) filter.action = action;
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
    res.json({ ok: true, logs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SUPERADMIN: PAYMENTS =====
app.get("/superadmin/payments", superMiddleware, async (req, res) => {
  try {
    const { restaurantId, limit = 50 } = req.query;
    const filter = restaurantId ? { restaurantId } : {};
    const payments = await Payment.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
    const totalReceived = await Payment.aggregate([{ $match: { type: { $ne: "refund" } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthPayments = await Payment.aggregate([{ $match: { createdAt: { $gte: monthStart }, type: { $ne: "refund" } } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
    res.json({
      ok: true, payments,
      totalReceived: totalReceived[0]?.total || 0,
      monthReceived: monthPayments[0]?.total || 0
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/superadmin/payments", superMiddleware, async (req, res) => {
  try {
    const { restaurantId, amount, type, method, days, note } = req.body;
    if (!restaurantId || !amount) return res.status(400).json({ error: "restaurantId va summa kerak" });
    const payment = await Payment.create({ restaurantId, amount: Number(amount), type: type || "subscription", method: method || "cash", days: Number(days) || 30, note, createdBy: req.admin.username });
    // Obuna muddatini uzaytirish
    if (days && type !== "refund") {
      const admin = await Admin.findOne({ restaurantId, role: "admin" });
      if (admin) {
        let newEnd = admin.subscriptionEnd && new Date(admin.subscriptionEnd) > new Date() ? new Date(admin.subscriptionEnd) : new Date();
        newEnd.setDate(newEnd.getDate() + Number(days));
        await Admin.findByIdAndUpdate(admin._id, { subscriptionEnd: newEnd, active: true });
        await Restaurant.findOneAndUpdate({ restaurantId }, { blocked: false, blockReason: "" }, { upsert: true });
      }
    }
    await logAudit("payment_add", req.admin.username, "superadmin", restaurantId, amount + " so'm — " + (type || "subscription") + " — " + (days || 0) + " kun");
    await createSANotif("payment", "💰 To'lov qabul qilindi", restaurantId + " — " + Number(amount).toLocaleString() + " so'm", "💰");
    res.json({ ok: true, payment });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SUPERADMIN: NOTIFICATIONS =====
app.get("/superadmin/notifications", superMiddleware, async (req, res) => {
  try {
    const { limit = 30, unreadOnly } = req.query;
    const filter = unreadOnly === "true" ? { read: false } : {};
    const notifs = await SANotification.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
    const unread = await SANotification.countDocuments({ read: false });
    res.json({ ok: true, notifications: notifs, unreadCount: unread });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/superadmin/notifications/read-all", superMiddleware, async (req, res) => {
  try { await SANotification.updateMany({ read: false }, { read: true }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// Superadmin → Admin'ga xabar yuborish
app.post("/superadmin/send-message", superMiddleware, async (req, res) => {
  try {
    const { restaurantIds, title, message, icon } = req.body;
    if (!restaurantIds || !restaurantIds.length || !title) return res.status(400).json({ error: "Restoran va sarlavha kerak" });
    let sent = 0;
    for (const rId of restaurantIds) {
      await createNotification(rId, "superadmin_message", title, message || "", icon || "📩", "admin", null, { from: "superadmin" });
      sent++;
    }
    await logAudit("send_message", req.admin.username, "superadmin", restaurantIds.join(","), title);
    res.json({ ok: true, sent });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin → Superadmin'ga xabar yuborish
app.post("/admin/send-to-superadmin", authMiddleware, async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title) return res.status(400).json({ error: "Sarlavha kerak" });
    await createSANotif("admin_message", "📩 " + (req.admin.restaurantName || req.admin.restaurantId) + ": " + title, message || "", "📩", { from: req.admin.restaurantId, restaurantName: req.admin.restaurantName });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SUPERADMIN: BOT MONITORING =====
app.get("/superadmin/bots", superMiddleware, async (req, res) => {
  try {
    const admins = await Admin.find({ role: "admin" }).select("restaurantId restaurantName botToken active");
    const botStatus = admins.map(a => ({
      restaurantId: a.restaurantId,
      restaurantName: a.restaurantName,
      hasToken: !!a.botToken,
      isRunning: !!bots[a.restaurantId],
      isActive: a.active !== false
    }));
    res.json({ ok: true, bots: botStatus, runningCount: Object.keys(bots).length, totalCount: admins.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/superadmin/bots/:restaurantId/restart", superMiddleware, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const admin = await Admin.findOne({ restaurantId, role: "admin" });
    if (!admin || !admin.botToken) return res.status(400).json({ error: "Bot token yo'q" });
    await stopBot(restaurantId);
    await startBot(restaurantId, admin.botToken, admin.webappUrl, admin.chefId);
    await logAudit("bot_restart", req.admin.username, "superadmin", restaurantId, "Bot qayta ishga tushirildi");
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/superadmin/bots/:restaurantId/stop", superMiddleware, async (req, res) => {
  try {
    await stopBot(req.params.restaurantId);
    await logAudit("bot_stop", req.admin.username, "superadmin", req.params.restaurantId, "Bot to'xtatildi");
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SUPERADMIN: SETTINGS =====
app.put("/superadmin/change-password", superMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Ikkala maydon kerak" });
    const admin = await Admin.findById(req.admin.id);
    const ok = await bcrypt.compare(currentPassword, admin.password);
    if (!ok) return res.status(400).json({ error: "Joriy parol noto'g'ri" });
    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    await logAudit("password_change", req.admin.username, "superadmin", "", "Parol o'zgartirildi");
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== ADMIN ENDPOINTS =============================
// ===================================================
app.get("/admin/products", authMiddleware, async (req, res) => {
  try {
    res.json(await Product.find({ restaurantId: req.admin.restaurantId }).sort({ id: 1 }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/products", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const last = await Product.findOne({ restaurantId: rId }).sort({ id: -1 });
    let newId = last ? (Number(last.id) || 0) + 1 : 1;
    while (await Product.findOne({ id: newId, restaurantId: rId })) { newId++; }
    const bodyData = { ...req.body };
    delete bodyData._id; delete bodyData.__v; delete bodyData.id;
    const product = await Product.create({ ...bodyData, id: newId, restaurantId: rId });
    res.json({ ok: true, product });
  } catch(e) {
    console.error("POST /admin/products xato:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/admin/products/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate({ id: Number(req.params.id), restaurantId: req.admin.restaurantId }, req.body, { new: true });
    res.json({ ok: true, product });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/products/:id", authMiddleware, async (req, res) => {
  try {
    await Product.findOneAndDelete({ id: Number(req.params.id), restaurantId: req.admin.restaurantId });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/categories", authMiddleware, async (req, res) => {
  try {
    res.json(await Category.find({ restaurantId: req.admin.restaurantId }).sort({ order: 1 }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/categories", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const last = await Category.findOne({ restaurantId: rId }).sort({ order: -1 });
    const cat  = await Category.create({ ...req.body, order: last ? last.order + 1 : 1, restaurantId: rId });
    res.json({ ok: true, cat });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/categories/:id", authMiddleware, async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ok: true, cat });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/categories/:id", authMiddleware, async (req, res) => {
  try { await Category.findByIdAndDelete(req.params.id); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/categories/reorder/save", authMiddleware, async (req, res) => {
  try {
    await Promise.all(req.body.order.map(item => Category.findByIdAndUpdate(item.id, { order: item.order })));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/orders", authMiddleware, async (req, res) => {
  try {
    const { status, type, limit = 50, skip = 0 } = req.query;
    const filter = { restaurantId: req.admin.restaurantId };
    if (status) filter.status = status;
    if (type)   filter.orderType = type;
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).skip(Number(skip));
    res.json({ orders, total: await Order.countDocuments(filter) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/orders/:id/status", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ ok: true, order });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/stats", authMiddleware, async (req, res) => {
  try {
    // Superadmin query param orqali istalgan restoran statsini ko'ra oladi
    const rId  = (req.admin.role === "superadmin" && req.query.restaurantId) ? req.query.restaurantId : req.admin.restaurantId;
    const now  = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: today } });
    const monthOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: month } });
    const ratedOrders = await Order.find({ restaurantId: rId, rating: { $ne: null } });
    const weeklyData  = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dn = new Date(d);    dn.setDate(dn.getDate() + 1);
      const dayOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: d, $lt: dn } });
      weeklyData.push({ date: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }), orders: dayOrders.length, revenue: dayOrders.reduce((s,o) => s+(o.total||0), 0) });
    }
    const topProducts = await Order.aggregate([
      { $match: { restaurantId: rId } }, { $unwind: "$items" },
      { $group: { _id: "$items.name", total: { $sum: { $multiply: ["$items.price","$items.quantity"] } }, quantity: { $sum: "$items.quantity" } } },
      { $sort: { quantity: -1 } }, { $limit: 5 }
    ]);
    res.json({
      today:      { orders: todayOrders.length, revenue: todayOrders.reduce((s,o)=>s+(o.total||0),0), online: todayOrders.filter(o=>o.orderType==="online").length, dineIn: todayOrders.filter(o=>o.orderType==="dine_in").length },
      month:      { orders: monthOrders.length, revenue: monthOrders.reduce((s,o)=>s+(o.total||0),0) },
      weekly:     weeklyData, topProducts,
      rating:     { avg: ratedOrders.length ? (ratedOrders.reduce((s,o)=>s+o.rating,0)/ratedOrders.length).toFixed(1) : null, count: ratedOrders.length },
      totalUsers: await User.countDocuments({ restaurantId: rId }),
      statusStats: await Order.aggregate([{ $match: { restaurantId: rId } }, { $group: { _id: "$status", count: { $sum: 1 } } }])
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/users", authMiddleware, async (req, res) => {
  try { res.json(await User.find({ restaurantId: req.admin.restaurantId }).sort({ createdAt: -1 }).limit(100)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/broadcast", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const { text, imageBase64 } = req.body;
    if (!text && !imageBase64) return res.status(400).json({ error: "Matn yoki rasm kerak" });
    const users = await User.find({ restaurantId: rId, telegramId: { $exists: true } });
    let sent = 0, failed = 0, cachedId = null;
    for (const user of users) {
      try {
        const tgId = Number(user.telegramId);
        if (!tgId || !bots[rId]) { failed++; continue; }
        if (imageBase64 || cachedId) {
          const src = cachedId || Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/,""), "base64");
          const msg = await bots[rId].sendPhoto(tgId, src, { caption: text||"" });
          if (!cachedId && msg.photo) cachedId = msg.photo[msg.photo.length-1].file_id;
        } else {
          await bots[rId].sendMessage(tgId, text, { parse_mode: "HTML" });
        }
        sent++;
        await new Promise(r => setTimeout(r, 50));
      } catch(e) { failed++; }
    }
    res.json({ ok: true, sent, failed, total: users.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/branches", authMiddleware, async (req, res) => {
  try { res.json({ ok: true, branches: await Branch.find({ restaurantId: req.admin.restaurantId, active: true }).sort({ name: 1 }) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/branches", authMiddleware, async (req, res) => {
  try {
    const { name, address, lat, lng, radius } = req.body;
    if (!name) return res.status(400).json({ error: "Filial nomi kerak" });
    const branch = await Branch.create({ name, address, lat, lng, radius: radius||100, restaurantId: req.admin.restaurantId });
    res.json({ ok: true, branch });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/branches/:id", authMiddleware, async (req, res) => {
  try { res.json({ ok: true, branch: await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true }) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/branches/:id", authMiddleware, async (req, res) => {
  try { await Branch.findByIdAndUpdate(req.params.id, { active: false }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/employees", authMiddleware, async (req, res) => {
  try { res.json(await Employee.find({ restaurantId: req.admin.restaurantId }).select("-password").sort({ name: 1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/employees", authMiddleware, async (req, res) => {
  try {
    const { name, phone, position, username, password, salary, workStart, workEnd, telegramId, branchId, weeklyOff, photo, faceDescriptor, role, tables } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });
    const hash = await bcrypt.hash(password, 10);
    const emp  = await Employee.create({ name, phone, position, username, password: hash, salary: salary||0, workStart: workStart||"09:00", workEnd: workEnd||"18:00", telegramId: telegramId||null, branchId: branchId||null, weeklyOff: weeklyOff||"sunday", photo: photo||null, faceDescriptor: faceDescriptor||[], role: role||"employee", tables: tables||[], restaurantId: req.admin.restaurantId, active: true });
    res.json({ ok: true, employee: { ...emp.toObject(), password: undefined } });
  } catch(e) {
    if (e.code === 11000) return res.status(400).json({ error: "Bu username band" });
    res.status(500).json({ error: e.message });
  }
});

app.put("/admin/employees/:id", authMiddleware, async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.password) data.password = await bcrypt.hash(data.password, 10);
    else delete data.password;
    res.json({ ok: true, employee: await Employee.findByIdAndUpdate(req.params.id, data, { new: true }).select("-password") });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/employees/:id", authMiddleware, async (req, res) => {
  try {
    await Attendance.deleteMany({ employeeId: req.params.id });
    await Employee.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/employees/:id/face", authMiddleware, async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id).select("name photo faceDescriptor");
    if (!emp) return res.status(404).json({ error: "Topilmadi" });
    res.json({ ok: true, name: emp.name, photo: emp.photo, faceDescriptor: emp.faceDescriptor });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/employees/:id/face", authMiddleware, async (req, res) => {
  try {
    await Employee.findByIdAndUpdate(req.params.id, { photo: req.body.photo, faceDescriptor: req.body.faceDescriptor });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/attendance/today", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const { branchId, date } = req.query;
    const today = date || new Date().toISOString().split("T")[0];
    const empFilter = { restaurantId: rId, active: true };
    if (branchId) empFilter.branchId = branchId;
    const employees   = await Employee.find(empFilter).select("-password").populate("branchId","name");
    const attendances = await Attendance.find({ restaurantId: rId, date: today });
    const dayNames    = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const todayDay    = dayNames[new Date(today).getDay()];
    const result = employees.map(emp => {
      const att = attendances.find(a => a.employeeId.toString() === emp._id.toString());
      const isOff = emp.weeklyOff === todayDay;
      return { employee: emp, attendance: att||null, status: att?.status||(isOff?"dam":"kelmadi"), isWeeklyOff: isOff, checkIn: att?.checkIn||null, checkOut: att?.checkOut||null, lateMinutes: att?.lateMinutes||0, totalMinutes: att?.totalMinutes||0, overtimeMinutes: att?.overtimeMinutes||0 };
    });
    const summary = { total: employees.length, came: result.filter(r=>r.status==="keldi").length, absent: result.filter(r=>r.status==="kelmadi").length, late: result.filter(r=>r.lateMinutes>0).length, dayOff: result.filter(r=>r.isWeeklyOff).length, overtime: result.filter(r=>r.overtimeMinutes>0).length, working: result.filter(r=>r.checkIn&&!r.checkOut).length };
    res.json({ ok: true, today, employees: result, summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/attendance/report", authMiddleware, async (req, res) => {
  try {
    const rId    = req.admin.restaurantId;
    const prefix = req.query.month || new Date().toISOString().slice(0, 7);
    const filter = { restaurantId: rId, date: { $regex: "^" + prefix } };
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    const records   = await Attendance.find(filter).populate("employeeId","name position salary").sort({ date: 1 });
    const employees = await Employee.find({ restaurantId: rId, active: true }).select("-password");
    const report = employees.map(emp => {
      const empRecords = records.filter(r => r.employeeId?._id?.toString() === emp._id.toString());
      const workedDays = empRecords.filter(r => r.status === "keldi").length;
      const workingDaysInMonth = calcWorkingDays(prefix, emp.weeklyOff);
      const dailySalary  = emp.salary > 0 ? emp.salary / workingDaysInMonth : 0;
      const earnedSalary = Math.round(dailySalary * workedDays);
      return {
        employee: { id: emp._id, name: emp.name, position: emp.position, salary: emp.salary, weeklyOff: emp.weeklyOff },
        stats: { workingDaysInMonth, workedDays, totalDays: empRecords.length, totalMinutes: empRecords.reduce((s,r)=>s+(r.totalMinutes||0),0), lateCount: empRecords.filter(r=>r.lateMinutes>0).length, absentCount: empRecords.filter(r=>r.status==="kelmadi").length, overtimeMin: empRecords.reduce((s,r)=>s+(r.overtimeMinutes||0),0), dailySalary: Math.round(dailySalary), earnedSalary },
        records: empRecords
      };
    });
    res.json({ ok: true, month: prefix, report });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/attendance/manual", authMiddleware, async (req, res) => {
  try {
    const { employeeId, date, status, checkIn, checkOut, note } = req.body;
    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ error: "Ishchi topilmadi" });
    let totalMinutes = 0;
    if (checkIn && checkOut) {
      const [ih,im] = checkIn.split(":").map(Number);
      const [oh,om] = checkOut.split(":").map(Number);
      totalMinutes = (oh*60+om) - (ih*60+im);
    }
    const att = await Attendance.findOneAndUpdate({ employeeId, date }, { employeeId, restaurantId: emp.restaurantId, date, status: status||"keldi", checkIn, checkOut, totalMinutes, note }, { upsert: true, new: true });
    res.json({ ok: true, attendance: att });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/attendance/branches-summary", authMiddleware, async (req, res) => {
  try {
    const rId   = req.admin.restaurantId;
    const today = new Date().toISOString().split("T")[0];
    const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const todayDay = dayNames[new Date(today).getDay()];
    const branches    = await Branch.find({ restaurantId: rId, active: true });
    const employees   = await Employee.find({ restaurantId: rId, active: true }).select("-password");
    const attendances = await Attendance.find({ restaurantId: rId, date: today });
    const result = branches.map(branch => {
      const branchEmps = employees.filter(e => e.branchId?.toString() === branch._id.toString());
      const branchAtts = attendances.filter(a => branchEmps.some(e => e._id.toString() === a.employeeId.toString()));
      const came = branchAtts.filter(a => a.status === "keldi").length;
      const dayOff = branchEmps.filter(e => e.weeklyOff === todayDay).length;
      return { branch: { id: branch._id, name: branch.name, address: branch.address }, total: branchEmps.length, came, late: branchAtts.filter(a=>a.lateMinutes>0).length, absent: Math.max(0, branchEmps.length - came - dayOff), dayOff };
    });
    const noBranch = employees.filter(e => !e.branchId);
    if (noBranch.length > 0) {
      const nbAtts = attendances.filter(a => noBranch.some(e => e._id.toString() === a.employeeId.toString()));
      const came   = nbAtts.filter(a => a.status === "keldi").length;
      const dayOff = noBranch.filter(e => e.weeklyOff === todayDay).length;
      result.push({ branch: { id: null, name: "Filialsiz ishchilar", address: "" }, total: noBranch.length, came, late: nbAtts.filter(a=>a.lateMinutes>0).length, absent: Math.max(0, noBranch.length - came - dayOff), dayOff });
    }
    res.json({ ok: true, today, summary: result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== INVENTORY ENDPOINTS =========================
// ===================================================
app.get("/admin/inventory", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const items = await Inventory.find({ restaurantId: rId, active: true }).populate("productId", "name name_ru price image active").sort({ productName: 1 });
    const lowStock = items.filter(i => i.currentStock <= i.minStock);
    res.json({ ok: true, items, lowStockCount: lowStock.length, totalItems: items.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/inventory", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const { productId, productName, unit, currentStock, minStock, maxStock, costPrice } = req.body;
    if (!productName) return res.status(400).json({ error: "Mahsulot nomi kerak" });
    const item = await Inventory.create({
      productId: productId || null, restaurantId: rId, productName, unit: unit || "dona",
      currentStock: currentStock || 0, minStock: minStock || 5, maxStock: maxStock || 1000,
      costPrice: costPrice || 0, lastRestocked: new Date(), active: true
    });
    res.json({ ok: true, item });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/inventory/:id", authMiddleware, async (req, res) => {
  try {
    const item = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ok: true, item });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/inventory/:id", authMiddleware, async (req, res) => {
  try {
    await Inventory.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ombor kirim/chiqim
app.post("/admin/inventory/:id/stock", authMiddleware, async (req, res) => {
  try {
    const { type, quantity, note } = req.body;
    if (!type || !quantity) return res.status(400).json({ error: "Turi va miqdor kerak" });
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Topilmadi" });

    let newStock = item.currentStock;
    if (type === "in") { newStock += Number(quantity); item.lastRestocked = new Date(); }
    else if (type === "out") { newStock = Math.max(0, newStock - Number(quantity)); }
    else if (type === "adjust") { newStock = Number(quantity); }

    item.currentStock = newStock;
    await item.save();

    await InventoryLog.create({
      inventoryId: item._id, restaurantId: item.restaurantId,
      type, quantity: Number(quantity), note: note || "",
      createdBy: req.admin.username || "admin"
    });

    // Kam qolsa notification
    if (newStock <= item.minStock) {
      await createNotification(item.restaurantId, "stock_low",
        "⚠️ Kam qoldi: " + item.productName,
        item.productName + " — faqat " + newStock + " " + item.unit + " qoldi!",
        "📦", "admin"
      );
    }

    res.json({ ok: true, item, newStock });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/inventory/:id/logs", authMiddleware, async (req, res) => {
  try {
    const logs = await InventoryLog.find({ inventoryId: req.params.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ ok: true, logs });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Inventory summary
app.get("/admin/inventory/summary/all", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const items = await Inventory.find({ restaurantId: rId, active: true });
    const totalValue = items.reduce((s, i) => s + (i.currentStock * i.costPrice), 0);
    const lowStock = items.filter(i => i.currentStock <= i.minStock);
    const outOfStock = items.filter(i => i.currentStock === 0);
    res.json({
      ok: true,
      totalItems: items.length,
      totalValue: Math.round(totalValue),
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      lowStockItems: lowStock.map(i => ({ name: i.productName, stock: i.currentStock, min: i.minStock, unit: i.unit }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== NOTIFICATION ENDPOINTS ======================
// ===================================================
app.get("/admin/notifications", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const { limit = 30, unreadOnly } = req.query;
    const filter = { restaurantId: rId, targetRole: "admin" };
    if (unreadOnly === "true") filter.read = false;
    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
    const unreadCount = await Notification.countDocuments({ restaurantId: rId, targetRole: "admin", read: false });
    res.json({ ok: true, notifications, unreadCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/notifications/read-all", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany({ restaurantId: req.admin.restaurantId, targetRole: "admin", read: false }, { read: true });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/notifications/clear", authMiddleware, async (req, res) => {
  try {
    await Notification.deleteMany({ restaurantId: req.admin.restaurantId, targetRole: "admin", read: true });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== SITE SETTINGS ENDPOINTS =====================
// ===================================================
app.get("/admin/site-settings", authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findOne({ restaurantId: req.admin.restaurantId, role: "admin" })
      .select("restaurantName phone address addressRu botUsername adminTg metro metroRu workHours workHoursRu nameRu heroBadge heroBadgeRu subtitle subtitleRu workStart workEnd mapEmbed heroImage eventsBg gallery theme webappUrl");
    res.json({ ok: true, settings: admin || {} });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/site-settings", authMiddleware, async (req, res) => {
  try {
    const allowed = ["restaurantName","phone","address","addressRu","botUsername","adminTg","metro","metroRu","workHours","workHoursRu","nameRu","heroBadge","heroBadgeRu","subtitle","subtitleRu","workStart","workEnd","mapEmbed","heroImage","eventsBg","gallery","theme","webappUrl"];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const admin = await Admin.findOneAndUpdate(
      { restaurantId: req.admin.restaurantId, role: "admin" },
      update, { new: true }
    ).select("-password");
    res.json({ ok: true, admin });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== DYNAMIC SITE GENERATOR ======================
// ===================================================
const THEME_COLORS = {
  gold:    { primary: "#d4aa4e", primary2: "#f0d080", dark: "#0d0a07", dark2: "#15110c", dark3: "#1e1710", card: "#1a1410", border: "rgba(212,170,78,0.3)", text: "#faf3e0", muted: "#b09a7a" },
  emerald: { primary: "#34d399", primary2: "#6ee7b7", dark: "#041f1a", dark2: "#0a2e24", dark3: "#10382d", card: "#0d2b22", border: "rgba(52,211,153,0.3)", text: "#ecfdf5", muted: "#86b5a3" },
  ruby:    { primary: "#e53935", primary2: "#ff7961", dark: "#1a0505", dark2: "#2a0a0a", dark3: "#3a1010", card: "#2a0c0c", border: "rgba(229,57,53,0.3)", text: "#fff1f0", muted: "#c19090" },
  ocean:   { primary: "#06b6d4", primary2: "#67e8f9", dark: "#041a20", dark2: "#082830", dark3: "#0c3540", card: "#0a2a35", border: "rgba(6,182,212,0.3)", text: "#ecfeff", muted: "#80b8c5" },
  violet:  { primary: "#8b5cf6", primary2: "#a78bfa", dark: "#0f0720", dark2: "#180f30", dark3: "#201540", card: "#1a1035", border: "rgba(139,92,246,0.3)", text: "#f5f3ff", muted: "#a89bc5" }
};

app.get("/site/:restaurantId", async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const rest = await Restaurant.findOne({ restaurantId });
    if (!rest) return res.status(404).send("Restoran topilmadi");
    if (rest.blocked) return res.send('<html><body style="background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center"><div><h1>🔒</h1><p>' + (rest.blockReason || 'Vaqtincha yopiq') + '</p></div></body></html>');

    const admin = await Admin.findOne({ restaurantId, role: "admin" });
    if (!admin) return res.status(404).send("Admin topilmadi");

    const theme = THEME_COLORS[admin.theme] || THEME_COLORS.gold;
    const cfg = {
      API_URL: "https://" + (DOMAIN || req.get("host")),
      RESTAURANT_ID: restaurantId,
      BOT_USERNAME: admin.botUsername || "",
      ADMIN_TG: admin.adminTg || admin.username || "",
      PHONE: admin.phone || "",
      ADDRESS_UZ: admin.address || "",
      ADDRESS_RU: admin.addressRu || admin.address || "",
      METRO_UZ: admin.metro || "",
      METRO_RU: admin.metroRu || admin.metro || "",
      WORK_HOURS_UZ: admin.workHours || "Du–Ju: 10:00–23:00  |  Sh–Ya: 09:00–00:00",
      WORK_HOURS_RU: admin.workHoursRu || admin.workHours || "",
      REST_NAME_UZ: admin.restaurantName || restaurantId,
      REST_NAME_RU: admin.nameRu || admin.restaurantName || restaurantId,
      HERO_BADGE_UZ: admin.heroBadge || "O'zbekiston",
      HERO_BADGE_RU: admin.heroBadgeRu || admin.heroBadge || "",
      SUBTITLE_UZ: admin.subtitle || "Eng yaxshi ta'm — eng yaxshi xizmat",
      SUBTITLE_RU: admin.subtitleRu || admin.subtitle || "",
      WORK_START: admin.workStart || 10,
      WORK_END: admin.workEnd || 23,
      MAP_EMBED: admin.mapEmbed || "",
      GALLERY: admin.gallery || [],
      HERO_IMAGE: admin.heroImage || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&q=80",
      EVENTS_BG: admin.eventsBg || "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1400&q=80"
    };

    const restName = admin.restaurantName || restaurantId;

    const html = `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${restName}</title>
  <meta name="description" content="${cfg.SUBTITLE_UZ}"/>
  <meta property="og:title" content="${restName}"/>
  <meta property="og:description" content="${cfg.SUBTITLE_UZ}"/>
  ${cfg.HERO_IMAGE ? '<meta property="og:image" content="' + cfg.HERO_IMAGE + '"/>' : ''}
<script>
  window.__CONFIG__ = ${JSON.stringify(cfg)};
</script>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Cormorant+Garamond:wght@300;400;500&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --gold: ${theme.primary}; --gold2: ${theme.primary2};
      --dark: ${theme.dark}; --dark2: ${theme.dark2}; --dark3: ${theme.dark3};
      --card: ${theme.card}; --border: ${theme.border};
      --text: ${theme.text}; --muted: ${theme.muted};
      --tg-bg: ${theme.dark};
      --accent-color: ${theme.primary}; --accent-dark: ${theme.primary};
      --accent-border: ${theme.border}; --accent-bg: rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},0.12);
      --glow: 0 0 40px ${theme.border};
    }
    *{margin:0;padding:0;box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{background:var(--dark);color:var(--text);font-family:'Jost',sans-serif;font-weight:400;overflow-x:hidden}
    ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:var(--dark)} ::-webkit-scrollbar-thumb{background:var(--gold);border-radius:2px}
    .reveal{opacity:0;transform:translateY(30px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
    .reveal.visible{opacity:1;transform:translateY(0)}
    .particles-container{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
    .particle{position:absolute;width:2px;height:2px;background:var(--gold);border-radius:50%;opacity:0;animation:float-up linear infinite}
    @keyframes float-up{0%{opacity:0;transform:translateY(100vh) scale(0)}10%{opacity:.6}90%{opacity:.2}100%{opacity:0;transform:translateY(-10vh) scale(1)}}
    body::after{content:'';position:fixed;inset:0;z-index:999;pointer-events:none;opacity:.025;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
    .gold-line{display:flex;align-items:center;gap:12px;justify-content:center;margin:8px 0}
    .gold-line::before,.gold-line::after{content:'';flex:1;max-width:60px;height:1px;background:linear-gradient(90deg,transparent,var(--gold))}
    .gold-line::after{background:linear-gradient(90deg,var(--gold),transparent)}
    .gold-line span{color:var(--gold);font-size:14px}
    .topbar{position:fixed;top:0;left:0;right:0;z-index:40;background:rgba(13,10,7,0);backdrop-filter:blur(0);border-bottom:1px solid transparent;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;transition:all .4s cubic-bezier(.22,1,.36,1)}
    .topbar.scrolled{background:${theme.dark}ee;backdrop-filter:blur(20px) saturate(1.2);border-bottom:1px solid var(--border);padding:10px 20px;box-shadow:0 8px 32px rgba(0,0,0,.4)}
    .topbar-logo{font-family:'Playfair Display',serif;font-size:18px;color:var(--gold);font-weight:600;cursor:pointer}
    .topbar-actions{display:flex;gap:8px;align-items:center}
    .icon-btn{background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.08);border:1px solid var(--border);color:var(--gold2);width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;transition:all .25s;position:relative}
    .icon-btn:hover{background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.2);transform:translateY(-2px);box-shadow:var(--glow)}
    .badge{position:absolute;top:-6px;right:-6px;background:var(--gold);color:var(--dark);font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;animation:pulse-badge 2s infinite}
    @keyframes pulse-badge{0%,100%{box-shadow:0 0 0 0 ${theme.border}}50%{box-shadow:0 0 0 6px transparent}}
    .lang-switcher{display:flex;gap:2px;background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.08);border:1px solid var(--border);border-radius:10px;padding:3px}
    .lang-btn{font-family:'Jost',sans-serif;font-size:11px;font-weight:500;letter-spacing:1px;padding:5px 10px;border-radius:7px;border:none;cursor:pointer;transition:all .25s;color:var(--muted);background:transparent}
    .lang-btn.active{background:var(--gold);color:var(--dark);font-weight:600}
    .lang-btn:hover:not(.active){color:var(--gold2)}
    .hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px 56px;text-align:center;position:relative}
    .hero::after{content:'';position:absolute;bottom:0;left:0;right:0;height:120px;background:linear-gradient(to bottom,transparent,var(--dark));pointer-events:none}
    .hero-badge{font-family:'Cormorant Garamond',serif;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:16px;border:1px solid var(--border);padding:5px 18px;border-radius:2px;animation:fadeDown 1s ease .2s both}
    @keyframes fadeDown{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}
    .hero h1{font-family:'Playfair Display',serif;font-size:clamp(36px,10vw,64px);font-weight:700;line-height:1.1;background:linear-gradient(135deg,var(--gold2) 0%,var(--gold) 50%,${theme.muted} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:fadeUp 1s ease .4s both}
    .hero p{font-family:'Cormorant Garamond',serif;font-size:19px;color:rgba(250,243,224,.9);margin-top:10px;letter-spacing:1px;animation:fadeUp 1s ease .6s both}
    .hero-btns{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;justify-content:center;animation:fadeUp 1s ease .8s both}
    .hero-btn{padding:11px 28px;background:transparent;border:1px solid var(--gold);color:var(--gold);font-family:'Jost',sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;border-radius:2px;cursor:pointer;transition:all .3s;position:relative;overflow:hidden}
    .hero-btn::before{content:'';position:absolute;inset:0;background:var(--gold);transform:scaleX(0);transform-origin:left;transition:transform .3s;z-index:-1}
    .hero-btn:hover::before,.hero-btn.filled::before{transform:scaleX(1)}
    .hero-btn:hover,.hero-btn.filled{color:var(--dark)}
    .scroll-indicator{position:absolute;bottom:32px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;animation:fadeUp 1s ease 1.2s both;z-index:1}
    .scroll-indicator span{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--muted)}
    .scroll-mouse{width:20px;height:30px;border:1.5px solid var(--gold);border-radius:10px;position:relative}
    .scroll-mouse::after{content:'';position:absolute;top:6px;left:50%;transform:translateX(-50%);width:2px;height:6px;background:var(--gold);border-radius:1px;animation:scroll-wheel 1.5s infinite}
    @keyframes scroll-wheel{0%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(8px)}}
    .section-title{text-align:center;padding:48px 20px 12px}
    .section-title .sub{font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:4px;text-transform:uppercase;color:var(--gold);display:block;margin-bottom:6px}
    .section-title h2{font-family:'Playfair Display',serif;font-size:clamp(26px,6vw,36px);font-weight:600}
    .filter-tabs{display:flex;gap:8px;justify-content:center;padding:16px 20px;flex-wrap:wrap}
    .tab-btn{font-family:'Jost',sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:7px 20px;border-radius:2px;cursor:pointer;border:1px solid var(--border);color:var(--muted);background:transparent;transition:all .3s}
    .tab-btn.active,.tab-btn:hover{background:var(--gold);color:var(--dark);border-color:var(--gold);font-weight:500}
    .product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;padding:8px 16px 40px}
    .product-card{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;transition:all .35s cubic-bezier(.22,1,.36,1)}
    .product-card:hover{transform:translateY(-6px);box-shadow:0 20px 48px ${theme.border},var(--glow)}
    .product-card img{width:100%;height:140px;object-fit:cover;display:block;transition:transform .5s}
    .product-card:hover img{transform:scale(1.06)}
    .img-placeholder{width:100%;height:140px;background:linear-gradient(135deg,var(--dark3),var(--dark2));display:flex;align-items:center;justify-content:center;font-size:36px}
    .product-info{padding:12px}
    .product-info h3{font-family:'Playfair Display',serif;font-size:15px;font-weight:600;margin-bottom:2px}
    .product-info .cat{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
    .product-info .price{font-family:'Cormorant Garamond',serif;font-size:17px;color:var(--gold);display:block;margin-bottom:10px}
    .add-btn{width:100%;padding:8px;background:linear-gradient(135deg,var(--gold),${theme.muted});color:var(--dark);font-family:'Jost',sans-serif;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;border:none;border-radius:6px;cursor:pointer;transition:all .25s}
    .add-btn:hover{opacity:.85;transform:translateY(-1px);box-shadow:0 4px 16px ${theme.border}}
    .product-soldout{pointer-events:none;opacity:.85}
    .product-soldout img{filter:grayscale(70%) brightness(.6)}
    .soldout-label{width:100%;padding:10px;text-align:center;background:rgba(200,168,78,.08);border:1px solid rgba(200,168,78,.15);color:var(--muted);font-size:9px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;border-radius:6px}
    .events-section{position:relative;overflow:hidden;background:linear-gradient(to bottom,var(--dark) 0%,var(--dark2) 50%,var(--dark) 100%);padding-bottom:56px}
    .events-bg{position:absolute;inset:0;z-index:0;opacity:.07;background-size:cover;background-position:center}
    .events-inner{position:relative;z-index:1}
    .events-slider{overflow:hidden}
    .events-track{display:flex;transition:transform .5s cubic-bezier(.4,0,.2,1)}
    .event-slide{min-width:100%;display:flex;flex-direction:column;align-items:center;padding:0 20px 8px}
    .event-img-wrap{width:100%;max-width:420px;height:220px;border-radius:8px;overflow:hidden;border:1px solid var(--border);margin-bottom:24px;box-shadow:0 16px 48px rgba(0,0,0,.5)}
    .event-img-wrap img{width:100%;height:100%;object-fit:cover;display:block}
    .event-content{width:100%;max-width:420px;text-align:center}
    .event-price{font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:3px;color:var(--gold);text-transform:uppercase;margin-bottom:8px;display:block}
    .event-title{font-family:'Playfair Display',serif;font-size:clamp(22px,5vw,30px);font-weight:600;margin-bottom:12px}
    .event-desc{font-family:'Cormorant Garamond',serif;font-size:16px;color:rgba(250,243,224,.82);line-height:1.7;margin-bottom:18px}
    .event-features{list-style:none;margin-bottom:22px}
    .event-features li{font-size:13px;color:var(--muted);padding:6px 0;border-bottom:1px solid rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.08);display:flex;align-items:center;gap:8px;justify-content:center}
    .event-features li::before{content:'✦';color:var(--gold);font-size:9px}
    .event-book-btn{display:inline-block;padding:11px 32px;background:transparent;border:1px solid var(--gold);color:var(--gold);font-family:'Jost',sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;border-radius:2px;cursor:pointer;transition:all .2s}
    .event-book-btn:hover{background:var(--gold);color:var(--dark)}
    .slider-dots{display:flex;justify-content:center;gap:8px;margin-top:24px}
    .dot{width:8px;height:8px;border-radius:50%;background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.25);border:none;cursor:pointer;transition:all .3s;padding:0}
    .dot.active{background:var(--gold);transform:scale(1.3)}
    .slider-arrows{display:flex;justify-content:center;gap:12px;margin-top:16px}
    .arrow-btn{width:40px;height:40px;border-radius:50%;background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.08);border:1px solid var(--border);color:var(--gold2);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
    .arrow-btn:hover{background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.2)}
    .gallery-section{padding-bottom:56px}
    .gallery-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:12px 16px 0}
    .gallery-item{aspect-ratio:1;overflow:hidden;border-radius:6px;cursor:pointer;border:1px solid var(--border);position:relative}
    .gallery-item img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
    .gallery-item:hover img{transform:scale(1.08)}
    .gallery-item .overlay-icon{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:22px;opacity:0;transition:opacity .25s;border-radius:6px}
    .gallery-item:hover .overlay-icon{opacity:1}
    .lightbox{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.95);display:none;align-items:center;justify-content:center;padding:20px}
    .lightbox.open{display:flex}
    .lightbox img{max-width:100%;max-height:88vh;border-radius:8px;border:1px solid var(--border)}
    .lightbox-close{position:absolute;top:16px;right:16px;background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.15);border:1px solid var(--border);color:var(--gold2);width:40px;height:40px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1}
    .lb-prev,.lb-next{position:absolute;top:50%;transform:translateY(-50%);background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.1);border:1px solid var(--border);color:var(--gold2);width:44px;height:44px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;z-index:1}
    .lb-prev{left:12px} .lb-next{right:12px}
    .location-section{padding-bottom:56px}
    .location-card{margin:16px;border-radius:10px;overflow:hidden;border:1px solid var(--border);background:var(--card)}
    .map-frame{width:100%;height:220px;border:none;display:block;filter:grayscale(20%) contrast(1.05)}
    .location-info{padding:20px}
    .location-row{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.1)}
    .location-row:last-child{border-bottom:none}
    .loc-icon{font-size:18px;margin-top:1px;flex-shrink:0}
    .loc-label{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:3px}
    .loc-val{font-family:'Cormorant Garamond',serif;font-size:15px;color:var(--text);line-height:1.5}
    .loc-val a{color:var(--gold2);text-decoration:none}
    .panel{position:fixed;top:0;right:0;height:100%;width:min(340px,100vw);background:var(--dark2);border-left:1px solid var(--border);z-index:50;transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);overflow-y:auto;display:flex;flex-direction:column}
    .panel.open{transform:translateX(0)}
    .panel-header{display:flex;align-items:center;justify-content:space-between;padding:20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--dark2);z-index:2}
    .panel-header h2{font-family:'Playfair Display',serif;font-size:20px;color:var(--gold)}
    .close-btn{background:transparent;border:1px solid var(--border);color:var(--muted);width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .2s}
    .close-btn:hover{color:var(--text);border-color:var(--gold)}
    .cart-item{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.08)}
    .cart-item-name{font-size:14px;margin-bottom:2px}
    .cart-item-price{font-family:'Cormorant Garamond',serif;font-size:15px;color:var(--gold)}
    .qty-controls{display:flex;align-items:center;gap:8px}
    .qty-btn{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.08);color:var(--gold2);font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
    .qty-btn:hover{background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.2)}
    .qty-num{font-size:14px;font-weight:500;min-width:20px;text-align:center}
    .cart-footer{margin-top:auto;padding:20px;border-top:1px solid var(--border);position:sticky;bottom:0;background:var(--dark2)}
    .cart-total-row{display:flex;justify-content:space-between;font-family:'Cormorant Garamond',serif;font-size:20px;margin-bottom:14px}
    .cart-total-row span:last-child{color:var(--gold)}
    .checkout-btn{width:100%;padding:14px;background:linear-gradient(135deg,var(--gold),${theme.muted});color:var(--dark);font-family:'Jost',sans-serif;font-weight:500;font-size:12px;letter-spacing:3px;text-transform:uppercase;border:none;border-radius:4px;cursor:pointer;transition:opacity .2s}
    .checkout-btn:hover{opacity:.85} .checkout-btn:disabled{opacity:.5;cursor:not-allowed}
    .profile-card{margin:20px;padding:20px;background:var(--card);border:1px solid var(--border);border-radius:8px}
    .profile-avatar{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--gold),${theme.muted});display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:14px}
    .profile-name{font-family:'Playfair Display',serif;font-size:18px;margin-bottom:4px}
    .profile-username{font-size:13px;color:var(--muted);margin-bottom:6px}
    .profile-phone{font-size:13px;color:var(--gold2)}
    .order-card{margin:0 20px 12px;padding:16px;background:var(--card);border:1px solid var(--border);border-radius:8px}
    .order-items{font-size:13px;margin-bottom:6px;line-height:1.5}
    .order-total{font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--gold);margin-bottom:4px}
    .order-status{display:inline-block;font-size:10px;letter-spacing:2px;text-transform:uppercase;padding:3px 10px;border:1px solid var(--gold);color:var(--gold);border-radius:2px;margin-bottom:4px}
    .order-date{font-size:11px;color:var(--muted)}
    #overlay{position:fixed;inset:0;z-index:45;background:rgba(0,0,0,.7);backdrop-filter:blur(2px);display:none}
    #overlay.show{display:block}
    .empty-state{text-align:center;padding:48px 20px;color:var(--muted)}
    .empty-state .icon{font-size:40px;margin-bottom:12px}
    .empty-state p{font-family:'Cormorant Garamond',serif;font-size:16px}
    .footer-main{background:var(--dark2);border-top:1px solid var(--border);padding:44px 20px 28px}
    .footer-logo{font-family:'Playfair Display',serif;font-size:24px;color:var(--gold);font-weight:600;text-align:center;margin-bottom:6px}
    .footer-tagline{font-family:'Cormorant Garamond',serif;font-size:14px;color:var(--muted);text-align:center;margin-bottom:28px;letter-spacing:1px}
    .footer-social{display:flex;gap:8px;margin-bottom:32px;justify-content:center;flex-wrap:wrap}
    .social-btn{display:flex;align-items:center;gap:7px;padding:9px 16px;border-radius:6px;border:1px solid var(--border);background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.06);color:var(--text);font-family:'Jost',sans-serif;font-size:12px;letter-spacing:1px;text-decoration:none;transition:all .2s;cursor:pointer}
    .social-btn:hover{background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.16);border-color:var(--gold);color:var(--gold2)}
    .footer-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
    .footer-col-title{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:14px}
    .footer-links{list-style:none;display:flex;flex-direction:column;gap:10px}
    .footer-links li a,.footer-links li button{font-family:'Cormorant Garamond',serif;font-size:15px;color:var(--muted);text-decoration:none;background:none;border:none;cursor:pointer;transition:color .2s;padding:0;text-align:left}
    .footer-links li a:hover,.footer-links li button:hover{color:var(--gold2)}
    .footer-bottom{text-align:center;font-family:'Cormorant Garamond',serif;font-size:12px;color:var(--muted);border-top:1px solid rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.1);padding-top:20px;letter-spacing:1px}
    .footer-bottom span{color:var(--gold)}
    @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  </style>
</head>
<body>
<div class="particles-container" id="particles"></div>
<nav class="topbar" id="topbar">
  <div class="topbar-logo" onclick="window.scrollTo({top:0,behavior:'smooth'})" data-i18n="nav.title">✦ ${restName}</div>
  <div class="topbar-actions">
    <div class="lang-switcher">
      <button class="lang-btn active" data-lang="uz" onclick="setLang('uz')">UZ</button>
      <button class="lang-btn" data-lang="ru" onclick="setLang('ru')">RU</button>
    </div>
    <div class="icon-btn" onclick="toggleCart()">🛒<span class="badge" id="cartBadge" style="display:none">0</span></div>
    <div class="icon-btn" onclick="toggleUser()">👤</div>
  </div>
</nav>
<header class="hero" id="hero" style="background:linear-gradient(to bottom,rgba(13,10,7,.25) 0%,rgba(13,10,7,.65) 65%,${theme.dark} 100%),url('${cfg.HERO_IMAGE}') center/cover no-repeat">
  <div class="hero-badge" data-i18n="hero.badge">${cfg.HERO_BADGE_UZ}</div>
  <h1 data-i18n="hero.title">${restName}</h1>
  <p data-i18n="hero.subtitle">${cfg.SUBTITLE_UZ}</p>
  <div class="gold-line" style="margin-top:18px;max-width:200px;margin-left:auto;margin-right:auto"><span>✦</span></div>
  <div class="hero-btns">
    <button class="hero-btn filled" onclick="scrollToSection('menu')" data-i18n="hero.btn">Menuni Ko'rish</button>
    <button class="hero-btn" onclick="bookEvent()" data-i18n="hero.bookbtn">Band qilish</button>
  </div>
  <div class="scroll-indicator"><div class="scroll-mouse"></div><span>pastga suring</span></div>
</header>
<section id="menu" class="reveal">
  <div class="section-title"><span class="sub" data-i18n="menu.sub">Bizning taomlar</span><h2 data-i18n="menu.title">Menyu</h2><div class="gold-line"><span>✦</span></div></div>
  <div class="filter-tabs" id="filterTabs"><button class="tab-btn active" data-cat="all" onclick="filterCategory('all',this)">Barchasi</button></div>
  <div class="product-grid" id="products"><div class="empty-state" style="grid-column:1/-1"><div class="icon">🍽</div><p data-i18n="product.loading">Yuklanmoqda...</p></div></div>
</section>
<section class="events-section reveal" id="events">
  <div class="events-bg" id="eventsBg" style="background-image:url('${cfg.EVENTS_BG}')"></div>
  <div class="events-inner">
    <div class="section-title"><span class="sub" data-i18n="events.sub">Maxsus tadbirlar</span><h2 data-i18n="events.title">Tadbirlar</h2><div class="gold-line"><span>✦</span></div></div>
    <div class="events-slider"><div class="events-track" id="eventsTrack">
      <div class="event-slide"><div class="event-img-wrap"><img src="${cfg.GALLERY[0] || cfg.HERO_IMAGE}" alt=""></div><div class="event-content"><span class="event-price" data-i18n="events.from">Narx kelishiladi</span><h3 class="event-title" data-i18n="events.birthday.title">Tug'ilgan kun ziyofati</h3><p class="event-desc" data-i18n="events.birthday.desc"></p><button class="event-book-btn" onclick="bookEvent()" data-i18n="events.book">Biz bilan bog'laning</button></div></div>
      <div class="event-slide"><div class="event-img-wrap"><img src="${cfg.GALLERY[1] || cfg.HERO_IMAGE}" alt=""></div><div class="event-content"><span class="event-price" data-i18n="events.from">Narx kelishiladi</span><h3 class="event-title" data-i18n="events.private.title">Xususiy ziyofat</h3><p class="event-desc" data-i18n="events.private.desc"></p><button class="event-book-btn" onclick="bookEvent()" data-i18n="events.book">Biz bilan bog'laning</button></div></div>
      <div class="event-slide"><div class="event-img-wrap"><img src="${cfg.GALLERY[2] || cfg.HERO_IMAGE}" alt=""></div><div class="event-content"><span class="event-price" data-i18n="events.from">Narx kelishiladi</span><h3 class="event-title" data-i18n="events.corporate.title">Korporativ tadbir</h3><p class="event-desc" data-i18n="events.corporate.desc"></p><button class="event-book-btn" onclick="bookEvent()" data-i18n="events.book">Biz bilan bog'laning</button></div></div>
    </div></div>
    <div class="slider-dots"><button class="dot active" onclick="goSlide(0)"></button><button class="dot" onclick="goSlide(1)"></button><button class="dot" onclick="goSlide(2)"></button></div>
    <div class="slider-arrows"><button class="arrow-btn" onclick="prevSlide()">←</button><button class="arrow-btn" onclick="nextSlide()">→</button></div>
  </div>
</section>
${cfg.GALLERY.length ? '<section class="gallery-section reveal" id="gallery"><div class="section-title"><span class="sub" data-i18n="gallery.sub">Restoran muhiti</span><h2 data-i18n="gallery.title">Galereya</h2><div class="gold-line"><span>✦</span></div></div><div class="gallery-grid" id="galleryGrid"></div></section>' : ''}
<section class="location-section reveal" id="location">
  <div class="section-title"><span class="sub" data-i18n="location.sub">Bizni toping</span><h2 data-i18n="location.title">Manzil</h2><div class="gold-line"><span>✦</span></div></div>
  <div class="location-card">
    ${cfg.MAP_EMBED ? '<iframe id="mapFrame" class="map-frame" src="' + cfg.MAP_EMBED + '" loading="lazy" allowfullscreen></iframe>' : ''}
    <div class="location-info">
      <div class="location-row"><span class="loc-icon">📍</span><div><div class="loc-label" data-i18n="location.addr.label">Manzil</div><div class="loc-val" data-i18n="location.addr.val">${cfg.ADDRESS_UZ}</div></div></div>
      <div class="location-row"><span class="loc-icon">🕐</span><div><div class="loc-label" data-i18n="location.hours.label">Ish vaqti</div><div class="loc-val" data-i18n="location.hours.val">${cfg.WORK_HOURS_UZ}</div><div class="loc-val" id="workStatus" style="margin-top:4px;font-weight:600"></div></div></div>
      <div class="location-row"><span class="loc-icon">📞</span><div><div class="loc-label" data-i18n="location.phone.label">Telefon</div><div class="loc-val" id="phoneLink"><a href="tel:${cfg.PHONE}">${cfg.PHONE}</a></div></div></div>
      ${cfg.METRO_UZ ? '<div class="location-row"><span class="loc-icon">🚇</span><div><div class="loc-label" data-i18n="location.metro.label">Metro</div><div class="loc-val" data-i18n="location.metro.val">' + cfg.METRO_UZ + '</div></div></div>' : ''}
    </div>
  </div>
</section>
<footer class="footer-main reveal">
  <div class="footer-logo" data-i18n="hero.title">${restName}</div>
  <div class="footer-tagline" data-i18n="hero.subtitle">${cfg.SUBTITLE_UZ}</div>
  <div class="footer-social" id="footerSocial"></div>
  <div class="footer-bottom">© ${new Date().getFullYear()} <span id="footerName">${restName}</span> — <span data-i18n="footer.text">Barcha huquqlar himoyalangan</span></div>
</footer>
<div class="lightbox" id="lightbox"><button class="lightbox-close" onclick="closeLightbox()">✕</button><button class="lb-prev" onclick="lbShift(-1)">←</button><img id="lightboxImg" src="" alt="" onclick="event.stopPropagation()"><button class="lb-next" onclick="lbShift(1)">→</button></div>
<div id="overlay" onclick="closePanels()"></div>
<div class="panel" id="cartPanel">
  <div class="panel-header"><h2 data-i18n="cart.title">Savatcha</h2><button class="close-btn" onclick="closePanels()">✕</button></div>
  <div id="cartItems" style="flex:1"><div class="empty-state"><div class="icon">🛒</div><p data-i18n="cart.empty">Savatcha bo'sh</p></div></div>
  <div class="cart-footer">
    <div class="cart-total-row"><span data-i18n="cart.total">Jami:</span><span><span id="cartTotal">0</span> <span data-i18n="cart.currency">so'm</span></span></div>
    <div style="margin-bottom:12px">
      <div style="font-family:'Cormorant Garamond',serif;font-size:13px;color:var(--muted);margin-bottom:8px;letter-spacing:1px"><span data-i18n="cart.ordertype">📍 Buyurtma turi</span></div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button id="btnDineIn" onclick="selectOrderType('dine_in')" style="flex:1;padding:8px;border-radius:4px;border:1px solid var(--border);background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.08);color:var(--muted);font-family:'Jost',sans-serif;font-size:11px;letter-spacing:1px;cursor:pointer;transition:all .2s" data-i18n="cart.dinein">🪑 Restoranda</button>
        <button id="btnOnline" onclick="selectOrderType('online')" style="flex:1;padding:8px;border-radius:4px;border:1px solid var(--border);background:rgba(${parseInt(theme.primary.slice(1,3),16)},${parseInt(theme.primary.slice(3,5),16)},${parseInt(theme.primary.slice(5,7),16)},.08);color:var(--muted);font-family:'Jost',sans-serif;font-size:11px;letter-spacing:1px;cursor:pointer;transition:all .2s" data-i18n="cart.online">🌐 Online</button>
      </div>
      <div id="tableInputWrap" style="display:none"><input id="tableInput" type="number" min="1" max="50" placeholder="Stol raqamini kiriting..." style="width:100%;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:'Jost',sans-serif;font-size:13px;outline:none"/></div>
    </div>
    <button class="checkout-btn" id="checkoutBtn" onclick="checkout()" data-i18n="cart.checkout">Buyurtma Berish</button>
  </div>
</div>
<div class="panel" id="userPanel">
  <div class="panel-header"><h2 data-i18n="user.title">Profilim</h2><button class="close-btn" onclick="closePanels()">✕</button></div>
  <div class="profile-card"><div class="profile-avatar">👤</div><div class="profile-name" id="profileName" data-i18n="user.loading">Yuklanmoqda...</div><div class="profile-username" id="profileUsername"></div><div class="profile-phone" id="profilePhone"></div></div>
  <div style="padding:16px 20px 8px;display:flex;align-items:center;gap:8px"><span style="font-family:'Playfair Display',serif;font-size:16px" data-i18n="user.orders">Buyurtmalarim</span><div style="flex:1;height:1px;background:var(--border)"></div></div>
  <div id="userOrders"><div class="empty-state"><div class="icon">📋</div><p data-i18n="user.loading">Yuklanmoqda...</p></div></div>
</div>
<div id="tgWarning" style="display:none;position:fixed;inset:0;z-index:100;background:rgba(13,10,7,.97);flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px">
  <div style="font-size:48px;margin-bottom:16px">🤖</div>
  <div style="font-family:'Playfair Display',serif;font-size:22px;color:var(--gold);margin-bottom:12px" data-i18n="tg.title">Telegram orqali kiring</div>
  <div style="color:var(--muted);font-size:14px;line-height:1.7;max-width:280px" data-i18n="tg.desc" data-i18n-html="true"></div>
  <a id="tgBotLink" href="https://t.me/${cfg.BOT_USERNAME}" style="margin-top:24px;padding:12px 28px;background:linear-gradient(135deg,var(--gold),${theme.muted});color:var(--dark);font-family:'Jost',sans-serif;font-size:12px;font-weight:500;letter-spacing:2px;text-decoration:none;border-radius:4px;text-transform:uppercase" data-i18n="tg.btn">Botga o'tish →</a>
</div>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script>
(function(){var cfg=window.__CONFIG__||{};var g=document.getElementById('galleryGrid');if(g&&cfg.GALLERY){g.innerHTML=cfg.GALLERY.map(function(img,i){return'<div class="gallery-item" onclick="openLightbox('+i+')"><img src="'+img.replace('1200','600')+'" alt=""><div class="overlay-icon">🔍</div></div>'}).join('')}var fs=document.getElementById('footerSocial');if(fs){fs.innerHTML='<a class="social-btn" href="https://t.me/'+(cfg.ADMIN_TG||'')+'" target="_blank">✈️ Admin</a><a class="social-btn" href="https://t.me/'+(cfg.BOT_USERNAME||'')+'" target="_blank">🤖 Bot</a><a class="social-btn" href="tel:'+(cfg.PHONE||'')+'">📞 '+(cfg.PHONE||'')+'</a>'}})();
window.addEventListener('scroll',function(){document.getElementById('topbar').classList.toggle('scrolled',window.scrollY>60)});
var currentSlide=0,totalSlides=3;setInterval(function(){goSlide((currentSlide+1)%totalSlides)},5000);
function goSlide(n){currentSlide=n;document.getElementById('eventsTrack').style.transform='translateX(-'+(n*100)+'%)';document.querySelectorAll('.dot').forEach(function(d,i){d.classList.toggle('active',i===n)})}
function nextSlide(){goSlide((currentSlide+1)%totalSlides)}
function prevSlide(){goSlide((currentSlide-1+totalSlides)%totalSlides)}
(function(){var el=document.getElementById('eventsTrack'),sx=0;el.addEventListener('touchstart',function(e){sx=e.touches[0].clientX},{passive:true});el.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>40)dx<0?nextSlide():prevSlide()},{passive:true})})();
var galleryImages=(window.__CONFIG__&&window.__CONFIG__.GALLERY)||[];var lbIndex=0;
function openLightbox(i){lbIndex=i;document.getElementById('lightboxImg').src=galleryImages[i]||'';document.getElementById('lightbox').classList.add('open')}
function closeLightbox(){document.getElementById('lightbox').classList.remove('open')}
function lbShift(dir){lbIndex=(lbIndex+dir+galleryImages.length)%galleryImages.length;document.getElementById('lightboxImg').src=galleryImages[lbIndex]}
document.getElementById('lightbox').addEventListener('click',function(e){if(e.target===this)closeLightbox()});
(function(){var els=document.querySelectorAll('.reveal');var obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:.15});els.forEach(function(el){obs.observe(el)})})();
(function(){var c=document.getElementById('particles');if(!c)return;for(var i=0;i<20;i++){var p=document.createElement('div');p.className='particle';p.style.left=Math.random()*100+'%';p.style.animationDuration=(8+Math.random()*12)+'s';p.style.animationDelay=(Math.random()*10)+'s';p.style.width=(1+Math.random()*2)+'px';p.style.height=p.style.width;c.appendChild(p)}})();
</script>
<script src="${cfg.API_URL}/static/app.js"></script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch(e) {
    console.error("Site generator error:", e.message);
    res.status(500).send("Server xatosi: " + e.message);
  }
});

// ===================================================
// ===== ENHANCED ANALYTICS ==========================
// ===================================================
app.get("/admin/analytics/advanced", authMiddleware, async (req, res) => {
  try {
    const rId = (req.admin.role === "superadmin" && req.query.restaurantId) ? req.query.restaurantId : req.admin.restaurantId;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Oylik buyurtmalar
    const monthOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: monthStart } });
    const prevMonthOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd } });

    // Kunlik trend (30 kun)
    const dailyTrend = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dn = new Date(d); dn.setDate(dn.getDate() + 1);
      const dayOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: d, $lt: dn } });
      dailyTrend.push({
        date: d.toISOString().split("T")[0],
        label: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }),
        orders: dayOrders.length,
        revenue: dayOrders.reduce((s, o) => s + (o.total || 0), 0)
      });
    }

    // Soatlik taqsimot (bugun)
    const hourlyDist = [];
    const todayOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: today } });
    for (let h = 0; h < 24; h++) {
      const count = todayOrders.filter(o => new Date(o.createdAt).getHours() === h).length;
      hourlyDist.push({ hour: h, label: String(h).padStart(2, "0") + ":00", orders: count });
    }

    // Top mahsulotlar (10 ta)
    const topProducts = await Order.aggregate([
      { $match: { restaurantId: rId, createdAt: { $gte: monthStart } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, totalQty: { $sum: "$items.quantity" }, orderCount: { $sum: 1 } } },
      { $sort: { totalQty: -1 } }, { $limit: 10 }
    ]);

    // Kategoriya bo'yicha
    const categoryStats = await Order.aggregate([
      { $match: { restaurantId: rId, createdAt: { $gte: monthStart } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.category", totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, totalQty: { $sum: "$items.quantity" } } },
      { $sort: { totalRevenue: -1 } }
    ]);

    // Order type distribution
    const orderTypeDist = await Order.aggregate([
      { $match: { restaurantId: rId, createdAt: { $gte: monthStart } } },
      { $group: { _id: "$orderType", count: { $sum: 1 }, revenue: { $sum: "$total" } } }
    ]);

    // O'rtacha buyurtma qiymati
    const avgOrderValue = monthOrders.length > 0
      ? Math.round(monthOrders.reduce((s, o) => s + (o.total || 0), 0) / monthOrders.length)
      : 0;
    const prevAvgOrderValue = prevMonthOrders.length > 0
      ? Math.round(prevMonthOrders.reduce((s, o) => s + (o.total || 0), 0) / prevMonthOrders.length)
      : 0;

    // Foydalanuvchilar o'sishi
    const totalUsers = await User.countDocuments({ restaurantId: rId });
    const monthUsers = await User.countDocuments({ restaurantId: rId, createdAt: { $gte: monthStart } });

    // Hafta kunlari bo'yicha
    const weekdayStats = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    const weekdayNames = ["Yak", "Du", "Se", "Chor", "Pay", "Ju", "Sha"];
    monthOrders.forEach(o => { weekdayStats[new Date(o.createdAt).getDay()]++; });

    // Reyting taqsimoti
    const ratingDist = await Order.aggregate([
      { $match: { restaurantId: rId, rating: { $ne: null } } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Revenue growth (oyma-oy %)
    const currentRevenue = monthOrders.reduce((s, o) => s + (o.total || 0), 0);
    const prevRevenue = prevMonthOrders.reduce((s, o) => s + (o.total || 0), 0);
    const revenueGrowth = prevRevenue > 0 ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100) : 0;

    res.json({
      ok: true,
      overview: {
        currentMonth: { orders: monthOrders.length, revenue: currentRevenue, avgOrderValue },
        prevMonth: { orders: prevMonthOrders.length, revenue: prevRevenue, avgOrderValue: prevAvgOrderValue },
        revenueGrowth,
        ordersGrowth: prevMonthOrders.length > 0 ? Math.round(((monthOrders.length - prevMonthOrders.length) / prevMonthOrders.length) * 100) : 0,
        totalUsers, newUsers: monthUsers
      },
      dailyTrend, hourlyDist, topProducts, categoryStats,
      orderTypeDist,
      weekdayStats: weekdayNames.map((n, i) => ({ day: n, orders: weekdayStats[i] })),
      ratingDist
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== WAITER ENDPOINTS ============================
// ===================================================

// Waiter middleware
async function waiterMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const emp = await Employee.findById(decoded.id).select("active restaurantId role name tables");
    if (!emp || !emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan", deleted: true });
    if (emp.role !== "waiter" && emp.role !== "chef") return res.status(403).json({ error: "Ruxsat yo'q — faqat ofitsiant" });
    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    req.waiter = { id: emp._id, restaurantId: emp.restaurantId, name: emp.name, role: emp.role, tables: emp.tables || [] };
    next();
  } catch(e) { res.status(401).json({ error: "Token yaroqsiz" }); }
}

// Waiter login
app.post("/waiter/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const emp = await Employee.findOne({ username });
    if (!emp) return res.status(401).json({ error: "Ishchi topilmadi" });
    if (!emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan" });
    if (emp.role !== "waiter") return res.status(403).json({ error: "Bu foydalanuvchi ofitsiant emas" });
    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });
    // modules tekshirish
    const admin = await Admin.findOne({ restaurantId: emp.restaurantId, role: "admin" });
    if (!admin?.modules?.waiter) return res.status(403).json({ error: "Ofitsiant moduli yoqilmagan" });
    const token = jwt.sign({ id: emp._id, restaurantId: emp.restaurantId, name: emp.name, role: "waiter" }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ ok: true, token, waiter: { id: emp._id, name: emp.name, restaurantId: emp.restaurantId, tables: emp.tables || [] } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ochiq shotlar ro'yxati
app.get("/waiter/shots", waiterMiddleware, async (req, res) => {
  try {
    const shots = await Shot.find({ restaurantId: req.waiter.restaurantId, status: "open" }).sort({ openedAt: -1 });
    res.json({ ok: true, shots });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Bitta shot tafsiloti
app.get("/waiter/shots/:id", waiterMiddleware, async (req, res) => {
  try {
    const shot = await Shot.findById(req.params.id);
    if (!shot) return res.status(404).json({ error: "Shot topilmadi" });
    res.json({ ok: true, shot });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Shotga mahsulot qo'shish
app.post("/waiter/shots/:id/add-item", waiterMiddleware, async (req, res) => {
  try {
    const { items } = req.body; // [{name, name_ru, price, quantity}]
    if (!items?.length) return res.status(400).json({ error: "Mahsulot kerak" });
    const shot = await Shot.findById(req.params.id);
    if (!shot || shot.status !== "open") return res.status(400).json({ error: "Shot topilmadi yoki yopilgan" });
    const newItems = items.map(i => ({
      name: i.name, name_ru: i.name_ru || "", price: Number(i.price), quantity: Number(i.quantity) || 1,
      addedBy: "waiter", sentToKitchen: false, kitchenStatus: "pending", addedAt: new Date()
    }));
    shot.items.push(...newItems);
    shot.total = shot.items.reduce((s, i) => s + (i.price * i.quantity), 0);
    await shot.save();
    // Socket events
    io.to(shot.restaurantId + ":waiter").emit("shot-updated", shot);
    io.to(shot.restaurantId + ":customer").emit("shot-updated", shot);
    res.json({ ok: true, shot });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Oshpazga yuborish (yuborilmagan itemlarni)
app.post("/waiter/shots/:id/to-kitchen", waiterMiddleware, async (req, res) => {
  try {
    const shot = await Shot.findById(req.params.id);
    if (!shot || shot.status !== "open") return res.status(400).json({ error: "Shot topilmadi yoki yopilgan" });
    let sentCount = 0;
    const sentItems = [];
    shot.items.forEach(item => {
      if (!item.sentToKitchen) {
        item.sentToKitchen = true;
        item.kitchenStatus = "pending";
        sentCount++;
        sentItems.push(item);
      }
    });
    if (sentCount === 0) return res.status(400).json({ error: "Yuborilmagan mahsulot yo'q" });
    await shot.save();
    // Socket: oshpazga yuborish
    io.to(shot.restaurantId + ":kitchen").emit("to-kitchen", {
      shotId: shot._id, tableNumber: shot.tableNumber, waiterName: shot.waiterName, items: sentItems, sentAt: new Date()
    });
    io.to(shot.restaurantId + ":waiter").emit("shot-updated", shot);
    res.json({ ok: true, shot, sentCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Shot yopish (to'lov)
app.post("/waiter/shots/:id/close", waiterMiddleware, async (req, res) => {
  try {
    const shot = await Shot.findById(req.params.id);
    if (!shot || shot.status !== "open") return res.status(400).json({ error: "Shot topilmadi yoki allaqachon yopilgan" });
    shot.status = "closed";
    shot.closedAt = new Date();
    shot.total = shot.items.reduce((s, i) => s + (i.price * i.quantity), 0);
    await shot.save();
    // Socket events
    io.to(shot.restaurantId + ":waiter").emit("shot-closed", shot);
    io.to(shot.restaurantId + ":customer").emit("shot-closed", shot);
    io.to(shot.restaurantId + ":kitchen").emit("shot-closed", shot);
    res.json({ ok: true, shot });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Restoran mahsulotlari
app.get("/waiter/products", waiterMiddleware, async (req, res) => {
  try {
    const products = await Product.find({ restaurantId: req.waiter.restaurantId, active: true }).sort({ category: 1, name: 1 });
    const categories = await Category.find({ restaurantId: req.waiter.restaurantId, active: true }).sort({ order: 1 });
    res.json({ ok: true, products, categories });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Oylik hisobot
app.get("/waiter/stats", waiterMiddleware, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7); // "2026-03"
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    const shots = await Shot.find({
      restaurantId: req.waiter.restaurantId,
      waiterId: req.waiter.id,
      openedAt: { $gte: start, $lt: end }
    }).sort({ openedAt: 1 });
    const totalShots = shots.length;
    const closedShots = shots.filter(s => s.status === "closed");
    const totalSum = closedShots.reduce((s, sh) => s + sh.total, 0);
    const uniqueCustomers = new Set(shots.filter(s => s.customerTelegramId).map(s => s.customerTelegramId)).size;
    // Kunlik breakdown
    const daily = {};
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = String(d).padStart(2, "0");
      daily[key] = { shots: 0, total: 0 };
    }
    closedShots.forEach(s => {
      const day = String(new Date(s.openedAt).getDate()).padStart(2, "0");
      if (daily[day]) { daily[day].shots++; daily[day].total += s.total; }
    });
    res.json({ ok: true, month, totalShots, closedShots: closedShots.length, totalSum, uniqueCustomers, avgShot: closedShots.length ? Math.round(totalSum / closedShots.length) : 0, daily });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Yangi shot ochish (ofitsiant tomonidan)
app.post("/waiter/shots/open", waiterMiddleware, async (req, res) => {
  try {
    const { tableNumber } = req.body;
    if (!tableNumber) return res.status(400).json({ error: "Stol raqami kerak" });
    // Allaqachon ochiq shot bormi?
    const existing = await Shot.findOne({ restaurantId: req.waiter.restaurantId, tableNumber: String(tableNumber), status: "open" });
    if (existing) return res.status(400).json({ error: "Bu stolda ochiq shot allaqachon bor", shot: existing });
    const shot = await Shot.create({
      restaurantId: req.waiter.restaurantId, tableNumber: String(tableNumber),
      waiterId: req.waiter.id, waiterName: req.waiter.name, status: "open", items: [], total: 0
    });
    io.to(shot.restaurantId + ":waiter").emit("new-shot", shot);
    res.json({ ok: true, shot });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== KITCHEN ENDPOINTS ===========================
// ===================================================

// Kitchen middleware
async function kitchenMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const emp = await Employee.findById(decoded.id).select("active restaurantId role name");
    if (!emp || !emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan", deleted: true });
    if (emp.role !== "chef") return res.status(403).json({ error: "Ruxsat yo'q — faqat oshpaz" });
    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    req.chef = { id: emp._id, restaurantId: emp.restaurantId, name: emp.name };
    next();
  } catch(e) { res.status(401).json({ error: "Token yaroqsiz" }); }
}

// Kitchen login
app.post("/kitchen/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const emp = await Employee.findOne({ username });
    if (!emp) return res.status(401).json({ error: "Ishchi topilmadi" });
    if (!emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan" });
    if (emp.role !== "chef") return res.status(403).json({ error: "Bu foydalanuvchi oshpaz emas" });
    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });
    const admin = await Admin.findOne({ restaurantId: emp.restaurantId, role: "admin" });
    if (!admin?.modules?.kitchen) return res.status(403).json({ error: "Oshpaz moduli yoqilmagan" });
    const token = jwt.sign({ id: emp._id, restaurantId: emp.restaurantId, name: emp.name, role: "chef" }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ ok: true, token, chef: { id: emp._id, name: emp.name, restaurantId: emp.restaurantId } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Oshpazga yuborilgan buyurtmalar (pending + cooking)
app.get("/kitchen/orders", kitchenMiddleware, async (req, res) => {
  try {
    const shots = await Shot.find({
      restaurantId: req.chef.restaurantId, status: "open",
      "items.sentToKitchen": true
    }).sort({ openedAt: 1 });
    // Faqat oshpazga yuborilgan va tayyor bo'lmagan itemlarni qaytarish
    const orders = shots.map(shot => {
      const kitchenItems = shot.items.filter(i => i.sentToKitchen);
      return {
        shotId: shot._id, tableNumber: shot.tableNumber, waiterName: shot.waiterName,
        items: kitchenItems, openedAt: shot.openedAt
      };
    }).filter(o => o.items.some(i => i.kitchenStatus !== "ready"));
    res.json({ ok: true, orders });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Oxirgi tayyor bo'lgan buyurtmalar (1 soat ichida)
app.get("/kitchen/recent", kitchenMiddleware, async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const shots = await Shot.find({
      restaurantId: req.chef.restaurantId,
      "items.sentToKitchen": true,
      updatedAt: { $gte: oneHourAgo }
    }).sort({ updatedAt: -1 });
    const recent = shots.map(shot => {
      const readyItems = shot.items.filter(i => i.sentToKitchen && i.kitchenStatus === "ready");
      if (!readyItems.length) return null;
      return { shotId: shot._id, tableNumber: shot.tableNumber, waiterName: shot.waiterName, items: readyItems, status: shot.status };
    }).filter(Boolean);
    res.json({ ok: true, recent });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Item statusini "cooking" ga o'zgartirish
app.post("/kitchen/orders/:shotId/cooking", kitchenMiddleware, async (req, res) => {
  try {
    const { itemIndexes } = req.body; // [0, 1, 2] — qaysi itemlar
    const shot = await Shot.findById(req.params.shotId);
    if (!shot) return res.status(404).json({ error: "Shot topilmadi" });
    if (!itemIndexes?.length) {
      // Barcha pending itemlarni cooking ga
      shot.items.forEach(item => {
        if (item.sentToKitchen && item.kitchenStatus === "pending") item.kitchenStatus = "cooking";
      });
    } else {
      itemIndexes.forEach(idx => {
        if (shot.items[idx] && shot.items[idx].sentToKitchen) shot.items[idx].kitchenStatus = "cooking";
      });
    }
    await shot.save();
    io.to(shot.restaurantId + ":kitchen").emit("shot-updated", shot);
    io.to(shot.restaurantId + ":waiter").emit("shot-updated", shot);
    res.json({ ok: true, shot });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Item(lar) tayyor
app.post("/kitchen/orders/:shotId/ready", kitchenMiddleware, async (req, res) => {
  try {
    const { itemIndexes } = req.body;
    const shot = await Shot.findById(req.params.shotId);
    if (!shot) return res.status(404).json({ error: "Shot topilmadi" });
    const readyItems = [];
    if (!itemIndexes?.length) {
      // Barcha cooking itemlarni ready ga
      shot.items.forEach(item => {
        if (item.sentToKitchen && item.kitchenStatus === "cooking") {
          item.kitchenStatus = "ready";
          readyItems.push(item);
        }
      });
    } else {
      itemIndexes.forEach(idx => {
        if (shot.items[idx] && shot.items[idx].sentToKitchen) {
          shot.items[idx].kitchenStatus = "ready";
          readyItems.push(shot.items[idx]);
        }
      });
    }
    await shot.save();
    // Socket events
    io.to(shot.restaurantId + ":waiter").emit("kitchen-ready", {
      shotId: shot._id, tableNumber: shot.tableNumber, items: readyItems
    });
    io.to(shot.restaurantId + ":kitchen").emit("shot-updated", shot);
    io.to(shot.restaurantId + ":customer").emit("shot-updated", shot);
    res.json({ ok: true, shot });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== EMPLOYEE ENDPOINTS ==========================
// ===================================================
app.post("/employee/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const emp = await Employee.findOne({ username });
    if (!emp) return res.status(401).json({ error: "Ishchi topilmadi" });
    if (!emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan" });
    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });
    const token = jwt.sign({ id: emp._id, restaurantId: emp.restaurantId, name: emp.name }, JWT_SECRET, { expiresIn: "30d" });
    const branch = emp.branchId ? await Branch.findById(emp.branchId) : null;
    res.json({ ok: true, token, employee: { id: emp._id, name: emp.name, position: emp.position, workStart: emp.workStart, workEnd: emp.workEnd, weeklyOff: emp.weeklyOff||"sunday", restaurantId: emp.restaurantId, branchId: emp.branchId||null, branchName: branch?.name||null } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/employee/face-descriptor", empMiddleware, async (req, res) => {
  try {
    const emp = await Employee.findById(req.employee.id).select("faceDescriptor photo");
    res.json({ ok: true, faceDescriptor: emp.faceDescriptor||[], hasPhoto: !!emp.photo });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/employee/today", empMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const att   = await Attendance.findOne({ employeeId: req.employee.id, date: today });
    const emp   = await Employee.findById(req.employee.id);
    res.json({ ok: true, attendance: att, employee: emp });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/employee/checkin", empMiddleware, async (req, res) => {
  try {
    const { lat, lng, photo, clientTimeMinutes, clientDate } = req.body;
    const today = clientDate || new Date().toISOString().split("T")[0];
    const emp   = await Employee.findById(req.employee.id).populate("branchId");
    if (photo && emp.photo) {
      const fr = await faceppCompare(emp.photo, photo);
      if (fr.ok && fr.confidence < (fr.threshold||73)) {
        return res.status(400).json({ error: "Yuz tasdiqlanmadi! O'xshashlik: " + Math.round(fr.confidence) + "% (kerak: " + Math.round(fr.threshold||73) + "%+)", confidence: fr.confidence, faceError: true });
      }
    }
    const branch = emp.branchId;
    if (branch?.lat && branch?.lng && lat && lng) {
      const dist = getDistance(lat, lng, branch.lat, branch.lng);
      if (dist > (branch.radius||100)) return res.status(400).json({ error: "Siz ish joyidan " + Math.round(dist) + "m uzoqdasiz!" });
    }
    const existing = await Attendance.findOne({ employeeId: emp._id, date: today });
    if (existing?.checkIn) return res.status(400).json({ error: "Bugun allaqachon keldi qayd qilingan" });
    const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const isWeeklyOff = emp.weeklyOff === dayNames[new Date(today).getDay()];
    const nowMin = clientTimeMinutes != null ? clientTimeMinutes : (new Date().getHours()*60+new Date().getMinutes());
    const checkInStr = String(Math.floor(nowMin/60)).padStart(2,"0") + ":" + String(nowMin%60).padStart(2,"0");
    const late = isWeeklyOff ? 0 : Math.max(0, nowMin - emp.workStart.split(":").reduce((h,m,i)=>i===0?h+Number(m)*60:h+Number(m),0));
    const att = await Attendance.findOneAndUpdate(
      { employeeId: emp._id, date: today },
      { employeeId: emp._id, restaurantId: emp.restaurantId, date: today, checkIn: checkInStr, checkInPhoto: photo||"", checkInLat: lat, checkInLng: lng, lateMinutes: late, isWeeklyOff, overtimeMinutes: 0, status: isWeeklyOff ? "dam" : "keldi" },
      { upsert: true, new: true }
    );
    res.json({ ok: true, attendance: att, lateMinutes: late, isWeeklyOff, checkIn: checkInStr });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/employee/checkout", empMiddleware, async (req, res) => {
  try {
    const { clientTimeMinutes, clientDate, photo } = req.body;
    const today = clientDate || new Date().toISOString().split("T")[0];
    const emp   = await Employee.findById(req.employee.id);
    const att   = await Attendance.findOne({ employeeId: emp._id, date: today });
    if (!att?.checkIn) return res.status(400).json({ error: "Avval check-in qiling" });
    if (att.checkOut)  return res.status(400).json({ error: "Bugun allaqachon ketdi qayd qilingan" });
    if (photo && emp.photo) {
      const fr = await faceppCompare(emp.photo, photo);
      if (fr.ok && fr.confidence < (fr.threshold||73)) return res.status(400).json({ error: "Yuz tasdiqlanmadi!", faceError: true });
    }
    const nowMin = clientTimeMinutes != null ? clientTimeMinutes : (new Date().getHours()*60+new Date().getMinutes());
    const checkOutStr = String(Math.floor(nowMin/60)).padStart(2,"0") + ":" + String(nowMin%60).padStart(2,"0");
    const [ih,im] = att.checkIn.split(":").map(Number);
    const total   = Math.max(0, nowMin - (ih*60+im));
    const updated = await Attendance.findByIdAndUpdate(att._id, { checkOut: checkOutStr, totalMinutes: total, overtimeMinutes: att.isWeeklyOff ? total : 0, status: att.isWeeklyOff ? "dam" : "keldi" }, { new: true });
    res.json({ ok: true, attendance: updated, totalMinutes: total, checkOut: checkOutStr });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/employee/stats", empMiddleware, async (req, res) => {
  try {
    const prefix  = req.query.month || new Date().toISOString().slice(0, 7);
    const emp     = await Employee.findById(req.employee.id).select("-password");
    const records = await Attendance.find({ employeeId: req.employee.id, date: { $regex: "^" + prefix } }).sort({ date: 1 });
    const workedDays = records.filter(r => r.status === "keldi").length;
    const workingDaysInMonth = calcWorkingDays(prefix, emp.weeklyOff);
    const dailySalary  = emp.salary > 0 ? Math.round(emp.salary / workingDaysInMonth) : 0;
    const earnedSalary = Math.round(dailySalary * workedDays);
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const ds = dt.toISOString().split("T")[0];
      const rec = records.find(r => r.date === ds);
      last7.push({ date: ds, status: rec?.status||null, checkIn: rec?.checkIn||null, checkOut: rec?.checkOut||null });
    }
    res.json({ ok: true, records, stats: { workedDays, totalMinutes: records.reduce((s,r)=>s+(r.totalMinutes||0),0), totalLate: records.filter(r=>r.lateMinutes>0).length, absent: records.filter(r=>r.status==="kelmadi").length, overtimeMin: records.reduce((s,r)=>s+(r.overtimeMinutes||0),0), workingDaysInMonth, dailySalary, earnedSalary, salary: emp.salary }, last7 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== SERVER START ================================
// ===================================================
// Railway SIGTERM yuboradi — graceful shutdown qilamiz
process.on("SIGTERM", () => {
  console.log("SIGTERM qabul qilindi — server to'xtamoqda...");
  // Barcha botlarning webhooklarini tozalab, keyin chiqamiz
  Promise.all(Object.keys(bots).map(async (rId) => {
    try { await bots[rId].deleteWebHook(); } catch(e) {}
  })).then(() => {
    console.log("✅ Webhooklar tozalandi. Server to'xtadi.");
    process.exit(0);
  }).catch(() => process.exit(0));
  // 5 sekunddan keyin majburan chiqish
  setTimeout(() => process.exit(0), 5000);
});
process.on("SIGINT",  () => process.exit(0));
process.on("uncaughtException",  e => console.error("uncaught:", e.message));
process.on("unhandledRejection", e => console.error("unhandled:", e));

async function main() {
  try {
    // 1. MongoDB ga ulanamiz
    await connectDB();

    // 2. Serverni ishga tushiramiz
    httpServer.listen(PORT, () => {
      console.log("✅ Server " + PORT + " portda ishga tushdi (Socket.IO bilan)");
    });

    // 3. Superadmin yaratish/yangilash
    try {
      const superUser = (process.env.SUPER_USERNAME || "Jahonsher").trim();
      const superPass = (process.env.SUPER_PASSWORD || "Jahonsher3").trim();
      const hash      = await bcrypt.hash(superPass, 10);
      const existing  = await Admin.findOne({ role: "superadmin" });
      if (!existing) {
        await Admin.create({ username: superUser, password: hash, restaurantName: "SuperAdmin", restaurantId: "superadmin", role: "superadmin", active: true });
        console.log("✅ Superadmin yaratildi:", superUser);
      } else {
        await Admin.findByIdAndUpdate(existing._id, { password: hash, username: superUser, active: true });
        console.log("✅ Superadmin yangilandi:", superUser);
      }
    } catch(e) { console.error("Superadmin xato:", e.message); }

    // 4. .env dan DEFAULT restoran/bot ni ishga tushiramiz
    // Bu eng muhim qism — DB da admin bo'lmasa ham bot ishlaydi!
    if (DEFAULT_BOT_TOKEN) {
      try {
        await ensureRestaurant(DEFAULT_RESTAURANT_ID, DEFAULT_RESTAURANT_NAME);

        // Admin panel uchun default admin ham yaratamiz (agar yo'q bo'lsa)
        const defAdmin = await Admin.findOne({ restaurantId: DEFAULT_RESTAURANT_ID, role: "admin" });
        if (!defAdmin) {
          const defPass = await bcrypt.hash("admin123", 10);
          await Admin.create({
            username: "imperial_admin",
            password: defPass,
            restaurantName: DEFAULT_RESTAURANT_NAME,
            restaurantId: DEFAULT_RESTAURANT_ID,
            botToken: DEFAULT_BOT_TOKEN,
            chefId: DEFAULT_CHEF_ID,
            webappUrl: DEFAULT_WEBAPP_URL,
            role: "admin",
            active: true
          });
          console.log("✅ Default admin yaratildi: imperial_admin / admin123");
        } else {
          // Bot token va chefId ni yangilaymiz
          await Admin.findByIdAndUpdate(defAdmin._id, {
            botToken: DEFAULT_BOT_TOKEN,
            chefId: DEFAULT_CHEF_ID,
            webappUrl: DEFAULT_WEBAPP_URL
          });
        }

        // Kategoriyalar yo'q bo'lsa yaratamiz
        const catCount = await Category.countDocuments({ restaurantId: DEFAULT_RESTAURANT_ID });
        if (catCount === 0) {
          await Category.insertMany([
            { name: "Taom",     name_ru: "Еда",     emoji: "🍽", order: 1, restaurantId: DEFAULT_RESTAURANT_ID },
            { name: "Ichimlik", name_ru: "Напитки", emoji: "🥤", order: 2, restaurantId: DEFAULT_RESTAURANT_ID }
          ]);
          console.log("✅ Default kategoriyalar yaratildi");
        }

        // Botni ishga tushiramiz
        await startBot(DEFAULT_RESTAURANT_ID, DEFAULT_BOT_TOKEN, DEFAULT_WEBAPP_URL, DEFAULT_CHEF_ID);
        console.log("✅ Default bot ishga tushdi:", DEFAULT_RESTAURANT_ID);
      } catch(e) {
        console.error("Default bot xato:", e.message);
      }
    }

    // 5. DB dagi boshqa restoranlar botlarini ishga tushiramiz
    try {
      const allAdmins = await Admin.find({ role: "admin", active: true }).select("restaurantId restaurantName botToken chefId webappUrl");
      for (const a of allAdmins) {
        if (a.restaurantId === DEFAULT_RESTAURANT_ID) continue; // allaqachon ishga tushirildi
        await ensureRestaurant(a.restaurantId, a.restaurantName);
        if (a.botToken) await startBot(a.restaurantId, a.botToken, a.webappUrl, a.chefId);
      }
      console.log("✅ Restoranlar sinxronlandi:", allAdmins.length);
    } catch(e) { console.error("Restoran sync xato:", e.message); }

    // 6. Domain
    if (DOMAIN) {
      console.log("✅ Domain:", DOMAIN);
      startKeepAlive();
    } else {
      console.warn("⚠️ RAILWAY_PUBLIC_DOMAIN topilmadi - webhook ishlamasligi mumkin");
    }

  } catch(err) {
    console.error("❌ Server start xato:", err.message);
    process.exit(1);
  }
}

main();