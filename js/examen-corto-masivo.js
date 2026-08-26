// =============================================================================
// AcadVet USAM — Carga masiva de Examen Corto
// Permite capturar la nota de Examen Corto de todos los alumnos de una materia
// en una sola pantalla (en vez de abrir el expediente de a uno).
// =============================================================================

import { addQuiz, updateQuiz, getQuizzes } from './db.js';
import { openModal, closeModal, showToast } from './ui.js';

const AREA_LABEL = { 1: 'Área 1 (15%)', 2: 'Área 2 (15%)', 3: 'Área 3 (20%)' };

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------
export function openCargarExamenCorto(materia, alumnos, { onSaved } = {}) {
  if (!alumnos.length) {
    openModal({
      title: 'Cargar Examen Corto',
      size: 'sm',
      body: `<p class="text-secondary">No hay alumnos inscritos en <strong>${esc(materia.nombre)}</strong> todavía.</p>`,
      confirmLabel: 'Cerrar',
      cancelLabel: '',
      onConfirm: () => closeModal(),
    });
    document.getElementById('modalCancelBtn')?.remove();
    return;
  }

  const alumnosOrdenados = [...alumnos].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));

  openModal({
    title: `Cargar Examen Corto — ${esc(materia.nombre)}`,
    size: 'lg',
    body: bodyHTML(alumnosOrdenados),
    confirmLabel: 'Guardar notas',
    async onConfirm() {
      await guardar(alumnosOrdenados, materia.id, onSaved);
    },
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function bodyHTML(alumnos) {
  return `
    <div class="form-group">
      <label class="form-label" for="mzArea">Área</label>
      <select class="form-input" id="mzArea">
        ${Object.entries(AREA_LABEL).map(([n, lbl]) => `<option value="${n}">${lbl}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label" for="mzNombre">Nombre del examen</label>
      <input class="form-input" id="mzNombre" type="text" placeholder="Ej. Examen Corto 1 — Anatomía">
      <span class="form-error hidden" id="mzErrNombre">Ingresá el nombre del examen.</span>
    </div>
    <div class="form-group">
      <label class="form-label" for="mzFecha">Fecha <span class="text-muted">(opcional)</span></label>
      <input class="form-input" id="mzFecha" type="date" value="${todayStr()}">
    </div>
    <div class="form-group">
      <label class="form-label">Notas (0 – 10 · dejá en blanco para omitir a un alumno)</label>
      <div class="asistfecha-list" id="mzAlumnosList" style="max-height:360px">
        ${alumnos.map(rowHTML).join('')}
      </div>
      <span class="form-error hidden" id="mzErrNotas">Revisá las notas marcadas: deben estar entre 0 y 10.</span>
    </div>
  `;
}

function rowHTML(alumno) {
  return `
    <div class="asistfecha-row" style="justify-content:space-between">
      <span class="asistfecha-row-name">${esc(alumno.nombre)}</span>
      <input class="form-input mz-nota-input" data-alumno-id="${alumno.id}"
        type="number" min="0" max="10" step="0.1" placeholder="—"
        style="width:80px;text-align:center;flex-shrink:0">
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------
async function guardar(alumnos, materiaId, onSaved) {
  const area   = Number(document.getElementById('mzArea')?.value) || 1;
  const nombre = document.getElementById('mzNombre')?.value.trim() ?? '';
  const fecha  = document.getElementById('mzFecha')?.value || null;

  document.getElementById('mzErrNombre')?.classList.add('hidden');
  document.getElementById('mzErrNotas')?.classList.add('hidden');
  document.getElementById('mzNombre')?.classList.remove('form-input--error');
  document.querySelectorAll('.mz-nota-input').forEach(i => i.classList.remove('form-input--error'));

  let ok = true;
  if (!nombre) {
    document.getElementById('mzErrNombre')?.classList.remove('hidden');
    document.getElementById('mzNombre')?.classList.add('form-input--error');
    ok = false;
  }

  const entradas = []; // { alumnoId, nota }
  document.querySelectorAll('.mz-nota-input').forEach(inp => {
    const raw = inp.value.trim();
    if (raw === '') return;
    const nota = parseFloat(raw);
    if (!Number.isFinite(nota) || nota < 0 || nota > 10) {
      inp.classList.add('form-input--error');
      ok = false;
      return;
    }
    entradas.push({ alumnoId: inp.dataset.alumnoId, nota });
  });

  if (entradas.length === 0 && ok) {
    document.getElementById('mzErrNotas')?.classList.remove('hidden');
    document.getElementById('mzErrNotas').textContent = 'Ingresá al menos una nota.';
    ok = false;
  } else if (!ok) {
    document.getElementById('mzErrNotas')?.classList.remove('hidden');
  }

  if (!ok) return;

  try {
    await Promise.all(
      entradas.map(({ alumnoId, nota }) => guardarNotaAlumno(alumnoId, materiaId, { nombre, nota, fecha, area }))
    );
    closeModal();
    showToast(`Se registraron ${entradas.length} nota${entradas.length !== 1 ? 's' : ''} de examen corto`);
    await onSaved?.();
  } catch (err) {
    console.error('[AcadVet] Error guardando examen corto masivo:', err);
    showToast('Error al guardar las notas', 'error');
  }
}

// Si el alumno ya tiene un quiz con el mismo nombre y área (ej. un molde
// creado antes sin nota), se actualiza esa entrada en vez de crear una nueva
// duplicada.
async function guardarNotaAlumno(alumnoId, materiaId, { nombre, nota, fecha, area }) {
  const existentes = await getQuizzes(alumnoId, materiaId);
  const match = existentes.find(q =>
    Number(q.area) === area &&
    (q.nombre ?? '').trim().toLowerCase() === nombre.trim().toLowerCase()
  );
  if (match) {
    await updateQuiz(alumnoId, materiaId, match.id, { nota, fecha });
  } else {
    await addQuiz(alumnoId, materiaId, { nombre, nota, fecha, area });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
