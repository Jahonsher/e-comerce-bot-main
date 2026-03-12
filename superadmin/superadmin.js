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
  if (page === 'dashboard')   renderDashboard(main);
  if (page === 'restaurants') renderRestaurants(main);
}

// ===== HELPERS =====
function border12(extra) {
  return 'border-radius:12px;border:1px solid rgba(139,92,246,0.12);background:#0f1828;' + (extra || '');
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
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#8b5cf6,' + color + ');border-radius:3px"></div>' +
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
          '<div style="width:22px;height:22px;border-radius:50%;background:#8b5cf6;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + (i + 1) + '</div>' +
          '<div style="flex:1">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
              '<span style="font-size:13px;font-weight:600">' + p._id + '</span>' +
              '<span style="font-size:12px;color:#f59e0b">' + p.quantity + ' ta</span>' +
            '</div>' +
            '<div style="height:5px;background:#1a2235;border-radius:3px;overflow:hidden">' +
              '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#8b5cf6,#f59e0b);border-radius:3px"></div>' +
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
        smc(lbl + ' buyurtmalar', pd.orders, '#a78bfa') +
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
          backgroundColor: 'rgba(139,92,246,0.6)',
          borderColor: '#8b5cf6',
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
        x:  { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(139,92,246,0.06)' } },
        y:  { ticks: { color: '#a78bfa', font: { size: 11 } }, grid: { color: 'rgba(139,92,246,0.06)' }, position: 'left' },
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
        '<h1 style="font-family:\'Playfair Display\',serif;font-size:28px;font-weight:700">Restoranlar</h1>' +
        '<p style="font-size:13px;margin-top:4px;color:#64748b">Barcha ulangan restoranlar</p>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">' +
        '<button id="addRestBtn" style="padding:10px 20px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;font-family:Manrope,sans-serif;font-size:13px;font-weight:700;border:none;cursor:pointer">+ Yangi restoran</button>' +
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
    el.innerHTML = '<div style="color:#64748b;padding:20px">Hali restoran qoshilmagan</div>';
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
        '<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🏪</div>' +
        '<div style="flex:1">' +
          '<div style="font-weight:700;font-size:14px">' + r.restaurantName + '</div>' +
          '<div style="font-size:12px;color:#64748b;margin-top:2px">ID: ' + r.restaurantId + ' · @' + r.username + '</div>' +
        '</div>' +
        '<span style="font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600;' + (isActive ? 'background:rgba(16,185,129,0.15);color:#10b981' : 'background:rgba(239,68,68,0.15);color:#ef4444') + '">' + (isActive ? 'Faol' : 'Bloklangan') + '</span>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
        '<div style="background:#141d2e;border-radius:10px;padding:12px">' +
          '<div style="font-size:11px;color:#64748b;margin-bottom:4px">Bugun</div>' +
          '<div style="font-size:22px;font-weight:700;color:#a78bfa">' + r.todayOrders + '</div>' +
        '</div>' +
        '<div style="background:#141d2e;border-radius:10px;padding:12px">' +
          '<div style="font-size:11px;color:#64748b;margin-bottom:4px">Jami</div>' +
          '<div style="font-size:22px;font-weight:700">' + r.totalOrders + '</div>' +
        '</div>' +
      '</div>' +

      (r.phone   ? '<div style="font-size:12px;color:#64748b;margin-bottom:4px">📞 ' + r.phone   + '</div>' : '') +
      (r.address ? '<div style="font-size:12px;color:#64748b;margin-bottom:8px">📍 ' + r.address + '</div>' : '') +

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
        '<button class="edit-btn" style="flex:1;padding:8px;border-radius:8px;background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.3);color:#a78bfa;font-family:Manrope,sans-serif;font-size:12px;font-weight:600;cursor:pointer">✏️ Tahrirlash</button>' +
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
  document.getElementById('restModalTitle').textContent = r ? 'Restoranni tahrirlash' : "Yangi restoran qoshish";
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
  document.getElementById('restModal').classList.remove('hidden');
  document.getElementById('restModal').style.display = 'flex';
}

function closeRestModal() {
  document.getElementById('restModal').classList.add('hidden');
  document.getElementById('restModal').style.display = '';
}

async function saveRest() {
  var id   = document.getElementById('restEditId').value;
  var body = {
    restaurantName: document.getElementById('rName').value.trim(),
    restaurantId:   document.getElementById('rId').value.trim().toLowerCase().replace(/\s+/g, '_'),
    username:       document.getElementById('rUsername').value.trim(),
    password:       document.getElementById('rPassword').value,
    phone:          document.getElementById('rPhone').value.trim(),
    address:        document.getElementById('rAddress').value.trim(),
    botToken:       document.getElementById('rBotToken').value.trim(),
    chefId:         Number(document.getElementById('rChefId').value),
    webappUrl:      document.getElementById('rWebapp').value.trim()
  };
  if (!body.restaurantName) { alert('Restoran nomi majburiy'); return; }
  var result;
  if (id) {
    var upd = {
      restaurantName: body.restaurantName,
      phone:   body.phone,
      address: body.address,
      botToken: body.botToken,
      chefId:   body.chefId,
      webappUrl: body.webappUrl
    };
    if (body.password) upd.password = body.password;
    result = await api('/superadmin/restaurants/' + id, { method: 'PUT', body: JSON.stringify(upd) });
  } else {
    if (!body.username || !body.password || !body.restaurantId) { alert('Login, parol va ID majburiy'); return; }
    result = await api('/superadmin/restaurants', { method: 'POST', body: JSON.stringify(body) });
  }
  if (result && result.error) { alert(result.error); return; }
  closeRestModal();
  loadRestCards();
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
    '<div style="font-size:16px;font-weight:700;color:#f1f5f9;text-align:center;margin-bottom:6px">Restoranni bloklash</div>',
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
    '<div style="font-size:16px;font-weight:700;color:#f1f5f9;text-align:center;margin-bottom:6px">Restoranni faollashtirish</div>',
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
