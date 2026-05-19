// =============================================================================
// AcadVet USAM — Vista: Gestión de Materias
// CRUD completo: crear, editar, archivar, reactivar
// =============================================================================

import {
  getMaterias, createMateria, updateMateria, archivarMateria,
} from '../db.js';
import { openModal, closeModal, showToast } from '../ui.js';

// Colores asignados por posición en la lista de activas
const COLORS = [
  { dot: '#6C63FF', badge: 'badge--primary' },
  { dot: '#00B4B5', badge: 'badge--accent' },
  { dot: '#FF6B6B', badge: 'badge--danger' },
  { dot: '#00B894', badge: 'badge--success' },
];

// Cache local — se recarga en cada operación
let materias = [];

// Referencia al contenedor principal (para re-render local)
let _container = null;

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export async function renderMaterias(container) {
  _container = container;
  document.getElementById('topbarTitle').textContent = 'Materias';

  container.innerHTML = `<div class="loading-state">
    <div class="loading-spinner"></div><p>Cargando materias…</p>
  </div>`;

  try {
    materias = await getMaterias();
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3 class="empty-state__title">Error al cargar</h3>
        <p class="empty-state__text">Verificá tu conexión o la configuración de Firebase.</p>
        <button class="btn btn--primary" id="btnRetryMaterias">Reintentar</button>
      </div>`;
    document.getElementById('btnRetryMaterias')
      ?.addEventListener('click', () => renderMaterias(container));
    return;
  }

  paint();
}

// ---------------------------------------------------------------------------
// Renderizado
// ---------------------------------------------------------------------------

function paint() {
  const activas    = materias.filter(m => m.estado === 'activa');
  const archivadas = materias.filter(m => m.estado === 'archivada');

  _container.innerHTML = `
    <div class="materias-view">

      <div class="view-header">
        <div>
          <h2 class="view-title">Mis Materias</h2>
          <p class="view-subtitle">
            ${activas.length} activa${activas.length !== 1 ? 's' : ''}
            ${archivadas.length ? ` &nbsp;·&nbsp; ${archivadas.length} archivada${archivadas.length !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <button class="btn btn--primary" id="btnNuevaMateria">+ Nueva materia</button>
      </div>

      <!-- Materias activas -->
      <div class="materia-list" id="listaActivas">
        ${activas.length === 0
          ? `<div class="empty-state" style="padding:var(--space-12) var(--space-8)">
               <div class="empty-state__icon">📚</div>
               <h3 class="empty-state__title">Sin materias activas</h3>
               <p class="empty-state__text">Creá tu primera materia para empezar a gestionar tus alumnos.</p>
             </div>`
          : activas.map((m, i) => rowHTML(m, i, false)).join('')
        }
      </div>

      <!-- Materias archivadas -->
      ${archivadas.length > 0 ? `
        <div class="section-header" style="margin-top:var(--space-8)">
          <h3 class="section-title text-muted" style="font-size:var(--text-base)">Archivadas</h3>
        </div>
        <div class="materia-list materia-list--archived">
          ${archivadas.map((m, i) => rowHTML(m, i, true)).join('')}
        </div>
      ` : ''}

    </div>
  `;

  // Wire events
  document.getElementById('btnNuevaMateria').addEventListener('click', openCreateModal);

  _container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, id } = btn.dataset;
      const m = materias.find(x => x.id === id);
      if (!m) return;
      if (action === 'edit')    openEditModal(m);
      if (action === 'archive') confirmArchive(m);
      if (action === 'activate') doActivate(m);
    });
  });
}

function rowHTML(materia, index, archived) {
  const c = COLORS[index % COLORS.length];
  const sec = materia.seccion
    ? `<span class="badge badge--outline">Secc. ${materia.seccion}</span>`
    : '';

  const actions = archived
    ? `<button class="btn btn--secondary btn--sm" data-action="activate" data-id="${materia.id}" title="Reactivar">
         ↩ Reactivar
       </button>`
    : `<button class="btn btn--ghost btn--sm" data-action="edit" data-id="${materia.id}" title="Editar" aria-label="Editar">
         <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
           <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
         </svg>
       </button>
       <button class="btn btn--ghost btn--sm text-warning" data-action="archive" data-id="${materia.id}" title="Archivar" aria-label="Archivar">
         <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
           <line x1="10" y1="12" x2="14" y2="12"/>
         </svg>
       </button>`;

  return `
    <div class="materia-row${archived ? ' materia-row--archived' : ''}">
      <div class="materia-row__dot" style="background:${archived ? '#C0BFCF' : c.dot}"></div>
      <div class="materia-row__info">
        <span class="materia-row__name">${materia.nombre}</span>
        <div class="materia-row__badges">
          <span class="badge ${c.badge}">${materia.ciclo}</span>
          ${sec}
          ${archived ? '<span class="badge badge--outline" style="opacity:.7">Archivada</span>' : ''}
        </div>
      </div>
      <div class="materia-row__actions">${actions}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Formulario — crear
// ---------------------------------------------------------------------------

function openCreateModal() {
  openModal({
    title: 'Nueva Materia',
    body: formBody({}),
    confirmLabel: 'Crear materia',
    async onConfirm() {
      const data = readForm();
      if (!data) return; // validación falló, modal permanece abierto
      try {
        await createMateria(data);
        closeModal();
        showToast('Materia creada');
        await reload();
      } catch (err) {
        showToast('Error al crear la materia', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Formulario — editar
// ---------------------------------------------------------------------------

function openEditModal(materia) {
  openModal({
    title: 'Editar Materia',
    body: formBody(materia),
    confirmLabel: 'Guardar cambios',
    async onConfirm() {
      const data = readForm();
      if (!data) return;
      try {
        await updateMateria(materia.id, data);
        closeModal();
        showToast('Materia actualizada');
        await reload();
      } catch (err) {
        showToast('Error al actualizar', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Confirmar archivar
// ---------------------------------------------------------------------------

function confirmArchive(materia) {
  openModal({
    title: 'Archivar materia',
    size: 'sm',
    body: `
      <p class="text-secondary">
        ¿Archivar <strong>${materia.nombre}</strong>?
      </p>
      <p class="text-muted text-sm" style="margin-top:var(--space-2)">
        La materia desaparecerá del dashboard pero sus datos se conservan.
        Podés reactivarla cuando quieras.
      </p>`,
    confirmLabel: 'Archivar',
    confirmVariant: 'danger',
    async onConfirm() {
      try {
        await archivarMateria(materia.id);
        closeModal();
        showToast('Materia archivada');
        await reload();
      } catch (err) {
        showToast('Error al archivar', 'error');
        console.error(err);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Reactivar
// ---------------------------------------------------------------------------

async function doActivate(materia) {
  try {
    await updateMateria(materia.id, { estado: 'activa' });
    showToast('Materia reactivada');
    await reload();
  } catch (err) {
    showToast('Error al reactivar', 'error');
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formBody({ nombre = '', ciclo = '', seccion = '' }) {
  return `
    <div class="form-group">
      <label class="form-label" for="fNombre">Nombre de la materia *</label>
      <input class="form-input" id="fNombre" type="text"
        value="${escHtml(nombre)}"
        placeholder="Ej. Bacteriología y Micología"
        maxlength="120" autocomplete="off">
      <span class="form-error hidden" id="fNombreErr">El nombre es obligatorio.</span>
    </div>
    <div class="form-group">
      <label class="form-label" for="fCiclo">Ciclo *</label>
      <input class="form-input" id="fCiclo" type="text"
        value="${escHtml(ciclo)}"
        list="ciclosSugeridos"
        placeholder="Ej. Ciclo I 2026"
        maxlength="40" autocomplete="off">
      <datalist id="ciclosSugeridos">
        <option value="Ciclo I 2026">
        <option value="Ciclo II 2026">
        <option value="Ciclo I 2027">
        <option value="Ciclo II 2027">
      </datalist>
      <span class="form-error hidden" id="fCicloErr">El ciclo es obligatorio.</span>
    </div>
    <div class="form-group">
      <label class="form-label" for="fSeccion">Sección <span class="text-muted">(opcional)</span></label>
      <input class="form-input" id="fSeccion" type="text"
        value="${escHtml(seccion)}"
        placeholder="Ej. A, B"
        maxlength="10" autocomplete="off">
    </div>
  `;
}

function readForm() {
  const nombre  = document.getElementById('fNombre')?.value.trim()  ?? '';
  const ciclo   = document.getElementById('fCiclo')?.value.trim()   ?? '';
  const seccion = document.getElementById('fSeccion')?.value.trim() || null;

  let ok = true;
  const nomErr  = document.getElementById('fNombreErr');
  const cicErr  = document.getElementById('fCicloErr');

  if (!nombre) {
    nomErr?.classList.remove('hidden');
    document.getElementById('fNombre')?.classList.add('form-input--error');
    ok = false;
  } else {
    nomErr?.classList.add('hidden');
    document.getElementById('fNombre')?.classList.remove('form-input--error');
  }

  if (!ciclo) {
    cicErr?.classList.remove('hidden');
    document.getElementById('fCiclo')?.classList.add('form-input--error');
    ok = false;
  } else {
    cicErr?.classList.add('hidden');
    document.getElementById('fCiclo')?.classList.remove('form-input--error');
  }

  if (!ok) return null;
  return { nombre, ciclo, seccion };
}

async function reload() {
  materias = await getMaterias();
  paint();
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
