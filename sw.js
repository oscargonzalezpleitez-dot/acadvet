// =============================================================================
// AcadVet USAM — Service Worker
// Estrategia: red primero, cache como respaldo solo si no hay conexión.
// Nunca sirve una versión vieja mientras haya red (mismo espíritu que los
// headers Cache-Control: no-cache de firebase.json). Firebase/CDNs pasan
// directo, sin pasar por el cache, para no romper datos en tiempo real.
// Subir CACHE_VERSION cuando se quiera forzar limpieza del cache viejo.
// =============================================================================

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
