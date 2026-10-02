// =============================================================================
// AcadVet USAM — Rúbrica de Exposición (11 criterios, 100 puntos)
// Compartida entre calificar-grupo.js (formulario de calificación) y
// exposiciones-export.js (exportación a Excel/PDF) para que ambos usen
// exactamente los mismos criterios y máximos.
// =============================================================================

export const CRITERIOS = [
  { id: 'dominio',      label: 'Dominio del tema',            desc: 'Demuestra conocimiento, explica sin depender completamente de las diapositivas y responde preguntas con seguridad.', max: 20 },
  { id: 'organizacion', label: 'Organización del contenido',  desc: 'Sigue el orden establecido en la guía de exposición y desarrolla todos los apartados.', max: 15 },
  { id: 'rigor',        label: 'Rigor científico',             desc: 'La información es correcta, actualizada y utiliza terminología científica apropiada.', max: 15 },
  { id: 'calidad',      label: 'Calidad de la presentación',   desc: 'Diapositivas claras, ordenadas, con imágenes pertinentes y poco texto.', max: 10 },
  { id: 'bibliografia', label: 'Uso de bibliografía',          desc: 'Emplea fuentes científicas confiables y cita adecuadamente la información.', max: 5 },
  { id: 'voz',          label: 'Voz y dicción',                desc: 'Habla con volumen adecuado, buena pronunciación y vocaliza correctamente.', max: 5 },
  { id: 'fluidez',      label: 'Fluidez y seguridad',          desc: 'Mantiene un ritmo adecuado, evita leer constantemente y demuestra confianza.', max: 5 },
  { id: 'corporal',     label: 'Lenguaje corporal',            desc: 'Mantiene contacto visual, postura adecuada, gestos naturales y evita distracciones.', max: 5 },
  { id: 'tiempo',       label: 'Manejo del tiempo',            desc: 'Cumple con el tiempo asignado sin omitir ni extenderse innecesariamente.', max: 5 },
  { id: 'equipo',       label: 'Trabajo en equipo',            desc: 'Participación equilibrada, buena coordinación y transiciones fluidas entre integrantes.', max: 5 },
  { id: 'preguntas',    label: 'Respuesta a preguntas',        desc: 'Responde correctamente las preguntas del docente y de los compañeros.', max: 10 },
];

export const MAX_TOTAL = CRITERIOS.reduce((s, c) => s + c.max, 0); // 100
