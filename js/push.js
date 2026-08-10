// =============================================================================
// AcadVet USAM — Notificaciones push (Firebase Cloud Messaging)
// Capa reutilizable: permiso, token, activar/desactivar por alumno.
// =============================================================================

import { getMessaging, getToken, deleteToken, onMessage, isSupported }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';
import { app, VAPID_KEY } from './firebase-config.js';
import { savePushToken, deletePushToken } from './db.js';

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** true si este navegador puede usar push ahora mismo (soporte + iOS standalone). */
export async function canUsePush() {
  if (isIOS() && !isStandalone()) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function requestPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

/** Obtiene el token FCM reusando el sw.js ya registrado (nunca deja que el
 *  SDK registre su propio firebase-messaging-sw.js, colisionaría de scope). */
export async function getMessagingToken() {
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  return getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
}

/** Pide permiso, obtiene el token y lo guarda vinculado al alumno autenticado. */
export async function activarPushParaAlumno(alumnoId) {
  const perm = await requestPushPermission();
  if (perm !== 'granted') throw new Error('PERMISO_DENEGADO');
  const token = await getMessagingToken();
  await savePushToken(alumnoId, token);
  return token;
}

export async function desactivarPushParaAlumno(alumnoId, token) {
  await deletePushToken(alumnoId, token);
  try { await deleteToken(getMessaging(app)); } catch (_) {}
}

/** Foreground: la pestaña activa no recibe el evento 'push' del SW (eso solo
 *  pasa en background), así que hay que escuchar acá y mostrar un toast. */
export function listenForegroundPush(onPayload) {
  return onMessage(getMessaging(app), onPayload);
}
