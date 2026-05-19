// =============================================================================
// AcadVet USAM — Registro público de asistencia por QR (T21)
// Página pública (sin PIN). El alumno escanea el QR y registra su asistencia.
// =============================================================================

import { getDatabase, ref, get, push, set }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const db = getDatabase(app);

// ---------------------------------------------------------------------------
// Parámetros de la URL
// ---------------------------------------------------------------------------
const params    = new URLSearchParams(window.location.search);
const sessionId = params.get('s') ?? '';
const tokenUrl  = (params.get('tk') ?? '').toUpperCase();

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------
let _session = null;

init();

async function init() {
  show('stLoading');

  if (!sessionId) return showError('URL inválida. Pedile al profesor un nuevo QR.');

  try {
    const snap = await get(ref(db, `qr_sessions/${sessionId}`));
    if (!snap.exists()) return showError('La sesión no existe.');

    _session = { id: sessionId, ...snap.val() };

    if (!_session.active) return showError('La sesión ya finalizó.');

    document.getElementById('fMateria').textContent =
      [_session.materiaNombre, _session.ciclo].filter(Boolean).join(' · ');

    if (tokenUrl) {
      const inp = document.getElementById('rToken');
      if (inp) inp.value = tokenUrl;
    }

    show('stForm');
    wireForm();

  } catch (err) {
    console.error('[AcadVet] Error cargando sesión QR:', err);
    showError('Error de conexión. Verificá tu internet.');
  }
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

function wireForm() {
  document.getElementById('btnReg')?.addEventListener('click', handleSubmit);

  const rToken = document.getElementById('rToken');
  rToken?.addEventListener('input', () => {
    rToken.value = rToken.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });
}

async function handleSubmit() {
  const nombre = document.getElementById('rNombre')?.value.trim() ?? '';
  const carnet = document.getElementById('rCarnet')?.value.trim() ?? '';
  const token  = document.getElementById('rToken')?.value.trim().toUpperCase() ?? '';

  clearErrors();

  let ok = true;
  if (!nombre) { fieldErr('rNombre', 'rNombreErr', 'El nombre es obligatorio.');        ok = false; }
  if (!carnet) { fieldErr('rCarnet', 'rCarnetErr', 'El carné es obligatorio.');         ok = false; }
  if (!token)  { fieldErr('rToken',  'rTokenErr',  'El código de sesión es obligatorio.'); ok = false; }
  if (!ok) return;

  setLoading(true);

  try {
    // Recargar sesión para obtener token vigente
    const snap = await get(ref(db, `qr_sessions/${sessionId}`));
    if (!snap.exists() || !snap.val().active) {
      return globalErr('La sesión ya no está activa. El profesor la ha finalizado.');
    }

    const currentToken = (snap.val().token ?? '').toUpperCase();
    if (token !== currentToken) {
      return fieldErr('rToken', 'rTokenErr',
        'Código incorrecto o expirado. Ingresá el código que ves en la pantalla del aula.');
    }

    // Verificar duplicado por carnet
    const asistSnap = await get(ref(db, `qr_sessions/${sessionId}/asistentes`));
    if (asistSnap.exists()) {
      const dupe = Object.values(asistSnap.val()).some(
        a => (a.carnet ?? '').toLowerCase() === carnet.toLowerCase()
      );
      if (dupe) return globalErr('Este carné ya fue registrado en esta sesión.');
    }

    // Buscar alumno inscrito en la materia por carnet
    const alumnoId = await findAlumno(_session.materiaId, carnet);

    // Guardar en sesión QR
    const asistRef = push(ref(db, `qr_sessions/${sessionId}/asistentes`));
    await set(asistRef, { nombre, carnet, alumnoId: alumnoId ?? null, ts: Date.now() });

    // Si está inscrito → registrar asistencia en su expediente
    if (alumnoId) {
      const fecha = new Date().toISOString().slice(0, 10);
      const expRef = push(
        ref(db, `alumnos/${alumnoId}/inscripciones/${_session.materiaId}/asistencias`)
      );
      await set(expRef, { fecha, estado: 'presente' });
    }

    showSuccess(nombre, carnet, alumnoId !== null);

  } catch (err) {
    console.error('[AcadVet] Error al registrar asistencia:', err);
    globalErr('Error de conexión. Intentá de nuevo.');
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Buscar alumno inscrito por carnet
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
// UI helpers
// ---------------------------------------------------------------------------

function show(stateId) {
  ['stLoading', 'stError', 'stForm', 'stSuccess'].forEach(id => {
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
  ['rNombre', 'rCarnet', 'rToken'].forEach(id =>
    document.getElementById(id)?.classList.remove('form-input--error')
  );
  ['rNombreErr', 'rCarnetErr', 'rTokenErr', 'rGlobalErr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  });
}

function setLoading(loading) {
  const btn  = document.getElementById('btnReg');
  const text = btn?.querySelector('.btn-text');
  if (btn)  btn.disabled = loading;
  if (text) text.textContent = loading ? 'Registrando…' : 'Registrar asistencia';
}

function showSuccess(nombre, carnet, matched) {
  const hora = new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('successDetail').textContent = matched
    ? 'Tu asistencia fue registrada y aplicada a tu expediente.'
    : 'Tu asistencia fue registrada. El profesor verificará tu expediente manualmente.';
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
    </div>`;
  show('stSuccess');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
