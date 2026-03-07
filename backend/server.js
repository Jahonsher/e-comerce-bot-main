require("dotenv").config();

const express     = require("express");
const mongoose    = require("mongoose");
const cors        = require("cors");
const TelegramBot = require("node-telegram-bot-api");
const fs          = require("fs");
const path        = require("path");
const jwt         = require("jsonwebtoken");
const bcrypt      = require("bcryptjs");

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
process.on("unhandledRejection", e => console.error("unhandled:", e));

app.listen(PORT, async () => {
  console.log("Server " + PORT + " da ishga tushdi");
  await syncProductsToDB();
  if (DOMAIN) {
    try { await bot.setWebHook("https://" + DOMAIN + WH); console.log("Webhook urnatildi"); }
    catch(e) { console.error("webhook err:", e.message); }
  } else { console.warn("RAILWAY_URL yoq"); }
});