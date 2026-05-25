// =============================================================================
// AcadVet USAM — Portal de entrega de tareas (alumno)
// =============================================================================

import { getDatabase, ref, get, push, set }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { app } from './firebase-config.js';

const db      = getDatabase(app);
const storage = getStorage(app);

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _alumno   = null;  // { id, nombre, carnet, inscripciones }
let _materias = [];    // [{ id, nombre, ciclo }] de las que el alumno está inscrito
let _materiaId = null; // pre-seleccionada desde URL ?materia=

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  _materiaId = params.get('materia') ?? null;

  bindBuscar();
  bindFileInput();

  if (_materiaId) {
    showMateriaHint(_materiaId);
  }
});

// ---------------------------------------------------------------------------
// Paso 1: Buscar alumno por carné
// ---------------------------------------------------------------------------

function bindBuscar() {
  const btn    = document.getElementById('btnBuscar');
  const input  = document.getElementById('fCarnet');

  btn?.addEventListener('click', buscarAlumno);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') buscarAlumno(); });
}

async function buscarAlumno() {
  const carnet = document.getElementById('fCarnet')?.value.trim();
  const errEl  = document.getElementById('errCarnet');

  clearError('fCarnet', errEl);

  if (!carnet) {
    showError('fCarnet', errEl, 'Ingresá tu número de carné.');
    return;
  }

  setBuscarLoading(true);

  try {
    const snap = await get(ref(db, 'alumnos'));
    if (!snap.exists()) {
      setBuscarLoading(false);
      showError('fCarnet', errEl, 'No se encontró ningún alumno con ese carné.');
      return;
    }

    const todos = Object.entries(snap.val()).map(([id, d]) => ({ id, ...d }));
    const alumno = todos.find(a =>
      (a.carnet ?? '').toLowerCase().trim() === carnet.toLowerCase()
    );

    if (!alumno) {
      setBuscarLoading(false);
      showError('fCarnet', errEl, 'Carné no encontrado. Verificá el número e intentá de nuevo.');
      return;
    }

    _alumno = alumno;

    // Si hay materia pre-seleccionada, verificar que el alumno esté inscrito
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
    const m = snap.val();
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

  // Materia selector
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
    sel.disabled = true;
  } else {
    sel.innerHTML = `<option value="">— Seleccioná la materia —</option>` +
      _materias.map(m =>
        `<option value="${escHtml(m.id)}"${_materiaId === m.id ? ' selected' : ''}>
          ${escHtml(m.nombre)}${m.seccion ? ' — Sección ' + m.seccion : ''} (${escHtml(m.ciclo)})
        </option>`
      ).join('');
  }

  bindEntregar();
}

// ---------------------------------------------------------------------------
// Archivo seleccionado: mostrar nombre
// ---------------------------------------------------------------------------

function bindFileInput() {
  document.getElementById('fArchivo')?.addEventListener('change', e => {
    const file     = e.target.files?.[0];
    const labelEl  = document.getElementById('archivoNombre');
    const errEl    = document.getElementById('errArchivo');
    clearError(null, errEl);

    if (!file) {
      if (labelEl) labelEl.textContent = 'Ningún archivo seleccionado';
      return;
    }

    if (file.type !== 'application/pdf') {
      if (labelEl) labelEl.textContent = 'Archivo inválido';
      showError(null, errEl, 'Solo se aceptan archivos PDF.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      if (labelEl) labelEl.textContent = 'Archivo muy grande';
      showError(null, errEl, `El archivo supera el límite de 20 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      e.target.value = '';
      return;
    }

    if (labelEl) labelEl.textContent = file.name;
  });
}

// ---------------------------------------------------------------------------
// Paso 3: Subir tarea
// ---------------------------------------------------------------------------

function bindEntregar() {
  document.getElementById('btnEntregar')?.addEventListener('click', subirTarea);
}

async function subirTarea() {
  const materiaId = document.getElementById('fMateria')?.value;
  const nombre    = document.getElementById('fNombreTarea')?.value.trim();
  const comentario = document.getElementById('fComentario')?.value.trim() ?? '';
  const file      = document.getElementById('fArchivo')?.files?.[0];

  let ok = true;

  const errMateria = document.getElementById('errMateria');
  const errNombre  = document.getElementById('errNombre');
  const errArchivo = document.getElementById('errArchivo');
  clearError('fMateria', errMateria);
  clearError('fNombreTarea', errNombre);
  clearError(null, errArchivo);

  if (!materiaId) {
    showError('fMateria', errMateria, 'Seleccioná la materia.');
    ok = false;
  }
  if (!nombre) {
    showError('fNombreTarea', errNombre, 'El nombre de la tarea es obligatorio.');
    ok = false;
  }
  if (!file) {
    showError(null, errArchivo, 'Seleccioná un archivo PDF.');
    ok = false;
  }

  if (!ok) return;

  // Verificar doble que la materia sea válida para este alumno
  if (!_alumno.inscripciones?.[materiaId]) {
    showError('fMateria', errMateria, 'No estás inscrito en esa materia.');
    return;
  }

  setEntregarLoading(true);

  try {
    const fecha       = new Date().toISOString().slice(0, 10);
    const timestamp   = Date.now();
    const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `tareas/${_alumno.id}/${materiaId}/${timestamp}_${safeName}`;

    // Upload con progreso
    const fileRef  = sRef(storage, storagePath);
    const uploadTask = uploadBytesResumable(fileRef, file, { contentType: 'application/pdf' });

    await new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        snap => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          updateProgress(pct);
        },
        reject,
        resolve,
      );
    });

    updateProgress(100);

    const url = await getDownloadURL(fileRef);

    // Guardar metadatos en RTDB
    const newRef = push(ref(db, `alumnos/${_alumno.id}/inscripciones/${materiaId}/tareas`));
    await set(newRef, {
      nombre,
      archivoNombre: file.name,
      url,
      storagePath,
      comentario,
      fecha,
      subidoEn: timestamp,
    });

    showSuccess(nombre, file.name);

  } catch (err) {
    console.error('[Tareas] Error subiendo tarea:', err);
    setEntregarLoading(false);
    const errArchivo2 = document.getElementById('errArchivo');
    showError(null, errArchivo2, 'Error al subir el archivo. Verificá tu conexión e intentá de nuevo.');
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

function setEntregarLoading(on) {
  const btn  = document.getElementById('btnEntregar');
  const prog = document.getElementById('progressWrap');
  if (btn)  { btn.disabled = on; btn.textContent = on ? 'Subiendo…' : 'Entregar tarea'; }
  if (prog) prog.classList.toggle('hidden', !on);
}

function updateProgress(pct) {
  const bar  = document.getElementById('progressBar');
  const text = document.getElementById('progressText');
  if (bar)  bar.style.width = `${pct}%`;
  if (text) text.textContent = `${pct}%`;
}

function showSuccess(nombre, archivoNombre) {
  document.getElementById('step2')?.classList.add('hidden');
  const ok = document.getElementById('stepOk');
  if (!ok) return;
  ok.classList.remove('hidden');
  const el = document.getElementById('okDetalle');
  if (el) el.textContent = `"${nombre}" (${archivoNombre}) entregado correctamente.`;
}

function showError(inputId, errEl, msg) {
  if (inputId) document.getElementById(inputId)?.classList.add('input-error');
  if (errEl)   { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

function clearError(inputId, errEl) {
  if (inputId) document.getElementById(inputId)?.classList.remove('input-error');
  if (errEl)   errEl.classList.add('hidden');
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
