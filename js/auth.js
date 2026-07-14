// =============================================================================
// AcadVet USAM — Autenticación por PIN
// Roles: 'admin' (docente) y 'eps' (visitante EPS)
// La contraseña de Firebase Auth = SHA-256 del PIN. La verificación la hace
// Firebase Auth del lado servidor; NO se lee ningún hash público de la base.
// Sesión guardada en sessionStorage (se borra al cerrar la pestaña)
// =============================================================================

import { signInWithEmailAndPassword }   from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth } from './firebase-config.js';

// Emails de Firebase Auth — deben coincidir con las cuentas creadas en Firebase Console.
// Contraseña de cada cuenta = SHA-256 del PIN correspondiente.
// Ver SETUP_FIREBASE_AUTH.md para instrucciones de configuración inicial.
const FB_EMAIL_DOCENTE = 'docente@acadvet-usam.edu.sv';
const FB_EMAIL_EPS     = 'eps@acadvet-usam.edu.sv';

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
// Sanitizamos a solo dígitos: en el celular el corrector/texto predictivo o el
// autocompletado de contraseñas pueden inyectar letras, espacios o una credencial
// guardada. Como el PIN es numérico y corto, cualquier carácter de más cambiaría
// el hash y Firebase respondería 'invalid-credential' ("PIN incorrecto").
pinInput.addEventListener('input', () => {
  const clean = pinInput.value.replace(/\D/g, '').slice(0, 6);
  if (clean !== pinInput.value) pinInput.value = clean;
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

// --- Protección contra fuerza bruta (lockout local, sólo UX) ---
// El control real del lado servidor lo da Firebase Auth (auth/too-many-requests).
// Este lock local sólo mejora el mensaje al usuario; ya no se replica en Firebase.
const MAX_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;

function getLock() {
  try { return JSON.parse(localStorage.getItem('acadvet_pin_lock') ?? 'null') ?? { attempts: 0, lockedUntil: 0 }; }
  catch { return { attempts: 0, lockedUntil: 0 }; }
}
function saveLock(s) {
  localStorage.setItem('acadvet_pin_lock', JSON.stringify(s));
}
function clearLock() {
  localStorage.removeItem('acadvet_pin_lock');
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
  const pin = pinInput.value.replace(/\D/g, '').slice(0, 6);
  if (pin.length < 4) return;
  if (checkLockout()) return;

  setLoading(true);

  try {
    // La contraseña de Firebase Auth = SHA-256 del PIN. Firebase Auth verifica
    // la credencial del lado servidor; si el PIN es incorrecto lanza
    // auth/invalid-credential. Ya no se lee ningún hash público de la base.
    const enteredHash = await sha256(pin);
    const fbEmail     = _role === 'eps' ? FB_EMAIL_EPS : FB_EMAIL_DOCENTE;

    await signInWithEmailAndPassword(auth, fbEmail, enteredHash);

    clearLock();
    sessionStorage.setItem('acadvet_auth', _role === 'eps' ? 'eps' : 'admin');
    window.location.replace('app.html');
  } catch (err) {
    console.error('[AcadVet] Error de auth:', err.code ?? err.message ?? err);

    if (err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found') {
      // PIN incorrecto (o cuenta EPS no configurada) → contar intento fallido
      registerFailedAttempt();
    } else if (err.code === 'auth/too-many-requests') {
      showError('Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo.');
    } else if (err.message?.includes('YOUR_API_KEY') || err.message?.includes('invalid-api-key')) {
      showError('Firebase no está configurado. Revisá firebase-config.js.');
    } else {
      showError('Error de conexión. Verificá tu internet e intentá de nuevo.');
    }
  } finally {
    setLoading(false);
  }
}

// Registra un intento fallido y aplica bloqueo exponencial tras cada MAX_ATTEMPTS.
function registerFailedAttempt() {
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
