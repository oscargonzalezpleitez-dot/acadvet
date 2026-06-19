// =============================================================================
// AcadVet USAM — Vista de Avisos (docente)
// =============================================================================

import { createReminder, deleteReminder, listenReminders, REMINDER_COLORS }
  from '../reminders.js';

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const COLOR_LABELS = {
  purple: '🟣 Morado',
  teal:   '🔵 Teal',
  green:  '🟢 Verde',
  orange: '🟡 Naranja',
  red:    '🔴 Rojo',
};

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function renderReminders(container) {
  const today = new Date().toISOString().slice(0, 10);

  container.innerHTML = `
    <div style="max-width:720px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px">
        <div>
          <h2 style="font-size:var(--text-xl);font-weight:800;color:var(--color-text-primary)">Avisos</h2>
          <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:2px">
            Recordatorios y evaluaciones visibles para los alumnos
          </p>
        </div>
        <a href="reminders.html" target="_blank"
           style="font-size:var(--text-xs);color:var(--color-primary);font-weight:600;text-decoration:none">
          Ver vista alumno ↗
        </a>
      </div>

      <!-- Formulario de nuevo aviso -->
      <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-6);margin-bottom:var(--space-6)">
        <h3 style="font-size:var(--text-base);font-weight:700;margin-bottom:var(--space-5);color:var(--color-text-primary)">
          ➕ Nuevo aviso
        </h3>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-4)">
          <div class="form-group">
            <label class="form-label">Título *</label>
            <input class="form-input" id="remTitle" placeholder="Ej. Parcial 1 · Bacteriología">
          </div>
          <div class="form-group">
            <label class="form-label">Asignatura</label>
            <input class="form-input" id="remSubject" placeholder="Ej. Microbiología Veterinaria">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-4)">
          <div class="form-group">
            <label class="form-label">Fecha *</label>
            <input class="form-input" id="remDate" type="date" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">Color</label>
            <select class="form-input" id="remColor">
              ${Object.entries(COLOR_LABELS).map(([val, label]) =>
                `<option value="${val}">${label}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:var(--space-5)">
          <label class="form-label">Mensaje / descripción</label>
          <textarea class="form-input" id="remMessage" rows="2"
            placeholder="Instrucciones, temas a estudiar, observaciones…"
            style="resize:vertical"></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn--primary" id="btnCreateReminder">Publicar aviso</button>
        </div>

        <p id="remError" style="color:var(--color-danger);font-size:var(--text-sm);margin-top:8px;display:none"></p>
      </div>

      <!-- Lista de avisos -->
      <div>
        <h3 style="font-size:var(--text-base);font-weight:700;margin-bottom:var(--space-4);color:var(--color-text-primary)">
          📋 Avisos publicados
        </h3>
        <div id="remindersList">
          <div style="text-align:center;padding:32px;color:var(--color-text-muted)">
            <div style="font-size:32px;margin-bottom:8px">⏳</div>
            Cargando avisos…
          </div>
        </div>
      </div>
    </div>
  `;

  // Listener en tiempo real
  listenReminders(reminders => renderList(reminders, today));

  // Crear aviso
  document.getElementById('btnCreateReminder').addEventListener('click', async () => {
    const title   = document.getElementById('remTitle').value.trim();
    const subject = document.getElementById('remSubject').value.trim();
    const date    = document.getElementById('remDate').value;
    const color   = document.getElementById('remColor').value;
    const message = document.getElementById('remMessage').value.trim();
    const errEl   = document.getElementById('remError');

    if (!title) {
      errEl.textContent = 'El título es obligatorio.';
      errEl.style.display = 'block';
      return;
    }
    if (!date) {
      errEl.textContent = 'La fecha es obligatoria.';
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';

    const btn = document.getElementById('btnCreateReminder');
    btn.disabled = true;
    btn.textContent = 'Publicando…';

    try {
      await createReminder({ title, subject, date, color, message });
      document.getElementById('remTitle').value   = '';
      document.getElementById('remSubject').value = '';
      document.getElementById('remMessage').value = '';
      document.getElementById('remDate').value    = today;
    } catch (e) {
      errEl.textContent = `Error al publicar: ${e.message}`;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Publicar aviso';
    }
  });
}

function renderList(reminders, today) {
  const el = document.getElementById('remindersList');
  if (!el) return;

  if (!reminders.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:48px;color:var(--color-text-muted)">
        <div style="font-size:40px;margin-bottom:10px">🔕</div>
        <div style="font-weight:600;margin-bottom:4px">Sin avisos publicados</div>
        <div style="font-size:var(--text-sm)">Creá el primero con el formulario de arriba.</div>
      </div>`;
    return;
  }

  el.innerHTML = reminders.map(r => {
    const [yr, mo, dy] = r.date.split('-').map(Number);
    const diff  = Math.round((new Date(yr, mo-1, dy) - new Date(today)) / 86400000);
    const color = REMINDER_COLORS[r.color] || REMINDER_COLORS.purple;

    const tag = diff === 0 ? 'HOY'
              : diff === 1 ? 'MAÑANA'
              : diff > 1   ? `EN ${diff}D`
              : diff === -1 ? 'AYER'
              : `HACE ${Math.abs(diff)}D`;

    const isPast = diff < 0;

    return `
      <div style="display:flex;align-items:stretch;background:var(--color-surface);
           border:1px solid var(--color-border);border-left:4px solid ${color};
           border-radius:var(--radius-md);margin-bottom:10px;overflow:hidden;
           opacity:${isPast ? 0.6 : 1};transition:box-shadow var(--transition-fast)"
           onmouseenter="this.style.boxShadow='var(--shadow-sm)'"
           onmouseleave="this.style.boxShadow='none'">

        <!-- Fecha -->
        <div style="min-width:60px;padding:14px 10px;text-align:center;
             border-right:1px solid var(--color-border);flex-shrink:0">
          <div style="font-family:var(--font-display);font-weight:800;font-size:1.5rem;
               color:var(--color-text-primary);line-height:1">${dy}</div>
          <div style="font-size:0.65rem;color:var(--color-text-muted);text-transform:uppercase;
               font-weight:600;letter-spacing:.05em">${MONTHS[mo-1]}</div>
          <div style="margin-top:5px;padding:2px 6px;border-radius:99px;font-size:0.58rem;
               font-weight:700;background:${color}22;color:${color}">${tag}</div>
        </div>

        <!-- Contenido -->
        <div style="flex:1;padding:14px 16px;min-width:0">
          <div style="font-family:var(--font-display);font-weight:700;font-size:var(--text-sm);
               color:var(--color-text-primary);margin-bottom:2px">${esc(r.title)}</div>
          ${r.subject ? `<div style="font-size:var(--text-xs);color:var(--color-text-secondary);
               font-weight:600;margin-bottom:4px">📚 ${esc(r.subject)}</div>` : ''}
          ${r.message ? `<div style="font-size:var(--text-xs);color:var(--color-text-secondary);
               line-height:1.45">${esc(r.message)}</div>` : ''}
        </div>

        <!-- Eliminar -->
        <div style="flex-shrink:0;display:flex;align-items:center;padding:0 12px;
             border-left:1px solid var(--color-border)">
          <button data-id="${r.id}"
            style="background:none;border:none;cursor:pointer;color:var(--color-text-muted);
                   padding:6px;border-radius:var(--radius-sm);transition:all var(--transition-fast)"
            title="Eliminar aviso"
            onmouseenter="this.style.background='var(--color-danger-dim)';this.style.color='var(--color-danger)'"
            onmouseleave="this.style.background='none';this.style.color='var(--color-text-muted)'"
            class="rem-delete-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');

  // Botones de eliminar
  el.querySelectorAll('.rem-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este aviso?')) return;
      btn.disabled = true;
      try {
        await deleteReminder(btn.dataset.id);
      } catch (e) {
        alert('Error al eliminar: ' + e.message);
        btn.disabled = false;
      }
    });
  });
}
