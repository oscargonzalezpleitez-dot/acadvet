// =============================================================================
// AcadVet USAM — Pantalla "Parciales por Burbujas" (docente)
// Carga la clave de respuestas (una o varias versiones) → subís todas las
// fotos de golpe → cada una se procesa en el navegador (sin servidor, sin
// IA): esquinas y respuestas automáticas. El carné se escribe a mano —
// el alumno lo pone a mano y en números en la hoja, y vos lo tecleás acá
// (no hay grilla de burbujas para el carné) — la app busca al alumno al
// instante mientras lo escribís. Al final, un click guarda todas las
// notas listas en el expediente.
// =============================================================================

import { getMaterias, getAlumnos, alumnosByMateria } from './db.js';
import { getClave, saveClave, calcularNota, aprobarNotaOmr } from './parciales-omr.js';
import { detectCorners, detectRespuestas } from './omr-core.js';
import { detectVersionQR } from './qr-detect.js';
import { VERSIONS, OPTIONS } from './omr-template.js';
import { drawScaledToCanvas, loadImageFile } from './lab-reports.js';

if (sessionStorage.getItem('acadvet_auth') !== 'admin') {
  window.location.replace('index.html');
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let _materiaId = '';
let _parcialId = 'parcial_1';
let _numPreguntas = 30;

let _todosAlumnos = [];
let _alumnos = [];       // inscritos en la materia actual
let _carnetMap = new Map(); // carnet (string) -> alumno

let _claves = {};        // { A: { respuestas:{1:'B',...}, numPreguntas }, ... } — borrador en memoria
let _currentVersion = 'A';

let _resultados = [];    // filas procesadas: ver processFile()
let _rowSeq = 0;

// ---------------------------------------------------------------------------
// Refs DOM
// ---------------------------------------------------------------------------
const selMateria    = document.getElementById('selMateria');
const parcialTabs   = document.getElementById('parcialTabs');
const numPreguntasEl = document.getElementById('numPreguntas');

const clavePanel    = document.getElementById('clavePanel');
const versionTabs   = document.getElementById('versionTabs');
const claveGrid      = document.getElementById('claveGrid');
const btnGuardarClave = document.getElementById('btnGuardarClave');
const claveStatus    = document.getElementById('claveStatus');

const procesarPanel = document.getElementById('procesarPanel');
const fileInputBatch = document.getElementById('fileInputBatch');
const progressWrap   = document.getElementById('progressWrap');
const progressBar    = document.getElementById('progressBar');
const progressText   = document.getElementById('progressText');
const resultsTable   = document.getElementById('resultsTable');
const resultsBody    = document.getElementById('resultsBody');
const summaryBar      = document.getElementById('summaryBar');
const summaryCount    = document.getElementById('summaryCount');
const btnAprobarTodo  = document.getElementById('btnAprobarTodo');
const btnRevisarCarnets = document.getElementById('btnRevisarCarnets');

const detailModal = document.getElementById('detailModal');
const detailBody  = document.getElementById('detailBody');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
  parcialTabs.querySelector(`[data-parcial="${_parcialId}"]`)?.classList.add('active');
  const [materias, alumnos] = await Promise.all([getMaterias(), getAlumnos()]);
  _todosAlumnos = alumnos;
  selMateria.innerHTML = '<option value="">— Seleccioná —</option>' +
    materias.filter(m => m.estado !== 'archivada')
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(m => `<option value="${m.id}">${m.nombre}${m.ciclo ? ' — ' + m.ciclo : ''}</option>`)
      .join('');
})();

selMateria.addEventListener('change', () => { _materiaId = selMateria.value; onSelectionChanged(); });

parcialTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.parcial-tab');
  if (!btn) return;
  _parcialId = btn.dataset.parcial;
  [...parcialTabs.children].forEach(b => b.classList.toggle('active', b === btn));
  onSelectionChanged();
});

numPreguntasEl.addEventListener('change', () => {
  _numPreguntas = Math.max(1, Math.min(30, parseInt(numPreguntasEl.value, 10) || 30));
  numPreguntasEl.value = _numPreguntas;
  renderClaveGrid();
});

async function onSelectionChanged() {
  if (!_materiaId) {
    clavePanel.classList.add('hidden');
    procesarPanel.classList.add('hidden');
    return;
  }
  clavePanel.classList.remove('hidden');
  procesarPanel.classList.remove('hidden');
  resetBatch();

  _alumnos = alumnosByMateria(_todosAlumnos, _materiaId);
  _carnetMap = new Map(_alumnos.filter(a => a.carnet).map(a => [String(a.carnet).trim(), a]));

  _claves = {};
  await Promise.all(VERSIONS.map(async v => {
    const c = await getClave(_materiaId, _parcialId, v);
    if (c) _claves[v] = c;
  }));
  if (_claves[_currentVersion]?.numPreguntas) _numPreguntas = _claves[_currentVersion].numPreguntas;
  numPreguntasEl.value = _numPreguntas;

  renderVersionTabs();
  renderClaveGrid();
}

// ---------------------------------------------------------------------------
// Clave de respuestas
// ---------------------------------------------------------------------------
function renderVersionTabs() {
  versionTabs.innerHTML = VERSIONS.map(v => `
    <button type="button" class="version-tab ${v === _currentVersion ? 'active' : ''} ${_claves[v] ? 'configurada' : ''}" data-v="${v}">
      Versión ${v}
    </button>`).join('');
}

versionTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-v]');
  if (!btn) return;
  _currentVersion = btn.dataset.v;
  if (_claves[_currentVersion]?.numPreguntas) {
    _numPreguntas = _claves[_currentVersion].numPreguntas;
    numPreguntasEl.value = _numPreguntas;
  }
  renderVersionTabs();
  renderClaveGrid();
  claveStatus.textContent = '';
});

function renderClaveGrid() {
  const respuestas = _claves[_currentVersion]?.respuestas || {};
  let html = '';
  for (let q = 1; q <= _numPreguntas; q++) {
    html += `<div class="clave-row" data-q="${q}">
      <span class="qnum">${q}</span>
      ${OPTIONS.map(opt => `<button type="button" class="opt-btn ${respuestas[q] === opt ? 'active' : ''}" data-opt="${opt}">${opt}</button>`).join('')}
    </div>`;
  }
  claveGrid.innerHTML = html;
}

claveGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.opt-btn');
  if (!btn) return;
  const q = Number(btn.closest('.clave-row').dataset.q);
  const opt = btn.dataset.opt;
  _claves[_currentVersion] ??= { respuestas: {}, numPreguntas: _numPreguntas };
  _claves[_currentVersion].respuestas[q] = opt;
  renderClaveGrid();
});

btnGuardarClave.addEventListener('click', async () => {
  const clave = _claves[_currentVersion];
  if (!clave || Object.keys(clave.respuestas).length < _numPreguntas) {
    if (!confirm('No completaste todas las preguntas de esta clave. ¿Guardar igual?')) return;
  }
  btnGuardarClave.disabled = true;
  try {
    await saveClave(_materiaId, _parcialId, _currentVersion, {
      respuestas: clave?.respuestas || {},
      numPreguntas: _numPreguntas,
    });
    _claves[_currentVersion] = { respuestas: clave?.respuestas || {}, numPreguntas: _numPreguntas };
    claveStatus.textContent = `✅ Clave ${_currentVersion} guardada — ${new Date().toLocaleTimeString('es-SV')}`;
    renderVersionTabs();
  } catch (e) {
    claveStatus.textContent = `❌ Error: ${e.message}`;
  } finally {
    btnGuardarClave.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Procesamiento de fotos (100% en el navegador)
// ---------------------------------------------------------------------------
function resetBatch() {
  _resultados = [];
  resultsBody.innerHTML = '';
  resultsTable.classList.add('hidden');
  summaryBar.classList.add('hidden');
  progressWrap.classList.add('hidden');
  progressText.textContent = '';
}

function drawThumb(source, sw, sh, maxDim = 220) {
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale);
  c.height = Math.round(sh * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.6);
}

fileInputBatch.addEventListener('change', async () => {
  const files = [...fileInputBatch.files];
  fileInputBatch.value = '';
  if (!files.length) return;

  progressWrap.classList.remove('hidden');
  resultsTable.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    progressText.textContent = `Procesando ${i + 1}/${files.length}…`;
    progressBar.style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
    try {
      await processFile(files[i]);
    } catch (e) {
      console.error('[parciales-omr] error procesando', files[i].name, e);
    }
    renderResultsTable();
    // Cede el hilo entre foto y foto para que la barra de progreso se pinte.
    await new Promise(r => setTimeout(r, 0));
  }
  progressText.textContent = `Listo — ${files.length} foto(s) procesadas.`;
});

// Placeholder gris para filas cuya imagen ni siquiera se pudo abrir (ej.
// formato HEIC) — sin esto la fila no tiene miniatura que mostrar.
const THUMB_ERROR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="280"><rect width="220" height="280" fill="%23eee"/><text x="110" y="140" font-size="60" text-anchor="middle" fill="%23999">⚠️</text></svg>'
);

async function processFile(file) {
  let img;
  try {
    img = await loadImageFile(file);
  } catch (e) {
    _resultados.push({
      id: ++_rowSeq, thumb: THUMB_ERROR, nombreArchivo: file.name,
      carnetManual: null,
      alumno: null, version: null, respuestas: null, nota: null,
      estado: 'sin_esquinas', avisos: [e.message],
    });
    return;
  }

  const canvas = document.createElement('canvas');
  drawScaledToCanvas(canvas, img, img.naturalWidth, img.naturalHeight);
  const ctx = canvas.getContext('2d');
  const thumb = drawThumb(canvas, canvas.width, canvas.height);

  const row = {
    id: ++_rowSeq, thumb, nombreArchivo: file.name,
    carnetManual: null,
    alumno: null, version: null, respuestas: null, nota: null,
    estado: 'sin_esquinas', avisos: [],
  };
  _resultados.push(row);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const corners = detectCorners(imageData);
  if (!corners) {
    row.avisos.push('No se pudieron ubicar las 4 marcas automáticamente. Repetí la foto (mejor luz/encuadre) o usá omr-test.html para revisarla a mano.');
    return;
  }

  const { resultado } = detectRespuestas(imageData, corners);

  row.respuestas = resultado;
  row.version = detectVersionQR(imageData);

  resolveRow(row);
}

/** Resuelve alumno + nota a partir de row.carnetManual (siempre a mano), y decide el estado. */
function resolveRow(row) {
  const carnet = row.carnetManual;
  row.avisos = [];
  row.alumno = carnet ? (_carnetMap.get(String(carnet).trim()) || null) : null;
  row.nota = null;

  if (!carnet) {
    row.avisos.push('Todavía no escribiste el carné de este alumno.');
  }
  if (carnet && !row.alumno) {
    row.avisos.push(`Carné "${carnet}" no está inscrito en esta materia.`);
  }
  if (!row.version) {
    row.avisos.push('No se detectó el código de versión de la hoja.');
  } else if (!_claves[row.version]) {
    row.avisos.push(`No hay clave de respuestas guardada para la versión ${row.version}.`);
  }

  const dup = row.alumno && _resultados.some(r => r !== row && r.alumno?.id === row.alumno.id);
  if (dup) row.avisos.push('Este alumno ya tiene otra foto en este lote — revisá cuál es la correcta.');

  // La nota se calcula en cuanto hay versión + clave, sin necesidad de que el
  // carné ya esté asignado — así podés calificar todo el lote primero y
  // asignar los alumnos después, a tu ritmo.
  if (row.version && _claves[row.version]) {
    row.nota = calcularNota(row.respuestas, _claves[row.version].respuestas, _claves[row.version].numPreguntas || _numPreguntas);
  }

  if (dup || row.nota == null) {
    row.estado = 'revisar';
  } else if (!row.alumno) {
    row.estado = 'sin_alumno';
  } else {
    row.estado = 'listo';
  }

  // Re-evaluar duplicados existentes también (por si este alumno ya estaba "listo").
  if (row.alumno) {
    _resultados.forEach(r => {
      if (r !== row && r.alumno?.id === row.alumno.id && r.estado === 'listo') {
        r.estado = 'revisar';
        if (!r.avisos.includes('Este alumno ya tiene otra foto en este lote — revisá cuál es la correcta.')) {
          r.avisos.push('Este alumno ya tiene otra foto en este lote — revisá cuál es la correcta.');
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Tabla de resultados
// ---------------------------------------------------------------------------
const ESTADO_BADGE = {
  listo:         { cls: 'ok',    label: '✅ Listo' },
  sin_alumno:    { cls: 'warn',  label: '📝 Calificado, falta asignar' },
  revisar:       { cls: 'warn',  label: '⚠️ Revisar' },
  sin_esquinas:  { cls: 'error', label: '❌ Sin esquinas' },
  aprobado:      { cls: 'ok',    label: '💾 Guardado' },
};

function renderResultsTable() {
  resultsBody.innerHTML = _resultados.map(row => {
    const badge = ESTADO_BADGE[row.estado];
    const carnet = row.carnetManual ?? '—';
    return `
      <tr data-id="${row.id}">
        <td><img class="thumb" src="${row.thumb}" alt=""></td>
        <td>${carnet}</td>
        <td>${row.alumno ? escapeHtml(row.alumno.nombre) : '<span style="color:var(--danger)">no encontrado</span>'}</td>
        <td>${row.version || '—'}</td>
        <td>${row.nota != null ? row.nota : '—'}</td>
        <td><span class="badge ${badge.cls}">${badge.label}</span></td>
        <td>
          <button class="btn outline small" data-action="revisar">🔍</button>
          <button class="btn outline small" data-action="descartar">🗑</button>
        </td>
      </tr>`;
  }).join('');

  const listos = _resultados.filter(r => r.estado === 'listo').length;
  const calificadas = _resultados.filter(r => r.nota != null).length;
  const pendientes = pendingCarnetRows().length;
  summaryBar.classList.toggle('hidden', _resultados.length === 0);
  summaryCount.innerHTML = `<strong>${calificadas}</strong> de ${_resultados.length} fotos calificadas`
    + (listos !== calificadas ? ` — <strong>${listos}</strong> listas para guardar (con alumno asignado)` : '')
    + '.';
  btnAprobarTodo.disabled = listos === 0;
  btnRevisarCarnets.classList.toggle('hidden', pendientes === 0);
  btnRevisarCarnets.textContent = `✏️ Escribir carnés pendientes (${pendientes})`;
}

/** Filas con respuestas ya leídas pero sin carné escrito todavía. */
function pendingCarnetRows() {
  return _resultados.filter(r => r.respuestas && !r.carnetManual);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

resultsBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = Number(btn.closest('tr').dataset.id);
  const row = _resultados.find(r => r.id === id);
  if (!row) return;
  if (btn.dataset.action === 'revisar') openDetail(row);
  if (btn.dataset.action === 'descartar') {
    discardRow(row);
    renderResultsTable();
  }
});

/** Saca una fila del lote y re-evalúa a las que compartían su mismo alumno
 * (por si quedaban marcadas "duplicado" solo por culpa de esta). */
function discardRow(row) {
  _resultados = _resultados.filter(r => r.id !== row.id);
  if (row.alumno) {
    _resultados.filter(r => r.alumno?.id === row.alumno.id).forEach(resolveRow);
  }
}

// ---------------------------------------------------------------------------
// Modal de revisión / corrección manual del carné
// ---------------------------------------------------------------------------
let _sequential = false;

function openDetail(row, { sequential = false } = {}) {
  _sequential = sequential;
  const carnetActual = row.carnetManual ?? '';
  detailBody.innerHTML = `
    <img src="${row.thumb}" alt="">
    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">📄 ${escapeHtml(row.nombreArchivo || '')}</div>
    ${row.avisos.length ? `<div class="badge warn" style="display:block;padding:10px;margin-bottom:12px">${row.avisos.map(escapeHtml).join('<br>')}</div>` : ''}
    <div class="field" style="margin-bottom:10px">
      <label for="carnetInput">Carné del alumno (mirá la hoja y escribilo)</label>
      <input type="text" id="carnetInput" value="${escapeHtml(carnetActual)}" inputmode="numeric" autofocus>
    </div>
    <div id="matchPreview" style="font-size:0.85rem;margin-bottom:14px"></div>
    <button class="btn primary" id="btnAplicarCarnet">${sequential ? 'Aplicar y seguir con el siguiente →' : 'Aplicar'}</button>
    <button class="btn outline" id="btnDescartarFoto" style="margin-top:8px">🗑 Descartar esta foto</button>
  `;
  detailModal.classList.remove('hidden');

  const carnetInput = document.getElementById('carnetInput');
  const matchPreview = document.getElementById('matchPreview');
  function updatePreview() {
    const alumno = _carnetMap.get(carnetInput.value.trim());
    matchPreview.innerHTML = alumno
      ? `✅ Coincide con: <strong>${escapeHtml(alumno.nombre)}</strong>`
      : `❌ No se encontró ningún alumno con ese carné en esta materia.`;
  }
  carnetInput.addEventListener('input', updatePreview);
  updatePreview();
  carnetInput.focus();

  function aplicar() {
    const alumnoIdAnterior = row.alumno?.id ?? null;
    row.carnetManual = carnetInput.value.trim();
    resolveRow(row);
    // Si este alumno cambió de identidad, re-evaluar a quien compartía el
    // alumno viejo — puede que ya no sea un duplicado.
    if (alumnoIdAnterior && alumnoIdAnterior !== row.alumno?.id) {
      _resultados.filter(r => r !== row && r.alumno?.id === alumnoIdAnterior).forEach(resolveRow);
    }
    renderResultsTable();

    if (_sequential) {
      const [next] = pendingCarnetRows();
      if (next) { openDetail(next, { sequential: true }); return; }
    }
    closeDetail();
  }

  document.getElementById('btnAplicarCarnet').addEventListener('click', aplicar);
  carnetInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicar(); });

  document.getElementById('btnDescartarFoto').addEventListener('click', () => {
    discardRow(row);
    renderResultsTable();
    if (_sequential) {
      const [next] = pendingCarnetRows();
      if (next) { openDetail(next, { sequential: true }); return; }
    }
    closeDetail();
  });
}

function closeDetail() {
  _sequential = false;
  detailModal.classList.add('hidden');
  detailBody.innerHTML = '';
}
document.getElementById('btnCloseDetail').addEventListener('click', closeDetail);
detailModal.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDetail(); });

btnRevisarCarnets.addEventListener('click', () => {
  const [first] = pendingCarnetRows();
  if (first) openDetail(first, { sequential: true });
});

// ---------------------------------------------------------------------------
// Aprobar y guardar
// ---------------------------------------------------------------------------
btnAprobarTodo.addEventListener('click', async () => {
  const listos = _resultados.filter(r => r.estado === 'listo');
  if (!listos.length) return;
  if (!confirm(`¿Guardar ${listos.length} nota(s) en el expediente de cada alumno? Esto no se puede deshacer desde acá.`)) return;

  btnAprobarTodo.disabled = true;
  btnAprobarTodo.textContent = 'Guardando…';
  let ok = 0, fail = 0;
  for (const row of listos) {
    try {
      await aprobarNotaOmr(row.alumno.id, _materiaId, _parcialId, row.nota);
      row.estado = 'aprobado';
      ok++;
    } catch (e) {
      console.error('[parciales-omr] error guardando', row, e);
      fail++;
    }
  }
  renderResultsTable();
  btnAprobarTodo.textContent = '✅ Aprobar y guardar notas listas';
  btnAprobarTodo.disabled = false;
  alert(`Listo: ${ok} nota(s) guardada(s)${fail ? `, ${fail} con error (revisá la consola)` : ''}.`);
});
