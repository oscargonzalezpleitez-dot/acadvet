const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { db } = require('./admin');

function normalizeCarnet(carnet) {
  return String(carnet || '').trim().toUpperCase().replace(/[.#$/[\]]/g, '_');
}

// Valida el código de acceso manual que el docente le da en persona a un
// alumno que no puede registrarse por GPS (permiso denegado, imprecisión,
// etc.). El código vive solo en config/accessCode, un nodo que las reglas de
// la base de datos bloquean para cualquier cliente — únicamente el Admin SDK
// (este archivo) puede leerlo, así que nunca queda expuesto en el código
// fuente público ni es recuperable leyendo qr_sessions (que sí es legible
// por cualquier alumno con sesión anónima). Si coincide, deja una marca de
// un solo uso en geoOverrides que el trigger onQRAsistenteCreated consume al
// crear el registro de asistencia.
exports.verifyAccessCode = onCall(async (request) => {
  const { sessionId, carnet, code } = request.data || {};
  if (!sessionId || !carnet || !code) {
    throw new HttpsError('invalid-argument', 'Faltan datos.');
  }

  const secret = (await db.ref('config/accessCode').once('value')).val();
  if (!secret || String(code).trim() !== String(secret)) {
    return { valid: false };
  }

  await db.ref(`qr_sessions/${sessionId}/geoOverrides/${normalizeCarnet(carnet)}`).set(Date.now());
  return { valid: true };
});
