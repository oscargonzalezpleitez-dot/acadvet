const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { isDocenteOEps } = require('./email');
const { getAlumnoIdsByMateria, getAllAlumnoIds } = require('./alumnos');
const { sendToAlumnos } = require('./push');

exports.sendBroadcast = onCall(async (request) => {
  const email = request.auth?.token?.email;
  if (!email || !isDocenteOEps(email)) {
    throw new HttpsError('permission-denied', 'Solo el docente/EPS puede enviar avisos.');
  }

  const { title, body, materiaId } = request.data || {};
  if (!title || !body) {
    throw new HttpsError('invalid-argument', 'Falta título o mensaje.');
  }

  const alumnoIds = materiaId
    ? await getAlumnoIdsByMateria(materiaId)
    : await getAllAlumnoIds();

  return sendToAlumnos(alumnoIds, { title, body, url: './reminders.html' });
});
