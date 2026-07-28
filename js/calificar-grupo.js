// =============================================================================
// AcadVet USAM — Calificar Exposición de un grupo (ventana independiente)
// Se abre desde "Calificar Exposiciones" dentro de la materia. Lista a los
// integrantes del grupo; al elegir uno se califica con la rúbrica de
// exposición (11 criterios, 100 puntos) y se guarda en su expediente.
// =============================================================================

import { getDatabase, ref, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';
import { getExposiciones, addExposicion, updateExposicion } from './db.js';

const db = getDatabase(app);

const params   = new URLSearchParams(window.location.search);
const sorteoId = params.get('s') ?? '';
const grupoIdx = parseInt(params.get('g') ?? '', 10);

// Rúbrica de exposición — 11 criterios, 100 puntos totales.
const CRITERIOS = [
  { id: 'dominio',      label: 'Dominio del tema',            desc: 'Demuestra conocimiento, explica sin depender completamente de las diapositivas y responde preguntas con seguridad.', max: 20 },
  { id: 'organizacion', label: 'Organización del contenido',  desc: 'Sigue el orden establecido en la guía de exposición y desarrolla todos los apartados.', max: 15 },
  { id: 'rigor',        label: 'Rigor científico',             desc: 'La información es correcta, actualizada y utiliza terminología científica apropiada.', max: 15 },
  { id: 'calidad',      label: 'Calidad de la presentación',   desc: 'Diapositivas claras, ordenadas, con imágenes pertinentes y poco texto.', max: 10 },
  { id: 'bibliografia', label: 'Uso de bibliografía',          desc: 'Emplea fuentes científicas confiables y cita adecuadamente la información.', max: 5 },
  { id: 'voz',          label: 'Voz y dicción',                desc: 'Habla con volumen adecuado, buena pronunciación y vocaliza correctamente.', max: 5 },
  { id: 'fluidez',      label: 'Fluidez y seguridad',          desc: 'Mantiene un ritmo adecuado, evita leer constantemente y demuestra confianza.', max: 5 },
  { id: 'corporal',     label: 'Lenguaje corporal',            desc: 'Mantiene contacto visual, postura adecuada, gestos naturales y evita distracciones.', max: 5 },
  { id: 'tiempo',       label: 'Manejo del tiempo',            desc: 'Cumple con el tiempo asignado sin omitir ni extenderse innecesariamente.', max: 5 },
  { id: 'equipo',       label: 'Trabajo en equipo',            desc: 'Participación equilibrada, buena coordinación y transiciones fluidas entre integrantes.', max: 5 },
  { id: 'preguntas',    label: 'Respuesta a preguntas',        desc: 'Responde correctamente las preguntas del docente y de los compañeros.', max: 10 },
];
const MAX_TOTAL = CRITERIOS.reduce((s, c) => s + c.max, 0); // 100

let _materiaId  = null;
let _fechaGrupo = null;
let _miembros   = [];
let _nombres    = {};
let _activeId   = null;
let _existentes = {}; // alumnoId -> registro de exposición ya guardado para este sorteo+grupo
let _lastTema   = '';

if (!sorteoId || Number.isNaN(grupoIdx)) {
  showError('URL inválida. Abrí esta ventana desde "Calificar Exposiciones" dentro de la materia.');
} else {
  connect();
}

function connect() {
  onValue(
    ref(db, `grupos_sorteos/${sorteoId}`),
    snap => {
      if (!snap.exists()) { showError('El sorteo no existe o fue eliminado.'); return; }
      const data   = snap.val();
      const grupos = data.grupos ?? [];
      if (!grupos[grupoIdx]) { showError('Ese grupo ya no existe (el sorteo pudo haber cambiado).'); return; }

      document.getElementById('hMateria').textContent =
        [data.materiaNombre, data.ciclo].filter(Boolean).join(' · ');
      document.getElementById('hGrupo').textContent =
        `Grupo ${grupoIdx + 1} · ${data.fecha ?? ''}`;

      _materiaId  = data.materiaId;
      _fechaGrupo = data.fecha ?? todayStr();
      _miembros   = grupos[grupoIdx];
      _nombres    = data.alumnos ?? {};

      renderMembers();
      showMain();
      cargarExistentes();
    },
    err => {
      console.error('[AcadVet] Error cargando grupo:', err);
      showError('No tenés acceso a este sorteo. Iniciá sesión en el panel del docente e intentá de nuevo.');
    }
  );
}

// ---------------------------------------------------------------------------
// Calificaciones ya guardadas (para mostrar ✓ en la lista y precargar el form)
// ---------------------------------------------------------------------------
async function cargarExistentes() {
  const pares = await Promise.all(_miembros.map(async id => {
    try {
      const expos = await getExposiciones(id, _materiaId);
      const match = expos.find(e => e.sorteoId === sorteoId && e.grupoIndex === grupoIdx);
      return [id, match ?? null];
    } catch (err) {
      console.error('[AcadVet] Error consultando exposiciones:', err);
      return [id, null];
    }
  }));
  _existentes = Object.fromEntries(pares);
  renderMembers();
  if (_activeId) renderDetail();
}

// ---------------------------------------------------------------------------
// Lista de integrantes
// ---------------------------------------------------------------------------
function renderMembers() {
  const el = document.getElementById('memberList');
  el.innerHTML = _miembros.map(id => {
    const existente = _existentes[id];
    return `
      <div class="member-row${id === _activeId ? ' active' : ''}" data-mid="${id}">
        <div class="member-avatar">${initials(_nombres[id])}</div>
        <span class="member-name">${esc(_nombres[id] ?? '—')}</span>
        ${existente ? `<span class="member-badge">✓ ${fmtNota(existente.nota)}</span>` : ''}
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-mid]').forEach(row => {
    row.addEventListener('click', () => {
      _activeId = row.dataset.mid;
      renderMembers();
      renderDetail();
    });
  });
}

// ---------------------------------------------------------------------------
// Panel de calificación
// ---------------------------------------------------------------------------
function renderDetail() {
  const el = document.getElementById('detailPanel');
  el.classList.toggle('detail--form', !!_activeId);

  if (!_activeId) {
    el.innerHTML = `
      <div class="detail-empty">
        <div class="detail-icon">🎤</div>
        <div class="detail-msg">Elegí un integrante de la lista para calificar su exposición.</div>
      </div>`;
    return;
  }

  const existente = _existentes[_activeId];
  const isEdit    = !!existente;
  const rubrica   = existente?.rubrica ?? {};
  const tema      = existente?.tema ?? _lastTema;

  el.innerHTML = `
    <div class="rubric-wrap">
      <div class="rubric-header">
        <div class="detail-name">${esc(_nombres[_activeId] ?? '—')}</div>
        ${isEdit ? '<span class="rubric-edit-tag">Ya calificado — podés editarlo</span>' : ''}
      </div>

      <div class="form-row">
        <label class="form-label" for="rTema">Tema de la exposición</label>
        <input class="form-input" id="rTema" type="text"
          placeholder="Ej. Aparato digestivo en rumiantes" value="${esc(tema)}">
        <span class="form-error hidden" id="rTemaErr">Ingresá el tema de la exposición.</span>
      </div>

      <div class="rubric-list">
        ${CRITERIOS.map(c => `
          <div class="rubric-item">
            <div class="rubric-item__top">
              <label for="r_${c.id}">${esc(c.label)}</label>
              <input class="rubric-input" id="r_${c.id}" type="number"
                min="0" max="${c.max}" step="0.5" data-max="${c.max}"
                value="${rubrica[c.id] ?? ''}" placeholder="0">
              <span class="rubric-item__max">/ ${c.max}</span>
            </div>
            <p class="rubric-item__desc">${esc(c.desc)}</p>
          </div>
        `).join('')}
      </div>

      <div class="rubric-total">
        <span>Total</span>
        <span><strong id="rubricTotalVal">0</strong> / ${MAX_TOTAL}</span>
        <span class="rubric-total-nota">Nota: <strong id="rubricNotaVal">0.0</strong> / 10</span>
      </div>

      <p class="form-error hidden" id="rubricErr">
        Revisá los puntajes: no pueden ser negativos ni superar el máximo de cada criterio.
      </p>

      <div class="rubric-actions">
        <button class="rubric-save-btn" id="btnGuardarRubrica">
          ${isEdit ? 'Actualizar calificación' : 'Guardar calificación'}
        </button>
        <span class="rubric-saved-hint hidden" id="rubricSavedHint">✓ Guardado</span>
      </div>
    </div>
  `;

  el.querySelectorAll('.rubric-input').forEach(inp => {
    inp.addEventListener('input', updateTotales);
  });
  updateTotales();

  document.getElementById('btnGuardarRubrica')?.addEventListener('click', guardarCalificacion);
}

function updateTotales() {
  let total = 0;
  CRITERIOS.forEach(c => {
    const el = document.getElementById(`r_${c.id}`);
    const v  = parseFloat(el?.value);
    total += Number.isFinite(v) ? v : 0;
  });
  const totalEl = document.getElementById('rubricTotalVal');
  const notaEl  = document.getElementById('rubricNotaVal');
  if (totalEl) totalEl.textContent = String(total);
  if (notaEl)  notaEl.textContent  = (total / 10).toFixed(1);
}

async function guardarCalificacion() {
  const temaInput = document.getElementById('rTema');
  const tema      = temaInput?.value.trim() ?? '';
  const temaErr   = document.getElementById('rTemaErr');
  const rubricErr = document.getElementById('rubricErr');
  temaErr?.classList.add('hidden');
  rubricErr?.classList.add('hidden');

  let ok = true;
  if (!tema) {
    temaErr?.classList.remove('hidden');
    ok = false;
  }

  const rubrica = {};
  let total100  = 0;
  CRITERIOS.forEach(c => {
    const el = document.getElementById(`r_${c.id}`);
    const v  = parseFloat(el?.value);
    const val = Number.isFinite(v) ? v : 0;
    if (val < 0 || val > c.max) ok = false;
    rubrica[c.id] = val;
    total100 += val;
  });

  if (!ok) {
    rubricErr?.classList.remove('hidden');
    return;
  }

  const nota = Math.round((total100 / 10) * 100) / 100;

  const btn = document.getElementById('btnGuardarRubrica');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  const payload = {
    tema, nota, fecha: _fechaGrupo,
    sorteoId, grupoIndex: grupoIdx, rubrica, total100,
  };

  try {
    const existente = _existentes[_activeId];
    if (existente) {
      await updateExposicion(_activeId, _materiaId, existente.id, payload);
      _existentes[_activeId] = { ...existente, ...payload };
    } else {
      const id = await addExposicion(_activeId, _materiaId, payload);
      _existentes[_activeId] = { id, ...payload };
    }
    _lastTema = tema;
    renderMembers();
    const hint = document.getElementById('rubricSavedHint');
    if (hint) {
      hint.classList.remove('hidden');
      setTimeout(() => hint.classList.add('hidden'), 2500);
    }
    if (btn) btn.textContent = 'Actualizar calificación';
  } catch (err) {
    console.error('[AcadVet] Error guardando calificación:', err);
    rubricErr.textContent = 'Error al guardar. Verificá tu conexión e intentá de nuevo.';
    rubricErr?.classList.remove('hidden');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Estados de carga / error
// ---------------------------------------------------------------------------
function showMain() {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('mainLayout').classList.remove('hidden');
}

function showError(msg) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('mainLayout').classList.add('hidden');
  document.getElementById('errTxt').textContent = msg;
  document.getElementById('errorState').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function initials(nombre) {
  const p = (nombre ?? '').trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[1][0] : (p[0]?.[0] ?? '?')).toUpperCase();
}

function fmtNota(n) {
  return typeof n === 'number' ? n.toFixed(1) : '—';
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
