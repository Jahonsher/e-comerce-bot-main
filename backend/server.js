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
// Railway avtomatik domenni beradi
const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  || process.env.RAILWAY_STATIC_URL
  || process.env.RAILWAY_URL;

const bot = new TelegramBot(process.env.BOT_TOKEN, { webHook: false });
console.log("🤖 Bot tayyor, RAILWAY_URL:", RAILWAY_URL || "YO'Q");

/* ================= MONGODB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB ulandi"))
  .catch(err => { console.error("❌ Mongo:", err.message); process.exit(1); });

// Webhook o'rnatish
const PORT = process.env.PORT || 5000;
const WEBHOOK_PATH = `/webhook/${process.env.BOT_TOKEN}`;

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
  telegramId:  Number,
  items:       Array,
  total:       Number,
  userInfo:    Object,
  orderType:   String,   // 'dine_in' yoki 'online'
  tableNumber: String,   // stol raqami yoki 'Online buyurtma'
  status:      { type: String, default: "Yangi" }
}, { timestamps: true });
const Order = mongoose.model("Order", orderSchema);

/* ================= BOT ================= */

// Asosiy menyu klaviaturasi
function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "📋 Buyurtmalarim" }, { text: "📍 Manzil" }],
      [{ text: "🕐 Ish vaqti" },     { text: "📞 Bog'lanish" }]
    ],
    resize_keyboard: true
  };
}

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId    = msg.chat.id;
  const from      = msg.from;
  const firstName = from.first_name || "Do'st";

  const existingUser = await User.findOneAndUpdate(
    { telegramId: from.id },
    { telegramId: from.id, first_name: from.first_name || "", last_name: from.last_name || "", username: from.username || "" },
    { upsert: true, new: true }
  );

  // Telefon yo'q — so'raymiz
  if (!existingUser.phone) {
    await bot.sendMessage(chatId,
      `👋 Salom, *${firstName}*!\n\n🍽 *Imperial Restoran* ga xush kelibsiz!\n\nDavom etish uchun telefon raqamingizni yuboring 👇`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
    return;
  }

  // Telefon bor — asosiy menyu
  await bot.sendMessage(chatId,
    `👋 Xush kelibsiz, *${firstName}*!\n\n🍽 *Imperial Restoran*\n\nQuyidagi bo'limlardan birini tanlang 👇`,
    { parse_mode: "Markdown", reply_markup: mainKeyboard() }
  );
});

// Telefon kelganda
bot.on("contact", async (msg) => {
  const chatId    = msg.chat.id;
  const firstName = msg.from.first_name || "Do'st";

  await User.findOneAndUpdate(
    { telegramId: msg.from.id },
    { phone: msg.contact.phone_number },
    { new: true }
  );

  await bot.sendMessage(chatId,
    `✅ Rahmat, *${firstName}*! Raqamingiz saqlandi.\n\n🍽 *Imperial Restoran* ga xush kelibsiz!\nQuyidagi bo'limlardan birini tanlang 👇`,
    { parse_mode: "Markdown", reply_markup: mainKeyboard() }
  );
});

// 📞 Bog'lanish
bot.onText(/📞|[Bb]og|lanish/, async (msg) => {
  if (!msg.text.includes("lanish")) return;
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    "📞 *Bog\u2019lanish:*

📱 Telefon: +998 77 008 34 13
💬 Telegram: @Jahonsher

Savollaringiz bo\u2019lsa, to\u2019g\u2019ridan murojaat qiling! 👇",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "📱 Qo\u2019ng\u2019iroq qilish", url: "tel:+998770083413" },
          { text: "💬 Telegram", url: "https://t.me/Jahonsher" }
        ]]
      }
    }
  );
  await bot.sendMessage(chatId, "Boshqa bo\u2019limlar:", { reply_markup: mainKeyboard() });
});

// 📋 Buyurtmalarim

bot.onText(/Buyurtmalarim/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const orders = await Order.find({ telegramId: msg.from.id })
      .sort({ createdAt: -1 }).limit(5);

    if (!orders.length) {
      await bot.sendMessage(chatId,
        "📋 Hali buyurtma yo'q.\n\nMenyu va buyurtma uchun 🍽 *Menyu & Buyurtma* tugmasini bosing!",
        { parse_mode: "Markdown", reply_markup: mainKeyboard() }
      );
      return;
    }

    let text = "📋 *So'nggi buyurtmalaringiz:*\n\n";
    orders.forEach((o, i) => {
      const date  = new Date(o.createdAt).toLocaleDateString("uz-UZ");
      const items = o.items.map(it => `${it.name} × ${it.quantity}`).join(", ");
      const table = o.tableNumber ? `📍 ${o.tableNumber}` : "";
      text += `*${i+1}. ${date}* ${table}\n`;
      text += `${items}\n`;
      text += `💰 ${Number(o.total).toLocaleString()} so'm — _${o.status || "Yangi"}_\n\n`;
    });

    await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: mainKeyboard() });
  } catch(err) {
    console.error("ORDERS CMD ERROR:", err.message);
  }
});

// 📍 Manzil
bot.onText(/Manzil/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId,
    `📍 *Bizning manzil:*\n\nToshkent sh., Chilonzor tumani\nNavro'z ko'chasi, 15-uy\n\n🚇 Metro: Chilonzor (5 daqiqa)\n🚗 Parking mavjud`,
    { parse_mode: "Markdown" }
  );

  // Xarita yuborish
  await bot.sendLocation(chatId, 41.2995, 69.2401);

  await bot.sendMessage(chatId, "Yo'l topish uchun 👆", { reply_markup: mainKeyboard() });
});

// 🕐 Ish vaqti
bot.onText(/Ish vaqti/, async (msg) => {
  const chatId = msg.chat.id;

  // Hozirgi vaqtni tekshirish (UTC+5 Toshkent)
  const now      = new Date();
  const hour     = (now.getUTCHours() + 5) % 24;
  const isOpen   = hour >= 10 && hour < 23;
  const statusEmoji = isOpen ? "🟢" : "🔴";
  const statusText  = isOpen ? "Hozir OCHIQ" : "Hozir YOPIQ";

  await bot.sendMessage(chatId,
    `🕐 *Ish vaqtimiz:*\n\n` +
    `Dushanba — Juma:  10:00 – 23:00\n` +
    `Shanba — Yakshanba: 09:00 – 00:00\n\n` +
    `${statusEmoji} *${statusText}*`,
    { parse_mode: "Markdown", reply_markup: mainKeyboard() }
  );
});

/* ================= WEBHOOK ================= */
app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
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

    const { telegramId, items, user, orderType, tableNumber } = req.body;

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
      telegramId:  Number(telegramId),
      items,
      total,
      userInfo,
      orderType:   orderType   || "online",
      tableNumber: tableNumber || "Online buyurtma",
      status: "Yangi"
    });

    console.log("✅ Order saqlandi:", order._id);

    // Telegram xabar
    const name  = `${userInfo.first_name} ${userInfo.last_name}`.trim() || `ID: ${telegramId}`;
    const uname = userInfo.username ? ` (@${userInfo.username})` : "";
    const phone = userInfo.phone    ? `\n📱 Tel: ${userInfo.phone}` : "";

    const tableInfo = orderType === "dine_in"
      ? `🪑 Stol: ${tableNumber}`
      : `🌐 Online buyurtma`;

    let message = `🆕 Yangi buyurtma!\n\n`;
    message    += `${tableInfo}\n`;
    message    += `👤 Mijoz: ${name}${uname}${phone}\n\n`;
    message    += `📦 Mahsulotlar:\n`;
    items.forEach(it => {
      message += `• ${it.name} — ${it.quantity} ta — ${Number(it.price).toLocaleString()} so'm\n`;
    });
    message += `\n💰 Jami: ${total.toLocaleString()} so'm`;

    // Oshpazga inline tugma bilan yuboramiz
    await bot.sendMessage(CHEF_ID, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          {
            text: "✅ Qabul qilish",
            callback_data: `accept_${order._id}_${telegramId}`
          },
          {
            text: "❌ Bekor qilish",
            callback_data: `reject_${order._id}_${telegramId}`
          }
        ]]
      }
    });
    console.log("✅ Telegram yuborildi!");

    res.json({ success: true, order });

  } catch (err) {
    console.error("❌ ORDER ERROR:", err.response?.body || err.message);
    res.status(500).json({ error: err.response?.body?.description || err.message });
  }
});

/* ================= LISTEN ================= */
app.listen(PORT, async () => {
  console.log(`🚀 Server ${PORT} portda ishlayapti`);

  // Webhook ni o'rnatamiz
  if (RAILWAY_URL) {
    const webhookUrl = `https://${RAILWAY_URL}${WEBHOOK_PATH}`;
    try {
      await bot.setWebHook(webhookUrl);
      console.log("✅ Webhook o'rnatildi:", webhookUrl);
    } catch(err) {
      console.error("❌ Webhook xato:", err.message);
    }
  } else {
    console.warn("⚠️ RAILWAY_URL yo'q, webhook o'rnatilmadi");
    // Local uchun polling
    bot.startPolling();
    console.log("🔄 Local polling ishga tushdi");
  }
});// 📋 Buyurtmalarim
// 📋 Buyurtmalarim
bot.onText(/Buyurtmalarim/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const orders = await Order.find({ telegramId: msg.from.id })
      .sort({ createdAt: -1 }).limit(5);

    if (!orders.length) {
      await bot.sendMessage(chatId,
        "📋 Hali buyurtma yo'q.\n\nMenyu va buyurtma uchun 🍽 *Menyu & Buyurtma* tugmasini bosing!",
        { parse_mode: "Markdown", reply_markup: mainKeyboard() }
      );
      return;
    }

    let text = "📋 *So'nggi buyurtmalaringiz:*\n\n";
    orders.forEach((o, i) => {
      const date  = new Date(o.createdAt).toLocaleDateString("uz-UZ");
      const items = o.items.map(it => `${it.name} × ${it.quantity}`).join(", ");
      const table = o.tableNumber ? `📍 ${o.tableNumber}` : "";
      text += `*${i+1}. ${date}* ${table}\n`;
      text += `${items}\n`;
      text += `💰 ${Number(o.total).toLocaleString()} so'm — _${o.status || "Yangi"}_\n\n`;
    });

    await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: mainKeyboard() });
  } catch(err) {
    console.error("ORDERS CMD ERROR:", err.message);
  }
});

// 📍 Manzil
bot.onText(/Manzil/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId,
    `📍 *Bizning manzil:*\n\nToshkent sh., Chilonzor tumani\nNavro'z ko'chasi, 15-uy\n\n🚇 Metro: Chilonzor (5 daqiqa)\n🚗 Parking mavjud`,
    { parse_mode: "Markdown" }
  );

  // Xarita yuborish
  await bot.sendLocation(chatId, 41.2995, 69.2401);

  await bot.sendMessage(chatId, "Yo'l topish uchun 👆", { reply_markup: mainKeyboard() });
});

// 🕐 Ish vaqti
bot.onText(/Ish vaqti/, async (msg) => {
  const chatId = msg.chat.id;

  // Hozirgi vaqtni tekshirish (UTC+5 Toshkent)
  const now      = new Date();
  const hour     = (now.getUTCHours() + 5) % 24;
  const isOpen   = hour >= 10 && hour < 23;
  const statusEmoji = isOpen ? "🟢" : "🔴";
  const statusText  = isOpen ? "Hozir OCHIQ" : "Hozir YOPIQ";

  await bot.sendMessage(chatId,
    `🕐 *Ish vaqtimiz:*\n\n` +
    `Dushanba — Juma:  10:00 – 23:00\n` +
    `Shanba — Yakshanba: 09:00 – 00:00\n\n` +
    `${statusEmoji} *${statusText}*`,
    { parse_mode: "Markdown", reply_markup: mainKeyboard() }
  );
});

/* ================= WEBHOOK ================= */
app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
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

    const { telegramId, items, user, orderType, tableNumber } = req.body;

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
      telegramId:  Number(telegramId),
      items,
      total,
      userInfo,
      orderType:   orderType   || "online",
      tableNumber: tableNumber || "Online buyurtma",
      status: "Yangi"
    });

    console.log("✅ Order saqlandi:", order._id);

    // Telegram xabar
    const name  = `${userInfo.first_name} ${userInfo.last_name}`.trim() || `ID: ${telegramId}`;
    const uname = userInfo.username ? ` (@${userInfo.username})` : "";
    const phone = userInfo.phone    ? `\n📱 Tel: ${userInfo.phone}` : "";

    const tableInfo = orderType === "dine_in"
      ? `🪑 Stol: ${tableNumber}`
      : `🌐 Online buyurtma`;

    let message = `🆕 Yangi buyurtma!\n\n`;
    message    += `${tableInfo}\n`;
    message    += `👤 Mijoz: ${name}${uname}${phone}\n\n`;
    message    += `📦 Mahsulotlar:\n`;
    items.forEach(it => {
      message += `• ${it.name} — ${it.quantity} ta — ${Number(it.price).toLocaleString()} so'm\n`;
    });
    message += `\n💰 Jami: ${total.toLocaleString()} so'm`;

    // Oshpazga inline tugma bilan yuboramiz
    await bot.sendMessage(CHEF_ID, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          {
            text: "✅ Qabul qilish",
            callback_data: `accept_${order._id}_${telegramId}`
          },
          {
            text: "❌ Bekor qilish",
            callback_data: `reject_${order._id}_${telegramId}`
          }
        ]]
      }
    });
    console.log("✅ Telegram yuborildi!");

    res.json({ success: true, order });

  } catch (err) {
    console.error("❌ ORDER ERROR:", err.response?.body || err.message);
    res.status(500).json({ error: err.response?.body?.description || err.message });
  }
});

/* ================= LISTEN ================= */
app.listen(PORT, async () => {
  console.log(`🚀 Server ${PORT} portda ishlayapti`);

  // Webhook ni o'rnatamiz
  if (RAILWAY_URL) {
    const webhookUrl = `https://${RAILWAY_URL}${WEBHOOK_PATH}`;
    try {
      await bot.setWebHook(webhookUrl);
      console.log("✅ Webhook o'rnatildi:", webhookUrl);
    } catch(err) {
      console.error("❌ Webhook xato:", err.message);
    }
  } else {
    console.warn("⚠️ RAILWAY_URL yo'q, webhook o'rnatilmadi");
    // Local uchun polling
    bot.startPolling();
    console.log("🔄 Local polling ishga tushdi");
  }
});