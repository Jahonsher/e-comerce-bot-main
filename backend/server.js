require("dotenv").config();

const express   = require("express");
const mongoose  = require("mongoose");
const cors      = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const fs        = require("fs");
const path      = require("path");

const app = express();
app.use(cors());
app.use(express.json());

console.log("🔍 ENV tekshiruv:");
console.log("BOT_TOKEN:", process.env.BOT_TOKEN ? "✅ bor" : "❌ YO'Q");
console.log("CHEF_ID:",   process.env.CHEF_ID   ? "✅ " + process.env.CHEF_ID : "❌ YO'Q");
console.log("MONGO_URI:", process.env.MONGO_URI  ? "✅ bor" : "❌ YO'Q");
console.log("WEBAPP_URL:",process.env.WEBAPP_URL ? "✅ " + process.env.WEBAPP_URL : "❌ YO'Q");

if (!process.env.BOT_TOKEN) { console.error("❌ BOT_TOKEN yo'q"); process.exit(1); }
if (!process.env.CHEF_ID)   { console.error("❌ CHEF_ID yo'q");   process.exit(1); }

const CHEF_ID    = Number(process.env.CHEF_ID);
const WEBAPP_URL = process.env.WEBAPP_URL || "https://e-comerce-bot.vercel.app";
const bot        = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

console.log("🤖 Bot polling ishga tushdi");

/* ================= MONGODB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => { console.error("❌ Mongo:", err.message); process.exit(1); });

/* ================= MODELS ================= */
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true },
  first_name: String,
  last_name:  String,
  username:   String,
  phone:      String
}, { timestamps: true });
const User = mongoose.model("User", userSchema);

const orderSchema = new mongoose.Schema({
  telegramId: Number,
  items:      Array,
  total:      Number,
  userInfo:   Object,
  status:     { type: String, default: "Yangi" }
}, { timestamps: true });
const Order = mongoose.model("Order", orderSchema);

/* ================= BOT ================= */

// /start — agar telefon bor bo'lsa WebApp, aks holda telefon so'raydi
bot.onText(/\/start/, async (msg) => {
  const chatId    = msg.chat.id;
  const from      = msg.from;
  const firstName = from.first_name || "Do'st";

  // Har doim DB ga yozamiz
  const existingUser = await User.findOneAndUpdate(
    { telegramId: from.id },
    {
      telegramId: from.id,
      first_name: from.first_name || "",
      last_name:  from.last_name  || "",
      username:   from.username   || ""
    },
    { upsert: true, new: true }
  );

  console.log("✅ /start user:", existingUser.telegramId, existingUser.first_name);

  // Telefon allaqachon saqlangan — to'g'ri WebApp ochiladi
  if (existingUser.phone) {
    await bot.sendMessage(chatId,
      `👋 Xush kelibsiz, ${firstName}!\n\nDo'konni ochish uchun quyidagi tugmani bosing 👇`,
      {
        reply_markup: {
          keyboard: [[{ text: "🛒 Do'konni ochish", web_app: { url: WEBAPP_URL } }]],
          resize_keyboard: true
        }
      }
    );
    return;
  }

  // 1-marta — telefon so'raladi
  await bot.sendMessage(chatId,
    `👋 Salom, ${firstName}!\n\nDavom etish uchun telefon raqamingizni yuboring 👇`,
    {
      reply_markup: {
        keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  );
});

// Telefon kelganda — saqlash + WebApp tugmasi
bot.on("contact", async (msg) => {
  const chatId    = msg.chat.id;
  const firstName = msg.from.first_name || "Do'st";

  await User.findOneAndUpdate(
    { telegramId: msg.from.id },
    { phone: msg.contact.phone_number },
    { new: true }
  );

  console.log("📱 Telefon saqlandi:", msg.contact.phone_number);

  await bot.sendMessage(chatId,
    `✅ Rahmat! Raqamingiz saqlandi.\n\nQuyidagi tugmani bosib do'konni oching 👇`,
    {
      reply_markup: {
        keyboard: [[{ text: "🛒 Do'konni ochish", web_app: { url: WEBAPP_URL } }]],
        resize_keyboard: true
      }
    }
  );
});

/* ================= API ROUTES ================= */

// Mahsulotlar
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
      { $set: { telegramId: id, first_name: first_name || "", last_name: last_name || "", username: username || "" } },
      { upsert: true, new: true }
    );

    res.json({ ok: true, user });
  } catch (err) {
    console.error("AUTH ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// User profili
app.get("/user/:telegramId", async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: Number(req.params.telegramId) });
    if (!user) return res.json({});
    res.json({
      telegramId: user.telegramId,
      first_name: user.first_name || "",
      last_name:  user.last_name  || "",
      username:   user.username   || "",
      phone:      user.phone      || ""
    });
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

// Buyurtma yaratish
app.post("/order", async (req, res) => {
  try {
    console.log("=== ORDER TRIGGERED, CHEF_ID:", CHEF_ID, "===");

    const { telegramId, items, user } = req.body;

    if (!telegramId)             return res.status(400).json({ error: "telegramId yo'q" });
    if (!items || !items.length) return res.status(400).json({ error: "items bo'sh" });

    // DB dan user, bo'lmasa frontenddan kelgan ma'lumot
    let dbUser = await User.findOne({ telegramId: Number(telegramId) });

    const userInfo = {
      first_name: dbUser?.first_name || user?.first_name || "",
      last_name:  dbUser?.last_name  || user?.last_name  || "",
      username:   dbUser?.username   || user?.username   || "",
      phone:      dbUser?.phone      || user?.phone      || ""
    };

    // Yangi ma'lumot kelgan bo'lsa DB ga yozamiz
    if (user?.first_name || user?.phone) {
      await User.findOneAndUpdate(
        { telegramId: Number(telegramId) },
        { telegramId: Number(telegramId), ...userInfo },
        { upsert: true, new: true }
      );
    }

    const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);

    const order = await Order.create({
      telegramId: Number(telegramId),
      items,
      total,
      userInfo,
      status: "Yangi"
    });

    console.log("✅ Order saqlandi:", order._id);

    // Telegram xabar
    const name  = `${userInfo.first_name} ${userInfo.last_name}`.trim() || `ID: ${telegramId}`;
    const uname = userInfo.username ? ` (@${userInfo.username})` : "";
    const phone = userInfo.phone    ? `\n📱 Tel: ${userInfo.phone}` : "";

    let message = `🆕 Yangi buyurtma!\n\n`;
    message    += `👤 Mijoz: ${name}${uname}${phone}\n\n`;
    message    += `📦 Mahsulotlar:\n`;
    items.forEach(it => {
      message += `• ${it.name} — ${it.quantity} ta — ${Number(it.price).toLocaleString()} so'm\n`;
    });
    message += `\n💰 Jami: ${total.toLocaleString()} so'm`;

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