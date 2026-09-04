// =============================================================================
// AcadVet USAM — Generación de Word/PDF para Reportes de Laboratorio
//
// Módulo compartido entre el panel docente (lab-report-templates.js) y el
// portal del alumno (lab-report.html): genera tanto la plantilla en blanco
// (para imprimir y llenar a mano) como el reporte ya lleno por el alumno.
//
// Paleta teal/institucional (no la violeta de la app) porque este documento
// se imprime/entrega como el reporte oficial del laboratorio — replica el
// membrete real que usa el docente (UNIVERSIDAD SALVADOREÑA ALBERTO
// MASFERRER · Facultad de Medicina Veterinaria y Zootecnia).
// =============================================================================

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

async function loadDocx() {
  if (!window.docx) await loadScript('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js');
  return window.docx;
}

async function loadJsPDF() {
  if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  return window.jspdf;
}

function safeFilename(s) {
  return (s ?? 'reporte')
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'reporte';
}

// Cuántas líneas en blanco dibujar por sección de texto en la plantilla vacía
const TIPO_LINEAS = { corta: 1, larga: 6 };

function fechaLarga(ts) {
  return new Date(ts || Date.now()).toLocaleDateString('es-SV', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// -----------------------------------------------------------------------------
// WORD
// -----------------------------------------------------------------------------
async function buildWord({ nombre, desc, laboratorio, alumno, items, fecha, filenameBase }) {
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType,
    Table, TableRow, TableCell, WidthType,
  } = await loadDocx();

  const fechaStr = fechaLarga(fecha);
  const shade    = fill => ({ type: ShadingType.CLEAR, color: 'auto', fill });
  const blank    = () => new Paragraph({ children: [new TextRun({ text: '' })] });

  const mkSection = title => new Paragraph({
    spacing: { before: 320, after: 60 },
    shading: shade('E6F4F4'),
    children: [new TextRun({ text: title, bold: true, color: '0F5C5C', size: 21 })],
  });

  const mkInstrucciones = texto => new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: texto, italics: true, color: '4A4A6A', size: 17 })],
  });

  const blankLine = () => new Paragraph({
    spacing: { after: 220 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8B8D0' } },
    children: [new TextRun({ text: ' ', size: 20 })],
  });

  // Fila de datos del alumno: si no hay valor, dibuja una línea para llenar a mano
  const infoLine = (label, value) => new Paragraph({
    spacing: { after: 140 },
    border: value == null
      ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8B8D0' } }
      : undefined,
    children: [
      new TextRun({ text: label + ': ', bold: true, size: 20 }),
      new TextRun({ text: value ?? ' ', size: 20 }),
    ],
  });

  const cellText = (text, opts = {}) => new TableCell({
    shading: opts.header ? shade('0F5C5C') : (opts.shade ? shade(opts.shade) : undefined),
    children: [new Paragraph({
      children: [new TextRun({
        text: String(text ?? ' '),
        bold: !!opts.header || !!opts.rowLabel,
        color: opts.header ? 'FFFFFF' : '1A1A2E',
        size: 18,
      })],
    })],
  });

  // Tabla fija: colLabel = título de la columna de etiquetas de fila,
  // columnas = columnas de datos, filas = etiquetas de fila,
  // valores[fi][ci] = contenido de esa celda (null en la plantilla en blanco)
  const mkTabla = (colLabel, columnas, filas, valores) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [cellText(colLabel, { header: true }), ...columnas.map(c => cellText(c, { header: true }))],
      }),
      ...filas.map((fila, fi) => new TableRow({
        children: [
          cellText(fila, { rowLabel: true, shade: fi % 2 === 0 ? 'F0F2FF' : 'FFFFFF' }),
          ...columnas.map((_, ci) => cellText(valores?.[fi]?.[ci], { shade: fi % 2 === 0 ? 'F0F2FF' : 'FFFFFF' })),
        ],
      })),
    ],
  });

  const ch = [];

  for (const [text, size, bold] of [
    ['UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', 20, true],
    ['Facultad de Medicina Veterinaria y Zootecnia', 18, false],
    ...(laboratorio ? [[laboratorio, 16, false]] : []),
  ]) {
    ch.push(new Paragraph({
      spacing: { after: 40 },
      shading: shade('0F5C5C'),
      children: [new TextRun({ text, bold, italics: !bold, color: 'FFFFFF', size })],
    }));
  }

  ch.push(blank());
  ch.push(new Paragraph({
    spacing: { after: 40 },
    shading: shade('E6F4F4'),
    children: [new TextRun({ text: 'REPORTE DE LABORATORIO:', bold: true, color: '0F5C5C', size: 20 })],
  }));
  ch.push(new Paragraph({
    spacing: { after: 160 },
    shading: shade('E6F4F4'),
    children: [new TextRun({ text: String(nombre || 'Reporte de laboratorio').toUpperCase(), bold: true, color: '0F5C5C', size: 26 })],
  }));
  if (desc) {
    ch.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: desc, italics: true, size: 18, color: '4A4A6A' })],
    }));
  }

  ch.push(infoLine('Estudiante', alumno?.nombre ?? null));
  ch.push(infoLine('Carné',      alumno?.carnet ?? null));
  ch.push(infoLine('Correo',     alumno?.email  ?? null));
  if (alumno?.mesa) ch.push(infoLine('Mesa', alumno.mesa));
  ch.push(infoLine('Fecha', alumno ? fechaStr : null));
  ch.push(blank());

  for (const item of items) {
    ch.push(mkSection(item.titulo || 'Sección'));
    if (item.instrucciones) ch.push(mkInstrucciones(item.instrucciones));

    if (item.tipo === 'tabla') {
      ch.push(mkTabla(item.colLabel, item.columnas || [], item.filas || [], item.valores));
      ch.push(blank());
    } else if (item.texto != null) {
      const lineas = String(item.texto).split('\n');
      for (const linea of lineas) {
        ch.push(new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: linea || ' ', size: 20, color: '1A1A2E' })],
        }));
      }
    } else {
      const n = TIPO_LINEAS[item.tipo] ?? 3;
      for (let i = 0; i < n; i++) ch.push(blankLine());
    }
  }

  ch.push(blank());
  ch.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `AcadVet USAM  ·  Generado el ${fechaStr}`, size: 16, color: '8888AA' })],
  }));

  const wordDoc = new Document({
    creator: 'AcadVet USAM',
    title: nombre || 'Reporte de laboratorio',
    sections: [{ properties: {}, children: ch }],
  });

  const blob   = await Packer.toBlob(wordDoc);
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = `${safeFilename(filenameBase)}.docx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// PDF
// -----------------------------------------------------------------------------
async function buildPDF({ nombre, desc, laboratorio, alumno, items, fecha, filenameBase }) {
  const { jsPDF } = await loadJsPDF();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PW = 210, PH = 297, MARGIN = 18;
  const maxW = PW - MARGIN * 2;
  const fechaStr = fechaLarga(fecha);

  function checkPage(y, needed) {
    if (y + needed > PH - 16) { doc.addPage(); return 20; }
    return y;
  }

  // Encabezado institucional
  const headerH = laboratorio ? 30 : 24;
  doc.setFillColor(15, 92, 92);
  doc.rect(0, 0, PW, headerH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', PW / 2, 10, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Facultad de Medicina Veterinaria y Zootecnia', PW / 2, 16, { align: 'center' });
  if (laboratorio) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(laboratorio, PW / 2, 22, { align: 'center' });
  }

  let y = headerH + 10;

  // Caja de título
  doc.setFillColor(230, 244, 244);
  const titleLines = [`REPORTE DE LABORATORIO:`, String(nombre || 'Reporte de laboratorio').toUpperCase()];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const wrapped = titleLines.flatMap(l => doc.splitTextToSize(l, maxW - 8));
  const boxH = wrapped.length * 6 + 8;
  doc.rect(MARGIN, y - 5, maxW, boxH, 'F');
  doc.setTextColor(15, 92, 92);
  wrapped.forEach((l, i) => doc.text(l, MARGIN + 4, y + i * 6));
  y += boxH + 4;

  if (desc) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(74, 74, 106);
    const descLines = doc.splitTextToSize(desc, maxW);
    doc.text(descLines, MARGIN, y);
    y += descLines.length * 4.5 + 3;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 46);

  const infoRows = [
    ['Estudiante', alumno?.nombre],
    ['Carné',      alumno?.carnet],
    ['Correo',     alumno?.email],
    ...(alumno?.mesa ? [['Mesa', alumno.mesa]] : []),
    ['Fecha',      alumno ? fechaStr : null],
  ];
  for (const [label, value] of infoRows) {
    y = checkPage(y, 8);
    doc.setFont('helvetica', 'bold');
    doc.text(label + ':', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    if (value) {
      doc.text(String(value), MARGIN + 26, y);
    } else {
      doc.setDrawColor(184, 184, 208);
      doc.line(MARGIN + 26, y + 1, MARGIN + maxW, y + 1);
    }
    y += 7;
  }
  y += 4;

  function drawTablaItem(item) {
    const colLabel = item.colLabel || '';
    const columnas = item.columnas || [];
    const filas    = item.filas || [];
    const nCols    = columnas.length + 1;
    const rowLabelW = Math.max(38, maxW * 0.3);
    const dataW     = (maxW - rowLabelW) / columnas.length;
    const rowH      = 9;

    y = checkPage(y, rowH * (filas.length + 1) + 4);

    // Encabezado
    doc.setFillColor(15, 92, 92);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    let x = MARGIN;
    doc.rect(x, y, rowLabelW, rowH, 'F');
    doc.text(doc.splitTextToSize(colLabel, rowLabelW - 4), x + 2, y + rowH / 2 + 1);
    x += rowLabelW;
    columnas.forEach(c => {
      doc.rect(x, y, dataW, rowH, 'F');
      doc.text(doc.splitTextToSize(c, dataW - 4), x + 2, y + rowH / 2 + 1);
      x += dataW;
    });
    y += rowH;

    // Filas
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(26, 26, 46);
    doc.setFontSize(8.5);
    filas.forEach((fila, fi) => {
      y = checkPage(y, rowH);
      x = MARGIN;
      doc.setFillColor(fi % 2 === 0 ? 240 : 255, fi % 2 === 0 ? 242 : 255, fi % 2 === 0 ? 255 : 255);
      doc.rect(x, y, rowLabelW, rowH, 'F');
      doc.setDrawColor(200, 200, 220);
      doc.rect(x, y, rowLabelW, rowH);
      doc.setFont('helvetica', 'bold');
      doc.text(doc.splitTextToSize(fila, rowLabelW - 4), x + 2, y + rowH / 2 + 1);
      doc.setFont('helvetica', 'normal');
      x += rowLabelW;
      columnas.forEach((_, ci) => {
        doc.rect(x, y, dataW, rowH);
        const val = item.valores?.[fi]?.[ci];
        if (val) doc.text(doc.splitTextToSize(String(val), dataW - 4), x + 2, y + rowH / 2 + 1);
        x += dataW;
      });
      y += rowH;
    });
    y += 5;
  }

  for (const item of items) {
    y = checkPage(y, 16);
    doc.setFillColor(230, 244, 244);
    doc.rect(MARGIN, y - 5, maxW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 92, 92);
    doc.text(item.titulo || 'Sección', MARGIN + 2, y);
    y += 8;

    if (item.instrucciones) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(74, 74, 106);
      const insLines = doc.splitTextToSize(item.instrucciones, maxW);
      for (const line of insLines) { y = checkPage(y, 5); doc.text(line, MARGIN, y); y += 4.5; }
      y += 2;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 46);

    if (item.tipo === 'tabla') {
      drawTablaItem(item);
    } else if (item.texto != null) {
      const lines = doc.splitTextToSize(String(item.texto) || '—', maxW);
      for (const line of lines) {
        y = checkPage(y, 6);
        doc.text(line, MARGIN, y);
        y += 5.5;
      }
      y += 4;
    } else {
      const n = TIPO_LINEAS[item.tipo] ?? 3;
      doc.setDrawColor(184, 184, 208);
      for (let i = 0; i < n; i++) {
        y = checkPage(y, 9);
        y += 8;
        doc.line(MARGIN, y, MARGIN + maxW, y);
      }
      y += 4;
    }
  }

  y = checkPage(y, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(136, 136, 170);
  doc.text(`AcadVet USAM  ·  Generado el ${fechaStr}`, PW / 2, PH - 10, { align: 'center' });

  doc.save(`${safeFilename(filenameBase)}.pdf`);
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

function blankItems(template) {
  return (template.secciones || []).map(s => ({
    titulo: s.titulo, tipo: s.tipo, instrucciones: s.instrucciones || '',
    colLabel: s.colLabel, columnas: s.columnas, filas: s.filas, valores: null,
    texto: s.tipo === 'tabla' ? undefined : null,
  }));
}

function filledItems(respuestas) {
  return (respuestas || []).map(r => ({
    titulo: r.titulo, tipo: r.tipo, instrucciones: r.instrucciones || '',
    colLabel: r.colLabel, columnas: r.columnas, filas: r.filas, valores: r.valores,
    texto: r.tipo === 'tabla' ? undefined : (r.respuesta ?? ''),
  }));
}

export async function downloadBlankWord(template) {
  await buildWord({
    nombre: template.nombre,
    desc:   template.desc,
    laboratorio: template.laboratorio,
    alumno: null,
    items:  blankItems(template),
    fecha:  Date.now(),
    filenameBase: `Plantilla_${template.nombre}`,
  });
}

export async function downloadBlankPDF(template) {
  await buildPDF({
    nombre: template.nombre,
    desc:   template.desc,
    laboratorio: template.laboratorio,
    alumno: null,
    items:  blankItems(template),
    fecha:  Date.now(),
    filenameBase: `Plantilla_${template.nombre}`,
  });
}

export async function downloadFilledWord({ templateNombre, templateDesc, templateLaboratorio, alumno, respuestas, submitTime }) {
  await buildWord({
    nombre: templateNombre,
    desc:   templateDesc,
    laboratorio: templateLaboratorio,
    alumno,
    items:  filledItems(respuestas),
    fecha:  submitTime,
    filenameBase: `Reporte_${alumno?.nombre || 'alumno'}_${templateNombre || ''}`,
  });
}

export async function downloadFilledPDF({ templateNombre, templateDesc, templateLaboratorio, alumno, respuestas, submitTime }) {
  await buildPDF({
    nombre: templateNombre,
    desc:   templateDesc,
    laboratorio: templateLaboratorio,
    alumno,
    items:  filledItems(respuestas),
    fecha:  submitTime,
    filenameBase: `Reporte_${alumno?.nombre || 'alumno'}_${templateNombre || ''}`,
  });
}
