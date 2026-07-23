// =============================================================================
// AcadVet USAM — Grupos de trabajo al azar
// Sorteo de grupos por materia, con proyección en pantalla y ajuste manual.
// =============================================================================

import {
  createGrupoSorteo, updateGrupoSorteo,
  getGruposSorteosByMateria, deleteGrupoSorteo,
} from './db.js';
import { showToast } from './ui.js';

const REVEAL_DELAY = 3000; // ms de "suspenso" antes de mostrar el resultado

// ---------------------------------------------------------------------------
// Estado del módulo
// ---------------------------------------------------------------------------
let _g = null;
// _g = { materia, alumnos: [{id, nombre, carnet}], incluidos: Set<id>,
//        tamano, sorteoId, grupos: [[id,...]], estado, pickedId,
//        revealTimer, historial: [] }

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------
export async function openGruposSorteo(materia, alumnos) {
  if (_g) return;

  _g = {
    materia,
    alumnos: alumnos.map(a => ({ id: a.id, nombre: a.nombre, carnet: a.carnet })),
    incluidos: new Set(alumnos.map(a => a.id)),
    tamano: 4,
    sorteoId: null,
    grupos: null,
    estado: null,
    pickedId: null,
    revealTimer: null,
    historial: [],
  };

  buildOverlay();
  await loadHistorial();
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------
function buildOverlay() {
  const div = document.createElement('div');
  div.id = 'gruposOverlay';
  div.className = 'qr-overlay';

  div.innerHTML = `
    <div class="qr-panel-left">
      <div class="qr-panel-header">
        <div>
          <div class="qr-session-label">GRUPOS DE TRABAJO</div>
          <div class="qr-session-materia">${esc(_g.materia.nombre)}</div>
          <div class="text-sm text-muted">${esc(_g.materia.ciclo ?? '')}</div>
        </div>
        <button id="grpClose" class="btn btn--ghost btn--sm" aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="grp-field">
        <div class="grp-tamano-row">
          <span class="grp-tamano-label">Alumnos por grupo</span>
          <input type="number" id="grpTamano" class="grp-tamano-input" min="2" max="30" value="${_g.tamano}">
        </div>
        <div class="grp-preview" id="grpPreview"></div>
      </div>

      <div class="grp-field">
        <div class="qr-config-title">Alumnos incluidos en el sorteo</div>
        <div class="grp-alumno-list" id="grpAlumnoList"></div>
      </div>

      <button class="btn btn--primary" id="grpSortear">🎲 Sortear grupos</button>
      <button class="btn btn--secondary btn--sm" id="grpProyectar" disabled>📽 Abrir proyector</button>

      <div class="grp-historial">
        <div class="qr-config-title">Sorteos anteriores</div>
        <div id="grpHistorialList"></div>
      </div>
    </div>

    <div class="qr-panel-right" id="grpRight">
      ${emptyStateHtml()}
    </div>
  `;
  document.body.appendChild(div);
  wireEvents();
  paintAlumnoList();
  updatePreview();
}

function emptyStateHtml() {
  return `
    <div class="grp-empty-state">
      <div class="grp-empty-state__icon">🎲</div>
      <p>Elegí cuántos alumnos por grupo y presioná <strong>Sortear grupos</strong>.</p>
    </div>`;
}

function wireEvents() {
  document.getElementById('grpClose')?.addEventListener('click', closeOverlay);

  document.getElementById('grpTamano')?.addEventListener('input', e => {
    _g.tamano = Math.max(2, parseInt(e.target.value, 10) || 2);
    updatePreview();
  });

  document.getElementById('grpSortear')?.addEventListener('click', doSorteo);

  document.getElementById('grpProyectar')?.addEventListener('click', () => {
    if (!_g.sorteoId) return;
    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    window.open(`${base}proyector-grupos.html?s=${_g.sorteoId}`, '_blank');
  });
}

// ---------------------------------------------------------------------------
// Lista de alumnos incluidos
// ---------------------------------------------------------------------------
function paintAlumnoList() {
  const el = document.getElementById('grpAlumnoList');
  if (!el) return;
  el.innerHTML = _g.alumnos.map(a => `
    <label class="grp-alumno-row${_g.incluidos.has(a.id) ? '' : ' grp-alumno-row--off'}" data-alumno-id="${a.id}">
      <input type="checkbox" data-check-id="${a.id}" ${_g.incluidos.has(a.id) ? 'checked' : ''}>
      <span>${esc(a.nombre)}</span>
    </label>
  `).join('');

  el.querySelectorAll('[data-check-id]').forEach(chk => {
    chk.addEventListener('change', e => {
      const id = e.target.dataset.checkId;
      if (e.target.checked) _g.incluidos.add(id); else _g.incluidos.delete(id);
      e.target.closest('.grp-alumno-row')?.classList.toggle('grp-alumno-row--off', !e.target.checked);
      updatePreview();
    });
  });
}

function updatePreview() {
  const el = document.getElementById('grpPreview');
  if (!el) return;
  const n = _g.incluidos.size;
  if (n === 0) { el.innerHTML = 'Seleccioná al menos un alumno.'; return; }
  const sizes = tamanosDeGrupos(n, _g.tamano);
  el.innerHTML = `Se formarán <strong>${sizes.length}</strong> grupo${sizes.length !== 1 ? 's' : ''}: ${sizes.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Algoritmo de sorteo
// ---------------------------------------------------------------------------

/** Cantidad de grupos y tamaño de cada uno, lo más parejo posible. */
function tamanosDeGrupos(n, tamano) {
  const numGrupos = Math.max(1, Math.round(n / tamano));
  const base = Math.floor(n / numGrupos);
  const resto = n % numGrupos;
  return Array.from({ length: numGrupos }, (_, i) => base + (i < resto ? 1 : 0));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function armarGrupos(ids, tamano) {
  const shuffled = shuffle(ids);
  const sizes = tamanosDeGrupos(shuffled.length, tamano);
  const grupos = [];
  let cursor = 0;
  for (const size of sizes) {
    grupos.push(shuffled.slice(cursor, cursor + size));
    cursor += size;
  }
  return grupos;
}

// ---------------------------------------------------------------------------
// Sortear
// ---------------------------------------------------------------------------
async function doSorteo() {
  const idsIncluidos = _g.alumnos.filter(a => _g.incluidos.has(a.id)).map(a => a.id);
  if (idsIncluidos.length < 2) {
    showToast('Incluí al menos 2 alumnos para sortear grupos', 'error');
    return;
  }

  clearTimeout(_g.revealTimer);
  _g.grupos = armarGrupos(idsIncluidos, _g.tamano);
  _g.estado = 'sorteando';
  _g.pickedId = null;

  const nombres = {};
  _g.alumnos.forEach(a => { if (_g.incluidos.has(a.id)) nombres[a.id] = a.nombre; });

  try {
    _g.sorteoId = await createGrupoSorteo({
      materiaId:     _g.materia.id,
      materiaNombre: _g.materia.nombre,
      ciclo:         _g.materia.ciclo ?? '',
      tamano:        _g.tamano,
      alumnos:       nombres,
      grupos:        _g.grupos,
    });
  } catch (err) {
    showToast('No se pudo guardar el sorteo. Verificá tu conexión.', 'error');
    console.error(err);
    return;
  }

  document.getElementById('grpProyectar')?.removeAttribute('disabled');
  paintSorteando();

  _g.revealTimer = setTimeout(revelar, REVEAL_DELAY);
}

function paintSorteando() {
  const right = document.getElementById('grpRight');
  if (!right) return;
  const nombresIncluidos = _g.alumnos.filter(a => _g.incluidos.has(a.id)).map(a => a.nombre);

  right.innerHTML = `
    <div class="grp-shuffle-wrap">
      <div class="grp-shuffle-dice">🎲</div>
      <div class="grp-shuffle-title">Formando grupos…</div>
      <div class="grp-shuffle-name" id="grpShuffleName"></div>
      <button class="btn btn--secondary btn--sm" id="grpRevelarYa">✨ Revelar ahora</button>
    </div>
  `;

  const nameEl = document.getElementById('grpShuffleName');
  const cycleId = setInterval(() => {
    if (!nameEl) { clearInterval(cycleId); return; }
    nameEl.textContent = nombresIncluidos[Math.floor(Math.random() * nombresIncluidos.length)] ?? '';
  }, 120);
  right.dataset.cycleId = String(cycleId);

  document.getElementById('grpRevelarYa')?.addEventListener('click', () => {
    clearTimeout(_g.revealTimer);
    revelar();
  });
}

async function revelar() {
  if (!_g || _g.estado !== 'sorteando') return;
  const right = document.getElementById('grpRight');
  if (right?.dataset.cycleId) clearInterval(Number(right.dataset.cycleId));

  _g.estado = 'resultado';
  try {
    await updateGrupoSorteo(_g.sorteoId, { estado: 'resultado', grupos: _g.grupos });
  } catch (err) {
    console.error(err);
  }
  await loadHistorial();
  paintResultados();
}

// ---------------------------------------------------------------------------
// Resultado + ajuste manual (swap de dos alumnos entre grupos)
// ---------------------------------------------------------------------------
function paintResultados() {
  const right = document.getElementById('grpRight');
  if (!right) return;

  const byId = {};
  _g.alumnos.forEach(a => { byId[a.id] = a; });

  right.innerHTML = `
    <div class="grp-results-toolbar">
      <span class="grp-results-hint">Tocá un alumno y luego otro para intercambiarlos de grupo.</span>
      <button class="btn btn--secondary btn--sm" id="grpRepetir">🔀 Repetir sorteo</button>
    </div>
    <div class="grp-results-grid">
      ${_g.grupos.map((miembros, i) => `
        <div class="grp-card" style="animation-delay:${i * 60}ms">
          <div class="grp-card__header">
            <span class="grp-card__title">Grupo ${i + 1}</span>
            <span class="grp-card__count">${miembros.length} alumno${miembros.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="grp-card__members">
            ${miembros.map(id => `
              <button class="grp-chip${_g.pickedId === id ? ' grp-chip--picked' : ''}" data-chip-id="${id}">
                ${esc(byId[id]?.nombre ?? '—')}
              </button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  right.querySelectorAll('[data-chip-id]').forEach(btn => {
    btn.addEventListener('click', () => onChipClick(btn.dataset.chipId));
  });

  document.getElementById('grpRepetir')?.addEventListener('click', doSorteo);
}

function onChipClick(id) {
  if (_g.pickedId === null) {
    _g.pickedId = id;
    paintResultados();
    return;
  }
  if (_g.pickedId === id) {
    _g.pickedId = null;
    paintResultados();
    return;
  }
  swapAlumnos(_g.pickedId, id);
  _g.pickedId = null;
  paintResultados();
  updateGrupoSorteo(_g.sorteoId, { grupos: _g.grupos }).catch(err => console.error(err));
}

function swapAlumnos(idA, idB) {
  let posA = null, posB = null;
  _g.grupos.forEach((miembros, gi) => {
    const iA = miembros.indexOf(idA);
    const iB = miembros.indexOf(idB);
    if (iA !== -1) posA = { gi, i: iA };
    if (iB !== -1) posB = { gi, i: iB };
  });
  if (!posA || !posB) return;
  _g.grupos[posA.gi][posA.i] = idB;
  _g.grupos[posB.gi][posB.i] = idA;
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------
async function loadHistorial() {
  try {
    _g.historial = await getGruposSorteosByMateria(_g.materia.id);
  } catch (err) {
    console.error(err);
    _g.historial = [];
  }
  paintHistorial();
}

function paintHistorial() {
  const el = document.getElementById('grpHistorialList');
  if (!el) return;

  if (_g.historial.length === 0) {
    el.innerHTML = `<p class="text-xs text-muted">Sin sorteos previos en esta materia.</p>`;
    return;
  }

  el.innerHTML = _g.historial.map(h => `
    <div class="grp-historial-item">
      <div class="grp-historial-info">
        <div class="grp-historial-fecha">${esc(h.fecha ?? '')}</div>
        <div class="grp-historial-meta">${(h.grupos ?? []).length} grupos · ${h.tamano} por grupo</div>
      </div>
      <button class="btn btn--ghost btn--sm" data-hist-action="ver" data-hist-id="${h.id}" title="Ver / proyectar">👁</button>
      <button class="btn btn--ghost btn--sm" data-hist-action="borrar" data-hist-id="${h.id}" title="Eliminar">🗑</button>
    </div>
  `).join('');

  el.querySelectorAll('[data-hist-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { histAction, histId } = btn.dataset;
      const item = _g.historial.find(h => h.id === histId);
      if (!item) return;
      if (histAction === 'ver') verHistorial(item);
      if (histAction === 'borrar') borrarHistorial(item);
    });
  });
}

function verHistorial(item) {
  clearTimeout(_g.revealTimer);
  _g.sorteoId = item.id;
  _g.tamano = item.tamano;
  _g.grupos = item.grupos ?? [];
  _g.estado = 'resultado';
  _g.pickedId = null;

  // Restaurar el snapshot de nombres del historial (por si el alumno cambió/borró).
  const conocidos = new Set(_g.alumnos.map(a => a.id));
  Object.entries(item.alumnos ?? {}).forEach(([id, nombre]) => {
    if (!conocidos.has(id)) _g.alumnos.push({ id, nombre, carnet: '' });
  });

  document.getElementById('grpTamano').value = _g.tamano;
  document.getElementById('grpProyectar')?.removeAttribute('disabled');
  paintResultados();
  showToast('Sorteo cargado desde el historial');
}

async function borrarHistorial(item) {
  if (!confirm(`¿Eliminar el sorteo del ${item.fecha}?`)) return;
  try {
    await deleteGrupoSorteo(item.id);
    if (_g.sorteoId === item.id) {
      _g.sorteoId = null;
      _g.grupos = null;
      _g.estado = null;
      document.getElementById('grpProyectar')?.setAttribute('disabled', 'true');
      document.getElementById('grpRight').innerHTML = emptyStateHtml();
    }
    await loadHistorial();
    showToast('Sorteo eliminado');
  } catch (err) {
    showToast('Error al eliminar', 'error');
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------------
function closeOverlay() {
  clearTimeout(_g?.revealTimer);
  document.getElementById('gruposOverlay')?.remove();
  _g = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
