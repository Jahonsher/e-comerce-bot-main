const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Admin = require("../models/Admin");
const { Restaurant, Shot, Employee } = require("../models");
const { isBotBlocked } = require("../middleware/auth");
const { orderLimiter } = require("../middleware/rateLimit");
const { createNotification } = require("../services/notification.service");
const botService = require("../services/bot.service");
const logger = require("../utils/logger");

// ===== Health check =====
router.get("/", (req, res) => {
  res.json({ status: "OK", bots: botService.getActiveBots() });
});

// ===== Block tekshirish =====
router.get("/check-block/:restaurantId", async (req, res) => {
  try {
    res.json(await isBotBlocked(req.params.restaurantId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== CACHE (products va categories uchun) =====
const cache = {};
const CACHE_TTL = 60000; // 1 daqiqa

function getCached(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  cache[key] = { data, time: Date.now() };
}

// ===== Mahsulotlar (public, cached) =====
router.get("/products", async (req, res) => {
  try {
    const rId = req.query.restaurantId;
    if (!rId) return res.status(400).json({ error: "restaurantId kerak" });

    const cacheKey = `products:${rId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const products = await Product.find({ restaurantId: rId }).sort({ id: 1 }).lean();
    setCache(cacheKey, products);
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Kategoriyalar (public, cached) =====
router.get("/categories", async (req, res) => {
  try {
    const rId = req.query.restaurantId;
    if (!rId) return res.status(400).json({ error: "restaurantId kerak" });

    const cacheKey = `categories:${rId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const cats = await Category.find({ restaurantId: rId, active: true }).sort({ order: 1 }).lean();
    setCache(cacheKey, cats);
    res.json(cats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Telegram auth =====
router.post("/auth", async (req, res) => {
  try {
    const { id, first_name, last_name, username, restaurantId } = req.body;
    if (!restaurantId) return res.status(400).json({ error: "restaurantId kerak" });
    if (!id) return res.status(400).json({ error: "id kerak" });

    const numId = Number(id);
    const user = await User.findOneAndUpdate(
      { telegramId: numId, restaurantId },
      {
        $set: {
          telegramId: numId,
          restaurantId,
          first_name: first_name || "",
          last_name: last_name || "",
          username: username || "",
        },
      },
      { upsert: true, new: true }
    );
    res.json({ ok: true, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Foydalanuvchi ma'lumotlari =====
router.get("/user/:id", async (req, res) => {
  try {
    const rId = req.query.restaurantId;
    const user = await User.findOne({
      telegramId: Number(req.params.id),
      restaurantId: rId,
    });
    res.json(user || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Foydalanuvchi buyurtmalari tarixi =====
router.get("/orders/user/:telegramId", async (req, res) => {
  try {
    const { restaurantId } = req.query;
    if (!restaurantId) return res.status(400).json({ error: "restaurantId kerak" });
    const orders = await Order.find({
      telegramId: Number(req.params.telegramId),
      restaurantId,
    })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Yangi buyurtma =====
router.post("/order", orderLimiter, async (req, res) => {
  try {
    const { telegramId, items, user, orderType, tableNumber, restaurantId } = req.body;

    // Validatsiya
    if (!telegramId || !items?.length || !restaurantId) {
      return res.status(400).json({ error: "Ma'lumot yetarli emas" });
    }

    // Block tekshirish
    const blockCheck = await isBotBlocked(restaurantId);
    if (blockCheck.blocked) {
      return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    }

    // Foydalanuvchi ma'lumotlarini olish
    const db = await User.findOne({ telegramId: Number(telegramId), restaurantId });
    const ui = {
      first_name: db?.first_name || user?.first_name || "",
      last_name: db?.last_name || user?.last_name || "",
      username: db?.username || user?.username || "",
      phone: db?.phone || user?.phone || "",
    };

    const total = items.reduce((s, i) => s + Number(i.price) * (Number(i.quantity) || 1), 0);

    // Admin ma'lumotlari
    const adminInfo = await Admin.findOne({ restaurantId, role: "admin" });

    // ===== DINE_IN: Shot tizimi =====
    if (orderType === "dine_in" && tableNumber && adminInfo?.modules?.waiter) {
      try {
        let shot = await Shot.findOne({
          restaurantId,
          tableNumber: String(tableNumber),
          status: "open",
        });

        if (shot) {
          // Mavjud shotga qo'shish
          const newItems = items.map((i) => ({
            name: i.name,
            name_ru: i.name_ru || "",
            price: Number(i.price),
            quantity: Number(i.quantity) || 1,
            addedBy: "customer",
            sentToKitchen: false,
            kitchenStatus: "pending",
            addedAt: new Date(),
          }));
          shot.items.push(...newItems);
          shot.total = shot.items.reduce((s, i) => s + i.price * i.quantity, 0);
          if (!shot.customerTelegramId) shot.customerTelegramId = Number(telegramId);
          await shot.save();
        } else {
          // Yangi shot — ofitsiant topish
          let assignedWaiter = null;
          assignedWaiter = await Employee.findOne({
            restaurantId,
            role: "waiter",
            active: true,
            tables: String(tableNumber),
          });

          if (!assignedWaiter) {
            const waiters = await Employee.find({ restaurantId, role: "waiter", active: true });
            if (waiters.length > 0) {
              const waiterCounts = await Promise.all(
                waiters.map(async (w) => ({
                  waiter: w,
                  count: await Shot.countDocuments({ restaurantId, waiterId: w._id, status: "open" }),
                }))
              );
              waiterCounts.sort((a, b) => a.count - b.count);
              assignedWaiter = waiterCounts[0].waiter;
            }
          }

          const shotItems = items.map((i) => ({
            name: i.name,
            name_ru: i.name_ru || "",
            price: Number(i.price),
            quantity: Number(i.quantity) || 1,
            addedBy: "customer",
            sentToKitchen: false,
            kitchenStatus: "pending",
            addedAt: new Date(),
          }));

          shot = await Shot.create({
            restaurantId,
            tableNumber: String(tableNumber),
            waiterId: assignedWaiter?._id || null,
            waiterName: assignedWaiter?.name || "",
            status: "open",
            items: shotItems,
            total,
            customerTelegramId: Number(telegramId),
          });
        }

        // Socket events
        const io = req.app.get("io");
        if (io) {
          io.to(`${restaurantId}:waiter`).emit("new-order", shot);
          io.to(`${restaurantId}:customer`).emit("shot-updated", shot);
        }

        // Order ham yaratamiz
        const order = await Order.create({
          telegramId: Number(telegramId),
          items,
          total,
          userInfo: ui,
          orderType: "dine_in",
          tableNumber: String(tableNumber),
          status: "Yangi",
          restaurantId,
        });

        // Telegram xabar
        const name = `${ui.first_name} ${ui.last_name}`.trim() || `ID:${telegramId}`;
        const targetChef = adminInfo?.chefId || null;
        const bot = botService.getBot(restaurantId);
        if (targetChef && bot) {
          let m = `🆕 Yangi buyurtma (Stol ${tableNumber})!\nMijoz: ${name}\n\nMahsulotlar:\n`;
          items.forEach((i) => {
            m += `- ${i.name} x${i.quantity} | ${Number(i.price).toLocaleString()} som\n`;
          });
          m += `\nJami: ${total.toLocaleString()} som`;
          await bot.sendMessage(targetChef, m);
        }

        await createNotification(
          restaurantId,
          "order_new",
          `🆕 Stol ${tableNumber} — yangi buyurtma`,
          `${ui.first_name || "Mijoz"} — ${total.toLocaleString()} so'm`,
          "🛒",
          "admin",
          null,
          { orderId: order._id, shotId: shot._id }
        );

        return res.json({ success: true, order, shot });
      } catch (shotErr) {
        logger.error("Shot xato:", shotErr.message);
      }
    }

    // ===== ONLINE yoki waiter moduli yo'q =====
    const order = await Order.create({
      telegramId: Number(telegramId),
      items,
      total,
      userInfo: ui,
      orderType: orderType || "online",
      tableNumber: tableNumber || "Online",
      status: "Yangi",
      restaurantId,
    });

    const name = `${ui.first_name} ${ui.last_name}`.trim() || `ID:${telegramId}`;
    const uname = ui.username ? ` (@${ui.username})` : "";
    const phone = ui.phone ? `\nTel: ${ui.phone}` : "";
    const table = orderType === "dine_in" ? `Stol: ${tableNumber}` : "Online";
    const targetChef = adminInfo?.chefId || null;
    const bot = botService.getBot(restaurantId);

    let m = `🆕 Yangi buyurtma!\n\n${table}\nMijoz: ${name}${uname}${phone}\n\nMahsulotlar:\n`;
    items.forEach((i) => {
      m += `- ${i.name} x${i.quantity} | ${Number(i.price).toLocaleString()} som\n`;
    });
    m += `\nJami: ${total.toLocaleString()} som`;

    if (targetChef && bot) {
      await bot.sendMessage(targetChef, m, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Qabul", callback_data: `accept_${order._id}_${telegramId}` },
              { text: "❌ Rad", callback_data: `reject_${order._id}_${telegramId}` },
            ],
          ],
        },
      });
    }

    await createNotification(
      restaurantId,
      "order_new",
      `🆕 Yangi buyurtma #${String(order._id).slice(-6)}`,
      `${name} — ${total.toLocaleString()} so'm`,
      "🛒",
      "admin",
      null,
      { orderId: order._id }
    );

    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Webhook =====
router.post("/wh/:restaurantId/:hash", (req, res) => {
  botService.processWebhook(req.params.restaurantId, req.body);
  res.sendStatus(200);
});

module.exports = router;