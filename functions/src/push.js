const { db, messaging } = require('./admin');

const BATCH_SIZE = 500; // límite de sendEachForMulticast

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Junta los pushTokens de una lista de alumnos en [{ alumnoId, tokenKey, token }]. */
async function collectTokens(alumnoIds) {
  const snaps = await Promise.all(
    alumnoIds.map((id) => db.ref(`alumnos/${id}/pushTokens`).once('value'))
  );
  const out = [];
  snaps.forEach((snap, i) => {
    if (!snap.exists()) return;
    const tokens = snap.val();
    Object.keys(tokens).forEach((tokenKey) => {
      const t = tokens[tokenKey]?.token;
      if (t) out.push({ alumnoId: alumnoIds[i], tokenKey, token: t });
    });
  });
  return out;
}

/** Manda una notificación "data-only" a los pushTokens de una lista de alumnos.
 *  Borra automáticamente los tokens que ya no son válidos. */
async function sendToAlumnos(alumnoIds, { title, body, url = './' }) {
  const entries = await collectTokens(alumnoIds);
  if (entries.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const invalid = [];

  for (const batch of chunk(entries, BATCH_SIZE)) {
    const resp = await messaging.sendEachForMulticast({
      tokens: batch.map((e) => e.token),
      data:   { title: String(title ?? ''), body: String(body ?? ''), url: String(url ?? './') },
    });
    resp.responses.forEach((r, i) => {
      if (r.success) {
        sent++;
      } else {
        failed++;
        const code = r.error?.code;
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-argument') {
          invalid.push(batch[i]);
        }
      }
    });
  }

  await Promise.all(
    invalid.map((e) => db.ref(`alumnos/${e.alumnoId}/pushTokens/${e.tokenKey}`).remove())
  );

  return { sent, failed };
}

module.exports = { sendToAlumnos };
