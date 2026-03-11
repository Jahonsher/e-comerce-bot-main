const API = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://e-comerce-bot-main-production.up.railway.app';

let token      = localStorage.getItem('empToken');
let empInfo    = JSON.parse(localStorage.getItem('empInfo') || 'null');
let todayAtt   = null;
let currentPage = 'home';
let stream     = null;
let gpsCoords  = null;
let capturedPhoto = null;

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  if (token && empInfo) {
    startApp();
  }
});

// ===== LOGIN =====
async function doLogin() {
  var username = document.getElementById('loginUser').value.trim();
  var password = document.getElementById('loginPass').value;
  var errEl    = document.getElementById('loginErr');
  var btn      = document.getElementById('loginBtn');

  errEl.style.display = 'none';

  if (!username) { showErr(errEl, '⚠️ Login kiritilmagan'); return; }
  if (!password) { showErr(errEl, '⚠️ Parol kiritilmagan'); return; }

  btn.textContent = 'Tekshirilmoqda...';
  btn.disabled    = true;

  try {
    var r = await fetch(API + '/employee/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password })
    });
    var d = await r.json();

    if (!d.ok) {
      showErr(errEl, '❌ Login yoki parol noto\'g\'ri');
      document.getElementById('loginPass').value = '';
      btn.textContent = 'Kirish';
      btn.disabled    = false;
      return;
    }

    token   = d.token;
    empInfo = d.employee;
    localStorage.setItem('empToken', token);
    localStorage.setItem('empInfo', JSON.stringify({ ...d.employee, weeklyOff: d.employee.weeklyOff || 'sunday' }));
    btn.textContent = '✓ Kirish...';
    startApp();

  } catch(e) {
    showErr(errEl, '🔌 Server bilan ulanib bo\'lmadi');
    btn.textContent = 'Kirish';
    btn.disabled    = false;
  }
}

function showErr(el, msg) {
  el.textContent     = msg;
  el.style.display   = 'block';
}

// ===== START APP =====
function startApp() {
  // Blok tekshiruvi
  var rId = empInfo && empInfo.restaurantId ? empInfo.restaurantId : 'imperial';
  fetch(API + '/check-block/' + rId)
    .then(function(r){ return r.json(); })
    .then(function(d){ if (d.blocked) { showBlockedScreen(d.reason); return; } _startApp(); })
    .catch(function(){ _startApp(); });
}

function _startApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display   = 'block';
  document.getElementById('headerName').textContent     = empInfo.name || '—';
  document.getElementById('headerPosition').textContent = empInfo.position || 'Ishchi';
  showPage('home', document.querySelector('[data-page="home"]'));
}

// ===== LOGOUT =====
function doLogout() {
  if (!confirm('Chiqmoqchimisiz?')) return;
  localStorage.removeItem('empToken');
  localStorage.removeItem('empInfo');
  token   = null;
  empInfo = null;
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display   = 'none';
}

// ===== NAVIGATION =====
function showPage(page, btn) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (page === 'home')    renderHome();
  if (page === 'stats')   renderStats();
  if (page === 'history') renderHistory();
}

// ===== API HELPER =====
async function apiFetch(url, opts) {
  var r = await fetch(API + url, {
    ...opts,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + token,
      ...(opts?.headers || {})
    }
  });
  if (r.status === 401) {
    var d = {};
    try { d = await r.json(); } catch(e) {}
    // Akkaunt o'chirilgan yoki token yaroqsiz
    localStorage.removeItem('empToken');
    localStorage.removeItem('empInfo');
    token   = null;
    empInfo = null;
    document.getElementById('appPage').style.display   = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    if (d.deleted) {
      document.getElementById('loginErr').textContent   = "Sizning akkauntingiz o'chirilgan. Administratorga murojaat qiling.";
      document.getElementById('loginErr').style.display = 'block';
    }
    return {};
  }
  return r.json();
}

// ===================================================
// ===== HOME PAGE ===================================
// ===================================================
async function renderHome() {
  var main = document.getElementById('mainContent');
  main.innerHTML = '<div style="text-align:center;padding:40px 0;color:#475569">Yuklanmoqda...</div>';

  var d = await apiFetch('/employee/today');
  todayAtt = d.attendance;

  var now       = new Date();
  var timeStr   = now.toTimeString().slice(0, 5);
  var dateStr   = now.toLocaleDateString('uz-UZ', { weekday:'long', day:'numeric', month:'long' });

  // Holat aniqlash
  var status = 'notchecked';
  if (todayAtt?.checkIn && !todayAtt?.checkOut) status = 'working';
  if (todayAtt?.checkOut) status = 'done';

  // Ish vaqti
  var workStart = empInfo.workStart || '09:00';
  var workEnd   = empInfo.workEnd   || '18:00';

  // Kechikish
  var lateMin = todayAtt?.lateMinutes || 0;
  var lateText = lateMin > 0
    ? '<span style="color:#f59e0b;font-size:13px">⚠️ ' + lateMin + ' daqiqa kechikdingiz</span>'
    : (todayAtt?.checkIn ? '<span style="color:#22c55e;font-size:13px">✅ O\'z vaqtida keldingiz</span>' : '');

  // Ishlagan vaqt
  var workedText = '';
  if (todayAtt?.checkOut && todayAtt?.totalMinutes) {
    // Tugagan — aniq vaqt
    workedText = formatMinutes(todayAtt.totalMinutes);
  } else if (todayAtt?.checkIn && !todayAtt?.checkOut) {
    // Hali ishda — hozirgi vaqtgacha
    workedText = formatMinutes(getWorkedMinutes(todayAtt.checkIn)) + ' (davom etmoqda)';
  }

  // Tugma holati
  var btnClass = 'checkin-btn';
  var btnIcon  = '👆';
  var btnText  = 'KELDI';
  var btnOnclick = 'startCheckin()';

  if (status === 'working') {
    btnClass  += ' working pulse';
    btnIcon    = '🚪';
    btnText    = 'KETDI';
    btnOnclick = 'doCheckout()';
  } else if (status === 'done') {
    btnClass  += ' done';
    btnIcon    = '✅';
    btnText    = 'TUGADI';
    btnOnclick = '';
  }

  main.innerHTML =
    '<div class="fade-up">' +

      // Sana va vaqt
      '<div style="text-align:center;margin-bottom:20px">' +
        '<div style="font-size:13px;color:#64748b;text-transform:capitalize">' + dateStr + '</div>' +
        '<div style="font-size:36px;font-weight:700;color:#f1f5f9;letter-spacing:2px" id="liveClock">' + timeStr + '</div>' +
      '</div>' +

      // Dam kuni tekshiruvi
      (function() {
        var dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        var todayDay = dayNames[now.getDay()];
        var isOff = empInfo.weeklyOff === todayDay;
        var dayNamesUz = {monday:'Dushanba',tuesday:'Seshanba',wednesday:'Chorshanba',thursday:'Payshanba',friday:'Juma',saturday:'Shanba',sunday:'Yakshanba'};
        var offDayUz = dayNamesUz[empInfo.weeklyOff||'sunday'];
        return (isOff
          ? '<div style="background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.25);border-radius:10px;padding:12px;text-align:center;margin-bottom:12px">' +
              '<div style="font-size:22px">🛌</div>' +
              '<div style="font-size:13px;font-weight:600;color:#a78bfa;margin-top:4px">Bugun sizning dam kunigiz</div>' +
              '<div style="font-size:11px;color:#64748b;margin-top:2px">Ishga kelgan bolsangiz — bu ish atrabotka hisoblanadi</div>' +
            '</div>'
          : '<div style="font-size:11px;color:#475569;text-align:center;margin-bottom:8px">Dam olish kuni: <span style="color:#a78bfa">' + offDayUz + '</span></div>');
      })() +

      // Ish vaqti
      '<div style="display:flex;gap:8px;margin-bottom:20px">' +
        '<div style="flex:1;background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:10px;padding:12px;text-align:center">' +
          '<div style="font-size:10px;color:#64748b;letter-spacing:1px;margin-bottom:4px">BOSHLANISH</div>' +
          '<div style="font-size:18px;font-weight:700;color:#3b82f6">' + workStart + '</div>' +
        '</div>' +
        '<div style="flex:1;background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:10px;padding:12px;text-align:center">' +
          '<div style="font-size:10px;color:#64748b;letter-spacing:1px;margin-bottom:4px">TUGASH</div>' +
          '<div style="font-size:18px;font-weight:700;color:#3b82f6">' + workEnd + '</div>' +
        '</div>' +
      '</div>' +

      // Asosiy tugma
      '<div style="text-align:center;margin:28px 0">' +
        '<button class="' + btnClass + '" ' + (btnOnclick ? 'onclick="' + btnOnclick + '"' : '') + '>' +
          '<span style="font-size:36px">' + btnIcon + '</span>' +
          '<span>' + btnText + '</span>' +
        '</button>' +
      '</div>' +

      // Kechikish xabari
      (lateText ? '<div style="text-align:center;margin-bottom:16px">' + lateText + '</div>' : '') +

      // Bugungi info
      '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;padding:16px">' +
        '<div style="font-size:11px;font-weight:600;color:#64748b;letter-spacing:1px;margin-bottom:12px">BUGUN</div>' +
        '<div class="record-row">' +
          '<span style="font-size:13px;color:#94a3b8">Kelgan vaqt</span>' +
          '<span style="font-size:14px;font-weight:600;color:#f1f5f9">' + (todayAtt?.checkIn || '—') + '</span>' +
        '</div>' +
        '<div class="record-row">' +
          '<span style="font-size:13px;color:#94a3b8">Ketgan vaqt</span>' +
          '<span style="font-size:14px;font-weight:600;color:#f1f5f9">' + (todayAtt?.checkOut || '—') + '</span>' +
        '</div>' +
        '<div class="record-row">' +
          '<span style="font-size:13px;color:#94a3b8">Ishlagan vaqt</span>' +
          '<span style="font-size:14px;font-weight:600;color:#22c55e">' + (workedText || '—') + '</span>' +
        '</div>' +
      '</div>' +

    '</div>';

  // Jonli soat
  startClock();
}

// Jonli soat
var clockInterval = null;
function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(() => {
    var el = document.getElementById('liveClock');
    if (el) el.textContent = new Date().toTimeString().slice(0, 5);
  }, 1000);
}

// ===================================================
// ===== CHECKIN FLOW ================================
// ===================================================
async function startCheckin() {
  // 1. GPS olish
  if (!navigator.geolocation) {
    alert('GPS qurilmangizda mavjud emas');
    return;
  }

  var loadMsg = showToast('📍 GPS aniqlanmoqda...');

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      hideToast(loadMsg);
      // 2. Kamera ochish
      openCam('checkin');
    },
    (err) => {
      hideToast(loadMsg);
      // GPS ruxsat berilmasa — fotosiz ham qabul qilish
      if (confirm('GPS ruxsati berilmadi. Fotosiz davom etasizmi?')) {
        gpsCoords = null;
        openCam('checkin');
      }
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

async function doCheckout() {
  // Checkout uchun ham selfie olish kerak (Face++ tekshiruvi)
  capturedPhoto = null;
  checkoutMode  = true;  // flag: bu checkout uchun
  await openCam('checkout');
}

var checkoutMode = false;

async function submitCheckout(photo) {
  var btn = document.querySelector('.checkin-btn');
  if (btn) { btn.textContent = '⏳ Saqlanmoqda...'; btn.disabled = true; }

  var now = new Date();
  var clientTimeMinutes = now.getHours() * 60 + now.getMinutes();
  var clientDate = now.getFullYear() + '-' +
    String(now.getMonth()+1).padStart(2,'0') + '-' +
    String(now.getDate()).padStart(2,'0');

  var d = await apiFetch('/employee/checkout', {
    method: 'POST',
    body: JSON.stringify({ photo: photo || '', clientTimeMinutes, clientDate })
  });

  if (btn) { btn.textContent = 'KETDI'; btn.disabled = false; }

  if (d.ok) {
    showToast('✅ Ketdi vaqti qayd qilindi!', 'green', 4000);
    setTimeout(renderHome, 1200);
  } else {
    showToast('❌ ' + (d.error || 'Xato yuz berdi'), 'red');
  }
}

// ===== CAMERA =====
async function openCam(mode) {
  capturedPhoto = null;
  document.getElementById('cameraWrap').classList.add('open');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false
    });
    document.getElementById('videoEl').srcObject = stream;
  } catch(e) {
    closeCam();
    // Kamerasiz davom etish
    if (confirm('Kamera ochilmadi. Fotosiz davom etasizmi?')) {
      await submitCheckin(null);
    }
  }
}

function closeCam() {
  document.getElementById('cameraWrap').classList.remove('open');
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

async function takePhoto() {
  var video  = document.getElementById('videoEl');
  var canvas = document.getElementById('canvasEl');
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  // Mirror effektni bekor qilib saqlaymiz (Face++ uchun to'g'ri rasm kerak)
  var ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  capturedPhoto = canvas.toDataURL('image/jpeg', 0.8);
  closeCam();

  // Checkout mode da submitCheckout ga o'tkazamiz
  if (checkoutMode) {
    checkoutMode = false;
    await submitCheckout(capturedPhoto);
    return;
  }

  // Face verify — qat'iy tekshiruv
  var fvToast = showToast('🔍 Yuz tekshirilmoqda...');
  var fd = await apiFetch('/employee/face-descriptor');
  hideToast(fvToast);

  if (!fd) {
    showToast('❌ Server bilan aloqa yoq'); return;
  }

  // Agar admin rasm yuklamagan bo'lsa — o'tkazib yuborish
  if (!fd.hasPhoto || !fd.faceDescriptor || fd.faceDescriptor.length === 0) {
    await submitCheckin(capturedPhoto);
    return;
  }

  // Modellar yuklanmagan bo'lsa — BLOKLASH (o'tkazib yubormaslik)
  if (!faceModelsLoaded) {
    showToast('⏳ Yuz modeli yuklanmoqda...');
    await loadFaceModels();
    if (!faceModelsLoaded) {
      showToast('❌ Yuz modeli yuklanmadi. Qayta urinib koring.');
      return;
    }
  }

  // Selfie rasmini Image elementga o'tkazamiz
  var selfieImg = new Image();
  selfieImg.src = capturedPhoto;
  await new Promise(function(r){ selfieImg.onload = r; });

  var result = await verifyFace(selfieImg, fd.faceDescriptor);
  console.log('Verify result:', result);

  if (result.skipped) {
    // Descriptor yoq — ruxsat
    await submitCheckin(capturedPhoto);
    return;
  }

  if (!result.match) {
    var pct = result.distance !== undefined ? Math.round((1 - result.distance) * 100) : 0;
    var reason = result.reason || ('Oxshashlik: ' + pct + '%');
    showToast('❌ Yuz tasdiqlanmadi: ' + reason);
    // Rasmni tozalaymiz, qayta suratga tushishga imkon beramiz
    capturedPhoto = null;
    document.getElementById('btnCheckin').style.display = 'block';
    return;
  }

  // ✅ Yuz tasdiqlandi
  var simPct = Math.round((1 - result.distance) * 100);
  showToast('✅ Yuz tasdiqlandi (' + simPct + '% mos)');
  await new Promise(function(r){ setTimeout(r, 800); });
  await submitCheckin(capturedPhoto);
}

async function submitCheckin(photo) {
  var toast = showToast('⏳ Qayd qilinmoqda...');

  // Browser Toshkent vaqtini yuboramiz (server UTC bo'lishi mumkin)
  var now = new Date();
  var clientTimeMinutes = now.getHours() * 60 + now.getMinutes();
  var clientDate = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  var body = {
    lat:               gpsCoords ? gpsCoords.lat : null,
    lng:               gpsCoords ? gpsCoords.lng : null,
    photo:             photo || '',
    clientTimeMinutes: clientTimeMinutes,
    clientDate:        clientDate
  };

  var d = await apiFetch('/employee/checkin', {
    method: 'POST',
    body:   JSON.stringify(body)
  });

  hideToast(toast);

  if (d.ok) {
    var msg = '✅ Keldi vaqti qayd qilindi!';
    if (d.lateMinutes > 0) msg += ' (' + d.lateMinutes + ' daqiqa kechikdingiz)';
    showToast(msg, d.lateMinutes > 0 ? 'yellow' : 'green');
    setTimeout(renderHome, 1000);
  } else {
    alert('❌ ' + (d.error || 'Xato yuz berdi'));
  }
}

// ===================================================
// ===== STATS PAGE ==================================
// ===================================================
async function renderStats() {
  var main = document.getElementById('mainContent');
  main.innerHTML = '<div style="text-align:center;padding:40px 0;color:#475569">Yuklanmoqda...</div>';

  var now   = new Date();
  var month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var d     = await apiFetch('/employee/stats?month=' + month);

  if (!d.ok) { main.innerHTML = '<div style="text-align:center;padding:40px;color:#f87171">Yuklanmadi</div>'; return; }

  var s         = d.stats;
  var last7     = d.last7 || [];
  var monthName = now.toLocaleDateString('uz-UZ', { month:'long', year:'numeric' });
  var pct       = s.workingDaysInMonth > 0 ? Math.min(100, Math.round((s.workedDays / s.workingDaysInMonth) * 100)) : 0;
  var pctColor  = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';

  // Heatmap — oxirgi 7 kun
  var dayNames = ['Ya','Du','Se','Ch','Pa','Ju','Sh'];
  var heatCells = last7.map(function(day) {
    var color = !day.status ? '#0f172a' :
                day.status === 'keldi'  ? '#22c55e' :
                day.status === 'dam'    ? '#a78bfa' :
                day.status === 'kasal'  ? '#60a5fa' : '#ef4444';
    var dt = new Date(day.date + 'T12:00:00');
    var tip = day.checkIn ? (day.checkIn + (day.checkOut ? ' → ' + day.checkOut : '')) : (day.status || '—');
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:3px">' +
      '<div style="font-size:9px;color:#475569">' + dayNames[dt.getDay()] + '</div>' +
      '<div title="' + tip + '" style="width:32px;height:32px;border-radius:6px;background:' + color + '"></div>' +
      '<div style="font-size:8px;color:#475569">' + dt.getDate() + '</div>' +
    '</div>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:16px;text-transform:capitalize">' + monthName + '</div>' +

      // ===== MAOSH KARTA =====
      '<div style="background:linear-gradient(135deg,#1e3a5f,#1a2f4a);border:1px solid rgba(59,130,246,0.3);border-radius:16px;padding:20px;margin-bottom:16px">' +
        '<div style="font-size:11px;color:#64748b;letter-spacing:1px;margin-bottom:8px">BU OY TOPGANINGIZ</div>' +
        '<div style="font-size:36px;font-weight:800;color:#f1f5f9;margin-bottom:4px">' + fmtSalary(s.earnedSalary) + '</div>' +
        '<div style="font-size:12px;color:#64748b">Oylik: ' + fmtSalary(s.salary) + '</div>' +
        '<div style="height:1px;background:rgba(99,179,237,0.15);margin:14px 0"></div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">' +
          '<div style="text-align:center">' +
            '<div style="font-size:16px;font-weight:700;color:#3b82f6">' + s.workingDaysInMonth + '</div>' +
            '<div style="font-size:10px;color:#64748b">Oy ish kuni</div>' +
          '</div>' +
          '<div style="text-align:center;border-left:1px solid rgba(99,179,237,0.15);border-right:1px solid rgba(99,179,237,0.15)">' +
            '<div style="font-size:16px;font-weight:700;color:#22c55e">' + s.workedDays + '</div>' +
            '<div style="font-size:10px;color:#64748b">Kelgan kun</div>' +
          '</div>' +
          '<div style="text-align:center">' +
            '<div style="font-size:16px;font-weight:700;color:#f59e0b">' + fmtSalary(s.dailySalary) + '</div>' +
            '<div style="font-size:10px;color:#64748b">1 kunlik</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // ===== DAVOMAT PROGRESS =====
      '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;padding:16px;margin-bottom:16px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:10px">' +
          '<span style="font-size:13px;color:#94a3b8">Davomat</span>' +
          '<span style="font-size:13px;font-weight:700;color:' + pctColor + '">' + pct + '%</span>' +
        '</div>' +
        '<div style="background:#0f172a;border-radius:99px;height:8px;overflow:hidden;margin-bottom:8px">' +
          '<div style="height:100%;width:' + pct + '%;background:' + pctColor + ';border-radius:99px;transition:width .5s"></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px">' +
          miniStatEmp('⏱', formatMinutes(s.totalMinutes), '#22c55e', 'Jami vaqt') +
          miniStatEmp('⚠️', s.totalLate + ' marta', '#f59e0b', 'Kechikish') +
          miniStatEmp('❌', s.absent + ' kun', '#ef4444', 'Kelmagan') +
        '</div>' +
      '</div>' +

      // ===== HEATMAP =====
      '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;padding:16px;margin-bottom:16px">' +
        '<div style="font-size:11px;font-weight:600;color:#64748b;letter-spacing:1px;margin-bottom:12px">🗓 OXIRGI 7 KUN</div>' +
        '<div style="display:flex;justify-content:space-around">' + heatCells + '</div>' +
        '<div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">' +
          '<span style="font-size:10px;color:#22c55e">● Keldi</span>' +
          '<span style="font-size:10px;color:#ef4444">● Kelmadi</span>' +
          '<span style="font-size:10px;color:#a78bfa">● Dam kuni</span>' +
          '<span style="font-size:10px;color:#60a5fa">● Kasal</span>' +
        '</div>' +
      '</div>' +

      // ===== OVERTIME =====
      (s.overtimeMin > 0 ?
        '<div style="background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);border-radius:12px;padding:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
            '<div style="font-size:13px;font-weight:600;color:#a78bfa">💪 Qo\'shimcha ish</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:2px">Dam kunlari ishlagan vaqt</div>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:700;color:#a78bfa">' + formatMinutes(s.overtimeMin) + '</div>' +
        '</div>'
      : '') +

    '</div>';
}

function miniStatEmp(icon, val, color, label) {
  return '<div style="background:#0f172a;border-radius:8px;padding:8px;text-align:center">' +
    '<div style="font-size:13px">' + icon + '</div>' +
    '<div style="font-size:12px;font-weight:600;color:' + color + ';margin-top:2px">' + val + '</div>' +
    '<div style="font-size:10px;color:#475569;margin-top:1px">' + label + '</div>' +
  '</div>';
}

function statBox(icon, label, value, color) {
  return '<div class="stat-box">' +
    '<div style="font-size:24px;margin-bottom:6px">' + icon + '</div>' +
    '<div style="font-size:11px;color:#64748b;margin-bottom:4px">' + label + '</div>' +
    '<div style="font-size:20px;font-weight:700;color:' + color + '">' + value + '</div>' +
  '</div>';
}

// ===================================================
// ===== HISTORY PAGE ================================
// ===================================================
async function renderHistory() {
  var main = document.getElementById('mainContent');
  main.innerHTML = '<div style="text-align:center;padding:40px 0;color:#475569">Yuklanmoqda...</div>';

  var now   = new Date();
  var month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var d     = await apiFetch('/employee/stats?month=' + month);

  if (!d.ok) { main.innerHTML = '<div style="text-align:center;padding:40px;color:#f87171">Yuklanmadi</div>'; return; }

  var records = d.records || [];

  if (!records.length) {
    main.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#475569">' +
      '<div style="font-size:40px;margin-bottom:12px">📅</div>' +
      '<div>Bu oy uchun ma\'lumot yo\'q</div>' +
    '</div>';
    return;
  }

  var rows = records.slice().reverse().map(rec => {
    // Status rang va matn
    var statusColor, statusText;
    if (rec.status === 'keldi')  { statusColor = '#22c55e'; statusText = 'Keldi'; }
    else if (rec.status === 'dam')   { statusColor = '#a78bfa'; statusText = 'Dam kuni'; }
    else if (rec.status === 'kasal') { statusColor = '#60a5fa'; statusText = 'Kasal'; }
    else if (rec.status === 'tatil') { statusColor = '#f59e0b'; statusText = 'Ta\'til'; }
    else { statusColor = '#ef4444'; statusText = 'Kelmadi'; }

    // Kechikish badge
    var lateTag = rec.lateMinutes > 0
      ? '<span style="font-size:10px;background:rgba(245,158,11,0.15);color:#f59e0b;padding:2px 7px;border-radius:99px;margin-left:6px">' + rec.lateMinutes + ' min kech</span>'
      : '';

    // Dam kuni + kelgan bo'lsa — qo'shimcha ish badge
    var otTag = rec.isWeeklyOff && rec.checkIn
      ? '<span style="font-size:10px;background:rgba(167,139,250,0.15);color:#a78bfa;padding:2px 7px;border-radius:99px;margin-left:6px">+ish</span>'
      : '';

    var dateObj  = new Date(rec.date + 'T12:00:00');
    var dateDisp = dateObj.toLocaleDateString('uz-UZ', { day:'numeric', month:'short', weekday:'short' });

    // Vaqt qatori
    var timeRow = '';
    if (rec.checkIn) {
      timeRow = rec.checkIn + ' → ' + (rec.checkOut || 'davom etmoqda');
      if (rec.totalMinutes) timeRow += '  <span style="color:#22c55e">(' + formatMinutes(rec.totalMinutes) + ')</span>';
    }

    // Dam kuni ishlagan bo'lsa — overtime
    var otRow = rec.isWeeklyOff && rec.overtimeMinutes
      ? '<div style="font-size:11px;color:#a78bfa;margin-top:2px">Qo\'shimcha ish: ' + formatMinutes(rec.overtimeMinutes) + '</div>'
      : '';

    return '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.1);border-radius:10px;padding:12px 14px;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600;color:#f1f5f9">' + dateDisp + lateTag + otTag + '</div>' +
          (timeRow ? '<div style="font-size:12px;color:#64748b;margin-top:4px">' + timeRow + '</div>' : '') +
          otRow +
        '</div>' +
        '<span style="font-size:12px;font-weight:600;color:' + statusColor + ';margin-left:8px;white-space:nowrap">' + statusText + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:16px">Bu oylik tarix</div>' +
      '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;padding:0 16px">' +
        rows +
      '</div>' +
    '</div>';
}

// ===================================================
// ===== HELPERS =====================================
// ===================================================
function fmtSalary(n) {
  if (!n) return '0';
  return Number(n).toLocaleString('uz-UZ') + ' so\'m';
}

function formatMinutes(mins) {
  if (!mins || mins <= 0) return '—';
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  if (h > 0 && m > 0) return h + ' soat ' + m + ' min';
  if (h > 0) return h + ' soat';
  return m + ' min';
}

function getWorkedMinutes(checkIn) {
  if (!checkIn) return 0;
  var now = new Date();
  var [h, m] = checkIn.split(':').map(Number);
  return (now.getHours() * 60 + now.getMinutes()) - (h * 60 + m);
}

// Toast xabarlari

function showBlockedScreen(reason) {
  var old = document.getElementById('blockedScreen');
  if (old) old.remove();

  // Barcha sahifalarni yashiramiz
  ['loginPage','appPage','cameraWrap'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  var el = document.createElement('div');
  el.id = 'blockedScreen';
  el.style.cssText = 'position:fixed;inset:0;background:#0a0f1e;display:flex;align-items:center;justify-content:center;z-index:9999;padding:24px';
  el.innerHTML =
    '<div style="max-width:360px;width:100%;text-align:center">' +
      '<div style="font-size:64px;margin-bottom:16px">🔒</div>' +
      '<div style="font-size:20px;font-weight:700;color:#f1f5f9;margin-bottom:12px">Xizmat to\'xtatilgan</div>' +
      '<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:16px;margin-bottom:24px">' +
        '<div style="font-size:13px;color:#fca5a5;line-height:1.6">' + (reason || "Restoran vaqtincha bloklangan") + '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:#475569">Muammo yechilishi uchun rahbariyat bilan bog\'laning</div>' +
    '</div>';
  document.body.appendChild(el);
}

function showToast(msg, type, duration) {
  // Avvalgi toastlarni tozalaymiz
  document.querySelectorAll('.app-toast').forEach(function(t) { t.remove(); });

  var bg = type === 'green'  ? 'rgba(34,197,94,0.18)'   :
           type === 'yellow' ? 'rgba(245,158,11,0.18)'  :
           type === 'red'    ? 'rgba(239,68,68,0.18)'   :
                               'rgba(59,130,246,0.18)';
  var bc = type === 'green'  ? 'rgba(34,197,94,0.4)'    :
           type === 'yellow' ? 'rgba(245,158,11,0.4)'   :
           type === 'red'    ? 'rgba(239,68,68,0.4)'    :
                               'rgba(59,130,246,0.4)';
  var tc = type === 'green'  ? '#4ade80' :
           type === 'yellow' ? '#fbbf24' :
           type === 'red'    ? '#f87171' :
                               '#93c5fd';

  var el = document.createElement('div');
  el.className = 'app-toast';
  el.style.cssText = [
    'position:fixed',
    'bottom:90px',
    'left:50%',
    'transform:translateX(-50%)',
    'background:' + bg,
    'border:1px solid ' + bc,
    'color:' + tc,
    'padding:12px 24px',
    'border-radius:99px',
    'font-size:13px',
    'font-weight:600',
    'z-index:9999',
    'white-space:nowrap',
    'font-family:Inter,sans-serif',
    'box-shadow:0 4px 20px rgba(0,0,0,0.3)',
    'transition:opacity 0.3s',
    'max-width:90vw',
    'text-align:center'
  ].join(';');
  el.textContent = msg;
  document.body.appendChild(el);

  // Auto-hide (default 3 soniya, green/yellow 4 soniya)
  var ms = duration || (type === 'green' || type === 'yellow' ? 4000 : 3000);
  setTimeout(function() {
    el.style.opacity = '0';
    setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
  }, ms);

  return el;
}

function hideToast(el) {
  if (el && el.parentNode) {
    el.style.opacity = '0';
    setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
  }
}