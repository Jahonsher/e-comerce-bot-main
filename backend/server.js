const config = require("./config");
const logger = require("./utils/logger");
const { connectDB } = require("./config/database");

const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");

// Models
const Admin = require("./models/Admin");
const Category = require("./models/Category");
const { Restaurant } = require("./models");

// Services
const botService = require("./services/bot.service");

// Routes
const publicRoutes = require("./routes/public.routes");
const adminRoutes = require("./routes/admin.routes");
const superadminRoutes = require("./routes/superadmin.routes");
const waiterEmployeeRoutes = require("./routes/waiter-employee.routes");
const kitchenRoutes = require("./routes/kitchen.routes");
const aiRoutes = require("./routes/ai.routes");

// ===== APP SETUP =====
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

app.set("io", io);

// ===== SECURITY MIDDLEWARE =====

// 1. Helmet — HTTP security headerlar (XSS, clickjacking, sniffing himoya)
app.use(helmet({
  contentSecurityPolicy: false, // CSP — Telegram WebApp bilan conflict bo'lmasligi uchun
  crossOriginEmbedderPolicy: false,
}));

// 2. CORS — ruxsat berilgan domenlar
const allowedOrigins = [
  "https://servix-admin.vercel.app",
  "https://e-comerce-bot-main-production.up.railway.app",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5173",
];
app.use(cors({
  origin: function(origin, cb) {
    // Telegram WebApp va server-side requestlar uchun origin bo'lmasligi mumkin
    if (!origin || allowedOrigins.indexOf(origin) !== -1) return cb(null, true);
    // Telegram WebApp domenlarini ham qo'shish
    if (origin && origin.indexOf("telegram") !== -1) return cb(null, true);
    if (origin && origin.indexOf("vercel") !== -1) return cb(null, true);
    cb(null, true); // Hozircha barcha originlarni qabul qilamiz (production da cheklash kerak)
  },
  credentials: true,
}));

// 3. Body parser
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// 4. NoSQL Injection himoyasi — $gt, $ne, $or kabi operatorlarni bloklash
app.use(mongoSanitize({
  replaceWith: "_",
  onSanitize: ({ req, key }) => {
    logger.warn(`[SECURITY] NoSQL injection bloklandi: ${key} | IP: ${req.ip}`);
  },
}));

// 5. HPP — HTTP Parameter Pollution himoyasi
app.use(hpp());

// 6. XSS himoyasi — custom middleware (xss-clean deprecated, o'zimiz yozamiz)
app.use((req, res, next) => {
  // Request body dagi xavfli HTML/JS ni tozalash
  if (req.body && typeof req.body === 'object') {
    cleanXSS(req.body);
  }
  next();
});

function cleanXSS(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'string') {
      // <script>, onclick=, javascript: kabi xavfli matnlarni tozalash
      obj[key] = obj[key]
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript\s*:/gi, '');
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      cleanXSS(obj[key]);
    }
  }
}

// 7. Request size limiti — DDoS himoyasi
app.use((req, res, next) => {
  // 20MB dan katta requestlarni bloklash
  if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 20 * 1024 * 1024) {
    logger.warn(`[SECURITY] Katta request bloklandi: ${req.headers['content-length']} bytes | IP: ${req.ip}`);
    return res.status(413).json({ error: "Request hajmi juda katta" });
  }
  next();
});

// 8. Suspicious path blocker — path traversal himoyasi
app.use((req, res, next) => {
  if (req.path.indexOf('..') !== -1 || req.path.indexOf('%2e%2e') !== -1) {
    logger.warn(`[SECURITY] Path traversal bloklandi: ${req.path} | IP: ${req.ip}`);
    return res.status(400).json({ error: "Noto'g'ri so'rov" });
  }
  next();
});

// Static files (services strukturasi)
app.use("/static", express.static(path.join(__dirname, "..", "client", "shared")));
app.use("/waiter", express.static(path.join(__dirname, "..", "client", "services", "waiter")));
app.use("/kitchen", express.static(path.join(__dirname, "..", "client", "services", "kitchen")));

// ===== SOCKET.IO =====
io.on("connection", (socket) => {
  socket.on("join", (data) => {
    try {
      const decoded = jwt.verify(data.token, config.jwtSecret);
      const room = `${decoded.restaurantId}:${data.panel || "unknown"}`;
      socket.join(room);
      socket.restaurantId = decoded.restaurantId;
      socket.panel = data.panel;
      logger.debug(`Socket joined: ${room}`);
    } catch (e) {
      socket.emit("error", { message: "Token yaroqsiz" });
    }
  });
});

// ===== ROUTES =====
app.use("/", publicRoutes);
app.use("/admin", adminRoutes);
app.use("/superadmin", superadminRoutes);
app.use("/", waiterEmployeeRoutes);
app.use("/", kitchenRoutes);
app.use("/admin/ai", aiRoutes);

// ===== GRACEFUL SHUTDOWN =====
process.on("SIGTERM", () => {
  logger.info("SIGTERM qabul qilindi — server to'xtamoqda...");
  Promise.all(botService.getActiveBots().map((rId) => botService.stopBot(rId)))
    .then(() => {
      logger.info("Webhooklar tozalandi. Server to'xtadi.");
      process.exit(0);
    })
    .catch(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});

process.on("SIGINT", () => process.exit(0));
process.on("uncaughtException", (e) => logger.error("uncaught:", e.message));
process.on("unhandledRejection", (e) => logger.error("unhandled:", e));

// ===== BOOTSTRAP =====
async function main() {
  try {
    await connectDB();

    httpServer.listen(config.port, () => {
      logger.info(`Server ${config.port} portda ishga tushdi`);
    });

    // Superadmin
    try {
      const { username, password } = config.superadmin;
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        const existing = await Admin.findOne({ role: "superadmin" });
        if (!existing) {
          await Admin.create({ username, password: hash, restaurantName: "SuperAdmin", restaurantId: "superadmin", role: "superadmin", active: true });
          logger.info(`Superadmin yaratildi: ${username}`);
        } else {
          await Admin.findByIdAndUpdate(existing._id, { password: hash, username, active: true });
          logger.info(`Superadmin yangilandi: ${username}`);
        }
      }
    } catch (e) {
      logger.error("Superadmin xato:", e.message);
    }

    // Default restoran/bot
    const def = config.defaultRestaurant;
    if (def.botToken) {
      try {
        const { ensureRestaurant } = superadminRoutes;
        await ensureRestaurant(def.restaurantId, def.restaurantName);

        const defAdmin = await Admin.findOne({ restaurantId: def.restaurantId, role: "admin" });
        if (!defAdmin) {
          const defPass = await bcrypt.hash("admin123", 10);
          await Admin.create({
            username: `${def.restaurantId}_admin`, password: defPass,
            restaurantName: def.restaurantName, restaurantId: def.restaurantId,
            botToken: def.botToken, chefId: def.chefId, webappUrl: def.webappUrl,
            role: "admin", active: true,
          });
          logger.info("Default admin yaratildi");
        } else {
          await Admin.findByIdAndUpdate(defAdmin._id, {
            botToken: def.botToken, chefId: def.chefId, webappUrl: def.webappUrl,
          });
        }

        const catCount = await Category.countDocuments({ restaurantId: def.restaurantId });
        if (catCount === 0) {
          await Category.insertMany([
            { name: "Taom", name_ru: "Еда", emoji: "🍽", order: 1, restaurantId: def.restaurantId },
            { name: "Ichimlik", name_ru: "Напитки", emoji: "🥤", order: 2, restaurantId: def.restaurantId },
          ]);
        }

        await botService.startBot(def.restaurantId, def.botToken, def.webappUrl, def.chefId);
        logger.info(`Default bot ishga tushdi: ${def.restaurantId}`);
      } catch (e) {
        logger.error("Default bot xato:", e.message);
      }
    }

    // Boshqa restoranlar
    try {
      const allAdmins = await Admin.find({ role: "admin", active: true }).select("restaurantId restaurantName botToken chefId webappUrl");
      for (const a of allAdmins) {
        if (def.botToken && a.restaurantId === def.restaurantId) continue;
        const { ensureRestaurant } = superadminRoutes;
        await ensureRestaurant(a.restaurantId, a.restaurantName);
        if (a.botToken) await botService.startBot(a.restaurantId, a.botToken, a.webappUrl, a.chefId);
      }
      logger.info(`Restoranlar sinxronlandi: ${allAdmins.length}`);
    } catch (e) {
      logger.error("Restoran sync xato:", e.message);
    }

    if (config.domain) {
      logger.info(`Domain: ${config.domain}`);
    }
  } catch (err) {
    logger.error("Server start xato:", err.message);
    process.exit(1);
  }
}

main();