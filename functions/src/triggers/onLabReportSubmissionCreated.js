const { onValueCreated } = require('firebase-functions/v2/database');
const { db } = require('../admin');
const { sendToAlumnos } = require('../push');

// Mismo criterio de sanitización que sanitizeKey() en js/db.js, para
// resolver el carnet de la entrega al mismo nodo alumno_lookup/{carnetKey}.
function sanitizeKey(s) {
  return String(s ?? '').toLowerCase().trim().replace(/[.#$[\]/\s]/g, '_');
}

// Al llenar un reporte de laboratorio en lab-report.html el alumno no inicia
// sesión (solo se identifica con nombre/carné/correo) — por eso el envío no
// trae alumnoId directo, hay que resolverlo vía alumno_lookup por carnet.
exports.onLabReportSubmissionCreated = onValueCreated('lab_report_submissions/{subId}', async (event) => {
  const sub = event.data.val() || {};
  if (!sub.tardia) return;

  const carnet = sub.alumno?.carnet;
  if (!carnet) return;

  const lookupSnap = await db.ref(`alumno_lookup/${sanitizeKey(carnet)}`).once('value');
  if (!lookupSnap.exists()) return;

  const { alumnoId } = lookupSnap.val();
  if (!alumnoId) return;

  await sendToAlumnos([alumnoId], {
    title: 'Entrega tardía registrada',
    body:  `Tu reporte "${sub.templateNombre || 'de laboratorio'}" se recibió después de la fecha límite.`,
    url:   './lab-report.html',
  });
});
