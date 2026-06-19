// =============================================================================
// AcadVet USAM — Vista de Avisos (docente)
// =============================================================================

import { createReminder, deleteReminder, listenReminders, REMINDER_COLORS }
  from '../reminders.js';
import { getMaterias, getAlumnos, alumnosByMateria } from '../db.js';

const SENDER_EMAIL = 'oscar.gonzalez@usam.edu.sv';

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

    <!-- Modal de envío por correo -->
    <div id="emailModal" style="display:none;position:fixed;inset:0;z-index:var(--z-modal);
         background:rgba(0,0,0,0.5);align-items:center;justify-content:center;padding:16px">
      <div style="background:var(--color-surface);border-radius:var(--radius-xl);
           padding:var(--space-8);max-width:520px;width:100%;max-height:90vh;overflow-y:auto;
           box-shadow:var(--shadow-xl)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-6)">
          <h3 style="font-size:var(--text-lg);font-weight:800;color:var(--color-text-primary)">
            ✉️ Enviar por correo
          </h3>
          <button id="btnCloseEmailModal" style="background:none;border:none;cursor:pointer;
               color:var(--color-text-muted);font-size:20px;padding:4px">✕</button>
        </div>

        <!-- Aviso seleccionado -->
        <div id="emailAvisoPreview" style="background:var(--color-surface-2);border-radius:var(--radius-md);
             padding:var(--space-4);margin-bottom:var(--space-5);border:1px solid var(--color-border)">
        </div>

        <!-- Selector de materia -->
        <div class="form-group" style="margin-bottom:var(--space-5)">
          <label class="form-label">Enviar a alumnos de</label>
          <select class="form-input" id="emailMateriaSelect">
            <option value="">Cargando materias…</option>
          </select>
        </div>

        <!-- Info de destinatarios -->
        <div id="emailDestinatariosInfo" style="margin-bottom:var(--space-5);display:none">
          <div id="emailDestinatariosCount" style="font-size:var(--text-sm);color:var(--color-text-secondary);
               margin-bottom:8px"></div>
          <div id="emailSinCorreo" style="font-size:var(--text-xs);color:var(--color-text-muted)"></div>
        </div>

        <!-- Previsualización del correo -->
        <div style="background:var(--color-surface-2);border:1px solid var(--color-border);
             border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-5);
             font-size:var(--text-sm)">
          <div style="margin-bottom:6px">
            <span style="color:var(--color-text-muted);font-weight:600">De:</span>
            <span style="color:var(--color-text-primary);margin-left:6px">${SENDER_EMAIL}</span>
          </div>
          <div style="margin-bottom:6px">
            <span style="color:var(--color-text-muted);font-weight:600">CCO:</span>
            <span style="color:var(--color-text-primary);margin-left:6px" id="emailBccPreview">—</span>
          </div>
          <div style="margin-bottom:6px">
            <span style="color:var(--color-text-muted);font-weight:600">Asunto:</span>
            <span style="color:var(--color-text-primary);margin-left:6px" id="emailSubjectPreview">—</span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:var(--space-3)">
          <button class="btn btn--primary" id="btnOpenMailto" disabled>
            📧 Abrir Gmail / correo para enviar
          </button>
          <button class="btn btn--secondary" id="btnCopyEmails" disabled>
            📋 Copiar lista de correos (BCC)
          </button>
        </div>

        <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:var(--space-4);
             line-height:1.5;text-align:center">
          Se abrirá tu cliente de correo con el asunto y mensaje listos.<br>
          Solo presioná <strong>Enviar</strong>.
        </p>
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

    if (!title) { errEl.textContent = 'El título es obligatorio.'; errEl.style.display = 'block'; return; }
    if (!date)  { errEl.textContent = 'La fecha es obligatoria.';  errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    const btn = document.getElementById('btnCreateReminder');
    btn.disabled = true; btn.textContent = 'Publicando…';

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
      btn.disabled = false; btn.textContent = 'Publicar aviso';
    }
  });

  // Cerrar modal
  document.getElementById('btnCloseEmailModal').addEventListener('click', closeEmailModal);
  document.getElementById('emailModal').addEventListener('click', e => {
    if (e.target === document.getElementById('emailModal')) closeEmailModal();
  });
}

// ---------------------------------------------------------------------------
// Modal de envío por correo
// ---------------------------------------------------------------------------

let _currentReminder = null;
let _allAlumnos      = [];
let _materias        = [];

async function openEmailModal(reminder) {
  _currentReminder = reminder;
  const modal = document.getElementById('emailModal');
  modal.style.display = 'flex';

  // Preview del aviso
  const [yr, mo, dy] = reminder.date.split('-').map(Number);
  document.getElementById('emailAvisoPreview').innerHTML = `
    <div style="font-weight:700;font-size:var(--text-sm);color:var(--color-text-primary);margin-bottom:4px">
      ${esc(reminder.title)}
    </div>
    ${reminder.subject ? `<div style="font-size:var(--text-xs);color:var(--color-text-secondary);margin-bottom:4px">📚 ${esc(reminder.subject)}</div>` : ''}
    <div style="font-size:var(--text-xs);color:var(--color-text-muted)">
      📅 ${dy} de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][mo-1]} de ${yr}
    </div>
    ${reminder.message ? `<div style="font-size:var(--text-xs);color:var(--color-text-secondary);margin-top:6px">${esc(reminder.message)}</div>` : ''}
  `;

  // Cargar materias y alumnos si no están en caché
  const sel = document.getElementById('emailMateriaSelect');
  sel.innerHTML = '<option value="">Cargando…</option>';
  sel.disabled  = true;

  try {
    [_materias, _allAlumnos] = await Promise.all([getMaterias(), getAlumnos()]);
    const activas = _materias.filter(m => m.estado !== 'archivada');
    sel.innerHTML = `<option value="">— Seleccioná una materia —</option>` +
      activas.map(m => `<option value="${m.id}">${esc(m.nombre)}${m.ciclo ? ' · ' + esc(m.ciclo) : ''}</option>`).join('');
    sel.disabled = false;
  } catch {
    sel.innerHTML = '<option value="">Error al cargar materias</option>';
  }

  sel.addEventListener('change', () => updateDestinatarios());
  document.getElementById('btnOpenMailto').addEventListener('click', openMailto);
  document.getElementById('btnCopyEmails').addEventListener('click', copyEmails);
}

function updateDestinatarios() {
  const materiaId = document.getElementById('emailMateriaSelect').value;
  const infoEl    = document.getElementById('emailDestinatariosInfo');
  const bccEl     = document.getElementById('emailBccPreview');
  const subjectEl = document.getElementById('emailSubjectPreview');
  const btnMailto = document.getElementById('btnOpenMailto');
  const btnCopy   = document.getElementById('btnCopyEmails');

  if (!materiaId) {
    infoEl.style.display = 'none';
    bccEl.textContent    = '—';
    subjectEl.textContent= '—';
    btnMailto.disabled   = true;
    btnCopy.disabled     = true;
    return;
  }

  const inscritos   = alumnosByMateria(_allAlumnos, materiaId);
  const conEmail    = inscritos.filter(a => a.email?.trim());
  const sinEmail    = inscritos.filter(a => !a.email?.trim());
  const materia     = _materias.find(m => m.id === materiaId);

  document.getElementById('emailDestinatariosCount').textContent =
    `✅ ${conEmail.length} alumno${conEmail.length !== 1 ? 's' : ''} con correo de ${inscritos.length} inscritos en ${materia?.nombre ?? ''}`;

  document.getElementById('emailSinCorreo').textContent = sinEmail.length > 0
    ? `⚠️ ${sinEmail.length} alumno${sinEmail.length !== 1 ? 's' : ''} sin correo registrado (no recibirán el aviso)`
    : '';

  infoEl.style.display = 'block';

  // Asunto del correo
  const [yr, mo, dy] = _currentReminder.date.split('-').map(Number);
  const fechaStr = `${dy}/${mo}/${yr}`;
  const asunto   = `[AcadVet USAM] ${_currentReminder.title} — ${fechaStr}`;
  subjectEl.textContent = asunto;

  // BCC preview (mostrar solo primeros 3)
  const emails = conEmail.map(a => a.email.trim());
  bccEl.textContent = emails.length > 0
    ? emails.slice(0, 3).join(', ') + (emails.length > 3 ? ` … (+${emails.length - 3} más)` : '')
    : 'Sin destinatarios con correo';

  btnMailto.disabled = emails.length === 0;
  btnCopy.disabled   = emails.length === 0;
}

function buildMailtoData() {
  const materiaId = document.getElementById('emailMateriaSelect').value;
  const inscritos = alumnosByMateria(_allAlumnos, materiaId);
  const emails    = inscritos.filter(a => a.email?.trim()).map(a => a.email.trim());

  const [yr, mo, dy] = _currentReminder.date.split('-').map(Number);
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaStr = `${dy} de ${meses[mo-1]} de ${yr}`;

  const asunto = `[AcadVet USAM] ${_currentReminder.title} — ${dy}/${mo}/${yr}`;
  const cuerpo = [
    `Estimado/a estudiante,`,
    ``,
    `Te informamos sobre el siguiente aviso de la Facultad de Medicina Veterinaria — USAM:`,
    ``,
    `📌 ${_currentReminder.title}`,
    _currentReminder.subject ? `📚 Asignatura: ${_currentReminder.subject}` : '',
    `📅 Fecha: ${fechaStr}`,
    _currentReminder.message ? `\n📝 ${_currentReminder.message}` : '',
    ``,
    `Saludos,`,
    `Prof. Óscar González`,
    `Facultad de Medicina Veterinaria · USAM`,
  ].filter(l => l !== null).join('\n');

  return { emails, asunto, cuerpo };
}

function openMailto() {
  const { emails, asunto, cuerpo } = buildMailtoData();
  if (!emails.length) return;

  const bcc  = emails.join(',');
  const url  = `mailto:${SENDER_EMAIL}?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

  // Si la URL es muy larga (>2000 chars), abrir sin BCC y mostrar aviso
  if (url.length > 2000) {
    const urlSinBcc = `mailto:${SENDER_EMAIL}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    window.location.href = urlSinBcc;
    alert(`El listado de ${emails.length} correos es muy largo para el enlace automático.\n\nSe abrió el correo sin destinatarios. Usá el botón "Copiar lista de correos" para pegarlos en el campo CCO manualmente.`);
  } else {
    window.location.href = url;
  }
}

function copyEmails() {
  const { emails } = buildMailtoData();
  if (!emails.length) return;
  navigator.clipboard.writeText(emails.join(', ')).then(() => {
    const btn = document.getElementById('btnCopyEmails');
    const orig = btn.textContent;
    btn.textContent = '✅ ¡Copiado!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

function closeEmailModal() {
  document.getElementById('emailModal').style.display = 'none';
  _currentReminder = null;
  // Limpiar listeners clonando botones
  ['btnOpenMailto','btnCopyEmails','emailMateriaSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.replaceWith(el.cloneNode(true));
  });
}

// ---------------------------------------------------------------------------
// Render lista de avisos
// ---------------------------------------------------------------------------

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
           opacity:${isPast ? 0.6 : 1}">

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

        <!-- Acciones -->
        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;
             justify-content:center;gap:6px;padding:0 10px;border-left:1px solid var(--color-border)">

          <!-- Botón correo -->
          <button data-rem='${JSON.stringify(r).replace(/'/g,"&#39;")}' class="rem-email-btn"
            title="Enviar por correo"
            style="background:none;border:none;cursor:pointer;color:var(--color-primary);
                   padding:6px;border-radius:var(--radius-sm);transition:all var(--transition-fast)"
            onmouseenter="this.style.background='var(--color-primary-dim)'"
            onmouseleave="this.style.background='none'">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </button>

          <!-- Botón eliminar -->
          <button data-id="${r.id}" class="rem-delete-btn"
            title="Eliminar aviso"
            style="background:none;border:none;cursor:pointer;color:var(--color-text-muted);
                   padding:6px;border-radius:var(--radius-sm);transition:all var(--transition-fast)"
            onmouseenter="this.style.background='var(--color-danger-dim)';this.style.color='var(--color-danger)'"
            onmouseleave="this.style.background='none';this.style.color='var(--color-text-muted)'">
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

  // Botón correo
  el.querySelectorAll('.rem-email-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const reminder = JSON.parse(btn.dataset.rem);
      openEmailModal(reminder);
    });
  });

  // Botón eliminar
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
