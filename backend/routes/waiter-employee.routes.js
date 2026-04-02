const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { waiterMiddleware, empMiddleware, isBotBlocked } = require("../middleware/auth");
const { moduleGuard } = require("../middleware/moduleGuard");
const { loginLimiter } = require("../middleware/rateLimit");
const { compareFaces } = require("../services/faceid.service");
const { minutesToTimeStr, timeStrToMinutes, calcWorkingDays } = require("../utils/helpers");
const logger = require("../utils/logger");

const Product = require("../models/Product");
const Category = require("../models/Category");
const Admin = require("../models/Admin");
const { Employee, Attendance, Shot, Branch } = require("../models");

// ============================================
// WAITER ENDPOINTS
// ============================================

router.post("/waiter/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });

    const emp = await Employee.findOne({ username });
    if (!emp) return res.status(401).json({ error: "Ishchi topilmadi" });
    if (!emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan" });
    if (emp.role !== "waiter") return res.status(403).json({ error: "Bu foydalanuvchi ofitsiant emas" });

    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });

    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });

    const admin = await Admin.findOne({ restaurantId: emp.restaurantId, role: "admin" });
    if (!admin?.modules?.waiter) return res.status(403).json({ error: "Ofitsiant moduli yoqilmagan" });

    const token = jwt.sign(
      { id: emp._id, restaurantId: emp.restaurantId, name: emp.name, role: "waiter" },
      config.jwtSecret, { expiresIn: "30d" }
    );
    res.json({ ok: true, token, waiter: { id: emp._id, name: emp.name, restaurantId: emp.restaurantId, tables: emp.tables || [] } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/waiter/shots", waiterMiddleware, moduleGuard("waiter", "waiter"), async (req, res) => {
  try {
    res.json({ ok: true, shots: await Shot.find({ restaurantId: req.waiter.restaurantId, status: "open" }).sort({ openedAt: -1 }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/waiter/shots/:id", waiterMiddleware, moduleGuard("waiter", "waiter"), async (req, res) => {
  try {
    const shot = await Shot.findById(req.params.id);
    if (!shot) return res.status(404).json({ error: "Shot topilmadi" });
    res.json({ ok: true, shot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/waiter/shots/open", waiterMiddleware, moduleGuard("waiter", "waiter"), async (req, res) => {
  try {
    const { tableNumber } = req.body;
    if (!tableNumber) return res.status(400).json({ error: "Stol raqami kerak" });
    const existing = await Shot.findOne({ restaurantId: req.waiter.restaurantId, tableNumber: String(tableNumber), status: "open" });
    if (existing) return res.status(400).json({ error: "Bu stolda ochiq shot allaqachon bor", shot: existing });
    const shot = await Shot.create({
      restaurantId: req.waiter.restaurantId, tableNumber: String(tableNumber),
      waiterId: req.waiter.id, waiterName: req.waiter.name, status: "open", items: [], total: 0,
    });
    const io = req.app.get("io");
    if (io) io.to(`${req.waiter.restaurantId}:waiter`).emit("new-shot", shot);
    res.json({ ok: true, shot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/waiter/shots/:id/add-item", waiterMiddleware, moduleGuard("waiter", "waiter"), async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: "Mahsulot kerak" });
    const shot = await Shot.findById(req.params.id);
    if (!shot || shot.status !== "open") return res.status(400).json({ error: "Shot topilmadi yoki yopilgan" });

    const newItems = items.map((i) => ({
      name: i.name, name_ru: i.name_ru || "", price: Number(i.price), quantity: Number(i.quantity) || 1,
      addedBy: "waiter", sentToKitchen: false, kitchenStatus: "pending", addedAt: new Date(),
    }));
    shot.items.push(...newItems);
    shot.total = shot.items.reduce((s, i) => s + i.price * i.quantity, 0);
    await shot.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`${shot.restaurantId}:waiter`).emit("shot-updated", shot);
      io.to(`${shot.restaurantId}:customer`).emit("shot-updated", shot);
    }
    res.json({ ok: true, shot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/waiter/shots/:id/to-kitchen", waiterMiddleware, moduleGuard("waiter", "waiter"), async (req, res) => {
  try {
    const shot = await Shot.findById(req.params.id);
    if (!shot || shot.status !== "open") return res.status(400).json({ error: "Shot topilmadi yoki yopilgan" });

    let sentCount = 0;
    const sentItems = [];
    shot.items.forEach((item) => {
      if (!item.sentToKitchen) {
        item.sentToKitchen = true;
        item.kitchenStatus = "pending";
        sentCount++;
        sentItems.push(item);
      }
    });

    if (sentCount === 0) return res.status(400).json({ error: "Yuborilmagan mahsulot yo'q" });
    await shot.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`${shot.restaurantId}:kitchen`).emit("to-kitchen", {
        shotId: shot._id, tableNumber: shot.tableNumber, waiterName: shot.waiterName, items: sentItems, sentAt: new Date(),
      });
      io.to(`${shot.restaurantId}:waiter`).emit("shot-updated", shot);
    }
    res.json({ ok: true, shot, sentCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/waiter/shots/:id/close", waiterMiddleware, moduleGuard("waiter", "waiter"), async (req, res) => {
  try {
    const shot = await Shot.findById(req.params.id);
    if (!shot || shot.status !== "open") return res.status(400).json({ error: "Shot topilmadi yoki allaqachon yopilgan" });
    shot.status = "closed";
    shot.closedAt = new Date();
    shot.total = shot.items.reduce((s, i) => s + i.price * i.quantity, 0);
    await shot.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`${shot.restaurantId}:waiter`).emit("shot-closed", shot);
      io.to(`${shot.restaurantId}:customer`).emit("shot-closed", shot);
      io.to(`${shot.restaurantId}:kitchen`).emit("shot-closed", shot);
    }
    res.json({ ok: true, shot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/waiter/products", waiterMiddleware, moduleGuard("waiter", "waiter"), async (req, res) => {
  try {
    const [products, categories] = await Promise.all([
      Product.find({ restaurantId: req.waiter.restaurantId, active: true }).sort({ category: 1, name: 1 }),
      Category.find({ restaurantId: req.waiter.restaurantId, active: true }).sort({ order: 1 }),
    ]);
    res.json({ ok: true, products, categories });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/waiter/stats", waiterMiddleware, moduleGuard("waiter", "waiter"), async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);
    const shots = await Shot.find({ restaurantId: req.waiter.restaurantId, waiterId: req.waiter.id, openedAt: { $gte: start, $lt: end } }).sort({ openedAt: 1 });

    const closedShots = shots.filter((s) => s.status === "closed");
    const totalSum = closedShots.reduce((s, sh) => s + sh.total, 0);
    const uniqueCustomers = new Set(shots.filter((s) => s.customerTelegramId).map((s) => s.customerTelegramId)).size;

    const daily = {};
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      daily[String(d).padStart(2, "0")] = { shots: 0, total: 0 };
    }
    closedShots.forEach((s) => {
      const day = String(new Date(s.openedAt).getDate()).padStart(2, "0");
      if (daily[day]) { daily[day].shots++; daily[day].total += s.total; }
    });

    res.json({
      ok: true, month, totalShots: shots.length, closedShots: closedShots.length,
      totalSum, uniqueCustomers, avgShot: closedShots.length ? Math.round(totalSum / closedShots.length) : 0, daily,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// EMPLOYEE ENDPOINTS
// ============================================

router.post("/employee/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });

    const emp = await Employee.findOne({ username, active: true });
    if (!emp) return res.status(401).json({ error: "Ishchi topilmadi" });

    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });

    const token = jwt.sign(
      { id: emp._id, restaurantId: emp.restaurantId, name: emp.name, role: emp.role },
      config.jwtSecret, { expiresIn: "30d" }
    );
    res.json({ ok: true, token, employee: { id: emp._id, name: emp.name, role: emp.role, restaurantId: emp.restaurantId } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/employee/checkin", empMiddleware, moduleGuard("attendance", "employee"), async (req, res) => {
  try {
    const { clientTimeMinutes, clientDate, photo, lat, lng } = req.body;
    const today = clientDate || new Date().toISOString().split("T")[0];
    const emp = await Employee.findById(req.employee.id);

    // Yuz tekshirish
    if (photo && emp.photo) {
      const fr = await compareFaces(emp.photo, photo);
      if (fr.ok && fr.confidence < (fr.threshold || 73)) {
        return res.status(400).json({ error: "Yuz tasdiqlanmadi!", faceError: true });
      }
    }

    // Allaqachon check-in qilinganmi?
    const existing = await Attendance.findOne({ employeeId: emp._id, date: today });
    if (existing?.checkIn) return res.status(400).json({ error: "Bugun allaqachon keldi qayd qilingan" });

    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const isWeeklyOff = emp.weeklyOff === dayNames[new Date(today).getDay()];
    const nowMin = clientTimeMinutes != null ? clientTimeMinutes : new Date().getHours() * 60 + new Date().getMinutes();
    const checkInStr = minutesToTimeStr(nowMin);
    const late = isWeeklyOff ? 0 : Math.max(0, nowMin - timeStrToMinutes(emp.workStart));

    const att = await Attendance.findOneAndUpdate(
      { employeeId: emp._id, date: today },
      {
        employeeId: emp._id, restaurantId: emp.restaurantId, date: today,
        checkIn: checkInStr, checkInPhoto: photo || "", checkInLat: lat, checkInLng: lng,
        lateMinutes: late, isWeeklyOff, overtimeMinutes: 0,
        status: isWeeklyOff ? "dam" : "keldi",
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true, attendance: att, lateMinutes: late, isWeeklyOff, checkIn: checkInStr });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/employee/checkout", empMiddleware, moduleGuard("attendance", "employee"), async (req, res) => {
  try {
    const { clientTimeMinutes, clientDate, photo } = req.body;
    const today = clientDate || new Date().toISOString().split("T")[0];
    const emp = await Employee.findById(req.employee.id);
    const att = await Attendance.findOne({ employeeId: emp._id, date: today });

    if (!att?.checkIn) return res.status(400).json({ error: "Avval check-in qiling" });
    if (att.checkOut) return res.status(400).json({ error: "Bugun allaqachon ketdi qayd qilingan" });

    if (photo && emp.photo) {
      const fr = await compareFaces(emp.photo, photo);
      if (fr.ok && fr.confidence < (fr.threshold || 73)) {
        return res.status(400).json({ error: "Yuz tasdiqlanmadi!", faceError: true });
      }
    }

    const nowMin = clientTimeMinutes != null ? clientTimeMinutes : new Date().getHours() * 60 + new Date().getMinutes();
    const checkOutStr = minutesToTimeStr(nowMin);
    const [ih, im] = att.checkIn.split(":").map(Number);
    const total = Math.max(0, nowMin - (ih * 60 + im));

    const updated = await Attendance.findByIdAndUpdate(att._id, {
      checkOut: checkOutStr, totalMinutes: total,
      overtimeMinutes: att.isWeeklyOff ? total : 0,
      status: att.isWeeklyOff ? "dam" : "keldi",
    }, { new: true });

    res.json({ ok: true, attendance: updated, totalMinutes: total, checkOut: checkOutStr });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/employee/stats", empMiddleware, moduleGuard("attendance", "employee"), async (req, res) => {
  try {
    const prefix = req.query.month || new Date().toISOString().slice(0, 7);
    const [emp, records] = await Promise.all([
      Employee.findById(req.employee.id).select("-password"),
      Attendance.find({ employeeId: req.employee.id, date: { $regex: `^${prefix}` } }).sort({ date: 1 }),
    ]);

    const workedDays = records.filter((r) => r.status === "keldi").length;
    const workingDaysInMonth = calcWorkingDays(prefix, emp.weeklyOff);
    const dailySalary = emp.salary > 0 ? Math.round(emp.salary / workingDaysInMonth) : 0;
    const earnedSalary = Math.round(dailySalary * workedDays);

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const ds = dt.toISOString().split("T")[0];
      const rec = records.find((r) => r.date === ds);
      last7.push({ date: ds, status: rec?.status || null, checkIn: rec?.checkIn || null, checkOut: rec?.checkOut || null });
    }

    res.json({
      ok: true, records,
      stats: {
        workedDays,
        totalMinutes: records.reduce((s, r) => s + (r.totalMinutes || 0), 0),
        totalLate: records.filter((r) => r.lateMinutes > 0).length,
        absent: records.filter((r) => r.status === "kelmadi").length,
        overtimeMin: records.reduce((s, r) => s + (r.overtimeMinutes || 0), 0),
        workingDaysInMonth, dailySalary, earnedSalary, salary: emp.salary,
      },
      last7,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Employee face descriptor =====
router.get("/employee/face-descriptor", empMiddleware, moduleGuard("attendance", "employee"), async (req, res) => {
  try {
    const emp = await Employee.findById(req.employee.id).select("faceDescriptor photo");
    res.json({ ok: true, faceDescriptor: emp.faceDescriptor || [], hasPhoto: !!emp.photo });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Employee today attendance =====
router.get("/employee/today", empMiddleware, moduleGuard("attendance", "employee"), async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const [att, emp] = await Promise.all([
      Attendance.findOne({ employeeId: req.employee.id, date: today }),
      Employee.findById(req.employee.id),
    ]);
    res.json({ ok: true, attendance: att, employee: emp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;