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
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Login va parolni kiriting'; return; }
  try {
    var r = await fetch(API + '/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    var d = await r.json();
    if (!d.ok) { errEl.textContent = d.error || 'Xato'; return; }
    token     = d.token;
    adminInfo = d.admin;
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminInfo', JSON.stringify(adminInfo));
    startApp();
  } catch(e) {
    errEl.textContent = 'Server bilan boglanib bolmadi';
  }
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