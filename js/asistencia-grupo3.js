// =============================================================================
// AcadVet USAM — Regla de asistencia del Grupo 3 de Bacteriología y Micología
// Solo aplica a esa materia (Ciclo II 2026). Un día cuenta como asistido si el
// alumno tiene inicio Y fin presentes/justificados. El 31/ago (sin inicio) cuenta
// con su registro único. El denominador son las 12 clases fijas de abajo.
// =============================================================================

export const MATERIA_GRUPO3_BACTERIO_ID = '-OvBIKpy9g6swRnwNm7g';

const FECHAS_CLASE_GRUPO3 = [
  '2026-08-31', '2026-09-03', '2026-09-07', '2026-09-10', '2026-09-14', '2026-09-17',
  '2026-09-21', '2026-09-24', '2026-09-28', '2026-10-01', '2026-10-05', '2026-10-08',
];

const esPresenteOJustificado = a => a.estado === 'presente' || a.estado === 'justificado';

// asists: registros de asistencia de un alumno (ya filtrados por área)
// Retorna el porcentaje (0-100) o null si no hay registros.
export function calcAsistPctGrupo3(asists) {
  if (!asists.length) return null;
  const diasValidos = FECHAS_CLASE_GRUPO3.filter(fecha => {
    const regs = asists.filter(a => a.fecha === fecha);
    if (fecha === '2026-08-31') return regs.some(a => a.checkType === 'unico' && esPresenteOJustificado(a));
    return regs.some(a => a.checkType === 'inicio' && esPresenteOJustificado(a))
        && regs.some(a => a.checkType === 'fin' && esPresenteOJustificado(a));
  }).length;
  return Math.round((diasValidos / FECHAS_CLASE_GRUPO3.length) * 100);
}
