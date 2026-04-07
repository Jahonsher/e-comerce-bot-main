const config = require("../config");
const logger = require("../utils/logger");
const Order = require("../models/Order");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Product = require("../models/Product");
const Category = require("../models/Category");
const { Employee, Attendance, Inventory, InventoryLog, Branch, Shot } = require("../models");

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-haiku-4-5-20251001";
const PRICING = { input: 1.0, output: 5.0 };

function calcCost(inp, out) {
  return (inp * PRICING.input + out * PRICING.output) / 1_000_000;
}

const BLOCKED = [
  /siyosat|prezident|saylov/i, /din\b|islom|namoz/i,
  /parol|token|secret|api.?key/i, /o'ldir|zarar|qurol/i,
];
function isBlocked(t) { return BLOCKED.some((p) => p.test(t)); }

// ===== BARCHA MA'LUMOTLARNI TO'LIQ YIGISH =====
async function collectAllData(restaurantId) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - 7);
  const kecha = new Date(today); kecha.setDate(kecha.getDate() - 1);

  // BARCHA datani parallel olish
  const [
    todayOrders, monthOrders, prevMonthOrders,
    allProducts, allCategories,
    employees, todayAttendance, monthAttendance,
    inventory, branches, totalUsers,
    admin, openShots
  ] = await Promise.all([
    Order.find({ restaurantId, createdAt: { $gte: today } }).lean(),
    Order.find({ restaurantId, createdAt: { $gte: monthStart } }).lean(),
    Order.find({ restaurantId, createdAt: { $gte: prevMonthStart, $lt: monthStart } }).lean(),
    Product.find({ restaurantId }).lean(),
    Category.find({ restaurantId }).lean(),
    Employee.find({ restaurantId, active: true }).select("-password -faceDescriptor -photo").lean(),
    Attendance.find({ restaurantId, date: today.toISOString().split("T")[0] }).lean(),
    Attendance.find({ restaurantId, date: { $regex: `^${now.toISOString().slice(0, 7)}` } }).lean(),
    Inventory.find({ restaurantId, active: true }).lean(),
    Branch.find({ restaurantId, active: true }).lean(),
    User.countDocuments({ restaurantId }),
    Admin.findOne({ restaurantId, role: "admin" }).select("restaurantName phone address workStart workEnd subscriptionEnd").lean(),
    Shot.find({ restaurantId, status: "open" }).lean(),
  ]);

  // Hisoblashlar
  const weekOrders = monthOrders.filter((o) => new Date(o.createdAt) >= weekStart);
  const kechaOrders = monthOrders.filter((o) => { const d = new Date(o.createdAt); return d >= kecha && d < today; });

  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const monthRevenue = monthOrders.reduce((s, o) => s + (o.total || 0), 0);
  const prevMonthRevenue = prevMonthOrders.reduce((s, o) => s + (o.total || 0), 0);
  const weekRevenue = weekOrders.reduce((s, o) => s + (o.total || 0), 0);
  const kechaRevenue = kechaOrders.reduce((s, o) => s + (o.total || 0), 0);

  // O'sish foizi
  const revenueGrowth = prevMonthRevenue > 0 ? Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100) : 0;
  const ordersGrowth = prevMonthOrders.length > 0 ? Math.round(((monthOrders.length - prevMonthOrders.length) / prevMonthOrders.length) * 100) : 0;

  // Mahsulotlar statistikasi
  const itemMap = {};
  monthOrders.forEach((o) => (o.items || []).forEach((item) => {
    const key = item.name || "Noma'lum";
    if (!itemMap[key]) itemMap[key] = { soni: 0, summa: 0, kategoriya: item.category || "—" };
    itemMap[key].soni += item.quantity || 1;
    itemMap[key].summa += (item.price || 0) * (item.quantity || 1);
  }));
  const mahsulotlarStat = Object.entries(itemMap)
    .map(([nom, d]) => ({ nom, ...d, ortacha_narx: d.soni > 0 ? Math.round(d.summa / d.soni) : 0 }))
    .sort((a, b) => b.soni - a.soni);

  // Kunlik trend (30 kun)
  const kunlikTrend = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dn = new Date(d); dn.setDate(dn.getDate() + 1);
    const dayO = [...monthOrders, ...prevMonthOrders].filter((o) => { const ct = new Date(o.createdAt); return ct >= d && ct < dn; });
    if (dayO.length > 0 || i < 7) {
      kunlikTrend.push({
        sana: d.toLocaleDateString("uz-UZ", { day: "numeric", month: "short" }),
        hafta_kuni: d.toLocaleDateString("uz-UZ", { weekday: "short" }),
        buyurtmalar: dayO.length,
        daromad: dayO.reduce((s, o) => s + (o.total || 0), 0),
      });
    }
  }

  // Soatlik taqsimot (bugun)
  const soatlik = [];
  for (let h = 0; h < 24; h++) {
    const cnt = todayOrders.filter((o) => new Date(o.createdAt).getHours() === h).length;
    if (cnt > 0) soatlik.push({ soat: h + ":00", buyurtmalar: cnt });
  }

  // Xodimlar + oylik davomat
  const xodimlar = employees.map((e) => {
    const bugunAtt = todayAttendance.find((a) => a.employeeId?.toString() === e._id.toString());
    const oylikAtt = monthAttendance.filter((a) => a.employeeId?.toString() === e._id.toString());
    const kelganKunlar = oylikAtt.filter((a) => a.status === "keldi").length;
    const kechikishlar = oylikAtt.filter((a) => a.lateMinutes > 0).length;
    const jamiDaqiqa = oylikAtt.reduce((s, a) => s + (a.totalMinutes || 0), 0);

    return {
      ism: e.name,
      lavozim: e.position || "—",
      rol: e.role,
      maosh: e.salary || 0,
      ish_vaqti: (e.workStart || "09:00") + "—" + (e.workEnd || "18:00"),
      dam_kuni: e.weeklyOff || "yakshanba",
      bugun: bugunAtt ? bugunAtt.status : "ma'lumot yo'q",
      bugun_kelgan: bugunAtt?.checkIn || "—",
      bugun_ketgan: bugunAtt?.checkOut || "—",
      bugun_kechikish: bugunAtt?.lateMinutes || 0,
      oylik_kelgan_kunlar: kelganKunlar,
      oylik_kechikishlar: kechikishlar,
      oylik_jami_daqiqa: jamiDaqiqa,
      oylik_jami_soat: Math.round(jamiDaqiqa / 60 * 10) / 10,
    };
  });

  // Ombor
  const ombor = inventory.map((i) => ({
    nomi: i.productName,
    qoldiq: i.currentStock,
    birlik: i.unit,
    min_stock: i.minStock,
    max_stock: i.maxStock,
    tannarx: i.costPrice || 0,
    qiymati: (i.currentStock || 0) * (i.costPrice || 0),
    holat: i.currentStock <= 0 ? "TUGAGAN" : i.currentStock <= i.minStock ? "KAM QOLDI" : "Yetarli",
    oxirgi_tolov: i.lastRestocked ? new Date(i.lastRestocked).toLocaleDateString("uz-UZ") : "—",
  }));

  const omborJami = {
    jami_mahsulot: ombor.length,
    tugagan: ombor.filter((o) => o.holat === "TUGAGAN").length,
    kam_qolgan: ombor.filter((o) => o.holat === "KAM QOLDI").length,
    ombor_qiymati: ombor.reduce((s, o) => s + o.qiymati, 0),
  };

  // Buyurtma turlari
  const onlineCount = monthOrders.filter((o) => o.orderType === "online").length;
  const dineInCount = monthOrders.filter((o) => o.orderType === "dine_in").length;

  // O'rtacha chek
  const avgCheck = monthOrders.length > 0 ? Math.round(monthRevenue / monthOrders.length) : 0;

  // Menyu
  const menyu = {
    jami_taomlar: allProducts.length,
    faol: allProducts.filter((p) => p.active !== false).length,
    yashirin: allProducts.filter((p) => p.active === false).length,
    kategoriyalar: allCategories.length,
  };

  return {
    biznes: {
      nomi: admin?.restaurantName || restaurantId,
      telefon: admin?.phone || "—",
      manzil: admin?.address || "—",
      ish_vaqti: (admin?.workStart || 10) + ":00 — " + (admin?.workEnd || 23) + ":00",
      obuna_tugaydi: admin?.subscriptionEnd ? new Date(admin.subscriptionEnd).toLocaleDateString("uz-UZ") : "—",
      filiallar_soni: branches.length,
      filiallar: branches.map((b) => b.name),
    },
    moliya: {
      bugungi_daromad: todayRevenue,
      kechagi_daromad: kechaRevenue,
      haftalik_daromad: weekRevenue,
      oylik_daromad: monthRevenue,
      otgan_oy_daromad: prevMonthRevenue,
      osish_foiz: revenueGrowth,
      ortacha_chek: avgCheck,
    },
    buyurtmalar: {
      bugun: todayOrders.length,
      kecha: kechaOrders.length,
      haftalik: weekOrders.length,
      oylik: monthOrders.length,
      otgan_oy: prevMonthOrders.length,
      osish_foiz: ordersGrowth,
      online: onlineCount,
      restoranda: dineInCount,
      ochiq_shotlar: openShots.length,
    },
    bugungi_soatlik: soatlik,
    kunlik_trend_30: kunlikTrend,
    mahsulotlar_statistikasi: mahsulotlarStat,
    menyu: menyu,
    xodimlar: xodimlar,
    xodimlar_umumiy: {
      jami: employees.length,
      bugun_kelgan: todayAttendance.filter((a) => a.status === "keldi").length,
      bugun_kelmagan: employees.length - todayAttendance.filter((a) => a.status === "keldi").length,
      jami_maosh: employees.reduce((s, e) => s + (e.salary || 0), 0),
    },
    ombor: ombor,
    ombor_umumiy: omborJami,
    mijozlar: { jami: totalUsers },
    sana: now.toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric", weekday: "long" }),
  };
}

// ===== SYSTEM PROMPT =====
function buildPrompt(name, type) {
  const sana = new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" });
  return `Sen "${name}" biznesining shaxsiy buxgalteri va tahlilchisisisan. Nominging ServiX AI.

SENGA SHU BIZNESNING BARCHA MA'LUMOTLARI BERILADI:
- Moliya: bugungi, kechagi, haftalik, oylik daromad, o'tgan oy bilan qiyoslash
- Buyurtmalar: soni, turlari, soatlik taqsimot, 30 kunlik trend
- Mahsulotlar: qaysi taom nechta sotildi, summasi, kategoriyasi
- Xodimlar: ism, lavozim, maosh, bugungi davomat, oylik kelgan kunlar, kechikishlar
- Ombor: qoldiq, min stock, holat, ombor qiymati
- Menyu: taomlar soni, kategoriyalar
- Mijozlar: jami foydalanuvchilar soni
- Biznes: filiallar, telefon, ish vaqti

SENING VAZIFANG:
1. Foydalanuvchi nima so'rasa FAQAT SHUNI javob ber. "7 kunlik product" desa — faqat 7 kunlik mahsulot stat ber. "oylik daromad" desa — faqat oylik daromad.
2. Ortiqcha ma'lumot QUSHMA. Faqat so'ralganni ber.
3. Har bir javob oxirida 1-2 qatorlik MASLAHAT ber. Masalan: "💡 Maslahat: Osh eng ko'p sotilmoqda, narxini 5% oshirish mumkin" yoki "⚠️ Diqqat: Bugun 3 ta xodim kelmagan, o'rinbosarlarni chaqiring".
4. Jadval ko'rinishida chiroyli formatlash — markdown table ishlatish.
5. Pul: 1,250,000 so'm. Foiz: ↑12% yoki ↓5%.
6. Ma'lumot 0 bo'lsa — "Hozircha ma'lumot yo'q" de, o'ylab topma.
7. Foydalanuvchi tilida javob ber (o'zbek, rus, ingliz).
8. Siyosat, din, dasturlash, boshqa biznes haqida GAPLASHMA.
9. Excel/fayl so'rasa — "Tayyor! Pastdagi tugmadan yuklab oling" de va hisobotni jadval shaklida ham yoz.
10. Javob oxiri: — ServiX AI | ${sana}`;
}

// ===== API CALL =====
async function askAI(restaurantId, adminId, adminUsername, question) {
  const startTime = Date.now();
  const admin = await Admin.findOne({ restaurantId, role: "admin" }).select("restaurantName businessType modules aiLimit");
  if (!admin) throw new Error("Biznes topilmadi");
  if (!admin.modules?.aiAgent) throw new Error("AI Agent moduli yoqilmagan");
  if (!config.anthropicApiKey) throw new Error("AI xizmati sozlanmagan");

  if (isBlocked(question)) {
    return { answer: "Bu savol mening vakolatimdan tashqarida.\n\n— ServiX AI", inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, filtered: true };
  }

  // BARCHA ma'lumotlarni olish
  const data = await collectAllData(restaurantId);
  const systemPrompt = buildPrompt(admin.restaurantName, admin.businessType);
  const userMessage = `BIZNES MA'LUMOTLARI:\n${JSON.stringify(data, null, 2)}\n\nFOYDALANUVCHI SAVOLI: ${question}`;

  const axios = require("axios");
  let response;
  try {
    response = await axios.post(ANTHROPIC_API, {
      model: AI_MODEL, max_tokens: 4096, system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }, {
      headers: { "x-api-key": config.anthropicApiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      timeout: 60000,
    });
  } catch (err) {
    logger.error("API:", err.response?.status, JSON.stringify(err.response?.data || err.message));
    throw err;
  }

  const r = response.data;
  const answer = r.content?.[0]?.text || "Javob olib bo'lmadi";
  const inp = r.usage?.input_tokens || 0;
  const out = r.usage?.output_tokens || 0;
  return { answer, inputTokens: inp, outputTokens: out, totalTokens: inp + out, cost: calcCost(inp, out), model: AI_MODEL, responseTime: Date.now() - startTime, filtered: false };
}

// Export uchun
async function collectExportData(restaurantId, question) {
  return await collectAllData(restaurantId);
}

module.exports = { askAI, isBlocked, collectAllData, collectExportData, calcCost, AI_MODEL };