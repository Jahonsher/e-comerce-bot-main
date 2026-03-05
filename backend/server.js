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

if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN .env da yo'q");
  process.exit(1);
}

// ✅ FIX 1: polling: true qo'shildi — bots'iz sendMessage ishlamaydi
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

console.log("🤖 Telegram bot ishga tushdi");

/* ================= MONGODB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => {
    console.error("❌ Mongo error:", err.message);
    process.exit(1);
  });

/* ================= ORDER MODEL ================= */
const orderSchema = new mongoose.Schema({
  telegramId: Number,
  items: Array,
  total: Number,
  userInfo: Object,
  status: { type: String, default: "Yangi" }
}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);

/* ================= USER MODEL ================= */
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true },
  first_name: String,
  last_name: String,
  username: String
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

/* ================= PRODUCTS ================= */
// ✅ FIX 2: products.json to'g'ri o'qiladi
app.get("/products", (req, res) => {
  try {
    const filePath = path.join(__dirname, "data", "products.json");
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(data);
  } catch (err) {
    console.error("PRODUCT ERROR:", err.message);
    res.status(500).json({ error: "Products o'qishda xato: " + err.message });
  }
});

/* ================= AUTH ================= */
app.post("/auth", async (req, res) => {
  try {
    const { id, first_name, last_name, username } = req.body;
    await User.findOneAndUpdate(
      { telegramId: id },
      { telegramId: id, first_name, last_name, username },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("AUTH ERROR:", err.message);
    res.status(500).json({ error: "Auth xato" });
  }
});

/* ================= CREATE ORDER ================= */
app.post("/order", async (req, res) => {
  try {
    console.log("=== ORDER ROUTE TRIGGERED ===");

    const { telegramId, items, user } = req.body;

    if (!telegramId) return res.status(400).json({ error: "telegramId yo'q" });
    if (!items || !items.length) return res.status(400).json({ error: "items bo'sh" });

    const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

    const order = await Order.create({
      telegramId: Number(telegramId),
      items,
      total,
      userInfo: user || null,
      status: "Yangi"
    });

    // ✅ FIX 3: Telegram xabar chiroyli formatda
    const userName = user
      ? (user.first_name || "") + " " + (user.last_name || "") + (user.username ? ` (@${user.username})` : "")
      : `ID: ${telegramId}`;

    let message = `🆕 *Yangi buyurtma!*\n`;
    message += `👤 Mijoz: ${userName.trim()}\n\n`;
    message += `📦 *Mahsulotlar:*\n`;
    items.forEach(it => {
      message += `• ${it.name} — ${it.quantity} ta — ${Number(it.price).toLocaleString()} so'm\n`;
    });
    message += `\n💰 *Jami: ${total.toLocaleString()} so'm*`;

    // ✅ FIX 4: CHEF_ID tekshiriladi
    if (!process.env.CHEF_ID) {
      console.error("❌ CHEF_ID .env da yo'q!");
    } else {
      console.log("📩 Telegramga yuborilmoqda, CHEF_ID:", process.env.CHEF_ID);
      await bot.sendMessage(Number(process.env.CHEF_ID), message, { parse_mode: "Markdown" });
      console.log("✅ Telegram yuborildi");
    }

    res.json(order);

  } catch (err) {
    console.error("❌ ORDER ERROR:", err.response?.body || err.message);
    res.status(500).json({ error: "Order server error: " + err.message });
  }
});

/* ================= USER ORDERS ================= */
// ✅ FIX 5: /user/:id route qo'shildi — frontend shu endpointni so'raydi
app.get("/user/:telegramId", async (req, res) => {
  try {
    const orders = await Order.find({
      telegramId: Number(req.params.telegramId)
    }).sort({ createdAt: -1 }).limit(20);
    res.json(orders);
  } catch (err) {
    console.error("USER ORDERS ERROR:", err.message);
    res.status(500).json({ error: "User orders xato" });
  }
});

/* ================= LISTEN ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portda ishlayapti`);
});