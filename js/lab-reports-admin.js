// =============================================================================
// AcadVet USAM — Dashboard de Reportes de Laboratorio (Docente)
// =============================================================================

import { getDatabase, ref, onValue, update }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const rtdb = getDatabase(app);

// ---------------------------------------------------------------------------
// Auth guard — redirige si no es docente
// ---------------------------------------------------------------------------
const _role = sessionStorage.getItem('acadvet_auth');
if (_role !== 'admin') window.location.replace('index.html');

// ---------------------------------------------------------------------------
// Estado local
// ---------------------------------------------------------------------------
let _allReports = [];
let _currentId  = null;

// ---------------------------------------------------------------------------
// Carga en tiempo real
// ---------------------------------------------------------------------------
export function initDashboard() {
  onValue(ref(rtdb, 'lab_reports'), snapshot => {
    if (!snapshot.exists()) {
      _allReports = [];
    } else {
      _allReports = Object.entries(snapshot.val())
        .map(([id, d]) => ({ id, ...d }))
        .sort((a, b) => b.timestamp - a.timestamp);
    }
    applyFilters();
    updateCounters();
  });
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------
export function applyFilters() {
  const search  = document.getElementById('filterSearch')?.value.trim().toLowerCase()  ?? '';
  const tipo    = document.getElementById('filterTipo')?.value    ?? '';
  const asig    = document.getElementById('filterAsig')?.value.trim().toLowerCase()    ?? '';
  const estado  = document.getElementById('filterEstado')?.value  ?? '';
  const fechaD  = document.getElementById('filterFechaDesde')?.value ?? '';
  const fechaH  = document.getElementById('filterFechaHasta')?.value ?? '';

  const filtered = _allReports.filter(r => {
    if (search && !r.student_name?.toLowerCase().includes(search) &&
                  !r.student_id?.toLowerCase().includes(search)) return false;
    if (tipo   && r.tipo_preparacion !== tipo) return false;
    if (asig   && !r.asignatura?.toLowerCase().includes(asig)) return false;
    if (estado && r.estado !== estado) return false;
    if (fechaD && r.fecha < fechaD) return false;
    if (fechaH && r.fecha > fechaH) return false;
    return true;
  });

  renderGrid(filtered);
  document.getElementById('resultsCount').textContent =
    `${filtered.length} reporte${filtered.length !== 1 ? 's' : ''}`;
}

// ---------------------------------------------------------------------------
// Render grid
// ---------------------------------------------------------------------------
function renderGrid(reports) {
  const grid = document.getElementById('reportsGrid');
  if (!grid) return;

  if (reports.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔬</div>
      <p>No hay reportes que coincidan con los filtros</p>
    </div>`;
    return;
  }

  grid.innerHTML = reports.map(r => `
    <div class="report-card ${r.estado}" data-id="${r.id}" tabindex="0" role="button" aria-label="Ver reporte de ${r.student_name}">
      <div class="report-thumb">
        <img src="${escHtml(r.foto_url)}" alt="Foto de práctica" loading="lazy" onerror="this.style.display='none'">
        <div class="report-estado-badge ${r.estado}">${r.estado === 'revisado' ? '✅ Revisado' : '🔴 Pendiente'}</div>
      </div>
      <div class="report-info">
        <div class="report-name">${escHtml(r.student_name)}</div>
        <div class="report-id-text">${escHtml(r.student_id)}</div>
        <div class="report-tipo">${escHtml(r.tipo_preparacion)}</div>
        <div class="report-meta-row">
          <span>📅 ${r.fecha}</span>
          <span>📍 ${r.gps_distancia}m</span>
        </div>
        ${r.asignatura ? `<div class="report-asig">${escHtml(r.asignatura)}</div>` : ''}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.report-card').forEach(card => {
    card.addEventListener('click',   () => openDetail(card.dataset.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openDetail(card.dataset.id); });
  });
}

// ---------------------------------------------------------------------------
// Contadores resumen
// ---------------------------------------------------------------------------
function updateCounters() {
  const pending  = _allReports.filter(r => r.estado === 'pendiente').length;
  const reviewed = _allReports.filter(r => r.estado === 'revisado').length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const today    = _allReports.filter(r => r.fecha === todayStr).length;

  setText('cntTotal',    _allReports.length);
  setText('cntPending',  pending);
  setText('cntReviewed', reviewed);
  setText('cntToday',    today);
}

// ---------------------------------------------------------------------------
// Modal detalle
// ---------------------------------------------------------------------------
export function openDetail(reportId) {
  const r = _allReports.find(x => x.id === reportId);
  if (!r) return;
  _currentId = reportId;

  const modal = document.getElementById('detailModal');

  setHtml('detailPhoto',    `<img src="${escHtml(r.foto_url)}" alt="Foto práctica">`);
  setText('detailName',     r.student_name);
  setText('detailStudentId',r.student_id);
  setText('detailTipo',     r.tipo_preparacion);
  setText('detailAsig',     r.asignatura || '—');
  setText('detailFecha',    `${r.fecha} · ${new Date(r.timestamp).toLocaleTimeString('es-SV')}`);
  setText('detailGps',      `${r.gps_lat?.toFixed(5)}, ${r.gps_lng?.toFixed(5)} (${r.gps_distancia} m del lab)`);
  setText('detailEstado',   r.estado === 'revisado' ? '✅ Revisado' : '🔴 Pendiente');

  const feedbackEl = document.getElementById('detailFeedback');
  if (feedbackEl) feedbackEl.value = r.feedback || '';

  const btnReviewed = document.getElementById('btnMarkReviewed');
  if (btnReviewed) {
    btnReviewed.disabled = r.estado === 'revisado';
    btnReviewed.textContent = r.estado === 'revisado' ? '✅ Ya revisado' : '✅ Marcar como Revisado';
  }

  const downloadBtn = document.getElementById('btnDownload');
  if (downloadBtn) {
    downloadBtn.onclick = () => downloadPhoto(r.foto_url, r.student_id, r.fecha);
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

export function closeDetail() {
  const modal = document.getElementById('detailModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  _currentId = null;
}

// ---------------------------------------------------------------------------
// Guardar feedback
// ---------------------------------------------------------------------------
export async function saveFeedback() {
  if (!_currentId) return;
  const feedbackEl = document.getElementById('detailFeedback');
  const text = feedbackEl?.value?.trim() ?? '';

  const btn = document.getElementById('btnSaveFeedback');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    await update(ref(rtdb, `lab_reports/${_currentId}`), { feedback: text });
    if (btn) { btn.textContent = '✔ Guardado'; setTimeout(() => { btn.disabled = false; btn.textContent = '💾 Guardar Feedback'; }, 2000); }
  } catch (e) {
    alert(`Error al guardar: ${e.message}`);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Feedback'; }
  }
}

// ---------------------------------------------------------------------------
// Marcar como revisado
// ---------------------------------------------------------------------------
export async function markReviewed() {
  if (!_currentId) return;
  const feedbackEl = document.getElementById('detailFeedback');
  const feedback = feedbackEl?.value?.trim() ?? '';

  const btn = document.getElementById('btnMarkReviewed');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    await update(ref(rtdb, `lab_reports/${_currentId}`), {
      estado:      'revisado',
      feedback,
      reviewed_at: Date.now()
    });
    setText('detailEstado', '✅ Revisado');
    if (btn) btn.textContent = '✅ Ya revisado';
  } catch (e) {
    alert(`Error: ${e.message}`);
    if (btn) { btn.disabled = false; btn.textContent = '✅ Marcar como Revisado'; }
  }
}

// ---------------------------------------------------------------------------
// Descargar foto
// ---------------------------------------------------------------------------
function downloadPhoto(url, studentId, fecha) {
  const a  = document.createElement('a');
  a.href   = url;
  a.target = '_blank';
  a.rel    = 'noopener';
  a.download = `practica-${studentId}-${fecha}.jpg`;
  a.click();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}
function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
