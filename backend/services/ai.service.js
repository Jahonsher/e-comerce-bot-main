var config = require("../config");
var logger = require("../utils/logger");
var Order = require("../models/Order");
var User = require("../models/User");
var Admin = require("../models/Admin");
var Product = require("../models/Product");
var Category = require("../models/Category");
var models = require("../models");
var Employee = models.Employee;
var Attendance = models.Attendance;
var Inventory = models.Inventory;
var Branch = models.Branch;
var Shot = models.Shot;

var ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
var AI_MODEL = "claude-haiku-4-5-20251001";
var PRICING_IN = 1.0;
var PRICING_OUT = 5.0;

function calcCost(inp, out) {
  return (inp * PRICING_IN + out * PRICING_OUT) / 1000000;
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

// ===== BARCHA DATA — admin panel bilan BIR XIL =====
async function collectAllData(restaurantId) {
  logger.info("AI: data yigish boshlandi [" + restaurantId + "]");

  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  var prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // ===== DB dan BARCHA datani olish =====
  var allOrders = [];
  var allProducts2 = [];
  var allCategories2 = [];
  var allEmployees = [];
  var allAttendance = [];
  var allInventory = [];
  var allBranches = [];
  var userCount = 0;
  var adminDoc = null;
  var allShots = [];

  try { allOrders = await Order.find({ restaurantId: restaurantId, createdAt: { $gte: prevMonthStart } }).lean(); } catch(e) { logger.error("AI orders err: " + e.message); }
  try { allProducts2 = await Product.find({ restaurantId: restaurantId }).lean(); } catch(e) { logger.error("AI products err: " + e.message); }
  try { allCategories2 = await Category.find({ restaurantId: restaurantId }).lean(); } catch(e) { logger.error("AI cats err: " + e.message); }
  try { allEmployees = await Employee.find({ restaurantId: restaurantId, active: true }).select("-password -faceDescriptor -photo").lean(); } catch(e) { logger.error("AI emps err: " + e.message); }
  try { allAttendance = await Attendance.find({ restaurantId: restaurantId, date: { $regex: "^" + now.toISOString().slice(0, 7) } }).lean(); } catch(e) { logger.error("AI att err: " + e.message); }
  try { allInventory = await Inventory.find({ restaurantId: restaurantId, active: true }).lean(); } catch(e) { logger.error("AI inv err: " + e.message); }
  try { allBranches = await Branch.find({ restaurantId: restaurantId, active: true }).lean(); } catch(e) { logger.error("AI branch err: " + e.message); }
  try { userCount = await User.countDocuments({ restaurantId: restaurantId }); } catch(e) { logger.error("AI users err: " + e.message); }
  try { adminDoc = await Admin.findOne({ restaurantId: restaurantId, role: "admin" }).select("restaurantName phone address workStart workEnd subscriptionEnd").lean(); } catch(e) { logger.error("AI admin err: " + e.message); }
  try { allShots = await Shot.find({ restaurantId: restaurantId, status: "open" }).lean(); } catch(e) { logger.error("AI shots err: " + e.message); }

  logger.info("AI DATA [" + restaurantId + "]: orders=" + allOrders.length + " products=" + allProducts2.length + " cats=" + allCategories2.length + " emps=" + allEmployees.length + " att=" + allAttendance.length + " inv=" + allInventory.length + " users=" + userCount);

  // ===== BUYURTMALAR — har bir kun uchun alohida =====
  var monthOrders = allOrders.filter(function(o) { return new Date(o.createdAt) >= monthStart; });
  var prevMonthOrders = allOrders.filter(function(o) { return new Date(o.createdAt) < monthStart; });

  // Kunlik breakdown — SHU OYNING BARCHA KUNLARI
  var kunlikHisobot = [];
  var kunSoni = now.getDate();
  for (var i = 0; i < kunSoni; i++) {
    var kun = new Date(monthStart);
    kun.setDate(kun.getDate() + i);
    var kunEnd = new Date(kun);
    kunEnd.setDate(kunEnd.getDate() + 1);
    var kunOrders = monthOrders.filter(function(o) { var d = new Date(o.createdAt); return d >= kun && d < kunEnd; });
    var kunDaromad = kunOrders.reduce(function(s, o) { return s + (o.total || 0); }, 0);

    // Shu kundagi mahsulotlar
    var kunMahsulot = {};
    kunOrders.forEach(function(o) {
      (o.items || []).forEach(function(item) {
        var key = item.name || "?";
        if (!kunMahsulot[key]) kunMahsulot[key] = { soni: 0, summa: 0 };
        kunMahsulot[key].soni += item.quantity || 1;
        kunMahsulot[key].summa += (item.price || 0) * (item.quantity || 1);
      });
    });
    var kunMahsulotList = [];
    for (var k in kunMahsulot) {
      kunMahsulotList.push({ nom: k, soni: kunMahsulot[k].soni, summa: kunMahsulot[k].summa });
    }
    kunMahsulotList.sort(function(a, b) { return b.soni - a.soni; });

    kunlikHisobot.push({
      sana: kun.toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" }),
      sana_qisqa: kun.getDate() + "-" + (kun.toLocaleDateString("uz-UZ", { month: "short" })),
      hafta_kuni: kun.toLocaleDateString("uz-UZ", { weekday: "long" }),
      buyurtmalar: kunOrders.length,
      daromad: kunDaromad,
      online: kunOrders.filter(function(o) { return o.orderType === "online"; }).length,
      restoranda: kunOrders.filter(function(o) { return o.orderType === "dine_in"; }).length,
      mahsulotlar: kunMahsulotList,
    });
  }

  // Oylik TOP mahsulotlar
  var oylikMahsulot = {};
  monthOrders.forEach(function(o) {
    (o.items || []).forEach(function(item) {
      var key = item.name || "?";
      if (!oylikMahsulot[key]) oylikMahsulot[key] = { soni: 0, summa: 0 };
      oylikMahsulot[key].soni += item.quantity || 1;
      oylikMahsulot[key].summa += (item.price || 0) * (item.quantity || 1);
    });
  });
  var topMahsulotlar = [];
  for (var m in oylikMahsulot) {
    topMahsulotlar.push({ nom: m, soni: oylikMahsulot[m].soni, summa: oylikMahsulot[m].summa });
  }
  topMahsulotlar.sort(function(a, b) { return b.soni - a.soni; });

  // Daromadlar
  var todayOrders = monthOrders.filter(function(o) { return new Date(o.createdAt) >= today; });
  var todayDaromad = todayOrders.reduce(function(s, o) { return s + (o.total || 0); }, 0);
  var oylikDaromad = monthOrders.reduce(function(s, o) { return s + (o.total || 0); }, 0);
  var otganOyDaromad = prevMonthOrders.reduce(function(s, o) { return s + (o.total || 0); }, 0);

  // Xodimlar + davomat
  var xodimlar = allEmployees.map(function(e) {
    var oylikAtt = allAttendance.filter(function(a) { return a.employeeId && a.employeeId.toString() === e._id.toString(); });
    var bugunAtt = oylikAtt.find(function(a) { return a.date === today.toISOString().split("T")[0]; });
    return {
      ism: e.name,
      lavozim: e.position || "-",
      rol: e.role,
      maosh: e.salary || 0,
      ish_vaqti: (e.workStart || "09:00") + "-" + (e.workEnd || "18:00"),
      bugun: bugunAtt ? bugunAtt.status : "malumot yoq",
      bugun_kechikish: bugunAtt ? (bugunAtt.lateMinutes || 0) : 0,
      oylik_kelgan: oylikAtt.filter(function(a) { return a.status === "keldi"; }).length,
      oylik_kechikish: oylikAtt.filter(function(a) { return a.lateMinutes > 0; }).length,
    };
  });

  // Ombor
  var ombor = allInventory.map(function(item) {
    return {
      nomi: item.productName,
      qoldiq: item.currentStock,
      birlik: item.unit,
      min: item.minStock,
      holat: item.currentStock <= 0 ? "TUGAGAN" : item.currentStock <= item.minStock ? "KAM" : "OK",
    };
  });

  // Menyu
  var menyuTaomlar = allProducts2.map(function(p) {
    return { nomi: p.name, narxi: p.price || 0, kategoriya: p.category || "-", faol: p.active !== false };
  });

  return {
    biznes_nomi: adminDoc ? adminDoc.restaurantName : restaurantId,
    sana: now.toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric", weekday: "long" }),

    bugungi_buyurtmalar: todayOrders.length,
    bugungi_daromad: todayDaromad,
    oylik_buyurtmalar: monthOrders.length,
    oylik_daromad: oylikDaromad,
    otgan_oy_daromad: otganOyDaromad,
    osish_foiz: otganOyDaromad > 0 ? Math.round(((oylikDaromad - otganOyDaromad) / otganOyDaromad) * 100) : 0,
    ortacha_chek: monthOrders.length > 0 ? Math.round(oylikDaromad / monthOrders.length) : 0,
    ochiq_shotlar: allShots.length,

    kunlik_hisobot: kunlikHisobot,
    top_mahsulotlar: topMahsulotlar,

    menyu_jami: allProducts2.length,
    menyu_taomlar: menyuTaomlar,
    kategoriyalar: allCategories2.map(function(c) { return c.name; }),

    xodimlar: xodimlar,
    xodimlar_soni: allEmployees.length,
    jami_maosh: allEmployees.reduce(function(s, e) { return s + (e.salary || 0); }, 0),

    ombor: ombor,
    ombor_tugagan: ombor.filter(function(o) { return o.holat === "TUGAGAN"; }).length,
    ombor_kam: ombor.filter(function(o) { return o.holat === "KAM"; }).length,

    mijozlar_soni: userCount,
    filiallar: allBranches.map(function(b) { return b.name; }),
  };
}

// ===== SYSTEM PROMPT =====
function buildPrompt(name) {
  var sana = new Date().toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" });
  return 'Sen "' + name + '" biznesining buxgalteri va tahlilchisisisan. Nominging ServiX AI.\n\n' +
    'Senga shu biznesning BARCHA malumotlari beriladi: kunlik buyurtmalar (har bir kun alohida), menyu, xodimlar, ombor, mijozlar.\n' +
    'kunlik_hisobot ichida OYNING HAR BIR KUNI uchun: buyurtmalar soni, daromad, qaysi mahsulot nechta sotilgani bor.\n\n' +
    'QOIDALAR:\n' +
    '1. Foydalanuvchi nima sorasa FAQAT SHUNI javob ber. "5-aprel" desa kunlik_hisobot dan 5-aprelni top va FAQAT shuni kursat.\n' +
    '2. Ortiqcha malumot QUSHMA.\n' +
    '3. Har bir javob oxirida 1-2 qator MASLAHAT ber.\n' +
    '4. Jadval ishlatish — markdown table.\n' +
    '5. Pul: 1,250,000 som.\n' +
    '6. Malumot 0 bolsa — aniq "0 ta buyurtma, 0 som daromad" deb yoz. "Malumot yoq" DEMA agar raqam 0 bolsa.\n' +
    '7. Foydalanuvchi tilida javob ber.\n' +
    '8. Siyosat, din, dasturlash haqida GAPLASHMA.\n' +
    '9. Javob oxiri: — ServiX AI | ' + sana;
}

// ===== API CALL =====
async function askAI(restaurantId, adminId, adminUsername, question) {
  var startTime = Date.now();

  var admin = await Admin.findOne({ restaurantId: restaurantId, role: "admin" }).select("restaurantName businessType modules aiLimit");
  if (!admin) throw new Error("Biznes topilmadi");
  if (!admin.modules || !admin.modules.aiAgent) throw new Error("AI Agent moduli yoqilmagan");
  if (!config.anthropicApiKey) throw new Error("AI xizmati sozlanmagan");

  if (isBlocked(question)) {
    return { answer: "Bu savol mening vakolatimdan tashqarida.\n\n— ServiX AI", inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, filtered: true };
  }

  var data = await collectAllData(restaurantId);
  var systemPrompt = buildPrompt(admin.restaurantName);
  var userMessage = "BIZNES MALUMOTLARI:\n" + JSON.stringify(data, null, 2) + "\n\nSAVOL: " + question;

  logger.info("AI -> Anthropic [" + restaurantId + "]: " + question.substring(0, 80));

  var axios = require("axios");
  var response;
  try {
    response = await axios.post(ANTHROPIC_API, {
      model: AI_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }, {
      headers: { "x-api-key": config.anthropicApiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      timeout: 60000,
    });
  } catch (err) {
    var errData = err.response ? (err.response.status + " " + JSON.stringify(err.response.data)) : err.message;
    logger.error("Anthropic API error: " + errData);
    throw err;
  }

  var r = response.data;
  var answer = (r.content && r.content[0] && r.content[0].text) ? r.content[0].text : "Javob olib bolmadi";
  var inp = (r.usage && r.usage.input_tokens) ? r.usage.input_tokens : 0;
  var out = (r.usage && r.usage.output_tokens) ? r.usage.output_tokens : 0;

  logger.info("AI OK [" + restaurantId + "]: tokens=" + (inp + out) + " time=" + (Date.now() - startTime) + "ms");

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

async function collectExportData(restaurantId) {
  return await collectAllData(restaurantId);
}

module.exports = {
  askAI: askAI,
  isBlocked: isBlocked,
  collectAllData: collectAllData,
  collectExportData: collectExportData,
  calcCost: calcCost,
  AI_MODEL: AI_MODEL,
};