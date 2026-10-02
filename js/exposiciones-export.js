// =============================================================================
// AcadVet USAM — Exportación de calificaciones de Exposiciones (Excel/PDF)
// Descarga, en un solo documento, las calificaciones de TODOS los grupos de
// un sorteo de exposiciones — cada grupo queda separado dentro del mismo
// archivo (una sección por grupo en Excel, una tabla por grupo en PDF).
// =============================================================================

import { getAlumnos, getExposiciones } from './db.js';
import { CRITERIOS } from './exposicion-rubrica.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

function safeName(s) {
  return (s ?? '')
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'exposiciones';
}

function fechaLabel(fecha) {
  if (!fecha) return 'Sin fecha';
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-SV', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Reúne, para cada integrante de cada grupo del sorteo, su calificación de
// exposición ya guardada (si existe). Un alumno puede no estar calificado
// todavía — en ese caso se exporta con guiones.
// ---------------------------------------------------------------------------
async function buildData(sorteo) {
  const nombres = sorteo.alumnos ?? {};

  let carnets = {};
  try {
    const todos = await getAlumnos();
    todos.forEach(a => { carnets[a.id] = a.carnet ?? ''; });
  } catch (err) {
    console.error('[AcadVet] Error cargando carnés para exportar exposiciones:', err);
  }

  const idsUnicos = [...new Set(sorteo.grupos.flat())];
  const porAlumno = {};
  await Promise.all(idsUnicos.map(async id => {
    try {
      const expos = await getExposiciones(id, sorteo.materiaId);
      porAlumno[id] = expos.find(e => e.sorteoId === sorteo.id) ?? null;
    } catch (err) {
      console.error('[AcadVet] Error cargando exposición de', id, err);
      porAlumno[id] = null;
    }
  }));

  const grupos = sorteo.grupos.map((miembros, i) => ({
    numero: i + 1,
    integrantes: miembros.map(id => {
      const reg = porAlumno[id];
      return {
        id,
        nombre:  nombres[id] ?? '—',
        carnet:  carnets[id] ?? '—',
        tema:    reg?.tema ?? null,
        rubrica: reg?.rubrica ?? null,
        total100: reg?.total100 ?? null,
        nota:    reg?.nota ?? null,
      };
    }),
  }));

  return { grupos, fecha: fechaLabel(sorteo.fecha), materiaNombre: sorteo.materiaNombre, ciclo: sorteo.ciclo };
}

// ---------------------------------------------------------------------------
// EXCEL
// ---------------------------------------------------------------------------
export async function exportExposicionesExcel(sorteo) {
  await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
  const { grupos, fecha, materiaNombre, ciclo } = await buildData(sorteo);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'AcadVet USAM';
  wb.created = new Date();

  const nCols = 3 + CRITERIOS.length + 2; // Nombre, Carné, Tema + criterios + Total + Nota
  const ws = wb.addWorksheet('Exposiciones', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [
    { width: 28 }, { width: 14 }, { width: 26 },
    ...CRITERIOS.map(() => ({ width: 11 })),
    { width: 10 }, { width: 9 },
  ];

  const C = {
    dark: 'FF2D2A6E', primary: 'FF6C63FF', sectionBg: 'FFECEEFF',
    even: 'FFF0F2FF', odd: 'FFFFFFFF', white: 'FFFFFFFF', text: 'FF1A1A2E',
    secondary: 'FF4A4A6A',
  };
  const fgFill = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
  const fnt    = (bold, size, argb = C.text) => ({ bold, size, color: { argb } });
  const aln    = (h = 'left', wrap = false) => ({ vertical: 'middle', horizontal: h, wrapText: wrap });

  const mergedCell = (rowNum, text, bgArgb, fontCfg) => {
    ws.getRow(rowNum).height = 20;
    ws.mergeCells(rowNum, 1, rowNum, nCols);
    const c = ws.getCell(rowNum, 1);
    c.value = text; c.font = fontCfg; c.fill = fgFill(bgArgb); c.alignment = aln('left');
    for (let col = 2; col <= nCols; col++) ws.getCell(rowNum, col).fill = fgFill(bgArgb);
  };
  const infoRow = (rowNum, label, value) => {
    ws.getRow(rowNum).height = 16;
    const ca = ws.getCell(rowNum, 1);
    ca.value = label + ':'; ca.font = fnt(true, 9, C.secondary); ca.alignment = aln('left');
    const cb = ws.getCell(rowNum, 2);
    cb.value = value; cb.font = fnt(false, 9, C.text); cb.alignment = aln('left');
  };
  const blankRow = n => { ws.getRow(n).height = 8; };

  let r = 1;
  mergedCell(r++, 'UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', C.dark, fnt(true, 11, C.white));
  mergedCell(r++, 'Facultad de Medicina Veterinaria y Zootecnia', C.dark, fnt(false, 10, C.white));
  mergedCell(r++, 'CALIFICACIONES DE EXPOSICIONES', C.dark, fnt(true, 11, C.white));
  blankRow(r++);

  infoRow(r++, 'Materia', materiaNombre ?? '—');
  infoRow(r++, 'Ciclo',   ciclo || '—');
  infoRow(r++, 'Fecha',   fecha);
  blankRow(r++);

  const headerLabels = ['Nombre', 'Carné', 'Tema', ...CRITERIOS.map(c => `${c.label} (${c.max})`), 'Total /100', 'Nota /10'];

  grupos.forEach(grupo => {
    mergedCell(r++, `GRUPO ${grupo.numero}  (${grupo.integrantes.length} alumno${grupo.integrantes.length !== 1 ? 's' : ''})`, C.sectionBg, fnt(true, 10, C.primary));

    ws.getRow(r).height = 32;
    headerLabels.forEach((h, ci) => {
      const c = ws.getCell(r, ci + 1);
      c.value = h; c.font = fnt(true, 8.5, C.white); c.fill = fgFill(C.primary);
      c.alignment = aln(ci < 3 ? 'left' : 'center', true);
    });
    r++;

    grupo.integrantes.forEach((m, idx) => {
      const bg = idx % 2 === 0 ? C.even : C.odd;
      ws.getRow(r).height = 15;
      const calificado = m.rubrica != null;
      const valores = [
        m.nombre, m.carnet, m.tema ?? (calificado ? '—' : 'Sin calificar'),
        ...CRITERIOS.map(c => calificado ? (m.rubrica[c.id] ?? 0) : '—'),
        calificado ? m.total100 : '—',
        calificado ? m.nota : '—',
      ];
      valores.forEach((v, ci) => {
        const c = ws.getCell(r, ci + 1);
        c.value = v; c.font = fnt(ci >= 3 + CRITERIOS.length, 9, C.text); c.fill = fgFill(bg);
        c.alignment = aln(ci < 3 ? 'left' : 'center');
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
  anchor.download = `Exposiciones_${safeName(materiaNombre)}_${safeName(ciclo ?? '')}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
export async function exportExposicionesPDF(sorteo) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  const { grupos, fecha, materiaNombre, ciclo } = await buildData(sorteo);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ML = 12, MR = 12;
  const CW = pw - ML - MR;

  doc.setFillColor(45, 42, 110);
  doc.rect(0, 0, pw, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', ML, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Facultad de Medicina Veterinaria y Zootecnia', ML, 14.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('CALIFICACIONES DE EXPOSICIONES', ML, 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(fecha, pw - MR, 21, { align: 'right' });

  let y = 34;
  doc.setTextColor(26, 26, 46);
  const infoRows = [['Materia', materiaNombre ?? '—'], ['Ciclo', ciclo || '—']];
  for (const [lbl, val] of infoRows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(lbl + ':', ML, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(val), ML + 22, y);
    y += 5.5;
  }
  y += 3;

  const head = [['Nombre', 'Tema', ...CRITERIOS.map(c => `${c.label}\n(${c.max})`), 'Total\n/100', 'Nota\n/10']];

  grupos.forEach(grupo => {
    y = pdfCheckPage(doc, y, 22, ph);
    y = pdfSection(doc, `GRUPO ${grupo.numero}  ·  ${grupo.integrantes.length} alumno${grupo.integrantes.length !== 1 ? 's' : ''}`, ML, y, CW);

    const body = grupo.integrantes.map(m => {
      const calificado = m.rubrica != null;
      return [
        m.nombre,
        m.tema ?? (calificado ? '—' : 'Sin calificar'),
        ...CRITERIOS.map(c => calificado ? String(m.rubrica[c.id] ?? 0) : '—'),
        calificado ? String(m.total100) : '—',
        calificado ? String(m.nota) : '—',
      ];
    });

    doc.autoTable({
      startY: y,
      margin: { left: ML, right: MR },
      head,
      body,
      styles:             { fontSize: 6.5, cellPadding: 1.2, valign: 'middle', halign: 'center' },
      headStyles:         { fillColor: [108, 99, 255], textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
      alternateRowStyles: { fillColor: [240, 242, 255] },
      columnStyles: {
        0: { cellWidth: 34, halign: 'left' },
        1: { cellWidth: 30, halign: 'left' },
        [2 + CRITERIOS.length]:     { fontStyle: 'bold' },
        [2 + CRITERIOS.length + 1]: { fontStyle: 'bold' },
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  });

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(136, 136, 170);
    doc.text(`AcadVet USAM  ·  Página ${p} de ${total}`, pw / 2, ph - 7, { align: 'center' });
  }

  doc.save(`Exposiciones_${safeName(materiaNombre)}_${safeName(ciclo ?? '')}.pdf`);
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
  if (y + needed > ph - 14) {
    doc.addPage();
    return 20;
  }
  return y;
}
