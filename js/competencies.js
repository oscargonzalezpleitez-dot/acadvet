// =============================================================================
// AcadVet USAM — Módulo 6: Competencias de Laboratorio
// =============================================================================
import { getDatabase, ref, set, get, update, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { app } from './firebase-config.js';

const rtdb = getDatabase(app);
const auth = getAuth(app);

// ── Catálogo de competencias ──────────────────────────────────────────────────
export const COMPETENCIES = [
  // Nivel 1 — Conocimientos básicos
  { id: 'c01', name: 'Historia de la esterilización en microbiología',                           category: 'Nivel 1 — Conocimientos básicos', level: 1 },
  { id: 'c02', name: 'Concepto de esterilización',                                               category: 'Nivel 1 — Conocimientos básicos', level: 1 },
  { id: 'c03', name: 'Diferencia entre esterilización, desinfección, antisepsia y sanitización', category: 'Nivel 1 — Conocimientos básicos', level: 1 },
  { id: 'c04', name: 'Tipos de microorganismos y resistencia al calor',                          category: 'Nivel 1 — Conocimientos básicos', level: 1 },
  { id: 'c05', name: 'Esporas bacterianas y su importancia',                                     category: 'Nivel 1 — Conocimientos básicos', level: 1 },
  // Nivel 2 — Comprensión
  { id: 'c06', name: 'Principios físicos del calor húmedo',                                      category: 'Nivel 2 — Comprensión', level: 2 },
  { id: 'c07', name: 'Principios del calor seco',                                                category: 'Nivel 2 — Comprensión', level: 2 },
  { id: 'c08', name: 'Mecanismo de acción del vapor a presión',                                  category: 'Nivel 2 — Comprensión', level: 2 },
  { id: 'c09', name: 'Métodos químicos de desinfección',                                         category: 'Nivel 2 — Comprensión', level: 2 },
  { id: 'c10', name: 'Factores que afectan la eficacia de un desinfectante',                     category: 'Nivel 2 — Comprensión', level: 2 },
];

export const BADGES = [
  { id: 'b01', label: '🌱 Primer paso',       threshold: 1,  desc: 'Primera competencia validada'       },
  { id: 'b02', label: '📚 Nivel 1 completo',  threshold: 5,  desc: 'Todos los conocimientos básicos'    },
  { id: 'b03', label: '🔬 Nivel 2 completo',  threshold: 10, desc: 'Todas las competencias de comprensión' },
  { id: 'b04', label: '🏆 Experto',           threshold: 10, desc: 'Todas las competencias validadas'   },
];

// ── Sanitizar carné para clave RTDB (sin . # $ [ ]) ──────────────────────────
export function sanitizeKey(carnet) {
  return String(carnet).replace(/[.#$[\]/]/g, '_').trim();
}

// ── Auth anónima para estudiantes ─────────────────────────────────────────────
export async function ensureAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
}

// ── Solicitar validación (estudiante) ─────────────────────────────────────────
export async function requestValidation(studentId, studentName, compId) {
  await ensureAuth();
  const key  = sanitizeKey(studentId);
  const comp = COMPETENCIES.find(c => c.id === compId);
  if (!comp) throw new Error('Competencia no encontrada');
  await set(ref(rtdb, `student_competencies/${key}/${compId}`), {
    student_id:   studentId,
    student_name: studentName,
    comp_id:      compId,
    comp_name:    comp.name,
    category:     comp.category,
    level:        comp.level,
    status:       'pendiente',
    requested_at: Date.now(),
    validated_at: null,
    validated_by: null,
    observation:  null,
  });
}

// ── Obtener progreso de un estudiante ─────────────────────────────────────────
export async function getStudentProgress(studentId) {
  const key  = sanitizeKey(studentId);
  const snap = await get(ref(rtdb, `student_competencies/${key}`));
  if (!snap.exists()) return {};
  return snap.val();
}

// ── Obtener progreso en tiempo real ───────────────────────────────────────────
export function listenStudentProgress(studentId, callback) {
  const key = sanitizeKey(studentId);
  ensureAuth().then(() => {
    onValue(ref(rtdb, `student_competencies/${key}`), snap => {
      callback(snap.exists() ? snap.val() : {});
    });
  });
}

// ── Validar competencia (profesor) ────────────────────────────────────────────
export async function validateCompetency(studentId, compId, approved, observation = '') {
  const key = sanitizeKey(studentId);
  await update(ref(rtdb, `student_competencies/${key}/${compId}`), {
    status:       approved ? 'aprobada' : 'rechazada',
    validated_at: Date.now(),
    validated_by: 'Óscar González',
    observation:  observation.trim() || null,
  });
}

// ── Obtener todos los estudiantes con progreso (profesor) ─────────────────────
export function listenAllProgress(callback) {
  return onValue(ref(rtdb, 'student_competencies'), snap => {
    if (!snap.exists()) { callback({}); return; }
    callback(snap.val());
  });
}

// ── Calcular badges ganados ────────────────────────────────────────────────────
export function getEarnedBadges(approvedCount) {
  return BADGES.filter(b => approvedCount >= b.threshold);
}

// ── Contar aprobadas de un mapa de progreso ────────────────────────────────────
export function countApproved(progressMap) {
  if (!progressMap) return 0;
  return Object.values(progressMap).filter(e => e.status === 'aprobada').length;
}
