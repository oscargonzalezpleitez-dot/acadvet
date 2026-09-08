// =============================================================================
// AcadVet USAM — Wrapper del callable de Cloud Functions para enviar el
// Informe Semanal por correo (ver functions/src/sendInformeEmail.js).
// =============================================================================

import { getFunctions, httpsCallable }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { app } from './firebase-config.js';

export async function sendInformeSemanalEmail({ to, subject, body, pdfBase64, filename }) {
  const fn  = httpsCallable(getFunctions(app), 'sendInformeSemanalEmail');
  const res = await fn({ to, subject, body, pdfBase64, filename });
  return res.data; // { sent: true }
}
