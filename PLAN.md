# AcadVet USAM — Plan de Implementación
> Última actualización: 2026-05-18

---

## Decisiones técnicas confirmadas

| Decisión | Valor |
|---|---|
| Stack | HTML/CSS/JS Vanilla + Firebase RTDB + GitHub Pages |
| Modulos JS | ES Modules nativos (`type="module"`) |
| Firebase SDK | v10.14.1 desde CDN gstatic (sin npm, sin bundler) |
| Hash de PIN | Web Crypto API (`crypto.subtle.digest`) |
| Ciclo USAM | "Ciclo I 2026" / "Ciclo II 2026" |
| Alumno global | Un alumno puede estar en múltiples materias (entidad global) |
| Justificado | Cuenta como Presente (no penaliza % asistencia) |
| Secciones | Una materia puede tener Sección A y Sección B |

## Datos pendientes (bloquean T12)

- [ ] Fórmula de nota final: Bacteriología y Micología
- [ ] Fórmula de nota final: Bioquímica Veterinaria
- [ ] Fórmula de nota final: Laboratorio Clínico Veterinario
- [ ] Umbrales de estado académico (Aprobado / En riesgo / Reprobado) por materia

---

## Estructura de datos Firebase

```
/
├── config/
│   ├── pin_hash          (string SHA-256)
│   └── version           (string "1.0")
│
├── materias/
│   └── {materiaId}/
│       ├── nombre        (string)
│       ├── ciclo         (string "Ciclo I 2026")
│       ├── seccion       (string "A" | "B" | null)
│       ├── estado        (string "activa" | "archivada")
│       └── creado_en     (number timestamp)
│
└── alumnos/
    └── {alumnoId}/
        ├── nombre        (string)
        ├── carnet        (string)
        ├── creado_en     (number timestamp)
        └── inscripciones/
            └── {materiaId}/
                ├── asistencias/
                │   └── {asistenciaId}/
                │       ├── fecha   (string "YYYY-MM-DD")
                │       └── estado  (string "presente" | "ausente" | "justificado")
                ├── quizzes/
                │   └── {quizId}/
                │       ├── nombre  (string)
                │       ├── nota    (number 0-10)
                │       └── fecha   (string "YYYY-MM-DD" | null)
                ├── parciales/
                │   ├── parcial_1  (number | null)
                │   ├── parcial_2  (number | null)
                │   └── parcial_3  (number | null)
                ├── exposiciones/
                │   └── {expId}/
                │       ├── tema    (string)
                │       ├── nota    (number 0-10)
                │       └── fecha   (string "YYYY-MM-DD" | null)
                └── observaciones  (string)
```

---

## Fases de implementación

### Fase 0 — Fundación (T01–T03)
Estructura del proyecto, sistema de diseño, login, app shell, router, Firebase.

### Fase 1 — Materias y Alumnos (T04–T06)
CRUD de materias, lista de alumnos, CRUD de alumnos.

### Fase 2 — Expediente (T07–T12) ← Feature más crítica
Todas las tabs del expediente individual: asistencias, quizzes, parciales, exposiciones, observaciones, resumen con estado académico.

### Fase 3 — Exportaciones (T13–T16)
PDF, Word, Excel individual, Excel grupal.

### Fase 4 — Polish (T17–T19)
Empty states, animaciones, responsividad, deploy.

---

## Reglas de navegación (hash routing)

| Hash | Vista |
|---|---|
| `#/` | Dashboard (materias activas) |
| `#/materias` | Gestión de materias |
| `#/materia/:id` | Lista de alumnos de la materia |
| `#/alumno/:id` | Expediente del alumno (contexto de materia en query param) |
