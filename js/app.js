// =============================================================================
// AcadVet USAM — Entry point del panel principal
// Guard de sesión + setup del shell + rutas con datos Firebase
// =============================================================================

import { initRouter, on, navigate } from './router.js';
import { renderDashboard }          from './views/dashboard.js';
import { renderMaterias }           from './views/materias.js';
import { renderAlumnos }            from './views/alumnos.js';
import { renderExpediente }         from './views/expediente.js';
import { renderSolicitudes }        from './views/solicitudes.js';
import { getMaterias, getAlumnos, alumnosByMateria, getSolicitudes } from './db.js';

// --- Guard de sesión ---
if (sessionStorage.getItem('acadvet_auth') !== 'true') {
  window.location.replace('index.html');
}

// ---------------------------------------------------------------------------
// Referencias DOM del shell
// ---------------------------------------------------------------------------
const mainContent  = document.getElementById('mainContent');
const sidebar      = document.getElementById('sidebar');
const overlay      = document.getElementById('sidebarOverlay');
const menuToggle   = document.getElementById('menuToggle');
const sidebarClose = document.getElementById('sidebarClose');
const btnLogout    = document.getElementById('btnLogout');

// ---------------------------------------------------------------------------
// Sidebar mobile
// ---------------------------------------------------------------------------
menuToggle.addEventListener('click',   openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click',      closeSidebar);

document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth <= 768) closeSidebar();
  });
});

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
btnLogout.addEventListener('click', () => {
  sessionStorage.removeItem('acadvet_auth');
  window.location.replace('index.html');
});

// ---------------------------------------------------------------------------
// Helpers de UI
// ---------------------------------------------------------------------------

/** Muestra un spinner de carga en el área principal. */
function showLoading(msg = 'Cargando…') {
  mainContent.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>${msg}</p>
    </div>
  `;
}

/** Muestra un error recuperable en el área principal. */
function showError(msg, retryFn = null) {
  mainContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon">⚠️</div>
      <h3 class="empty-state__title">Error al cargar</h3>
      <p class="empty-state__text">${msg}</p>
      ${retryFn ? '<button class="btn btn--primary" id="btnRetry">Reintentar</button>' : ''}
    </div>
  `;
  if (retryFn) {
    document.getElementById('btnRetry')?.addEventListener('click', retryFn);
  }
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

on('/', async () => {
  document.getElementById('topbarTitle').textContent = 'Dashboard';
  showLoading('Cargando materias…');

  try {
    // Fetch en paralelo: materias + todos los alumnos
    const [materias, todosAlumnos] = await Promise.all([
      getMaterias(),
      getAlumnos(),
    ]);

    // Añadir conteo real de alumnos a cada materia
    const materiasConConteo = materias.map(m => ({
      ...m,
      alumnos: alumnosByMateria(todosAlumnos, m.id).length,
    }));

    renderDashboard(mainContent, { materias: materiasConConteo });
  } catch (err) {
    console.error('[AcadVet] Error cargando dashboard:', err);
    showError(
      'No se pudo conectar con Firebase. Verificá tu conexión o la configuración de firebase-config.js.',
      () => navigate('/')
    );
  }
});

on('/materias', () => {
  renderMaterias(mainContent);
});

on('/materia/:id', ({ params }) => {
  renderAlumnos(mainContent, params.id);
});

on('/alumno/:id', ({ params, query }) => {
  const materiaId = query.materia ?? '';
  renderExpediente(mainContent, params.id, materiaId);
});

on('/solicitudes', () => {
  renderSolicitudes(mainContent);
});

// ---------------------------------------------------------------------------
// Badge de solicitudes pendientes
// ---------------------------------------------------------------------------

async function refreshSolicitudesBadge() {
  try {
    const todas = await getSolicitudes();
    const count = todas.filter(s => s.estado === 'pendiente').length;
    const badge = document.getElementById('solicitudesBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (_) {}
}

refreshSolicitudesBadge();

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
initRouter();
