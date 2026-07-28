// =============================================================================
// AcadVet USAM — Calificar Exposiciones por grupo
// Toma los grupos de trabajo ya sorteados en la materia y permite abrir una
// ventana independiente por grupo para elegir e ir calificando a cada
// integrante. El formulario de calificación se conecta cuando el docente
// defina los criterios de evaluación.
// =============================================================================

import { getGruposSorteosByMateria } from './db.js';
import { openModal, closeModal, showToast } from './ui.js';

// Fecha del sorteo que se preselecciona al abrir el segmento, si existe.
const FECHA_PREFERIDA = '2026-07-23';

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------
export async function openCalificarExposiciones(materia) {
  let sorteos;
  try {
    sorteos = await getGruposSorteosByMateria(materia.id);
  } catch (err) {
    showToast('No se pudieron cargar los grupos de esta materia', 'error');
    console.error('[AcadVet] Error cargando sorteos:', err);
    return;
  }

  sorteos = sorteos.filter(s => Array.isArray(s.grupos) && s.grupos.length > 0);

  if (sorteos.length === 0) {
    openModal({
      title: 'Calificar Exposiciones',
      size: 'sm',
      body: `
        <p class="text-secondary">
          Todavía no hay grupos de trabajo sorteados en <strong>${esc(materia.nombre)}</strong>.
        </p>
        <p class="text-sm text-muted" style="margin-top:var(--space-2)">
          Creá un sorteo primero desde el botón "Grupos de trabajo".
        </p>`,
      confirmLabel: 'Cerrar',
      cancelLabel: '',
      onConfirm: () => closeModal(),
    });
    document.getElementById('modalCancelBtn')?.remove();
    return;
  }

  const delDia   = sorteos.filter(s => s.fecha === FECHA_PREFERIDA);
  const inicial  = delDia[0] ?? sorteos[0];

  openModal({
    title: `Calificar Exposiciones — ${esc(materia.nombre)}`,
    size: 'lg',
    body: bodyHTML(sorteos, inicial),
    confirmLabel: 'Cerrar',
    cancelLabel: '',
    onConfirm: () => closeModal(),
  });
  document.getElementById('modalCancelBtn')?.remove();

  setTimeout(() => wire(sorteos, inicial), 0);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function bodyHTML(sorteos, selected) {
  return `
    <p class="text-sm text-muted" style="margin-bottom:var(--space-3)">
      Cada grupo abre en una ventana aparte — podés tener varias abiertas a la vez
      para ir calificando integrante por integrante.
    </p>
    ${sorteos.length > 1 ? `
      <div class="form-group">
        <label class="form-label" for="expoSorteoSelect">Sorteo de grupos</label>
        <select class="form-input" id="expoSorteoSelect">
          ${sorteos.map(s => `
            <option value="${s.id}" ${s.id === selected.id ? 'selected' : ''}>
              ${fechaLabel(s.fecha)} — ${s.grupos.length} grupo${s.grupos.length !== 1 ? 's' : ''}
            </option>`).join('')}
        </select>
      </div>` : ''}
    ${selected.fecha !== FECHA_PREFERIDA ? `
      <p class="text-xs text-muted" style="margin:-2px 0 var(--space-3)">
        No encontré un sorteo del 23 de julio en esta materia — mostrando ${fechaLabel(selected.fecha)}.
      </p>` : ''}
    <div class="grp-results-grid" id="expoGruposGrid"></div>
  `;
}

function wire(sorteos, inicial) {
  paintGrupos(inicial);
  document.getElementById('expoSorteoSelect')?.addEventListener('change', e => {
    const s = sorteos.find(x => x.id === e.target.value);
    if (s) paintGrupos(s);
  });
}

function paintGrupos(sorteo) {
  const grid = document.getElementById('expoGruposGrid');
  if (!grid) return;
  const nombres = sorteo.alumnos ?? {};

  grid.innerHTML = sorteo.grupos.map((miembros, i) => `
    <div class="grp-card" style="animation-delay:${i * 50}ms">
      <div class="grp-card__header">
        <span class="grp-card__title">Grupo ${i + 1}</span>
        <span class="grp-card__count">${miembros.length} alumno${miembros.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="grp-card__members">
        ${miembros.map(id => `<div class="text-sm">${esc(nombres[id] ?? '—')}</div>`).join('')}
      </div>
      <button class="btn btn--primary btn--sm" data-open-grupo="${i}" style="margin-top:var(--space-1)">
        Abrir ventana ↗
      </button>
    </div>
  `).join('');

  grid.querySelectorAll('[data-open-grupo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
      window.open(`${base}calificar-grupo.html?s=${sorteo.id}&g=${btn.dataset.openGrupo}`, '_blank');
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fechaLabel(fecha) {
  if (!fecha) return 'Sin fecha';
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-SV', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
