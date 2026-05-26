// =============================================================================
// AcadVet USAM — Portal de entrega de tareas (alumno)
// El alumno pega el link de Teams de su archivo. Sin subida a Storage.
// =============================================================================

import { getDatabase, ref, get, push, set }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const db = getDatabase(app);

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _alumno    = null;
let _materias  = [];
let _materiaId = null;

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  _materiaId = params.get('materia') ?? null;

  bindBuscar();
  if (_materiaId) showMateriaHint(_materiaId);
});

// ---------------------------------------------------------------------------
// Paso 1: Buscar alumno por carné
// ---------------------------------------------------------------------------
function bindBuscar() {
  const btn   = document.getElementById('btnBuscar');
  const input = document.getElementById('fCarnet');
  btn?.addEventListener('click', buscarAlumno);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') buscarAlumno(); });
}

async function buscarAlumno() {
  const carnet = document.getElementById('fCarnet')?.value.trim();
  const errEl  = document.getElementById('errCarnet');
  clearError('fCarnet', errEl);

  if (!carnet) { showError('fCarnet', errEl, 'Ingresá tu número de carné.'); return; }

  setBuscarLoading(true);

  try {
    const snap = await get(ref(db, 'alumnos'));
    if (!snap.exists()) {
      setBuscarLoading(false);
      showError('fCarnet', errEl, 'No se encontró ningún alumno con ese carné.');
      return;
    }

    const todos  = Object.entries(snap.val()).map(([id, d]) => ({ id, ...d }));
    const alumno = todos.find(a =>
      (a.carnet ?? '').toLowerCase().trim() === carnet.toLowerCase()
    );

    if (!alumno) {
      setBuscarLoading(false);
      showError('fCarnet', errEl, 'Carné no encontrado. Verificá el número e intentá de nuevo.');
      return;
    }

    _alumno = alumno;

    if (_materiaId) {
      if (!alumno.inscripciones?.[_materiaId]) {
        setBuscarLoading(false);
        showError('fCarnet', errEl, 'No estás inscrito en la materia de este enlace.');
        return;
      }
      _materias = await fetchMaterias([_materiaId]);
    } else {
      const ids = Object.keys(alumno.inscripciones ?? {});
      _materias = await fetchMaterias(ids);
    }

    setBuscarLoading(false);
    showFormStep();

  } catch (err) {
    console.error('[Tareas] Error buscando alumno:', err);
    setBuscarLoading(false);
    showError('fCarnet', errEl, 'Error de conexión. Verificá tu internet e intentá de nuevo.');
  }
}

async function fetchMaterias(ids) {
  const results = await Promise.all(
    ids.map(id => get(ref(db, `materias/${id}`)).then(s => s.exists() ? { id, ...s.val() } : null))
  );
  return results.filter(Boolean).filter(m => m.estado === 'activa');
}

async function showMateriaHint(materiaId) {
  try {
    const snap = await get(ref(db, `materias/${materiaId}`));
    if (!snap.exists()) return;
    const m    = snap.val();
    const hint = document.getElementById('materiaHint');
    if (hint) {
      hint.textContent = `Materia: ${m.nombre}${m.seccion ? ' — Sección ' + m.seccion : ''} (${m.ciclo})`;
      hint.classList.remove('hidden');
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Paso 2: Formulario de entrega
// ---------------------------------------------------------------------------
function showFormStep() {
  document.getElementById('step1')?.classList.add('hidden');
  const step2 = document.getElementById('step2');
  if (!step2) return;
  step2.classList.remove('hidden');

  document.getElementById('alumnoNombre').textContent = _alumno.nombre;

  const sel = document.getElementById('fMateria');
  if (!sel) return;
  sel.innerHTML = '';

  if (_materias.length === 0) {
    sel.innerHTML = '<option value="">Sin materias activas</option>';
    document.getElementById('btnEntregar')?.setAttribute('disabled', '');
    return;
  }

  if (_materiaId && _materias.length === 1) {
    sel.innerHTML = `<option value="${escHtml(_materias[0].id)}">${escHtml(_materias[0].nombre)} — ${escHtml(_materias[0].ciclo)}</option>`;
    sel.disabled  = true;
  } else {
    sel.innerHTML = `<option value="">— Seleccioná la materia —</option>` +
      _materias.map(m =>
        `<option value="${escHtml(m.id)}"${_materiaId === m.id ? ' selected' : ''}>
          ${escHtml(m.nombre)}${m.seccion ? ' — Sección ' + m.seccion : ''} (${escHtml(m.ciclo)})
        </option>`
      ).join('');
  }

  document.getElementById('btnEntregar')?.addEventListener('click', registrarEntrega);
}

// ---------------------------------------------------------------------------
// Paso 3: Registrar entrega (solo guarda el link en Firebase RTDB)
// ---------------------------------------------------------------------------
async function registrarEntrega() {
  const materiaId  = document.getElementById('fMateria')?.value;
  const nombre     = document.getElementById('fNombreTarea')?.value.trim();
  const comentario = document.getElementById('fComentario')?.value.trim() ?? '';
  const linkTeams  = document.getElementById('fLinkTeams')?.value.trim();

  const errMateria = document.getElementById('errMateria');
  const errNombre  = document.getElementById('errNombre');
  const errLink    = document.getElementById('errLink');
  clearError('fMateria',    errMateria);
  clearError('fNombreTarea',errNombre);
  clearError('fLinkTeams',  errLink);

  let ok = true;
  if (!materiaId) { showError('fMateria',    errMateria, 'Seleccioná la materia.');                       ok = false; }
  if (!nombre)    { showError('fNombreTarea', errNombre,  'El nombre de la tarea es obligatorio.');        ok = false; }
  if (!linkTeams) { showError('fLinkTeams',   errLink,    'Pegá el link de Teams de tu archivo.');         ok = false; }
  else if (!isTeamsUrl(linkTeams)) {
                    showError('fLinkTeams',   errLink,    'El link debe ser de Teams, SharePoint o OneDrive (https://teams.microsoft.com, *.sharepoint.com, 1drv.ms).'); ok = false; }

  if (!ok) return;

  if (!_alumno.inscripciones?.[materiaId]) {
    showError('fMateria', errMateria, 'No estás inscrito en esa materia.');
    return;
  }

  setLoading(true);
  try {
    // Verificar que no exista ya una tarea con el mismo nombre
    const existSnap = await get(ref(db, `alumnos/${_alumno.id}/inscripciones/${materiaId}/tareas`));
    if (existSnap.exists()) {
      const nombreNorm = nombre.toLowerCase().trim();
      const dup = Object.values(existSnap.val()).find(t =>
        (t.nombre ?? '').toLowerCase().trim() === nombreNorm
      );
      if (dup) {
        showError('fNombreTarea', errNombre, 'Ya entregaste una tarea con ese nombre en esta materia. Usá un nombre diferente.');
        setLoading(false);
        return;
      }
    }

    const fecha     = new Date().toISOString().slice(0, 10);
    const timestamp = Date.now();
    const newRef    = push(ref(db, `alumnos/${_alumno.id}/inscripciones/${materiaId}/tareas`));
    await set(newRef, {
      nombre,
      archivoNombre: null,
      url:           linkTeams,
      storagePath:   null,
      comentario,
      fecha,
      subidoEn:      timestamp,
    });
    showSuccess(nombre);
  } catch (err) {
    console.error('[Tareas] Error guardando entrega:', err);
    setLoading(false);
    showError('fLinkTeams', document.getElementById('errLink'), 'Error de conexión. Intentá de nuevo.');
  }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function setBuscarLoading(on) {
  const btn = document.getElementById('btnBuscar');
  if (!btn) return;
  btn.disabled    = on;
  btn.textContent = on ? 'Buscando…' : 'Buscar';
}

function setLoading(on) {
  const btn = document.getElementById('btnEntregar');
  if (!btn) return;
  btn.disabled    = on;
  btn.textContent = on ? 'Registrando…' : 'Registrar entrega';
}

function showSuccess(nombre) {
  document.getElementById('step2')?.classList.add('hidden');
  const ok = document.getElementById('stepOk');
  if (!ok) return;
  ok.classList.remove('hidden');
  const el = document.getElementById('okDetalle');
  if (el) el.textContent = `"${nombre}" registrada correctamente. Tu docente puede ver el link en la aplicación.`;
}

function showError(inputId, errEl, msg) {
  if (inputId) document.getElementById(inputId)?.classList.add('input-error');
  if (errEl)   { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

function clearError(inputId, errEl) {
  if (inputId) document.getElementById(inputId)?.classList.remove('input-error');
  if (errEl)   errEl.classList.add('hidden');
}

function isTeamsUrl(str) {
  try {
    const url  = new URL(str);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return (
      host === 'teams.microsoft.com'           ||
      host.endsWith('.teams.microsoft.com')    ||
      host.endsWith('.sharepoint.com')         ||
      host === 'onedrive.live.com'             ||
      host.endsWith('.onedrive.live.com')      ||
      host === '1drv.ms'
    );
  } catch { return false; }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
