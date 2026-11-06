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

// Un carné de código de acceso manual puede traer espacios, minúsculas, etc.
// Debe coincidir exactamente con la normalización usada al generar la marca
// en functions/src/accessCode.js.
function normalizeCarnet(carnet) {
  return String(carnet || '').trim().toUpperCase().replace(/[.#$/[\]]/g, '_');
}

const OVERRIDE_WINDOW_MS = 5 * 60 * 1000; // vigencia de la marca de verifyAccessCode

// Verifica (del lado servidor) que el GPS de un registro QR esté dentro del
// radio del aula, cuando la sesión lo exige. No borra el registro ni lo
// bloquea — solo lo marca (geoValid/geoDistanceM) para que el docente lo vea
// como advertencia en el panel y decida. Un GPS "válido" aquí solo significa
// que la coordenada reportada cae dentro del radio: no puede detectar GPS
// falsificado (apps de ubicación falsa, DevTools), eso queda fuera del
// alcance de cualquier verificación del lado servidor.
//
// Excepción: si el alumno usó el código de acceso manual del docente (ver
// functions/src/accessCode.js) y quedó una marca vigente en geoOverrides,
// se fuerza geoValid=true aunque el GPS haya fallado o esté fuera de rango.
// La marca es de un solo uso: se borra acá mismo al consumirla.
exports.onQRAsistenteCreated = onValueCreated(
  'qr_sessions/{sessionId}/asistentes/{asistKey}',
  async (event) => {
    const { sessionId, asistKey } = event.params;
    const asistente = event.data.val() || {};

    const configSnap = await db.ref(`qr_sessions/${sessionId}/config`).once('value');
    const cfg = configSnap.val() || {};
    if (!cfg.requireGeo || cfg.aulaLat == null || cfg.aulaLng == null) return;

    const asistRef = db.ref(`qr_sessions/${sessionId}/asistentes/${asistKey}`);

    const distM = (asistente.lat != null && asistente.lng != null)
      ? haversine(asistente.lat, asistente.lng, cfg.aulaLat, cfg.aulaLng)
      : null;
    const radio = cfg.geoRadius ?? 100;

    if (distM != null && distM <= radio) {
      await asistRef.update({ geoValid: true, geoDistanceM: Math.round(distM) });
      return;
    }

    const overrideRef = db.ref(`qr_sessions/${sessionId}/geoOverrides/${normalizeCarnet(asistente.carnet)}`);
    const overrideTs  = (await overrideRef.once('value')).val();
    const hasOverride = typeof overrideTs === 'number' && (Date.now() - overrideTs) <= OVERRIDE_WINDOW_MS;

    if (hasOverride) {
      await overrideRef.remove();
      await asistRef.update({
        geoValid:     true,
        geoDistanceM: distM != null ? Math.round(distM) : null,
        geoOverride:  true,
      });
      return;
    }

    await asistRef.update({
      geoValid:     false,
      geoDistanceM: distM != null ? Math.round(distM) : null,
    });
  }
);
