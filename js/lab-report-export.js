// =============================================================================
// AcadVet USAM — Generación de Word/PDF para Reportes de Laboratorio
//
// Módulo compartido entre el panel docente (lab-report-templates.js) y el
// portal del alumno (lab-report.html): genera tanto la plantilla en blanco
// (para imprimir y llenar a mano) como el reporte ya lleno por el alumno.
// Mismo estilo visual que el Word del expediente (js/views/expediente.js).
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

// Cuántas líneas en blanco dibujar por sección en la plantilla vacía
const TIPO_LINEAS = { corta: 1, larga: 6 };

function fechaLarga(ts) {
  return new Date(ts || Date.now()).toLocaleDateString('es-SV', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// -----------------------------------------------------------------------------
// WORD
// -----------------------------------------------------------------------------
async function buildWord({ nombre, desc, alumno, items, fecha, filenameBase }) {
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType,
  } = await loadDocx();

  const fechaStr = fechaLarga(fecha);
  const shade    = fill => ({ type: ShadingType.CLEAR, color: 'auto', fill });
  const blank    = () => new Paragraph({ children: [new TextRun({ text: '' })] });

  const mkSection = title => new Paragraph({
    spacing: { before: 320, after: 120 },
    shading: shade('ECEEFF'),
    children: [new TextRun({ text: title, bold: true, color: '6C63FF', size: 20 })],
  });

  const blankLine = () => new Paragraph({
    spacing: { after: 220 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8B8D0' } },
    children: [new TextRun({ text: ' ', size: 20 })],
  });

  // Fila de datos del alumno: si no hay valor, dibuja una línea para llenar a mano
  const infoLine = (label, value) => new Paragraph({
    spacing: { after: 140 },
    border: value == null
      ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B8B8D0' } }
      : undefined,
    children: [
      new TextRun({ text: label + ': ', bold: true, size: 20 }),
      new TextRun({ text: value ?? ' ', size: 20 }),
    ],
  });

  const ch = [];

  for (const [text, size, bold] of [
    ['UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', 20, true],
    ['Facultad de Medicina Veterinaria',          18, false],
    ['REPORTE DE LABORATORIO',                    22, true],
  ]) {
    ch.push(new Paragraph({
      spacing: { after: 40 },
      shading: shade('2D2A6E'),
      children: [new TextRun({ text, bold, color: 'FFFFFF', size })],
    }));
  }

  ch.push(blank());
  ch.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: nombre || 'Reporte de laboratorio', bold: true, size: 26, color: '1A1A2E' })],
  }));
  if (desc) {
    ch.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: desc, italics: true, size: 18, color: '4A4A6A' })],
    }));
  }

  ch.push(infoLine('Alumno', alumno?.nombre ?? null));
  ch.push(infoLine('Carné',  alumno?.carnet ?? null));
  ch.push(infoLine('Correo', alumno?.email  ?? null));
  ch.push(infoLine('Fecha',  alumno ? fechaStr : null));
  ch.push(blank());

  for (const item of items) {
    ch.push(mkSection(item.titulo || 'Sección'));
    if (item.texto != null) {
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
async function buildPDF({ nombre, desc, alumno, items, fecha, filenameBase }) {
  const { jsPDF } = await loadJsPDF();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PW = 210, PH = 297, MARGIN = 18;
  const maxW = PW - MARGIN * 2;
  const fechaStr = fechaLarga(fecha);

  function checkPage(y, needed) {
    if (y + needed > PH - 16) { doc.addPage(); return 20; }
    return y;
  }

  // Encabezado
  doc.setFillColor(45, 42, 110);
  doc.rect(0, 0, PW, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', PW / 2, 10, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Facultad de Medicina Veterinaria', PW / 2, 16, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('REPORTE DE LABORATORIO', PW / 2, 22, { align: 'center' });

  let y = 36;
  doc.setTextColor(26, 26, 46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(nombre || 'Reporte de laboratorio', MARGIN, y);
  y += 7;

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
    ['Alumno', alumno?.nombre],
    ['Carné',  alumno?.carnet],
    ['Correo', alumno?.email],
    ['Fecha',  alumno ? fechaStr : null],
  ];
  for (const [label, value] of infoRows) {
    y = checkPage(y, 8);
    doc.setFont('helvetica', 'bold');
    doc.text(label + ':', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    if (value) {
      doc.text(String(value), MARGIN + 24, y);
    } else {
      doc.setDrawColor(184, 184, 208);
      doc.line(MARGIN + 24, y + 1, MARGIN + maxW, y + 1);
    }
    y += 7;
  }
  y += 4;

  for (const item of items) {
    y = checkPage(y, 16);
    doc.setFillColor(236, 238, 255);
    doc.rect(MARGIN, y - 5, maxW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(108, 99, 255);
    doc.text(item.titulo || 'Sección', MARGIN + 2, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 46);

    if (item.texto != null) {
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
  return (template.secciones || []).map(s => ({ titulo: s.titulo, tipo: s.tipo, texto: null }));
}

function filledItems(respuestas) {
  return (respuestas || []).map(r => ({ titulo: r.titulo, tipo: r.tipo, texto: r.respuesta ?? '' }));
}

export async function downloadBlankWord(template) {
  await buildWord({
    nombre: template.nombre,
    desc:   template.desc,
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
    alumno: null,
    items:  blankItems(template),
    fecha:  Date.now(),
    filenameBase: `Plantilla_${template.nombre}`,
  });
}

export async function downloadFilledWord({ templateNombre, templateDesc, alumno, respuestas, submitTime }) {
  await buildWord({
    nombre: templateNombre,
    desc:   templateDesc,
    alumno,
    items:  filledItems(respuestas),
    fecha:  submitTime,
    filenameBase: `Reporte_${alumno?.nombre || 'alumno'}_${templateNombre || ''}`,
  });
}

export async function downloadFilledPDF({ templateNombre, templateDesc, alumno, respuestas, submitTime }) {
  await buildPDF({
    nombre: templateNombre,
    desc:   templateDesc,
    alumno,
    items:  filledItems(respuestas),
    fecha:  submitTime,
    filenameBase: `Reporte_${alumno?.nombre || 'alumno'}_${templateNombre || ''}`,
  });
}
