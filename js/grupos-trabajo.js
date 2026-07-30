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
//        revealTimer, historial: [], parejasFijas: [[idA, idB], ...] }

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
    parejasFijas: (materia.parejasFijas ?? []).filter(p => Array.isArray(p) && p.length === 2),
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

/**
 * Reubica (sin alterar el tamaño de ningún grupo) para que cada pareja fija
 * termine en el mismo grupo, intercambiando con un miembro al azar del grupo
 * destino. El resto del sorteo sigue siendo aleatorio.
 */
function aplicarParejasFijas(grupos, parejas) {
  const ubicar = id => {
    for (let gi = 0; gi < grupos.length; gi++) {
      const i = grupos[gi].indexOf(id);
      if (i !== -1) return { gi, i };
    }
    return null;
  };

  for (const [idA, idB] of parejas) {
    const posA = ubicar(idA);
    const posB = ubicar(idB);
    if (!posA || !posB || posA.gi === posB.gi) continue; // no incluidos o ya juntos

    const candidatos = grupos[posA.gi].filter(id => id !== idA);
    if (candidatos.length === 0) {
      // grupo de A sólo tiene a A: mover B directamente
      grupos[posB.gi].splice(posB.i, 1);
      grupos[posA.gi].push(idB);
      continue;
    }
    const victima = candidatos[Math.floor(Math.random() * candidatos.length)];
    const posVictima = ubicar(victima);
    grupos[posVictima.gi][posVictima.i] = idB;
    grupos[posB.gi][posB.i] = victima;
  }
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
  aplicarParejasFijas(_g.grupos, _g.parejasFijas);
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
      <div class="grp-results-actions">
        <button class="btn btn--secondary btn--sm" id="grpExportExcel">📊 Excel</button>
        <button class="btn btn--secondary btn--sm" id="grpExportPDF">📄 PDF</button>
        <button class="btn btn--secondary btn--sm" id="grpRepetir">🔀 Repetir sorteo</button>
      </div>
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
  document.getElementById('grpExportExcel')?.addEventListener('click', e => exportExcel(e.currentTarget));
  document.getElementById('grpExportPDF')?.addEventListener('click', e => exportPDF(e.currentTarget));
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
// Exportación Excel / PDF
// ---------------------------------------------------------------------------
async function exportExcel(btn) {
  if (!_g?.grupos) return;
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Generando…';

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');

    const byId = {};
    _g.alumnos.forEach(a => { byId[a.id] = a; });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'AcadVet USAM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Grupos', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
    });
    ws.columns = [{ width: 34 }, { width: 20 }];

    const C = {
      dark: 'FF2D2A6E', primary: 'FF6C63FF', sectionBg: 'FFECEEFF',
      even: 'FFF0F2FF', odd: 'FFFFFFFF', white: 'FFFFFFFF', text: 'FF1A1A2E',
      secondary: 'FF4A4A6A',
    };
    const fgFill = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
    const fnt    = (bold, size, argb = C.text) => ({ bold, size, color: { argb } });
    const aln    = (h, indent = 0) => ({ vertical: 'middle', horizontal: h, indent });

    const mergedCell = (rowNum, text, bgArgb, fontCfg) => {
      ws.getRow(rowNum).height = 20;
      ws.mergeCells(rowNum, 1, rowNum, 2);
      const c = ws.getCell(rowNum, 1);
      c.value = text; c.font = fontCfg; c.fill = fgFill(bgArgb); c.alignment = aln('left', 1);
    };
    const infoRow = (rowNum, label, value) => {
      ws.getRow(rowNum).height = 16;
      const ca = ws.getCell(rowNum, 1);
      ca.value = label + ':'; ca.font = fnt(true, 9, C.secondary); ca.alignment = aln('left', 1);
      const cb = ws.getCell(rowNum, 2);
      cb.value = value; cb.font = fnt(false, 9, C.text); cb.alignment = aln('left');
    };
    const blankRow = n => { ws.getRow(n).height = 8; };

    const fechaHoy = new Date().toLocaleDateString('es-SV', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    let r = 1;
    mergedCell(r++, 'UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', C.dark, fnt(true, 11, C.white));
    mergedCell(r++, 'Facultad de Medicina Veterinaria',          C.dark, fnt(false, 10, C.white));
    mergedCell(r++, 'GRUPOS DE TRABAJO',                         C.dark, fnt(true, 11, C.white));
    blankRow(r++);

    infoRow(r++, 'Materia',            _g.materia.nombre ?? '—');
    infoRow(r++, 'Ciclo',              (_g.materia.ciclo ?? '—') + (_g.materia.seccion ? ` · Sección ${_g.materia.seccion}` : ''));
    infoRow(r++, 'Fecha',              fechaHoy);
    infoRow(r++, 'Alumnos por grupo',  String(_g.tamano));
    blankRow(r++);

    _g.grupos.forEach((miembros, i) => {
      mergedCell(r++, `GRUPO ${i + 1}  (${miembros.length} alumno${miembros.length !== 1 ? 's' : ''})`, C.sectionBg, fnt(true, 10, C.primary));

      ws.getRow(r).height = 17;
      ['Nombre', 'Carné'].forEach((h, ci) => {
        const c = ws.getCell(r, ci + 1);
        c.value = h; c.font = fnt(true, 9, C.white); c.fill = fgFill(C.primary);
        c.alignment = aln(ci === 0 ? 'left' : 'center', ci === 0 ? 1 : 0);
      });
      r++;

      miembros.forEach((id, idx) => {
        const a  = byId[id];
        const bg = idx % 2 === 0 ? C.even : C.odd;
        ws.getRow(r).height = 15;
        [a?.nombre ?? '—', a?.carnet ?? '—'].forEach((v, ci) => {
          const c = ws.getCell(r, ci + 1);
          c.value = v; c.font = fnt(false, 9, C.text); c.fill = fgFill(bg);
          c.alignment = aln(ci === 0 ? 'left' : 'center', ci === 0 ? 1 : 0);
        });
        r++;
      });
      blankRow(r++);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href     = url;
    anchor.download = `Grupos_${safeName(_g.materia.nombre)}_${safeName(_g.materia.ciclo ?? '')}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Excel de grupos generado');

  } catch (err) {
    console.error('[AcadVet] Error generando Excel de grupos:', err);
    showToast('Error al generar Excel. Verificá tu conexión.', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
}

async function exportPDF(btn) {
  if (!_g?.grupos) return;
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Generando…';

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

    const byId = {};
    _g.alumnos.forEach(a => { byId[a.id] = a; });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ML = 15;
    const MR = 15;
    const CW = pw - ML - MR;

    // ── Header bar ────────────────────────────────────────────────────────
    doc.setFillColor(45, 42, 110);
    doc.rect(0, 0, pw, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', ML, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Facultad de Medicina Veterinaria', ML, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('GRUPOS DE TRABAJO', ML, 25);

    const fechaHoy = new Date().toLocaleDateString('es-SV', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(fechaHoy, pw - MR, 25, { align: 'right' });

    // ── Datos generales ──────────────────────────────────────────────────
    let y = 42;
    doc.setTextColor(26, 26, 46);
    const infoRows = [
      ['Materia',            _g.materia.nombre ?? '—'],
      ['Ciclo',              (_g.materia.ciclo ?? '—') + (_g.materia.seccion ? ` · Sección ${_g.materia.seccion}` : '')],
      ['Alumnos por grupo',  String(_g.tamano)],
      ['Total de grupos',    String(_g.grupos.length)],
    ];
    for (const [lbl, val] of infoRows) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(lbl + ':', ML, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(val), ML + 38, y);
      y += 6;
    }
    y += 3;

    // ── Grupos ────────────────────────────────────────────────────────────
    _g.grupos.forEach((miembros, i) => {
      y = pdfCheckPage(doc, y, 20, ph);
      y = pdfSection(doc, `GRUPO ${i + 1}  ·  ${miembros.length} alumno${miembros.length !== 1 ? 's' : ''}`, ML, y, CW);

      doc.autoTable({
        startY: y,
        margin: { left: ML, right: MR },
        head: [['Nombre', 'Carné']],
        body: miembros.map(id => [byId[id]?.nombre ?? '—', byId[id]?.carnet ?? '—']),
        styles:             { fontSize: 8, cellPadding: 2 },
        headStyles:         { fillColor: [108, 99, 255], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 242, 255] },
        columnStyles:       { 1: { cellWidth: 40, halign: 'center' } },
      });
      y = doc.lastAutoTable.finalY + 8;
    });

    // ── Pie de página en todas las páginas ───────────────────────────────
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(136, 136, 170);
      doc.text(`AcadVet USAM  ·  Página ${p} de ${total}`, pw / 2, ph - 8, { align: 'center' });
    }

    doc.save(`Grupos_${safeName(_g.materia.nombre)}_${safeName(_g.materia.ciclo ?? '')}.pdf`);
    showToast('PDF de grupos generado');

  } catch (err) {
    console.error('[AcadVet] Error generando PDF de grupos:', err);
    showToast('Error al generar el PDF. Verificá tu conexión.', 'error');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
}

function pdfSection(doc, title, x, y, w) {
  doc.setFillColor(236, 238, 255);
  doc.rect(x, y - 5, w, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(108, 99, 255);
  doc.text(title, x + 2, y);
  doc.setTextColor(26, 26, 46);
  return y + 9;
}

function pdfCheckPage(doc, y, needed, ph) {
  if (y + needed > ph - 15) {
    doc.addPage();
    return 20;
  }
  return y;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
    document.head.appendChild(s);
  });
}

function safeName(s) {
  return (s ?? '').replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '').trim().replace(/\s+/g, '_');
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
