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
import { getClave, saveClave, calcularNota, aprobarNotaOmr, getBorrador, saveBorrador, clearBorrador } from './parciales-omr.js';
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

const draftBanner       = document.getElementById('draftBanner');
const draftBannerText   = document.getElementById('draftBannerText');
const btnDescartarBorrador = document.getElementById('btnDescartarBorrador');

const detailModal = document.getElementById('detailModal');
const detailBody  = document.getElementById('detailBody');

const btnAbrirCamara  = document.getElementById('btnAbrirCamara');
const cameraModal     = document.getElementById('cameraModal');
const cameraVideo     = document.getElementById('cameraVideo');
const frozenFrame     = document.getElementById('frozenFrame');
const cameraBarViva   = document.getElementById('cameraBarViva');
const cameraHint      = document.getElementById('cameraHint');
const btnCapturarFoto = document.getElementById('btnCapturarFoto');
const btnCancelarCamara = document.getElementById('btnCancelarCamara');
const captureActions  = document.getElementById('captureActions');
const btnRepetirFoto  = document.getElementById('btnRepetirFoto');
const btnUsarFoto     = document.getElementById('btnUsarFoto');
const veredictoBar     = document.getElementById('veredictoBar');
const veredictoIcono   = document.getElementById('veredictoIcono');
const veredictoTexto   = document.getElementById('veredictoTexto');
const veredictoDetalle = document.getElementById('veredictoDetalle');
const carnetPrompt        = document.getElementById('carnetPrompt');
const carnetPromptInput   = document.getElementById('carnetPromptInput');
const carnetPromptMatch   = document.getElementById('carnetPromptMatch');
const btnCarnetPromptListo   = document.getElementById('btnCarnetPromptListo');
const btnCarnetPromptOmitir  = document.getElementById('btnCarnetPromptOmitir');

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

  await restoreBorradorSiExiste();
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
  draftBanner.classList.add('hidden');
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
    scheduleSaveBorrador();
    // Cede el hilo entre foto y foto para que la barra de progreso se pinte.
    await new Promise(r => setTimeout(r, 0));
  }
  progressText.textContent = `Listo — ${files.length} foto(s) procesadas.`;
  await persistBorradorAhora();
});

// ---------------------------------------------------------------------------
// Captura directa desde la cámara del celular — evalúa la foto al instante
// (mismo detector que usa el procesamiento real) antes de aceptarla, para
// poder repetirla ahí mismo si salió mal en vez de descubrirlo después.
// ---------------------------------------------------------------------------
let _cameraStream = null;
let _lastCapturedCanvas = null;
let _fotosCamaraSesion = 0;

const AMBIGUAS_RATIO_ADVERTENCIA = 0.2; // más de 20% de preguntas dudosas → advertir

btnAbrirCamara.addEventListener('click', openCamera);
btnCancelarCamara.addEventListener('click', closeCamera);
btnRepetirFoto.addEventListener('click', () => { _lastCapturedCanvas = null; showVistaEnVivo(); });
btnUsarFoto.addEventListener('click', aceptarFotoCapturada);

async function openCamera() {
  _fotosCamaraSesion = 0;
  cameraHint.textContent = 'Encuadrá toda la hoja, con las 4 marcas de esquina visibles';
  cameraModal.classList.remove('hidden');
  showVistaEnVivo();
  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1600 }, height: { ideal: 1200 } },
    });
    cameraVideo.srcObject = _cameraStream;
  } catch (e) {
    alert(`❌ No se pudo acceder a la cámara: ${e.message}\n\nPodés usar "Elegir archivos" en vez de la cámara.`);
    closeCamera();
  }
}

function stopCameraStream() {
  if (_cameraStream) { _cameraStream.getTracks().forEach(t => t.stop()); _cameraStream = null; }
}

function closeCamera() {
  stopCameraStream();
  cameraModal.classList.add('hidden');
  _lastCapturedCanvas = null;
  carnetPrompt.classList.add('hidden');
  _rowEnPromptCarnet = null;
}

function showVistaEnVivo() {
  cameraVideo.classList.remove('hidden');
  frozenFrame.classList.add('hidden');
  veredictoBar.classList.add('hidden');
  cameraBarViva.classList.remove('hidden');
  captureActions.classList.add('hidden');
  carnetPrompt.classList.add('hidden');
  _rowEnPromptCarnet = null;
}

btnCapturarFoto.addEventListener('click', () => {
  const w = cameraVideo.videoWidth  || 1280;
  const h = cameraVideo.videoHeight || 960;
  const canvas = document.createElement('canvas');
  drawScaledToCanvas(canvas, cameraVideo, w, h);
  _lastCapturedCanvas = canvas;

  frozenFrame.src = canvas.toDataURL('image/jpeg', 0.85);
  cameraVideo.classList.add('hidden');
  frozenFrame.classList.remove('hidden');
  cameraBarViva.classList.add('hidden');
  captureActions.classList.remove('hidden');

  mostrarVeredicto(evaluarCaptura(canvas));
});

/** Corre el mismo detector de esquinas/respuestas que el procesamiento real,
 * para avisar al toque si la foto sirve o hay que repetirla. */
function evaluarCaptura(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const corners = detectCorners(imageData);
  if (!corners) {
    return {
      nivel: 'error',
      icono: '❌',
      texto: 'No apta — no se ubicaron las 4 marcas de esquina',
      detalle: 'Repetí con mejor luz, encuadrando toda la hoja bien de frente.',
    };
  }

  const { resultado } = detectRespuestas(imageData, corners);
  const preguntas = Object.values(resultado);
  const total = preguntas.length || _numPreguntas;
  const dudosas = preguntas.filter(r => r.marcada == null).length;
  const ratio = total ? dudosas / total : 0;

  if (ratio > AMBIGUAS_RATIO_ADVERTENCIA) {
    return {
      nivel: 'warn',
      icono: '⚠️',
      texto: `Dudosa — ${dudosas} de ${total} respuestas no se leen con claridad`,
      detalle: 'Probá con más luz pareja (sin sombras ni brillo) y bien enfocada. Podés repetirla o usarla igual y corregir a mano después.',
    };
  }

  return {
    nivel: 'ok',
    icono: '✅',
    texto: 'Apta — se lee bien',
    detalle: dudosas
      ? `${dudosas} respuesta(s) para revisar a mano, el resto se leyó claro.`
      : 'Las 4 esquinas y todas las respuestas se leyeron claro.',
  };
}

function mostrarVeredicto(v) {
  veredictoBar.className = `veredicto-bar ${v.nivel}`;
  veredictoIcono.textContent = v.icono;
  veredictoTexto.textContent = v.texto;
  veredictoDetalle.textContent = v.detalle;
  veredictoBar.classList.remove('hidden');
}

let _rowEnPromptCarnet = null;

async function aceptarFotoCapturada() {
  if (!_lastCapturedCanvas) return;
  const canvas = _lastCapturedCanvas;
  _fotosCamaraSesion++;

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  const file = new File([blob], `camara_${Date.now()}_${_fotosCamaraSesion}.jpg`, { type: 'image/jpeg' });

  progressWrap.classList.remove('hidden');
  resultsTable.classList.remove('hidden');
  progressText.textContent = 'Procesando foto de la cámara…';
  let row = null;
  try {
    row = await processFile(file);
  } catch (e) {
    console.error('[parciales-omr] error procesando foto de cámara', e);
  }
  renderResultsTable();
  scheduleSaveBorrador();
  progressText.textContent = `Listo — ${_fotosCamaraSesion} foto(s) de cámara agregada(s) en esta sesión.`;

  _lastCapturedCanvas = null;

  // Las fotos de cámara no traen carné en el nombre de archivo (a diferencia
  // de subir desde galería) — se pide acá mismo, al toque, para no tener que
  // buscar la fila después en la tabla.
  if (row) {
    mostrarPromptCarnet(row);
  } else {
    cameraHint.textContent = 'Foto agregada ✅ — encuadrá la del siguiente alumno';
    showVistaEnVivo();
  }
}

function mostrarPromptCarnet(row) {
  _rowEnPromptCarnet = row;
  captureActions.classList.add('hidden');
  carnetPromptInput.value = '';
  carnetPromptMatch.textContent = '';
  carnetPrompt.classList.remove('hidden');
  carnetPromptInput.focus();
}

function actualizarMatchCarnet() {
  const valor = carnetPromptInput.value.trim();
  if (!valor) { carnetPromptMatch.textContent = ''; return; }
  const alumno = _carnetMap.get(valor);
  carnetPromptMatch.textContent = alumno ? `✅ ${alumno.nombre}` : '❌ No se encontró ningún alumno con ese carné en esta materia.';
}

carnetPromptInput.addEventListener('input', actualizarMatchCarnet);
carnetPromptInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarPromptCarnet(); });
btnCarnetPromptListo.addEventListener('click', confirmarPromptCarnet);
btnCarnetPromptOmitir.addEventListener('click', () => siguienteCapturaTrasPrompt());

function confirmarPromptCarnet() {
  if (_rowEnPromptCarnet) {
    _rowEnPromptCarnet.carnetManual = carnetPromptInput.value.trim();
    resolveRow(_rowEnPromptCarnet);
    renderResultsTable();
    scheduleSaveBorrador();
  }
  siguienteCapturaTrasPrompt();
}

function siguienteCapturaTrasPrompt() {
  carnetPrompt.classList.add('hidden');
  _rowEnPromptCarnet = null;
  cameraHint.textContent = 'Foto agregada ✅ — encuadrá la del siguiente alumno';
  showVistaEnVivo();
}

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
    const rowError = {
      id: ++_rowSeq, thumb: THUMB_ERROR, nombreArchivo: file.name,
      carnetManual: null,
      alumno: null, version: null, respuestas: null, respuestasOverride: {}, nota: null,
      estado: 'sin_esquinas', avisos: [e.message],
    };
    _resultados.push(rowError);
    return rowError;
  }

  const canvas = document.createElement('canvas');
  drawScaledToCanvas(canvas, img, img.naturalWidth, img.naturalHeight);
  const ctx = canvas.getContext('2d');
  const thumb = drawThumb(canvas, canvas.width, canvas.height);

  const row = {
    id: ++_rowSeq, thumb, nombreArchivo: file.name,
    carnetManual: null,
    alumno: null, version: null, respuestas: null, respuestasOverride: {}, nota: null,
    estado: 'sin_esquinas', avisos: [],
  };
  _resultados.push(row);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const corners = detectCorners(imageData);
  if (!corners) {
    row.avisos.push('No se pudieron ubicar las 4 marcas automáticamente. Repetí la foto (mejor luz/encuadre) o usá omr-test.html para revisarla a mano.');
    return row;
  }

  const { resultado } = detectRespuestas(imageData, corners);

  row.respuestas = resultado;
  row.version = detectVersionQR(imageData);
  row.carnetManual = extraerCarnetDeNombre(file.name);

  resolveRow(row);
  return row;
}

/** Si el nombre del archivo trae el carné (ej. "12345 - Juan Pérez.jpg"), lo
 * detecta buscando cada secuencia de dígitos del nombre contra los carnés de
 * alumnos inscritos en esta materia. Solo lo toma si hay una única
 * coincidencia inequívoca — si no, se deja para escribirlo a mano. */
function extraerCarnetDeNombre(nombreArchivo) {
  if (!nombreArchivo) return null;
  const base = nombreArchivo.replace(/\.[^.]+$/, '');
  const candidatos = [...new Set(base.match(/\d+/g) || [])];
  const coincidencias = candidatos.filter(c => _carnetMap.has(c));
  return coincidencias.length === 1 ? coincidencias[0] : null;
}

/** Combina lo leído por la cámara con las correcciones a mano del docente
 * (row.respuestasOverride), pregunta por pregunta. Las corregidas a mano
 * siempre ganan. */
function respuestasEfectivas(row) {
  if (!row.respuestas) return row.respuestas;
  const out = {};
  for (const q of Object.keys(row.respuestas)) {
    const corregida = row.respuestasOverride?.[q];
    out[q] = corregida ? { marcada: corregida } : row.respuestas[q];
  }
  return out;
}

/** Cuántas preguntas quedaron sin una respuesta clara (ni de la cámara ni corregida a mano). */
function preguntasSinLeer(row) {
  if (!row.respuestas) return 0;
  return Object.keys(row.respuestas)
    .filter(q => !row.respuestas[q]?.marcada && !row.respuestasOverride?.[q])
    .length;
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

  const sinLeer = preguntasSinLeer(row);
  if (sinLeer > 0) {
    row.avisos.push(`${sinLeer} respuesta(s) no se pudieron leer con confianza (marca muy clara/ambigua) — usá "🔍" para revisarlas y elegirlas a mano.`);
  }

  // La nota se calcula en cuanto hay versión + clave, sin necesidad de que el
  // carné ya esté asignado — así podés calificar todo el lote primero y
  // asignar los alumnos después, a tu ritmo. Las preguntas que corregiste a
  // mano (respuestasOverride) reemplazan lo que había leído la cámara.
  if (row.version && _claves[row.version]) {
    row.nota = calcularNota(respuestasEfectivas(row), _claves[row.version].respuestas, _claves[row.version].numPreguntas || _numPreguntas);
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

/** Orden de las filas: agrupadas por versión detectada (A, B, C…), sin
 * versión al final, y estable por orden de subida dentro de cada grupo. */
function ordenarPorVersion() {
  const rango = v => v ? VERSIONS.indexOf(v) : VERSIONS.length;
  _resultados.sort((a, b) => rango(a.version) - rango(b.version) || a.id - b.id);
}

function renderResultsTable() {
  ordenarPorVersion();

  let grupoActual;
  resultsBody.innerHTML = _resultados.map(row => {
    const badge = ESTADO_BADGE[row.estado];
    const carnetCell = row.estado === 'aprobado'
      ? escapeHtml(row.carnetManual ?? '—')
      : `<input type="text" class="carnet-input" inputmode="numeric" placeholder="Carné"
           value="${escapeHtml(row.carnetManual ?? '')}">`;

    // Si el QR no se pudo leer (foto borrosa, tapada, etc.) se puede elegir
    // la versión a mano — sin esto la foto queda trabada sin poder calificarla.
    const versionCell = (row.estado === 'aprobado' || row.estado === 'sin_esquinas')
      ? (row.version || '—')
      : `<select class="version-select">
          <option value="">—</option>
          ${VERSIONS.map(v => `<option value="${v}" ${row.version === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>`;

    let headerHtml = '';
    if (row.version !== grupoActual) {
      grupoActual = row.version;
      const enGrupo = _resultados.filter(r => r.version === grupoActual).length;
      const tieneClave = grupoActual && _claves[grupoActual];
      const label = grupoActual ? `Versión ${grupoActual}` : 'Sin código de versión detectado';
      headerHtml = `<tr class="version-group"><td colspan="7">${label} — ${enGrupo} foto(s)${
        grupoActual && !tieneClave ? ' · ⚠️ falta guardar la clave de esta versión' : ''
      }</td></tr>`;
    }

    const sinLeer = preguntasSinLeer(row);
    const notaCell = row.nota != null
      ? `${row.nota}${sinLeer ? ` <span class="badge warn" style="margin-left:4px" title="${sinLeer} respuesta(s) sin leer con confianza">❓${sinLeer}</span>` : ''}`
      : '—';

    return headerHtml + `
      <tr data-id="${row.id}">
        <td><img class="thumb" src="${row.thumb}" alt=""></td>
        <td>${carnetCell}</td>
        <td class="alumno-cell">${row.alumno ? escapeHtml(row.alumno.nombre) : (row.carnetManual ? '<span style="color:var(--danger)">no encontrado</span>' : '<span style="color:var(--text-muted)">—</span>')}</td>
        <td>${versionCell}</td>
        <td>${notaCell}</td>
        <td><span class="badge ${badge.cls}">${badge.label}</span></td>
        <td>
          <button class="btn outline small" data-action="revisar">${sinLeer ? '🔍❓' : '🔍'}</button>
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
    scheduleSaveBorrador();
  }
});

// ---------------------------------------------------------------------------
// Casilla de carné directamente en la fila (alternativa rápida al modal)
// ---------------------------------------------------------------------------
function rowOfInput(input) {
  const id = Number(input.closest('tr').dataset.id);
  return _resultados.find(r => r.id === id);
}

/** Mientras se escribe: solo actualiza la vista previa del alumno, sin re-renderizar la tabla (perdería el foco). */
resultsBody.addEventListener('input', (e) => {
  const input = e.target.closest('.carnet-input');
  if (!input) return;
  const row = rowOfInput(input);
  if (!row) return;
  const carnet = input.value.trim();
  const alumno = carnet ? _carnetMap.get(carnet) : null;
  const alumnoCell = input.closest('tr').querySelector('.alumno-cell');
  if (alumnoCell) {
    alumnoCell.innerHTML = alumno
      ? escapeHtml(alumno.nombre)
      : (carnet ? '<span style="color:var(--danger)">no encontrado</span>' : '<span style="color:var(--text-muted)">—</span>');
  }
});

/** Al salir del campo (blur/Enter): aplica de verdad — recalcula nota, estado y duplicados. */
function aplicarCarnetInline(input) {
  const row = rowOfInput(input);
  if (!row) return;
  const alumnoIdAnterior = row.alumno?.id ?? null;
  row.carnetManual = input.value.trim();
  resolveRow(row);
  if (alumnoIdAnterior && alumnoIdAnterior !== row.alumno?.id) {
    _resultados.filter(r => r !== row && r.alumno?.id === alumnoIdAnterior).forEach(resolveRow);
  }
  renderResultsTable();
  scheduleSaveBorrador();
}

/** Cambiar la versión a mano (cuando el QR no se pudo leer): recalcula nota y estado. */
function aplicarVersionInline(select) {
  const row = rowOfInput(select);
  if (!row) return;
  row.version = select.value || null;
  resolveRow(row);
  renderResultsTable();
  scheduleSaveBorrador();
}

resultsBody.addEventListener('change', (e) => {
  const input = e.target.closest('.carnet-input');
  if (input) { aplicarCarnetInline(input); return; }
  const select = e.target.closest('.version-select');
  if (select) aplicarVersionInline(select);
});

resultsBody.addEventListener('keydown', (e) => {
  const input = e.target.closest('.carnet-input');
  if (!input || e.key !== 'Enter') return;
  e.preventDefault();
  const inputsAntes = [...resultsBody.querySelectorAll('.carnet-input')];
  const idx = inputsAntes.indexOf(input);
  aplicarCarnetInline(input);
  const inputsDespues = [...resultsBody.querySelectorAll('.carnet-input')];
  const siguiente = inputsDespues[idx + 1];
  if (siguiente) { siguiente.focus(); siguiente.select(); }
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

/** HTML de la lista de preguntas sin leer con confianza, con botones A/B/C/D
 * para que el docente elija la que realmente marcó el alumno en la hoja. */
function renderAmbiguasHtml(row) {
  if (!row.respuestas) return '';
  const pendientes = Object.keys(row.respuestas)
    .map(Number)
    .filter(q => !row.respuestas[q]?.marcada && !row.respuestasOverride?.[q])
    .sort((a, b) => a - b);
  if (!pendientes.length) return '';
  return `
    <div class="ambiguas-panel" id="ambiguasPanel">
      <div class="ambiguas-title" id="ambiguasTitle">❓ ${pendientes.length} respuesta(s) sin leer con confianza — mirá la hoja y elegí la que marcó el alumno:</div>
      ${pendientes.map(q => {
        const candidatos = row.respuestas[q]?.candidatos;
        return `
        <div class="ambigua-row" data-q="${q}">
          <span class="ambigua-qnum">#${q}</span>
          <div class="ambigua-opts">
            ${OPTIONS.map(opt => `<button type="button" class="ambigua-opt" data-opt="${opt}">${opt}</button>`).join('')}
          </div>
          ${candidatos?.length ? `<span class="ambigua-hint">más oscura: ${candidatos[0]}</span>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}

function openDetail(row, { sequential = false } = {}) {
  _sequential = sequential;
  const carnetActual = row.carnetManual ?? '';
  detailBody.innerHTML = `
    <img src="${row.thumb}" alt="">
    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">📄 ${escapeHtml(row.nombreArchivo || '')}</div>
    <div id="notaEnVivoWrap" style="font-size:0.85rem;margin-bottom:8px;${row.nota == null ? 'display:none' : ''}">
      Nota con lo resuelto hasta ahora: <strong id="notaEnVivo">${row.nota ?? '—'}</strong>
    </div>
    ${row.avisos.length ? `<div class="badge warn" style="display:block;padding:10px;margin-bottom:12px">${row.avisos.map(escapeHtml).join('<br>')}</div>` : ''}
    ${renderAmbiguasHtml(row)}
    <div class="field" style="margin-bottom:10px">
      <label for="carnetInput">Carné del alumno (mirá la hoja y escribilo)</label>
      <input type="text" id="carnetInput" value="${escapeHtml(carnetActual)}" inputmode="numeric" autofocus>
    </div>
    <div id="matchPreview" style="font-size:0.85rem;margin-bottom:14px"></div>
    <button class="btn primary" id="btnAplicarCarnet">${sequential ? 'Aplicar y seguir con el siguiente →' : 'Aplicar'}</button>
    <button class="btn outline" id="btnDescartarFoto" style="margin-top:8px">🗑 Descartar esta foto</button>
  `;
  detailModal.classList.remove('hidden');

  const ambiguasPanel = document.getElementById('ambiguasPanel');
  ambiguasPanel?.addEventListener('click', (e) => {
    const btn = e.target.closest('.ambigua-opt');
    if (!btn) return;
    const q = btn.closest('.ambigua-row').dataset.q;
    row.respuestasOverride ??= {};
    row.respuestasOverride[q] = btn.dataset.opt;
    resolveRow(row);
    renderResultsTable();
    scheduleSaveBorrador();

    btn.closest('.ambigua-row').remove();
    const restantes = ambiguasPanel.querySelectorAll('.ambigua-row').length;
    document.getElementById('ambiguasTitle').textContent =
      `❓ ${restantes} respuesta(s) sin leer con confianza — mirá la hoja y elegí la que marcó el alumno:`;
    if (restantes === 0) ambiguasPanel.remove();

    const notaWrap = document.getElementById('notaEnVivoWrap');
    document.getElementById('notaEnVivo').textContent = row.nota ?? '—';
    notaWrap.style.display = row.nota == null ? 'none' : '';
  });

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
    scheduleSaveBorrador();

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
    scheduleSaveBorrador();
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
  await persistBorradorAhora(); // las filas "aprobado" ya no viajan al borrador
  alert(`Listo: ${ok} nota(s) guardada(s)${fail ? `, ${fail} con error (revisá la consola)` : ''}.`);
});

// ---------------------------------------------------------------------------
// Borrador — persiste el lote en Firebase para sobrevivir a cerrar la pestaña
// ---------------------------------------------------------------------------
let _saveTimer = null;

function scheduleSaveBorrador() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { persistBorradorAhora(); }, 1000);
}

async function persistBorradorAhora() {
  if (!_materiaId) return;
  clearTimeout(_saveTimer);
  const pendientes = _resultados.filter(r => r.estado !== 'aprobado');
  try {
    if (pendientes.length === 0) {
      await clearBorrador(_materiaId, _parcialId);
    } else {
      const filas = pendientes.map(r => ({
        id: r.id, thumb: r.thumb, nombreArchivo: r.nombreArchivo,
        carnetManual: r.carnetManual, version: r.version, respuestas: r.respuestas,
        respuestasOverride: r.respuestasOverride,
      }));
      await saveBorrador(_materiaId, _parcialId, { filas, numPreguntas: _numPreguntas });
    }
  } catch (e) {
    console.error('[parciales-omr] error guardando borrador', e);
  }
}

async function restoreBorradorSiExiste() {
  const borrador = await getBorrador(_materiaId, _parcialId);
  if (!borrador?.filas?.length) return;

  _resultados = borrador.filas.map(f => ({
    id: f.id, thumb: f.thumb, nombreArchivo: f.nombreArchivo,
    carnetManual: f.carnetManual, alumno: null, version: f.version,
    respuestas: f.respuestas, respuestasOverride: f.respuestasOverride || {},
    nota: null, estado: 'revisar', avisos: [],
  }));
  _rowSeq = Math.max(_rowSeq, ..._resultados.map(r => r.id));
  _resultados.forEach(resolveRow);

  resultsTable.classList.remove('hidden');
  renderResultsTable();

  const fecha = borrador.actualizadoEn ? new Date(borrador.actualizadoEn).toLocaleString('es-SV') : '';
  draftBannerText.textContent = `📋 Se restauró un borrador sin terminar (${_resultados.length} foto(s), guardado ${fecha}).`;
  draftBanner.classList.remove('hidden');
}

btnDescartarBorrador.addEventListener('click', async () => {
  if (!confirm('¿Descartar el borrador guardado y empezar de nuevo? Se perderán las fotos ya calificadas que no hayas guardado.')) return;
  resetBatch();
  await clearBorrador(_materiaId, _parcialId);
});
