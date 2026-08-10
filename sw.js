// =============================================================================
// AcadVet USAM — Service Worker
// Estrategia: red primero, cache como respaldo solo si no hay conexión.
// Nunca sirve una versión vieja mientras haya red (mismo espíritu que los
// headers Cache-Control: no-cache de firebase.json). Firebase/CDNs pasan
// directo, sin pasar por el cache, para no romper datos en tiempo real.
// Subir CACHE_VERSION cuando se quiera forzar limpieza del cache viejo.
// =============================================================================

// -----------------------------------------------------------------------------
// Firebase Cloud Messaging (notificaciones push)
// Se fusiona aquí porque un scope solo puede tener un Service Worker activo:
// registrar un firebase-messaging-sw.js aparte reemplazaría este archivo y
// rompería el cache offline de abajo. El SW no es un módulo ES, así que usa
// el build "compat" de Firebase (única excepción al SDK modular del resto
// del proyecto, y solo dentro de este archivo).
// -----------------------------------------------------------------------------
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyDsypCuOI00MIkow2rATpd3FjujP5jVBwM",
  authDomain:        "acadvet-usam.firebaseapp.com",
  databaseURL:       "https://acadvet-usam-default-rtdb.firebaseio.com",
  projectId:         "acadvet-usam",
  storageBucket:     "acadvet-usam.firebasestorage.app",
  messagingSenderId: "1020301218871",
  appId:             "1:1020301218871:web:7f28eda174b8af9bc45bb2",
});

const messaging = firebase.messaging();

// Los mensajes se mandan "data-only" (sin campo "notification") para que el
// render y el click los controlemos nosotros, no el SDK.
messaging.onBackgroundMessage((payload) => {
  const { title, body, url } = payload.data || {};
  self.registration.showNotification(title || 'AcadVet USAM', {
    body: body || '',
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-192.png',
    data: { url: url || './' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(url.replace('./', '')));
      return existing ? existing.focus() : clients.openWindow(url);
    })
  );
});

const CACHE_VERSION = 'acadvet-shell-v1';

const APP_SHELL = [
  './index.html',
  './app.html',
  './student.html',
  './css/main.css',
  './css/components.css',
  './css/views.css',
  './js/app.js',
  './js/auth.js',
  './js/router.js',
  './js/db.js',
  './js/ui.js',
  './js/firebase-config.js',
  './manifest.json',
  './manifest-student.json',
  './logo/logo.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

const BYPASS_HOSTS = [
  'firebaseio.com',
  'firebasedatabase.app',
  'firebasestorage.googleapis.com',
  'googleapis.com',
  'gstatic.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {}) // no bloquear la instalación si algún asset falla en el primer deploy
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (BYPASS_HOSTS.some((host) => url.hostname.includes(host))) return;

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}
