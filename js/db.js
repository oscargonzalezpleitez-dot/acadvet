// =============================================================================
// AcadVet USAM — Capa de datos Firebase RTDB
// ÚNICA capa que habla con Firebase. Todo el resto llama estas funciones.
// =============================================================================

import { getDatabase, ref, get, set, push, update, remove, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getStorage, ref as sRef, deleteObject }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { app } from './firebase-config.js';

const db      = getDatabase(app);
const storage = getStorage(app);

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

export async function createAlumno({ nombre, carnet, email = null, telefono = null, fotoUrl = null }) {
  const newRef = push(ref(db, 'alumnos'));
  await set(newRef, {
    nombre,
    carnet,
    email,
    telefono,
    fotoUrl,
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

export async function createQRSession({ materiaId, materiaNombre, ciclo, token, duration, config = {} }) {
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
    config: {
      photoRequired:    config.photoRequired    ?? false,
      onceDevice:       config.onceDevice       ?? false,
      markLate:         config.markLate         ?? false,
      lateMinutes:      config.lateMinutes      ?? 10,
      requireUsamEmail: config.requireUsamEmail ?? false,
      requireGeo:       config.requireGeo       ?? false,
      geoRadius:        config.geoRadius        ?? 100,
      aulaLat:          config.aulaLat          ?? null,
      aulaLng:          config.aulaLng          ?? null,
      checkType:        config.checkType        ?? 'unico',
      sessionStartedAt: now,
    },
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

// ---------------------------------------------------------------------------
// TAREAS (PDFs subidos por alumnos)
// ---------------------------------------------------------------------------

export async function getTareas(alumnoId, materiaId) {
  const s = await get(ref(db, `${inscRef(alumnoId, materiaId)}/tareas`));
  return snapToArray(s);
}

export async function addTarea(alumnoId, materiaId, { nombre, archivoNombre, url, storagePath, comentario = '', fecha }) {
  const newRef = push(ref(db, `${inscRef(alumnoId, materiaId)}/tareas`));
  await set(newRef, { nombre, archivoNombre, url, storagePath, comentario, fecha, subidoEn: Date.now() });
  return newRef.key;
}

// ---------------------------------------------------------------------------
// SOLICITUDES DE AUTO-INSCRIPCIÓN
// ---------------------------------------------------------------------------

export async function createSolicitud({ nombre, carnet, email, telefono, fotoUrl, storagePath, fotoB64 = null, materias, fecha }) {
  // Evitar duplicados: buscar solicitud pendiente o alumno con mismo carné
  const [solSnap, alSnap] = await Promise.all([
    get(ref(db, 'solicitudes_registro')),
    get(ref(db, 'alumnos')),
  ]);

  const carnetNorm = (carnet ?? '').toLowerCase().trim();

  if (solSnap.exists()) {
    const dup = Object.values(solSnap.val()).find(s =>
      (s.carnet ?? '').toLowerCase().trim() === carnetNorm && s.estado === 'pendiente'
    );
    if (dup) throw new Error('DUPLICADO_PENDIENTE');
  }

  if (alSnap.exists()) {
    const exists = Object.values(alSnap.val()).find(a =>
      (a.carnet ?? '').toLowerCase().trim() === carnetNorm
    );
    if (exists) throw new Error('YA_REGISTRADO');
  }

  const newRef = push(ref(db, 'solicitudes_registro'));
  await set(newRef, {
    nombre,
    carnet,
    email:       email       || null,
    telefono:    telefono    || null,
    fotoUrl:     fotoUrl     || null,
    storagePath: storagePath || null,
    fotoB64:     fotoB64     || null,
    materias,
    estado:      'pendiente',
    solicitadoEn: Date.now(),
    fecha,
  });
  return newRef.key;
}

export async function getSolicitudes() {
  const s = await get(ref(db, 'solicitudes_registro'));
  return snapToArray(s);
}

export async function aprobarSolicitud(solicitudId) {
  const s = await get(ref(db, `solicitudes_registro/${solicitudId}`));
  if (!s.exists()) throw new Error('Solicitud no encontrada');
  const sol = s.val();

  const alumnoRef = push(ref(db, 'alumnos'));
  await set(alumnoRef, {
    nombre:    sol.nombre,
    carnet:    sol.carnet,
    email:     sol.email     || null,
    telefono:  sol.telefono  || null,
    fotoUrl:   sol.fotoUrl   || null,
    fotoB64:   sol.fotoB64   || null,
    creado_en: Date.now(),
  });
  const alumnoId = alumnoRef.key;

  const materias = sol.materias || {};
  await Promise.all(
    Object.keys(materias).map(materiaId =>
      set(ref(db, `alumnos/${alumnoId}/inscripciones/${materiaId}`), {
        inscrito_en: Date.now(),
        parciales: { parcial_1: null, parcial_2: null, parcial_3: null },
        observaciones: '',
      })
    )
  );

  await update(ref(db, `solicitudes_registro/${solicitudId}`), {
    estado: 'aprobado',
    alumnoId,
    procesadoEn: Date.now(),
  });

  return alumnoId;
}

export async function rechazarSolicitud(solicitudId) {
  await update(ref(db, `solicitudes_registro/${solicitudId}`), {
    estado:      'rechazado',
    procesadoEn: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// ARCHIVO — sesiones QR para la vista de historial
// ---------------------------------------------------------------------------

/** Retorna todas las sesiones QR con su conteo de asistentes (sin fotos). */
export async function getQRSessions() {
  const s = await get(ref(db, 'qr_sessions'));
  if (!s.exists()) return [];
  return Object.entries(s.val())
    .map(([id, data]) => ({
      id,
      materiaId:       data.materiaId,
      materiaNombre:   data.materiaNombre,
      ciclo:           data.ciclo,
      fecha:           data.fecha,
      active:          data.active,
      startedAt:       data.startedAt,
      stoppedAt:       data.stoppedAt,
      config:          data.config,
      asistentesCount: data.asistentes ? Object.keys(data.asistentes).length : 0,
    }))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

/** Retorna los asistentes de una sesión ordenados por hora de registro. */
export async function getQRSessionAsistentes(sessionId) {
  const s = await get(ref(db, `qr_sessions/${sessionId}/asistentes`));
  return snapToArray(s).sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

/** Elimina una sesión QR completa (metadata + asistentes). */
export async function deleteQRSession(sessionId) {
  await remove(ref(db, `qr_sessions/${sessionId}`));
}

export async function deleteTarea(alumnoId, materiaId, tareaId, storagePath = null) {
  if (storagePath) {
    try { await deleteObject(sRef(storage, storagePath)); } catch (_) { /* archivo ya eliminado */ }
  }
  await remove(ref(db, `${inscRef(alumnoId, materiaId)}/tareas/${tareaId}`));
}

// ---------------------------------------------------------------------------
// CUESTIONARIOS EN LÍNEA
// ---------------------------------------------------------------------------

export async function createCuestionario({ nombre, desc, tiempo, mostrarNota, preguntas }) {
  const newRef = push(ref(db, 'cuestionarios'));
  await set(newRef, {
    nombre,
    desc: desc || '',
    tiempo,
    mostrarNota,
    creado_en: Date.now(),
    activo: true,
    preguntas: preguntas || [],
  });
  return newRef.key;
}

export async function getCuestionarios() {
  const s = await get(ref(db, 'cuestionarios'));
  return snapToArray(s).sort((a, b) => (b.creado_en || 0) - (a.creado_en || 0));
}

export async function getCuestionario(id) {
  const s = await get(ref(db, `cuestionarios/${id}`));
  if (!s.exists()) return null;
  return { id, ...s.val() };
}

export async function deleteCuestionario(id) {
  await remove(ref(db, `cuestionarios/${id}`));
}

export async function updateCuestionario(id, { nombre, desc, tiempo, mostrarNota, preguntas }) {
  await update(ref(db, `cuestionarios/${id}`), { nombre, desc: desc || '', tiempo, mostrarNota, preguntas });
}

export async function toggleCuestionarioActivo(id, activo) {
  await update(ref(db, `cuestionarios/${id}`), { activo });
}

// ---------------------------------------------------------------------------
// CUESTIONARIOS — RESULTADOS DE ALUMNOS
// ---------------------------------------------------------------------------

export async function saveCuestionarioResultado(resultado) {
  const newRef = push(ref(db, 'cuestionarios_resultados'));
  await set(newRef, { ...resultado, guardado_en: Date.now() });
  return newRef.key;
}

export async function getCuestionariosResultados() {
  const s = await get(ref(db, 'cuestionarios_resultados'));
  return snapToArray(s).sort((a, b) => (b.submitTime || 0) - (a.submitTime || 0));
}
