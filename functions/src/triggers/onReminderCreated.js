const { onValueCreated } = require('firebase-functions/v2/database');
const { getAlumnoIdsByMateria } = require('../alumnos');
const { sendToAlumnos } = require('../push');

exports.onReminderCreated = onValueCreated('reminders/{reminderId}', async (event) => {
  const r = event.data.val() || {};
  // Avisos sin materiaId (formato viejo, o el docente no seleccionó materia)
  // no se pueden dirigir con precisión — se dejan fuera a propósito, forward-only.
  if (!r.materiaId) return;

  const alumnoIds = await getAlumnoIdsByMateria(r.materiaId);
  if (!alumnoIds.length) return;

  await sendToAlumnos(alumnoIds, {
    title: r.title || 'Nuevo recordatorio',
    body:  r.message || (r.date ? `Fecha: ${r.date}` : ''),
    url:   './reminders.html',
  });
});
