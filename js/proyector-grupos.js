// =============================================================================
// AcadVet USAM — Vista Proyector: Grupos de trabajo
// Pantalla de solo lectura optimizada para proyectar en el aula.
// Se actualiza en tiempo real desde Firebase.
// =============================================================================

import { getDatabase, ref, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { app } from './firebase-config.js';

const db = getDatabase(app);

const params  = new URLSearchParams(window.location.search);
const sorteoId = params.get('s') ?? '';

let _cycleInterval = null;
let _lastEstado     = null;

if (!sorteoId) {
  showError('URL inválida. Abrí el proyector desde el panel de Grupos de trabajo.');
} else {
  connect();
}

function connect() {
  onValue(ref(db, `grupos_sorteos/${sorteoId}`), snap => {
    if (!snap.exists()) return showError('El sorteo no existe.');
    const data = snap.val();

    updateHeader(data);
    showMain();

    if (data.estado === 'sorteando') {
      if (_lastEstado !== 'sorteando') renderSorteando(data);
    } else {
      renderResultado(data);
    }
    _lastEstado = data.estado;
  });
}

// ---------------------------------------------------------------------------
// UI: header / estado de conexión
// ---------------------------------------------------------------------------
function updateHeader(data) {
  const mat   = document.getElementById('proyMateria');
  const fecha = document.getElementById('proyFecha');
  if (mat)   mat.textContent   = [data.materiaNombre, data.ciclo].filter(Boolean).join(' · ');
  if (fecha) fecha.textContent = data.fecha ?? '';

  const dot = document.getElementById('proyDot');
  const txt = document.getElementById('proyStatusTxt');
  if (dot) dot.style.background = '#00B894';
  if (txt) txt.textContent = data.estado === 'sorteando' ? 'Formando grupos…' : 'Grupos listos';
}

function showMain() {
  document.getElementById('mainLoading').style.display = 'none';
  document.getElementById('mainError').style.display   = 'none';
  document.getElementById('mainContent').style.display = 'flex';
}

function showError(msg) {
  document.getElementById('mainLoading').style.display = 'none';
  document.getElementById('mainContent').style.display  = 'none';
  document.getElementById('errTxt').textContent = msg;
  document.getElementById('mainError').style.display    = 'flex';
  const dot = document.getElementById('proyDot');
  const txt = document.getElementById('proyStatusTxt');
  if (dot) dot.style.background = '#FF6B6B';
  if (txt) txt.textContent = 'Sorteo no disponible';
}

// ---------------------------------------------------------------------------
// Fase: sorteando (animación de suspenso)
// ---------------------------------------------------------------------------
function renderSorteando(data) {
  clearInterval(_cycleInterval);
  const nombres = Object.values(data.alumnos ?? {});
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="proy-center">
      <div class="gp-dice">🎲</div>
      <div class="gp-sorteando-title">Formando grupos…</div>
      <div class="gp-sorteando-name" id="gpName"></div>
    </div>`;

  const nameEl = document.getElementById('gpName');
  _cycleInterval = setInterval(() => {
    if (!nameEl || !nombres.length) return;
    nameEl.textContent = nombres[Math.floor(Math.random() * nombres.length)];
  }, 130);
}

// ---------------------------------------------------------------------------
// Fase: resultado
// ---------------------------------------------------------------------------
function renderResultado(data) {
  clearInterval(_cycleInterval);
  const grupos = data.grupos ?? [];
  const nombresPorId = data.alumnos ?? {};

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="gp-results">
      ${grupos.map((miembros, i) => `
        <div class="gp-card" style="animation-delay:${i * 70}ms">
          <div class="gp-card__title">Grupo ${i + 1} · ${miembros.length} alumno${miembros.length !== 1 ? 's' : ''}</div>
          ${miembros.map(id => `<div class="gp-card__member">${esc(nombresPorId[id] ?? '—')}</div>`).join('')}
        </div>
      `).join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
