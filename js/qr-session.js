// =============================================================================
// AcadVet USAM — Módulo de Sesión QR (T20 + features: foto, dispositivo,
//   tardíos, correo institucional, GPS)
// =============================================================================

import { createQRSession, updateQRSession, listenQRAsistentes } from './db.js';
import { showToast } from './ui.js';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _s = null;
// _s = { id, materiaId, alumnos, token, duration, intervalId, unsubscribe,
//         rotatedAt, config: { photoRequired, onceDevice, markLate, lateMinutes,
//           requireUsamEmail, requireGeo, geoRadius, aulaLat, aulaLng, sessionStartedAt } }

const CIRC    = 276.5; // 2π × r(44) para el anillo SVG
const CFG_KEY = 'acadvet_qr_config';

// ---------------------------------------------------------------------------
// Persistencia de configuración (localStorage ↔ Firebase)
// ---------------------------------------------------------------------------
function loadStoredConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) ?? '{}'); } catch { return {}; }
}

function saveConfigToStorage() {
  if (!_s) return;
  try { localStorage.setItem(CFG_KEY, JSON.stringify(_s.config)); } catch {}
}

async function pushConfig() {
  if (!_s) return;
  saveConfigToStorage();
  await updateQRSession(_s.id, { config: _s.config }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------
export async function openQRSession(materia, alumnos) {
  if (_s) return;

  const token    = genToken();
  const duration = 120_000;
  const now      = Date.now();

  const stored = loadStoredConfig();
  const config = {
    photoRequired:    stored.photoRequired    ?? false,
    onceDevice:       stored.onceDevice       ?? false,
    markLate:         stored.markLate         ?? false,
    lateMinutes:      stored.lateMinutes      ?? 10,
    requireUsamEmail: stored.requireUsamEmail ?? false,
    requireGeo:       stored.requireGeo       ?? false,
    geoRadius:        stored.geoRadius        ?? 100,
    aulaLat:          stored.aulaLat          ?? null,
    aulaLng:          stored.aulaLng          ?? null,
    checkType:        stored.checkType        ?? 'unico',
    sessionStartedAt: now,
  };

  let sessionId;
  try {
    sessionId = await createQRSession({
      materiaId:     materia.id,
      materiaNombre: materia.nombre,
      ciclo:         materia.ciclo ?? '',
      token,
      duration,
      config,
    });
  } catch {
    showToast('No se pudo crear la sesión QR. Verificá tu conexión.', 'error');
    return;
  }

  _s = { id: sessionId, materiaId: materia.id, alumnos, token, duration,
         intervalId: null, unsubscribe: null, rotatedAt: now, config };

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
  const c = _s.config;

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

      <!-- ── Tipo de registro ── -->
      <div class="qr-config-section">
        <div class="qr-config-title">Tipo de registro</div>
        <div class="qr-checktype-btns">
          <button class="qr-checktype-btn${c.checkType !== 'inicio' && c.checkType !== 'fin' ? ' active' : ''}" data-ct="unico">✅ Único</button>
          <button class="qr-checktype-btn${c.checkType === 'inicio' ? ' active' : ''}" data-ct="inicio">🟢 Inicio</button>
          <button class="qr-checktype-btn${c.checkType === 'fin' ? ' active' : ''}" data-ct="fin">🔴 Fin</button>
        </div>
      </div>

      <!-- ── Configuración de sesión ── -->
      <div class="qr-config-section">
        <div class="qr-config-title">Configuración</div>

        <label class="qr-toggle-row">
          <span class="qr-toggle-label">📷 Foto obligatoria</span>
          <input type="checkbox" id="cfgPhoto" class="qr-toggle-check" ${c.photoRequired ? 'checked' : ''}>
        </label>

        <label class="qr-toggle-row">
          <span class="qr-toggle-label">📱 Un dispositivo = un alumno</span>
          <input type="checkbox" id="cfgDevice" class="qr-toggle-check" ${c.onceDevice ? 'checked' : ''}>
        </label>

        <label class="qr-toggle-row">
          <span class="qr-toggle-label">⏱ Marcar tardíos</span>
          <input type="checkbox" id="cfgLate" class="qr-toggle-check" ${c.markLate ? 'checked' : ''}>
        </label>
        <div id="cfgLateOpts" class="qr-config-sub${c.markLate ? '' : ' hidden'}">
          <input type="number" id="cfgLateMin" value="${c.lateMinutes}" min="1" max="60" class="qr-mini-input">
          <span class="text-xs text-muted">min de gracia</span>
        </div>

        <label class="qr-toggle-row">
          <span class="qr-toggle-label">✉️ Solo @usam.edu.sv</span>
          <input type="checkbox" id="cfgEmail" class="qr-toggle-check" ${c.requireUsamEmail ? 'checked' : ''}>
        </label>

        <label class="qr-toggle-row">
          <span class="qr-toggle-label">📍 Verificar GPS</span>
          <input type="checkbox" id="cfgGeo" class="qr-toggle-check" ${c.requireGeo ? 'checked' : ''}>
        </label>
        <div id="cfgGeoOpts" class="qr-config-sub${c.requireGeo ? '' : ' hidden'}">
          <div class="qr-duration-btns" style="margin-bottom:var(--space-2)">
            ${[50, 100, 200, 500].map(r =>
              `<button class="qr-duration-btn${r === (c.geoRadius ?? 100) ? ' active' : ''}" data-radius="${r}">${r}m</button>`
            ).join('')}
          </div>
          <button class="btn btn--ghost btn--sm" id="qrGeoCapture" style="width:100%">
            📍 Capturar mi ubicación
          </button>
          <div id="qrGeoStatus" class="text-xs text-muted" style="text-align:center;margin-top:var(--space-1)">
            ${c.aulaLat != null ? `Lat: ${c.aulaLat.toFixed(5)}, Lng: ${c.aulaLng.toFixed(5)}` : 'Sin ubicación capturada'}
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:auto;padding-top:var(--space-3)">
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
        <div id="qrTardioWrap" style="display:${c.markLate ? 'flex' : 'none'};flex-direction:column;align-items:center">
          <div class="qr-tardio-count" id="qrTardioCount">0</div>
          <div class="qr-counter-label" style="font-size:.8rem;color:#FDCB6E">tardíos</div>
        </div>
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

  document.querySelectorAll('.qr-duration-btn[data-min]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.min, 10);
      _s.duration = mins * 60_000;
      updateQRSession(_s.id, { duration: _s.duration }).catch(() => {});
      document.querySelectorAll('.qr-duration-btn[data-min]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rotateToken();
    });
  });

  // ── Config toggles ───────────────────────────────────────────────────────
  document.getElementById('cfgPhoto')?.addEventListener('change', e => {
    _s.config.photoRequired = e.target.checked;
    pushConfig();
  });

  document.getElementById('cfgDevice')?.addEventListener('change', e => {
    _s.config.onceDevice = e.target.checked;
    pushConfig();
  });

  document.getElementById('cfgLate')?.addEventListener('change', e => {
    _s.config.markLate = e.target.checked;
    document.getElementById('cfgLateOpts')?.classList.toggle('hidden', !e.target.checked);
    const wrap = document.getElementById('qrTardioWrap');
    if (wrap) wrap.style.display = e.target.checked ? 'flex' : 'none';
    pushConfig();
  });

  document.getElementById('cfgLateMin')?.addEventListener('change', e => {
    _s.config.lateMinutes = parseInt(e.target.value, 10) || 10;
    pushConfig();
  });

  document.getElementById('cfgEmail')?.addEventListener('change', e => {
    _s.config.requireUsamEmail = e.target.checked;
    pushConfig();
  });

  document.getElementById('cfgGeo')?.addEventListener('change', e => {
    _s.config.requireGeo = e.target.checked;
    document.getElementById('cfgGeoOpts')?.classList.toggle('hidden', !e.target.checked);
    pushConfig();
  });

  // GPS radius buttons
  document.querySelectorAll('.qr-duration-btn[data-radius]').forEach(btn => {
    btn.addEventListener('click', () => {
      _s.config.geoRadius = parseInt(btn.dataset.radius, 10);
      document.querySelectorAll('.qr-duration-btn[data-radius]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pushConfig();
    });
  });

  // Check type selector
  document.querySelectorAll('.qr-checktype-btn[data-ct]').forEach(btn => {
    btn.addEventListener('click', () => {
      _s.config.checkType = btn.dataset.ct;
      document.querySelectorAll('.qr-checktype-btn[data-ct]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pushConfig();
    });
  });

  // GPS capture button
  document.getElementById('qrGeoCapture')?.addEventListener('click', () => {
    const btn    = document.getElementById('qrGeoCapture');
    const status = document.getElementById('qrGeoStatus');
    btn.disabled = true;
    btn.textContent = 'Obteniendo…';
    navigator.geolocation.getCurrentPosition(
      async pos => {
        _s.config.aulaLat = pos.coords.latitude;
        _s.config.aulaLng = pos.coords.longitude;
        await pushConfig();
        btn.disabled = false;
        btn.textContent = '✓ Ubicación capturada';
        if (status) status.textContent = `Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)}`;
      },
      err => {
        btn.disabled = false;
        btn.textContent = '📍 Capturar mi ubicación';
        if (status) status.textContent = 'Error: ' + err.message;
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
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
  const countEl  = document.getElementById('qrCount');
  const tardioEl = document.getElementById('qrTardioCount');
  const listEl   = document.getElementById('qrAttendeeList');
  if (!countEl || !listEl) return;

  const sorted  = [...asistentes].sort((a, b) => b.ts - a.ts);
  const tardios = sorted.filter(a => a.estado === 'tardio').length;
  countEl.textContent  = String(sorted.length);
  if (tardioEl) tardioEl.textContent = String(tardios);

  if (sorted.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding:var(--space-8)">
        <div class="empty-state__icon" style="font-size:2.5rem">📱</div>
        <p class="empty-state__text">Esperando que los alumnos escaneen el QR…</p>
      </div>`;
    return;
  }

  const showLate  = _s?.config?.markLate;
  const showPhoto = _s?.config?.photoRequired;

  listEl.innerHTML = sorted.map((a, i) => {
    const matched  = !!a.alumnoId;
    const isTardio = showLate && a.estado === 'tardio';
    const hora     = new Date(a.ts).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });

    let badgeClass, badgeText;
    if (!matched)       { badgeClass = 'qr-attendee-badge--warn'; badgeText = '⚠ No encontrado'; }
    else if (isTardio)  { badgeClass = 'qr-attendee-badge--late'; badgeText = '⏱ Tardío'; }
    else                { badgeClass = 'qr-attendee-badge--ok';   badgeText = '✓ Inscrito'; }

    const selfieHtml = (showPhoto && a.selfie)
      ? `<img src="data:image/jpeg;base64,${a.selfie}" class="qr-selfie-thumb" alt="Foto">`
      : '';

    const emailHtml = a.email ? ` · ${esc(a.email)}` : '';

    const ct = a.checkType ?? (_s?.config?.checkType ?? 'unico');
    const ctHtml = ct !== 'unico'
      ? `<span class="qr-attendee-ct-chip qr-attendee-ct-chip--${ct}">${ct === 'inicio' ? '🟢 I' : '🔴 F'}</span>`
      : '';

    return `
      <div class="qr-attendee-row">
        ${selfieHtml}
        <div class="qr-attendee-num">${sorted.length - i}</div>
        <div class="qr-attendee-info">
          <div class="qr-attendee-name">${esc(a.nombre)}</div>
          <div class="qr-attendee-carnet">Carné ${esc(a.carnet)} · ${hora}${emailHtml}</div>
        </div>
        <span class="qr-attendee-badge ${badgeClass}">${badgeText}</span>
        ${ctHtml}
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
