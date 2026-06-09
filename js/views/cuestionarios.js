// =============================================================================
// AcadVet USAM — Vista: Cuestionarios en línea
// Panel docente: crear, editar, listar, activar/desactivar y ver resultados
// =============================================================================

import {
  getCuestionarios, createCuestionario, updateCuestionario,
  deleteCuestionario, toggleCuestionarioActivo, getCuestionariosResultados,
  deleteResultado, deleteResultadosByQuiz,
  getCuestionarioCorrect, getCuestionariosCorrectMap,
} from '../db.js';
import { showToast, openModal, closeModal } from '../ui.js';

// ---------------------------------------------------------------------------
// Estado del módulo
// ---------------------------------------------------------------------------
let _container    = null;
let _quiz         = [];
let _results      = [];
let _tab          = 'crear';
let _questions    = [];
let _filterQuizId = '';
let _editId       = null;   // null = creando nuevo, string = editando ese id

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------
export async function renderCuestionarios(container) {
  _container = container;
  container.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando cuestionarios…</p></div>`;
  try {
    _quiz = await getCuestionarios();
  } catch (err) {
    console.error('[AcadVet] Error cargando cuestionarios:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3 class="empty-state__title">Error al cargar</h3>
        <p class="empty-state__text">Verificá tu conexión e intentá de nuevo.</p>
        <button class="btn btn--primary" id="btnRetryCuest">Reintentar</button>
      </div>`;
    document.getElementById('btnRetryCuest')
      ?.addEventListener('click', () => renderCuestionarios(container));
    return;
  }
  _questions    = [];
  _tab          = 'crear';
  _results      = [];
  _filterQuizId = '';
  _editId       = null;
  paint();
}

// ---------------------------------------------------------------------------
// Shell principal con pestañas
// ---------------------------------------------------------------------------
function paint() {
  _container.innerHTML = `
    <div class="cuest-view">
      <div class="view-header" style="margin-bottom:0">
        <div>
          <h2 class="view-title">Cuestionarios en línea</h2>
          <p class="view-subtitle">Crea exámenes, compártelos vía QR y revisa resultados</p>
        </div>
      </div>

      <nav class="tabs-nav" style="margin-top:var(--space-5)">
        <button class="tab-btn${_tab==='crear'      ? ' active':''}" data-tab="crear">📋 ${_editId ? 'Editando' : 'Crear'}</button>
        <button class="tab-btn${_tab==='lista'      ? ' active':''}" data-tab="lista">📦 Mis cuestionarios</button>
        <button class="tab-btn${_tab==='resultados' ? ' active':''}" data-tab="resultados">📊 Resultados</button>
      </nav>

      <div class="tab-content" id="cuestTabContent"></div>
    </div>
  `;

  _container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab !== 'crear') {
        _editId    = null;
        _questions = [];
      }
      _tab = btn.dataset.tab;
      _container.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      // Actualizar etiqueta "Crear / Editando"
      _container.querySelector('[data-tab="crear"]').textContent = `📋 ${_editId ? 'Editando' : 'Crear'}`;
      renderTabContent();
    });
  });

  renderTabContent();
}

function renderTabContent() {
  const el = document.getElementById('cuestTabContent');
  if (!el) return;
  if      (_tab === 'crear')      renderTabCrear(el);
  else if (_tab === 'lista')      renderTabLista(el);
  else if (_tab === 'resultados') renderTabResultados(el);
}

// ===========================================================================
// TAB: CREAR / EDITAR CUESTIONARIO
// ===========================================================================

function renderTabCrear(el) {
  const editing  = !!_editId;
  const quizData = editing ? _quiz.find(q => q.id === _editId) : null;

  el.innerHTML = `
    <div class="cuest-form-wrap">

      ${editing ? `
        <div class="cuest-edit-banner">
          <span>✏️ Editando: <strong>${esc(quizData?.nombre || _editId)}</strong></span>
          <button class="btn btn--secondary btn--sm" id="btnCancelEdit">Cancelar edición</button>
        </div>` : ''}

      <!-- Datos generales -->
      <div class="cuest-section-card">
        <h3 class="cuest-section-title">Datos del cuestionario</h3>
        <div class="form-group">
          <label class="form-label">Nombre *</label>
          <input class="form-input" id="cNombre" type="text"
            placeholder="Ej. Parcial 1 — Anatomía Veterinaria" maxlength="120"
            value="${esc(quizData?.nombre || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Descripción / instrucciones</label>
          <textarea class="form-input" id="cDesc" rows="2"
            placeholder="Instrucciones para el alumno (opcional)" maxlength="500"
          >${esc(quizData?.desc || '')}</textarea>
        </div>
        <div class="cuest-row-2">
          <div class="form-group">
            <label class="form-label">Tiempo límite (minutos)</label>
            <input class="form-input" id="cTiempo" type="number" min="1" max="180"
              value="${quizData?.tiempo ?? 30}">
          </div>
          <div class="form-group">
            <label class="form-label">Mostrar nota al alumno</label>
            <select class="form-input" id="cMostrarNota">
              <option value="si" ${(quizData?.mostrarNota ?? 'si') === 'si' ? 'selected' : ''}>Sí — mostrar resultado</option>
              <option value="no" ${quizData?.mostrarNota === 'no' ? 'selected' : ''}>No — ocultar resultado</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Editor de preguntas -->
      <div class="cuest-section-card">
        <div class="cuest-qeditor-header">
          <h3 class="cuest-section-title">
            Preguntas
            <span class="cuest-q-count" id="cuestQCount">(${_questions.length})</span>
          </h3>
          <div class="cuest-add-row">
            <select class="form-input form-input--sm" id="qTypeSelect">
              <option value="multiple">Opción múltiple</option>
              <option value="truefalse">Verdadero / Falso</option>
              <option value="short">Respuesta corta</option>
              <option value="fill">Completar espacio</option>
              <option value="imagen">Con imagen</option>
            </select>
            <button class="btn btn--primary btn--sm" id="btnAddQ">+ Agregar pregunta</button>
          </div>
        </div>
        <div id="cuestQList" class="cuest-q-list"></div>
      </div>

      <!-- Guardar -->
      <div class="cuest-save-row">
        <button class="btn btn--primary" id="btnSaveQuiz" style="min-width:220px">
          ${editing ? '💾 Guardar cambios' : 'Guardar y publicar cuestionario'}
        </button>
      </div>
    </div>
  `;

  renderQList();

  document.getElementById('btnCancelEdit')?.addEventListener('click', () => {
    _editId    = null;
    _questions = [];
    _tab       = 'lista';
    paint();
  });

  document.getElementById('btnAddQ').addEventListener('click', () => {
    syncQuestionsFromDOM();
    const tipo = document.getElementById('qTypeSelect').value;
    if (tipo === 'multiple')  _questions.push({ tipo, texto: '', opciones: ['', '', ''], correcta: 0, puntos: 1 });
    if (tipo === 'truefalse') _questions.push({ tipo, texto: '', correcta: 'verdadero', puntos: 1 });
    if (tipo === 'short')     _questions.push({ tipo, texto: '', correcta: '', puntos: 1 });
    if (tipo === 'fill')      _questions.push({ tipo, texto: '', correcta: '', puntos: 1 });
    if (tipo === 'imagen')    _questions.push({ tipo, texto: '', imagen: '', opciones: ['', '', ''], correcta: 0, puntos: 1 });
    renderQList();
    setTimeout(() => {
      const last = document.querySelectorAll('.cuest-q-card');
      last[last.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  });

  // Delegación de upload de imágenes
  document.getElementById('cuestQList').addEventListener('change', async e => {
    const fileInput = e.target.closest('.cuest-img-file');
    if (!fileInput || !fileInput.files[0]) return;
    const qi  = parseInt(fileInput.dataset.qi);
    const url = await compressImage(fileInput.files[0], 900, 0.75);
    syncQuestionsFromDOM();
    _questions[qi].imagen = url;
    renderQList();
  });

  document.getElementById('cuestQList').addEventListener('click', e => {
    const btn    = e.target.closest('[data-qaction]');
    if (!btn) return;
    const action = btn.dataset.qaction;
    const idx    = parseInt(btn.dataset.idx);
    const j      = parseInt(btn.dataset.j);
    syncQuestionsFromDOM();
    if (action === 'remove-q') {
      _questions.splice(idx, 1);
      renderQList();
    } else if (action === 'move-up' && idx > 0) {
      [_questions[idx - 1], _questions[idx]] = [_questions[idx], _questions[idx - 1]];
      renderQList();
    } else if (action === 'move-down' && idx < _questions.length - 1) {
      [_questions[idx + 1], _questions[idx]] = [_questions[idx], _questions[idx + 1]];
      renderQList();
    } else if (action === 'add-opt') {
      if (_questions[idx].opciones.length < 6) _questions[idx].opciones.push('');
      renderQList();
    } else if (action === 'remove-opt') {
      if (_questions[idx].opciones.length > 2) {
        _questions[idx].opciones.splice(j, 1);
        if (_questions[idx].correcta >= _questions[idx].opciones.length)
          _questions[idx].correcta = 0;
      }
      renderQList();
    }
  });

  document.getElementById('btnSaveQuiz').addEventListener('click', saveQuiz);
}

// ---------------------------------------------------------------------------
// Leer valores actuales del DOM → _questions
// ---------------------------------------------------------------------------
function syncQuestionsFromDOM() {
  _questions.forEach((q, i) => {
    const textoEl = document.getElementById(`q-${i}-texto`);
    if (textoEl) q.texto = textoEl.value;

    const pEl = document.getElementById(`q-${i}-puntos`);
    if (pEl) q.puntos = Math.max(1, parseInt(pEl.value) || 1);

    if (q.tipo === 'multiple' || q.tipo === 'imagen') {
      q.opciones.forEach((_, j) => {
        const o = document.getElementById(`q-${i}-opt-${j}`);
        if (o) q.opciones[j] = o.value;
      });
      const checked = document.querySelector(`input[name="q-${i}-correcta"]:checked`);
      if (checked) q.correcta = parseInt(checked.value);
      // imagen permanece en estado (_questions[i].imagen), no viene del DOM
    }
    if (q.tipo === 'truefalse') {
      const checked = document.querySelector(`input[name="q-${i}-correcta"]:checked`);
      if (checked) q.correcta = checked.value;
    }
    if (q.tipo === 'short' || q.tipo === 'fill') {
      const c = document.getElementById(`q-${i}-correcta`);
      if (c) q.correcta = c.value;
    }
  });
}

// ---------------------------------------------------------------------------
// Renderizar lista de tarjetas de preguntas
// ---------------------------------------------------------------------------
function renderQList() {
  const list  = document.getElementById('cuestQList');
  const count = document.getElementById('cuestQCount');
  if (!list) return;

  if (count) count.textContent = `(${_questions.length})`;

  if (_questions.length === 0) {
    list.innerHTML = `
      <div class="tab-placeholder" style="padding:var(--space-8)">
        <span>❓</span>
        <p>Aún no hay preguntas. Seleccioná un tipo y hacé clic en "+ Agregar pregunta".</p>
      </div>`;
    return;
  }

  list.innerHTML = _questions.map((q, i) => buildQCard(q, i)).join('');
}

const TIPO_LABEL = {
  multiple:  'Opción múltiple',
  truefalse: 'Verdadero / Falso',
  short:     'Respuesta corta',
  fill:      'Completar espacio',
  imagen:    'Con imagen',
};

function buildQCard(q, i) {
  const total = _questions.length;

  const optsHtml = (q.tipo === 'multiple' || q.tipo === 'imagen') ? `
    <div class="cuest-opts-list">
      ${q.opciones.map((opt, j) => `
        <div class="cuest-opt-row">
          <input type="radio" name="q-${i}-correcta" value="${j}"
            ${j === q.correcta ? 'checked' : ''}
            title="Marcar como correcta">
          <input class="form-input form-input--sm cuest-opt-input"
            id="q-${i}-opt-${j}" type="text" value="${esc(opt)}"
            placeholder="Opción ${j + 1}">
          <button class="btn btn--icon btn--sm" data-qaction="remove-opt"
            data-idx="${i}" data-j="${j}" title="Eliminar opción"
            ${q.opciones.length <= 2 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      `).join('')}
      ${q.opciones.length < 6 ? `
        <button class="btn btn--secondary btn--sm" data-qaction="add-opt" data-idx="${i}">
          + Opción
        </button>` : ''}
    </div>
    <p class="cuest-hint">Seleccioná el círculo de la opción correcta.</p>
  ` : '';

  const opts = q.tipo === 'multiple' ? optsHtml : '';

  const imagenBlock = q.tipo === 'imagen' ? `
    <div class="cuest-img-upload-wrap">
      ${q.imagen ? `<img src="${q.imagen}" class="cuest-img-preview" alt="Imagen de la pregunta">` : ''}
      <label class="cuest-img-upload-label">
        <input type="file" accept="image/*" class="cuest-img-file" data-qi="${i}" style="display:none">
        <span class="btn btn--secondary btn--sm">${q.imagen ? '🔄 Cambiar imagen' : '🖼 Subir imagen *'}</span>
      </label>
      ${!q.imagen ? `<p class="cuest-hint" style="color:var(--color-danger)">La imagen es obligatoria.</p>` : ''}
    </div>
    ${optsHtml}
  ` : '';

  const truefalseOpts = q.tipo === 'truefalse' ? `
    <div class="cuest-tf-row">
      <label class="cuest-tf-label">
        <input type="radio" name="q-${i}-correcta" value="verdadero"
          ${q.correcta === 'verdadero' ? 'checked' : ''}>
        Verdadero
      </label>
      <label class="cuest-tf-label">
        <input type="radio" name="q-${i}-correcta" value="falso"
          ${q.correcta === 'falso' ? 'checked' : ''}>
        Falso
      </label>
    </div>
  ` : '';

  const shortInput = (q.tipo === 'short' || q.tipo === 'fill') ? `
    <div class="form-group" style="margin-top:var(--space-3)">
      <label class="form-label">
        ${q.tipo === 'fill' ? 'Texto que completa el espacio (___) *' : 'Respuesta correcta *'}
      </label>
      <input class="form-input" id="q-${i}-correcta" type="text"
        value="${esc(q.correcta)}"
        placeholder="${q.tipo === 'fill' ? 'Ej. 4 (lo que va en el espacio en blanco)' : 'Ej. Hueso hioides'}">
    </div>
    ${q.tipo === 'fill' ? `<p class="cuest-hint">Usá ___ en el texto de la pregunta para marcar el espacio en blanco.</p>` : ''}
  ` : '';

  return `
    <div class="cuest-q-card">
      <div class="cuest-q-card-header">
        <span class="cuest-q-num">P${i + 1}</span>
        <span class="cuest-q-tipo-badge">${TIPO_LABEL[q.tipo] || q.tipo}</span>
        <div class="cuest-q-pts">
          <label class="form-label" style="margin:0">Pts:</label>
          <input class="form-input form-input--sm" id="q-${i}-puntos"
            type="number" min="1" max="100" value="${q.puntos}" style="width:60px">
        </div>
        <div class="cuest-q-move-btns">
          <button class="btn btn--icon btn--sm" data-qaction="move-up" data-idx="${i}"
            title="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn btn--icon btn--sm" data-qaction="move-down" data-idx="${i}"
            title="Bajar" ${i === total - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <button class="btn btn--danger btn--sm" data-qaction="remove-q" data-idx="${i}">
          Eliminar
        </button>
      </div>
      <div class="form-group" style="margin-top:var(--space-3)">
        <label class="form-label">Enunciado de la pregunta *</label>
        <textarea class="form-input" id="q-${i}-texto" rows="2"
          placeholder="${q.tipo === 'fill' ? 'Ej. El animal con más vértebras es ___ .' : 'Escribe el enunciado aquí…'}"
        >${esc(q.texto)}</textarea>
      </div>
      ${opts}${truefalseOpts}${shortInput}${imagenBlock}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Guardar (crear o actualizar) cuestionario
// ---------------------------------------------------------------------------
async function saveQuiz() {
  const nombre      = document.getElementById('cNombre')?.value.trim();
  const desc        = document.getElementById('cDesc')?.value.trim() || '';
  const tiempo      = parseInt(document.getElementById('cTiempo')?.value) || 30;
  const mostrarNota = document.getElementById('cMostrarNota')?.value || 'si';

  if (!nombre) {
    showToast('El nombre del cuestionario es obligatorio.', 'error');
    document.getElementById('cNombre')?.focus();
    return;
  }

  syncQuestionsFromDOM();

  if (_questions.length === 0) {
    showToast('Agregá al menos una pregunta.', 'error');
    return;
  }

  for (let i = 0; i < _questions.length; i++) {
    const q = _questions[i];
    if (!q.texto.trim()) {
      showToast(`La pregunta ${i + 1} no tiene enunciado.`, 'error');
      document.getElementById(`q-${i}-texto`)?.focus();
      return;
    }
    if (q.tipo === 'multiple') {
      for (let j = 0; j < q.opciones.length; j++) {
        if (!q.opciones[j].trim()) {
          showToast(`La opción ${j + 1} de la pregunta ${i + 1} está vacía.`, 'error');
          document.getElementById(`q-${i}-opt-${j}`)?.focus();
          return;
        }
      }
    }
    if ((q.tipo === 'short' || q.tipo === 'fill') && !q.correcta.trim()) {
      showToast(`La respuesta correcta de la pregunta ${i + 1} es obligatoria.`, 'error');
      document.getElementById(`q-${i}-correcta`)?.focus();
      return;
    }
    if (q.tipo === 'imagen' && !q.imagen) {
      showToast(`La imagen de la pregunta ${i + 1} es obligatoria.`, 'error');
      return;
    }
    if (q.tipo === 'imagen') {
      for (let j = 0; j < q.opciones.length; j++) {
        if (!q.opciones[j].trim()) {
          showToast(`La opción ${j + 1} de la pregunta ${i + 1} está vacía.`, 'error');
          document.getElementById(`q-${i}-opt-${j}`)?.focus();
          return;
        }
      }
    }
  }

  const btn = document.getElementById('btnSaveQuiz');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    if (_editId) {
      await updateCuestionario(_editId, { nombre, desc, tiempo, mostrarNota, preguntas: _questions });
      _quiz = await getCuestionarios();
      _editId    = null;
      _questions = [];
      _tab       = 'lista';
      showToast('Cuestionario actualizado correctamente.', 'success');
      paint();
    } else {
      await createCuestionario({ nombre, desc, tiempo, mostrarNota, preguntas: _questions });
      _quiz      = await getCuestionarios();
      _questions = [];
      _tab       = 'lista';
      showToast('Cuestionario guardado correctamente.', 'success');
      paint();
    }
  } catch (err) {
    console.error('[AcadVet] Error guardando cuestionario:', err);
    showToast('Error al guardar. Revisá tu conexión.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = _editId ? '💾 Guardar cambios' : 'Guardar y publicar cuestionario'; }
  }
}

// ===========================================================================
// TAB: MIS CUESTIONARIOS
// ===========================================================================

function renderTabLista(el) {
  if (_quiz.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:var(--space-16)">
        <div class="empty-state__icon">📋</div>
        <h3 class="empty-state__title">Sin cuestionarios aún</h3>
        <p class="empty-state__text">Creá tu primer cuestionario en la pestaña "Crear".</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="cuest-list">
      ${_quiz.map(q => {
        const preguntas = normPreguntas(q.preguntas);
        const totalPts  = preguntas.reduce((s, p) => s + (p.puntos || 1), 0);
        const fecha     = q.creado_en ? new Date(q.creado_en).toLocaleDateString('es-SV') : '—';
        const shareUrl  = getShareUrl(q.id);
        const activo    = q.activo !== false;
        return `
          <div class="cuest-row${activo ? '' : ' cuest-row--inactive'}">
            <div class="cuest-row-info">
              <div class="cuest-row-nombre">
                ${esc(q.nombre)}
                <span class="cuest-status-badge ${activo ? 'cuest-status--on' : 'cuest-status--off'}">
                  ${activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div class="cuest-row-meta">
                <span>${preguntas.length} pregunta${preguntas.length !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>${totalPts} pt${totalPts !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>${q.tiempo} min</span>
                <span>·</span>
                <span>${fecha}</span>
              </div>
              ${q.desc ? `<div class="cuest-row-desc">${esc(q.desc)}</div>` : ''}
            </div>
            <div class="cuest-row-actions">
              <button class="btn btn--secondary btn--sm cuest-toggle-btn"
                data-qid="${q.id}" data-activo="${activo}"
                title="${activo ? 'Desactivar' : 'Activar'} cuestionario">
                ${activo ? '⏸ Desactivar' : '▶ Activar'}
              </button>
              <button class="btn btn--secondary btn--sm cuest-edit-btn"
                data-qid="${q.id}" title="Editar cuestionario">
                ✏️ Editar
              </button>
              <button class="btn btn--secondary btn--sm" data-copy="${shareUrl}" title="Copiar enlace">
                🔗 Enlace
              </button>
              <button class="btn btn--secondary btn--sm cuest-qr-btn"
                data-qid="${q.id}" data-url="${shareUrl}" title="Ver código QR">
                QR
              </button>
              <button class="btn btn--danger btn--sm" data-delete="${q.id}" title="Eliminar cuestionario">
                Eliminar
              </button>
            </div>
            <div class="cuest-qr-wrap hidden" id="qr-${q.id}"></div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  el.addEventListener('click', async e => {
    const copyBtn   = e.target.closest('[data-copy]');
    const qrBtn     = e.target.closest('.cuest-qr-btn');
    const deleteBtn = e.target.closest('[data-delete]');
    const toggleBtn = e.target.closest('.cuest-toggle-btn');
    const editBtn   = e.target.closest('.cuest-edit-btn');

    if (copyBtn) {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copy);
        showToast('Enlace copiado al portapapeles.', 'success');
      } catch {
        showToast('No se pudo copiar. Copialo manualmente:\n' + copyBtn.dataset.copy, 'error');
      }
    }

    if (qrBtn) {
      toggleQR(qrBtn.dataset.qid, qrBtn.dataset.url, qrBtn);
    }

    if (toggleBtn) {
      const qid      = toggleBtn.dataset.qid;
      const wasActive = toggleBtn.dataset.activo === 'true';
      toggleBtn.disabled = true;
      try {
        await toggleCuestionarioActivo(qid, !wasActive);
        const idx = _quiz.findIndex(q => q.id === qid);
        if (idx >= 0) _quiz[idx].activo = !wasActive;
        showToast(wasActive ? 'Cuestionario desactivado.' : 'Cuestionario activado.', 'success');
        renderTabLista(el);
      } catch {
        showToast('Error al cambiar estado. Revisá tu conexión.', 'error');
        toggleBtn.disabled = false;
      }
    }

    if (editBtn) {
      const qid  = editBtn.dataset.qid;
      const quiz = _quiz.find(q => q.id === qid);
      if (!quiz) return;
      editBtn.disabled = true;

      // Cargar respuestas correctas para repoblar el formulario de edición
      const correctData = await getCuestionarioCorrect(qid).catch(() => null);

      _editId    = qid;
      _questions = normPreguntas(quiz.preguntas).map((p, i) => ({
        ...p,
        // Reponer 'correcta' desde el nodo restringido
        correcta: correctData?.respuestas?.[i] ?? p.correcta ?? '',
        puntos:   correctData?.puntos?.[i]     ?? p.puntos   ?? 1,
      }));
      _tab = 'crear';
      paint();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      editBtn.disabled = false;
    }

    if (deleteBtn) {
      const id   = deleteBtn.dataset.delete;
      const quiz = _quiz.find(q => q.id === id);
      openModal({
        title:          'Eliminar cuestionario',
        body:           `<p>¿Eliminás el cuestionario <strong>${esc(quiz?.nombre || id)}</strong>? Esta acción no se puede deshacer. Los resultados ya guardados no se eliminan.</p>`,
        confirmLabel:   'Sí, eliminar',
        confirmVariant: 'danger',
        onConfirm: async () => {
          await deleteCuestionario(id);
          _quiz = _quiz.filter(q => q.id !== id);
          closeModal();
          showToast('Cuestionario eliminado.', 'success');
          renderTabLista(el);
        },
      });
    }
  });
}

async function toggleQR(qid, url, btn) {
  const wrap = document.getElementById(`qr-${qid}`);
  if (!wrap) return;

  if (!wrap.classList.contains('hidden')) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    btn.textContent = 'QR';
    return;
  }

  wrap.classList.remove('hidden');
  btn.textContent = 'Ocultar QR';
  wrap.innerHTML = '<p style="font-size:.8rem;color:var(--color-text-muted);padding:var(--space-3)">Generando QR…</p>';

  try {
    await loadQRLib();
    wrap.innerHTML = `
      <div class="cuest-qr-inner">
        <div id="qr-canvas-${qid}"></div>
        <p class="cuest-qr-url">${url}</p>
      </div>`;
    new window.QRCode(document.getElementById(`qr-canvas-${qid}`), {
      text: url, width: 180, height: 180,
      colorDark: '#1A1A2E', colorLight: '#FFFFFF',
    });
  } catch {
    wrap.innerHTML = '<p style="color:var(--color-danger);padding:var(--space-3)">No se pudo cargar QRCode.js</p>';
  }
}

// ===========================================================================
// TAB: RESULTADOS
// ===========================================================================

// ---------------------------------------------------------------------------
// Calificación en el panel — evalúa resultados pendientes usando las respuestas
// almacenadas en cuestionarios_correctas (nodo restringido a docentes).
// ---------------------------------------------------------------------------
function _evaluarRespuesta(tipo, respuesta, correcta) {
  if (respuesta === null || respuesta === undefined || respuesta === '') return false;
  if (tipo === 'multiple' || tipo === 'imagen') return parseInt(respuesta) === parseInt(correcta);
  if (tipo === 'truefalse') return String(respuesta) === String(correcta);
  if (tipo === 'short' || tipo === 'fill') {
    const norm = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    return norm(respuesta) === norm(correcta);
  }
  return false;
}

function _gradeResult(result, correctData) {
  if (!result.pendiente && result.puntos !== null && result.puntos !== undefined) {
    return result;
  }
  if (!correctData?.respuestas) return result;

  const { respuestas, puntos: ptsPorPregunta = [] } = correctData;
  const detalle = (result.detalle || []).map((d, i) => {
    const correcta       = respuestas[i];
    const pts            = ptsPorPregunta[i] ?? d.puntos ?? 1;
    const correcto       = _evaluarRespuesta(d.tipo, d.respuesta, correcta);
    return { ...d, correcto, puntos: pts, puntosObtenidos: correcto ? pts : 0 };
  });

  const puntos      = detalle.reduce((s, d) => s + (d.puntosObtenidos || 0), 0);
  const puntosTotal = detalle.reduce((s, d) => s + (d.puntos || 0), 0);
  const porcentaje  = puntosTotal > 0 ? Math.round((puntos / puntosTotal) * 100) : 0;

  return { ...result, detalle, puntos, puntosTotal, porcentaje };
}

async function renderTabResultados(el) {
  el.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando resultados…</p></div>`;
  try {
    const [rawResults, correctMap] = await Promise.all([
      getCuestionariosResultados(),
      getCuestionariosCorrectMap().catch(() => ({})),
    ]);
    // Calificar los pendientes usando las respuestas del nodo restringido
    _results = rawResults.map(r => _gradeResult(r, correctMap[r.cuestionarioId]));
  } catch (err) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">⚠️</div>
      <h3 class="empty-state__title">Error al cargar</h3>
      <p class="empty-state__text">Revisá tu conexión.</p>
      <button class="btn btn--primary" id="btnRetryResults">Reintentar</button>
    </div>`;
    document.getElementById('btnRetryResults')?.addEventListener('click', () => renderTabResultados(el));
    return;
  }
  paintResultados(el);
}

function paintResultados(el) {
  const quizIds   = [...new Set(_results.map(r => r.cuestionarioId).filter(Boolean))];
  const quizNames = {};
  _results.forEach(r => { if (r.cuestionarioId) quizNames[r.cuestionarioId] = r.cuestionarioNombre || r.cuestionarioId; });

  const filtered = _filterQuizId
    ? _results.filter(r => r.cuestionarioId === _filterQuizId)
    : _results;

  const avgPct = filtered.length
    ? Math.round(filtered.reduce((s, r) => s + (r.porcentaje || 0), 0) / filtered.length)
    : 0;

  el.innerHTML = `
    <div class="cuest-results-wrap">
      <div class="cuest-results-toolbar">
        <div class="cuest-results-stats">
          <span class="cuest-stat-chip">${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}</span>
          ${filtered.length ? `<span class="cuest-stat-chip cuest-stat-chip--info">Promedio: ${avgPct}%</span>` : ''}
        </div>
        <div class="cuest-results-controls">
          <select class="form-input form-input--sm" id="filterQuiz" style="min-width:200px">
            <option value="">— Todos los cuestionarios —</option>
            ${quizIds.map(id => `<option value="${id}" ${id === _filterQuizId ? 'selected' : ''}>${esc(quizNames[id] || id)}</option>`).join('')}
          </select>
          ${sessionStorage.getItem('acadvet_auth') === 'eps' ? `
            <span title="No disponible en sesión EPS" style="font-size:.78rem;color:var(--color-text-muted);padding:0 4px">
              🔒 Descargas no disponibles en sesión EPS
            </span>
          ` : `
          <button class="btn btn--secondary btn--sm" id="btnExportXLSX" ${filtered.length ? '' : 'disabled'}>
            📊 Excel
          </button>
          <button class="btn btn--secondary btn--sm" id="btnExportPDF" ${filtered.length ? '' : 'disabled'}>
            📄 PDF sin fotos
          </button>
          <button class="btn btn--secondary btn--sm" id="btnExportPDFFotos" ${filtered.length ? '' : 'disabled'}>
            📷 PDF con fotos
          </button>
          <button class="btn btn--danger btn--sm" id="btnDeleteAllResults" ${filtered.length ? '' : 'disabled'}
            title="${_filterQuizId ? 'Eliminar todos los resultados del cuestionario seleccionado' : 'Filtrá por cuestionario para eliminar todos sus resultados'}">
            🗑 Eliminar ${_filterQuizId ? 'todos' : 'resultados'}
          </button>
          `}
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state" style="padding:var(--space-12)">
          <div class="empty-state__icon">📊</div>
          <h3 class="empty-state__title">Sin resultados aún</h3>
          <p class="empty-state__text">Cuando los alumnos completen un cuestionario, los resultados aparecen aquí.</p>
        </div>` : `
        <div style="overflow-x:auto;margin-top:var(--space-4)">
          <table class="data-table cuest-results-table">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Carnet</th>
                <th>Cuestionario</th>
                <th>Nota</th>
                <th>%</th>
                <th>Salidas</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((r, i) => {
                const pct   = r.porcentaje ?? 0;
                const cls   = pct >= 60 ? 'nota--great' : 'nota--low';
                const fecha = r.submitTime ? new Date(r.submitTime).toLocaleString('es-SV') : '—';
                return `
                  <tr>
                    <td>
                      <div class="alumno-cell">
                        ${r.alumno?.foto
                          ? `<img src="${r.alumno.foto}" class="cuest-thumb" alt="Foto">`
                          : `<div class="alumno-avatar" style="background:linear-gradient(135deg,var(--color-primary),var(--color-accent))">${initials(r.alumno?.nombre)}</div>`
                        }
                        <span class="alumno-nombre">${esc(r.alumno?.nombre || '—')}</span>
                      </div>
                    </td>
                    <td><span class="carnet-chip">${esc(r.alumno?.carnet || '—')}</span></td>
                    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.cuestionarioNombre || '—')}</td>
                    <td><strong>${r.puntos ?? '—'}/${r.puntosTotal ?? '—'}</strong></td>
                    <td><span class="${cls}" style="font-weight:700">${pct}%</span></td>
                    <td style="text-align:center">${r.blurs ?? 0}</td>
                    <td style="white-space:nowrap;font-size:.8rem;color:var(--color-text-muted)">${fecha}</td>
                    <td style="white-space:nowrap">
                      <button class="btn btn--secondary btn--sm" data-detail="${i}">Ver</button>
                      ${sessionStorage.getItem('acadvet_auth') !== 'eps'
                        ? `<button class="btn btn--danger btn--sm" data-delete-result="${i}" style="margin-left:4px" title="Eliminar este resultado">🗑</button>`
                        : ''}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
    </div>
  `;

  document.getElementById('filterQuiz')?.addEventListener('change', e => {
    _filterQuizId = e.target.value;
    paintResultados(el);
  });

  document.getElementById('btnExportXLSX')?.addEventListener('click', () => exportXLSX(filtered));
  document.getElementById('btnExportPDF')?.addEventListener('click', () => exportPDF(filtered, false));
  document.getElementById('btnExportPDFFotos')?.addEventListener('click', () => exportPDF(filtered, true));

  // Eliminar todos los resultados (del cuestionario filtrado, o todos si no hay filtro)
  document.getElementById('btnDeleteAllResults')?.addEventListener('click', () => {
    const quizNombre = _filterQuizId
      ? (filtered[0]?.cuestionarioNombre || _filterQuizId)
      : null;
    const bodyMsg = quizNombre
      ? `<p>¿Eliminás <strong>todos los ${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}</strong> del cuestionario <strong>${esc(quizNombre)}</strong>? Esta acción no se puede deshacer.</p>`
      : `<p>¿Eliminás <strong>todos los ${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}</strong> de todos los cuestionarios? Esta acción no se puede deshacer.</p>`;

    openModal({
      title:          'Eliminar resultados',
      body:           bodyMsg,
      confirmLabel:   'Sí, eliminar',
      confirmVariant: 'danger',
      onConfirm: async () => {
        closeModal();
        try {
          let n = 0;
          if (_filterQuizId) {
            n = await deleteResultadosByQuiz(_filterQuizId);
            _results = _results.filter(r => r.cuestionarioId !== _filterQuizId);
          } else {
            // Eliminar todos los resultados visibles
            await Promise.all(filtered.map(r => deleteResultado(r.id)));
            n = filtered.length;
            _results = _results.filter(r => !filtered.find(f => f.id === r.id));
          }
          showToast(`${n} resultado${n !== 1 ? 's' : ''} eliminado${n !== 1 ? 's' : ''}.`, 'success');
          paintResultados(el);
        } catch {
          showToast('Error al eliminar. Revisá tu conexión.', 'error');
        }
      },
    });
  });

  // Eliminar resultado individual
  el.querySelectorAll('[data-delete-result]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.deleteResult);
      const r = filtered[i];
      openModal({
        title:          'Eliminar resultado',
        body:           `<p>¿Eliminás el resultado de <strong>${esc(r.alumno?.nombre || '—')}</strong>? Esta acción no se puede deshacer.</p>`,
        confirmLabel:   'Sí, eliminar',
        confirmVariant: 'danger',
        onConfirm: async () => {
          closeModal();
          try {
            await deleteResultado(r.id);
            _results = _results.filter(x => x.id !== r.id);
            showToast('Resultado eliminado.', 'success');
            paintResultados(el);
          } catch {
            showToast('Error al eliminar. Revisá tu conexión.', 'error');
          }
        },
      });
    });
  });

  el.querySelectorAll('[data-detail]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = filtered[parseInt(btn.dataset.detail)];
      openResultadoModal(r);
    });
  });
}

function openResultadoModal(r) {
  const detalle   = normPreguntas(r.detalle);
  const fecha     = r.submitTime ? new Date(r.submitTime).toLocaleString('es-SV') : '—';
  const pct       = r.porcentaje ?? 0;
  const pctColor  = pct >= 60 ? 'var(--color-success)' : 'var(--color-danger)';

  const detalleHtml = detalle.map((d, i) => `
    <div class="cuest-detail-row${d.correcto ? ' cuest-detail--ok' : ' cuest-detail--fail'}">
      <div class="cuest-detail-num">${i + 1}</div>
      <div class="cuest-detail-body">
        <p class="cuest-detail-q">${esc(d.q || '')}</p>
        <p class="cuest-detail-a">
          <strong>Respuesta:</strong> ${esc(String(d.respuesta ?? '—'))}
          ${d.correcto
            ? '<span style="color:var(--color-success);margin-left:6px">✓ Correcto</span>'
            : '<span style="color:var(--color-danger);margin-left:6px">✗ Incorrecto</span>'}
        </p>
        <p class="cuest-detail-pts">${d.puntosObtenidos ?? 0}/${d.puntos ?? 1} pts</p>
      </div>
    </div>
  `).join('');

  openModal({
    title: `Resultado — ${r.alumno?.nombre || 'Alumno'}`,
    size: 'lg',
    body: `
      <div class="cuest-modal-result">
        <div class="cuest-modal-header-info">
          ${r.alumno?.foto ? `<img src="${r.alumno.foto}" class="cuest-modal-photo" alt="Foto">` : ''}
          <div>
            <p><strong>${esc(r.alumno?.nombre || '—')}</strong></p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Carnet: ${esc(r.alumno?.carnet || '—')}</p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Email: ${esc(r.alumno?.email || '—')}</p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Fecha: ${fecha}</p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Salidas del examen: ${r.blurs ?? 0}</p>
          </div>
          <div class="cuest-modal-score" style="color:${pctColor}">
            <div class="cuest-modal-pct">${pct}%</div>
            <div class="cuest-modal-nota">${r.puntos ?? 0}/${r.puntosTotal ?? 0} pts</div>
          </div>
        </div>
        <h4 style="font-size:.85rem;font-weight:700;margin:var(--space-4) 0 var(--space-2);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em">Detalle por pregunta</h4>
        <div class="cuest-detail-list">${detalleHtml || '<p style="color:var(--color-text-muted)">Sin detalle disponible.</p>'}</div>
      </div>`,
    confirmLabel: 'Cerrar',
    cancelLabel: '',
    onConfirm: () => closeModal(),
  });
  document.getElementById('modalCancelBtn')?.remove();
}

// ---------------------------------------------------------------------------
// Export XLSX
// ---------------------------------------------------------------------------
async function exportXLSX(rows) {
  try {
    await loadXLSX();
    const data = [
      ['Alumno', 'Carnet', 'Email', 'Cuestionario', 'Puntos', 'Total', '%', 'Salidas', 'Fecha'],
      ...rows.map(r => [
        r.alumno?.nombre  || '',
        r.alumno?.carnet  || '',
        r.alumno?.email   || '',
        r.cuestionarioNombre || '',
        r.puntos         ?? 0,
        r.puntosTotal    ?? 0,
        r.porcentaje     ?? 0,
        r.blurs          ?? 0,
        r.submitTime ? new Date(r.submitTime).toLocaleString('es-SV') : '',
      ]),
    ];
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(data);
    window.XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
    window.XLSX.writeFile(wb, `resultados_cuestionarios_${Date.now()}.xlsx`);
    showToast('Excel generado.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al generar Excel.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Export PDF
// ---------------------------------------------------------------------------
async function exportPDF(rows, withPhotos = false) {
  try {
    await loadJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // ── Encabezado ──────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Resultados de Cuestionarios — AcadVet USAM', 14, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Generado: ${new Date().toLocaleString('es-SV')}  |  Total: ${rows.length}${withPhotos ? '  |  Con fotos' : ''}`,
      14, 22
    );

    // ── Columnas ─────────────────────────────────────────────────────────────
    const FOTO_W  = 18;   // ancho columna foto (mm)
    const ROW_H   = withPhotos ? 18 : 7;
    const HEAD_H  = 7;
    const FOTO_SZ = 13;   // tamaño cuadrado de la foto en mm
    const MARGIN  = 14;

    const cols = withPhotos
      ? ['Foto', 'Alumno', 'Carnet', 'Cuestionario', 'Nota', '%', 'Salidas', 'Fecha']
      : [        'Alumno', 'Carnet', 'Cuestionario', 'Nota', '%', 'Salidas', 'Fecha'];
    const colW = withPhotos
      ? [FOTO_W,    44,     24,       52,             20,    14,   17,        37]
      : [            52,    28,       60,             22,    16,   20,        40];

    let y = 30;

    // ── Cabecera de tabla ───────────────────────────────────────────────────
    doc.setFillColor(108, 99, 255);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    let x = MARGIN;
    cols.forEach((c, i) => {
      doc.rect(x, y, colW[i], HEAD_H, 'F');
      if (i > 0 || !withPhotos) doc.text(c, x + 2, y + 5);
      x += colW[i];
    });

    // ── Filas ───────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(26, 26, 46);
    y += HEAD_H;

    const totalW = colW.reduce((a, b) => a + b, 0);

    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];

      if (y + ROW_H > 195) { doc.addPage(); y = 16; }

      // Fondo alterno
      if (ri % 2 === 0) {
        doc.setFillColor(236, 238, 255);
        doc.rect(MARGIN, y, totalW, ROW_H, 'F');
      }

      x = MARGIN;

      // Columna foto
      if (withPhotos) {
        if (r.alumno?.foto) {
          try {
            const fmt = r.alumno.foto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            const pad = (ROW_H - FOTO_SZ) / 2;
            doc.addImage(r.alumno.foto, fmt, x + 2, y + pad, FOTO_SZ, FOTO_SZ);
          } catch (_) { /* foto inválida: se omite */ }
        }
        x += colW[0];
      }

      // Resto de columnas
      const colOffset = withPhotos ? 1 : 0;
      const rowData = [
        r.alumno?.nombre     || '—',
        r.alumno?.carnet     || '—',
        r.cuestionarioNombre || '—',
        `${r.puntos ?? 0}/${r.puntosTotal ?? 0}`,
        `${r.porcentaje ?? 0}%`,
        String(r.blurs ?? 0),
        r.submitTime ? new Date(r.submitTime).toLocaleDateString('es-SV') : '—',
      ];

      doc.setFontSize(7.5);
      doc.setTextColor(26, 26, 46);
      rowData.forEach((val, ci) => {
        const w   = colW[ci + colOffset];
        const txt = String(val).substring(0, Math.floor(w / 1.8));
        const ty  = withPhotos ? y + ROW_H / 2 + 1.5 : y + 5;
        doc.text(txt, x + 2, ty);
        x += w;
      });

      // Nota: colorear % columna
      const pct     = r.porcentaje ?? 0;
      const pctCol  = withPhotos ? 5 : 4;
      let   xPct    = MARGIN + colW.slice(0, pctCol + colOffset).reduce((a, b) => a + b, 0);
      const ty      = withPhotos ? y + ROW_H / 2 + 1.5 : y + 5;
      doc.setTextColor(pct >= 60 ? 0 : 200, pct >= 60 ? 150 : 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`${pct}%`, xPct + 2, ty);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(26, 26, 46);

      y += ROW_H;
    }

    const suffix = withPhotos ? 'con_fotos' : 'sin_fotos';
    doc.save(`resultados_cuestionarios_${suffix}_${Date.now()}.pdf`);
    showToast('PDF generado.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al generar PDF.', 'error');
  }
}

// ===========================================================================
// UTILIDADES
// ===========================================================================

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0]?.[0] ?? '?').toUpperCase();
}

function normPreguntas(p) {
  if (!p) return [];
  if (Array.isArray(p)) return p;
  return Object.values(p);
}

function getShareUrl(quizId) {
  const href = window.location.href.split('?')[0].split('#')[0];
  const base = href.substring(0, href.lastIndexOf('/') + 1);
  return base + 'cuestionario.html?q=' + quizId;
}

function loadQRLib() {
  return new Promise((resolve, reject) => {
    if (window.QRCode) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function compressImage(file, maxPx = 900, quality = 0.75) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}
