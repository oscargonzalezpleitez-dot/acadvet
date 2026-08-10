const { onValueWritten } = require('firebase-functions/v2/database');
const { db } = require('../admin');
const { sendToAlumnos } = require('../push');

const LABELS = { parcial_1: 'Parcial 1', parcial_2: 'Parcial 2', parcial_3: 'Parcial 3' };

// Registrado en el nodo padre "parciales" (sin wildcard de parcialId): como
// updateParciales() en js/db.js siempre hace un único set() del objeto
// completo, esto dispara UNA sola vez por guardado, no una por campo.
exports.onParcialWritten = onValueWritten(
  'alumnos/{alumnoId}/inscripciones/{materiaId}/parciales',
  async (event) => {
    const { alumnoId, materiaId } = event.params;
    const before = event.data.before.val() || {};
    const after  = event.data.after.val()  || {};

    const cambiados = Object.keys(LABELS).filter(
      (k) => after[k] != null && after[k] !== before[k]
    );
    if (!cambiados.length) return;

    const materiaSnap = await db.ref(`materias/${materiaId}/nombre`).once('value');
    const resumen = cambiados.map((k) => `${LABELS[k]}: ${after[k]}`).join(' · ');

    await sendToAlumnos([alumnoId], {
      title: 'Nueva calificación publicada',
      body:  `${materiaSnap.val() ?? 'Materia'} — ${resumen}`,
      url:   './mi-perfil.html',
    });
  }
);
