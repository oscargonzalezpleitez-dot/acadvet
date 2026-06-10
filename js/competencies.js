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
  { id: 'c01', name: 'Teñido Gram',                   category: 'Bacteriología',  level: 1 },
  { id: 'c02', name: 'Montaje de preparaciones',       category: 'Bacteriología',  level: 1 },
  { id: 'c03', name: 'Lectura de placas de cultivo',   category: 'Bacteriología',  level: 2 },
  { id: 'c04', name: 'Hemograma manual',               category: 'Lab Clínico',    level: 2 },
  { id: 'c05', name: 'Análisis de orina',              category: 'Lab Clínico',    level: 1 },
  { id: 'c06', name: 'Cultivo microbiológico',         category: 'Bacteriología',  level: 2 },
  { id: 'c07', name: 'Identificación de hongos',       category: 'Micología',      level: 3 },
  { id: 'c08', name: 'Preparación de muestras',        category: 'Lab Clínico',    level: 1 },
  { id: 'c09', name: 'Esterilización de material',     category: 'Bacteriología',  level: 1 },
  { id: 'c10', name: 'Inoculación de cultivos',        category: 'Bacteriología',  level: 3 },
];

export const BADGES = [
  { id: 'b01', label: '🌱 Primer paso',  threshold: 1,  desc: 'Primera competencia validada'   },
  { id: 'b02', label: '⚗️ Practicante',  threshold: 3,  desc: '3 técnicas validadas'            },
  { id: 'b03', label: '🔬 Analista',     threshold: 6,  desc: '6 técnicas validadas'            },
  { id: 'b04', label: '🏆 Experto Lab',  threshold: 10, desc: 'Todas las competencias validadas' },
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
