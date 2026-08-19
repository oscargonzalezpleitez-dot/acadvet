const { onValueWritten } = require('firebase-functions/v2/database');
const { defineSecret } = require('firebase-functions/params');
const { db, bucket } = require('../admin');
const { gradeExam } = require('../ai-grading');

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Se dispara al crear una revisión nueva (estado "pendiente") y también al
// reintentar una que falló o se quiere recalificar (parciales-ia.js resetea
// "estado" a "pendiente" para eso) — por eso es onValueWritten y no
// onValueCreated, filtrando manualmente para no reprocesar en cada escritura
// (la propia función escribe "listo"/"error" en el mismo nodo, lo que
// dispararía este trigger de nuevo si no filtráramos).
exports.onParcialRevisionWritten = onValueWritten(
  {
    ref: 'parciales_revision/{materiaId}/{parcialId}/{alumnoId}',
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (event) => {
    const { materiaId, parcialId, alumnoId } = event.params;
    const before = event.data.before.val();
    const after  = event.data.after.val();

    if (!after || after.estado !== 'pendiente') return;
    if (before?.estado === 'pendiente') return; // ya se está procesando / re-escritura propia

    const path = `parciales_revision/${materiaId}/${parcialId}/${alumnoId}`;

    try {
      const rubricaSnap = await db.ref(`parciales_rubricas/${materiaId}/${parcialId}/texto`).once('value');
      const rubricaTexto = rubricaSnap.val();
      if (!rubricaTexto) {
        await db.ref(path).update({ estado: 'error', error: 'No hay rúbrica definida para este parcial.' });
        return;
      }

      if (!after.fotos?.length) {
        await db.ref(path).update({ estado: 'error', error: 'No hay fotos para este alumno.' });
        return;
      }

      const imagenesBase64 = await Promise.all(
        after.fotos.map(async (storagePath) => {
          const [buffer] = await bucket.file(storagePath).download();
          return buffer.toString('base64');
        })
      );

      const resultado = await gradeExam({
        apiKey: GEMINI_API_KEY.value(),
        rubricaTexto,
        imagenesBase64,
      });

      await db.ref(path).update({
        estado:        'listo',
        notaSugerida:  resultado.notaSugerida,
        confianza:     resultado.confianza,
        desglose:      resultado.desglose,
        avisos:        resultado.avisos,
        error:         null,
        calificadoEn:  Date.now(),
      });
    } catch (err) {
      console.error('[onParcialRevisionWritten]', materiaId, parcialId, alumnoId, err);
      await db.ref(path).update({
        estado: 'error',
        error:  String(err.message || err).slice(0, 500),
      });
    }
  }
);
