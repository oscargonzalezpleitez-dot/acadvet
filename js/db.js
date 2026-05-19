// =============================================================================
// AcadVet USAM — Capa de datos Firebase RTDB
// ÚNICA capa que habla con Firebase. Todo el resto llama estas funciones.
// =============================================================================

import { getDatabase, ref, get, set, push, update, remove, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const db = getDatabase(app);

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Convierte un snapshot con hijos en array [{ id, ...data }]. */
function snapToArray(snapshot) {
  if (!snapshot.exists()) return [];
  return Object.entries(snapshot.val()).map(([id, data]) => ({ id, ...data }));
}

/** Ruta base de inscripción de un alumno en una materia. */
const inscRef = (alumnoId, materiaId) =>
  `alumnos/${alumnoId}/inscripciones/${materiaId}`;

// ---------------------------------------------------------------------------
// MATERIAS
// ---------------------------------------------------------------------------

export async function getMaterias() {
  const s = await get(ref(db, 'materias'));
  return snapToArray(s);
}

export async function getMateria(id) {
  const s = await get(ref(db, `materias/${id}`));
  if (!s.exists()) return null;
  return { id, ...s.val() };
}

export async function createMateria({ nombre, ciclo, seccion = null }) {
  const newRef = push(ref(db, 'materias'));
  await set(newRef, {
    nombre,
    ciclo,
    seccion,
    estado: 'activa',
    creado_en: Date.now(),
  });
  return newRef.key;
}

export async function updateMateria(id, data) {
  await update(ref(db, `materias/${id}`), data);
}

export async function archivarMateria(id) {
  await update(ref(db, `materias/${id}`), { estado: 'archivada' });
}

// ---------------------------------------------------------------------------
// ALUMNOS
// ---------------------------------------------------------------------------

export async function getAlumnos() {
  const s = await get(ref(db, 'alumnos'));
  return snapToArray(s);
}

export async function getAlumno(id) {
  const s = await get(ref(db, `alumnos/${id}`));
  if (!s.exists()) return null;
  return { id, ...s.val() };
}

/**
 * Retorna alumnos inscritos en una materia específica.
 * Pasa el array de todos los alumnos para evitar un fetch extra.
 */
export function alumnosByMateria(todosAlumnos, materiaId) {
  return todosAlumnos.filter(a => a.inscripciones?.[materiaId] !== undefined);
}

export async function createAlumno({ nombre, carnet }) {
  const newRef = push(ref(db, 'alumnos'));
  await set(newRef, {
    nombre,
    carnet,
    creado_en: Date.now(),
  });
  return newRef.key;
}

export async function updateAlumno(id, data) {
  await update(ref(db, `alumnos/${id}`), data);
}

export async function deleteAlumno(id) {
  await remove(ref(db, `alumnos/${id}`));
}

// ---------------------------------------------------------------------------
// INSCRIPCIONES
// ---------------------------------------------------------------------------

export async function createInscripcion(alumnoId, materiaId) {
  await set(ref(db, `${inscRef(alumnoId, materiaId)}`), {
    inscrito_en: Date.now(),
    parciales: { parcial_1: null, parcial_2: null, parcial_3: null },
    observaciones: '',
  });
}

export async function deleteInscripcion(alumnoId, materiaId) {
  await remove(ref(db, inscRef(alumnoId, materiaId)));
}

/** Retorna el objeto completo de inscripción (asistencias, quizzes, etc.) */
export async function getInscripcion(alumnoId, materiaId) {
  const s = await get(ref(db, inscRef(alumnoId, materiaId)));
  if (!s.exists()) return null;
  return s.val();
}

// ---------------------------------------------------------------------------
// ASISTENCIAS
// ---------------------------------------------------------------------------

export async function getAsistencias(alumnoId, materiaId) {
  const s = await get(ref(db, `${inscRef(alumnoId, materiaId)}/asistencias`));
  return snapToArray(s);
}

export async function addAsistencia(alumnoId, materiaId, { fecha, estado }) {
  const newRef = push(ref(db, `${inscRef(alumnoId, materiaId)}/asistencias`));
  await set(newRef, { fecha, estado });
  return newRef.key;
}

export async function updateAsistencia(alumnoId, materiaId, asistId, data) {
  await update(
    ref(db, `${inscRef(alumnoId, materiaId)}/asistencias/${asistId}`),
    data
  );
}

export async function deleteAsistencia(alumnoId, materiaId, asistId) {
  await remove(ref(db, `${inscRef(alumnoId, materiaId)}/asistencias/${asistId}`));
}

// ---------------------------------------------------------------------------
// QUIZZES (exámenes cortos)
// ---------------------------------------------------------------------------

export async function getQuizzes(alumnoId, materiaId) {
  const s = await get(ref(db, `${inscRef(alumnoId, materiaId)}/quizzes`));
  return snapToArray(s);
}

export async function addQuiz(alumnoId, materiaId, { nombre, nota, fecha = null, area = 1 }) {
  const newRef = push(ref(db, `${inscRef(alumnoId, materiaId)}/quizzes`));
  await set(newRef, { nombre, nota, fecha, area });
  return newRef.key;
}

export async function updateQuiz(alumnoId, materiaId, quizId, data) {
  await update(
    ref(db, `${inscRef(alumnoId, materiaId)}/quizzes/${quizId}`),
    data
  );
}

export async function deleteQuiz(alumnoId, materiaId, quizId) {
  await remove(ref(db, `${inscRef(alumnoId, materiaId)}/quizzes/${quizId}`));
}

// ---------------------------------------------------------------------------
// PARCIALES
// ---------------------------------------------------------------------------

export async function getParciales(alumnoId, materiaId) {
  const s = await get(ref(db, `${inscRef(alumnoId, materiaId)}/parciales`));
  return s.exists()
    ? s.val()
    : { parcial_1: null, parcial_2: null, parcial_3: null };
}

/** data = { parcial_1, parcial_2, parcial_3 } — null si no está registrado */
export async function updateParciales(alumnoId, materiaId, data) {
  await set(ref(db, `${inscRef(alumnoId, materiaId)}/parciales`), {
    parcial_1: data.parcial_1 ?? null,
    parcial_2: data.parcial_2 ?? null,
    parcial_3: data.parcial_3 ?? null,
  });
}

// ---------------------------------------------------------------------------
// EXPOSICIONES
// ---------------------------------------------------------------------------

export async function getExposiciones(alumnoId, materiaId) {
  const s = await get(ref(db, `${inscRef(alumnoId, materiaId)}/exposiciones`));
  return snapToArray(s);
}

export async function addExposicion(alumnoId, materiaId, { tema, nota, fecha = null }) {
  const newRef = push(ref(db, `${inscRef(alumnoId, materiaId)}/exposiciones`));
  await set(newRef, { tema, nota, fecha });
  return newRef.key;
}

export async function updateExposicion(alumnoId, materiaId, expId, data) {
  await update(
    ref(db, `${inscRef(alumnoId, materiaId)}/exposiciones/${expId}`),
    data
  );
}

export async function deleteExposicion(alumnoId, materiaId, expId) {
  await remove(ref(db, `${inscRef(alumnoId, materiaId)}/exposiciones/${expId}`));
}

// ---------------------------------------------------------------------------
// OBSERVACIONES
// ---------------------------------------------------------------------------

export async function getObservaciones(alumnoId, materiaId) {
  const s = await get(ref(db, `${inscRef(alumnoId, materiaId)}/observaciones`));
  return s.exists() ? s.val() : '';
}

export async function updateObservaciones(alumnoId, materiaId, texto) {
  await set(ref(db, `${inscRef(alumnoId, materiaId)}/observaciones`), texto);
}

// ---------------------------------------------------------------------------
// SESIONES QR
// ---------------------------------------------------------------------------

export async function createQRSession({ materiaId, materiaNombre, ciclo, token, duration }) {
  const newRef = push(ref(db, 'qr_sessions'));
  const now = Date.now();
  await set(newRef, {
    materiaId,
    materiaNombre,
    ciclo: ciclo ?? '',
    token,
    duration,
    active: true,
    startedAt: now,
    rotatedAt: now,
    fecha: new Date().toISOString().slice(0, 10),
  });
  return newRef.key;
}

export async function updateQRSession(sessionId, data) {
  await update(ref(db, `qr_sessions/${sessionId}`), data);
}

export async function getQRSession(sessionId) {
  const s = await get(ref(db, `qr_sessions/${sessionId}`));
  if (!s.exists()) return null;
  return { id: sessionId, ...s.val() };
}

export async function addQRAsistente(sessionId, { nombre, carnet, alumnoId = null }) {
  const newRef = push(ref(db, `qr_sessions/${sessionId}/asistentes`));
  await set(newRef, { nombre, carnet, alumnoId, ts: Date.now() });
  return newRef.key;
}

export function listenQRAsistentes(sessionId, callback) {
  const dbRef = ref(db, `qr_sessions/${sessionId}/asistentes`);
  return onValue(dbRef, snapshot => {
    const arr = !snapshot.exists() ? [] :
      Object.entries(snapshot.val()).map(([id, d]) => ({ id, ...d }));
    callback(arr);
  });
}
