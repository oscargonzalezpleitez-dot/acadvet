// =============================================================================
// AcadVet USAM — Capa de datos Firebase RTDB
// ÚNICA capa que habla con Firebase. Todo el resto llama estas funciones.
// =============================================================================

import { getDatabase, ref, get, set, push, update, remove, onValue, onDisconnect, runTransaction }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getStorage, ref as sRef, deleteObject, uploadBytes, getDownloadURL }
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
// TAREAS ASIGNADAS — el docente publica una tarea para toda la materia
// (dispara notificación push a los inscritos vía Cloud Function).
// ---------------------------------------------------------------------------

export async function addTareaAsignada(materiaId, { titulo, descripcion = '', fechaLimite }) {
  const newRef = push(ref(db, `materias/${materiaId}/tareas_asignadas`));
  await set(newRef, { titulo, descripcion, fechaLimite, creadaEn: Date.now() });
  return newRef.key;
}

export async function getTareasAsignadas(materiaId) {
  const s = await get(ref(db, `materias/${materiaId}/tareas_asignadas`));
  return snapToArray(s).sort((a, b) => (b.creadaEn || 0) - (a.creadaEn || 0));
}

export async function deleteTareaAsignada(materiaId, id) {
  await remove(ref(db, `materias/${materiaId}/tareas_asignadas/${id}`));
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
  await syncAlumnoLookup(newRef.key);
  return newRef.key;
}

export async function updateAlumno(id, data) {
  const before = await get(ref(db, `alumnos/${id}/carnet`));
  await update(ref(db, `alumnos/${id}`), data);
  await syncAlumnoLookup(id, before.exists() ? before.val() : null);
}

export async function deleteAlumno(id) {
  const before = await get(ref(db, `alumnos/${id}/carnet`));
  await remove(ref(db, `alumnos/${id}`));
  await remove(ref(db, `alumno_observaciones/${id}`));
  await remove(ref(db, `presencia_alumnos/${id}`));
  if (before.exists()) await remove(ref(db, `alumno_lookup/${sanitizeKey(before.val())}`));
}

// ---------------------------------------------------------------------------
// PUSH TOKENS — un alumno puede tener varios (uno por dispositivo instalado).
// ---------------------------------------------------------------------------

export async function savePushToken(alumnoId, token) {
  await set(ref(db, `alumnos/${alumnoId}/pushTokens/${sanitizeKey(token)}`), {
    token, savedAt: Date.now(), ua: navigator.userAgent,
  });
}

export async function deletePushToken(alumnoId, token) {
  await remove(ref(db, `alumnos/${alumnoId}/pushTokens/${sanitizeKey(token)}`));
}

// ---------------------------------------------------------------------------
// PRESENCIA — alumnos con el portal abierto en este momento.
// Usa .info/connected + onDisconnect() para que la marca se borre sola al
// cerrar la pestaña o perder la conexión, sin depender de un logout explícito.
// ---------------------------------------------------------------------------

export function marcarAlumnoConectado(alumnoId, { nombre, carnet }) {
  const presenceRef  = ref(db, `presencia_alumnos/${alumnoId}`);
  const connectedRef = ref(db, '.info/connected');
  return onValue(connectedRef, (snapshot) => {
    if (snapshot.val() !== true) return;
    onDisconnect(presenceRef).remove().then(() => {
      set(presenceRef, { nombre, carnet, desde: Date.now() });
    });
  });
}

export async function marcarAlumnoDesconectado(alumnoId) {
  await remove(ref(db, `presencia_alumnos/${alumnoId}`));
}

export function watchAlumnosConectados(callback) {
  return onValue(ref(db, 'presencia_alumnos'), (snapshot) => {
    const arr = snapToArray(snapshot).sort((a, b) => (b.desde ?? 0) - (a.desde ?? 0));
    callback(arr);
  });
}

// ---------------------------------------------------------------------------
// ALUMNO_LOOKUP — índice público (solo lectura) para que el alumno encuentre
// su propio alumnoId por carné desde el portal, sin exponer notas ni datos
// de otros alumnos. Se recalcula cada vez que cambian los datos del alumno
// o sus inscripciones. Ver "Mi Perfil" (mi-perfil.html / js/mi-perfil.js).
// ---------------------------------------------------------------------------

async function syncAlumnoLookup(alumnoId, carnetAnterior = null) {
  const s = await get(ref(db, `alumnos/${alumnoId}`));

  if (!s.exists()) {
    if (carnetAnterior) await remove(ref(db, `alumno_lookup/${sanitizeKey(carnetAnterior)}`));
    return;
  }

  const a = s.val();
  const carnetKey = sanitizeKey(a.carnet);

  if (carnetAnterior && sanitizeKey(carnetAnterior) !== carnetKey) {
    await remove(ref(db, `alumno_lookup/${sanitizeKey(carnetAnterior)}`));
  }

  await set(ref(db, `alumno_lookup/${carnetKey}`), {
    alumnoId,
    nombre: a.nombre ?? '',
    materiaIds: Object.keys(a.inscripciones ?? {}).reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {}),
  });
}

/**
 * Reconstruye alumno_lookup para TODOS los alumnos existentes. Se llama una
 * sola vez de forma automática (ver js/app.js) para dar de alta el índice
 * de alumnos creados antes de que existiera "Mi Perfil".
 */
export async function backfillAlumnoLookup() {
  const s = await get(ref(db, 'alumnos'));
  if (!s.exists()) return;
  const ids = Object.keys(s.val());
  for (const id of ids) {
    await syncAlumnoLookup(id);
  }
}

// ---------------------------------------------------------------------------
// INSCRIPCIONES
// ---------------------------------------------------------------------------

export async function createInscripcion(alumnoId, materiaId) {
  await set(ref(db, `${inscRef(alumnoId, materiaId)}`), {
    inscrito_en: Date.now(),
    parciales: { parcial_1: null, parcial_2: null, parcial_3: null },
  });
  await syncAlumnoLookup(alumnoId);
}

export async function deleteInscripcion(alumnoId, materiaId) {
  await remove(ref(db, inscRef(alumnoId, materiaId)));
  await remove(ref(db, `alumno_observaciones/${alumnoId}/${materiaId}`));
  await syncAlumnoLookup(alumnoId);
}

/** Retorna el objeto completo de inscripción (asistencias, quizzes, etc.) */
export async function getInscripcion(alumnoId, materiaId) {
  const s = await get(ref(db, inscRef(alumnoId, materiaId)));
  if (!s.exists()) return null;
  const insc = s.val();
  insc.observaciones = await getObservaciones(alumnoId, materiaId);
  return insc;
}

// ---------------------------------------------------------------------------
// ASISTENCIAS
// ---------------------------------------------------------------------------

export async function getAsistencias(alumnoId, materiaId) {
  const s = await get(ref(db, `${inscRef(alumnoId, materiaId)}/asistencias`));
  return snapToArray(s);
}

export async function addAsistencia(alumnoId, materiaId, { fecha, estado, area = 1 }) {
  const newRef = push(ref(db, `${inscRef(alumnoId, materiaId)}/asistencias`));
  await set(newRef, { fecha, estado, area });
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

/** Nota del examen de diagnóstico (escala 0–10). null para borrarla. */
export async function updateNotaDiagnostico(alumnoId, materiaId, nota) {
  await set(ref(db, `${inscRef(alumnoId, materiaId)}/nota_diagnostico`), nota ?? null);
}

// ---------------------------------------------------------------------------
// EXPOSICIONES
// ---------------------------------------------------------------------------

export async function getExposiciones(alumnoId, materiaId) {
  const s = await get(ref(db, `${inscRef(alumnoId, materiaId)}/exposiciones`));
  return snapToArray(s);
}

export async function addExposicion(alumnoId, materiaId, {
  tema, nota, fecha = null, sorteoId = null, grupoIndex = null, rubrica = null, total100 = null,
}) {
  const newRef = push(ref(db, `${inscRef(alumnoId, materiaId)}/exposiciones`));
  const payload = { tema, nota, fecha };
  if (sorteoId   !== null) payload.sorteoId   = sorteoId;
  if (grupoIndex !== null) payload.grupoIndex = grupoIndex;
  if (rubrica    !== null) payload.rubrica    = rubrica;
  if (total100   !== null) payload.total100   = total100;
  await set(newRef, payload);
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
  const s = await get(ref(db, `alumno_observaciones/${alumnoId}/${materiaId}`));
  if (s.exists()) return s.val();
  // Compatibilidad: observaciones antiguas que aún viven dentro de la inscripción
  // (antes de moverlas a su propio nodo protegido). Se migran solas al guardar.
  const legacy = await get(ref(db, `${inscRef(alumnoId, materiaId)}/observaciones`));
  return legacy.exists() ? legacy.val() : '';
}

export async function updateObservaciones(alumnoId, materiaId, texto) {
  await set(ref(db, `alumno_observaciones/${alumnoId}/${materiaId}`), texto);
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
      area:             config.area              ?? 1,
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

/** Marca en la sesión QR que un asistente fue emparejado con un alumno inscrito. */
export async function setQRAsistenteAlumno(sessionId, asistenteId, alumnoId) {
  await update(ref(db, `qr_sessions/${sessionId}/asistentes/${asistenteId}`), { alumnoId });
}

/**
 * Sube a Storage la selfie (base64 JPEG, sin el prefijo data:) tomada al
 * marcar asistencia por QR. Corre en el navegador del docente (auth con
 * password), que es quien copia el registro al expediente del alumno.
 */
async function uploadAsistenciaSelfie(base64, alumnoId, asistenteId) {
  const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob();
  const path = `asistencia-fotos/${alumnoId}/${asistenteId}.jpg`;
  const snap = await uploadBytes(sRef(storage, path), blob, { contentType: 'image/jpeg' });
  const url  = await getDownloadURL(snap.ref);
  return { fotoUrl: url, fotoPath: path };
}

/**
 * Aplica al expediente la asistencia de un registro QR.
 * Usa el id del asistente como clave para que reintentos no dupliquen.
 * Si el registro trae selfie, la sube a Storage y guarda la URL junto con
 * el resto de la asistencia (si la subida falla, la asistencia igual se
 * guarda sin foto en vez de perderse).
 */
export async function applyQRAsistencia(alumnoId, materiaId, asistenteId, { fecha, estado, checkType, area = 1, selfieB64 = null }) {
  let foto = {};
  if (selfieB64) {
    try {
      foto = await uploadAsistenciaSelfie(selfieB64, alumnoId, asistenteId);
    } catch (err) {
      console.error('[AcadVet] Error subiendo selfie de asistencia:', err);
    }
  }
  await set(
    ref(db, `${inscRef(alumnoId, materiaId)}/asistencias/qr_${asistenteId}`),
    { fecha, estado, checkType, area, ...foto }
  );
}

// ---------------------------------------------------------------------------
// GRUPOS DE TRABAJO (sorteos al azar por materia)
// ---------------------------------------------------------------------------

export async function createGrupoSorteo({ materiaId, materiaNombre, ciclo, tamano, alumnos, grupos }) {
  const newRef = push(ref(db, 'grupos_sorteos'));
  const now = Date.now();
  await set(newRef, {
    materiaId,
    materiaNombre,
    ciclo: ciclo ?? '',
    tamano,
    alumnos,   // { alumnoId: nombre } — snapshot para que el historial sobreviva a bajas
    grupos,    // [ [alumnoId, ...], ... ]
    estado: 'sorteando',
    fecha: new Date().toISOString().slice(0, 10),
    createdAt: now,
    updatedAt: now,
  });
  return newRef.key;
}

export async function updateGrupoSorteo(sorteoId, data) {
  await update(ref(db, `grupos_sorteos/${sorteoId}`), { ...data, updatedAt: Date.now() });
}

export async function getGrupoSorteo(sorteoId) {
  const s = await get(ref(db, `grupos_sorteos/${sorteoId}`));
  if (!s.exists()) return null;
  return { id: sorteoId, ...s.val() };
}

export function listenGrupoSorteo(sorteoId, callback) {
  const dbRef = ref(db, `grupos_sorteos/${sorteoId}`);
  return onValue(dbRef, snapshot => {
    callback(snapshot.exists() ? { id: sorteoId, ...snapshot.val() } : null);
  });
}

/** Historial de sorteos de una materia, más reciente primero. */
export async function getGruposSorteosByMateria(materiaId) {
  const s = await get(ref(db, 'grupos_sorteos'));
  if (!s.exists()) return [];
  return Object.entries(s.val())
    .map(([id, data]) => ({ id, ...data }))
    .filter(g => g.materiaId === materiaId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function deleteGrupoSorteo(sorteoId) {
  await remove(ref(db, `grupos_sorteos/${sorteoId}`));
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
  // Anti-duplicados sin leer datos privados: el alumno anónimo no puede leer
  // solicitudes_registro ni alumnos, así que se reclama un índice write-once
  // por carné. Las reglas rechazan la escritura si el carné ya fue reclamado.
  const carnetNorm = (carnet ?? '').toLowerCase().trim();
  try {
    await set(ref(db, `solicitudes_idx/${carnetNorm}`), true);
  } catch (err) {
    if (String(err?.message ?? err).toUpperCase().includes('PERMISSION_DENIED')) {
      throw new Error('DUPLICADO_PENDIENTE');
    }
    throw err;
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
  // Reclamo atómico: si dos taps (o dos pestañas) llaman aprobarSolicitud() al
  // mismo tiempo, solo el primero logra pasar 'pendiente' -> 'aprobando'. El
  // segundo ve el estado ya cambiado y la transacción no se compromete, evitando
  // que se creen dos alumnos duplicados para la misma solicitud.
  const estadoRef = ref(db, `solicitudes_registro/${solicitudId}/estado`);
  const claim = await runTransaction(estadoRef, current => {
    if (current !== 'pendiente') return; // aborta sin tocar nada
    return 'aprobando';
  });
  if (!claim.committed) throw new Error('Esta solicitud ya fue procesada.');

  try {
    const s = await get(ref(db, `solicitudes_registro/${solicitudId}`));
    if (!s.exists()) throw new Error('Solicitud no encontrada');
    const sol = s.val();

    // Si el carné ya tiene un alumno registrado (p. ej. solicitud repetida),
    // reutilizamos ese registro en vez de crear uno duplicado: un carné
    // duplicado deja el alumno_lookup apuntando a un solo nodo y el otro
    // queda huérfano con su historial de asistencias inaccesible.
    const lookupSnap = await get(ref(db, `alumno_lookup/${sanitizeKey(sol.carnet)}`));
    const alumnoId = lookupSnap.exists()
      ? lookupSnap.val().alumnoId
      : push(ref(db, 'alumnos')).key;

    if (!lookupSnap.exists()) {
      await set(ref(db, `alumnos/${alumnoId}`), {
        nombre:    sol.nombre,
        carnet:    sol.carnet,
        email:     sol.email     || null,
        telefono:  sol.telefono  || null,
        fotoUrl:   sol.fotoUrl   || null,
        fotoB64:   sol.fotoB64   || null,
        creado_en: Date.now(),
      });
    }

    const materias = sol.materias || {};
    await Promise.all(
      Object.keys(materias).map(async materiaId => {
        // No pisar una inscripción que ya existía (evita borrar parciales/
        // asistencias si el alumno reusado ya estaba inscrito en esa materia).
        const yaInscrito = await get(ref(db, `alumnos/${alumnoId}/inscripciones/${materiaId}`));
        if (yaInscrito.exists()) return;
        await set(ref(db, `alumnos/${alumnoId}/inscripciones/${materiaId}`), {
          inscrito_en: Date.now(),
          parciales: { parcial_1: null, parcial_2: null, parcial_3: null },
        });
      })
    );

    await syncAlumnoLookup(alumnoId);

    await update(ref(db, `solicitudes_registro/${solicitudId}`), {
      estado: 'aprobado',
      alumnoId,
      procesadoEn: Date.now(),
    });

    return alumnoId;
  } catch (err) {
    // Si algo falla después del reclamo, devolvemos el estado a 'pendiente'
    // para que la solicitud no quede atascada en 'aprobando' para siempre.
    await runTransaction(estadoRef, current => current === 'aprobando' ? 'pendiente' : current);
    throw err;
  }
}

export async function rechazarSolicitud(solicitudId) {
  await update(ref(db, `solicitudes_registro/${solicitudId}`), {
    estado:      'rechazado',
    procesadoEn: Date.now(),
  });
  await liberarCarnetIdx(solicitudId);
}

export async function deleteSolicitud(solicitudId) {
  await liberarCarnetIdx(solicitudId);
  await remove(ref(db, `solicitudes_registro/${solicitudId}`));
}

/** Libera el carné en solicitudes_idx para que el alumno pueda volver a
 *  solicitar. No se libera si la solicitud fue aprobada: el carné queda
 *  bloqueado porque ya existe como alumno. */
async function liberarCarnetIdx(solicitudId) {
  try {
    const s = await get(ref(db, `solicitudes_registro/${solicitudId}`));
    if (!s.exists() || s.val().estado === 'aprobado') return;
    const carnetNorm = (s.val().carnet ?? '').toLowerCase().trim();
    if (carnetNorm) await remove(ref(db, `solicitudes_idx/${carnetNorm}`));
  } catch (err) {
    console.warn('[db] No se pudo liberar el carné del índice:', err);
  }
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

/** Sanitiza el carnet para usarlo como clave de Firebase (sin caracteres especiales). */
function sanitizeKey(s) {
  return String(s ?? '').toLowerCase().trim().replace(/[.#$\[\]\/\s]/g, '_');
}

/**
 * Crea un cuestionario separando las respuestas correctas en un nodo restringido.
 * - cuestionarios/{id}          → preguntas SIN campo 'correcta' (lectura pública con auth)
 * - cuestionarios_correctas/{id} → { respuestas: [], puntos: [] } (solo admin)
 */
export async function createCuestionario({ nombre, desc, tiempo, mostrarNota, preguntas }) {
  const newRef = push(ref(db, 'cuestionarios'));
  const id     = newRef.key;

  const preguntasPublicas = (preguntas || []).map(({ correcta, ...rest }) => rest);
  const respuestas        = (preguntas || []).map(p => p.correcta ?? null);
  const puntos            = (preguntas || []).map(p => p.puntos ?? 1);

  await Promise.all([
    set(newRef, {
      nombre,
      desc: desc || '',
      tiempo,
      mostrarNota,
      creado_en: Date.now(),
      activo: true,
      preguntas: preguntasPublicas,
    }),
    set(ref(db, `cuestionarios_correctas/${id}`), { respuestas, puntos }),
  ]);

  return id;
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

/** Retorna las respuestas correctas de un cuestionario (solo accesible como admin). */
export async function getCuestionarioCorrect(id) {
  const s = await get(ref(db, `cuestionarios_correctas/${id}`));
  return s.exists() ? s.val() : null;
}

/** Retorna mapa { quizId → { respuestas, puntos } } para calificar resultados en el panel. */
export async function getCuestionariosCorrectMap() {
  const s = await get(ref(db, 'cuestionarios_correctas'));
  return s.exists() ? s.val() : {};
}

/** Elimina cuestionario y sus respuestas almacenadas. */
export async function deleteCuestionario(id) {
  await Promise.all([
    remove(ref(db, `cuestionarios/${id}`)),
    remove(ref(db, `cuestionarios_correctas/${id}`)),
  ]);
}

/**
 * Actualiza cuestionario y sus respuestas. Las preguntas se guardan sin 'correcta'
 * en el nodo público; las respuestas van al nodo restringido.
 */
export async function updateCuestionario(id, { nombre, desc, tiempo, mostrarNota, preguntas }) {
  const preguntasPublicas = (preguntas || []).map(({ correcta, ...rest }) => rest);
  const respuestas        = (preguntas || []).map(p => p.correcta ?? null);
  const puntos            = (preguntas || []).map(p => p.puntos ?? 1);

  await Promise.all([
    update(ref(db, `cuestionarios/${id}`), {
      nombre,
      desc: desc || '',
      tiempo,
      mostrarNota,
      preguntas: preguntasPublicas,
    }),
    set(ref(db, `cuestionarios_correctas/${id}`), { respuestas, puntos }),
  ]);
}

export async function toggleCuestionarioActivo(id, activo) {
  await update(ref(db, `cuestionarios/${id}`), { activo });
}

// ---------------------------------------------------------------------------
// CUESTIONARIOS — RESULTADOS DE ALUMNOS
// ---------------------------------------------------------------------------

/**
 * Verifica si un alumno ya entregó un cuestionario (lectura de cuestionarios_enviados).
 * Requiere auth (anónima o de docente).
 */
export async function checkYaRespondio(quizId, carnet) {
  const key  = sanitizeKey(carnet);
  const snap = await get(ref(db, `cuestionarios_enviados/${quizId}/${key}`));
  return snap.exists();
}

/**
 * Guarda un resultado de cuestionario de forma atómica usando multi-path update:
 * - cuestionarios_enviados/{quizId}/{carnetKey} — falla si ya existe (regla !data.exists())
 * - cuestionarios_resultados/{newId}             — el resultado completo
 *
 * Al ser un solo update(), ambas escrituras son atómicas: si cualquiera falla
 * (incluyendo PERMISSION_DENIED por duplicado), ninguna se aplica.
 */
export async function saveCuestionarioResultado(quizId, carnet, resultado) {
  const key    = sanitizeKey(carnet);
  const newRef = push(ref(db, 'cuestionarios_resultados')); // genera key sin escribir

  const updates = {};
  updates[`cuestionarios_enviados/${quizId}/${key}`]  = Date.now();
  updates[`cuestionarios_resultados/${newRef.key}`]   = { ...resultado, carnet, guardado_en: Date.now() };

  // update() en la raíz aplica ambas rutas atómicamente
  await update(ref(db), updates);
  return newRef.key;
}

export async function getCuestionariosResultados() {
  const s = await get(ref(db, 'cuestionarios_resultados'));
  return snapToArray(s).sort((a, b) => (b.submitTime || 0) - (a.submitTime || 0));
}

export async function deleteLabReport(id) {
  await remove(ref(db, `lab_reports/${id}`));
}

export async function getLabReportsByCarnet(carnet) {
  const norm = (carnet ?? '').toLowerCase().trim().replace(/-/g, '');
  const s    = await get(ref(db, 'lab_reports'));
  return snapToArray(s)
    .filter(r => ((r.student_id ?? '').toLowerCase().trim().replace(/-/g, '')) === norm)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export async function getCuestionariosResultadosByCarnet(carnet) {
  const norm = (carnet ?? '').toLowerCase().trim().replace(/-/g, '');
  const s    = await get(ref(db, 'cuestionarios_resultados'));
  return snapToArray(s)
    .filter(r => {
      // El carné puede estar en r.carnet (raíz) o en r.alumno.carnet (anidado)
      const rc = ((r.carnet ?? r.alumno?.carnet) ?? '').toLowerCase().trim().replace(/-/g, '');
      return rc === norm;
    })
    .sort((a, b) => (b.submitTime || 0) - (a.submitTime || 0));
}

export async function deleteResultado(id) {
  // Leer el resultado para obtener quizId y carnet antes de borrarlo
  const snap = await get(ref(db, `cuestionarios_resultados/${id}`));
  const updates = {};
  updates[`cuestionarios_resultados/${id}`] = null;
  if (snap.exists()) {
    const { cuestionarioId, carnet } = snap.val();
    if (cuestionarioId && carnet) {
      // Limpiar el slot en cuestionarios_enviados para que el alumno pueda retomar
      updates[`cuestionarios_enviados/${cuestionarioId}/${sanitizeKey(carnet)}`] = null;
    }
  }
  await update(ref(db), updates);
}

export async function deleteResultadosByQuiz(quizId) {
  const s   = await get(ref(db, 'cuestionarios_resultados'));
  const ids = snapToArray(s)
    .filter(r => r.cuestionarioId === quizId)
    .map(r => r.id);

  const updates = {};
  ids.forEach(id => { updates[`cuestionarios_resultados/${id}`] = null; });
  // Limpiar todos los slots de entrega del quiz para que los alumnos puedan retomarlo
  updates[`cuestionarios_enviados/${quizId}`] = null;

  if (Object.keys(updates).length > 0) await update(ref(db), updates);
  return ids.length;
}

// ---------------------------------------------------------------------------
// REPORTES DE LABORATORIO — PLANTILLAS EDITABLES Y ENTREGAS DE ALUMNOS
//
// Distinto del módulo lab_reports (captura de foto de la práctica): acá el
// docente arma una plantilla con secciones de texto (objetivos, materiales,
// procedimiento, etc.) por práctica, y el alumno la llena en línea desde
// lab-report.html. Sin nodo de respuestas correctas — no se califica
// automáticamente, el docente revisa el texto entregado.
// ---------------------------------------------------------------------------

export async function createLabReportTemplate({ nombre, desc, secciones }) {
  const newRef = push(ref(db, 'lab_report_templates'));
  await set(newRef, {
    nombre,
    desc: desc || '',
    creado_en: Date.now(),
    activo: true,
    secciones: secciones || [],
  });
  return newRef.key;
}

export async function getLabReportTemplates() {
  const s = await get(ref(db, 'lab_report_templates'));
  return snapToArray(s).sort((a, b) => (b.creado_en || 0) - (a.creado_en || 0));
}

export async function getLabReportTemplate(id) {
  const s = await get(ref(db, `lab_report_templates/${id}`));
  if (!s.exists()) return null;
  return { id, ...s.val() };
}

export async function updateLabReportTemplate(id, { nombre, desc, secciones }) {
  await update(ref(db, `lab_report_templates/${id}`), {
    nombre,
    desc: desc || '',
    secciones: secciones || [],
  });
}

export async function toggleLabReportTemplateActivo(id, activo) {
  await update(ref(db, `lab_report_templates/${id}`), { activo });
}

export async function deleteLabReportTemplate(id) {
  await Promise.all([
    remove(ref(db, `lab_report_templates/${id}`)),
    deleteLabReportSubmissionsByTemplate(id),
  ]);
}

/**
 * Guarda la entrega de un alumno. 'secciones' del alumno se copian junto con
 * la respuesta (titulo, tipo) para que la entrega quede autocontenida y se
 * pueda exportar aunque el docente después edite o borre la plantilla.
 */
export async function saveLabReportSubmission({ templateId, templateNombre, templateDesc, alumno, respuestas }) {
  const newRef = push(ref(db, 'lab_report_submissions'));
  await set(newRef, {
    templateId,
    templateNombre,
    templateDesc: templateDesc || '',
    alumno,
    respuestas,
    submitTime: Date.now(),
  });
  return newRef.key;
}

export async function getLabReportSubmissions() {
  const s = await get(ref(db, 'lab_report_submissions'));
  return snapToArray(s).sort((a, b) => (b.submitTime || 0) - (a.submitTime || 0));
}

export async function deleteLabReportSubmission(id) {
  await remove(ref(db, `lab_report_submissions/${id}`));
}

export async function deleteLabReportSubmissionsByTemplate(templateId) {
  const s   = await get(ref(db, 'lab_report_submissions'));
  const ids = snapToArray(s).filter(r => r.templateId === templateId).map(r => r.id);

  const updates = {};
  ids.forEach(id => { updates[`lab_report_submissions/${id}`] = null; });
  if (Object.keys(updates).length > 0) await update(ref(db), updates);
  return ids.length;
}
