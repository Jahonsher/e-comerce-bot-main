require("dotenv").config();

const express     = require("express");
const mongoose    = require("mongoose");
const cors        = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const fs          = require("fs");
const path        = require("path");
const jwt         = require("jsonwebtoken");
const bcrypt      = require("bcryptjs");
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
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

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

const Product = mongoose.model("Product", new mongoose.Schema({
  id:           Number,
  name:         String, name_ru: String,
  price:        Number, category: String, image: String,
  active:       { type: Boolean, default: true },
  restaurantId: { type: String, required: true }
}, { timestamps: true }));

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
  webappUrl:      String,
  role:           { type: String, default: "admin" },
  active:         { type: Boolean, default: true },
  blockReason:    { type: String, default: "" },
  subscriptionEnd: Date
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
      const u = await User.findOneAndUpdate(
        { telegramId: msg.from.id, restaurantId },
        { telegramId: msg.from.id, restaurantId, first_name: msg.from.first_name || "", last_name: msg.from.last_name || "", username: msg.from.username || "" },
        { upsert: true, new: true }
      );
      if (!u.phone) {
        await send(msg.chat.id, "Salom! Telefon raqamingizni yuboring:", {
          reply_markup: { keyboard: [[{ text: "Telefon yuborish", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
        });
      } else {
        await send(msg.chat.id, "Xush kelibsiz " + (msg.from.first_name || "") + "! Bo'lim tanlang:", { reply_markup: menu });
      }
    } catch(e) { console.error("start:", e.message); }
  });

  bot.on("contact", async (msg) => {
    try {
      await User.findOneAndUpdate({ telegramId: msg.from.id, restaurantId }, { phone: msg.contact.phone_number });
      await send(msg.chat.id, "Saqlandi! Bo'lim tanlang:", { reply_markup: menu });
    } catch(e) {}
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
    const products = await Product.find({ active: true, restaurantId: rId }).sort({ id: 1 });
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
    const user = await User.findOneAndUpdate(
      { telegramId: id, restaurantId },
      { $set: { telegramId: id, restaurantId, first_name: first_name||"", last_name: last_name||"", username: username||"" } },
      { upsert: true, new: true }
    );
    res.json({ ok: true, user });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/user/:id", async (req, res) => {
  try {
    const rId = req.query.restaurantId;
    res.json(await User.findOne({ telegramId: Number(req.params.id), restaurantId: rId }) || {});
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
    const order = await Order.create({ telegramId: Number(telegramId), items, total, userInfo: ui, orderType: orderType||"online", tableNumber: tableNumber||"Online", status: "Yangi", restaurantId });
    const name  = (ui.first_name + " " + ui.last_name).trim() || "ID:" + telegramId;
    const uname = ui.username ? " (@" + ui.username + ")" : "";
    const phone = ui.phone ? "\nTel: " + ui.phone : "";
    const table = orderType === "dine_in" ? "Stol: " + tableNumber : "Online";
    const adminInfo = await Admin.findOne({ restaurantId, role: "admin" });
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
    res.json({ ok: true, token, admin: { username: admin.username, restaurantName: admin.restaurantName, role: admin.role, restaurantId: admin.restaurantId } });
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
    const isBlocked = active === false;
    await Restaurant.findOneAndUpdate(
      { restaurantId: admin.restaurantId },
      { blocked: isBlocked, blockReason: isBlocked ? (blockReason || "Xizmat to'xtatilgan") : "" },
      { upsert: true }
    );
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
    const rId  = req.admin.restaurantId;
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
    const { name, phone, position, username, password, salary, workStart, workEnd, telegramId, branchId, weeklyOff, photo, faceDescriptor } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });
    const hash = await bcrypt.hash(password, 10);
    const emp  = await Employee.create({ name, phone, position, username, password: hash, salary: salary||0, workStart: workStart||"09:00", workEnd: workEnd||"18:00", telegramId: telegramId||null, branchId: branchId||null, weeklyOff: weeklyOff||"sunday", photo: photo||null, faceDescriptor: faceDescriptor||[], restaurantId: req.admin.restaurantId, active: true });
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
process.on("SIGTERM", () => console.log("SIGTERM - server ishlashda davom etadi"));
process.on("SIGINT",  () => process.exit(0));
process.on("uncaughtException",  e => console.error("uncaught:", e.message));
process.on("unhandledRejection", e => console.error("unhandled:", e));

async function main() {
  try {
    // 1. MongoDB ga ulanamiz
    await connectDB();

    // 2. Serverni ishga tushiramiz
    app.listen(PORT, () => {
      console.log("✅ Server " + PORT + " portda ishga tushdi");
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
    } else {
      console.warn("⚠️ RAILWAY_PUBLIC_DOMAIN topilmadi - webhook ishlamasligi mumkin");
    }

  } catch(err) {
    console.error("❌ Server start xato:", err.message);
    process.exit(1);
  }
}

main();