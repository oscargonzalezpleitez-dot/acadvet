// =============================================================================
// AcadVet USAM — Hash Router
// Minimal SPA router. Patterns: '/', '/materia/:id', etc.
// =============================================================================

const routes = new Map();

/**
 * Registrar una ruta.
 * @param {string} pattern  - Ej: '/', '/materia/:id'
 * @param {function} handler - ({ params, query }) => void
 */
export function on(pattern, handler) {
  routes.set(pattern, handler);
}

/**
 * Navegar a una ruta sin agregar al historial del hash.
 * @param {string} path - Ej: '/materia/abc123'
 */
export function navigate(path) {
  window.location.hash = '#' + path;
}

/** Procesar la ruta actual del hash */
function resolve() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, queryStr] = raw.split('?');

  // Parsear query string (?materia=abc)
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));

  // 1. Coincidencia exacta
  if (routes.has(path)) {
    syncNavLinks(path);
    routes.get(path)({ params: {}, query });
    return;
  }

  // 2. Coincidencia por patrón (:param)
  for (const [pattern, handler] of routes) {
    const params = matchPattern(pattern, path);
    if (params !== null) {
      syncNavLinks(pattern);
      handler({ params, query });
      return;
    }
  }

  // 3. Fallback al dashboard
  navigate('/');
}

/**
 * Comparar un patrón con una ruta concreta.
 * Retorna objeto de params si coincide, null si no.
 */
function matchPattern(pattern, path) {
  const pp = pattern.split('/');
  const p  = path.split('/');
  if (pp.length !== p.length) return null;

  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) {
      params[pp[i].slice(1)] = decodeURIComponent(p[i]);
    } else if (pp[i] !== p[i]) {
      return null;
    }
  }
  return params;
}

/**
 * Marcar el nav-item activo según la ruta resuelta.
 */
function syncNavLinks(resolvedPattern) {
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === resolvedPattern);
  });
}

/** Inicializar el router (llamar una sola vez desde app.js) */
export function initRouter() {
  window.addEventListener('hashchange', resolve);
  resolve(); // ejecutar en la carga inicial
}
