// API URL va Restaurant config - index.html da window.__CONFIG__ orqali beriladi
var _cfg = window.__CONFIG__ || {};
var API  = _cfg.API_URL || (window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://e-comerce-bot-main-production.up.railway.app');

var token     = localStorage.getItem('adminToken');
var adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
var weeklyChart = null;
var typeChart   = null;
var currentOrderFilter = 'all';
var dragSrc = null;

// ===== TIL TIZIMI — lang.js dan yuklangan =====
// LANGS, t(), setLang(), getLang() — /static/lang.js da aniqlangan
// Fallback — agar lang.js yuklanmagan bo'lsa
if (typeof t !== 'function') {
  var _lang = 'uz';
  function t(key) { return key; }
  function setLang() {}
}

// ===== AUTH =====
async function doLogin() {
  var username = document.getElementById('loginUser').value.trim();
  var password = document.getElementById('loginPass').value;
  var errEl    = document.getElementById('loginErr');
  var btn      = document.getElementById('loginBtn');

  errEl.textContent = '';
  errEl.style.display = 'none';

  if (!username && !password) { showErr(errEl, '⚠️ Login va parolni kiriting'); return; }
  if (!username) { showErr(errEl, '⚠️ Login kiritilmagan'); return; }
  if (!password) { showErr(errEl, '⚠️ Parol kiritilmagan'); return; }

  btn.textContent = 'Tekshirilmoqda...';
  btn.disabled = true;

  try {
    var r = await fetch(API + '/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    var d = await r.json();
    if (!d.ok) {
      if (d.blocked || d.error === 'BLOCKED' || d.error === 'SUBSCRIPTION_EXPIRED') {
        showBlockedScreen(d.message || "Xizmat vaqtincha to'xtatilgan");
      } else {
        showErr(errEl, "❌ Login yoki parol noto'g'ri");
        document.getElementById('loginPass').value = '';
        document.getElementById('loginPass').focus();
      }
      btn.textContent = 'Kirish';
      btn.disabled = false;
      return;
    }
    btn.textContent = '✓ Kirish...';
    token     = d.token;
    adminInfo = d.admin;
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminInfo', JSON.stringify(adminInfo));
    startApp();
  } catch(e) {
    showErr(errEl, '🔌 Server bilan ulanib bolmadi. Internet aloqasini tekshiring.');
    btn.textContent = 'Kirish';
    btn.disabled = false;
  }
}

function showErr(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
  el.style.animation = 'none';
  setTimeout(function() { el.style.animation = 'shake .3s ease'; }, 10);
}

function doLogout() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminInfo');
  token = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('loginPage').style.display = 'flex';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

async function apiFetch(url, opts) {
  opts = opts || {};
  try {
    var r = await fetch(API + url, {
      method:  opts.method || 'GET',
      headers: authHeaders(),
      body:    opts.body || undefined
    });
    if (r.status === 401) { doLogout(); return { error: 'Sessiya tugadi' }; }
    if (r.status === 403) {
      var errData = await r.json();
      if (errData.blocked) { showBlockedScreen(errData.message || "Xizmat to'xtatilgan"); return errData; }
      return errData;
    }
    var data = await r.json();
    return data;
  } catch(e) {
    console.error('apiFetch error:', url, e.message);
    return { error: e.message };
  }
}

// ===== BLOCKED SCREEN =====
function showBlockedScreen(reason) {
  ['loginPage'].forEach(function(id) {
    var e = document.getElementById(id);
    if (e) e.style.display = 'none';
  });
  var app = document.getElementById('app');
  if (app) { app.classList.add('hidden'); app.style.display = 'none'; }
  var old = document.getElementById('blockedScreen');
  if (old) old.remove();
  var el = document.createElement('div');
  el.id = 'blockedScreen';
  el.style.cssText = 'position:fixed;inset:0;background:#0a0f1e;display:flex;align-items:center;justify-content:center;z-index:99999;padding:24px';
  el.innerHTML =
    '<div style="max-width:440px;width:100%;text-align:center">' +
      '<div style="font-size:72px;margin-bottom:20px">🔒</div>' +
      '<div style="font-size:24px;font-weight:800;color:#f1f5f9;margin-bottom:8px">Xizmat to\'xtatilgan</div>' +
      '<div style="font-size:14px;color:#64748b;margin-bottom:24px">Ushbu restoran vaqtincha bloklangan</div>' +
      '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:14px;padding:20px;margin-bottom:24px">' +
        '<div style="font-size:13px;color:#fca5a5;line-height:1.8">' + (reason || "Obuna to\'xtatilgan") + '</div>' +
      '</div>' +
      '<div style="background:#141d2e;border:1px solid rgba(6,182,212,0.15);border-radius:12px;padding:16px">' +
        '<div style="font-size:12px;color:#64748b;margin-bottom:4px">Xizmatni tiklash uchun:</div>' +
        '<div style="font-size:13px;color:#93c5fd;font-weight:600">Superadmin bilan bog\'laning</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
}

// ===== START =====
function startApp() {
  var rId = adminInfo.restaurantId || 'imperial';
  if (adminInfo.role !== 'superadmin') {
    fetch(API + '/check-block/' + rId)
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.blocked) { showBlockedScreen(d.reason); return; }
        _startApp();
      })
      .catch(function(){ _startApp(); });
  } else {
    _startApp();
  }
}

function _startApp() {
  document.getElementById('loginPage').style.display = 'none';
  var app = document.getElementById('app');
  app.classList.remove('hidden');
  app.style.display = '';
  document.getElementById('sidebarRestName').textContent = adminInfo.restaurantName || 'Restoran';
  document.getElementById('adminUsername').textContent   = '@' + (adminInfo.username || '');

  // Tilni yuklash (faqat sidebar — sahifani qayta yuklamasdan)
  var uzBtn = document.getElementById('langUz');
  var ruBtn = document.getElementById('langRu');
  if (uzBtn && ruBtn) {
    uzBtn.style.background = _lang === 'uz' ? 'rgba(6,182,212,0.15)' : 'transparent';
    uzBtn.style.color = _lang === 'uz' ? '#22d3ee' : '#64748b';
    ruBtn.style.background = _lang === 'ru' ? 'rgba(6,182,212,0.15)' : 'transparent';
    ruBtn.style.color = _lang === 'ru' ? '#22d3ee' : '#64748b';
  }
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var val = t(key);
    if (val !== key) el.textContent = val;
  });

  // ===== MODULLAR — serverdan yangi holat olish =====
  apiFetch('/admin/me').then(function(d) {
    if (d && d.ok && d.admin) {
      adminInfo.modules = d.admin.modules || {};
      localStorage.setItem('adminInfo', JSON.stringify(adminInfo));
    }
    filterSidebar();
  }).catch(function() { filterSidebar(); });

  showPage('dashboard');
  startNotifPolling();
}

function filterSidebar() {
  var mods = adminInfo.modules || {};
  var map = {
    orders:'orders', products:'menu', categories:'categories',
    ratings:'ratings', users:'users', branches:'branches',
    employees:'employees', attendance:'attendance', empReport:'empReport',
    notifications:'notifications', inventory:'inventory', waiters:'waiter', chefs:'kitchen'
  };
  var defaultOff = ['waiter', 'kitchen', 'inventory'];
  document.querySelectorAll('.sidebar-item[data-page]').forEach(function(el) {
    var key = map[el.dataset.page];
    if (!key) return;
    if (defaultOff.indexOf(key) !== -1) {
      el.style.display = mods[key] === true ? '' : 'none';
    } else {
      el.style.display = mods[key] === false ? 'none' : '';
    }
  });
  // AI Chat button
  var aiBtn = document.getElementById('aiChatToggle');
  if (aiBtn) aiBtn.style.display = mods.aiAgent === true ? '' : 'none';
}

if (token) {
  if (adminInfo && adminInfo.role === 'superadmin') {
    startApp();
  } else {
    var rId0 = (adminInfo && adminInfo.restaurantId) ? adminInfo.restaurantId : 'imperial';
    fetch(API + '/check-block/' + rId0)
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.blocked) {
          document.getElementById('loginPage').style.display = 'none';
          showBlockedScreen(d.reason);
        } else {
          startApp();
        }
      })
      .catch(function(){ startApp(); });
  }
}

setInterval(function() {
  if (!token || !adminInfo || adminInfo.role === 'superadmin') return;
  var rId = adminInfo.restaurantId || 'imperial';
  fetch(API + '/check-block/' + rId)
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d.blocked) showBlockedScreen(d.reason); })
    .catch(function(){});
}, 60 * 1000);

// ===== EVENTS =====
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPass').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
document.getElementById('logoutBtn').addEventListener('click', doLogout);

document.getElementById('hamburger').addEventListener('click', function() {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  sb.classList.toggle('open');
  ov.classList.toggle('hidden', !sb.classList.contains('open'));
});

document.getElementById('sidebarOverlay').addEventListener('click', function() {
  document.getElementById('sidebar').classList.remove('open');
  this.classList.add('hidden');
});

document.querySelectorAll('.sidebar-item').forEach(function(el) {
  el.addEventListener('click', function() { showPage(el.dataset.page); });
});

document.getElementById('productModal').addEventListener('click', function(e) { if (e.target === this) closeProductModal(); });
document.getElementById('productModalCancel').addEventListener('click', closeProductModal);
document.getElementById('productModalSave').addEventListener('click', saveProduct);

document.getElementById('catModal').addEventListener('click', function(e) { if (e.target === this) closeCatModal(); });
document.getElementById('catModalCancel').addEventListener('click', closeCatModal);
document.getElementById('catModalSave').addEventListener('click', saveCat);

// ===== NAV =====
// ===== PAGE CACHE SYSTEM =====
// Har bir sahifa HTML + timestamp saqlanadi. 10 sek ichida qayta ochsa cache dan oladi.
var _pageCache = {};
var _pageCacheTTL = 10000; // 10 sekund
var _currentPage = null;

function pageCacheKey(page) { return 'pc_' + (adminInfo.restaurantId || '') + '_' + page; }

function getPageCache(page) {
  var entry = _pageCache[page];
  if (!entry) return null;
  if (Date.now() - entry.time > _pageCacheTTL) { delete _pageCache[page]; return null; }
  return entry.html;
}

function setPageCache(page) {
  var main = document.getElementById('mainContent');
  if (main) _pageCache[page] = { html: main.innerHTML, time: Date.now() };
}

// Ma'lumot o'zgarganda cache ni tozalash (CRUD operatsiyalardan keyin chaqiriladi)
function clearPageCache(page) {
  if (page) { delete _pageCache[page]; }
  else { _pageCache = {}; } // hammasini tozalash
}

function showPage(page) {
  _currentPage = page;
  document.querySelectorAll('.sidebar-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  if (window.innerWidth < 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.add('hidden');
  }
  var main = document.getElementById('mainContent');

  // Cache dan olish (10 sek ichida)
  var cached = getPageCache(page);
  if (cached) {
    main.innerHTML = cached;
    return;
  }

  // Skeleton ko'rsatib, keyin yuklash
  if (page === 'dashboard')     renderDashboard(main);
  else if (page === 'orders')   renderOrders(main, 'all');
  else if (page === 'products') renderProducts(main);
  else if (page === 'categories') renderCategories(main);
  else if (page === 'ratings')  renderRatings(main);
  else if (page === 'users')    renderUsers(main);
  else if (page === 'branches') renderBranches(main);
  else if (page === 'employees') renderEmployees(main);
  else if (page === 'attendance') renderAttendance(main, '');
  else if (page === 'empReport') renderEmpReport(main);
  else if (page === 'notifications') renderNotifications(main);
  else if (page === 'waiters')  renderWaiters(main);
  else if (page === 'chefs')    renderChefs(main);
  else if (page === 'inventory') renderInventory(main);
  else if (page === 'analytics') renderAnalytics(main);
  else if (page === 'siteSettings') renderSiteSettings(main);
}

// ===== SKELETON TEMPLATES =====
function skelPageProducts() {
  return '<div class="page">' + pageHeader('Menyu boshqaruvi', "Taomlarni qo'shish, tahrirlash, o'chirish") +
    '<div class="flex justify-end mb-4"><div class="skel h-10 w-36 rounded-xl"></div></div>' +
    '<div class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">' +
      ('<div class="skel-card"><div class="skel h-36 rounded-lg mb-3"></div>' + skelLine('70%','16px') + skelLine('40%','14px') + '<div class="skel h-8 rounded-lg mt-3"></div></div>').repeat(6) +
    '</div></div>';
}

function skelPageTable(title, sub, cols) {
  return '<div class="page">' + pageHeader(title, sub) + skelTable(cols || 6) + '</div>';
}

function skelPageCards(title, sub, n) {
  var items = '';
  for (var i = 0; i < (n||4); i++) items += skelCard();
  return '<div class="page">' + pageHeader(title, sub) +
    '<div class="flex justify-end mb-4"><div class="skel h-10 w-36 rounded-xl"></div></div>' +
    '<div class="flex flex-col gap-3">' + items + '</div></div>';
}

// ===== HELPERS =====
function statusBadge(status) {
  var map = { 'Yangi':'badge-new', 'Qabul qilindi':'badge-accepted', 'Bekor qilindi':'badge-rejected', 'Tayyor':'badge-ready', 'Tayyorlanmoqda':'badge-ready' };
  return '<span class="badge ' + (map[status] || 'badge-new') + '">' + status + '</span>';
}

function fmtDate(d) {
  return new Date(d).toLocaleString('uz-UZ', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function card(content) {
  return '<div class="rounded-xl border p-5 mb-5" style="background:#131c2e;border-color:rgba(6,182,212,0.12)">' + content + '</div>';
}

function pageHeader(title, sub) {
  return '<div class="mb-6"><h1 class="font-serif text-3xl font-bold">' + title + '</h1>' + (sub ? '<p class="text-sm mt-1" style="color:#64748b">' + sub + '</p>' : '') + '</div>';
}

// ===== SKELETON LOADERS (Tailwind classes) =====
function skelLine(w, h) {
  return '<div class="skel" style="width:' + (w||'100%') + ';height:' + (h||'14px') + '"></div>';
}

function skelCard() {
  return '<div class="skel-card mb-3">' +
    '<div class="flex gap-3 items-center mb-4">' +
      '<div class="skel w-11 h-11 rounded-xl shrink-0"></div>' +
      '<div class="flex-1 space-y-2">' + skelLine('60%','16px') + skelLine('40%','12px') + '</div>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-2 mb-3">' +
      '<div class="skel h-14 rounded-lg"></div>' +
      '<div class="skel h-14 rounded-lg"></div>' +
    '</div>' +
    skelLine('80%','12px') +
  '</div>';
}

function skelTable(rows) {
  rows = rows || 5;
  var h = '<div class="skel h-10 rounded-md mb-1"></div>';
  var r = '';
  for (var i = 0; i < rows; i++) {
    r += '<div class="flex gap-3 py-3 border-b border-cyan-500/5">' +
      '<div class="skel h-3.5" style="width:30%"></div>' +
      '<div class="skel h-3.5" style="width:20%"></div>' +
      '<div class="skel h-3.5" style="width:25%"></div>' +
      '<div class="skel h-3.5" style="width:15%"></div>' +
    '</div>';
  }
  return '<div class="rounded-xl border border-cyan-500/[0.08] p-5 mb-5 bg-card">' + h + r + '</div>';
}

function skelStats(n) {
  n = n || 4;
  var items = '';
  for (var i = 0; i < n; i++) {
    items += '<div class="skel-card">' +
      '<div class="skel w-8 h-8 rounded-lg mb-3"></div>' +
      skelLine('50%','12px') +
      '<div class="skel h-7 rounded-md mb-1.5" style="width:60%"></div>' +
      skelLine('40%','10px') +
    '</div>';
  }
  return '<div class="grid gap-3.5 mb-5" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">' + items + '</div>';
}

function skelReport() {
  return '<div class="skel-card mb-4">' +
    '<div class="flex justify-between">' +
      '<div class="space-y-2">' + skelLine('120px','12px') + '<div class="skel h-7 rounded-md" style="width:180px"></div></div>' +
      '<div class="space-y-2 text-right">' + skelLine('80px','12px') + '<div class="skel h-7 rounded-md" style="width:80px"></div></div>' +
    '</div>' +
  '</div>' +
  '<div class="skel-card mb-4">' +
    skelLine('140px','12px') +
    '<div class="flex gap-2 items-end mt-4">' +
      '<div class="skel w-7 rounded" style="height:50px"></div>'.repeat(8) +
    '</div>' +
  '</div>' +
  '<div class="space-y-3">' + skelCard() + skelCard() + '</div>';
}

function statCard(icon, label, value, sub) {
  return '<div class="rounded-xl border p-5" style="background:#131c2e;border-color:rgba(6,182,212,0.12)">' +
    '<div class="text-3xl mb-2">' + icon + '</div>' +
    '<div class="text-xs uppercase tracking-widest mb-2" style="color:#64748b">' + label + '</div>' +
    '<div class="text-3xl font-bold">' + value + '</div>' +
    '<div class="text-xs mt-1" style="color:#64748b">' + sub + '</div>' +
  '</div>';
}

function tableWrap(headerHtml, bodyHtml) {
  return '<div class="rounded-xl border overflow-hidden mb-5" style="background:#131c2e;border-color:rgba(6,182,212,0.12)">' +
    '<div class="flex justify-between items-center flex-wrap gap-2 px-5 py-4 border-b" style="border-color:rgba(6,182,212,0.12)">' + headerHtml + '</div>' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full border-collapse">' + bodyHtml + '</table>' +
    '</div>' +
  '</div>';
}

var thStyle = 'padding:10px 16px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#64748b;background:#1a2235;border-bottom:1px solid rgba(6,182,212,0.12)';
var tdStyle = 'padding:12px 16px;font-size:13px;border-bottom:1px solid rgba(6,182,212,0.05)';

// ===== FORMAT HELPERS =====
function formatMins(mins) {
  if (!mins || mins <= 0) return '0 daqiqa';
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  if (h > 0 && m > 0) return h + ' soat ' + m + ' daqiqa';
  if (h > 0) return h + ' soat';
  return m + ' daqiqa';
}

function fmtSalary(n) {
  if (!n) return '0 so\'m';
  return Number(n).toLocaleString('uz-UZ') + ' so\'m';
}

// ===== DASHBOARD =====
var _dashPeriod = 'month';
var _dashFrom = '';
var _dashTo = '';

async function renderDashboard(main) {
  main.innerHTML = '<div class="page">' +
    pageHeader(t('dash_title'), t('dash_sub')) +
    '<div class="dash-filter-bar rounded-xl border p-4 mb-5 flex gap-2 items-center" style="background:#131c2e;border-color:rgba(6,182,212,0.12);overflow-x:auto">' +
      '<span class="text-xs uppercase tracking-wider mr-2" style="color:#64748b">📅</span>' +
      '<button class="dash-period-btn px-3 py-1.5 rounded-lg border text-xs font-medium transition-all" data-period="today" style="border-color:rgba(6,182,212,0.12);color:#64748b">' + t('dash_today') + '</button>' +
      '<button class="dash-period-btn px-3 py-1.5 rounded-lg border text-xs font-medium transition-all" data-period="yesterday" style="border-color:rgba(6,182,212,0.12);color:#64748b">' + t('dash_yesterday') + '</button>' +
      '<button class="dash-period-btn px-3 py-1.5 rounded-lg border text-xs font-medium transition-all" data-period="week" style="border-color:rgba(6,182,212,0.12);color:#64748b">' + t('dash_week') + '</button>' +
      '<button class="dash-period-btn px-3 py-1.5 rounded-lg border text-xs font-medium transition-all active" data-period="month" style="border-color:rgba(6,182,212,0.12);color:#64748b">' + t('dash_month') + '</button>' +
      '<button class="dash-period-btn px-3 py-1.5 rounded-lg border text-xs font-medium transition-all" data-period="prevMonth" style="border-color:rgba(6,182,212,0.12);color:#64748b">' + t('dash_prevMonth') + '</button>' +
      '<span class="mx-2" style="color:rgba(6,182,212,0.2)">|</span>' +
      '<input type="date" id="dashFrom" class="inp px-2 py-1 text-xs rounded-lg" style="width:130px;background:#1a2235;border:1px solid rgba(6,182,212,0.15);color:#e2e8f0"/>' +
      '<span class="text-xs" style="color:#64748b">—</span>' +
      '<input type="date" id="dashTo" class="inp px-2 py-1 text-xs rounded-lg" style="width:130px;background:#1a2235;border:1px solid rgba(6,182,212,0.15);color:#e2e8f0"/>' +
      '<button id="dashCustomBtn" class="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style="background:linear-gradient(135deg,#8b5cf6,#06b6d4)">' + t('dash_show') + '</button>' +
    '</div>' +
    '<div id="dashContent">' + skelStats(5) +
      '<div class="grid gap-4 mb-5" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">' +
        '<div class="skel-card"><div class="skel h-4 w-40 mb-4"></div><div class="skel h-52 rounded-lg"></div></div>' +
        '<div class="skel-card"><div class="skel h-4 w-32 mb-4"></div><div class="skel h-52 rounded-lg"></div></div>' +
      '</div>' +
    '</div>' +
  '</div>';

  // Period tugmalari event
  document.querySelectorAll('.dash-period-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.dash-period-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _dashPeriod = btn.dataset.period;
      _dashFrom = '';
      _dashTo = '';
      loadDashboardData();
    });
  });

  // Custom date
  document.getElementById('dashCustomBtn').addEventListener('click', function() {
    var f = document.getElementById('dashFrom').value;
    var t = document.getElementById('dashTo').value;
    if (f && t) {
      document.querySelectorAll('.dash-period-btn').forEach(function(b) { b.classList.remove('active'); });
      _dashPeriod = 'custom';
      _dashFrom = f;
      _dashTo = t;
      loadDashboardData();
    }
  });

  loadDashboardData();
}

async function loadDashboardData() {
  var container = document.getElementById('dashContent');
  if (!container) return;
  container.innerHTML = skelStats(5) + '<div class="grid gap-4 mb-5" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))"><div class="skel-card"><div class="skel h-52 rounded-lg"></div></div><div class="skel-card"><div class="skel h-52 rounded-lg"></div></div></div>';

  var d = null;

  // Avval stats/filter sinab ko'rish (yangi endpoint)
  if (_dashPeriod !== 'month' || _dashFrom) {
    var url = '/admin/stats/filter?period=' + _dashPeriod;
    if (_dashPeriod === 'custom' && _dashFrom && _dashTo) {
      url = '/admin/stats/filter?from=' + _dashFrom + '&to=' + _dashTo;
    }
    d = await apiFetch(url);
    // Agar stats/filter ishlasa — uni ishlatamiz
    if (d && d.summary) {
      var s = d.summary;
      var periodLabel = _dashPeriod === 'today' ? t('dash_today') : _dashPeriod === 'yesterday' ? t('dash_yesterday') : _dashPeriod === 'week' ? t('dash_week') : _dashPeriod === 'month' ? t('dash_month') : _dashPeriod === 'prevMonth' ? t('dash_prevMonth') : (d.from + ' — ' + d.to);
      renderDashContent(container, s.orders, s.revenue, s.online, s.dineIn, s.avgCheck, d.rating, d.totalUsers, d.daily, d.topProducts, d.recentOrders, periodLabel);
      return;
    }
  }

  // Fallback: stats/fast (eski endpoint — har doim ishlaydi)
  d = await apiFetch('/admin/stats/fast');
  if (!d || d.error) { container.innerHTML = '<p style="color:#f87171">' + t('no_data') + '</p>'; return; }

  renderDashContent(container,
    d.today ? d.today.orders : 0,
    d.today ? d.today.revenue : 0,
    d.today ? d.today.online : 0,
    d.today ? d.today.dineIn : 0,
    d.month && d.month.orders > 0 ? Math.round((d.month.revenue || 0) / d.month.orders) : 0,
    d.rating || { avg: null, count: 0 },
    d.totalUsers || 0,
    d.weekly ? d.weekly.map(function(w) { return { date: w.date, orders: w.orders, revenue: w.revenue }; }) : [],
    d.topProducts || [],
    d.recentOrders || [],
    t('dash_month') + ' (' + t('dash_today') + ': ' + (d.today ? d.today.orders : 0) + ', ' + t('dash_month') + ': ' + (d.month ? d.month.orders : 0) + ')'
  );
}

function renderDashContent(container, orders, revenue, online, dineIn, avgCheck, rating, totalUsers, daily, topProducts, recentOrders, periodLabel) {
  container.innerHTML =
    '<div class="grid gap-4 mb-6" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">' +
      statCard('📦', t('dash_orders'), orders || 0, periodLabel) +
      statCard('💰', t('dash_revenue'), Number(revenue || 0).toLocaleString() + " " + t('som'), periodLabel) +
      statCard('🌐', t('dash_online'), (online || 0) + ' / ' + (dineIn || 0), periodLabel) +
      statCard('🧾', t('dash_avg'), Number(avgCheck || 0).toLocaleString() + " " + t('som'), periodLabel) +
      statCard('⭐', t('dash_rating'), (rating && rating.avg) || '—', (rating ? rating.count : 0) + ' ' + t('ta')) +
      statCard('👥', t('dash_users'), totalUsers || 0, t('total')) +
    '</div>' +
    '<div class="grid gap-4 mb-5" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">' +
      '<div class="rounded-xl border p-5" style="background:#131c2e;border-color:rgba(6,182,212,0.12)"><div class="text-sm font-semibold mb-4">📈 ' + t('dash_trend') + '</div><div style="position:relative;height:220px"><canvas id="weeklyChart"></canvas></div></div>' +
      '<div class="rounded-xl border p-5" style="background:#131c2e;border-color:rgba(6,182,212,0.12)"><div class="text-sm font-semibold mb-4">🔵 ' + t('dash_type') + '</div><div style="position:relative;height:220px"><canvas id="typeChart"></canvas></div></div>' +
    '</div>' +
    '<div class="rounded-xl border p-5 mb-5" style="background:#131c2e;border-color:rgba(6,182,212,0.12)"><div class="text-sm font-semibold mb-4">🏆 ' + t('dash_top') + '</div><div id="topChart"></div></div>' +
    '<div class="rounded-xl border overflow-hidden mb-5" style="background:#131c2e;border-color:rgba(6,182,212,0.12)"><div class="px-5 py-4 border-b" style="border-color:rgba(6,182,212,0.12)"><span class="text-sm font-semibold">' + t('dash_recent') + '</span></div><div id="recentOrders" class="overflow-x-auto"></div></div>';

  // Grafiklar
  if (weeklyChart) weeklyChart.destroy();
  var wc = document.getElementById('weeklyChart');
  if (wc && daily && daily.length) weeklyChart = new Chart(wc.getContext('2d'), {
    type: 'bar',
    data: { labels: daily.map(function(x){return x.date;}), datasets: [
      { label: t('dash_orders'), data: daily.map(function(x){return x.orders;}), backgroundColor:'rgba(6,182,212,0.6)', borderColor:'#06b6d4', borderRadius:6, borderWidth:1 },
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#64748b',maxRotation:45},grid:{color:'rgba(6,182,212,0.06)'}}, y:{ticks:{color:'#64748b'},grid:{color:'rgba(6,182,212,0.06)'}} } }
  });

  if (typeChart) typeChart.destroy();
  var tc = document.getElementById('typeChart');
  if (tc) typeChart = new Chart(tc.getContext('2d'), {
    type: 'doughnut',
    data: { labels:[t('ord_online'), t('ord_dinein')], datasets:[{ data:[online||0, dineIn||0], backgroundColor:['rgba(139,92,246,0.7)','rgba(245,158,11,0.7)'], borderColor:['#8b5cf6','#f59e0b'], borderWidth:2 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',font:{size:12}}}}, cutout:'65%' }
  });

  // Top mahsulotlar
  var topEl = document.getElementById('topChart');
  if (topEl && topProducts && topProducts.length) {
    var maxQ = topProducts[0].quantity || topProducts[0].totalQty || 1;
    var html = '';
    topProducts.forEach(function(p, i) {
      var qty = p.quantity || p.totalQty || 0;
      var tot = p.total || p.totalRevenue || 0;
      var pct = Math.round(qty / maxQ * 100);
      html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
        '<div style="width:24px;height:24px;border-radius:50%;background:var(--sx-cyan, #06b6d4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">' + (i+1) + '</div>' +
        '<div style="flex:1"><div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="font-size:13px;font-weight:600">' + p._id + '</span><span style="font-size:12px;color:#22d3ee">' + qty + ' ' + t('ta') + ' · ' + Number(tot).toLocaleString() + ' ' + t('som') + '</span></div>' +
          '<div style="height:6px;background:#1a2235;border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#06b6d4,#f59e0b);border-radius:3px"></div></div></div></div>';
    });
    topEl.innerHTML = html;
  } else if (topEl) { topEl.innerHTML = '<p class="text-sm" style="color:#64748b">' + t('no_data') + '</p>'; }

  // Oxirgi buyurtmalar
  var recentEl = document.getElementById('recentOrders');
  if (recentEl && recentOrders && recentOrders.length) {
    var rows = '';
    recentOrders.forEach(function(o) {
      var name = ((o.userInfo&&o.userInfo.first_name)||'') + ' ' + ((o.userInfo&&o.userInfo.last_name)||'');
      var phone = (o.userInfo&&o.userInfo.phone)||'';
      rows += '<tr><td style="' + tdStyle + '">' + name.trim() + '<br><small style="color:#64748b">' + phone + '</small></td>' +
        '<td style="' + tdStyle + ';max-width:160px;font-size:12px">' + (o.items||[]).map(function(i){return i.name+'x'+i.quantity;}).join(', ') + '</td>' +
        '<td style="' + tdStyle + ';color:#22d3ee">' + Number(o.total||0).toLocaleString() + '</td>' +
        '<td style="' + tdStyle + '">' + statusBadge(o.status) + '</td>' +
        '<td style="' + tdStyle + ';color:#64748b;font-size:12px">' + fmtDate(o.createdAt) + '</td></tr>';
    });
    recentEl.innerHTML = '<table class="w-full border-collapse"><thead><tr><th style="' + thStyle + '">' + t('ord_client') + '</th><th style="' + thStyle + '">' + t('ord_products') + '</th><th style="' + thStyle + '">' + t('ord_total') + '</th><th style="' + thStyle + '">' + t('ord_status') + '</th><th style="' + thStyle + '">' + t('ord_time') + '</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  setPageCache('dashboard');
}

// ===== ORDERS =====
async function renderOrders(main, filter) {
  filter = filter || 'all';
  currentOrderFilter = filter;

  main.innerHTML = '<div class="page">' +
    pageHeader(t('page_orders'), t('page_orders_sub')) +
    '<div class="rounded-xl border overflow-hidden" style="background:#131c2e;border-color:rgba(6,182,212,0.12)">' +
      '<div class="flex justify-between items-center flex-wrap gap-2 px-5 py-4 border-b" style="border-color:rgba(6,182,212,0.12)">' +
        '<span class="text-sm font-semibold">Royxat</span>' +
        '<div id="orderFilters" class="flex gap-2 flex-wrap">' +
          ['all','Yangi','Qabul qilindi','Bekor qilindi'].map(function(f) {
            return '<button class="filter-btn px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ' + (filter===f?'active':'') + '" data-filter="' + f + '" style="border-color:rgba(6,182,212,0.12);color:#64748b">' + (f==='all'?t('all'):f) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div id="ordersTable" class="overflow-x-auto">' + skelTable(6) + '</div>' +
    '</div>' +
  '</div>';

  document.getElementById('orderFilters').addEventListener('click', function(e) {
    var btn = e.target.closest('.filter-btn');
    if (btn) renderOrders(document.getElementById('mainContent'), btn.dataset.filter);
  });

  var params = filter !== 'all' ? '?status=' + encodeURIComponent(filter) + '&limit=100' : '?limit=100';
  var data = await apiFetch('/admin/orders' + params);
  if (!data) return;

  var rows = '';
  data.orders.forEach(function(o, i) {
    var name  = ((o.userInfo&&o.userInfo.first_name)||'') + ' ' + ((o.userInfo&&o.userInfo.last_name)||'');
    var phone = (o.userInfo&&o.userInfo.phone)||'';
    rows += '<tr>' +
      '<td style="' + tdStyle + ';color:#64748b">' + (i+1) + '</td>' +
      '<td style="' + tdStyle + '">' + name.trim() + '<br><small style="color:#64748b">' + phone + '</small></td>' +
      '<td style="' + tdStyle + ';font-size:12px;max-width:160px">' + o.items.map(function(x){return x.name+'x'+x.quantity;}).join(', ') + '</td>' +
      '<td style="' + tdStyle + ';color:#22d3ee;font-weight:600">' + Number(o.total).toLocaleString() + '</td>' +
      '<td style="' + tdStyle + ';color:#64748b">' + (o.tableNumber||'—') + '</td>' +
      '<td style="' + tdStyle + '"><span class="badge ' + (o.orderType==='online'?'badge-online':'badge-dinein') + '">' + (o.orderType==='online'?t('ord_online'):t('ord_dinein')) + '</span></td>' +
      '<td style="' + tdStyle + '">' + statusBadge(o.status) + '</td>' +
      '<td style="' + tdStyle + ';color:#64748b;font-size:12px">' + fmtDate(o.createdAt) + '</td>' +
      '<td style="' + tdStyle + '">' +
        '<select data-id="' + o._id + '" class="order-status-sel" style="background:#1a2235;border:1px solid rgba(6,182,212,0.12);color:#f1f5f9;padding:4px 8px;border-radius:6px;font-size:12px;cursor:pointer">' +
          '<option value="">' + t('ord_change') + '</option>' +
          ['Yangi','Qabul qilindi','Tayyorlanmoqda','Tayyor','Bekor qilindi'].map(function(s){ return '<option value="'+s+'">'+s+'</option>'; }).join('') +
        '</select>' +
      '</td>' +
    '</tr>';
  });

  setPageCache('orders');
  document.getElementById('ordersTable').innerHTML =
    '<table class="w-full border-collapse">' +
      '<thead><tr>' +
        ['#',t('ord_client'),t('ord_products'),t('ord_total'),t('ord_table'),t('ord_type'),t('ord_status'),t('ord_time'),t('ord_action')].map(function(h){ return '<th style="'+thStyle+'">'+h+'</th>'; }).join('') +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';

  document.querySelectorAll('.order-status-sel').forEach(function(sel) {
    sel.addEventListener('change', async function() {
      if (!this.value) return;
      await apiFetch('/admin/orders/' + this.dataset.id + '/status', { method:'PUT', body:JSON.stringify({status:this.value}) });
      renderOrders(document.getElementById('mainContent'), currentOrderFilter);
    });
  });
}

// ===== PRODUCTS =====
async function renderProducts(main) {
  var skelGrid = '';
  for (var s = 0; s < 6; s++) skelGrid += '<div class="skel-card"><div class="skel h-36 rounded-lg mb-3"></div><div class="skel h-4 w-3/4 mb-2"></div><div class="skel h-3 w-1/2 mb-2"></div><div class="skel h-8 rounded-lg mt-3"></div></div>';
  main.innerHTML = '<div class="page">' +
    pageHeader(t('page_menu'), t('page_menu_sub')) +
    '<div class="flex justify-end mb-4"><button id="addProductBtn" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style="background:var(--sx-cyan, #06b6d4)">' + t('prod_add') + '</button></div>' +
    '<div id="productsGrid" class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">' + skelGrid + '</div>' +
  '</div>';
  document.getElementById('addProductBtn').addEventListener('click', function() { openProductModal(null); });
  loadProductsGrid();
}

async function loadProductsGrid() {
  var products = await apiFetch('/admin/products');
  if (!products) return;
  var grid = document.getElementById('productsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  products.forEach(function(p) {
    var div = document.createElement('div');
    div.className = 'rounded-xl border overflow-hidden transition-transform hover:-translate-y-0.5' + (p.active===false?' opacity-50':'');
    div.style.cssText = 'background:#131c2e;border-color:rgba(6,182,212,0.12)';
    div.innerHTML =
      (p.image
        ? '<img src="'+p.image+'" alt="'+p.name+'" class="w-full object-cover" style="height:140px" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="w-full items-center justify-center text-4xl" style="height:140px;background:#1a2235;display:none">🍽</div>'
        : '<div class="w-full flex items-center justify-center text-4xl" style="height:140px;background:#1a2235">🍽</div>'
      ) +
      '<div class="p-4">' +
        '<div class="font-semibold text-base">' + p.name + '</div>' +
        (p.name_ru ? '<div class="text-xs mt-0.5" style="color:#64748b">'+p.name_ru+'</div>' : '') +
        '<div class="font-medium mt-1" style="color:#22d3ee">' + Number(p.price).toLocaleString() + " + t('som') + '</div>" +
        '<div class="text-xs uppercase tracking-wide mt-1 mb-3" style="color:#64748b">' + p.category + (p.active===false?' · '+t('prod_hidden'):''") + '</div>' +
        '<div class="flex gap-2">' +
          '<button class="edit-btn flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all" style="background:rgba(6,182,212,0.12);border-color:rgba(6,182,212,0.3);color:#22d3ee">✏️ ' + t('edit') + '</button>' +
          '<button class="del-btn py-1.5 px-2.5 rounded-lg text-xs border transition-all" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2);color:#ef4444">🗑</button>' +
        '</div>' +
      '</div>';
    div.querySelector('.edit-btn').addEventListener('click', function() { openProductModal(p); });
    div.querySelector('.del-btn').addEventListener('click', function() { deleteProduct(p.id); });
    grid.appendChild(div);
  });
  setPageCache('products');
}

async function loadCategoryOptions() {
  var cats = await apiFetch('/admin/categories');
  var sel  = document.getElementById('pCategory');
  sel.innerHTML = '';
  if (cats && cats.length) {
    cats.forEach(function(c) {
      var o = document.createElement('option');
      o.value = c.name;
      o.textContent = (c.emoji||'') + ' ' + c.name;
      sel.appendChild(o);
    });
  } else {
    sel.innerHTML = '<option value="Taom">Taom</option><option value="Ichimlik">Ichimlik</option>';
  }
}

function openProductModal(p) {
  document.getElementById('modalTitle').textContent = p ? t('prod_edit_title') : t('prod_new');
  document.getElementById('productEditId').value = p ? p.id : '';
  document.getElementById('pName').value   = p ? (p.name||'') : '';
  document.getElementById('pNameRu').value = p ? (p.name_ru||'') : '';
  document.getElementById('pPrice').value  = p ? (p.price||'') : '';
  document.getElementById('pImage').value  = p ? (p.image||'') : '';
  document.getElementById('pActive').value = (p && p.active===false) ? 'false' : 'true';
  loadCategoryOptions().then(function() {
    if (p && p.category) document.getElementById('pCategory').value = p.category;
  });
  document.getElementById('productModal').classList.remove('hidden');
  document.getElementById('productModal').style.display = 'flex';
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
  document.getElementById('productModal').style.display = '';
}

async function saveProduct() {
  var id   = document.getElementById('productEditId').value;
  var body = {
    name:     document.getElementById('pName').value.trim(),
    name_ru:  document.getElementById('pNameRu').value.trim(),
    price:    Number(document.getElementById('pPrice').value),
    category: document.getElementById('pCategory').value,
    image:    document.getElementById('pImage').value.trim(),
    active:   document.getElementById('pActive').value === 'true'
  };
  if (!body.name || !body.price) { alert(t('prod_name_price_required')); return; }
  var btn = document.getElementById('productModalSave');
  btn.textContent = t('saving'); btn.disabled = true;
  if (id) await apiFetch('/admin/products/' + id, { method:'PUT', body:JSON.stringify(body) });
  else    await apiFetch('/admin/products',        { method:'POST', body:JSON.stringify(body) });
  btn.textContent = t('save'); btn.disabled = false;
  closeProductModal();
  loadProductsGrid();
}

async function deleteProduct(id) {
  if (!confirm(t('confirm_delete'))) return;
  await apiFetch('/admin/products/' + id, { method:'DELETE' });
  loadProductsGrid();
}

// ===== CATEGORIES =====
async function renderCategories(main) {
  main.innerHTML = '<div class="page">' +
    pageHeader(t('page_categories'), t('page_categories_sub')) +
    '<div class="flex justify-end mb-4"><button id="addCatBtn" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style="background:var(--sx-cyan, #06b6d4)">' + t('cat_add') + '</button></div>' +
    '<div class="rounded-xl border overflow-hidden" style="background:#131c2e;border-color:rgba(6,182,212,0.12)">' +
      '<div class="px-5 py-4 border-b" style="border-color:rgba(6,182,212,0.12)">' +
        '<span class="text-sm font-semibold">Royxat</span> ' +
        '<span class="text-xs" style="color:#64748b">— ' + t('cat_drag_hint') + '</span>' +
      '</div>' +
      '<div id="catList"></div>' +
    '</div>' +
  '</div>';
  document.getElementById('addCatBtn').addEventListener('click', function() { openCatModal(null); });
  loadCatList();
}

async function loadCatList() {
  var cats = await apiFetch('/admin/categories');
  if (!cats) return;
  var list = document.getElementById('catList');
  if (!list) return;
  list.innerHTML = '';
  cats.forEach(function(cat) {
    var row = document.createElement('div');
    row.className = 'cat-row';
    row.draggable = true;
    row.dataset.id    = cat._id;
    row.dataset.order = cat.order;
    row.innerHTML =
      '<span class="text-xl cursor-grab" style="color:#64748b">⠿</span>' +
      '<span class="text-2xl">' + (cat.emoji||'🍽') + '</span>' +
      '<div class="flex-1">' +
        '<div class="text-sm font-semibold">' + cat.name + (cat.name_ru ? ' <span style="color:#64748b;font-size:12px">/ ' + cat.name_ru + '</span>' : '') + '</div>' +
        '<div class="text-xs mt-0.5" style="color:#64748b">' + t('cat_order') + ': ' + cat.order + '</div>' +
      '</div>' +
      '<span class="badge ' + (cat.active!==false?'badge-accepted':'badge-rejected') + '">' + (cat.active!==false?t('cat_visible'):t('prod_hidden')) + '</span>' +
      '<button class="edit-cat py-1.5 px-3 rounded-lg text-xs border transition-all" style="background:rgba(6,182,212,0.12);border-color:rgba(6,182,212,0.3);color:#22d3ee">✏️</button>' +
      '<button class="del-cat py-1.5 px-2.5 rounded-lg text-xs border ml-1" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2);color:#ef4444">🗑</button>';
    row.querySelector('.edit-cat').addEventListener('click', function() { openCatModal(cat); });
    row.querySelector('.del-cat').addEventListener('click', function() { deleteCat(cat._id); });
    row.addEventListener('dragstart', function(e) { dragSrc = row; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragover',  function(e) { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', function()  { row.classList.remove('drag-over'); });
    row.addEventListener('dragend',   function()  { row.classList.remove('dragging'); document.querySelectorAll('.cat-row').forEach(function(r){r.classList.remove('drag-over');}); });
    row.addEventListener('drop', async function(e) {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (!dragSrc || dragSrc === row) return;
      var rows = Array.from(list.querySelectorAll('.cat-row'));
      var si = rows.indexOf(dragSrc), ti = rows.indexOf(row);
      if (si < ti) list.insertBefore(dragSrc, row.nextSibling);
      else list.insertBefore(dragSrc, row);
      var newOrder = Array.from(list.querySelectorAll('.cat-row')).map(function(r, i) { return { id: r.dataset.id, order: i+1 }; });
      await apiFetch('/admin/categories/reorder/save', { method:'PUT', body:JSON.stringify({order:newOrder}) });
      loadCatList();
    });
    list.appendChild(row);
  });
  setPageCache('categories');
}

function openCatModal(cat) {
  document.getElementById('catModalTitle').textContent = cat ? t('cat_edit') : t('cat_new');
  document.getElementById('catEditId').value  = cat ? (cat._id||'') : '';
  document.getElementById('cName').value      = cat ? (cat.name||'') : '';
  document.getElementById('cNameRu').value    = cat ? (cat.name_ru||'') : '';
  document.getElementById('cEmoji').value     = cat ? (cat.emoji||'🍽') : '🍽';
  document.getElementById('cActive').value    = (cat && cat.active===false) ? 'false' : 'true';
  document.getElementById('catModal').classList.remove('hidden');
  document.getElementById('catModal').style.display = 'flex';
}

function closeCatModal() {
  document.getElementById('catModal').classList.add('hidden');
  document.getElementById('catModal').style.display = '';
}

async function saveCat() {
  var id   = document.getElementById('catEditId').value;
  var body = {
    name:    document.getElementById('cName').value.trim(),
    name_ru: document.getElementById('cNameRu').value.trim(),
    emoji:   document.getElementById('cEmoji').value.trim() || '🍽',
    active:  document.getElementById('cActive').value === 'true'
  };
  if (!body.name) { alert(t('name_required')); return; }
  if (id) await apiFetch('/admin/categories/' + id, { method:'PUT', body:JSON.stringify(body) });
  else    await apiFetch('/admin/categories',        { method:'POST', body:JSON.stringify(body) });
  closeCatModal();
  clearPageCache('categories');
  loadCatList();
}

async function deleteCat(id) {
  if (!confirm(t('confirm_delete'))) return;
  await apiFetch('/admin/categories/' + id, { method:'DELETE' });
  loadCatList();
}

// ===== RATINGS =====
async function renderRatings(main) {
  main.innerHTML = '<div class="page">' + pageHeader(t('page_ratings'), t('page_ratings_sub')) + '<div id="ratingsContent">' + skelTable(4) + '</div></div>';
  var data = await apiFetch('/admin/orders?limit=500');
  if (!data) return;
  var rated = data.orders.filter(function(o){return o.rating;});
  var avg   = rated.length ? (rated.reduce(function(s,o){return s+o.rating;},0)/rated.length).toFixed(1) : null;

  var barsHtml = '';
  [5,4,3,2,1].forEach(function(n) {
    var cnt = rated.filter(function(o){return o.rating===n;}).length;
    var pct = rated.length ? Math.round(cnt/rated.length*100) : 0;
    barsHtml += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="font-size:12px;color:#64748b;width:12px">'+n+'</span>' +
      '<div style="flex:1;height:6px;background:#1a2235;border-radius:3px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:#f59e0b;border-radius:3px"></div></div>' +
      '<span style="font-size:12px;color:#64748b;width:20px;text-align:right">'+cnt+'</span>' +
    '</div>';
  setPageCache('ratings');
  });

  var ratedRows = '';
  rated.slice(0,50).forEach(function(o) {
    var name  = ((o.userInfo&&o.userInfo.first_name)||'') + ' ' + ((o.userInfo&&o.userInfo.last_name)||'');
    var stars = '⭐'.repeat(o.rating);
    ratedRows += '<tr>' +
      '<td style="'+tdStyle+'">'+name.trim()+'</td>' +
      '<td style="'+tdStyle+';font-size:12px">'+o.items.map(function(i){return i.name;}).join(', ')+'</td>' +
      '<td style="'+tdStyle+'">'+stars+'</td>' +
      '<td style="'+tdStyle+';color:#64748b;font-size:12px">'+new Date(o.createdAt).toLocaleDateString('uz-UZ')+'</td>' +
    '</tr>';
  });

  document.getElementById('ratingsContent').innerHTML =
    '<div class="flex items-center gap-6 rounded-xl border p-5 mb-5 flex-wrap" style="background:#131c2e;border-color:rgba(6,182,212,0.12)">' +
      '<div><div style="font-size:52px;font-weight:700;color:#22d3ee;line-height:1">'+(avg||'—')+'</div>' +
      '<div style="font-size:22px;margin-bottom:4px">'+(avg?'⭐'.repeat(Math.round(avg)):'—')+'</div>' +
      '<div style="font-size:13px;color:#64748b">'+rated.length+' ta baho</div></div>' +
      '<div style="flex:1;min-width:200px">'+barsHtml+'</div>' +
    '</div>' +
    '<div class="rounded-xl border overflow-hidden" style="background:#131c2e;border-color:rgba(6,182,212,0.12)">' +
      '<div class="px-5 py-4 border-b" style="border-color:rgba(6,182,212,0.12)"><span class="text-sm font-semibold">' + t('rat_rated_orders') + '</span></div>' +
      '<div class="overflow-x-auto"><table class="w-full border-collapse"><thead><tr>'+
        [t('ord_client'),t('ord_products'),t('rat_score'),t('ord_time')].map(function(h){return '<th style="'+thStyle+'">'+h+'</th>';}).join('')+
      '</tr></thead><tbody>'+ratedRows+'</tbody></table></div>' +
    '</div>';
  setPageCache('ratings');
}

// ===== USERS =====
async function renderUsers(main) {
  main.innerHTML = '<div class="page">' + pageHeader(t('page_users'), t('page_users_sub')) +
    '<div class="rounded-xl border overflow-hidden" style="background:#131c2e;border-color:rgba(6,182,212,0.12)">' +
      '<div id="usersTable" class="overflow-x-auto">' + skelTable(4) + '</div>' +
    '</div></div>';

  var res = await apiFetch('/admin/users');
  if (!res) return;
  var users = res.users || res;
  if (!Array.isArray(users)) return;
  var rows = '';
  users.forEach(function(u, i) {
    rows += '<tr>' +
      '<td style="'+tdStyle+';color:#64748b">'+(i+1)+'</td>' +
      '<td style="'+tdStyle+'">'+(u.first_name||'')+' '+(u.last_name||'')+'</td>' +
      '<td style="'+tdStyle+';color:#22d3ee">'+(u.username?'@'+u.username:'—')+'</td>' +
      '<td style="'+tdStyle+'">'+(u.phone||'—')+'</td>' +
      '<td style="'+tdStyle+';color:#64748b;font-size:12px">'+u.telegramId+'</td>' +
      '<td style="'+tdStyle+';color:#64748b;font-size:12px">'+new Date(u.createdAt).toLocaleDateString('uz-UZ')+'</td>' +
    '</tr>';
  });
  document.getElementById('usersTable').innerHTML =
    '<table class="w-full border-collapse"><thead><tr>' +
      ['#',t('usr_name'),'Username',t('usr_phone'),'Telegram ID',t('date')].map(function(h){return '<th style="'+thStyle+'">'+h+'</th>';}).join('') +
    '</tr></thead><tbody>'+rows+'</tbody></table>';
  setPageCache('users');
}

// ===================================================
// ===== EMPLOYEES ===================================
// ===================================================
async function renderEmployees(main) {
  main.innerHTML = '' + skelTable(5) + '';
  var emps = await apiFetch('/admin/employees');

  var rows = (emps || []).map(function(e) {
    return '<tr style="border-bottom:1px solid rgba(6,182,212,0.08)">' +
      '<td style="padding:12px 8px"><div style="font-size:14px;font-weight:600;color:#f1f5f9">' + e.name + '</div><div style="font-size:11px;color:#64748b">' + (e.position||'—') + '</div></td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#94a3b8">' + (e.phone||'—') + '</td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#22d3ee">' + (e.username||'—') + '</td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#22d3ee">' + fmtSalary(e.salary) + '</td>' +
      '<td style="padding:12px 8px;font-size:12px;color:#94a3b8">' + (e.workStart||'09:00') + ' – ' + (e.workEnd||'18:00') + '</td>' +
      '<td style="padding:12px 8px"><span style="font-size:11px;padding:3px 8px;border-radius:99px;background:' + (e.active?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)') + ';color:' + (e.active?'#4ade80':'#f87171') + '">' + (e.active?t('emp_active'):t('emp_inactive')) + '</span></td>' +
      '<td style="padding:12px 8px"><div style="display:flex;gap:6px">' +
        '<button onclick="openEmpModal(' + JSON.stringify(JSON.stringify(e)) + ')" style="padding:5px 10px;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;font-size:11px;cursor:pointer">✏️ ' + t('edit') + '</button>' +
        '<button onclick="deleteEmp(\'' + e._id + '\')" style="padding:5px 10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;font-size:11px;cursor:pointer">🗑</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9">' + t('page_employees') + ' <span style="font-size:13px;color:#64748b;font-weight:400">(' + (emps||[]).length + ' ta)</span></div>' +
        '<button onclick="openEmpModal(null)" style="padding:9px 18px;background:linear-gradient(135deg,var(--sx-cyan, #06b6d4),#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">' + t('add') + '</button>' +
      '</div>' +
      '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.12);border-radius:12px;overflow:hidden">' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:rgba(6,182,212,0.05)">' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_name') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_phone') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_login') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_salary') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_work_time') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('status') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('actions') + '</th>' +
          '</tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="7" style="padding:40px;text-align:center;color:#475569">' + t('emp_no_employees') + '</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</div>' +
    '</div>';
  setPageCache('employees');
}

async function openEmpModal(empJson) {
  var emp = empJson ? JSON.parse(empJson) : null;
  _empPhotoBase64 = emp && emp.photo ? emp.photo : null;
  document.getElementById('empModalTitle').textContent = emp ? t('emp_edit') : t('emp_new');
  document.getElementById('empModalBody').innerHTML = '' + skelTable(3) + '';
  document.getElementById('empModal').style.display = 'flex';

  var bd = await apiFetch('/admin/branches');
  var branches = (bd && bd.branches) ? bd.branches : [];
  var dayNames = {monday:'Dushanba',tuesday:'Seshanba',wednesday:'Chorshanba',thursday:'Payshanba',friday:'Juma',saturday:'Shanba',sunday:'Yakshanba'};

  var branchOptions = '<option value="">— Filial tanlang —</option>' +
    branches.map(function(b) {
      var empBranchId = emp && emp.branchId ? (emp.branchId._id || emp.branchId) : '';
      return '<option value="' + b._id + '" ' + (empBranchId === b._id ? 'selected' : '') + '>' + b.name + '</option>';
    }).join('');

  var weekOpts = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(function(d) {
    return '<option value="' + d + '" ' + ((emp && emp.weeklyOff || 'sunday') === d ? 'selected' : '') + '>' + dayNames[d] + '</option>';
  }).join('');

  document.getElementById('empModalBody').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:12px">' +
      empInp('empName',     'ISM FAMILIYA', 'text',     emp ? (emp.name||'') : '') +
      empInp('empPhone',    'TELEFON',       'text',     emp ? (emp.phone||'') : '') +
      empInp('empPosition', 'LAVOZIM',       'text',     emp ? (emp.position||'') : '') +
      empInp('empUsername', 'LOGIN',         'text',     emp ? (emp.username||'') : '') +
      empInp('empPassword', 'PAROL' + (emp ? ' (uzgartirish uchun)' : ''), 'password', '') +
      empInp('empSalary',   'MAOSH (som)',   'number',   emp ? (emp.salary||'') : '') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        empInp('empWorkStart', 'ISH BOSHI', 'time', emp ? (emp.workStart||'09:00') : '09:00') +
        empInp('empWorkEnd',   'ISH OXIRI', 'time', emp ? (emp.workEnd||'18:00')   : '18:00') +
      '</div>' +
      '<div>' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">FILIAL <span style="color:#ef4444">*</span></label>' +
        '<select id="empBranchId" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(6,182,212,0.15);border-radius:8px;color:#f1f5f9;font-size:13px">' + branchOptions + '</select>' +
        (branches.length === 0 ? '<div style="font-size:11px;color:#22d3ee;margin-top:4px">⚠️ Avval Filiallar bo\'limidan filial qo\'shing</div>' : '') +
      '</div>' +
      '<div>' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">DAM OLISH KUNI</label>' +
        '<select id="empWeeklyOff" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(6,182,212,0.15);border-radius:8px;color:#f1f5f9;font-size:13px">' + weekOpts + '</select>' +
      '</div>' +
      '<div>' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">ISHCHI RASMI (Yuz ID uchun)</label>' +
        '<div id="empPhotoPreview" style="' + (emp && emp.photo ? '' : 'display:none;') + 'margin-bottom:8px;text-align:center">' +
          '<img id="empPhotoImg" src="' + (emp && emp.photo ? emp.photo : '') + '" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid var(--sx-cyan, #06b6d4)">' +
          '<div style="font-size:11px;margin-top:4px;color:#22c55e">' + (emp && emp.photo ? 'Rasm yuklangan' : '') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<label for="empPhotoInput" style="flex:1;padding:9px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);color:#22d3ee;border-radius:8px;font-size:12px;cursor:pointer;text-align:center">📁 Rasm yuklash</label>' +
          '<input id="empPhotoInput" type="file" accept="image/*" style="display:none" onchange="previewEmpPhoto(this)">' +
          '<button onclick="captureEmpPhoto()" style="flex:1;padding:9px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);color:#4ade80;border-radius:8px;font-size:12px;cursor:pointer">📸 Kamera</button>' +
        '</div>' +
      '</div>' +
      '<div id="empErr" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:10px;border-radius:8px;font-size:13px"></div>' +
      '<button id="empSaveBtn" onclick="saveEmp(\'' + (emp ? emp._id : '') + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,var(--sx-cyan, #06b6d4),#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">' +
        (emp ? '💾 Saqlash' : '+ Qo\'shish') +
      '</button>' +
    '</div>';
}

function empInp(id, label, type, val) {
  return '<div>' +
    '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">' + label + '</label>' +
    '<input id="' + id + '" type="' + type + '" value="' + (val||'') + '" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(6,182,212,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit">' +
  '</div>';
}

function closeEmpModal() {
  document.getElementById('empModal').style.display = 'none';
}

async function saveEmp(empId) {
  var errEl = document.getElementById('empErr');
  if (!errEl) return;
  errEl.style.display = 'none';

  var name      = (document.getElementById('empName')?.value || '').trim();
  var username  = (document.getElementById('empUsername')?.value || '').trim();
  var password  = document.getElementById('empPassword')?.value || '';
  var phone     = (document.getElementById('empPhone')?.value || '').trim();
  var position  = (document.getElementById('empPosition')?.value || '').trim();
  var salary    = Number(document.getElementById('empSalary')?.value) || 0;
  var workStart = document.getElementById('empWorkStart')?.value || '09:00';
  var workEnd   = document.getElementById('empWorkEnd')?.value   || '18:00';
  var branchId  = document.getElementById('empBranchId')?.value  || '';
  var weeklyOff = document.getElementById('empWeeklyOff')?.value || 'sunday';

  if (!name)               { errEl.textContent = t('emp_name_required');    errEl.style.display='block'; return; }
  if (!username)           { errEl.textContent = t('emp_login_required');  errEl.style.display='block'; return; }
  if (!empId && !password) { errEl.textContent = t('emp_password_required');  errEl.style.display='block'; return; }
  if (!branchId)           { errEl.textContent = t('emp_no_branch'); errEl.style.display='block'; return; }

  var photoData = null;
  if (_empPhotoBase64) {
    try {
      var img2 = new Image();
      img2.src = _empPhotoBase64;
      await new Promise(function(r) { img2.onload = r; });
      var cvs = document.createElement('canvas');
      cvs.width = 200; cvs.height = 200;
      var ctx = cvs.getContext('2d');
      var sz = Math.min(img2.width, img2.height);
      ctx.drawImage(img2, (img2.width-sz)/2, (img2.height-sz)/2, sz, sz, 0, 0, 200, 200);
      photoData = cvs.toDataURL('image/jpeg', 0.7);
    } catch(e2) { photoData = null; }
  }

  var body = { name: name, phone: phone, position: position, username: username, salary: salary, workStart: workStart, workEnd: workEnd, branchId: branchId, weeklyOff: weeklyOff };
  if (password)  body.password = password;
  if (photoData) body.photo    = photoData;

  var btn = document.getElementById('empSaveBtn');
  if (btn) { btn.textContent = t('saving'); btn.disabled = true; }

  var url    = empId ? '/admin/employees/' + empId : '/admin/employees';
  var method = empId ? 'PUT' : 'POST';
  var d = await apiFetch(url, { method: method, body: JSON.stringify(body) });

  if (btn) { btn.textContent = empId ? '💾 Saqlash' : '+ Qo\'shish'; btn.disabled = false; }
  if (!d)        { errEl.textContent = t('server_error'); errEl.style.display='block'; return; }
  if (d.error)   { errEl.textContent = d.error;                errEl.style.display='block'; return; }

  closeEmpModal();
  _empPhotoBase64 = null;
  renderEmployees(document.getElementById('mainContent'));
}

async function deleteEmp(id) {
  if (!confirm(t('emp_confirm_delete'))) return;
  var d = await apiFetch('/admin/employees/' + id, { method: 'DELETE' });
  if (d.ok) renderEmployees(document.getElementById('mainContent'));
  else alert('Xato: ' + (d.error||''));
}

// ===================================================
// ===== OFITSIANTLAR ================================
// ===================================================
async function renderWaiters(main) {
  main.innerHTML = '' + skelTable(5) + '';
  var emps = await apiFetch('/admin/employees');
  var waiters = (emps || []).filter(function(e) { return e.role === 'waiter'; });

  var rows = waiters.map(function(e) {
    var tables = (e.tables && e.tables.length) ? e.tables.join(', ') : '—';
    return '<tr style="border-bottom:1px solid rgba(6,182,212,0.08)">' +
      '<td style="padding:12px 8px"><div style="font-size:14px;font-weight:600;color:#f1f5f9">' + e.name + '</div><div style="font-size:11px;color:#64748b">' + (e.phone||'—') + '</div></td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#22d3ee">' + (e.username||'—') + '</td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#f59e0b;font-weight:600">' + tables + '</td>' +
      '<td style="padding:12px 8px"><span style="font-size:11px;padding:3px 8px;border-radius:99px;background:' + (e.active?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)') + ';color:' + (e.active?'#4ade80':'#f87171') + '">' + (e.active?t('emp_active'):t('emp_inactive')) + '</span></td>' +
      '<td style="padding:12px 8px"><div style="display:flex;gap:6px">' +
        '<button onclick="openWaiterModal(' + JSON.stringify(JSON.stringify(e)) + ')" style="padding:5px 10px;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;font-size:11px;cursor:pointer">✏️ ' + t('edit') + '</button>' +
        '<button onclick="deleteWaiter(\'' + e._id + '\')" style="padding:5px 10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;font-size:11px;cursor:pointer">🗑</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9">' + t('page_waiters') + ' <span style="font-size:13px;color:#64748b;font-weight:400">(' + waiters.length + ' ta)</span></div>' +
        '<button onclick="openWaiterModal(null)" style="padding:9px 18px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#000;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">' + t('wt_add') + '</button>' +
      '</div>' +
      '<div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.15);border-radius:12px;padding:14px 18px;margin-bottom:16px;font-size:13px;color:#fbbf24">' +
        '💡 ' + t('wt_hint') + '' +
      '</div>' +
      '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.12);border-radius:12px;overflow:hidden">' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:rgba(245,158,11,0.05)">' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_name') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_login') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('wt_tables') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('status') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('actions') + '</th>' +
          '</tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="5" style="padding:40px;text-align:center;color:#475569">' + t('wt_no_waiters') + '</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</div>' +
    '</div>';
  setPageCache('waiters');
}

function openWaiterModal(empJson) {
  var emp = empJson ? JSON.parse(empJson) : null;
  document.getElementById('waiterModalTitle').textContent = emp ? t('wt_edit') : t('wt_new');
  var tablesVal = emp && emp.tables ? emp.tables.join(', ') : '';
  document.getElementById('waiterModalBody').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:12px">' +
      empInp('wName',     'ISM FAMILIYA', 'text',     emp ? (emp.name||'') : '') +
      empInp('wPhone',    'TELEFON',       'text',     emp ? (emp.phone||'') : '') +
      empInp('wUsername', 'LOGIN',         'text',     emp ? (emp.username||'') : '') +
      empInp('wPassword', 'PAROL' + (emp ? ' (o\'zgartirish uchun)' : ''), 'password', '') +
      '<div>' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">STOLLAR <span style="color:#f59e0b">(vergul bilan: 1, 2, 3)</span></label>' +
        '<input id="wTables" type="text" value="' + tablesVal + '" placeholder="1, 2, 3, 4, 5" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(245,158,11,0.25);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit">' +
        '<div style="font-size:11px;color:#64748b;margin-top:4px">Bu ofitsiantga biriktirilgan stollar raqami</div>' +
      '</div>' +
      '<div id="wErr" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:10px;border-radius:8px;font-size:13px"></div>' +
      '<button id="wSaveBtn" onclick="saveWaiter(\'' + (emp ? emp._id : '') + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#000;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">' +
        (emp ? '💾 Saqlash' : '+ Qo\'shish') +
      '</button>' +
    '</div>';
  document.getElementById('waiterModal').style.display = 'flex';
}

function closeWaiterModal() { document.getElementById('waiterModal').style.display = 'none'; }

async function saveWaiter(empId) {
  var errEl = document.getElementById('wErr');
  errEl.style.display = 'none';
  var name     = (document.getElementById('wName')?.value || '').trim();
  var phone    = (document.getElementById('wPhone')?.value || '').trim();
  var username = (document.getElementById('wUsername')?.value || '').trim();
  var password = document.getElementById('wPassword')?.value || '';
  var tablesRaw = (document.getElementById('wTables')?.value || '').trim();
  var tables   = tablesRaw ? tablesRaw.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [];

  if (!name)               { errEl.textContent = t('emp_name_required');   errEl.style.display='block'; return; }
  if (!username)           { errEl.textContent = t('emp_login_required'); errEl.style.display='block'; return; }
  if (!empId && !password) { errEl.textContent = t('emp_password_required'); errEl.style.display='block'; return; }

  var body = { name: name, phone: phone, username: username, position: 'Ofitsiant', role: 'waiter', tables: tables };
  if (password) body.password = password;

  var btn = document.getElementById('wSaveBtn');
  if (btn) { btn.textContent = t('saving'); btn.disabled = true; }

  var url    = empId ? '/admin/employees/' + empId : '/admin/employees';
  var method = empId ? 'PUT' : 'POST';
  var d = await apiFetch(url, { method: method, body: JSON.stringify(body) });

  if (btn) { btn.textContent = empId ? '💾 Saqlash' : '+ Qo\'shish'; btn.disabled = false; }
  if (!d)      { errEl.textContent = t('server_error'); errEl.style.display='block'; return; }
  if (d.error) { errEl.textContent = d.error;                errEl.style.display='block'; return; }

  closeWaiterModal();
  renderWaiters(document.getElementById('mainContent'));
}

async function deleteWaiter(id) {
  if (!confirm(t('wt_confirm_delete'))) return;
  var d = await apiFetch('/admin/employees/' + id, { method: 'DELETE' });
  if (d.ok) renderWaiters(document.getElementById('mainContent'));
  else alert('Xato: ' + (d.error||''));
}

// ===================================================
// ===== OSHPAZLAR ===================================
// ===================================================
async function renderChefs(main) {
  main.innerHTML = '' + skelTable(5) + '';
  var emps = await apiFetch('/admin/employees');
  var chefs = (emps || []).filter(function(e) { return e.role === 'chef'; });

  var rows = chefs.map(function(e) {
    return '<tr style="border-bottom:1px solid rgba(6,182,212,0.08)">' +
      '<td style="padding:12px 8px"><div style="font-size:14px;font-weight:600;color:#f1f5f9">' + e.name + '</div><div style="font-size:11px;color:#64748b">' + (e.phone||'—') + '</div></td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#22d3ee">' + (e.username||'—') + '</td>' +
      '<td style="padding:12px 8px"><span style="font-size:11px;padding:3px 8px;border-radius:99px;background:' + (e.active?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)') + ';color:' + (e.active?'#4ade80':'#f87171') + '">' + (e.active?t('emp_active'):t('emp_inactive')) + '</span></td>' +
      '<td style="padding:12px 8px"><div style="display:flex;gap:6px">' +
        '<button onclick="openChefModal(' + JSON.stringify(JSON.stringify(e)) + ')" style="padding:5px 10px;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;font-size:11px;cursor:pointer">✏️ ' + t('edit') + '</button>' +
        '<button onclick="deleteChef(\'' + e._id + '\')" style="padding:5px 10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;font-size:11px;cursor:pointer">🗑</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9">' + t('page_chefs') + ' <span style="font-size:13px;color:#64748b;font-weight:400">(' + chefs.length + ' ta)</span></div>' +
        '<button onclick="openChefModal(null)" style="padding:9px 18px;background:linear-gradient(135deg,#f97316,#ea580c);border:none;color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">' + t('ch_add') + '</button>' +
      '</div>' +
      '<div style="background:rgba(249,115,22,0.05);border:1px solid rgba(249,115,22,0.15);border-radius:12px;padding:14px 18px;margin-bottom:16px;font-size:13px;color:#fb923c">' +
        '💡 ' + t('ch_hint') + '' +
      '</div>' +
      '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.12);border-radius:12px;overflow:hidden">' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:rgba(249,115,22,0.05)">' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_name') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_login') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('status') + '</th>' +
            '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('actions') + '</th>' +
          '</tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="4" style="padding:40px;text-align:center;color:#475569">' + t('ch_no_chefs') + '</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</div>' +
    '</div>';
  setPageCache('chefs');
}

function openChefModal(empJson) {
  var emp = empJson ? JSON.parse(empJson) : null;
  document.getElementById('chefModalTitle').textContent = emp ? t('ch_edit') : t('ch_new');
  document.getElementById('chefModalBody').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:12px">' +
      empInp('chefName',     'ISM FAMILIYA', 'text',     emp ? (emp.name||'') : '') +
      empInp('chefPhone',    'TELEFON',       'text',     emp ? (emp.phone||'') : '') +
      empInp('chefUsername', 'LOGIN',         'text',     emp ? (emp.username||'') : '') +
      empInp('chefPassword', 'PAROL' + (emp ? ' (o\'zgartirish uchun)' : ''), 'password', '') +
      '<div id="chefErr" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:10px;border-radius:8px;font-size:13px"></div>' +
      '<button id="chefSaveBtn" onclick="saveChef(\'' + (emp ? emp._id : '') + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,#f97316,#ea580c);border:none;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">' +
        (emp ? '💾 Saqlash' : '+ Qo\'shish') +
      '</button>' +
    '</div>';
  document.getElementById('chefModal').style.display = 'flex';
}

function closeChefModal() { document.getElementById('chefModal').style.display = 'none'; }

async function saveChef(empId) {
  var errEl = document.getElementById('chefErr');
  errEl.style.display = 'none';
  var name     = (document.getElementById('chefName')?.value || '').trim();
  var phone    = (document.getElementById('chefPhone')?.value || '').trim();
  var username = (document.getElementById('chefUsername')?.value || '').trim();
  var password = document.getElementById('chefPassword')?.value || '';

  if (!name)               { errEl.textContent = t('emp_name_required');   errEl.style.display='block'; return; }
  if (!username)           { errEl.textContent = t('emp_login_required'); errEl.style.display='block'; return; }
  if (!empId && !password) { errEl.textContent = t('emp_password_required'); errEl.style.display='block'; return; }

  var body = { name: name, phone: phone, username: username, position: 'Oshpaz', role: 'chef' };
  if (password) body.password = password;

  var btn = document.getElementById('chefSaveBtn');
  if (btn) { btn.textContent = t('saving'); btn.disabled = true; }

  var url    = empId ? '/admin/employees/' + empId : '/admin/employees';
  var method = empId ? 'PUT' : 'POST';
  var d = await apiFetch(url, { method: method, body: JSON.stringify(body) });

  if (btn) { btn.textContent = empId ? '💾 Saqlash' : '+ Qo\'shish'; btn.disabled = false; }
  if (!d)      { errEl.textContent = t('server_error'); errEl.style.display='block'; return; }
  if (d.error) { errEl.textContent = d.error;                errEl.style.display='block'; return; }

  closeChefModal();
  renderChefs(document.getElementById('mainContent'));
}

async function deleteChef(id) {
  if (!confirm(t('ch_confirm_delete'))) return;
  var d = await apiFetch('/admin/employees/' + id, { method: 'DELETE' });
  if (d.ok) renderChefs(document.getElementById('mainContent'));
  else alert('Xato: ' + (d.error||''));
}

// ===================================================
// ===== ATTENDANCE — FILIAL FILTR BILAN =============
// ===================================================
async function renderAttendance(main, selectedBranch) {
  selectedBranch = selectedBranch || '';
  main.innerHTML = '' + skelTable(5) + '';

  var bd = await apiFetch('/admin/branches');
  var branches = (bd && bd.branches) ? bd.branches : [];

  var url = '/admin/attendance/today' + (selectedBranch ? '?branchId=' + selectedBranch : '');
  var d = await apiFetch(url);
  if (!d.ok) { main.innerHTML = '<div style="color:#f87171;padding:20px">' + t('load_error') + '</div>'; return; }

  var sum   = d.summary;
  var emps  = d.employees || [];
  var today = new Date().toLocaleDateString('uz-UZ', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  var branchBtns =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
      '<button onclick="renderAttendance(document.getElementById(\'mainContent\'),\'\')" style="padding:6px 16px;border-radius:8px;border:1px solid ' + (!selectedBranch ? 'var(--sx-cyan, #06b6d4)' : 'rgba(6,182,212,0.2)') + ';background:' + (!selectedBranch ? 'rgba(6,182,212,0.15)' : 'transparent') + ';color:' + (!selectedBranch ? '#22d3ee' : '#64748b') + ';font-size:12px;cursor:pointer;font-family:inherit">🏢 ' + t('all') + '</button>' +
      branches.map(function(b) {
        var act = selectedBranch === b._id;
        return '<button onclick="renderAttendance(document.getElementById(\'mainContent\'),\'' + b._id + '\')" style="padding:6px 16px;border-radius:8px;border:1px solid ' + (act ? 'var(--sx-cyan, #06b6d4)' : 'rgba(6,182,212,0.2)') + ';background:' + (act ? 'rgba(6,182,212,0.15)' : 'transparent') + ';color:' + (act ? '#22d3ee' : '#64748b') + ';font-size:12px;cursor:pointer;font-family:inherit">' + b.name + '</button>';
      }).join('') +
    '</div>';

  var rows = emps.map(function(r) {
    var statusColor = r.status === 'keldi' ? '#22c55e' : '#ef4444';
    var lateTag = r.lateMinutes > 0
      ? '<span style="font-size:10px;background:rgba(245,158,11,0.15);color:#22d3ee;padding:2px 6px;border-radius:99px;margin-left:6px">+' + formatMins(r.lateMinutes) + '</span>'
      : '';
    var workedStr = r.totalMinutes ? formatMins(r.totalMinutes) : (r.checkIn && !r.checkOut ? '<span style="color:var(--sx-cyan, #06b6d4)">' + t('att_working') + '</span>' : '—');
    return '<tr style="border-bottom:1px solid rgba(6,182,212,0.07)">' +
      '<td style="padding:12px 10px"><div style="font-size:13px;font-weight:600;color:#f1f5f9">' + r.employee.name + lateTag + '</div><div style="font-size:11px;color:#64748b">' + (r.employee.position||'—') + '</div></td>' +
      '<td style="padding:12px 10px"><span style="font-size:11px;padding:3px 9px;border-radius:99px;background:' + (r.status==='keldi'?'rgba(34,197,94,0.12)':r.status==='dam'?'rgba(167,139,250,0.12)':'rgba(239,68,68,0.12)') + ';color:' + (r.status==='keldi'?'#22c55e':r.status==='dam'?'#a78bfa':'#ef4444') + ';font-weight:600">' + (r.status==='keldi'?'✅ '+t('att_present'):r.status==='dam'?'🌴 '+t('att_dayoff'):'❌ '+t('att_absent')) + '</span></td>' +
      '<td style="padding:12px 10px;font-size:13px;color:#94a3b8">' + (r.checkIn||'—') + '</td>' +
      '<td style="padding:12px 10px;font-size:13px;color:#94a3b8">' + (r.checkOut||'—') + '</td>' +
      '<td style="padding:12px 10px;font-size:13px;color:#22c55e">' + workedStr + '</td>' +
      '<td style="padding:12px 10px"><button onclick="openManualModal(\'' + r.employee._id + '\',\'' + r.employee.name + '\')" style="padding:4px 10px;background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.25);color:#22d3ee;border-radius:6px;font-size:11px;cursor:pointer">✏️</button></td>' +
    '</tr>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:4px;text-transform:capitalize">' + today + '</div>' +
      '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:12px">📋 ' + t('page_attendance') + '</div>' +
      branchBtns +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">' +
        attSumBox('👥', t('att_total'), sum.total, 'var(--sx-cyan, #06b6d4)') +
        attSumBox('✅', t('att_present'), sum.came, '#22c55e') +
        attSumBox('⚠️', t('att_late'), sum.late, '#f59e0b') +
        attSumBox('❌', t('att_absent'), sum.absent, '#ef4444') +
      '</div>' +
      '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.12);border-radius:12px;overflow:hidden">' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:rgba(6,182,212,0.05)">' +
            '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('emp_name') + '</th>' +
            '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('status') + '</th>' +
            '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('att_checkin') + '</th>' +
            '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('att_checkout') + '</th>' +
            '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('att_worked') + '</th>' +
            '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">' + t('actions') + '</th>' +
          '</tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="6" style="padding:40px;text-align:center;color:#475569">' + t('emp_no_employees') + '</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</div>' +
      '<div id="manualModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;padding:16px">' +
        '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.15);border-radius:16px;padding:24px;width:100%;max-width:380px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
            '<div id="manualTitle" style="font-size:15px;font-weight:700;color:#f1f5f9">' + t('att_manual') + '</div>' +
            '<button onclick="closeManualModal()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer">✕</button>' +
          '</div>' +
          '<div id="manualBody"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  setPageCache('attendance');
}

function attSumBox(icon, label, val, color) {
  return '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.12);border-radius:10px;padding:12px;text-align:center">' +
    '<div style="font-size:20px">' + icon + '</div>' +
    '<div style="font-size:22px;font-weight:700;color:' + color + '">' + val + '</div>' +
    '<div style="font-size:10px;color:#64748b;margin-top:2px">' + label + '</div>' +
  '</div>';
}

function openManualModal(empId, empName) {
  document.getElementById('manualTitle').textContent = empName + ' — davomat';
  var today = new Date().toISOString().split('T')[0];
  document.getElementById('manualBody').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<div><label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">' + t('status') + '</label>' +
        '<select id="manualStatus" style="width:100%;padding:10px;background:#0f172a;border:1px solid rgba(6,182,212,0.15);border-radius:8px;color:#f1f5f9;font-size:13px">' +
          '<option value="keldi">✅ Keldi</option><option value="kelmadi">❌ Kelmadi</option><option value="kasal">🤒 Kasal</option><option value="tatil">🏖 Ta\'til</option>' +
        '</select></div>' +
      empInp('manualCheckIn',  'KELGAN VAQT', 'time', '') +
      empInp('manualCheckOut', 'KETGAN VAQT', 'time', '') +
      empInp('manualNote',     'IZOH',        'text', '') +
      '<button onclick="saveManual(\'' + empId + '\',\'' + today + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,var(--sx-cyan, #06b6d4),#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">💾 Saqlash</button>' +
    '</div>';
  document.getElementById('manualModal').style.display = 'flex';
}

function closeManualModal() {
  document.getElementById('manualModal').style.display = 'none';
}

async function saveManual(empId, date) {
  var body = {
    employeeId: empId, date: date,
    status:   document.getElementById('manualStatus').value,
    checkIn:  document.getElementById('manualCheckIn').value  || null,
    checkOut: document.getElementById('manualCheckOut').value || null,
    note:     document.getElementById('manualNote').value     || ''
  };
  var d = await apiFetch('/admin/attendance/manual', { method:'POST', body: JSON.stringify(body) });
  if (d.ok) { closeManualModal(); renderAttendance(document.getElementById('mainContent'), ''); }
  else alert('Xato: ' + (d.error||''));
}

// ===================================================
// ===== EMP REPORT — FILIAL FILTR BILAN =============
// ===================================================
async function renderEmpReport(main) {
  var now   = new Date();
  var month = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9">💰 ' + t('page_reports') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<select id="reportBranch" style="padding:8px 12px;background:#1e293b;border:1px solid rgba(6,182,212,0.2);border-radius:8px;color:#f1f5f9;font-size:13px;font-family:inherit"><option value="">🏢 Barcha filiallar</option></select>' +
          '<input type="month" id="reportMonth" value="' + month + '" style="padding:8px 12px;background:#1e293b;border:1px solid rgba(6,182,212,0.2);border-radius:8px;color:#f1f5f9;font-size:13px">' +
        '</div>' +
      '</div>' +
      '<div id="reportContent">' + skelReport() + '</div>' +
    '</div>';

  // Filiallarni va hisobotni parallel yuklash
  var branchPromise = apiFetch('/admin/branches');

  document.getElementById('reportMonth').addEventListener('change', loadReport);
  document.getElementById('reportBranch').addEventListener('change', loadReport);

  var bd = await branchPromise;
  var branches = (bd && bd.branches) ? bd.branches : [];
  if (branches.length) {
    var branchEl = document.getElementById('reportBranch');
    if (branchEl) {
      branchEl.innerHTML = '<option value="">🏢 Barcha filiallar</option>' +
        branches.map(function(b) {
          return '<option value="' + b._id + '">' + b.name + '</option>';
        }).join('');
    }
  }

  await loadReport();
}

async function loadReport() {
  var monthEl  = document.getElementById('reportMonth');
  var branchEl = document.getElementById('reportBranch');
  if (!monthEl) return;
  var month    = monthEl.value;
  var branchId = branchEl ? branchEl.value : '';

  var content = document.getElementById('reportContent');
  if (!content) return;
  content.innerHTML = skelReport();

  var d = await apiFetch('/admin/attendance/report?month=' + month + (branchId ? '&branchId=' + branchId : ''));

  if (!d || !d.ok || !d.report) {
    var errMsg = t('rep_error');
    if (d && d.error === 'MODULE_DISABLED') errMsg = d.message || t('rep_module_disabled');
    else if (d && d.error) errMsg = d.error;
    content.innerHTML = '<div style="text-align:center;padding:40px"><div style="font-size:36px;margin-bottom:12px">📊</div><div style="color:#f87171;font-size:14px">' + errMsg + '</div></div>';
    return;
  }

  var totalSalary  = d.report.reduce(function(s,r){ return s + (r.stats.earnedSalary||0); }, 0);
  var totalWorkers = d.report.length;

  var chartBars = d.report.map(function(r) {
    var s = r.stats;
    var pct = s.workingDaysInMonth > 0 ? Math.round((s.workedDays/s.workingDaysInMonth)*100) : 0;
    var color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:40px">' +
      '<div style="font-size:10px;font-weight:600;color:' + color + '">' + pct + '%</div>' +
      '<div style="width:28px;background:#0f172a;border-radius:4px;height:80px;display:flex;align-items:flex-end">' +
        '<div style="width:100%;height:' + pct + '%;background:' + color + ';border-radius:4px;min-height:3px"></div>' +
      '</div>' +
      '<div style="font-size:9px;color:#64748b;text-align:center;max-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.employee.name.split(' ')[0] + '</div>' +
    '</div>';
  }).join('');

  var heatRows = d.report.map(function(r) {
    var recs = r.records || [];
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var dt = new Date(); dt.setDate(dt.getDate()-i);
      var ds = dt.toISOString().split('T')[0];
      var rec = recs.find(function(x){ return x.date && x.date.startsWith(ds); });
      var color = !rec ? '#1e293b' : rec.status==='keldi' ? '#22c55e' : rec.status==='dam' ? '#a78bfa' : rec.status==='kasal' ? '#22d3ee' : '#ef4444';
      var title = !rec ? 'Ma\'lumot yo\'q' : rec.status==='keldi' ? (rec.checkIn||'')+(rec.checkOut?' → '+rec.checkOut:'') : rec.status;
      days.push('<div title="' + ds + ': ' + title + '" style="width:20px;height:20px;border-radius:4px;background:' + color + '"></div>');
    }
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<div style="font-size:12px;color:#94a3b8;width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.employee.name.split(' ')[0] + '</div>' +
      '<div style="display:flex;gap:3px">' + days.join('') + '</div>' +
    '</div>';
  }).join('');

  var cards = d.report.map(function(r) {
    var e = r.employee, s = r.stats;
    var pct = s.workingDaysInMonth > 0 ? Math.min(100, Math.round((s.workedDays/s.workingDaysInMonth)*100)) : 0;
    var pctColor = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
    return '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
        '<div><div style="font-size:14px;font-weight:700;color:#f1f5f9">' + e.name + '</div><div style="font-size:11px;color:#64748b;margin-top:2px">' + (e.position||'—') + '</div></div>' +
        '<div style="text-align:right"><div style="font-size:15px;font-weight:700;color:#22c55e">' + fmtSalary(s.earnedSalary) + '</div><div style="font-size:10px;color:#64748b">Oylik: ' + fmtSalary(e.salary) + '</div></div>' +
      '</div>' +
      '<div style="background:rgba(6,182,212,0.07);border:1px solid rgba(6,182,212,0.15);border-radius:8px;padding:10px;margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:#64748b">Oy ish kunlari</span><span style="color:#f1f5f9;font-weight:600">' + s.workingDaysInMonth + ' kun</span></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:#64748b">1 kunlik maosh</span><span style="color:var(--sx-cyan, #06b6d4);font-weight:600">' + fmtSalary(s.dailySalary) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#64748b">Kelgan kunlar</span><span style="color:#f1f5f9;font-weight:600">' + s.workedDays + ' / ' + s.workingDaysInMonth + ' kun</span></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">' +
        miniStat('⏱', formatMins(s.totalMinutes), '#22c55e') +
        miniStat('⚠️', s.lateCount + ' kech', '#f59e0b') +
        miniStat('❌', s.absentCount + ' yoq', '#ef4444') +
      '</div>' +
      '<div><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px;color:#64748b">' + t('rep_attendance') + '</span><span style="font-size:11px;font-weight:600;color:' + pctColor + '">' + pct + '%</span></div>' +
        '<div style="background:#0f172a;border-radius:99px;height:6px"><div style="height:100%;width:' + pct + '%;background:' + pctColor + ';border-radius:99px"></div></div>' +
      '</div>' +
    '</div>';
  }).join('');

  content.innerHTML =
    '<div style="background:linear-gradient(135deg,rgba(6,182,212,0.1),rgba(34,197,94,0.08));border:1px solid rgba(6,182,212,0.2);border-radius:12px;padding:16px;margin-bottom:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div><div style="font-size:11px;color:#64748b;margin-bottom:4px">JAMI MAOSH</div><div style="font-size:24px;font-weight:700;color:#f1f5f9">' + fmtSalary(totalSalary) + '</div></div>' +
        '<div style="text-align:right"><div style="font-size:11px;color:#64748b;margin-bottom:4px">ISHCHILAR</div><div style="font-size:24px;font-weight:700;color:var(--sx-cyan, #06b6d4)">' + totalWorkers + ' ta</div></div>' +
      '</div>' +
    '</div>' +
    '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px;margin-bottom:16px">' +
      '<div style="font-size:12px;font-weight:600;color:#64748b;letter-spacing:1px;margin-bottom:16px">📊 DAVOMAT FOIZI</div>' +
      '<div style="display:flex;gap:8px;align-items:flex-end;overflow-x:auto;padding-bottom:4px">' + chartBars + '</div>' +
      '<div style="display:flex;gap:16px;margin-top:12px">' +
        '<span style="font-size:10px;color:#22c55e">● 90%+ yaxshi</span>' +
        '<span style="font-size:10px;color:#22d3ee">● 70–90% o\'rtacha</span>' +
        '<span style="font-size:10px;color:#ef4444">● 70%- past</span>' +
      '</div>' +
    '</div>' +
    '<div style="background:#1e293b;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px;margin-bottom:16px">' +
      '<div style="font-size:12px;font-weight:600;color:#64748b;letter-spacing:1px;margin-bottom:4px">🗓 OXIRGI 7 KUN</div>' +
      '<div style="display:flex;gap:3px;margin-bottom:10px;padding-left:98px">' +
        (function(){ var l=[]; for(var i=6;i>=0;i--){ var dt=new Date(); dt.setDate(dt.getDate()-i); var days=['Ya','Du','Se','Ch','Pa','Ju','Sh']; l.push('<div style="width:20px;text-align:center;font-size:9px;color:#475569">'+days[dt.getDay()]+'</div>'); } return l.join(''); })() +
      '</div>' +
      heatRows +
      '<div style="display:flex;gap:12px;margin-top:8px">' +
        '<span style="font-size:10px;color:#22c55e">● Keldi</span>' +
        '<span style="font-size:10px;color:#ef4444">● Kelmadi</span>' +
        '<span style="font-size:10px;color:#a78bfa">● Dam kuni</span>' +
        '<span style="font-size:10px;color:#22d3ee">● Kasal</span>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:12px;font-weight:600;color:#64748b;letter-spacing:1px;margin-bottom:10px">👥 ISHCHILAR HISOBOTI</div>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' + (cards || '<div style="text-align:center;padding:40px;color:#475569">Ma\'lumot yo\'q</div>') + '</div>';
  setPageCache('empReport');
}

function miniStat(icon, val, color) {
  return '<div style="background:rgba(15,23,42,0.5);border-radius:8px;padding:8px 6px;text-align:center">' +
    '<div style="font-size:14px">' + icon + '</div>' +
    '<div style="font-size:11px;font-weight:600;color:' + color + ';margin-top:2px">' + val + '</div>' +
  '</div>';
}

// ===================================================
// ===== EMP PHOTO FUNCTIONS =========================
// ===================================================
var _empPhotoBase64 = null;
var _empCamStream   = null;

function previewEmpPhoto(input) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    _empPhotoBase64 = e.target.result;
    var img = document.getElementById('empPhotoImg');
    var prv = document.getElementById('empPhotoPreview');
    if (img) img.src = _empPhotoBase64;
    if (prv) prv.style.display = 'block';
  };
  reader.readAsDataURL(input.files[0]);
}

function captureEmpPhoto() {
  var existing = document.getElementById('empCamWrap');
  if (existing) existing.remove();
  var wrap = document.createElement('div');
  wrap.id  = 'empCamWrap';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';
  wrap.innerHTML =
    '<div style="color:#f1f5f9;font-size:15px;font-weight:600;margin-bottom:14px">📸 Ishchi rasmi</div>' +
    '<video id="empCamVideo" autoplay playsinline style="width:100%;max-width:340px;border-radius:12px;border:2px solid var(--sx-cyan, #06b6d4);background:#000;display:block"></video>' +
    '<canvas id="empCamCanvas" style="display:none"></canvas>' +
    '<div style="display:flex;gap:12px;margin-top:16px">' +
      '<button onclick="closeEmpCam()" style="padding:11px 24px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit">Bekor</button>' +
      '<button onclick="snapEmpCam()" style="padding:11px 24px;background:linear-gradient(135deg,var(--sx-cyan, #06b6d4),#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">📸 Olish</button>' +
    '</div>';
  document.body.appendChild(wrap);
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false })
    .then(function(stream) {
      _empCamStream = stream;
      var video = document.getElementById('empCamVideo');
      if (video) video.srcObject = stream;
    })
    .catch(function(err) { closeEmpCam(); alert('Kamera ochilmadi: ' + err.message); });
}

function closeEmpCam() {
  if (_empCamStream) { _empCamStream.getTracks().forEach(function(t) { t.stop(); }); _empCamStream = null; }
  var w = document.getElementById('empCamWrap');
  if (w) w.remove();
}

function snapEmpCam() {
  var video  = document.getElementById('empCamVideo');
  var canvas = document.getElementById('empCamCanvas');
  if (!video || !canvas) return;
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0);
  _empPhotoBase64 = canvas.toDataURL('image/jpeg', 0.85);
  closeEmpCam();
  var img = document.getElementById('empPhotoImg');
  var prv = document.getElementById('empPhotoPreview');
  if (img) img.src = _empPhotoBase64;
  if (prv) prv.style.display = 'block';
}

// ===================================================
// ===== BRANCHES ====================================
// ===================================================
var branchMap = null;
var branchMarker = null;

async function renderBranches(main) {
  main.innerHTML = '' + skelTable(5) + '';
  var d = await apiFetch('/admin/branches');
  var branches = (d && d.branches) ? d.branches : [];

  var cards = branches.map(function(b) {
    return '<div style="background:#0f172a;border:1px solid rgba(6,182,212,0.1);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:600;color:#f1f5f9">' + b.name + '</div>' +
        '<div style="font-size:11px;color:#64748b;margin-top:3px">' + (b.address||'Manzil kiritilmagan') + '</div>' +
        (b.lat ? '<div style="font-size:11px;color:var(--sx-cyan, #06b6d4);margin-top:2px">📍 ' + b.lat.toFixed(5) + ', ' + b.lng.toFixed(5) + ' · ' + (b.radius||100) + 'm</div>' : '<div style="font-size:11px;color:#22d3ee;margin-top:2px">⚠️ Lokatsiya belgilanmagan</div>') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button onclick="openBranchModal(' + JSON.stringify(JSON.stringify(b)) + ')" style="padding:6px 12px;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:7px;font-size:12px;cursor:pointer">✏️</button>' +
        '<button onclick="deleteBranch(\'' + b._id + '\')" style="padding:6px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:7px;font-size:12px;cursor:pointer">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9">' + t('page_branches') + ' <span style="font-size:13px;color:#64748b;font-weight:400">(' + branches.length + ' ta)</span></div>' +
        '<button onclick="openBranchModal(null)" style="padding:9px 18px;background:linear-gradient(135deg,var(--sx-cyan, #06b6d4),#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">' + t('br_add') + '</button>' +
      '</div>' +
      (branches.length ? '<div style="display:flex;flex-direction:column;gap:10px">' + cards + '</div>' :
        '<div style="text-align:center;padding:60px;color:#475569">' +
          '<div style="font-size:40px;margin-bottom:12px">🏢</div>' +
          '<div style="margin-bottom:16px">Hali filial qo\'shilmagan</div>' +
          '<button onclick="openBranchModal(null)" style="padding:10px 24px;background:linear-gradient(135deg,var(--sx-cyan, #06b6d4),#1d4ed8);border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:14px">+ Birinchi filial qo\'shish</button>' +
        '</div>') +
    '</div>';
  setPageCache('branches');
}

function openBranchModal(branchJson) {
  var b = branchJson ? JSON.parse(branchJson) : null;
  document.getElementById('branchModalTitle').textContent = b ? t('br_edit') : t('br_new');
  document.getElementById('branchModalBody').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:14px">' +
      empInp('bName',    'FILIAL NOMI',    'text',   b ? (b.name||'')    : '') +
      empInp('bAddress', 'MANZIL',         'text',   b ? (b.address||'') : '') +
      empInp('bRadius',  'RADIUS (metr)',  'number', b ? (b.radius||100) : 100) +
      '<div>' +
        '<div style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;margin-bottom:8px">LOKATSIYA (kartadan tanlang)</div>' +
        '<div id="branchMapEl" style="height:280px;border-radius:10px;border:1px solid rgba(6,182,212,0.2);overflow:hidden;background:#0f172a"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
          '<div><label style="font-size:10px;color:#64748b;letter-spacing:1px;display:block;margin-bottom:4px">KENGLIK (LAT)</label>' +
            '<input id="bLat" type="number" step="0.000001" value="' + (b && b.lat ? b.lat : '') + '" style="width:100%;padding:8px;background:#0f172a;border:1px solid rgba(6,182,212,0.15);border-radius:7px;color:#f1f5f9;font-size:12px;box-sizing:border-box" oninput="updateMarkerFromInputs()"></div>' +
          '<div><label style="font-size:10px;color:#64748b;letter-spacing:1px;display:block;margin-bottom:4px">UZUNLIK (LNG)</label>' +
            '<input id="bLng" type="number" step="0.000001" value="' + (b && b.lng ? b.lng : '') + '" style="width:100%;padding:8px;background:#0f172a;border:1px solid rgba(6,182,212,0.15);border-radius:7px;color:#f1f5f9;font-size:12px;box-sizing:border-box" oninput="updateMarkerFromInputs()"></div>' +
        '</div>' +
        '<button onclick="useMyLocation()" style="margin-top:8px;width:100%;padding:9px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);color:#4ade80;border-radius:8px;font-size:13px;cursor:pointer">📍 Mening joylashuvimni ishlatish</button>' +
      '</div>' +
      '<div id="bErr" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:10px;border-radius:8px;font-size:13px"></div>' +
      '<button onclick="saveBranch(\'' + (b ? b._id : '') + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,var(--sx-cyan, #06b6d4),#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">' + (b ? '💾 Saqlash' : '+ Qo\'shish') + '</button>' +
    '</div>';

  document.getElementById('branchModal').style.display = 'flex';

  setTimeout(function() {
    if (branchMap) { branchMap.remove(); branchMap = null; branchMarker = null; }
    var initLat = b && b.lat ? b.lat : 41.2995;
    var initLng = b && b.lng ? b.lng : 69.2401;
    branchMap = L.map('branchMapEl').setView([initLat, initLng], b && b.lat ? 16 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(branchMap);
    if (b && b.lat && b.lng) {
      branchMarker = L.marker([b.lat, b.lng], { draggable: true }).addTo(branchMap);
      branchMarker.on('dragend', function(e) {
        var pos = e.target.getLatLng();
        document.getElementById('bLat').value = pos.lat.toFixed(6);
        document.getElementById('bLng').value = pos.lng.toFixed(6);
      });
    }
    branchMap.on('click', function(e) {
      document.getElementById('bLat').value = e.latlng.lat.toFixed(6);
      document.getElementById('bLng').value = e.latlng.lng.toFixed(6);
      if (branchMarker) { branchMarker.setLatLng([e.latlng.lat, e.latlng.lng]); }
      else {
        branchMarker = L.marker([e.latlng.lat, e.latlng.lng], { draggable: true }).addTo(branchMap);
        branchMarker.on('dragend', function(ev) {
          document.getElementById('bLat').value = ev.target.getLatLng().lat.toFixed(6);
          document.getElementById('bLng').value = ev.target.getLatLng().lng.toFixed(6);
        });
      }
    });
  }, 100);
}

function updateMarkerFromInputs() {
  var lat = parseFloat(document.getElementById('bLat').value);
  var lng = parseFloat(document.getElementById('bLng').value);
  if (!lat || !lng || !branchMap) return;
  if (branchMarker) { branchMarker.setLatLng([lat, lng]); }
  else { branchMarker = L.marker([lat, lng], { draggable: true }).addTo(branchMap); }
  branchMap.setView([lat, lng], 16);
}

function useMyLocation() {
  if (!navigator.geolocation) { alert('GPS mavjud emas'); return; }
  navigator.geolocation.getCurrentPosition(function(pos) {
    document.getElementById('bLat').value = pos.coords.latitude.toFixed(6);
    document.getElementById('bLng').value = pos.coords.longitude.toFixed(6);
    updateMarkerFromInputs();
  }, function() { alert('GPS ruxsati berilmadi'); });
}

function closeBranchModal() {
  if (branchMap) { branchMap.remove(); branchMap = null; branchMarker = null; }
  document.getElementById('branchModal').style.display = 'none';
}

async function saveBranch(id) {
  var errEl = document.getElementById('bErr');
  errEl.style.display = 'none';
  var name    = document.getElementById('bName').value.trim();
  var address = document.getElementById('bAddress').value.trim();
  var radius  = Number(document.getElementById('bRadius').value) || 100;
  var lat     = parseFloat(document.getElementById('bLat').value) || null;
  var lng     = parseFloat(document.getElementById('bLng').value) || null;
  if (!name) { errEl.textContent = t('br_no_name'); errEl.style.display='block'; return; }
  var d = await apiFetch(id ? '/admin/branches/' + id : '/admin/branches', { method: id ? 'PUT' : 'POST', body: JSON.stringify({ name: name, address: address, lat: lat, lng: lng, radius: radius }) });
  if (d.ok) { closeBranchModal(); renderBranches(document.getElementById('mainContent')); }
  else { errEl.textContent = d.error || 'Xato yuz berdi'; errEl.style.display = 'block'; }
}

async function deleteBranch(id) {
  if (!confirm(t('br_confirm_delete'))) return;
  var d = await apiFetch('/admin/branches/' + id, { method: 'DELETE' });
  if (d.ok) renderBranches(document.getElementById('mainContent'));
}

// ===================================================
// ===== NOTIFICATION BADGE POLLING ==================
// ===================================================
var notifPollInterval = null;
async function pollNotifications() {
  try {
    var d = await apiFetch('/admin/notifications?unreadOnly=true&limit=1');
    if (d.ok) {
      var badge = document.getElementById('notifBadge');
      if (badge) {
        if (d.unreadCount > 0) {
          badge.textContent = d.unreadCount > 99 ? '99+' : d.unreadCount;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }
    }
  } catch(e) {}
}
function startNotifPolling() {
  pollNotifications();
  if (notifPollInterval) clearInterval(notifPollInterval);
  notifPollInterval = setInterval(pollNotifications, 30000);
}

// ===================================================
// ===== INVENTORY PAGE ==============================
// ===================================================
var inventoryChart = null;

async function renderInventory(main) {
  main.innerHTML = '<div class="page"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px"><div><h1 class="text-2xl font-bold" style="color:#f1f5f9">📦 Ombor boshqaruvi</h1><p class="text-sm mt-1" style="color:#64748b">Mahsulotlar zaxirasi va kirim-chiqim</p></div><button onclick="openInvModal()" class="px-4 py-2 rounded-xl text-sm font-bold text-white" style="background:var(--sx-grad)">+ Yangi mahsulot</button></div><div id="invSummary" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"></div><div id="invTable" style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;overflow:hidden">' + skelTable(4) + '</div></div>';
  await loadInventory();
  setPageCache('inventory');
}

async function loadInventory() {
  var d = await apiFetch('/admin/inventory');
  var s = await apiFetch('/admin/inventory/summary/all');

  // Summary cards
  var sumEl = document.getElementById('invSummary');
  if (sumEl && s.ok) {
    sumEl.innerHTML =
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px"><div class="text-xs uppercase tracking-widest" style="color:#64748b">Jami mahsulot</div><div class="text-2xl font-bold mt-1" style="color:#22d3ee">' + s.totalItems + '</div></div>' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px"><div class="text-xs uppercase tracking-widest" style="color:#64748b">Ombor qiymati</div><div class="text-2xl font-bold mt-1" style="color:#10b981">' + Number(s.totalValue).toLocaleString() + '</div></div>' +
      '<div style="background:#111827;border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:16px"><div class="text-xs uppercase tracking-widest" style="color:#64748b">Kam qolgan</div><div class="text-2xl font-bold mt-1" style="color:#f59e0b">' + s.lowStockCount + '</div></div>' +
      '<div style="background:#111827;border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px"><div class="text-xs uppercase tracking-widest" style="color:#64748b">Tugagan</div><div class="text-2xl font-bold mt-1" style="color:#ef4444">' + s.outOfStockCount + '</div></div>';
  }

  // Table
  var tblEl = document.getElementById('invTable');
  if (!d.ok || !d.items.length) {
    tblEl.innerHTML = '<div style="text-align:center;padding:40px;color:#475569">📦 Omborda mahsulot yo\'q. "Yangi mahsulot" tugmasini bosing.</div>';
    return;
  }

  var rows = d.items.map(function(item) {
    var pct = item.maxStock > 0 ? Math.round((item.currentStock / item.maxStock) * 100) : 0;
    var barColor = item.currentStock <= item.minStock ? '#ef4444' : item.currentStock <= item.minStock * 2 ? '#f59e0b' : '#10b981';
    var statusText = item.currentStock === 0 ? '<span style="color:#ef4444;font-weight:600">Tugagan</span>' : item.currentStock <= item.minStock ? '<span style="color:#f59e0b;font-weight:600">Kam</span>' : '<span style="color:#10b981">Yetarli</span>';
    return '<tr style="border-bottom:1px solid rgba(6,182,212,0.06)">' +
      '<td style="padding:12px 16px;font-weight:600;color:#f1f5f9">' + item.productName + '</td>' +
      '<td style="padding:12px 16px"><div style="display:flex;align-items:center;gap:8px"><span style="font-weight:700;color:#f1f5f9;min-width:40px">' + item.currentStock + '</span><span style="color:#64748b;font-size:12px">' + item.unit + '</span></div><div style="background:#1a2235;border-radius:4px;height:4px;width:80px;margin-top:4px"><div style="background:' + barColor + ';height:100%;border-radius:4px;width:' + Math.min(100, pct) + '%"></div></div></td>' +
      '<td style="padding:12px 16px;font-size:13px">' + statusText + '</td>' +
      '<td style="padding:12px 16px;color:#64748b;font-size:13px">' + Number(item.costPrice).toLocaleString() + ' so\'m</td>' +
      '<td style="padding:12px 16px"><div style="display:flex;gap:6px"><button onclick="openStockModal(\'' + item._id + '\',\'' + item.productName + '\')" class="px-3 py-1.5 rounded-lg text-xs font-semibold" style="background:rgba(6,182,212,0.1);color:#22d3ee;border:1px solid rgba(6,182,212,0.2)">Kirim/Chiqim</button><button onclick="openInvModal(\'' + item._id + '\')" class="px-3 py-1.5 rounded-lg text-xs" style="background:rgba(245,158,11,0.1);color:#f59e0b;border:1px solid rgba(245,158,11,0.2)">✏️</button><button onclick="deleteInventory(\'' + item._id + '\')" class="px-3 py-1.5 rounded-lg text-xs" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)">🗑</button></div></td>' +
    '</tr>';
  }).join('');

  tblEl.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;font-size:14px;border-collapse:collapse"><thead><tr style="border-bottom:1px solid rgba(6,182,212,0.1)"><th style="padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Mahsulot</th><th style="padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Zaxira</th><th style="padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Holat</th><th style="padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Tan narx</th><th style="padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Amal</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function openInvModal(id) {
  document.getElementById('invEditId').value = id || '';
  document.getElementById('invName').value = '';
  document.getElementById('invStock').value = '';
  document.getElementById('invUnit').value = 'dona';
  document.getElementById('invMin').value = '5';
  document.getElementById('invCost').value = '';
  document.getElementById('invModalTitle').textContent = id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot';
  if (id) {
    apiFetch('/admin/inventory').then(function(d) {
      if (d.ok) {
        var item = d.items.find(function(i) { return i._id === id; });
        if (item) {
          document.getElementById('invName').value = item.productName || '';
          document.getElementById('invStock').value = item.currentStock || 0;
          document.getElementById('invUnit').value = item.unit || 'dona';
          document.getElementById('invMin').value = item.minStock || 5;
          document.getElementById('invCost').value = item.costPrice || 0;
        }
      }
    });
  }
  document.getElementById('invModal').style.display = 'flex';
}
function closeInvModal() { document.getElementById('invModal').style.display = 'none'; }

async function saveInventory() {
  var id = document.getElementById('invEditId').value;
  var body = JSON.stringify({
    productName: document.getElementById('invName').value.trim(),
    currentStock: Number(document.getElementById('invStock').value) || 0,
    unit: document.getElementById('invUnit').value,
    minStock: Number(document.getElementById('invMin').value) || 5,
    costPrice: Number(document.getElementById('invCost').value) || 0
  });
  var d = await apiFetch(id ? '/admin/inventory/' + id : '/admin/inventory', { method: id ? 'PUT' : 'POST', body: body });
  if (d.ok) { closeInvModal(); await loadInventory(); }
  else alert(d.error || 'Xato');
}

function openStockModal(id, name) {
  document.getElementById('stockItemId').value = id;
  document.getElementById('stockModalTitle').textContent = name;
  document.getElementById('stockType').value = 'in';
  document.getElementById('stockQty').value = '';
  document.getElementById('stockNote').value = '';
  document.getElementById('stockModal').style.display = 'flex';
}
function closeStockModal() { document.getElementById('stockModal').style.display = 'none'; }

async function saveStock() {
  var id = document.getElementById('stockItemId').value;
  var d = await apiFetch('/admin/inventory/' + id + '/stock', {
    method: 'POST',
    body: JSON.stringify({
      type: document.getElementById('stockType').value,
      quantity: Number(document.getElementById('stockQty').value),
      note: document.getElementById('stockNote').value.trim()
    })
  });
  if (d.ok) { closeStockModal(); await loadInventory(); }
  else alert(d.error || 'Xato');
}

async function deleteInventory(id) {
  if (!confirm('Mahsulotni ombordan olib tashlash?')) return;
  var d = await apiFetch('/admin/inventory/' + id, { method: 'DELETE' });
  if (d.ok) loadInventory();
}

// ===================================================
// ===== ANALYTICS PAGE ==============================
// ===================================================
var analyticsCharts = {};

async function renderAnalytics(main) {
  main.innerHTML = '<div class="page" style="max-width:100%;overflow:hidden"><h1 class="text-2xl font-bold mb-1" style="color:#f1f5f9">📈 Kengaytirilgan analitika</h1><p class="text-sm mb-6" style="color:#64748b">30 kunlik chuqur tahlil va trendlar</p><div id="analyticsContent" style="overflow:hidden">' + skelStats(4) + skelTable(5) + '</div></div>';

  var d = await apiFetch('/admin/analytics/advanced');
  if (!d.ok) { document.getElementById('analyticsContent').innerHTML = '<div style="text-align:center;padding:32px;color:#ef4444">Xato: ' + (d.error || 'Yuklab bolmadi') + '</div>'; return; }

  var ov = d.overview;
  var growthColor = ov.revenueGrowth >= 0 ? '#10b981' : '#ef4444';
  var ordGrowthColor = ov.ordersGrowth >= 0 ? '#10b981' : '#ef4444';
  var arrow = function(v) { return v >= 0 ? '↑' : '↓'; };

  var html = '' +
    // Overview cards
    '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px"><div class="text-xs uppercase tracking-widest" style="color:#64748b">Oylik daromad</div><div class="text-xl font-bold mt-1" style="color:#10b981">' + Number(ov.currentMonth.revenue).toLocaleString() + '</div><div class="text-xs mt-1" style="color:' + growthColor + '">' + arrow(ov.revenueGrowth) + ' ' + Math.abs(ov.revenueGrowth) + '% o\'tgan oyga</div></div>' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px"><div class="text-xs uppercase tracking-widest" style="color:#64748b">Buyurtmalar</div><div class="text-xl font-bold mt-1" style="color:#22d3ee">' + ov.currentMonth.orders + '</div><div class="text-xs mt-1" style="color:' + ordGrowthColor + '">' + arrow(ov.ordersGrowth) + ' ' + Math.abs(ov.ordersGrowth) + '% o\'tgan oyga</div></div>' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px"><div class="text-xs uppercase tracking-widest" style="color:#64748b">O\'rtacha chek</div><div class="text-xl font-bold mt-1" style="color:#a78bfa">' + Number(ov.currentMonth.avgOrderValue).toLocaleString() + '</div><div class="text-xs mt-1" style="color:#64748b">Avvalgi: ' + Number(ov.prevMonth.avgOrderValue).toLocaleString() + '</div></div>' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:16px"><div class="text-xs uppercase tracking-widest" style="color:#64748b">Foydalanuvchilar</div><div class="text-xl font-bold mt-1" style="color:#f59e0b">' + ov.totalUsers + '</div><div class="text-xs mt-1" style="color:#10b981">+' + ov.newUsers + ' yangi</div></div>' +
    '</div>' +

    // Charts row
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:20px"><h3 class="text-sm font-bold mb-4" style="color:#f1f5f9">📊 30 kunlik daromad</h3><canvas id="revenueChart" height="200"></canvas></div>' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:20px"><h3 class="text-sm font-bold mb-4" style="color:#f1f5f9">📦 30 kunlik buyurtmalar</h3><canvas id="ordersChart" height="200"></canvas></div>' +
    '</div>' +

    '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:20px"><h3 class="text-sm font-bold mb-4" style="color:#f1f5f9">🕐 Soatlik taqsimot (bugun)</h3><canvas id="hourlyChart" height="200"></canvas></div>' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:20px"><h3 class="text-sm font-bold mb-4" style="color:#f1f5f9">📅 Hafta kunlari</h3><canvas id="weekdayChart" height="200"></canvas></div>' +
    '</div>' +

    // Top products & category pie
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:20px"><h3 class="text-sm font-bold mb-4" style="color:#f1f5f9">🏆 Top 10 mahsulot</h3><div id="topProductsList"></div></div>' +
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:20px"><h3 class="text-sm font-bold mb-4" style="color:#f1f5f9">⭐ Reyting taqsimoti</h3><canvas id="ratingChart" height="200"></canvas></div>' +
    '</div>';

  document.getElementById('analyticsContent').innerHTML = html;

  // Destroy old charts
  Object.values(analyticsCharts).forEach(function(c) { if (c) c.destroy(); });
  analyticsCharts = {};

  var chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(6,182,212,0.05)' } }, y: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(6,182,212,0.05)' } } } };

  // Revenue chart
  analyticsCharts.revenue = new Chart(document.getElementById('revenueChart'), {
    type: 'line', data: { labels: d.dailyTrend.map(function(x){return x.label}), datasets: [{ data: d.dailyTrend.map(function(x){return x.revenue}), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4, pointRadius: 1 }] },
    options: Object.assign({}, chartDefaults)
  });

  // Orders chart
  analyticsCharts.orders = new Chart(document.getElementById('ordersChart'), {
    type: 'bar', data: { labels: d.dailyTrend.map(function(x){return x.label}), datasets: [{ data: d.dailyTrend.map(function(x){return x.orders}), backgroundColor: 'rgba(6,182,212,0.6)', borderRadius: 4 }] },
    options: Object.assign({}, chartDefaults)
  });

  // Hourly chart
  analyticsCharts.hourly = new Chart(document.getElementById('hourlyChart'), {
    type: 'bar', data: { labels: d.hourlyDist.map(function(x){return x.label}), datasets: [{ data: d.hourlyDist.map(function(x){return x.orders}), backgroundColor: 'rgba(167,139,250,0.6)', borderRadius: 4 }] },
    options: Object.assign({}, chartDefaults)
  });

  // Weekday chart
  analyticsCharts.weekday = new Chart(document.getElementById('weekdayChart'), {
    type: 'bar', data: { labels: d.weekdayStats.map(function(x){return x.day}), datasets: [{ data: d.weekdayStats.map(function(x){return x.orders}), backgroundColor: ['#ef4444','#f59e0b','#10b981','#06b6d4','#8b5cf6','#ec4899','#64748b'], borderRadius: 6 }] },
    options: Object.assign({}, chartDefaults)
  });

  // Rating chart
  var ratingLabels = ['⭐1','⭐2','⭐3','⭐4','⭐5'];
  var ratingData = [0,0,0,0,0];
  d.ratingDist.forEach(function(r) { if (r._id >= 1 && r._id <= 5) ratingData[r._id - 1] = r.count; });
  analyticsCharts.rating = new Chart(document.getElementById('ratingChart'), {
    type: 'doughnut', data: { labels: ratingLabels, datasets: [{ data: ratingData, backgroundColor: ['#ef4444','#f97316','#f59e0b','#10b981','#06b6d4'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12 } } } }
  });

  // Top products list
  var tpEl = document.getElementById('topProductsList');
  if (d.topProducts.length) {
    tpEl.innerHTML = d.topProducts.map(function(p, i) {
      var maxQty = d.topProducts[0].totalQty;
      var pct = Math.round((p.totalQty / maxQty) * 100);
      return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(6,182,212,0.05)">' +
        '<span style="color:#475569;font-size:12px;min-width:20px">' + (i+1) + '.</span>' +
        '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:#f1f5f9">' + p._id + '</div>' +
        '<div style="background:#1a2235;border-radius:4px;height:4px;margin-top:4px"><div style="background:var(--sx-grad);height:100%;border-radius:4px;width:' + pct + '%"></div></div></div>' +
        '<div style="text-align:right"><div style="font-size:13px;font-weight:700;color:#22d3ee">' + p.totalQty + ' ta</div><div style="font-size:11px;color:#64748b">' + Number(p.totalRevenue).toLocaleString() + '</div></div></div>';
    }).join('');
  } else {
    tpEl.innerHTML = '<div style="text-align:center;padding:20px;color:#475569">Ma\'lumot yo\'q</div>';
  }
  setPageCache('analytics');
}

// ===================================================
// ===== NOTIFICATIONS PAGE ==========================
// ===================================================
async function renderNotifications(main) {
  main.innerHTML = '<div class="page"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px"><div><h1 class="text-2xl font-bold" style="color:#f1f5f9">🔔 Bildirishnomalar</h1><p class="text-sm mt-1" style="color:#64748b">Barcha bildirishnomalar va xabarlar</p></div><div style="display:flex;gap:8px"><button onclick="openReplyToSA()" class="px-4 py-2 rounded-xl text-xs font-semibold text-white" style="background:var(--sx-grad)">✉️ Superadminga yozish</button><button onclick="markAllRead()" class="px-4 py-2 rounded-xl text-xs font-semibold" style="background:rgba(6,182,212,0.1);color:#22d3ee;border:1px solid rgba(6,182,212,0.2)">✓ O\'qilgan</button><button onclick="clearReadNotifs()" class="px-4 py-2 rounded-xl text-xs font-semibold" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)">🗑 Tozalash</button></div></div><div id="notifList"></div></div>';
  await loadNotifications();
  setPageCache('notifications');
}

function openReplyToSA() {
  var old = document.getElementById('replyModal');
  if (old) old.remove();
  var el = document.createElement('div');
  el.id = 'replyModal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  el.innerHTML =
    '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:16px;padding:24px;max-width:420px;width:100%">' +
      '<h2 style="font-size:17px;font-weight:700;color:#22d3ee;margin-bottom:16px">✉️ Superadminga xabar</h2>' +
      '<div style="margin-bottom:12px"><label style="display:block;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:6px">Sarlavha *</label><input id="replyTitle" class="inp" type="text" placeholder="Muammo haqida..."/></div>' +
      '<div style="margin-bottom:16px"><label style="display:block;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:6px">Xabar</label><textarea id="replyBody" class="inp" rows="3" placeholder="Batafsil yozing..." style="resize:vertical"></textarea></div>' +
      '<div style="display:flex;gap:10px">' +
        '<button onclick="closeReplyModal()" style="padding:10px 20px;border-radius:12px;border:1px solid rgba(6,182,212,0.12);color:#64748b;font-size:13px;cursor:pointer;background:transparent">Bekor</button>' +
        '<button onclick="sendToSuperadmin()" style="flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;background:var(--sx-grad);border:none">Yuborish</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
  el.addEventListener('click', function(e) { if (e.target === el) closeReplyModal(); });
}

function closeReplyModal() { var el = document.getElementById('replyModal'); if (el) el.remove(); }

async function sendToSuperadmin() {
  var title = document.getElementById('replyTitle').value.trim();
  var message = document.getElementById('replyBody').value.trim();
  if (!title) { alert('Sarlavha kiriting!'); return; }
  var d = await apiFetch('/admin/send-to-superadmin', { method: 'POST', body: JSON.stringify({ title: title, message: message }) });
  if (d.ok) { alert('✅ Superadminga yuborildi!'); closeReplyModal(); }
  else alert('Xato: ' + (d.error || ''));
}

async function loadNotifications() {
  var d = await apiFetch('/admin/notifications?limit=50');
  var el = document.getElementById('notifList');
  if (!d.ok || !d.notifications.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px;color:#475569"><div style="font-size:40px;margin-bottom:8px">🔕</div>Bildirishnomalar yo\'q</div>';
    return;
  }

  el.innerHTML = d.notifications.map(function(n) {
    var timeAgo = getTimeAgo(n.createdAt);
    var bgStyle = n.read ? 'background:#111827' : 'background:rgba(6,182,212,0.04);border-left:3px solid #06b6d4';
    var typeColors = { order_new: '#f59e0b', stock_low: '#ef4444', employee_late: '#a78bfa', broadcast: '#06b6d4' };
    var dotColor = typeColors[n.type] || '#64748b';
    return '<div style="' + bgStyle + ';border:1px solid rgba(6,182,212,0.08);border-radius:12px;padding:16px;margin-bottom:8px;cursor:pointer;transition:background .15s" onclick="markNotifRead(\'' + n._id + '\',this)" onmouseover="this.style.background=\'rgba(6,182,212,0.06)\'" onmouseout="this.style.background=\'' + (n.read ? '#111827' : 'rgba(6,182,212,0.04)') + '\'">' +
      '<div style="display:flex;align-items:flex-start;gap:12px">' +
        '<div style="font-size:24px;flex-shrink:0">' + (n.icon || '🔔') + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><div style="width:6px;height:6px;border-radius:50%;background:' + dotColor + ';flex-shrink:0"></div><span style="font-size:14px;font-weight:600;color:#f1f5f9">' + n.title + '</span></div>' +
          (n.message ? '<div style="font-size:13px;color:#94a3b8;line-height:1.5">' + n.message + '</div>' : '') +
        '</div>' +
        '<div style="font-size:11px;color:#475569;white-space:nowrap;flex-shrink:0">' + timeAgo + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  pollNotifications();
}

function getTimeAgo(dateStr) {
  var now = new Date();
  var d = new Date(dateStr);
  var diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Hozir';
  if (diff < 3600) return Math.floor(diff / 60) + ' daq';
  if (diff < 86400) return Math.floor(diff / 3600) + ' soat';
  return Math.floor(diff / 86400) + ' kun';
}

async function markNotifRead(id, el) {
  await apiFetch('/admin/notifications/' + id + '/read', { method: 'PUT' });
  if (el) { el.style.borderLeft = 'none'; el.style.background = '#111827'; }
  pollNotifications();
}

async function markAllRead() {
  await apiFetch('/admin/notifications/read-all', { method: 'PUT' });
  loadNotifications();
}

async function clearReadNotifs() {
  if (!confirm('O\'qilgan bildirishnomalarni tozalash?')) return;
  await apiFetch('/admin/notifications/clear', { method: 'DELETE' });
  loadNotifications();
}
// ===================================================
// ===== SITE SETTINGS PAGE ==========================
// ===================================================
async function renderSiteSettings(main) {
  main.innerHTML = '<div class="page"><h1 class="text-2xl font-bold mb-1" style="color:#f1f5f9">🌐 Sayt sozlamalari</h1><p class="text-sm mb-6" style="color:#64748b">Restoran saytingiz dizayn va ma\'lumotlarini boshqaring</p><div id="siteSettingsContent">' + skelStats(4) + skelTable(5) + '</div></div>';

  var d = await apiFetch('/admin/site-settings');
  if (!d.ok) { document.getElementById('siteSettingsContent').innerHTML = '<div style="color:#ef4444">Xato</div>'; return; }
  var s = d.settings || {};
  var apiBase = API.replace(/\/+$/, '');
  var siteUrl = apiBase + '/site/' + (adminInfo.restaurantId || '');

  var html = '' +
    '<div style="background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.15);border-radius:12px;padding:16px;margin-bottom:24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<span style="font-size:13px;color:#94a3b8">Sayt manzili:</span>' +
      '<a href="' + siteUrl + '" target="_blank" style="color:#22d3ee;font-weight:600;word-break:break-all;font-size:14px">' + siteUrl + '</a>' +
      '<button onclick="navigator.clipboard.writeText(\'' + siteUrl + '\');this.textContent=\'✅ Nusxalandi\'" class="px-3 py-1 rounded-lg text-xs" style="background:rgba(6,182,212,0.15);color:#22d3ee;border:1px solid rgba(6,182,212,0.2);cursor:pointer">📋 Nusxalash</button>' +
    '</div>' +

    '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
      // Asosiy ma'lumotlar
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:24px">' +
        '<h3 class="text-sm font-bold mb-4" style="color:#22d3ee">📋 Asosiy ma\'lumotlar</h3>' +
        ssInput('ssNameUz', 'Restoran nomi (UZ)', s.restaurantName || '') +
        ssInput('ssNameRu', 'Restoran nomi (RU)', s.nameRu || '') +
        ssInput('ssSubtitleUz', 'Shior (UZ)', s.subtitle || '') +
        ssInput('ssSubtitleRu', 'Shior (RU)', s.subtitleRu || '') +
        ssInput('ssBadgeUz', 'Badge (UZ)', s.heroBadge || '') +
        ssInput('ssBadgeRu', 'Badge (RU)', s.heroBadgeRu || '') +
      '</div>' +

      // Aloqa
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:24px">' +
        '<h3 class="text-sm font-bold mb-4" style="color:#22d3ee">📞 Aloqa</h3>' +
        ssInput('ssPhone', 'Telefon', s.phone || '') +
        ssInput('ssAddressUz', 'Manzil (UZ)', s.address || '') +
        ssInput('ssAddressRu', 'Manzil (RU)', s.addressRu || '') +
        ssInput('ssMetroUz', 'Metro (UZ)', s.metro || '') +
        ssInput('ssWorkHoursUz', 'Ish vaqti (UZ)', s.workHours || '') +
        ssInput('ssAdminTg', 'Admin Telegram', s.adminTg || '') +
        ssInput('ssBotUsername', 'Bot username', s.botUsername || '') +
      '</div>' +

      // Rasmlar
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:24px">' +
        '<h3 class="text-sm font-bold mb-4" style="color:#22d3ee">🖼 Rasmlar</h3>' +
        ssInput('ssHeroImg', 'Hero rasm URL', s.heroImage || '') +
        ssInput('ssEventsBg', 'Tadbirlar fon rasm', s.eventsBg || '') +
        ssInput('ssMapEmbed', 'Google Map embed URL', s.mapEmbed || '') +
        '<label class="block text-xs uppercase tracking-widest mb-2 mt-3" style="color:#64748b">Galereya (har qatorga 1 URL)</label>' +
        '<textarea id="ssGallery" rows="4" class="inp" style="resize:vertical;font-size:12px">' + (s.gallery || []).join('\n') + '</textarea>' +
      '</div>' +

      // Tema
      '<div style="background:#111827;border:1px solid rgba(6,182,212,0.12);border-radius:12px;padding:24px">' +
        '<h3 class="text-sm font-bold mb-4" style="color:#22d3ee">🎨 Ranglar temasi</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px" id="themeGrid">' +
          themeBtn('gold', '#d4aa4e', s.theme) +
          themeBtn('emerald', '#34d399', s.theme) +
          themeBtn('ruby', '#e53935', s.theme) +
          themeBtn('ocean', '#06b6d4', s.theme) +
          themeBtn('violet', '#8b5cf6', s.theme) +
        '</div>' +
        '<input type="hidden" id="ssTheme" value="' + (s.theme || 'gold') + '"/>' +
        '<div class="mt-4" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div><label class="block text-xs uppercase tracking-widest mb-2" style="color:#64748b">Ochilish soati</label><input id="ssWorkStart" class="inp" type="number" min="0" max="23" value="' + (s.workStart || 10) + '"/></div>' +
          '<div><label class="block text-xs uppercase tracking-widest mb-2" style="color:#64748b">Yopilish soati</label><input id="ssWorkEnd" class="inp" type="number" min="0" max="23" value="' + (s.workEnd || 23) + '"/></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<button onclick="saveSiteSettings()" class="mt-6 px-8 py-3 rounded-xl text-sm font-bold text-white" style="background:var(--sx-grad)">💾 Saqlash</button>';

  document.getElementById('siteSettingsContent').innerHTML = html;
  setPageCache('siteSettings');
}

function ssInput(id, label, value) {
  return '<div class="mb-3"><label class="block text-xs uppercase tracking-widest mb-1" style="color:#64748b">' + label + '</label><input id="' + id + '" class="inp" type="text" value="' + (value || '').replace(/"/g, '&quot;') + '"/></div>';
}

function themeBtn(name, color, current) {
  var active = (current || 'gold') === name;
  return '<div onclick="selectTheme(\'' + name + '\')" style="cursor:pointer;text-align:center;padding:12px 8px;border-radius:10px;border:2px solid ' + (active ? color : 'transparent') + ';background:' + (active ? color + '15' : '#1a2235') + ';transition:all .2s">' +
    '<div style="width:32px;height:32px;border-radius:50%;background:' + color + ';margin:0 auto 6px;box-shadow:0 4px 12px ' + color + '40"></div>' +
    '<div style="font-size:10px;font-weight:600;color:' + (active ? color : '#64748b') + ';text-transform:uppercase;letter-spacing:1px">' + name + '</div></div>';
}

function selectTheme(name) {
  document.getElementById('ssTheme').value = name;
  var colors = { gold:'#d4aa4e', emerald:'#34d399', ruby:'#e53935', ocean:'#06b6d4', violet:'#8b5cf6' };
  var grid = document.getElementById('themeGrid');
  grid.innerHTML = themeBtn('gold','#d4aa4e',name) + themeBtn('emerald','#34d399',name) + themeBtn('ruby','#e53935',name) + themeBtn('ocean','#06b6d4',name) + themeBtn('violet','#8b5cf6',name);
}

async function saveSiteSettings() {
  var gallery = document.getElementById('ssGallery').value.trim().split('\n').filter(function(x){return x.trim()});
  var body = {
    restaurantName: document.getElementById('ssNameUz').value.trim(),
    nameRu: document.getElementById('ssNameRu').value.trim(),
    subtitle: document.getElementById('ssSubtitleUz').value.trim(),
    subtitleRu: document.getElementById('ssSubtitleRu').value.trim(),
    heroBadge: document.getElementById('ssBadgeUz').value.trim(),
    heroBadgeRu: document.getElementById('ssBadgeRu').value.trim(),
    phone: document.getElementById('ssPhone').value.trim(),
    address: document.getElementById('ssAddressUz').value.trim(),
    addressRu: document.getElementById('ssAddressRu').value.trim(),
    metro: document.getElementById('ssMetroUz').value.trim(),
    workHours: document.getElementById('ssWorkHoursUz').value.trim(),
    adminTg: document.getElementById('ssAdminTg').value.trim(),
    botUsername: document.getElementById('ssBotUsername').value.trim(),
    heroImage: document.getElementById('ssHeroImg').value.trim(),
    eventsBg: document.getElementById('ssEventsBg').value.trim(),
    mapEmbed: document.getElementById('ssMapEmbed').value.trim(),
    gallery: gallery,
    theme: document.getElementById('ssTheme').value,
    workStart: Number(document.getElementById('ssWorkStart').value) || 10,
    workEnd: Number(document.getElementById('ssWorkEnd').value) || 23
  };
  var d = await apiFetch('/admin/site-settings', { method: 'PUT', body: JSON.stringify(body) });
  if (d.ok) { alert('✅ Saqlandi!'); renderSiteSettings(document.getElementById('mainContent')); }
  else alert('Xato: ' + (d.error || ''));
}
// =============================================
// AI CHAT FUNCTIONS
// =============================================

// Toggle chat panel
function toggleAiChat() {
  var panel = document.getElementById('aiChatPanel');
  if (!panel) return;
  var isOpen = panel.style.display === 'flex';
  panel.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    document.getElementById('aiInput').focus();
    loadAiUsage();
  }
}

// AI Chat toggle button event
document.getElementById('aiChatToggle').addEventListener('click', toggleAiChat);

// Send message
async function sendAiMessage() {
  var input = document.getElementById('aiInput');
  var question = input.value.trim();
  if (!question) return;

  var messages = document.getElementById('aiMessages');
  var sendBtn = document.getElementById('aiSendBtn');

  // Foydalanuvchi xabari
  messages.innerHTML += '<div style="align-self:flex-end;background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.2);border-radius:12px;padding:10px 14px;font-size:13px;color:#22d3ee;max-width:85%;word-break:break-word">' + escapeHtml(question) + '</div>';

  // Loading
  var loadingId = 'ai-loading-' + Date.now();
  messages.innerHTML += '<div id="' + loadingId + '" style="display:flex;align-items:center;gap:8px;max-width:85%"><div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#8b5cf6,#06b6d4);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">🤖</div><div style="background:#1a2235;border-radius:12px;padding:10px 14px;font-size:13px;color:#94a3b8"><span class="skel" style="display:inline-block;width:120px;height:14px;border-radius:4px"></span></div></div>';
  messages.scrollTop = messages.scrollHeight;

  input.value = '';
  sendBtn.disabled = true;
  sendBtn.textContent = '...';

  try {
    var d = await apiFetch('/admin/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ question: question })
    });

    var loadEl = document.getElementById(loadingId);
    if (loadEl) loadEl.remove();

    if (!d || d.error) {
      var errMsg = d?.message || d?.error || 'Xatolik yuz berdi';
      messages.innerHTML += '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:10px 14px;font-size:13px;color:#f87171;max-width:85%">' + errMsg + '</div>';
    } else {
      var answer = d.answer || '';
      var formatted = formatAiAnswer(answer);

      // AI javobi
      messages.innerHTML += '<div style="display:flex;gap:8px;max-width:95%"><div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#8b5cf6,#06b6d4);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">🤖</div><div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.12);border-radius:12px;padding:12px 14px;font-size:13px;color:#e2e8f0;line-height:1.7;word-break:break-word;flex:1;overflow-x:auto">' + formatted + '</div></div>';

      // Har bir javob ostiga Excel yuklab olish tugmasi
      var dlId = 'ai-dl-' + Date.now();
      messages.innerHTML += '<div style="max-width:90%;margin-top:4px"><button id="' + dlId + '" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">📊 Excelga yuklab olish</button></div>';

      // Tugma bosilganda AI javobini CSV ga aylantirish
      (function(aid, ans, q) {
        setTimeout(function() {
          var btn = document.getElementById(aid);
          if (btn) btn.addEventListener('click', function() { downloadAiAnswerAsCSV(ans, q); });
        }, 100);
      })(dlId, answer, question);

      if (d.usage) {
        document.getElementById('aiUsageInfo').textContent = d.usage.remaining + '/' + d.usage.limit + ' surov qoldi';
      }
    }
  } catch (e) {
    var loadEl2 = document.getElementById(loadingId);
    if (loadEl2) loadEl2.remove();
    messages.innerHTML += '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:10px 14px;font-size:13px;color:#f87171;max-width:85%">Server bilan aloqa uzildi</div>';
  }

  sendBtn.disabled = false;
  sendBtn.textContent = 'Yuborish';
  messages.scrollTop = messages.scrollHeight;
}

// AI javobni formatlash
function formatAiAnswer(text) {
  var h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#c4b5fd">$1</strong>')
    // Pul summalar
    .replace(/(\d{1,3}(,\d{3})*(\.\d+)?)\s*so'm/g, '<span style="color:#22d3ee;font-weight:600">$1 so\'m</span>')
    // Foiz o'sish/tushish
    .replace(/↑\s*(\d+)/g, '<span style="color:#22c55e;font-weight:600">↑$1%</span>')
    .replace(/↓\s*(\d+)/g, '<span style="color:#ef4444;font-weight:600">↓$1%</span>')
    // Markdown jadval — HTML table ga
    .replace(/\|(.+)\|\n\|[-\s|]+\|\n([\s\S]*?)(?=\n\n|\n— |$)/g, function(match, header, body) {
      var cols = header.split('|').map(function(c){return c.trim();}).filter(Boolean);
      var th = cols.map(function(c){return '<th style="padding:6px 10px;text-align:left;font-size:11px;color:#94a3b8;border-bottom:1px solid rgba(139,92,246,0.15)">'+c+'</th>';}).join('');
      var rows = body.trim().split('\n').map(function(row) {
        var cells = row.split('|').map(function(c){return c.trim();}).filter(Boolean);
        return '<tr>' + cells.map(function(c){return '<td style="padding:5px 10px;font-size:12px;border-bottom:1px solid rgba(139,92,246,0.06)">'+c+'</td>';}).join('') + '</tr>';
      }).join('');
      return '<table style="width:100%;border-collapse:collapse;margin:8px 0;background:rgba(15,23,42,0.5);border-radius:8px;overflow:hidden"><thead><tr>'+th+'</tr></thead><tbody>'+rows+'</tbody></table>';
    })
    // Paragraflar
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    // Listlar
    .replace(/•\s/g, '<span style="color:#8b5cf6">•</span> ')
    .replace(/- ServiX AI/g, '<span style="color:#64748b;font-size:11px">— ServiX AI</span>');
  return h;
}

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Chatni tozalash
function clearAiChat() {
  var messages = document.getElementById('aiMessages');
  if (messages) {
    messages.innerHTML = '<div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.15);border-radius:12px;padding:12px 14px;font-size:13px;color:#c4b5fd;line-height:1.6;max-width:90%">Chat tozalandi. Yangi savol bering!</div>';
  }
}

// Usage ma'lumotini yuklash
async function loadAiUsage() {
  var d = await apiFetch('/admin/ai/usage');
  if (d && d.ok) {
    var info = document.getElementById('aiUsageInfo');
    if (info) info.textContent = d.remaining + '/' + d.limit + ' surov qoldi';
  }
}

// Chat oynasini kengaytirish/kichraytirish
var _aiExpanded = false;
function expandAiChat() {
  var panel = document.getElementById('aiChatPanel');
  var btn = document.getElementById('aiExpandBtn');
  if (!panel) return;
  _aiExpanded = !_aiExpanded;
  if (_aiExpanded) {
    panel.style.width = '700px';
    panel.style.height = 'calc(100vh - 40px)';
    panel.style.maxWidth = 'calc(100vw - 40px)';
    panel.style.bottom = '20px';
    panel.style.right = '20px';
    btn.textContent = '⊡';
    btn.title = 'Kichraytirish';
  } else {
    panel.style.width = '420px';
    panel.style.height = '600px';
    btn.textContent = '⛶';
    btn.title = 'Kengaytirish';
  }
  var messages = document.getElementById('aiMessages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}




// AI javobini Excel/CSV ga aylantirish
function downloadAiAnswerAsCSV(aiAnswer, question) {
  var bizName = adminInfo.restaurantName || 'ServiX';
  var sana = new Date().toLocaleDateString('uz-UZ');

  // AI javobidagi markdown jadvalni CSV ga aylantirish
  var csv = '\uFEFF'; // BOM — Excel da o'zbek harflar to'g'ri ko'rinishi uchun
  csv += 'ServiX AI Hisobot\n';
  csv += 'Biznes:,' + bizName + '\n';
  csv += 'Sana:,' + sana + '\n';
  csv += 'Savol:,"' + question.replace(/"/g, '""') + '"\n\n';

  // AI javobini parse qilish
  var lines = aiAnswer.split('\n');
  var inTable = false;
  var tableHeaderDone = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();

    // Markdown jadval qatori (| bilan)
    if (line.indexOf('|') === 0 || (line.indexOf('|') > -1 && line.lastIndexOf('|') > line.indexOf('|'))) {
      // Separator qatorini o'tkazib yuborish (|---|---|)
      if (/^\|[\s\-:]+\|/.test(line)) {
        continue;
      }
      // Jadval qatorini CSV ga
      var cells = line.split('|').filter(function(c) { return c.trim() !== ''; });
      csv += cells.map(function(c) {
        var val = c.trim().replace(/\*\*/g, '');
        // Agar vergul bo'lsa, qo'shtirnoq ichiga olish
        if (val.indexOf(',') > -1) return '"' + val + '"';
        return val;
      }).join(',') + '\n';
      inTable = true;
    } else {
      if (inTable) {
        csv += '\n';
        inTable = false;
      }
      // Oddiy matn qatori
      if (line && !line.match(/^---/) && !line.match(/^— ServiX/)) {
        // # sarlavha
        line = line.replace(/^#+\s*/, '');
        // ** bold
        line = line.replace(/\*\*/g, '');
        // Emoji
        line = line.replace(/[💡⚠️📊📋🏆📈🔵]/g, '');
        if (line.trim()) {
          csv += '"' + line.trim().replace(/"/g, '""') + '"\n';
        }
      }
    }
  }

  csv += '\n— ServiX AI | ' + sana + '\n';

  // Fayl yuklab olish
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'ServiX_' + bizName.replace(/\s+/g, '_') + '_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}