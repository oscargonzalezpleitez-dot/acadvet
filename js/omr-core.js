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
