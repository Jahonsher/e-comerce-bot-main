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
    if (e.response) {
      logger.error("AI API response:", e.response.status, JSON.stringify(e.response.data));
    }
    if (e.message === "AI Agent moduli yoqilmagan") {
      return res.status(403).json({ error: "MODULE_DISABLED", message: e.message });
    }
    if (e.message === "AI xizmati sozlanmagan") {
      return res.status(503).json({ error: "AI xizmati hozir mavjud emas" });
    }
    // Anthropic API xatolari
    if (e.response?.status === 401) {
      return res.status(503).json({ error: "API key noto'g'ri yoki muddati o'tgan. Superadmin bilan bog'laning." });
    }
    if (e.response?.status === 429) {
      return res.status(429).json({ error: "AI tizimi band. Biroz kutib qayta urinib ko'ring." });
    }
    if (e.response?.status === 400) {
      var apiMsg = e.response?.data?.error?.message || '';
      logger.error("API 400:", apiMsg);
      return res.status(400).json({ error: "AI xatolik: " + (apiMsg || "Savolni qayta yozing") });
    }
    if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED' || e.code === 'ERR_BAD_REQUEST') {
      return res.status(503).json({ error: "AI serveriga ulanib bo'lmadi. Internet aloqasini tekshiring." });
    }
    res.status(500).json({ error: "AI javob berishda xatolik: " + (e.response?.data?.error?.message || e.message) });
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
      limit: admin?.aiLimit || 500,
      remaining: Math.max(0, (admin?.aiLimit || 500) - (monthStats?.count || 0)),
      totalTokens: monthStats?.totalTokens || 0,
      totalCost: monthStats?.totalCost || 0,
      avgResponseTime: Math.round(monthStats?.avgResponseTime || 0),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== HISOBOT EKSPORT (Excel) =====
router.get("/export", authMiddleware, moduleGuard("aiAgent"), async (req, res) => {
  try {
    const { collectAllData } = require("../services/ai.service");
    const data = await collectAllData(req.admin.restaurantId);
    const admin = await Admin.findOne({ restaurantId: req.admin.restaurantId, role: "admin" }).select("restaurantName");
    const name = admin?.restaurantName || req.admin.restaurantId;
    const sana = new Date().toLocaleDateString("uz-UZ");

    // CSV format (Excel da ochiladi)
    let csv = "\uFEFF"; // BOM — Excel da o'zbek harflar to'g'ri ko'rinishi uchun
    csv += `ServiX Hisobot — ${name}\n`;
    csv += `Sana: ${sana}\n\n`;

    // Bugungi statistika
    csv += "=== BUGUNGI STATISTIKA ===\n";
    csv += `Buyurtmalar,${data.bugun.buyurtmalar}\n`;
    csv += `Daromad,${data.bugun.daromad} so'm\n`;
    csv += `Online,${data.bugun.online}\n`;
    csv += `Restoranda,${data.bugun.restoranda}\n\n`;

    // Oylik
    csv += "=== OYLIK STATISTIKA ===\n";
    csv += `Buyurtmalar,${data.oylik.buyurtmalar}\n`;
    csv += `Daromad,${data.oylik.daromad} so'm\n\n`;

    // Kunlik trend
    csv += "=== KUNLIK TREND (7 kun) ===\n";
    csv += "Sana,Buyurtmalar,Daromad\n";
    data.kunlik_trend.forEach((d) => { csv += `${d.sana},${d.buyurtmalar},${d.daromad}\n`; });
    csv += "\n";

    // Top mahsulotlar
    csv += "=== TOP MAHSULOTLAR ===\n";
    csv += "Nomi,Sotilgan soni,Summa\n";
    data.top_mahsulotlar.forEach((p) => { csv += `${p.nom},${p.soni},${p.summa}\n`; });
    csv += "\n";

    // Xodimlar
    csv += "=== XODIMLAR ===\n";
    csv += "Ism,Lavozim,Maosh,Bugungi holat,Kechikish (daq)\n";
    data.xodimlar.forEach((x) => { csv += `${x.ism},${x.lavozim},${x.maosh},${x.bugungi_holat},${x.kechikish}\n`; });
    csv += "\n";

    // Ombor
    if (data.ombor.length) {
      csv += "=== OMBOR ===\n";
      csv += "Nomi,Qoldiq,Birlik,Min stock,Holat\n";
      data.ombor.forEach((o) => { csv += `${o.nomi},${o.qoldiq},${o.birlik},${o.min},${o.holat}\n`; });
    }

    csv += `\n— ServiX AI hisobot | ${sana}\n`;

    const fileName = `ServiX_${name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (e) {
    logger.error("Export error:", e.message);
    res.status(500).json({ error: "Hisobotni yuklab bo'lmadi" });
  }
});

module.exports = router;