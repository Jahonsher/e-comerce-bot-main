const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const { moduleGuard } = require("../middleware/moduleGuard");
const logger = require("../utils/logger");
const Admin = require("../models/Admin");
const { AIChat } = require("../models");
const { askAI } = require("../services/ai.service");

// ===== AI CHAT — savol yuborish =====
router.post("/chat", authMiddleware, moduleGuard("aiAgent"), async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Savol kiriting" });
    }
    if (question.length > 1000) {
      return res.status(400).json({ error: "Savol juda uzun (maks 1000 belgi)" });
    }

    const rId = req.admin.restaurantId;
    const adminId = req.admin.id;

    // Oylik limit tekshirish
    const admin = await Admin.findOne({ restaurantId: rId, role: "admin" }).select("aiLimit");
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthCount = await AIChat.countDocuments({
      restaurantId: rId,
      createdAt: { $gte: monthStart },
    });

    const limit = admin?.aiLimit || 50;
    if (monthCount >= limit) {
      return res.status(429).json({
        error: "AI_LIMIT",
        message: `Oylik AI surov limitingiz tugadi (${limit} ta). Limitni oshirish uchun superadmin bilan bog'laning.`,
        used: monthCount,
        limit,
      });
    }

    // AI ga so'rash
    const result = await askAI(rId, adminId, req.admin.username, question.trim());

    // DB ga saqlash
    await AIChat.create({
      restaurantId: rId,
      adminId,
      adminUsername: req.admin.username,
      question: question.trim(),
      answer: result.answer,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      cost: result.cost,
      model: result.model,
      responseTime: result.responseTime,
    });

    res.json({
      ok: true,
      answer: result.answer,
      usage: {
        used: monthCount + 1,
        limit,
        remaining: limit - monthCount - 1,
      },
    });
  } catch (e) {
    logger.error("AI chat error:", e.message);
    if (e.message === "AI Agent moduli yoqilmagan") {
      return res.status(403).json({ error: "MODULE_DISABLED", message: e.message });
    }
    if (e.message === "AI xizmati sozlanmagan") {
      return res.status(503).json({ error: "AI xizmati hozir mavjud emas" });
    }
    res.status(500).json({ error: "AI javob berishda xatolik yuz berdi" });
  }
});

// ===== CHAT TARIXI =====
router.get("/history", authMiddleware, moduleGuard("aiAgent"), async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;
    const chats = await AIChat.find({ restaurantId: req.admin.restaurantId })
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .select("question answer createdAt responseTime")
      .lean();
    res.json({ ok: true, chats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== OYLIK STATISTIKA =====
router.get("/usage", authMiddleware, moduleGuard("aiAgent"), async (req, res) => {
  try {
    const rId = req.admin.restaurantId;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const admin = await Admin.findOne({ restaurantId: rId, role: "admin" }).select("aiLimit");
    const [monthStats] = await AIChat.aggregate([
      { $match: { restaurantId: rId, createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          totalCost: { $sum: "$cost" },
          avgResponseTime: { $avg: "$responseTime" },
        },
      },
    ]);

    res.json({
      ok: true,
      used: monthStats?.count || 0,
      limit: admin?.aiLimit || 50,
      remaining: Math.max(0, (admin?.aiLimit || 50) - (monthStats?.count || 0)),
      totalTokens: monthStats?.totalTokens || 0,
      totalCost: monthStats?.totalCost || 0,
      avgResponseTime: Math.round(monthStats?.avgResponseTime || 0),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;