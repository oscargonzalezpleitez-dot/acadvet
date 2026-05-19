# AcadVet USAM — Project Constitution
> Sistema de Gestión Académica Veterinaria · USAM Facultad de Medicina Veterinaria  
> Autor: Óscar González · Versión: 1.0 · Fecha: 2026-05-18

---

## 1. Identidad del Proyecto

**AcadVet USAM** es una herramienta de escritorio-web para uso exclusivo del profesor, construida para gestionar el trabajo académico de la Facultad de Medicina Veterinaria de USAM. No es un LMS, no es un portal de alumnos. Es la navaja suiza digital del docente: registro de notas, asistencia manual, generación de reportes y exportación de documentos oficiales — todo desde el navegador, sin instalar nada.

**Separación de responsabilidades institucionales:**

| Sistema | Propósito | Stack |
|---|---|---|
| Sistema QR (existente) | Control de asistencia por QR | (separado) |
| **AcadVet USAM (este proyecto)** | Gestión académica integral | HTML/CSS/JS + Firebase |

Ambos comparten la institución (USAM), pero son repositorios y deployments independientes. No deben acoplarse técnicamente.

---

## 2. Stack — Decisiones y Justificaciones

### 2.1 Frontend: HTML + CSS + JavaScript Vanilla

**Decisión:** Sin frameworks (no React, no Vue, no Angular).

**Por qué:**
- El desarrollador es uno solo (Óscar). Cero tiempo para aprender y mantener toolchains de build.
- GitHub Pages sirve archivos estáticos directamente. No hay proceso de build que pueda fallar.
- Para la escala del proyecto (1 profesor, ~200 alumnos máximo), un framework sería ingeniería en exceso.
- El JS vanilla moderno (ES2020+) con módulos nativos es suficientemente poderoso.

**Regla:** Si algo puede hacerse con `document.querySelector`, `fetch`, o un módulo ES, no se inventa una abstracción encima.

---

### 2.2 Base de datos: Firebase Realtime Database

**Decisión:** Firebase Realtime Database (no Firestore, no SQL).

**Por qué:**
- Sin backend propio, Firebase es el único almacenamiento persistente viable.
- Realtime Database tiene un tier gratuito generoso y una API JS sencilla.
- La estructura de datos del proyecto es plana/jerárquica (alumnos → notas), encajando bien con el modelo JSON de RTDB.
- El profesor trabaja solo: no hay concurrencia que justifique Firestore.

**Regla:** Los datos viven en Firebase. Nada importante se guarda solo en `localStorage` (puede usarse como caché de sesión, no como fuente de verdad).

---

### 2.3 Hosting: GitHub Pages

**Decisión:** Deploy directo desde el repositorio GitHub.

**Por qué:**
- Gratuito, sin configuración de servidor.
- El profesor ya tiene experiencia con este flujo.
- Un `git push` es todo el CI/CD necesario.

**Regla:** El proyecto debe funcionar sirviendo `index.html` desde la raíz del repositorio. Sin rutas dinámicas del servidor. Toda la navegación es client-side (hash routing o estado en JS).

---

### 2.4 Exportaciones: Librerías JS del lado del cliente

| Formato | Librería | Versión recomendada |
|---|---|---|
| PDF | jsPDF | ^2.5 |
| Excel (.xlsx) | SheetJS (xlsx) | ^0.18 |
| Word (.docx) | docx.js | ^8.x |

**Por qué client-side:**
- Sin backend, la generación ocurre en el navegador del profesor.
- Los documentos son de uso interno (tamaño manejable, sin necesidad de optimización de servidor).

**Regla:** Las librerías de exportación se cargan con `<script>` desde CDN o se incluyen como archivos locales en `/libs`. No se usan bundlers. El `type="module"` de ES6 es suficiente para organizar el código.

---

### 2.5 Autenticación: PIN simple

**Decisión:** El acceso se controla con un PIN de 4–6 dígitos, verificado contra Firebase o hardcodeado en configuración.

**Por qué:**
- La aplicación no maneja datos sensibles de terceros (es uso interno del profesor).
- Firebase Auth añadiría complejidad de UX (email, recuperación de contraseña) que no aporta valor real.
- El PIN ofrece protección suficiente contra acceso accidental en un contexto universitario.

**Regla:** No se implementa recuperación de contraseña, múltiples usuarios, ni roles. Si en el futuro se necesita multi-usuario, ese es un rediseño completo, no una extensión de este sistema.

---

## 3. Principios de Arquitectura

### 3.1 Estructura de archivos

```
acadvet-usam/
├── index.html              # Entry point / login con PIN
├── app.html                # Shell principal (post-login)
├── css/
│   ├── main.css            # Variables, reset, base
│   ├── components.css      # Cards, botones, tablas, modales
│   └── views.css           # Estilos específicos por vista
├── js/
│   ├── firebase-config.js  # Credenciales Firebase (sin secrets sensibles)
│   ├── auth.js             # Lógica de PIN
│   ├── db.js               # Capa de acceso a Firebase RTDB
│   ├── router.js           # Hash router minimalista
│   ├── views/              # Un archivo JS por vista principal
│   └── export/             # jsPDF, SheetJS, docx wrappers
├── libs/                   # Librerías JS locales (si no se usa CDN)
└── assets/
    ├── icons/
    └── fonts/
```

### 3.2 Separación de responsabilidades

- **`db.js`** es la única capa que habla con Firebase. El resto del código llama funciones de `db.js`, nunca llama a Firebase directamente.
- **Las vistas** renderizan HTML dinámicamente y delegan toda persistencia a `db.js`.
- **Los exportadores** reciben datos como objetos JS puros; no saben nada de Firebase.

### 3.3 Sin transpilación, sin bundling

- El código usa ES2020 nativo. Los módulos se cargan con `<script type="module">`.
- No hay `webpack`, `vite`, ni `babel`. Lo que se sube al repo es lo que el navegador ejecuta.
- Esto garantiza que el proyecto siga siendo mantenible y deployable indefinidamente, sin dependencias de toolchain.

---

## 4. Principios de Diseño Visual

### 4.1 Personalidad: Gaming/Tech con identidad universitaria

AcadVet USAM no debe verse como un portal gubernamental ni como un ERP corporativo. Debe sentirse como un dashboard de aplicación moderna — con energía, claridad y vida.

**Referencias de inspiración:** dashboards de videojuegos, paneles de control tech, interfaces de apps para desarrolladores (no dark mode oscuro y gris, sino vibrante y estructurado).

### 4.2 Paleta de color

```css
/* Primarios — energía y modernidad */
--color-primary:       #6C63FF;  /* Violeta eléctrico */
--color-primary-light: #A29BFE;
--color-accent:        #00D2D3;  /* Cyan turquesa */
--color-accent-alt:    #FF6B6B;  /* Coral/rojo vibrante */

/* Fondos — claros, con personalidad */
--color-bg:            #F0F2FF;  /* Blanco-violáceo suave */
--color-surface:       #FFFFFF;
--color-surface-2:     #ECEEFF;  /* Cards secundarias */

/* Texto */
--color-text-primary:  #1A1A2E;  /* Azul muy oscuro, no negro puro */
--color-text-secondary:#4A4A6A;
--color-text-muted:    #8888AA;

/* Semánticos */
--color-success:       #00B894;
--color-warning:       #FDCB6E;
--color-danger:        #FF6B6B;
--color-info:          #74B9FF;
```

**Regla:** No usar `#000000` ni `#FFFFFF` puros. El negro es `--color-text-primary`, el blanco es `--color-surface`.

### 4.3 Tipografía

```css
/* Fuente principal: Inter o Poppins (Google Fonts) */
--font-display: 'Poppins', sans-serif;   /* Headings, números grandes */
--font-body:    'Inter', sans-serif;     /* Texto de interfaz */

--font-weight-bold:    700;
--font-weight-medium:  500;
--font-weight-regular: 400;
```

**Regla:** Los números importantes (calificaciones, conteos, estadísticas) usan `--font-display` en bold y tamaño grande. Son los héroes visuales de cada vista.

### 4.4 Espaciado y layout

```css
--radius-sm:  6px;
--radius-md:  12px;
--radius-lg:  20px;
--radius-xl:  32px;   /* Para cards principales */

--shadow-sm:  0 2px 8px rgba(108, 99, 255, 0.08);
--shadow-md:  0 4px 20px rgba(108, 99, 255, 0.15);
--shadow-lg:  0 8px 40px rgba(108, 99, 255, 0.20);
```

**Regla:** Las cards tienen bordes redondeados grandes y sombras con el tinte del color primario (no grises neutras). Esto da cohesión visual sin necesitar imágenes decorativas.

### 4.5 Elementos con vida

- **Gradientes sutiles** en headers de sección y cards destacadas.
- **Micro-animaciones** en hover de botones y cards (transform + shadow, no más de 200ms).
- **Indicadores visuales** para estados (aprobado/reprobado con color + ícono).
- **Empty states** con ilustraciones simples en SVG o texto grande y amigable — nunca una tabla vacía y muda.

### 4.6 Mobile-friendly pero desktop-first

- El layout base es de 2–3 columnas en escritorio (≥1024px).
- En móvil (≤768px), colapsa a una columna.
- Los controles táctiles tienen mínimo 44×44px de área de toque.
- La experiencia óptima y más testeada es en escritorio del profesor.

---

## 5. Principios de Desarrollo

### 5.1 Simplicidad sobre abstracción

> "Tres líneas similares son mejor que una abstracción prematura."

Si una función se usa dos veces, está bien repetirla. Si se usa cinco veces en contextos muy similares, se extrae. No se diseña para requerimientos hipotéticos futuros.

### 5.2 Sin manejo de errores especulativos

Solo se valida en los bordes del sistema:
- Entrada del profesor (formularios).
- Respuestas de Firebase.

No se añaden try/catch a funciones internas que no pueden fallar de manera significativa.

### 5.3 Sin comentarios redundantes

Los comentarios explican **por qué**, no **qué**. El nombre de la función ya dice qué hace. Un comentario que dice `// guarda el alumno en Firebase` frente a `saveStudent()` es ruido.

### 5.4 Datos de alumnos: estructura Firebase

```json
{
  "alumnos": {
    "{id_alumno}": {
      "nombre": "Juan Pérez",
      "carnet": "2023001",
      "ciclo": "2026-1",
      "materias": {
        "{id_materia}": {
          "nombre": "Anatomía Veterinaria I",
          "notas": { "parcial1": 8.5, "parcial2": 7.0, "final": 9.0 },
          "asistencias": { "2026-03-05": true, "2026-03-12": false }
        }
      }
    }
  },
  "config": {
    "pin_hash": "...",
    "materias_activas": ["Anatomía Veterinaria I", "Fisiología Animal"]
  }
}
```

Esta estructura es una guía inicial — puede ajustarse durante el desarrollo, pero la jerarquía `alumno → materia → datos` es el modelo mental central.

---

## 6. Lo que este sistema NO es y NO hará

- **No es un portal de alumnos.** Los alumnos no tienen login ni acceso.
- **No es un sistema multi-profesor.** No hay roles, no hay permisos por usuario.
- **No es un LMS.** No hay módulos de contenido, foros, ni entrega de tareas.
- **No se integra con el sistema QR existente** (comparten institución, no código).
- **No requiere un servidor propio.** Si algo requiere un servidor, está fuera del scope.
- **No tiene recuperación de contraseña.** El PIN se reestablece editando Firebase directamente.

---

## 7. Definition of Done

Una funcionalidad está **terminada** cuando:

1. Funciona en Chrome desktop (versión actual).
2. Es usable en mobile (no necesita ser perfecta, sí funcional).
3. Los datos se persisten en Firebase y sobreviven un refresh de página.
4. Las exportaciones generan archivos correctos y descargables.
5. El diseño sigue los tokens de color/tipografía de esta constitution.
6. No hay `console.error` activos relacionados con la funcionalidad.

---

*Esta constitution es el documento de referencia para todas las decisiones de diseño y arquitectura del proyecto. Si surge una duda sobre enfoque o implementación, la respuesta está aquí o se añade aquí.*
