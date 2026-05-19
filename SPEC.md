# AcadVet USAM — Feature Specification
> Versión: 0.1 (BORRADOR — pendiente de respuestas a clarificaciones)  
> Basado en: CONSTITUTION.md v1.0  
> Fecha: 2026-05-18

---

## Resumen ejecutivo

AcadVet USAM es una aplicación web de una sola página (SPA sin framework) que permite al Profesor Óscar González gestionar el expediente académico completo de sus estudiantes en USAM Facultad de Medicina Veterinaria. El sistema corre 100% en el navegador con datos persistidos en Firebase Realtime Database y se hostea en GitHub Pages.

**Materias en scope:**
- Bacteriología y Micología
- Bioquímica Veterinaria
- Laboratorio Clínico Veterinario

**Usuario único:** el profesor. Los alumnos no interactúan con el sistema.

---

## Módulos del sistema

```
AcadVet USAM
├── M0  Autenticación (PIN)
├── M1  Dashboard principal
├── M2  Gestión de materias y secciones
├── M3  Lista de alumnos por materia
├── M4  Expediente individual del alumno
│   ├── M4.1  Asistencias
│   ├── M4.2  Exámenes cortos
│   ├── M4.3  Parciales (I, II, III)
│   ├── M4.4  Exposiciones
│   ├── M4.5  Observaciones
│   └── M4.6  Resumen y estado académico
├── M5  Exportación individual (PDF / Word / Excel)
└── M6  Exportación grupal (Excel)
```

---

## M0 — Autenticación (PIN)

### Comportamiento
- Al abrir la app, si no hay sesión activa, se muestra la pantalla de PIN.
- El profesor ingresa su PIN (4–6 dígitos).
- El PIN se compara contra el valor almacenado en `Firebase /config/pin_hash` (SHA-256 del PIN).
- Si es correcto: se guarda un flag de sesión en `sessionStorage` y se redirige al dashboard.
- Si es incorrecto: se muestra error inline y se limpia el input. Sin bloqueo por intentos fallidos.
- La sesión dura hasta que se cierra la pestaña/navegador (sessionStorage, no localStorage).
- Hay un botón "Cerrar sesión" accesible desde la barra de navegación principal.

### UI
- Pantalla centrada, con el logo/nombre de la app grande.
- Input de PIN con dígitos tipo "dots" (oscurecidos), no texto plano.
- Botón "Ingresar" o confirmación con `Enter`.

### [NEEDS CLARIFICATION — NC-01]
> **¿Cuántos dígitos tiene tu PIN?** La constitution dice 4–6. ¿Ya tenés uno definido, o lo configuramos en el primer arranque de la app?  
> **Opción A:** PIN fijo hardcodeado en Firebase antes del primer deploy (el profesor lo ingresa manualmente en Firebase Console una sola vez).  
> **Opción B:** La primera vez que abre la app, se le pide al profesor que cree su PIN (flujo de setup inicial).  
> Recomiendo **Opción A** — es más simple y el profesor ya sabe usar Firebase Console.

---

## M1 — Dashboard Principal

### Comportamiento
- Primera vista post-login.
- Muestra un resumen rápido del estado actual: cuántos alumnos por materia, indicadores de rendimiento promedio, y acceso rápido a cada materia.
- Desde aquí se navega a cualquier módulo.

### Contenido de la vista
- **Header:** Nombre del sistema + nombre del profesor + botón cerrar sesión.
- **Tarjetas de materias activas:** Una card por cada materia activa del ciclo en curso.
  - Nombre de la materia
  - Ciclo activo
  - Número de alumnos inscritos
  - Promedio general del grupo (si hay notas)
  - Botón "Ver alumnos"
- **Accesos rápidos:** Agregar alumno, Ver todas las materias.

### [NEEDS CLARIFICATION — NC-02]
> **¿Qué información quieres ver de un vistazo en el dashboard?** ¿Te interesa ver el promedio grupal por materia desde el inicio? ¿O preferís que el dashboard sea simplemente una pantalla de acceso rápido a las materias, sin calcular nada pesado al inicio?  
> Impacta en cuántos reads hace Firebase al cargar la pantalla inicial.

---

## M2 — Gestión de Materias y Secciones

### Comportamiento
- El profesor puede crear, editar y archivar materias.
- Cada materia tiene:
  - Nombre (ej. "Bacteriología y Micología")
  - Ciclo (ej. "Ciclo I 2026")
  - Estado: Activa / Archivada
- Las materias archivadas no aparecen en el dashboard principal, pero sus datos se conservan en Firebase y se pueden consultar.
- Una materia "activa" es la que está en curso actualmente.

### [NEEDS CLARIFICATION — NC-03]
> **¿Puede haber dos secciones de la misma materia en el mismo ciclo?** Por ejemplo: "Bacteriología y Micología — Sección A" y "Bacteriología y Micología — Sección B", ambas activas simultáneamente.  
> Si la respuesta es **sí**, necesitamos un campo "Sección" separado del nombre.  
> Si la respuesta es **no**, el nombre de la materia es suficiente identificador.

### [NEEDS CLARIFICATION — NC-04]
> **¿Cuál es la nomenclatura de ciclo que usa USAM?** ¿"Ciclo I 2026", "2026-1", "I-2026", o alguna otra convención institucional? Quiero que los documentos exportados usen el término exacto que USAM usa.

### [NEEDS CLARIFICATION — NC-05]
> **¿Qué pasa con los alumnos cuando archivás una materia?** Los expedientes deben conservarse. ¿Necesitás poder acceder al historial de un ciclo archivado (ej. ver notas de Bacteriología del Ciclo I 2025)? ¿O solo necesitás el ciclo activo?

---

## M3 — Lista de Alumnos por Materia

### Comportamiento
- Al entrar a una materia, se muestra la lista completa de alumnos inscritos.
- Cada fila de alumno muestra: nombre completo, número de carné, promedio general actual, estado académico (badge de color), y botones de acción.
- Acciones por alumno: Ver expediente, Editar datos, Eliminar.
- Botón global: "Agregar alumno", "Exportar lista grupal (Excel)".
- Búsqueda/filtro por nombre o carné.
- Ordenamiento por nombre (A-Z) o por promedio.

### Datos de cada alumno (campos del registro)
- Nombre completo *
- Número de carné *
- (La materia y el ciclo son contexto de la sección, no se repiten por alumno)

*campos obligatorios

### [NEEDS CLARIFICATION — NC-06]
> **¿Cuántos alumnos tiene cada materia aproximadamente?** ¿Estamos hablando de 20–30 alumnos, 50–60, o más de 100? Esto afecta si necesitamos paginación o si una lista simple funciona bien.

### [NEEDS CLARIFICATION — NC-07]
> **¿Los alumnos son únicos por materia, o un mismo alumno puede estar en varias materias tuyas simultáneamente?** Si un alumno repite materia en otro ciclo, ¿es un registro nuevo o el mismo alumno con historial?  
> Esto define si el alumno es una entidad global (con materias dentro) o si cada inscripción es independiente.

### [NEEDS CLARIFICATION — NC-08]
> **¿Importación desde Excel/CSV?** ¿Necesitás poder subir una lista de alumnos desde un archivo, o el ingreso manual uno por uno es suficiente? El ingreso masivo es más trabajo de implementar pero ahorra tiempo si tenés 40+ alumnos por sección.

---

## M4 — Expediente Individual del Alumno

Vista principal del alumno, organizada en pestañas o secciones.

---

### M4.1 — Asistencias

#### Comportamiento
- El profesor puede registrar la asistencia de cada clase.
- Por cada entrada: Fecha, Estado (Presente / Ausente / Justificado).
- Se puede agregar, editar y eliminar registros de asistencia.
- Se calcula y muestra: % de asistencia total y % por estado.
- Ordenado cronológicamente (más reciente arriba o abajo — a definir).

#### Cálculo de % de asistencia
`% asistencia = (clases presentes / total de clases registradas) × 100`

### [NEEDS CLARIFICATION — NC-09]
> **¿"Justificado" cuenta como presente, como ausente, o tiene su propio peso?** Opciones:  
> - **A:** Justificado = Presente (no afecta el porcentaje negativamente)  
> - **B:** Justificado = ausente con nota (sí afecta el %, pero se distingue visualmente)  
> - **C:** Justificado se excluye del total (ni suma ni resta — como si ese día no existiera)  
> Necesito saberlo para el cálculo correcto.

### [NEEDS CLARIFICATION — NC-10]
> **¿La asistencia vale puntos en la nota final, o es solo informativa?** Si vale puntos: ¿qué porcentaje del total representa? ¿Es el mismo para las 3 materias?

---

### M4.2 — Exámenes Cortos

#### Comportamiento
- El profesor agrega exámenes cortos con: nombre del examen (ej. "Quiz 1 — Tema: Gram+") y nota (0–10).
- Puede agregar, editar y eliminar exámenes cortos.
- Se calcula: promedio de todos los exámenes cortos.
- Se muestran ordenados por fecha de registro.

### [NEEDS CLARIFICATION — NC-11]
> **¿Los exámenes cortos son ilimitados (el profesor agrega los que quiera) o hay un número fijo por ciclo?** Asumo que son dinámicos/ilimitados, pero confirmo.

### [NEEDS CLARIFICATION — NC-12]
> **¿Los exámenes cortos tienen fecha, o solo nombre y nota?** ¿Necesitás saber "este quiz fue el 15 de marzo"?

### [NEEDS CLARIFICATION — NC-13]
> **¿La nota de exámenes cortos es sobre 10 para todos, o podría ser sobre otro valor?** ¿Todos los quizzes son /10 o a veces son /5?

---

### M4.3 — Parciales (I, II, III)

#### Comportamiento
- El sistema tiene exactamente 3 parciales por ciclo: I Parcial, II Parcial, III Parcial.
- Cada parcial tiene una nota sobre 100.
- El profesor puede ingresar/editar la nota de cada parcial.
- Se muestra el promedio de los 3 parciales.

### [NEEDS CLARIFICATION — NC-14]
> **¿Los 3 parciales pesan igual en el promedio de la categoría (33.3% cada uno)?** ¿O el III Parcial / examen final tiene más peso?

### [NEEDS CLARIFICATION — NC-15]
> **¿Es posible que un alumno tenga solo 1 o 2 parciales registrados (porque el ciclo está en curso)?** ¿El promedio se calcula solo sobre los parciales ingresados, o siempre se divide entre 3?

---

### M4.4 — Exposiciones

#### Comportamiento
- El profesor agrega exposiciones con: tema de la exposición y nota (0–10).
- Puede agregar, editar y eliminar exposiciones.
- Se calcula: promedio de todas las exposiciones.

### [NEEDS CLARIFICATION — NC-16]
> **¿Cuántas exposiciones hay normalmente por ciclo por alumno?** ¿1, 2, 3? ¿Es dinámico también?

### [NEEDS CLARIFICATION — NC-17]
> **¿Las exposiciones son individuales o grupales?** Si son grupales, ¿todos los del grupo reciben la misma nota, o el profesor la ingresa individualmente por alumno? (Si son grupales, podría agilizarse el ingreso.)

---

### M4.5 — Observaciones

#### Comportamiento
- Campo de texto libre donde el profesor puede escribir cualquier nota sobre el alumno.
- Sin límite de longitud.
- Se guarda automáticamente (o con botón de guardar — a definir).
- Se incluye en las exportaciones del expediente.

---

### M4.6 — Resumen y Estado Académico

#### Comportamiento
- Sección visible en todo momento dentro del expediente (no requiere navegar a otra pestaña).
- Muestra:
  - % de asistencia
  - Promedio de exámenes cortos (sobre 10)
  - Promedio de parciales (sobre 100)
  - Promedio de exposiciones (sobre 10)
  - **Nota final calculada** (fórmula a definir — ver NC-18)
  - **Estado:** badge visual prominente

#### Estados académicos
| Estado | Color | Ícono |
|---|---|---|
| Aprobado | Verde (`--color-success`) | ✓ |
| En riesgo | Amarillo (`--color-warning`) | ⚠ |
| Reprobado | Rojo (`--color-danger`) | ✗ |

### [NEEDS CLARIFICATION — NC-18]
> **¿Cuál es la fórmula exacta de la nota final?** Esta es la clarificación más crítica del spec. Necesito saber el peso de cada categoría. Por ejemplo:  
>
> ```
> Nota Final = (Promedio Parciales × 0.50)
>            + (Promedio Exámenes Cortos × 0.20)
>            + (Promedio Exposiciones × 0.20)
>            + (% Asistencia / 10 × 0.10)
> ```
>
> ¿Es esta la fórmula, o es diferente? ¿Es la misma fórmula para las 3 materias (Bacteriología, Bioquímica, Lab. Clínico)?  
> **Si las materias tienen fórmulas distintas, necesito la fórmula de cada una por separado.**

### [NEEDS CLARIFICATION — NC-19]
> **¿Cuáles son los umbrales numéricos para cada estado académico?**  
> Ejemplos posibles:
> - `>= 60` → Aprobado
> - `50–59` → En riesgo
> - `< 50` → Reprobado
>
> ¿Cuáles son los valores reales que usa USAM o tus propios criterios?

---

## M5 — Exportación Individual del Alumno

### Comportamiento
- Desde el expediente de cualquier alumno, el profesor puede exportar en 3 formatos.
- Los 3 formatos contienen la misma información: todos los datos del expediente completo.
- La exportación se genera en el navegador (no requiere conexión adicional).

### Contenido del documento exportado
1. **Membrete:** Nombre de la institución (USAM), facultad, nombre del sistema, ciclo, fecha de emisión.
2. **Datos del alumno:** Nombre completo, carné, materia.
3. **Tabla de asistencias:** Fecha, estado, resumen de %.
4. **Tabla de exámenes cortos:** Nombre, nota, promedio.
5. **Tabla de parciales:** I, II, III Parcial con notas.
6. **Tabla de exposiciones:** Tema, nota, promedio.
7. **Observaciones:** Texto libre.
8. **Resumen:** Nota final calculada, estado académico.

### Formatos

#### PDF (jsPDF)
- Documento tipo carta o A4.
- Header con membrete estilizado (nombre USAM en bold, facultad, línea separadora).
- Tablas con bordes y colores alternados por fila.
- Estado académico resaltado con color.

#### Word (.docx via docx.js)
- Misma estructura que el PDF.
- Tablas editables en Word.
- El profesor podría hacer ajustes manuales post-exportación.

#### Excel (.xlsx via SheetJS)
- Una hoja por alumno: "Expediente".
- Primera sección: datos del alumno.
- Secciones separadas por grupos de filas: asistencias, quizzes, parciales, exposiciones, resumen.
- Celdas de totales/promedios con formato numérico.

### [NEEDS CLARIFICATION — NC-20]
> **¿Tienen logo institucional de USAM?** Si hay un archivo de imagen (PNG/JPG) del logo, se puede incluir en el PDF y Word. Si no, el membrete será solo texto formateado.

### [NEEDS CLARIFICATION — NC-21]
> **¿El documento exportado tiene algún formato oficial o es de uso personal del profesor?** Si es un documento que se presenta a coordinación académica, puede haber un formato que la USAM espere. Si es solo para uso propio del profesor, tenemos libertad total de diseño.

---

## M6 — Exportación Grupal (Excel)

### Comportamiento
- Desde la vista de lista de alumnos de una materia, el profesor exporta un Excel con todos los alumnos.
- Un solo archivo, con todos los alumnos de la sección activa.

### Estructura del Excel grupal

**Hoja 1: "Notas Generales"**

| N° | Nombre | Carné | % Asistencia | Prom. Quizzes | Parcial I | Parcial II | Parcial III | Prom. Parciales | Prom. Exposiciones | Nota Final | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Juan Pérez | 2023001 | 90% | 8.5 | 75 | 80 | 85 | 80 | 9.0 | 78.5 | Aprobado |

- Filas con color alternado.
- Fila de encabezado con fondo del color primario de la app.
- Última fila: promedios del grupo en cada columna.

### [NEEDS CLARIFICATION — NC-22]
> **¿Querés una hoja adicional en el Excel grupal con el detalle de asistencias (quién faltó qué día)?** Sería una segunda hoja tipo "Registro de Asistencias" con fechas como columnas y alumnos como filas.

### [NEEDS CLARIFICATION — NC-23]
> **¿El Excel grupal incluye los quizzes individuales (Quiz 1, Quiz 2, Quiz 3...) en columnas separadas, o solo el promedio?** Con columnas separadas el archivo es más detallado pero más ancho. Solo promedio es más limpio.

---

## Estructura de datos Firebase (propuesta)

```json
{
  "config": {
    "pin_hash": "<SHA-256 del PIN>",
    "version": "1.0"
  },
  "materias": {
    "<id_materia>": {
      "nombre": "Bacteriología y Micología",
      "ciclo": "Ciclo I 2026",
      "estado": "activa",
      "creado_en": 1747612800000
    }
  },
  "alumnos": {
    "<id_alumno>": {
      "nombre": "Juan Carlos Pérez López",
      "carnet": "2023001",
      "materia_id": "<id_materia>",
      "creado_en": 1747612800000,
      "asistencias": {
        "<id>": {
          "fecha": "2026-03-05",
          "estado": "presente"
        }
      },
      "quizzes": {
        "<id>": {
          "nombre": "Quiz 1 — Bacterias Gram+",
          "nota": 8.5,
          "fecha": "2026-03-10"
        }
      },
      "parciales": {
        "parcial_1": 75,
        "parcial_2": 80,
        "parcial_3": null
      },
      "exposiciones": {
        "<id>": {
          "tema": "Cultivos bacterianos",
          "nota": 9.0,
          "fecha": "2026-04-15"
        }
      },
      "observaciones": "Alumno con buen desempeño, se ausenta con justificación médica."
    }
  }
}
```

**Nota:** Esta estructura asume que cada alumno pertenece a una sola materia (registro por inscripción, no por persona). Si NC-07 resulta en que un alumno puede estar en múltiples materias, la estructura cambia.

---

## Navegación y flujo de pantallas

```
[Login PIN]
    ↓ (PIN correcto)
[Dashboard — Cards de materias]
    ↓ (click en materia)
[Lista de alumnos]
    ↓ (click en alumno)
[Expediente individual]
    ├── Tab: Asistencias
    ├── Tab: Quizzes
    ├── Tab: Parciales
    ├── Tab: Exposiciones
    └── Tab: Observaciones
    (Resumen visible en sidebar o header permanente)
    ↓ (click Exportar)
[Modal de exportación: PDF / Word / Excel]
    ↓ (descarga directa)
```

Hash routing propuesto:
- `#/` → Dashboard
- `#/materia/:id` → Lista de alumnos
- `#/alumno/:id` → Expediente
- `#/materias` → Gestión de materias

---

## Componentes de UI reutilizables

| Componente | Descripción |
|---|---|
| `<stat-card>` | Card con número grande, label y color de acento |
| `<data-table>` | Tabla con zebra-stripe, ordenamiento, acciones por fila |
| `<badge-estado>` | Badge de color para estado académico |
| `<modal>` | Modal genérico con overlay y animación de entrada |
| `<empty-state>` | Ilustración + texto cuando no hay datos |
| `<pin-input>` | Input de PIN con dígitos obscurecidos |
| `<export-menu>` | Dropdown/modal para seleccionar formato de exportación |

---

## Scope out (fuera de este spec)

- Importación masiva desde Excel (podría ser v2 si NC-08 lo decide)
- Historial de múltiples ciclos del mismo alumno (podría ser v2)
- Notificaciones o alertas automáticas
- Modo oscuro
- Integración con el sistema QR existente

---

## Resumen de clarificaciones pendientes

| ID | Área | Pregunta clave |
|---|---|---|
| NC-01 | Auth | ¿Cómo se configura el PIN inicial? |
| NC-02 | Dashboard | ¿Qué datos mostrar en el resumen inicial? |
| NC-03 | Materias | ¿Hay secciones (A, B) dentro de una materia? |
| NC-04 | Materias | ¿Nomenclatura exacta del ciclo en USAM? |
| NC-05 | Materias | ¿Se necesita acceso al historial de ciclos archivados? |
| NC-06 | Alumnos | ¿Cuántos alumnos tiene cada materia? |
| NC-07 | Alumnos | ¿Un alumno puede estar en múltiples materias simultáneamente? |
| NC-08 | Alumnos | ¿Importación desde Excel/CSV? |
| NC-09 | Asistencias | ¿"Justificado" cuenta como presente, ausente, o se excluye? |
| NC-10 | Asistencias | ¿La asistencia vale puntos en la nota final? |
| NC-11 | Quizzes | ¿Son dinámicos (ilimitados) o número fijo por ciclo? |
| NC-12 | Quizzes | ¿Los quizzes tienen fecha registrada? |
| NC-13 | Quizzes | ¿Siempre sobre 10, o puede variar? |
| NC-14 | Parciales | ¿Peso igual para los 3 parciales o el 3ro tiene más peso? |
| NC-15 | Parciales | ¿Promedio sobre los ingresados o siempre entre 3? |
| NC-16 | Exposiciones | ¿Cuántas exposiciones por ciclo? ¿Dinámicas? |
| NC-17 | Exposiciones | ¿Individuales o grupales? |
| NC-18 | Calificación | **¿Fórmula exacta de la nota final? ¿Es igual para las 3 materias?** |
| NC-19 | Estados | ¿Umbrales numéricos para Aprobado / En riesgo / Reprobado? |
| NC-20 | Exportación | ¿Tienen logo institucional USAM? |
| NC-21 | Exportación | ¿El documento es para uso personal o presentación oficial? |
| NC-22 | Excel grupal | ¿Hoja adicional con detalle de asistencias por fecha? |
| NC-23 | Excel grupal | ¿Quizzes individuales en columnas separadas o solo promedio? |

---

*Una vez respondidas las clarificaciones, este spec se cierra en v1.0 y se convierte en la referencia de implementación.*
