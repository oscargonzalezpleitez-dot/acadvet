// =============================================================================
// AcadVet USAM — UI Utilities
// openModal, closeModal, showToast — usados en múltiples vistas
// =============================================================================

// ---------------------------------------------------------------------------
// MODAL
// ---------------------------------------------------------------------------

/**
 * Abre un modal.
 * @param {object} opts
 *   title         {string}   Título del modal
 *   body          {string}   HTML del cuerpo (se inyecta en .modal-body)
 *   confirmLabel  {string}   Texto del botón primario  (default: 'Guardar')
 *   cancelLabel   {string}   Texto del botón secundario (default: 'Cancelar')
 *   confirmVariant{string}   'primary' | 'danger' (default: 'primary')
 *   size          {string}   '' | 'sm' | 'lg'
 *   onConfirm     {async fn} Se llama al pulsar el botón primario
 *   onCancel      {fn}       Se llama al cerrar/cancelar
 */
export function openModal({
  title,
  body,
  confirmLabel   = 'Guardar',
  cancelLabel    = 'Cancelar',
  confirmVariant = 'primary',
  size           = '',
  onConfirm,
  onCancel,
} = {}) {
  closeModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modalBackdrop';

  backdrop.innerHTML = `
    <div class="modal${size ? ' modal--' + size : ''}">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close btn btn--icon" id="modalCloseBtn" type="button" aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body" id="modalBody">
        ${body}
      </div>
      <div class="modal-footer">
        <button class="btn btn--secondary" id="modalCancelBtn" type="button">${cancelLabel}</button>
        <button class="btn btn--${confirmVariant}" id="modalConfirmBtn" type="button">${confirmLabel}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Focus primer campo del formulario
  setTimeout(() => {
    backdrop.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  }, 60);

  // Cerrar al hacer clic en el backdrop (fuera del modal)
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) cancel();
  });

  // Teclas
  backdrop.addEventListener('keydown', e => {
    if (e.key === 'Escape') cancel();
    // Enter en un input → confirmar
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') confirm();
  });

  document.getElementById('modalCloseBtn').addEventListener('click', cancel);
  document.getElementById('modalCancelBtn').addEventListener('click', cancel);
  document.getElementById('modalConfirmBtn').addEventListener('click', confirm);

  async function confirm() {
    const btn = document.getElementById('modalConfirmBtn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Guardando…';
    try {
      await onConfirm?.();
    } finally {
      if (document.getElementById('modalConfirmBtn')) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  }

  function cancel() {
    closeModal();
    onCancel?.();
  }
}

export function closeModal() {
  document.getElementById('modalBackdrop')?.remove();
}

// ---------------------------------------------------------------------------
// TOAST
// ---------------------------------------------------------------------------

function getToastContainer() {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

/**
 * Muestra una notificación flotante que desaparece sola.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'success') {
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  // Animar entrada
  requestAnimationFrame(() => toast.classList.add('visible'));

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3200);
}
