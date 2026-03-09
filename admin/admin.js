var API = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://e-comerce-bot-main-production.up.railway.app';

var token     = localStorage.getItem('adminToken');
var adminInfo = JSON.parse(localStorage.getItem('adminInfo') || '{}');
var weeklyChart = null;
var typeChart   = null;
var currentOrderFilter = 'all';
var dragSrc = null;

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
      showErr(errEl, "❌ Login yoki parol noto'g'ri");
      document.getElementById('loginPass').value = '';
      document.getElementById('loginPass').focus();
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
    if (r.status === 401) { doLogout(); return null; }
    return r.json();
  } catch(e) {
    console.error('apiFetch error:', e);
    return null;
  }
}

// ===== START =====
function startApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sidebarRestName').textContent = adminInfo.restaurantName || 'Restoran';
  document.getElementById('adminUsername').textContent   = '@' + (adminInfo.username || '');
  showPage('dashboard');
}

if (token) startApp();

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
function showPage(page) {
  document.querySelectorAll('.sidebar-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  if (window.innerWidth < 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.add('hidden');
  }
  var main = document.getElementById('mainContent');
  if (page === 'dashboard')  renderDashboard(main);
  if (page === 'orders')     renderOrders(main, 'all');
  if (page === 'products')   renderProducts(main);
  if (page === 'categories') renderCategories(main);
  if (page === 'ratings')    renderRatings(main);
  if (page === 'users')      renderUsers(main);
  if (page === 'branches')   renderBranches(main);
  if (page === 'employees')  renderEmployees(main);
  if (page === 'attendance') renderAttendance(main);
  if (page === 'empReport')  renderEmpReport(main);
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
  return '<div class="rounded-xl border p-5 mb-5" style="background:#131c2e;border-color:rgba(99,179,237,0.12)">' + content + '</div>';
}

function pageHeader(title, sub) {
  return '<div class="mb-6"><h1 class="font-serif text-3xl font-bold">' + title + '</h1>' + (sub ? '<p class="text-sm mt-1" style="color:#64748b">' + sub + '</p>' : '') + '</div>';
}

function statCard(icon, label, value, sub) {
  return '<div class="rounded-xl border p-5" style="background:#131c2e;border-color:rgba(99,179,237,0.12)">' +
    '<div class="text-3xl mb-2">' + icon + '</div>' +
    '<div class="text-xs uppercase tracking-widest mb-2" style="color:#64748b">' + label + '</div>' +
    '<div class="text-3xl font-bold">' + value + '</div>' +
    '<div class="text-xs mt-1" style="color:#64748b">' + sub + '</div>' +
  '</div>';
}

function tableWrap(headerHtml, bodyHtml) {
  return '<div class="rounded-xl border overflow-hidden mb-5" style="background:#131c2e;border-color:rgba(99,179,237,0.12)">' +
    '<div class="flex justify-between items-center flex-wrap gap-2 px-5 py-4 border-b" style="border-color:rgba(99,179,237,0.12)">' + headerHtml + '</div>' +
    '<div class="overflow-x-auto">' +
      '<table class="w-full border-collapse">' + bodyHtml + '</table>' +
    '</div>' +
  '</div>';
}

var thStyle = 'padding:10px 16px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#64748b;background:#1a2235;border-bottom:1px solid rgba(99,179,237,0.12)';
var tdStyle = 'padding:12px 16px;font-size:13px;border-bottom:1px solid rgba(99,179,237,0.05)';

// ===== DASHBOARD =====
async function renderDashboard(main) {
  main.innerHTML = '<div class="page">' +
    pageHeader('Dashboard', 'Bugungi holat va statistika') +
    '<div id="statsGrid" class="grid gap-4 mb-6" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))"><div style="color:#64748b">Yuklanmoqda...</div></div>' +
    '<div class="grid gap-4 mb-5" style="grid-template-columns:2fr 1fr">' +
      '<div class="rounded-xl border p-5" style="background:#131c2e;border-color:rgba(99,179,237,0.12)"><div class="text-sm font-semibold mb-4">📈 Haftalik buyurtmalar</div><div style="position:relative;height:220px"><canvas id="weeklyChart"></canvas></div></div>' +
      '<div class="rounded-xl border p-5" style="background:#131c2e;border-color:rgba(99,179,237,0.12)"><div class="text-sm font-semibold mb-4">🔵 Buyurtma turi</div><div style="position:relative;height:220px"><canvas id="typeChart"></canvas></div></div>' +
    '</div>' +
    '<div class="rounded-xl border p-5 mb-5" style="background:#131c2e;border-color:rgba(99,179,237,0.12)"><div class="text-sm font-semibold mb-4">🏆 Ko\'p sotilgan (TOP 5)</div><div id="topChart"></div></div>' +
    '<div class="rounded-xl border overflow-hidden mb-5" style="background:#131c2e;border-color:rgba(99,179,237,0.12)"><div class="px-5 py-4 border-b" style="border-color:rgba(99,179,237,0.12)"><span class="text-sm font-semibold">Oxirgi buyurtmalar</span></div><div id="recentOrders" class="overflow-x-auto"><div class="p-5" style="color:#64748b">Yuklanmoqda...</div></div></div>' +
  '</div>';

  var stats = await apiFetch('/admin/stats');
  if (!stats) return;

  document.getElementById('statsGrid').innerHTML =
    statCard('📦', 'Bugungi buyurtmalar', stats.today.orders, 'Oylik: ' + stats.month.orders + ' ta') +
    statCard('💰', 'Bugungi daromad', Number(stats.today.revenue).toLocaleString(), 'Oylik: ' + Number(stats.month.revenue).toLocaleString() + " so'm") +
    statCard('🌐', 'Online / Restoranda', stats.today.online + ' / ' + stats.today.dineIn, 'Bugun') +
    statCard('⭐', "O'rtacha reyting", stats.rating.avg || '—', stats.rating.count + ' ta baho') +
    statCard('👥', 'Foydalanuvchilar', stats.totalUsers, 'Jami');

  if (weeklyChart) weeklyChart.destroy();
  var wc = document.getElementById('weeklyChart');
  if (wc) weeklyChart = new Chart(wc.getContext('2d'), {
    type: 'bar',
    data: { labels: stats.weekly.map(function(d){return d.date;}), datasets: [{ label:'Buyurtmalar', data: stats.weekly.map(function(d){return d.orders;}), backgroundColor:'rgba(59,130,246,0.6)', borderColor:'#3b82f6', borderRadius:6, borderWidth:1 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'#64748b'},grid:{color:'rgba(99,179,237,0.06)'}}, y:{ticks:{color:'#64748b'},grid:{color:'rgba(99,179,237,0.06)'}} } }
  });

  if (typeChart) typeChart.destroy();
  var tc = document.getElementById('typeChart');
  if (tc) typeChart = new Chart(tc.getContext('2d'), {
    type: 'doughnut',
    data: { labels:['Online','Restoranda'], datasets:[{ data:[stats.today.online||0, stats.today.dineIn||0], backgroundColor:['rgba(139,92,246,0.7)','rgba(245,158,11,0.7)'], borderColor:['#8b5cf6','#f59e0b'], borderWidth:2 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',font:{size:12}}}}, cutout:'65%' }
  });

  if (stats.topProducts && stats.topProducts.length) {
    var maxQ = stats.topProducts[0].quantity;
    var html = '';
    stats.topProducts.forEach(function(p, i) {
      var pct = Math.round(p.quantity / maxQ * 100);
      html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
        '<div style="width:24px;height:24px;border-radius:50%;background:#3b82f6;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">' + (i+1) + '</div>' +
        '<div style="flex:1">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:5px">' +
            '<span style="font-size:13px;font-weight:600">' + p._id + '</span>' +
            '<span style="font-size:12px;color:#f59e0b">' + p.quantity + ' ta &middot; ' + Number(p.total).toLocaleString() + " so'm</span>" +
          '</div>' +
          '<div style="height:6px;background:#1a2235;border-radius:3px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#3b82f6,#f59e0b);border-radius:3px"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    document.getElementById('topChart').innerHTML = html;
  }

  var od = await apiFetch('/admin/orders?limit=8');
  if (od && od.orders) {
    var rows = '';
    od.orders.forEach(function(o) {
      var name  = ((o.userInfo&&o.userInfo.first_name)||'') + ' ' + ((o.userInfo&&o.userInfo.last_name)||'');
      var phone = (o.userInfo&&o.userInfo.phone)||'';
      rows += '<tr>' +
        '<td style="' + tdStyle + '">' + name.trim() + '<br><small style="color:#64748b">' + phone + '</small></td>' +
        '<td style="' + tdStyle + ';max-width:160px;font-size:12px">' + o.items.map(function(i){return i.name+'x'+i.quantity;}).join(', ') + '</td>' +
        '<td style="' + tdStyle + ';color:#f59e0b">' + Number(o.total).toLocaleString() + '</td>' +
        '<td style="' + tdStyle + '"><span class="badge ' + (o.orderType==='online'?'badge-online':'badge-dinein') + '">' + (o.orderType==='online'?'Online':'Restoran') + '</span></td>' +
        '<td style="' + tdStyle + '">' + statusBadge(o.status) + '</td>' +
        '<td style="' + tdStyle + ';color:#64748b;font-size:12px">' + fmtDate(o.createdAt) + '</td>' +
      '</tr>';
    });
    document.getElementById('recentOrders').innerHTML =
      '<table class="w-full border-collapse">' +
        '<thead><tr>' +
          '<th style="' + thStyle + '">Mijoz</th><th style="' + thStyle + '">Mahsulotlar</th>' +
          '<th style="' + thStyle + '">Jami</th><th style="' + thStyle + '">Tur</th>' +
          '<th style="' + thStyle + '">Status</th><th style="' + thStyle + '">Vaqt</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  }
}

// ===== ORDERS =====
async function renderOrders(main, filter) {
  filter = filter || 'all';
  currentOrderFilter = filter;

  main.innerHTML = '<div class="page">' +
    pageHeader('Buyurtmalar', 'Barcha buyurtmalar') +
    '<div class="rounded-xl border overflow-hidden" style="background:#131c2e;border-color:rgba(99,179,237,0.12)">' +
      '<div class="flex justify-between items-center flex-wrap gap-2 px-5 py-4 border-b" style="border-color:rgba(99,179,237,0.12)">' +
        '<span class="text-sm font-semibold">Royxat</span>' +
        '<div id="orderFilters" class="flex gap-2 flex-wrap">' +
          ['all','Yangi','Qabul qilindi','Bekor qilindi'].map(function(f) {
            return '<button class="filter-btn px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ' + (filter===f?'active':'') + '" data-filter="' + f + '" style="border-color:rgba(99,179,237,0.12);color:#64748b">' + (f==='all'?'Barchasi':f) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div id="ordersTable" class="overflow-x-auto"><div class="p-5" style="color:#64748b">Yuklanmoqda...</div></div>' +
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
      '<td style="' + tdStyle + ';color:#f59e0b;font-weight:600">' + Number(o.total).toLocaleString() + '</td>' +
      '<td style="' + tdStyle + ';color:#64748b">' + (o.tableNumber||'—') + '</td>' +
      '<td style="' + tdStyle + '"><span class="badge ' + (o.orderType==='online'?'badge-online':'badge-dinein') + '">' + (o.orderType==='online'?'Online':'Restoran') + '</span></td>' +
      '<td style="' + tdStyle + '">' + statusBadge(o.status) + '</td>' +
      '<td style="' + tdStyle + ';color:#64748b;font-size:12px">' + fmtDate(o.createdAt) + '</td>' +
      '<td style="' + tdStyle + '">' +
        '<select data-id="' + o._id + '" class="order-status-sel" style="background:#1a2235;border:1px solid rgba(99,179,237,0.12);color:#f1f5f9;padding:4px 8px;border-radius:6px;font-size:12px;cursor:pointer">' +
          '<option value="">O\'zgartir</option>' +
          ['Yangi','Qabul qilindi','Tayyorlanmoqda','Tayyor','Bekor qilindi'].map(function(s){ return '<option value="'+s+'">'+s+'</option>'; }).join('') +
        '</select>' +
      '</td>' +
    '</tr>';
  });

  document.getElementById('ordersTable').innerHTML =
    '<table class="w-full border-collapse">' +
      '<thead><tr>' +
        ['#','Mijoz','Mahsulotlar','Jami','Stol','Tur','Status','Vaqt','Amal'].map(function(h){ return '<th style="'+thStyle+'">'+h+'</th>'; }).join('') +
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
  main.innerHTML = '<div class="page">' +
    pageHeader('Menyu boshqaruvi', "Taomlarni qo'shish, tahrirlash, o'chirish") +
    '<div class="flex justify-end mb-4"><button id="addProductBtn" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style="background:#3b82f6">+ Taom qo\'shish</button></div>' +
    '<div id="productsGrid" class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))"><div style="color:#64748b">Yuklanmoqda...</div></div>' +
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
    div.style.cssText = 'background:#131c2e;border-color:rgba(99,179,237,0.12)';
    div.innerHTML =
      (p.image
        ? '<img src="'+p.image+'" alt="'+p.name+'" class="w-full object-cover" style="height:140px" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="w-full items-center justify-center text-4xl" style="height:140px;background:#1a2235;display:none">🍽</div>'
        : '<div class="w-full flex items-center justify-center text-4xl" style="height:140px;background:#1a2235">🍽</div>'
      ) +
      '<div class="p-4">' +
        '<div class="font-semibold text-base">' + p.name + '</div>' +
        (p.name_ru ? '<div class="text-xs mt-0.5" style="color:#64748b">'+p.name_ru+'</div>' : '') +
        '<div class="font-medium mt-1" style="color:#f59e0b">' + Number(p.price).toLocaleString() + " so'm</div>" +
        '<div class="text-xs uppercase tracking-wide mt-1 mb-3" style="color:#64748b">' + p.category + (p.active===false?' · Yashirilgan':'') + '</div>' +
        '<div class="flex gap-2">' +
          '<button class="edit-btn flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all" style="background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.3);color:#60a5fa">✏️ Tahrirlash</button>' +
          '<button class="del-btn py-1.5 px-2.5 rounded-lg text-xs border transition-all" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2);color:#ef4444">🗑</button>' +
        '</div>' +
      '</div>';
    div.querySelector('.edit-btn').addEventListener('click', function() { openProductModal(p); });
    div.querySelector('.del-btn').addEventListener('click', function() { deleteProduct(p.id); });
    grid.appendChild(div);
  });
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
  document.getElementById('modalTitle').textContent = p ? 'Taomni tahrirlash' : "Yangi taom qo'shish";
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
  if (!body.name || !body.price) { alert('Nom va narx majburiy'); return; }
  if (id) await apiFetch('/admin/products/' + id, { method:'PUT', body:JSON.stringify(body) });
  else    await apiFetch('/admin/products',        { method:'POST', body:JSON.stringify(body) });
  closeProductModal();
  loadProductsGrid();
}

async function deleteProduct(id) {
  if (!confirm("O'chirilsinmi?")) return;
  await apiFetch('/admin/products/' + id, { method:'DELETE' });
  loadProductsGrid();
}

// ===== CATEGORIES =====
async function renderCategories(main) {
  main.innerHTML = '<div class="page">' +
    pageHeader('Kategoriyalar', 'Menyu filtr tugmalarini boshqaring') +
    '<div class="flex justify-end mb-4"><button id="addCatBtn" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style="background:#3b82f6">+ Kategoriya qo\'shish</button></div>' +
    '<div class="rounded-xl border overflow-hidden" style="background:#131c2e;border-color:rgba(99,179,237,0.12)">' +
      '<div class="px-5 py-4 border-b" style="border-color:rgba(99,179,237,0.12)">' +
        '<span class="text-sm font-semibold">Royxat</span> ' +
        '<span class="text-xs" style="color:#64748b">— tartibini ozgartirish uchun sudrang</span>' +
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
        '<div class="text-xs mt-0.5" style="color:#64748b">Tartib: ' + cat.order + '</div>' +
      '</div>' +
      '<span class="badge ' + (cat.active!==false?'badge-accepted':'badge-rejected') + '">' + (cat.active!==false?"Ko'rinadi":'Yashirilgan') + '</span>' +
      '<button class="edit-cat py-1.5 px-3 rounded-lg text-xs border transition-all" style="background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.3);color:#60a5fa">✏️</button>' +
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
}

function openCatModal(cat) {
  document.getElementById('catModalTitle').textContent = cat ? 'Kategoriyani tahrirlash' : "Yangi kategoriya";
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
  if (!body.name) { alert('Nom majburiy'); return; }
  if (id) await apiFetch('/admin/categories/' + id, { method:'PUT', body:JSON.stringify(body) });
  else    await apiFetch('/admin/categories',        { method:'POST', body:JSON.stringify(body) });
  closeCatModal();
  loadCatList();
}

async function deleteCat(id) {
  if (!confirm("O'chirilsinmi?")) return;
  await apiFetch('/admin/categories/' + id, { method:'DELETE' });
  loadCatList();
}

// ===== RATINGS =====
async function renderRatings(main) {
  main.innerHTML = '<div class="page">' + pageHeader('Reytinglar', 'Mijozlar baholari') + '<div id="ratingsContent"><div style="color:#64748b">Yuklanmoqda...</div></div></div>';
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
    '<div class="flex items-center gap-6 rounded-xl border p-5 mb-5 flex-wrap" style="background:#131c2e;border-color:rgba(99,179,237,0.12)">' +
      '<div><div style="font-size:52px;font-weight:700;color:#f59e0b;line-height:1">'+(avg||'—')+'</div>' +
      '<div style="font-size:22px;margin-bottom:4px">'+(avg?'⭐'.repeat(Math.round(avg)):'—')+'</div>' +
      '<div style="font-size:13px;color:#64748b">'+rated.length+' ta baho</div></div>' +
      '<div style="flex:1;min-width:200px">'+barsHtml+'</div>' +
    '</div>' +
    '<div class="rounded-xl border overflow-hidden" style="background:#131c2e;border-color:rgba(99,179,237,0.12)">' +
      '<div class="px-5 py-4 border-b" style="border-color:rgba(99,179,237,0.12)"><span class="text-sm font-semibold">Baholangan buyurtmalar</span></div>' +
      '<div class="overflow-x-auto"><table class="w-full border-collapse"><thead><tr>'+
        ['Mijoz','Mahsulotlar','Baho','Vaqt'].map(function(h){return '<th style="'+thStyle+'">'+h+'</th>';}).join('')+
      '</tr></thead><tbody>'+ratedRows+'</tbody></table></div>' +
    '</div>';
}

// ===== USERS =====
async function renderUsers(main) {
  main.innerHTML = '<div class="page">' + pageHeader("Foydalanuvchilar", "Ro'yxatdan o'tgan mijozlar") +
    '<div class="rounded-xl border overflow-hidden" style="background:#131c2e;border-color:rgba(99,179,237,0.12)">' +
      '<div id="usersTable" class="overflow-x-auto"><div class="p-5" style="color:#64748b">Yuklanmoqda...</div></div>' +
    '</div></div>';

  var users = await apiFetch('/admin/users');
  if (!users) return;
  var rows = '';
  users.forEach(function(u, i) {
    rows += '<tr>' +
      '<td style="'+tdStyle+';color:#64748b">'+(i+1)+'</td>' +
      '<td style="'+tdStyle+'">'+(u.first_name||'')+' '+(u.last_name||'')+'</td>' +
      '<td style="'+tdStyle+';color:#60a5fa">'+(u.username?'@'+u.username:'—')+'</td>' +
      '<td style="'+tdStyle+'">'+(u.phone||'—')+'</td>' +
      '<td style="'+tdStyle+';color:#64748b;font-size:12px">'+u.telegramId+'</td>' +
      '<td style="'+tdStyle+';color:#64748b;font-size:12px">'+new Date(u.createdAt).toLocaleDateString('uz-UZ')+'</td>' +
    '</tr>';
  });
  document.getElementById('usersTable').innerHTML =
    '<table class="w-full border-collapse"><thead><tr>' +
      ['#','Ism','Username','Telefon','Telegram ID','Sana'].map(function(h){return '<th style="'+thStyle+'">'+h+'</th>';}).join('') +
    '</tr></thead><tbody>'+rows+'</tbody></table>';
}

// ===== BROADCAST =====

// ===================================================
// ===== EMPLOYEES ===================================
// ===================================================
async function renderEmployees(main) {
  main.innerHTML = '<div class="page">' + pageHeader('Ishchilar', 'Xodimlar ro\'yxati va boshqaruv') +
    '<div class="flex justify-end mb-4">' +
      '<button onclick="openEmpModal(null)" class="px-4 py-2 rounded-lg text-sm font-semibold" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff">+ Ishchi qo\'shish</button>' +
    '</div>' +
    '<div id="empList"><div class="p-5" style="color:#64748b">Yuklanmoqda...</div></div>' +
  '</div>';
  renderEmployees(document.getElementById("mainContent"));
}

async function renderEmployees(main) {
  var emps = await apiFetch('/admin/employees');
  var el   = document.getElementById('empList');
  if (!el) return;
  if (!emps || !emps.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px;color:#475569"><div style="font-size:36px;margin-bottom:8px">👷</div><div>Hozircha ishchi yo\'q</div></div>';
    return;
  }
  el.innerHTML = emps.map(function(e) {
    var initials = (e.name || '?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
    return '<div class="rounded-xl p-4 mb-3 flex items-center gap-4" style="background:#1e293b;border:1px solid rgba(99,179,237,0.12)">' +
      '<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:15px;flex-shrink:0">' + initials + '</div>' +
      '<div style="flex:1">' +
        '<div style="font-weight:600;color:#f1f5f9;font-size:14px">' + (e.name || '—') + '</div>' +
        '<div style="font-size:12px;color:#64748b;margin-top:2px">' +
          (e.position || 'Lavozim kiritilmagan') + ' &nbsp;·&nbsp; ' +
          '<span style="color:#60a5fa">@' + (e.username || '—') + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:#475569;margin-top:2px">' +
          '🕐 ' + (e.workStart || '09:00') + ' – ' + (e.workEnd || '18:00') +
          ' &nbsp;·&nbsp; 💰 ' + Number(e.salary || 0).toLocaleString() + ' so\'m' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' +
        '<button onclick="openEmpModal(' + JSON.stringify(JSON.stringify(e)) + ')" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(99,179,237,0.2);background:rgba(59,130,246,0.08);color:#60a5fa;font-size:12px;cursor:pointer">✏️ Tahrir</button>' +
        '<button onclick="deleteEmp(\'' + e._id + '\')" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.08);color:#f87171;font-size:12px;cursor:pointer">🗑 O\'chir</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

// Employee modal
function openEmpModal(empJson) {
  var emp = empJson ? JSON.parse(empJson) : null;
  var modal = document.createElement('div');
  modal.id = 'empModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML =
    '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.15);border-radius:16px;padding:24px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto">' +
      '<div style="font-size:17px;font-weight:700;color:#f1f5f9;margin-bottom:20px">' + (emp ? '✏️ Ishchini tahrirlash' : '+ Yangi ishchi') + '</div>' +

      empField('ISM FAMILIYA', 'empName', 'text', emp ? emp.name : '', 'Ali Valiyev') +
      empField('LAVOZIM', 'empPosition', 'text', emp ? (emp.position||'') : '', 'Ofitsiant, Oshpaz...') +
      empField('TELEFON', 'empPhone', 'text', emp ? (emp.phone||'') : '', '+998 90 123 45 67') +
      empField('LOGIN (username)', 'empUsername', 'text', emp ? (emp.username||'') : '', 'ali_valiyev') +
      empField('PAROL' + (emp ? ' (bo\'sh qoldiring — o\'zgarmaydi)' : ''), 'empPassword', 'password', '', '••••••••') +
      empField('OYLIK MAOSH (so\'m)', 'empSalary', 'number', emp ? (emp.salary||0) : '', '3000000') +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        empField('ISH BOSHLANISH', 'empStart', 'time', emp ? (emp.workStart||'09:00') : '09:00', '') +
        empField('ISH TUGASH', 'empEnd', 'time', emp ? (emp.workEnd||'18:00') : '18:00', '') +
      '</div>' +

      '<div style="background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15);border-radius:10px;padding:14px;margin-bottom:16px">' +
        '<div style="font-size:11px;font-weight:600;color:#64748b;letter-spacing:1px;margin-bottom:10px">📍 RESTORAN KOORDINATALARI (Geofencing)</div>' +
        empField('LATITUDE', 'empLat', 'number', emp ? (emp.lat||'') : '', '41.2995') +
        empField('LONGITUDE', 'empLng', 'number', emp ? (emp.lng||'') : '', '69.2401') +
        empField('RADIUS (metr)', 'empRadius', 'number', emp ? (emp.radius||100) : '100', '100') +
        '<div style="font-size:11px;color:#475569;margin-top:-10px">Ishchi shu radius ichida bo\'lsa check-in qila oladi</div>' +
      '</div>' +

      '<div style="display:flex;gap:10px;margin-top:4px">' +
        '<button onclick="closeEmpModal()" style="flex:1;padding:11px;border-radius:8px;border:1px solid rgba(99,179,237,0.15);background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">Bekor</button>' +
        '<button onclick="saveEmp(\'' + (emp ? emp._id : '') + '\')" style="flex:1;padding:11px;border-radius:8px;border:none;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Saqlash</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

function empField(label, id, type, value, placeholder) {
  return '<div style="margin-bottom:14px">' +
    '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">' + label + '</label>' +
    '<input id="' + id + '" type="' + type + '" value="' + (value !== null && value !== undefined ? value : '') + '" placeholder="' + placeholder + '" ' +
      'style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;font-family:Inter,sans-serif" ' +
      'onfocus="this.style.borderColor=\'#3b82f6\'" onblur="this.style.borderColor=\'rgba(99,179,237,0.15)\'">' +
  '</div>';
}

function closeEmpModal() {
  var m = document.getElementById('empModal');
  if (m) m.remove();
}

async function saveEmp(id) {
  var body = {
    name:      document.getElementById('empName').value.trim(),
    position:  document.getElementById('empPosition').value.trim(),
    phone:     document.getElementById('empPhone').value.trim(),
    username:  document.getElementById('empUsername').value.trim(),
    salary:    Number(document.getElementById('empSalary').value) || 0,
    workStart: document.getElementById('empStart').value || '09:00',
    workEnd:   document.getElementById('empEnd').value   || '18:00',
    lat:       parseFloat(document.getElementById('empLat').value)    || null,
    lng:       parseFloat(document.getElementById('empLng').value)    || null,
    radius:    parseInt(document.getElementById('empRadius').value)   || 100,
  };
  var pass = document.getElementById('empPassword').value;
  if (pass) body.password = pass;

  if (!body.name)     { alert('Ism kiritilmagan'); return; }
  if (!body.username) { alert('Username kiritilmagan'); return; }
  if (!id && !pass)   { alert('Parol kiritilmagan'); return; }

  var url    = id ? '/admin/employees/' + id : '/admin/employees';
  var method = id ? 'PUT' : 'POST';
  var d = await apiFetch(url, { method: method, body: JSON.stringify(body) });

  if (d.ok || d._id || d.employee) {
    closeEmpModal();
    renderEmployees(document.getElementById("mainContent"));
  } else {
    alert('Xato: ' + (d.error || 'Nomalum xato'));
  }
}

// ===================================================
// ===== ATTENDANCE (Bugungi Davomat) ================
// ===================================================
async function renderAttendance(main) {
  main.innerHTML = '<div class="page">' + pageHeader('Bugungi Davomat', 'Real vaqt holati') +
    '<div id="attContent"><div class="p-5" style="color:#64748b">Yuklanmoqda...</div></div>' +
  '</div>';
  loadAttendance();
}

async function loadAttendance() {
  var el = document.getElementById('attContent');
  if (!el) return;

  var d = await apiFetch('/admin/attendance/today');
  if (!d.ok) { el.innerHTML = '<div style="color:#f87171;padding:20px">Yuklanmadi</div>'; return; }

  var s = d.summary;
  var today = new Date().toLocaleDateString('uz-UZ', { weekday:'long', day:'numeric', month:'long' });

  // Summary cards
  var cards =
    '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px">' +
      attCard('👥', 'Jami', s.total, '#3b82f6') +
      attCard('✅', 'Keldi', s.came, '#22c55e') +
      attCard('⚠️', 'Kechikdi', s.late, '#f59e0b') +
      attCard('❌', 'Kelmadi', s.absent, '#ef4444') +
    '</div>';

  // Employee rows
  var rows = d.employees.map(function(item) {
    var emp = item.employee;
    var statusColor = item.status === 'keldi' ? '#22c55e' : '#ef4444';
    var statusBg    = item.status === 'keldi' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';
    var statusBorder= item.status === 'keldi' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
    var lateTag = item.lateMinutes > 0
      ? '<span style="font-size:10px;background:rgba(245,158,11,0.15);color:#f59e0b;padding:2px 8px;border-radius:99px;margin-left:6px">' + item.lateMinutes + ' min kech</span>'
      : '';
    var workedStr = item.checkIn && !item.checkOut
      ? '<span style="color:#3b82f6;font-size:11px">⏱ Hozir ishlayapti</span>'
      : (item.totalMinutes ? formatMins(item.totalMinutes) : '');
    var initials = (emp.name||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();

    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(99,179,237,0.08)">' +
      '<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#1e40af,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">' + initials + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;color:#f1f5f9">' + (emp.name||'—') + lateTag + '</div>' +
        '<div style="font-size:11px;color:#64748b;margin-top:2px">' +
          (emp.position||'') +
          (item.checkIn  ? ' &nbsp;·&nbsp; 🟢 ' + item.checkIn  : '') +
          (item.checkOut ? ' → 🔴 ' + item.checkOut : '') +
        '</div>' +
        (workedStr ? '<div style="margin-top:2px">' + workedStr + '</div>' : '') +
      '</div>' +
      '<div>' +
        '<span style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:99px;background:' + statusBg + ';color:' + statusColor + ';border:1px solid ' + statusBorder + '">' +
          (item.status === 'keldi' ? 'Keldi' : 'Kelmadi') +
        '</span>' +
      '</div>' +
      '<button onclick="openManualAtt(\'' + emp._id + '\',\'' + (emp.name||'') + '\')" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(99,179,237,0.15);background:transparent;color:#64748b;font-size:11px;cursor:pointer">✏️</button>' +
    '</div>';
  }).join('');

  el.innerHTML = cards +
    '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;overflow:hidden">' +
      '<div style="padding:12px 16px;border-bottom:1px solid rgba(99,179,237,0.08);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:13px;font-weight:600;color:#f1f5f9;text-transform:capitalize">' + today + '</span>' +
        '<button onclick="loadAttendance()" style="font-size:11px;color:#60a5fa;background:transparent;border:none;cursor:pointer">🔄 Yangilash</button>' +
      '</div>' +
      rows +
    '</div>';
}

function attCard(icon, label, value, color) {
  return '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:10px;padding:14px;text-align:center">' +
    '<div style="font-size:22px;margin-bottom:4px">' + icon + '</div>' +
    '<div style="font-size:22px;font-weight:700;color:' + color + '">' + value + '</div>' +
    '<div style="font-size:11px;color:#64748b;margin-top:2px">' + label + '</div>' +
  '</div>';
}

// Manual davomat
function openManualAtt(empId, empName) {
  var today = new Date().toISOString().split('T')[0];
  var modal = document.createElement('div');
  modal.id  = 'manualModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML =
    '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.15);border-radius:16px;padding:24px;width:100%;max-width:380px">' +
      '<div style="font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:4px">✏️ Davomat kiritish</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:20px">' + empName + '</div>' +

      '<div style="margin-bottom:14px">' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">SANA</label>' +
        '<input id="manDate" type="date" value="' + today + '" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;font-family:Inter,sans-serif">' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">' +
        '<div><label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">KELGAN VAQT</label>' +
        '<input id="manIn" type="time" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;font-family:Inter,sans-serif"></div>' +
        '<div><label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">KETGAN VAQT</label>' +
        '<input id="manOut" type="time" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;font-family:Inter,sans-serif"></div>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">HOLAT</label>' +
        '<select id="manStatus" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;font-family:Inter,sans-serif">' +
          '<option value="keldi">✅ Keldi</option>' +
          '<option value="kelmadi">❌ Kelmadi</option>' +
          '<option value="kasal">🤒 Kasal</option>' +
          '<option value="tatil">🏖 Ta\'til</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">IZOH</label>' +
        '<input id="manNote" type="text" placeholder="Ixtiyoriy..." style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;font-family:Inter,sans-serif">' +
      '</div>' +

      '<div style="display:flex;gap:10px">' +
        '<button onclick="document.getElementById(\'manualModal\').remove()" style="flex:1;padding:11px;border-radius:8px;border:1px solid rgba(99,179,237,0.15);background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">Bekor</button>' +
        '<button onclick="saveManualAtt(\'' + empId + '\')" style="flex:1;padding:11px;border-radius:8px;border:none;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Saqlash</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

async function saveManualAtt(empId) {
  var body = {
    employeeId: empId,
    date:       document.getElementById('manDate').value,
    checkIn:    document.getElementById('manIn').value,
    checkOut:   document.getElementById('manOut').value,
    status:     document.getElementById('manStatus').value,
    note:       document.getElementById('manNote').value,
  };
  var d = await apiFetch('/admin/attendance/manual', { method:'POST', body:JSON.stringify(body) });
  if (d.ok) {
    document.getElementById('manualModal').remove();
    loadAttendance();
  } else alert('Xato: ' + (d.error||'Nomalum xato'));
}

// ===================================================
// ===== REPORT & SALARY =============================
// ===================================================
async function renderEmpReport(main) {
  var now   = new Date();
  var month = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  main.innerHTML = '<div class="page">' + pageHeader('Hisobot & Maosh', 'Oylik statistika va maosh hisoblash') +
    '<div style="display:flex;gap:10px;align-items:center;margin-bottom:20px">' +
      '<input id="repMonth" type="month" value="' + month + '" style="padding:9px 12px;background:#1e293b;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;font-family:Inter,sans-serif">' +
      '<button onclick="loadReport()" style="padding:9px 18px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Ko\'rish</button>' +
    '</div>' +
    '<div id="reportContent"><div style="color:#64748b;padding:20px">Yuklanmoqda...</div></div>' +
  '</div>';
  loadReport();
}

async function loadReport() {
  var el    = document.getElementById('reportContent');
  var month = document.getElementById('repMonth')?.value;
  if (!el || !month) return;

  el.innerHTML = '<div style="color:#64748b;padding:20px">Yuklanmoqda...</div>';
  var d = await apiFetch('/admin/attendance/report?month=' + month);
  if (!d.ok) { el.innerHTML = '<div style="color:#f87171;padding:20px">Yuklanmadi</div>'; return; }

  var totalSalary = d.report.reduce(function(s,r){return s+(r.stats.earnedSalary||0);},0);

  var cards = '<div style="background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(29,78,216,0.1));border:1px solid rgba(59,130,246,0.2);border-radius:12px;padding:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">' +
    '<div>' +
      '<div style="font-size:11px;color:#64748b;letter-spacing:1px">JAMI MAOSH (' + month + ')</div>' +
      '<div style="font-size:26px;font-weight:700;color:#60a5fa;margin-top:4px">' + Number(totalSalary).toLocaleString() + ' so\'m</div>' +
    '</div>' +
    '<div style="font-size:36px">💰</div>' +
  '</div>';

  var rows = d.report.map(function(item) {
    var emp  = item.employee;
    var s    = item.stats;
    var pct  = Math.min(100, Math.round((s.totalDays/26)*100));
    var initials = (emp.name||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();

    return '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;padding:16px;margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
        '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1e40af,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff">' + initials + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-weight:600;color:#f1f5f9">' + emp.name + '</div>' +
          '<div style="font-size:12px;color:#64748b">' + (emp.position||'—') + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:18px;font-weight:700;color:#22c55e">' + Number(s.earnedSalary).toLocaleString() + '</div>' +
          '<div style="font-size:10px;color:#64748b">so\'m (hisoblangan)</div>' +
        '</div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">' +
        miniStat('📅', 'Ish kuni', s.totalDays + ' kun') +
        miniStat('⏱', 'Jami soat', formatMins(s.totalMinutes)) +
        miniStat('⚠️', 'Kechikish', s.lateCount + ' marta') +
        miniStat('❌', 'Kelmagan', s.absentCount + ' kun') +
      '</div>' +

      '<div style="background:#0f172a;border-radius:99px;height:6px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#3b82f6,#22c55e);border-radius:99px"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px">' +
        '<span style="font-size:10px;color:#475569">' + s.totalDays + '/26 ish kuni</span>' +
        '<span style="font-size:10px;color:#475569">' + pct + '%</span>' +
      '</div>' +
    '</div>';
  }).join('');

  el.innerHTML = cards + rows;
}

function miniStat(icon, label, value) {
  return '<div style="background:#0f172a;border-radius:8px;padding:8px;text-align:center">' +
    '<div style="font-size:14px">' + icon + '</div>' +
    '<div style="font-size:13px;font-weight:600;color:#f1f5f9;margin-top:2px">' + value + '</div>' +
    '<div style="font-size:10px;color:#475569">' + label + '</div>' +
  '</div>';
}

function formatMins(mins) {
  if (!mins) return '0 min';
  var h = Math.floor(mins/60), m = mins%60;
  return h > 0 ? h + 'h ' + (m>0?m+'m':'') : m + 'min';
}


function previewEmpPhoto(input) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    input._base64 = e.target.result;
    document.getElementById('empPhotoImg').src = e.target.result;
    document.getElementById('empPhotoPreview').style.display = 'block';
    // face descriptor hisoblash
    computeFaceDescriptor(e.target.result);
  };
  reader.readAsDataURL(input.files[0]);
}

var _empCamStream = null;
function captureEmpPhoto() {
  // Kameradan selfie olish uchun
  var wrap = document.createElement('div');
  wrap.id  = 'empCamWrap';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';
  wrap.innerHTML =
    '<div style="color:#f1f5f9;font-size:15px;font-weight:600;margin-bottom:12px">📸 Ishchi rasmi</div>' +
    '<video id="empCamVideo" autoplay playsinline style="width:100%;max-width:320px;border-radius:12px;border:2px solid #3b82f6;background:#000"></video>' +
    '<canvas id="empCamCanvas" style="display:none"></canvas>' +
    '<div style="display:flex;gap:10px;margin-top:14px">' +
      '<button onclick="closeEmpCam()" style="padding:10px 20px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:8px;cursor:pointer;font-family:inherit">Bekor</button>' +
      '<button onclick="snapEmpCam()" style="padding:10px 20px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit">📸 Olish</button>' +
    '</div>';
  document.body.appendChild(wrap);

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    .then(function(s) {
      _empCamStream = s;
      document.getElementById('empCamVideo').srcObject = s;
    }).catch(function() { closeEmpCam(); alert('Kamera ochilmadi'); });
}

function closeEmpCam() {
  if (_empCamStream) { _empCamStream.getTracks().forEach(function(t){ t.stop(); }); _empCamStream = null; }
  var w = document.getElementById('empCamWrap');
  if (w) w.remove();
}

function snapEmpCam() {
  var video  = document.getElementById('empCamVideo');
  var canvas = document.getElementById('empCamCanvas');
  canvas.width  = video.videoWidth  || 320;
  canvas.height = video.videoHeight || 240;
  canvas.getContext('2d').drawImage(video, 0, 0);
  var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  closeEmpCam();

  // Preview
  var inp = document.getElementById('empPhotoInput');
  if (inp) inp._base64 = dataUrl;
  var img = document.getElementById('empPhotoImg');
  var prv = document.getElementById('empPhotoPreview');
  if (img) { img.src = dataUrl; prv.style.display = 'block'; }

  computeFaceDescriptor(dataUrl);
}

// face-api.js descriptor hisoblash
window._empFaceDescriptor = null;
async function computeFaceDescriptor(imageDataUrl) {
  if (typeof faceapi === 'undefined') return; // face-api yuklangan bo'lsa
  try {
    var img = new Image();
    img.src = imageDataUrl;
    await new Promise(function(r){ img.onload = r; });
    var detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
    if (detection) {
      window._empFaceDescriptor = Array.from(detection.descriptor);
    }
  } catch(e) { console.log('face descriptor error:', e); }
}

// ===================================================
// ===== EMPLOYEES (Ishchilar) =======================
// ===================================================
async function renderEmployees(main) {
  main.innerHTML = '<div style="text-align:center;padding:40px;color:#475569">Yuklanmoqda...</div>';
  var emps = await apiFetch('/admin/employees');

  var rows = (emps || []).map(function(e) {
    return '<tr style="border-bottom:1px solid rgba(99,179,237,0.08)">' +
      '<td style="padding:12px 8px">' +
        '<div style="font-size:14px;font-weight:600;color:#f1f5f9">' + e.name + '</div>' +
        '<div style="font-size:11px;color:#64748b">' + (e.position||'—') + '</div>' +
      '</td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#94a3b8">' + (e.phone||'—') + '</td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#60a5fa">' + (e.username||'—') + '</td>' +
      '<td style="padding:12px 8px;font-size:13px;color:#f59e0b">' + fmtSalary(e.salary) + '</td>' +
      '<td style="padding:12px 8px;font-size:12px;color:#94a3b8">' + (e.workStart||'09:00') + ' – ' + (e.workEnd||'18:00') + '</td>' +
      '<td style="padding:12px 8px">' +
        '<span style="font-size:11px;padding:3px 8px;border-radius:99px;background:' + (e.active?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)') + ';color:' + (e.active?'#4ade80':'#f87171') + '">' + (e.active?'Faol':'Faol emas') + '</span>' +
      '</td>' +
      '<td style="padding:12px 8px">' +
        '<div style="display:flex;gap:6px">' +
          '<button onclick="openEmpModal(' + JSON.stringify(JSON.stringify(e)) + ')" style="padding:5px 10px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;border-radius:6px;font-size:11px;cursor:pointer">✏️ Tahrir</button>' +
          '<button onclick="deleteEmp(\'' + e._id + '\')" style="padding:5px 10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;font-size:11px;cursor:pointer">🗑</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9">👷 Ishchilar <span style="font-size:13px;color:#64748b;font-weight:400">(' + (emps||[]).length + ' ta)</span></div>' +
        '<button onclick="openEmpModal(null)" style="padding:9px 18px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">+ Qo\'shish</button>' +
      '</div>' +
      '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;overflow:hidden">' +
        '<div style="overflow-x:auto">' +
          '<table style="width:100%;border-collapse:collapse">' +
            '<thead>' +
              '<tr style="background:rgba(99,179,237,0.05)">' +
                '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;letter-spacing:.5px">ISM</th>' +
                '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;letter-spacing:.5px">TELEFON</th>' +
                '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;letter-spacing:.5px">LOGIN</th>' +
                '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;letter-spacing:.5px">MAOSH</th>' +
                '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;letter-spacing:.5px">ISH VAQTI</th>' +
                '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;letter-spacing:.5px">HOLAT</th>' +
                '<th style="padding:10px 8px;text-align:left;font-size:11px;color:#64748b;font-weight:600;letter-spacing:.5px">AMAL</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + (rows || '<tr><td colspan="7" style="padding:40px;text-align:center;color:#475569">Ishchilar yo\'q</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      // Modal
      '<div id="empModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:none;align-items:center;justify-content:center;padding:16px">' +
        '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.15);border-radius:16px;padding:24px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
            '<div id="empModalTitle" style="font-size:16px;font-weight:700;color:#f1f5f9">Ishchi qo\'shish</div>' +
            '<button onclick="closeEmpModal()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer">✕</button>' +
          '</div>' +
          '<div id="empModalBody"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function openEmpModal(empJson) {
  var emp = empJson ? JSON.parse(empJson) : null;
  document.getElementById('empModalTitle').textContent = emp ? 'Ishchi tahrirlash' : 'Yangi ishchi';

  document.getElementById('empModalBody').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:12px">' +
      empInp('empName',      'ISM FAMILIYA', 'text',  emp?.name||'') +
      empInp('empPhone',     'TELEFON',       'text',  emp?.phone||'') +
      empInp('empPosition',  'LAVOZIM',       'text',  emp?.position||'') +
      empInp('empUsername',  'LOGIN',         'text',  emp?.username||'') +
      empInp('empPassword',  'PAROL ' + (emp?'(o\'zgartirish uchun)':''), 'password', '') +
      empInp('empSalary',    'MAOSH (so\'m)', 'number', emp?.salary||'') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        empInp('empWorkStart', 'ISH BOSHI', 'time', emp?.workStart||'09:00') +
        empInp('empWorkEnd',   'ISH OXIRI', 'time', emp?.workEnd||'18:00') +
      '</div>' +
      empInp('empTgId', 'TELEGRAM ID (ixtiyoriy)', 'number', emp?.telegramId||'') +

      // Dam olish kuni
      '<div>' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">DAM OLISH KUNI</label>' +
        '<select id="empWeeklyOff" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px">' +
          ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(function(d) {
            var names = {monday:'Dushanba',tuesday:'Seshanba',wednesday:'Chorshanba',thursday:'Payshanba',friday:'Juma',saturday:'Shanba',sunday:'Yakshanba'};
            var sel = (emp?.weeklyOff||'sunday') === d ? 'selected' : '';
            return '<option value="' + d + '" ' + sel + '>' + names[d] + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +

      '<div id="empErr" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:10px;border-radius:8px;font-size:13px"></div>' +

      '<button onclick="saveEmp(\'' + (emp?._id||'') + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px">' +
        (emp ? '💾 Saqlash' : '+ Qo\'shish') +
      '</button>' +
    '</div>';

  var modal = document.getElementById('empModal');
  modal.style.display = 'flex';
}

function empInp(id, label, type, val) {
  return '<div>' +
    '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">' + label + '</label>' +
    '<input id="' + id + '" type="' + type + '" value="' + val + '" style="width:100%;padding:10px 12px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit">' +
  '</div>';
}

function closeEmpModal() {
  document.getElementById('empModal').style.display = 'none';
}

async function saveEmp(id) {
  var errEl = document.getElementById('empErr');
  errEl.style.display = 'none';

  var name      = document.getElementById('empName').value.trim();
  var phone     = document.getElementById('empPhone').value.trim();
  var position  = document.getElementById('empPosition').value.trim();
  var username  = document.getElementById('empUsername').value.trim();
  var password  = document.getElementById('empPassword').value;
  var salary    = Number(document.getElementById('empSalary').value) || 0;
  var workStart = document.getElementById('empWorkStart').value || '09:00';
  var workEnd   = document.getElementById('empWorkEnd').value || '18:00';
  var telegramId = document.getElementById('empTgId').value || null;

  if (!name)     { errEl.textContent = 'Ism kiritilmagan'; errEl.style.display='block'; return; }
  if (!username) { errEl.textContent = 'Login kiritilmagan'; errEl.style.display='block'; return; }
  if (!id && !password) { errEl.textContent = 'Parol kiritilmagan'; errEl.style.display='block'; return; }

  var branchId = document.getElementById('empBranchId')?.value || null;
  var weeklyOff  = document.getElementById('empWeeklyOff')?.value || 'sunday';
  var photoData  = document.getElementById('empPhotoInput')?._base64 || null;
  var faceDesc   = window._empFaceDescriptor || null;

  if (!branchId) { errEl.textContent = 'Filial tanlanmagan! Avval filial tanlang.'; errEl.style.display='block'; return; }

  var body = { name, phone, position, username, salary, workStart, workEnd, branchId: branchId||null, weeklyOff,
    photo: photoData, faceDescriptor: faceDesc };
  if (password)  body.password  = password;
  if (telegramId) body.telegramId = Number(telegramId);

  var url    = id ? '/admin/employees/' + id : '/admin/employees';
  var method = id ? 'PUT' : 'POST';

  var d = await apiFetch(url, { method, body: JSON.stringify(body) });
  if (d.ok) {
    closeEmpModal();
    renderEmployees(document.getElementById('mainContent'));
  } else {
    errEl.textContent = d.error || 'Xato yuz berdi';
    errEl.style.display = 'block';
  }
}


async function cleanupInactive() {
  if (!confirm("Eski o'chirilgan ishchilarni MongoDB dan butunlay o'chirasizmi?")) return;
  var d = await apiFetch('/admin/employees-cleanup', { method: 'DELETE' });
  if (d.ok) {
    alert((d.deleted || 0) + " ta eski yozuv o'chirildi");
    renderEmployees(document.getElementById('mainContent'));
  } else {
    alert('Xato: ' + (d.error || ''));
  }
}

async function deleteEmp(id) {
  if (!confirm('Ishchini o\'chirishni tasdiqlaysizmi?')) return;
  var d = await apiFetch('/admin/employees/' + id, { method: 'DELETE' });
  if (d.ok) renderEmployees(document.getElementById('mainContent'));
  else alert('Xato: ' + (d.error||''));
}

// ===================================================
// ===== ATTENDANCE (Bugungi davomat) ================
// ===================================================
async function renderAttendance(main) {
  main.innerHTML = '<div style="text-align:center;padding:40px;color:#475569">Yuklanmoqda...</div>';
  var d = await apiFetch('/admin/attendance/today');
  if (!d.ok) { main.innerHTML = '<div style="color:#f87171;padding:20px">Yuklanmadi</div>'; return; }

  var sum  = d.summary;
  var emps = d.employees || [];
  var today = new Date().toLocaleDateString('uz-UZ', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  var rows = emps.map(function(r) {
    var statusColor = r.status === 'keldi' ? '#22c55e' : '#ef4444';
    var lateTag = r.lateMinutes > 0
      ? '<span style="font-size:10px;background:rgba(245,158,11,0.15);color:#f59e0b;padding:2px 6px;border-radius:99px;margin-left:6px">+' + r.lateMinutes + ' min</span>'
      : '';
    var workedStr = r.totalMinutes ? formatMins(r.totalMinutes) : (r.checkIn && !r.checkOut ? '<span style="color:#3b82f6">Ishlayapti</span>' : '—');

    return '<tr style="border-bottom:1px solid rgba(99,179,237,0.07)">' +
      '<td style="padding:12px 10px">' +
        '<div style="font-size:13px;font-weight:600;color:#f1f5f9">' + r.employee.name + lateTag + '</div>' +
        '<div style="font-size:11px;color:#64748b">' + (r.employee.position||'—') + '</div>' +
      '</td>' +
      '<td style="padding:12px 10px">' +
        '<span style="font-size:11px;padding:3px 9px;border-radius:99px;background:' + (r.status==='keldi'?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)') + ';color:' + statusColor + ';font-weight:600">' +
          (r.status === 'keldi' ? '✅ Keldi' : '❌ Kelmadi') +
        '</span>' +
      '</td>' +
      '<td style="padding:12px 10px;font-size:13px;color:#94a3b8">' + (r.checkIn||'—') + '</td>' +
      '<td style="padding:12px 10px;font-size:13px;color:#94a3b8">' + (r.checkOut||'—') + '</td>' +
      '<td style="padding:12px 10px;font-size:13px;color:#22c55e">' + workedStr + '</td>' +
      '<td style="padding:12px 10px">' +
        '<button onclick="openManualModal(\'' + r.employee._id + '\',\'' + r.employee.name + '\')" style="padding:4px 10px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;border-radius:6px;font-size:11px;cursor:pointer">✏️</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:4px;text-transform:capitalize">' + today + '</div>' +
      '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:16px">📋 Bugungi davomat</div>' +

      // Summary
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">' +
        attSumBox('👥', 'Jami', sum.total, '#3b82f6') +
        attSumBox('✅', 'Keldi', sum.came, '#22c55e') +
        attSumBox('⚠️', 'Kechikdi', sum.late, '#f59e0b') +
        attSumBox('❌', 'Kelmadi', sum.absent, '#ef4444') +
      '</div>' +

      // Table
      '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;overflow:hidden">' +
        '<div style="overflow-x:auto">' +
          '<table style="width:100%;border-collapse:collapse">' +
            '<thead>' +
              '<tr style="background:rgba(99,179,237,0.05)">' +
                '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">ISHCHI</th>' +
                '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">HOLAT</th>' +
                '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">KELDI</th>' +
                '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">KETDI</th>' +
                '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">ISHLAGAN</th>' +
                '<th style="padding:10px;text-align:left;font-size:11px;color:#64748b;font-weight:600">AMAL</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + (rows || '<tr><td colspan="6" style="padding:40px;text-align:center;color:#475569">Ishchilar yo\'q</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      // Manual modal
      '<div id="manualModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;padding:16px">' +
        '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.15);border-radius:16px;padding:24px;width:100%;max-width:380px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
            '<div id="manualTitle" style="font-size:15px;font-weight:700;color:#f1f5f9">Qo\'lda kiritish</div>' +
            '<button onclick="closeManualModal()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer">✕</button>' +
          '</div>' +
          '<div id="manualBody"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function attSumBox(icon, label, val, color) {
  return '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:10px;padding:12px;text-align:center">' +
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
      '<div>' +
        '<label style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;display:block;margin-bottom:5px">HOLAT</label>' +
        '<select id="manualStatus" style="width:100%;padding:10px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:8px;color:#f1f5f9;font-size:13px">' +
          '<option value="keldi">✅ Keldi</option>' +
          '<option value="kelmadi">❌ Kelmadi</option>' +
          '<option value="kasal">🤒 Kasal</option>' +
          '<option value="tatil">🏖 Ta\'til</option>' +
        '</select>' +
      '</div>' +
      empInp('manualCheckIn',  'KELGAN VAQT', 'time', '') +
      empInp('manualCheckOut', 'KETGAN VAQT', 'time', '') +
      empInp('manualNote',     'IZOH',        'text', '') +
      '<button onclick="saveManual(\'' + empId + '\',\'' + today + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">💾 Saqlash</button>' +
    '</div>';

  document.getElementById('manualModal').style.display = 'flex';
}

function closeManualModal() {
  document.getElementById('manualModal').style.display = 'none';
}

async function saveManual(empId, date) {
  var body = {
    employeeId: empId,
    date:       date,
    status:     document.getElementById('manualStatus').value,
    checkIn:    document.getElementById('manualCheckIn').value  || null,
    checkOut:   document.getElementById('manualCheckOut').value || null,
    note:       document.getElementById('manualNote').value     || ''
  };
  var d = await apiFetch('/admin/attendance/manual', { method:'POST', body: JSON.stringify(body) });
  if (d.ok) {
    closeManualModal();
    renderAttendance(document.getElementById('mainContent'));
  } else {
    alert('Xato: ' + (d.error||''));
  }
}

// ===================================================
// ===== EMP REPORT (Hisobot & Maosh) ================
// ===================================================
async function renderEmpReport(main) {
  var now   = new Date();
  var month = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9">💰 Hisobot & Maosh</div>' +
        '<input type="month" id="reportMonth" value="' + month + '" onchange="loadReport()" style="padding:8px 12px;background:#1e293b;border:1px solid rgba(99,179,237,0.2);border-radius:8px;color:#f1f5f9;font-size:13px">' +
      '</div>' +
      '<div id="reportContent"><div style="text-align:center;padding:40px;color:#475569">Yuklanmoqda...</div></div>' +
    '</div>';

  await loadReport();
}

async function loadReport() {
  var monthEl = document.getElementById('reportMonth');
  if (!monthEl) return;
  var month = monthEl.value;
  var d = await apiFetch('/admin/attendance/report?month=' + month);

  var content = document.getElementById('reportContent');
  if (!d.ok || !d.report) { content.innerHTML = '<div style="color:#f87171;padding:20px">Yuklanmadi</div>'; return; }

  var totalSalary = d.report.reduce(function(s,r){ return s + (r.stats.earnedSalary||0); }, 0);

  var cards = d.report.map(function(r) {
    var e = r.employee;
    var s = r.stats;
    var pct = Math.min(100, Math.round((s.totalDays / 26) * 100));

    return '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;padding:16px">' +
      // Header
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">' +
        '<div>' +
          '<div style="font-size:14px;font-weight:700;color:#f1f5f9">' + e.name + '</div>' +
          '<div style="font-size:11px;color:#64748b;margin-top:2px">' + (e.position||'—') + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font-size:13px;font-weight:700;color:#22c55e">' + fmtSalary(s.earnedSalary) + '</div>' +
          '<div style="font-size:10px;color:#64748b">/ ' + fmtSalary(e.salary) + '</div>' +
        '</div>' +
      '</div>' +

      // Stats row
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">' +
        miniStat('📅', s.totalDays + ' kun', '#3b82f6') +
        miniStat('⏱', formatMins(s.totalMinutes), '#22c55e') +
        miniStat('⚠️', s.lateCount + ' kech', '#f59e0b') +
        miniStat('❌', s.absentCount + ' yo\'q', '#ef4444') +
      '</div>' +

      // Progress
      '<div style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
          '<span style="font-size:11px;color:#64748b">Davomat</span>' +
          '<span style="font-size:11px;color:#94a3b8">' + s.totalDays + '/26 kun</span>' +
        '</div>' +
        '<div style="background:#0f172a;border-radius:99px;height:6px">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#3b82f6,#22c55e);border-radius:99px"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  content.innerHTML =
    // Umumiy summary
    '<div style="background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(34,197,94,0.08));border:1px solid rgba(59,130,246,0.2);border-radius:12px;padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
        '<div style="font-size:11px;color:#64748b;margin-bottom:4px">BU OY JAMI MAOSH</div>' +
        '<div style="font-size:24px;font-weight:700;color:#f1f5f9">' + fmtSalary(totalSalary) + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:11px;color:#64748b;margin-bottom:4px">ISHCHILAR</div>' +
        '<div style="font-size:24px;font-weight:700;color:#3b82f6">' + d.report.length + ' ta</div>' +
      '</div>' +
    '</div>' +

    '<div style="display:flex;flex-direction:column;gap:10px">' + (cards || '<div style="text-align:center;padding:40px;color:#475569">Ma\'lumot yo\'q</div>') + '</div>';
}

function miniStat(icon, val, color) {
  return '<div style="background:rgba(15,23,42,0.5);border-radius:8px;padding:8px 6px;text-align:center">' +
    '<div style="font-size:14px">' + icon + '</div>' +
    '<div style="font-size:11px;font-weight:600;color:' + color + ';margin-top:2px">' + val + '</div>' +
  '</div>';
}

function fmtSalary(n) {
  if (!n) return '0 so\'m';
  return Number(n).toLocaleString('uz-UZ') + ' so\'m';
}

// ===================================================
// ===== BRANCHES (Filiallar) ========================
// ===================================================
var branchMap = null;
var branchMarker = null;

async function renderBranches(main) {
  main.innerHTML = '<div style="text-align:center;padding:40px;color:#475569">Yuklanmoqda...</div>';
  var d = await apiFetch('/admin/branches');
  var branches = d.branches || [];

  var cards = branches.map(function(b) {
    return '<div style="background:#0f172a;border:1px solid rgba(99,179,237,0.1);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px">' +
      '<div>' +
        '<div style="font-size:14px;font-weight:600;color:#f1f5f9">' + b.name + '</div>' +
        '<div style="font-size:11px;color:#64748b;margin-top:3px">' + (b.address||'Manzil kiritilmagan') + '</div>' +
        (b.lat ? '<div style="font-size:11px;color:#3b82f6;margin-top:2px">📍 ' + b.lat.toFixed(5) + ', ' + b.lng.toFixed(5) + ' &nbsp;·&nbsp; ' + (b.radius||100) + 'm</div>' : '<div style="font-size:11px;color:#f59e0b;margin-top:2px">⚠️ Lokatsiya belgilanmagan</div>') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button onclick="openBranchModal(' + JSON.stringify(JSON.stringify(b)) + ')" style="padding:6px 12px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60a5fa;border-radius:7px;font-size:12px;cursor:pointer">✏️</button>' +
        '<button onclick="deleteBranch(\'' + b._id + '\')" style="padding:6px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:7px;font-size:12px;cursor:pointer">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9">🏢 Filiallar <span style="font-size:13px;color:#64748b;font-weight:400">(' + branches.length + ' ta)</span></div>' +
        '<button onclick="openBranchModal(null)" style="padding:9px 18px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">+ Filial qo\'shish</button>' +
      '</div>' +

      (branches.length ? '<div style="display:flex;flex-direction:column;gap:10px">' + cards + '</div>' :
        '<div style="text-align:center;padding:60px;color:#475569">' +
          '<div style="font-size:40px;margin-bottom:12px">🏢</div>' +
          '<div style="margin-bottom:16px">Hali filial qo\'shilmagan</div>' +
          '<button onclick="openBranchModal(null)" style="padding:10px 24px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:14px">+ Birinchi filial qo\'shish</button>' +
        '</div>'
      ) +

      // Modal
      '<div id="branchModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:200;align-items:center;justify-content:center;padding:16px">' +
        '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.15);border-radius:16px;padding:24px;width:100%;max-width:500px;max-height:92vh;overflow-y:auto">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">' +
            '<div id="branchModalTitle" style="font-size:16px;font-weight:700;color:#f1f5f9">Filial qo\'shish</div>' +
            '<button onclick="closeBranchModal()" style="background:none;border:none;color:#64748b;font-size:22px;cursor:pointer;line-height:1">✕</button>' +
          '</div>' +
          '<div id="branchModalBody"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function openBranchModal(branchJson) {
  var b = branchJson ? JSON.parse(branchJson) : null;
  document.getElementById('branchModalTitle').textContent = b ? 'Filial tahrirlash' : 'Yangi filial';

  document.getElementById('branchModalBody').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:14px">' +
      empInp('bName',    'FILIAL NOMI', 'text', b?.name||'') +
      empInp('bAddress', 'MANZIL',      'text', b?.address||'') +
      empInp('bRadius',  'RADIUS (metr)', 'number', b?.radius||100) +

      // Karta
      '<div>' +
        '<div style="font-size:10px;font-weight:600;color:#64748b;letter-spacing:1px;margin-bottom:8px">LOKATSIYA (kartadan tanlang)</div>' +
        '<div style="font-size:12px;color:#64748b;margin-bottom:8px">💡 Kartaga bosib lokatsiyani belgilang. Siz ham "Mening joylashuvim" tugmasini bosishingiz mumkin.</div>' +
        '<div id="branchMapEl" style="height:280px;border-radius:10px;border:1px solid rgba(99,179,237,0.2);overflow:hidden;background:#0f172a"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
          '<div>' +
            '<label style="font-size:10px;color:#64748b;letter-spacing:1px;display:block;margin-bottom:4px">KENGLIK (LAT)</label>' +
            '<input id="bLat" type="number" step="0.000001" value="' + (b?.lat||'') + '" style="width:100%;padding:8px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:7px;color:#f1f5f9;font-size:12px;box-sizing:border-box" oninput="updateMarkerFromInputs()">' +
          '</div>' +
          '<div>' +
            '<label style="font-size:10px;color:#64748b;letter-spacing:1px;display:block;margin-bottom:4px">UZUNLIK (LNG)</label>' +
            '<input id="bLng" type="number" step="0.000001" value="' + (b?.lng||'') + '" style="width:100%;padding:8px;background:#0f172a;border:1px solid rgba(99,179,237,0.15);border-radius:7px;color:#f1f5f9;font-size:12px;box-sizing:border-box" oninput="updateMarkerFromInputs()">' +
          '</div>' +
        '</div>' +
        '<button onclick="useMyLocation()" style="margin-top:8px;width:100%;padding:9px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);color:#4ade80;border-radius:8px;font-size:13px;cursor:pointer">📍 Mening joylashuvimni ishlatish</button>' +
      '</div>' +

      '<div id="bErr" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:10px;border-radius:8px;font-size:13px"></div>' +
      '<button onclick="saveBranch(\'' + (b?._id||'') + '\')" style="width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">' +
        (b ? '💾 Saqlash' : '+ Qo\'shish') +
      '</button>' +
    '</div>';

  document.getElementById('branchModal').style.display = 'flex';

  // Leaflet karta init
  setTimeout(function() {
    if (branchMap) { branchMap.remove(); branchMap = null; branchMarker = null; }

    var initLat = b?.lat || 41.2995;
    var initLng = b?.lng || 69.2401;
    var zoom    = b?.lat ? 16 : 12;

    branchMap = L.map('branchMapEl').setView([initLat, initLng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(branchMap);

    // Mavjud marker
    if (b?.lat && b?.lng) {
      branchMarker = L.marker([b.lat, b.lng], { draggable: true }).addTo(branchMap);
      branchMarker.on('dragend', function(e) {
        var pos = e.target.getLatLng();
        document.getElementById('bLat').value = pos.lat.toFixed(6);
        document.getElementById('bLng').value = pos.lng.toFixed(6);
      });
    }

    // Kartaga bosish → marker qo'yish
    branchMap.on('click', function(e) {
      var lat = e.latlng.lat;
      var lng = e.latlng.lng;
      document.getElementById('bLat').value = lat.toFixed(6);
      document.getElementById('bLng').value = lng.toFixed(6);
      if (branchMarker) {
        branchMarker.setLatLng([lat, lng]);
      } else {
        branchMarker = L.marker([lat, lng], { draggable: true }).addTo(branchMap);
        branchMarker.on('dragend', function(ev) {
          var pos = ev.target.getLatLng();
          document.getElementById('bLat').value = pos.lat.toFixed(6);
          document.getElementById('bLng').value = pos.lng.toFixed(6);
        });
      }
    });
  }, 100);
}

function updateMarkerFromInputs() {
  var lat = parseFloat(document.getElementById('bLat').value);
  var lng = parseFloat(document.getElementById('bLng').value);
  if (!lat || !lng || !branchMap) return;
  if (branchMarker) {
    branchMarker.setLatLng([lat, lng]);
  } else {
    branchMarker = L.marker([lat, lng], { draggable: true }).addTo(branchMap);
  }
  branchMap.setView([lat, lng], 16);
}

function useMyLocation() {
  if (!navigator.geolocation) { alert('GPS mavjud emas'); return; }
  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;
    document.getElementById('bLat').value = lat.toFixed(6);
    document.getElementById('bLng').value = lng.toFixed(6);
    updateMarkerFromInputs();
  }, function() {
    alert('GPS ruxsati berilmadi');
  });
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

  if (!name) { errEl.textContent = 'Filial nomi kiritilmagan'; errEl.style.display='block'; return; }

  var body   = { name, address, lat, lng, radius };
  var url    = id ? '/admin/branches/' + id : '/admin/branches';
  var method = id ? 'PUT' : 'POST';

  var d = await apiFetch(url, { method, body: JSON.stringify(body) });
  if (d.ok) {
    closeBranchModal();
    renderBranches(document.getElementById('mainContent'));
  } else {
    errEl.textContent = d.error || 'Xato yuz berdi';
    errEl.style.display = 'block';
  }
}

async function deleteBranch(id) {
  if (!confirm('Filialni o\'chirishni tasdiqlaysizmi?')) return;
  var d = await apiFetch('/admin/branches/' + id, { method: 'DELETE' });
  if (d.ok) renderBranches(document.getElementById('mainContent'));
}