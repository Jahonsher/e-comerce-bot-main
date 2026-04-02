const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { isBotBlocked } = require("../middleware/auth");
const { moduleGuard } = require("../middleware/moduleGuard");
const { loginLimiter } = require("../middleware/rateLimit");
const logger = require("../utils/logger");

const Admin = require("../models/Admin");
const { Employee, Attendance, Shot, Branch } = require("../models");

// ============================================
// KITCHEN MIDDLEWARE
// ============================================
async function kitchenMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const emp = await Employee.findById(decoded.id).select("active restaurantId role name");
    if (!emp || !emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan", deleted: true });
    if (emp.role !== "chef") return res.status(403).json({ error: "Ruxsat yo'q — faqat oshpaz" });
    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });
    req.chef = { id: emp._id, restaurantId: emp.restaurantId, name: emp.name };
    next();
  } catch (e) {
    res.status(401).json({ error: "Token yaroqsiz" });
  }
}

// ============================================
// KITCHEN ENDPOINTS
// ============================================

// Kitchen login
router.post("/kitchen/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Login va parol kerak" });

    const emp = await Employee.findOne({ username });
    if (!emp) return res.status(401).json({ error: "Ishchi topilmadi" });
    if (!emp.active) return res.status(401).json({ error: "Akkaunt o'chirilgan" });
    if (emp.role !== "chef") return res.status(403).json({ error: "Bu foydalanuvchi oshpaz emas" });

    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) return res.status(403).json({ error: "BLOCKED", message: blockCheck.reason, blocked: true });

    const ok = await bcrypt.compare(password, emp.password);
    if (!ok) return res.status(401).json({ error: "Parol noto'g'ri" });

    const admin = await Admin.findOne({ restaurantId: emp.restaurantId, role: "admin" });
    if (!admin?.modules?.kitchen) return res.status(403).json({ error: "Oshpaz moduli yoqilmagan" });

    const token = jwt.sign(
      { id: emp._id, restaurantId: emp.restaurantId, name: emp.name, role: "chef" },
      config.jwtSecret,
      { expiresIn: "30d" }
    );
    res.json({ ok: true, token, chef: { id: emp._id, name: emp.name, restaurantId: emp.restaurantId } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Oshpazga yuborilgan buyurtmalar
router.get("/kitchen/orders", kitchenMiddleware, moduleGuard("kitchen", "kitchen"), async (req, res) => {
  try {
    const shots = await Shot.find({
      restaurantId: req.chef.restaurantId,
      status: "open",
      "items.sentToKitchen": true,
    }).sort({ openedAt: 1 });

    const orders = shots
      .map((shot) => {
        const kitchenItems = shot.items.filter((i) => i.sentToKitchen);
        return {
          shotId: shot._id,
          tableNumber: shot.tableNumber,
          waiterName: shot.waiterName,
          items: kitchenItems,
          openedAt: shot.openedAt,
        };
      })
      .filter((o) => o.items.some((i) => i.kitchenStatus !== "ready"));

    res.json({ ok: true, orders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Oxirgi tayyor bo'lgan buyurtmalar (1 soat ichida)
router.get("/kitchen/recent", kitchenMiddleware, moduleGuard("kitchen", "kitchen"), async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const shots = await Shot.find({
      restaurantId: req.chef.restaurantId,
      "items.sentToKitchen": true,
      updatedAt: { $gte: oneHourAgo },
    }).sort({ updatedAt: -1 });

    const recent = shots
      .map((shot) => {
        const readyItems = shot.items.filter((i) => i.sentToKitchen && i.kitchenStatus === "ready");
        if (!readyItems.length) return null;
        return {
          shotId: shot._id,
          tableNumber: shot.tableNumber,
          waiterName: shot.waiterName,
          items: readyItems,
          status: shot.status,
        };
      })
      .filter(Boolean);

    res.json({ ok: true, recent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Item statusini "cooking" ga o'zgartirish
router.post("/kitchen/orders/:shotId/cooking", kitchenMiddleware, moduleGuard("kitchen", "kitchen"), async (req, res) => {
  try {
    const { itemIndexes } = req.body;
    const shot = await Shot.findById(req.params.shotId);
    if (!shot) return res.status(404).json({ error: "Shot topilmadi" });

    if (!itemIndexes?.length) {
      shot.items.forEach((item) => {
        if (item.sentToKitchen && item.kitchenStatus === "pending") item.kitchenStatus = "cooking";
      });
    } else {
      itemIndexes.forEach((idx) => {
        if (shot.items[idx]?.sentToKitchen) shot.items[idx].kitchenStatus = "cooking";
      });
    }

    await shot.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`${shot.restaurantId}:kitchen`).emit("shot-updated", shot);
      io.to(`${shot.restaurantId}:waiter`).emit("shot-updated", shot);
    }
    res.json({ ok: true, shot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Item(lar) tayyor
router.post("/kitchen/orders/:shotId/ready", kitchenMiddleware, moduleGuard("kitchen", "kitchen"), async (req, res) => {
  try {
    const { itemIndexes } = req.body;
    const shot = await Shot.findById(req.params.shotId);
    if (!shot) return res.status(404).json({ error: "Shot topilmadi" });

    const readyItems = [];
    if (!itemIndexes?.length) {
      shot.items.forEach((item) => {
        if (item.sentToKitchen && item.kitchenStatus === "cooking") {
          item.kitchenStatus = "ready";
          readyItems.push(item);
        }
      });
    } else {
      itemIndexes.forEach((idx) => {
        if (shot.items[idx]?.sentToKitchen) {
          shot.items[idx].kitchenStatus = "ready";
          readyItems.push(shot.items[idx]);
        }
      });
    }

    await shot.save();

    const io = req.app.get("io");
    if (io) {
      io.to(`${shot.restaurantId}:waiter`).emit("kitchen-ready", {
        shotId: shot._id,
        tableNumber: shot.tableNumber,
        items: readyItems,
      });
      io.to(`${shot.restaurantId}:kitchen`).emit("shot-updated", shot);
      io.to(`${shot.restaurantId}:customer`).emit("shot-updated", shot);
    }
    res.json({ ok: true, shot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;