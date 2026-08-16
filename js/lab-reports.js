// =============================================================================
// AcadVet USAM — Módulo de Reportes de Prácticas de Laboratorio
// Core logic: GPS, watermark, Firebase Storage + RTDB
// =============================================================================

import { getDatabase, ref, push, set, get }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { getAuth, signInAnonymously, signOut }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { app } from './firebase-config.js';

// ---------------------------------------------------------------------------
// Constantes del laboratorio — ajustar coordenadas a la ubicación real
// ---------------------------------------------------------------------------
export const LAB_LAT       = 13.6894;
export const LAB_LNG       = -89.1872;
export const RADIUS_METERS = 50;

// Lado más largo en px al que se reduce cualquier foto (cámara o galería)
// antes de subirla. Suficiente detalle para revisar una práctica de
// laboratorio y mantiene el archivo liviano para Storage/RTDB.
export const PHOTO_MAX_DIM     = 1600;
export const PHOTO_JPEG_QUALITY = 0.85;

export const TIPOS_PREPARACION = [
  'Práctica 1. Esterilización y desinfección microbiológica',
  'Práctica 2. Preparación de medios de cultivo',
  'Práctica 3. Técnicas de siembra bacteriana',
  'Práctica 4. Tinción de Gram y observación bacteriana',
  'Práctica 5. Cultivo e identificación básica de hongos',
  'Práctica 6. Pruebas bioquímicas bacterianas básicas',
  'Práctica 7. Necropsia aviar y cultivo microbiológico de órganos',
];

const rtdb    = getDatabase(app);
const storage = getStorage(app);
const auth    = getAuth(app);

// ---------------------------------------------------------------------------
// Auth anónima — requerida para escribir en RTDB/Storage sin credenciales
//
// No basta con revisar si auth.currentUser existe: la sesión puede quedar
// invalidada del lado del servidor (token vencido, cuenta revocada) mientras
// el objeto sigue en caché local. En ese caso el alumno queda con un
// "storage/unauthorized" que un simple reintento nunca arregla, porque
// currentUser sigue pareciendo válido. Por eso forzamos un refresh real del
// token y, si falla, re-autenticamos desde cero.
// ---------------------------------------------------------------------------
export async function ensureAnonymousAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
    return;
  }
  try {
    await auth.currentUser.getIdToken(true);
  } catch (_) {
    try { await signOut(auth); } catch (_) {}
    await signInAnonymously(auth);
  }
}

// ---------------------------------------------------------------------------
// Ubicación del laboratorio — se guarda en RTDB config/lab_location
// ---------------------------------------------------------------------------
export async function getLabLocation() {
  try {
    const snap = await get(ref(rtdb, 'config/lab_location'));
    if (snap.exists()) {
      const d = snap.val();
      return { lat: d.lat, lng: d.lng, radius: d.radius ?? RADIUS_METERS };
    }
  } catch (_) {}
  return { lat: LAB_LAT, lng: LAB_LNG, radius: RADIUS_METERS };
}

export async function saveLabLocation(lat, lng, radius = 50) {
  await set(ref(rtdb, 'config/lab_location'), {
    lat, lng, radius,
    updated_at: Date.now()
  });
}

// ---------------------------------------------------------------------------
// GPS
// ---------------------------------------------------------------------------
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este dispositivo no tiene GPS disponible'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos  => resolve(pos.coords),
      err  => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function validateLocation() {
  const coords   = await getCurrentLocation();
  const distance = haversineMeters(coords.latitude, coords.longitude, LAB_LAT, LAB_LNG);
  return { coords, distance, valid: distance <= RADIUS_METERS };
}

// ---------------------------------------------------------------------------
// Dibuja una imagen (video frame o <img>) en un canvas, reducida a
// PHOTO_MAX_DIM si hace falta. Fotos de galería de celulares modernos vienen
// en 12+ MP; sin este límite el JPEG final pesaría varios MB.
// ---------------------------------------------------------------------------
export function drawScaledToCanvas(canvas, source, sourceW, sourceH) {
  const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(sourceW, sourceH));
  const w = Math.round(sourceW * scale);
  const h = Math.round(sourceH * scale);

  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(source, 0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Carga un File (input de galería) como HTMLImageElement
// ---------------------------------------------------------------------------
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen seleccionada')); };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Watermark sobre canvas
// ---------------------------------------------------------------------------
export function drawWatermark(canvas, studentName, studentId) {
  const ctx      = canvas.getContext('2d');
  const fontSize = Math.max(13, Math.floor(canvas.width / 32));
  const pad      = 14;
  const lineH    = fontSize + 8;

  ctx.font      = `bold ${fontSize}px Arial, sans-serif`;
  ctx.lineJoin  = 'round';
  ctx.lineWidth = 4;

  const now   = new Date().toLocaleString('es-SV');
  const line1 = `${studentName}  |  ${studentId}`;
  const line2 = `AcadVet USAM  |  ${now}`;

  [line1, line2].forEach((text, i) => {
    const y = canvas.height - pad - lineH * (1 - i);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(text, pad, y);
    ctx.fillStyle   = 'rgba(255,255,255,0.95)';
    ctx.fillText(text, pad, y);
  });
}

// ---------------------------------------------------------------------------
// Subir foto a Firebase Storage
// ---------------------------------------------------------------------------
export function uploadPhoto(canvas, studentId) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) { reject(new Error('No se pudo generar la imagen')); return; }
      const dateStr = new Date().toISOString().slice(0, 10);
      const ts      = Date.now();
      const safeid  = studentId.replace(/[^\w-]/g, '');
      const path    = `lab-reports/${dateStr}/${safeid}-${ts}.jpg`;
      try {
        await ensureAnonymousAuth();
        const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
        resolve(await getDownloadURL(snap.ref));
      } catch (e) {
        // Un solo reintento forzando sesión nueva: cubre el caso raro en que
        // el token recién emitido todavía no es válido para las reglas.
        if (e.code === 'storage/unauthorized') {
          try {
            try { await signOut(auth); } catch (_) {}
            await signInAnonymously(auth);
            const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
            resolve(await getDownloadURL(snap.ref));
            return;
          } catch (e2) { reject(e2); return; }
        }
        reject(e);
      }
    }, 'image/jpeg', PHOTO_JPEG_QUALITY);
  });
}

// ---------------------------------------------------------------------------
// Guardar reporte en RTDB
// ---------------------------------------------------------------------------
export async function saveReport({ studentName, studentId, asignatura, tipoPreparacion, fotoUrl }) {
  await ensureAnonymousAuth();
  const rRef = push(ref(rtdb, 'lab_reports'));
  const now  = new Date();
  await set(rRef, {
    student_name:     studentName,
    student_id:       studentId,
    asignatura,
    tipo_preparacion: tipoPreparacion,
    timestamp:        now.getTime(),
    fecha:            now.toISOString().slice(0, 10),
    foto_url:         fotoUrl,
    estado:           'pendiente',
    feedback:         '',
    reviewed_at:      null
  });
  return rRef.key;
}
