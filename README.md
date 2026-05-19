# AcadVet USAM

Sistema de Gestión Académica Veterinaria para el Prof. Óscar González · USAM Facultad de Medicina Veterinaria.

Gestión de materias, alumnos, notas, asistencias y exportación de expedientes en PDF, Word y Excel — todo desde el navegador, sin instalar nada.

---

## Requisitos previos

- Cuenta en [GitHub](https://github.com) (gratuita)
- Proyecto en [Firebase](https://console.firebase.google.com) con **Realtime Database** habilitada (plan Spark gratuito)
- Google Chrome (navegador recomendado)

---

## Paso 1 — Configurar Firebase

### 1.1 Crear la base de datos

1. En [Firebase Console](https://console.firebase.google.com), abrí tu proyecto.
2. En el menú lateral: **Build → Realtime Database → Create database**.
3. Elegí la región más cercana (ej. `us-central1`) y seleccioná **Start in test mode**.

### 1.2 Abrir las reglas de acceso

En la pestaña **Rules** de tu Realtime Database, pegá:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Hacé clic en **Publish**.

> **Nota de seguridad:** Las reglas son abiertas porque la autenticación ocurre en el navegador mediante PIN. Quien conozca la URL de tu base de datos podría leer los datos — este es un trade-off aceptable para uso personal de un solo profesor.

### 1.3 Obtener las credenciales

1. En Firebase Console: **Project Settings** (ícono de engranaje) → **General** → **Your apps** → **Web app** (ícono `</>`).
2. Si no tenés una app web registrada, hacé clic en el ícono `</>` para agregar una. Dale un nombre (ej. `acadvet-usam`) y **no** actives Firebase Hosting.
3. Copiá el objeto `firebaseConfig` que aparece.

### 1.4 Pegar las credenciales en el proyecto

Abrí `js/firebase-config.js` y reemplazá los valores `YOUR_...` con los de tu proyecto:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "tu-proyecto.firebaseapp.com",
  databaseURL:       "https://tu-proyecto-default-rtdb.firebaseio.com",
  projectId:         "tu-proyecto",
  storageBucket:     "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

---

## Paso 2 — Configurar el PIN de acceso

El PIN se almacena como un hash SHA-256 en Firebase, no en texto plano.

### 2.1 Generar el hash de tu PIN

Abrí Google Chrome, presioná **F12** para abrir la consola, y ejecutá esto (reemplazá `"123456"` con tu PIN real de 4–6 dígitos):

```js
const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('123456'));
console.log(Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join(''));
```

Copiá el resultado (64 caracteres hexadecimales).

### 2.2 Guardar el hash en Firebase

1. En Firebase Console → Realtime Database → **Data**.
2. Hacé clic en el ícono `+` al lado de la raíz del árbol.
3. Creá el nodo:
   - **Name:** `config`
   - Dentro de `config`, creá:
     - **Name:** `pin_hash`
     - **Value:** el hash de 64 caracteres que copiaste

La estructura en Firebase debe quedar así:

```
{
  "config": {
    "pin_hash": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"
  }
}
```

---

## Paso 3 — Deploy en GitHub Pages

### 3.1 Subir el proyecto a GitHub

Si todavía no tenés un repositorio:

```bash
git init
git add .
git commit -m "Initial commit — AcadVet USAM"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/acadvet-usam.git
git push -u origin main
```

Si ya tenés el repositorio, simplemente hacé push de los cambios:

```bash
git add .
git commit -m "Configurar Firebase y PIN"
git push
```

### 3.2 Activar GitHub Pages

1. En GitHub, abrí tu repositorio.
2. Andá a **Settings → Pages**.
3. En **Source**, seleccioná:
   - Branch: `main`
   - Folder: `/ (root)`
4. Hacé clic en **Save**.

GitHub Pages tardará 1–2 minutos en publicar. La URL de tu app será:

```
https://TU_USUARIO.github.io/acadvet-usam/
```

> La pantalla de login es `index.html` (la raíz). El panel principal vive en `app.html`. Ambos son archivos estáticos — no se necesita ningún servidor.

---

## Checklist de verificación antes de usar

Después del deploy, verificá los siguientes flujos en Chrome:

**Login**
- [ ] Ingresar PIN correcto → redirige a `app.html`
- [ ] Ingresar PIN incorrecto → muestra mensaje de error
- [ ] Refrescar `app.html` sin sesión → redirige a `index.html`

**Materias**
- [ ] Crear nueva materia (nombre, ciclo, sección)
- [ ] Editar materia existente
- [ ] Archivar materia (desaparece del dashboard)

**Alumnos**
- [ ] Agregar alumno (nombre + carné)
- [ ] Editar alumno
- [ ] Eliminar alumno (confirmar modal)
- [ ] Exportar Excel grupal → descarga `.xlsx`

**Expediente individual**
- [ ] Registrar asistencia (Presente / Ausente / Justificado)
- [ ] Agregar quiz en Área 1, 2 y 3
- [ ] Ingresar nota de cada parcial
- [ ] Agregar exposición
- [ ] Escribir observaciones → se guardan automáticamente
- [ ] Ver resumen con nota final y badge de estado
- [ ] Exportar PDF → descarga `.pdf`
- [ ] Exportar Word → descarga `.docx`
- [ ] Exportar Excel → descarga `.xlsx`

**Mobile (≤768px)**
- [ ] Botón de menú abre el sidebar
- [ ] Tocar fuera del sidebar lo cierra
- [ ] Formularios y tablas son usables en pantalla pequeña

---

## Estructura del proyecto

```
acadvet-usam/
├── index.html              # Pantalla de login con PIN
├── app.html                # Shell del panel principal
├── css/
│   ├── main.css            # Variables de diseño, reset, base
│   ├── components.css      # Cards, botones, modales, tablas
│   └── views.css           # Estilos de la pantalla de login
├── js/
│   ├── firebase-config.js  # ← Aquí van tus credenciales Firebase
│   ├── auth.js             # Lógica de PIN (SHA-256 + sessionStorage)
│   ├── db.js               # Capa de acceso a Firebase RTDB
│   ├── router.js           # Hash router (navegación sin recarga)
│   ├── ui.js               # Modales y toasts compartidos
│   ├── app.js              # Entry point del panel + rutas
│   └── views/
│       ├── dashboard.js    # Vista: materias activas
│       ├── materias.js     # Vista: CRUD de materias
│       ├── alumnos.js      # Vista: lista de alumnos + exportación grupal
│       └── expediente.js   # Vista: expediente + exportaciones individuales
└── assets/
    └── icons/
```

---

## Actualizar la app en producción

Cada vez que modifiques archivos, los cambios se publican con:

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

GitHub Pages se actualiza automáticamente en 1–2 minutos.

---

## Restablecer el PIN

1. Generá el nuevo hash en la consola del navegador (ver Paso 2.1).
2. En Firebase Console → Realtime Database → Data → `config/pin_hash`.
3. Hacé clic en el valor actual y reemplazalo con el nuevo hash.
4. Los cambios aplican inmediatamente — no se necesita redesplegar.

---

*AcadVet USAM · Facultad de Medicina Veterinaria · Universidad de El Salvador en América (USAM)*
