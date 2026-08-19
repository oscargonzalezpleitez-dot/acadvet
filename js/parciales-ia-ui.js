// =============================================================================
// AcadVet USAM — Pantalla "Parciales con IA" (docente)
// Selecciona materia+parcial → edita la rúbrica → fotografía cada examen →
// revisa la nota sugerida por Gemini → aprueba (o corrige) → se guarda en
// el expediente del alumno, igual que si se hubiera tecleado a mano.
// =============================================================================

import { getAlumnos, alumnosByMateria, getMaterias } from './db.js';
import { drawScaledToCanvas, loadImageFile } from './lab-reports.js';
import {
  PARCIALES, getRubrica, saveRubrica, subirFotoExamen, getFotoUrl,
  enviarACalificar, reintentarCalificacion, watchRevisiones, aprobarNota,
} from './parciales-ia.js';

// ── Guard: solo docente/EPS ──
if (sessionStorage.getItem('acadvet_auth') !== 'admin') {
  window.location.replace('index.html');
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _materiaId    = '';
let _parcialId    = 'parcial_1';
let _todosAlumnos = [];
let _alumnos      = [];
let _revisiones   = {};
let _unsubRev     = null;

// Captura
let _cameraStream    = null;
let _capturaAlumno   = null;
let _capturedCanvases = []; // canvases con cada página

// Revisión
let _reviewAlumno = null;

// ---------------------------------------------------------------------------
// Refs DOM
// ---------------------------------------------------------------------------
const selMateria     = document.getElementById('selMateria');
const parcialTabs    = document.getElementById('parcialTabs');
const rubricaPanel   = document.getElementById('rubricaPanel');
const rubricaTexto   = document.getElementById('rubricaTexto');
const rubricaStatus  = document.getElementById('rubricaStatus');
const btnGuardarRubrica = document.getElementById('btnGuardarRubrica');
const alumnosPanel   = document.getElementById('alumnosPanel');
const alumnosList    = document.getElementById('alumnosList');

const cameraModal    = document.getElementById('cameraModal');
const cameraVideo    = document.getElementById('cameraVideo');
const cameraHint     = document.getElementById('cameraHint');
const pagesStrip     = document.getElementById('pagesStrip');
const captureActions = document.getElementById('captureActions');
const fileInputCamara = document.getElementById('fileInputCamara');

const reviewModal    = document.getElementById('reviewModal');
const reviewTitle    = document.getElementById('reviewTitle');
const reviewBody     = document.getElementById('reviewBody');

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText    = document.getElementById('loadingText');

function setLoading(msg) {
  if (!msg) { loadingOverlay.classList.add('hidden'); return; }
  loadingText.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------
(async function init() {
  parcialTabs.querySelector(`[data-parcial="${_parcialId}"]`)?.classList.add('active');

  const [materias, alumnos] = await Promise.all([getMaterias(), getAlumnos()]);
  _todosAlumnos = alumnos;

  selMateria.innerHTML = '<option value="">— Seleccioná —</option>' +
    materias
      .filter(m => m.estado !== 'archivada')
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(m => `<option value="${m.id}">${m.nombre}${m.ciclo ? ' — ' + m.ciclo : ''}</option>`)
      .join('');
})();

selMateria.addEventListener('change', () => {
  _materiaId = selMateria.value;
  onSelectionChanged();
});

parcialTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.parcial-tab');
  if (!btn) return;
  _parcialId = btn.dataset.parcial;
  [...parcialTabs.children].forEach(b => b.classList.toggle('active', b === btn));
  onSelectionChanged();
});

function onSelectionChanged() {
  if (_unsubRev) { _unsubRev(); _unsubRev = null; }

  if (!_materiaId) {
    rubricaPanel.classList.add('hidden');
    alumnosPanel.classList.add('hidden');
    return;
  }

  rubricaPanel.classList.remove('hidden');
  alumnosPanel.classList.remove('hidden');
  _alumnos = alumnosByMateria(_todosAlumnos, _materiaId)
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  loadRubrica();
  renderAlumnosList(); // estado de carga inicial

  _unsubRev = watchRevisiones(_materiaId, _parcialId, (revisiones) => {
    _revisiones = revisiones;
    renderAlumnosList();
  });
}

// ---------------------------------------------------------------------------
// Rúbrica
// ---------------------------------------------------------------------------
async function loadRubrica() {
  rubricaStatus.textContent = 'Cargando…';
  rubricaStatus.classList.remove('ok');
  const r = await getRubrica(_materiaId, _parcialId);
  rubricaTexto.value = r.texto || '';
  updateRubricaStatus(r.actualizadoEn);
}

function updateRubricaStatus(actualizadoEn) {
  if (!rubricaTexto.value.trim()) {
    rubricaStatus.textContent = '⚠️ Sin rúbrica todavía — la IA no puede calificar sin esto.';
    rubricaStatus.classList.remove('ok');
  } else {
    const fecha = actualizadoEn ? new Date(actualizadoEn).toLocaleString('es-SV') : '';
    rubricaStatus.textContent = `✅ Guardada${fecha ? ' — ' + fecha : ''}`;
    rubricaStatus.classList.add('ok');
  }
}

btnGuardarRubrica.addEventListener('click', async () => {
  const texto = rubricaTexto.value.trim();
  if (!texto) { alert('Escribí la rúbrica antes de guardar.'); return; }
  btnGuardarRubrica.disabled = true;
  try {
    await saveRubrica(_materiaId, _parcialId, texto);
    updateRubricaStatus(Date.now());
  } catch (e) {
    alert(`Error al guardar la rúbrica: ${e.message}`);
  } finally {
    btnGuardarRubrica.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Lista de alumnos
// ---------------------------------------------------------------------------
const ESTADO_INFO = {
  'sin-foto':  { cls: 'sin-foto',  label: '📄 Sin examen' },
  pendiente:   { cls: 'pendiente', label: '⏳ Calificando con IA…' },
  listo:       { cls: 'listo',     label: null }, // se arma dinámicamente con la nota
  error:       { cls: 'error',     label: '⚠️ Error de IA' },
  aprobado:    { cls: 'aprobado',  label: null },
};

function renderAlumnosList() {
  if (!_alumnos.length) {
    alumnosList.innerHTML = '<div class="empty-hint">No hay alumnos inscritos en esta materia.</div>';
    return;
  }

  alumnosList.innerHTML = _alumnos.map(a => {
    const rev = _revisiones[a.id];
    const estado = rev?.estado || 'sin-foto';
    const info = ESTADO_INFO[estado] || ESTADO_INFO['sin-foto'];

    let label = info.label;
    if (estado === 'listo')    label = `🔎 Sugerida: ${fmtNota(rev.notaSugerida)}/100`;
    if (estado === 'aprobado') label = `✅ Nota: ${fmtNota(rev.notaFinal)}/100`;

    let acciones = '';
    if (estado === 'sin-foto') {
      acciones = `<button class="btn primary small" data-action="fotografiar">📷 Fotografiar</button>`;
    } else if (estado === 'pendiente') {
      acciones = `<button class="btn outline small" disabled>⏳ Procesando…</button>`;
    } else if (estado === 'error') {
      acciones = `
        <button class="btn primary small" data-action="reintentar">🔄 Reintentar IA</button>
        <button class="btn outline small" data-action="fotografiar">📷 Repetir fotos</button>`;
    } else if (estado === 'listo') {
      acciones = `<button class="btn primary small" data-action="revisar">🔎 Revisar y aprobar</button>`;
    } else if (estado === 'aprobado') {
      acciones = `
        <button class="btn outline small" data-action="revisar">✏️ Editar</button>
        <button class="btn outline small" data-action="fotografiar">📷 Repetir fotos</button>`;
    }

    return `
      <div class="alumno-row" data-alumno-id="${a.id}">
        <div class="alumno-info">
          <div class="alumno-name">${escapeHtml(a.nombre || '(sin nombre)')}</div>
          <div class="alumno-carnet">Carné ${escapeHtml(a.carnet || '—')}</div>
        </div>
        <span class="estado-badge ${info.cls}">${label}</span>
        ${acciones}
      </div>`;
  }).join('');
}

function fmtNota(n) {
  return n == null ? '—' : Number(n).toFixed(1).replace(/\.0$/, '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

alumnosList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const alumnoId = btn.closest('[data-alumno-id]').dataset.alumnoId;
  const alumno = _alumnos.find(a => a.id === alumnoId);
  if (!alumno) return;

  if (btn.dataset.action === 'fotografiar') openCaptureModal(alumno);
  if (btn.dataset.action === 'reintentar')  reintentar(alumno);
  if (btn.dataset.action === 'revisar')     openReviewModal(alumno);
});

async function reintentar(alumno) {
  setLoading('Reintentando calificación con IA…');
  try {
    await reintentarCalificacion(_materiaId, _parcialId, alumno.id);
  } catch (e) {
    alert(`Error: ${e.message}`);
  } finally {
    setLoading(null);
  }
}

// ---------------------------------------------------------------------------
// CAPTURA — cámara o galería, multi-página
// ---------------------------------------------------------------------------
function openCaptureModal(alumno) {
  _capturaAlumno = alumno;
  _capturedCanvases = [];
  cameraHint.textContent = `${alumno.nombre} — encuadrá la primera página`;
  pagesStrip.classList.add('hidden');
  pagesStrip.innerHTML = '';
  captureActions.classList.add('hidden');
  cameraModal.classList.remove('hidden');
  startCamera();
}

async function startCamera() {
  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1600 }, height: { ideal: 1200 } },
    });
    cameraVideo.srcObject = _cameraStream;
  } catch (e) {
    alert(`❌ No se pudo acceder a la cámara: ${e.message}\n\nPodés usar "🖼️ Galería" en vez de la cámara.`);
  }
}

function stopCamera() {
  if (_cameraStream) { _cameraStream.getTracks().forEach(t => t.stop()); _cameraStream = null; }
}

function closeCaptureModal() {
  stopCamera();
  cameraModal.classList.add('hidden');
  _capturaAlumno = null;
  _capturedCanvases = [];
}

document.getElementById('btnCancelarCamera').addEventListener('click', closeCaptureModal);

document.getElementById('btnCapturarFoto').addEventListener('click', () => {
  const w = cameraVideo.videoWidth  || 1280;
  const h = cameraVideo.videoHeight || 960;
  const canvas = document.createElement('canvas');
  drawScaledToCanvas(canvas, cameraVideo, w, h);
  addPage(canvas);
});

document.getElementById('btnGaleria').addEventListener('click', () => fileInputCamara.click());

fileInputCamara.addEventListener('change', async () => {
  const files = [...fileInputCamara.files];
  fileInputCamara.value = '';
  for (const file of files) {
    try {
      const img = await loadImageFile(file);
      const canvas = document.createElement('canvas');
      drawScaledToCanvas(canvas, img, img.naturalWidth, img.naturalHeight);
      addPage(canvas);
    } catch (e) {
      alert(`No se pudo cargar una imagen: ${e.message}`);
    }
  }
});

function addPage(canvas) {
  _capturedCanvases.push(canvas);
  const thumb = document.createElement('div');
  thumb.className = 'page-thumb';
  const img = document.createElement('img');
  img.src = canvas.toDataURL('image/jpeg', 0.6);
  thumb.appendChild(img);
  pagesStrip.appendChild(thumb);
  pagesStrip.classList.remove('hidden');
  captureActions.classList.remove('hidden');
  cameraHint.textContent = `${_capturaAlumno.nombre} — página ${_capturedCanvases.length} lista. ¿Otra página o enviar?`;
}

document.getElementById('btnOtraPagina').addEventListener('click', () => {
  cameraHint.textContent = `${_capturaAlumno.nombre} — encuadrá la siguiente página`;
});

document.getElementById('btnEnviarACalificar').addEventListener('click', async () => {
  if (!_capturedCanvases.length) return;
  const alumno = _capturaAlumno;
  const canvases = _capturedCanvases;
  closeCaptureModal();

  setLoading(`Subiendo ${canvases.length} foto(s) de ${alumno.nombre}…`);
  try {
    const paths = [];
    for (let i = 0; i < canvases.length; i++) {
      paths.push(await subirFotoExamen(canvases[i], _materiaId, _parcialId, alumno.id, i));
    }
    setLoading('Enviando a calificar con IA…');
    await enviarACalificar(_materiaId, _parcialId, alumno.id, paths);
  } catch (e) {
    alert(`Error al subir el examen: ${e.message}`);
  } finally {
    setLoading(null);
  }
});

// ---------------------------------------------------------------------------
// REVISIÓN / APROBACIÓN
// ---------------------------------------------------------------------------
async function openReviewModal(alumno) {
  _reviewAlumno = alumno;
  const rev = _revisiones[alumno.id] || {};
  reviewTitle.textContent = `${alumno.nombre} — ${PARCIALES.find(p => p.id === _parcialId)?.label || ''}`;

  reviewBody.innerHTML = '<div class="empty-hint">Cargando fotos…</div>';
  reviewModal.classList.remove('hidden');

  const urls = await Promise.all((rev.fotos || []).map(p => getFotoUrl(p).catch(() => null)));

  const avisosHtml = rev.avisos?.length
    ? `<div class="avisos-box">⚠️ La IA marcó lo siguiente — revisá con atención:<ul>${
        rev.avisos.map(a => `<li>${escapeHtml(a)}</li>`).join('')
      }</ul></div>`
    : '';

  const desgloseHtml = rev.desglose?.length
    ? `<table class="desglose-table">
        <thead><tr><th>Pregunta</th><th>Puntos</th><th>Comentario</th></tr></thead>
        <tbody>${rev.desglose.map(d => `
          <tr>
            <td>${escapeHtml(d.pregunta ?? '')}</td>
            <td>${d.puntos ?? '—'} / ${d.de ?? '—'}</td>
            <td>${escapeHtml(d.comentario || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '';

  const notaActual = rev.estado === 'aprobado' ? rev.notaFinal : rev.notaSugerida;

  reviewBody.innerHTML = `
    <div class="review-photos">
      ${urls.map(u => u ? `<img src="${u}" alt="Página del examen">` : '').join('')}
    </div>
    ${rev.confianza ? `<span class="confianza-badge ${rev.confianza}">Confianza IA: ${rev.confianza}</span>` : ''}
    ${avisosHtml}
    ${desgloseHtml}
    ${rev.estado === 'error' ? `<div class="avisos-box">❌ ${escapeHtml(rev.error || 'Error desconocido')}</div>` : ''}
    <div class="nota-final-row">
      <label for="notaFinalInput" style="font-size:0.8rem;font-weight:700;color:var(--text-muted)">Nota final</label>
      <input type="number" id="notaFinalInput" min="0" max="100" step="0.1" value="${notaActual ?? ''}">
      <span style="font-size:0.8rem;color:var(--text-muted)">/ 100</span>
    </div>
    <div class="modal-actions">
      <button class="btn success" id="btnAprobar">✅ Aprobar y guardar en el expediente</button>
      <button class="btn outline" id="btnReintentarDesdeModal">🔄 Volver a pedirle a la IA</button>
      <button class="btn outline" id="btnFotografiarDesdeModal">📷 Repetir fotos</button>
    </div>
  `;

  document.getElementById('btnAprobar').addEventListener('click', async () => {
    const val = parseFloat(document.getElementById('notaFinalInput').value);
    if (Number.isNaN(val) || val < 0 || val > 100) { alert('Ingresá una nota válida entre 0 y 100.'); return; }
    setLoading('Guardando nota…');
    try {
      await aprobarNota(alumno.id, _materiaId, _parcialId, val);
      closeReviewModal();
    } catch (e) {
      alert(`Error al guardar: ${e.message}`);
    } finally {
      setLoading(null);
    }
  });

  document.getElementById('btnReintentarDesdeModal').addEventListener('click', async () => {
    closeReviewModal();
    await reintentar(alumno);
  });

  document.getElementById('btnFotografiarDesdeModal').addEventListener('click', () => {
    closeReviewModal();
    openCaptureModal(alumno);
  });
}

function closeReviewModal() {
  reviewModal.classList.add('hidden');
  reviewBody.innerHTML = '';
  _reviewAlumno = null;
}

document.getElementById('btnCloseReview').addEventListener('click', closeReviewModal);
reviewModal.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeReviewModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReviewModal(); });
