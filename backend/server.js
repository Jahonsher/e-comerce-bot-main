require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const app = express();

/* ===========================
   CORS (MUHIM)
=========================== */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

/* ===========================
   TELEGRAM BOT
=========================== */
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: process.env.NODE_ENV !== "production"
});

/* ===========================
   MONGODB
=========================== */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB ulandi ✅"))
  .catch(err => console.log("Mongo error:", err));

/* ===========================
   MODELS
=========================== */
const orderSchema = new mongoose.Schema({
  telegramId: Number,
  items: Array,
  total: Number,
  status: { type: String, default: "new" },
  userInfo: Object,
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model("Order", orderSchema);

const userSchema = new mongoose.Schema({
  telegramId: Number,
  first_name: String,
  username: String
});

const User = mongoose.model("User", userSchema);

/* ===========================
   ROUTES
=========================== */

/* PRODUCTS */
app.get("/products", (req, res) => {
  try {
    const filePath = path.join(__dirname, "data", "products.json");
    const data = fs.readFileSync(filePath);
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: "Products o‘qilmadi" });
  }
});

/* AUTH */
app.post("/auth", async (req, res) => {
  try {
    const { id, first_name, username } = req.body;

    let user = await User.findOne({ telegramId: id });

    if (!user) {
      user = await User.create({
        telegramId: id,
        first_name,
        username
      });
    }

    res.json(user);

  } catch (err) {
    res.status(500).json({ error: "Auth error" });
  }
});

/* CREATE ORDER */
app.post("/order", async (req, res) => {

  try {

    const { telegramId, items, user } = req.body;

    if (!telegramId)
      return res.status(400).json({ error: "telegramId yo‘q" });

    if (!items || !items.length)
      return res.status(400).json({ error: "items bo‘sh" });

    const total = items.reduce(
      (sum, i) => sum + (i.price * i.quantity),
      0
    );

    const order = await Order.create({
      telegramId,
      items,
      total,
      userInfo: user || null
    });

    /* Telegram xabar */
    try {

      const text = items
        .map(i => `${i.name} - ${i.quantity} ta`)
        .join("\n");

      await bot.sendMessage(
        process.env.CHEF_ID,
        `🆕 Yangi buyurtma

${text}

💰 ${total} so'm`
      );

    } catch (tgErr) {
      console.log("Telegram error:", tgErr.message);
    }

    res.json(order);

  } catch (err) {
    console.log("ORDER ERROR:", err);
    res.status(500).json({ error: "Order server error" });
  }
});

/* USER ORDERS */
app.get("/user/:telegramId", async (req, res) => {

  try {

    const orders = await Order.find({
      telegramId: req.params.telegramId
    }).sort({ createdAt: -1 });

    res.json(orders);

  } catch (err) {
    res.status(500).json({ error: "User order error" });
  }
});

/* HEALTH CHECK */
app.get("/", (req, res) => {
  res.send("Backend ishlayapti 🚀");
});

/* ===========================
   START SERVER
=========================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server ishlayapti 🚀");
});