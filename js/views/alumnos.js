// =============================================================================
// AcadVet USAM — Vista: Lista de Alumnos por Materia (T05 + T06)
// Tabla con búsqueda, CRUD de alumnos, navegación al expediente
// =============================================================================

import {
  getMateria, getAlumnos, alumnosByMateria,
  createAlumno, updateAlumno,
  createInscripcion, deleteInscripcion,
  addAsistencia,
} from '../db.js';
import { openModal, closeModal, showToast } from '../ui.js';
import { navigate } from '../router.js';
import { openQRSession } from '../qr-session.js';

// --- Estado del módulo ---
let _container = null;
let _materiaId = null;
let _materia   = null;
let _alumnos   = [];       // alumnos inscritos en _materiaId (con toda su data Firebase)
let _filterTxt = '';
let _sortKey   = 'nombre'; // 'nombre' | 'promedio'

// Paleta de colores para avatares (consistente por alumno via hash)
const AVATAR_PALETTE = [
  '#6C63FF', '#00B4B5', '#FF6B6B',
  '#00B894', '#FDCB6E', '#74B9FF',
];

// ---------------------------------------------------------------------------
// Entrada pública — llamada desde app.js
// ---------------------------------------------------------------------------

export async function renderAlumnos(container, materiaId) {
  _container = container;
  _materiaId = materiaId;
  _filterTxt = '';
  _sortKey   = 'nombre';

  document.getElementById('topbarTitle').textContent = 'Alumnos';

  container.innerHTML = `<div class="loading-state">
    <div class="loading-spinner"></div><p>Cargando alumnos…</p>
  </div>`;

  try {
    const [materia, todosAlumnos] = await Promise.all([
      getMateria(materiaId),
      getAlumnos(),
    ]);

    if (!materia) { navigate('/'); return; }

    _materia = materia;
    _alumnos = alumnosByMateria(todosAlumnos, materiaId);
    paint();
  } catch (err) {
    console.error('[AcadVet] Error cargando alumnos:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3 class="empty-state__title">Error al cargar</h3>
        <p class="empty-state__text">Verificá tu conexión o la configuración de Firebase.</p>
        <button class="btn btn--primary" id="btnRetryAlumnos">Reintentar</button>
      </div>`;
    document.getElementById('btnRetryAlumnos')
      ?.addEventListener('click', () => renderAlumnos(container, materiaId));
  }
}

// ---------------------------------------------------------------------------
// Renderizado principal
// ---------------------------------------------------------------------------

function paint() {
  const filtered = applyFilter(_alumnos, _filterTxt);
  const sorted   = applySort(filtered, _sortKey);

  const secBadge = _materia.seccion
    ? `<span class="badge badge--outline">Sección ${_materia.seccion}</span>`
    : '';

  _container.innerHTML = `
    <div class="alumnos-view">

      <!-- Breadcrumb -->
      <nav class="breadcrumb" aria-label="Ubicación">
        <a href="#/" class="breadcrumb-link">Dashboard</a>
        <span class="breadcrumb-sep" aria-hidden="true">›</span>
        <span class="breadcrumb-current">${escHtml(_materia.nombre)}</span>
      </nav>

      <!-- Header -->
      <div class="view-header">
        <div>
          <h2 class="view-title">${escHtml(_materia.nombre)}</h2>
          <div class="alumnos-header-badges">
            <span class="badge badge--primary">${escHtml(_materia.ciclo)}</span>
            ${secBadge}
            <span class="badge badge--outline">
              ${_alumnos.length} alumno${_alumnos.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div class="view-header-actions">
          <button class="btn btn--secondary btn--sm" id="btnImportarQR" title="Importar asistencias desde CSV del Sistema QR">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Importar QR
          </button>
          <button class="btn btn--sm" id="btnSesionQR" title="Iniciar sesión QR de asistencia"
            style="background:linear-gradient(135deg,var(--color-accent),#009899);color:#fff;border:none;box-shadow:0 3px 12px rgba(0,210,211,0.35)">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
              <rect x="18" y="18" width="3" height="3"/>
            </svg>
            Sesión QR
          </button>
          <button class="btn btn--secondary btn--sm" id="btnExportGrupal" title="Exportar Excel grupal">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Excel grupal
          </button>
          <button class="btn btn--primary" id="btnAgregarAlumno">+ Agregar alumno</button>
          <button class="btn btn--ghost btn--sm" id="btnEliminarAlumno" style="color:var(--color-danger);border-color:var(--color-danger)">− Eliminar alumno</button>
        </div>
      </div>

      <!-- Tabla de alumnos -->
      <div class="table-wrapper">

        <!-- Toolbar: búsqueda + contador -->
        <div class="table-toolbar">
          <div class="search-input-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              class="search-input"
              id="searchAlumnos"
              type="search"
              placeholder="Buscar por nombre o carné…"
              value="${escHtml(_filterTxt)}"
              autocomplete="off"
              aria-label="Buscar alumnos"
            >
          </div>
          <span class="text-muted text-sm">
            ${filtered.length} de ${_alumnos.length} alumno${_alumnos.length !== 1 ? 's' : ''}
          </span>
        </div>

        <!-- Contenido: tabla o empty state -->
        ${sorted.length === 0 ? emptyTable() : buildTable(sorted)}

      </div>
    </div>
  `;

  wireEvents();
}

function buildTable(rows) {
  const thNombre = `Nombre ${_sortKey === 'nombre' ? '<span class="sort-arrow">↑</span>' : ''}`;

  return `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:44px">#</th>
            <th>
              <button class="sort-btn" id="sortNombre">${thNombre}</button>
            </th>
            <th>Carné</th>
            <th style="width:110px;text-align:center">Estado</th>
            <th style="width:150px;text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((a, i) => rowHTML(a, i + 1)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function rowHTML(alumno, num) {
  const estado   = getEstadoBadge(alumno);
  const initials = getInitials(alumno.nombre);
  const avatarBg = AVATAR_PALETTE[strHash(alumno.id) % AVATAR_PALETTE.length];

  return `
    <tr>
      <td class="text-muted text-sm">${num}</td>
      <td>
        <div class="alumno-cell">
          <div class="alumno-avatar" style="background:${avatarBg}" aria-hidden="true">
            ${initials}
          </div>
          <span class="alumno-nombre">${escHtml(alumno.nombre)}</span>
        </div>
      </td>
      <td>
        <span class="carnet-chip">${escHtml(alumno.carnet ?? '—')}</span>
      </td>
      <td style="text-align:center">
        <span class="badge ${estado.cls}">${estado.label}</span>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn btn--primary btn--sm"
            data-action="ver" data-id="${alumno.id}"
            title="Ver expediente">
            Ver →
          </button>
          <button class="btn btn--ghost btn--sm"
            data-action="edit" data-id="${alumno.id}"
            aria-label="Editar alumno">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn--ghost btn--sm" style="color:var(--color-danger)"
            data-action="remove" data-id="${alumno.id}"
            aria-label="Quitar alumno de esta materia">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function emptyTable() {
  if (_filterTxt) {
    return `
      <div class="empty-state" style="padding:var(--space-12)">
        <div class="empty-state__icon">🔍</div>
        <h3 class="empty-state__title">Sin resultados</h3>
        <p class="empty-state__text">
          Ningún alumno coincide con "<strong>${escHtml(_filterTxt)}</strong>".
        </p>
      </div>`;
  }
  return `
    <div class="empty-state" style="padding:var(--space-12)">
      <div class="empty-state__icon">👥</div>
      <h3 class="empty-state__title">Sin alumnos inscritos</h3>
      <p class="empty-state__text">
        Agregá el primer alumno para empezar a registrar asistencias y notas.
      </p>
      <button class="btn btn--primary" id="btnAgregarAlumnoEmpty">+ Agregar alumno</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Wire events
// ---------------------------------------------------------------------------

function wireEvents() {
  document.getElementById('btnAgregarAlumno')?.addEventListener('click', openCreateModal);
  document.getElementById('btnAgregarAlumnoEmpty')?.addEventListener('click', openCreateModal);
  document.getElementById('btnEliminarAlumno')?.addEventListener('click', openRemoveStudentModal);

  document.getElementById('btnImportarQR')?.addEventListener('click', openImportModal);

  document.getElementById('btnSesionQR')?.addEventListener('click', () => {
    openQRSession(_materia, _alumnos);
  });

  document.getElementById('btnExportGrupal')?.addEventListener('click', e => {
    exportGrupoExcel(e.currentTarget);
  });

  document.getElementById('searchAlumnos')?.addEventListener('input', e => {
    _filterTxt = e.target.value;
    paint();
  });

  document.getElementById('sortNombre')?.addEventListener('click', () => {
    _sortKey = _sortKey === 'nombre' ? 'promedio' : 'nombre';
    paint();
  });

  _container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, id } = btn.dataset;
      const alumno = _alumnos.find(a => a.id === id);
      if (!alumno) return;
      if (action === 'ver')    navigate(`/alumno/${id}?materia=${_materiaId}`);
      if (action === 'edit')   openEditModal(alumno);
      if (action === 'remove') confirmRemove(alumno);
    });
  });
}

// ---------------------------------------------------------------------------
// Crear alumno
// ---------------------------------------------------------------------------

function openCreateModal() {
  openModal({
    title: 'Agregar Alumno',
    body: formBody({}),
    confirmLabel: 'Agregar',
    async onConfirm() {
      const data = readForm();
      if (!data) return;
      try {
        const alumnoId = await createAlumno(data);
        await createInscripcion(alumnoId, _materiaId);
        closeModal();
        showToast(`${data.nombre} agregado`);
        await reload();
      } catch (err) {
        showToast('Error al agregar alumno', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Editar alumno
// ---------------------------------------------------------------------------

function openEditModal(alumno) {
  openModal({
    title: 'Editar Alumno',
    body: formBody(alumno),
    confirmLabel: 'Guardar cambios',
    async onConfirm() {
      const data = readForm();
      if (!data) return;
      try {
        await updateAlumno(alumno.id, data);
        closeModal();
        showToast('Alumno actualizado');
        await reload();
      } catch (err) {
        showToast('Error al actualizar', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Modal de selección: elegir qué alumno eliminar
// ---------------------------------------------------------------------------

function openRemoveStudentModal() {
  if (_alumnos.length === 0) {
    showToast('No hay alumnos inscritos en esta materia', 'error');
    return;
  }

  let _selected = null;

  const listItems = () => {
    const q = document.getElementById('removeSearch')?.value.toLowerCase() ?? '';
    const filtered = _alumnos.filter(a =>
      !q ||
      (a.nombre ?? '').toLowerCase().includes(q) ||
      (a.carnet  ?? '').toLowerCase().includes(q)
    );
    return filtered;
  };

  const renderList = () => {
    const items = listItems();
    const el = document.getElementById('removeAlumnoList');
    if (!el) return;

    if (items.length === 0) {
      el.innerHTML = `<p class="text-sm text-muted" style="padding:var(--space-3)">Sin resultados.</p>`;
      return;
    }

    el.innerHTML = items.map(a => {
      const initials = getInitials(a.nombre);
      const bg       = AVATAR_PALETTE[strHash(a.id) % AVATAR_PALETTE.length];
      const isActive = _selected?.id === a.id;
      return `
        <div class="remove-alumno-item${isActive ? ' remove-alumno-item--selected' : ''}"
             data-rid="${escHtml(a.id)}"
             style="display:flex;align-items:center;gap:var(--space-3);padding:10px 12px;
                    border-radius:var(--radius-md);cursor:pointer;
                    background:${isActive ? 'var(--color-danger-dim, rgba(255,107,107,.12))' : 'transparent'};
                    border:1.5px solid ${isActive ? 'var(--color-danger)' : 'transparent'};
                    transition:background .15s">
          <div style="width:32px;height:32px;border-radius:50%;background:${bg};
               display:flex;align-items:center;justify-content:center;
               font-size:.7rem;font-weight:700;color:#fff;flex-shrink:0">
            ${escHtml(initials)}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:var(--text-sm);color:var(--color-text-primary);
                 white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(a.nombre)}</div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted)">${escHtml(a.carnet ?? '—')}</div>
          </div>
          ${isActive ? `<svg viewBox="0 0 24 24" width="16" height="16" stroke="var(--color-danger)" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </div>`;
    }).join('');

    el.querySelectorAll('.remove-alumno-item').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.rid;
        _selected = _alumnos.find(a => a.id === id) ?? null;
        renderList();
        const confirmBtn = document.getElementById('modalConfirmBtn');
        if (confirmBtn) confirmBtn.disabled = !_selected;
      });
    });
  };

  openModal({
    title: 'Eliminar alumno de la materia',
    size: 'sm',
    body: `
      <p class="text-secondary text-sm" style="margin-bottom:var(--space-3)">
        Seleccioná al alumno que deseas quitar de <strong>${escHtml(_materia.nombre)}</strong>:
      </p>
      <div class="search-input-wrap" style="margin-bottom:var(--space-3)">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" id="removeSearch" type="search"
          placeholder="Buscar por nombre o carné…" autocomplete="off">
      </div>
      <div id="removeAlumnoList"
           style="max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;
                  border:1px solid var(--color-border);border-radius:var(--radius-md);padding:6px">
      </div>`,
    confirmLabel: 'Eliminar seleccionado',
    confirmVariant: 'danger',
    async onConfirm() {
      if (!_selected) return;
      confirmRemove(_selected);
    },
  });

  // Inicializar lista y búsqueda después de que el modal esté en el DOM
  setTimeout(() => {
    renderList();
    document.getElementById('removeSearch')?.addEventListener('input', renderList);
    const confirmBtn = document.getElementById('modalConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = true;
  }, 0);
}

// ---------------------------------------------------------------------------
// Quitar alumno de la materia
// ---------------------------------------------------------------------------

function confirmRemove(alumno) {
  openModal({
    title: 'Quitar alumno',
    size: 'sm',
    body: `
      <p class="text-secondary">
        ¿Quitar a <strong>${escHtml(alumno.nombre)}</strong> de
        <strong>${escHtml(_materia.nombre)}</strong>?
      </p>
      <div class="alert-warning" style="margin-top:var(--space-4)">
        ⚠️ Se eliminarán permanentemente todas sus asistencias, notas
        y observaciones en esta materia. Esta acción no se puede deshacer.
      </div>`,
    confirmLabel: 'Quitar alumno',
    confirmVariant: 'danger',
    async onConfirm() {
      try {
        await deleteInscripcion(alumno.id, _materiaId);
        closeModal();
        showToast(`${alumno.nombre} quitado de la materia`);
        await reload();
      } catch (err) {
        showToast('Error al quitar alumno', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers de formulario
// ---------------------------------------------------------------------------

function formBody({ nombre = '', carnet = '' }) {
  return `
    <div class="form-group">
      <label class="form-label" for="fNombre">Nombre completo *</label>
      <input class="form-input" id="fNombre" type="text"
        value="${escHtml(nombre)}"
        placeholder="Ej. Juan Carlos Pérez López"
        maxlength="120" autocomplete="off">
      <span class="form-error hidden" id="fNombreErr">El nombre es obligatorio.</span>
    </div>
    <div class="form-group">
      <label class="form-label" for="fCarnet">Número de carné *</label>
      <input class="form-input" id="fCarnet" type="text"
        value="${escHtml(carnet)}"
        placeholder="Ej. 2023001"
        maxlength="20" autocomplete="off">
      <span class="form-error hidden" id="fCarnetErr">El carné es obligatorio.</span>
    </div>
  `;
}

function readForm() {
  const nombre = document.getElementById('fNombre')?.value.trim() ?? '';
  const carnet = document.getElementById('fCarnet')?.value.trim() ?? '';
  let ok = true;

  const nomErr = document.getElementById('fNombreErr');
  const crnErr = document.getElementById('fCarnetErr');

  toggleError('fNombre', nomErr, !nombre, 'El nombre es obligatorio.');
  toggleError('fCarnet', crnErr, !carnet, 'El carné es obligatorio.');

  if (!nombre || !carnet) ok = false;
  return ok ? { nombre, carnet } : null;
}

function toggleError(inputId, errEl, show, _msg) {
  document.getElementById(inputId)?.classList.toggle('form-input--error', show);
  errEl?.classList.toggle('hidden', !show);
}

// ---------------------------------------------------------------------------
// Estado académico real (fórmula T12)
// ---------------------------------------------------------------------------

function getEstadoBadge(alumno) {
  const insc  = alumno.inscripciones?.[_materiaId];
  const stats = calcAlumnoStats(insc);
  return { label: stats.estadoLabel, cls: stats.estadoBadgeCls };
}

function calcAlumnoStats(insc) {
  if (!insc) return _emptyStats();

  const snap = obj => {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).map(([id, d]) => ({ id, ...d }));
  };

  const asists     = snap(insc.asistencias);
  const allQuizzes = snap(insc.quizzes);
  const parc       = insc.parciales ?? {};
  const expos      = snap(insc.exposiciones);

  // Asistencia (justificado = presente)
  const total     = asists.length;
  const efectivos = asists.filter(a => a.estado === 'presente' || a.estado === 'justificado').length;
  const asistPct  = total > 0 ? Math.round((efectivos / total) * 100) : null;

  // Quizzes por área + exposiciones en área 3
  const nums = arr => arr.map(x => x.nota).filter(n => typeof n === 'number');
  const avg  = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const promQ1 = avg(nums(allQuizzes.filter(q => Number(q.area) === 1)));
  const promQ2 = avg(nums(allQuizzes.filter(q => Number(q.area) === 2)));
  const promQ3 = avg([
    ...nums(allQuizzes.filter(q => Number(q.area) === 3)),
    ...nums(expos),
  ]);

  // Parciales /100 → /10
  const p1 = parc.parcial_1 != null ? parc.parcial_1 / 10 : null;
  const p2 = parc.parcial_2 != null ? parc.parcial_2 / 10 : null;
  const p3 = parc.parcial_3 != null ? parc.parcial_3 / 10 : null;

  const allPresent = promQ1 !== null && p1 !== null &&
                     promQ2 !== null && p2 !== null &&
                     promQ3 !== null && p3 !== null;

  const notaFinal = allPresent
    ? promQ1 * 0.15 + p1 * 0.15 + promQ2 * 0.15 + p2 * 0.15 + promQ3 * 0.20 + p3 * 0.20
    : null;

  let estadoLabel, estadoArgb, estadoBadgeCls;
  if      (notaFinal === null)  { estadoLabel = 'Sin datos';  estadoArgb = 'FF8888AA'; estadoBadgeCls = 'badge--outline'; }
  else if (notaFinal >= 6.0)    { estadoLabel = 'Aprobado';   estadoArgb = 'FF00B894'; estadoBadgeCls = 'badge--success'; }
  else if (notaFinal >= 5.0)    { estadoLabel = 'En riesgo';  estadoArgb = 'FFE17B00'; estadoBadgeCls = 'badge--warning'; }
  else                          { estadoLabel = 'Reprobado';  estadoArgb = 'FFFF6B6B'; estadoBadgeCls = 'badge--danger';  }

  const allQnotas   = [...nums(allQuizzes), ...nums(expos)];
  const parcVals    = [p1, p2, p3].filter(v => v !== null);

  return {
    asistPct:       asistPct !== null ? `${asistPct}%` : '—',
    asistNum:       asistPct,
    promQuiz:       avg(allQnotas) !== null ? avg(allQnotas).toFixed(1) : '—',
    promQuizNum:    avg(allQnotas),
    promParciales:  parcVals.length ? (avg(parcVals) * 10).toFixed(1) : '—',
    promParcNum:    parcVals.length ? avg(parcVals) * 10 : null,
    notaFinal,
    notaFinalStr:   notaFinal !== null ? notaFinal.toFixed(2) : '—',
    estadoLabel,
    estadoArgb,
    estadoBadgeCls,
  };
}

function _emptyStats() {
  return {
    asistPct: '—', asistNum: null,
    promQuiz: '—', promQuizNum: null,
    promParciales: '—', promParcNum: null,
    notaFinal: null, notaFinalStr: '—',
    estadoLabel: 'Sin datos', estadoArgb: 'FF8888AA', estadoBadgeCls: 'badge--outline',
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

async function reload() {
  const todosAlumnos = await getAlumnos();
  _alumnos = alumnosByMateria(todosAlumnos, _materiaId);
  paint();
}

function applyFilter(list, query) {
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter(a =>
    a.nombre?.toLowerCase().includes(q) ||
    a.carnet?.toLowerCase().includes(q)
  );
}

function applySort(list, key) {
  return [...list].sort((a, b) => {
    if (key === 'nombre') {
      return (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es');
    }
    if (key === 'promedio') {
      const na = calcAlumnoStats(a.inscripciones?.[_materiaId]).notaFinal ?? -1;
      const nb = calcAlumnoStats(b.inscripciones?.[_materiaId]).notaFinal ?? -1;
      return nb - na; // desc: mayor nota primero
    }
    return 0;
  });
}

function getInitials(nombre) {
  const parts = (nombre ?? '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function strHash(str) {
  return (str ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---------------------------------------------------------------------------
// EXPORTACIÓN GRUPAL EXCEL (T16)
// ---------------------------------------------------------------------------

async function exportGrupoExcel(btn) {
  const origHTML  = btn.innerHTML;
  btn.disabled    = true;
  btn.textContent = 'Generando…';

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'AcadVet USAM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Grupo', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    const COLS = 7;
    ws.columns = [
      { width: 38 }, // A Nombre
      { width: 16 }, // B Carné
      { width: 13 }, // C Asistencia
      { width: 15 }, // D Prom. Quizzes
      { width: 16 }, // E Prom. Parciales
      { width: 13 }, // F Nota Final
      { width: 13 }, // G Estado
    ];

    const C = {
      dark:    'FF2D2A6E',
      primary: 'FF6C63FF',
      even:    'FFF0F2FF',
      odd:     'FFFFFFFF',
      white:   'FFFFFFFF',
      text:    'FF1A1A2E',
      muted:   'FF8888AA',
    };

    const fgFill = a  => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
    const fnt    = (bold, size, argb = C.text) => ({ bold, size, color: { argb } });
    const aln    = (h, indent = 0) => ({ vertical: 'middle', horizontal: h, indent });

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const safe = s  => (s ?? '').replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '').trim().replace(/\s+/g, '_');
    const fechaHoy = new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' });

    let r = 1;

    // ── Header ────────────────────────────────────────────────────────────────
    const hdrRow = (rowNum, text, fontCfg) => {
      ws.getRow(rowNum).height = 22;
      ws.mergeCells(rowNum, 1, rowNum, COLS);
      const c = ws.getCell(rowNum, 1);
      c.value = text;  c.font = fontCfg;  c.fill = fgFill(C.dark);  c.alignment = aln('left', 1);
    };

    hdrRow(r++, `LISTA DE CALIFICACIONES — ${(_materia.nombre ?? '').toUpperCase()}`, fnt(true, 13, C.white));
    hdrRow(r++,
      `${_materia.ciclo ?? ''}${_materia.seccion ? '  ·  Sección ' + _materia.seccion : ''}  ·  ${fechaHoy}  ·  ${_alumnos.length} alumno${_alumnos.length !== 1 ? 's' : ''}`,
      fnt(false, 9, C.white),
    );
    ws.getRow(r).height = 8;  r++;

    // ── Column headers ────────────────────────────────────────────────────────
    ws.getRow(r).height = 18;
    ['Nombre', 'Carné', '% Asistencia', 'Prom. Quizzes', 'Prom. Parciales', 'Nota Final', 'Estado']
      .forEach((h, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = h;  c.font = fnt(true, 9.5, C.white);  c.fill = fgFill(C.primary);
        c.alignment = aln(i < 2 ? 'left' : 'center', i < 2 ? 1 : 0);
      });
    r++;

    // ── Data rows ─────────────────────────────────────────────────────────────
    const sorted = [..._alumnos].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));

    const acc = { asist: [], quiz: [], parc: [], nota: [] };

    sorted.forEach((alumno, idx) => {
      const insc  = alumno.inscripciones?.[_materiaId];
      const stats = calcAlumnoStats(insc);
      const bg    = idx % 2 === 0 ? C.even : C.odd;

      ws.getRow(r).height = 16;
      [
        [alumno.nombre ?? '—', 0, C.text,           null ],
        [alumno.carnet  ?? '—',0, C.text,           null ],
        [stats.asistPct,       1, C.text,           null ],
        [stats.promQuiz,       1, C.text,           null ],
        [stats.promParciales,  1, C.text,           null ],
        [stats.notaFinalStr,   1, C.text,           '0.00'],
        [stats.estadoLabel,    1, stats.estadoArgb, null ],
      ].forEach(([val, colGroup, argb, numFmt], i) => {
        const c = ws.getCell(r, i + 1);
        c.value = val;
        c.font  = fnt(i === 6, 9, argb);
        c.fill  = fgFill(bg);
        c.alignment = aln(i < 2 ? 'left' : 'center', i < 2 ? 1 : 0);
        if (numFmt && stats.notaFinal !== null) c.numFmt = numFmt;
      });
      r++;

      // Accumulate for averages
      if (stats.asistNum   !== null) acc.asist.push(stats.asistNum);
      if (stats.promQuizNum !== null) acc.quiz.push(stats.promQuizNum);
      if (stats.promParcNum !== null) acc.parc.push(stats.promParcNum);
      if (stats.notaFinal   !== null) acc.nota.push(stats.notaFinal);
    });

    // ── Fila de promedios grupales ─────────────────────────────────────────────
    ws.getRow(r).height = 19;
    const fmtAvg = (arr, dec = 1, suffix = '') => {
      const v = avg(arr);
      return v !== null ? v.toFixed(dec) + suffix : '—';
    };

    [
      [`PROMEDIO GRUPAL (${sorted.length} alumnos)`, false],
      ['',                                           false],
      [fmtAvg(acc.asist, 1, '%'),                   false],
      [fmtAvg(acc.quiz),                            false],
      [fmtAvg(acc.parc),                            false],
      [fmtAvg(acc.nota, 2),                         false],
      ['',                                           false],
    ].forEach(([val], i) => {
      const c = ws.getCell(r, i + 1);
      c.value = val;
      c.font  = fnt(true, 9.5, C.white);
      c.fill  = fgFill(C.dark);
      c.alignment = aln(i === 0 ? 'left' : 'center', i === 0 ? 1 : 0);
    });

    // ── Descargar ─────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href     = url;
    anchor.download = `Calificaciones_${safe(_materia.nombre)}_${safe(_materia.ciclo ?? '')}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Excel grupal generado');

  } catch (err) {
    console.error('[AcadVet] Error generando Excel grupal:', err);
    showToast('Error al generar Excel. Verificá tu conexión.', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
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

// ---------------------------------------------------------------------------
// IMPORTAR ASISTENCIAS DESDE CSV DEL SISTEMA QR (T22)
// ---------------------------------------------------------------------------

function openImportModal() {
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: 'Importar asistencias desde Sistema QR',
    body: `
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="alert-warning" style="background:var(--color-info-dim);border-color:var(--color-info);color:#1a4a7a">
          Exportá el CSV desde el Sistema QR y pegá su contenido aquí.
          El sistema detecta los alumnos de <strong>${escHtml(_materia.nombre)}</strong> por carné automáticamente.
        </div>
        <div class="form-group">
          <label class="form-label" for="impFecha">Fecha de la clase *</label>
          <input class="form-input" id="impFecha" type="date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">Contenido del CSV</label>
          <label class="btn btn--secondary btn--sm" style="cursor:pointer;width:fit-content;margin-bottom:var(--space-2)">
            📂 Abrir archivo CSV
            <input type="file" id="impFile" accept=".csv,.txt" style="display:none">
          </label>
          <textarea class="form-input" id="impCSV" rows="5"
            placeholder="#,nombre,carnet,correo,hora,estado&#10;1,Juan Pérez,2023001,,08:05,A TIEMPO"
            style="font-family:monospace;font-size:var(--text-xs);resize:vertical"></textarea>
        </div>
        <p class="form-error hidden" id="impErr"></p>
        <button class="btn btn--secondary btn--sm" id="btnImpPreview">🔍 Previsualizar</button>
        <div id="impPreview" class="hidden"></div>
      </div>`,
    confirmLabel: null,
    cancelLabel: 'Cerrar',
  });

  document.getElementById('impFile')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const ta = document.getElementById('impCSV');
      if (ta) ta.value = ev.target.result ?? '';
    };
    reader.readAsText(file, 'UTF-8');
  });

  document.getElementById('btnImpPreview')?.addEventListener('click', () => {
    const csv   = document.getElementById('impCSV')?.value.trim() ?? '';
    const fecha = document.getElementById('impFecha')?.value ?? '';
    const errEl = document.getElementById('impErr');
    if (errEl) errEl.classList.add('hidden');

    if (!fecha) {
      if (errEl) { errEl.textContent = 'Seleccioná la fecha de la clase.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (!csv) {
      if (errEl) { errEl.textContent = 'Pegá el contenido del CSV o abrí un archivo.'; errEl.classList.remove('hidden'); }
      return;
    }

    renderImportPreview(csv, fecha);
  });
}

function renderImportPreview(csvText, fecha) {
  const rows = parseQRCsv(csvText);
  if (!rows.length) {
    const e = document.getElementById('impErr');
    if (e) { e.textContent = 'No se pudo leer el CSV. Verificá que el formato sea correcto.'; e.classList.remove('hidden'); }
    return;
  }

  const matches = rows.map(row => {
    const carnet = (row.carnet ?? row['carné'] ?? row.carne ?? '').trim();
    const alumno = _alumnos.find(a =>
      (a.carnet ?? '').toLowerCase().trim() === carnet.toLowerCase()
    );
    return { ...row, carnet, alumno: alumno ?? null };
  }).filter(r => r.carnet);

  const matched   = matches.filter(r => r.alumno);
  const unmatched = matches.filter(r => !r.alumno);

  const prev = document.getElementById('impPreview');
  if (!prev) return;
  prev.classList.remove('hidden');

  prev.innerHTML = `
    <div style="display:flex;gap:var(--space-3);align-items:center;margin-bottom:var(--space-3)">
      <span class="badge badge--success">${matched.length} coincidencia${matched.length !== 1 ? 's' : ''}</span>
      ${unmatched.length ? `<span class="badge badge--warning">${unmatched.length} sin coincidencia</span>` : ''}
      <span class="text-xs text-muted">${rows.length} registros en el CSV</span>
    </div>
    ${matched.length === 0 ? `
      <p class="text-sm text-muted">
        Ningún carné del CSV coincide con los alumnos inscritos en esta materia.
      </p>` : `
      <div style="max-height:180px;overflow-y:auto;border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:var(--space-3)">
        <table class="data-table">
          <thead><tr><th>Alumno en AcadVet</th><th>Carné</th></tr></thead>
          <tbody>
            ${matched.map(r => `
              <tr>
                <td>${escHtml(r.alumno.nombre)}</td>
                <td><span class="carnet-chip">${escHtml(r.carnet)}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button class="btn btn--primary btn--sm" id="btnImpConfirm" style="width:100%">
        ✓ Importar ${matched.length} asistencia${matched.length !== 1 ? 's' : ''} — ${fecha}
      </button>`}
    ${unmatched.length ? `
      <details style="margin-top:var(--space-3)">
        <summary class="text-sm text-muted" style="cursor:pointer">
          ${unmatched.length} carné${unmatched.length !== 1 ? 's' : ''} del CSV no encontrado${unmatched.length !== 1 ? 's' : ''} en esta materia
        </summary>
        <p class="text-xs text-muted" style="margin-top:var(--space-2)">
          ${unmatched.map(r => escHtml(r.carnet)).join(', ')}
        </p>
      </details>` : ''}
  `;

  document.getElementById('btnImpConfirm')?.addEventListener('click', async function () {
    this.disabled    = true;
    this.textContent = 'Importando…';
    try {
      await Promise.all(
        matched
          .filter(r => r.alumno)
          .map(r => addAsistencia(r.alumno.id, _materiaId, { fecha, estado: 'presente' }))
      );
      closeModal();
      showToast(`${matched.length} asistencia${matched.length !== 1 ? 's' : ''} importada${matched.length !== 1 ? 's' : ''}`);
      await reload();
    } catch (err) {
      this.disabled    = false;
      this.textContent = `✓ Importar ${matched.length} asistencias — ${fecha}`;
      showToast('Error al importar. Intentá de nuevo.', 'error');
      console.error('[AcadVet] Error importando asistencias:', err);
    }
  });
}

function parseQRCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const delim = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

  const normalize = s => s.toLowerCase().trim()
    .replace(/[áä]/g,'a').replace(/[éë]/g,'e').replace(/[íï]/g,'i')
    .replace(/[óö]/g,'o').replace(/[úü]/g,'u').replace(/ñ/g,'n')
    .replace(/\s+/g,'');

  const headers = csvSplitLine(lines[0], delim).map(normalize);

  return lines.slice(1).map(line => {
    const vals = csvSplitLine(line, delim);
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
}

function csvSplitLine(line, delim) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === delim && !inQ) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}
