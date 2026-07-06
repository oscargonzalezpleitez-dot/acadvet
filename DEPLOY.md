# Despliegue de AcadVet USAM

Guía para publicar cambios. Hay **dos cosas separadas** que se despliegan por caminos distintos:

| Qué | Cómo se publica | Cuándo |
|-----|-----------------|--------|
| **Código** (HTML/JS/CSS) | Automático vía GitHub Pages al hacer `git push` a `main` | Cada push |
| **Reglas de seguridad** (`database.rules.json`, `storage.rules`) | **Manual**, con Firebase CLI o Console | Solo cuando cambian las reglas |

> ⚠️ Un `git push` **NO** actualiza las reglas de Firebase. Si cambiaste las reglas y no las
> desplegás, la base sigue con las reglas viejas aunque el código nuevo ya esté publicado.

---

## Requisitos (una sola vez)

- Firebase CLI instalado (`firebase --version`). Si no, instalá con `npm install -g firebase-tools`.
- Proyecto vinculado: ya está (`.firebaserc` → `acadvet-usam`).
- Estar logueado: `firebase login:list`. Si no hay cuenta, `firebase login`.

---

## Desplegar las reglas de seguridad

### Opción A — Firebase CLI (recomendada)

```bash
# 1. (Opcional) Validar sin publicar
firebase deploy --only database,storage --dry-run

# 2. Publicar las reglas (NO toca el hosting/GitHub Pages)
firebase deploy --only database,storage
```

Debe terminar con `✔ Deploy complete!`. El deploy es atómico: si algo falla, no se aplica nada.

### Opción B — Firebase Console (manual)

1. [Firebase Console](https://console.firebase.google.com/) → proyecto **acadvet-usam**.
2. **Realtime Database → Rules** → pegá el contenido de `database.rules.json` → **Publicar**.
3. **Storage → Rules** → pegá el contenido de `storage.rules` → **Publicar**.

---

## Verificar que la seguridad quedó activa

En una ventana de **incógnito** (sin sesión iniciada), abrí:

```
https://acadvet-usam-default-rtdb.firebaseio.com/config/pin_hash.json
```

- ✅ **Correcto:** responde `Permission denied` o `null`.
- ❌ **Mal:** si muestra un hash de 64 caracteres, las reglas viejas siguen activas → repetí el deploy.

---

## Notas importantes

- **El login no cambia:** entrás con el mismo PIN. La contraseña de Firebase Auth es el `sha256`
  del PIN; solo dejó de ser pública. No hace falta tocar las cuentas de Firebase Auth.
- **Si cambiás el PIN:** actualizá únicamente la contraseña de la cuenta en
  Firebase Console → Authentication → Users, con el nuevo `sha256(PIN)`. (Ver `SETUP_FIREBASE_AUTH.md`.)
- **Prueba de humo tras desplegar:** iniciá sesión con tu PIN, abrí un cuestionario como alumno y
  registrá una asistencia por QR, para confirmar que los flujos siguen funcionando con las reglas
  endurecidas.

---

## Resumen de comandos rápidos

```bash
firebase login:list                          # ¿estoy logueado?
firebase deploy --only database,storage      # publicar reglas
git push origin main                         # publicar código (GitHub Pages)
```
