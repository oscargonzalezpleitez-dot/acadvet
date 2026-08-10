const { db } = require('./admin');

/** IDs de los alumnos inscritos en una materia (mismo criterio que
 *  alumnosByMateria() en js/db.js, replicado del lado del servidor). */
async function getAlumnoIdsByMateria(materiaId) {
  const snap = await db.ref('alumnos').once('value');
  if (!snap.exists()) return [];
  const alumnos = snap.val();
  return Object.keys(alumnos).filter(
    (id) => alumnos[id]?.inscripciones?.[materiaId] !== undefined
  );
}

async function getAllAlumnoIds() {
  const snap = await db.ref('alumnos').once('value');
  if (!snap.exists()) return [];
  return Object.keys(snap.val());
}

module.exports = { getAlumnoIdsByMateria, getAllAlumnoIds };
