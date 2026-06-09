// =============================================================================
// AcadVet USAM — Autenticación por PIN
// Roles: 'admin' (docente) y 'eps' (visitante EPS)
// PIN hash almacenado en Firebase: config/pin_hash y config/eps_pin_hash
// Sesión guardada en sessionStorage (se borra al cerrar la pestaña)
// =============================================================================

import { getDatabase, ref, get, set, remove } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { signInWithEmailAndPassword }   from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { app, auth } from './firebase-config.js';

// Emails de Firebase Auth — deben coincidir con las cuentas creadas en Firebase Console.
// Contraseña de cada cuenta = SHA-256 del PIN correspondiente.
// Ver SETUP.md para instrucciones de configuración inicial.
const FB_EMAIL_DOCENTE = 'docente@acadvet-usam.edu.sv';
const FB_EMAIL_EPS     = 'eps@acadvet-usam.edu.sv';

const rtdb = getDatabase(app);

// Si ya hay sesión activa, ir directo al dashboard
const _existing = sessionStorage.getItem('acadvet_auth');
if (_existing === 'admin' || _existing === 'eps' || _existing === 'true') {
  window.location.replace('app.html');
}

// --- Referencias DOM ---
const pinDotsContainer = document.getElementById('pinDots');
const pinInput         = document.getElementById('pinInput');
const pinDots          = pinDotsContainer.querySelectorAll('.pin-dot');
const btnLogin         = document.getElementById('btnLogin');
const pinError         = document.getElementById('pinError');
const pinLabel         = document.getElementById('pinInstructions');

// --- Rol activo (docente | eps) ---
let _role = 'docente';

// --- Tabs de rol ---
document.querySelectorAll('.login-role-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.login-role-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    _role = tab.dataset.role;
    clearError();
    pinInput.value = '';
    pinDots.forEach(d => d.classList.remove('filled'));
    btnLogin.disabled = true;
    pinLabel.textContent = _role === 'eps'
      ? 'Ingresá tu PIN de acceso EPS'
      : 'Ingresá tu PIN de acceso';
    pinInput.focus();
  });
});

// --- Foco inicial ---
pinInput.focus();

pinDotsContainer.addEventListener('click', () => {
  pinInput.focus();
  pinDotsContainer.classList.add('focused');
});
pinInput.addEventListener('focus',  () => pinDotsContainer.classList.add('focused'));
pinInput.addEventListener('blur',   () => pinDotsContainer.classList.remove('focused'));

// --- Actualizar dots al escribir ---
pinInput.addEventListener('input', () => {
  const len = pinInput.value.length;
  pinDots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < len);
  });
  btnLogin.disabled = (len < 4);
  clearError();
});

pinInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !btnLogin.disabled) attemptLogin();
});

btnLogin.addEventListener('click', attemptLogin);

// --- Protección contra fuerza bruta ---
// El lock vive en localStorage Y en Firebase para resistir localStorage.clear().
const MAX_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;
const LOCK_FB_KEY  = 'login_lockout/acadvet_pin';

function getLock() {
  try { return JSON.parse(localStorage.getItem('acadvet_pin_lock') ?? 'null') ?? { attempts: 0, lockedUntil: 0 }; }
  catch { return { attempts: 0, lockedUntil: 0 }; }
}
function saveLock(s) {
  localStorage.setItem('acadvet_pin_lock', JSON.stringify(s));
  // Respaldo en Firebase resistente a localStorage.clear()
  set(ref(rtdb, LOCK_FB_KEY), { lockedUntil: s.lockedUntil, ts: Date.now() }).catch(() => {});
}
function clearLock() {
  localStorage.removeItem('acadvet_pin_lock');
  remove(ref(rtdb, LOCK_FB_KEY)).catch(() => {});
}

function checkLockout() {
  const lock = getLock();
  const now  = Date.now();
  if (lock.lockedUntil > now) {
    const secs = Math.ceil((lock.lockedUntil - now) / 1000);
    showError(`Demasiados intentos. Esperá ${secs} s e intentá de nuevo.`);
    btnLogin.disabled = true;
    setTimeout(() => { btnLogin.disabled = (pinInput.value.length < 4); clearError(); }, (lock.lockedUntil - now) + 200);
    return true;
  }
  return false;
}

checkLockout();

// --- Lógica de login ---
async function attemptLogin() {
  const pin = pinInput.value.trim();
  if (pin.length < 4) return;
  if (checkLockout()) return;

  setLoading(true);

  try {
    const enteredHash = await sha256(pin);
    const hashKey     = _role === 'eps' ? 'config/eps_pin_hash' : 'config/pin_hash';
    const snapshot    = await get(ref(rtdb, hashKey));

    if (!snapshot.exists()) {
      if (_role === 'eps') {
        showError('El acceso EPS no está configurado. Contactá al docente.');
      } else {
        showError('No hay PIN configurado. Revisá firebase-config.js y la consola.');
      }
      return;
    }

    if (snapshot.val() === enteredHash) {
      clearLock();

      // Iniciar sesión en Firebase Auth — requerido para que las reglas de RTDB
      // reconozcan al usuario. La contraseña = SHA-256 del PIN.
      const fbEmail = _role === 'eps' ? FB_EMAIL_EPS : FB_EMAIL_DOCENTE;
      await signInWithEmailAndPassword(auth, fbEmail, enteredHash);

      sessionStorage.setItem('acadvet_auth', _role === 'eps' ? 'eps' : 'admin');
      window.location.replace('app.html');
    } else {
      const lock     = getLock();
      const attempts = lock.attempts + 1;
      const block    = Math.floor(attempts / MAX_ATTEMPTS);
      const lockedUntil = attempts % MAX_ATTEMPTS === 0
        ? Date.now() + BASE_LOCK_MS * Math.pow(2, block - 1)
        : 0;
      saveLock({ attempts, lockedUntil });

      if (lockedUntil > 0) {
        showError(`PIN incorrecto. Cuenta bloqueada por ${Math.ceil(BASE_LOCK_MS * Math.pow(2, block - 1) / 1000)} s.`);
        btnLogin.disabled = true;
        setTimeout(() => { btnLogin.disabled = (pinInput.value.length < 4); clearError(); }, BASE_LOCK_MS * Math.pow(2, block - 1) + 200);
      } else {
        const restantes = MAX_ATTEMPTS - (attempts % MAX_ATTEMPTS);
        showError(`PIN incorrecto. ${restantes} intento${restantes !== 1 ? 's' : ''} restante${restantes !== 1 ? 's' : ''} antes del bloqueo.`);
      }
      pinInput.value = '';
      pinDots.forEach(d => d.classList.remove('filled'));
      btnLogin.disabled = true;
      pinInput.focus();
    }
  } catch (err) {
    console.error('[AcadVet] Error de auth:', err.code ?? err.message ?? err);
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      // No debería ocurrir si el PIN pasó la verificación — indica desincronización de cuentas
      showError('Error de autenticación interna. Contactá al administrador del sistema.');
    } else if (err.code === 'auth/user-not-found') {
      showError('Las cuentas de acceso no están configuradas. Ejecutá el setup de Firebase Auth.');
    } else if (err.code === 'auth/too-many-requests') {
      showError('Demasiados intentos fallidos en Firebase. Esperá unos minutos e intentá de nuevo.');
    } else if (err.message?.includes('YOUR_API_KEY') || err.message?.includes('invalid-api-key')) {
      showError('Firebase no está configurado. Revisá firebase-config.js.');
    } else {
      showError('Error de conexión. Verificá tu internet e intentá de nuevo.');
    }
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  btnLogin.disabled = loading;
  const txt = btnLogin.querySelector('.btn-text');
  if (txt) txt.textContent = loading ? 'Verificando…' : 'Ingresar';
}

function showError(msg) {
  pinError.textContent = msg;
  pinError.classList.remove('visible');
  pinError.offsetWidth;
  pinError.classList.add('visible');
}

function clearError() {
  pinError.textContent = '';
  pinError.classList.remove('visible');
}

async function sha256(message) {
  const data   = new TextEncoder().encode(message);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
