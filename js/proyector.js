// =============================================================================
// AcadVet USAM — Vista Proyector QR (T23)
// Pantalla de solo lectura optimizada para proyectar en el aula.
// Se actualiza en tiempo real desde Firebase.
// =============================================================================

import { getDatabase, ref, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const db = getDatabase(app);

const params    = new URLSearchParams(window.location.search);
const sessionId = params.get('s') ?? '';

const CIRC = 276.5;

let _session      = null;
let _timerInterval = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
if (!sessionId) {
  showError('URL inválida. Abrí el proyector desde el panel de Sesión QR.');
} else {
  connect();
}

async function connect() {
  // Escuchar cambios de la sesión (token, duración, estado)
  onValue(ref(db, `qr_sessions/${sessionId}`), snap => {
    if (!snap.exists()) return showError('La sesión no existe.');
    const data = snap.val();
    if (!data.active) return showError('La sesión ha finalizado.');

    const tokenChanged = _session && _session.token !== data.token;
    _session = data;

    showMain();
    updateHeader(data);
    updateToken(data.token);

    if (!_timerInterval || tokenChanged) {
      clearInterval(_timerInterval);
      startTimer();
    }

    if (tokenChanged) drawQR(data.token);
    else if (!document.getElementById('proyQR')?.firstChild) drawQR(data.token);
  });

  // Escuchar asistentes en tiempo real
  onValue(ref(db, `qr_sessions/${sessionId}/asistentes`), snap => {
    const list = !snap.exists() ? [] :
      Object.values(snap.val()).sort((a, b) => b.ts - a.ts);
    updateCounter(list);
  });
}

// ---------------------------------------------------------------------------
// QR
// ---------------------------------------------------------------------------
async function drawQR(token) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
  const container = document.getElementById('proyQR');
  if (!container) return;
  container.innerHTML = '';
  const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  new QRCode(container, {
    text:         `${base}registro.html?s=${sessionId}&tk=${encodeURIComponent(token)}`,
    width:        260,
    height:       260,
    colorDark:    '#1A1A2E',
    colorLight:   '#FFFFFF',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------
function startTimer() {
  const tick = () => {
    if (!_session) return;
    const elapsed   = Date.now() - (_session.rotatedAt ?? Date.now());
    const remaining = Math.max(0, (_session.duration ?? 120_000) - elapsed);
    const pct       = remaining / (_session.duration ?? 120_000);

    const totalSec = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;

    const timerEl = document.getElementById('proyTimer');
    const ringEl  = document.getElementById('proyRing');
    if (timerEl) timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    if (ringEl)  ringEl.style.strokeDashoffset = String(CIRC * (1 - pct));
  };

  tick();
  _timerInterval = setInterval(tick, 1000);
}

// ---------------------------------------------------------------------------
// UI updates
// ---------------------------------------------------------------------------
function updateHeader(data) {
  const mat   = document.getElementById('proyMateria');
  const fecha = document.getElementById('proyFecha');
  if (mat)   mat.textContent   = [data.materiaNombre, data.ciclo].filter(Boolean).join(' · ');
  if (fecha) fecha.textContent = data.fecha ?? '';

  const dot  = document.getElementById('proyDot');
  const txt  = document.getElementById('proyStatusTxt');
  if (dot) dot.style.background = '#00B894';
  if (txt) txt.textContent = 'Sesión activa';
}

function updateToken(token) {
  const el = document.getElementById('proyToken');
  if (el) el.textContent = token ?? '—';
}

function updateCounter(list) {
  const countEl = document.getElementById('proyCount');
  const lastEl  = document.getElementById('proyLast');
  if (countEl) countEl.textContent = String(list.length);
  if (lastEl && list.length > 0) {
    const last = list[0];
    const hora = new Date(last.ts).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    lastEl.textContent = `Último: ${last.nombre ?? ''} · ${hora}`;
  }
}

function showMain() {
  document.getElementById('mainLoading').style.display = 'none';
  document.getElementById('mainError').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'grid';
}

function showError(msg) {
  document.getElementById('mainLoading').style.display = 'none';
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('errTxt').textContent = msg;
  document.getElementById('mainError').style.display   = 'flex';
  const dot = document.getElementById('proyDot');
  const txt = document.getElementById('proyStatusTxt');
  if (dot) dot.style.background = '#FF6B6B';
  if (txt) txt.textContent = 'Sesión no disponible';
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
    document.head.appendChild(s);
  });
}
