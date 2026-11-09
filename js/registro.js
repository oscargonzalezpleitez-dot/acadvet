// =============================================================================
// AcadVet USAM — Registro público de asistencia por QR
// Paso 1: formulario · Paso 2 (opcional): selfie
// Validaciones: token, duplicado carné, dispositivo, email @usam, GPS, tardíos
// =============================================================================

import { getDatabase, ref, get, set, update, onValue }
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
let _gpsRequest = null;
let _stepBusy = false;
let _serverTimeOffset = 0;
let _stopServerClock = null;
let _initializing = false;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.getElementById('btnRetryInit')?.addEventListener('click', init);
init();

async function init() {
  if (_initializing) return;
  _initializing = true;
  show('stLoading');
  let stage = 'auth';
  try {
    if (!sessionId) return showError('URL inválida. Pedile al docente un nuevo QR.');
    if (!auth.currentUser) await signInAnonymously(auth);
    // /.info se escucha como metadato local del SDK, no se consulta con get().
    // Esta ayuda para el reloj nunca debe impedir el registro de asistencia.
    watchServerClock();
    stage = 'session';
    const snap = await get(ref(db, `qr_sessions/${sessionId}`));
    if (!snap.exists()) return showError('La sesión no existe.');

    _session = { id: sessionId, ...snap.val() };
    if (!_session.active) return showError('La sesión ya finalizó.');
    _cfg = _session.config ?? {};
    stage = 'form';

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
    showError(initializationErrorMessage(err, stage), 'No se pudo abrir el registro');
  } finally {
    _initializing = false;
  }
}

function watchServerClock() {
  if (_stopServerClock) return;
  try {
    _stopServerClock = onValue(ref(db, '.info/serverTimeOffset'), snapshot => {
      const offset = snapshot.val();
      if (typeof offset === 'number' && Number.isFinite(offset)) _serverTimeOffset = offset;
    }, err => console.warn('[AcadVet] Sin sincronización de hora:', err.code));
  } catch (err) {
    console.warn('[AcadVet] Sin sincronización de hora:', err.code);
  }
}

function initializationErrorMessage(err, stage) {
  const code = String(err.code ?? 'sin-codigo').slice(0, 80);
  let message;
  if (/permission.denied/i.test(code)) {
    message = 'Firebase rechazó el acceso a la sesión. Avisale al docente para revisar los permisos del registro QR.';
  } else if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    message = 'Firebase no permite iniciar el acceso de alumnos. Avisale al docente para revisar la autenticación anónima.';
  } else if (code === 'auth/web-storage-unsupported') {
    message = 'El navegador bloqueó el almacenamiento de la sesión. Abrí el enlace directamente en Safari o Chrome y volvé a intentar.';
  } else if (code === 'auth/too-many-requests') {
    message = 'Firebase recibió demasiados intentos. Esperá un momento y tocá Reintentar.';
  } else if (stage === 'auth') {
    message = 'No se pudo iniciar el acceso al registro en Firebase. Tocá Reintentar. Si continúa, compartí este código con el docente.';
  } else if (stage === 'session') {
    message = 'No se pudo consultar la sesión en Firebase. Tocá Reintentar. Si continúa, compartí este código con el docente.';
  } else {
    message = 'No se pudo preparar el formulario. Tocá Reintentar y, si continúa, avisale al docente.';
  }
  return `${message} Referencia: ${stage}/${code}.`;
}

// ---------------------------------------------------------------------------
// GPS
// ---------------------------------------------------------------------------
function startGPS() {
  if (_gpsRequest) return _gpsRequest;
  _gpsRequest = locateGPS().finally(() => { _gpsRequest = null; });
  return _gpsRequest;
}

async function locateGPS() {
  _gpsCoords = null;
  setGPSStatus('Obteniendo ubicación…', 'loading');
  document.getElementById('gpsIcon').textContent = '📡';
  document.getElementById('gpsRetryBtn')?.classList.add('hidden');

  if (!navigator.geolocation) {
    onGPSFinalError();
    return;
  }

  // Una respuesta exitosa puede ser aproximada o estar fuera del aula.
  // También en ese caso pedimos una lectura nueva de alta precisión.
  const options = [
    { timeout: 10000, enableHighAccuracy: false, maximumAge: 0 },
    { timeout: 20000, enableHighAccuracy: true, maximumAge: 0 },
  ];
  let best = null;
  for (const opts of options) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, opts);
      });
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const candidate = { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : Infinity };
      if (!best || candidate.accuracy < best.accuracy) best = candidate;
      const dist = haversine(best.lat, best.lng, _cfg.aulaLat, _cfg.aulaLng);
      if (dist <= (_cfg.geoRadius ?? 100) && best.accuracy <= (_cfg.geoRadius ?? 100)) break;
    } catch (err) {
      if (err.code === 1) {
        onGPSPermissionDenied();
        return;
      }
    }
    setGPSStatus('Afinando la ubicación. Mantené esta página abierta…', 'loading');
  }

  if (!best) {
    onGPSFinalError();
    return;
  }
  _gpsCoords = best;
  const dist = haversine(best.lat, best.lng, _cfg.aulaLat, _cfg.aulaLng);
  const radio = _cfg.geoRadius ?? 100;
  if (dist > radio) {
    setGPSStatus(`La ubicación indica ${Math.round(dist)} m del aula (radio: ${radio} m). Reintentá con ubicación precisa o pedí el código de acceso al docente.`, 'error');
    document.getElementById('gpsIcon').textContent = '⚠️';
  } else {
    const precision = Number.isFinite(best.accuracy) ? ` (precisión aproximada: ${Math.round(best.accuracy)} m)` : '';
    setGPSStatus(`📍 Ubicación dentro del radio${precision}`, 'ok');
    document.getElementById('gpsIcon').textContent = '📍';
  }
  document.getElementById('gpsRetryBtn')?.classList.remove('hidden');
}

function onGPSPermissionDenied() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  setGPSStatus(
    isIOS
      ? '⚠️ Safari no tiene permiso de ubicación. Permití la ubicación para este sitio en el menú de la barra de direcciones y verificá que Localización y Ubicación precisa estén activadas para Safari en Ajustes. Luego tocá Reintentar. Si sigue fallando, pedí el código de acceso al docente.'
      : '⚠️ Permití la ubicación para este sitio y para tu navegador en los ajustes del teléfono. Activá la ubicación precisa si está disponible y tocá Reintentar. Si sigue fallando, pedí el código de acceso al docente.',
    'error'
  );
  document.getElementById('gpsIcon').textContent = '⚠️';
  document.getElementById('gpsRetryBtn')?.classList.remove('hidden');
}

function onGPSFinalError() {
  setGPSStatus('⚠️ No se pudo obtener la ubicación. Activá la ubicación del teléfono y los permisos del navegador; mantené esta página abierta y tocá Reintentar. Si sigue fallando, pedí el código de acceso al docente.', 'error');
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
    rToken.value = rToken.value.toUpperCase().replace(/[‐‑‒–—−]/g, '-').replace(/[^A-Z0-9-]/g, '');
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
  if (_stepBusy) return;
  _stepBusy = true;
  setLoading(true);
  try {
    await validateStep1();
  } catch (err) {
    console.error('[AcadVet] Error en registro QR:', err);
    showRegistrationError(err);
  } finally {
    _stepBusy = false;
    setLoading(false);
  }
}

async function validateStep1() {
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
    if (_gpsRequest) await _gpsRequest;
    if (!_gpsCoords) {
      return globalErr('No se obtuvo la ubicación. Tocá Reintentar ubicación y permití el acceso. Si sigue fallando, pedí el código de acceso al docente.');
    }
    const dist = haversine(_gpsCoords.lat, _gpsCoords.lng, _cfg.aulaLat, _cfg.aulaLng);
    const radio = _cfg.geoRadius ?? 100;
    if (dist > radio) {
      return globalErr(`El teléfono indica ${Math.round(dist)} m del aula (radio: ${radio} m). Tocá Reintentar ubicación. Si estás en el aula y sigue fallando, pedí el código de acceso al docente.`);
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
    const validToken = requireSessionToken(snap.val(), token);

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
    _formData = { nombre, carnet, email: email ? email.toLowerCase() : null, token: validToken, asistKey };

    if (_cfg.photoRequired) {
      show('stSelfie');
      if (!_selfieB64) await startCamera();
    } else {
      await submitRegistro();
    }
  } catch (err) {
    console.error('[AcadVet] Error en validación:', err);
    showRegistrationError(err);
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
  retakePhoto();
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
  document.getElementById('selfieHat')?.classList.remove('hidden');

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
  document.getElementById('selfieHat')?.classList.add('hidden');

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
  } catch (err) {
    console.error('[AcadVet] Error enviando selfie:', err);
    showRegistrationError(err);
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
  const { nombre, carnet, email, asistKey } = _formData;
  // Los permisos y la selfie pueden tardar más que una rotación del QR.
  // Revalidar evita confundir un código vencido con un error de conexión.
  const snap = await get(ref(db, `qr_sessions/${sessionId}`));
  const token = requireSessionToken(snap.val(), _formData.token);
  const estado    = computeEstado(email);
  const checkType = _cfg.checkType ?? 'unico';
  const now       = Date.now() + _serverTimeOffset;

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

function normalizeToken(token) {
  return String(token ?? '').toUpperCase().replace(/[\s\-‐‑‒–—−]/g, '');
}

function requireSessionToken(session, enteredToken) {
  if (!session?.active) {
    throw Object.assign(new Error('La sesión ya finalizó. Pedile al docente un nuevo QR.'), { code: 'qr/session-ended' });
  }
  const normalized = normalizeToken(enteredToken);
  if (normalized && normalized === normalizeToken(session.token)) return session.token;
  if (normalized && normalized === normalizeToken(session.prevToken) &&
      Date.now() + _serverTimeOffset <= session.prevTokenExpiresAt) return session.prevToken;
  throw Object.assign(new Error('El código es incorrecto o venció mientras completabas el registro. Ingresá el código que aparece ahora en la pantalla del aula y volvé a intentar.'), { code: 'qr/token-expired' });
}

function showRegistrationError(err) {
  if (err.code === 'qr/token-expired' || err.code === 'qr/session-ended') {
    stopCamera();
    show('stForm');
    if (err.code === 'qr/token-expired') {
      fieldErr('rToken', 'rTokenErr', err.message);
      document.getElementById('rToken')?.focus();
    } else {
      globalErr(err.message);
    }
    return;
  }
  const msg = /permission.denied/i.test(err.code ?? err.message ?? '')
    ? 'No se pudo guardar el registro. El código pudo vencer o el carné/dispositivo ya fue registrado. Volvé al formulario y revisá el código de la pantalla del aula.'
    : 'No se pudo enviar el registro. Verificá tu conexión e intentá de nuevo.';
  if (!document.getElementById('stSelfie')?.classList.contains('hidden')) {
    const status = document.getElementById('selfieStatus');
    if (status) {
      status.textContent = msg;
      status.classList.remove('hidden');
    }
  } else {
    globalErr(msg);
  }
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
  const steps = document.getElementById('registroSteps');
  steps?.classList.toggle('hidden', !['stForm', 'stSelfie', 'stSuccess'].includes(stateId));
  const ids = _cfg.photoRequired ? ['stepDatos', 'stepFoto', 'stepListo'] : ['stepDatos', 'stepListo'];
  const current = stateId === 'stSuccess' ? ids.length - 1 : stateId === 'stSelfie' ? 1 : 0;
  document.getElementById('stepFoto')?.classList.toggle('hidden', !_cfg.photoRequired);
  ids.forEach((id, i) => {
    const step = document.getElementById(id);
    if (!step) return;
    step.classList.toggle('is-active', i === current);
    step.classList.toggle('is-complete', i < current);
    if (i === current) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
    const number = step.querySelector('.registro-step-number');
    if (number) number.textContent = i < current ? '✓' : String(i + 1);
  });
}

function showError(msg, title = 'Sesión no disponible') {
  const heading = document.getElementById('errTitle');
  if (heading) heading.textContent = title;
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
    if (icon) icon.textContent = '✓';
  }

  document.getElementById('successDetail').textContent = isTardio
    ? 'Tu asistencia fue registrada como tardío. Si estás inscrito en la materia, se aplicará automáticamente a tu expediente.'
    : 'Tu asistencia quedó registrada. Si estás inscrito en la materia, se aplicará automáticamente a tu expediente.';

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
