# Configuración de Firebase Authentication — AcadVet USAM

Estos pasos son necesarios para activar la capa de seguridad completa.
Sin este setup, la app funciona pero las reglas de la base de datos quedan en "modo abierto".

---

## Paso 1: Habilitar métodos de autenticación en Firebase Console

1. Ir a [Firebase Console](https://console.firebase.google.com/) → proyecto **acadvet-usam**
2. Menú izquierdo → **Authentication** → pestaña **Sign-in method**
3. Habilitar **Correo electrónico/contraseña** (Email/Password)
4. Habilitar **Anónimo** (Anonymous)
5. Guardar

---

## Paso 2: Obtener el hash SHA-256 de tu PIN

El password de Firebase Auth para el docente es el SHA-256 del PIN.
Para calcularlo, abrí la consola del navegador (F12) en cualquier página y ejecutá:

```javascript
async function sha256(pin) {
  const data   = new TextEncoder().encode(pin);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}
console.log(await sha256('TU_PIN_AQUI'));
```

Copiá el resultado (una cadena de 64 caracteres hexadecimales).

---

## Paso 3: Crear las cuentas en Firebase Console

En Firebase Console → Authentication → pestaña **Users** → **Add user**:

| Email                          | Contraseña                        |
|-------------------------------|-----------------------------------|
| `docente@acadvet-usam.edu.sv` | `sha256(PIN_del_docente)`         |
| `eps@acadvet-usam.edu.sv`     | `sha256(PIN_del_EPS)` (opcional)  |

---

## Paso 4: Desplegar las nuevas reglas de Firebase

```bash
firebase deploy --only database,storage
```

O desde Firebase Console, pegá el contenido de `database.rules.json` en:
**Realtime Database → Rules**

Y el contenido de `storage.rules` en:
**Storage → Rules**

---

## Paso 5: Verificar

1. Abrí la app e intentá iniciar sesión con el PIN correcto
2. En Firebase Console → Authentication → Users, debería aparecer el docente como "último inicio de sesión: [ahora]"
3. Abrí el cuestionario de prueba en modo incógnito y verificá que el Network Tab no muestre el campo `correcta` en la respuesta de Firebase

---

## Notas de seguridad

- El PIN es el secreto principal. El SHA-256 del PIN es la contraseña de la cuenta de Firebase Auth.
- **La verificación del PIN la hace Firebase Auth del lado servidor.** La app ya NO lee ningún
  hash desde la base de datos: el nodo `config` tiene `".read": false`, así que el hash no es
  público ni se puede romper offline. Si intentás iniciar sesión con un PIN incorrecto, Firebase
  devuelve `auth/invalid-credential` y se aplica el bloqueo por intentos.
- El nodo `config/pin_hash` ya no se usa para login; podés dejarlo (queda privado) o eliminarlo.
- Si cambiás el PIN, actualizá **únicamente** la contraseña de la cuenta en Firebase Auth
  (Console → Authentication → Users) al nuevo `sha256(PIN)`.
- Recomendación: usá un PIN de 6 o más dígitos. El mínimo que exige la app es 4, pero un PIN más
  largo dificulta cualquier intento de fuerza bruta en línea (que además Firebase limita).
- Las reglas de la base de datos requieren autenticación para todas las operaciones. Los alumnos
  (auth anónima) sólo pueden **agregar** su asistencia en una sesión QR, nunca modificar la sesión
  ni borrar asistencias ajenas.

> ⚠️ **Importante:** estos cambios de seguridad sólo surten efecto una vez que despliegues las
> reglas nuevas (`firebase deploy --only database,storage`, ver Paso 4). Hasta entonces, la base
> sigue con las reglas viejas.
