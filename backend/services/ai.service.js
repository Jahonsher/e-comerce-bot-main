const config = require("../config");
const logger = require("../utils/logger");
const Order = require("../models/Order");
const User = require("../models/User");
const Admin = require("../models/Admin");
const { Employee, Attendance, Inventory, Branch } = require("../models");

// ===== ANTHROPIC API =====
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-haiku-4-5-20251001";

// Narxlar (1M token uchun USD)
const PRICING = { input: 1.0, output: 5.0 };

function calcCost(inputTokens, outputTokens) {
  return (inputTokens * PRICING.input + outputTokens * PRICING.output) / 1_000_000;
}

// ===== SAVOL FILTRATSIYA =====
const BLOCKED_PATTERNS = [
  /anekdot/i, /hazil/i, /she'r/i, /qo'shiq/i,
  /python|javascript|java|html|css|code|kod yoz/i,
  /siyosat|prezident|saylov/i, /din\b|islom|namoz/i,
  /boshqa restoran|raqib|konkurent/i,
  /parol|token|secret|api.?key/i,
  /o'ldir|zarar|xavfli/i,
];

function isBlockedQuestion(text) {
  return BLOCKED_PATTERNS.some((p) => p.test(text));
}

// ===== RESTORAN DATA YIGISH =====
async function collectRestaurantData(restaurantId, question) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);

  // Savolga qarab qaysi datalarni olish kerakligini aniqlash
  const needsOrders = /sotuv|buyurtma|daromad|pul|tushum|foyda|order|revenue|eng ko'p|top|mashxur|ommabop|hafta|bugun|oy|kecha/i.test(question);
  const needsEmployees = /ishchi|xodim|hodim|kechik|davomat|maosh|salary|keldi|kelmadi|ishla/i.test(question);
  const needsInventory = /ombor|mahsulot|stock|zaxira|tugay|kam qol|buyurtma qil|go'sht|un\b|yog'/i.test(question);
  const needsUsers = /foydalanuvchi|mijoz|user|client|odam/i.test(question);

  const data = {};

  // Asosiy statistika (har doim)
  const [todayOrders, monthOrders] = await Promise.all([
    Order.find({ restaurantId, createdAt: { $gte: today } }).lean(),
    Order.find({ restaurantId, createdAt: { $gte: monthStart } }).lean(),
  ]);

  data.bugun = {
    buyurtmalar: todayOrders.length,
    daromad: todayOrders.reduce((s, o) => s + (o.total || 0), 0),
    online: todayOrders.filter((o) => o.orderType === "online").length,
    restoranda: todayOrders.filter((o) => o.orderType === "dine_in").length,
  };

  data.oylik = {
    buyurtmalar: monthOrders.length,
    daromad: monthOrders.reduce((s, o) => s + (o.total || 0), 0),
  };

  if (needsOrders) {
    // Haftalik trend
    const weekOrders = monthOrders.filter((o) => new Date(o.createdAt) >= weekStart);
    data.haftalik = {
      buyurtmalar: weekOrders.length,
      daromad: weekOrders.reduce((s, o) => s + (o.total || 0), 0),
    };

    // Top mahsulotlar
    const itemMap = {};
    monthOrders.forEach((o) =>
      (o.items || []).forEach((item) => {
        if (!itemMap[item.name]) itemMap[item.name] = { soni: 0, summa: 0 };
        itemMap[item.name].soni += item.quantity || 1;
        itemMap[item.name].summa += (item.price || 0) * (item.quantity || 1);
      })
    );
    data.top_mahsulotlar = Object.entries(itemMap)
      .map(([nom, d]) => ({ nom, ...d }))
      .sort((a, b) => b.soni - a.soni)
      .slice(0, 10);

    // Kechagi sotuv
    const kecha = new Date(today);
    kecha.setDate(kecha.getDate() - 1);
    const kechaEnd = new Date(today);
    const kechaOrders = monthOrders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= kecha && d < kechaEnd;
    });
    data.kecha = {
      buyurtmalar: kechaOrders.length,
      daromad: kechaOrders.reduce((s, o) => s + (o.total || 0), 0),
    };
  }

  if (needsEmployees) {
    const [employees, todayAtt] = await Promise.all([
      Employee.find({ restaurantId, active: true }).select("name position salary workStart workEnd weeklyOff").lean(),
      Attendance.find({ restaurantId, date: today.toISOString().split("T")[0] }).lean(),
    ]);

    data.xodimlar = employees.map((e) => {
      const att = todayAtt.find((a) => a.employeeId?.toString() === e._id.toString());
      return {
        ism: e.name,
        lavozim: e.position || "—",
        maosh: e.salary || 0,
        bugun: att ? att.status : "ma'lumot yo'q",
        kechikish: att?.lateMinutes || 0,
      };
    });
  }

  if (needsInventory) {
    const items = await Inventory.find({ restaurantId, active: true }).lean();
    data.ombor = items.map((i) => ({
      nomi: i.productName,
      qoldiq: i.currentStock,
      birlik: i.unit,
      min: i.minStock,
      holat: i.currentStock <= 0 ? "TUGAGAN" : i.currentStock <= i.minStock ? "KAM" : "yetarli",
    }));
  }

  if (needsUsers) {
    data.foydalanuvchilar = {
      jami: await User.countDocuments({ restaurantId }),
    };
  }

  return data;
}

// ===== SYSTEM PROMPT BUILDER =====
function buildSystemPrompt(restaurantName, businessType) {
  return `Sen ServiX AI yordamchisisan — biznes boshqaruv platformasi.

BIZNES: ${restaurantName}
BIZNES TURI: ${businessType || "restoran"}
BUGUNGI SANA: ${new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}

QOIDALAR:
1. Faqat yuqoridagi biznes haqida ma'lumot ber. Boshqa biznes, restoran yoki tashkilot haqida GAPLASHMA.
2. Biznesga aloqasi bo'lmagan savolga javob BERMA. "Bu savol mening vakolatimdan tashqarida" de.
3. Siyosat, din, shaxsiy maslahat — javob BERMA.
4. Foydalanuvchi qaysi tilda yozsa, shu tilda javob ber (o'zbek, rus, ingliz).
5. Pul summasini har doim "so'm" bilan yoz va minglik ajratgich bilan formatlash: 1,250,000 so'm.
6. Javoblarni qisqa, aniq va professional ber.
7. Agar ma'lumot berilmagan bo'lsa yoki 0 bo'lsa, "Hozircha ma'lumot yo'q" de, o'ylab topma.
8. Kelajak prognozi so'ralsa, oxirgi ma'lumotlar asosida taxminiy raqam ber va "taxminiy" ekanligini yoz.
9. Javob oxirida ServiX ni eslatma — masalan "ServiX AI tahlili" yoki "ServiX yordamchisi".
10. Hisobot so'ralsa, jadval ko'rinishida chiroyli formatla.`;
}

// ===== ANTHROPIC API CALL =====
async function askAI(restaurantId, adminId, adminUsername, question) {
  const startTime = Date.now();

  // Admin va restoran ma'lumotlari
  const admin = await Admin.findOne({ restaurantId, role: "admin" }).select("restaurantName businessType modules aiLimit");
  if (!admin) throw new Error("Biznes topilmadi");
  if (!admin.modules?.aiAgent) throw new Error("AI Agent moduli yoqilmagan");

  // API key tekshirish
  if (!config.anthropicApiKey) throw new Error("AI xizmati sozlanmagan");

  // Savol filtratsiya
  if (isBlockedQuestion(question)) {
    return {
      answer: "Bu savol mening vakolatimdan tashqarida. Men faqat sizning biznesingiz statistikasi bo'yicha yordam bera olaman.\n\n— ServiX AI",
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      filtered: true,
    };
  }

  // Restoran datalarini yig'ish
  const data = await collectRestaurantData(restaurantId, question);

  // Prompt yaratish
  const systemPrompt = buildSystemPrompt(admin.restaurantName, admin.businessType);
  const userMessage = `Ma'lumotlar:\n${JSON.stringify(data, null, 2)}\n\nSavol: ${question}`;

  // Anthropic API
  const axios = require("axios");
  let response;
  try {
    response = await axios.post(
      ANTHROPIC_API,
      {
        model: AI_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      },
      {
        headers: {
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 30000,
      }
    );
  } catch (apiErr) {
    logger.error("Anthropic API error:", apiErr.response?.status, JSON.stringify(apiErr.response?.data || apiErr.message));
    throw apiErr;
  }

  const result = response.data;
  const answer = result.content?.[0]?.text || "Javob olib bo'lmadi";
  const inputTokens = result.usage?.input_tokens || 0;
  const outputTokens = result.usage?.output_tokens || 0;
  const cost = calcCost(inputTokens, outputTokens);
  const responseTime = Date.now() - startTime;

  return {
    answer,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    model: AI_MODEL,
    responseTime,
    filtered: false,
  };
}

module.exports = {
  askAI,
  isBlockedQuestion,
  collectRestaurantData,
  calcCost,
  AI_MODEL,
};