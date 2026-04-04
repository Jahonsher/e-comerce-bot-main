require("dotenv").config();

const config = {
  // Server
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  domain: process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_URL || "",

  // Database
  mongoUri: process.env.MONGO_URI,

  // JWT
  jwtSecret: process.env.JWT_SECRET,

  // Face++
  facepp: {
    apiKey: process.env.FACEPP_API_KEY || "",
    apiSecret: process.env.FACEPP_API_SECRET || "",
  },

  // Default restoran
  defaultRestaurant: {
    botToken: process.env.BOT_TOKEN || "",
    chefId: Number(process.env.CHEF_ID) || 0,
    webappUrl: process.env.WEBAPP_URL || "",
    restaurantId: process.env.RESTAURANT_ID || "imperial",
    restaurantName: process.env.RESTAURANT_NAME || "Imperial Restoran",
  },

  // Superadmin
  superadmin: {
    username: (process.env.SUPER_USERNAME || "admin").trim(),
    password: (process.env.SUPER_PASSWORD || "").trim(),
  },

  // Rate limiting
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
  },

  // Cache
  cache: {
    statsTTL: 30000, // 30 sekund
  },

  // AI Agent
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
};

// ===== VALIDATION =====
const required = [
  ["mongoUri", "MONGO_URI"],
  ["jwtSecret", "JWT_SECRET"],
];

const missing = required.filter(([key]) => !config[key]);
if (missing.length > 0) {
  const names = missing.map(([, envName]) => envName).join(", ");
  console.error(`❌ Muhim environment variable(lar) topilmadi: ${names}`);
  console.error("   .env.example faylidan nusxa oling va to'ldiring.");
  process.exit(1);
}

if (!config.superadmin.password || config.superadmin.password.length < 8) {
  console.warn("⚠️  SUPER_PASSWORD o'rnatilmagan yoki juda qisqa (min 8 belgi).");
}

module.exports = config;