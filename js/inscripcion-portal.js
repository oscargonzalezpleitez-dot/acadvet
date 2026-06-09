// =============================================================================
// AcadVet USAM — Portal de auto-inscripción del alumno
// Foto de perfil: captura con cámara → base64 JPEG → Firebase RTDB (sin Storage)
// =============================================================================

import { getDatabase, ref, get }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { app, auth } from './firebase-config.js';
import { createSolicitud } from './db.js';

// Regex de validación de carnet USAM: YYYY-NNNN  (ej. 2024-0001)
const CARNET_RE = /^\d{4}-\d{4}$/;

const db = getDatabase(app);

let _materias = [];
let _fotoB64  = null;
let _stream   = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  // Auth anónima necesaria para que las reglas de Firebase permitan leer materias
  try { await signInAnonymously(auth); } catch (_) {}
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
// Cámara
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
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
      audio: false,
    });
    const video = document.getElementById('fotoVideo');
    if (video) { video.srcObject = _stream; await video.play(); }
  } catch {
    showCamError('⚠️ No se pudo acceder a la cámara. Verificá los permisos del navegador.');
  }
}

function cerrarCamara() {
  pararCamara();
  showCamState('idle');
}

function pararCamara() {
  _stream?.getTracks().forEach(t => t.stop());
  _stream = null;
  const v = document.getElementById('fotoVideo');
  if (v) v.srcObject = null;
}

function capturarFoto() {
  const video   = document.getElementById('fotoVideo');
  const canvas  = document.getElementById('fotoCanvas');
  const preview = document.getElementById('fotoPreviewFull');
  if (!video || !canvas) return;

  // Recortar cuadrado centrado
  const side = Math.min(video.videoWidth, video.videoHeight);
  const ox   = (video.videoWidth  - side) / 2;
  const oy   = (video.videoHeight - side) / 2;
  const SIZE = 320;
  canvas.width  = SIZE;
  canvas.height = SIZE;
  canvas.getContext('2d').drawImage(video, ox, oy, side, side, 0, 0, SIZE, SIZE);

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

function repetirFoto() {
  _fotoB64 = null;
  pararCamara();
  abrirCamara();
}

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
// Formulario
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

  if (!nombre)                { showErr(document.getElementById('errNombre'),   'El nombre es obligatorio.');                           ok = false; }
  else if (nombre.length > 120) { showErr(document.getElementById('errNombre'), 'El nombre no puede superar 120 caracteres.'); ok = false; }
  if (!carnet)               { showErr(document.getElementById('errCarnet'),   'El carné es obligatorio.');                            ok = false; }
  else if (!CARNET_RE.test(carnet)) { showErr(document.getElementById('errCarnet'), 'El carné debe tener el formato YYYY-NNNN (ej. 2024-0001).'); ok = false; }
  if (!email)    { showErr(document.getElementById('errEmail'),    'El correo institucional es obligatorio.');                         ok = false; }
  else if (!/^[^\s@]+@usam\.edu\.sv$/i.test(email)) {
                   showErr(document.getElementById('errEmail'),    'El correo debe ser institucional (@usam.edu.sv).'); ok = false; }
  if (!telefono) { showErr(document.getElementById('errTelefono'), 'El teléfono es obligatorio.');                                      ok = false; }
  if (checkedMaterias.length === 0) {
    showErr(document.getElementById('errMaterias'), 'Seleccioná al menos una materia.'); ok = false;
  }
  if (!_fotoB64) {
    showErr(document.getElementById('errFoto'), 'La foto de perfil es obligatoria. Tocá "Tomar foto" para capturarla.'); ok = false;
  }
  if (!ok) return;

  pararCamara();
  setLoading(true);

  try {
    const materias = {};
    checkedMaterias.forEach(el => { materias[el.value] = el.dataset.nombre ?? el.value; });

    await createSolicitud({
      nombre, carnet, email, telefono,
      fotoUrl: null, storagePath: null,
      fotoB64: _fotoB64,
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
// UI helpers
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
