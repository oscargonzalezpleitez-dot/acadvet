// =============================================================================
// AcadVet USAM — Vista: Dashboard
// Muestra las materias activas del ciclo en curso.
// T02: datos mock. T03: conecta con Firebase.
// =============================================================================

// Colores rotativos para las cards de materias
const CARD_COLORS = [
  {
    gradient: 'linear-gradient(135deg, #6C63FF 0%, #A29BFE 100%)',
    accent: '#6C63FF',
    dim: 'rgba(108,99,255,0.10)',
  },
  {
    gradient: 'linear-gradient(135deg, #00D2D3 0%, #81ECEC 100%)',
    accent: '#00B4B5',
    dim: 'rgba(0,210,211,0.10)',
  },
  {
    gradient: 'linear-gradient(135deg, #FF6B6B 0%, #FFA07A 100%)',
    accent: '#FF6B6B',
    dim: 'rgba(255,107,107,0.10)',
  },
];

/**
 * @param {HTMLElement} container - #mainContent
 * @param {object|null} data      - { materias: [...] } desde Firebase (null en T02)
 */
export function renderDashboard(container, data = null) {
  // Actualizar título del topbar
  const topbarTitle = document.getElementById('topbarTitle');
  if (topbarTitle) topbarTitle.textContent = 'Dashboard';

  // Datos mock para T02 — reemplazados en T03 con Firebase
  const materias = data?.materias ?? getMockMaterias();
  const activas  = materias.filter(m => m.estado === 'activa');
  const totalAlumnos = activas.reduce((s, m) => s + (m.alumnos ?? 0), 0);

  container.innerHTML = `
    <div class="dashboard-view">

      <!-- Encabezado de bienvenida -->
      <div class="view-header">
        <div>
          <h2 class="view-title">${greeting()}, Óscar 👋</h2>
          <p class="view-subtitle">
            Ciclo I 2026 &nbsp;·&nbsp; ${activas.length} materia${activas.length !== 1 ? 's' : ''} activa${activas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <a href="#/materias" class="btn btn--primary">
          + Materia
        </a>
      </div>

      <!-- Fila de estadísticas -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon stat-icon--primary">👥</div>
          <div>
            <div class="stat-number">${totalAlumnos}</div>
            <div class="stat-label">Alumnos totales</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon--accent">📚</div>
          <div>
            <div class="stat-number">${activas.length}</div>
            <div class="stat-label">Materias activas</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-icon--success">🎓</div>
          <div>
            <div class="stat-number">2026</div>
            <div class="stat-label">Año académico</div>
          </div>
        </div>
      </div>

      <!-- Accesos rápidos -->
      <div class="section-header" style="margin-top:var(--space-6)">
        <h3 class="section-title">Módulos</h3>
      </div>
      <div class="materias-grid" style="margin-bottom:var(--space-6)">
        <a href="admin-mobile.html" style="text-decoration:none">
          <div class="materia-card" style="cursor:pointer">
            <div class="materia-card__accent" style="background:linear-gradient(135deg,#00D2D3 0%,#6C63FF 100%)"></div>
            <div class="materia-card__body">
              <div class="materia-card__header">
                <span class="badge badge--primary">Laboratorio</span>
              </div>
              <h3 class="materia-card__name">📋 Reportes de Prácticas</h3>
              <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-top:4px">Revisar fotos, dar feedback y marcar prácticas</p>
            </div>
            <div class="materia-card__footer">
              <span class="btn btn--primary btn--sm" style="background:linear-gradient(135deg,#00D2D3,#6C63FF)">
                Abrir dashboard →
              </span>
            </div>
          </div>
        </a>
        <a href="competencies.html" style="text-decoration:none">
          <div class="materia-card" style="cursor:pointer">
            <div class="materia-card__accent" style="background:linear-gradient(135deg,#6C63FF 0%,#A29BFE 100%)"></div>
            <div class="materia-card__body">
              <div class="materia-card__header">
                <span class="badge badge--primary">Evaluación</span>
              </div>
              <h3 class="materia-card__name">🏆 Competencias</h3>
              <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-top:4px">Registro y validación de técnicas de laboratorio</p>
            </div>
            <div class="materia-card__footer">
              <span class="btn btn--primary btn--sm">Ver →</span>
            </div>
          </div>
        </a>
        <a href="reference-tables.html" style="text-decoration:none">
          <div class="materia-card" style="cursor:pointer">
            <div class="materia-card__accent" style="background:linear-gradient(135deg,#FF6B6B 0%,#FDCB6E 100%)"></div>
            <div class="materia-card__body">
              <div class="materia-card__header">
                <span class="badge badge--primary">Referencia</span>
              </div>
              <h3 class="materia-card__name">📊 Valores Normales</h3>
              <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-top:4px">Hemograma, bioquímica y urianálisis por especie</p>
            </div>
            <div class="materia-card__footer">
              <span class="btn btn--primary btn--sm" style="background:linear-gradient(135deg,#FF6B6B,#FDCB6E)">
                Consultar →
              </span>
            </div>
          </div>
        </a>
        <a href="reminders.html" style="text-decoration:none">
          <div class="materia-card" style="cursor:pointer">
            <div class="materia-card__accent" style="background:linear-gradient(135deg,#FDCB6E 0%,#FF6B6B 100%)"></div>
            <div class="materia-card__body">
              <div class="materia-card__header">
                <span class="badge badge--primary">Avisos</span>
              </div>
              <h3 class="materia-card__name">🔔 Evaluaciones</h3>
              <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-top:4px">Recordatorios y fechas de evaluaciones</p>
            </div>
            <div class="materia-card__footer">
              <span class="btn btn--primary btn--sm" style="background:linear-gradient(135deg,#FDCB6E,#FF6B6B)">Ver →</span>
            </div>
          </div>
        </a>
        <a href="practice-quiz.html" style="text-decoration:none">
          <div class="materia-card" style="cursor:pointer">
            <div class="materia-card__accent" style="background:linear-gradient(135deg,#A29BFE 0%,#6C63FF 100%)"></div>
            <div class="materia-card__body">
              <div class="materia-card__header">
                <span class="badge badge--primary">Autoevaluación</span>
              </div>
              <h3 class="materia-card__name">🧩 Quiz de Práctica</h3>
              <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-top:4px">Bacteriología, micología, lab clínico y hemograma</p>
            </div>
            <div class="materia-card__footer">
              <span class="btn btn--primary btn--sm">Practicar →</span>
            </div>
          </div>
        </a>
        <a href="image-gallery.html" style="text-decoration:none">
          <div class="materia-card" style="cursor:pointer">
            <div class="materia-card__accent" style="background:linear-gradient(135deg,#00D2D3 0%,#00B894 100%)"></div>
            <div class="materia-card__body">
              <div class="materia-card__header">
                <span class="badge badge--primary">Referencia</span>
              </div>
              <h3 class="materia-card__name">🔬 Galería Micro.</h3>
              <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-top:4px">Imágenes de referencia de microscopía</p>
            </div>
            <div class="materia-card__footer">
              <span class="btn btn--primary btn--sm" style="background:linear-gradient(135deg,#00D2D3,#00B894)">Ver →</span>
            </div>
          </div>
        </a>
        <a href="calculator.html" style="text-decoration:none">
          <div class="materia-card" style="cursor:pointer">
            <div class="materia-card__accent" style="background:linear-gradient(135deg,#00B894 0%,#00D2D3 100%)"></div>
            <div class="materia-card__body">
              <div class="materia-card__header">
                <span class="badge badge--primary">Herramienta</span>
              </div>
              <h3 class="materia-card__name">🧪 Calculadora Lab</h3>
              <p style="font-size:0.8rem;color:var(--color-text-secondary);margin-top:4px">Diluciones, pH, CFU, conversiones y molaridad</p>
            </div>
            <div class="materia-card__footer">
              <span class="btn btn--primary btn--sm" style="background:linear-gradient(135deg,#00B894,#00D2D3)">
                Abrir →
              </span>
            </div>
          </div>
        </a>
      </div>

      <!-- Grid de materias -->
      <div class="section-header">
        <h3 class="section-title">Materias activas</h3>
        <a href="#/materias" class="btn btn--ghost btn--sm">Ver todas</a>
      </div>

      <div class="materias-grid">
        ${activas.length === 0
          ? emptyMaterias()
          : activas.map((m, i) => materiaCard(m, i)).join('')
        }
      </div>

    </div>
  `;

  // Wire up botones "Ver alumnos" de cada card
  container.querySelectorAll('[data-nav-materia]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = `#/materia/${btn.dataset.navMateria}`;
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers de renderizado
// ---------------------------------------------------------------------------

function materiaCard(materia, index) {
  const c = CARD_COLORS[index % CARD_COLORS.length];
  const secBadge = materia.seccion
    ? `<span class="badge badge--outline">Sección ${materia.seccion}</span>`
    : '';

  return `
    <div class="materia-card">
      <div class="materia-card__accent" style="background:${c.gradient}"></div>
      <div class="materia-card__body">
        <div class="materia-card__header">
          <div class="materia-card__badges">
            <span class="badge badge--primary">${materia.ciclo}</span>
            ${secBadge}
          </div>
        </div>
        <h3 class="materia-card__name">${materia.nombre}</h3>
        <div class="materia-card__stats">
          <div class="materia-stat">
            <span class="materia-stat__num">${materia.alumnos ?? '—'}</span>
            <span class="materia-stat__label">alumnos</span>
          </div>
        </div>
      </div>
      <div class="materia-card__footer">
        <button
          class="btn btn--primary btn--sm"
          data-nav-materia="${materia.id}"
          style="background:linear-gradient(135deg,${c.accent},${shiftColor(c.accent)})"
        >
          Ver alumnos →
        </button>
      </div>
    </div>
  `;
}

function emptyMaterias() {
  return `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state__icon">📚</div>
      <h3 class="empty-state__title">Sin materias activas</h3>
      <p class="empty-state__text">
        Creá tu primera materia para empezar a gestionar tus alumnos.
      </p>
      <a href="#/materias" class="btn btn--primary">+ Crear materia</a>
    </div>
  `;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// Oscurece ligeramente el color hex para el gradiente del botón
function shiftColor(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, ((n>>16)&0xff) - 30);
  const g = Math.max(0, ((n>>8)&0xff)  - 30);
  const b = Math.max(0, (n&0xff)       - 30);
  return `#${((r<<16)|(g<<8)|b).toString(16).padStart(6,'0')}`;
}

// ---------------------------------------------------------------------------
// Mock data (solo T02 — se reemplaza en T03)
// ---------------------------------------------------------------------------

function getMockMaterias() {
  return [
    {
      id: 'mock-bact',
      nombre: 'Bacteriología y Micología',
      ciclo: 'Ciclo I 2026',
      seccion: 'A',
      estado: 'activa',
      alumnos: 28,
    },
    {
      id: 'mock-bioq',
      nombre: 'Bioquímica Veterinaria',
      ciclo: 'Ciclo I 2026',
      seccion: null,
      estado: 'activa',
      alumnos: 35,
    },
    {
      id: 'mock-lab',
      nombre: 'Laboratorio Clínico Veterinario',
      ciclo: 'Ciclo I 2026',
      seccion: 'B',
      estado: 'activa',
      alumnos: 22,
    },
  ];
}
