// =============================================================================
// AcadVet USAM — Portal de auto-inscripción del alumno
// Foto: cámara frontal + detección facial (face-api.js) → base64 JPEG → RTDB
// =============================================================================

import { getDatabase, ref, get }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';
import { createSolicitud } from './db.js';

const db = getDatabase(app);

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _materias = [];
let _fotoB64  = null;
let _stream   = null;

// face-api.js — carga diferida al abrir la cámara
const FACEAPI_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const MODELS_URL  = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

let _faceReady  = false;
let _faceError  = false;
let _detectLoop = null;
let _faceFound  = false;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  await cargarMaterias();
  bindForm();
  bindCamara();
});

// ---------------------------------------------------------------------------
// Materias activas
// ---------------------------------------------------------------------------

async function cargarMaterias() {
  const listEl = document.getElementById('materiasList');
  if (!listEl) return;
  try {
    const snap = await get(ref(db, 'materias'));
    if (!snap.exists()) { listEl.innerHTML = `<p class="text-muted text-sm">No hay materias activas registradas.</p>`; return; }

    _materias = Object.entries(snap.val())
      .map(([id, d]) => ({ id, ...d }))
      .filter(m => m.estado === 'activa')
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));

    if (_materias.length === 0) { listEl.innerHTML = `<p class="text-muted text-sm">No hay materias activas registradas.</p>`; return; }

    listEl.innerHTML = _materias.map(m => `
      <label class="materia-check">
        <input type="checkbox" name="materia" value="${escHtml(m.id)}" data-nombre="${escHtml(m.nombre)}">
        <span class="materia-check-label">
          <span class="materia-check-nombre">${escHtml(m.nombre)}</span>
          <span class="materia-check-ciclo">${escHtml(m.ciclo)}${m.seccion ? ' · Sec. ' + m.seccion : ''}</span>
        </span>
      </label>`).join('');
  } catch (err) {
    console.error('[Inscripción] Error cargando materias:', err);
    listEl.innerHTML = `<p class="text-muted text-sm" style="color:var(--color-danger)">Error al cargar materias. Recargá la página.</p>`;
  }
}

// ---------------------------------------------------------------------------
// face-api.js — carga e inicialización diferida
// ---------------------------------------------------------------------------

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s   = document.createElement('script');
    s.src     = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
    document.head.appendChild(s);
  });
}

async function initFaceApi() {
  if (_faceReady || _faceError) return;
  try {
    await loadScript(FACEAPI_CDN);
    // Deshabilitar logs internos de face-api
    faceapi.env.monkeyPatch({ fetch: window.fetch.bind(window) });
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
    _faceReady = true;
  } catch (err) {
    console.warn('[FaceDetect] face-api no disponible:', err);
    _faceError = true;
  }
}

function faceOpts() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 });
}

// ---------------------------------------------------------------------------
// Bucle de detección en tiempo real (cada 800 ms)
// ---------------------------------------------------------------------------

async function startFaceLoop() {
  const btn  = document.getElementById('btnCapturarFoto');
  const hint = document.getElementById('fotoCamHint');
  const oval = document.getElementById('fotoFaceOval');

  if (btn)  { btn.disabled = true; btn.textContent = 'Cargando detección…'; }
  if (hint) hint.textContent = 'Cargando detección facial…';

  await initFaceApi();

  if (_faceError) {
    // Sin detección disponible — permitir captura libre
    if (btn)  { btn.disabled = false; btn.textContent = '📷 Capturar'; }
    if (hint) hint.textContent = 'Posicioná tu cara en el óvalo y capturá.';
    return;
  }

  if (hint) hint.textContent = 'Posicioná tu cara en el óvalo…';
  if (btn)  btn.textContent  = '📷 Capturar';

  const video = document.getElementById('fotoVideo');

  _detectLoop = setInterval(async () => {
    if (!video?.srcObject) return;
    try {
      const det   = await faceapi.detectSingleFace(video, faceOpts());
      const found = !!det;
      if (found === _faceFound) return;
      _faceFound = found;
      oval?.classList.toggle('foto-face-oval--detected', found);
      if (btn)  btn.disabled = !found;
      if (hint) {
        hint.textContent = found ? '✓ Cara detectada — presioná Capturar' : 'Posicioná tu cara en el óvalo…';
        hint.className   = `foto-cam-live-hint${found ? ' foto-cam-live-hint--ok' : ''}`;
      }
    } catch { /* ignorar errores transitorios */ }
  }, 800);
}

function stopFaceLoop() {
  clearInterval(_detectLoop);
  _detectLoop = null;
  _faceFound  = false;
}

// ---------------------------------------------------------------------------
// Cámara — abrir / cerrar / reiniciar
// ---------------------------------------------------------------------------

function bindCamara() {
  document.getElementById('btnAbrirCamara')?.addEventListener('click',    abrirCamara);
  document.getElementById('btnCancelarCamara')?.addEventListener('click', cerrarCamara);
  document.getElementById('btnCapturarFoto')?.addEventListener('click',   capturarFoto);
  document.getElementById('btnUsarFoto')?.addEventListener('click',       usarFoto);
  document.getElementById('btnRepetirFoto')?.addEventListener('click',    repetirFoto);
}

async function abrirCamara() {
  showCamState('active');
  clearCamError();
  document.getElementById('btnCapturarFoto')?.setAttribute('disabled', '');

  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
      audio: false,
    });
    const video = document.getElementById('fotoVideo');
    if (video) { video.srcObject = _stream; await video.play(); }
    await startFaceLoop();
  } catch {
    showCamError('⚠️ No se pudo acceder a la cámara. Verificá los permisos del navegador.');
  }
}

function cerrarCamara() {
  stopFaceLoop();
  pararCamara();
  showCamState('idle');
}

function pararCamara() {
  _stream?.getTracks().forEach(t => t.stop());
  _stream = null;
  const v = document.getElementById('fotoVideo');
  if (v) v.srcObject = null;
}

async function reiniciarCamara() {
  clearCamError();
  // Resetear estado del óvalo y hint
  document.getElementById('fotoFaceOval')?.classList.remove('foto-face-oval--detected');
  const hint = document.getElementById('fotoCamHint');
  if (hint) { hint.textContent = 'Posicioná tu cara en el óvalo…'; hint.className = 'foto-cam-live-hint'; }
  const btn = document.getElementById('btnCapturarFoto');
  if (btn) { btn.disabled = true; btn.textContent = '📷 Capturar'; }

  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
      audio: false,
    });
    const video = document.getElementById('fotoVideo');
    if (video) { video.srcObject = _stream; await video.play(); }
    await startFaceLoop();
  } catch {
    showCamError('⚠️ No se pudo acceder a la cámara.');
  }
}

// ---------------------------------------------------------------------------
// Captura y validación facial
// ---------------------------------------------------------------------------

async function capturarFoto() {
  stopFaceLoop();

  const video   = document.getElementById('fotoVideo');
  const canvas  = document.getElementById('fotoCanvas');
  const preview = document.getElementById('fotoPreviewFull');
  if (!video || !canvas) return;

  // Capturar cuadrado centrado del video
  const side = Math.min(video.videoWidth, video.videoHeight);
  const ox   = (video.videoWidth  - side) / 2;
  const oy   = (video.videoHeight - side) / 2;
  const SIZE = 320;
  canvas.width  = SIZE;
  canvas.height = SIZE;
  canvas.getContext('2d').drawImage(video, ox, oy, side, side, 0, 0, SIZE, SIZE);

  // Validación facial sobre el frame capturado
  if (_faceReady) {
    let det = null;
    try { det = await faceapi.detectSingleFace(canvas, faceOpts()); } catch { /* ignorar */ }

    if (!det) {
      showCamError('No se detectó ningún rostro. Mejorá la iluminación y asegurate de que tu cara esté bien visible.');
      pararCamara();
      await reiniciarCamara();
      return;
    }
    if (det.box.width / SIZE < 0.22) {
      showCamError('Acercate más a la cámara para que tu cara ocupe la mayor parte del encuadre.');
      pararCamara();
      await reiniciarCamara();
      return;
    }
  }

  pararCamara();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
  if (preview) preview.src = dataUrl;
  _fotoB64 = dataUrl.split(',')[1];
  showCamState('preview');
}

function usarFoto() {
  const preview     = document.getElementById('fotoPreviewFull');
  const circle      = document.getElementById('fotoPreviewCircle');
  const placeholder = document.getElementById('fotoPlaceholder');
  const hint        = document.getElementById('fotoHint');

  if (circle && preview?.src) { circle.src = preview.src; circle.classList.remove('hidden'); }
  if (placeholder) placeholder.style.display = 'none';
  if (hint) { hint.textContent = 'Foto capturada ✓'; hint.style.color = 'var(--color-success, #00B894)'; }

  showCamState('idle');
}

async function repetirFoto() {
  _fotoB64 = null;
  pararCamara();
  showCamState('active');
  await reiniciarCamara();
}

// ---------------------------------------------------------------------------
// UI helpers — cámara
// ---------------------------------------------------------------------------

function showCamState(state) {
  document.getElementById('fotoCamIdle')?.classList.toggle('hidden',    state !== 'idle');
  document.getElementById('fotoCamActive')?.classList.toggle('hidden',  state !== 'active');
  document.getElementById('fotoCamPreview')?.classList.toggle('hidden', state !== 'preview');
}

function showCamError(msg) {
  const el = document.getElementById('fotoCamError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function clearCamError() {
  const el = document.getElementById('fotoCamError');
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

// ---------------------------------------------------------------------------
// Formulario de inscripción
// ---------------------------------------------------------------------------

function bindForm() {
  document.getElementById('btnRegistrarse')?.addEventListener('click', enviarSolicitud);
}

async function enviarSolicitud() {
  const nombre   = document.getElementById('fNombre')?.value.trim()   ?? '';
  const carnet   = document.getElementById('fCarnet')?.value.trim()   ?? '';
  const email    = document.getElementById('fEmail')?.value.trim()    ?? '';
  const telefono = document.getElementById('fTelefono')?.value.trim() ?? '';

  const checkedMaterias = [...document.querySelectorAll('input[name="materia"]:checked')];

  let ok = true;
  clearAll();
  if (!nombre)  { showErr(document.getElementById('errNombre'),   'El nombre es obligatorio.');    ok = false; }
  if (!carnet)  { showErr(document.getElementById('errCarnet'),   'El carné es obligatorio.');     ok = false; }
  if (!email)   { showErr(document.getElementById('errEmail'),    'El correo es obligatorio.');    ok = false; }
  if (checkedMaterias.length === 0) {
    showErr(document.getElementById('errMaterias'), 'Seleccioná al menos una materia.'); ok = false;
  }
  if (!ok) return;

  pararCamara();
  stopFaceLoop();
  setLoading(true);

  try {
    const materias = {};
    checkedMaterias.forEach(el => { materias[el.value] = el.dataset.nombre ?? el.value; });

    await createSolicitud({
      nombre, carnet, email, telefono,
      fotoUrl: null, storagePath: null,
      fotoB64: _fotoB64 ?? null,
      materias,
      fecha: new Date().toISOString().slice(0, 10),
    });

    showSuccess(nombre);
  } catch (err) {
    console.error('[Inscripción] Error:', err);
    if (err.message === 'DUPLICADO_PENDIENTE') {
      showErr(document.getElementById('errCarnet'), 'Ya existe una solicitud pendiente con este carné.');
    } else if (err.message === 'YA_REGISTRADO') {
      showErr(document.getElementById('errCarnet'), 'Este carné ya está registrado en el sistema.');
    } else {
      showErr(document.getElementById('errGlobal'), 'Error al enviar la solicitud. Verificá tu conexión e intentá de nuevo.');
    }
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// UI helpers — formulario
// ---------------------------------------------------------------------------

function setLoading(on) {
  const btn = document.getElementById('btnRegistrarse');
  if (btn) { btn.disabled = on; btn.textContent = on ? 'Enviando…' : 'Enviar solicitud'; }
}

function showSuccess(nombre) {
  document.getElementById('formStep')?.classList.add('hidden');
  const ok = document.getElementById('stepOk');
  if (ok) ok.classList.remove('hidden');
  const nom = document.getElementById('okNombre');
  if (nom) nom.textContent = nombre;
}

function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearErr(el) {
  if (!el) return;
  el.textContent = '';
  el.classList.add('hidden');
}

function clearAll() {
  ['errNombre','errCarnet','errEmail','errTelefono','errMaterias','errFoto','errGlobal']
    .forEach(id => clearErr(document.getElementById(id)));
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
