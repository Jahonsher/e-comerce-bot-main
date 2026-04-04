const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { superMiddleware } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimit");
const { createSANotif } = require("../services/notification.service");
const botService = require("../services/bot.service");
const logger = require("../utils/logger");

const Order = require("../models/Order");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Category = require("../models/Category");
const {
  Restaurant, AuditLog, Payment, SANotification,
} = require("../models");
const {
  BUSINESS_TYPES,
  getDefaultModules,
  getAvailableModuleKeys,
  isCoreModule,
  isValidBusinessType,
  getAllBusinessTypes,
  getModuleDetails,
} = require("../config/businessTypes");

// ===== Audit log helper =====
async function logAudit(action, actor, role, restaurantId, details, ip) {
  try {
    await AuditLog.create({ action, actor, actorRole: role || "superadmin", restaurantId: restaurantId || "", details: details || "", ip: ip || "" });
  } catch (e) {
    logger.error("AuditLog error:", e.message);
  }
}

// ===== Restaurant helper =====
async function ensureRestaurant(restaurantId, name, businessType) {
  const exists = await Restaurant.findOne({ restaurantId });
  if (!exists) {
    await Restaurant.create({ restaurantId, name: name || restaurantId, businessType: businessType || "restaurant", blocked: false, blockReason: "" });
  }
}

// ===== LOGIN =====
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });

    const admin = await Admin.findOne({ username, role: "superadmin" });
    if (!admin) return res.status(401).json({ error: "Superadmin topilmadi" });

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });

    const token = jwt.sign({ id: admin._id, username: admin.username, role: admin.role }, config.jwtSecret, { expiresIn: "7d" });
    res.json({ ok: true, token, admin: { username: admin.username, role: admin.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== RESTAURANTS CRUD =====
router.get("/restaurants", superMiddleware, async (req, res) => {
  try {
    const admins = await Admin.find({ role: "admin" }).select("-password").sort({ createdAt: -1 });
    const rests = await Restaurant.find({});
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const result = await Promise.all(
      admins.map(async (a) => {
        const rest = rests.find((r) => r.restaurantId === a.restaurantId);
        const [todayOrders, totalOrders] = await Promise.all([
          Order.countDocuments({ restaurantId: a.restaurantId, createdAt: { $gte: todayStart } }),
          Order.countDocuments({ restaurantId: a.restaurantId }),
        ]);
        return {
          ...a.toObject(),
          blocked: rest?.blocked || false,
          blockReason: rest?.blockReason || "",
          todayOrders,
          totalOrders,
        };
      })
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/restaurants", superMiddleware, async (req, res) => {
  try {
    const { username, password, restaurantName, restaurantId, botToken, chefId, phone, address, webappUrl, businessType } = req.body;
    if (!username || !password || !restaurantName || !restaurantId) {
      return res.status(400).json({ error: "username, password, restaurantName, restaurantId majburiy" });
    }

    // Biznes turini tekshirish (default: restaurant)
    const type = businessType && isValidBusinessType(businessType) ? businessType : "restaurant";
    const defaultModules = getDefaultModules(type);

    const exists = await Admin.findOne({ $or: [{ username }, { restaurantId, role: "admin" }] });
    if (exists) return res.status(400).json({ error: "Bu username yoki RestaurantID allaqachon mavjud" });

    const hash = await bcrypt.hash(password, 10);
    const admin = await Admin.create({
      username, password: hash, restaurantName, restaurantId,
      botToken: botToken || "", chefId: Number(chefId) || 0,
      phone: phone || "", address: address || "", webappUrl: webappUrl || "",
      role: "admin", active: true,
      businessType: type,
      modules: defaultModules,
    });

    await ensureRestaurant(restaurantId, restaurantName, type);

    // Restoran turi uchun default kategoriyalar
    if (type === "restaurant") {
      await Category.insertMany([
        { name: "Taom", name_ru: "Еда", emoji: "🍽", order: 1, restaurantId },
        { name: "Ichimlik", name_ru: "Напитки", emoji: "🥤", order: 2, restaurantId },
      ]);
    }

    if (botToken) await botService.startBot(restaurantId, botToken, webappUrl, Number(chefId));

    await logAudit("restaurant_create", req.admin.username, "superadmin", restaurantId, `Yangi restoran: ${restaurantName}`);
    await createSANotif("restaurant_new", "🏪 Yangi restoran qo'shildi", `${restaurantName} (ID: ${restaurantId})`, "🏪");

    res.json({ ok: true, admin: { username: admin.username, restaurantName, restaurantId } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/restaurants/:id", superMiddleware, async (req, res) => {
  try {
    const { password, active, blockReason, ...rest } = req.body;
    const update = { ...rest };
    if (password) update.password = await bcrypt.hash(password, 10);
    if (active !== undefined) update.active = active;
    if (blockReason !== undefined) update.blockReason = blockReason;

    const admin = await Admin.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password");
    if (!admin) return res.status(404).json({ error: "Topilmadi" });

    if (active !== undefined) {
      const isBlocked = active === false;
      await Restaurant.findOneAndUpdate(
        { restaurantId: admin.restaurantId },
        { blocked: isBlocked, blockReason: isBlocked ? (blockReason || "Xizmat to'xtatilgan") : "" },
        { upsert: true }
      );
    }

    if (rest.botToken) {
      await botService.startBot(admin.restaurantId, rest.botToken, admin.webappUrl, admin.chefId);
    }

    res.json({ ok: true, admin });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/restaurants/:id", superMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (admin) await botService.stopBot(admin.restaurantId);
    await Admin.findByIdAndDelete(req.params.id);
    await logAudit("restaurant_delete", req.admin.username, "superadmin", admin?.restaurantId, "Restoran o'chirildi");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BLOCK/UNBLOCK =====
router.post("/block/:restaurantId", superMiddleware, async (req, res) => {
  try {
    const { blocked, reason } = req.body;
    await Restaurant.findOneAndUpdate(
      { restaurantId: req.params.restaurantId },
      { blocked: !!blocked, blockReason: reason || "" },
      { upsert: true }
    );
    if (!blocked) {
      const admin = await Admin.findOne({ restaurantId: req.params.restaurantId, role: "admin" });
      if (admin?.botToken) await botService.startBot(admin.restaurantId, admin.botToken, admin.webappUrl, admin.chefId);
    }
    await logAudit(blocked ? "restaurant_block" : "restaurant_unblock", req.admin.username, "superadmin", req.params.restaurantId, reason || "");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== STATS (optimized) =====
router.get("/stats", superMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalRestaurants, totalOrders, todayOrders, totalUsers, monthRevAgg, perRestaurant] = await Promise.all([
      Admin.countDocuments({ role: "admin" }),
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments(),
      Order.aggregate([{ $match: { createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
      Order.aggregate([{ $group: { _id: "$restaurantId", count: { $sum: 1 }, revenue: { $sum: "$total" } } }, { $sort: { count: -1 } }]),
    ]);

    res.json({
      totalRestaurants, totalOrders, todayOrders,
      monthRevenue: monthRevAgg[0]?.total || 0,
      totalUsers, perRestaurant,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ANALYTICS (optimized — N+1 fixed) =====
router.get("/analytics", superMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Barcha oylik buyurtmalarni bir marta olib, JS da filter qilamiz
    const allMonthOrders = await Order.find({ createdAt: { $gte: prevMonthStart } }).lean();

    const monthOrders = allMonthOrders.filter((o) => new Date(o.createdAt) >= monthStart);
    const prevOrders = allMonthOrders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= prevMonthStart && d <= prevMonthEnd;
    });

    // 30 kunlik trend — in-memory (DB ga 30 ta query o'rniga)
    const dailyTrend = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dn = new Date(d); dn.setDate(dn.getDate() + 1);
      const dayOrders = allMonthOrders.filter((o) => {
        const ct = new Date(o.createdAt);
        return ct >= d && ct < dn;
      });
      const dayUsers = 0; // Alohida query talab qiladi, keyinroq qo'shish mumkin
      dailyTrend.push({
        date: d.toISOString().split("T")[0],
        label: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }),
        orders: dayOrders.length,
        revenue: dayOrders.reduce((s, o) => s + (o.total || 0), 0),
        newUsers: dayUsers,
      });
    }

    // Soatlik
    const todayFiltered = monthOrders.filter((o) => new Date(o.createdAt) >= today);
    const hourly = [];
    for (let h = 0; h < 24; h++) {
      hourly.push({ hour: h, label: String(h).padStart(2, "0") + ":00", orders: todayFiltered.filter((o) => new Date(o.createdAt).getHours() === h).length });
    }

    const monthRev = monthOrders.reduce((s, o) => s + (o.total || 0), 0);
    const prevRev = prevOrders.reduce((s, o) => s + (o.total || 0), 0);

    const [perRest, monthUsers, prevMonthUsers, totalUsers, totalOrdersCount, totalRestaurants] = await Promise.all([
      Order.aggregate([{ $match: { createdAt: { $gte: monthStart } } }, { $group: { _id: "$restaurantId", orders: { $sum: 1 }, revenue: { $sum: "$total" } } }, { $sort: { revenue: -1 } }]),
      User.countDocuments({ createdAt: { $gte: monthStart } }),
      User.countDocuments({ createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd } }),
      User.countDocuments(),
      Order.countDocuments(),
      Admin.countDocuments({ role: "admin" }),
    ]);

    res.json({
      ok: true, dailyTrend, hourly,
      current: { orders: monthOrders.length, revenue: monthRev, users: monthUsers },
      previous: { orders: prevOrders.length, revenue: prevRev, users: prevMonthUsers },
      ordersGrowth: prevOrders.length > 0 ? Math.round(((monthOrders.length - prevOrders.length) / prevOrders.length) * 100) : 0,
      revenueGrowth: prevRev > 0 ? Math.round(((monthRev - prevRev) / prevRev) * 100) : 0,
      perRestaurant: perRest, totalUsers, totalOrders: totalOrdersCount, totalRestaurants,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== AUDIT LOG =====
router.get("/audit-log", superMiddleware, async (req, res) => {
  try {
    const { limit = 50, restaurantId, action } = req.query;
    const filter = {};
    if (restaurantId) filter.restaurantId = restaurantId;
    if (action) filter.action = action;
    res.json({ ok: true, logs: await AuditLog.find(filter).sort({ createdAt: -1 }).limit(Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== PAYMENTS =====
router.get("/payments", superMiddleware, async (req, res) => {
  try {
    const { restaurantId, limit = 50 } = req.query;
    const filter = restaurantId ? { restaurantId } : {};
    res.json({ ok: true, payments: await Payment.find(filter).sort({ createdAt: -1 }).limit(Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/payments", superMiddleware, async (req, res) => {
  try {
    const { restaurantId, amount, type, method, days, note } = req.body;
    if (!restaurantId || !amount) return res.status(400).json({ error: "restaurantId va amount kerak" });

    const payment = await Payment.create({ restaurantId, amount, type: type || "subscription", method: method || "cash", days: days || 30, note, createdBy: req.admin.username });

    if (type === "subscription" || !type) {
      const admin = await Admin.findOne({ restaurantId, role: "admin" });
      if (admin) {
        const currentEnd = admin.subscriptionEnd && admin.subscriptionEnd > new Date() ? admin.subscriptionEnd : new Date();
        const newEnd = new Date(currentEnd);
        newEnd.setDate(newEnd.getDate() + (days || 30));
        await Admin.findByIdAndUpdate(admin._id, { subscriptionEnd: newEnd, active: true });
        await Restaurant.findOneAndUpdate({ restaurantId }, { blocked: false, blockReason: "" });
      }
    }

    await logAudit("payment_add", req.admin.username, "superadmin", restaurantId, `${amount} so'm — ${type || "subscription"}`);
    res.json({ ok: true, payment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== NOTIFICATIONS =====
router.get("/notifications", superMiddleware, async (req, res) => {
  try {
    const { limit = 30, unreadOnly } = req.query;
    const filter = {};
    if (unreadOnly === "true") filter.read = false;
    const [notifications, unreadCount] = await Promise.all([
      SANotification.find(filter).sort({ createdAt: -1 }).limit(Number(limit)),
      SANotification.countDocuments({ read: false }),
    ]);
    res.json({ ok: true, notifications, unreadCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/notifications/read-all", superMiddleware, async (req, res) => {
  try {
    await SANotification.updateMany({ read: false }, { read: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BOT MONITORING =====
router.get("/bots", superMiddleware, async (req, res) => {
  try {
    const admins = await Admin.find({ role: "admin" }).select("restaurantId restaurantName botToken active");
    const activeBots = botService.getActiveBots();
    const botStatus = admins.map((a) => ({
      restaurantId: a.restaurantId, restaurantName: a.restaurantName,
      hasToken: !!a.botToken, isRunning: activeBots.includes(a.restaurantId), isActive: a.active !== false,
    }));
    res.json({ ok: true, bots: botStatus, runningCount: activeBots.length, totalCount: admins.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/bots/:restaurantId/restart", superMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findOne({ restaurantId: req.params.restaurantId, role: "admin" });
    if (!admin?.botToken) return res.status(400).json({ error: "Bot token yo'q" });
    await botService.stopBot(req.params.restaurantId);
    await botService.startBot(req.params.restaurantId, admin.botToken, admin.webappUrl, admin.chefId);
    await logAudit("bot_restart", req.admin.username, "superadmin", req.params.restaurantId, "Bot qayta ishga tushirildi");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/bots/:restaurantId/stop", superMiddleware, async (req, res) => {
  try {
    await botService.stopBot(req.params.restaurantId);
    await logAudit("bot_stop", req.admin.username, "superadmin", req.params.restaurantId, "Bot to'xtatildi");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== CHANGE PASSWORD =====
router.put("/change-password", superMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Ikkala maydon kerak" });
    if (newPassword.length < 8) return res.status(400).json({ error: "Yangi parol kamida 8 belgi" });

    const admin = await Admin.findById(req.admin.id);
    const ok = await bcrypt.compare(currentPassword, admin.password);
    if (!ok) return res.status(400).json({ error: "Joriy parol noto'g'ri" });

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    await logAudit("password_change", req.admin.username, "superadmin", "", "Parol o'zgartirildi");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// BUSINESS TYPES & MODULE MANAGEMENT
// =============================================

// Barcha biznes turlarini olish (dropdown uchun)
router.get("/business-types", superMiddleware, async (req, res) => {
  try {
    res.json({ ok: true, types: getAllBusinessTypes() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Biznes turi uchun mavjud modullar (to'liq detail)
router.get("/business-types/:type/modules", superMiddleware, async (req, res) => {
  try {
    const { type } = req.params;
    if (!isValidBusinessType(type)) {
      return res.status(400).json({ error: `Noma'lum biznes turi: ${type}` });
    }
    res.json({
      ok: true,
      type,
      label: BUSINESS_TYPES[type].label,
      icon: BUSINESS_TYPES[type].icon,
      modules: getModuleDetails(type),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Biznes turini o'zgartirish (modullarni reset qiladi)
router.put("/restaurants/:id/business-type", superMiddleware, async (req, res) => {
  try {
    const { businessType } = req.body;
    if (!businessType || !isValidBusinessType(businessType)) {
      return res.status(400).json({ error: `Noto'g'ri biznes turi: ${businessType}` });
    }

    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: "Topilmadi" });

    const oldType = admin.businessType || "restaurant";
    const newModules = getDefaultModules(businessType);

    admin.businessType = businessType;
    admin.modules = newModules;
    await admin.save();

    // Restaurant modelini ham yangilash
    await Restaurant.findOneAndUpdate(
      { restaurantId: admin.restaurantId },
      { businessType },
      { upsert: true }
    );

    await logAudit(
      "business_type_change",
      req.admin.username,
      "superadmin",
      admin.restaurantId,
      `Biznes turi: ${oldType} → ${businessType}`
    );

    res.json({
      ok: true,
      admin: {
        _id: admin._id,
        restaurantId: admin.restaurantId,
        businessType: admin.businessType,
        modules: admin.modules,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Modullarni olish (bitta biznes uchun — hozirgi holati)
router.get("/restaurants/:id/modules", superMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select("restaurantId restaurantName businessType modules");
    if (!admin) return res.status(404).json({ error: "Topilmadi" });

    const type = admin.businessType || "restaurant";
    const available = getModuleDetails(type);

    // Har bir modul uchun hozirgi holat
    const modulesWithState = available.map((mod) => ({
      ...mod,
      enabled: admin.modules?.[mod.key] === true,
    }));

    res.json({
      ok: true,
      restaurantId: admin.restaurantId,
      restaurantName: admin.restaurantName,
      businessType: type,
      modules: modulesWithState,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Modulni yoqish/o'chirish (toggle)
router.put("/restaurants/:id/modules", superMiddleware, async (req, res) => {
  try {
    const { modules } = req.body; // { waiter: true, kitchen: false, ... }
    if (!modules || typeof modules !== "object") {
      return res.status(400).json({ error: "modules objekt kerak" });
    }

    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: "Topilmadi" });

    const type = admin.businessType || "restaurant";
    const availableKeys = getAvailableModuleKeys(type);
    const changes = [];

    for (const [key, value] of Object.entries(modules)) {
      // Faqat shu biznes turiga tegishli modullarni qabul qilish
      if (!availableKeys.includes(key)) continue;

      // Core modulni o'chirib bo'lmaydi
      if (isCoreModule(type, key) && value === false) {
        continue;
      }

      const oldValue = admin.modules?.[key];
      if (oldValue !== !!value) {
        admin.modules[key] = !!value;
        changes.push(`${key}: ${oldValue ? "on" : "off"} → ${value ? "on" : "off"}`);
      }
    }

    if (changes.length > 0) {
      admin.markModified("modules");
      await admin.save();
      await logAudit(
        "modules_update",
        req.admin.username,
        "superadmin",
        admin.restaurantId,
        changes.join(", ")
      );
    }

    res.json({
      ok: true,
      modules: admin.modules,
      changes,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bitta modulni toggle qilish (qulay shortcut)
router.put("/restaurants/:id/modules/:moduleKey/toggle", superMiddleware, async (req, res) => {
  try {
    const { moduleKey } = req.params;

    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: "Topilmadi" });

    const type = admin.businessType || "restaurant";
    const availableKeys = getAvailableModuleKeys(type);

    if (!availableKeys.includes(moduleKey)) {
      return res.status(400).json({ error: `Bu biznes turida "${moduleKey}" moduli mavjud emas` });
    }

    if (isCoreModule(type, moduleKey)) {
      return res.status(400).json({ error: `"${moduleKey}" core modul — o'chirib bo'lmaydi` });
    }

    const current = admin.modules?.[moduleKey] === true;
    admin.modules[moduleKey] = !current;
    admin.markModified("modules");
    await admin.save();

    await logAudit(
      "module_toggle",
      req.admin.username,
      "superadmin",
      admin.restaurantId,
      `${moduleKey}: ${current ? "on → off" : "off → on"}`
    );

    res.json({
      ok: true,
      module: moduleKey,
      enabled: !current,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =============================================
// AI AGENT MONITORING (superadmin)
// =============================================

// Barcha bizneslar AI statistikasi
router.get("/ai/stats", superMiddleware, async (req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { AIChat } = require("../models");

    // Har bir restoran bo'yicha
    const perRestaurant = await AIChat.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: "$restaurantId",
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          totalCost: { $sum: "$cost" },
          avgResponseTime: { $avg: "$responseTime" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Adminlar bilan birlashtirish
    const admins = await Admin.find({ role: "admin" }).select("restaurantId restaurantName aiLimit modules.aiAgent").lean();
    const result = perRestaurant.map((r) => {
      const admin = admins.find((a) => a.restaurantId === r._id);
      return {
        restaurantId: r._id,
        restaurantName: admin?.restaurantName || r._id,
        aiEnabled: admin?.modules?.aiAgent || false,
        aiLimit: admin?.aiLimit || 50,
        used: r.count,
        remaining: Math.max(0, (admin?.aiLimit || 50) - r.count),
        totalTokens: r.totalTokens,
        totalCost: Math.round(r.totalCost * 10000) / 10000,
        avgResponseTime: Math.round(r.avgResponseTime),
      };
    });

    // AI yoqilgan lekin hali surov bermagan bizneslar
    admins.forEach((a) => {
      if (a.modules?.aiAgent && !result.find((r) => r.restaurantId === a.restaurantId)) {
        result.push({
          restaurantId: a.restaurantId,
          restaurantName: a.restaurantName,
          aiEnabled: true,
          aiLimit: a.aiLimit || 50,
          used: 0,
          remaining: a.aiLimit || 50,
          totalTokens: 0,
          totalCost: 0,
          avgResponseTime: 0,
        });
      }
    });

    // Umumiy
    const totals = {
      totalRequests: perRestaurant.reduce((s, r) => s + r.count, 0),
      totalTokens: perRestaurant.reduce((s, r) => s + r.totalTokens, 0),
      totalCost: Math.round(perRestaurant.reduce((s, r) => s + r.totalCost, 0) * 10000) / 10000,
      activeBusinesses: result.filter((r) => r.used > 0).length,
      totalBusinesses: result.length,
    };

    res.json({ ok: true, totals, perRestaurant: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bitta biznesning AI tarixi (superadmin ko'rish uchun)
router.get("/ai/history/:restaurantId", superMiddleware, async (req, res) => {
  try {
    const { AIChat } = require("../models");
    const { limit = 50 } = req.query;
    const chats = await AIChat.find({ restaurantId: req.params.restaurantId })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    res.json({ ok: true, chats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI limitni o'zgartirish
router.put("/ai/limit/:restaurantId", superMiddleware, async (req, res) => {
  try {
    const { limit } = req.body;
    if (!limit || limit < 0) return res.status(400).json({ error: "limit musbat raqam bo'lishi kerak" });
    await Admin.findOneAndUpdate(
      { restaurantId: req.params.restaurantId, role: "admin" },
      { aiLimit: Number(limit) }
    );
    await logAudit("ai_limit_change", req.admin.username, "superadmin", req.params.restaurantId, `AI limit: ${limit}`);
    res.json({ ok: true, limit: Number(limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Eksport (bootstrap uchun kerak)
router.ensureRestaurant = ensureRestaurant;

module.exports = router;