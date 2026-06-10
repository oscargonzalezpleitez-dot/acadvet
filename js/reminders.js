// =============================================================================
// AcadVet USAM — Módulo 7: Recordatorios de Evaluaciones
// =============================================================================
import { getDatabase, ref, push, remove, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const rtdb = getDatabase(app);

export const REMINDER_COLORS = {
  purple: '#6C63FF',
  teal:   '#00D2D3',
  green:  '#00B894',
  orange: '#FDCB6E',
  red:    '#FF6B6B',
};

export async function createReminder({ title, message, date, subject, color = 'purple' }) {
  return push(ref(rtdb, 'reminders'), {
    title:      title.trim(),
    message:    message.trim(),
    date,
    subject:    subject.trim(),
    color,
    created_at: Date.now(),
  });
}

export async function deleteReminder(id) {
  return remove(ref(rtdb, `reminders/${id}`));
}

export function listenReminders(callback) {
  return onValue(ref(rtdb, 'reminders'), snap => {
    if (!snap.exists()) { callback([]); return; }
    const list = Object.entries(snap.val())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
    callback(list);
  });
}
