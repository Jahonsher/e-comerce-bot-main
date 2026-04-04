const config = require("../config");
const logger = require("../utils/logger");
const Order = require("../models/Order");
const User = require("../models/User");
const Admin = require("../models/Admin");
const { Employee, Attendance, Inventory, Branch } = require("../models");

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-haiku-4-5-20251001";
const PRICING = { input: 1.0, output: 5.0 };

function calcCost(inp, out) {
  return (inp * PRICING.input + out * PRICING.output) / 1_000_000;
}

// Faqat xavfli narsalar bloklanadi — qolgani AI o'zi hal qiladi
const BLOCKED = [
  /siyosat|prezident|saylov/i, /din\b|islom|namoz/i,
  /parol|token|secret|api.?key/i, /o'ldir|zarar|qurol/i,
];
function isBlocked(t) { return BLOCKED.some((p) => p.test(t)); }

// ===== BARCHA MA'LUMOTLARNI YIGISH =====
async function collectAllData(restaurantId) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - 7);
  const kecha = new Date(today); kecha.setDate(kecha.getDate() - 1);

  const [todayOrders, monthOrders, employees, todayAtt, inventory, branches, totalUsers, admin] = await Promise.all([
    Order.find({ restaurantId, createdAt: { $gte: today } }).lean(),
    Order.find({ restaurantId, createdAt: { $gte: monthStart } }).lean(),
    Employee.find({ restaurantId, active: true }).select("name position salary workStart workEnd weeklyOff role phone").lean(),
    Attendance.find({ restaurantId, date: today.toISOString().split("T")[0] }).lean(),
    Inventory.find({ restaurantId, active: true }).lean(),
    Branch.find({ restaurantId, active: true }).lean(),
    User.countDocuments({ restaurantId }),
    Admin.findOne({ restaurantId, role: "admin" }).select("restaurantName phone address workStart workEnd").lean(),
  ]);

  const weekOrders = monthOrders.filter((o) => new Date(o.createdAt) >= weekStart);
  const kechaOrders = monthOrders.filter((o) => { const d = new Date(o.createdAt); return d >= kecha && d < today; });

  // Top mahsulotlar
  const itemMap = {};
  monthOrders.forEach((o) => (o.items || []).forEach((item) => {
    if (!itemMap[item.name]) itemMap[item.name] = { soni: 0, summa: 0 };
    itemMap[item.name].soni += item.quantity || 1;
    itemMap[item.name].summa += (item.price || 0) * (item.quantity || 1);
  }));
  const topProducts = Object.entries(itemMap).map(([nom, d]) => ({ nom, ...d })).sort((a, b) => b.soni - a.soni).slice(0, 15);

  // Kunlik trend
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const dn = new Date(d); dn.setDate(dn.getDate() + 1);
    const dayO = monthOrders.filter((o) => { const ct = new Date(o.createdAt); return ct >= d && ct < dn; });
    trend.push({ sana: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }), buyurtmalar: dayO.length, daromad: dayO.reduce((s, o) => s + (o.total || 0), 0) });
  }

  return {
    biznes: { nomi: admin?.restaurantName || restaurantId, telefon: admin?.phone || "—", manzil: admin?.address || "—" },
    bugun: { buyurtmalar: todayOrders.length, daromad: todayOrders.reduce((s, o) => s + (o.total || 0), 0), online: todayOrders.filter((o) => o.orderType === "online").length, restoranda: todayOrders.filter((o) => o.orderType === "dine_in").length },
    kecha: { buyurtmalar: kechaOrders.length, daromad: kechaOrders.reduce((s, o) => s + (o.total || 0), 0) },
    haftalik: { buyurtmalar: weekOrders.length, daromad: weekOrders.reduce((s, o) => s + (o.total || 0), 0) },
    oylik: { buyurtmalar: monthOrders.length, daromad: monthOrders.reduce((s, o) => s + (o.total || 0), 0) },
    kunlik_trend: trend,
    top_mahsulotlar: topProducts,
    xodimlar: employees.map((e) => {
      const att = todayAtt.find((a) => a.employeeId?.toString() === e._id.toString());
      return { ism: e.name, lavozim: e.position || "—", rol: e.role, maosh: e.salary || 0, bugungi_holat: att ? att.status : "ma'lumot yo'q", kechikish: att?.lateMinutes || 0 };
    }),
    ombor: inventory.map((i) => ({ nomi: i.productName, qoldiq: i.currentStock, birlik: i.unit, min: i.minStock, holat: i.currentStock <= 0 ? "TUGAGAN" : i.currentStock <= i.minStock ? "KAM" : "Yetarli" })),
    filiallar: branches.map((b) => ({ nomi: b.name, manzil: b.address || "—" })),
    mijozlar_soni: totalUsers,
  };
}

// ===== SYSTEM PROMPT =====
function buildPrompt(name, type) {
  const sana = new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  return `Sen "${name}" biznesining shaxsiy AI yordamchisisan. Nomining ServiX AI.
Biznes turi: ${type || "restoran"}. Bugungi sana: ${sana}.

Senga shu biznesning BARCHA ma'lumotlari beriladi. Sen shu ma'lumotlar asosida ISTALGAN savolga javob berasan.

VAZIFALARING:
- Sotuv, daromad, buyurtmalar statistikasi
- Xodimlar hisoboti — davomat, kechikish, maosh
- Ombor tahlili — qoldiq, kam qolganlar, tavsiyalar
- Moliyaviy tahlil — trend, o'sish, qiyoslash
- Kelajak prognozi — o'tgan datalar asosida
- Muammolarni aniqlash va maslahat berish
- Batafsil hisobotlar tayyorlash

QOIDALAR:
1. Foydalanuvchi qaysi tilda yozsa, shu tilda javob ber.
2. Pul: 1,250,000 so'm formatda.
3. Batafsil, professional javob ber. Jadval, ro'yxat ishlatib formatlash.
4. Ma'lumot yo'q bo'lsa — "Hozircha ma'lumot yo'q" de, o'ylab topma.
5. Prognoz — "taxminiy" deb belgilash.
6. Siyosat, din, dasturlash haqida GAPLASHMA.
7. PDF/Excel so'rasa — "Hisobotni tayyorladim. Pastdagi tugmadan yuklab oling" de va hisobotni matn shaklida yoz.
8. Javob oxirida: — ServiX AI | ${sana}`;
}

// ===== API CALL =====
async function askAI(restaurantId, adminId, adminUsername, question) {
  const startTime = Date.now();
  const admin = await Admin.findOne({ restaurantId, role: "admin" }).select("restaurantName businessType modules aiLimit");
  if (!admin) throw new Error("Biznes topilmadi");
  if (!admin.modules?.aiAgent) throw new Error("AI Agent moduli yoqilmagan");
  if (!config.anthropicApiKey) throw new Error("AI xizmati sozlanmagan");

  if (isBlocked(question)) {
    return { answer: "Bu savol mening vakolatimdan tashqarida. Men faqat sizning biznesingiz bo'yicha yordam beraman.\n\n— ServiX AI", inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, filtered: true };
  }

  const data = await collectAllData(restaurantId);
  const systemPrompt = buildPrompt(admin.restaurantName, admin.businessType);
  const userMessage = `Biznes ma'lumotlari:\n${JSON.stringify(data, null, 2)}\n\nSavol: ${question}`;

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
    logger.error("Anthropic API:", err.response?.status, JSON.stringify(err.response?.data || err.message));
    throw err;
  }

  const r = response.data;
  const answer = r.content?.[0]?.text || "Javob olib bo'lmadi";
  const inp = r.usage?.input_tokens || 0;
  const out = r.usage?.output_tokens || 0;
  return { answer, inputTokens: inp, outputTokens: out, totalTokens: inp + out, cost: calcCost(inp, out), model: AI_MODEL, responseTime: Date.now() - startTime, filtered: false };
}

module.exports = { askAI, isBlocked, collectAllData, calcCost, AI_MODEL };