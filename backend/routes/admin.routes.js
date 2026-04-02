const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { authMiddleware } = require("../middleware/auth");
const { moduleGuard } = require("../middleware/moduleGuard");
const { loginLimiter, broadcastLimiter } = require("../middleware/rateLimit");
const { validate, sanitize } = require("../middleware/validate");
const { isBotBlocked } = require("../middleware/auth");
const { createNotification } = require("../services/notification.service");
const botService = require("../services/bot.service");
const logger = require("../utils/logger");

const User = require("../models/User");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Admin = require("../models/Admin");
const {
  Restaurant, Branch, Employee, Attendance, Inventory,
  InventoryLog, Notification, Shot,
} = require("../models");
const { calcWorkingDays } = require("../utils/helpers");

// ===== LOGIN =====
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });

    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: "Foydalanuvchi topilmadi" });
    if (admin.role === "superadmin") return res.status(403).json({ error: "Superadmin uchun alohida panel" });
    if (!admin.active) return res.status(403).json({ error: "BLOCKED", message: admin.blockReason || "Xizmat to'xtatilgan", blocked: true });

    const restBlock = await isBotBlocked(admin.restaurantId);
    if (restBlock.blocked) return res.status(403).json({ error: "BLOCKED", message: restBlock.reason, blocked: true });

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });

    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role, restaurantName: admin.restaurantName, restaurantId: admin.restaurantId },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    res.json({
      ok: true, token,
      admin: { username: admin.username, restaurantName: admin.restaurantName, role: admin.role, restaurantId: admin.restaurantId, businessType: admin.businessType || "restaurant", modules: admin.modules || {} },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ME =====
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("username restaurantName role restaurantId businessType modules");
    if (!admin) return res.status(404).json({ error: "Topilmadi" });
    res.json({ ok: true, admin });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== PRODUCTS =====
router.get("/products", authMiddleware, moduleGuard("menu"), async (req, res) => {
  try {
    res.json(await Product.find({ restaurantId: req.admin.restaurantId }).sort({ id: 1 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/products", authMiddleware, moduleGuard("menu"), async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const last = await Product.findOne({ restaurantId: rId }).sort({ id: -1 });
    let newId = last ? (Number(last.id) || 0) + 1 : 1;
    while (await Product.findOne({ id: newId, restaurantId: rId })) newId++;

    const { _id, __v, id, ...bodyData } = req.body;
    const product = await Product.create({ ...bodyData, id: newId, restaurantId: rId });
    res.json({ ok: true, product });
  } catch (e) {
    logger.error("POST /admin/products:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put("/products/:id", authMiddleware, moduleGuard("menu"), async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { id: Number(req.params.id), restaurantId: req.admin.restaurantId },
      req.body, { new: true }
    );
    res.json({ ok: true, product });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/products/:id", authMiddleware, moduleGuard("menu"), async (req, res) => {
  try {
    await Product.findOneAndDelete({ id: Number(req.params.id), restaurantId: req.admin.restaurantId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== CATEGORIES =====
router.get("/categories", authMiddleware, moduleGuard("categories"), async (req, res) => {
  try {
    res.json(await Category.find({ restaurantId: req.admin.restaurantId }).sort({ order: 1 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/categories", authMiddleware, moduleGuard("categories"), async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const last = await Category.findOne({ restaurantId: rId }).sort({ order: -1 });
    const cat = await Category.create({ ...req.body, order: last ? last.order + 1 : 1, restaurantId: rId });
    res.json({ ok: true, cat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/categories/:id", authMiddleware, moduleGuard("categories"), async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ok: true, cat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/categories/:id", authMiddleware, moduleGuard("categories"), async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/categories/reorder/save", authMiddleware, moduleGuard("categories"), async (req, res) => {
  try {
    await Promise.all(req.body.order.map((item) => Category.findByIdAndUpdate(item.id, { order: item.order })));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ORDERS =====
router.get("/orders", authMiddleware, moduleGuard("orders"), async (req, res) => {
  try {
    const { status, type, limit = 50, skip = 0 } = req.query;
    const filter = { restaurantId: req.admin.restaurantId };
    if (status) filter.status = status;
    if (type) filter.orderType = type;
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).skip(Number(skip));
    res.json({ orders, total: await Order.countDocuments(filter) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/orders/:id/status", authMiddleware, moduleGuard("orders"), async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ ok: true, order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== STATS (optimized — N+1 fixed) =====
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const rId = (req.admin.role === "superadmin" && req.query.restaurantId)
      ? req.query.restaurantId : req.admin.restaurantId;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    // PARALLEL — barcha so'rovlar bir vaqtda (N+1 bartaraf qilingan)
    const [todayOrders, monthOrders, ratedOrders, totalUsers, recentOrders, statusStats] = await Promise.all([
      Order.find({ restaurantId: rId, createdAt: { $gte: today } }).lean(),
      Order.find({ restaurantId: rId, createdAt: { $gte: month } }).lean(),
      Order.find({ restaurantId: rId, rating: { $ne: null } }).select("rating").lean(),
      User.countDocuments({ restaurantId: rId }),
      Order.find({ restaurantId: rId }).sort({ createdAt: -1 }).limit(8).lean(),
      Order.aggregate([{ $match: { restaurantId: rId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    // Haftalik — monthOrders dan hisoblash (qo'shimcha query kerak emas)
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dn = new Date(d);
      dn.setDate(dn.getDate() + 1);
      const dayOrders = monthOrders.filter((o) => {
        const ct = new Date(o.createdAt);
        return ct >= d && ct < dn;
      });
      weeklyData.push({
        date: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }),
        orders: dayOrders.length,
        revenue: dayOrders.reduce((s, o) => s + (o.total || 0), 0),
      });
    }

    // Top mahsulotlar — in-memory aggregation
    const itemMap = {};
    monthOrders.forEach((o) => {
      (o.items || []).forEach((item) => {
        if (!itemMap[item.name]) itemMap[item.name] = { quantity: 0, total: 0 };
        itemMap[item.name].quantity += item.quantity || 1;
        itemMap[item.name].total += (item.price || 0) * (item.quantity || 1);
      });
    });
    const topProducts = Object.entries(itemMap)
      .map(([name, data]) => ({ _id: name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    res.json({
      today: {
        orders: todayOrders.length,
        revenue: todayOrders.reduce((s, o) => s + (o.total || 0), 0),
        online: todayOrders.filter((o) => o.orderType === "online").length,
        dineIn: todayOrders.filter((o) => o.orderType === "dine_in").length,
      },
      month: {
        orders: monthOrders.length,
        revenue: monthOrders.reduce((s, o) => s + (o.total || 0), 0),
      },
      weekly: weeklyData,
      topProducts,
      rating: {
        avg: ratedOrders.length
          ? (ratedOrders.reduce((s, o) => s + o.rating, 0) / ratedOrders.length).toFixed(1)
          : null,
        count: ratedOrders.length,
      },
      totalUsers,
      recentOrders,
      statusStats,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== USERS =====
router.get("/users", authMiddleware, moduleGuard("users"), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { restaurantId: req.admin.restaurantId };
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).skip(skip),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BROADCAST =====
router.post("/broadcast", authMiddleware, moduleGuard("broadcast"), broadcastLimiter, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const { text, imageBase64 } = req.body;
    if (!text && !imageBase64) return res.status(400).json({ error: "Matn yoki rasm kerak" });

    const users = await User.find({ restaurantId: rId, telegramId: { $exists: true } });
    const bot = botService.getBot(rId);
    let sent = 0, failed = 0, cachedId = null;

    for (const user of users) {
      try {
        const tgId = Number(user.telegramId);
        if (!tgId || !bot) { failed++; continue; }
        if (imageBase64 || cachedId) {
          const src = cachedId || Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
          const msg = await bot.sendPhoto(tgId, src, { caption: text || "" });
          if (!cachedId && msg.photo) cachedId = msg.photo[msg.photo.length - 1].file_id;
        } else {
          await bot.sendMessage(tgId, text, { parse_mode: "HTML" });
        }
        sent++;
        await new Promise((r) => setTimeout(r, 50));
      } catch (e) {
        failed++;
      }
    }
    res.json({ ok: true, sent, failed, total: users.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== BRANCHES =====
router.get("/branches", authMiddleware, moduleGuard("branches"), async (req, res) => {
  try {
    res.json({ ok: true, branches: await Branch.find({ restaurantId: req.admin.restaurantId, active: true }).sort({ name: 1 }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/branches", authMiddleware, moduleGuard("branches"), async (req, res) => {
  try {
    const { name, address, lat, lng, radius } = req.body;
    if (!name) return res.status(400).json({ error: "Filial nomi kerak" });
    const branch = await Branch.create({ name, address, lat, lng, radius: radius || 100, restaurantId: req.admin.restaurantId });
    res.json({ ok: true, branch });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/branches/:id", authMiddleware, moduleGuard("branches"), async (req, res) => {
  try {
    res.json({ ok: true, branch: await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/branches/:id", authMiddleware, moduleGuard("branches"), async (req, res) => {
  try {
    await Branch.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== EMPLOYEES =====
router.get("/employees", authMiddleware, moduleGuard("employees"), async (req, res) => {
  try {
    res.json(await Employee.find({ restaurantId: req.admin.restaurantId }).select("-password").sort({ name: 1 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/employees", authMiddleware, moduleGuard("employees"), async (req, res) => {
  try {
    const { username, password, ...data } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });
    const hash = await bcrypt.hash(password, 10);
    const emp = await Employee.create({
      ...data, username, password: hash,
      restaurantId: req.admin.restaurantId, active: true,
    });
    res.json({ ok: true, employee: { ...emp.toObject(), password: undefined } });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: "Bu username band" });
    res.status(500).json({ error: e.message });
  }
});

router.put("/employees/:id", authMiddleware, moduleGuard("employees"), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.password) data.password = await bcrypt.hash(data.password, 10);
    else delete data.password;
    res.json({ ok: true, employee: await Employee.findByIdAndUpdate(req.params.id, data, { new: true }).select("-password") });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/employees/:id", authMiddleware, moduleGuard("employees"), async (req, res) => {
  try {
    await Attendance.deleteMany({ employeeId: req.params.id });
    await Employee.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/employees/:id/face", authMiddleware, moduleGuard("employees"), async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id).select("name photo faceDescriptor");
    if (!emp) return res.status(404).json({ error: "Topilmadi" });
    res.json({ ok: true, name: emp.name, photo: emp.photo, faceDescriptor: emp.faceDescriptor });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/employees/:id/face", authMiddleware, moduleGuard("employees"), async (req, res) => {
  try {
    await Employee.findByIdAndUpdate(req.params.id, { photo: req.body.photo, faceDescriptor: req.body.faceDescriptor });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ATTENDANCE =====
router.get("/attendance/today", authMiddleware, moduleGuard("attendance"), async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const { branchId, date } = req.query;
    const today = date || new Date().toISOString().split("T")[0];
    const empFilter = { restaurantId: rId, active: true };
    if (branchId) empFilter.branchId = branchId;

    const [employees, attendances] = await Promise.all([
      Employee.find(empFilter).select("-password").populate("branchId", "name"),
      Attendance.find({ restaurantId: rId, date: today }),
    ]);

    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const todayDay = dayNames[new Date(today).getDay()];

    const result = employees.map((emp) => {
      const att = attendances.find((a) => a.employeeId.toString() === emp._id.toString());
      const isOff = emp.weeklyOff === todayDay;
      return {
        employee: emp, attendance: att || null,
        status: att?.status || (isOff ? "dam" : "kelmadi"),
        isWeeklyOff: isOff, checkIn: att?.checkIn || null, checkOut: att?.checkOut || null,
        lateMinutes: att?.lateMinutes || 0, totalMinutes: att?.totalMinutes || 0,
        overtimeMinutes: att?.overtimeMinutes || 0,
      };
    });

    const summary = {
      total: employees.length,
      came: result.filter((r) => r.status === "keldi").length,
      absent: result.filter((r) => r.status === "kelmadi").length,
      late: result.filter((r) => r.lateMinutes > 0).length,
      dayOff: result.filter((r) => r.isWeeklyOff).length,
      overtime: result.filter((r) => r.overtimeMinutes > 0).length,
      working: result.filter((r) => r.checkIn && !r.checkOut).length,
    };

    res.json({ ok: true, today, employees: result, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/attendance/report", authMiddleware, moduleGuard("empReport"), async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const prefix = req.query.month || new Date().toISOString().slice(0, 7);
    const filter = { restaurantId: rId, date: { $regex: `^${prefix}` } };
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;

    const [records, employees] = await Promise.all([
      Attendance.find(filter).populate("employeeId", "name position salary").sort({ date: 1 }),
      Employee.find({ restaurantId: rId, active: true }).select("-password"),
    ]);

    const empMap = {};
    employees.forEach((emp) => {
      empMap[emp._id.toString()] = {
        employee: emp, worked: 0, absent: 0, late: 0, totalMinutes: 0, overtime: 0,
        workingDays: calcWorkingDays(prefix, emp.weeklyOff),
        dailySalary: 0, earnedSalary: 0,
      };
    });

    records.forEach((r) => {
      const key = r.employeeId?._id?.toString();
      if (!key || !empMap[key]) return;
      if (r.status === "keldi") empMap[key].worked++;
      if (r.status === "kelmadi") empMap[key].absent++;
      if (r.lateMinutes > 0) empMap[key].late++;
      empMap[key].totalMinutes += r.totalMinutes || 0;
      empMap[key].overtime += r.overtimeMinutes || 0;
    });

    Object.values(empMap).forEach((e) => {
      e.dailySalary = e.workingDays > 0 ? Math.round(e.employee.salary / e.workingDays) : 0;
      e.earnedSalary = Math.round(e.dailySalary * e.worked);
    });

    res.json({ ok: true, month: prefix, records, summary: Object.values(empMap) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== INVENTORY =====
router.get("/inventory", authMiddleware, moduleGuard("inventory"), async (req, res) => {
  try {
    res.json({ ok: true, items: await Inventory.find({ restaurantId: req.admin.restaurantId, active: true }).sort({ productName: 1 }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/inventory", authMiddleware, moduleGuard("inventory"), async (req, res) => {
  try {
    const item = await Inventory.create({ ...req.body, restaurantId: req.admin.restaurantId });
    res.json({ ok: true, item });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: "Bu mahsulot allaqachon inventarda" });
    res.status(500).json({ error: e.message });
  }
});

router.put("/inventory/:id", authMiddleware, moduleGuard("inventory"), async (req, res) => {
  try {
    res.json({ ok: true, item: await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/inventory/:id/move", authMiddleware, moduleGuard("inventory"), async (req, res) => {
  try {
    const { type, quantity, note } = req.body;
    if (!["in", "out", "adjust"].includes(type)) return res.status(400).json({ error: "type: in/out/adjust" });
    if (!quantity && quantity !== 0) return res.status(400).json({ error: "quantity kerak" });

    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Topilmadi" });

    let newStock = item.currentStock;
    if (type === "in") { newStock += Number(quantity); item.lastRestocked = new Date(); }
    else if (type === "out") { newStock = Math.max(0, newStock - Number(quantity)); }
    else if (type === "adjust") { newStock = Number(quantity); }

    item.currentStock = newStock;
    await item.save();

    await InventoryLog.create({
      inventoryId: item._id, restaurantId: item.restaurantId,
      type, quantity: Number(quantity), note: note || "",
      createdBy: req.admin.username || "admin",
    });

    if (newStock <= item.minStock) {
      await createNotification(item.restaurantId, "stock_low",
        `⚠️ Kam qoldi: ${item.productName}`,
        `${item.productName} — faqat ${newStock} ${item.unit} qoldi!`,
        "📦", "admin"
      );
    }

    res.json({ ok: true, item, newStock });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/inventory/:id/logs", authMiddleware, moduleGuard("inventory"), async (req, res) => {
  try {
    res.json({ ok: true, logs: await InventoryLog.find({ inventoryId: req.params.id }).sort({ createdAt: -1 }).limit(50) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/inventory/summary/all", authMiddleware, moduleGuard("inventory"), async (req, res) => {
  try {
    const items = await Inventory.find({ restaurantId: req.admin.restaurantId, active: true });
    const totalValue = items.reduce((s, i) => s + i.currentStock * i.costPrice, 0);
    const lowStock = items.filter((i) => i.currentStock <= i.minStock);
    res.json({
      ok: true, totalItems: items.length, totalValue: Math.round(totalValue),
      lowStockCount: lowStock.length,
      outOfStockCount: items.filter((i) => i.currentStock === 0).length,
      lowStockItems: lowStock.map((i) => ({ name: i.productName, stock: i.currentStock, min: i.minStock, unit: i.unit })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== NOTIFICATIONS =====
router.get("/notifications", authMiddleware, moduleGuard("notifications"), async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const { limit = 30, unreadOnly } = req.query;
    const filter = { restaurantId: rId, targetRole: "admin" };
    if (unreadOnly === "true") filter.read = false;
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(Number(limit)),
      Notification.countDocuments({ restaurantId: rId, targetRole: "admin", read: false }),
    ]);
    res.json({ ok: true, notifications, unreadCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/notifications/read-all", authMiddleware, moduleGuard("notifications"), async (req, res) => {
  try {
    await Notification.updateMany({ restaurantId: req.admin.restaurantId, targetRole: "admin", read: false }, { read: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/notifications/:id/read", authMiddleware, moduleGuard("notifications"), async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/notifications/clear", authMiddleware, moduleGuard("notifications"), async (req, res) => {
  try {
    await Notification.deleteMany({ restaurantId: req.admin.restaurantId, targetRole: "admin", read: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== STATS/FAST (cached) =====
const statsCache = {};
const statsCacheTime = {};
const CACHE_TTL = 30000;

router.get("/stats/fast", authMiddleware, async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const now = Date.now();
    if (statsCache[rId] && statsCacheTime[rId] && (now - statsCacheTime[rId]) < CACHE_TTL) {
      return res.json(statsCache[rId]);
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const [todayOrders, monthOrders, ratedOrders, totalUsers, recentOrders] = await Promise.all([
      Order.find({ restaurantId: rId, createdAt: { $gte: today } }).lean(),
      Order.find({ restaurantId: rId, createdAt: { $gte: month } }).lean(),
      Order.find({ restaurantId: rId, rating: { $ne: null } }).select("rating").lean(),
      User.countDocuments({ restaurantId: rId }),
      Order.find({ restaurantId: rId }).sort({ createdAt: -1 }).limit(8).lean(),
    ]);
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dn = new Date(d); dn.setDate(dn.getDate() + 1);
      const dayOrders = monthOrders.filter((o) => { const ct = new Date(o.createdAt); return ct >= d && ct < dn; });
      weeklyData.push({ date: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }), orders: dayOrders.length, revenue: dayOrders.reduce((s, o) => s + (o.total || 0), 0) });
    }
    const itemMap = {};
    monthOrders.forEach((o) => (o.items || []).forEach((item) => {
      if (!itemMap[item.name]) itemMap[item.name] = { quantity: 0, total: 0 };
      itemMap[item.name].quantity += item.quantity || 1;
      itemMap[item.name].total += (item.price || 0) * (item.quantity || 1);
    }));
    const topProducts = Object.entries(itemMap).map(([name, data]) => ({ _id: name, ...data })).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const result = {
      today: { orders: todayOrders.length, revenue: todayOrders.reduce((s, o) => s + (o.total || 0), 0), online: todayOrders.filter((o) => o.orderType === "online").length, dineIn: todayOrders.filter((o) => o.orderType === "dine_in").length },
      month: { orders: monthOrders.length, revenue: monthOrders.reduce((s, o) => s + (o.total || 0), 0) },
      weekly: weeklyData, topProducts,
      rating: { avg: ratedOrders.length ? (ratedOrders.reduce((s, o) => s + o.rating, 0) / ratedOrders.length).toFixed(1) : null, count: ratedOrders.length },
      totalUsers, recentOrders,
    };
    statsCache[rId] = result;
    statsCacheTime[rId] = now;
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== ADVANCED ANALYTICS =====
router.get("/analytics/advanced", authMiddleware, async (req, res) => {
  try {
    const rId = (req.admin.role === "superadmin" && req.query.restaurantId) ? req.query.restaurantId : req.admin.restaurantId;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const allOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: prevMonthStart } }).lean();
    const monthOrders = allOrders.filter((o) => new Date(o.createdAt) >= monthStart);
    const prevMonthOrders = allOrders.filter((o) => { const d = new Date(o.createdAt); return d >= prevMonthStart && d <= prevMonthEnd; });

    const dailyTrend = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dn = new Date(d); dn.setDate(dn.getDate() + 1);
      const dayOrders = allOrders.filter((o) => { const ct = new Date(o.createdAt); return ct >= d && ct < dn; });
      dailyTrend.push({ date: d.toISOString().split("T")[0], label: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }), orders: dayOrders.length, revenue: dayOrders.reduce((s, o) => s + (o.total || 0), 0) });
    }

    const todayOrders = monthOrders.filter((o) => new Date(o.createdAt) >= today);
    const hourlyDist = [];
    for (let h = 0; h < 24; h++) {
      hourlyDist.push({ hour: h, label: String(h).padStart(2, "0") + ":00", orders: todayOrders.filter((o) => new Date(o.createdAt).getHours() === h).length });
    }

    const topProducts = {};
    monthOrders.forEach((o) => (o.items || []).forEach((item) => {
      if (!topProducts[item.name]) topProducts[item.name] = { totalRevenue: 0, totalQty: 0, orderCount: 0 };
      topProducts[item.name].totalRevenue += (item.price || 0) * (item.quantity || 1);
      topProducts[item.name].totalQty += item.quantity || 1;
      topProducts[item.name].orderCount++;
    }));

    const categoryStats = {};
    monthOrders.forEach((o) => (o.items || []).forEach((item) => {
      const cat = item.category || "Boshqa";
      if (!categoryStats[cat]) categoryStats[cat] = { totalRevenue: 0, totalQty: 0 };
      categoryStats[cat].totalRevenue += (item.price || 0) * (item.quantity || 1);
      categoryStats[cat].totalQty += item.quantity || 1;
    }));

    const [orderTypeDist, totalUsers, monthUsers, ratingDist] = await Promise.all([
      Order.aggregate([{ $match: { restaurantId: rId, createdAt: { $gte: monthStart } } }, { $group: { _id: "$orderType", count: { $sum: 1 }, revenue: { $sum: "$total" } } }]),
      User.countDocuments({ restaurantId: rId }),
      User.countDocuments({ restaurantId: rId, createdAt: { $gte: monthStart } }),
      Order.aggregate([{ $match: { restaurantId: rId, rating: { $ne: null } } }, { $group: { _id: "$rating", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);

    const weekdayStats = [0, 0, 0, 0, 0, 0, 0];
    const weekdayNames = ["Yak", "Du", "Se", "Chor", "Pay", "Ju", "Sha"];
    monthOrders.forEach((o) => { weekdayStats[new Date(o.createdAt).getDay()]++; });

    const currentRevenue = monthOrders.reduce((s, o) => s + (o.total || 0), 0);
    const prevRevenue = prevMonthOrders.reduce((s, o) => s + (o.total || 0), 0);

    res.json({
      ok: true,
      overview: {
        currentMonth: { orders: monthOrders.length, revenue: currentRevenue, avgOrderValue: monthOrders.length > 0 ? Math.round(currentRevenue / monthOrders.length) : 0 },
        prevMonth: { orders: prevMonthOrders.length, revenue: prevRevenue, avgOrderValue: prevMonthOrders.length > 0 ? Math.round(prevRevenue / prevMonthOrders.length) : 0 },
        revenueGrowth: prevRevenue > 0 ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100) : 0,
        ordersGrowth: prevMonthOrders.length > 0 ? Math.round(((monthOrders.length - prevMonthOrders.length) / prevMonthOrders.length) * 100) : 0,
        totalUsers, newUsers: monthUsers,
      },
      dailyTrend, hourlyDist,
      topProducts: Object.entries(topProducts).map(([name, d]) => ({ _id: name, ...d })).sort((a, b) => b.totalQty - a.totalQty).slice(0, 10),
      categoryStats: Object.entries(categoryStats).map(([name, d]) => ({ _id: name, ...d })).sort((a, b) => b.totalRevenue - a.totalRevenue),
      orderTypeDist,
      weekdayStats: weekdayNames.map((n, i) => ({ day: n, orders: weekdayStats[i] })),
      ratingDist,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== SITE SETTINGS =====
const SITE_SETTINGS_FIELDS = [
  "restaurantName", "phone", "address", "addressRu", "botUsername", "adminTg",
  "metro", "metroRu", "workHours", "workHoursRu", "nameRu", "heroBadge",
  "heroBadgeRu", "subtitle", "subtitleRu", "workStart", "workEnd",
  "mapEmbed", "heroImage", "eventsBg", "gallery", "theme", "webappUrl",
];

router.get("/site-settings", authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findOne({ restaurantId: req.admin.restaurantId, role: "admin" })
      .select(SITE_SETTINGS_FIELDS.join(" "));
    res.json({ ok: true, settings: admin || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/site-settings", authMiddleware, sanitize(SITE_SETTINGS_FIELDS), async (req, res) => {
  try {
    const admin = await Admin.findOneAndUpdate(
      { restaurantId: req.admin.restaurantId, role: "admin" },
      req.body, { new: true }
    ).select("-password");
    res.json({ ok: true, admin });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;