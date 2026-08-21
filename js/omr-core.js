// =============================================================================
// AcadVet USAM — Detector de hojas de burbujas (OMR), sin IA
// Dado un canvas con la foto y las 4 esquinas marcadas a mano (docente toca
// las 4 marcas negras en la foto), calcula una homografía para ubicar cada
// burbuja de la plantilla (ver js/omr-template.js) dentro de la foto real,
// aunque esté rotada o en perspectiva — y mide qué tan "llena" está cada una.
// =============================================================================

import { bubblePositions, OPTIONS } from './omr-template.js';

// ---------------------------------------------------------------------------
// Homografía 3x3 a partir de 4 correspondencias de puntos (DLT clásico).
// Sin librería externa: eliminación gaussiana sobre un sistema 8x8.
// ---------------------------------------------------------------------------
function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-9) throw new Error('No se pudo calcular la perspectiva (¿tocaste las 4 esquinas correctas?)');
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

/** src, dst: arrays de 4 puntos {x,y} en orden correspondiente (TL,TR,BR,BL). */
export function computeHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: xp, y: yp } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * xp, -y * xp]); b.push(xp);
    A.push([0, 0, 0, x, y, 1, -x * yp, -y * yp]); b.push(yp);
  }
  const h = solveLinearSystem(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

// ---------------------------------------------------------------------------
// Muestreo de "qué tan oscuro" es un círculo de la foto (promedio de
// luminancia dentro del radio). 0 = negro (marcada), 255 = blanco (vacía).
// ---------------------------------------------------------------------------
export function sampleLuminance(imageData, cx, cy, radius) {
  const { data, width, height } = imageData;
  let sum = 0, count = 0;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const idx = (y * width + x) * 4;
      sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      count++;
    }
  }
  return count ? sum / count : 255;
}

// ---------------------------------------------------------------------------
// Detección AUTOMÁTICA de las 4 esquinas (sin tocar nada) — busca en la foto
// blobs oscuros sólidos y cuadrados (las marcas de esquina son así; las
// burbujas rellenas son redondas y los textos/letras son delgados, así que
// se distinguen por forma). Entre los que parecen marca, se queda con los
// más grandes (las marcas se imprimen más grandes que una burbuja) y elige
// los 4 que están en las esquinas extremas de la hoja.
// Si no encuentra 4 marcas confiables, devuelve null — ahí la pantalla debe
// caer al flujo manual (tocar + lupa) como respaldo.
// ---------------------------------------------------------------------------
const AUTO_MAX_DIM        = 900;  // px del lado más largo, para que sea rápido
const AUTO_DARK_THRESHOLD = 110;  // luminancia máxima para contar "oscuro"
const AUTO_MIN_ASPECT     = 0.55; // ancho/alto mínimo para "parece cuadrado"
const AUTO_MAX_ASPECT     = 1.8;
const AUTO_MIN_FILL_RATIO = 0.86; // cuadrado sólido ~0.9-1.0, círculo ~0.785, texto <0.5
const AUTO_TOP_N          = 10;   // cuántos candidatos más grandes se consideran

function toGrayscaleDownsampled(imageData, maxDim) {
  const { width: fullW, height: fullH, data } = imageData;
  const scale = Math.min(1, maxDim / Math.max(fullW, fullH));
  const w = Math.max(1, Math.round(fullW * scale));
  const h = Math.max(1, Math.round(fullH * scale));
  const gray = new Uint8ClampedArray(w * h);

  for (let y = 0; y < h; y++) {
    const sy = Math.min(fullH - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(fullW - 1, Math.floor(x / scale));
      const idx = (sy * fullW + sx) * 4;
      gray[y * w + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }
  return { gray, w, h, scale };
}

/** Componentes conexas de píxeles oscuros (flood fill iterativo, 4-conexo). */
function findDarkBlobs(gray, w, h, threshold) {
  const visited = new Uint8Array(w * h);
  const stackX  = new Int32Array(w * h);
  const stackY  = new Int32Array(w * h);
  const blobs   = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (visited[start] || gray[start] >= threshold) continue;

      let sp = 0;
      stackX[sp] = x; stackY[sp] = y; sp++;
      visited[start] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0, sumX = 0, sumY = 0;

      while (sp > 0) {
        sp--;
        const cx = stackX[sp], cy = stackY[sp];
        count++; sumX += cx; sumY += cy;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;

        if (cx > 0)     { const i = cy * w + (cx - 1); if (!visited[i] && gray[i] < threshold) { visited[i] = 1; stackX[sp] = cx - 1; stackY[sp] = cy; sp++; } }
        if (cx < w - 1) { const i = cy * w + (cx + 1); if (!visited[i] && gray[i] < threshold) { visited[i] = 1; stackX[sp] = cx + 1; stackY[sp] = cy; sp++; } }
        if (cy > 0)     { const i = (cy - 1) * w + cx; if (!visited[i] && gray[i] < threshold) { visited[i] = 1; stackX[sp] = cx; stackY[sp] = cy - 1; sp++; } }
        if (cy < h - 1) { const i = (cy + 1) * w + cx; if (!visited[i] && gray[i] < threshold) { visited[i] = 1; stackX[sp] = cx; stackY[sp] = cy + 1; sp++; } }
      }

      if (count < 5) continue; // ruido de unos pocos píxeles
      blobs.push({ minX, maxX, minY, maxY, count, cx: sumX / count, cy: sumY / count });
    }
  }
  return blobs;
}

function looksLikeMarker(blob) {
  const w = blob.maxX - blob.minX + 1;
  const h = blob.maxY - blob.minY + 1;
  if (w < 3 || h < 3) return false;
  const aspect = w / h;
  if (aspect < AUTO_MIN_ASPECT || aspect > AUTO_MAX_ASPECT) return false;
  const fillRatio = blob.count / (w * h);
  return fillRatio >= AUTO_MIN_FILL_RATIO;
}

/** Entre los candidatos, elige los 4 en las esquinas extremas (TL,TR,BR,BL). */
function pickExtremeCorners(candidates) {
  if (candidates.length < 4) return null;
  const byMax = (fn) => candidates.reduce((best, b) => fn(b) > fn(best) ? b : best, candidates[0]);
  const tl = byMax(b => -(b.cx + b.cy));
  const br = byMax(b => (b.cx + b.cy));
  const tr = byMax(b => (b.cx - b.cy));
  const bl = byMax(b => -(b.cx - b.cy));
  if (new Set([tl, tr, br, bl]).size < 4) return null; // se repitió algún blob
  return { tl, tr, br, bl };
}

/**
 * Intenta ubicar las 4 marcas de esquina automáticamente.
 * Devuelve { tl, tr, br, bl } en px de la foto ORIGINAL, o null si no
 * encontró 4 candidatos confiables (usar el flujo manual como respaldo).
 */
export function detectCorners(imageData) {
  const { gray, w, h, scale } = toGrayscaleDownsampled(imageData, AUTO_MAX_DIM);
  const candidates = findDarkBlobs(gray, w, h, AUTO_DARK_THRESHOLD)
    .filter(looksLikeMarker)
    .sort((a, b) => b.count - a.count)
    .slice(0, AUTO_TOP_N);

  const picked = pickExtremeCorners(candidates);
  if (!picked) return null;

  const toFull = (b) => ({ x: b.cx / scale, y: b.cy / scale });
  return { tl: toFull(picked.tl), tr: toFull(picked.tr), br: toFull(picked.br), bl: toFull(picked.bl) };
}

// ---------------------------------------------------------------------------
// Detección completa: homografía + muestreo + decisión por pregunta.
// corners = { tl, tr, br, bl } — puntos en px de la foto, en ese orden
// (el docente los toca en sentido horario empezando arriba-izquierda).
// ---------------------------------------------------------------------------
const SIN_RESPUESTA_UMBRAL = 40; // luminancia invertida mínima para contar como "marcada"
const CONTRASTE_MIN        = 22; // diferencia mínima entre 1ra y 2da opción más oscura
const BUBBLE_RADIUS_FRAC   = 0.014; // radio de muestreo, como fracción del ancho tl→tr

export function detectRespuestas(imageData, corners) {
  const H = computeHomography(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    [corners.tl, corners.tr, corners.br, corners.bl]
  );

  const anchoPx  = Math.hypot(corners.tr.x - corners.tl.x, corners.tr.y - corners.tl.y);
  const radiusPx = Math.max(4, anchoPx * BUBBLE_RADIUS_FRAC);

  const porPregunta = {};
  const muestras = []; // para overlay de depuración: { q, opt, x, y, llenado }

  bubblePositions().forEach(({ q, opt, xFrac, yFrac }) => {
    const { x, y } = applyHomography(H, xFrac, yFrac);
    const luminancia = sampleLuminance(imageData, x, y, radiusPx);
    const llenado = 255 - luminancia; // mayor = más oscuro/lleno
    (porPregunta[q] ??= []).push({ opt, llenado });
    muestras.push({ q, opt, x, y, radiusPx, llenado });
  });

  const resultado = {};
  for (const q of Object.keys(porPregunta)) {
    const ordenadas = [...porPregunta[q]].sort((a, b) => b.llenado - a.llenado);
    const [top, second] = ordenadas;
    if (top.llenado < SIN_RESPUESTA_UMBRAL) {
      resultado[q] = { marcada: null, motivo: 'sin_respuesta' };
    } else if (top.llenado - second.llenado < CONTRASTE_MIN) {
      resultado[q] = { marcada: null, motivo: 'ambigua', candidatos: ordenadas.map(o => o.opt) };
    } else {
      resultado[q] = { marcada: top.opt };
    }
  }

  return { resultado, muestras };
}

export { OPTIONS };
