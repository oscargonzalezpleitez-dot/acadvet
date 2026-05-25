// =============================================================================
// AcadVet USAM — Portal de auto-inscripción del alumno
// =============================================================================

import { getDatabase, ref, get }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { app } from './firebase-config.js';
import { createSolicitud } from './db.js';

const db      = getDatabase(app);
const storage = getStorage(app);

const MAX_FOTO_BYTES = 5 * 1024 * 1024; // 5 MB para foto de perfil

let _materias = [];
let _fotoFile = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  await cargarMaterias();
  bindForm();
  bindFoto();
});

// ---------------------------------------------------------------------------
// Cargar materias activas
// ---------------------------------------------------------------------------

async function cargarMaterias() {
  const listEl = document.getElementById('materiasList');
  if (!listEl) return;

  try {
    const snap = await get(ref(db, 'materias'));
    if (!snap.exists()) {
      listEl.innerHTML = `<p class="text-muted text-sm">No hay materias activas registradas.</p>`;
      return;
    }

    _materias = Object.entries(snap.val())
      .map(([id, d]) => ({ id, ...d }))
      .filter(m => m.estado === 'activa')
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));

    if (_materias.length === 0) {
      listEl.innerHTML = `<p class="text-muted text-sm">No hay materias activas registradas.</p>`;
      return;
    }

    listEl.innerHTML = _materias.map(m => `
      <label class="materia-check">
        <input type="checkbox" name="materia" value="${escHtml(m.id)}" data-nombre="${escHtml(m.nombre)}">
        <span class="materia-check-label">
          <span class="materia-check-nombre">${escHtml(m.nombre)}</span>
          <span class="materia-check-ciclo">${escHtml(m.ciclo)}${m.seccion ? ' · Sec. ' + m.seccion : ''}</span>
        </span>
      </label>
    `).join('');
  } catch (err) {
    console.error('[Inscripción] Error cargando materias:', err);
    listEl.innerHTML = `<p class="text-muted text-sm" style="color:var(--danger)">Error al cargar materias. Recargá la página.</p>`;
  }
}

// ---------------------------------------------------------------------------
// Foto de perfil
// ---------------------------------------------------------------------------

function bindFoto() {
  document.getElementById('fFoto')?.addEventListener('change', e => {
    const file   = e.target.files?.[0];
    const preview = document.getElementById('fotoPreview');
    const nombre  = document.getElementById('fotoNombre');
    const errEl   = document.getElementById('errFoto');
    clearErr(errEl);

    const placeholder = document.getElementById('fotoPlaceholder');

    if (!file) {
      _fotoFile = null;
      if (preview)     { preview.src = ''; preview.classList.add('hidden'); }
      if (placeholder) placeholder.classList.remove('hidden');
      if (nombre)      nombre.textContent = 'Ninguna foto seleccionada';
      return;
    }

    if (!file.type.startsWith('image/')) {
      showErr(errEl, 'Solo se aceptan imágenes (JPG, PNG, etc.).');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FOTO_BYTES) {
      showErr(errEl, `La imagen supera el límite de 5 MB (${(file.size/1024/1024).toFixed(1)} MB).`);
      e.target.value = '';
      return;
    }

    _fotoFile = file;
    if (nombre)      nombre.textContent = file.name;
    if (placeholder) placeholder.classList.add('hidden');

    const reader = new FileReader();
    reader.onload = ev => {
      if (preview) { preview.src = ev.target.result; preview.classList.remove('hidden'); }
    };
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

function bindForm() {
  document.getElementById('btnRegistrarse')?.addEventListener('click', enviarSolicitud);
}

async function enviarSolicitud() {
  const nombre   = document.getElementById('fNombre')?.value.trim()   ?? '';
  const carnet   = document.getElementById('fCarnet')?.value.trim()   ?? '';
  const email    = document.getElementById('fEmail')?.value.trim()    ?? '';
  const telefono = document.getElementById('fTelefono')?.value.trim() ?? '';

  const checkedMaterias = [...document.querySelectorAll('input[name="materia"]:checked')];

  let ok = true;
  clearAll();

  if (!nombre)  { showErr(document.getElementById('errNombre'),   'El nombre es obligatorio.');    ok = false; }
  if (!carnet)  { showErr(document.getElementById('errCarnet'),   'El carné es obligatorio.');     ok = false; }
  if (!email)   { showErr(document.getElementById('errEmail'),    'El correo es obligatorio.');    ok = false; }
  if (checkedMaterias.length === 0) {
    showErr(document.getElementById('errMaterias'), 'Seleccioná al menos una materia.'); ok = false;
  }

  if (!ok) return;

  setLoading(true);

  try {
    let fotoUrl     = null;
    let storagePath = null;

    // Subir foto si se seleccionó
    if (_fotoFile) {
      const ts       = Date.now();
      const safeName = _fotoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      storagePath    = `perfiles/solicitudes/${ts}_${safeName}`;
      const fileRef  = sRef(storage, storagePath);

      try {
        const uploadTask = uploadBytesResumable(fileRef, _fotoFile, { contentType: _fotoFile.type });

        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed',
            snap => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              updateProgress(pct);
            },
            reject,
            resolve,
          );
        });

        fotoUrl = await getDownloadURL(fileRef);
      } catch (uploadErr) {
        console.error('[Inscripción] Error subiendo foto:', uploadErr);
        showErr(document.getElementById('errFoto'), 'No se pudo subir la foto. Podés continuar sin foto o intentar de nuevo.');
        setLoading(false);
        return;
      }
    }

    // Construir objeto de materias { id: nombre }
    const materias = {};
    checkedMaterias.forEach(el => {
      materias[el.value] = el.dataset.nombre ?? el.value;
    });

    await createSolicitud({
      nombre,
      carnet,
      email,
      telefono,
      fotoUrl,
      storagePath,
      materias,
      fecha: new Date().toISOString().slice(0, 10),
    });

    showSuccess(nombre);

  } catch (err) {
    console.error('[Inscripción] Error:', err);
    if (err.message === 'DUPLICADO_PENDIENTE') {
      showErr(document.getElementById('errCarnet'), 'Ya existe una solicitud pendiente con este carné. Esperá la respuesta del docente.');
    } else if (err.message === 'YA_REGISTRADO') {
      showErr(document.getElementById('errCarnet'), 'Este carné ya está registrado en el sistema.');
    } else {
      showErr(document.getElementById('errGlobal'), 'Error al enviar la solicitud. Verificá tu conexión e intentá de nuevo.');
    }
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function setLoading(on) {
  const btn  = document.getElementById('btnRegistrarse');
  const prog = document.getElementById('progressWrap');
  if (btn)  { btn.disabled = on; btn.textContent = on ? 'Enviando…' : 'Enviar solicitud'; }
  if (prog) prog.classList.toggle('hidden', !on);
}

function updateProgress(pct) {
  const bar  = document.getElementById('progressBar');
  const text = document.getElementById('progressText');
  if (bar)  bar.style.width = `${pct}%`;
  if (text) text.textContent = `Subiendo foto… ${pct}%`;
}

function showSuccess(nombre) {
  document.getElementById('formStep')?.classList.add('hidden');
  const ok = document.getElementById('stepOk');
  if (ok) ok.classList.remove('hidden');
  const det = document.getElementById('okDetalle');
  if (det) det.textContent = `Tu solicitud fue enviada. El docente revisará tu registro y recibirás confirmación.`;
  const nom = document.getElementById('okNombre');
  if (nom) nom.textContent = nombre;
}

function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearErr(el) {
  if (!el) return;
  el.textContent = '';
  el.classList.add('hidden');
}

function clearAll() {
  ['errNombre','errCarnet','errEmail','errTelefono','errMaterias','errFoto','errGlobal']
    .forEach(id => clearErr(document.getElementById(id)));
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
