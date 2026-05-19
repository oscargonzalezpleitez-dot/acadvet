// =============================================================================
// AcadVet USAM — Módulo de Sesión QR (T20)
// Genera QR rotante, escucha asistentes en tiempo real desde el panel profesor
// =============================================================================

import { createQRSession, updateQRSession, listenQRAsistentes } from './db.js';
import { showToast } from './ui.js';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _s = null;
// _s = { id, materiaId, alumnos, token, duration, intervalId, unsubscribe, rotatedAt }

const CIRC = 276.5; // 2π × r(44) para el anillo SVG

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export async function openQRSession(materia, alumnos) {
  if (_s) return;

  const token    = genToken();
  const duration = 120_000; // 2 min por defecto

  let sessionId;
  try {
    sessionId = await createQRSession({
      materiaId:     materia.id,
      materiaNombre: materia.nombre,
      ciclo:         materia.ciclo ?? '',
      token,
      duration,
    });
  } catch {
    showToast('No se pudo crear la sesión QR. Verificá tu conexión.', 'error');
    return;
  }

  _s = { id: sessionId, materiaId: materia.id, alumnos, token, duration,
         intervalId: null, unsubscribe: null, rotatedAt: Date.now() };

  buildOverlay(materia);
  drawQR();
  startCountdown();
  watchAttendees();
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function buildOverlay(materia) {
  const div = document.createElement('div');
  div.id = 'qrOverlay';
  div.className = 'qr-overlay';
  div.innerHTML = `
    <div class="qr-panel-left">
      <div class="qr-panel-header">
        <div>
          <div class="qr-session-label">SESIÓN QR ACTIVA</div>
          <div class="qr-session-materia">${esc(materia.nombre)}</div>
          <div class="text-sm text-muted">${esc(materia.ciclo ?? '')} · ${today()}</div>
        </div>
        <button id="qrClose" class="btn btn--ghost btn--sm" aria-label="Detener sesión">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="qr-code-wrap">
        <div id="qrCode"></div>
      </div>

      <div>
        <div class="qr-code-sublabel">CÓDIGO DE SESIÓN</div>
        <div class="qr-token-display" id="qrToken">${_s.token}</div>
      </div>

      <div class="qr-timer-wrap">
        <svg viewBox="0 0 100 100" width="56" height="56" style="flex-shrink:0">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-surface-2)" stroke-width="9"/>
          <circle id="qrRing" cx="50" cy="50" r="44" fill="none"
            stroke="var(--color-primary)" stroke-width="9"
            stroke-dasharray="${CIRC}" stroke-dashoffset="0"
            stroke-linecap="round" transform="rotate(-90 50 50)"
            style="transition:stroke-dashoffset .95s linear"/>
        </svg>
        <div>
          <div class="qr-timer-text" id="qrTimerText">2:00</div>
          <div class="text-xs text-muted" style="text-align:center">próxima rotación</div>
        </div>
      </div>

      <div>
        <div class="qr-code-sublabel" style="margin-bottom:6px">DURACIÓN DEL TOKEN</div>
        <div class="qr-duration-btns">
          ${[1, 2, 3, 5].map(m =>
            `<button class="qr-duration-btn${m === 2 ? ' active' : ''}" data-min="${m}">${m} min</button>`
          ).join('')}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:auto">
        <button class="btn btn--secondary btn--sm" id="qrRotate">⟳ Rotar token ahora</button>
        <button class="btn btn--secondary btn--sm" id="qrProyect">📽 Abrir proyector</button>
        <button class="btn btn--sm" id="qrStop"
          style="background:var(--color-danger);color:#fff;border-color:transparent">
          ■ Detener sesión
        </button>
      </div>
    </div>

    <div class="qr-panel-right">
      <div class="qr-stats-row">
        <div>
          <div class="qr-counter" id="qrCount">0</div>
          <div class="qr-counter-label">presentes</div>
        </div>
        <div class="qr-stats-bar"></div>
      </div>
      <div class="qr-attendee-list" id="qrAttendeeList">
        <div class="empty-state" style="padding:var(--space-8)">
          <div class="empty-state__icon" style="font-size:2.5rem">📱</div>
          <p class="empty-state__text">Esperando que los alumnos escaneen el QR…</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  wireEvents();
}

function wireEvents() {
  document.getElementById('qrClose')?.addEventListener('click', confirmStop);
  document.getElementById('qrStop')?.addEventListener('click', confirmStop);
  document.getElementById('qrRotate')?.addEventListener('click', () => rotateToken());
  document.getElementById('qrProyect')?.addEventListener('click', () => {
    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    window.open(`${base}proyector.html?s=${_s.id}`, '_blank');
  });

  document.querySelectorAll('.qr-duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.min, 10);
      _s.duration = mins * 60_000;
      updateQRSession(_s.id, { duration: _s.duration }).catch(() => {});
      document.querySelectorAll('.qr-duration-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rotateToken();
    });
  });
}

function confirmStop() {
  if (confirm('¿Detener la sesión QR? Los alumnos ya no podrán registrarse.')) {
    stopSession();
  }
}

// ---------------------------------------------------------------------------
// QR Code
// ---------------------------------------------------------------------------

async function drawQR() {
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
    const container = document.getElementById('qrCode');
    if (!container) return;
    container.innerHTML = '';
    new QRCode(container, {
      text:         getRegistroUrl(),
      width:        220,
      height:       220,
      colorDark:    '#1A1A2E',
      colorLight:   '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch {
    const c = document.getElementById('qrCode');
    if (c) c.innerHTML = `<p class="text-sm text-muted" style="text-align:center;padding:var(--space-4)">Error cargando QR.<br>Verificá tu conexión.</p>`;
  }
}

function getRegistroUrl() {
  const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
  return `${base}registro.html?s=${_s.id}&tk=${encodeURIComponent(_s.token)}`;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

function genToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = n => Array.from({ length: n }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `${seg(3)}-${seg(3)}`;
}

async function rotateToken() {
  if (!_s) return;
  const newToken = genToken();
  _s.token = newToken;
  _s.rotatedAt = Date.now();

  await updateQRSession(_s.id, { token: newToken, rotatedAt: _s.rotatedAt }).catch(() => {});

  const el = document.getElementById('qrToken');
  if (el) el.textContent = newToken;

  clearInterval(_s.intervalId);
  startCountdown();
  drawQR();
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

function startCountdown() {
  _s.rotatedAt = Date.now();

  const tick = () => {
    if (!_s) return;
    const elapsed   = Date.now() - _s.rotatedAt;
    const remaining = Math.max(0, _s.duration - elapsed);
    updateTimerDisplay(remaining);
    updateRing(remaining / _s.duration);
    if (remaining === 0) {
      clearInterval(_s.intervalId);
      rotateToken();
    }
  };

  tick();
  _s.intervalId = setInterval(tick, 1000);
}

function updateTimerDisplay(ms) {
  const el = document.getElementById('qrTimerText');
  if (!el) return;
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

function updateRing(pct) {
  const ring = document.getElementById('qrRing');
  if (ring) ring.style.strokeDashoffset = String(CIRC * (1 - pct));
}

// ---------------------------------------------------------------------------
// Asistentes en tiempo real
// ---------------------------------------------------------------------------

function watchAttendees() {
  _s.unsubscribe = listenQRAsistentes(_s.id, renderAttendees);
}

function renderAttendees(asistentes) {
  const countEl = document.getElementById('qrCount');
  const listEl  = document.getElementById('qrAttendeeList');
  if (!countEl || !listEl) return;

  const sorted = [...asistentes].sort((a, b) => b.ts - a.ts);
  countEl.textContent = String(sorted.length);

  if (sorted.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding:var(--space-8)">
        <div class="empty-state__icon" style="font-size:2.5rem">📱</div>
        <p class="empty-state__text">Esperando que los alumnos escaneen el QR…</p>
      </div>`;
    return;
  }

  listEl.innerHTML = sorted.map((a, i) => {
    const matched = !!a.alumnoId;
    const hora = new Date(a.ts).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="qr-attendee-row">
        <div class="qr-attendee-num">${sorted.length - i}</div>
        <div class="qr-attendee-info">
          <div class="qr-attendee-name">${esc(a.nombre)}</div>
          <div class="qr-attendee-carnet">Carné ${esc(a.carnet)} · ${hora}</div>
        </div>
        <span class="qr-attendee-badge ${matched ? 'qr-attendee-badge--ok' : 'qr-attendee-badge--warn'}">
          ${matched ? '✓ Inscrito' : '⚠ No encontrado'}
        </span>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Detener sesión
// ---------------------------------------------------------------------------

async function stopSession() {
  if (!_s) return;
  clearInterval(_s.intervalId);
  if (_s.unsubscribe) _s.unsubscribe();
  await updateQRSession(_s.id, { active: false, stoppedAt: Date.now() }).catch(() => {});
  document.getElementById('qrOverlay')?.remove();
  showToast('Sesión QR finalizada');
  _s = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
