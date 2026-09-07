// =============================================================================
// AcadVet USAM — Generación de Word/PDF del Informe Semanal por Grupo de Clase
//
// Replica el formato oficial (membrete con 2 logos + tabla de 6 criterios
// fijos) que ya usa el docente. Los logos están recortados de la plantilla
// original en logo/informe-semanal-usam40.png y logo/informe-semanal-veterinaria.png.
// =============================================================================

const LOGO_USAM40 = './logo/informe-semanal-usam40.png';
const LOGO_VET     = './logo/informe-semanal-veterinaria.png';

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

function fetchArrayBuffer(url) {
  return fetch(url).then(r => r.arrayBuffer());
}

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function safeFilename(s) {
  return (s ?? 'informe')
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'informe';
}

function formatFechaCorta(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-SV', { day: 'numeric', month: 'long' });
}

function formatRangoSemana(desde, hasta) {
  if (!desde && !hasta) return '';
  if (desde && hasta) return `${formatFechaCorta(desde)} al ${formatFechaCorta(hasta)}`;
  return formatFechaCorta(desde || hasta);
}

// -----------------------------------------------------------------------------
// WORD
// -----------------------------------------------------------------------------
export async function downloadInformeSemanalWord(informe) {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, WidthType, ShadingType, ImageRun, VerticalAlign, BorderStyle,
  } = await loadDocx();

  const [logoIzqBuf, logoDerBuf] = await Promise.all([
    fetchArrayBuffer(LOGO_USAM40),
    fetchArrayBuffer(LOGO_VET),
  ]);

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const cellNoBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const headerRow = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 18, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellNoBorders,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ type: 'png', data: logoIzqBuf, transformation: { width: 70, height: 70 } })],
          })],
        }),
        new TableCell({
          width: { size: 64, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellNoBorders,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
              children: [new TextRun({ text: 'UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', bold: true, size: 22 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'FACULTAD DE MEDICINA VETERINARIA Y ZOOTECNIA', bold: true, size: 22 })] }),
          ],
        }),
        new TableCell({
          width: { size: 18, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.CENTER,
          borders: cellNoBorders,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ type: 'png', data: logoDerBuf, transformation: { width: 62, height: 78 } })],
          })],
        }),
      ],
    })],
  });

  const titulo = new Paragraph({
    spacing: { before: 240, after: 240 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'INFORMES SEMANALES POR GRUPO DE CLASE', bold: true, size: 28 })],
  });

  const infoCell = (label, value, widthPct) => new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
    children: [new Paragraph({
      children: [
        new TextRun({ text: label + ': ', bold: true, size: 20 }),
        new TextRun({ text: value || '', size: 20 }),
      ],
    })],
  });

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [infoCell('FECHA POR SEMANA', formatRangoSemana(informe.semanaInicio, informe.semanaFin), 100)] }),
      new TableRow({ children: [infoCell('NOMBRE DEL ACADÉMICO', informe.academico, 100)] }),
      new TableRow({ children: [
        infoCell('ASIGNATURA', informe.materiaNombre, 65),
        infoCell('GRUPO', informe.seccion, 35),
      ] }),
    ],
  });

  const shade = fill => ({ type: ShadingType.CLEAR, color: 'auto', fill });
  const headCell = text => new TableCell({
    shading: shade('F6DDA0'),
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, size: 19 })] })],
  });
  const bodyCell = (text, opts = {}) => new TableCell({
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: String(text ?? ''), bold: !!opts.bold, size: 19 })],
    })],
  });

  const criterios = informe.criterios || [];
  const criteriosTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: [
        headCell('N.º'), headCell('CRITERIOS PARA EVALUAR'),
        headCell('NÚMERO O PORCENTAJES'), headCell('EXPLICACIÓN'),
      ] }),
      ...criterios.map(c => new TableRow({ children: [
        bodyCell(c.numero, { center: true, bold: true }),
        bodyCell(c.criterio),
        bodyCell(c.valor, { center: true }),
        bodyCell(c.explicacion),
      ] })),
    ],
  });

  const footer = new Paragraph({
    spacing: { before: 240 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `AcadVet USAM  ·  Generado el ${new Date().toLocaleDateString('es-SV')}`, size: 16, color: '8888AA' })],
  });

  const doc = new Document({
    creator: 'AcadVet USAM',
    title: 'Informe Semanal por Grupo de Clase',
    sections: [{ properties: {}, children: [headerRow, titulo, infoTable, new Paragraph({ text: '' }), criteriosTable, footer] }],
  });

  const blob   = await Packer.toBlob(doc);
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = `Informe_Semanal_${safeFilename(informe.materiaNombre)}_${informe.semanaInicio || ''}.docx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// PDF
// -----------------------------------------------------------------------------
export async function downloadInformeSemanalPDF(informe) {
  const { jsPDF } = await loadJsPDF();
  const [logoIzq, logoDer] = await Promise.all([loadImageEl(LOGO_USAM40), loadImageEl(LOGO_VET)]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = 297, MARGIN = 14;
  const maxW = PW - MARGIN * 2;

  doc.addImage(logoIzq, 'PNG', MARGIN, 8, 20, 20);
  doc.addImage(logoDer, 'PNG', PW - MARGIN - 18, 6, 18, 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(26, 26, 46);
  doc.text('UNIVERSIDAD SALVADOREÑA ALBERTO MASFERRER', PW / 2, 14, { align: 'center' });
  doc.text('FACULTAD DE MEDICINA VETERINARIA Y ZOOTECNIA', PW / 2, 21, { align: 'center' });

  doc.setFontSize(15);
  doc.text('INFORMES SEMANALES POR GRUPO DE CLASE', PW / 2, 34, { align: 'center' });

  let y = 44;
  const rowH = 9;

  function infoRow(cells) {
    let x = MARGIN;
    const totalW = maxW;
    doc.setDrawColor(150, 150, 150);
    doc.rect(x, y, totalW, rowH);
    let offset = 0;
    cells.forEach((c, i) => {
      const w = totalW * c.pct;
      if (i > 0) doc.line(x + offset, y, x + offset, y + rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(`${c.label}:`, x + offset + 2, y + rowH / 2 + 1.2);
      const labelW = doc.getTextWidth(`${c.label}: `);
      doc.setFont('helvetica', 'normal');
      doc.text(String(c.value || ''), x + offset + 2 + labelW + 1, y + rowH / 2 + 1.2);
      offset += w;
    });
    y += rowH;
  }

  infoRow([{ label: 'FECHA POR SEMANA', value: formatRangoSemana(informe.semanaInicio, informe.semanaFin), pct: 1 }]);
  infoRow([{ label: 'NOMBRE DEL ACADÉMICO', value: informe.academico, pct: 1 }]);
  infoRow([
    { label: 'ASIGNATURA', value: informe.materiaNombre, pct: 0.65 },
    { label: 'GRUPO', value: informe.seccion, pct: 0.35 },
  ]);

  y += 4;

  const cols  = ['N.º', 'CRITERIOS PARA EVALUAR', 'NÚMERO O\nPORCENTAJES', 'EXPLICACIÓN'];
  const colW  = [14, maxW * 0.30, maxW * 0.18, maxW - 14 - maxW * 0.30 - maxW * 0.18];
  const HEAD_H = 12;

  function drawRow(cells, opts = {}) {
    const lines = cells.map((txt, i) => doc.splitTextToSize(String(txt ?? ''), colW[i] - 4));
    const rH = Math.max(opts.minH || 8, Math.max(...lines.map(l => l.length)) * 4.5 + 3);

    if (y + rH > 200) { doc.addPage('a4', 'landscape'); y = 16; }

    let x = MARGIN;
    doc.setDrawColor(150, 150, 150);
    if (opts.fill) { doc.setFillColor(...opts.fill); doc.rect(x, y, maxW, rH, 'F'); }
    doc.rect(x, y, maxW, rH);
    lines.forEach((ls, i) => {
      if (i > 0) doc.line(x, y, x, y + rH);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setFontSize(9);
      doc.setTextColor(26, 26, 46);
      const align = opts.center?.[i] ? 'center' : 'left';
      const tx = align === 'center' ? x + colW[i] / 2 : x + 2;
      ls.forEach((l, li) => doc.text(l, tx, y + 5 + li * 4.2, { align }));
      x += colW[i];
    });
    y += rH;
  }

  drawRow(cols, { fill: [246, 221, 160], bold: true, minH: HEAD_H, center: [true, false, true, false] });
  (informe.criterios || []).forEach(c => {
    drawRow([c.numero, c.criterio, c.valor, c.explicacion], { center: [true, false, true, false] });
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(136, 136, 170);
  doc.text(`AcadVet USAM  ·  Generado el ${new Date().toLocaleDateString('es-SV')}`, PW / 2, 205, { align: 'center' });

  doc.save(`Informe_Semanal_${safeFilename(informe.materiaNombre)}_${informe.semanaInicio || ''}.pdf`);
}
