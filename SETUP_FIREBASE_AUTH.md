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

- El PIN sigue siendo el secreto principal. El hash SHA-256 se usa también como password de Firebase.
- Si cambiás el PIN en Firebase (campo `config/pin_hash`), debés también actualizar la contraseña de la cuenta en Firebase Auth.
- Las reglas de la base de datos ahora requieren autenticación para todas las operaciones.
  Si un usuario anónimo (alumno en cuestionario/inscripción) intenta acceder a datos de alumnos o notas, Firebase lo deniega.
