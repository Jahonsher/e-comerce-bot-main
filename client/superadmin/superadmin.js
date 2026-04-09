var API = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://e-comerce-bot-main-production.up.railway.app';

var token         = localStorage.getItem('saToken');
var saInfo        = JSON.parse(localStorage.getItem('saInfo') || '{}');
var allRests      = [];
var statsCache    = {};
var currentTab    = null;
var currentPeriod = 'week';
var tabChart      = null;
var businessTypesCache = null; // biznes turlari cache

// ===== AUTH =====
async function doLogin() {
  var u   = document.getElementById('loginUser').value.trim();
  var p   = document.getElementById('loginPass').value;
  var err = document.getElementById('loginErr');
  var btn = document.getElementById('loginBtn');

  err.style.display = 'none';
  err.textContent = '';

  if (!u && !p) { showErr(err, '⚠️ Login va parolni kiriting'); return; }
  if (!u) { showErr(err, '⚠️ Login kiritilmagan'); return; }
  if (!p) { showErr(err, '⚠️ Parol kiritilmagan'); return; }

  btn.textContent = 'Tekshirilmoqda...';
  btn.disabled = true;

  try {
    var r = await fetch(API + '/superadmin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    var d = await r.json();

    if (!d.ok) {
      showErr(err, "❌ Login yoki parol noto'g'ri");
      document.getElementById('loginPass').value = '';
      document.getElementById('loginPass').focus();
      btn.textContent = 'Kirish';
      btn.disabled = false;
      return;
    }
    if (d.admin.role !== 'superadmin') {
      showErr(err, "🚫 Sizda superadmin huquqi yo'q");
      btn.textContent = 'Kirish';
      btn.disabled = false;
      return;
    }

    btn.textContent = '✓ Kirish...';
    token  = d.token;
    saInfo = d.admin;
    localStorage.setItem('saToken', token);
    localStorage.setItem('saInfo', JSON.stringify(saInfo));
    startApp();
  } catch(e) {
    showErr(err, '🔌 Server bilan ulanib bolmadi. Internet aloqasini tekshiring.');
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
  localStorage.removeItem('saToken');
  localStorage.removeItem('saInfo');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginPage').style.display = 'flex';
}

function ah() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

async function api(url, opts) {
  opts = opts || {};
  try {
    var r = await fetch(API + url, {
      method:  opts.method || 'GET',
      headers: ah(),
      body:    opts.body || undefined
    });
    if (r.status === 401) { doLogout(); return null; }
    return r.json();
  } catch(e) {
    return null;
  }
}

function startApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('saUsername').textContent = '@' + (saInfo.username || '');
  showPage('dashboard');
  pollSANotifs();
  setInterval(pollSANotifs, 30000);
}

if (token) startApp();

// ===== EVENTS =====
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPass').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
document.getElementById('logoutBtn').addEventListener('click', doLogout);

document.getElementById('hamburger').addEventListener('click', function() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('hidden');
});
document.getElementById('sidebarOverlay').addEventListener('click', function() {
  document.getElementById('sidebar').classList.remove('open');
  this.classList.add('hidden');
});

document.querySelectorAll('.si').forEach(function(el) {
  el.addEventListener('click', function() { showPage(el.dataset.page); });
});

document.getElementById('restModal').addEventListener('click', function(e) { if (e.target === this) closeRestModal(); });
document.getElementById('restModalCancel').addEventListener('click', closeRestModal);
document.getElementById('restModalSave').addEventListener('click', saveRest);

// ===== NAV =====
function showPage(page) {
  document.querySelectorAll('.si').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  if (window.innerWidth < 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.add('hidden');
  }
  var main = document.getElementById('mainContent');
  if (page === 'dashboard')     renderDashboard(main);
  if (page === 'restaurants')   renderRestaurants(main);
  if (page === 'payments')      renderPayments(main);
  if (page === 'bots')          renderBots(main);
  if (page === 'auditLog')      renderAuditLog(main);
  if (page === 'aiMonitor')     renderAiMonitor(main);
  if (page === 'notifications') renderSANotifications(main);
  if (page === 'settings')      renderSettings(main);
}

// ===== HELPERS =====
function border12(extra) {
  return 'border-radius:12px;border:1px solid rgba(6,182,212,0.12);background:#0f1828;' + (extra || '');
}

function sc(icon, label, value, sub) {
  return '<div style="' + border12('padding:16px') + '">' +
    '<div style="font-size:24px;margin-bottom:8px">' + icon + '</div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:6px">' + label + '</div>' +
    '<div style="font-size:24px;font-weight:700">' + value + '</div>' +
    '<div style="font-size:12px;color:#64748b;margin-top:4px">' + sub + '</div>' +
  '</div>';
}

function buildRank(list, valFn, numFn, color) {
  var maxVal = list.length ? numFn(list[0]) : 1;
  if (!maxVal) maxVal = 1;
  var html = '';
  list.forEach(function(r, i) {
    var val = numFn(r);
    var pct = Math.round(val / maxVal * 100);
    var mc  = i === 0 ? 'm1' : i === 1 ? 'm2' : i === 2 ? 'm3' : 'mo';
    html +=
      '<div class="rank-row">' +
        '<div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0" class="' + mc + '">' + (i + 1) + '</div>' +
        '<div style="flex:1">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
            '<span style="font-size:13px;font-weight:600">' + r.restaurantName + '</span>' +
            '<span style="font-size:12px;font-weight:700;color:' + color + '">' + valFn(r) + '</span>' +
          '</div>' +
          '<div style="height:5px;background:#1a2235;border-radius:3px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#06b6d4,' + color + ');border-radius:3px"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  });
  return html || '<div style="color:#64748b;font-size:13px;padding:12px 0">Hali malumot yoq</div>';
}

function smc(label, value, color) {
  return '<div class="smc">' +
    '<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:6px">' + label + '</div>' +
    '<div style="font-size:22px;font-weight:700' + (color ? ';color:' + color : '') + '">' + value + '</div>' +
  '</div>';
}

// ===== DASHBOARD =====
async function renderDashboard(main) {
  main.innerHTML = '<div class="page"><div style="color:#64748b;text-align:center;padding:80px 0">Yuklanmoqda...</div></div>';

  var rests  = await api('/superadmin/restaurants');
  var gStats = await api('/superadmin/stats');
  if (!rests || !gStats) return;

  allRests = rests;
  if (!currentTab && rests.length) currentTab = rests[0].restaurantId;

  statsCache = {};
  for (var i = 0; i < rests.length; i++) {
    var rs = await api('/admin/stats?restaurantId=' + rests[i].restaurantId);
    if (rs) statsCache[rests[i].restaurantId] = rs;
  }

  var byRevenue = rests.slice().sort(function(a, b) {
    var ar = statsCache[a.restaurantId] ? (statsCache[a.restaurantId].month.revenue || 0) : 0;
    var br = statsCache[b.restaurantId] ? (statsCache[b.restaurantId].month.revenue || 0) : 0;
    return br - ar;
  });

  var byOrders = rests.slice().sort(function(a, b) {
    var ao = statsCache[a.restaurantId] ? (statsCache[a.restaurantId].month.orders || 0) : 0;
    var bo = statsCache[b.restaurantId] ? (statsCache[b.restaurantId].month.orders || 0) : 0;
    return bo - ao;
  });

  var totalMonthRev = 0;
  rests.forEach(function(r) {
    if (statsCache[r.restaurantId]) totalMonthRev += statsCache[r.restaurantId].month.revenue || 0;
  });

  // Build tabs HTML
  var tabsHtml = '';
  rests.forEach(function(r) {
    tabsHtml += '<button class="tab-btn ' + (currentTab === r.restaurantId ? 'active' : '') + '" data-rid="' + r.restaurantId + '">' + r.restaurantName + '</button>';
  });

  main.innerHTML =
    '<div class="page">' +
      '<div style="margin-bottom:24px">' +
        '<h1 style="font-family:\'Playfair Display\',serif;font-size:28px;font-weight:700">Dashboard</h1>' +
        '<p style="font-size:13px;margin-top:4px;color:#64748b">Barcha restoranlar umumiy tahlili</p>' +
      '</div>' +

      // Umumiy kartalar
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:16px;margin-bottom:28px">' +
        sc('🏪', 'Restoranlar',      gStats.totalRestaurants, 'Ulangan') +
        sc('📦', 'Bugungi buyurtma', gStats.todayOrders,      'Jami') +
        sc('💰', 'Oylik daromad',    Number(totalMonthRev).toLocaleString(), "so'm") +
        sc('👥', 'Foydalanuvchilar', gStats.totalUsers,       'Jami') +
      '</div>' +

      // Reytinglar
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px">' +
        '<div style="' + border12('padding:20px') + '">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">' +
            '<span style="font-size:18px">🏆</span>' +
            '<span style="font-size:14px;font-weight:700">Daromad reytingi</span>' +
            '<span style="font-size:12px;color:#64748b;margin-left:auto">Oylik</span>' +
          '</div>' +
          buildRank(byRevenue,
            function(r) { return statsCache[r.restaurantId] ? Number(statsCache[r.restaurantId].month.revenue || 0).toLocaleString() + " so'm" : "0 so'm"; },
            function(r) { return statsCache[r.restaurantId] ? (statsCache[r.restaurantId].month.revenue || 0) : 0; },
            '#f59e0b'
          ) +
        '</div>' +
        '<div style="' + border12('padding:20px') + '">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">' +
            '<span style="font-size:18px">📦</span>' +
            '<span style="font-size:14px;font-weight:700">Buyurtma reytingi</span>' +
            '<span style="font-size:12px;color:#64748b;margin-left:auto">Oylik</span>' +
          '</div>' +
          buildRank(byOrders,
            function(r) { return statsCache[r.restaurantId] ? (statsCache[r.restaurantId].month.orders || 0) + ' ta' : '0 ta'; },
            function(r) { return statsCache[r.restaurantId] ? (statsCache[r.restaurantId].month.orders || 0) : 0; },
            '#60a5fa'
          ) +
        '</div>' +
      '</div>' +

      // Per-restoran tabs
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">' +
        '<span style="font-size:14px;font-weight:700">📊 Restoran tahlili</span>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap" id="restTabs">' + tabsHtml + '</div>' +
      '</div>' +
      '<div id="tabContent"></div>' +
    '</div>';

  document.getElementById('restTabs').addEventListener('click', function(e) {
    var btn = e.target.closest('.tab-btn');
    if (!btn) return;
    currentTab = btn.dataset.rid;
    document.querySelectorAll('.tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.rid === currentTab);
    });
    renderTab(currentTab, currentPeriod);
  });

  if (currentTab) renderTab(currentTab, currentPeriod);
}

// ===== TAB CONTENT =====
function getPeriodData(stats, period) {
  if (!stats) return { orders: 0, revenue: 0 };
  if (period === 'today') return { orders: stats.today.orders, revenue: stats.today.revenue };
  if (period === 'week')  return {
    orders:  stats.weekly.reduce(function(s, d) { return s + d.orders; }, 0),
    revenue: stats.weekly.reduce(function(s, d) { return s + (d.revenue || 0); }, 0)
  };
  if (period === 'month') return { orders: stats.month.orders, revenue: stats.month.revenue };
  if (period === 'year')  return { orders: stats.month.orders * 12, revenue: stats.month.revenue * 12 };
  return { orders: 0, revenue: 0 };
}

function periodLabel(period) {
  if (period === 'today') return 'Bugungi';
  if (period === 'week')  return 'Haftalik';
  if (period === 'month') return 'Oylik';
  if (period === 'year')  return 'Yillik (taxminiy)';
  return '';
}

function renderTab(rId, period) {
  currentPeriod = period;
  var stats = statsCache[rId];
  var rest  = allRests.find(function(r) { return r.restaurantId === rId; });
  var pd    = getPeriodData(stats, period);
  var lbl   = periodLabel(period);

  var periodBtns = '';
  var periods = [
    { key: 'today', label: 'Bugun' },
    { key: 'week',  label: 'Hafta' },
    { key: 'month', label: 'Oy'    },
    { key: 'year',  label: 'Yil'   }
  ];
  periods.forEach(function(p) {
    periodBtns += '<button class="pb ' + (period === p.key ? 'active' : '') + '" data-period="' + p.key + '">' + p.label + '</button>';
  });

  // TOP mahsulotlar HTML
  var topHtml = '';
  if (stats && stats.topProducts && stats.topProducts.length) {
    var topItems = '';
    var maxQ = stats.topProducts[0].quantity || 1;
    stats.topProducts.forEach(function(p, i) {
      var pct = Math.round(p.quantity / maxQ * 100);
      topItems +=
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
          '<div style="width:22px;height:22px;border-radius:50%;background:#06b6d4;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + (i + 1) + '</div>' +
          '<div style="flex:1">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
              '<span style="font-size:13px;font-weight:600">' + p._id + '</span>' +
              '<span style="font-size:12px;color:#f59e0b">' + p.quantity + ' ta</span>' +
            '</div>' +
            '<div style="height:5px;background:#1a2235;border-radius:3px;overflow:hidden">' +
              '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#06b6d4,#f59e0b);border-radius:3px"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    topHtml =
      '<div style="' + border12('padding:20px;margin-bottom:20px') + '">' +
        '<div style="font-size:14px;font-weight:700;margin-bottom:16px">🏆 Kop sotilgan — ' + (rest ? rest.restaurantName : '') + '</div>' +
        topItems +
      '</div>';
  }

  document.getElementById('tabContent').innerHTML =
    '<div style="' + border12('padding:20px;margin-bottom:20px') + '">' +

      // Period tugmalari
      '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">' + periodBtns + '</div>' +

      // Mini stats
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:20px">' +
        smc(lbl + ' buyurtmalar', pd.orders, '#22d3ee') +
        smc(lbl + ' daromad', Number(pd.revenue).toLocaleString() + " so'm", '#f59e0b') +
        smc('Online / Zal', stats ? (stats.today.online + ' / ' + stats.today.dineIn) : '—', null) +
        smc('Reyting', stats && stats.rating && stats.rating.avg ? stats.rating.avg + ' ⭐' : '—', '#f59e0b') +
        smc('Foydalanuvchilar', stats ? stats.totalUsers : 0, null) +
      '</div>' +

      // Grafik
      '<div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:10px">Songi 7 kunlik grafik</div>' +
      '<div style="position:relative;height:200px"><canvas id="tabChart"></canvas></div>' +

    '</div>' +
    topHtml;

  // Period events
  document.querySelectorAll('.pb').forEach(function(btn) {
    btn.addEventListener('click', function() { renderTab(rId, btn.dataset.period); });
  });

  // Chart
  if (tabChart) { tabChart.destroy(); tabChart = null; }
  var ctx = document.getElementById('tabChart');
  if (!ctx || !stats || !stats.weekly) return;

  tabChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: stats.weekly.map(function(d) { return d.date; }),
      datasets: [
        {
          label: 'Buyurtmalar',
          data:  stats.weekly.map(function(d) { return d.orders; }),
          backgroundColor: 'rgba(6,182,212,0.6)',
          borderColor: '#06b6d4',
          borderRadius: 5,
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: "Daromad (so'm)",
          data:  stats.weekly.map(function(d) { return d.revenue || 0; }),
          type: 'line',
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          fill: true,
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 }
        }
      },
      scales: {
        x:  { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(6,182,212,0.06)' } },
        y:  { ticks: { color: '#22d3ee', font: { size: 11 } }, grid: { color: 'rgba(6,182,212,0.06)' }, position: 'left' },
        y1: { ticks: { color: '#f59e0b', font: { size: 10 } }, grid: { display: false }, position: 'right' }
      }
    }
  });
}

// ===== RESTAURANTS PAGE =====
async function renderRestaurants(main) {
  main.innerHTML =
    '<div class="page">' +
      '<div style="margin-bottom:24px">' +
        '<h1 style="font-family:\'Playfair Display\',serif;font-size:28px;font-weight:700">Bizneslar</h1>' +
        '<p style="font-size:13px;margin-top:4px;color:#64748b">Barcha ulangan bizneslar</p>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">' +
        '<button id="addRestBtn" style="padding:10px 20px;border-radius:12px;background:linear-gradient(135deg,#06b6d4,#8b5cf6);color:#fff;font-family:Manrope,sans-serif;font-size:13px;font-weight:700;border:none;cursor:pointer">+ Yangi biznes</button>' +
      '</div>' +
      '<div id="restCards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">' +
        '<div style="color:#64748b">Yuklanmoqda...</div>' +
      '</div>' +
    '</div>';

  document.getElementById('addRestBtn').addEventListener('click', function() { openRestModal(null); });
  loadRestCards();
}

async function loadRestCards() {
  var rests = await api('/superadmin/restaurants');
  if (!rests) return;
  var el = document.getElementById('restCards');
  if (!el) return;

  if (!rests.length) {
    el.innerHTML = '<div style="color:#64748b;padding:20px">Hali biznes qoshilmagan</div>';
    return;
  }

  el.innerHTML = '';
  rests.forEach(function(r) {
    var div = document.createElement('div');
    div.style.cssText = border12('padding:20px;transition:transform .2s;cursor:default');
    div.onmouseenter = function() { this.style.transform = 'translateY(-2px)'; };
    div.onmouseleave = function() { this.style.transform = ''; };

    var isActive = r.active !== false;
    div.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
        '<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#06b6d4,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🏪</div>' +
        '<div style="flex:1">' +
          '<div style="font-weight:700;font-size:14px">' + r.restaurantName + '</div>' +
          '<div style="font-size:12px;color:#64748b;margin-top:2px">ID: ' + r.restaurantId + ' · @' + r.username +
            ' · <span style="color:#8b5cf6">' + getBusinessTypeLabel(r.businessType) + '</span></div>' +
        '</div>' +
        '<span style="font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600;' + (isActive ? 'background:rgba(16,185,129,0.15);color:#10b981' : 'background:rgba(239,68,68,0.15);color:#ef4444') + '">' + (isActive ? 'Faol' : 'Bloklangan') + '</span>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
        '<div style="background:#141d2e;border-radius:10px;padding:12px">' +
          '<div style="font-size:11px;color:#64748b;margin-bottom:4px">Bugun</div>' +
          '<div style="font-size:22px;font-weight:700;color:#22d3ee">' + r.todayOrders + '</div>' +
        '</div>' +
        '<div style="background:#141d2e;border-radius:10px;padding:12px">' +
          '<div style="font-size:11px;color:#64748b;margin-bottom:4px">Jami</div>' +
          '<div style="font-size:22px;font-weight:700">' + r.totalOrders + '</div>' +
        '</div>' +
      '</div>' +

      (r.phone   ? '<div style="font-size:12px;color:#64748b;margin-bottom:4px">📞 ' + r.phone   + '</div>' : '') +
      (r.address ? '<div style="font-size:12px;color:#64748b;margin-bottom:8px">📍 ' + r.address + '</div>' : '') +

      // Yoqilgan modullar
      (function() {
        var mods = r.modules || {};
        var modNames = {
          orders:'📦', menu:'🍽', categories:'🗂', ratings:'⭐', users:'👥',
          employees:'👷', attendance:'📋', empReport:'💰', branches:'🏢',
          broadcast:'📢', notifications:'🔔', inventory:'📦', waiter:'🧑‍🍳', kitchen:'🍳'
        };
        var defaultFalse = ['waiter', 'kitchen', 'inventory'];
        var badges = '';
        Object.keys(modNames).forEach(function(k) {
          var on = defaultFalse.indexOf(k) !== -1 ? mods[k] === true : mods[k] !== false;
          badges += '<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;margin:1px;' +
            (on ? 'background:rgba(6,182,212,0.1);color:#22d3ee' : 'background:rgba(100,116,139,0.1);color:#475569;text-decoration:line-through') +
            '">' + modNames[k] + '</span>';
        });
        return '<div style="margin-bottom:10px;line-height:1.8">' + badges + '</div>';
      })() +

      // Obuna ma'lumoti
      (function() {
        var subHtml = '';
        if (!isActive && r.blockReason) {
          subHtml += '<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#f87171">🔒 ' + r.blockReason + '</div>';
        }
        if (r.subscriptionEnd) {
          var subEnd  = new Date(r.subscriptionEnd);
          var now     = new Date();
          var daysLeft = Math.ceil((subEnd - now) / 86400000);
          var subColor = daysLeft > 7 ? '#22c55e' : daysLeft > 0 ? '#f59e0b' : '#ef4444';
          var subText  = daysLeft > 0 ? daysLeft + ' kun qoldi' : 'Muddati o\'tgan';
          subHtml += '<div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:8px;padding:8px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">' +
            '<span style="font-size:12px;color:#64748b">📅 Obuna tugaydi</span>' +
            '<span style="font-size:12px;font-weight:600;color:' + subColor + '">' + subEnd.toLocaleDateString('uz-UZ') + ' (' + subText + ')</span>' +
          '</div>';
        }
        return subHtml;
      })() +

      '<div style="display:flex;gap:8px">' +
        '<button class="edit-btn" style="flex:1;padding:8px;border-radius:8px;background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;font-family:Manrope,sans-serif;font-size:12px;font-weight:600;cursor:pointer">✏️ Tahrirlash</button>' +
        '<button class="tog-btn" style="padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid;' + (isActive ? 'background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3);color:#ef4444' : 'background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.3);color:#22c55e') + '">' + (isActive ? '🔒 Bloklash' : '✅ Faollashtirish') + '</button>' +
        '<button class="del-btn" style="padding:8px 12px;border-radius:8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444;font-size:13px;cursor:pointer">🗑</button>' +
      '</div>';

    div.querySelector('.edit-btn').addEventListener('click', function() { openRestModal(r); });
    div.querySelector('.tog-btn').addEventListener('click', function() { toggleRest(r._id, isActive, r.restaurantName); });
    div.querySelector('.del-btn').addEventListener('click', function() { deleteRest(r._id); });
    el.appendChild(div);
  });
}

// ===== MODAL =====
function openRestModal(r) {
  document.getElementById('restModalTitle').textContent = r ? 'Biznesni tahrirlash' : "Yangi biznes qoshish";
  document.getElementById('restEditId').value   = r ? r._id : '';
  document.getElementById('rName').value        = r ? (r.restaurantName || '') : '';
  document.getElementById('rId').value          = r ? (r.restaurantId   || '') : '';
  document.getElementById('rUsername').value    = r ? (r.username       || '') : '';
  document.getElementById('rPassword').value    = '';
  document.getElementById('rPhone').value       = r ? (r.phone          || '') : '';
  document.getElementById('rAddress').value     = r ? (r.address        || '') : '';
  document.getElementById('rBotToken').value    = r ? (r.botToken       || '') : '';
  document.getElementById('rChefId').value      = r ? (r.chefId         || '') : '';
  document.getElementById('rWebapp').value      = r ? (r.webappUrl      || '') : '';
  document.getElementById('rId').disabled       = !!r;
  document.getElementById('rUsername').disabled = !!r;

  // ===== BIZNES TURINI TANLASH =====
  var btSelect = document.getElementById('rBusinessType');
  var currentType = (r && r.businessType) || 'restaurant';
  btSelect.value = currentType;
  // Tahrirlashda biznes turini o'zgartirib bo'lmaydi (modullar resetlanadi)
  btSelect.disabled = !!r;

  // ===== MODULLARNI DYNAMIC YUKLASH =====
  loadModuleToggles(currentType, r ? (r.modules || {}) : null);

  var modal = document.getElementById('restModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.style.display = 'flex';
}

function closeRestModal() {
  var modal = document.getElementById('restModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  modal.style.display = '';
}

async function saveRest() {
  var id   = document.getElementById('restEditId').value;
  var saveBtn = document.getElementById('restModalSave');
  saveBtn.textContent = 'Saqlanmoqda...';
  saveBtn.disabled = true;

  // ===== MODULLARNI YIG'ISH =====
  var modules = {};
  document.querySelectorAll('#moduleToggles input[data-mod]').forEach(function(cb) {
    modules[cb.dataset.mod] = cb.checked;
  });

  var body = {
    restaurantName: document.getElementById('rName').value.trim(),
    restaurantId:   document.getElementById('rId').value.trim().toLowerCase().replace(/\s+/g, '_'),
    username:       document.getElementById('rUsername').value.trim(),
    password:       document.getElementById('rPassword').value,
    phone:          document.getElementById('rPhone').value.trim(),
    address:        document.getElementById('rAddress').value.trim(),
    botToken:       document.getElementById('rBotToken').value.trim(),
    chefId:         Number(document.getElementById('rChefId').value) || 0,
    webappUrl:      document.getElementById('rWebapp').value.trim(),
    businessType:   document.getElementById('rBusinessType').value,
    modules:        modules
  };
  if (!body.restaurantName) { alert('Biznes nomi majburiy'); saveBtn.textContent = 'Saqlash'; saveBtn.disabled = false; return; }
  
  try {
    var result;
    if (id) {
      var upd = {
        restaurantName: body.restaurantName,
        phone:   body.phone,
        address: body.address,
        botToken: body.botToken,
        chefId:   body.chefId,
        webappUrl: body.webappUrl,
        modules:  modules
      };
      if (body.password) upd.password = body.password;
      result = await api('/superadmin/restaurants/' + id, { method: 'PUT', body: JSON.stringify(upd) });
    } else {
      if (!body.username || !body.password || !body.restaurantId) { alert('Login, parol va ID majburiy'); saveBtn.textContent = 'Saqlash'; saveBtn.disabled = false; return; }
      result = await api('/superadmin/restaurants', { method: 'POST', body: JSON.stringify(body) });
    }
    console.log('saveRest result:', result);
    if (!result) { alert('Server bilan ulanishda xatolik'); saveBtn.textContent = 'Saqlash'; saveBtn.disabled = false; return; }
    if (result.error) { alert('Xatolik: ' + result.error); saveBtn.textContent = 'Saqlash'; saveBtn.disabled = false; return; }
    closeRestModal();
    loadRestCards();
  } catch(e) {
    console.error('saveRest error:', e);
    alert('Xatolik: ' + e.message);
  }
  saveBtn.textContent = 'Saqlash';
  saveBtn.disabled = false;
}

async function toggleRest(id, isActive, restName) {
  if (isActive) {
    showBlockModal(id, restName);
  } else {
    showUnblockModal(id, restName);
  }
}



function closeBlockModal()   { var e=document.getElementById('blockModal');   if(e) e.remove(); }
function closeUnblockModal() { var e=document.getElementById('unblockModal'); if(e) e.remove(); }

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
}

function showBlockModal(id, restName) {
  var old = document.getElementById('blockModal');
  if (old) old.remove();
  var el = document.createElement('div');
  el.id = 'blockModal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  el.innerHTML = [
    '<div style="background:#141d2e;border:1px solid rgba(239,68,68,0.3);border-radius:16px;padding:24px;max-width:420px;width:100%">',
    '<div style="font-size:32px;text-align:center;margin-bottom:12px">🔒</div>',
    '<div style="font-size:16px;font-weight:700;color:#f1f5f9;text-align:center;margin-bottom:6px">Biznesni bloklash</div>',
    '<div style="font-size:13px;color:#64748b;text-align:center;margin-bottom:20px">' + restName + '</div>',
    '<div style="margin-bottom:16px">',
    '<label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:6px">BLOKLASH SABABI</label>',
    '<textarea id="blockReason" rows="3" placeholder="Masalan: Oylik tolov amalga oshirilmadi..." style="width:100%;background:#1e293b;border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#f1f5f9;padding:10px 12px;font-size:13px;resize:none;box-sizing:border-box;font-family:Manrope,sans-serif"></textarea>',
    '</div>',
    '<div style="display:flex;gap:10px">',
    '<button id="cancelBlockBtn" style="flex:1;padding:10px;border-radius:8px;background:rgba(99,179,237,0.1);border:1px solid rgba(99,179,237,0.2);color:#94a3b8;font-family:Manrope,sans-serif;font-size:13px;font-weight:600;cursor:pointer">Bekor qilish</button>',
    '<button id="confirmBlockBtn" style="flex:1;padding:10px;border-radius:8px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;font-family:Manrope,sans-serif;font-size:13px;font-weight:700;cursor:pointer">🔒 Bloklash</button>',
    '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(el);
  document.getElementById('cancelBlockBtn').onclick = function() { el.remove(); };
  document.getElementById('confirmBlockBtn').onclick = function() { confirmBlock(id, el); };
  document.getElementById('blockReason').focus();
}

async function confirmBlock(id, modal) {
  var reason = document.getElementById('blockReason').value.trim() || "Xizmat vaqtincha to'xtatilgan";
  if (modal) modal.remove();
  // Avval restaurantId ni topamiz
  var rests = await api('/superadmin/restaurants');
  var rest = rests && rests.find(function(r){ return r._id === id; });
  var rId = rest ? rest.restaurantId : null;
  // Admin ni yangilaymiz
  await api('/superadmin/restaurants/' + id, {
    method: 'PUT',
    body: JSON.stringify({ active: false, blockReason: reason })
  });
  // Restaurant kolleksiyasini yangilaymiz
  if (rId) {
    await api('/superadmin/block/' + rId, {
      method: 'POST',
      body: JSON.stringify({ blocked: true, reason: reason })
    });
  }
  loadRestCards();
}

function showUnblockModal(id, restName) {
  var old = document.getElementById('unblockModal');
  if (old) old.remove();
  var el = document.createElement('div');
  el.id = 'unblockModal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  el.innerHTML = [
    '<div style="background:#141d2e;border:1px solid rgba(34,197,94,0.3);border-radius:16px;padding:24px;max-width:420px;width:100%">',
    '<div style="font-size:32px;text-align:center;margin-bottom:12px">✅</div>',
    '<div style="font-size:16px;font-weight:700;color:#f1f5f9;text-align:center;margin-bottom:6px">Biznesni faollashtirish</div>',
    '<div style="font-size:13px;color:#64748b;text-align:center;margin-bottom:20px">' + restName + '</div>',
    '<div style="margin-bottom:16px">',
    '<label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:6px">OBUNA NECHA KUNGA</label>',
    '<div style="display:flex;gap:8px;margin-bottom:8px">',
    '<button id="days30"  style="flex:1;padding:8px;border-radius:8px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;font-size:12px;cursor:pointer;font-family:Manrope,sans-serif">30 kun</button>',
    '<button id="days90"  style="flex:1;padding:8px;border-radius:8px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;font-size:12px;cursor:pointer;font-family:Manrope,sans-serif">90 kun</button>',
    '<button id="days365" style="flex:1;padding:8px;border-radius:8px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;font-size:12px;cursor:pointer;font-family:Manrope,sans-serif">1 yil</button>',
    '</div>',
    '<input id="unblockDays" type="number" value="30" min="1" style="width:100%;background:#1e293b;border:1px solid rgba(34,197,94,0.3);border-radius:8px;color:#f1f5f9;padding:10px 12px;font-size:13px;box-sizing:border-box;font-family:Manrope,sans-serif">',
    '</div>',
    '<div style="display:flex;gap:10px">',
    '<button id="cancelUnblockBtn" style="flex:1;padding:10px;border-radius:8px;background:rgba(99,179,237,0.1);border:1px solid rgba(99,179,237,0.2);color:#94a3b8;font-family:Manrope,sans-serif;font-size:13px;font-weight:600;cursor:pointer">Bekor qilish</button>',
    '<button id="confirmUnblockBtn" style="flex:1;padding:10px;border-radius:8px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#22c55e;font-family:Manrope,sans-serif;font-size:13px;font-weight:700;cursor:pointer">✅ Faollashtirish</button>',
    '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(el);
  document.getElementById('days30').onclick  = function() { document.getElementById('unblockDays').value = 30; };
  document.getElementById('days90').onclick  = function() { document.getElementById('unblockDays').value = 90; };
  document.getElementById('days365').onclick = function() { document.getElementById('unblockDays').value = 365; };
  document.getElementById('cancelUnblockBtn').onclick  = function() { el.remove(); };
  document.getElementById('confirmUnblockBtn').onclick = function() { confirmUnblock(id, el); };
}

async function confirmUnblock(id, modal) {
  var days = parseInt(document.getElementById('unblockDays').value) || 30;
  var endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  if (modal) modal.remove();
  // Avval restaurantId ni topamiz
  var rests = await api('/superadmin/restaurants');
  var rest = rests && rests.find(function(r){ return r._id === id; });
  var rId = rest ? rest.restaurantId : null;
  // Admin ni yangilaymiz
  await api('/superadmin/restaurants/' + id, {
    method: 'PUT',
    body: JSON.stringify({ active: true, blockReason: '', subscriptionEnd: endDate.toISOString() })
  });
  // Restaurant kolleksiyasini yangilaymiz
  if (rId) {
    await api('/superadmin/block/' + rId, {
      method: 'POST',
      body: JSON.stringify({ blocked: false, reason: '' })
    });
  }
  loadRestCards();
}

async function deleteRest(id) {
  if (!confirm("Rostdan ochirmoqchimisiz?")) return;
  await api('/superadmin/restaurants/' + id, { method: 'DELETE' });
  loadRestCards();
}
// ===== NOTIFICATION POLLING =====
async function pollSANotifs() {
  try {
    var d = await api('/superadmin/notifications?unreadOnly=true&limit=1');
    if (d && d.ok) {
      var b = document.getElementById('saNotifBadge');
      if (b) { if (d.unreadCount > 0) { b.textContent = d.unreadCount > 99 ? '99+' : d.unreadCount; b.style.display = 'inline-block'; } else { b.style.display = 'none'; } }
    }
  } catch(e) {}
}

// ===== ANALYTICS PAGE =====
// ===== PAYMENTS PAGE =====
async function renderPayments(main) {
  main.innerHTML = '<div class="page"><div class="flex items-center justify-between flex-wrap gap-3 mb-6"><div><h1 class="text-2xl font-bold font-serif">💰 To\'lovlar</h1><p class="text-sm text-slate-500 mt-1">Obuna to\'lovlari va tarix</p></div><button onclick="openPayModal()" class="px-4 py-2 rounded-xl text-sm font-bold text-white" style="background:var(--sx-grad)">+ To\'lov qo\'shish</button></div><div id="paySummary" class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6"></div><div id="payTable" style="' + border12() + '" class="text-slate-500 text-center py-12">Yuklanmoqda...</div></div>';
  var d = await api('/superadmin/payments');
  if (!d || !d.ok) return;

  document.getElementById('paySummary').innerHTML =
    sc('💰','Jami tushum', Number(d.totalReceived).toLocaleString() + " so'm", 'Barcha vaqt') +
    sc('📅','Bu oylik', Number(d.monthReceived).toLocaleString() + " so'm", 'Joriy oy') +
    sc('🧾','To\'lovlar soni', d.payments.length, 'Oxirgi 50 ta');

  if (!d.payments.length) { document.getElementById('payTable').innerHTML = '<div class="text-center py-12 text-slate-500">To\'lovlar yo\'q</div>'; return; }

  var rows = d.payments.map(function(p) {
    var tc = p.type === 'refund' ? 'text-red-400' : 'text-emerald-400';
    var mc = { cash:'Naqd', card:'Karta', transfer:"O'tkazma" };
    return '<tr class="border-b border-cyan-500/5"><td class="px-4 py-3 text-sm font-semibold">' + p.restaurantId + '</td><td class="px-4 py-3 text-sm ' + tc + ' font-bold">' + Number(p.amount).toLocaleString() + '</td><td class="px-4 py-3 text-xs">' + (mc[p.method] || p.method) + '</td><td class="px-4 py-3 text-xs text-cyan-400">' + (p.days || 0) + ' kun</td><td class="px-4 py-3 text-xs text-slate-500">' + (p.note || '') + '</td><td class="px-4 py-3 text-xs text-slate-500">' + new Date(p.createdAt).toLocaleDateString('uz-UZ') + '</td></tr>';
  }).join('');

  document.getElementById('payTable').innerHTML = '<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-cyan-500/10"><th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Restoran</th><th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Summa</th><th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Usul</th><th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Kunlar</th><th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Izoh</th><th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500">Sana</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function openPayModal(rId) {
  var sel = document.getElementById('payRestId');
  sel.innerHTML = allRests.map(function(r) { return '<option value="' + r.restaurantId + '"' + (r.restaurantId === rId ? ' selected' : '') + '>' + r.restaurantName + '</option>'; }).join('');
  document.getElementById('payAmount').value = '';
  document.getElementById('payDays').value = '30';
  document.getElementById('payNote').value = '';
  document.getElementById('payModal').style.display = 'flex';
}
function closePayModal() { document.getElementById('payModal').style.display = 'none'; }

async function savePayment() {
  var d = await api('/superadmin/payments', { method:'POST', body: JSON.stringify({
    restaurantId: document.getElementById('payRestId').value,
    amount: Number(document.getElementById('payAmount').value),
    type: document.getElementById('payType').value,
    method: document.getElementById('payMethod').value,
    days: Number(document.getElementById('payDays').value),
    note: document.getElementById('payNote').value.trim()
  })});
  if (d && d.ok) { closePayModal(); renderPayments(document.getElementById('mainContent')); }
  else alert('Xato: ' + ((d && d.error) || ''));
}

// ===== BOTS PAGE =====
async function renderBots(main) {
  main.innerHTML = '<div class="page"><h1 class="text-2xl font-bold font-serif mb-1">📱 Bot monitoring</h1><p class="text-sm text-slate-500 mb-6">Telegram botlar holati</p><div id="botCards" class="text-center py-12 text-slate-500">Yuklanmoqda...</div></div>';
  var d = await api('/superadmin/bots');
  if (!d || !d.ok) return;

  var summary = '<div class="grid grid-cols-3 gap-4 mb-6">' +
    sc('🤖','Jami botlar', d.totalCount, '') +
    sc('✅','Ishlayotgan', d.runningCount, 'Aktiv') +
    sc('⛔','To\'xtagan', d.totalCount - d.runningCount, '') +
  '</div>';

  var cards = d.bots.map(function(b) {
    var statusColor = b.isRunning ? 'bg-emerald-500' : 'bg-red-500';
    var statusText = b.isRunning ? 'Ishlayapti' : b.hasToken ? 'To\'xtagan' : 'Token yo\'q';
    return '<div class="rounded-xl border p-4 mb-3" style="' + border12() + '">' +
      '<div class="flex items-center gap-3">' +
        '<div class="w-3 h-3 rounded-full ' + statusColor + ' animate-pulse flex-shrink-0"></div>' +
        '<div class="flex-1"><div class="font-semibold text-sm">' + b.restaurantName + '</div><div class="text-xs text-slate-500">' + b.restaurantId + ' · ' + statusText + '</div></div>' +
        '<div class="flex gap-2">' +
          (b.hasToken ? '<button onclick="restartBot(\'' + b.restaurantId + '\')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">🔄 Qayta ishga</button>' : '') +
          (b.isRunning ? '<button onclick="stopBotUI(\'' + b.restaurantId + '\')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">⏹ To\'xtatish</button>' : '') +
        '</div>' +
      '</div></div>';
  }).join('');

  document.getElementById('botCards').innerHTML = summary + cards;
}

async function restartBot(rId) {
  var d = await api('/superadmin/bots/' + rId + '/restart', { method:'POST' });
  if (d && d.ok) { alert('✅ Bot qayta ishga tushdi'); renderBots(document.getElementById('mainContent')); }
  else alert('Xato');
}
async function stopBotUI(rId) {
  if (!confirm('Botni to\'xtatish?')) return;
  await api('/superadmin/bots/' + rId + '/stop', { method:'POST' });
  renderBots(document.getElementById('mainContent'));
}

// ===== AUDIT LOG PAGE =====
async function renderAuditLog(main) {
  main.innerHTML = '<div class="page"><h1 class="text-2xl font-bold font-serif mb-1">📋 Audit log</h1><p class="text-sm text-slate-500 mb-6">Barcha amallar tarixi</p><div id="auditContent" class="text-center py-12 text-slate-500">Yuklanmoqda...</div></div>';
  var d = await api('/superadmin/audit-log?limit=100');
  if (!d || !d.ok) return;

  if (!d.logs.length) { document.getElementById('auditContent').innerHTML = '<div class="text-center py-12 text-slate-500">Amallar tarixi bo\'sh</div>'; return; }

  var actionIcons = { restaurant_create:'🏪', restaurant_block:'🔒', restaurant_unblock:'✅', payment_add:'💰', bot_restart:'🔄', bot_stop:'⏹', password_change:'🔑' };
  var rows = d.logs.map(function(l) {
    var icon = actionIcons[l.action] || '📝';
    var timeAgo = getTimeAgo(l.createdAt);
    return '<div class="flex items-start gap-3 py-3 border-b border-cyan-500/5">' +
      '<div class="text-xl flex-shrink-0 mt-0.5">' + icon + '</div>' +
      '<div class="flex-1 min-w-0"><div class="text-sm font-semibold">' + l.action.replace(/_/g, ' ').toUpperCase() + '</div>' +
      '<div class="text-xs text-slate-500 mt-0.5">' + (l.details || '') + '</div>' +
      (l.restaurantId ? '<div class="text-xs text-cyan-400 mt-0.5">🏪 ' + l.restaurantId + '</div>' : '') + '</div>' +
      '<div class="text-right flex-shrink-0"><div class="text-xs text-slate-500">' + timeAgo + '</div><div class="text-xs text-slate-600">@' + l.actor + '</div></div>' +
    '</div>';
  }).join('');

  document.getElementById('auditContent').innerHTML = '<div class="rounded-xl border p-5" style="' + border12() + '">' + rows + '</div>';
}

function getTimeAgo(dateStr) {
  var now = new Date(), d = new Date(dateStr), diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Hozir';
  if (diff < 3600) return Math.floor(diff / 60) + ' daq';
  if (diff < 86400) return Math.floor(diff / 3600) + ' soat';
  return Math.floor(diff / 86400) + ' kun';
}

// ===== SA NOTIFICATIONS PAGE =====
async function renderSANotifications(main) {
  main.innerHTML = '<div class="page"><div class="flex items-center justify-between flex-wrap gap-3 mb-6"><div><h1 class="text-2xl font-bold font-serif">🔔 Bildirishnomalar</h1><p class="text-sm text-slate-500 mt-1">Platforma ogohlantirishlari va xabar yuborish</p></div><div class="flex gap-2"><button onclick="openSendMsgModal()" class="px-4 py-2 rounded-xl text-xs font-semibold" style="background:var(--sx-grad);color:#fff">✉️ Xabar yuborish</button><button onclick="markAllSARead()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">✓ O\'qilgan</button></div></div><div id="saNotifList" class="text-center py-12 text-slate-500">Yuklanmoqda...</div></div>';
  var d = await api('/superadmin/notifications?limit=50');
  if (!d || !d.ok) return;

  if (!d.notifications.length) { document.getElementById('saNotifList').innerHTML = '<div class="text-center py-12 text-slate-500">🔕 Bildirishnomalar yo\'q</div>'; return; }

  document.getElementById('saNotifList').innerHTML = d.notifications.map(function(n) {
    var bg = n.read ? border12('padding:16px;margin-bottom:8px') : border12('padding:16px;margin-bottom:8px;border-left:3px solid #06b6d4');
    return '<div style="' + bg + '">' +
      '<div class="flex items-start gap-3">' +
        '<div class="text-2xl flex-shrink-0">' + (n.icon || '🔔') + '</div>' +
        '<div class="flex-1"><div class="text-sm font-semibold">' + n.title + '</div>' + (n.message ? '<div class="text-xs text-slate-500 mt-1">' + n.message + '</div>' : '') + '</div>' +
        '<div class="text-xs text-slate-600 flex-shrink-0">' + getTimeAgo(n.createdAt) + '</div>' +
      '</div></div>';
  }).join('');
  pollSANotifs();
}

// Xabar yuborish modal
function openSendMsgModal() {
  var old = document.getElementById('sendMsgModal');
  if (old) old.remove();
  var checkboxes = allRests.map(function(r) {
    return '<label class="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-cyan-500/5 cursor-pointer">' +
      '<input type="checkbox" value="' + r.restaurantId + '" class="msgRestCheck accent-cyan-500" style="width:16px;height:16px"/>' +
      '<span class="text-sm">' + r.restaurantName + '</span>' +
      '<span class="text-xs text-slate-600 ml-auto">' + r.restaurantId + '</span>' +
    '</label>';
  }).join('');

  var el = document.createElement('div');
  el.id = 'sendMsgModal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  el.innerHTML =
    '<div style="background:#0d1220;border:1px solid rgba(6,182,212,0.2);border-radius:16px;padding:24px;max-width:480px;width:100%;max-height:85vh;overflow-y:auto">' +
      '<h2 class="text-lg font-bold text-cyan-400 mb-4">✉️ Admin\'larga xabar yuborish</h2>' +
      '<div class="mb-3"><label class="block text-xs uppercase tracking-widest mb-2 text-slate-500">Qabul qiluvchilar</label>' +
        '<div class="flex gap-2 mb-2"><button onclick="selectAllMsgRests(true)" class="text-xs text-cyan-400 hover:underline">Hammasini belgilash</button><button onclick="selectAllMsgRests(false)" class="text-xs text-slate-500 hover:underline">Bekor qilish</button></div>' +
        '<div style="max-height:150px;overflow-y:auto;background:#141d2e;border:1px solid rgba(6,182,212,0.15);border-radius:8px;padding:8px">' + checkboxes + '</div>' +
      '</div>' +
      '<div class="mb-3"><label class="block text-xs uppercase tracking-widest mb-2 text-slate-500">Sarlavha *</label><input id="msgTitle" class="inp" type="text" placeholder="Muhim xabar!"/></div>' +
      '<div class="mb-3"><label class="block text-xs uppercase tracking-widest mb-2 text-slate-500">Xabar matni</label><textarea id="msgBody" class="inp" rows="3" placeholder="Batafsil..." style="resize:vertical"></textarea></div>' +
      '<div class="mb-4"><label class="block text-xs uppercase tracking-widest mb-2 text-slate-500">Emoji</label>' +
        '<div class="flex gap-2">' +
          ['📩','⚠️','💰','🔧','📢','🎉'].map(function(e) { return '<button onclick="document.getElementById(\'msgIcon\').value=\'' + e + '\';this.parentNode.querySelectorAll(\'button\').forEach(function(b){b.style.background=\'\'});this.style.background=\'rgba(6,182,212,0.2)\'" class="w-10 h-10 rounded-lg border border-cyan-500/20 text-xl flex items-center justify-center cursor-pointer" style="display:flex;align-items:center;justify-content:center">' + e + '</button>'; }).join('') +
          '<input type="hidden" id="msgIcon" value="📩"/>' +
        '</div>' +
      '</div>' +
      '<div class="flex gap-3">' +
        '<button onclick="closeSendMsgModal()" class="px-5 py-2.5 rounded-xl text-sm border border-cyan-500/20 text-slate-500">Bekor</button>' +
        '<button onclick="sendAdminMessage()" class="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style="background:var(--sx-grad)">Yuborish</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
  el.addEventListener('click', function(e) { if (e.target === el) closeSendMsgModal(); });
}

function closeSendMsgModal() { var el = document.getElementById('sendMsgModal'); if (el) el.remove(); }
function selectAllMsgRests(val) { document.querySelectorAll('.msgRestCheck').forEach(function(cb) { cb.checked = val; }); }

async function sendAdminMessage() {
  var checked = [];
  document.querySelectorAll('.msgRestCheck:checked').forEach(function(cb) { checked.push(cb.value); });
  var title = document.getElementById('msgTitle').value.trim();
  var message = document.getElementById('msgBody').value.trim();
  var icon = document.getElementById('msgIcon').value || '📩';
  if (!checked.length) { alert('Kamida bitta restoran tanlang!'); return; }
  if (!title) { alert('Sarlavha kiriting!'); return; }
  var d = await api('/superadmin/send-message', { method:'POST', body: JSON.stringify({ restaurantIds: checked, title: title, message: message, icon: icon }) });
  if (d && d.ok) { alert('✅ ' + d.sent + ' ta admin\'ga yuborildi!'); closeSendMsgModal(); }
  else alert('Xato: ' + ((d && d.error) || ''));
}

async function markAllSARead() {
  await api('/superadmin/notifications/read-all', { method:'PUT' });
  renderSANotifications(document.getElementById('mainContent'));
}

// ===== SETTINGS PAGE =====
async function renderSettings(main) {
  main.innerHTML = '<div class="page"><h1 class="text-2xl font-bold font-serif mb-1">⚙️ Sozlamalar</h1><p class="text-sm text-slate-500 mb-6">Superadmin sozlamalari</p>' +
    '<div class="rounded-xl border p-6 max-w-md" style="' + border12() + '">' +
      '<h3 class="text-sm font-bold text-cyan-400 mb-4">🔑 Parol o\'zgartirish</h3>' +
      '<div class="mb-4"><label class="block text-xs uppercase tracking-widest mb-2 text-slate-500">Joriy parol</label><input id="setCurPass" class="inp" type="password"/></div>' +
      '<div class="mb-4"><label class="block text-xs uppercase tracking-widest mb-2 text-slate-500">Yangi parol</label><input id="setNewPass" class="inp" type="password"/></div>' +
      '<div class="mb-4"><label class="block text-xs uppercase tracking-widest mb-2 text-slate-500">Yangi parol (takror)</label><input id="setNewPass2" class="inp" type="password"/></div>' +
      '<button onclick="changePassword()" class="px-6 py-2.5 rounded-xl text-sm font-bold text-white" style="background:var(--sx-grad)">Saqlash</button>' +
      '<div id="setErr" class="text-sm mt-3 text-red-400" style="display:none"></div>' +
      '<div id="setOk" class="text-sm mt-3 text-emerald-400" style="display:none"></div>' +
    '</div>' +
    '<div class="rounded-xl border p-6 max-w-md mt-6" style="' + border12() + '">' +
      '<h3 class="text-sm font-bold text-cyan-400 mb-4">ℹ️ Tizim ma\'lumotlari</h3>' +
      '<div class="text-sm text-slate-500 mb-2">Username: <span class="text-slate-300 font-semibold">@' + (saInfo.username || '') + '</span></div>' +
      '<div class="text-sm text-slate-500 mb-2">Role: <span class="text-cyan-400 font-semibold">Superadmin</span></div>' +
      '<div class="text-sm text-slate-500">Platform: <span class="text-slate-300 font-semibold">ServiX v3.0 — Universal</span></div>' +
    '</div>' +
  '</div>';
}

async function changePassword() {
  var cur = document.getElementById('setCurPass').value;
  var np = document.getElementById('setNewPass').value;
  var np2 = document.getElementById('setNewPass2').value;
  var err = document.getElementById('setErr');
  var ok = document.getElementById('setOk');
  err.style.display = 'none'; ok.style.display = 'none';
  if (!cur || !np) { err.textContent = 'Barcha maydonlarni to\'ldiring'; err.style.display = 'block'; return; }
  if (np !== np2) { err.textContent = 'Yangi parollar mos kelmaydi'; err.style.display = 'block'; return; }
  if (np.length < 4) { err.textContent = 'Parol kamida 4 belgidan iborat bo\'lsin'; err.style.display = 'block'; return; }
  var d = await api('/superadmin/change-password', { method:'PUT', body: JSON.stringify({ currentPassword: cur, newPassword: np }) });
  if (d && d.ok) { ok.textContent = '✅ Parol o\'zgartirildi!'; ok.style.display = 'block'; document.getElementById('setCurPass').value = ''; document.getElementById('setNewPass').value = ''; document.getElementById('setNewPass2').value = ''; }
  else { err.textContent = (d && d.error) || 'Xato'; err.style.display = 'block'; }
}
// =============================================
// BUSINESS TYPES & DYNAMIC MODULE SYSTEM
// =============================================

// Biznes turlari ro'yxatini serverdan olish (cache bilan)
async function loadBusinessTypes() {
  if (businessTypesCache) return businessTypesCache;
  var data = await api('/superadmin/business-types');
  if (data && data.types) {
    businessTypesCache = data.types;

    // Dropdown ni yangilash
    var sel = document.getElementById('rBusinessType');
    if (sel) {
      sel.innerHTML = data.types.map(function(t) {
        return '<option value="' + t.key + '">' + t.icon + ' ' + t.label.uz + '</option>';
      }).join('');
    }
  }
  return businessTypesCache || [];
}

// Biznes turi labelini olish (kartochka uchun)
function getBusinessTypeLabel(type) {
  if (!type || type === 'restaurant') return '🍽️ Restoran';
  if (businessTypesCache) {
    var found = businessTypesCache.find(function(t) { return t.key === type; });
    if (found) return found.icon + ' ' + found.label.uz;
  }
  return type;
}

// Biznes turiga qarab modullar toggleni dinamik yuklash
async function loadModuleToggles(businessType, existingModules) {
  var container = document.getElementById('moduleToggles');
  if (!container) return;

  container.innerHTML = '<div style="color:#64748b;font-size:12px;padding:8px">Yuklanmoqda...</div>';

  var data = await api('/superadmin/business-types/' + (businessType || 'restaurant') + '/modules');
  if (!data || !data.modules) {
    container.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:8px">Modullarni yuklab bolmadi</div>';
    return;
  }

  // Description
  var descEl = document.getElementById('bizTypeDesc');
  if (descEl && data.label) {
    descEl.textContent = data.icon + ' ' + (data.label.uz || '');
  }

  container.innerHTML = '';
  data.modules.forEach(function(mod) {
    var isChecked;
    if (existingModules) {
      // Tahrirlash — hozirgi holatdan olish
      isChecked = existingModules[mod.key] === true;
    } else {
      // Yangi yaratish — default qiymat
      isChecked = mod.default;
    }

    var isCore = mod.core;
    var borderStyle = isCore
      ? 'border-color:rgba(34,197,94,0.25)'
      : (mod.default ? '' : 'border-color:rgba(245,158,11,0.25)');

    var label = document.createElement('label');
    label.className = 'mod-toggle';
    if (borderStyle) label.style.cssText = borderStyle;
    label.title = mod.description ? mod.description.uz : '';

    label.innerHTML =
      '<input type="checkbox" data-mod="' + mod.key + '"' +
        (isChecked ? ' checked' : '') +
        (isCore ? ' disabled' : '') +
      '/>' +
      '<span>' + mod.icon + ' ' + mod.label.uz +
        (isCore ? ' <span style="font-size:9px;color:#22c55e;font-weight:700">CORE</span>' : '') +
      '</span>';

    container.appendChild(label);
  });
}

// businessType dropdown o'zgarganda modullarni qayta yuklash
document.getElementById('rBusinessType').addEventListener('change', function() {
  loadModuleToggles(this.value, null);
});

// App boshlanganda businessTypes ni oldindan yuklash
(function() {
  var origStartApp = startApp;
  startApp = function() {
    origStartApp();
    loadBusinessTypes();
  };
})();
// =============================================
// AI MONITOR PAGE (Superadmin)
// =============================================
async function renderAiMonitor(main) {
  main.innerHTML =
    '<div class="page">' +
      '<div style="margin-bottom:24px">' +
        '<h1 style="font-family:\'Playfair Display\',serif;font-size:28px;font-weight:700">🤖 AI Monitor</h1>' +
        '<p style="font-size:13px;margin-top:4px;color:#64748b">Barcha bizneslarning AI yordamchi statistikasi</p>' +
      '</div>' +
      '<div id="aiMonitorContent" style="color:#64748b;padding:20px">Yuklanmoqda...</div>' +
    '</div>';

  var d = await api('/superadmin/ai/stats');
  if (!d || !d.ok) {
    document.getElementById('aiMonitorContent').innerHTML = '<div style="color:#f87171">Yuklab bo\'lmadi</div>';
    return;
  }

  var t = d.totals;
  var costUsd = t.totalCost.toFixed(4);
  var costSom = Math.round(t.totalCost * 12800);

  var summaryHtml =
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px">' +
      aiStatCard('📨', 'Jami surovlar', t.totalRequests, 'Bu oy') +
      aiStatCard('🔤', 'Jami tokenlar', t.totalTokens.toLocaleString(), 'input+output') +
      aiStatCard('💵', 'Xarajat', '$' + costUsd, costSom.toLocaleString() + ' so\'m') +
      aiStatCard('🏢', 'Faol bizneslar', t.activeBusinesses + '/' + t.totalBusinesses, 'AI ishlatyapti') +
    '</div>';

  // Per-restaurant table
  var rows = d.perRestaurant.map(function(r) {
    var pct = r.aiLimit > 0 ? Math.round((r.used / r.aiLimit) * 100) : 0;
    var barColor = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#22c55e';
    var remaining = Math.max(0, r.aiLimit - r.used);
    return '<tr style="border-bottom:1px solid rgba(6,182,212,0.06)">' +
      '<td style="padding:12px 10px"><div style="font-weight:600;font-size:13px">' + r.restaurantName + '</div><div style="font-size:11px;color:#64748b">' + r.restaurantId + '</div></td>' +
      '<td style="padding:12px 10px;text-align:center"><span style="font-size:11px;padding:3px 8px;border-radius:99px;' + (r.aiEnabled ? 'background:rgba(34,197,94,0.15);color:#22c55e' : 'background:rgba(239,68,68,0.15);color:#ef4444') + '">' + (r.aiEnabled ? 'Yoqilgan' : 'O\'chiq') + '</span></td>' +
      '<td style="padding:12px 10px;text-align:center;font-weight:600;color:#22d3ee">' + r.used + '</td>' +
      // Token qoldi
      '<td style="padding:12px 10px;text-align:center"><span style="font-size:13px;font-weight:700;color:' + (remaining <= 10 ? '#ef4444' : remaining <= 50 ? '#f59e0b' : '#22c55e') + '">' + remaining + '</span><span style="font-size:11px;color:#64748b"> / ' + r.aiLimit + '</span></td>' +
      // Progress bar
      '<td style="padding:12px 10px">' +
        '<div style="width:100%;height:6px;background:#1a2235;border-radius:3px"><div style="height:100%;width:' + Math.min(100, pct) + '%;background:' + barColor + ';border-radius:3px"></div></div>' +
      '</td>' +
      '<td style="padding:12px 10px;text-align:center;font-size:12px;color:#64748b">' + r.totalTokens.toLocaleString() + '</td>' +
      '<td style="padding:12px 10px;text-align:center;font-size:12px;color:#22c55e">$' + r.totalCost.toFixed(4) + '</td>' +
      // Amallar — token qo'shish + limit o'zgartirish + tarix
      '<td style="padding:12px 10px">' +
        '<div style="display:flex;flex-direction:column;gap:4px;align-items:center">' +
          '<div style="display:flex;gap:3px">' +
            '<button onclick="addAiTokens(\'' + r.restaurantId + '\',\'' + r.restaurantName + '\',' + r.aiLimit + ')" style="padding:4px 8px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit" title="Token qo\'shish">➕ Token</button>' +
            '<button onclick="viewAiHistory(\'' + r.restaurantId + '\',\'' + r.restaurantName + '\')" style="padding:4px 8px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:#a78bfa;border-radius:6px;font-size:11px;cursor:pointer" title="Tarix">📜</button>' +
          '</div>' +
          '<div style="display:flex;gap:3px;align-items:center">' +
            '<input type="number" value="' + r.aiLimit + '" min="0" max="100000" id="aiLimitInput_' + r.restaurantId + '" style="width:55px;padding:3px 4px;background:#1a2235;border:1px solid rgba(6,182,212,0.15);border-radius:5px;color:#f1f5f9;font-size:11px;text-align:center"/>' +
            '<button onclick="updateAiLimit(\'' + r.restaurantId + '\',document.getElementById(\'aiLimitInput_' + r.restaurantId + '\').value)" style="padding:3px 6px;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:5px;font-size:10px;cursor:pointer">✓</button>' +
          '</div>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');

  var tableHtml =
    '<div style="' + border12('overflow:hidden') + '">' +
      '<div style="padding:14px 18px;border-bottom:1px solid rgba(6,182,212,0.1);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:14px;font-weight:700">Bizneslar bo\'yicha AI statistika</span>' +
      '</div>' +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="background:rgba(6,182,212,0.04)">' +
          '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">BIZNES</th>' +
          '<th style="padding:10px;text-align:center;font-size:11px;color:#64748b;font-weight:600">HOLAT</th>' +
          '<th style="padding:10px;text-align:center;font-size:11px;color:#64748b;font-weight:600">ISHLATGAN</th>' +
          '<th style="padding:10px;text-align:center;font-size:11px;color:#64748b;font-weight:600">QOLDI / LIMIT</th>' +
          '<th style="padding:10px;text-align:center;font-size:11px;color:#64748b;font-weight:600">PROGRESS</th>' +
          '<th style="padding:10px;text-align:center;font-size:11px;color:#64748b;font-weight:600">TOKENLAR</th>' +
          '<th style="padding:10px;text-align:center;font-size:11px;color:#64748b;font-weight:600">XARAJAT</th>' +
          '<th style="padding:10px;text-align:center;font-size:11px;color:#64748b;font-weight:600">AMALLAR</th>' +
        '</tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="8" style="text-align:center;padding:30px;color:#475569">Hali AI surov yo\'q</td></tr>') + '</tbody>' +
      '</table></div>' +
    '</div>';

  document.getElementById('aiMonitorContent').innerHTML = summaryHtml + tableHtml;
}

function aiStatCard(icon, label, value, sub) {
  return '<div style="' + border12('padding:16px') + '">' +
    '<div style="font-size:22px;margin-bottom:8px">' + icon + '</div>' +
    '<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">' + label + '</div>' +
    '<div style="font-size:22px;font-weight:700;color:#f1f5f9">' + value + '</div>' +
    '<div style="font-size:11px;color:#64748b;margin-top:2px">' + sub + '</div>' +
  '</div>';
}

async function updateAiLimit(restaurantId, limit) {
  var d = await api('/superadmin/ai/limit/' + restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ limit: Number(limit) })
  });
  if (d && d.ok) {
    alert('✅ AI limit yangilandi: ' + limit);
    renderAiMonitor(document.getElementById('mainContent'));
  } else {
    alert('Xato: ' + (d?.error || 'Server xatosi'));
  }
}

// Token qo'shish — modal bilan
function addAiTokens(restaurantId, restaurantName, currentLimit) {
  var old = document.getElementById('addTokenModal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'addTokenModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  modal.innerHTML =
    '<div style="background:#0d1220;border:1px solid rgba(16,185,129,0.3);border-radius:16px;width:100%;max-width:400px;padding:24px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div style="font-size:18px;font-weight:700;color:#10b981">➕ Token qo\'shish</div>' +
        '<button onclick="document.getElementById(\'addTokenModal\').remove()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:4px">' + restaurantName + '</div>' +
        '<div style="font-size:12px;color:#64748b">' + restaurantId + '</div>' +
      '</div>' +
      '<div style="background:#1a2235;border-radius:10px;padding:14px;margin-bottom:16px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
          '<span style="font-size:12px;color:#64748b">Hozirgi limit:</span>' +
          '<span style="font-size:14px;font-weight:700;color:#f1f5f9">' + currentLimit + ' ta</span>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:#64748b;margin-bottom:6px">Qo\'shiladigan token soni</label>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px">' +
          '<button class="atk-btn" onclick="document.getElementById(\'addTokenAmount\').value=50" style="flex:1;padding:8px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);color:#22d3ee;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">+50</button>' +
          '<button class="atk-btn" onclick="document.getElementById(\'addTokenAmount\').value=100" style="flex:1;padding:8px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);color:#22d3ee;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">+100</button>' +
          '<button class="atk-btn" onclick="document.getElementById(\'addTokenAmount\').value=500" style="flex:1;padding:8px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);color:#22d3ee;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">+500</button>' +
          '<button class="atk-btn" onclick="document.getElementById(\'addTokenAmount\').value=1000" style="flex:1;padding:8px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);color:#22d3ee;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">+1000</button>' +
        '</div>' +
        '<input type="number" id="addTokenAmount" value="100" min="1" max="100000" class="inp" style="text-align:center;font-size:18px;font-weight:700"/>' +
      '</div>' +
      '<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#64748b">' +
        'Yangi limit: <span style="color:#10b981;font-weight:700" id="addTokenNewLimit">' + (currentLimit + 100) + '</span> ta (' + currentLimit + ' + <span id="addTokenPlus">100</span>)' +
      '</div>' +
      '<button onclick="confirmAddTokens(\'' + restaurantId + '\',' + currentLimit + ')" style="width:100%;padding:12px;background:linear-gradient(135deg,#10b981,#06b6d4);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer">✅ Token qo\'shish</button>' +
    '</div>';

  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  // Input o'zgarganda yangi limitni ko'rsatish
  var amountInput = document.getElementById('addTokenAmount');
  amountInput.addEventListener('input', function() {
    var amount = Number(amountInput.value) || 0;
    var newLimitEl = document.getElementById('addTokenNewLimit');
    var plusEl = document.getElementById('addTokenPlus');
    if (newLimitEl) newLimitEl.textContent = currentLimit + amount;
    if (plusEl) plusEl.textContent = amount;
  });
}

async function confirmAddTokens(restaurantId, currentLimit) {
  var amount = Number(document.getElementById('addTokenAmount').value) || 0;
  if (amount <= 0) { alert('Token soni musbat bo\'lishi kerak'); return; }

  var newLimit = currentLimit + amount;
  var d = await api('/superadmin/ai/limit/' + restaurantId, {
    method: 'PUT',
    body: JSON.stringify({ limit: newLimit })
  });

  if (d && d.ok) {
    document.getElementById('addTokenModal').remove();
    alert('✅ ' + amount + ' ta token qo\'shildi! Yangi limit: ' + newLimit);
    renderAiMonitor(document.getElementById('mainContent'));
  } else {
    alert('Xato: ' + (d?.error || 'Server xatosi'));
  }
}

async function viewAiHistory(restaurantId, name) {
  var d = await api('/superadmin/ai/history/' + restaurantId + '?limit=30');
  if (!d || !d.ok || !d.chats.length) {
    alert('Bu biznesda AI surov tarixi yo\'q');
    return;
  }

  var html = d.chats.map(function(c) {
    return '<div style="margin-bottom:12px;padding:12px;background:#0f1828;border:1px solid rgba(139,92,246,0.1);border-radius:10px">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
        '<span style="font-size:11px;color:#a78bfa;font-weight:600">' + (c.adminUsername || 'admin') + '</span>' +
        '<span style="font-size:10px;color:#475569">' + new Date(c.createdAt).toLocaleString('uz-UZ') + '</span>' +
      '</div>' +
      '<div style="font-size:13px;color:#22d3ee;margin-bottom:4px">❓ ' + (c.question || '').substring(0, 100) + '</div>' +
      '<div style="font-size:12px;color:#94a3b8;line-height:1.5">🤖 ' + (c.answer || '').substring(0, 200) + (c.answer && c.answer.length > 200 ? '...' : '') + '</div>' +
    '</div>';
  }).join('');

  var old = document.getElementById('aiHistoryModal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'aiHistoryModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  modal.innerHTML =
    '<div style="background:#0d1220;border:1px solid rgba(139,92,246,0.2);border-radius:16px;width:100%;max-width:600px;max-height:85vh;display:flex;flex-direction:column">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid rgba(139,92,246,0.15)">' +
        '<div style="font-size:16px;font-weight:700;color:#c4b5fd">🤖 AI Tarix — ' + name + '</div>' +
        '<button onclick="document.getElementById(\'aiHistoryModal\').remove()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="padding:16px 20px;overflow-y:auto;flex:1">' + html + '</div>' +
    '</div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}