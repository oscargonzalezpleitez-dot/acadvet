// =============================================================================
// AcadVet USAM — Lectura del QR de versión en la hoja de burbujas
// Usa jsQR (https://github.com/cozmo/jsQR), una librería chica y ya probada
// para decodificar QR — no tiene sentido reimplementar eso a mano, es un
// algoritmo delicado (patrones de búsqueda, corrección de errores Reed-
// Solomon). Solo para el navegador (usa un import de CDN), no para Node.
// =============================================================================

import jsQR from 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm';

/**
 * Busca y decodifica el QR de versión en cualquier parte de la foto — no
 * depende de las 4 esquinas ni de la homografía, jsQR encuentra su propio
 * patrón de búsqueda dentro de la imagen.
 * @returns el texto decodificado (ej. "A") o null si no encontró ningún QR.
 */
export function detectVersionQR(imageData) {
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code ? code.data : null;
}
