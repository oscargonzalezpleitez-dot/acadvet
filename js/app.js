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
import { renderArchivo }            from './views/archivo.js';
import { renderCuestionarios }      from './views/cuestionarios.js';
import { renderReminders }          from './views/reminders.js';
import { getMaterias, getAlumnos, alumnosByMateria, getSolicitudes } from './db.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth } from './firebase-config.js';

// --- Guard de sesión ---
const _auth = sessionStorage.getItem('acadvet_auth');
if (!['admin', 'eps', 'true'].includes(_auth)) {
  window.location.replace('index.html');
}

// Helper global de rol (disponible para todas las vistas vía import o sessionStorage directo)
export const isEPS = () => sessionStorage.getItem('acadvet_auth') === 'eps';

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
btnLogout.addEventListener('click', async () => {
  sessionStorage.removeItem('acadvet_auth');
  try { await signOut(auth); } catch (_) {}
  window.location.replace('index.html');
});

// Badge EPS en sidebar cuando la sesión es de visitante
if (isEPS()) {
  const roleEl = document.querySelector('.user-role');
  if (roleEl) {
    roleEl.textContent = 'Visitante · USAM';
    roleEl.insertAdjacentHTML('beforeend', '<span class="eps-badge">EPS</span>');
  }
  const nameEl = document.querySelector('.user-name');
  if (nameEl) {
    const h = new Date().getHours();
    nameEl.textContent = h >= 6 && h < 12 ? 'Buenos días'
                       : h >= 12 && h < 19 ? 'Buenas tardes'
                       : 'Buenas noches';
  }
}

// ---------------------------------------------------------------------------
// Helpers de UI
// ---------------------------------------------------------------------------

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Muestra un spinner de carga en el área principal. */
function showLoading(msg = 'Cargando…') {
  mainContent.innerHTML = `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>${_esc(msg)}</p>
    </div>
  `;
}

/** Muestra un error recuperable en el área principal. */
function showError(msg, retryFn = null) {
  mainContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon">⚠️</div>
      <h3 class="empty-state__title">Error al cargar</h3>
      <p class="empty-state__text">${_esc(msg)}</p>
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
    const code = err?.code ?? err?.message ?? String(err);
    showError(
      `Error al cargar datos (${code}). Si el problema persiste, cerrá sesión e ingresá de nuevo.`,
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

on('/archivo', () => {
  renderArchivo(mainContent);
});

on('/cuestionarios', () => {
  document.getElementById('topbarTitle').textContent = 'Cuestionarios';
  renderCuestionarios(mainContent);
});

on('/avisos', () => {
  document.getElementById('topbarTitle').textContent = 'Avisos';
  renderReminders(mainContent);
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

// ---------------------------------------------------------------------------
// Init — Firebase Auth persiste la sesión (browserLocalPersistence) y restaura
// al usuario antes del primer callback. Si no hay sesión Firebase válida se
// exige re-login (ingresar el PIN). No se lee ningún hash público de la base.
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  if (user) {
    refreshSolicitudesBadge();
    initRouter();
    return;
  }
  // Sin sesión Firebase Auth (nunca autenticado o token expirado) → login.
  sessionStorage.removeItem('acadvet_auth');
  window.location.replace('index.html');
});
