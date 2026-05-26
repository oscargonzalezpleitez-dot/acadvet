// =============================================================================
// AcadVet USAM — Autenticación por PIN
// Compara SHA-256 del PIN ingresado contra /config/pin_hash en Firebase
// Sesión guardada en sessionStorage (se borra al cerrar la pestaña)
// =============================================================================

import { getDatabase, ref, get } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const rtdb = getDatabase(app);

// Si ya hay sesión activa, ir directo al dashboard
if (sessionStorage.getItem('acadvet_auth') === 'true') {
  window.location.replace('app.html');
}

// --- Referencias DOM ---
const pinDotsContainer = document.getElementById('pinDots');
const pinInput         = document.getElementById('pinInput');
const pinDots          = pinDotsContainer.querySelectorAll('.pin-dot');
const btnLogin         = document.getElementById('btnLogin');
const pinError         = document.getElementById('pinError');

// --- Foco inicial ---
// Dar foco al input oculto para capturar teclado desde el inicio
pinInput.focus();

// Hacer clic en los dots también da foco al input
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

  // Habilitar botón cuando hay al menos 4 dígitos
  btnLogin.disabled = (len < 4);
  clearError();
});

// Enter también dispara el login
pinInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !btnLogin.disabled) attemptLogin();
});

btnLogin.addEventListener('click', attemptLogin);

// --- Protección contra fuerza bruta ---
const MAX_ATTEMPTS  = 5;
const BASE_LOCK_MS  = 30_000; // 30 s para el primer bloqueo; se duplica por bloque de 5

function getLock() {
  try { return JSON.parse(localStorage.getItem('acadvet_pin_lock') ?? 'null') ?? { attempts: 0, lockedUntil: 0 }; }
  catch { return { attempts: 0, lockedUntil: 0 }; }
}
function saveLock(s) { localStorage.setItem('acadvet_pin_lock', JSON.stringify(s)); }
function clearLock() { localStorage.removeItem('acadvet_pin_lock'); }

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

// Verificar bloqueo al cargar la página
checkLockout();

// --- Lógica de login ---
async function attemptLogin() {
  const pin = pinInput.value.trim();
  if (pin.length < 4) return;
  if (checkLockout()) return;

  setLoading(true);

  try {
    const enteredHash = await sha256(pin);
    const snapshot    = await get(ref(rtdb, 'config/pin_hash'));

    if (!snapshot.exists()) {
      showError('No hay PIN configurado. Revisá firebase-config.js y la consola.');
      return;
    }

    if (snapshot.val() === enteredHash) {
      clearLock();
      sessionStorage.setItem('acadvet_auth', 'true');
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
    if (err.message?.includes('YOUR_API_KEY') || err.message?.includes('invalid')) {
      showError('Firebase no está configurado. Revisá firebase-config.js.');
    } else {
      showError('Error de conexión. Verificá tu internet.');
    }
    console.error('[AcadVet] Error de auth:', err);
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
  // Re-trigger animation al volver a mostrar
  pinError.classList.remove('visible');
  // eslint-disable-next-line no-unused-expressions
  pinError.offsetWidth; // reflow trick para reiniciar la animación
  pinError.classList.add('visible');
}

function clearError() {
  pinError.textContent = '';
  pinError.classList.remove('visible');
}

// --- SHA-256 via Web Crypto API (nativo en todos los browsers modernos) ---
async function sha256(message) {
  const data   = new TextEncoder().encode(message);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
