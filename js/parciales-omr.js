// =============================================================================
// AcadVet USAM — Calificación de parciales por hoja de burbujas (OMR)
// Capa de datos: clave(s) de respuestas por versión, y guardado de notas.
// El procesamiento de fotos (detección) es 100% client-side (js/omr-core.js);
// esta capa solo persiste la clave y escribe la nota final ya aprobada.
// =============================================================================

import { getDatabase, ref, get, set } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';
import { getParciales, updateParciales } from './db.js';

const db = getDatabase(app);

// ---------------------------------------------------------------------------
// CLAVE(S) DE RESPUESTAS
// ---------------------------------------------------------------------------

/** { respuestas: {1:'B',...}, numPreguntas } o null si no existe todavía. */
export async function getClave(materiaId, parcialId, version) {
  const s = await get(ref(db, `parciales_claves/${materiaId}/${parcialId}/${version}`));
  return s.exists() ? s.val() : null;
}

export async function saveClave(materiaId, parcialId, version, { respuestas, numPreguntas }) {
  await set(ref(db, `parciales_claves/${materiaId}/${parcialId}/${version}`), {
    respuestas, numPreguntas, actualizadoEn: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// NOTA — calcula % de aciertos sobre numPreguntas y guarda en el expediente
// (mismo lugar que ya usa la pantalla de Expediente / el flujo de Gemini).
// ---------------------------------------------------------------------------

export function calcularNota(respuestasDetectadas, claveRespuestas, numPreguntas) {
  let correctas = 0;
  for (let q = 1; q <= numPreguntas; q++) {
    const marcada = respuestasDetectadas[q]?.marcada;
    if (marcada && marcada === claveRespuestas[q]) correctas++;
  }
  return Math.round((correctas / numPreguntas) * 1000) / 10; // 1 decimal
}

export async function aprobarNotaOmr(alumnoId, materiaId, parcialId, notaFinal) {
  const actuales = await getParciales(alumnoId, materiaId);
  await updateParciales(alumnoId, materiaId, { ...actuales, [parcialId]: notaFinal });
}

// ---------------------------------------------------------------------------
// BORRADOR — guarda el lote de fotos ya calificadas (pero sin terminar de
// asignar alumnos) para que sobreviva a un cierre de pestaña/navegador.
// Solo se guardan datos livianos (miniatura + respuestas ya leídas), nunca
// la foto original en resolución completa.
// ---------------------------------------------------------------------------

export async function getBorrador(materiaId, parcialId) {
  const s = await get(ref(db, `parciales_borrador/${materiaId}/${parcialId}`));
  return s.exists() ? s.val() : null;
}

export async function saveBorrador(materiaId, parcialId, { filas, numPreguntas }) {
  await set(ref(db, `parciales_borrador/${materiaId}/${parcialId}`), {
    filas, numPreguntas, actualizadoEn: Date.now(),
  });
}

export async function clearBorrador(materiaId, parcialId) {
  await set(ref(db, `parciales_borrador/${materiaId}/${parcialId}`), null);
}
