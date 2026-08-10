// =============================================================================
// AcadVet USAM — Wrapper del callable de Cloud Functions para el broadcast
// push manual del docente (ver functions/src/broadcast.js).
// =============================================================================

import { getFunctions, httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { app } from './firebase-config.js';

export async function sendBroadcastNotification({ title, body, materiaId = null }) {
  const fn  = httpsCallable(getFunctions(app), 'sendBroadcast');
  const res = await fn({ title, body, materiaId });
  return res.data; // { sent, failed }
}
