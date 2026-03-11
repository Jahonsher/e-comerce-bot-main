require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

console.log("🔍 ENV tekshiruv:");
console.log("BOT_TOKEN:", process.env.BOT_TOKEN ? "✅ bor" : "❌ YO'Q");
console.log("CHEF_ID:", process.env.CHEF_ID ? "✅ " + process.env.CHEF_ID : "❌ YO'Q");
console.log("MONGO_URI:", process.env.MONGO_URI ? "✅ bor" : "❌ YO'Q");
console.log("WEBAPP_URL:", process.env.WEBAPP_URL ? "✅ " + process.env.WEBAPP_URL : "❌ YO'Q");

if (!process.env.BOT_TOKEN) { console.error("❌ BOT_TOKEN yo'q"); process.exit(1); }
if (!process.env.CHEF_ID)   { console.error("❌ CHEF_ID yo'q");   process.exit(1); }

const CHEF_ID  = Number(process.env.CHEF_ID);
const WEBAPP_URL = process.env.WEBAPP_URL || "https://e-comerce-bot.vercel.app";

/* ================= BOT (polling) ================= */
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
console.log("🤖 Bot polling ishga tushdi");

// /start — contact so'rash
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Do'st";

  // Avval DB ga user qo'shamiz (telefonsiz)
  await User.findOneAndUpdate(
    { telegramId: msg.from.id },
    {
      telegramId: msg.from.id,
      first_name: msg.from.first_name || "",
      last_name:  msg.from.last_name  || "",
      username:   msg.from.username   || ""
    },
    { upsert: true, new: true }
  );

  // Telefon raqam so'rash
  await bot.sendMessage(chatId,
    `👋 Salom, ${firstName}!\n\nDavom etish uchun telefon raqamingizni yuboring 👇`,
    {
      reply_markup: {
        keyboard: [[
          { text: "📱 Telefon raqamni yuborish", request_contact: true }
        ]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  );
});

// Contact kelganda — saqlash + WebApp ochish
bot.on("contact", async (msg) => {
  const chatId  = msg.chat.id;
  const contact = msg.contact;

  // Telefon raqamni saqlash
  const user = await User.findOneAndUpdate(
    { telegramId: msg.from.id },
    { phone: contact.phone_number },
    { new: true }
  );

  console.log("📱 Telefon saqlandi:", contact.phone_number, "user:", msg.from.id);

  // WebApp tugmasini ko'rsatish
  await bot.sendMessage(chatId,
    `✅ Rahmat! Raqamingiz saqlandi.\n\nQuyidagi tugmani bosib do'konni oching 👇`,
    {
      reply_markup: {
        keyboard: [[
          {
            text: "🛒 Do'konni ochish",
            web_app: { url: WEBAPP_URL }
          }
        ]],
        resize_keyboard: true
      }
    }
  );
});

/* ================= MONGODB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => { console.error("❌ Mongo:", err.message); process.exit(1); });

/* ================= MODELS ================= */
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true },
  first_name:  String,
  last_name:   String,
  username:    String,
  phone:       String
}, { timestamps: true });
const User = mongoose.model("User", userSchema);

const orderSchema = new mongoose.Schema({
  telegramId: Number,
  items:      Array,
  total:      Number,
  userInfo:   Object,   // { first_name, last_name, username, phone }
  status:     { type: String, default: "Yangi" }
}, { timestamps: true });
const Order = mongoose.model("Order", orderSchema);

/* ================= ROUTES ================= */

// Products
app.get("/products", (req, res) => {
  try {
    const filePath = path.join(__dirname, "data", "products.json");
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(data);
  } catch (err) {
    console.error("PRODUCT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Auth — WebApp ochilganda chaqiriladi
app.post("/auth", async (req, res) => {
  try {
    const { id, first_name, last_name, username } = req.body;

    const user = await User.findOneAndUpdate(
      { telegramId: id },
      { telegramId: id, first_name, last_name, username },
      { upsert: true, new: true }
    );

    res.json({ ok: true, user });
  } catch (err) {
    console.error("AUTH ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// User ma'lumotlarini olish (profil uchun)
app.get("/user/:telegramId", async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: Number(req.params.telegramId) });
    res.json(user || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User buyurtmalari
app.get("/user/:telegramId/orders", async (req, res) => {
  try {
    const orders = await Order.find({
      telegramId: Number(req.params.telegramId)
    }).sort({ createdAt: -1 }).limit(30);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Order yaratish
app.post("/order", async (req, res) => {
  try {
    console.log("=== ORDER TRIGGERED, CHEF_ID:", CHEF_ID, "===");

    const { telegramId, items } = req.body;

    if (!telegramId)          return res.status(400).json({ error: "telegramId yo'q" });
    if (!items || !items.length) return res.status(400).json({ error: "items bo'sh" });

    // DB dan user ma'lumotlarini olish
    const userInfo = await User.findOne({ telegramId: Number(telegramId) });

    const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

    const order = await Order.create({
      telegramId: Number(telegramId),
      items,
      total,
      userInfo: userInfo ? {
        first_name: userInfo.first_name,
        last_name:  userInfo.last_name,
        username:   userInfo.username,
        phone:      userInfo.phone
      } : null,
      status: "Yangi"
    });

    console.log("✅ Order saqlandi:", order._id);

    // Telegram xabar
    const name  = userInfo
      ? `${userInfo.first_name || ""} ${userInfo.last_name || ""}`.trim()
      : `ID: ${telegramId}`;
    const uname = userInfo?.username ? ` (@${userInfo.username})` : "";
    const phone = userInfo?.phone    ? `\n📱 Tel: ${userInfo.phone}` : "";

    let message = `🆕 Yangi buyurtma!\n\n`;
    message    += `👤 Mijoz: ${name}${uname}${phone}\n\n`;
    message    += `📦 Mahsulotlar:\n`;
    items.forEach(it => {
      message += `• ${it.name} — ${it.quantity} ta — ${Number(it.price).toLocaleString()} so'm\n`;
    });
    message += `\n💰 Jami: ${total.toLocaleString()} so'm`;

    console.log("📩 Telegram xabar yuborilmoqda...");
    await bot.sendMessage(CHEF_ID, message);
    console.log("✅ Telegram yuborildi!");

    res.json({ success: true, order });

  } catch (err) {
    console.error("❌ ORDER ERROR:", err.response?.body || err.message);
    res.status(500).json({ error: err.response?.body?.description || err.message });
  }
});

/* ================= LISTEN ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server ${PORT} portda ishlayapti`));
