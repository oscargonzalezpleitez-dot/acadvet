// =============================================================================
// AcadVet USAM — Vista: Solicitudes de auto-inscripción
// =============================================================================

import { getSolicitudes, aprobarSolicitud, rechazarSolicitud, deleteSolicitud } from '../db.js';
import { openModal, closeModal, showToast } from '../ui.js';

let _container = null;
let _tab       = 'pendientes'; // 'pendientes' | 'historial'

export async function renderSolicitudes(container) {
  _container = container;
  document.getElementById('topbarTitle').textContent = 'Solicitudes';

  container.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Cargando solicitudes…</p></div>`;

  try {
    await paint();
  } catch (err) {
    console.error('[AcadVet] Error cargando solicitudes:', err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <h3 class="empty-state__title">Error al cargar</h3>
        <p class="empty-state__text">Verificá tu conexión e intentá de nuevo.</p>
        <button class="btn btn--primary" id="btnRetrySol">Reintentar</button>
      </div>`;
    document.getElementById('btnRetrySol')?.addEventListener('click', () => renderSolicitudes(container));
  }
}

async function paint() {
  const todas      = await getSolicitudes();
  const pendientes = todas.filter(s => s.estado === 'pendiente').sort((a,b) => (b.solicitadoEn||0)-(a.solicitadoEn||0));
  const historial  = todas.filter(s => s.estado !== 'pendiente').sort((a,b) => (b.procesadoEn||0)-(a.procesadoEn||0));

  const registroUrl = `${location.origin}${location.pathname.replace('app.html','')}inscripcion.html`;

  _container.innerHTML = `
    <div class="alumnos-view">

      <div class="view-header">
        <div>
          <h2 class="view-title">Solicitudes de Inscripción</h2>
          <p class="view-subtitle text-muted text-sm">
            Los alumnos se registran en
            <code style="font-size:var(--text-xs)">${escHtml(registroUrl)}</code>
          </p>
        </div>
        <button class="btn btn--secondary btn--sm" id="btnCopyRegLink">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copiar enlace
        </button>
      </div>

      <!-- Tabs -->
      <div class="tabs-nav" role="tablist" style="margin-bottom:var(--space-5)">
        <button class="tab-btn${_tab==='pendientes'?' active':''}" data-tab="pendientes" role="tab">
          Pendientes
          ${pendientes.length > 0 ? `<span style="background:var(--color-danger);color:#fff;font-size:0.65rem;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px">${pendientes.length}</span>` : ''}
        </button>
        <button class="tab-btn${_tab==='historial'?' active':''}" data-tab="historial" role="tab">
          Historial
          <span style="color:var(--color-text-muted);font-size:var(--text-xs);margin-left:4px">(${historial.length})</span>
        </button>
      </div>

      <!-- Contenido -->
      <div id="solContent">
        ${_tab === 'pendientes' ? renderPendientes(pendientes) : renderHistorial(historial)}
      </div>

    </div>
  `;

  // Tab switch
  _container.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      _container.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === _tab);
      });
      document.getElementById('solContent').innerHTML =
        _tab === 'pendientes' ? renderPendientes(pendientes) : renderHistorial(historial);
      wireCards(pendientes, historial);
    });
  });

  // Copiar enlace
  document.getElementById('btnCopyRegLink')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(registroUrl);
      showToast('Enlace copiado');
    } catch (_) {
      showToast('No se pudo copiar: ' + registroUrl, 'error');
    }
  });

  wireCards(pendientes, historial);
}

// ---------------------------------------------------------------------------
// Renderizado
// ---------------------------------------------------------------------------

function renderPendientes(list) {
  if (list.length === 0) return `
    <div class="empty-state" style="padding:var(--space-12)">
      <div class="empty-state__icon">✅</div>
      <h3 class="empty-state__title">Sin solicitudes pendientes</h3>
      <p class="empty-state__text">Cuando un alumno se registre, aparecerá aquí para que lo apruebes.</p>
    </div>`;

  return `<div class="sol-grid">${list.map(s => cardHTML(s, true)).join('')}</div>`;
}

function renderHistorial(list) {
  if (list.length === 0) return `
    <div class="empty-state" style="padding:var(--space-12)">
      <div class="empty-state__icon">📋</div>
      <h3 class="empty-state__title">Sin historial</h3>
      <p class="empty-state__text">Las solicitudes aprobadas y rechazadas aparecerán aquí.</p>
    </div>`;

  return `<div class="sol-grid">${list.map(s => cardHTML(s, false)).join('')}</div>`;
}

function cardHTML(s, isPending) {
  const initials = getInitials(s.nombre);
  const fecha    = s.solicitadoEn
    ? new Date(s.solicitadoEn).toLocaleDateString('es-SV', { day:'2-digit', month:'short', year:'numeric' })
    : '—';

  const estadoBadge = isPending
    ? `<span class="badge badge--warning">Pendiente</span>`
    : s.estado === 'aprobado'
      ? `<span class="badge badge--success">Aprobado</span>`
      : `<span class="badge badge--danger">Rechazado</span>`;

  const materias = s.materias ? Object.values(s.materias) : [];

  const fotoSrc = s.fotoUrl
    ? escHtml(s.fotoUrl)
    : s.fotoB64
      ? `data:image/jpeg;base64,${s.fotoB64}`
      : null;
  const avatar = fotoSrc
    ? `<img src="${fotoSrc}" alt="${escHtml(s.nombre)}" class="sol-avatar sol-avatar--photo" loading="lazy">`
    : `<div class="sol-avatar sol-avatar--initials">${escHtml(initials)}</div>`;

  const actions = isPending ? `
    <div class="sol-actions">
      <button class="btn btn--primary btn--sm sol-aprobar" data-id="${escHtml(s.id)}">
        ✓ Aprobar
      </button>
      <button class="btn btn--ghost btn--sm sol-rechazar" data-id="${escHtml(s.id)}" style="color:var(--color-danger)">
        ✕ Rechazar
      </button>
    </div>` : `
    <div class="sol-actions">
      <button class="btn btn--ghost btn--sm sol-eliminar" data-id="${escHtml(s.id)}" style="color:var(--color-danger)">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
        Eliminar registro
      </button>
    </div>`;

  return `
    <div class="sol-card" data-id="${escHtml(s.id)}">
      <div class="sol-card-header">
        ${avatar}
        <div class="sol-info">
          <div class="sol-nombre">${escHtml(s.nombre)}</div>
          <div class="sol-carnet">${escHtml(s.carnet)}</div>
        </div>
        ${estadoBadge}
      </div>

      <div class="sol-details">
        ${s.email    ? `<div class="sol-detail"><span>📧</span><span>${escHtml(s.email)}</span></div>` : ''}
        ${s.telefono ? `<div class="sol-detail"><span>📱</span><span>${escHtml(s.telefono)}</span></div>` : ''}
        <div class="sol-detail"><span>📅</span><span>Solicitado: ${fecha}</span></div>
      </div>

      ${materias.length ? `
        <div class="sol-materias">
          ${materias.map(m => `<span class="badge badge--outline" style="font-size:0.7rem">${escHtml(m)}</span>`).join('')}
        </div>` : ''}

      ${actions}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Eventos de tarjetas
// ---------------------------------------------------------------------------

function wireCards(pendientes, historial) {
  _container.querySelectorAll('.sol-aprobar').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.id;
      const sol = pendientes.find(s => s.id === id);
      if (!sol) return;
      openModal({
        title: 'Aprobar solicitud',
        size:  'sm',
        body:  `<p class="text-secondary">
          ¿Aprobar a <strong>${escHtml(sol.nombre)}</strong>?<br>
          <span class="text-muted text-sm">Se creará su cuenta y se inscribirá en las materias seleccionadas.</span>
        </p>`,
        confirmLabel: 'Aprobar',
        async onConfirm() {
          try {
            await aprobarSolicitud(id);
            closeModal();
            showToast(`${sol.nombre} aprobado`);
            updateBadge();
            await paint();
          } catch (err) {
            showToast('Error al aprobar', 'error');
            console.error(err);
          }
        },
      });
    });
  });

  _container.querySelectorAll('.sol-rechazar').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.id;
      const sol = pendientes.find(s => s.id === id);
      if (!sol) return;
      openModal({
        title: 'Rechazar solicitud',
        size:  'sm',
        body:  `<p class="text-secondary">¿Rechazar la solicitud de <strong>${escHtml(sol.nombre)}</strong>?</p>`,
        confirmLabel:   'Rechazar',
        confirmVariant: 'danger',
        async onConfirm() {
          try {
            await rechazarSolicitud(id);
            closeModal();
            showToast(`Solicitud de ${sol.nombre} rechazada`);
            updateBadge();
            await paint();
          } catch (err) {
            showToast('Error al rechazar', 'error');
            console.error(err);
          }
        },
      });
    });
  });

  _container.querySelectorAll('.sol-eliminar').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.id;
      const sol = historial.find(s => s.id === id);
      if (!sol) return;
      openModal({
        title: 'Eliminar registro',
        size:  'sm',
        body:  `<p class="text-secondary">
          ¿Eliminar el registro de <strong>${escHtml(sol.nombre)}</strong> del historial?<br>
          <span class="text-muted text-sm">Esta acción no deshace la aprobación ni el rechazo previo.</span>
        </p>`,
        confirmLabel:   'Eliminar',
        confirmVariant: 'danger',
        async onConfirm() {
          try {
            await deleteSolicitud(id);
            closeModal();
            showToast('Registro eliminado del historial');
            await paint();
          } catch (err) {
            showToast('Error al eliminar', 'error');
            console.error(err);
          }
        },
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Actualizar badge del sidebar
// ---------------------------------------------------------------------------

async function updateBadge() {
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
// Helpers
// ---------------------------------------------------------------------------

function getInitials(nombre) {
  const p = (nombre ?? '').trim().split(/\s+/);
  return p.length >= 2
    ? (p[0][0] + p[1][0]).toUpperCase()
    : (p[0]?.[0] ?? '?').toUpperCase();
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
