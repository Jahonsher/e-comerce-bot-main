const Admin = require("../models/Admin");
const logger = require("../utils/logger");

/**
 * moduleGuard — Route-level modul tekshirish middleware
 *
 * Foydalanish:
 *   router.get("/products", authMiddleware, moduleGuard("menu"), handler);
 *   router.get("/orders", authMiddleware, moduleGuard("orders"), handler);
 *   router.get("/shots", waiterMiddleware, moduleGuard("waiter", "waiter"), handler);
 *
 * @param {string} moduleName - tekshiriladigan modul nomi (Admin.modules ichidagi key)
 * @param {string} [source="admin"] - kim so'ramoqda: "admin" | "waiter" | "kitchen" | "employee"
 *   - "admin": req.admin.restaurantId dan oladi
 *   - "waiter": req.waiter.restaurantId dan oladi
 *   - "kitchen": req.chef.restaurantId dan oladi
 *   - "employee": req.employee.restaurantId dan oladi
 */
function moduleGuard(moduleName, source = "admin") {
  return async (req, res, next) => {
    try {
      // restaurantId ni source ga qarab olish
      let restaurantId;
      switch (source) {
        case "waiter":
          restaurantId = req.waiter?.restaurantId;
          break;
        case "kitchen":
          restaurantId = req.chef?.restaurantId;
          break;
        case "employee":
          restaurantId = req.employee?.restaurantId;
          break;
        default:
          restaurantId = req.admin?.restaurantId;
      }

      if (!restaurantId) {
        return res.status(401).json({ error: "RestaurantId topilmadi" });
      }

      // Superadmin har joyga kira oladi
      if (source === "admin" && req.admin?.role === "superadmin") {
        return next();
      }

      // Admin dan modullarni tekshirish
      const admin = await Admin.findOne({
        restaurantId,
        role: "admin",
      }).select("modules businessType");

      if (!admin) {
        return res.status(404).json({ error: "Biznes topilmadi" });
      }

      // Modul yoqilganmi
      if (!admin.modules || admin.modules[moduleName] !== true) {
        const moduleLabel = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
        return res.status(403).json({
          error: "MODULE_DISABLED",
          message: `${moduleLabel} moduli yoqilmagan`,
          module: moduleName,
        });
      }

      next();
    } catch (err) {
      logger.error(`moduleGuard error [${moduleName}]:`, err.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

module.exports = { moduleGuard };