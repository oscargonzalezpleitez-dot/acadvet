// =============================================================================
// AcadVet USAM — Mi Perfil (portal del alumno, solo lectura)
// El alumno crea una cuenta con correo + contraseña (Firebase Auth) para ver
// su propio expediente. Nunca puede escribir notas, asistencias ni parciales
// — las reglas de Firebase (database.rules.json) solo conceden lectura de su
// propio registro, nunca escritura. Las observaciones del docente NO son
// visibles acá (viven en un nodo aparte, solo lectura del docente).
// =============================================================================

import { getDatabase, ref, get, set }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { app, auth } from './firebase-config.js';
import { activarPushParaAlumno, canUsePush, isIOS, isStandalone } from './push.js';

const db = getDatabase(app);
const CACHE_KEY = 'acadvet_mi_perfil';

// --- Referencias DOM ---
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText    = document.getElementById('loadingText');
const authCard       = document.getElementById('authCard');
const profileView    = document.getElementById('profileView');
const tabLogin        = document.getElementById('tabLogin');
const tabSignup       = document.getElementById('tabSignup');
const formLogin        = document.getElementById('formLogin');
const formSignup        = document.getElementById('formSignup');
const authError       = document.getElementById('authError');
const btnLogout       = document.getElementById('btnLogout');
const signupConfirm   = document.getElementById('signupConfirm');
const confirmNombre   = document.getElementById('confirmNombre');
const btnConfirmYes   = document.getElementById('btnConfirmYes');
const btnConfirmNo    = document.getElementById('btnConfirmNo');
const btnActivarPush  = document.getElementById('btnActivarPush');
const pushStatusText  = document.getElementById('pushStatusText');

let _booting = true;
let _pendingSignup   = null; // { alumnoId, carnet, email, pass }
let _currentAlumnoId = null;

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
tabLogin.addEventListener('click', () => switchTab('login'));
tabSignup.addEventListener('click', () => switchTab('signup'));

function switchTab(which) {
  const isLogin = which === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabSignup.classList.toggle('active', !isLogin);
  formLogin.classList.toggle('hidden', !isLogin);
  formSignup.classList.toggle('hidden', isLogin);
  signupConfirm.classList.add('hidden');
  _pendingSignup = null;
  clearError();
}

function showError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}
function clearError() {
  authError.textContent = '';
  authError.classList.add('hidden');
}

function setLoading(msg) {
  if (!msg) { loadingOverlay.classList.add('hidden'); return; }
  loadingText.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}

function sanitizeKey(s) {
  return String(s ?? '').toLowerCase().trim().replace(/[.#$\[\]\/\s]/g, '_');
}

function saveCache(alumnoId, carnet) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ alumnoId, carnet })); } catch (_) {}
}
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); } catch (_) { return null; }
}
function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Crear cuenta
// ---------------------------------------------------------------------------
formSignup.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const carnet   = document.getElementById('suCarnet').value.trim();
  const email    = document.getElementById('suEmail').value.trim();
  const pass     = document.getElementById('suPass').value;
  const passConf = document.getElementById('suPassConfirm').value;

  if (!carnet || !email || !pass) return showError('Completá todos los campos.');
  if (pass.length < 6)            return showError('La contraseña debe tener al menos 6 caracteres.');
  if (pass !== passConf)          return showError('Las contraseñas no coinciden.');

  setLoading('Buscando tu carné…');
  try {
    const lookupSnap = await get(ref(db, `alumno_lookup/${sanitizeKey(carnet)}`));
    if (!lookupSnap.exists()) {
      throw new Error('CARNET_NO_ENCONTRADO');
    }
    const { alumnoId, nombre } = lookupSnap.val();

    _pendingSignup = { alumnoId, carnet, email, pass };
    confirmNombre.textContent = nombre;
    formSignup.classList.add('hidden');
    signupConfirm.classList.remove('hidden');
  } catch (err) {
    handleAuthError(err);
  } finally {
    setLoading(null);
  }
});

btnConfirmNo.addEventListener('click', () => {
  _pendingSignup = null;
  signupConfirm.classList.add('hidden');
  formSignup.classList.remove('hidden');
});

btnConfirmYes.addEventListener('click', async () => {
  if (!_pendingSignup) return;
  const { alumnoId, carnet, email, pass } = _pendingSignup;

  setLoading('Creando tu cuenta…');
  try {
    await createUserWithEmailAndPassword(auth, email, pass);

    // Vincula el correo al expediente solo si el docente no puso uno todavía
    // (write-once: si ya hay un correo distinto, esta escritura es rechazada).
    try {
      await set(ref(db, `alumnos/${alumnoId}/email`), email);
    } catch (_) { /* el docente ya tiene un correo distinto registrado; seguimos */ }

    _pendingSignup = null;
    signupConfirm.classList.add('hidden');
    saveCache(alumnoId, carnet);
    await loadProfile(alumnoId);
  } catch (err) {
    signupConfirm.classList.add('hidden');
    formSignup.classList.remove('hidden');
    handleAuthError(err);
  } finally {
    setLoading(null);
  }
});

// ---------------------------------------------------------------------------
// Iniciar sesión
// ---------------------------------------------------------------------------
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const carnet = document.getElementById('liCarnet').value.trim();
  const email  = document.getElementById('liEmail').value.trim();
  const pass   = document.getElementById('liPass').value;

  if (!carnet || !email || !pass) return showError('Completá todos los campos.');

  setLoading('Verificando…');
  try {
    const lookupSnap = await get(ref(db, `alumno_lookup/${sanitizeKey(carnet)}`));
    if (!lookupSnap.exists()) throw new Error('CARNET_NO_ENCONTRADO');
    const { alumnoId } = lookupSnap.val();

    await signInWithEmailAndPassword(auth, email, pass);
    saveCache(alumnoId, carnet);
    await loadProfile(alumnoId);
  } catch (err) {
    handleAuthError(err);
  } finally {
    setLoading(null);
  }
});

function handleAuthError(err) {
  const code = err?.code ?? err?.message;
  if (code === 'CARNET_NO_ENCONTRADO') {
    showError('No encontramos ese carné. Verificá con tu docente que ya te haya inscrito.');
  } else if (code === 'auth/email-already-in-use') {
    showError('Ese correo ya tiene una cuenta. Probá "Iniciar sesión".');
  } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    showError('Correo o contraseña incorrectos.');
  } else if (code === 'auth/invalid-email') {
    showError('Ese correo no es válido.');
  } else if (code === 'auth/weak-password') {
    showError('La contraseña es muy débil (mínimo 6 caracteres).');
  } else {
    console.error('[MiPerfil]', err);
    showError('Algo falló. Verificá tu conexión e intentá de nuevo.');
  }
}

// ---------------------------------------------------------------------------
// Cerrar sesión
// ---------------------------------------------------------------------------
btnLogout.addEventListener('click', async () => {
  clearCache();
  _currentAlumnoId = null;
  await signOut(auth);
  profileView.classList.add('hidden');
  authCard.classList.remove('hidden');
  formLogin.reset();
  formSignup.reset();
  switchTab('login');
});

// ---------------------------------------------------------------------------
// Activar notificaciones push
// ---------------------------------------------------------------------------
btnActivarPush?.addEventListener('click', async () => {
  if (!_currentAlumnoId) return;

  if (isIOS() && !isStandalone()) {
    pushStatusText.textContent =
      '📲 Para recibir notificaciones en iPhone: agregá esta página a tu pantalla de inicio (botón Compartir → "Agregar a inicio") y abrila desde ahí.';
    return;
  }

  if (!(await canUsePush())) {
    pushStatusText.textContent = '⚠️ Tu navegador no soporta notificaciones push.';
    return;
  }

  btnActivarPush.disabled = true;
  btnActivarPush.textContent = 'Activando…';
  try {
    await activarPushParaAlumno(_currentAlumnoId);
    setPushActivated();
  } catch (err) {
    btnActivarPush.disabled = false;
    btnActivarPush.textContent = 'Activar notificaciones';
    if (err.message === 'PERMISO_DENEGADO') {
      pushStatusText.textContent = '⚠️ Bloqueaste el permiso de notificaciones. Habilitalo en la configuración de tu navegador para este sitio.';
    } else {
      console.error('[MiPerfil] push', err);
      pushStatusText.textContent = '⚠️ No se pudo activar. Intentá de nuevo.';
    }
  }
});

function setPushActivated() {
  btnActivarPush.disabled = true;
  btnActivarPush.textContent = '✓ Activadas';
  pushStatusText.textContent = '🔔 Vas a recibir avisos de tareas, notas y recordatorios acá.';
}

function updatePushButtonState() {
  if (!btnActivarPush) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    setPushActivated();
  }
}

// ---------------------------------------------------------------------------
// Carga y pinta el perfil (solo lectura)
// ---------------------------------------------------------------------------
async function loadProfile(alumnoId) {
  setLoading('Cargando tu expediente…');
  _currentAlumnoId = alumnoId;
  try {
    const [nombreSnap, carnetSnap, lookupSnap] = await Promise.all([
      get(ref(db, `alumnos/${alumnoId}/nombre`)),
      get(ref(db, `alumnos/${alumnoId}/carnet`)),
      get(ref(db, `alumno_lookup/${sanitizeKey(readCache()?.carnet ?? '')}`)),
    ]);

    if (!nombreSnap.exists()) throw new Error('SIN_ACCESO');

    const materiaIds = Object.keys(lookupSnap.exists() ? (lookupSnap.val().materiaIds ?? {}) : {});

    const materias = await Promise.all(materiaIds.map(async (materiaId) => {
      const [materiaSnap, asistSnap, quizSnap, parcSnap, expoSnap] = await Promise.all([
        get(ref(db, `materias/${materiaId}`)),
        get(ref(db, `alumnos/${alumnoId}/inscripciones/${materiaId}/asistencias`)),
        get(ref(db, `alumnos/${alumnoId}/inscripciones/${materiaId}/quizzes`)),
        get(ref(db, `alumnos/${alumnoId}/inscripciones/${materiaId}/parciales`)),
        get(ref(db, `alumnos/${alumnoId}/inscripciones/${materiaId}/exposiciones`)),
      ]);

      return {
        materiaId,
        materia:  materiaSnap.exists() ? materiaSnap.val() : { nombre: 'Materia', ciclo: '' },
        asists:   snapToArray(asistSnap),
        quizzes:  snapToArray(quizSnap),
        parc:     parcSnap.exists() ? parcSnap.val() : {},
        expos:    snapToArray(expoSnap),
      };
    }));

    renderProfile({ nombre: nombreSnap.val(), carnet: carnetSnap.val() }, materias);

    authCard.classList.add('hidden');
    profileView.classList.remove('hidden');
    updatePushButtonState();
  } catch (err) {
    console.error('[MiPerfil] loadProfile', err);
    clearCache();
    _currentAlumnoId = null;
    profileView.classList.add('hidden');
    authCard.classList.remove('hidden');
    switchTab('login');
    showError('No pudimos cargar tu expediente. Iniciá sesión de nuevo.');
  } finally {
    setLoading(null);
  }
}

function snapToArray(s) {
  if (!s.exists()) return [];
  return Object.entries(s.val()).map(([id, data]) => ({ id, ...data }));
}

// ---------------------------------------------------------------------------
// Cálculos (misma fórmula que el expediente del docente)
// ---------------------------------------------------------------------------
function calcAsistPct(asists) {
  const total = asists.length;
  if (!total) return null;
  const ok = asists.filter(a => a.estado === 'presente' || a.estado === 'justificado').length;
  return Math.round((ok / total) * 100);
}

function calcStats(m) {
  const numNotas = arr => arr.map(x => x.nota).filter(n => typeof n === 'number');
  const q1 = numNotas(m.quizzes.filter(q => Number(q.area) === 1));
  const q2 = numNotas(m.quizzes.filter(q => Number(q.area) === 2));
  const q3 = [...numNotas(m.quizzes.filter(q => Number(q.area) === 3)), ...numNotas(m.expos)];

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const promQ1 = avg(q1), promQ2 = avg(q2), promQ3 = avg(q3);

  const p1 = typeof m.parc.parcial_1 === 'number' ? m.parc.parcial_1 / 10 : null;
  const p2 = typeof m.parc.parcial_2 === 'number' ? m.parc.parcial_2 / 10 : null;
  const p3 = typeof m.parc.parcial_3 === 'number' ? m.parc.parcial_3 / 10 : null;

  const allPresent = [promQ1, p1, promQ2, p2, promQ3, p3].every(v => v !== null);
  const notaFinal = allPresent
    ? promQ1 * 0.15 + p1 * 0.15 + promQ2 * 0.15 + p2 * 0.15 + promQ3 * 0.20 + p3 * 0.20
    : null;

  let estado = 'sin-datos', estadoLabel = 'Sin datos suficientes';
  if (notaFinal !== null) {
    if (notaFinal >= 6.0)      { estado = 'aprobado';  estadoLabel = 'Aprobado';  }
    else if (notaFinal >= 5.0) { estado = 'riesgo';    estadoLabel = 'En riesgo'; }
    else                        { estado = 'reprobado'; estadoLabel = 'Reprobado'; }
  }

  return {
    asistPct: calcAsistPct(m.asists),
    notaFinal: notaFinal !== null ? notaFinal.toFixed(2) : null,
    estado, estadoLabel,
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderProfile(alumno, materias) {
  document.getElementById('profNombre').textContent = alumno.nombre;
  document.getElementById('profCarnet').textContent  = `Carné: ${alumno.carnet}`;

  const cont = document.getElementById('materiasCont');
  if (!materias.length) {
    cont.innerHTML = `<div class="empty">Todavía no estás inscrito en ninguna materia. Consultá con tu docente.</div>`;
    return;
  }

  cont.innerHTML = materias.map(m => {
    const s = calcStats(m);
    return `
      <div class="mat-card">
        <div class="mat-head">
          <div>
            <div class="mat-name">${escHtml(m.materia.nombre)}</div>
            <div class="mat-ciclo">${escHtml(m.materia.ciclo ?? '')}</div>
          </div>
          <span class="estado-badge estado-badge--${s.estado}">${s.estadoLabel}</span>
        </div>
        <div class="mat-stats">
          <div class="mat-stat">
            <span class="mat-stat-num">${s.asistPct !== null ? s.asistPct + '%' : '—'}</span>
            <span class="mat-stat-label">Asistencia</span>
          </div>
          <div class="mat-stat">
            <span class="mat-stat-num">${fmtParcial(m.parc.parcial_1)}</span>
            <span class="mat-stat-label">Parcial I</span>
          </div>
          <div class="mat-stat">
            <span class="mat-stat-num">${fmtParcial(m.parc.parcial_2)}</span>
            <span class="mat-stat-label">Parcial II</span>
          </div>
          <div class="mat-stat">
            <span class="mat-stat-num">${fmtParcial(m.parc.parcial_3)}</span>
            <span class="mat-stat-label">Parcial III</span>
          </div>
          <div class="mat-stat mat-stat--wide">
            <span class="mat-stat-num">${s.notaFinal ?? '—'}</span>
            <span class="mat-stat-label">Nota final (/10)</span>
          </div>
        </div>
        ${m.quizzes.length ? `
          <div class="mat-detail-title">Exámenes cortos</div>
          <div class="mat-list">
            ${m.quizzes.map(q => `<div class="mat-list-row"><span>${escHtml(q.nombre)}</span><strong>${fmtNota(q.nota)}</strong></div>`).join('')}
          </div>` : ''}
        ${m.expos.length ? `
          <div class="mat-detail-title">Exposiciones</div>
          <div class="mat-list">
            ${m.expos.map(x => `<div class="mat-list-row"><span>${escHtml(x.tema)}</span><strong>${fmtNota(x.nota)}</strong></div>`).join('')}
          </div>` : ''}
      </div>
    `;
  }).join('');
}

function fmtParcial(n) { return typeof n === 'number' ? n.toFixed(1) : '—'; }
function fmtNota(n)    { return typeof n === 'number' ? n.toFixed(1) : '—'; }

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------------------------------------------------------------------------
// Arranque: si ya hay sesión + carné en caché, entrar directo al perfil
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!_booting) return; // evita re-disparar en cada cambio posterior (logout ya se maneja aparte)
  _booting = false;

  const cache = readCache();
  if (user && user.email && cache?.alumnoId) {
    await loadProfile(cache.alumnoId);
  } else {
    setLoading(null);
    authCard.classList.remove('hidden');
  }
});
