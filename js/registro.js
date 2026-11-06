// =============================================================================
// AcadVet USAM — Registro público de asistencia por QR
// Paso 1: formulario · Paso 2 (opcional): selfie
// Validaciones: token, duplicado carné, dispositivo, email @usam, GPS, tardíos
// =============================================================================

import { getDatabase, ref, get, set, update }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getAuth, signInAnonymously }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFunctions, httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
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
let _formData  = {};         // { nombre, carnet, email, token, asistKey }
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

    // ID del dispositivo: aleatorio y persistente en localStorage (no colisiona
    // entre teléfonos del mismo modelo, a diferencia del fingerprint anterior).
    if (_cfg.onceDevice) {
      _deviceId = getDeviceId();
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
      ? '⚠️ Permiso denegado para este sitio. Tocá el ícono "AA" junto a la URL (arriba) → Configuración del sitio web → Ubicación → Permitir, luego tocá Reintentar. Si no aparece esa opción: Ajustes → Safari → Avanzado → Datos de sitios web, buscá este sitio, eliminalo y volvé a cargar la página.'
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

  document.getElementById('accessCodeToggle')?.addEventListener('click', () => {
    document.getElementById('accessCodeGroup')?.classList.remove('hidden');
    document.getElementById('accessCodeToggle')?.classList.add('hidden');
    document.getElementById('rAccessCode')?.focus();
  });

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

  // Código de acceso del docente: si el alumno escribió uno, se valida en el
  // servidor (nunca acá, el código no debe existir en el código fuente
  // público) y, si es correcto, salta por completo la validación de GPS de
  // abajo. Si es incorrecto, cae al bloqueo normal de GPS como si no hubiera
  // escrito nada.
  const accessCode = document.getElementById('rAccessCode')?.value.trim() ?? '';
  let accessCodeValid = false;
  if (_cfg.requireGeo && _cfg.aulaLat != null && accessCode) {
    try {
      const verifyAccessCode = httpsCallable(getFunctions(app), 'verifyAccessCode');
      const res = await verifyAccessCode({ sessionId, carnet, code: accessCode });
      accessCodeValid = res.data?.valid === true;
    } catch (err) {
      console.error('[AcadVet] Error validando código de acceso:', err);
    }
    if (!accessCodeValid) {
      return globalErr('Código de acceso incorrecto. Verificalo con el docente.');
    }
  }

  // Validación de GPS (antes de ir al servidor)
  if (_cfg.requireGeo && _cfg.aulaLat != null && !accessCodeValid) {
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

    // Verificaciones de duplicado. La llave del registro es checkType+carné
    // (ver asistKey abajo), así que esta lectura puntual —y sobre todo la
    // regla de Firebase del lado servidor, que usa la misma llave— bastan
    // para bloquear el duplicado aunque alguien escriba directo al SDK sin
    // pasar por este formulario.
    const checkType = _cfg.checkType ?? 'unico';
    const asistKey  = `${checkType}_${sanitizeKey(carnet)}`;

    const existSnap = await get(ref(db, `qr_sessions/${sessionId}/asistentes/${asistKey}`));
    if (existSnap.exists()) {
      return globalErr('Este carné ya fue registrado en esta sesión.');
    }

    // Duplicado por dispositivo: mismo chequeo puntual contra device_index,
    // reforzado por la regla de Firebase al momento de escribir.
    if (_cfg.onceDevice && _deviceId) {
      const devSnap = await get(ref(db, `qr_sessions/${sessionId}/device_index/${_deviceId}`));
      if (devSnap.exists()) {
        return globalErr('Ya se registró un alumno desde este dispositivo en esta sesión.');
      }
    }

    // Guardar datos del formulario para el paso 2 o el envío directo.
    // El correo se normaliza a minúsculas para que coincida con el patrón
    // (en minúsculas) que valida la regla de Firebase del lado servidor.
    _formData = { nombre, carnet, email: email ? email.toLowerCase() : null, token, asistKey };

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

  const targetW = 320, targetH = 240;
  canvas.width  = targetW;
  canvas.height = targetH;

  // Recorte tipo "object-fit: cover": la cámara casi nunca entrega el video
  // en 4:3 exacto, así que dibujar el frame completo estirado a 320x240
  // (drawImage sin recorte) alargaba o achataba la cara. Acá se recorta el
  // centro del frame real a la proporción 4:3 antes de escalarlo, igual que
  // ya se ve en pantalla con object-fit:cover en el <video>.
  const vw = video.videoWidth  || targetW;
  const vh = video.videoHeight || targetH;
  const srcRatio = vw / vh;
  const dstRatio = targetW / targetH;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (srcRatio > dstRatio) {
    sw = vh * dstRatio;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / dstRatio;
    sy = (vh - sh) / 2;
  }
  canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);

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
  const { nombre, carnet, email, token, asistKey } = _formData;
  const estado    = computeEstado(email);
  const checkType = _cfg.checkType ?? 'unico';
  const now       = Date.now();

  // El emparejamiento con el alumno inscrito y la escritura al expediente
  // los hace el panel del docente (auth anónima no tiene acceso a `alumnos`).
  const payload = {
    nombre,
    carnet,
    email:     email ?? null,
    alumnoId:  null,
    ts:        now,
    estado,
    checkType,
    // El token se guarda junto con el registro para que las reglas de Firebase
    // puedan revalidarlo contra el token vigente de la sesión (defensa del
    // lado servidor: sin esto, cualquiera con auth anónima podía escribir un
    // registro de asistencia sin conocer el token, llamando directo al SDK).
    token:     token,
    selfie:    _selfieB64      ?? null,
    deviceId:  _deviceId       ?? null,
    lat:       _gpsCoords?.lat ?? null,
    lng:       _gpsCoords?.lng ?? null,
  };

  // Escritura atómica multi-ruta: el registro (llave = checkType+carné) y el
  // índice de dispositivo se escriben juntos o no se escribe ninguno. Las
  // reglas de Firebase rechazan cada ruta si ya existe, así que un duplicado
  // de carné o de dispositivo queda bloqueado por la base de datos aunque
  // alguien llame al SDK directo sin pasar por las validaciones de este form.
  const updates = { [`qr_sessions/${sessionId}/asistentes/${asistKey}`]: payload };
  if (_cfg.onceDevice && _deviceId) {
    updates[`qr_sessions/${sessionId}/device_index/${_deviceId}`] = true;
  }
  await update(ref(db), updates);

  showSuccess(nombre, carnet, estado);
}

// ---------------------------------------------------------------------------
// Lógica de tardíos
// ---------------------------------------------------------------------------
function computeEstado(_email) {
  if (!_cfg.markLate) return 'presente';
  const startedAt = _cfg.sessionStartedAt ?? Date.now();
  const elapsed   = Date.now() - startedAt;
  return elapsed > ((_cfg.lateMinutes ?? 10) * 60_000) ? 'tardio' : 'presente';
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
// Llave de Firebase a partir del carné — normalizada y sin caracteres
// prohibidos en una ruta de Realtime Database ('.', '#', '$', '[', ']', '/').
// ---------------------------------------------------------------------------
function sanitizeKey(str) {
  return String(str).trim().toLowerCase().replace(/[.#$\[\]/]/g, '_').slice(0, 200);
}

// ---------------------------------------------------------------------------
// ID persistente del dispositivo — aleatorio, guardado en localStorage
// ---------------------------------------------------------------------------
function getDeviceId() {
  const KEY = 'acadvet_device_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // localStorage no disponible (modo privado, etc.): no bloqueamos el registro.
    return null;
  }
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

function showSuccess(nombre, carnet, estado) {
  const hora     = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
  const isTardio = estado === 'tardio';

  const icon       = document.getElementById('successIcon');
  const photoWrap  = document.getElementById('successPhotoWrap');
  const photoImg   = document.getElementById('successPhoto');
  if (_selfieB64 && photoWrap && photoImg) {
    photoImg.src = 'data:image/jpeg;base64,' + _selfieB64;
    photoWrap.classList.remove('hidden');
    icon?.classList.add('hidden');
  } else {
    photoWrap?.classList.add('hidden');
    icon?.classList.remove('hidden');
    if (icon) icon.textContent = isTardio ? '⏰' : '✅';
  }

  document.getElementById('successDetail').textContent = isTardio
    ? 'Tu asistencia fue registrada como tardío. Si estás inscrito en la materia, se aplicará automáticamente a tu expediente.'
    : 'Tu asistencia fue registrada. Si estás inscrito en la materia, se aplicará automáticamente a tu expediente.';

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
        <span class="font-bold text-sm" style="color:#94601d">⏱ Tardío</span>
      </div>` : ''}
    </div>`;

  show('stSuccess');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
