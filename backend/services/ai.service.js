/**
 * ServiX AI Service
 * 
 * MUHIM: Bu service admin routes dagi stats/fast va analytics/advanced
 * endpointlari bilan AYNAN BIR XIL querylarni ishlatadi.
 * Agar Dashboard da data ko'rinsa — AI da ham ko'rinadi.
 */

var config = require("../config");
var logger = require("../utils/logger");

// ===== MODEL IMPORTS — admin.routes.js dagi bilan bir xil =====
var Order = require("../models/Order");
var User = require("../models/User");
var Admin = require("../models/Admin");
var Product = require("../models/Product");
var Category = require("../models/Category");
var models = require("../models/index");

var ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
var AI_MODEL = "claude-haiku-4-5-20251001";

function calcCost(inp, out) {
  return (inp * 1.0 + out * 5.0) / 1000000;
}

var BLOCKED = [
  /siyosat|prezident|saylov/i, /din\b|islom|namoz/i,
  /parol|token|secret|api.?key/i, /o'ldir|zarar|qurol/i,
];
function isBlocked(t) {
  for (var i = 0; i < BLOCKED.length; i++) {
    if (BLOCKED[i].test(t)) return true;
  }
  return false;
}

/**
 * BARCHA DATA YIGISH
 * admin.routes.js dagi stats/fast + analytics/advanced + orders + products
 * endpointlari bilan BIR XIL query. 
 * Agar Dashboard da ko'rinsa — bu yerda ham ko'rinadi.
 */
async function collectAllData(rId) {
  logger.info("[AI] collectAllData: " + rId);

  var now = new Date();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var month = new Date(today.getFullYear(), today.getMonth(), 1);
  var prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  // ===== stats/fast bilan BIR XIL query =====
  var todayOrders, monthOrders, ratedOrders, totalUsers, recentOrders;
  try {
    var r = await Promise.all([
      Order.find({ restaurantId: rId, createdAt: { $gte: today } }).lean(),
      Order.find({ restaurantId: rId, createdAt: { $gte: month } }).lean(),
      Order.find({ restaurantId: rId, rating: { $ne: null } }).select("rating").lean(),
      User.countDocuments({ restaurantId: rId }),
      Order.find({ restaurantId: rId }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    todayOrders = r[0];
    monthOrders = r[1];
    ratedOrders = r[2];
    totalUsers = r[3];
    recentOrders = r[4];
  } catch (e) {
    logger.error("[AI] orders query error: " + e.message);
    todayOrders = []; monthOrders = []; ratedOrders = []; totalUsers = 0; recentOrders = [];
  }

  // O'tgan oy buyurtmalari
  var prevMonthOrders = [];
  try {
    prevMonthOrders = await Order.find({ restaurantId: rId, createdAt: { $gte: prevMonth, $lt: month } }).lean();
  } catch (e) { logger.error("[AI] prevMonth err: " + e.message); }

  // Menyu — Product va Category
  var products = [];
  var categories = [];
  try {
    products = await Product.find({ restaurantId: rId }).lean();
    categories = await Category.find({ restaurantId: rId }).lean();
  } catch (e) { logger.error("[AI] products/cats err: " + e.message); }

  // Xodimlar va davomat
  var employees = [];
  var todayAtt = [];
  var monthAtt = [];
  try {
    employees = await models.Employee.find({ restaurantId: rId, active: true })
      .select("name position salary workStart workEnd weeklyOff role").lean();
  } catch (e) { logger.error("[AI] employees err: " + e.message); }
  try {
    todayAtt = await models.Attendance.find({ restaurantId: rId, date: today.toISOString().split("T")[0] }).lean();
  } catch (e) { logger.error("[AI] todayAtt err: " + e.message); }
  try {
    monthAtt = await models.Attendance.find({ restaurantId: rId, date: { $regex: "^" + now.toISOString().slice(0, 7) } }).lean();
  } catch (e) { logger.error("[AI] monthAtt err: " + e.message); }

  // Ombor
  var inventory = [];
  try {
    inventory = await models.Inventory.find({ restaurantId: rId, active: true }).lean();
  } catch (e) { logger.error("[AI] inventory err: " + e.message); }

  // Filiallar
  var branches = [];
  try {
    branches = await models.Branch.find({ restaurantId: rId, active: true }).lean();
  } catch (e) { logger.error("[AI] branches err: " + e.message); }

  // Admin info
  var adminDoc = null;
  try {
    adminDoc = await Admin.findOne({ restaurantId: rId, role: "admin" })
      .select("restaurantName phone address workStart workEnd").lean();
  } catch (e) { logger.error("[AI] admin err: " + e.message); }

  logger.info("[AI] DATA: orders_today=" + todayOrders.length +
    " orders_month=" + monthOrders.length +
    " products=" + products.length +
    " cats=" + categories.length +
    " emps=" + employees.length +
    " inv=" + inventory.length +
    " users=" + totalUsers);

  // ===== HISOBLASHLAR — stats/fast bilan bir xil =====

  // Haftalik trend (stats/fast bilan aynan bir xil)
  var weeklyData = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var dn = new Date(d);
    dn.setDate(dn.getDate() + 1);
    var dayOrders = monthOrders.filter(function (o) {
      var ct = new Date(o.createdAt);
      return ct >= d && ct < dn;
    });
    weeklyData.push({
      sana: d.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" }),
      hafta_kuni: d.toLocaleDateString("uz-UZ", { weekday: "long" }),
      buyurtmalar: dayOrders.length,
      daromad: dayOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0),
    });
  }

  // Oyning HAR BIR KUNI (buxgalter uchun)
  var kunlikHisobot = [];
  var kunSoni = now.getDate();
  for (var j = 0; j < kunSoni; j++) {
    var kun = new Date(month);
    kun.setDate(kun.getDate() + j);
    var kunEnd = new Date(kun);
    kunEnd.setDate(kunEnd.getDate() + 1);
    var kunOrders = monthOrders.filter(function (o) {
      var ct = new Date(o.createdAt);
      return ct >= kun && ct < kunEnd;
    });
    var kunDaromad = kunOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0);

    // Shu kundagi mahsulotlar
    var kunItems = {};
    kunOrders.forEach(function (o) {
      (o.items || []).forEach(function (item) {
        var key = item.name || "?";
        if (!kunItems[key]) kunItems[key] = { soni: 0, summa: 0 };
        kunItems[key].soni += item.quantity || 1;
        kunItems[key].summa += (item.price || 0) * (item.quantity || 1);
      });
    });
    var kunItemsList = [];
    for (var key in kunItems) {
      kunItemsList.push({ nom: key, soni: kunItems[key].soni, summa: kunItems[key].summa });
    }
    kunItemsList.sort(function (a, b) { return b.soni - a.soni; });

    kunlikHisobot.push({
      sana: kun.getDate() + "-aprel",
      buyurtmalar: kunOrders.length,
      daromad: kunDaromad,
      mahsulotlar: kunItemsList,
    });
  }

  // Top mahsulotlar (stats/fast bilan bir xil)
  var itemMap = {};
  monthOrders.forEach(function (o) {
    (o.items || []).forEach(function (item) {
      if (!itemMap[item.name]) itemMap[item.name] = { soni: 0, summa: 0 };
      itemMap[item.name].soni += item.quantity || 1;
      itemMap[item.name].summa += (item.price || 0) * (item.quantity || 1);
    });
  });
  var topMahsulotlar = [];
  for (var tm in itemMap) {
    topMahsulotlar.push({ nom: tm, soni: itemMap[tm].soni, summa: itemMap[tm].summa });
  }
  topMahsulotlar.sort(function (a, b) { return b.soni - a.soni; });

  // Daromadlar
  var todayRev = todayOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var monthRev = monthOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var prevRev = prevMonthOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0);

  // Xodimlar + davomat
  var xodimlarList = employees.map(function (e) {
    var ba = todayAtt.find(function (a) { return a.employeeId && a.employeeId.toString() === e._id.toString(); });
    var ma = monthAtt.filter(function (a) { return a.employeeId && a.employeeId.toString() === e._id.toString(); });
    return {
      ism: e.name,
      lavozim: e.position || "-",
      maosh: e.salary || 0,
      bugun: ba ? ba.status : "kelgan emas",
      bugun_kechikish: ba ? (ba.lateMinutes || 0) : 0,
      oylik_kelgan_kun: ma.filter(function (a) { return a.status === "keldi"; }).length,
      oylik_kechikishlar: ma.filter(function (a) { return (a.lateMinutes || 0) > 0; }).length,
    };
  });

  // Ombor
  var omborList = inventory.map(function (it) {
    return {
      nomi: it.productName,
      qoldiq: it.currentStock,
      birlik: it.unit,
      min: it.minStock,
      holat: it.currentStock <= 0 ? "TUGAGAN" : it.currentStock <= it.minStock ? "KAM" : "OK",
    };
  });

  // Menyu
  var menyuList = products.map(function (p) {
    return { nomi: p.name, narxi: p.price || 0, kategoriya: p.category || "-" };
  });

  // Rating
  var avgRating = ratedOrders.length > 0
    ? (ratedOrders.reduce(function (s, o) { return s + o.rating; }, 0) / ratedOrders.length).toFixed(1)
    : null;

  return {
    biznes: adminDoc ? adminDoc.restaurantName : rId,
    sana: now.toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric", weekday: "long" }),

    bugun_buyurtmalar: todayOrders.length,
    bugun_daromad: todayRev,
    bugun_online: todayOrders.filter(function (o) { return o.orderType === "online"; }).length,
    bugun_restoranda: todayOrders.filter(function (o) { return o.orderType === "dine_in"; }).length,

    oylik_buyurtmalar: monthOrders.length,
    oylik_daromad: monthRev,
    otgan_oy_daromad: prevRev,
    osish: prevRev > 0 ? Math.round(((monthRev - prevRev) / prevRev) * 100) + "%" : "birinchi oy",
    ortacha_chek: monthOrders.length > 0 ? Math.round(monthRev / monthOrders.length) : 0,

    reyting: avgRating,
    reyting_soni: ratedOrders.length,
    mijozlar: totalUsers,

    haftalik_trend: weeklyData,
    kunlik_hisobot: kunlikHisobot,
    top_mahsulotlar: topMahsulotlar,

    menyu_soni: products.length,
    menyu: menyuList,
    kategoriyalar: categories.map(function (c) { return c.name; }),

    xodimlar: xodimlarList,
    xodimlar_soni: employees.length,
    jami_maosh_fond: employees.reduce(function (s, e) { return s + (e.salary || 0); }, 0),

    ombor: omborList,
    ombor_kam: omborList.filter(function (o) { return o.holat === "KAM" || o.holat === "TUGAGAN"; }).length,

    filiallar: branches.map(function (b) { return b.name; }),
  };
}

// ===== SYSTEM PROMPT =====
function buildPrompt(name) {
  var sana = new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" });
  return 'Sen "' + name + '" biznesining buxgalterisan. Noming ServiX AI.\n\n' +
    'Senga shu biznesning BARCHA malumotlari berilgan:\n' +
    '- bugun_buyurtmalar, bugun_daromad — bugungi\n' +
    '- oylik_buyurtmalar, oylik_daromad — shu oy\n' +
    '- kunlik_hisobot — OYNING HAR BIR KUNI alohida: buyurtmalar, daromad, qaysi mahsulot nechta sotilgan\n' +
    '- top_mahsulotlar — eng kop sotilgan mahsulotlar\n' +
    '- menyu — barcha taomlar royxati va narxi\n' +
    '- xodimlar — ism, lavozim, maosh, davomat\n' +
    '- ombor — qoldiq, holat\n' +
    '- reyting, mijozlar soni\n\n' +
    'QOIDALAR:\n' +
    '1. Faqat soralganni javob ber. "5-aprel" desa — kunlik_hisobot dan 5-aprelni top.\n' +
    '2. Ortiqcha malumot qushma.\n' +
    '3. Har javob oxirida 1 qator MASLAHAT ber.\n' +
    '4. Jadval — markdown table ishlatish.\n' +
    '5. Pul: 1,250,000 som.\n' +
    '6. Raqam 0 bolsa — "0 ta buyurtma, 0 som" yoz, "malumot yoq" dema.\n' +
    '7. Foydalanuvchi tilida javob ber.\n' +
    '8. Siyosat, din, kod yozish haqida gapirma.\n' +
    '9. Javob oxiri: — ServiX AI | ' + sana;
}

// ===== API CALL =====
async function askAI(restaurantId, adminId, adminUsername, question) {
  var startTime = Date.now();

  var admin = await Admin.findOne({ restaurantId: restaurantId, role: "admin" })
    .select("restaurantName businessType modules aiLimit");
  if (!admin) throw new Error("Biznes topilmadi");
  if (!admin.modules || !admin.modules.aiAgent) throw new Error("AI Agent moduli yoqilmagan");
  if (!config.anthropicApiKey) throw new Error("AI xizmati sozlanmagan");

  if (isBlocked(question)) {
    return {
      answer: "Bu savol mening vakolatimdan tashqarida.\n\n— ServiX AI",
      inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, filtered: true
    };
  }

  var data = await collectAllData(restaurantId);
  var systemPrompt = buildPrompt(admin.restaurantName);
  var userMessage = "MALUMOTLAR:\n" + JSON.stringify(data, null, 2) + "\n\nSAVOL: " + question;

  logger.info("[AI] -> Anthropic: " + restaurantId + " | " + question.substring(0, 60));

  var axios = require("axios");
  var response;
  try {
    response = await axios.post(ANTHROPIC_API, {
      model: AI_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }, {
      headers: {
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      timeout: 60000,
    });
  } catch (err) {
    var ed = err.response ? (err.response.status + " " + JSON.stringify(err.response.data)) : err.message;
    logger.error("[AI] Anthropic error: " + ed);
    throw err;
  }

  var result = response.data;
  var answer = (result.content && result.content[0]) ? result.content[0].text : "Javob olib bolmadi";
  var inp = result.usage ? result.usage.input_tokens : 0;
  var out = result.usage ? result.usage.output_tokens : 0;

  logger.info("[AI] OK: tokens=" + (inp + out) + " cost=$" + calcCost(inp, out).toFixed(5) + " time=" + (Date.now() - startTime) + "ms");

  return {
    answer: answer,
    inputTokens: inp,
    outputTokens: out,
    totalTokens: inp + out,
    cost: calcCost(inp, out),
    model: AI_MODEL,
    responseTime: Date.now() - startTime,
    filtered: false,
  };
}

async function collectExportData(rId) {
  return await collectAllData(rId);
}

module.exports = {
  askAI: askAI,
  isBlocked: isBlocked,
  collectAllData: collectAllData,
  collectExportData: collectExportData,
  calcCost: calcCost,
  AI_MODEL: AI_MODEL,
};