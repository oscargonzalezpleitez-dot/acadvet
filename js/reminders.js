// =============================================================================
// AcadVet USAM — Módulo 7: Recordatorios de Evaluaciones
// =============================================================================
import { getDatabase, ref, push, remove, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const rtdb = getDatabase(app);

export const REMINDER_COLORS = {
  purple: '#6B5668',
  teal:   '#3E6E6A',
  green:  '#3F7A52',
  orange: '#B8763A',
  red:    '#A8463D',
};

export async function createReminder({ title, message, date, subject, color = 'purple', materiaId = null }) {
  return push(ref(rtdb, 'reminders'), {
    title:      title.trim(),
    message:    message.trim(),
    date,
    subject:    subject.trim(),
    color,
    materiaId,
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
