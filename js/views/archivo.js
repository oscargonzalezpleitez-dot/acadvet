// =============================================================================
// AcadVet USAM — Vista: Archivo de sesiones QR
// Lista historial de sesiones con lista de asistentes y exportación.
// =============================================================================

import { getQRSessions, getQRSessionAsistentes, deleteQRSession } from '../db.js';
import { showToast, openModal, closeModal } from '../ui.js';

let _container  = null;
let _sessions   = [];
let _filtered   = [];
let _filterMat  = '';
let _openId     = null;
let _cache      = {};   // sessionId → asistentes[]

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------
export async function renderArchivo(container) {
  _container = container;
  document.getElementById('topbarTitle').textContent = 'Archivo';
  container.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando sesiones…</p></div>`;
  try {
    _sessions  = await getQRSessions();
    _filterMat = '';
    _openId    = null;
    _cache     = {};
    _filtered  = _sessions;
    paint();
  } catch (err) {
    console.error('[AcadVet] Error cargando archivo:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3 class="empty-state__title">Error al cargar</h3>
        <p class="empty-state__text">Verificá tu conexión e intentá de nuevo.</p>
        <button class="btn btn--primary" id="btnRetryArch">Reintentar</button>
      </div>`;
    document.getElementById('btnRetryArch')?.addEventListener('click', () => renderArchivo(container));
  }
}

// ---------------------------------------------------------------------------
// Render principal
// ---------------------------------------------------------------------------
function paint() {
  const materiasMap = new Map();
  _sessions.forEach(s => {
    if (s.materiaId && s.materiaNombre) materiasMap.set(s.materiaId, s.materiaNombre);
  });

  _container.innerHTML = `
    <div class="alumnos-view">

      <div class="view-header">
        <div>
          <h2 class="view-title">Archivo de Sesiones QR</h2>
          <p class="view-subtitle text-muted text-sm">
            ${_sessions.length} sesión${_sessions.length !== 1 ? 'es' : ''} registrada${_sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div style="margin-bottom:var(--space-5)">
        <select id="filterMateria" class="form-input" style="max-width:320px">
          <option value="">Todas las materias</option>
          ${[...materiasMap.entries()].map(([id, nombre]) =>
            `<option value="${esc(id)}"${_filterMat === id ? ' selected' : ''}>${esc(nombre)}</option>`
          ).join('')}
        </select>
      </div>

      <div id="archList">${renderList()}</div>
    </div>
  `;

  document.getElementById('filterMateria')?.addEventListener('change', e => {
    _filterMat = e.target.value;
    _openId    = null;
    _filtered  = _filterMat ? _sessions.filter(s => s.materiaId === _filterMat) : _sessions;
    document.getElementById('archList').innerHTML = renderList();
    wireList();
  });

  wireList();
}

// ---------------------------------------------------------------------------
// Lista de sesiones
// ---------------------------------------------------------------------------
function renderList() {
  if (_filtered.length === 0) return `
    <div class="empty-state" style="padding:var(--space-12)">
      <div class="empty-state__icon">📂</div>
      <h3 class="empty-state__title">Sin sesiones</h3>
      <p class="empty-state__text">No hay sesiones QR registradas${_filterMat ? ' para esta materia' : ''}.</p>
    </div>`;
  return `<div class="arch-list">${_filtered.map(cardHtml).join('')}</div>`;
}

function cardHtml(s) {
  const isOpen = _openId === s.id;
  return `
    <div class="arch-card${isOpen ? ' arch-card--open' : ''}" data-sid="${esc(s.id)}">
      <div class="arch-card-hdr-wrap">
        <button class="arch-card-hdr" aria-expanded="${isOpen}" data-sid="${esc(s.id)}">
          <span class="arch-status-dot" style="background:${s.active ? 'var(--color-success)' : 'var(--color-text-muted)'}"></span>
          <div class="arch-card-main">
            <div class="arch-card-title">${esc(s.materiaNombre || '—')}</div>
            <div class="arch-card-sub text-muted text-sm">
              ${s.ciclo ? esc(s.ciclo) + ' · ' : ''}${fmtFecha(s.fecha, s.startedAt)} · ${fmtHora(s.startedAt)}
              · <strong>${s.asistentesCount}</strong> asistente${s.asistentesCount !== 1 ? 's' : ''}
            </div>
          </div>
          <div class="arch-card-right">
            ${s.active
              ? '<span class="badge badge--success" style="font-size:.65rem">Activa</span>'
              : '<span class="badge badge--outline" style="font-size:.65rem">Finalizada</span>'}
            <svg class="arch-chevron" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </button>
        <button class="arch-delete-btn${s.active ? ' arch-delete-btn--disabled' : ''}"
          data-del="${esc(s.id)}"
          ${s.active ? 'disabled title="No se puede borrar una sesión activa"' : 'title="Eliminar sesión"'}
          aria-label="Eliminar sesión">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
      ${isOpen ? `<div class="arch-card-body" id="archBody-${esc(s.id)}">
        <div class="loading-state" style="padding:var(--space-6)">
          <div class="loading-spinner" style="width:28px;height:28px;border-width:3px"></div>
        </div>
      </div>` : ''}
    </div>`;
}

function wireList() {
  _container.querySelectorAll('.arch-card-hdr[data-sid]').forEach(btn => {
    btn.addEventListener('click', () => toggleSession(btn.dataset.sid));
  });
  _container.querySelectorAll('.arch-delete-btn[data-del]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.del));
  });
}

function confirmDelete(id) {
  const session = _sessions.find(s => s.id === id);
  if (!session) return;

  const fechaDisp = fmtFecha(session.fecha, session.startedAt);
  openModal({
    title: 'Eliminar sesión',
    size: 'sm',
    body: `
      <p class="text-secondary">
        ¿Eliminar la sesión de <strong>${esc(session.materiaNombre || '—')}</strong>
        del <strong>${fechaDisp}</strong>?
      </p>
      <p class="text-muted text-sm" style="margin-top:var(--space-2)">
        Se borrarán permanentemente los <strong>${session.asistentesCount}</strong>
        registro${session.asistentesCount !== 1 ? 's' : ''} de asistencia.
        Esta acción no se puede deshacer.
      </p>`,
    confirmLabel:   'Eliminar',
    confirmVariant: 'danger',
    async onConfirm() {
      try {
        await deleteQRSession(id);
        closeModal();
        _sessions = _sessions.filter(s => s.id !== id);
        _filtered = _filterMat ? _sessions.filter(s => s.materiaId === _filterMat) : _sessions;
        delete _cache[id];
        if (_openId === id) _openId = null;
        paint();
        showToast('Sesión eliminada');
      } catch (err) {
        console.error('[AcadVet] Error eliminando sesión:', err);
        showToast('Error al eliminar la sesión', 'error');
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Expandir / colapsar sesión
// ---------------------------------------------------------------------------
async function toggleSession(id) {
  if (_openId === id) {
    _openId = null;
    document.getElementById('archList').innerHTML = renderList();
    wireList();
    return;
  }
  _openId = id;
  document.getElementById('archList').innerHTML = renderList();
  wireList();

  const session = _sessions.find(s => s.id === id);
  if (!session) return;

  try {
    const asist = _cache[id] ?? await getQRSessionAsistentes(id);
    _cache[id] = asist;
    const body = document.getElementById(`archBody-${id}`);
    if (!body) return;
    body.innerHTML = renderBody(session, asist);
    wireBody(session, asist);
  } catch (err) {
    console.error('[AcadVet] Error cargando asistentes:', err);
    const body = document.getElementById(`archBody-${id}`);
    if (body) body.innerHTML = `<p class="text-sm text-muted" style="padding:var(--space-4)">Error al cargar la lista.</p>`;
  }
}

// ---------------------------------------------------------------------------
// Cuerpo expandido: tabla + botones de exportación
// ---------------------------------------------------------------------------
function renderBody(session, asist) {
  if (asist.length === 0) return `
    <div class="arch-body-inner">
      <div class="empty-state" style="padding:var(--space-8)">
        <div class="empty-state__icon">📭</div>
        <h3 class="empty-state__title" style="font-size:1rem">Sin registros</h3>
        <p class="empty-state__text">Ningún alumno se registró en esta sesión.</p>
      </div>
    </div>`;

  const hasPhotos = asist.some(a => !!a.selfie);

  const rows = asist.map((a, i) => {
    const isTardio = a.estado === 'tardio';
    const thumb = a.selfie
      ? `<img src="data:image/jpeg;base64,${a.selfie}" class="arch-selfie-thumb" alt="Foto de ${esc(a.nombre)}" loading="lazy">`
      : `<div class="arch-selfie-placeholder">—</div>`;
    return `
      <tr>
        <td style="text-align:center;color:var(--color-text-muted);font-size:var(--text-sm)">${i + 1}</td>
        ${hasPhotos ? `<td style="padding:4px 8px">${thumb}</td>` : ''}
        <td><span style="font-weight:600">${esc(a.nombre || '—')}</span></td>
        <td style="font-size:var(--text-sm)">${esc(a.carnet || '—')}</td>
        <td style="font-size:var(--text-sm);color:var(--color-text-muted)">${fmtHora(a.ts)}</td>
        <td><span class="badge ${isTardio ? 'badge--warning' : 'badge--success'}" style="font-size:.65rem">${isTardio ? '⏱ Tardío' : '✓ Presente'}</span></td>
        <td style="font-size:var(--text-sm);color:var(--color-text-muted)">${esc(a.email || '—')}</td>
      </tr>`;
  }).join('');

  return `
    <div class="arch-body-inner">
      <div class="arch-export-bar">
        <span class="text-sm text-muted">
          ${asist.length} asistente${asist.length !== 1 ? 's' : ''} · Descargar:
        </span>
        <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
          ${sessionStorage.getItem('acadvet_auth') === 'eps' ? `
            <span style="font-size:.78rem;color:var(--color-text-muted)">🔒 Descargas no disponibles en sesión EPS</span>
          ` : `
          <button class="btn btn--ghost btn--sm arch-btn-pdf-foto"
            ${!hasPhotos ? 'disabled title="Esta sesión no tiene fotos registradas"' : ''}>
            📄 PDF con foto
          </button>
          <button class="btn btn--ghost btn--sm arch-btn-pdf">📋 PDF sin foto</button>
          <button class="btn btn--ghost btn--sm arch-btn-excel" style="color:var(--color-success)">
            📊 Excel
          </button>
          `}
        </div>
      </div>

      <div style="overflow-x:auto">
        <table class="arch-table">
          <thead>
            <tr>
              <th>#</th>
              ${hasPhotos ? '<th>Foto</th>' : ''}
              <th>Nombre</th>
              <th>Carné</th>
              <th>Hora</th>
              <th>Estado</th>
              <th>Correo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function wireBody(session, asist) {
  const body = document.getElementById(`archBody-${session.id}`);
  if (!body) return;
  body.querySelector('.arch-btn-pdf-foto')?.addEventListener('click', () => exportPDFConFoto(session, asist));
  body.querySelector('.arch-btn-pdf')?.addEventListener('click',      () => exportPDFSinFoto(session, asist));
  body.querySelector('.arch-btn-excel')?.addEventListener('click',    () => exportExcel(session, asist));
}

// ---------------------------------------------------------------------------
// Exportar: PDF sin foto
// ---------------------------------------------------------------------------
async function exportPDFSinFoto(session, asist) {
  try {
    showToast('Generando PDF…', 'info');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

    drawPDFHeader(doc, session, 'Lista de Asistencia');

    doc.autoTable({
      startY: 47,
      head: [['#', 'Nombre completo', 'Carné', 'Hora', 'Estado', 'Correo']],
      body: asist.map((a, i) => [
        i + 1,
        a.nombre || '—',
        a.carnet  || '—',
        fmtHora(a.ts),
        a.estado === 'tardio' ? 'Tardío' : 'Presente',
        a.email   || '—',
      ]),
      styles:     { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [108, 99, 255], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 255] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 26 },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 20, halign: 'center' },
      },
    });

    doc.save(`asistencia-${slugify(session.materiaNombre)}-${session.fecha || 'sesion'}.pdf`);
    showToast('PDF descargado');
  } catch (err) {
    console.error(err);
    showToast('Error al generar el PDF', 'error');
  }
}

// ---------------------------------------------------------------------------
// Exportar: PDF con foto
// ---------------------------------------------------------------------------
async function exportPDFConFoto(session, asist) {
  try {
    showToast('Generando PDF con fotos…', 'info');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const PW   = 215.9;
    const ML   = 14, MR = 14;
    const ROW  = 28;
    const PH   = 20, PW_ = 20;   // photo dimensions
    const IX   = ML + PW_ + 5;   // info x

    drawPDFHeader(doc, session, 'Lista de Asistencia con Foto');
    let y = 47;

    for (let i = 0; i < asist.length; i++) {
      const a = asist[i];
      if (y + ROW > 268) { doc.addPage(); y = 16; }

      // Foto o placeholder
      if (a.selfie) {
        try {
          doc.addImage('data:image/jpeg;base64,' + a.selfie, 'JPEG', ML, y, PW_, PH, undefined, 'FAST');
        } catch { drawPhotoPlaceholder(doc, ML, y, PW_, PH); }
      } else {
        drawPhotoPlaceholder(doc, ML, y, PW_, PH);
      }

      // Badge de número
      doc.setFillColor(108, 99, 255);
      doc.roundedRect(ML, y, 7, 5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(String(i + 1), ML + 3.5, y + 3.7, { align: 'center' });

      // Nombre
      doc.setTextColor(25, 25, 45);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(a.nombre || '—', IX, y + 6.5);

      // Carné
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 115);
      doc.text(`Carné: ${a.carnet || '—'}`, IX, y + 12);

      // Hora y estado
      const estado = a.estado === 'tardio' ? 'Tardío' : 'Presente';
      doc.text(`${fmtHora(a.ts)}  ·  ${estado}`, IX, y + 17.5);

      // Correo (si existe)
      if (a.email) {
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 170);
        doc.text(a.email, IX, y + 22.5);
      }

      // Línea separadora
      doc.setDrawColor(218, 218, 238);
      doc.setLineWidth(0.2);
      doc.line(ML, y + ROW - 1, PW - MR, y + ROW - 1);
      y += ROW;
    }

    doc.save(`asistencia-foto-${slugify(session.materiaNombre)}-${session.fecha || 'sesion'}.pdf`);
    showToast('PDF con fotos descargado');
  } catch (err) {
    console.error(err);
    showToast('Error al generar el PDF', 'error');
  }
}

function drawPDFHeader(doc, session, subtitle) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(108, 99, 255);
  doc.text('AcadVet USAM', 14, 14);

  doc.setTextColor(25, 25, 45);
  doc.setFontSize(11);
  doc.text(subtitle, 14, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 130);
  doc.text(`${session.materiaNombre || ''}${session.ciclo ? '  ·  ' + session.ciclo : ''}`, 14, 28);
  doc.text(
    `Fecha: ${fmtFecha(session.fecha, session.startedAt)}   Inicio: ${fmtHora(session.startedAt)}   Total: ${session.asistentesCount} asistente${session.asistentesCount !== 1 ? 's' : ''}`,
    14, 34
  );

  doc.setDrawColor(108, 99, 255);
  doc.setLineWidth(0.5);
  doc.line(14, 38, 201, 38);
}

function drawPhotoPlaceholder(doc, x, y, w, h) {
  doc.setFillColor(235, 235, 248);
  doc.setDrawColor(200, 200, 225);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(170, 170, 195);
  doc.text('Sin foto', x + w / 2, y + h / 2 + 1.5, { align: 'center' });
}

// ---------------------------------------------------------------------------
// Exportar: Excel
// ---------------------------------------------------------------------------
async function exportExcel(session, asist) {
  try {
    showToast('Generando Excel…', 'info');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');

    const header = ['#', 'Nombre', 'Carné', 'Correo', 'Hora', 'Estado', 'Tipo de registro'];
    const dataRows = asist.map((a, i) => [
      i + 1,
      a.nombre  || '',
      a.carnet  || '',
      a.email   || '',
      fmtHora(a.ts),
      a.estado === 'tardio' ? 'Tardío' : 'Presente',
      a.checkType === 'inicio' ? 'Inicio' : a.checkType === 'fin' ? 'Fin' : 'Único',
    ]);

    const sheetData = [
      ['AcadVet USAM — Lista de Asistencia'],
      [`Materia: ${session.materiaNombre || '—'}`],
      [`Ciclo: ${session.ciclo || '—'}   Fecha: ${fmtFecha(session.fecha, session.startedAt)}   Hora inicio: ${fmtHora(session.startedAt)}`],
      [`Total asistentes: ${asist.length}`],
      [],
      header,
      ...dataRows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 5 }, { wch: 32 }, { wch: 14 }, { wch: 28 },
      { wch: 10 }, { wch: 12 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    XLSX.writeFile(wb, `asistencia-${slugify(session.materiaNombre)}-${session.fecha || 'sesion'}.xlsx`);
    showToast('Excel descargado');
  } catch (err) {
    console.error(err);
    showToast('Error al generar el Excel', 'error');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtFecha(fecha, startedAt) {
  if (fecha) {
    const [y, m, d] = fecha.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString('es-SV', { day:'2-digit', month:'long', year:'numeric' });
  }
  return startedAt
    ? new Date(startedAt).toLocaleDateString('es-SV', { day:'2-digit', month:'long', year:'numeric' })
    : '—';
}

function fmtHora(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('es-SV', { hour:'2-digit', minute:'2-digit' });
}

function slugify(str) {
  return (str || 'sesion')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar: ' + src));
    document.head.appendChild(s);
  });
}
