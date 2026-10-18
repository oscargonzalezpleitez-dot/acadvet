// =============================================================================
// AcadVet USAM — Regla de asistencia de Área 2 del Grupo 2 de Bacteriología y
//   Micología (Ciclo II 2026). Los viernes hay dos clases el mismo día: una de
//   2 horas (checkType inicio/fin) y una de 1 hora (checkType único) — se
//   cuentan como dos días distintos. Un viernes de 2h solo cuenta como
//   asistido si el alumno tiene inicio Y fin presente/justificado (salvo que
//   ese checkType nunca se haya abierto ese día para todo el grupo, en cuyo
//   caso basta con el que sí existió). El denominador son los 13 días fijos
//   de abajo; si una sesión nunca existió para nadie un día dado, ese día no
//   entra al calendario.
// =============================================================================

export const MATERIA_GRUPO2_BACTERIO_ID = '-OvBIHDTynekKuf_ZT9d';

const JUEVES  = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'];
const VIERNES = ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02'];

// Viernes donde una de las dos sesiones nunca se abrió para todo el grupo.
const SIN_CLASE_2H = new Set(['2026-09-04']); // 4-sep: solo hubo única (1h)
const SIN_CLASE_1H = new Set(['2026-09-11']); // 11-sep: solo hubo inicio/fin (2h)
// Viernes donde el check de "inicio" nunca se abrió (basta con "fin").
const SIN_INICIO   = new Set(['2026-09-25']);

const FECHAS_CLASE_GRUPO2_AREA2 = [
  ...JUEVES,
  ...VIERNES.filter(f => !SIN_CLASE_2H.has(f)).map(f => f + '-2h'),
  ...VIERNES.filter(f => !SIN_CLASE_1H.has(f)).map(f => f + '-1h'),
];

const esPresenteOJustificado = a => a.estado === 'presente' || a.estado === 'justificado';

// asists: registros de asistencia de Área 2 de un alumno de Grupo 2 (ya
// filtrados por área). Retorna el porcentaje (0-100) o null si no hay registros.
export function calcAsistPctGrupo2Area2(asists) {
  if (!asists.length) return null;

  let diasValidos = 0;

  for (const fecha of JUEVES) {
    const recs = asists.filter(a => a.fecha === fecha);
    if (recs.some(esPresenteOJustificado)) diasValidos++;
  }

  for (const f of VIERNES) {
    const recs = asists.filter(a => a.fecha === f);

    if (!SIN_CLASE_2H.has(f)) {
      const tieneInicio = recs.some(a => a.checkType === 'inicio' && esPresenteOJustificado(a));
      const tieneFin    = recs.some(a => a.checkType === 'fin'    && esPresenteOJustificado(a));
      const valido2h = SIN_INICIO.has(f) ? tieneFin : (tieneInicio && tieneFin);
      if (valido2h) diasValidos++;
    }

    if (!SIN_CLASE_1H.has(f)) {
      const tieneUnico = recs.some(a => a.checkType === 'unico' && esPresenteOJustificado(a));
      if (tieneUnico) diasValidos++;
    }
  }

  return Math.round((diasValidos / FECHAS_CLASE_GRUPO2_AREA2.length) * 100);
}
