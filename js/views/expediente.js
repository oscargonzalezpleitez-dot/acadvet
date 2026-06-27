// =============================================================================
// AcadVet USAM — Vista: Expediente Individual del Alumno
// Shell con tabs + Tab Asistencias completa (T07)
// T08-T11 agregan las tabs restantes. T12 conecta nota final.
// =============================================================================

import {
  getAlumno, getMateria, getInscripcion,
  addAsistencia, updateAsistencia, deleteAsistencia,
  addQuiz, updateQuiz, deleteQuiz,
  addExposicion, updateExposicion, deleteExposicion,
  updateParciales, updateObservaciones,
  getTareas, deleteTarea,
  getCuestionariosResultadosByCarnet,
  getLabReportsByCarnet, deleteLabReport,
} from '../db.js';
import { openModal, closeModal, showToast } from '../ui.js';
import { navigate } from '../router.js';

// ---------------------------------------------------------------------------
// Estado del módulo
// ---------------------------------------------------------------------------
let _container = null;
let _alumnoId  = null;
let _materiaId = null;
let _alumno    = null;
let _materia   = null;
let _insc      = null;   // snapshot completo de la inscripción
let _tab       = 'asistencias';

// Tabs registradas: { id, label, icon, paintFn }
const TABS = [
  { id: 'asistencias',  label: 'Asistencias',    icon: '📅' },
  { id: 'quizzes',      label: 'Ex. Cortos',      icon: '📝' },
  { id: 'parciales',    label: 'Parciales',        icon: '📊' },
  { id: 'exposiciones', label: 'Exposiciones',     icon: '🎤' },
  { id: 'observaciones',label: 'Observaciones',    icon: '📌' },
  { id: 'tareas',       label: 'Tareas',           icon: '📋' },
  { id: 'labreports',   label: 'Prácticas',        icon: '🔬' },
];

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export async function renderExpediente(container, alumnoId, materiaId) {
  _container = container;
  _alumnoId  = alumnoId;
  _materiaId = materiaId;
  _tab       = 'asistencias';

  document.getElementById('topbarTitle').textContent = 'Expediente';

  container.innerHTML = `<div class="loading-state">
    <div class="loading-spinner"></div><p>Cargando expediente…</p>
  </div>`;

  try {
    const [alumno, materia, insc] = await Promise.all([
      getAlumno(alumnoId),
      getMateria(materiaId),
      getInscripcion(alumnoId, materiaId),
    ]);

    if (!alumno || !materia) { navigate('/'); return; }
    if (!insc)  { navigate(`/materia/${materiaId}`); return; }

    _alumno = alumno;
    _materia = materia;
    _insc    = insc;

    paintShell();
  } catch (err) {
    console.error('[AcadVet] Error cargando expediente:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3 class="empty-state__title">Error al cargar</h3>
        <p class="empty-state__text">Verificá tu conexión o volvé al listado.</p>
        <div style="display:flex;gap:var(--space-3);justify-content:center">
          <button class="btn btn--secondary" onclick="history.back()">← Volver</button>
          <button class="btn btn--primary" id="btnRetryExp">Reintentar</button>
        </div>
      </div>`;
    document.getElementById('btnRetryExp')
      ?.addEventListener('click', () => renderExpediente(container, alumnoId, materiaId));
  }
}

// ---------------------------------------------------------------------------
// Shell completo
// ---------------------------------------------------------------------------

function paintShell() {
  const stats    = calcStats();
  const initials = getInitials(_alumno.nombre);
  const avatarBg = AVATAR_PALETTE[strHash(_alumno.id) % AVATAR_PALETTE.length];
  const secBadge = _materia.seccion
    ? `<span class="badge badge--outline">Sección ${_materia.seccion}</span>`
    : '';

  _container.innerHTML = `
    <div class="expediente-view">

      <!-- Breadcrumb -->
      <nav class="breadcrumb" aria-label="Ubicación">
        <a href="#/" class="breadcrumb-link">Dashboard</a>
        <span class="breadcrumb-sep">›</span>
        <a href="#/materia/${_materiaId}" class="breadcrumb-link">${escHtml(_materia.nombre)}</a>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current">${escHtml(_alumno.nombre)}</span>
      </nav>

      <!-- Header del alumno -->
      <div class="exp-header">
        <div class="exp-alumno-info">
          <div class="exp-avatar" style="background:${avatarBg}" aria-hidden="true">
            ${initials}
          </div>
          <div class="exp-alumno-text">
            <h2 class="exp-nombre">${escHtml(_alumno.nombre)}</h2>
            <div class="exp-meta">
              <span class="carnet-chip">${escHtml(_alumno.carnet ?? '—')}</span>
              <span class="badge badge--primary">${escHtml(_materia.ciclo)}</span>
              ${secBadge}
              <span class="text-muted text-sm">${escHtml(_materia.nombre)}</span>
            </div>
          </div>
        </div>

        <!-- Botones de exportación (T13-T15) -->
        <div class="exp-export-btns">
          ${sessionStorage.getItem('acadvet_auth') === 'eps'
            ? '<span style="font-size:.78rem;color:var(--color-text-muted)">🔒 Descargas no disponibles en sesión EPS</span>'
            : `<button class="btn btn--secondary btn--sm exp-export-btn" data-fmt="pdf" title="Exportar PDF">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
          <button class="btn btn--secondary btn--sm exp-export-btn" data-fmt="word" title="Exportar Word">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Word
          </button>
          <button class="btn btn--secondary btn--sm exp-export-btn" data-fmt="excel" title="Exportar Excel">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>`}
        </div>
      </div>

      <!-- Panel de estadísticas -->
      <div class="exp-stats" id="expStats">
        ${statsHTML(stats)}
      </div>

      <!-- Tabs -->
      <div class="tabs-nav" role="tablist">
        ${TABS.map(t => `
          <button
            class="tab-btn${_tab === t.id ? ' active' : ''}"
            data-tab="${t.id}"
            role="tab"
            aria-selected="${_tab === t.id}"
          >
            <span aria-hidden="true">${t.icon}</span>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </div>

      <!-- Contenido de la tab activa -->
      <div class="tab-content" id="tabContent" role="tabpanel">
      </div>

    </div>
  `;

  wireShellEvents();
  paintTabContent();
}

// Actualiza SOLO el panel de stats (sin re-renderizar el shell completo)
function refreshStats() {
  const el = document.getElementById('expStats');
  if (el) el.innerHTML = statsHTML(calcStats());
}

function statsHTML(s) {
  const notaFinalCls = s.notaFinal !== '—' ? notaColorCls(parseFloat(s.notaFinal)) : 'nota--neutral';
  return `
    <div class="exp-stat-card">
      <span class="exp-stat-num">${s.asistPct}</span>
      <span class="exp-stat-label">Asistencia</span>
    </div>
    <div class="exp-stat-card">
      <span class="exp-stat-num">${s.promQuiz}</span>
      <span class="exp-stat-label">Prom. Quizzes</span>
    </div>
    <div class="exp-stat-card">
      <span class="exp-stat-num">${s.promParciales}</span>
      <span class="exp-stat-label">Prom. Parciales</span>
    </div>
    <div class="exp-stat-card">
      <span class="exp-stat-num ${notaFinalCls}">${s.notaFinal}</span>
      <span class="exp-stat-label">Nota Final</span>
    </div>
    <div class="exp-stat-card exp-stat-card--estado ${s.estadoCls}">
      <span class="exp-stat-num exp-stat-estado">${s.estadoLabel}</span>
      <span class="exp-stat-label">Estado</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function wireShellEvents() {
  // Cambio de tab
  _container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      _container.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === _tab);
        b.setAttribute('aria-selected', b.dataset.tab === _tab);
      });
      paintTabContent();
    });
  });

  // Exportaciones
  _container.querySelectorAll('.exp-export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fmt = btn.dataset.fmt;
      if      (fmt === 'pdf')   exportPDF(btn);
      else if (fmt === 'word')  exportWord(btn);
      else if (fmt === 'excel') exportExcel(btn);
      else showToast(`Exportación ${fmt.toUpperCase()} — disponible próximamente`, 'info');
    });
  });
}

function paintTabContent() {
  const el = document.getElementById('tabContent');
  if (!el) return;
  const _catchTab = p => Promise.resolve(p).catch(err =>
    console.error('[AcadVet] Error renderizando tab:', err)
  );
  switch (_tab) {
    case 'asistencias':   paintAsistencias(el);          break;
    case 'quizzes':       _catchTab(paintQuizzes(el));   break;
    case 'parciales':     paintParciales(el);            break;
    case 'exposiciones':  paintExposiciones(el);         break;
    case 'observaciones': paintObservaciones(el);        break;
    case 'tareas':        _catchTab(paintTareas(el));    break;
    case 'labreports':    _catchTab(paintLabReports(el));break;
  }
}

// ---------------------------------------------------------------------------
// TAB: ASISTENCIAS
// ---------------------------------------------------------------------------

function paintAsistencias(el) {
  const asists  = snapToArray(_insc.asistencias).sort(sortByFechaDesc);
  const summary = calcAsistSummary(asists);

  // Agrupar por fecha para mostrar estado combinado inicio/fin
  const byDate = {};
  for (const a of asists) {
    const f = a.fecha ?? 'sin-fecha';
    if (!byDate[f]) byDate[f] = [];
    byDate[f].push(a);
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const listHTML = dates.map(fecha => {
    const entries  = byDate[fecha];
    const hasInicio = entries.some(a => a.checkType === 'inicio');
    const hasFin    = entries.some(a => a.checkType === 'fin');
    const hasMixed  = hasInicio || hasFin;

    let headerHtml = '';
    if (hasMixed) {
      let combinedBadge;
      if (hasInicio && hasFin) {
        combinedBadge = `<span class="badge asist-combined-badge asist-combined--full">✓ Ambos registros</span>`;
      } else if (hasInicio) {
        combinedBadge = `<span class="badge asist-combined-badge asist-combined--partial">Solo Inicio</span>`;
      } else {
        combinedBadge = `<span class="badge asist-combined-badge asist-combined--partial">Solo Fin</span>`;
      }
      headerHtml = `<div class="asist-date-header">${combinedBadge}</div>`;
    }
    return `<div class="asist-date-group">${headerHtml}${entries.map(a => asistRowHTML(a)).join('')}</div>`;
  }).join('');

  el.innerHTML = `
    <div class="tab-section">

      <!-- Toolbar -->
      <div class="tab-toolbar">
        <div class="asist-summary-chips">
          <span class="asist-chip asist-chip--total">${summary.total} clases</span>
          <span class="asist-chip asist-chip--presente">${summary.presentes} presentes</span>
          ${summary.justificados > 0 ? `<span class="asist-chip asist-chip--justificado">${summary.justificados} justificados</span>` : ''}
          <span class="asist-chip asist-chip--ausente">${summary.ausentes} ausentes</span>
          <span class="asist-chip asist-chip--pct">${summary.pct}%</span>
        </div>
        <button class="btn btn--primary btn--sm" id="btnAddAsist">+ Agregar</button>
      </div>

      <!-- Lista de asistencias agrupada por fecha -->
      ${asists.length === 0
        ? `<div class="empty-state" style="padding:var(--space-10)">
             <div class="empty-state__icon">📅</div>
             <h3 class="empty-state__title">Sin asistencias registradas</h3>
             <p class="empty-state__text">Empezá registrando la primera clase.</p>
           </div>`
        : `<div class="asist-list">${listHTML}</div>`
      }

    </div>
  `;

  document.getElementById('btnAddAsist')?.addEventListener('click', () => openAsistModal());

  el.querySelectorAll('[data-asist-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { asistAction: action, asistId: id } = btn.dataset;
      const asist = snapToArray(_insc.asistencias).find(a => a.id === id);
      if (!asist) return;
      if (action === 'edit')   openAsistModal(asist);
      if (action === 'delete') confirmDeleteAsist(asist);
    });
  });
}

function asistRowHTML(asist) {
  const cfg = ESTADO_CONFIG[asist.estado] ?? ESTADO_CONFIG.ausente;
  const ct = asist.checkType;
  const ctChip = (ct && ct !== 'unico')
    ? `<span class="asist-ct-chip asist-ct-chip--${ct}">${ct === 'inicio' ? '🟢 Inicio' : '🔴 Fin'}</span>`
    : '';
  return `
    <div class="asist-row">
      <div class="asist-estado-dot" style="background:${cfg.dot}" title="${cfg.label}"></div>
      <div class="asist-fecha">${formatFecha(asist.fecha)}</div>
      ${ctChip}
      <span class="badge ${cfg.badgeCls}">${cfg.label}</span>
      <div class="asist-row-actions">
        <button class="btn btn--ghost btn--sm"
          data-asist-action="edit" data-asist-id="${asist.id}"
          aria-label="Editar asistencia">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn--ghost btn--sm" style="color:var(--color-danger)"
          data-asist-action="delete" data-asist-id="${asist.id}"
          aria-label="Eliminar asistencia">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// --- Modal agregar/editar asistencia ---
function openAsistModal(asist = null) {
  const isEdit   = !!asist;
  const defFecha = asist?.fecha ?? todayStr();
  const defState = asist?.estado ?? 'presente';

  openModal({
    title: isEdit ? 'Editar Asistencia' : 'Nueva Asistencia',
    size:  'sm',
    body: `
      <div class="form-group">
        <label class="form-label" for="fAsistFecha">Fecha</label>
        <input class="form-input" id="fAsistFecha" type="date" value="${defFecha}">
        <span class="form-error hidden" id="fAsistFechaErr">La fecha es obligatoria.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="fAsistEstado">Estado</label>
        <select class="form-input" id="fAsistEstado">
          <option value="presente"    ${defState === 'presente'    ? 'selected' : ''}>✓ Presente</option>
          <option value="ausente"     ${defState === 'ausente'     ? 'selected' : ''}>✕ Ausente</option>
          <option value="justificado" ${defState === 'justificado' ? 'selected' : ''}>⚡ Justificado</option>
        </select>
      </div>`,
    confirmLabel: isEdit ? 'Guardar cambios' : 'Registrar',
    async onConfirm() {
      const fecha  = document.getElementById('fAsistFecha')?.value;
      const estado = document.getElementById('fAsistEstado')?.value;
      const errEl  = document.getElementById('fAsistFechaErr');

      if (!fecha) {
        errEl?.classList.remove('hidden');
        document.getElementById('fAsistFecha')?.classList.add('form-input--error');
        return;
      }

      try {
        if (isEdit) {
          await updateAsistencia(_alumnoId, _materiaId, asist.id, { fecha, estado });
          showToast('Asistencia actualizada');
        } else {
          await addAsistencia(_alumnoId, _materiaId, { fecha, estado });
          showToast('Asistencia registrada');
        }
        closeModal();
        await reloadInsc();
        refreshStats();
        paintTabContent();
      } catch (err) {
        showToast('Error al guardar asistencia', 'error');
        console.error(err);
      }
    },
  });
}

// --- Confirmar eliminar asistencia ---
function confirmDeleteAsist(asist) {
  openModal({
    title: 'Eliminar asistencia',
    size: 'sm',
    body: `<p class="text-secondary">
      ¿Eliminar el registro del
      <strong>${formatFecha(asist.fecha)}</strong>?
    </p>`,
    confirmLabel: 'Eliminar',
    confirmVariant: 'danger',
    async onConfirm() {
      try {
        await deleteAsistencia(_alumnoId, _materiaId, asist.id);
        closeModal();
        showToast('Asistencia eliminada');
        await reloadInsc();
        refreshStats();
        paintTabContent();
      } catch (err) {
        showToast('Error al eliminar', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// TAB: EXÁMENES CORTOS (T08)
// ---------------------------------------------------------------------------

async function paintQuizzes(el) {
  const allQuizzes = snapToArray(_insc.quizzes);
  const byArea = n => allQuizzes.filter(q => Number(q.area) === n).sort(sortByFechaDesc);
  const a1 = byArea(1), a2 = byArea(2), a3 = byArea(3);

  el.innerHTML = `
    <div class="tab-section">
      ${quizAreaHTML(1, 15, a1, 3)}
      ${quizAreaHTML(2, 15, a2, 3)}
      ${quizAreaHTML(3, 20, a3, 4)}
      <p class="text-muted text-xs" style="margin-top:var(--space-3);text-align:center">
        Área 3 también incluye la exposición — registrala en la pestaña Exposiciones.
      </p>
    </div>
    <div id="cuestionariosEnLinea" style="margin-top:var(--space-6)">
      <div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:var(--text-sm)">
        Cargando cuestionarios en línea…
      </div>
    </div>
  `;

  [1, 2, 3].forEach(n => {
    el.querySelector(`[data-add-quiz-area="${n}"]`)
      ?.addEventListener('click', () => openNotaModal('quiz', null, n));
  });
  wireNotaActions(el, 'quiz', allQuizzes);

  // Cargar resultados de cuestionarios en línea para este alumno
  try {
    const resultados = await getCuestionariosResultadosByCarnet(_alumno.carnet);
    console.log('[Expediente] Carné alumno:', _alumno.carnet, '| Resultados encontrados:', resultados.length);
    paintCuestionariosEnLinea(resultados);
  } catch (err) {
    console.error('[Expediente] Error cargando cuestionarios en línea:', err);
    document.getElementById('cuestionariosEnLinea').innerHTML = '';
  }
}

function quizAreaHTML(areaNum, pct, quizzes, maxCount) {
  const labels = ['', 'Área 1', 'Área 2', 'Área 3'];
  const prom = calcProm(quizzes.map(q => q.nota));
  return `
    <div class="quiz-area-section">
      <div class="quiz-area-header">
        <div class="quiz-area-title">
          <span class="quiz-area-label">${labels[areaNum]}</span>
          <span class="badge badge--outline">${pct}%</span>
          ${prom !== null
            ? `<span class="quiz-area-prom ${notaColorCls(prom)}">Prom: ${prom.toFixed(1)}</span>`
            : `<span class="text-muted text-xs">${quizzes.length}/${maxCount} quizzes</span>`}
        </div>
        <button class="btn btn--secondary btn--sm" data-add-quiz-area="${areaNum}">+ Quiz</button>
      </div>
      ${quizzes.length === 0
        ? `<p class="quiz-area-empty">Sin quizzes — se esperan ${maxCount}.</p>`
        : `<div class="nota-list">${quizzes.map(q => notaRowHTML(q, 'quiz')).join('')}</div>`}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Cuestionarios en línea — sección dentro del tab Ex. Cortos
// ---------------------------------------------------------------------------

function paintCuestionariosEnLinea(resultados) {
  const el = document.getElementById('cuestionariosEnLinea');
  if (!el) return;

  if (!resultados.length) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div style="border-top:2px solid var(--color-border);padding-top:var(--space-5)">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-4)">
        <span style="font-size:var(--text-sm);font-weight:700;color:var(--color-text-secondary)">
          💻 Cuestionarios en línea completados
        </span>
        <span class="badge badge--outline">${resultados.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        ${resultados.map((r, i) => {
          const notaConvertida = Math.round((r.porcentaje ?? 0) / 10 * 10) / 10;
          const cls  = notaConvertida >= 6 ? 'nota--great' : 'nota--low';
          const fecha = r.submitTime
            ? new Date(r.submitTime).toLocaleDateString('es-SV')
            : '—';
          return `
            <div style="display:flex;align-items:center;gap:var(--space-3);
                 background:var(--color-surface-2);border:1px solid var(--color-border);
                 border-radius:var(--radius-md);padding:12px 14px">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:var(--text-sm);color:var(--color-text-primary);
                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${escHtml(r.cuestionarioNombre || '—')}
                </div>
                <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px">
                  📅 ${fecha} &nbsp;·&nbsp; ${r.puntos ?? '—'}/${r.puntosTotal ?? '—'} pts (${r.porcentaje ?? 0}%)
                </div>
              </div>
              <span class="${cls}" style="font-weight:800;font-size:var(--text-sm);flex-shrink:0">
                ${notaConvertida.toFixed(1)}
              </span>
              <div style="flex-shrink:0;display:flex;gap:var(--space-2)">
                <button class="btn btn--secondary btn--sm cuest-reg-btn"
                  data-idx="${i}"
                  data-nombre="${escHtml(r.cuestionarioNombre || 'Cuestionario en línea')}"
                  data-nota="${notaConvertida}"
                  data-fecha="${r.submitTime ? new Date(r.submitTime).toISOString().slice(0,10) : ''}">
                  Registrar en área…
                </button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;

  el.querySelectorAll('.cuest-reg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.nombre;
      const nota   = parseFloat(btn.dataset.nota);
      const fecha  = btn.dataset.fecha || null;
      openRegistrarCuestionarioModal(nombre, nota, fecha);
    });
  });
}

function openRegistrarCuestionarioModal(nombre, nota, fecha) {
  openModal({
    title: 'Registrar cuestionario en Ex. Cortos',
    size:  'sm',
    body: `
      <p style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-bottom:var(--space-4)">
        <strong>${escHtml(nombre)}</strong><br>
        Nota calculada: <strong>${nota.toFixed(1)} / 10</strong>
      </p>
      <div class="form-group" style="margin-bottom:var(--space-4)">
        <label class="form-label">Registrar en</label>
        <select class="form-input" id="cuest-area-sel">
          <option value="1">Área 1 (15%)</option>
          <option value="2">Área 2 (15%)</option>
          <option value="3">Área 3 (20%)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Nota (0–10) <span class="text-muted">— ajustá si es necesario</span></label>
        <input class="form-input" id="cuest-nota-inp" type="number" min="0" max="10" step="0.1" value="${nota}">
        <span class="form-error hidden" id="cuest-nota-err">Ingresá una nota entre 0 y 10.</span>
      </div>`,
    confirmLabel: 'Registrar',
    async onConfirm() {
      const area     = Number(document.getElementById('cuest-area-sel')?.value ?? 1);
      const notaFinal = parseFloat(document.getElementById('cuest-nota-inp')?.value ?? nota);
      const errEl    = document.getElementById('cuest-nota-err');

      if (isNaN(notaFinal) || notaFinal < 0 || notaFinal > 10) {
        errEl?.classList.remove('hidden');
        return;
      }

      try {
        await addQuiz(_alumnoId, _materiaId, { nombre, nota: notaFinal, fecha, area });
        closeModal();
        showToast('Quiz registrado en Ex. Cortos');
        await reloadInsc();
        refreshStats();
        paintTabContent();
      } catch (err) {
        showToast('Error al registrar', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// TAB: PARCIALES (T09)
// ---------------------------------------------------------------------------

function paintParciales(el) {
  const parc = _insc.parciales ?? {};
  const vals = [parc.parcial_1, parc.parcial_2, parc.parcial_3]
    .filter(v => v !== null && v !== undefined);
  const prom = vals.length
    ? vals.reduce((a, b) => a + b, 0) / vals.length
    : null;

  const labels = ['I', 'II', 'III'];
  const cardsHTML = [1, 2, 3].map(n => {
    const val = parc[`parcial_${n}`] ?? '';
    const haVal = val !== '';
    return `
      <div class="parcial-card">
        <div class="parcial-card__label">Parcial ${labels[n - 1]}</div>
        <input
          class="form-input parcial-input"
          id="fParcial${n}"
          type="number" min="0" max="100" step="0.1"
          placeholder="0 – 100"
          value="${val}"
        >
        ${haVal ? `
          <div class="nota-bar-wrap">
            <div class="nota-bar ${notaColorCls100(val)}" style="width:${Math.min(val, 100)}%"></div>
          </div>` : ''}
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="tab-section">
      <div class="parciales-grid">${cardsHTML}</div>
      <div class="parciales-footer">
        <div class="nota-summary">
          <span class="nota-summary-label">Promedio parciales</span>
          <span class="nota-summary-val ${notaColorCls100(prom)}">${prom !== null ? prom.toFixed(1) : '—'}</span>
        </div>
        <button class="btn btn--primary" id="btnSaveParciales">Guardar parciales</button>
      </div>
    </div>
  `;

  document.getElementById('btnSaveParciales')?.addEventListener('click', saveParciales);
}

async function saveParciales() {
  const v1 = parseFloatOrNull(document.getElementById('fParcial1')?.value);
  const v2 = parseFloatOrNull(document.getElementById('fParcial2')?.value);
  const v3 = parseFloatOrNull(document.getElementById('fParcial3')?.value);

  for (const [label, val] of [['Parcial I', v1], ['Parcial II', v2], ['Parcial III', v3]]) {
    if (val !== null && (val < 0 || val > 100)) {
      showToast(`${label}: la nota debe estar entre 0 y 100`, 'error');
      return;
    }
  }

  const btn = document.getElementById('btnSaveParciales');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    await updateParciales(_alumnoId, _materiaId, { parcial_1: v1, parcial_2: v2, parcial_3: v3 });
    showToast('Parciales guardados');
    await reloadInsc();
    refreshStats();
    paintTabContent();
  } catch (err) {
    showToast('Error al guardar parciales', 'error');
    console.error(err);
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar parciales'; }
  }
}

// ---------------------------------------------------------------------------
// TAB: EXPOSICIONES (T10)
// ---------------------------------------------------------------------------

function paintExposiciones(el) {
  const expos = snapToArray(_insc.exposiciones).sort(sortByFechaDesc);
  const prom  = calcProm(expos.map(e => e.nota));

  el.innerHTML = `
    <div class="tab-section">
      <div class="tab-toolbar">
        <div class="nota-summary">
          <span class="nota-summary-label">Promedio</span>
          <span class="nota-summary-val ${notaColorCls(prom)}">${prom !== null ? prom.toFixed(1) : '—'}</span>
          <span class="nota-summary-count">${expos.length} exposición${expos.length !== 1 ? 'es' : ''}</span>
        </div>
        <button class="btn btn--primary btn--sm" id="btnAddExpo">+ Agregar</button>
      </div>
      ${expos.length === 0
        ? emptyTabState('🎤', 'Sin exposiciones', 'Registrá la primera exposición del alumno.')
        : `<div class="nota-list">${expos.map(e => notaRowHTML(e, 'expo')).join('')}</div>`
      }
    </div>
  `;

  document.getElementById('btnAddExpo')?.addEventListener('click', () => openNotaModal('expo'));
  wireNotaActions(el, 'expo', expos);
}

// ---------------------------------------------------------------------------
// TAB: OBSERVACIONES (T11)
// ---------------------------------------------------------------------------

function paintObservaciones(el) {
  const obs = _insc.observaciones ?? '';

  el.innerHTML = `
    <div class="tab-section">
      <p class="text-secondary text-sm obs-hint">Notas personales sobre el desempeño del alumno. Se guardan en Firebase.</p>
      <div class="form-group" style="margin-top:var(--space-3)">
        <textarea
          class="form-input obs-textarea"
          id="fObservaciones"
          rows="8"
          placeholder="Escribe tus observaciones aquí…"
        >${escHtml(obs)}</textarea>
      </div>
      <div class="obs-footer">
        <span class="obs-saved-hint" id="obsSavedHint">Guardado ✓</span>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn--ghost btn--sm" id="btnClearObs" style="color:var(--color-danger)" ${!obs ? 'disabled' : ''}>
            Borrar
          </button>
          <button class="btn btn--primary" id="btnSaveObs">Guardar observaciones</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnSaveObs')?.addEventListener('click', saveObservaciones);

  document.getElementById('btnClearObs')?.addEventListener('click', () => {
    openModal({
      title: 'Borrar observaciones',
      size:  'sm',
      body:  `<p class="text-secondary">¿Borrar todas las observaciones de <strong>${escHtml(_alumno.nombre)}</strong>?</p>`,
      confirmLabel:   'Borrar',
      confirmVariant: 'danger',
      async onConfirm() {
        try {
          await updateObservaciones(_alumnoId, _materiaId, '');
          _insc = { ..._insc, observaciones: '' };
          closeModal();
          showToast('Observaciones borradas');
          paintTabContent();
        } catch (err) {
          showToast('Error al borrar observaciones', 'error');
          console.error(err);
        }
      },
    });
  });
}

async function saveObservaciones() {
  const txt = document.getElementById('fObservaciones')?.value ?? '';
  const btn = document.getElementById('btnSaveObs');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    await updateObservaciones(_alumnoId, _materiaId, txt);
    _insc = { ..._insc, observaciones: txt };
    const hint = document.getElementById('obsSavedHint');
    if (hint) {
      hint.style.opacity = '1';
      setTimeout(() => { hint.style.opacity = '0'; }, 2500);
    }
    showToast('Observaciones guardadas');
  } catch (err) {
    showToast('Error al guardar observaciones', 'error');
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar observaciones'; }
  }
}

// ---------------------------------------------------------------------------
// CRUD genérico: Quizzes y Exposiciones
// ---------------------------------------------------------------------------

function notaRowHTML(item, type) {
  const isQuiz = type === 'quiz';
  const nombre = escHtml(isQuiz ? (item.nombre ?? '—') : (item.tema ?? '—'));
  const nota   = item.nota ?? 0;
  const fecha  = item.fecha ? formatFecha(item.fecha) : null;
  const pct    = Math.min((nota / 10) * 100, 100);
  const notaCls = notaColorCls(nota);

  return `
    <div class="nota-row">
      <div class="nota-row__info">
        <span class="nota-row__nombre">${nombre}</span>
        ${fecha ? `<span class="text-muted text-xs">${fecha}</span>` : ''}
      </div>
      <div class="nota-row__right">
        <div class="nota-bar-wrap">
          <div class="nota-bar ${notaCls}" style="width:${pct}%"></div>
        </div>
        <span class="nota-val ${notaCls}">${typeof nota === 'number' ? nota.toFixed(1) : nota}<span class="nota-max">/10</span></span>
      </div>
      <div class="nota-row__actions">
        <button class="btn btn--ghost btn--sm"
          data-nota-action="edit" data-nota-type="${type}" data-nota-id="${escHtml(item.id)}"
          aria-label="Editar">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn--ghost btn--sm" style="color:var(--color-danger)"
          data-nota-action="delete" data-nota-type="${type}" data-nota-id="${escHtml(item.id)}"
          aria-label="Eliminar">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function wireNotaActions(el, type, items) {
  el.querySelectorAll('[data-nota-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.notaAction;
      const id     = btn.dataset.notaId;
      const item   = items.find(i => i.id === id);
      if (!item) return;
      if (action === 'edit')   openNotaModal(type, item);
      if (action === 'delete') confirmDeleteNota(type, item);
    });
  });
}

function openNotaModal(type, item = null, quizArea = 1) {
  const isEdit   = !!item;
  const isQuiz   = type === 'quiz';
  const area     = isEdit ? (item.area ?? quizArea) : quizArea;
  const fieldLbl = isQuiz ? 'Nombre del examen' : 'Tema de la exposición';
  const fieldId  = 'fNotaCampo';
  const defCampo = isEdit ? (isQuiz ? item.nombre : item.tema) ?? '' : '';
  const defNota  = isEdit ? (item.nota ?? '') : '';
  const defFecha = isEdit ? (item.fecha ?? '') : '';

  openModal({
    title: isEdit
      ? `Editar ${isQuiz ? 'Examen Corto' : 'Exposición'}`
      : `Nuevo ${isQuiz ? 'Examen Corto' : 'Exposición'}`,
    size: 'sm',
    body: `
      <div class="form-group">
        <label class="form-label" for="${fieldId}">${fieldLbl}</label>
        <input class="form-input" id="${fieldId}" type="text"
          value="${escHtml(defCampo)}"
          placeholder="${isQuiz ? 'Ej. Quiz 1 — Anatomía' : 'Ej. Sistemas digestivos comparados'}">
        <span class="form-error hidden" id="errCampo">Este campo es obligatorio.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="fNotaNota">Nota (0 – 10)</label>
        <input class="form-input" id="fNotaNota" type="number" min="0" max="10" step="0.1"
          value="${defNota}" placeholder="0.0">
        <span class="form-error hidden" id="errNota">Ingresá una nota entre 0 y 10.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="fNotaFecha">Fecha <span class="text-muted">(opcional)</span></label>
        <input class="form-input" id="fNotaFecha" type="date" value="${defFecha}">
      </div>`,
    confirmLabel: isEdit ? 'Guardar cambios' : 'Registrar',
    async onConfirm() {
      const campo = document.getElementById(fieldId)?.value.trim();
      const nota  = parseFloatOrNull(document.getElementById('fNotaNota')?.value);
      const fecha = document.getElementById('fNotaFecha')?.value || null;

      let ok = true;
      if (!campo) {
        document.getElementById('errCampo')?.classList.remove('hidden');
        document.getElementById(fieldId)?.classList.add('form-input--error');
        ok = false;
      }
      if (nota === null || nota < 0 || nota > 10) {
        document.getElementById('errNota')?.classList.remove('hidden');
        document.getElementById('fNotaNota')?.classList.add('form-input--error');
        ok = false;
      }
      if (!ok) return;

      const payload = isQuiz ? { nombre: campo, nota, fecha, area } : { tema: campo, nota, fecha };

      try {
        if (isEdit) {
          if (isQuiz) await updateQuiz(_alumnoId, _materiaId, item.id, payload);
          else        await updateExposicion(_alumnoId, _materiaId, item.id, payload);
          showToast(isQuiz ? 'Quiz actualizado' : 'Exposición actualizada');
        } else {
          if (isQuiz) await addQuiz(_alumnoId, _materiaId, payload);
          else        await addExposicion(_alumnoId, _materiaId, payload);
          showToast(isQuiz ? 'Quiz registrado' : 'Exposición registrada');
        }
        closeModal();
        await reloadInsc();
        refreshStats();
        paintTabContent();
      } catch (err) {
        showToast('Error al guardar', 'error');
        console.error(err);
      }
    },
  });
}

function confirmDeleteNota(type, item) {
  const isQuiz = type === 'quiz';
  const label  = isQuiz ? (item.nombre ?? 'este quiz') : (item.tema ?? 'esta exposición');
  openModal({
    title: `Eliminar ${isQuiz ? 'quiz' : 'exposición'}`,
    size: 'sm',
    body: `<p class="text-secondary">¿Eliminar <strong>${escHtml(label)}</strong>?</p>`,
    confirmLabel: 'Eliminar',
    confirmVariant: 'danger',
    async onConfirm() {
      try {
        if (isQuiz) await deleteQuiz(_alumnoId, _materiaId, item.id);
        else        await deleteExposicion(_alumnoId, _materiaId, item.id);
        closeModal();
        showToast(isQuiz ? 'Quiz eliminado' : 'Exposición eliminada');
        await reloadInsc();
        refreshStats();
        paintTabContent();
      } catch (err) {
        showToast('Error al eliminar', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// TAB: TAREAS (PDFs entregados por alumnos)
// ---------------------------------------------------------------------------

async function paintTareas(el) {
  el.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando tareas…</p></div>`;

  let tareas = [];
  try {
    tareas = await getTareas(_alumnoId, _materiaId);
  } catch (err) {
    console.error('[AcadVet] Error cargando tareas:', err);
    el.innerHTML = emptyTabState('⚠️', 'Error al cargar', 'Verificá tu conexión e intentá de nuevo.');
    return;
  }

  tareas.sort((a, b) => (b.subidoEn ?? 0) - (a.subidoEn ?? 0));

  const portalUrl = `${location.origin}${location.pathname.replace('index.html', '')}tareas.html?materia=${_materiaId}`;

  el.innerHTML = `
    <div class="tab-section">
      <div class="tab-toolbar">
        <span class="text-muted text-sm">
          ${tareas.length} tarea${tareas.length !== 1 ? 's' : ''} entregada${tareas.length !== 1 ? 's' : ''}
        </span>
        <button class="btn btn--secondary btn--sm" id="btnCopyTareasLink" title="Copiar enlace para alumnos">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copiar enlace
        </button>
      </div>

      ${tareas.length === 0
        ? `<div class="empty-state" style="padding:var(--space-10)">
             <div class="empty-state__icon">📋</div>
             <h3 class="empty-state__title">Sin tareas entregadas</h3>
             <p class="empty-state__text">
               Los alumnos pueden entregar sus tareas en:<br>
               <code style="font-size:var(--text-xs);word-break:break-all">${escHtml(portalUrl)}</code>
             </p>
           </div>`
        : `<div class="tareas-list">${tareas.map(t => tareaRowHTML(t)).join('')}</div>`
      }
    </div>
  `;

  document.getElementById('btnCopyTareasLink')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      showToast('Enlace copiado al portapapeles');
    } catch (_) {
      showToast('No se pudo copiar — copiá manualmente: ' + portalUrl, 'error');
    }
  });

  el.querySelectorAll('[data-tarea-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { tareaAction: action, tareaId: id } = btn.dataset;
      const tarea = tareas.find(t => t.id === id);
      if (!tarea) return;
      if (action === 'ver')    window.open(tarea.url, '_blank');
      if (action === 'delete') confirmDeleteTarea(tarea);
    });
  });
}

function tareaRowHTML(t) {
  const subida    = t.subidoEn ? new Date(t.subidoEn).toLocaleString('es-SV', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const comentario = t.comentario ? `<span class="text-muted text-xs" style="display:block;margin-top:2px">${escHtml(t.comentario)}</span>` : '';

  return `
    <div class="nota-row" style="align-items:flex-start;padding:var(--space-3) var(--space-4)">
      <div style="display:flex;align-items:center;gap:var(--space-2);flex-shrink:0;color:var(--color-primary)">
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </div>
      <div class="nota-row__info" style="flex:1;min-width:0">
        <span class="nota-row__nombre">${escHtml(t.nombre)}</span>
        ${comentario}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <span class="text-muted text-xs" style="display:block">${subida}</span>
      </div>
      <div class="nota-row__actions">
        <button class="btn btn--secondary btn--sm"
          data-tarea-action="ver" data-tarea-id="${escHtml(t.id)}"
          title="Abrir en Teams">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Abrir en Teams
        </button>
        <button class="btn btn--ghost btn--sm" style="color:var(--color-danger)"
          data-tarea-action="delete" data-tarea-id="${escHtml(t.id)}"
          aria-label="Eliminar entrega">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function confirmDeleteTarea(tarea) {
  openModal({
    title: 'Eliminar tarea',
    size: 'sm',
    body: `<p class="text-secondary">
      ¿Eliminar el registro de entrega <strong>${escHtml(tarea.nombre)}</strong>?<br>
      <span class="text-muted text-xs">Solo se elimina el registro en la app. El archivo en Teams no se toca.</span>
    </p>`,
    confirmLabel: 'Eliminar',
    confirmVariant: 'danger',
    async onConfirm() {
      try {
        await deleteTarea(_alumnoId, _materiaId, tarea.id, tarea.storagePath ?? null);
        closeModal();
        showToast('Tarea eliminada');
        const el = document.getElementById('tabContent');
        if (el) paintTareas(el);
      } catch (err) {
        showToast('Error al eliminar la tarea', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// TAB: PRÁCTICAS DE LABORATORIO
// ---------------------------------------------------------------------------

async function paintLabReports(el) {
  el.innerHTML = `
    <div class="tab-section">
      <div style="text-align:center;padding:24px;color:var(--color-text-muted);font-size:var(--text-sm)">
        <div style="font-size:28px;margin-bottom:8px">⏳</div>
        Cargando reportes…
      </div>
    </div>`;

  try {
    const reports = await getLabReportsByCarnet(_alumno.carnet);

    if (!reports.length) {
      el.innerHTML = `
        <div class="tab-section">
          <div class="empty-state">
            <div class="empty-state__icon">🔬</div>
            <h3 class="empty-state__title">Sin prácticas registradas</h3>
            <p class="empty-state__text">Este alumno aún no ha enviado reportes de práctica.</p>
          </div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="tab-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)">
          <span style="font-size:var(--text-sm);font-weight:700;color:var(--color-text-secondary)">
            🔬 Reportes de práctica
          </span>
          <span class="badge badge--outline">${reports.length} reporte${reports.length !== 1 ? 's' : ''}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-3)">
          ${reports.map(r => {
            const fecha   = r.fecha ?? (r.timestamp ? new Date(r.timestamp).toLocaleDateString('es-SV') : '—');
            const hora    = r.timestamp ? new Date(r.timestamp).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }) : '';
            const revisado = r.estado === 'revisado';
            return `
              <div style="background:var(--color-surface);border:1px solid var(--color-border);
                   border-left:4px solid ${revisado ? 'var(--color-success)' : 'var(--color-warning)'};
                   border-radius:var(--radius-md);overflow:hidden">
                <div style="display:flex;gap:var(--space-3);padding:var(--space-4)">
                  ${r.foto_url ? `
                    <a href="${r.foto_url}" target="_blank" style="flex-shrink:0">
                      <img src="${r.foto_url}" alt="Foto práctica"
                           style="width:72px;height:72px;object-fit:cover;border-radius:var(--radius-sm);
                                  border:1px solid var(--color-border)">
                    </a>` : `
                    <div style="width:72px;height:72px;background:var(--color-surface-2);
                         border-radius:var(--radius-sm);display:flex;align-items:center;
                         justify-content:center;font-size:24px;flex-shrink:0">🔬</div>`}

                  <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:var(--text-sm);color:var(--color-text-primary);
                         margin-bottom:3px">${escHtml(r.tipo_preparacion || r.tipo || '—')}</div>
                    <div style="font-size:var(--text-xs);color:var(--color-text-secondary);margin-bottom:3px">
                      📚 ${escHtml(r.asignatura || '—')}
                    </div>
                    <div style="font-size:var(--text-xs);color:var(--color-text-muted)">
                      📅 ${fecha}${hora ? ' · ' + hora : ''}
                    </div>
                    <div style="margin-top:6px">
                      <span style="display:inline-flex;align-items:center;gap:4px;font-size:0.65rem;
                           font-weight:700;padding:2px 8px;border-radius:99px;
                           background:${revisado ? 'var(--color-success-dim)' : 'var(--color-warning-dim)'};
                           color:${revisado ? 'var(--color-success)' : '#B7791F'}">
                        ${revisado ? '✅ Revisada' : '⏳ Pendiente'}
                      </span>
                    </div>
                  </div>

                  <button class="btn btn--ghost btn--sm lab-del-btn"
                    data-lab-id="${escHtml(r.id)}"
                    data-lab-tipo="${escHtml(r.tipo_preparacion || r.tipo || '—')}"
                    style="color:var(--color-danger);align-self:flex-start;flex-shrink:0"
                    aria-label="Eliminar reporte">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
                ${r.feedback ? `
                  <div style="border-top:1px solid var(--color-border);padding:var(--space-3) var(--space-4);
                       background:var(--color-surface-2)">
                    <span style="font-size:var(--text-xs);font-weight:700;color:var(--color-text-secondary)">
                      💬 Feedback del docente:
                    </span>
                    <p style="font-size:var(--text-xs);color:var(--color-text-secondary);
                         margin-top:3px;line-height:1.5">${escHtml(r.feedback)}</p>
                  </div>` : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`;
    el.querySelectorAll('.lab-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id   = btn.dataset.labId;
        const tipo = btn.dataset.labTipo;
        openModal({
          title: 'Eliminar reporte de práctica',
          size:  'sm',
          body:  `<p class="text-secondary">
            ¿Eliminar el reporte <strong>${escHtml(tipo)}</strong>?<br>
            <span class="text-muted text-sm">Esta acción no se puede deshacer.</span>
          </p>`,
          confirmLabel:   'Eliminar',
          confirmVariant: 'danger',
          async onConfirm() {
            try {
              await deleteLabReport(id);
              closeModal();
              showToast('Reporte eliminado');
              paintLabReports(el);
            } catch (err) {
              showToast('Error al eliminar el reporte', 'error');
              console.error(err);
            }
          },
        });
      });
    });

  } catch (err) {
    console.error('[Expediente] Error cargando prácticas:', err);
    el.innerHTML = `
      <div class="tab-section">
        <div class="empty-state">
          <div class="empty-state__icon">⚠️</div>
          <h3 class="empty-state__title">Error al cargar</h3>
          <p class="empty-state__text">No se pudieron cargar los reportes de práctica.</p>
        </div>
      </div>`;
  }
}

// ---------------------------------------------------------------------------
// Helpers: notas
// ---------------------------------------------------------------------------

function calcProm(notas) {
  const vals = notas.filter(n => typeof n === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function notaColorCls(nota) {
  if (nota === null || nota === undefined) return 'nota--neutral';
  const n = typeof nota === 'number' ? nota : parseFloat(nota);
  if (isNaN(n)) return 'nota--neutral';
  if (n >= 9)  return 'nota--great';
  if (n >= 7)  return 'nota--good';
  if (n >= 5)  return 'nota--avg';
  return 'nota--low';
}

function notaColorCls100(nota) {
  if (nota === null || nota === undefined || nota === '') return 'nota--neutral';
  const n = typeof nota === 'number' ? nota : parseFloat(nota);
  if (isNaN(n)) return 'nota--neutral';
  if (n >= 90) return 'nota--great';
  if (n >= 70) return 'nota--good';
  if (n >= 50) return 'nota--avg';
  return 'nota--low';
}

function parseFloatOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function emptyTabState(icon, title, text) {
  return `
    <div class="empty-state" style="padding:var(--space-10)">
      <div class="empty-state__icon">${icon}</div>
      <h3 class="empty-state__title">${title}</h3>
      <p class="empty-state__text">${text}</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Cálculos de estadísticas
// ---------------------------------------------------------------------------

function calcStats() {
  const asists     = snapToArray(_insc.asistencias);
  const allQuizzes = snapToArray(_insc.quizzes);
  const parc       = _insc.parciales ?? {};
  const expos      = snapToArray(_insc.exposiciones);

  // % Asistencia (justificado = presente)
  const asistSummary = calcAsistSummary(asists);

  // Quiz promedios por área
  const numNotas = arr => arr.map(x => x.nota).filter(n => typeof n === 'number');
  const q1notas  = numNotas(allQuizzes.filter(q => Number(q.area) === 1));
  const q2notas  = numNotas(allQuizzes.filter(q => Number(q.area) === 2));
  const q3notas  = [
    ...numNotas(allQuizzes.filter(q => Number(q.area) === 3)),
    ...numNotas(expos),   // exposición cuenta como quiz de Área 3
  ];

  const promQ1 = q1notas.length ? q1notas.reduce((a, b) => a + b, 0) / q1notas.length : null;
  const promQ2 = q2notas.length ? q2notas.reduce((a, b) => a + b, 0) / q2notas.length : null;
  const promQ3 = q3notas.length ? q3notas.reduce((a, b) => a + b, 0) / q3notas.length : null;

  // Parciales (normalizados a escala /10)
  const p1 = (parc.parcial_1 !== null && parc.parcial_1 !== undefined) ? parc.parcial_1 / 10 : null;
  const p2 = (parc.parcial_2 !== null && parc.parcial_2 !== undefined) ? parc.parcial_2 / 10 : null;
  const p3 = (parc.parcial_3 !== null && parc.parcial_3 !== undefined) ? parc.parcial_3 / 10 : null;

  // Nota final: solo cuando TODOS los componentes tienen datos
  const allPresent = promQ1 !== null && p1 !== null &&
                     promQ2 !== null && p2 !== null &&
                     promQ3 !== null && p3 !== null;

  const notaFinal = allPresent
    ? promQ1 * 0.15 + p1 * 0.15
    + promQ2 * 0.15 + p2 * 0.15
    + promQ3 * 0.20 + p3 * 0.20
    : null;

  // Estado académico
  let estadoLabel, estadoCls;
  if (notaFinal === null) {
    estadoLabel = 'Sin datos';
    estadoCls   = 'exp-stat-card--neutral';
  } else if (notaFinal >= 6.0) {
    estadoLabel = 'Aprobado';
    estadoCls   = 'exp-stat-card--aprobado';
  } else if (notaFinal >= 5.0) {
    estadoLabel = 'En riesgo';
    estadoCls   = 'exp-stat-card--riesgo';
  } else {
    estadoLabel = 'Reprobado';
    estadoCls   = 'exp-stat-card--reprobado';
  }

  // Promedios para el panel (display)
  const allQnotas = [...q1notas, ...q2notas, ...q3notas];
  const promQuizDisplay = allQnotas.length
    ? (allQnotas.reduce((a, b) => a + b, 0) / allQnotas.length).toFixed(1)
    : '—';

  const parcVals = [p1, p2, p3].filter(v => v !== null);
  const promParcDisplay = parcVals.length
    ? (parcVals.reduce((a, b) => a + b, 0) / parcVals.length * 10).toFixed(1) // volver a /100
    : '—';

  return {
    asistPct:      asistSummary.total > 0 ? asistSummary.pct + '%' : '—',
    promQuiz:      promQuizDisplay,
    promParciales: promParcDisplay,
    notaFinal:     notaFinal !== null ? notaFinal.toFixed(2) : '—',
    estadoLabel,
    estadoCls,
  };
}

function calcAsistSummary(asists) {
  const total       = asists.length;
  const presentes   = asists.filter(a => a.estado === 'presente').length;
  const justificados = asists.filter(a => a.estado === 'justificado').length;
  const ausentes    = asists.filter(a => a.estado === 'ausente').length;
  // Justificado cuenta como presente
  const pct = total > 0
    ? Math.round(((presentes + justificados) / total) * 100)
    : 0;
  return { total, presentes, justificados, ausentes, pct };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function reloadInsc() {
  _insc = await getInscripcion(_alumnoId, _materiaId) ?? _insc;
}

function snapToArray(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).map(([id, data]) => ({ id, ...data }));
}

function sortByFechaDesc(a, b) {
  return (b.fecha ?? '').localeCompare(a.fecha ?? '');
}

function formatFecha(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-SV', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function getInitials(nombre) {
  const p = (nombre ?? '').trim().split(/\s+/);
  return p.length >= 2
    ? (p[0][0] + p[1][0]).toUpperCase()
    : (p[0]?.[0] ?? '?').toUpperCase();
}

function strHash(str) {
  return (str ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const AVATAR_PALETTE = [
  '#6C63FF','#00B4B5','#FF6B6B','#00B894','#FDCB6E','#74B9FF',
];

const ESTADO_CONFIG = {
  presente:    { label: 'Presente',    dot: '#00B894', badgeCls: 'badge--success'  },
  ausente:     { label: 'Ausente',     dot: '#FF6B6B', badgeCls: 'badge--danger'   },
  justificado: { label: 'Justificado', dot: '#FDCB6E', badgeCls: 'badge--warning'  },
};

// ---------------------------------------------------------------------------
// EXPORTACIÓN PDF (T13)
// ---------------------------------------------------------------------------

async function exportPDF(btn) {
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Generando…';

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pw  = doc.internal.pageSize.getWidth();
    const ph  = doc.internal.pageSize.getHeight();
    const ML  = 15;
    const MR  = 15;
    const CW  = pw - ML - MR;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.setFillColor(45, 42, 110);
    doc.rect(0, 0, pw, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', ML, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Facultad de Medicina Veterinaria', ML, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('EXPEDIENTE ACADÉMICO INDIVIDUAL', ML, 25);

    const fechaHoy = new Date().toLocaleDateString('es-SV', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(fechaHoy, pw - MR, 25, { align: 'right' });

    // ── Datos del alumno ─────────────────────────────────────────────────────
    let y = 42;
    doc.setTextColor(26, 26, 46);
    const infoRows = [
      ['Alumno',  _alumno.nombre ?? '—'],
      ['Carné',   _alumno.carnet ?? '—'],
      ['Materia', _materia.nombre ?? '—'],
      ['Ciclo',   (_materia.ciclo ?? '—') + (_materia.seccion ? ` · Sección ${_materia.seccion}` : '')],
    ];
    for (const [lbl, val] of infoRows) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(lbl + ':', ML, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(val), ML + 24, y);
      y += 6;
    }

    // ── Resumen académico ────────────────────────────────────────────────────
    y += 3;
    y = pdfSection(doc, 'RESUMEN ACADÉMICO', ML, y, CW);

    const stats = calcStats();
    const estadoRGB = {
      'exp-stat-card--aprobado':  [0, 184, 148],
      'exp-stat-card--riesgo':    [253, 203, 110],
      'exp-stat-card--reprobado': [255, 107, 107],
      'exp-stat-card--neutral':   [136, 136, 170],
    }[stats.estadoCls] ?? [136, 136, 170];

    // Estado badge (top-right of section)
    const badgeX = pw - MR - 44;
    doc.setFillColor(...estadoRGB);
    doc.roundedRect(badgeX, y - 5, 44, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(stats.estadoLabel.toUpperCase(), badgeX + 22, y - 0.2, { align: 'center' });

    doc.setTextColor(26, 26, 46);
    const resumeRows = [
      ['Asistencia',      stats.asistPct],
      ['Prom. Quizzes',   stats.promQuiz],
      ['Prom. Parciales', stats.promParciales + (stats.promParciales !== '—' ? ' / 100' : '')],
      ['Nota Final',      stats.notaFinal + (stats.notaFinal !== '—' ? ' / 10' : '')],
    ];
    for (const [lbl, val] of resumeRows) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(lbl + ':', ML, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(val), ML + 38, y);
      y += 6;
    }

    // ── Asistencias ──────────────────────────────────────────────────────────
    y += 3;
    y = pdfCheckPage(doc, y, 25, ph);
    y = pdfSection(doc, 'ASISTENCIAS', ML, y, CW);

    const asists   = snapToArray(_insc.asistencias).sort(sortByFechaDesc);
    const asistSum = calcAsistSummary(asists);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(74, 74, 106);
    doc.text(
      `Total: ${asistSum.total}  ·  Presentes: ${asistSum.presentes}  ·  Justificados: ${asistSum.justificados}  ·  Ausentes: ${asistSum.ausentes}  ·  ${asistSum.pct}%`,
      ML, y,
    );
    y += 5;

    if (asists.length > 0) {
      doc.autoTable({
        startY: y,
        margin: { left: ML, right: MR },
        head: [['Fecha', 'Estado']],
        body: asists.map(a => [
          formatFecha(a.fecha),
          { presente: 'Presente', ausente: 'Ausente', justificado: 'Justificado' }[a.estado] ?? a.estado,
        ]),
        styles:              { fontSize: 8, cellPadding: 2 },
        headStyles:          { fillColor: [108, 99, 255], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles:  { fillColor: [240, 242, 255] },
        columnStyles:        { 0: { cellWidth: 90 } },
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setTextColor(136, 136, 170);
      doc.text('Sin asistencias registradas.', ML, y);
      y += 8;
    }

    // ── Exámenes cortos ──────────────────────────────────────────────────────
    y = pdfCheckPage(doc, y, 20, ph);
    y = pdfSection(doc, 'EXÁMENES CORTOS', ML, y, CW);

    const allQuizzes   = snapToArray(_insc.quizzes);
    const areaWeights  = [15, 15, 20];
    const areaMaxCount = [3, 3, 4];

    for (let n = 1; n <= 3; n++) {
      const aq   = allQuizzes.filter(q => Number(q.area) === n).sort(sortByFechaDesc);
      const prom = calcProm(aq.map(q => q.nota));

      y = pdfCheckPage(doc, y, 18, ph);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(108, 99, 255);
      doc.text(
        `Área ${n} — ${areaWeights[n - 1]}%    Promedio: ${prom !== null ? prom.toFixed(1) : '—'}   (${aq.length}/${areaMaxCount[n-1]} quizzes)`,
        ML, y,
      );
      y += 4;

      if (aq.length > 0) {
        doc.autoTable({
          startY: y,
          margin: { left: ML, right: MR },
          head: [['Nombre', 'Fecha', 'Nota /10']],
          body: aq.map(q => [
            q.nombre ?? '—',
            q.fecha ? formatFecha(q.fecha) : '—',
            q.nota != null ? Number(q.nota).toFixed(1) : '—',
          ]),
          styles:             { fontSize: 8, cellPadding: 2 },
          headStyles:         { fillColor: [108, 99, 255], textColor: 255 },
          alternateRowStyles: { fillColor: [240, 242, 255] },
          columnStyles:       { 2: { cellWidth: 22, halign: 'center' } },
        });
        y = doc.lastAutoTable.finalY + 6;
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(136, 136, 170);
        doc.text('Sin quizzes registrados.', ML + 4, y);
        y += 6;
      }
    }

    // ── Parciales ────────────────────────────────────────────────────────────
    y += 2;
    y = pdfCheckPage(doc, y, 30, ph);
    y = pdfSection(doc, 'PARCIALES', ML, y, CW);

    const parc = _insc.parciales ?? {};
    doc.autoTable({
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Parcial', 'Peso', 'Nota /100']],
      body: [
        ['Parcial I',   '15%', parc.parcial_1 != null ? Number(parc.parcial_1).toFixed(1) : '—'],
        ['Parcial II',  '15%', parc.parcial_2 != null ? Number(parc.parcial_2).toFixed(1) : '—'],
        ['Parcial III', '20%', parc.parcial_3 != null ? Number(parc.parcial_3).toFixed(1) : '—'],
      ],
      styles:             { fontSize: 8, cellPadding: 2 },
      headStyles:         { fillColor: [108, 99, 255], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 242, 255] },
      columnStyles:       { 1: { halign: 'center', cellWidth: 22 }, 2: { halign: 'center', cellWidth: 30 } },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── Exposiciones ─────────────────────────────────────────────────────────
    y = pdfCheckPage(doc, y, 25, ph);
    y = pdfSection(doc, 'EXPOSICIONES (Área 3 — 20%)', ML, y, CW);

    const expos = snapToArray(_insc.exposiciones).sort(sortByFechaDesc);
    if (expos.length > 0) {
      doc.autoTable({
        startY: y,
        margin: { left: ML, right: MR },
        head: [['Tema', 'Fecha', 'Nota /10']],
        body: expos.map(e => [
          e.tema ?? '—',
          e.fecha ? formatFecha(e.fecha) : '—',
          e.nota != null ? Number(e.nota).toFixed(1) : '—',
        ]),
        styles:             { fontSize: 8, cellPadding: 2 },
        headStyles:         { fillColor: [108, 99, 255], textColor: 255 },
        alternateRowStyles: { fillColor: [240, 242, 255] },
        columnStyles:       { 2: { cellWidth: 22, halign: 'center' } },
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(136, 136, 170);
      doc.text('Sin exposiciones registradas.', ML, y);
      y += 8;
    }

    // ── Observaciones ────────────────────────────────────────────────────────
    y = pdfCheckPage(doc, y, 25, ph);
    y = pdfSection(doc, 'OBSERVACIONES', ML, y, CW);

    const obs = (_insc.observaciones ?? '').trim();
    if (obs) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(74, 74, 106);
      const lines = doc.splitTextToSize(obs, CW);
      for (const line of lines) {
        y = pdfCheckPage(doc, y, 6, ph);
        doc.text(line, ML, y);
        y += 5;
      }
    } else {
      doc.setTextColor(136, 136, 170);
      doc.setFontSize(8);
      doc.text('Sin observaciones.', ML, y);
    }

    // ── Pie de página en todas las páginas ───────────────────────────────────
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(136, 136, 170);
      doc.text(`AcadVet USAM  ·  Página ${p} de ${total}`, pw / 2, ph - 8, { align: 'center' });
    }

    // ── Guardar ──────────────────────────────────────────────────────────────
    const safe = s => (s ?? '').replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '').trim().replace(/\s+/g, '_');
    doc.save(`Expediente_${safe(_alumno.nombre)}_${safe(_materia.nombre)}.pdf`);
    showToast('PDF generado correctamente');

  } catch (err) {
    console.error('[AcadVet] Error generando PDF:', err);
    showToast('Error al generar el PDF. Verificá tu conexión.', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
}

// ── PDF helpers ──────────────────────────────────────────────────────────────

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

function pdfSection(doc, title, x, y, w) {
  doc.setFillColor(236, 238, 255);
  doc.rect(x, y - 5, w, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(108, 99, 255);
  doc.text(title, x + 2, y);
  doc.setTextColor(26, 26, 46);
  return y + 9;
}

function pdfCheckPage(doc, y, needed, ph) {
  if (y + needed > ph - 15) {
    doc.addPage();
    return 20;
  }
  return y;
}

// ---------------------------------------------------------------------------
// EXPORTACIÓN WORD (T14)
// ---------------------------------------------------------------------------

async function exportWord(btn) {
  const origHTML = btn.innerHTML;
  btn.disabled   = true;
  btn.textContent = 'Generando…';

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js');

    const {
      Document, Packer, Paragraph, TextRun,
      Table, TableRow, TableCell,
      AlignmentType, WidthType, ShadingType,
    } = window.docx;

    const fechaHoy = new Date().toLocaleDateString('es-SV', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    // ── Helpers ─────────────────────────────────────────────────────────────

    const shade = fill => ({ type: ShadingType.CLEAR, color: 'auto', fill });

    const mkRow = (cells, isHeader, rowIndex) => new TableRow({
      tableHeader: isHeader,
      children: cells.map(text => new TableCell({
        shading: shade(isHeader ? '6C63FF' : rowIndex % 2 === 0 ? 'F0F2FF' : 'FFFFFF'),
        children: [new Paragraph({
          children: [new TextRun({
            text: String(text ?? '—'),
            bold: isHeader,
            color: isHeader ? 'FFFFFF' : '1A1A2E',
            size: 18,
          })],
        })],
      })),
    });

    const mkTable = (headers, rows) => new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        mkRow(headers, true, 0),
        ...rows.map((r, i) => mkRow(r, false, i)),
      ],
    });

    const mkSection = title => new Paragraph({
      spacing: { before: 320, after: 120 },
      shading: shade('ECEEFF'),
      children: [new TextRun({ text: title, bold: true, color: '6C63FF', size: 20 })],
    });

    const blank = () => new Paragraph({ children: [new TextRun({ text: '' })] });

    const safe  = s => (s ?? '').replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '').trim().replace(/\s+/g, '_');

    // ── Contenido ────────────────────────────────────────────────────────────
    const ch = []; // children array

    // Header USAM
    for (const [text, size, bold] of [
      ['UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', 20, true ],
      ['Facultad de Medicina Veterinaria',         18, false],
      ['EXPEDIENTE ACADÉMICO INDIVIDUAL',   22, true ],
    ]) {
      ch.push(new Paragraph({
        spacing: { after: 40 },
        shading: shade('2D2A6E'),
        children: [new TextRun({ text, bold, color: 'FFFFFF', size })],
      }));
    }

    // Datos alumno
    ch.push(blank());
    const infoRows = [
      ['Alumno',  _alumno.nombre ?? '—'],
      ['Carné',   _alumno.carnet ?? '—'],
      ['Materia', _materia.nombre ?? '—'],
      ['Ciclo',   (_materia.ciclo ?? '—') + (_materia.seccion ? ` · Sección ${_materia.seccion}` : '')],
      ['Fecha',   fechaHoy],
    ];
    for (const [lbl, val] of infoRows) {
      ch.push(new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: lbl + ': ', bold: true, size: 20 }),
          new TextRun({ text: val, size: 20 }),
        ],
      }));
    }

    // Resumen académico
    const stats = calcStats();
    const estadoColorMap = {
      'exp-stat-card--aprobado':  '00B894',
      'exp-stat-card--riesgo':    'E17B00',
      'exp-stat-card--reprobado': 'FF6B6B',
      'exp-stat-card--neutral':   '8888AA',
    };
    const estadoColor = estadoColorMap[stats.estadoCls] ?? '8888AA';

    ch.push(mkSection('RESUMEN ACADÉMICO'));
    ch.push(new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: 'Asistencia: ',      bold: true,  size: 20 }),
        new TextRun({ text: stats.asistPct,                   size: 20 }),
        new TextRun({ text: '   Prom. Quizzes: ', bold: true, size: 20 }),
        new TextRun({ text: stats.promQuiz,                   size: 20 }),
        new TextRun({ text: '   Prom. Parciales: ', bold: true, size: 20 }),
        new TextRun({ text: stats.promParciales,              size: 20 }),
        new TextRun({ text: '   Nota Final: ',   bold: true,  size: 20 }),
        new TextRun({ text: stats.notaFinal,                  size: 20 }),
      ],
    }));
    ch.push(new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({ text: 'Estado: ', bold: true, size: 20 }),
        new TextRun({ text: stats.estadoLabel.toUpperCase(), bold: true, color: estadoColor, size: 22 }),
      ],
    }));

    // Asistencias
    const asists   = snapToArray(_insc.asistencias).sort(sortByFechaDesc);
    const asistSum = calcAsistSummary(asists);

    ch.push(mkSection('ASISTENCIAS'));
    ch.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({
        text: `Total: ${asistSum.total}  ·  Presentes: ${asistSum.presentes}  ·  Justificados: ${asistSum.justificados}  ·  Ausentes: ${asistSum.ausentes}  ·  ${asistSum.pct}%`,
        size: 18, color: '4A4A6A',
      })],
    }));
    ch.push(asists.length > 0
      ? mkTable(
          ['Fecha', 'Estado'],
          asists.map(a => [
            formatFecha(a.fecha),
            { presente: 'Presente', ausente: 'Ausente', justificado: 'Justificado' }[a.estado] ?? a.estado,
          ]),
        )
      : new Paragraph({ children: [new TextRun({ text: 'Sin asistencias registradas.', color: '8888AA', size: 18 })] })
    );

    // Exámenes cortos
    const allQuizzes  = snapToArray(_insc.quizzes);
    const areaWeights = [15, 15, 20];
    const areaMaxCnt  = [3, 3, 4];

    ch.push(mkSection('EXÁMENES CORTOS'));
    for (let n = 1; n <= 3; n++) {
      const aq   = allQuizzes.filter(q => Number(q.area) === n).sort(sortByFechaDesc);
      const prom = calcProm(aq.map(q => q.nota));
      ch.push(new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({
          text: `Área ${n} — ${areaWeights[n-1]}%   Promedio: ${prom !== null ? prom.toFixed(1) : '—'}   (${aq.length}/${areaMaxCnt[n-1]} quizzes)`,
          bold: true, color: '6C63FF', size: 19,
        })],
      }));
      ch.push(aq.length > 0
        ? mkTable(
            ['Nombre', 'Fecha', 'Nota /10'],
            aq.map(q => [q.nombre ?? '—', q.fecha ? formatFecha(q.fecha) : '—', q.nota != null ? Number(q.nota).toFixed(1) : '—']),
          )
        : new Paragraph({ children: [new TextRun({ text: 'Sin quizzes registrados.', color: '8888AA', size: 18 })] })
      );
    }

    // Parciales
    const parc = _insc.parciales ?? {};
    ch.push(mkSection('PARCIALES'));
    ch.push(mkTable(
      ['Parcial', 'Peso', 'Nota /100'],
      [
        ['Parcial I',   '15%', parc.parcial_1 != null ? Number(parc.parcial_1).toFixed(1) : '—'],
        ['Parcial II',  '15%', parc.parcial_2 != null ? Number(parc.parcial_2).toFixed(1) : '—'],
        ['Parcial III', '20%', parc.parcial_3 != null ? Number(parc.parcial_3).toFixed(1) : '—'],
      ],
    ));

    // Exposiciones
    const expos = snapToArray(_insc.exposiciones).sort(sortByFechaDesc);
    ch.push(mkSection('EXPOSICIONES (Área 3 — 20%)'));
    ch.push(expos.length > 0
      ? mkTable(
          ['Tema', 'Fecha', 'Nota /10'],
          expos.map(e => [e.tema ?? '—', e.fecha ? formatFecha(e.fecha) : '—', e.nota != null ? Number(e.nota).toFixed(1) : '—']),
        )
      : new Paragraph({ children: [new TextRun({ text: 'Sin exposiciones registradas.', color: '8888AA', size: 18 })] })
    );

    // Observaciones
    const obs = (_insc.observaciones ?? '').trim();
    ch.push(mkSection('OBSERVACIONES'));
    if (obs) {
      for (const line of obs.split('\n')) {
        ch.push(new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: line, size: 19, color: '4A4A6A' })],
        }));
      }
    } else {
      ch.push(new Paragraph({ children: [new TextRun({ text: 'Sin observaciones.', color: '8888AA', size: 18 })] }));
    }

    // Pie
    ch.push(blank());
    ch.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `AcadVet USAM  ·  Generado el ${fechaHoy}`, size: 16, color: '8888AA' })],
    }));

    // ── Generar y descargar ──────────────────────────────────────────────────
    const wordDoc = new Document({
      creator: 'AcadVet USAM',
      title:   `Expediente ${_alumno.nombre ?? ''}`,
      sections: [{ properties: {}, children: ch }],
    });

    const blob   = await Packer.toBlob(wordDoc);
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href     = url;
    anchor.download = `Expediente_${safe(_alumno.nombre)}_${safe(_materia.nombre)}.docx`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Word generado correctamente');

  } catch (err) {
    console.error('[AcadVet] Error generando Word:', err);
    showToast('Error al generar el Word. Verificá tu conexión.', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
}

// ---------------------------------------------------------------------------
// EXPORTACIÓN EXCEL INDIVIDUAL (T15)
// ---------------------------------------------------------------------------

async function exportExcel(btn) {
  const origHTML  = btn.innerHTML;
  btn.disabled    = true;
  btn.textContent = 'Generando…';

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'AcadVet USAM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Expediente', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    });

    ws.columns = [
      { width: 44 },
      { width: 22 },
      { width: 14 },
      { width: 14 },
    ];

    const COLS = 4;
    let r = 1;

    // ── Color palette (ARGB) ────────────────────────────────────────────────
    const C = {
      dark:      'FF2D2A6E',
      primary:   'FF6C63FF',
      sectionBg: 'FFECEEFF',
      even:      'FFF0F2FF',
      odd:       'FFFFFFFF',
      white:     'FFFFFFFF',
      text:      'FF1A1A2E',
      secondary: 'FF4A4A6A',
      muted:     'FF8888AA',
      success:   'FF00B894',
      warning:   'FFE17B00',
      danger:    'FFFF6B6B',
    };

    // ── Cell helpers ─────────────────────────────────────────────────────────
    const fgFill  = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
    const fnt     = (bold, size, argb = C.text) => ({ bold, size, color: { argb } });
    const aln     = (h, indent = 0) => ({ vertical: 'middle', horizontal: h, indent });

    const mergedCell = (rowNum, text, bgArgb, fontCfg, colSpan = COLS) => {
      ws.getRow(rowNum).height = 20;
      if (colSpan > 1) ws.mergeCells(rowNum, 1, rowNum, colSpan);
      const c = ws.getCell(rowNum, 1);
      c.value     = text;
      c.font      = fontCfg;
      c.fill      = fgFill(bgArgb);
      c.alignment = aln('left', 1);
    };

    const infoRow = (rowNum, label, value) => {
      ws.getRow(rowNum).height = 16;
      const ca = ws.getCell(rowNum, 1);
      ca.value = label + ':';  ca.font = fnt(true, 9, C.secondary);  ca.alignment = aln('left', 1);
      ws.mergeCells(rowNum, 2, rowNum, COLS);
      const cb = ws.getCell(rowNum, 2);
      cb.value = value;  cb.font = fnt(false, 9, C.text);  cb.alignment = aln('left');
    };

    const blankRow = n => { ws.getRow(n).height = 8; };

    const sectionHdr = n => mergedCell(n, arguments[1] || '', C.sectionBg, fnt(true, 10, C.primary));
    // Can't use arguments in arrow, so inline:
    const sec = (rowNum, title) => mergedCell(rowNum, title, C.sectionBg, fnt(true, 10, C.primary));

    const tblHeader = (rowNum, headers) => {
      ws.getRow(rowNum).height = 17;
      headers.forEach((h, i) => {
        const c = ws.getCell(rowNum, i + 1);
        c.value = h;  c.font = fnt(true, 9, C.white);  c.fill = fgFill(C.primary);
        c.alignment = aln(i === 0 ? 'left' : 'center', i === 0 ? 1 : 0);
      });
    };

    const tblRow = (rowNum, vals, idx, numCols = []) => {
      ws.getRow(rowNum).height = 15;
      const bg = idx % 2 === 0 ? C.even : C.odd;
      vals.forEach((v, i) => {
        const c = ws.getCell(rowNum, i + 1);
        c.value = v;  c.font = fnt(false, 9, C.text);  c.fill = fgFill(bg);
        c.alignment = aln(i === 0 ? 'left' : 'center', i === 0 ? 1 : 0);
        if (numCols.includes(i) && typeof v === 'number') c.numFmt = '0.0';
      });
    };

    const fechaHoy = new Date().toLocaleDateString('es-SV', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    // ── Header USAM ──────────────────────────────────────────────────────────
    mergedCell(r++, 'UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', C.dark, fnt(true, 11, C.white));
    mergedCell(r++, 'Facultad de Medicina Veterinaria',  C.dark, fnt(false, 10, C.white));
    mergedCell(r++, 'EXPEDIENTE ACADÉMICO INDIVIDUAL',   C.dark, fnt(true, 11, C.white));
    blankRow(r++);

    // ── Datos alumno ─────────────────────────────────────────────────────────
    infoRow(r++, 'Alumno',  _alumno.nombre ?? '—');
    infoRow(r++, 'Carné',   _alumno.carnet  ?? '—');
    infoRow(r++, 'Materia', _materia.nombre ?? '—');
    infoRow(r++, 'Ciclo',   (_materia.ciclo ?? '—') + (_materia.seccion ? ` · Sección ${_materia.seccion}` : ''));
    infoRow(r++, 'Fecha',   fechaHoy);
    blankRow(r++);

    // ── Resumen académico ────────────────────────────────────────────────────
    sec(r++, 'RESUMEN ACADÉMICO');
    const stats = calcStats();
    const estadoArgb = {
      'exp-stat-card--aprobado':  C.success,
      'exp-stat-card--riesgo':    C.warning,
      'exp-stat-card--reprobado': C.danger,
      'exp-stat-card--neutral':   C.muted,
    }[stats.estadoCls] ?? C.muted;

    for (const [lbl, val, argb] of [
      ['Asistencia',      stats.asistPct,     null     ],
      ['Prom. Quizzes',   stats.promQuiz,     null     ],
      ['Prom. Parciales', stats.promParciales,null     ],
      ['Nota Final',      stats.notaFinal,    null     ],
      ['Estado',          stats.estadoLabel,  estadoArgb],
    ]) {
      ws.getRow(r).height = 16;
      const ca = ws.getCell(r, 1);
      ca.value = lbl + ':';  ca.font = fnt(true, 9, C.secondary);  ca.alignment = aln('left', 1);
      ws.mergeCells(r, 2, r, COLS);
      const cb = ws.getCell(r, 2);
      cb.value = String(val);  cb.font = fnt(true, 9, argb ?? C.text);  cb.alignment = aln('left');
      r++;
    }
    blankRow(r++);

    // ── Asistencias ──────────────────────────────────────────────────────────
    const asists   = snapToArray(_insc.asistencias).sort(sortByFechaDesc);
    const asistSum = calcAsistSummary(asists);

    sec(r++, 'ASISTENCIAS');
    mergedCell(r++,
      `Total: ${asistSum.total}  ·  Presentes: ${asistSum.presentes}  ·  Justificados: ${asistSum.justificados}  ·  Ausentes: ${asistSum.ausentes}  ·  ${asistSum.pct}%`,
      C.odd, fnt(false, 8.5, C.secondary),
    );
    if (asists.length > 0) {
      tblHeader(r++, ['Fecha', 'Estado']);
      asists.forEach((a, i) => tblRow(r++, [
        formatFecha(a.fecha),
        { presente: 'Presente', ausente: 'Ausente', justificado: 'Justificado' }[a.estado] ?? a.estado,
      ], i));
    } else {
      mergedCell(r++, 'Sin asistencias registradas.', C.odd, fnt(false, 9, C.muted));
    }
    blankRow(r++);

    // ── Exámenes cortos ──────────────────────────────────────────────────────
    const allQuizzes  = snapToArray(_insc.quizzes);
    const areaWeights = [15, 15, 20];
    const areaMaxCnt  = [3, 3, 4];

    sec(r++, 'EXÁMENES CORTOS');
    for (let n = 1; n <= 3; n++) {
      const aq   = allQuizzes.filter(q => Number(q.area) === n).sort(sortByFechaDesc);
      const prom = calcProm(aq.map(q => q.nota));
      mergedCell(r++,
        `Área ${n} — ${areaWeights[n-1]}%   Promedio: ${prom !== null ? prom.toFixed(1) : '—'}   (${aq.length}/${areaMaxCnt[n-1]} quizzes)`,
        C.sectionBg, fnt(true, 9, C.primary),
      );
      if (aq.length > 0) {
        tblHeader(r++, ['Nombre', 'Fecha', 'Nota /10']);
        aq.forEach((q, i) => tblRow(r++, [
          q.nombre ?? '—',
          q.fecha ? formatFecha(q.fecha) : '—',
          q.nota != null ? Number(q.nota) : '—',
        ], i, [2]));
      } else {
        mergedCell(r++, 'Sin quizzes registrados.', C.odd, fnt(false, 9, C.muted));
      }
    }
    blankRow(r++);

    // ── Parciales ────────────────────────────────────────────────────────────
    const parc = _insc.parciales ?? {};
    sec(r++, 'PARCIALES');
    tblHeader(r++, ['Parcial', 'Peso', 'Nota /100']);
    [
      ['Parcial I',   '15%', parc.parcial_1],
      ['Parcial II',  '15%', parc.parcial_2],
      ['Parcial III', '20%', parc.parcial_3],
    ].forEach(([lbl, pct, val], i) => tblRow(r++, [lbl, pct, val != null ? Number(val) : '—'], i, [2]));
    blankRow(r++);

    // ── Exposiciones ─────────────────────────────────────────────────────────
    const expos = snapToArray(_insc.exposiciones).sort(sortByFechaDesc);
    sec(r++, 'EXPOSICIONES (Área 3 — 20%)');
    if (expos.length > 0) {
      tblHeader(r++, ['Tema', 'Fecha', 'Nota /10']);
      expos.forEach((e, i) => tblRow(r++, [
        e.tema ?? '—',
        e.fecha ? formatFecha(e.fecha) : '—',
        e.nota != null ? Number(e.nota) : '—',
      ], i, [2]));
    } else {
      mergedCell(r++, 'Sin exposiciones registradas.', C.odd, fnt(false, 9, C.muted));
    }
    blankRow(r++);

    // ── Observaciones ────────────────────────────────────────────────────────
    const obs = (_insc.observaciones ?? '').trim();
    sec(r++, 'OBSERVACIONES');
    const obsLines = obs ? obs.split('\n') : ['Sin observaciones.'];
    for (const line of obsLines) {
      ws.getRow(r).height = 15;
      ws.mergeCells(r, 1, r, COLS);
      const c = ws.getCell(r, 1);
      c.value     = line;
      c.font      = fnt(false, 9, obs ? C.secondary : C.muted);
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
      r++;
    }

    // ── Pie ──────────────────────────────────────────────────────────────────
    blankRow(r++);
    ws.getRow(r).height = 14;
    ws.mergeCells(r, 1, r, COLS);
    const foot = ws.getCell(r, 1);
    foot.value     = `AcadVet USAM  ·  Generado el ${fechaHoy}`;
    foot.font      = fnt(false, 8, C.muted);
    foot.alignment = aln('center');

    // ── Descargar ────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safe   = s => (s ?? '').replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '').trim().replace(/\s+/g, '_');
    anchor.href     = url;
    anchor.download = `Expediente_${safe(_alumno.nombre)}_${safe(_materia.nombre)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Excel generado correctamente');

  } catch (err) {
    console.error('[AcadVet] Error generando Excel:', err);
    showToast('Error al generar Excel. Verificá tu conexión.', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
}
