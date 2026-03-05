require("dotenv").config();

const express     = require("express");
const mongoose    = require("mongoose");
const cors        = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const fs          = require("fs");
const path        = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const TOKEN      = process.env.BOT_TOKEN;
const CHEF_ID    = Number(process.env.CHEF_ID);
const MONGO_URI  = process.env.MONGO_URI;
const WEBAPP_URL = process.env.WEBAPP_URL || "https://e-comerce-bot.vercel.app";
const PORT       = process.env.PORT || 5000;
const DOMAIN     = process.env.RAILWAY_URL || "";

if (!TOKEN)    { console.error("BOT_TOKEN yoq"); process.exit(1); }
if (!CHEF_ID)  { console.error("CHEF_ID yoq");   process.exit(1); }

// FAQAT webhook — polling YOQILMAYDI
const bot = new TelegramBot(TOKEN);

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB ulandi"))
  .catch(err => { console.error("Mongo:", err.message); process.exit(1); });

const User = mongoose.model("User", new mongoose.Schema({
  telegramId: { type: Number, unique: true },
  first_name: String, last_name: String,
  username: String, phone: String
}, { timestamps: true }));

const Order = mongoose.model("Order", new mongoose.Schema({
  telegramId: Number, items: Array, total: Number,
  userInfo: Object, orderType: String,
  tableNumber: String, status: { type: String, default: "Yangi" }
}, { timestamps: true }));

const menu = {
  keyboard: [
    [{ text: "Buyurtmalarim" }, { text: "Manzil"    }],
    [{ text: "Ish vaqti"     }, { text: "Boglanish" }]
  ],
  resize_keyboard: true
};

async function send(id, text, extra) {
  try { await bot.sendMessage(id, text, extra || {}); }
  catch(e) { console.error("send err:", e.message); }
}

bot.onText(/\/start/, async (msg) => {
  try {
    const u = await User.findOneAndUpdate(
      { telegramId: msg.from.id },
      { telegramId: msg.from.id, first_name: msg.from.first_name || "", last_name: msg.from.last_name || "", username: msg.from.username || "" },
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
  try {
    await send(msg.chat.id, "Manzil:\nToshkent, Chilonzor tumani\nNavroz kochasi 15-uy\nMetro: Chilonzor (5 daqiqa)", { reply_markup: menu });
  } catch(e) { console.error("manzil:", e.message); }
});

bot.onText(/Ish vaqti/, async (msg) => {
  try {
    const h = (new Date().getUTCHours() + 5) % 24;
    await send(msg.chat.id,
      "Ish vaqti:\nDu-Ju: 10:00-23:00\nSh-Ya: 09:00-00:00\n\n" + (h >= 10 && h < 23 ? "Hozir OCHIQ" : "Hozir YOPIQ"),
      { reply_markup: menu }
    );
  } catch(e) { console.error("ish vaqti:", e.message); }
});

bot.onText(/Boglanish/, async (msg) => {
  try {
    await send(msg.chat.id,
      "Boglanish:\n\nTelefon: +998 77 008 34 13\nTelegram: @Jahonsher",
      { reply_markup: { inline_keyboard: [[{ text: "Telegram @Jahonsher", url: "https://t.me/Jahonsher" }]] } }
    );
  } catch(e) { console.error("boglanish:", e.message); }
});

bot.on("callback_query", async (q) => {
  try {
    const [action, orderId, userId] = q.data.split("_");
    if (action === "accept") {
      await Order.findByIdAndUpdate(orderId, { status: "Qabul qilindi" });
      await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "Qabul qilindi", callback_data: "done" }]] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
      await send(Number(userId), "Buyurtmangiz qabul qilindi! Tayyorlanmoqda.");
    } else if (action === "reject") {
      await Order.findByIdAndUpdate(orderId, { status: "Bekor qilindi" });
      await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: "Bekor qilindi", callback_data: "done" }]] }, { chat_id: q.message.chat.id, message_id: q.message.message_id });
      await send(Number(userId), "Buyurtmangiz bekor qilindi. Kechirasiz.");
    }
    await bot.answerCallbackQuery(q.id);
  } catch(e) { console.error("callback:", e.message); }
});

// Webhook endpoint
const WH = "/wh/" + TOKEN;
app.post(WH, (req, res) => {
  try { bot.processUpdate(req.body); } catch(e) { console.error("processUpdate:", e.message); }
  res.sendStatus(200);
});

app.get("/products", (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(__dirname, "data", "products.json"), "utf-8")));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/auth", async (req, res) => {
  try {
    const { id, first_name, last_name, username } = req.body;
    const user = await User.findOneAndUpdate(
      { telegramId: id },
      { $set: { telegramId: id, first_name: first_name||"", last_name: last_name||"", username: username||"" } },
      { upsert: true, new: true }
    );
    res.json({ ok: true, user });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/user/:id", async (req, res) => {
  try {
    res.json(await User.findOne({ telegramId: Number(req.params.id) }) || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/user/:id/orders", async (req, res) => {
  try {
    res.json(await Order.find({ telegramId: Number(req.params.id) }).sort({ createdAt: -1 }).limit(30));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/order", async (req, res) => {
  try {
    const { telegramId, items, user, orderType, tableNumber } = req.body;
    if (!telegramId || !items?.length) return res.status(400).json({ error: "malumot yoq" });

    const db = await User.findOne({ telegramId: Number(telegramId) });
    const ui = {
      first_name: db?.first_name || user?.first_name || "",
      last_name:  db?.last_name  || user?.last_name  || "",
      username:   db?.username   || user?.username   || "",
      phone:      db?.phone      || user?.phone      || ""
    };

    const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    const order = await Order.create({ telegramId: Number(telegramId), items, total, userInfo: ui, orderType: orderType||"online", tableNumber: tableNumber||"Online", status: "Yangi" });

    const name  = (ui.first_name + " " + ui.last_name).trim() || "ID:" + telegramId;
    const uname = ui.username ? " (@" + ui.username + ")" : "";
    const phone = ui.phone    ? "\nTel: " + ui.phone : "";
    const table = orderType === "dine_in" ? "Stol: " + tableNumber : "Online";

    let m = "Yangi buyurtma!\n\n" + table + "\nMijoz: " + name + uname + phone + "\n\nMahsulotlar:\n";
    items.forEach(i => { m += "- " + i.name + " x" + i.quantity + " | " + Number(i.price).toLocaleString() + " som\n"; });
    m += "\nJami: " + total.toLocaleString() + " som";

    await send(CHEF_ID, m, {
      reply_markup: { inline_keyboard: [[
        { text: "Qabul", callback_data: "accept_" + order._id + "_" + telegramId },
        { text: "Rad",   callback_data: "reject_" + order._id + "_" + telegramId }
      ]]}
    });

    res.json({ success: true, order });
  } catch(e) { console.error("order:", e.message); res.status(500).json({ error: e.message }); }
});

process.on("uncaughtException",  e => console.error("uncaught:", e.message));
process.on("unhandledRejection", e => console.error("unhandled:", e));

app.listen(PORT, async () => {
  console.log("Server " + PORT + " da ishga tushdi");
  if (DOMAIN) {
    try {
      await bot.setWebHook("https://" + DOMAIN + WH);
      console.log("Webhook urnatildi");
    } catch(e) { console.error("webhook err:", e.message); }
  } else {
    console.warn("RAILWAY_URL yoq — webhook urnatilmadi");
  }
});