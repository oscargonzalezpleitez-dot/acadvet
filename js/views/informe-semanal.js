// =============================================================================
// AcadVet USAM — Vista: Informe Semanal por Grupo de Clase
// Reporte administrativo interno (lo llena el docente, no los alumnos):
// plantilla fija de 6 criterios en el formato oficial de la universidad,
// con historial guardado y descarga en Word/PDF con membrete institucional.
// =============================================================================

import {
  getMaterias, getAlumnos, alumnosByMateria,
  createInformeSemanal, updateInformeSemanal, deleteInformeSemanal,
  getInformesSemanales, getInformeEmailDefault, setInformeEmailDefault,
} from '../db.js';
import { showToast, openModal, closeModal } from '../ui.js';
import { downloadInformeSemanalWord, downloadInformeSemanalPDF, getInformeSemanalPdfBase64 } from '../informe-semanal-export.js';
import { sendInformeSemanalEmail } from '../informe-semanal-email.js';

const CRITERIOS_FIJOS = [
  { numero: 1, criterio: 'Número de estudiantes atendidos' },
  { numero: 2, criterio: 'Logro del objetivo de aprendizaje (En porcentaje cuanto se considera que se ha logrado el aprendizaje del estudiante)' },
  { numero: 3, criterio: 'Cumplimiento de la Tarea (Cuántos realizaron las tareas, si estas fueron realizadas completamente, sólo una parte de ella, nada)' },
  { numero: 4, criterio: 'Cumplimiento de Controles de Lectura- Evaluaciones' },
  { numero: 5, criterio: 'Tipo de orientación (Académica, Administrativa, Personal, etc)' },
  { numero: 6, criterio: 'Observaciones (Comentarios adicionales del desarrollo de su jornada académica semanal)' },
];

const ACADEMICO_DEFAULT = 'Oscar Alfredo Gonzalez Pleitez';

// Días de clase por materia (0=domingo … 6=sábado), usados para que
// "Calcular asistencia de la semana" ignore registros fuera del horario
// real del grupo (p. ej. una reposición o un error de fecha) y no infle
// el conteo del criterio 1. Solo cubre los grupos con horario irregular
// conocido; el resto de materias no se filtra.
const DIAS_CLASE_POR_MATERIA = {
  '-OvBIHDTynekKuf_ZT9d': [4, 5], // Bacteriología y Micología — Grupo 2: jueves y viernes
  '-OvBIKpy9g6swRnwNm7g': [1, 4], // Bacteriología y Micología — Grupo 3: lunes y jueves
};

// ---------------------------------------------------------------------------
// Variaciones para el criterio 2 (Logro del objetivo de aprendizaje): cada
// informe nuevo arranca con una redacción distinta a la del informe
// inmediatamente anterior, para que no se repita literalmente semana a
// semana. Todas las opciones son de tono positivo.
// ---------------------------------------------------------------------------
const LOGRO_APRENDIZAJE_OPCIONES = [
  { valor: '90%', explicacion: 'Los estudiantes demostraron un buen dominio de los temas abordados durante la semana.' },
  { valor: '88%', explicacion: 'La mayoría del grupo alcanzó los objetivos planteados con un desempeño satisfactorio.' },
  { valor: '95%', explicacion: 'Se evidenció un alto nivel de comprensión y participación activa por parte del grupo.' },
  { valor: '85%', explicacion: 'El grupo mostró un avance sólido en el logro de las competencias esperadas para la semana.' },
  { valor: '92%', explicacion: 'Los estudiantes lograron consolidar los conocimientos clave de la semana de forma satisfactoria.' },
  { valor: '87%', explicacion: 'Se observó un cumplimiento adecuado de los objetivos de aprendizaje planteados.' },
  { valor: '93%', explicacion: 'El desempeño del grupo reflejó un logro significativo de los objetivos académicos de la semana.' },
  { valor: '91%', explicacion: 'La mayoría de los estudiantes alcanzó un buen nivel de asimilación de los contenidos vistos.' },
  { valor: '89%', explicacion: 'Se logró un avance favorable en el aprendizaje esperado para esta semana de clases.' },
  { valor: '94%', explicacion: 'El grupo evidenció un excelente nivel de logro respecto a los objetivos de aprendizaje planteados.' },
];
const LOGRO_LS_KEY = 'acadvet_ultimo_logro_aprendizaje';

/** Elige una opción del pool distinta a la usada en el informe anterior. */
function siguienteLogroAprendizaje() {
  let anterior = null;
  try { anterior = localStorage.getItem(LOGRO_LS_KEY); } catch (_) {}
  const disponibles = LOGRO_APRENDIZAJE_OPCIONES.filter(o => o.valor !== anterior);
  const pool = disponibles.length ? disponibles : LOGRO_APRENDIZAJE_OPCIONES;
  const elegido = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem(LOGRO_LS_KEY, elegido.valor); } catch (_) {}
  return elegido;
}

/** Plantilla de criterios en blanco para un informe nuevo, con el criterio 2
 *  ya precargado con una redacción positiva distinta a la del último informe. */
function criteriosNuevo() {
  const logro = siguienteLogroAprendizaje();
  return CRITERIOS_FIJOS.map((c, i) => ({
    ...c,
    valor:       i === 1 ? logro.valor       : '',
    explicacion: i === 1 ? logro.explicacion : '',
  }));
}

let _container    = null;
let _materias     = [];
let _informes     = [];
let _tab          = 'crear';
let _criterios    = [];
let _editId       = null;
let _defaultEmail = '';

export async function renderInformeSemanal(container) {
  _container = container;
  container.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando informes semanales…</p></div>`;
  try {
    [_materias, _informes, _defaultEmail] = await Promise.all([
      getMaterias(), getInformesSemanales(), getInformeEmailDefault(),
    ]);
  } catch (err) {
    console.error('[AcadVet] Error cargando informes semanales:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3 class="empty-state__title">Error al cargar</h3>
        <p class="empty-state__text">Verificá tu conexión e intentá de nuevo.</p>
        <button class="btn btn--primary" id="btnRetryInforme">Reintentar</button>
      </div>`;
    document.getElementById('btnRetryInforme')?.addEventListener('click', () => renderInformeSemanal(container));
    return;
  }
  _tab       = 'crear';
  _criterios = criteriosNuevo();
  _editId    = null;
  paint();
}

function paint() {
  _container.innerHTML = `
    <div class="cuest-view">
      <div class="view-header" style="margin-bottom:0">
        <div>
          <h2 class="view-title">Informe Semanal por Grupo de Clase</h2>
          <p class="view-subtitle">Llená el informe oficial de la semana y descargalo en Word/PDF con el membrete institucional</p>
        </div>
      </div>

      <nav class="tabs-nav" style="margin-top:var(--space-5)">
        <button class="tab-btn${_tab==='crear'     ? ' active':''}" data-tab="crear">📋 ${_editId ? 'Editando' : 'Crear'}</button>
        <button class="tab-btn${_tab==='historial' ? ' active':''}" data-tab="historial">🗂 Historial</button>
      </nav>

      <div class="tab-content" id="informeTabContent"></div>
    </div>
  `;

  _container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab !== 'crear') {
        _editId    = null;
        _criterios = criteriosNuevo();
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
  const el = document.getElementById('informeTabContent');
  if (!el) return;
  if      (_tab === 'crear')     renderTabCrear(el);
  else if (_tab === 'historial') renderTabHistorial(el);
}

// ===========================================================================
// TAB: CREAR / EDITAR
// ===========================================================================

function renderTabCrear(el) {
  const editing  = !!_editId;
  const informe  = editing ? _informes.find(i => i.id === _editId) : null;

  el.innerHTML = `
    <div class="cuest-form-wrap">
      ${editing ? `
        <div class="cuest-edit-banner">
          <span>✏️ Editando: <strong>${esc(informe?.materiaNombre || '')} — ${esc(formatRango(informe?.semanaInicio, informe?.semanaFin))}</strong></span>
          <button class="btn btn--secondary btn--sm" id="btnCancelEdit">Cancelar edición</button>
        </div>` : ''}

      <div class="cuest-section-card">
        <h3 class="cuest-section-title">Datos generales</h3>
        <div class="form-group">
          <label class="form-label">Materia / Grupo *</label>
          <select class="form-input" id="iMateria">
            <option value="">— Seleccioná una materia —</option>
            ${_materias.map(m => `
              <option value="${m.id}" ${informe?.materiaId === m.id ? 'selected' : ''}>
                ${esc(m.nombre)}${m.seccion ? ` — Secc. ${esc(m.seccion)}` : ''}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="cuest-row-2">
          <div class="form-group">
            <label class="form-label">Semana — Desde *</label>
            <input class="form-input" id="iDesde" type="date" value="${informe?.semanaInicio || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Semana — Hasta *</label>
            <input class="form-input" id="iHasta" type="date" value="${informe?.semanaFin || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre del académico</label>
          <input class="form-input" id="iAcademico" type="text" maxlength="150"
            value="${esc(informe?.academico || ACADEMICO_DEFAULT)}">
        </div>
      </div>

      <div class="cuest-section-card">
        <div class="cuest-qeditor-header">
          <h3 class="cuest-section-title">Criterios para evaluar</h3>
          <button class="btn btn--secondary btn--sm" id="btnCalcAsist">📊 Calcular asistencia de la semana</button>
        </div>
        <div id="criteriosList"></div>
      </div>

      <div class="cuest-save-row">
        <button class="btn btn--primary" id="btnSaveInforme" style="min-width:220px">
          ${editing ? '💾 Guardar cambios' : 'Guardar informe'}
        </button>
      </div>
    </div>
  `;

  renderCriteriosList();

  document.getElementById('btnCancelEdit')?.addEventListener('click', () => {
    _editId    = null;
    _criterios = criteriosNuevo();
    _tab       = 'historial';
    paint();
  });

  document.getElementById('btnCalcAsist').addEventListener('click', calcularAsistencia);
  document.getElementById('btnSaveInforme').addEventListener('click', saveInforme);
}

function renderCriteriosList() {
  const list = document.getElementById('criteriosList');
  if (!list) return;
  list.innerHTML = _criterios.map((c, i) => `
    <div class="cuest-q-card">
      <div class="cuest-q-card-header">
        <span class="cuest-q-num">${c.numero}</span>
        <span style="font-size:.88rem;font-weight:600;color:var(--color-text)">${esc(c.criterio)}</span>
      </div>
      <div class="cuest-row-2" style="margin-top:var(--space-3)">
        <div class="form-group">
          <label class="form-label">Número o porcentaje</label>
          <input class="form-input" id="c-${i}-valor" type="text" value="${esc(c.valor)}" placeholder="Ej. 58 o 100%">
        </div>
      </div>
      <div class="form-group" style="margin-top:var(--space-3)">
        <label class="form-label">Explicación</label>
        <textarea class="form-input" id="c-${i}-explicacion" rows="2" placeholder="Explicación breve">${esc(c.explicacion)}</textarea>
      </div>
    </div>
  `).join('');
}

function syncCriteriosFromDOM() {
  _criterios.forEach((c, i) => {
    const valorEl = document.getElementById(`c-${i}-valor`);
    const expEl   = document.getElementById(`c-${i}-explicacion`);
    if (valorEl) c.valor = valorEl.value;
    if (expEl)   c.explicacion = expEl.value;
  });
}

// ---------------------------------------------------------------------------
// Calcular asistencia real de la semana para el criterio 1 (autocompletar)
// ---------------------------------------------------------------------------
async function calcularAsistencia() {
  const materiaId = document.getElementById('iMateria').value;
  const desde     = document.getElementById('iDesde').value;
  const hasta     = document.getElementById('iHasta').value;

  if (!materiaId || !desde || !hasta) {
    showToast('Elegí la materia y el rango de fechas primero.', 'error');
    return;
  }

  const btn = document.getElementById('btnCalcAsist');
  btn.disabled = true;
  btn.textContent = 'Calculando…';

  try {
    const todos           = await getAlumnos();
    const alumnosMateria  = alumnosByMateria(todos, materiaId);
    const porDia          = {};
    const presentes       = new Set();
    const diasClase       = DIAS_CLASE_POR_MATERIA[materiaId] || null;

    alumnosMateria.forEach(a => {
      const asist = a.inscripciones?.[materiaId]?.asistencias;
      if (!asist) return;
      Object.values(asist).forEach(r => {
        if (!r.fecha || r.fecha < desde || r.fecha > hasta) return;
        if (r.estado !== 'presente') return;
        if (diasClase && !diasClase.includes(new Date(`${r.fecha}T00:00:00`).getDay())) return;
        if (!porDia[r.fecha]) porDia[r.fecha] = new Set();
        porDia[r.fecha].add(a.id);
        presentes.add(a.id);
      });
    });

    const dias  = Object.keys(porDia).sort();
    const draft = dias.map(f => {
      const nombreDia = new Date(`${f}T00:00:00`).toLocaleDateString('es-SV', { weekday: 'long' });
      return `El ${nombreDia} asistieron ${porDia[f].size} alumnos`;
    }).join(', ');

    syncCriteriosFromDOM();
    _criterios[0].valor = String(presentes.size);
    document.getElementById('c-0-valor').value = _criterios[0].valor;

    const expEl = document.getElementById('c-0-explicacion');
    if (expEl && !expEl.value.trim()) {
      expEl.value = draft;
      _criterios[0].explicacion = draft;
    }

    showToast(
      dias.length
        ? `${presentes.size} alumno(s) distinto(s) asistieron en ${dias.length} día(s) con registro.`
        : 'No hay asistencia registrada en ese rango de fechas.',
      dias.length ? 'success' : 'error'
    );
  } catch (err) {
    console.error('[AcadVet] Error calculando asistencia:', err);
    showToast('Error al calcular. Revisá tu conexión.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📊 Calcular asistencia de la semana';
  }
}

async function saveInforme() {
  const materiaSel  = document.getElementById('iMateria');
  const materiaId   = materiaSel.value;
  const materia     = _materias.find(m => m.id === materiaId);
  const semanaInicio = document.getElementById('iDesde').value;
  const semanaFin     = document.getElementById('iHasta').value;
  const academico     = document.getElementById('iAcademico').value.trim();

  if (!materiaId) { showToast('Elegí una materia.', 'error'); materiaSel.focus(); return; }
  if (!semanaInicio || !semanaFin) { showToast('Completá el rango de fechas de la semana.', 'error'); return; }

  syncCriteriosFromDOM();

  const btn = document.getElementById('btnSaveInforme');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  const payload = {
    materiaId,
    materiaNombre: materia?.nombre || '',
    seccion: materia?.seccion || '',
    academico,
    semanaInicio,
    semanaFin,
    criterios: _criterios,
  };

  try {
    if (_editId) {
      await updateInformeSemanal(_editId, payload);
      showToast('Informe actualizado correctamente.', 'success');
    } else {
      await createInformeSemanal(payload);
      showToast('Informe guardado correctamente.', 'success');
    }
    _informes  = await getInformesSemanales();
    _editId    = null;
    _criterios = criteriosNuevo();
    _tab       = 'historial';
    paint();
  } catch (err) {
    console.error('[AcadVet] Error guardando informe semanal:', err);
    showToast('Error al guardar. Revisá tu conexión.', 'error');
    btn.disabled = false;
    btn.textContent = _editId ? '💾 Guardar cambios' : 'Guardar informe';
  }
}

// ===========================================================================
// TAB: HISTORIAL
// ===========================================================================

function renderTabHistorial(el) {
  if (_informes.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:var(--space-16)">
        <div class="empty-state__icon">🗂</div>
        <h3 class="empty-state__title">Sin informes aún</h3>
        <p class="empty-state__text">Creá tu primer informe semanal en la pestaña "Crear".</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="cuest-list">
      ${_informes.map(i => `
        <div class="cuest-row">
          <div class="cuest-row-info">
            <div class="cuest-row-nombre">${esc(i.materiaNombre)}${i.seccion ? ` — Secc. ${esc(i.seccion)}` : ''}</div>
            <div class="cuest-row-meta">
              <span>${esc(formatRango(i.semanaInicio, i.semanaFin))}</span>
              <span>·</span>
              <span>${esc(i.academico || '—')}</span>
            </div>
          </div>
          <div class="cuest-row-actions">
            <button class="btn btn--secondary btn--sm informe-ver-btn" data-id="${i.id}">Ver</button>
            <button class="btn btn--secondary btn--sm informe-edit-btn" data-id="${i.id}">✏️ Editar</button>
            <button class="btn btn--secondary btn--sm informe-word-btn" data-id="${i.id}">📝 Word</button>
            <button class="btn btn--secondary btn--sm informe-pdf-btn" data-id="${i.id}">📄 PDF</button>
            <button class="btn btn--secondary btn--sm informe-email-btn" data-id="${i.id}">📧 Enviar</button>
            <button class="btn btn--danger btn--sm" data-delete="${i.id}">Eliminar</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  el.addEventListener('click', async e => {
    const verBtn    = e.target.closest('.informe-ver-btn');
    const editBtn   = e.target.closest('.informe-edit-btn');
    const wordBtn   = e.target.closest('.informe-word-btn');
    const pdfBtn    = e.target.closest('.informe-pdf-btn');
    const emailBtn  = e.target.closest('.informe-email-btn');
    const deleteBtn = e.target.closest('[data-delete]');

    if (verBtn) {
      const informe = _informes.find(i => i.id === verBtn.dataset.id);
      if (informe) openDetalleModal(informe);
    }

    if (editBtn) {
      const informe = _informes.find(i => i.id === editBtn.dataset.id);
      if (!informe) return;
      _editId    = informe.id;
      _criterios = CRITERIOS_FIJOS.map((c, i) => ({ ...c, ...(informe.criterios?.[i] || {}) }));
      _tab       = 'crear';
      paint();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (wordBtn) {
      const informe = _informes.find(i => i.id === wordBtn.dataset.id);
      if (!informe) return;
      wordBtn.disabled = true;
      try { await downloadInformeSemanalWord(informe); showToast('Word generado.', 'success'); }
      catch (err) { console.error(err); showToast('Error al generar el Word.', 'error'); }
      finally { wordBtn.disabled = false; }
    }

    if (pdfBtn) {
      const informe = _informes.find(i => i.id === pdfBtn.dataset.id);
      if (!informe) return;
      pdfBtn.disabled = true;
      try { await downloadInformeSemanalPDF(informe); showToast('PDF generado.', 'success'); }
      catch (err) { console.error(err); showToast('Error al generar el PDF.', 'error'); }
      finally { pdfBtn.disabled = false; }
    }

    if (emailBtn) {
      const informe = _informes.find(i => i.id === emailBtn.dataset.id);
      if (informe) openEnviarCorreoModal(informe);
    }

    if (deleteBtn) {
      const id      = deleteBtn.dataset.delete;
      const informe = _informes.find(i => i.id === id);
      openModal({
        title:          'Eliminar informe',
        body:           `<p>¿Eliminás el informe de <strong>${esc(informe?.materiaNombre || id)}</strong> (${esc(formatRango(informe?.semanaInicio, informe?.semanaFin))})? Esta acción no se puede deshacer.</p>`,
        confirmLabel:   'Sí, eliminar',
        confirmVariant: 'danger',
        onConfirm: async () => {
          await deleteInformeSemanal(id);
          _informes = _informes.filter(i => i.id !== id);
          closeModal();
          showToast('Informe eliminado.', 'success');
          renderTabHistorial(el);
        },
      });
    }
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function openEnviarCorreoModal(informe) {
  openModal({
    title: 'Enviar informe por correo',
    body: `
      <div class="form-group">
        <label class="form-label">Correo destino</label>
        <input class="form-input" id="correoDestino" type="email" placeholder="ejemplo@correo.com" value="${esc(_defaultEmail)}">
      </div>
      <p class="cuest-hint">
        Se adjunta el PDF de <strong>${esc(informe.materiaNombre)}</strong>
        (${esc(formatRango(informe.semanaInicio, informe.semanaFin))}).
      </p>
    `,
    confirmLabel: 'Enviar',
    confirmVariant: 'primary',
    onConfirm: async () => {
      const email = document.getElementById('correoDestino')?.value.trim();
      if (!email || !EMAIL_RE.test(email)) {
        showToast('Ingresá un correo válido.', 'error');
        return;
      }
      try {
        const { base64, filename } = await getInformeSemanalPdfBase64(informe);
        await sendInformeSemanalEmail({
          to: email,
          subject: `Informe Semanal — ${informe.materiaNombre} (${formatRango(informe.semanaInicio, informe.semanaFin)})`,
          pdfBase64: base64,
          filename,
        });
        if (email !== _defaultEmail) {
          _defaultEmail = email;
          setInformeEmailDefault(email).catch(() => {});
        }
        closeModal();
        showToast(`Informe enviado a ${email}.`, 'success');
      } catch (err) {
        console.error('[AcadVet] Error enviando informe por correo:', err);
        showToast(err?.message || 'No se pudo enviar el correo. Revisá tu conexión.', 'error');
      }
    },
  });
}

function openDetalleModal(informe) {
  const filas = (informe.criterios || []).map(c => `
    <div class="cuest-detail-row">
      <div class="cuest-detail-num">${c.numero}</div>
      <div class="cuest-detail-body">
        <p class="cuest-detail-q">${esc(c.criterio)}</p>
        <p class="cuest-detail-a"><strong>${esc(c.valor || '—')}</strong> — ${esc(c.explicacion || '—')}</p>
      </div>
    </div>
  `).join('');

  openModal({
    title: `Informe — ${informe.materiaNombre || ''}`,
    size: 'lg',
    body: `
      <div class="cuest-modal-result">
        <div class="cuest-modal-header-info">
          <div>
            <p><strong>${esc(informe.materiaNombre || '—')}</strong>${informe.seccion ? ` — Secc. ${esc(informe.seccion)}` : ''}</p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Semana: ${esc(formatRango(informe.semanaInicio, informe.semanaFin))}</p>
            <p style="color:var(--color-text-muted);font-size:.85rem">Académico: ${esc(informe.academico || '—')}</p>
          </div>
        </div>
        <h4 style="font-size:.85rem;font-weight:700;margin:var(--space-4) 0 var(--space-2);color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em">Criterios</h4>
        <div class="cuest-detail-list">${filas}</div>
      </div>`,
    confirmLabel: 'Cerrar',
    cancelLabel: '',
    onConfirm: () => closeModal(),
  });
  document.getElementById('modalCancelBtn')?.remove();
}

// ===========================================================================
// UTILIDADES
// ===========================================================================

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function formatRango(desde, hasta) {
  if (!desde && !hasta) return '—';
  const fmt = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-SV', { day: 'numeric', month: 'long' });
  };
  if (desde && hasta) return `${fmt(desde)} al ${fmt(hasta)}`;
  return fmt(desde || hasta);
}
