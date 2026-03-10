require("dotenv").config();

const express     = require("express");
const mongoose    = require("mongoose");
const cors        = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const fs          = require("fs");
const path        = require("path");
const jwt         = require("jsonwebtoken");
const bcrypt      = require("bcryptjs");


// ===================================================
// ===== FACE++ INTEGRATION ==========================
// ===================================================
const https = require('https');
const FormData = require('form-data');

const FACEPP_KEY    = process.env.FACEPP_API_KEY    || 'ZCsxfywtcxMPhjeQ5Um1ErEjL-SSm2qz';
const FACEPP_SECRET = process.env.FACEPP_API_SECRET || 'ZoMXrDV_OxFs6OiW380vd4oN4bbbQcM5';

// Ikki rasm o'rtasidagi o'xshashlikni tekshiradi
// photo1, photo2 — base64 string (data:image/jpeg;base64,... yoki faqat base64)
async function faceppCompare(photo1, photo2) {
  return new Promise((resolve) => {
    try {
      // base64 dan header ni olib tashlaymiz
      const b1 = photo1.replace(/^data:image\/\w+;base64,/, '');
      const b2 = photo2.replace(/^data:image\/\w+;base64,/, '');

      const form = new FormData();
      form.append('api_key',    FACEPP_KEY);
      form.append('api_secret', FACEPP_SECRET);
      form.append('image_base64_1', b1);
      form.append('image_base64_2', b2);

      const options = {
        hostname: 'api-us.faceplusplus.com',
        path:     '/facepp/v3/compare',
        method:   'POST',
        headers:  form.getHeaders()
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.confidence !== undefined) {
              // confidence: 0-100, threshold ~73 = bir xil odam
              resolve({ ok: true, confidence: result.confidence, threshold: result.thresholds?.['1e-5'] || 73 });
            } else {
              resolve({ ok: false, error: result.error_message || 'Face++ xato' });
            }
          } catch(e) {
            resolve({ ok: false, error: 'JSON parse xato' });
          }
        });
      });

      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      form.pipe(req);
    } catch(e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const TOKEN      = process.env.BOT_TOKEN;
const CHEF_ID    = Number(process.env.CHEF_ID);
const MONGO_URI  = process.env.MONGO_URI;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://e-comerce-bot.vercel.app";
const PORT       = process.env.PORT || 5000;
const DOMAIN     = process.env.RAILWAY_URL || "";
const JWT_SECRET = process.env.JWT_SECRET || "imperial_secret_2026";

if (!TOKEN)   { console.error("BOT_TOKEN yoq"); process.exit(1); }
if (!CHEF_ID) { console.error("CHEF_ID yoq");   process.exit(1); }

const bot = new TelegramBot(TOKEN);

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB ulandi"))
  .catch(err => { console.error("Mongo:", err.message); process.exit(1); });

// ===== MODELS =====
const userSchema = new mongoose.Schema({
  telegramId:   { type: Number },
  first_name:   String, last_name: String,
  username:     String, phone: String,
  restaurantId: { type: String, default: "imperial" }
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
  restaurantId:  { type: String, default: "imperial" }
}, { timestamps: true }));

const Product = mongoose.model("Product", new mongoose.Schema({
  id:           Number,
  name:         String, name_ru: String,
  price:        Number, category: String, image: String,
  active:       { type: Boolean, default: true },
  restaurantId: { type: String, default: "imperial" }
}, { timestamps: true }));

const Category = mongoose.model("Category", new mongoose.Schema({
  name:         { type: String, required: true },
  name_ru:      String,
  emoji:        { type: String, default: "🍽" },
  order:        { type: Number, default: 0 },
  active:       { type: Boolean, default: true },
  restaurantId: { type: String, default: "imperial" }
}, { timestamps: true }));

const Admin = mongoose.model("Admin", new mongoose.Schema({
  username:       { type: String, unique: true },
  password:       String,
  restaurantName: String,
  restaurantId:   { type: String, sparse: true },
  botToken:       String,
  chefId:         Number,
  phone:          String,
  address:        String,
  webappUrl:      String,
  role:           { type: String, default: "admin" },
  active:         { type: Boolean, default: true }
}, { timestamps: true }));


// ===== BRANCH MODEL =====
const Branch = mongoose.model("Branch", new mongoose.Schema({
  name:         { type: String, required: true },
  restaurantId: { type: String, default: "imperial" },
  address:      String,
  lat:          Number,
  lng:          Number,
  radius:       { type: Number, default: 100 },
  active:       { type: Boolean, default: true }
}, { timestamps: true }));

// ===== EMPLOYEE MODEL =====
const employeeSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  phone:        String,
  position:     String,                          // lavozim: ofitsiant, oshpaz...
  username:     { type: String, unique: true },
  password:     String,
  restaurantId: { type: String, default: "imperial" },
  workStart:    { type: String, default: "09:00" }, // ish boshlanish
  workEnd:      { type: String, default: "18:00" }, // ish tugash
  salary:       { type: Number, default: 0 },       // oylik maosh
  telegramId:   Number,
  branchId:     { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
  weeklyOff:    { type: String, default: "sunday" }, // dam olish kuni
  photo:        String,  // etalon yuz rasmi (base64)
  faceDescriptor: [Number], // face-api.js 128-o'lchamli vektor
  active:       { type: Boolean, default: true }
}, { timestamps: true });
const Employee = mongoose.model("Employee", employeeSchema);

// ===== ATTENDANCE MODEL =====
const attendanceSchema = new mongoose.Schema({
  employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  restaurantId: { type: String, default: "imperial" },
  date:         { type: String, required: true },   // "2026-03-07"
  checkIn:      String,    // "09:15"
  checkOut:     String,    // "18:30"
  checkInPhoto: String,    // base64 yoki URL
  checkInLat:   Number,
  checkInLng:   Number,
  lateMinutes:  { type: Number, default: 0 },
  totalMinutes: { type: Number, default: 0 },
  status:          { type: String, default: "keldi" }, // keldi | kelmadi | kasal | tatil | dam
  isWeeklyOff:     { type: Boolean, default: false },  // dam kuni ishladi
  overtimeMinutes: { type: Number, default: 0 },        // dam kuni ishlagan vaqt
  note:            String
}, { timestamps: true });
const Attendance = mongoose.model("Attendance", attendanceSchema);

// ===== MIDDLEWARE =====
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: "Token yaroqsiz" }); }
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

// ===== SYNC =====
async function syncProductsToDB() {
  try {
    const count = await Product.countDocuments({ restaurantId: "imperial" });
    if (count === 0) {
      const filePath = path.join(__dirname, "data", "products.json");
      if (fs.existsSync(filePath)) {
        const products = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        await Product.insertMany(products.map(p => ({ ...p, restaurantId: "imperial" })));
        console.log("Products sinxronlandi:", products.length);
      }
    }
    const catCount = await Category.countDocuments({ restaurantId: "imperial" });
    if (catCount === 0) {
      await Category.insertMany([
        { name: "Taom",     name_ru: "Еда",     emoji: "🍽", order: 1, restaurantId: "imperial" },
        { name: "Ichimlik", name_ru: "Напитки", emoji: "🥤", order: 2, restaurantId: "imperial" }
      ]);
    }
  } catch(e) { console.error("sync:", e.message); }
}

// ===== BOT =====
const menu = {
  keyboard: [[{ text: "Buyurtmalarim" }, { text: "Manzil" }], [{ text: "Ish vaqti" }, { text: "Boglanish" }]],
  resize_keyboard: true
};

async function send(id, text, extra) {
  try { await bot.sendMessage(id, text, extra || {}); }
  catch(e) { console.error("send:", e.message); }
}

bot.onText(/\/start/, async (msg) => {
  try {
    const u = await User.findOneAndUpdate(
      { telegramId: msg.from.id, restaurantId: "imperial" },
      { telegramId: msg.from.id, restaurantId: "imperial", first_name: msg.from.first_name || "", last_name: msg.from.last_name || "", username: msg.from.username || "" },
      { upsert: true, new: true }
    );
    if (!u.phone) {
      await send(msg.chat.id, "Salom! Telefon raqamingizni yuboring:", {
        reply_markup: { keyboard: [[{ text: "Telefon yuborish", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
      });
    } else {
      await send(msg.chat.id, "Xush kelibsiz " + (msg.from.first_name || "") + "! Bolim tanlang:", { reply_markup: menu });
    }
  } catch(e) { console.error("start:", e.message); }
});

bot.on("contact", async (msg) => {
  try {
    await User.findOneAndUpdate({ telegramId: msg.from.id }, { phone: msg.contact.phone_number });
    await send(msg.chat.id, "Saqlandi! Bolim tanlang:", { reply_markup: menu });
  } catch(e) { console.error("contact:", e.message); }
});

bot.onText(/Buyurtmalarim/, async (msg) => {
  try {
    const list = await Order.find({ telegramId: msg.from.id }).sort({ createdAt: -1 }).limit(5);
    if (!list.length) { await send(msg.chat.id, "Buyurtma yoq.", { reply_markup: menu }); return; }
    let t = "Buyurtmalar:\n\n";
    list.forEach((o, i) => {
      t += (i+1) + ". " + new Date(o.createdAt).toLocaleDateString() + " | " + (o.tableNumber || "") + "\n";
      t += o.items.map(x => x.name + " x" + x.quantity).join(", ") + "\n";
      t += Number(o.total).toLocaleString() + " som | " + o.status + "\n\n";
    });
    await send(msg.chat.id, t, { reply_markup: menu });
  } catch(e) { console.error("orders:", e.message); }
});

bot.onText(/Manzil/, async (msg) => {
  try { await send(msg.chat.id, "Manzil:\nToshkent, Chilonzor tumani\nNavroz kochasi 15-uy\nMetro: Chilonzor (5 daqiqa)", { reply_markup: menu }); }
  catch(e) { console.error("manzil:", e.message); }
});

bot.onText(/Ish vaqti/, async (msg) => {
  try {
    const h = (new Date().getUTCHours() + 5) % 24;
    await send(msg.chat.id, "Ish vaqti:\nDu-Ju: 10:00-23:00\nSh-Ya: 09:00-00:00\n\n" + (h >= 10 && h < 23 ? "Hozir OCHIQ" : "Hozir YOPIQ"), { reply_markup: menu });
  } catch(e) { console.error("ish vaqti:", e.message); }
});

bot.onText(/Boglanish/, async (msg) => {
  try {
    await send(msg.chat.id, "Boglanish:\n\nTelefon: +998 77 008 34 13\nTelegram: @Jahonsher",
      { reply_markup: { inline_keyboard: [[{ text: "Telegram @Jahonsher", url: "https://t.me/Jahonsher" }]] } });
  } catch(e) { console.error("boglanish:", e.message); }
});



// ===== EMPLOYEE MIDDLEWARE =====
async function empMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try {
    req.employee = jwt.verify(token, JWT_SECRET);
    // Ishchi hali ham mavjudligini tekshirish
    const emp = await Employee.findById(req.employee.id).select("active");
    if (!emp || !emp.active) {
      return res.status(401).json({ error: "Akkaunt o'chirilgan", deleted: true });
    }
    next();
  }
  catch(e) { res.status(401).json({ error: "Token yaroqsiz" }); }
}


// ===== GEO HELPER =====
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // metr
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ===== BOT BROADCAST =====
// Holat saqlash: { step: 'text'|'photo', text: '...' }
const broadcastSessions = {};

bot.onText(/\/broadcast/, async (msg) => {
  const chatId = msg.chat.id;
  // Faqat admin (CHEF_ID) ishlatishi mumkin
  if (chatId !== CHEF_ID) {
    return send(chatId, "⛔ Bu buyruq faqat admin uchun.");
  }
  broadcastSessions[chatId] = { step: 'text' };
  send(chatId, "📢 *Broadcast xabari*\n\nYubormoqchi bo'lgan matnni yozing:\n\n_(Bekor qilish uchun /cancel)_",
    { parse_mode: "Markdown" });
});

bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  if (broadcastSessions[chatId]) {
    delete broadcastSessions[chatId];
    send(chatId, "❌ Bekor qilindi.");
  }
});

bot.on("message", async (msg) => {
  const chatId  = msg.chat.id;
  const session = broadcastSessions[chatId];
  if (!session) return;

  // STEP 1: Matn qabul qilish
  if (session.step === 'text') {
    if (!msg.text || msg.text.startsWith('/')) return;
    session.text = msg.text;
    session.step = 'photo';
    send(chatId,
      "✅ Matn saqlandi.\n\nEndi rasm yuboring yoki rasmiz yuborish uchun /skip yozing.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // STEP 2: Rasm qabul qilish
  if (session.step === 'photo') {
    let photoFileId = null;

    if (msg.text && msg.text === '/skip') {
      // Rasmiz yuborish
      photoFileId = null;
    } else if (msg.photo) {
      photoFileId = msg.photo[msg.photo.length - 1].file_id;
    } else {
      send(chatId, "⚠️ Rasm yuboring yoki /skip yozing.");
      return;
    }

    session.step     = 'confirm';
    session.photoId  = photoFileId;

    const preview = (session.text || '') + (photoFileId ? '\n🖼 Rasm: bor' : '\n🖼 Rasm: yoq');
    send(chatId,
      "📋 *Xabar ko'rinishi:*\n\n" + preview + "\n\nYuborilsinmi?",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Ha, yuborish", callback_data: "bc_confirm" },
            { text: "❌ Bekor", callback_data: "bc_cancel" }
          ]]
        }
      }
    );
  }
});

bot.on("callback_query", async (q) => {
  try {
    const parts  = q.data.split("_");
    const action = parts[0];
    if (action === "accept") {
      const [, orderId, userId] = parts;
      await Order.findByIdAndUpdate(orderId, { status: "Qabul qilindi" });
      await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "✅ Qabul qilindi", callback_data: "done" }]] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
      await send(Number(userId), "✅ Buyurtmangiz qabul qilindi! Tayyorlanmoqda.");
      setTimeout(async () => {
        await send(Number(userId), "Buyurtmangizni qanday baholaysiz?", {
          reply_markup: { inline_keyboard: [[
            { text: "⭐ 1", callback_data: `rate_${orderId}_1` }, { text: "⭐⭐ 2", callback_data: `rate_${orderId}_2` },
            { text: "⭐⭐⭐ 3", callback_data: `rate_${orderId}_3` }, { text: "⭐⭐⭐⭐ 4", callback_data: `rate_${orderId}_4` },
            { text: "⭐⭐⭐⭐⭐ 5", callback_data: `rate_${orderId}_5` },
          ]]}
        });
      }, 30000);
    } else if (action === "reject") {
      const [, orderId, userId] = parts;
      await Order.findByIdAndUpdate(orderId, { status: "Bekor qilindi" });
      await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "❌ Bekor qilindi", callback_data: "done" }]] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
      await send(Number(userId), "❌ Buyurtmangiz bekor qilindi. Kechirasiz.");
    } else if (action === "rate") {
      const [, orderId, stars] = parts;
      await Order.findByIdAndUpdate(orderId, { rating: Number(stars) });
      await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "⭐".repeat(Number(stars)) + " Baholangdi!", callback_data: "done" }]] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
      await bot.answerCallbackQuery(q.id, { text: "Rahmat!" });
      return;
    } else if (q.data === "bc_confirm") {
      const session = broadcastSessions[q.message.chat.id];
      if (!session) { await bot.answerCallbackQuery(q.id); return; }

      await bot.answerCallbackQuery(q.id, { text: "Yuborilmoqda..." });
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
      await send(q.message.chat.id, "⏳ Yuborilmoqda, kuting...");

      // Barcha userlarni olish (restaurantId filter olib tashlandi)
      const users = await User.find({ telegramId: { $exists: true } });
      let sent = 0, failed = 0, cachedFileId = null;

      console.log("Broadcast boshlandi. Userlar soni:", users.length);

      for (const user of users) {
        try {
          const tgId = Number(user.telegramId);
          if (!tgId) { failed++; continue; }

          if (session.photoId || cachedFileId) {
            const photoSrc = cachedFileId || session.photoId;
            const msg2 = await bot.sendPhoto(tgId, photoSrc, {
              caption: session.text || "", parse_mode: "HTML"
            });
            if (!cachedFileId && msg2.photo) {
              cachedFileId = msg2.photo[msg2.photo.length - 1].file_id;
            }
          } else {
            await bot.sendMessage(tgId, session.text, { parse_mode: "HTML" });
          }
          sent++;
          console.log("Yuborildi:", tgId);
          await new Promise(r => setTimeout(r, 50));
        } catch(e) { 
          failed++;
          console.log("Xato user:", user.telegramId, e.message);
        }
      }

      delete broadcastSessions[q.message.chat.id];
      await send(q.message.chat.id,
        "✅ *Broadcast yakunlandi!*\n\n" +
        "📤 Yuborildi: *" + sent + "* ta\n" +
        "❌ Xato: *" + failed + "* ta\n" +
        "👥 Jami: *" + users.length + "* ta",
        { parse_mode: "Markdown" }
      );
      return;

    } else if (q.data === "bc_cancel") {
      delete broadcastSessions[q.message.chat.id];
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
      await send(q.message.chat.id, "❌ Broadcast bekor qilindi.");
      await bot.answerCallbackQuery(q.id);
      return;
    }
    await bot.answerCallbackQuery(q.id);
  } catch(e) { console.error("callback:", e.message); }
});

// ===== PUBLIC =====
app.get("/", (req, res) => res.send("OK"));
const WH = "/wh/" + TOKEN;
app.post(WH, (req, res) => {
  try { bot.processUpdate(req.body); } catch(e) { console.error("processUpdate:", e.message); }
  res.sendStatus(200);
});

app.get("/products", async (req, res) => {
  try {
    const rId = req.query.restaurantId || "imperial";
    const products = await Product.find({ active: true, restaurantId: rId }).sort({ id: 1 });
    if (products.length) return res.json(products);
    res.json(JSON.parse(fs.readFileSync(path.join(__dirname, "data", "products.json"), "utf-8")));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/categories", async (req, res) => {
  try {
    const rId = req.query.restaurantId || "imperial";
    res.json(await Category.find({ restaurantId: rId }).sort({ order: 1 }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/auth", async (req, res) => {
  try {
    const { id, first_name, last_name, username, restaurantId } = req.body;
    const rId = restaurantId || "imperial";
    const user = await User.findOneAndUpdate(
      { telegramId: id, restaurantId: rId },
      { $set: { telegramId: id, restaurantId: rId, first_name: first_name||"", last_name: last_name||"", username: username||"" } },
      { upsert: true, new: true }
    );
    res.json({ ok: true, user });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/user/:id", async (req, res) => {
  try {
    const rId = req.query.restaurantId || "imperial";
    res.json(await User.findOne({ telegramId: Number(req.params.id), restaurantId: rId }) || {});
  }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/user/:id/orders", async (req, res) => {
  try { res.json(await Order.find({ telegramId: Number(req.params.id) }).sort({ createdAt: -1 }).limit(30)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/order", async (req, res) => {
  try {
    const { telegramId, items, user, orderType, tableNumber, restaurantId } = req.body;
    if (!telegramId || !items?.length) return res.status(400).json({ error: "malumot yoq" });
    const db = await User.findOne({ telegramId: Number(telegramId) });
    const ui = {
      first_name: db?.first_name || user?.first_name || "",
      last_name:  db?.last_name  || user?.last_name  || "",
      username:   db?.username   || user?.username   || "",
      phone:      db?.phone      || user?.phone      || ""
    };
    const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    const rId   = restaurantId || "imperial";
    const order = await Order.create({ telegramId: Number(telegramId), items, total, userInfo: ui, orderType: orderType||"online", tableNumber: tableNumber||"Online", status: "Yangi", restaurantId: rId });
    const name  = (ui.first_name + " " + ui.last_name).trim() || "ID:" + telegramId;
    const uname = ui.username ? " (@" + ui.username + ")" : "";
    const phone = ui.phone ? "\nTel: " + ui.phone : "";
    const table = orderType === "dine_in" ? "Stol: " + tableNumber : "Online";
    const adminInfo  = await Admin.findOne({ restaurantId: rId });
    const targetChef = adminInfo?.chefId || CHEF_ID;
    let m = "🆕 Yangi buyurtma!\n\n" + table + "\nMijoz: " + name + uname + phone + "\n\nMahsulotlar:\n";
    items.forEach(i => { m += "- " + i.name + " x" + i.quantity + " | " + Number(i.price).toLocaleString() + " som\n"; });
    m += "\nJami: " + total.toLocaleString() + " som";
    await send(targetChef, m, { reply_markup: { inline_keyboard: [[{ text: "✅ Qabul", callback_data: "accept_" + order._id + "_" + telegramId }, { text: "❌ Rad", callback_data: "reject_" + order._id + "_" + telegramId }]] } });
    res.json({ success: true, order });
  } catch(e) { console.error("order:", e.message); res.status(500).json({ error: e.message }); }
});

// ===== ADMIN AUTH =====
app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: "Foydalanuvchi topilmadi" });
    if (!admin.active) return res.status(403).json({ error: "Akkount bloklangan" });
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });
    const token = jwt.sign({ id: admin._id, username: admin.username, role: admin.role, restaurantName: admin.restaurantName, restaurantId: admin.restaurantId || "imperial" }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ ok: true, token, admin: { username: admin.username, restaurantName: admin.restaurantName, role: admin.role, restaurantId: admin.restaurantId } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});




app.post("/admin/setup", async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    if (count > 0) return res.status(403).json({ error: "Admin allaqachon mavjud" });
    const { username, password, restaurantName } = req.body;
    const hash  = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ username, password: hash, restaurantName: restaurantName || "Imperial Restoran", restaurantId: "imperial", role: "superadmin" });
    res.json({ ok: true, message: "Superadmin yaratildi", username: admin.username });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN — PRODUCTS =====
app.get("/admin/products", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.role === "superadmin" ? (req.query.restaurantId || "imperial") : req.admin.restaurantId;
    res.json(await Product.find({ restaurantId: rId }).sort({ id: 1 }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/products", authMiddleware, async (req, res) => {
  try {
    const rId  = req.admin.restaurantId || "imperial";
    const last = await Product.findOne({ restaurantId: rId }).sort({ id: -1 });
    const product = await Product.create({ ...req.body, id: last ? last.id + 1 : 1, restaurantId: rId });
    res.json({ ok: true, product });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/products/:id", authMiddleware, async (req, res) => {
  try {
    const rId     = req.admin.restaurantId || "imperial";
    const product = await Product.findOneAndUpdate({ id: Number(req.params.id), restaurantId: rId }, req.body, { new: true });
    res.json({ ok: true, product });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/products/:id", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId || "imperial";
    await Product.findOneAndDelete({ id: Number(req.params.id), restaurantId: rId });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN — CATEGORIES =====
app.get("/admin/categories", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.role === "superadmin" ? (req.query.restaurantId || "imperial") : req.admin.restaurantId;
    res.json(await Category.find({ restaurantId: rId }).sort({ order: 1 }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/categories", authMiddleware, async (req, res) => {
  try {
    const rId  = req.admin.restaurantId || "imperial";
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

// ===== ADMIN — ORDERS =====
app.get("/admin/orders", authMiddleware, async (req, res) => {
  try {
    const { status, type, limit = 50, skip = 0 } = req.query;
    const rId    = req.admin.role === "superadmin" ? (req.query.restaurantId || undefined) : req.admin.restaurantId;
    const filter = {};
    if (rId)    filter.restaurantId = rId;
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

// ===== ADMIN — STATS =====
app.get("/admin/stats", authMiddleware, async (req, res) => {
  try {
    const rId   = req.admin.role === "superadmin" ? (req.query.restaurantId || undefined) : req.admin.restaurantId;
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    const base  = rId ? { restaurantId: rId } : {};

    const todayOrders  = await Order.find({ ...base, createdAt: { $gte: today } });
    const monthOrders  = await Order.find({ ...base, createdAt: { $gte: month } });
    const ratedOrders  = await Order.find({ ...base, rating: { $ne: null } });
    const weeklyData   = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dn = new Date(d);   dn.setDate(dn.getDate() + 1);
      const dayOrders = await Order.find({ ...base, createdAt: { $gte: d, $lt: dn } });
      weeklyData.push({ date: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }), orders: dayOrders.length, revenue: dayOrders.reduce((s, o) => s + (o.total||0), 0) });
    }
    const topProducts = await Order.aggregate([
      { $match: { ...base } }, { $unwind: "$items" },
      { $group: { _id: "$items.name", total: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }, quantity: { $sum: "$items.quantity" }, count: { $sum: 1 } } },
      { $sort: { quantity: -1 } }, { $limit: 5 }
    ]);
    res.json({
      today:       { orders: todayOrders.length, revenue: todayOrders.reduce((s,o)=>s+(o.total||0),0), online: todayOrders.filter(o=>o.orderType==="online").length, dineIn: todayOrders.filter(o=>o.orderType==="dine_in").length },
      month:       { orders: monthOrders.length, revenue: monthOrders.reduce((s,o)=>s+(o.total||0),0) },
      weekly:      weeklyData, topProducts,
      rating:      { avg: ratedOrders.length ? (ratedOrders.reduce((s,o)=>s+o.rating,0)/ratedOrders.length).toFixed(1) : null, count: ratedOrders.length },
      totalUsers:  await User.countDocuments(rId ? { restaurantId: rId } : {}),
      statusStats: await Order.aggregate([{ $match: { ...base } }, { $group: { _id: "$status", count: { $sum: 1 } } }])
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== ADMIN — USERS =====
app.get("/admin/users", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.role === "superadmin" ? undefined : req.admin.restaurantId;
    res.json(await User.find(rId ? { restaurantId: rId } : {}).sort({ createdAt: -1 }).limit(100));
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ===== BROADCAST =====
app.post("/admin/broadcast", authMiddleware, async (req, res) => {
  try {
    const rId   = req.admin.restaurantId;
    const { text, imageUrl, imageBase64 } = req.body;
    if (!text && !imageUrl && !imageBase64) return res.status(400).json({ error: "Matn yoki rasm kerak" });

    const users = await User.find({ restaurantId: rId, telegramId: { $exists: true } });
    let sent = 0, failed = 0;
    const errors = [];

    let cachedFileId = null; // birinchi yuborishdan file_id saqlanadi

    for (const user of users) {
      try {
        const tgId = Number(user.telegramId);
        if (!tgId) { failed++; continue; }

        if (imageBase64 || imageUrl) {
          let photoSource;

          if (cachedFileId) {
            // Keyingi userlarga file_id orqali (tez!)
            photoSource = cachedFileId;
          } else if (imageBase64) {
            // Birinchi marta — buffer yuboramiz
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
            photoSource = Buffer.from(base64Data, "base64");
          } else {
            photoSource = imageUrl;
          }

          const msg = await bot.sendPhoto(tgId, photoSource, {
            caption:    text || "",
            parse_mode: "HTML"
          });

          // Birinchi yuborishdan file_id ni saqlab olamiz
          if (!cachedFileId && msg.photo) {
            cachedFileId = msg.photo[msg.photo.length - 1].file_id;
          }
        } else {
          await bot.sendMessage(tgId, text, { parse_mode: "HTML" });
        }
        sent++;
        await new Promise(r => setTimeout(r, 50));
      } catch(e) {
        failed++;
        errors.push({ id: user.telegramId, err: e.message });
      }
    }
    res.json({ ok: true, sent, failed, total: users.length, errors: errors.slice(0, 5) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== SUPERADMIN — RESTAURANTS =====
app.get("/superadmin/restaurants", superMiddleware, async (req, res) => {
  try {
    const admins = await Admin.find({ restaurantId: { $exists: true, $ne: null } }).select("-password").sort({ createdAt: -1 });
    const result = await Promise.all(admins.map(async (a) => {
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      return {
        ...a.toObject(),
        todayOrders: await Order.countDocuments({ restaurantId: a.restaurantId, createdAt: { $gte: todayStart } }),
        totalOrders: await Order.countDocuments({ restaurantId: a.restaurantId })
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
    const exists = await Admin.findOne({ $or: [{ username }, { restaurantId }] });
    if (exists) return res.status(400).json({ error: "Bu username yoki ID allaqachon mavjud" });
    const hash  = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ username, password: hash, restaurantName, restaurantId, botToken: botToken||"", chefId: chefId||0, phone: phone||"", address: address||"", webappUrl: webappUrl||"", role: "admin", active: true });
    await Category.insertMany([
      { name: "Taom", name_ru: "Еда", emoji: "🍽", order: 1, restaurantId },
      { name: "Ichimlik", name_ru: "Напитки", emoji: "🥤", order: 2, restaurantId }
    ]);
    res.json({ ok: true, admin: { username: admin.username, restaurantName: admin.restaurantName, restaurantId: admin.restaurantId } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/superadmin/restaurants/:id", superMiddleware, async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const update = { ...rest };
    if (password) update.password = await bcrypt.hash(password, 10);
    const admin = await Admin.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password");
    res.json({ ok: true, admin });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/superadmin/restaurants/:id", superMiddleware, async (req, res) => {
  try { await Admin.findByIdAndDelete(req.params.id); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/superadmin/stats", superMiddleware, async (req, res) => {
  try {
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthOrders = await Order.find({ createdAt: { $gte: monthStart } });
    const perRestaurant = await Order.aggregate([
      { $group: { _id: "$restaurantId", count: { $sum: 1 }, revenue: { $sum: "$total" } } },
      { $sort: { count: -1 } }
    ]);
    res.json({
      totalRestaurants: await Admin.countDocuments({ restaurantId: { $exists: true, $ne: null } }),
      totalOrders:      await Order.countDocuments(),
      todayOrders:      await Order.countDocuments({ createdAt: { $gte: todayStart } }),
      monthRevenue:     monthOrders.reduce((s,o)=>s+(o.total||0),0),
      totalUsers:       await User.countDocuments(),
      perRestaurant
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

process.on("uncaughtException",  e => console.error("uncaught:", e.message));

// ===================================================
// ===== BRANCH ENDPOINTS ============================
// ===================================================

// Filiallar ro'yxati
app.get("/admin/branches", authMiddleware, async (req, res) => {
  try {
    const branches = await Branch.find({ restaurantId: req.admin.restaurantId, active: true }).sort({ name: 1 });
    res.json({ ok: true, branches });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Filial qo'shish
app.post("/admin/branches", authMiddleware, async (req, res) => {
  try {
    const { name, address, lat, lng, radius } = req.body;
    if (!name) return res.status(400).json({ error: "Filial nomi kerak" });
    const branch = await Branch.create({
      name, address, lat, lng,
      radius: radius || 100,
      restaurantId: req.admin.restaurantId
    });
    res.json({ ok: true, branch });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Filial tahrirlash
app.put("/admin/branches/:id", authMiddleware, async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ok: true, branch });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Filial o'chirish
app.delete("/admin/branches/:id", authMiddleware, async (req, res) => {
  try {
    await Branch.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Employee login — branchId ham qaytarsin

// --- Face descriptor olish (admin ishchi qo'shganda) ---
app.get("/admin/employees/:id/face", authMiddleware, async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id).select("name photo faceDescriptor");
    if (!emp) return res.status(404).json({ error: "Ishchi topilmadi" });
    res.json({ ok: true, name: emp.name, photo: emp.photo, faceDescriptor: emp.faceDescriptor });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Face descriptor saqlash ---
app.put("/admin/employees/:id/face", authMiddleware, async (req, res) => {
  try {
    const { photo, faceDescriptor } = req.body;
    await Employee.findByIdAndUpdate(req.params.id, { photo, faceDescriptor });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Employee face descriptor olish (checkin uchun) ---
app.get("/employee/face-descriptor", empMiddleware, async (req, res) => {
  try {
    const emp = await Employee.findById(req.employee.id).select("faceDescriptor photo");
    res.json({ ok: true, faceDescriptor: emp.faceDescriptor || [], hasPhoto: !!(emp.photo) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== EMPLOYEE ENDPOINTS ==========================
// ===================================================

// --- Employee login ---
app.post("/employee/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const emp = await Employee.findOne({ username });
    if (!emp) return res.status(401).json({ error: "Ishchi topilmadi" });
    if (!emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan. Administratorga murojaat qiling." });
    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });
    const token = jwt.sign(
      { id: emp._id, restaurantId: emp.restaurantId, name: emp.name },
      JWT_SECRET, { expiresIn: "30d" }
    );
    const branch = emp.branchId ? await Branch.findById(emp.branchId) : null;
    res.json({ ok: true, token, employee: {
      id: emp._id, name: emp.name, position: emp.position,
      workStart: emp.workStart, workEnd: emp.workEnd,
      weeklyOff: emp.weeklyOff || "sunday",
      restaurantId: emp.restaurantId,
      branchId:   emp.branchId || null,
      branchName: branch?.name || null
    }});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Bugungi davomat holati ---
app.get("/employee/today", empMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const att   = await Attendance.findOne({ employeeId: req.employee.id, date: today });
    const emp   = await Employee.findById(req.employee.id);
    res.json({ ok: true, attendance: att, employee: emp });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Check-in (keldi) ---
app.post("/employee/checkin", empMiddleware, async (req, res) => {
  try {
    // clientTimeMinutes — browser Toshkent vaqtini yuboradi (UTC+5)
    const { lat, lng, photo, clientTimeMinutes, clientDate } = req.body;

    const today = clientDate || new Date().toISOString().split("T")[0];
    const emp   = await Employee.findById(req.employee.id).populate("branchId");

    // ===== FACE++ YUZ TAQQOSLASH =====
    if (photo && emp.photo) {
      const faceResult = await faceppCompare(emp.photo, photo);
      if (faceResult.ok) {
        const threshold = faceResult.threshold || 73;
        if (faceResult.confidence < threshold) {
          return res.status(400).json({
            error: "Yuz tasdiqlanmadi! O'xshashlik: " + Math.round(faceResult.confidence) + "% (kerak: " + Math.round(threshold) + "%+). Boshqa odam kirmoqchi bo'lyapti.",
            confidence: faceResult.confidence,
            faceError: true
          });
        }
      } else {
        // Face++ ishlamasa — log qilib o'tkazib yubormaymiz, server xatosi
        console.log('Face++ xato:', faceResult.error);
        // Agar Face++ serveri yetib bo'lmasa — o'tkazib yuboramiz (offline holat)
        if (faceResult.error && faceResult.error.includes('ENOTFOUND')) {
        console.log('Face++ offline - checkin otkazilmoqda');
        }
      }
    }
    // =================================

    // Geofencing — Branch koordinatasidan tekshirish
    const branch = emp.branchId;
    if (branch && branch.lat && branch.lng && lat && lng) {
      const dist = getDistance(lat, lng, branch.lat, branch.lng);
      if (dist > (branch.radius || 100)) {
        return res.status(400).json({
          error: "Siz ish joyidan " + Math.round(dist) + "m uzoqdasiz! Qayd qilib bo'lmaydi."
        });
      }
    }

    // Avval keldi qaydimi?
    const existing = await Attendance.findOne({ employeeId: emp._id, date: today });
    if (existing?.checkIn) {
      return res.status(400).json({ error: "Bugun allaqachon keldi qayd qilingan" });
    }

    // Dam olish kunini tekshirish
    const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const todayDayName = dayNames[new Date(today).getDay()];
    const isWeeklyOff  = emp.weeklyOff === todayDayName;

    // Vaqtni hisoblash
    const nowMin = clientTimeMinutes != null
      ? clientTimeMinutes
      : (new Date().getHours() * 60 + new Date().getMinutes());
    const hh = String(Math.floor(nowMin / 60)).padStart(2, "0");
    const mm = String(nowMin % 60).padStart(2, "0");
    const checkInStr = hh + ":" + mm;

    let late = 0;
    let overtimeMinutes = 0;

    if (isWeeklyOff) {
      // Dam kuni — kechikish yo'q, overtime hisoblanadi
      overtimeMinutes = 0; // checkout da to'ldiriladi
    } else {
      const [wh, wm] = emp.workStart.split(":").map(Number);
      late = Math.max(0, nowMin - (wh * 60 + wm));
    }

    const att = await Attendance.findOneAndUpdate(
      { employeeId: emp._id, date: today },
      {
        employeeId:      emp._id,
        restaurantId:    emp.restaurantId,
        date:            today,
        checkIn:         checkInStr,
        checkInPhoto:    photo || "",
        checkInLat:      lat,
        checkInLng:      lng,
        lateMinutes:     late,
        isWeeklyOff:     isWeeklyOff,
        overtimeMinutes: 0,
        status:          isWeeklyOff ? "dam" : "keldi"
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true, attendance: att, lateMinutes: late, isWeeklyOff, checkIn: checkInStr });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Check-out (ketdi) ---
app.post("/employee/checkout", empMiddleware, async (req, res) => {
  try {
    const { clientTimeMinutes: coTime, clientDate: coDate, photo } = req.body;

    const today = coDate || new Date().toISOString().split("T")[0];
    const emp   = await Employee.findById(req.employee.id);
    const att   = await Attendance.findOne({ employeeId: emp._id, date: today });

    if (!att?.checkIn) return res.status(400).json({ error: "Avval check-in qiling" });
    if (att.checkOut)  return res.status(400).json({ error: "Bugun allaqachon ketdi qayd qilingan" });

    // ===== FACE++ CHECKOUT TEKSHIRUVI =====
    if (photo && emp.photo) {
      const faceResult = await faceppCompare(emp.photo, photo);
      if (faceResult.ok && faceResult.confidence < (faceResult.threshold || 73)) {
        return res.status(400).json({
          error: "Yuz tasdiqlanmadi! " + Math.round(faceResult.confidence) + "% mos keldi.",
          faceError: true
        });
      }
    }
    // =====================================
    const nowMin2    = coTime != null ? coTime : (new Date().getHours() * 60 + new Date().getMinutes());
    const hh2 = String(Math.floor(nowMin2 / 60)).padStart(2, "0");
    const mm2 = String(nowMin2 % 60).padStart(2, "0");
    const checkOutStr = hh2 + ":" + mm2;

    // Jami vaqt hisoblash
    const [ih, im] = att.checkIn.split(":").map(Number);
    const total    = Math.max(0, nowMin2 - (ih * 60 + im));

    // Dam kuni bo'lsa — overtime = total
    const overtimeMinutes = att.isWeeklyOff ? total : 0;

    // Status: dam kunida kelsa "dam" qoladi lekin status = "keldi" bo'lsin (ketdi qayd qilindi)
    const newStatus = att.isWeeklyOff ? 'dam' : 'keldi';

    const updated = await Attendance.findByIdAndUpdate(att._id, {
      checkOut:        checkOutStr,
      totalMinutes:    total,
      overtimeMinutes: overtimeMinutes,
      status:          newStatus
    }, { new: true });

    res.json({ ok: true, attendance: updated, totalMinutes: total, checkOut: checkOutStr });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Ishchining o'z statistikasi ---
app.get("/employee/stats", empMiddleware, async (req, res) => {
  try {
    const { month } = req.query; // "2026-03"
    const prefix = month || new Date().toISOString().slice(0, 7);
    const records = await Attendance.find({
      employeeId: req.employee.id,
      date: { $regex: "^" + prefix }
    }).sort({ date: 1 });

    const totalDays    = records.filter(r => r.status === "keldi").length;
    const totalMinutes = records.reduce((s, r) => s + (r.totalMinutes || 0), 0);
    const totalLate    = records.filter(r => r.lateMinutes > 0).length;
    const absent       = records.filter(r => r.status === "kelmadi").length;

    res.json({ ok: true, records, stats: { totalDays, totalMinutes, totalLate, absent } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ===================================================
// ===== ADMIN — EMPLOYEE ENDPOINTS ==================
// ===================================================

// --- Ishchilar ro'yxati ---
app.get("/admin/employees", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const emps = await Employee.find({ restaurantId: rId }).select("-password").sort({ name: 1 });
    res.json(emps);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Ishchi qo'shish ---
app.post("/admin/employees", authMiddleware, async (req, res) => {
  try {
    const { name, phone, position, username, password, salary, workStart, workEnd, telegramId, branchId, weeklyOff, photo, faceDescriptor } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });
    const hash = await bcrypt.hash(password, 10);
    const emp  = await Employee.create({
      name, phone, position, username, password: hash,
      salary: salary || 0, workStart: workStart || "09:00",
      workEnd: workEnd || "18:00", telegramId: telegramId || null,
      branchId: branchId || null, weeklyOff: weeklyOff || "sunday",
      photo: photo || null, faceDescriptor: faceDescriptor || [],
      restaurantId: req.admin.restaurantId, active: true
    });
    res.json({ ok: true, employee: { ...emp.toObject(), password: undefined } });
  } catch(e) {
    if (e.code === 11000) return res.status(400).json({ error: "Bu username band" });
    res.status(500).json({ error: e.message });
  }
});

// --- Ishchi tahrirlash ---
app.put("/admin/employees/:id", authMiddleware, async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    } else {
      delete data.password;
    }
    const emp = await Employee.findByIdAndUpdate(req.params.id, data, { new: true }).select("-password");
    res.json({ ok: true, employee: emp });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Ishchi o'chirish (to'liq) ---

// --- Eski active:false ishchilarni tozalash (bir martalik migration) ---
app.delete("/admin/employees-cleanup", authMiddleware, async (req, res) => {
  try {
    const result = await Employee.deleteMany({ 
      restaurantId: req.admin.restaurantId, 
      active: false 
    });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/employees/:id", authMiddleware, async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id);
    if (!emp) return res.status(404).json({ error: "Ishchi topilmadi" });
    // Davomat yozuvlarini ham o'chirish
    await Attendance.deleteMany({ employeeId: req.params.id });
    await Employee.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// --- Filiallar bo'yicha davomat summasi ---
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
      const branchAtts = attendances.filter(a =>
        branchEmps.some(e => e._id.toString() === a.employeeId.toString())
      );
      const came    = branchAtts.filter(a => a.status === "keldi").length;
      const late    = branchAtts.filter(a => a.lateMinutes > 0).length;
      const dayOff  = branchEmps.filter(e => e.weeklyOff === todayDay).length;
      const absent  = branchEmps.length - came - dayOff;
      return {
        branch:   { id: branch._id, name: branch.name, address: branch.address },
        total:    branchEmps.length,
        came, late, absent: Math.max(0, absent), dayOff
      };
    });

    // Filialsiz ishchilar
    const noBranch = employees.filter(e => !e.branchId);
    if (noBranch.length > 0) {
      const nbAtts  = attendances.filter(a => noBranch.some(e => e._id.toString() === a.employeeId.toString()));
      const came    = nbAtts.filter(a => a.status === "keldi").length;
      const dayOff  = noBranch.filter(e => e.weeklyOff === todayDay).length;
      result.push({
        branch: { id: null, name: "Filialsiz ishchilar", address: "" },
        total: noBranch.length, came,
        late:   nbAtts.filter(a => a.lateMinutes > 0).length,
        absent: Math.max(0, noBranch.length - came - dayOff),
        dayOff
      });
    }

    res.json({ ok: true, today, summary: result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Bugungi davomat (admin) --- branchId filter bilan
app.get("/admin/attendance/today", authMiddleware, async (req, res) => {
  try {
    const rId     = req.admin.restaurantId;
    const { branchId, date } = req.query;
    // date parametri bo'lsa o'sha kun, bo'lmasa bugun
    const today   = date || new Date().toISOString().split("T")[0];

    // branchId filter
    const empFilter = { restaurantId: rId, active: true };
    if (branchId) empFilter.branchId = branchId;

    const employees   = await Employee.find(empFilter).select("-password").populate("branchId", "name");
    const attendances = await Attendance.find({ restaurantId: rId, date: today });

    // Bugunning dam kuni nomini aniqlaymiz
    const dayNames   = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const todayDay   = dayNames[new Date(today).getDay()];

    const result = employees.map(emp => {
      const att        = attendances.find(a => a.employeeId.toString() === emp._id.toString());
      const isOff      = emp.weeklyOff === todayDay;
      const statusVal  = att?.status || (isOff ? "dam" : "kelmadi");
      return {
        employee:        emp,
        attendance:      att || null,
        status:          statusVal,
        isWeeklyOff:     isOff,
        checkIn:         att?.checkIn || null,
        checkOut:        att?.checkOut || null,
        lateMinutes:     att?.lateMinutes || 0,
        totalMinutes:    att?.totalMinutes || 0,
        overtimeMinutes: att?.overtimeMinutes || 0
      };
    });

    const summary = {
      total:    employees.length,
      came:     result.filter(r => r.status === "keldi").length,
      absent:   result.filter(r => r.status === "kelmadi").length,
      late:     result.filter(r => r.lateMinutes > 0).length,
      dayOff:   result.filter(r => r.isWeeklyOff).length,
      overtime: result.filter(r => r.overtimeMinutes > 0).length,
      working: result.filter(r => r.checkIn && !r.checkOut).length
    };

    res.json({ ok: true, today, employees: result, summary });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Oylik hisobot (admin) ---
// ===== HELPER: Oyda ishchi uchun ish kunlari soni =====
function calcWorkingDays(yearMonth, weeklyOff) {
  // yearMonth: "2025-04"
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

app.get("/admin/attendance/report", authMiddleware, async (req, res) => {
  try {
    const rId    = req.admin.restaurantId;
    const { month, employeeId } = req.query;
    const prefix = month || new Date().toISOString().slice(0, 7);

    const filter = { restaurantId: rId, date: { $regex: "^" + prefix } };
    if (employeeId) filter.employeeId = employeeId;

    const records   = await Attendance.find(filter).populate("employeeId", "name position salary").sort({ date: 1 });
    const employees = await Employee.find({ restaurantId: rId, active: true }).select("-password");

    const report = employees.map(emp => {
      const empRecords = records.filter(r => r.employeeId?._id?.toString() === emp._id.toString());
      const totalDays    = empRecords.filter(r => r.status === "keldi" || r.status === "dam").length;
      const workedDays   = empRecords.filter(r => r.status === "keldi").length;
      const totalMinutes = empRecords.reduce((s, r) => s + (r.totalMinutes || 0), 0);
      const lateCount    = empRecords.filter(r => r.lateMinutes > 0).length;
      const absentCount  = empRecords.filter(r => r.status === "kelmadi").length;
      const overtimeMin  = empRecords.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);

      // ===== TO'G'RI MAOSH HISOBLASH =====
      // 1. Shu oy nechta ish kuni bor (dam kunlari hisobsiz)
      const workingDaysInMonth = calcWorkingDays(prefix, emp.weeklyOff);
      // 2. Bir kunlik maosh
      const dailySalary = emp.salary > 0 ? emp.salary / workingDaysInMonth : 0;
      // 3. Ishchi kelgan kunlar × kunlik maosh
      const earnedSalary = Math.round(dailySalary * workedDays);
      // =====================================

      return {
        employee: {
          id: emp._id, name: emp.name, position: emp.position,
          salary: emp.salary, weeklyOff: emp.weeklyOff
        },
        stats: {
          workingDaysInMonth,  // oy necha ish kuni
          workedDays,          // ishchi necha kun keldi
          totalDays,
          totalMinutes,
          lateCount,
          absentCount,
          overtimeMin,
          dailySalary: Math.round(dailySalary),
          earnedSalary
        },
        records: empRecords
      };
    });

    res.json({ ok: true, month: prefix, report });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Manual davomat qo'shish/o'zgartirish (admin) ---
app.post("/admin/attendance/manual", authMiddleware, async (req, res) => {
  try {
    const { employeeId, date, status, checkIn, checkOut, note } = req.body;
    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ error: "Ishchi topilmadi" });

    let totalMinutes = 0;
    if (checkIn && checkOut) {
      const [ih, im] = checkIn.split(":").map(Number);
      const [oh, om] = checkOut.split(":").map(Number);
      totalMinutes = (oh * 60 + om) - (ih * 60 + im);
    }

    const att = await Attendance.findOneAndUpdate(
      { employeeId, date },
      { employeeId, restaurantId: emp.restaurantId, date, status: status || "keldi", checkIn, checkOut, totalMinutes, note },
      { upsert: true, new: true }
    );
    res.json({ ok: true, attendance: att });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Restoran koordinatalarini saqlash (geofencing uchun) ---
app.put("/admin/employees/:id/location", authMiddleware, async (req, res) => {
  try {
    const { lat, lng, radius } = req.body;
    await Employee.findByIdAndUpdate(req.params.id, { lat, lng, radius: radius || 100 });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

process.on("unhandledRejection", e => console.error("unhandled:", e));

app.listen(PORT, async () => {
  console.log("Server " + PORT + " da ishga tushdi");
  await syncProductsToDB();
  if (DOMAIN) {
    try { await bot.setWebHook("https://" + DOMAIN + WH); console.log("Webhook urnatildi"); }
    catch(e) { console.error("webhook err:", e.message); }
  } else { console.warn("RAILWAY_URL yoq"); }
});