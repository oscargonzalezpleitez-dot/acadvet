// =============================================================================
// AcadVet USAM — Registro público de asistencia por QR
// Paso 1: formulario · Paso 2 (opcional): selfie
// Validaciones: token, duplicado carné, dispositivo, email @usam, GPS, tardíos
// =============================================================================

import { getDatabase, ref, get, push, set }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getAuth, signInAnonymously }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { app } from './firebase-config.js';

const db   = getDatabase(app);
const auth = getAuth(app);

// ---------------------------------------------------------------------------
// Parámetros de la URL
// ---------------------------------------------------------------------------
const params    = new URLSearchParams(window.location.search);
const sessionId = params.get('s') ?? '';
const tokenUrl  = (params.get('tk') ?? '').toUpperCase();

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _session   = null;
let _cfg       = {};
let _formData  = {};         // { nombre, carnet, email, token }
let _selfieB64 = null;       // base64 JPEG sin el prefijo "data:..."
let _gpsCoords = null;       // { lat, lng }
let _deviceId  = null;
let _stream    = null;       // MediaStream de la cámara
let _lastSubmitTs = 0;       // timestamp del último envío (anti-spam)

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
init();

async function init() {
  show('stLoading');
  if (!sessionId) return showError('URL inválida. Pedile al docente un nuevo QR.');

  try {
    if (!auth.currentUser) await signInAnonymously(auth);
    const snap = await get(ref(db, `qr_sessions/${sessionId}`));
    if (!snap.exists()) return showError('La sesión no existe.');

    _session = { id: sessionId, ...snap.val() };
    if (!_session.active) return showError('La sesión ya finalizó.');
    _cfg = _session.config ?? {};

    // Materia en el encabezado
    document.getElementById('fMateria').textContent =
      [_session.materiaNombre, _session.ciclo].filter(Boolean).join(' · ');

    // Token pre-llenado desde URL
    if (tokenUrl) {
      const inp = document.getElementById('rToken');
      if (inp) inp.value = tokenUrl;
    }

    // Fingerprint del dispositivo (djb2)
    if (_cfg.onceDevice) {
      _deviceId = djb2(
        `${navigator.userAgent}${screen.width}${screen.height}` +
        `${navigator.language}${navigator.hardwareConcurrency ?? ''}`
      );
    }

    // Mostrar campo de correo si es necesario
    if (_cfg.requireUsamEmail || _cfg.markLate) {
      document.getElementById('emailGroup')?.classList.remove('hidden');
      if (_cfg.requireUsamEmail) {
        const label = document.getElementById('rEmailLabel');
        if (label) label.textContent = 'Correo institucional * (@usam.edu.sv)';
      }
    }

    // GPS: iniciar si la sesión tiene ubicación del aula
    if (_cfg.requireGeo && _cfg.aulaLat != null) {
      document.getElementById('gpsGroup')?.classList.remove('hidden');
      startGPS();
    }

    // Banner de tipo de registro (inicio / fin)
    const checkType = _cfg.checkType ?? 'unico';
    if (checkType !== 'unico') {
      const badge = document.getElementById('checkTypeBadge');
      if (badge) {
        badge.textContent = checkType === 'inicio'
          ? '🟢 Registro de INICIO de clase'
          : '🔴 Registro de FIN de clase';
        badge.className = `check-type-badge check-type-badge--${checkType}`;
        badge.classList.remove('hidden');
      }
    }

    // Etiqueta del botón según flujo
    const btnText = document.querySelector('#btnReg .btn-text');
    if (btnText) btnText.textContent = _cfg.photoRequired ? 'Continuar →' : 'Registrar asistencia';

    show('stForm');
    wireForm();
  } catch (err) {
    console.error('[AcadVet] Error cargando sesión QR:', err);
    showError('Error de conexión. Verificá tu internet.');
  }
}

// ---------------------------------------------------------------------------
// GPS
// ---------------------------------------------------------------------------
function startGPS() {
  setGPSStatus('Obteniendo ubicación…', 'loading');
  document.getElementById('gpsIcon').textContent = '📡';
  document.getElementById('gpsRetryBtn')?.classList.add('hidden');

  // Primer intento: baja precisión (WiFi/celular) — rápido, funciona bien en interiores.
  // Si falla, se reintenta con alta precisión como fallback.
  navigator.geolocation.getCurrentPosition(
    onGPSSuccess,
    err => {
      if (err.code === 1) {
        onGPSPermissionDenied();
      } else {
        setGPSStatus('Ajustando señal GPS…', 'loading');
        navigator.geolocation.getCurrentPosition(
          onGPSSuccess,
          onGPSFinalError,
          { timeout: 20000, enableHighAccuracy: true }
        );
      }
    },
    { timeout: 10000, enableHighAccuracy: false, maximumAge: 60000 }
  );
}

function onGPSSuccess(pos) {
  _gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  setGPSStatus('📍 Ubicación verificada', 'ok');
  document.getElementById('gpsIcon').textContent = '📍';
  document.getElementById('gpsRetryBtn')?.classList.add('hidden');
}

function onGPSPermissionDenied() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  setGPSStatus(
    isIOS
      ? '⚠️ Permiso denegado. En iPhone: Ajustes → Privacidad → Localización → Safari → Permitir.'
      : '⚠️ Permiso denegado. Habilitá la ubicación en la configuración de tu navegador.',
    'error'
  );
  document.getElementById('gpsIcon').textContent = '⚠️';
  document.getElementById('gpsRetryBtn')?.classList.remove('hidden');
}

function onGPSFinalError() {
  setGPSStatus('⚠️ No se pudo obtener la ubicación. Verificá que la ubicación esté activa y tocá Reintentar.', 'error');
  document.getElementById('gpsIcon').textContent = '⚠️';
  document.getElementById('gpsRetryBtn')?.classList.remove('hidden');
}

function setGPSStatus(msg, state) {
  const el = document.getElementById('gpsStatusText');
  if (!el) return;
  el.textContent = msg;
  el.className = `gps-status-text gps-status--${state}`;
}

// ---------------------------------------------------------------------------
// Wiring del formulario
// ---------------------------------------------------------------------------
function wireForm() {
  document.getElementById('btnReg')?.addEventListener('click', handleStep1);

  const rToken = document.getElementById('rToken');
  rToken?.addEventListener('input', () => {
    rToken.value = rToken.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  document.getElementById('gpsRetryBtn')?.addEventListener('click', startGPS);

  // Paso 2 — selfie
  document.getElementById('btnCapture')?.addEventListener('click',    capturePhoto);
  document.getElementById('btnRetake')?.addEventListener('click',     retakePhoto);
  document.getElementById('btnSendSelfie')?.addEventListener('click', handleSendSelfie);
  document.getElementById('btnBackForm')?.addEventListener('click',   backToForm);
}

// ---------------------------------------------------------------------------
// Paso 1: validación del formulario
// ---------------------------------------------------------------------------
async function handleStep1() {
  const nombre = document.getElementById('rNombre')?.value.trim() ?? '';
  const carnet = document.getElementById('rCarnet')?.value.trim() ?? '';
  const email  = document.getElementById('rEmail')?.value.trim()  ?? '';
  const token  = document.getElementById('rToken')?.value.trim().toUpperCase() ?? '';

  clearErrors();

  // Anti-spam: mínimo 5 s entre intentos de envío
  const now = Date.now();
  if (now - _lastSubmitTs < 5_000) {
    return globalErr('Esperá unos segundos antes de intentar de nuevo.');
  }

  let ok = true;
  if (!nombre) { fieldErr('rNombre', 'rNombreErr', 'El nombre es obligatorio.');          ok = false; }
  if (!carnet) { fieldErr('rCarnet', 'rCarnetErr', 'El carné es obligatorio.');           ok = false; }
  if (!token)  { fieldErr('rToken',  'rTokenErr',  'El código de sesión es obligatorio.'); ok = false; }

  // Validación de correo @usam.edu.sv
  if (_cfg.requireUsamEmail) {
    if (!email || !email.toLowerCase().endsWith('@usam.edu.sv')) {
      fieldErr('rEmail', 'rEmailErr', '⚠️ Debe ser un correo @usam.edu.sv');
      ok = false;
    }
  }

  if (!ok) return;

  // Validación de GPS (antes de ir al servidor)
  if (_cfg.requireGeo && _cfg.aulaLat != null) {
    if (!_gpsCoords) {
      return globalErr('Esperando ubicación GPS. Si no se resuelve, verificá los permisos de ubicación en tu navegador.');
    }
    const dist = haversine(_gpsCoords.lat, _gpsCoords.lng, _cfg.aulaLat, _cfg.aulaLng);
    const radio = _cfg.geoRadius ?? 100;
    if (dist > radio) {
      return globalErr(`Estás a ${Math.round(dist)} m del aula (radio permitido: ${radio} m). Asegurate de estar dentro del aula.`);
    }
  }

  _lastSubmitTs = Date.now();
  setLoading(true);
  try {
    // Recargar sesión para verificar token vigente
    const snap = await get(ref(db, `qr_sessions/${sessionId}`));
    if (!snap.exists() || !snap.val().active) {
      return globalErr('La sesión ya no está activa. El docente la ha finalizado.');
    }
    const currentToken = (snap.val().token ?? '').toUpperCase();
    if (token !== currentToken) {
      return fieldErr('rToken', 'rTokenErr',
        'Código incorrecto o expirado. Ingresá el código visible en la pantalla del aula.');
    }

    // Verificaciones en la lista de asistentes
    const asistSnap = await get(ref(db, `qr_sessions/${sessionId}/asistentes`));
    if (asistSnap.exists()) {
      const vals = Object.values(asistSnap.val());

      // Duplicado por carné
      if (vals.some(a => (a.carnet ?? '').toLowerCase() === carnet.toLowerCase())) {
        return globalErr('Este carné ya fue registrado en esta sesión.');
      }

      // Duplicado por dispositivo
      if (_cfg.onceDevice && _deviceId) {
        if (vals.some(a => a.deviceId === _deviceId)) {
          return globalErr('Ya se registró un alumno desde este dispositivo en esta sesión.');
        }
      }
    }

    // Guardar datos del formulario para el paso 2 o el envío directo
    _formData = { nombre, carnet, email: email || null, token };

    if (_cfg.photoRequired) {
      show('stSelfie');
      await startCamera();
    } else {
      await submitRegistro();
    }
  } catch (err) {
    console.error('[AcadVet] Error en validación:', err);
    globalErr('Error de conexión. Intentá de nuevo.');
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Cámara / Selfie
// ---------------------------------------------------------------------------
async function startCamera() {
  const video  = document.getElementById('selfieVideo');
  const status = document.getElementById('selfieStatus');
  if (!video) return;
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
      audio: false,
    });
    video.srcObject = _stream;
    await video.play();
    if (status) status.classList.add('hidden');
  } catch {
    if (status) {
      status.textContent = '⚠️ No se pudo acceder a la cámara. Verificá los permisos del navegador.';
      status.classList.remove('hidden');
    }
  }
}

function stopCamera() {
  _stream?.getTracks().forEach(t => t.stop());
  _stream = null;
  const video = document.getElementById('selfieVideo');
  if (video) video.srcObject = null;
}

function capturePhoto() {
  const video   = document.getElementById('selfieVideo');
  const canvas  = document.getElementById('selfieCanvas');
  const preview = document.getElementById('selfiePreview');
  if (!video || !canvas) return;

  canvas.width  = 320;
  canvas.height = 240;
  canvas.getContext('2d').drawImage(video, 0, 0, 320, 240);

  const dataUrl  = canvas.toDataURL('image/jpeg', 0.6);
  _selfieB64     = dataUrl.split(',')[1]; // sin el prefijo "data:image/jpeg;base64,"

  if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
  video.style.display = 'none';

  document.getElementById('btnCapture').style.display   = 'none';
  document.getElementById('btnRetake').style.display    = '';
  document.getElementById('btnSendSelfie').disabled     = false;
}

function retakePhoto() {
  _selfieB64 = null;
  const video   = document.getElementById('selfieVideo');
  const preview = document.getElementById('selfiePreview');
  if (video)   video.style.display   = '';
  if (preview) preview.style.display = 'none';

  document.getElementById('btnCapture').style.display  = '';
  document.getElementById('btnRetake').style.display   = 'none';
  document.getElementById('btnSendSelfie').disabled    = true;
}

async function handleSendSelfie() {
  if (!_selfieB64) return;
  stopCamera();
  const btn = document.getElementById('btnSendSelfie');
  const txt = btn?.querySelector('.btn-text');
  if (btn) btn.disabled = true;
  if (txt) txt.textContent = 'Enviando…';
  try {
    await submitRegistro();
  } catch {
    globalErr('Error al enviar. Intentá de nuevo.');
    if (btn) btn.disabled = false;
    if (txt) txt.textContent = 'Enviar registro';
  }
}

function backToForm() {
  stopCamera();
  _selfieB64 = null;
  show('stForm');
}

// ---------------------------------------------------------------------------
// Envío final
// ---------------------------------------------------------------------------
async function submitRegistro() {
  const { nombre, carnet, email } = _formData;
  const alumnoId  = await findAlumno(_session.materiaId, carnet);
  const estado    = computeEstado(email);
  const checkType = _cfg.checkType ?? 'unico';
  const now       = Date.now();

  const payload = {
    nombre,
    carnet,
    email:     email     ?? null,
    alumnoId:  alumnoId  ?? null,
    ts:        now,
    estado,
    checkType,
    selfie:    _selfieB64      ?? null,
    deviceId:  _deviceId       ?? null,
    lat:       _gpsCoords?.lat ?? null,
    lng:       _gpsCoords?.lng ?? null,
  };

  const asistRef = push(ref(db, `qr_sessions/${sessionId}/asistentes`));
  await set(asistRef, payload);

  // Tardío sigue contando como presente en el expediente
  if (alumnoId) {
    const fecha  = new Date().toISOString().slice(0, 10);
    const expRef = push(
      ref(db, `alumnos/${alumnoId}/inscripciones/${_session.materiaId}/asistencias`)
    );
    await set(expRef, { fecha, estado: 'presente', checkType });
  }

  showSuccess(nombre, carnet, alumnoId !== null, estado);
}

// ---------------------------------------------------------------------------
// Lógica de tardíos
// ---------------------------------------------------------------------------
function computeEstado(email) {
  if (!_cfg.markLate) return 'presente';
  // Tardío solo aplica a correos @usam.edu.sv
  if (!email?.toLowerCase().endsWith('@usam.edu.sv')) return 'presente';
  const startedAt = _cfg.sessionStartedAt ?? Date.now();
  const elapsed   = Date.now() - startedAt;
  return elapsed > ((_cfg.lateMinutes ?? 10) * 60_000) ? 'tardio' : 'presente';
}

// ---------------------------------------------------------------------------
// Buscar alumno inscrito por carné
// ---------------------------------------------------------------------------
async function findAlumno(materiaId, carnet) {
  try {
    const snap = await get(ref(db, 'alumnos'));
    if (!snap.exists()) return null;
    const needle = carnet.toLowerCase().trim();
    for (const [id, a] of Object.entries(snap.val())) {
      if (
        (a.carnet ?? '').toLowerCase().trim() === needle &&
        a.inscripciones?.[materiaId] !== undefined
      ) return id;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Haversine — distancia en metros entre dos coordenadas GPS
// ---------------------------------------------------------------------------
function haversine(lat1, lng1, lat2, lng2) {
  const R  = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// djb2 — fingerprint del dispositivo
// ---------------------------------------------------------------------------
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function show(stateId) {
  ['stLoading', 'stError', 'stForm', 'stSelfie', 'stSuccess'].forEach(id => {
    document.getElementById(id)?.classList.toggle('hidden', id !== stateId);
  });
}

function showError(msg) {
  document.getElementById('errMsg').textContent = msg;
  show('stError');
}

function globalErr(msg) {
  const el = document.getElementById('rGlobalErr');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  setLoading(false);
}

function fieldErr(inputId, errId, msg) {
  document.getElementById(inputId)?.classList.add('form-input--error');
  const el = document.getElementById(errId);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function clearErrors() {
  ['rNombre', 'rCarnet', 'rEmail', 'rToken'].forEach(id =>
    document.getElementById(id)?.classList.remove('form-input--error')
  );
  ['rNombreErr', 'rCarnetErr', 'rEmailErr', 'rTokenErr', 'rGlobalErr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  });
}

function setLoading(loading) {
  const btn  = document.getElementById('btnReg');
  const text = btn?.querySelector('.btn-text');
  if (btn) btn.disabled = loading;
  if (text) text.textContent = loading
    ? 'Verificando…'
    : (_cfg.photoRequired ? 'Continuar →' : 'Registrar asistencia');
}

function showSuccess(nombre, carnet, matched, estado) {
  const hora     = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
  const isTardio = estado === 'tardio';

  const icon = document.getElementById('successIcon');
  if (icon) icon.textContent = isTardio ? '⏰' : '✅';

  document.getElementById('successDetail').textContent = matched
    ? (isTardio
        ? 'Tu asistencia fue registrada como tardío y aplicada a tu expediente.'
        : 'Tu asistencia fue registrada y aplicada a tu expediente.')
    : 'Tu asistencia fue registrada. El docente verificará tu expediente manualmente.';

  document.getElementById('successCard').innerHTML = `
    <div style="display:grid;gap:var(--space-2)">
      <div style="display:flex;justify-content:space-between">
        <span class="text-muted text-sm">Nombre</span>
        <span class="font-bold text-sm">${esc(nombre)}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span class="text-muted text-sm">Carné</span>
        <span class="font-bold text-sm">${esc(carnet)}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span class="text-muted text-sm">Hora</span>
        <span class="font-bold text-sm">${hora}</span>
      </div>
      ${isTardio ? `
      <div style="display:flex;justify-content:space-between">
        <span class="text-muted text-sm">Estado</span>
        <span class="font-bold text-sm" style="color:#FDCB6E">⏱ Tardío</span>
      </div>` : ''}
    </div>`;

  show('stSuccess');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
