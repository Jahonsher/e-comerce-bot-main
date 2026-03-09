// ===== FACE-API INIT =====
var faceModelsLoaded = false;
var FACE_MODELS_URL  = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

async function loadFaceModels() {
  if (faceModelsLoaded || typeof faceapi === 'undefined') return;
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL)
    ]);
    faceModelsLoaded = true;
    console.log('Face models yuklandi');
  } catch(e) {
    console.log('Face models yuklanmadi (offline?):', e.message);
  }
}

// Selfie + etalon rasmni taqqoslash
// etalonDescriptor — server dan kelgan 128-element array
// selfieEl — video yoki canvas element
// return: { match: true/false, distance: 0.0-1.0 }
async function verifyFace(selfieEl, etalonDescriptor) {
  if (!etalonDescriptor || etalonDescriptor.length === 0) {
    return { match: true, skipped: true, reason: 'descriptor yoq' };
  }
  if (!faceModelsLoaded) {
    return { match: false, skipped: false, reason: 'Yuz modellari yuklanmagan' };
  }
  try {
    var opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
    // withFaceLandmarks() — parametrsiz (tiny model)
    var det = await faceapi.detectSingleFace(selfieEl, opts)
                           .withFaceLandmarks()
                           .withFaceDescriptor();
    if (!det) {
      return { match: false, skipped: false, reason: 'Selfida yuz topilmadi' };
    }
    var dist = faceapi.euclideanDistance(etalonDescriptor, Array.from(det.descriptor));
    console.log('Face distance:', dist);
    // 0.4 dan kichik — bir xil odam; 0.4-0.6 — shubhali; 0.6+ — boshqa odam
    return { match: dist < 0.45, distance: Math.round(dist * 100) / 100 };
  } catch(e) {
    console.error('Face verify error:', e);
    return { match: false, skipped: false, reason: e.message };
  }
}

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
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display   = 'block';
  document.getElementById('headerName').textContent     = empInfo.name || '—';
  document.getElementById('headerPosition').textContent = empInfo.position || 'Ishchi';
  showPage('home', document.querySelector('[data-page="home"]'));
  // Background da face models yuklash
  loadFaceModels();
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
  if (todayAtt?.checkIn) {
    var mins = todayAtt.totalMinutes || getWorkedMinutes(todayAtt.checkIn);
    workedText = formatMinutes(mins);
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
  if (!confirm('Ishni tugatmoqchimisiz?')) return;
  var btn = document.querySelector('.checkin-btn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  var d = await apiFetch('/employee/checkout', { method: 'POST', body: JSON.stringify({}) });
  if (d.ok) {
    showToast('✅ Ketdi vaqti qayd qilindi!', 'green');
    setTimeout(renderHome, 1000);
  } else {
    alert('Xato: ' + (d.error || 'Nomalum xato'));
    if (btn) { btn.disabled = false; }
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
  canvas.getContext('2d').drawImage(video, 0, 0);
  capturedPhoto = canvas.toDataURL('image/jpeg', 0.6);
  closeCam();

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

  var now    = new Date();
  var month  = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var d      = await apiFetch('/employee/stats?month=' + month);

  if (!d.ok) { main.innerHTML = '<div style="text-align:center;padding:40px;color:#f87171">Yuklanmadi</div>'; return; }

  var s = d.stats;
  var monthName = now.toLocaleDateString('uz-UZ', { month:'long', year:'numeric' });

  main.innerHTML =
    '<div class="fade-up">' +
      '<div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:16px;text-transform:capitalize">' + monthName + '</div>' +

      // Stats grid
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">' +
        statBox('📅', 'Ish kunlari', s.totalDays + ' kun', '#3b82f6') +
        statBox('⏱', 'Jami vaqt', formatMinutes(s.totalMinutes), '#22c55e') +
        statBox('⚠️', 'Kechikishlar', s.totalLate + ' marta', '#f59e0b') +
        statBox('❌', 'Kelmagan kun', s.absent + ' kun', '#ef4444') +
      '</div>' +

      // Progress bar
      (function() {
        var workDays = 26;
        var pct = Math.min(100, Math.round((s.totalDays / workDays) * 100));
        return '<div style="background:#1e293b;border:1px solid rgba(99,179,237,0.12);border-radius:12px;padding:16px;margin-bottom:20px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
            '<span style="font-size:13px;color:#94a3b8">Oylik davomi</span>' +
            '<span style="font-size:13px;font-weight:600;color:#f1f5f9">' + s.totalDays + ' / ' + workDays + ' kun</span>' +
          '</div>' +
          '<div style="background:#0f172a;border-radius:99px;height:8px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#3b82f6,#22c55e);border-radius:99px;transition:width .5s"></div>' +
          '</div>' +
        '</div>';
      })() +

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
    var statusColor = rec.status === 'keldi' ? '#22c55e' : '#ef4444';
    var statusText  = rec.status === 'keldi' ? 'Keldi' : (rec.status === 'kasal' ? 'Kasal' : (rec.status === 'tatil' ? 'Ta\'til' : 'Kelmadi'));
    var lateTag = rec.lateMinutes > 0
      ? '<span style="font-size:10px;background:rgba(245,158,11,0.15);color:#f59e0b;padding:2px 7px;border-radius:99px;margin-left:6px">' + rec.lateMinutes + ' min kech</span>'
      : '';
    var dateObj  = new Date(rec.date);
    var dateDisp = dateObj.toLocaleDateString('uz-UZ', { day:'numeric', month:'short', weekday:'short' });

    return '<div class="record-row">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:600;color:#f1f5f9">' + dateDisp + lateTag + '</div>' +
        '<div style="font-size:12px;color:#64748b;margin-top:2px">' +
          (rec.checkIn || '—') + ' → ' + (rec.checkOut || '—') +
          (rec.totalMinutes ? ' &nbsp;·&nbsp; ' + formatMinutes(rec.totalMinutes) : '') +
        '</div>' +
      '</div>' +
      '<span style="font-size:12px;font-weight:600;color:' + statusColor + '">' + statusText + '</span>' +
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
function formatMinutes(mins) {
  if (!mins) return '0 min';
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  if (h > 0) return h + ' soat ' + (m > 0 ? m + ' min' : '');
  return m + ' min';
}

function getWorkedMinutes(checkIn) {
  if (!checkIn) return 0;
  var now = new Date();
  var [h, m] = checkIn.split(':').map(Number);
  return (now.getHours() * 60 + now.getMinutes()) - (h * 60 + m);
}

// Toast xabarlari
function showToast(msg, type) {
  var el = document.createElement('div');
  var bg = type === 'green' ? 'rgba(34,197,94,0.15)' : (type === 'yellow' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)');
  var bc = type === 'green' ? 'rgba(34,197,94,0.3)'  : (type === 'yellow' ? 'rgba(245,158,11,0.3)'  : 'rgba(59,130,246,0.3)');
  var tc = type === 'green' ? '#4ade80'               : (type === 'yellow' ? '#fbbf24'               : '#93c5fd');
  el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:' + bg + ';border:1px solid ' + bc + ';color:' + tc + ';padding:10px 20px;border-radius:99px;font-size:13px;font-weight:500;z-index:999;white-space:nowrap;font-family:Inter,sans-serif';
  el.textContent = msg;
  document.body.appendChild(el);
  return el;
}

function hideToast(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}