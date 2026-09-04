// =============================================================================
// AcadVet USAM — Vista: Reportes de Laboratorio (plantillas + entregas)
// Panel docente: crear/editar plantillas por práctica, compartir enlace,
// y revisar las entregas de los alumnos. Distinto de lab-reports-admin.html
// (que es la captura de foto de la práctica, no un formulario de texto).
// =============================================================================

import {
  getLabReportTemplates, createLabReportTemplate, updateLabReportTemplate,
  deleteLabReportTemplate, toggleLabReportTemplateActivo,
  getLabReportSubmissions, deleteLabReportSubmission, deleteLabReportSubmissionsByTemplate,
} from '../db.js';
import { showToast, openModal, closeModal } from '../ui.js';
import { downloadBlankWord, downloadBlankPDF, downloadFilledWord, downloadFilledPDF } from '../lab-report-export.js';

// ---------------------------------------------------------------------------
// Estado del módulo
// ---------------------------------------------------------------------------
let _container    = null;
let _templates     = [];
let _submissions    = [];
let _tab           = 'crear';
let _secciones      = [];
let _filterTplId    = '';
let _editId         = null;   // null = creando nuevo, string = editando esa plantilla

const TIPO_LABEL = { corta: 'Respuesta corta', larga: 'Respuesta extensa' };

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------
export async function renderLabReportTemplates(container) {
  _container = container;
  container.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando reportes de laboratorio…</p></div>`;
  try {
    _templates = await getLabReportTemplates();
  } catch (err) {
    console.error('[AcadVet] Error cargando plantillas de reporte:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3 class="empty-state__title">Error al cargar</h3>
        <p class="empty-state__text">Verificá tu conexión e intentá de nuevo.</p>
        <button class="btn btn--primary" id="btnRetryLabRep">Reintentar</button>
      </div>`;
    document.getElementById('btnRetryLabRep')
      ?.addEventListener('click', () => renderLabReportTemplates(container));
    return;
  }
  _secciones   = [];
  _tab         = 'crear';
  _submissions = [];
  _filterTplId = '';
  _editId      = null;
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
          <h2 class="view-title">Reportes de Laboratorio</h2>
          <p class="view-subtitle">Armá el formulario por práctica, compartilo con los alumnos y descargá en Word/PDF</p>
        </div>
      </div>

      <nav class="tabs-nav" style="margin-top:var(--space-5)">
        <button class="tab-btn${_tab==='crear'    ? ' active':''}" data-tab="crear">📋 ${_editId ? 'Editando' : 'Crear'}</button>
        <button class="tab-btn${_tab==='lista'    ? ' active':''}" data-tab="lista">📦 Mis plantillas</button>
        <button class="tab-btn${_tab==='entregas' ? ' active':''}" data-tab="entregas">📊 Entregas</button>
      </nav>

      <div class="tab-content" id="labRepTabContent"></div>
    </div>
  `;

  _container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab !== 'crear') {
        _editId    = null;
        _secciones = [];
      }
      _tab = btn.dataset.tab;
      _container.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      _container.querySelector('[data-tab="crear"]').textContent = `📋 ${_editId ? 'Editando' : 'Crear'}`;
      renderTabContent();
    });
  });

  renderTabContent();
}

function renderTabContent() {
  const el = document.getElementById('labRepTabContent');
  if (!el) return;
  if      (_tab === 'crear')    renderTabCrear(el);
  else if (_tab === 'lista')    renderTabLista(el);
  else if (_tab === 'entregas') renderTabEntregas(el);
}

// ===========================================================================
// TAB: CREAR / EDITAR PLANTILLA
// ===========================================================================

function renderTabCrear(el) {
  const editing = !!_editId;
  const tpl     = editing ? _templates.find(t => t.id === _editId) : null;

  el.innerHTML = `
    <div class="cuest-form-wrap">

      ${editing ? `
        <div class="cuest-edit-banner">
          <span>✏️ Editando: <strong>${esc(tpl?.nombre || _editId)}</strong></span>
          <button class="btn btn--secondary btn--sm" id="btnCancelEdit">Cancelar edición</button>
        </div>` : ''}

      <div class="cuest-section-card">
        <h3 class="cuest-section-title">Datos de la plantilla</h3>
        <div class="form-group">
          <label class="form-label">Nombre de la práctica *</label>
          <input class="form-input" id="tNombre" type="text"
            placeholder="Ej. Práctica 3 — Técnicas de siembra bacteriana" maxlength="120"
            value="${esc(tpl?.nombre || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Instrucciones para el alumno</label>
          <textarea class="form-input" id="tDesc" rows="2"
            placeholder="Instrucciones u observaciones (opcional)" maxlength="500"
          >${esc(tpl?.desc || '')}</textarea>
        </div>
      </div>

      <div class="cuest-section-card">
        <div class="cuest-qeditor-header">
          <h3 class="cuest-section-title">
            Secciones del reporte
            <span class="cuest-q-count" id="labRepSCount">(${_secciones.length})</span>
          </h3>
          <div class="cuest-add-row">
            <select class="form-input form-input--sm" id="sTypeSelect">
              <option value="larga">Respuesta extensa</option>
              <option value="corta">Respuesta corta</option>
            </select>
            <button class="btn btn--primary btn--sm" id="btnAddS">+ Agregar sección</button>
          </div>
        </div>
        <div id="labRepSList" class="cuest-q-list"></div>
      </div>

      <div class="cuest-save-row">
        <button class="btn btn--primary" id="btnSaveTpl" style="min-width:220px">
          ${editing ? '💾 Guardar cambios' : 'Guardar y publicar plantilla'}
        </button>
      </div>
    </div>
  `;

  renderSList();

  document.getElementById('btnCancelEdit')?.addEventListener('click', () => {
    _editId    = null;
    _secciones = [];
    _tab       = 'lista';
    paint();
  });

  document.getElementById('btnAddS').addEventListener('click', () => {
    syncSeccionesFromDOM();
    const tipo = document.getElementById('sTypeSelect').value;
    _secciones.push({ titulo: '', tipo, obligatoria: true });
    renderSList();
    setTimeout(() => {
      const last = document.querySelectorAll('.cuest-q-card');
      last[last.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  });

  document.getElementById('labRepSList').addEventListener('click', e => {
    const btn    = e.target.closest('[data-saction]');
    if (!btn) return;
    const action = btn.dataset.saction;
    const idx    = parseInt(btn.dataset.idx);
    syncSeccionesFromDOM();
    if (action === 'remove-s') {
      _secciones.splice(idx, 1);
      renderSList();
    } else if (action === 'move-up' && idx > 0) {
      [_secciones[idx - 1], _secciones[idx]] = [_secciones[idx], _secciones[idx - 1]];
      renderSList();
    } else if (action === 'move-down' && idx < _secciones.length - 1) {
      [_secciones[idx + 1], _secciones[idx]] = [_secciones[idx], _secciones[idx + 1]];
      renderSList();
    }
  });

  document.getElementById('btnSaveTpl').addEventListener('click', saveTemplate);
}

function syncSeccionesFromDOM() {
  _secciones.forEach((s, i) => {
    const tituloEl = document.getElementById(`s-${i}-titulo`);
    if (tituloEl) s.titulo = tituloEl.value;

    const tipoEl = document.getElementById(`s-${i}-tipo`);
    if (tipoEl) s.tipo = tipoEl.value;

    const obligEl = document.getElementById(`s-${i}-obligatoria`);
    if (obligEl) s.obligatoria = obligEl.checked;
  });
}

function renderSList() {
  const list  = document.getElementById('labRepSList');
  const count = document.getElementById('labRepSCount');
  if (!list) return;

  if (count) count.textContent = `(${_secciones.length})`;

  if (_secciones.length === 0) {
    list.innerHTML = `
      <div class="tab-placeholder" style="padding:var(--space-8)">
        <span>📝</span>
        <p>Aún no hay secciones. Ej. Objetivos, Materiales, Procedimiento, Resultados, Conclusiones. Seleccioná un tipo y hacé clic en "+ Agregar sección".</p>
      </div>`;
    return;
  }

  list.innerHTML = _secciones.map((s, i) => buildSCard(s, i)).join('');
}

function buildSCard(s, i) {
  const total = _secciones.length;
  return `
    <div class="cuest-q-card">
      <div class="cuest-q-card-header">
        <span class="cuest-q-num">S${i + 1}</span>
        <span class="cuest-q-tipo-badge">${TIPO_LABEL[s.tipo] || s.tipo}</span>
        <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--color-text-muted);margin-left:8px">
          <input type="checkbox" id="s-${i}-obligatoria" ${s.obligatoria !== false ? 'checked' : ''}>
          Obligatoria
        </label>
        <div class="cuest-q-move-btns" style="margin-left:auto">
          <button class="btn btn--icon btn--sm" data-saction="move-up" data-idx="${i}"
            title="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn btn--icon btn--sm" data-saction="move-down" data-idx="${i}"
            title="Bajar" ${i === total - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <button class="btn btn--danger btn--sm" data-saction="remove-s" data-idx="${i}">
          Eliminar
        </button>
      </div>
      <div class="form-group" style="margin-top:var(--space-3)">
        <label class="form-label">Título de la sección *</label>
        <input class="form-input" id="s-${i}-titulo" type="text" value="${esc(s.titulo)}"
          placeholder="Ej. Objetivos / Materiales y reactivos / Procedimiento / Resultados / Conclusiones">
      </div>
      <div class="form-group" style="margin-top:var(--space-3);max-width:260px">
        <label class="form-label">Tipo de respuesta</label>
        <select class="form-input form-input--sm" id="s-${i}-tipo">
          <option value="larga" ${s.tipo === 'larga' ? 'selected' : ''}>Respuesta extensa (párrafo)</option>
          <option value="corta" ${s.tipo === 'corta' ? 'selected' : ''}>Respuesta corta (una línea)</option>
        </select>
      </div>
    </div>
  `;
}

async function saveTemplate() {
  const nombre = document.getElementById('tNombre')?.value.trim();
  const desc   = document.getElementById('tDesc')?.value.trim() || '';

  if (!nombre) {
    showToast('El nombre de la práctica es obligatorio.', 'error');
    document.getElementById('tNombre')?.focus();
    return;
  }

  syncSeccionesFromDOM();

  if (_secciones.length === 0) {
    showToast('Agregá al menos una sección.', 'error');
    return;
  }

  for (let i = 0; i < _secciones.length; i++) {
    if (!_secciones[i].titulo.trim()) {
      showToast(`La sección ${i + 1} no tiene título.`, 'error');
      document.getElementById(`s-${i}-titulo`)?.focus();
      return;
    }
  }

  const btn = document.getElementById('btnSaveTpl');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    if (_editId) {
      await updateLabReportTemplate(_editId, { nombre, desc, secciones: _secciones });
      showToast('Plantilla actualizada correctamente.', 'success');
    } else {
      await createLabReportTemplate({ nombre, desc, secciones: _secciones });
      showToast('Plantilla guardada correctamente.', 'success');
    }
    _templates = await getLabReportTemplates();
    _editId    = null;
    _secciones = [];
    _tab       = 'lista';
    paint();
  } catch (err) {
    console.error('[AcadVet] Error guardando plantilla de reporte:', err);
    showToast('Error al guardar. Revisá tu conexión.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = _editId ? '💾 Guardar cambios' : 'Guardar y publicar plantilla'; }
  }
}

// ===========================================================================
// TAB: MIS PLANTILLAS
// ===========================================================================

function renderTabLista(el) {
  if (_templates.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:var(--space-16)">
        <div class="empty-state__icon">📋</div>
        <h3 class="empty-state__title">Sin plantillas aún</h3>
        <p class="empty-state__text">Creá tu primera plantilla en la pestaña "Crear".</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="cuest-list">
      ${_templates.map(t => {
        const secciones = normSecciones(t.secciones);
        const fecha     = t.creado_en ? new Date(t.creado_en).toLocaleDateString('es-SV') : '—';
        const shareUrl  = getShareUrl(t.id);
        const activo    = t.activo !== false;
        return `
          <div class="cuest-row${activo ? '' : ' cuest-row--inactive'}">
            <div class="cuest-row-info">
              <div class="cuest-row-nombre">
                ${esc(t.nombre)}
                <span class="cuest-status-badge ${activo ? 'cuest-status--on' : 'cuest-status--off'}">
                  ${activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div class="cuest-row-meta">
                <span>${secciones.length} sección${secciones.length !== 1 ? 'es' : ''}</span>
                <span>·</span>
                <span>${fecha}</span>
              </div>
              ${t.desc ? `<div class="cuest-row-desc">${esc(t.desc)}</div>` : ''}
            </div>
            <div class="cuest-row-actions">
              <button class="btn btn--secondary btn--sm labrep-toggle-btn"
                data-tid="${t.id}" data-activo="${activo}"
                title="${activo ? 'Desactivar' : 'Activar'} plantilla">
                ${activo ? '⏸ Desactivar' : '▶ Activar'}
              </button>
              <button class="btn btn--secondary btn--sm labrep-edit-btn"
                data-tid="${t.id}" title="Editar plantilla">
                ✏️ Editar
              </button>
              <button class="btn btn--secondary btn--sm" data-copy="${shareUrl}" title="Copiar enlace para el alumno">
                🔗 Enlace
              </button>
              <button class="btn btn--secondary btn--sm labrep-qr-btn"
                data-tid="${t.id}" data-url="${shareUrl}" title="Ver código QR">
                QR
              </button>
              <button class="btn btn--secondary btn--sm labrep-word-btn" data-tid="${t.id}" title="Descargar plantilla en blanco (Word)">
                📝 Word
              </button>
              <button class="btn btn--secondary btn--sm labrep-pdf-btn" data-tid="${t.id}" title="Descargar plantilla en blanco (PDF)">
                📄 PDF
              </button>
              <button class="btn btn--danger btn--sm" data-delete="${t.id}" title="Eliminar plantilla">
                Eliminar
              </button>
            </div>
            <div class="cuest-qr-wrap hidden" id="qr-${t.id}"></div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  el.addEventListener('click', async e => {
    const copyBtn   = e.target.closest('[data-copy]');
    const qrBtn     = e.target.closest('.labrep-qr-btn');
    const deleteBtn = e.target.closest('[data-delete]');
    const toggleBtn = e.target.closest('.labrep-toggle-btn');
    const editBtn   = e.target.closest('.labrep-edit-btn');
    const wordBtn   = e.target.closest('.labrep-word-btn');
    const pdfBtn    = e.target.closest('.labrep-pdf-btn');

    if (copyBtn) {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copy);
        showToast('Enlace copiado al portapapeles.', 'success');
      } catch {
        showToast('No se pudo copiar. Copialo manualmente:\n' + copyBtn.dataset.copy, 'error');
      }
    }

    if (qrBtn) toggleQR(qrBtn.dataset.tid, qrBtn.dataset.url, qrBtn);

    if (toggleBtn) {
      const tid       = toggleBtn.dataset.tid;
      const wasActive = toggleBtn.dataset.activo === 'true';
      toggleBtn.disabled = true;
      try {
        await toggleLabReportTemplateActivo(tid, !wasActive);
        const idx = _templates.findIndex(t => t.id === tid);
        if (idx >= 0) _templates[idx].activo = !wasActive;
        showToast(wasActive ? 'Plantilla desactivada.' : 'Plantilla activada.', 'success');
        renderTabLista(el);
      } catch {
        showToast('Error al cambiar estado. Revisá tu conexión.', 'error');
        toggleBtn.disabled = false;
      }
    }

    if (editBtn) {
      const tid = editBtn.dataset.tid;
      const tpl = _templates.find(t => t.id === tid);
      if (!tpl) return;
      _editId    = tid;
      _secciones = normSecciones(tpl.secciones).map(s => ({ ...s }));
      _tab       = 'crear';
      paint();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (wordBtn) {
      const tpl = _templates.find(t => t.id === wordBtn.dataset.tid);
      if (!tpl) return;
      wordBtn.disabled = true;
      try {
        await downloadBlankWord(tpl);
        showToast('Word generado.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Error al generar el Word.', 'error');
      } finally { wordBtn.disabled = false; }
    }

    if (pdfBtn) {
      const tpl = _templates.find(t => t.id === pdfBtn.dataset.tid);
      if (!tpl) return;
      pdfBtn.disabled = true;
      try {
        await downloadBlankPDF(tpl);
        showToast('PDF generado.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Error al generar el PDF.', 'error');
      } finally { pdfBtn.disabled = false; }
    }

    if (deleteBtn) {
      const id  = deleteBtn.dataset.delete;
      const tpl = _templates.find(t => t.id === id);
      openModal({
        title:          'Eliminar plantilla',
        body:           `<p>¿Eliminás la plantilla <strong>${esc(tpl?.nombre || id)}</strong>? Esto también borra las entregas de los alumnos asociadas. Esta acción no se puede deshacer.</p>`,
        confirmLabel:   'Sí, eliminar',
        confirmVariant: 'danger',
        onConfirm: async () => {
          await deleteLabReportTemplate(id);
          _templates = _templates.filter(t => t.id !== id);
          closeModal();
          showToast('Plantilla eliminada.', 'success');
          renderTabLista(el);
        },
      });
    }
  });
}

async function toggleQR(tid, url, btn) {
  const wrap = document.getElementById(`qr-${tid}`);
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
        <div id="labrep-qr-canvas-${tid}"></div>
        <p class="cuest-qr-url">${url}</p>
      </div>`;
    new window.QRCode(document.getElementById(`labrep-qr-canvas-${tid}`), {
      text: url, width: 180, height: 180,
      colorDark: '#1A1A2E', colorLight: '#FFFFFF',
    });
  } catch {
    wrap.innerHTML = '<p style="color:var(--color-danger);padding:var(--space-3)">No se pudo cargar QRCode.js</p>';
  }
}

// ===========================================================================
// TAB: ENTREGAS
// ===========================================================================

async function renderTabEntregas(el) {
  el.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando entregas…</p></div>`;
  try {
    _submissions = await getLabReportSubmissions();
  } catch (err) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">⚠️</div>
      <h3 class="empty-state__title">Error al cargar</h3>
      <p class="empty-state__text">Revisá tu conexión.</p>
      <button class="btn btn--primary" id="btnRetryEntregas">Reintentar</button>
    </div>`;
    document.getElementById('btnRetryEntregas')?.addEventListener('click', () => renderTabEntregas(el));
    return;
  }
  paintEntregas(el);
}

function paintEntregas(el) {
  const tplIds   = [...new Set(_submissions.map(r => r.templateId).filter(Boolean))];
  const tplNames = {};
  _submissions.forEach(r => { if (r.templateId) tplNames[r.templateId] = r.templateNombre || r.templateId; });

  const filtered = _filterTplId
    ? _submissions.filter(r => r.templateId === _filterTplId)
    : _submissions;

  const esEps = sessionStorage.getItem('acadvet_auth') === 'eps';

  el.innerHTML = `
    <div class="cuest-results-wrap">
      <div class="cuest-results-toolbar">
        <div class="cuest-results-stats">
          <span class="cuest-stat-chip">${filtered.length} entrega${filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="cuest-results-controls">
          <select class="form-input form-input--sm" id="filterTpl" style="min-width:200px">
            <option value="">— Todas las plantillas —</option>
            ${tplIds.map(id => `<option value="${id}" ${id === _filterTplId ? 'selected' : ''}>${esc(tplNames[id] || id)}</option>`).join('')}
          </select>
          ${esEps ? `
            <span title="No disponible en sesión EPS" style="font-size:.78rem;color:var(--color-text-muted);padding:0 4px">
              🔒 Descargas no disponibles en sesión EPS
            </span>
          ` : `
          <button class="btn btn--secondary btn--sm" id="btnExportXLSX" ${filtered.length ? '' : 'disabled'}>
            📊 Excel
          </button>
          <button class="btn btn--danger btn--sm" id="btnDeleteAllEntregas" ${filtered.length ? '' : 'disabled'}
            title="${_filterTplId ? 'Eliminar todas las entregas de la plantilla seleccionada' : 'Filtrá por plantilla para eliminar todas sus entregas'}">
            🗑 Eliminar ${_filterTplId ? 'todas' : 'entregas'}
          </button>
          `}
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state" style="padding:var(--space-12)">
          <div class="empty-state__icon">📊</div>
          <h3 class="empty-state__title">Sin entregas aún</h3>
          <p class="empty-state__text">Cuando los alumnos llenen un reporte, las entregas aparecen acá.</p>
        </div>` : `
        <div style="overflow-x:auto;margin-top:var(--space-4)">
          <table class="data-table cuest-results-table">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Carnet</th>
                <th>Plantilla</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((r, i) => {
                const fecha = r.submitTime ? new Date(r.submitTime).toLocaleString('es-SV') : '—';
                return `
                  <tr>
                    <td>
                      <div class="alumno-cell">
                        <div class="alumno-avatar" style="background:linear-gradient(135deg,var(--color-primary),var(--color-accent))">${initials(r.alumno?.nombre)}</div>
                        <span class="alumno-nombre">${esc(r.alumno?.nombre || '—')}</span>
                      </div>
                    </td>
                    <td><span class="carnet-chip">${esc(r.alumno?.carnet || '—')}</span></td>
                    <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.templateNombre || '—')}</td>
                    <td style="white-space:nowrap;font-size:.8rem;color:var(--color-text-muted)">${fecha}</td>
                    <td style="white-space:nowrap">
                      <button class="btn btn--secondary btn--sm" data-detail="${i}">Ver</button>
                      ${!esEps ? `
                        <button class="btn btn--secondary btn--sm" data-word="${i}" style="margin-left:4px" title="Descargar Word">📝</button>
                        <button class="btn btn--secondary btn--sm" data-pdf="${i}" style="margin-left:4px" title="Descargar PDF">📄</button>
                        <button class="btn btn--danger btn--sm" data-delete-entrega="${i}" style="margin-left:4px" title="Eliminar esta entrega">🗑</button>
                      ` : ''}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
    </div>
  `;

  document.getElementById('filterTpl')?.addEventListener('change', e => {
    _filterTplId = e.target.value;
    paintEntregas(el);
  });

  document.getElementById('btnExportXLSX')?.addEventListener('click', () => exportXLSX(filtered));

  document.getElementById('btnDeleteAllEntregas')?.addEventListener('click', () => {
    const tplNombre = _filterTplId
      ? (filtered[0]?.templateNombre || _filterTplId)
      : null;
    const bodyMsg = tplNombre
      ? `<p>¿Eliminás <strong>todas las ${filtered.length} entrega${filtered.length !== 1 ? 's' : ''}</strong> de la plantilla <strong>${esc(tplNombre)}</strong>? Esta acción no se puede deshacer.</p>`
      : `<p>¿Eliminás <strong>todas las ${filtered.length} entrega${filtered.length !== 1 ? 's' : ''}</strong> de todas las plantillas? Esta acción no se puede deshacer.</p>`;

    openModal({
      title:          'Eliminar entregas',
      body:           bodyMsg,
      confirmLabel:   'Sí, eliminar',
      confirmVariant: 'danger',
      onConfirm: async () => {
        closeModal();
        try {
          let n = 0;
          if (_filterTplId) {
            n = await deleteLabReportSubmissionsByTemplate(_filterTplId);
            _submissions = _submissions.filter(r => r.templateId !== _filterTplId);
          } else {
            await Promise.all(filtered.map(r => deleteLabReportSubmission(r.id)));
            n = filtered.length;
            _submissions = _submissions.filter(r => !filtered.find(f => f.id === r.id));
          }
          showToast(`${n} entrega${n !== 1 ? 's' : ''} eliminada${n !== 1 ? 's' : ''}.`, 'success');
          paintEntregas(el);
        } catch {
          showToast('Error al eliminar. Revisá tu conexión.', 'error');
        }
      },
    });
  });

  el.querySelectorAll('[data-delete-entrega]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = filtered[parseInt(btn.dataset.deleteEntrega)];
      openModal({
        title:          'Eliminar entrega',
        body:           `<p>¿Eliminás la entrega de <strong>${esc(r.alumno?.nombre || '—')}</strong>? Esta acción no se puede deshacer.</p>`,
        confirmLabel:   'Sí, eliminar',
        confirmVariant: 'danger',
        onConfirm: async () => {
          closeModal();
          try {
            await deleteLabReportSubmission(r.id);
            _submissions = _submissions.filter(x => x.id !== r.id);
            showToast('Entrega eliminada.', 'success');
            paintEntregas(el);
          } catch {
            showToast('Error al eliminar. Revisá tu conexión.', 'error');
          }
        },
      });
    });
  });

  el.querySelectorAll('[data-word]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = filtered[parseInt(btn.dataset.word)];
      btn.disabled = true;
      try {
        await downloadFilledWord(r);
        showToast('Word generado.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Error al generar el Word.', 'error');
      } finally { btn.disabled = false; }
    });
  });

  el.querySelectorAll('[data-pdf]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = filtered[parseInt(btn.dataset.pdf)];
      btn.disabled = true;
      try {
        await downloadFilledPDF(r);
        showToast('PDF generado.', 'success');
      } catch (err) {
        console.error(err);
        showToast('Error al generar el PDF.', 'error');
      } finally { btn.disabled = false; }
    });
  });

  el.querySelectorAll('[data-detail]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = filtered[parseInt(btn.dataset.detail)];
      openEntregaModal(r);
    });
  });
}

function openEntregaModal(r) {
  const respuestas = normSecciones(r.respuestas);
  const fecha       = r.submitTime ? new Date(r.submitTime).toLocaleString('es-SV') : '—';

  const detalleHtml = respuestas.map((s, i) => `
    <div class="cuest-detail-row">
      <div class="cuest-detail-num">${i + 1}</div>
      <div class="cuest-detail-body">
        <p class="cuest-detail-q">${esc(s.titulo || '')}</p>
        <p class="cuest-detail-a" style="white-space:pre-wrap">${esc(s.respuesta || '—')}</p>
      </div>
    </div>
  `).join('');

  openModal({
    title: `Entrega — ${r.alumno?.nombre || 'Alumno'}`,
    size: 'lg',
    body: `
      <div class="cuest-modal-result">
        <div class="cuest-modal-header-info">
          <div>
            <p><strong>${esc(r.alumno?.nombre || '—')}</strong></p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Carnet: ${esc(r.alumno?.carnet || '—')}</p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Email: ${esc(r.alumno?.email || '—')}</p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Plantilla: ${esc(r.templateNombre || '—')}</p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Fecha: ${fecha}</p>
          </div>
        </div>
        <h4 style="font-size:.85rem;font-weight:700;margin:var(--space-4) 0 var(--space-2);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em">Secciones entregadas</h4>
        <div class="cuest-detail-list">${detalleHtml || '<p style="color:var(--color-text-muted)">Sin contenido disponible.</p>'}</div>
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
      ['Alumno', 'Carnet', 'Email', 'Plantilla', 'Fecha', 'Contenido'],
      ...rows.map(r => [
        r.alumno?.nombre     || '',
        r.alumno?.carnet     || '',
        r.alumno?.email      || '',
        r.templateNombre     || '',
        r.submitTime ? new Date(r.submitTime).toLocaleString('es-SV') : '',
        normSecciones(r.respuestas).map(s => `${s.titulo}: ${s.respuesta || ''}`).join('\n\n'),
      ]),
    ];
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(data);
    window.XLSX.utils.book_append_sheet(wb, ws, 'Entregas');
    window.XLSX.writeFile(wb, `entregas_reportes_laboratorio_${Date.now()}.xlsx`);
    showToast('Excel generado.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al generar Excel.', 'error');
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

function normSecciones(p) {
  if (!p) return [];
  if (Array.isArray(p)) return p;
  return Object.values(p);
}

function getShareUrl(templateId) {
  const href = window.location.href.split('?')[0].split('#')[0];
  const base = href.substring(0, href.lastIndexOf('/') + 1);
  return base + 'lab-report.html?t=' + templateId;
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
