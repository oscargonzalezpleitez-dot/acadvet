// =============================================================================
// AcadVet USAM — Geometría de la hoja de respuestas (burbujas)
// Única fuente de verdad: tanto la plantilla imprimible
// (parciales-hoja-burbujas.html) como el detector (js/omr-core.js) leen las
// posiciones de acá, para que nunca queden desincronizadas.
//
// Las burbujas se ubican como FRACCIONES (0..1) dentro del rectángulo que
// forman las 4 marcas de esquina — no en mm absolutos — así que aunque la
// impresión/escala del PDF varíe un poco, la posición relativa de cada
// burbuja respecto a las marcas se mantiene exacta.
// =============================================================================

// Tamaño de página y posición de las 4 marcas de esquina, en mm.
// Carta (Letter): 215.9 x 279.4 mm.
export const PAGE_MM = { width: 215.9, height: 279.4 };
export const MARKER_SIZE_MM = 8;
export const MARKERS_MM = {
  tl: { x: 20,    y: 20 },
  tr: { x: 195.9, y: 20 },
  bl: { x: 20,    y: 259.4 },
  br: { x: 195.9, y: 259.4 },
};

export const NUM_QUESTIONS = 30;
export const OPTIONS = ['A', 'B', 'C', 'D'];
const ROWS_PER_COL = 15;

// Grilla de burbujas, en fracciones (0..1) del rectángulo de marcas.
const GRID = {
  yStart: 0.26,
  yEnd:   0.96,
  colStartX: [0.06, 0.54],
  optionOffsets: [0.11, 0.19, 0.27, 0.35],
};

/**
 * Devuelve la posición de cada burbuja: [{ q, opt, xFrac, yFrac }, ...]
 * q = número de pregunta (1..NUM_QUESTIONS), opt = 'A'|'B'|'C'|'D'.
 */
export function bubblePositions() {
  const positions = [];
  for (let q = 1; q <= NUM_QUESTIONS; q++) {
    const col      = Math.floor((q - 1) / ROWS_PER_COL);
    const rowInCol = (q - 1) % ROWS_PER_COL;
    const yFrac    = GRID.yStart + (GRID.yEnd - GRID.yStart) * (rowInCol / (ROWS_PER_COL - 1));
    OPTIONS.forEach((opt, i) => {
      const xFrac = GRID.colStartX[col] + GRID.optionOffsets[i];
      positions.push({ q, opt, xFrac, yFrac });
    });
  }
  return positions;
}

/** Posición del número de cada pregunta (a la izquierda de la opción "A"): [{ q, xFrac, yFrac }]. */
export function rowLabelPositions() {
  const positions = [];
  for (let q = 1; q <= NUM_QUESTIONS; q++) {
    const col      = Math.floor((q - 1) / ROWS_PER_COL);
    const rowInCol = (q - 1) % ROWS_PER_COL;
    const yFrac    = GRID.yStart + (GRID.yEnd - GRID.yStart) * (rowInCol / (ROWS_PER_COL - 1));
    positions.push({ q, xFrac: GRID.colStartX[col], yFrac });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Código de versión — un QR chiquito para tener varias claves de respuestas
// distintas sin que el alumno note que hay más de una circulando. Todos los
// QR salen del mismo tamaño y en el mismo lugar de la hoja (solo cambia el
// patrón interno según la versión), así que a simple vista se ven iguales
// entre sí — hace falta escanearlo para saber qué dice.
// Posición fija en mm (no depende del rectángulo de marcas, porque el QR se
// lee solo — busca su propio patrón en la foto, no necesita la homografía).
// ---------------------------------------------------------------------------
export const VERSIONS = ['A', 'B', 'C', 'D', 'E'];
// Zona libre entre el encabezado (termina ~50mm) y el inicio de la grilla
// de preguntas (82.2mm) — no compite con ninguna burbuja.
export const QR_MM = { x: 165, y: 55, size: 22 };

// El QR no dice "A", "B", etc. — codifica un código sin sentido aparente,
// para que un alumno que lo escanee por curiosidad no vea nada que le
// indique que es un código de versión de examen. El mapeo solo lo conoce
// esta app (acá y en la lectura, js/qr-detect.js).
const QR_CODE_BY_VERSION = {
  A: '5279vru',
  B: 'q4be99w',
  C: 'ywjqrn6',
  D: 'qcp624x',
  E: '2cpvfz5',
};
const VERSION_BY_QR_CODE = Object.fromEntries(
  Object.entries(QR_CODE_BY_VERSION).map(([v, code]) => [code, v])
);

export function versionToQrPayload(version) {
  const code = QR_CODE_BY_VERSION[version];
  if (!code) throw new Error(`Versión desconocida: ${version}`);
  return code;
}

/** Devuelve la versión (A-E) para un texto ya decodificado del QR, o null si no matchea ninguna. */
export function qrPayloadToVersion(payload) {
  return VERSION_BY_QR_CODE[payload] ?? null;
}

/** Ancho/alto del rectángulo de marcas, en mm — útil para dibujar la plantilla. */
export function contentSizeMm() {
  return {
    width:  MARKERS_MM.tr.x - MARKERS_MM.tl.x,
    height: MARKERS_MM.bl.y - MARKERS_MM.tl.y,
  };
}

/** Convierte una fracción {xFrac,yFrac} a mm absolutos de página (para imprimir). */
export function fracToMm({ xFrac, yFrac }) {
  const { width, height } = contentSizeMm();
  return {
    x: MARKERS_MM.tl.x + xFrac * width,
    y: MARKERS_MM.tl.y + yFrac * height,
  };
}
