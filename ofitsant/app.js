// ===== CONFIG =====
var _cfg = window.__CONFIG__ || {};
var API = _cfg.API_URL || (window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://e-comerce-bot-main-production.up.railway.app');

var token = localStorage.getItem('waiterToken');
var waiterInfo = JSON.parse(localStorage.getItem('waiterInfo') || '{}');
var socket = null;
var currentShot = null;
var products = [];
var categories = [];
var selectedItems = {}; // { productId: { ...product, qty: N } }
var statsMonth = new Date().toISOString().slice(0, 7);

// ===== INIT =====
(function init() {
  if (token && waiterInfo.id) {
    showApp();
  }
})();

// ===== AUTH =====
async function doLogin() {
  var username = document.getElementById('loginUser').value.trim();
  var password = document.getElementById('loginPass').value;
  var errEl = document.getElementById('loginErr');
  var btn = document.getElementById('loginBtn');
  errEl.style.display = 'none';
  if (!username || !password) { showLoginErr('Login va parolni kiriting'); return; }
  btn.textContent = 'Tekshirilmoqda...'; btn.disabled = true;
  try {
    var r = await fetch(API + '/waiter/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    var d = await r.json();
    if (!d.ok) { showLoginErr(d.error || 'Xato'); btn.textContent = 'Kirish'; btn.disabled = false; return; }
    token = d.token;
    waiterInfo = d.waiter;
    localStorage.setItem('waiterToken', token);
    localStorage.setItem('waiterInfo', JSON.stringify(waiterInfo));
    showApp();
  } catch(e) { showLoginErr('Server xato'); btn.textContent = 'Kirish'; btn.disabled = false; }
}

function showLoginErr(msg) {
  var el = document.getElementById('loginErr');
  el.textContent = '❌ ' + msg;
  el.style.display = 'block';
}

function doLogout() {
  localStorage.removeItem('waiterToken');
  localStorage.removeItem('waiterInfo');
  token = null; waiterInfo = {};
  if (socket) socket.disconnect();
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

// ===== APP =====
function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('waiterName').textContent = waiterInfo.name || '';
  connectSocket();
  loadShots();
  loadProducts();
}

// ===== SOCKET.IO =====
function connectSocket() {
  socket = io(API, { transports: ['websocket', 'polling'] });
  socket.on('connect', function() {
    socket.emit('join', { token: token, panel: 'waiter' });
    setConn(true);
  });
  socket.on('disconnect', function() { setConn(false); });
  socket.on('new-order', function(shot) {
    showToast('🆕 Yangi buyurtma', 'Stol ' + shot.tableNumber);
    loadShots();
    if (currentShot && currentShot._id === shot._id) renderShotDetail(shot);
  });
  socket.on('shot-updated', function(shot) {
    loadShots();
    if (currentShot && currentShot._id === shot._id) renderShotDetail(shot);
  });
  socket.on('kitchen-ready', function(data) {
    showToast('✅ Tayyor!', 'Stol ' + data.tableNumber + ' — ' + data.items.map(function(i){return i.name;}).join(', '));
    loadShots();
    if (currentShot && currentShot._id === data.shotId) loadShotDetail(data.shotId);
  });
  socket.on('shot-closed', function(shot) {
    loadShots();
    if (currentShot && currentShot._id === shot._id) { currentShot = null; backToShots(); }
  });
  socket.on('new-shot', function() { loadShots(); });
}

function setConn(on) {
  document.getElementById('connDot').className = 'conn-dot ' + (on ? 'on' : 'off');
  document.getElementById('connText').textContent = on ? 'Online' : 'Offline';
}

// ===== TABS =====
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
  document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
  if (tab === 'shots') {
    document.getElementById('sec-shots').classList.add('active');
    document.getElementById('fabBtn').style.display = 'flex';
    loadShots();
  } else if (tab === 'stats') {
    document.getElementById('sec-stats').classList.add('active');
    document.getElementById('sec-detail').classList.remove('active');
    document.getElementById('fabBtn').style.display = 'none';
    loadStats();
  }
}

// ===== SHOTS =====
async function loadShots() {
  try {
    var r = await fetch(API + '/waiter/shots', { headers: { 'Authorization': 'Bearer ' + token } });
    var d = await r.json();
    if (d.error === 'Token yaroqsiz' || d.deleted) { doLogout(); return; }
    renderShots(d.shots || []);
  } catch(e) { console.error('loadShots:', e); }
}

function renderShots(shots) {
  var el = document.getElementById('shotsList');
  if (!shots.length) {
    el.innerHTML = '<div class="empty-state"><div class="emoji">🪑</div><p>Ochiq shotlar yo\'q</p></div>';
    return;
  }
  var html = '';
  shots.forEach(function(s) {
    var itemCount = s.items.length;
    var pendingCount = s.items.filter(function(i) { return i.sentToKitchen && i.kitchenStatus !== 'ready'; }).length;
    var readyCount = s.items.filter(function(i) { return i.kitchenStatus === 'ready'; }).length;
    var notSentCount = s.items.filter(function(i) { return !i.sentToKitchen; }).length;
    var statusInfo = '';
    if (readyCount > 0) statusInfo += '<span style="color:var(--green);">✅' + readyCount + '</span> ';
    if (pendingCount > 0) statusInfo += '<span style="color:var(--orange);">🍳' + pendingCount + '</span> ';
    if (notSentCount > 0) statusInfo += '<span style="color:var(--text3);">⏳' + notSentCount + '</span>';
    html += '<div class="shot-card" onclick="openShotDetail(\'' + s._id + '\')">' +
      '<div class="shot-header">' +
        '<span class="shot-table">🪑 Stol ' + s.tableNumber + '</span>' +
        '<span class="shot-status open">OCHIQ</span>' +
      '</div>' +
      '<div class="shot-meta">' +
        '<span>👤 ' + (s.waiterName || '—') + '</span>' +
        '<span>📦 ' + itemCount + ' ta</span>' +
        '<span>' + timeAgo(s.openedAt) + '</span>' +
      '</div>' +
      '<div style="margin-bottom:8px;font-size:13px;">' + statusInfo + '</div>' +
      '<div class="shot-total">' + formatMoney(s.total) + '</div>' +
      '<div class="shot-actions">' +
        '<button class="btn btn-blue btn-sm" onclick="event.stopPropagation();openShotDetail(\'' + s._id + '\')">Ko\'rish</button>' +
        (notSentCount > 0 ? '<button class="btn btn-green btn-sm" onclick="event.stopPropagation();sendToKitchen(\'' + s._id + '\')">📤 Oshpazga</button>' : '') +
        '<button class="btn btn-red btn-sm" onclick="event.stopPropagation();showCloseShotConfirm(\'' + s._id + '\',' + s.total + ')">💳 Yopish</button>' +
      '</div>' +
    '</div>';
  });
  el.innerHTML = html;
}

// ===== SHOT DETAIL =====
async function openShotDetail(shotId) {
  document.getElementById('sec-shots').classList.remove('active');
  document.getElementById('sec-detail').classList.add('active');
  document.getElementById('fabBtn').style.display = 'none';
  await loadShotDetail(shotId);
}

async function loadShotDetail(shotId) {
  try {
    var r = await fetch(API + '/waiter/shots/' + shotId, { headers: { 'Authorization': 'Bearer ' + token } });
    var d = await r.json();
    if (d.ok) { currentShot = d.shot; renderShotDetail(d.shot); }
  } catch(e) { console.error('loadShotDetail:', e); }
}

function renderShotDetail(shot) {
  currentShot = shot;
  var notSentCount = shot.items.filter(function(i) { return !i.sentToKitchen; }).length;
  var html = '<div class="detail-header">' +
    '<div class="detail-title">🪑 Stol ' + shot.tableNumber + '</div>' +
    '<div class="detail-sub">Ofitsiant: ' + (shot.waiterName || '—') + ' · ' + formatDate(shot.openedAt) + '</div>' +
  '</div>';

  // Items
  if (shot.items.length) {
    html += '<div class="item-list">';
    shot.items.forEach(function(item, idx) {
      var ksIcon = '', ksClass = '';
      if (!item.sentToKitchen) { ksIcon = '⏳'; ksClass = 'ks-pending'; }
      else if (item.kitchenStatus === 'pending') { ksIcon = '📤'; ksClass = 'ks-pending'; }
      else if (item.kitchenStatus === 'cooking') { ksIcon = '🍳'; ksClass = 'ks-cooking'; }
      else if (item.kitchenStatus === 'ready') { ksIcon = '✅'; ksClass = 'ks-ready'; }
      var badge = item.addedBy === 'customer' ? '<span class="item-badge customer">mijoz</span>' : '<span class="item-badge waiter">ofitsiant</span>';
      html += '<div class="item-row">' +
        '<div class="item-info">' +
          '<div class="item-name">' + item.name + ' x' + item.quantity + '</div>' +
          badge +
        '</div>' +
        '<div class="item-price">' + formatMoney(item.price * item.quantity) + '</div>' +
        '<div class="item-kitchen-status ' + ksClass + '">' + ksIcon + '</div>' +
      '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="empty-state" style="padding:30px;"><p>Mahsulot yo\'q</p></div>';
  }

  // Total
  html += '<div class="detail-total">' +
    '<span class="detail-total-label">Jami:</span>' +
    '<span class="detail-total-val">' + formatMoney(shot.total) + '</span>' +
  '</div>';

  // Actions
  html += '<div class="detail-actions">';
  html += '<button class="btn btn-primary btn-block" onclick="showAddItemModal()">+ Mahsulot qo\'shish</button>';
  if (notSentCount > 0) {
    html += '<button class="btn btn-green btn-block" onclick="sendToKitchen(\'' + shot._id + '\')">📤 Oshpazga yuborish (' + notSentCount + ' ta)</button>';
  }
  html += '<button class="btn btn-red btn-block" onclick="showCloseShotConfirm(\'' + shot._id + '\',' + shot.total + ')">💳 Shot yopish</button>';
  html += '</div>';

  document.getElementById('shotDetail').innerHTML = html;
}

function backToShots() {
  currentShot = null;
  document.getElementById('sec-detail').classList.remove('active');
  document.getElementById('sec-shots').classList.add('active');
  document.getElementById('fabBtn').style.display = 'flex';
  loadShots();
}

// ===== SEND TO KITCHEN =====
async function sendToKitchen(shotId) {
  try {
    var r = await fetch(API + '/waiter/shots/' + shotId + '/to-kitchen', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } });
    var d = await r.json();
    if (d.ok) {
      showToast('📤 Yuborildi', d.sentCount + ' ta mahsulot oshpazga yuborildi');
      loadShots();
      if (currentShot && currentShot._id === shotId) renderShotDetail(d.shot);
    } else {
      showToast('❌ Xato', d.error || 'Xato');
    }
  } catch(e) { showToast('❌ Xato', 'Server bilan aloqa yo\'q'); }
}

// ===== CLOSE SHOT =====
var closingShotId = null;
function showCloseShotConfirm(shotId, total) {
  closingShotId = shotId;
  document.getElementById('closeShotTotal').textContent = formatMoney(total);
  document.getElementById('closeShotModal').classList.add('show');
}

async function confirmCloseShot() {
  if (!closingShotId) return;
  var btn = document.getElementById('closeShotBtn');
  btn.textContent = 'Yopilmoqda...'; btn.disabled = true;
  try {
    var r = await fetch(API + '/waiter/shots/' + closingShotId + '/close', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } });
    var d = await r.json();
    if (d.ok) {
      showToast('✅ Shot yopildi', 'Stol ' + d.shot.tableNumber);
      closeModal('closeShotModal');
      backToShots();
    } else {
      showToast('❌ Xato', d.error || 'Xato');
    }
  } catch(e) { showToast('❌ Xato', 'Server xato'); }
  btn.textContent = '✓ Shot yopish'; btn.disabled = false;
  closingShotId = null;
}

// ===== OPEN NEW SHOT =====
function showOpenShotModal() {
  document.getElementById('newTableNum').value = '';
  document.getElementById('openShotModal').classList.add('show');
  setTimeout(function() { document.getElementById('newTableNum').focus(); }, 200);
}

async function openNewShot() {
  var table = document.getElementById('newTableNum').value.trim();
  if (!table) return;
  try {
    var r = await fetch(API + '/waiter/shots/open', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ tableNumber: table }) });
    var d = await r.json();
    if (d.ok) {
      closeModal('openShotModal');
      showToast('✅ Shot ochildi', 'Stol ' + table);
      loadShots();
    } else {
      showToast('❌ Xato', d.error || 'Xato');
    }
  } catch(e) { showToast('❌ Xato', 'Server xato'); }
}

// ===== PRODUCTS & ADD ITEM =====
async function loadProducts() {
  try {
    var r = await fetch(API + '/waiter/products', { headers: { 'Authorization': 'Bearer ' + token } });
    var d = await r.json();
    if (d.ok) { products = d.products || []; categories = d.categories || []; }
  } catch(e) { console.error('loadProducts:', e); }
}

function showAddItemModal() {
  selectedItems = {};
  renderProductModal();
  document.getElementById('addItemModal').classList.add('show');
}

function renderProductModal(filterCat) {
  // Categories
  var catHtml = '<button class="cat-tab ' + (!filterCat ? 'active' : '') + '" onclick="renderProductModal()">Barchasi</button>';
  categories.forEach(function(c) {
    catHtml += '<button class="cat-tab ' + (filterCat === c.name ? 'active' : '') + '" onclick="renderProductModal(\'' + c.name + '\')">' + (c.emoji || '') + ' ' + c.name + '</button>';
  });
  document.getElementById('catTabs').innerHTML = catHtml;

  // Products
  var filtered = filterCat ? products.filter(function(p) { return p.category === filterCat; }) : products;
  var html = '';
  filtered.forEach(function(p) {
    var sel = selectedItems[p._id];
    var isSelected = sel && sel.qty > 0;
    html += '<div class="prod-card ' + (isSelected ? 'selected' : '') + '" onclick="toggleProduct(\'' + p._id + '\')">' +
      '<div class="prod-card-name">' + p.name + '</div>' +
      '<div class="prod-card-price">' + formatMoney(p.price) + '</div>';
    if (isSelected) {
      html += '<div class="prod-qty" onclick="event.stopPropagation();">' +
        '<button onclick="changeQty(\'' + p._id + '\',-1)">−</button>' +
        '<span>' + sel.qty + '</span>' +
        '<button onclick="changeQty(\'' + p._id + '\',1)">+</button>' +
      '</div>';
    }
    html += '</div>';
  });
  document.getElementById('prodGrid').innerHTML = html || '<div style="grid-column:1/-1;text-align:center;color:var(--text3);padding:20px;">Mahsulot yo\'q</div>';
}

function toggleProduct(pid) {
  if (selectedItems[pid]) {
    delete selectedItems[pid];
  } else {
    var p = products.find(function(x) { return x._id === pid; });
    if (p) selectedItems[pid] = { name: p.name, name_ru: p.name_ru || '', price: p.price, qty: 1 };
  }
  renderProductModal(document.querySelector('.cat-tab.active')?.textContent.trim());
}

function changeQty(pid, delta) {
  if (!selectedItems[pid]) return;
  selectedItems[pid].qty += delta;
  if (selectedItems[pid].qty <= 0) delete selectedItems[pid];
  renderProductModal(document.querySelector('.cat-tab.active')?.textContent.trim());
}

async function confirmAddItems() {
  if (!currentShot) return;
  var items = Object.values(selectedItems).map(function(s) {
    return { name: s.name, name_ru: s.name_ru, price: s.price, quantity: s.qty };
  });
  if (!items.length) { showToast('⚠️', 'Mahsulot tanlang'); return; }
  try {
    var r = await fetch(API + '/waiter/shots/' + currentShot._id + '/add-item', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    });
    var d = await r.json();
    if (d.ok) {
      closeModal('addItemModal');
      renderShotDetail(d.shot);
      showToast('✅ Qo\'shildi', items.length + ' ta mahsulot');
    } else { showToast('❌ Xato', d.error); }
  } catch(e) { showToast('❌ Xato', 'Server xato'); }
}

// ===== STATS =====
async function loadStats() {
  try {
    var r = await fetch(API + '/waiter/stats?month=' + statsMonth, { headers: { 'Authorization': 'Bearer ' + token } });
    var d = await r.json();
    if (d.ok) renderStats(d);
  } catch(e) { console.error('loadStats:', e); }
}

function renderStats(data) {
  var html = '<div class="month-nav">' +
    '<button onclick="changeMonth(-1)">◀</button>' +
    '<span>' + formatMonth(statsMonth) + '</span>' +
    '<button onclick="changeMonth(1)">▶</button>' +
  '</div>';
  html += '<div class="stat-cards">' +
    '<div class="stat-card gold"><div class="stat-card-val">' + data.totalShots + '</div><div class="stat-card-label">Jami shotlar</div></div>' +
    '<div class="stat-card green"><div class="stat-card-val">' + data.closedShots + '</div><div class="stat-card-label">Yopilgan</div></div>' +
    '<div class="stat-card blue"><div class="stat-card-val">' + formatMoney(data.totalSum) + '</div><div class="stat-card-label">Jami summa</div></div>' +
    '<div class="stat-card"><div class="stat-card-val">' + formatMoney(data.avgShot) + '</div><div class="stat-card-label">O\'rtacha shot</div></div>' +
  '</div>';

  // Calendar
  html += '<div style="background:var(--bg2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);">';
  html += '<h4 style="margin-bottom:12px;">Kunlik ko\'rsatkich</h4>';
  html += '<div class="calendar-grid">';
  var days = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
  days.forEach(function(d) { html += '<div class="cal-header">' + d + '</div>'; });
  var [y, m] = statsMonth.split('-').map(Number);
  var firstDay = new Date(y, m - 1, 1).getDay();
  var offset = firstDay === 0 ? 6 : firstDay - 1;
  for (var i = 0; i < offset; i++) html += '<div class="cal-day empty"></div>';
  var daysInMonth = new Date(y, m, 0).getDate();
  for (var d = 1; d <= daysInMonth; d++) {
    var key = String(d).padStart(2, '0');
    var dd = data.daily[key];
    var hasData = dd && dd.shots > 0;
    html += '<div class="cal-day ' + (hasData ? 'has-data' : '') + '">' +
      '<span class="cal-day-num">' + d + '</span>' +
      (hasData ? '<span class="cal-day-info">' + dd.shots + 'x</span>' : '') +
    '</div>';
  }
  html += '</div></div>';
  document.getElementById('statsContent').innerHTML = html;
}

function changeMonth(delta) {
  var [y, m] = statsMonth.split('-').map(Number);
  m += delta;
  if (m > 12) { m = 1; y++; }
  if (m < 1) { m = 12; y--; }
  statsMonth = y + '-' + String(m).padStart(2, '0');
  loadStats();
}

// ===== MODAL =====
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(function(el) {
  el.addEventListener('click', function(e) {
    if (e.target === el) el.classList.remove('show');
  });
});

// ===== TOAST =====
function showToast(title, msg) {
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.className = 'toast';
  div.innerHTML = '<div class="toast-title">' + title + '</div><div class="toast-msg">' + (msg || '') + '</div>';
  document.body.appendChild(div);
  setTimeout(function() { div.remove(); }, 3500);
}

// ===== HELPERS =====
function formatMoney(n) {
  return Number(n || 0).toLocaleString('uz-UZ') + ' so\'m';
}

function formatDate(d) {
  if (!d) return '';
  var dt = new Date(d);
  return dt.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatMonth(ym) {
  var months = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  var [y, m] = ym.split('-').map(Number);
  return months[m - 1] + ' ' + y;
}

function timeAgo(d) {
  if (!d) return '';
  var diff = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (diff < 1) return 'hozirgina';
  if (diff < 60) return diff + ' min';
  if (diff < 1440) return Math.floor(diff / 60) + ' soat';
  return Math.floor(diff / 1440) + ' kun';
}

// Enter key for login
document.getElementById('loginPass').addEventListener('keyup', function(e) { if (e.key === 'Enter') doLogin(); });
document.getElementById('newTableNum').addEventListener('keyup', function(e) { if (e.key === 'Enter') openNewShot(); });