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
// yStart empieza más abajo que antes (era 0.26) para dejar espacio arriba a
// la grilla de carné (ver CARNET_GRID) — ver carnetPositions().
const GRID = {
  yStart: 0.41,
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
// Grilla de carné — el alumno rellena su número de carné dígito por dígito
// (una burbuja 0-9 por columna), igual que un carné de universidad real.
// Se lee con el mismo mecanismo que las respuestas — nada de reconocer
// letra manuscrita, que es justo lo que falla.
// ---------------------------------------------------------------------------
export const CARNET_DIGITS = 6;
export const CARNET_BUBBLE_SIZE_MM = 5;

const CARNET_GRID = {
  yStart: 0.135,
  yEnd:   0.37,
  colX: [0.08, 0.164, 0.248, 0.332, 0.416, 0.50],
};

/** Posición de cada burbuja de carné: [{ digitIndex, valor, xFrac, yFrac }]. */
export function carnetPositions() {
  const positions = [];
  for (let col = 0; col < CARNET_DIGITS; col++) {
    for (let valor = 0; valor <= 9; valor++) {
      const yFrac = CARNET_GRID.yStart + (CARNET_GRID.yEnd - CARNET_GRID.yStart) * (valor / 9);
      positions.push({ digitIndex: col, valor, xFrac: CARNET_GRID.colX[col], yFrac });
    }
  }
  return positions;
}

/** Posición del dígito (0-9) en la fila, a la izquierda de cada columna: [{ digitIndex, valor, xFrac, yFrac }]. */
export function carnetLabelPositions() {
  const positions = [];
  for (let valor = 0; valor <= 9; valor++) {
    const yFrac = CARNET_GRID.yStart + (CARNET_GRID.yEnd - CARNET_GRID.yStart) * (valor / 9);
    positions.push({ valor, xFrac: CARNET_GRID.colX[0] - 0.045, yFrac });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Código de versión "escondido" — para tener varias claves de respuestas
// distintas sin que el alumno note que hay más de una circulando. No es algo
// que el alumno llena: se imprime ya marcado, distinto por versión, como
// 3 cuadraditos chicos cerca del margen inferior (se leen igual que
// cualquier burbuja: negro impreso = bit 1, ausente = bit 0). Con 3 bits
// alcanzan 8 versiones — usamos 5 (A-E).
// ---------------------------------------------------------------------------
export const VERSIONS = ['A', 'B', 'C', 'D', 'E'];
// Debe ser >= al diámetro que cubre el muestreo (ver BUBBLE_RADIUS_FRAC en
// omr-core.js) — si el cuadradito impreso es más chico que el círculo de
// muestreo, se diluye con el blanco de alrededor y nunca se detecta lleno.
export const VERSION_MARK_SIZE_MM = 6;

const VERSION_CODE_Y = 0.985;
const VERSION_CODE_X = [0.30, 0.42, 0.54]; // 3 bits, lejos de burbujas y marcas

export function versionCodePositions() {
  return VERSION_CODE_X.map((xFrac, bit) => ({ bit, xFrac, yFrac: VERSION_CODE_Y }));
}

export function versionToBits(version) {
  const idx = VERSIONS.indexOf(version);
  if (idx < 0) throw new Error(`Versión desconocida: ${version}`);
  return [(idx >> 2) & 1, (idx >> 1) & 1, idx & 1];
}

export function bitsToVersion(bits) {
  const idx = (bits[0] << 2) | (bits[1] << 1) | bits[2];
  return VERSIONS[idx] ?? null;
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
