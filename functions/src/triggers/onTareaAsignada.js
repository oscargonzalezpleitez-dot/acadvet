const { onValueCreated } = require('firebase-functions/v2/database');
const { getAlumnoIdsByMateria } = require('../alumnos');
const { sendToAlumnos } = require('../push');

exports.onTareaAsignada = onValueCreated(
  'materias/{materiaId}/tareas_asignadas/{tareaId}',
  async (event) => {
    const { materiaId } = event.params;
    const tarea = event.data.val() || {};
    const alumnoIds = await getAlumnoIdsByMateria(materiaId);
    if (!alumnoIds.length) return;

    await sendToAlumnos(alumnoIds, {
      title: `Nueva tarea: ${tarea.titulo || ''}`,
      body:  tarea.fechaLimite ? `Fecha límite: ${tarea.fechaLimite}` : (tarea.descripcion || ''),
      url:   `./tareas.html?materia=${materiaId}`,
    });
  }
);
