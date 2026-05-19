# AcadVet USAM — Tasks
> Regla: marcar ✓ al terminar cada tarea. No avanzar sin aprobación del profesor.

---

## Fase 0 — Fundación

- [✓] **T01** — Estructura del proyecto + CSS Design System + Pantalla de login
  - Carpetas y archivos base del proyecto
  - `css/main.css`: tokens de diseño, reset, tipografía, botones base
  - `css/components.css`: placeholder con tokens de componentes
  - `css/views.css`: estilos de pantalla de login
  - `index.html`: pantalla de PIN completamente diseñada
  - `js/firebase-config.js`: template con instrucciones de configuración
  - `js/auth.js`: lógica de PIN (SHA-256 + sessionStorage)
  - `app.html`: placeholder de shell principal

- [✓] **T02** — App Shell + Hash Router + Dashboard
  - `app.html`: shell con sidebar/nav completo
  - `js/router.js`: hash router minimalista
  - `js/views/dashboard.js`: cards de materias activas
  - `css/components.css`: cards, badges, botones, modales, tablas

- [✓] **T03** — Firebase RTDB: capa de datos (db.js)
  - `js/db.js`: funciones CRUD para materias, alumnos e inscripciones
  - Conectar dashboard con datos reales de Firebase

---

## Fase 1 — Materias y Alumnos

- [✓] **T04** — CRUD de Materias
  - `js/views/materias.js`: vista lista de materias
  - Formulario: crear / editar materia (nombre, ciclo, sección)
  - Archivar materia
  - Modal de confirmación para archivar

- [✓] **T05** — Lista de Alumnos por Materia
  - `js/views/alumnos.js`: tabla de alumnos con filtro/búsqueda
  - Badge de estado académico por alumno
  - Ordenamiento por nombre / por promedio

- [✓] **T06** — CRUD de Alumnos
  - Formulario: agregar alumno (nombre, carné)
  - Editar alumno
  - Eliminar alumno (modal de confirmación)

---

## Fase 2 — Expediente Individual ★ (feature crítica)

- [✓] **T07** — Shell del Expediente + Tab Asistencias
  - `js/views/expediente.js`: layout con header del alumno + tabs
  - Tab Asistencias: lista, agregar (fecha + estado), editar, eliminar
  - Cálculo y display de % asistencia
  - Justificado cuenta como Presente

- [✓] **T08** — Tab Exámenes Cortos
  - CRUD de quizzes (nombre + nota /10) organizados por Área 1 / Área 2 / Área 3
  - Cálculo y display de promedio por área
  - Barra visual de nota, ordenado por fecha

- [✓] **T09** — Tab Parciales (I, II, III)
  - Ingreso de nota por parcial (sobre 100)
  - Promedio calculado sobre los parciales ingresados

- [✓] **T10** — Tab Exposiciones
  - CRUD de exposiciones (tema + nota /10)
  - La exposición cuenta como quiz del Área 3 en la nota final

- [✓] **T11** — Tab Observaciones
  - Campo textarea con autoguardado en Firebase

- [✓] **T12** — Resumen y Estado Académico
  - Fórmula: Q1×15% + P1×15% + Q2×15% + P2×15% + Q3×20% + P3×20%
  - Área 3 combina quizzes + exposición
  - Badge: Aprobado (≥6.0) / En riesgo (5.0–5.9) / Reprobado (<5.0)
  - Nota final aparece cuando todos los componentes tienen datos

---

## Fase 3 — Exportaciones

- [✓] **T13** — Exportación Individual PDF (jsPDF)
  - Membrete USAM (nombre institución, facultad, fecha)
  - Todas las secciones del expediente con autotable
  - Estado académico con badge a color
  - Descarga como `Expediente_{alumno}_{materia}.pdf`

- [✓] **T14** — Exportación Individual Word (docx.js)
  - Misma estructura que PDF
  - Tablas editables con header púrpura + filas alternadas
  - Descarga como `.docx`

- [✓] **T15** — Exportación Individual Excel (ExcelJS)
  - Hoja única "Expediente" con todas las secciones
  - Celdas de notas con formato numérico, filas alternas, colores semánticos

- [✓] **T16** — Exportación Grupal Excel (ExcelJS)
  - Una fila por alumno: nombre, carné, % asistencia, promedios, nota final, estado con color
  - Fila de promedios grupales al final (dark bg)
  - Header con color primario, orientación horizontal

---

## Fase 4 — Polish

- [✓] **T17** — Empty States + Micro-animaciones
  - Entrada animada en las 4 vistas (viewEnter 180ms)
  - Hover lift: exp-stat-cards, quiz-area, parcial-cards, nota-rows, asist-rows
  - Button :active press (scale 0.97), export buttons glow, breadcrumb links
  - Empty state icon con bounce suave continuo

- [✓] **T18** — Responsividad Mobile
  - Revisar todas las vistas en ≤768px
  - Menú sidebar colapsable en mobile

- [✓] **T19** — Testing Final + Deploy
  - Verificar flujo completo en Chrome desktop
  - Verificar usabilidad en mobile
  - `README.md` con instrucciones de deploy en GitHub Pages

---

## Fase 5 — Módulo QR + Integración

- [✓] **T20** — Sesión QR (lado profesor)
  - Botón "Sesión QR" en la vista de alumnos por materia
  - Genera token alfanumérico + QR que apunta a `registro.html`
  - Rotación automática del token (1/2/3/5 min) + temporizador visual
  - Panel en vivo: contador de presentes actualizándose en tiempo real
  - Botón Detener → archiva sesión en Firebase

- [✓] **T21** — Página pública de registro para alumnos (`registro.html`)
  - Accesible sin PIN (pública)
  - Formulario: nombre, carné, código QR
  - Validación: token activo en Firebase, no expirado
  - Deduplicación: mismo carné no puede registrarse dos veces
  - Match automático con alumnos inscritos → registra asistencia en su expediente
  - Pantalla de confirmación

- [✓] **T22** — Importar asistencias desde sistema QR externo
  - Botón "Importar CSV" en la tab Asistencias del expediente
  - Parsea el CSV exportado del sistema QR (columnas: nombre, carnet, hora, estado)
  - Mapea por carné → agrega asistencias al alumno correspondiente
  - Preview antes de confirmar, reporte de coincidencias/no encontrados

- [✓] **T23** — Vista Proyector
  - Ruta `#/proyector/:materiaId` accesible desde la vista de alumnos
  - Pantalla completa: QR grande + materia + token + contador de presentes + temporizador
  - Optimizada para proyectar en el aula

---

**Total: 23 tareas | Completadas: 23 | Pendientes: 0**
