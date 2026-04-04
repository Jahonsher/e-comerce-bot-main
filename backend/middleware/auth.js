const jwt = require("jsonwebtoken");
const config = require("../config");
const { Restaurant } = require("../models");
const { Employee } = require("../models");
const logger = require("../utils/logger");

/**
 * Restoran bloklangan yoki yo'qligini tekshirish
 */
async function isBotBlocked(restaurantId) {
  const rest = await Restaurant.findOne({ restaurantId });
  if (rest && rest.blocked) {
    return { blocked: true, reason: rest.blockReason || "Xizmat vaqtincha to'xtatilgan" };
  }
  return { blocked: false };
}

/**
 * Admin middleware — admin va superadmin uchun
 */
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!token) return res.status(401).json({ error: "Token kerak" });

  try {
    req.admin = jwt.verify(token, config.jwtSecret);

    // Superadmin har joyga kira oladi
    if (req.admin.role === "superadmin") return next();

    // Restoran bloklanganmi tekshirish
    const blockCheck = await isBotBlocked(req.admin.restaurantId);
    if (blockCheck.blocked) {
      return res.status(403).json({
        error: "BLOCKED",
        message: blockCheck.reason,
        blocked: true,
      });
    }

    next();
  } catch (err) {
    res.status(401).json({ error: "Token yaroqsiz" });
  }
}

/**
 * Superadmin middleware — faqat superadmin
 */
function superMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });

  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({ error: "Ruxsat yo'q" });
    }
    next();
  } catch (err) {
    res.status(401).json({ error: "Token yaroqsiz" });
  }
}

/**
 * Employee middleware
 */
async function empMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });

  try {
    req.employee = jwt.verify(token, config.jwtSecret);
    const emp = await Employee.findById(req.employee.id).select("active restaurantId");
    if (!emp || !emp.active) {
      return res.status(401).json({ error: "Akkaunt o'chirilgan", deleted: true });
    }

    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) {
      return res.status(403).json({
        error: "BLOCKED",
        message: blockCheck.reason,
        blocked: true,
      });
    }

    next();
  } catch (err) {
    res.status(401).json({ error: "Token yaroqsiz" });
  }
}

/**
 * Waiter middleware — faqat ofitsiant va oshpaz roli
 */
async function waiterMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const emp = await Employee.findById(decoded.id).select(
      "active restaurantId role name tables"
    );
    if (!emp || !emp.active) {
      return res.status(401).json({ error: "Akkaunt o'chirilgan", deleted: true });
    }
    if (emp.role !== "waiter" && emp.role !== "chef") {
      return res.status(403).json({ error: "Ruxsat yo'q — faqat ofitsiant" });
    }

    const blockCheck = await isBotBlocked(emp.restaurantId);
    if (blockCheck.blocked) {
      return res.status(403).json({
        error: "BLOCKED",
        message: blockCheck.reason,
        blocked: true,
      });
    }

    req.waiter = {
      id: emp._id,
      restaurantId: emp.restaurantId,
      name: emp.name,
      role: emp.role,
      tables: emp.tables || [],
    };
    next();
  } catch (err) {
    res.status(401).json({ error: "Token yaroqsiz" });
  }
}

module.exports = {
  isBotBlocked,
  authMiddleware,
  superMiddleware,
  empMiddleware,
  waiterMiddleware,
};