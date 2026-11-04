const { onValueCreated } = require('firebase-functions/v2/database');
const { db } = require('../admin');

// Haversine — distancia en metros entre dos coordenadas GPS. Duplicado de
// haversine() en js/registro.js: ese corre en el navegador del alumno (y se
// puede saltar llamando al SDK directo), este corre en el servidor con el
// Admin SDK, que ignora las reglas de Firebase, así que su resultado no
// depende de que el cliente haya cooperado.
function haversine(lat1, lng1, lat2, lng2) {
  const R  = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Verifica (del lado servidor) que el GPS de un registro QR esté dentro del
// radio del aula, cuando la sesión lo exige. No borra el registro ni lo
// bloquea — solo lo marca (geoValid/geoDistanceM) para que el docente lo vea
// como advertencia en el panel y decida. Un GPS "válido" aquí solo significa
// que la coordenada reportada cae dentro del radio: no puede detectar GPS
// falsificado (apps de ubicación falsa, DevTools), eso queda fuera del
// alcance de cualquier verificación del lado servidor.
exports.onQRAsistenteCreated = onValueCreated(
  'qr_sessions/{sessionId}/asistentes/{asistKey}',
  async (event) => {
    const { sessionId, asistKey } = event.params;
    const asistente = event.data.val() || {};

    const configSnap = await db.ref(`qr_sessions/${sessionId}/config`).once('value');
    const cfg = configSnap.val() || {};
    if (!cfg.requireGeo || cfg.aulaLat == null || cfg.aulaLng == null) return;

    const asistRef = db.ref(`qr_sessions/${sessionId}/asistentes/${asistKey}`);

    if (asistente.lat == null || asistente.lng == null) {
      await asistRef.update({ geoValid: false, geoDistanceM: null });
      return;
    }

    const distM = haversine(asistente.lat, asistente.lng, cfg.aulaLat, cfg.aulaLng);
    const radio = cfg.geoRadius ?? 100;

    await asistRef.update({
      geoValid:     distM <= radio,
      geoDistanceM: Math.round(distM),
    });
  }
);
