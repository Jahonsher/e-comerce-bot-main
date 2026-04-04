const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true },
    password: String,
    restaurantName: String,
    restaurantId: String,
    botToken: String,
    chefId: Number,
    phone: String,
    address: String,
    addressRu: String,
    webappUrl: String,
    role: { type: String, default: "admin" },
    active: { type: Boolean, default: true },
    blockReason: { type: String, default: "" },
    subscriptionEnd: Date,

    // ===== UNIVERSAL BUSINESS TYPE =====
    businessType: { type: String, default: "restaurant" },

    // Site settings
    botUsername: String,
    adminTg: String,
    metro: String,
    metroRu: String,
    workHours: String,
    workHoursRu: String,
    nameRu: String,
    heroBadge: String,
    heroBadgeRu: String,
    subtitle: String,
    subtitleRu: String,
    workStart: { type: Number, default: 10 },
    workEnd: { type: Number, default: 23 },
    mapEmbed: String,
    heroImage: String,
    eventsBg: String,
    gallery: [String],
    theme: { type: String, default: "gold" },

    // Modullar
    modules: {
      orders: { type: Boolean, default: true },
      menu: { type: Boolean, default: true },
      categories: { type: Boolean, default: true },
      ratings: { type: Boolean, default: true },
      users: { type: Boolean, default: true },
      employees: { type: Boolean, default: true },
      attendance: { type: Boolean, default: true },
      empReport: { type: Boolean, default: true },
      branches: { type: Boolean, default: true },
      broadcast: { type: Boolean, default: true },
      notifications: { type: Boolean, default: true },
      inventory: { type: Boolean, default: false },
      waiter: { type: Boolean, default: false },
      kitchen: { type: Boolean, default: false },
      aiAgent: { type: Boolean, default: false },
    },

    // AI Agent limits
    aiLimit: { type: Number, default: 500 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);