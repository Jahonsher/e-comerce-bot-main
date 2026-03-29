// ===== CONFIG =====
var _cfg = window.__CONFIG__ || {};
var API = _cfg.API_URL || (window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://e-comerce-bot-main-production.up.railway.app');

var token = localStorage.getItem('kitchenToken');
var chefInfo = JSON.parse(localStorage.getItem('chefInfo') || '{}');
var socket = null;
var collapsedCols = {};

// Audio notification
var notifSound = null;
try {
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (AudioCtx) {
    notifSound = new AudioCtx();
  }
} catch(e) {}

function playBeep() {
  try {
    if (!notifSound) return;
    var osc = notifSound.createOscillator();
    var gain = notifSound.createGain();
    osc.connect(gain);
    gain.connect(notifSound.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, notifSound.currentTime + 0.5);
    osc.stop(notifSound.currentTime + 0.5);
  } catch(e) {}
}

// ===== INIT =====
(function init() {
  if (token && chefInfo.id) {
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
    var r = await fetch(API + '/kitchen/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    var d = await r.json();
    if (!d.ok) { showLoginErr(d.error || 'Xato'); btn.textContent = 'Kirish'; btn.disabled = false; return; }
    token = d.token;
    chefInfo = d.chef;
    localStorage.setItem('kitchenToken', token);
    localStorage.setItem('chefInfo', JSON.stringify(chefInfo));
    showApp();
  } catch(e) { showLoginErr('Server xato'); btn.textContent = 'Kirish'; btn.disabled = false; }
}

function showLoginErr(msg) {
  var el = document.getElementById('loginErr');
  el.textContent = '❌ ' + msg;
  el.style.display = 'block';
}

function doLogout() {
  localStorage.removeItem('kitchenToken');
  localStorage.removeItem('chefInfo');
  token = null; chefInfo = {};
  if (socket) socket.disconnect();
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
}

// ===== APP =====
function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('chefName').textContent = chefInfo.name || '';
  connectSocket();
  loadOrders();
  // Auto-refresh every 30s
  setInterval(loadOrders, 30000);
}

// ===== SOCKET.IO =====
function connectSocket() {
  socket = io(API, { transports: ['websocket', 'polling'] });
  socket.on('connect', function() {
    socket.emit('join', { token: token, panel: 'kitchen' });
    setConn(true);
  });
  socket.on('disconnect', function() { setConn(false); });
  socket.on('to-kitchen', function(data) {
    showToast('🆕 Yangi buyurtma!', 'Stol ' + data.tableNumber + ' — ' + data.items.length + ' ta mahsulot');
    playBeep();
    loadOrders();
  });
  socket.on('shot-updated', function() {
    loadOrders();
  });
  socket.on('shot-closed', function() {
    loadOrders();
  });
  socket.on('new-order', function(shot) {
    // Agar auto-kitchen bo'lsa va itemlar bor bo'lsa
    showToast('🆕 Yangi buyurtma', 'Stol ' + shot.tableNumber);
    playBeep();
    loadOrders();
  });
}

function setConn(on) {
  document.getElementById('connDot').className = 'conn-dot ' + (on ? 'on' : 'off');
  document.getElementById('connText').textContent = on ? 'Online' : 'Offline';
}

// ===== LOAD ORDERS =====
async function loadOrders() {
  try {
    // Active orders (pending + cooking)
    var r1 = await fetch(API + '/kitchen/orders', { headers: { 'Authorization': 'Bearer ' + token } });
    var d1 = await r1.json();
    if (d1.error === 'Token yaroqsiz' || d1.deleted) { doLogout(); return; }

    // Recent ready orders
    var r2 = await fetch(API + '/kitchen/recent', { headers: { 'Authorization': 'Bearer ' + token } });
    var d2 = await r2.json();

    renderKitchen(d1.orders || [], d2.recent || []);
  } catch(e) { console.error('loadOrders:', e); }
}

function renderKitchen(orders, recentReady) {
  var newOrders = [];
  var cookingOrders = [];

  orders.forEach(function(order) {
    var pendingItems = order.items.filter(function(i) { return i.kitchenStatus === 'pending'; });
    var cookingItems = order.items.filter(function(i) { return i.kitchenStatus === 'cooking'; });
    
    if (pendingItems.length > 0) {
      newOrders.push({ shotId: order.shotId, tableNumber: order.tableNumber, waiterName: order.waiterName, items: pendingItems, openedAt: order.openedAt });
    }
    if (cookingItems.length > 0) {
      cookingOrders.push({ shotId: order.shotId, tableNumber: order.tableNumber, waiterName: order.waiterName, items: cookingItems, openedAt: order.openedAt });
    }
  });

  // NEW column
  document.getElementById('countNew').textContent = newOrders.length;
  var newHtml = '';
  if (newOrders.length === 0) {
    newHtml = '<div class="empty-state">Yangi buyurtmalar yo\'q</div>';
  } else {
    newOrders.forEach(function(o) {
      newHtml += renderOrderCard(o, 'new');
    });
  }
  document.getElementById('colNew').innerHTML = newHtml;

  // COOKING column
  document.getElementById('countCooking').textContent = cookingOrders.length;
  var cookHtml = '';
  if (cookingOrders.length === 0) {
    cookHtml = '<div class="empty-state">Tayyorlanayotgan buyurtmalar yo\'q</div>';
  } else {
    cookingOrders.forEach(function(o) {
      cookHtml += renderOrderCard(o, 'cooking');
    });
  }
  document.getElementById('colCooking').innerHTML = cookHtml;

  // READY column
  document.getElementById('countReady').textContent = recentReady.length;
  var readyHtml = '';
  if (recentReady.length === 0) {
    readyHtml = '<div class="empty-state">Hali tayyor buyurtmalar yo\'q</div>';
  } else {
    recentReady.forEach(function(o) {
      readyHtml += renderOrderCard(o, 'ready');
    });
  }
  document.getElementById('colReady').innerHTML = readyHtml;
}

function renderOrderCard(order, status) {
  var itemsHtml = '';
  order.items.forEach(function(item) {
    itemsHtml += '<div class="order-item">' +
      '<span class="order-item-name">' + item.name + '</span>' +
      '<span class="order-item-qty">x' + item.quantity + '</span>' +
    '</div>';
  });

  var actionHtml = '';
  if (status === 'new') {
    actionHtml = '<button class="btn btn-cook" onclick="startCooking(\'' + order.shotId + '\')">🍳 Tayyorlash</button>';
  } else if (status === 'cooking') {
    actionHtml = '<button class="btn btn-ready" onclick="markReady(\'' + order.shotId + '\')">✅ Tayyor</button>';
  }

  var timeStr = '';
  if (order.openedAt) {
    var dt = new Date(order.openedAt);
    timeStr = dt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  }

  return '<div class="order-card ' + status + '">' +
    '<div class="order-top">' +
      '<span class="order-table">🪑 Stol ' + order.tableNumber + '</span>' +
      '<span class="order-time">' + timeStr + '</span>' +
    '</div>' +
    (order.waiterName ? '<div class="order-waiter">👤 ' + order.waiterName + '</div>' : '') +
    '<div class="order-items">' + itemsHtml + '</div>' +
    actionHtml +
  '</div>';
}

// ===== ACTIONS =====
async function startCooking(shotId) {
  try {
    var r = await fetch(API + '/kitchen/orders/' + shotId + '/cooking', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    var d = await r.json();
    if (d.ok) {
      showToast('🍳 Tayyorlanmoqda', 'Stol ' + (d.shot?.tableNumber || ''));
      loadOrders();
    } else {
      showToast('❌ Xato', d.error);
    }
  } catch(e) { showToast('❌ Xato', 'Server xato'); }
}

async function markReady(shotId) {
  try {
    var r = await fetch(API + '/kitchen/orders/' + shotId + '/ready', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    var d = await r.json();
    if (d.ok) {
      showToast('✅ Tayyor!', 'Stol ' + (d.shot?.tableNumber || ''));
      loadOrders();
    } else {
      showToast('❌ Xato', d.error);
    }
  } catch(e) { showToast('❌ Xato', 'Server xato'); }
}

// ===== COLUMN TOGGLE =====
function toggleColumn(col) {
  var body = document.getElementById('col' + col.charAt(0).toUpperCase() + col.slice(1));
  var arrow = document.getElementById('arrow' + col.charAt(0).toUpperCase() + col.slice(1));
  if (!body) return;
  collapsedCols[col] = !collapsedCols[col];
  body.classList.toggle('collapsed', collapsedCols[col]);
  if (arrow) arrow.textContent = collapsedCols[col] ? '▶' : '▼';
}

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

// Enter key for login
document.getElementById('loginPass').addEventListener('keyup', function(e) { if (e.key === 'Enter') doLogin(); });