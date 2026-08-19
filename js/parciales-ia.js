// =============================================================================
// AcadVet USAM — Calificación de parciales físicos asistida por IA
// El docente fotografía cada examen, una Cloud Function llama a Gemini con
// la rúbrica del parcial y sugiere una nota; el docente siempre revisa y
// aprueba antes de que se escriba en el expediente del alumno.
// =============================================================================

import { getDatabase, ref, get, set, update, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { app } from './firebase-config.js';
import { getParciales, updateParciales } from './db.js';

const db      = getDatabase(app);
const storage = getStorage(app);

export const PARCIALES = [
  { id: 'parcial_1', label: 'Parcial I' },
  { id: 'parcial_2', label: 'Parcial II' },
  { id: 'parcial_3', label: 'Parcial III' },
];

// Mismo límite que usa Reportes de Práctica para no subir fotos de varios MB.
export const PHOTO_MAX_DIM      = 1600;
export const PHOTO_JPEG_QUALITY = 0.85;

// ---------------------------------------------------------------------------
// RÚBRICA
// ---------------------------------------------------------------------------

export async function getRubrica(materiaId, parcialId) {
  const s = await get(ref(db, `parciales_rubricas/${materiaId}/${parcialId}`));
  return s.exists() ? s.val() : { texto: '' };
}

export async function saveRubrica(materiaId, parcialId, texto) {
  await set(ref(db, `parciales_rubricas/${materiaId}/${parcialId}`), {
    texto,
    actualizadoEn: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// FOTOS
// ---------------------------------------------------------------------------

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen')), 'image/jpeg', PHOTO_JPEG_QUALITY);
  });
}

/** Sube una página del examen y devuelve el storage path (no la URL). */
export async function subirFotoExamen(canvas, materiaId, parcialId, alumnoId, pageIndex) {
  const blob = await toBlob(canvas);
  const path = `parciales_fotos/${materiaId}/${parcialId}/${alumnoId}/${Date.now()}-${pageIndex}.jpg`;
  await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
  return path;
}

export async function getFotoUrl(storagePath) {
  return getDownloadURL(storageRef(storage, storagePath));
}

// ---------------------------------------------------------------------------
// REVISIÓN (bandeja) — un nodo por alumno, dispara la Cloud Function que
// llama a Gemini apenas "estado" pasa a "pendiente".
// ---------------------------------------------------------------------------

/** Crea (o reemplaza) la revisión de un alumno con fotos nuevas → dispara la IA. */
export async function enviarACalificar(materiaId, parcialId, alumnoId, fotosPaths) {
  await set(ref(db, `parciales_revision/${materiaId}/${parcialId}/${alumnoId}`), {
    fotos:     fotosPaths,
    estado:    'pendiente',
    creadoEn:  Date.now(),
  });
}

/** Reintenta la calificación IA de una revisión ya existente (mismas fotos). */
export async function reintentarCalificacion(materiaId, parcialId, alumnoId) {
  await update(ref(db, `parciales_revision/${materiaId}/${parcialId}/${alumnoId}`), {
    estado: 'pendiente',
    error:  null,
  });
}

/** Escucha en tiempo real todas las revisiones de un materia+parcial. */
export function watchRevisiones(materiaId, parcialId, callback) {
  return onValue(ref(db, `parciales_revision/${materiaId}/${parcialId}`), snap => {
    callback(snap.exists() ? snap.val() : {});
  });
}

/**
 * Aprueba la nota (sugerida por la IA o editada a mano) y la escribe en el
 * expediente del alumno — mismo lugar que ya usa la pantalla de Expediente.
 */
export async function aprobarNota(alumnoId, materiaId, parcialId, notaFinal) {
  const actuales = await getParciales(alumnoId, materiaId);
  await updateParciales(alumnoId, materiaId, { ...actuales, [parcialId]: notaFinal });
  await update(ref(db, `parciales_revision/${materiaId}/${parcialId}/${alumnoId}`), {
    estado:      'aprobado',
    notaFinal,
    aprobadoEn:  Date.now(),
  });
}
