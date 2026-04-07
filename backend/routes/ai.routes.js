const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const { moduleGuard } = require("../middleware/moduleGuard");
const logger = require("../utils/logger");
const Admin = require("../models/Admin");
const { AIChat } = require("../models");
const { askAI, collectAllData } = require("../services/ai.service");

// ===== DEBUG — data tekshirish =====
router.get("/debug", authMiddleware, async (req, res) => {
  try {
    var data = await collectAllData(req.admin.restaurantId);
    res.json({
      restaurantId: req.admin.restaurantId,
      biznes: data.biznes,
      menyu_soni: data.menyu_soni,
      menyu_taomlar: data.menyu ? data.menyu.length : 0,
      oylik_buyurtmalar: data.oylik_buyurtmalar,
      oylik_daromad: data.oylik_daromad,
      bugun_buyurtmalar: data.bugun_buyurtmalar,
      bugun_daromad: data.bugun_daromad,
      xodimlar_soni: data.xodimlar_soni,
      mijozlar: data.mijozlar,
      top_mahsulotlar: data.top_mahsulotlar ? data.top_mahsulotlar.length : 0,
      kunlik_hisobot_kunlar: data.kunlik_hisobot ? data.kunlik_hisobot.length : 0,
      ombor_kam: data.ombor_kam,
      all_keys: Object.keys(data),
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

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

// ===== HISOBOT EKSPORT (Excel/CSV) =====
router.get("/export", authMiddleware, moduleGuard("aiAgent"), async (req, res) => {
  try {
    const { collectExportData } = require("../services/ai.service");
    const query = req.query.q || "oylik to'liq hisobot";
    const data = await collectExportData(req.admin.restaurantId, query);
    const admin = await Admin.findOne({ restaurantId: req.admin.restaurantId, role: "admin" }).select("restaurantName");
    const name = admin?.restaurantName || req.admin.restaurantId;
    const sana = new Date().toLocaleDateString("uz-UZ");

    let csv = "\uFEFF";
    csv += `ServiX Hisobot — ${name}\n`;
    csv += `Davr: ${data._davr || "—"}\nSana: ${sana}\n\n`;

    if (data.buyurtmalar_soni !== undefined) {
      csv += "Ko'rsatkich,Qiymat\n";
      csv += `Buyurtmalar,${data.buyurtmalar_soni}\nDaromad,${data.jami_daromad} so'm\n`;
      if (data.online !== undefined) csv += `Online,${data.online}\nRestoranda,${data.restoranda}\n`;
      csv += "\n";
    }
    if (data.kunlik_breakdown && data.kunlik_breakdown.length) {
      csv += "=== KUNLIK ===\nSana,Buyurtmalar,Daromad\n";
      data.kunlik_breakdown.forEach((d) => { csv += `${d.sana},${d.buyurtmalar},${d.daromad}\n`; });
      csv += "\n";
    }
    if (data.mahsulotlar && data.mahsulotlar.length) {
      csv += "=== MAHSULOTLAR ===\nNomi,Soni,Summa\n";
      data.mahsulotlar.forEach((p) => { csv += `${p.nom},${p.soni},${p.summa}\n`; });
      csv += "\n";
    }
    if (data.xodimlar && data.xodimlar.length) {
      csv += "=== XODIMLAR ===\nIsm,Lavozim,Maosh,Holat,Kechikish\n";
      data.xodimlar.forEach((x) => { csv += `${x.ism},${x.lavozim},${x.maosh},${x.holat},${x.kechikish}\n`; });
      csv += "\n";
    }
    if (data.ombor && data.ombor.length) {
      csv += "=== OMBOR ===\nNomi,Qoldiq,Birlik,Min,Holat\n";
      data.ombor.forEach((o) => { csv += `${o.nomi},${o.qoldiq},${o.birlik},${o.min},${o.holat}\n`; });
    }
    csv += `\n— ServiX AI | ${sana}\n`;

    const fileName = `ServiX_${name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (e) {
    logger.error("Export:", e.message);
    res.status(500).json({ error: "Yuklab bo'lmadi" });
  }
});

module.exports = router;