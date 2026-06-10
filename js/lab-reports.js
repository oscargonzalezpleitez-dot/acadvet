// =============================================================================
// AcadVet USAM — Módulo de Reportes de Prácticas de Laboratorio
// Core logic: GPS, watermark, Firebase Storage + RTDB
// =============================================================================

import { getDatabase, ref, push, set, get }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { getAuth, signInAnonymously }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { app } from './firebase-config.js';

// ---------------------------------------------------------------------------
// Constantes del laboratorio — ajustar coordenadas a la ubicación real
// ---------------------------------------------------------------------------
export const LAB_LAT       = 13.6894;
export const LAB_LNG       = -89.1872;
export const RADIUS_METERS = 50;

export const TIPOS_PREPARACION = [
  'Tinción Gram',
  'Cultivo bacteriano',
  'Hemograma',
  'Urianálisis',
  'Examen micológico (Hongos)',
  'Otra preparación'
];

const rtdb    = getDatabase(app);
const storage = getStorage(app);
const auth    = getAuth(app);

// ---------------------------------------------------------------------------
// Auth anónima — requerida para escribir en RTDB/Storage sin credenciales
// ---------------------------------------------------------------------------
export async function ensureAnonymousAuth() {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
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
// Watermark sobre canvas
// ---------------------------------------------------------------------------
export function drawWatermark(canvas, studentName, studentId, coords) {
  const ctx      = canvas.getContext('2d');
  const fontSize = Math.max(13, Math.floor(canvas.width / 32));
  const pad      = 14;
  const lineH    = fontSize + 8;

  ctx.font      = `bold ${fontSize}px Arial, sans-serif`;
  ctx.lineJoin  = 'round';
  ctx.lineWidth = 4;

  const now   = new Date().toLocaleString('es-SV');
  const line1 = `${studentName}  |  ${studentId}`;
  const line2 = `${now}  |  GPS: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;

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
      try {
        await ensureAnonymousAuth();
        const dateStr = new Date().toISOString().slice(0, 10);
        const ts      = Date.now();
        const safeid  = studentId.replace(/[^\w-]/g, '');
        const path    = `lab-reports/${dateStr}/${safeid}-${ts}.jpg`;
        const snap    = await uploadBytes(storageRef(storage, path), blob, { contentType: 'image/jpeg' });
        resolve(await getDownloadURL(snap.ref));
      } catch (e) { reject(e); }
    }, 'image/jpeg', 0.88);
  });
}

// ---------------------------------------------------------------------------
// Guardar reporte en RTDB
// ---------------------------------------------------------------------------
export async function saveReport({ studentName, studentId, asignatura, tipoPreparacion, coords, distance, fotoUrl }) {
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
    gps_lat:          coords.latitude,
    gps_lng:          coords.longitude,
    gps_distancia:    Math.round(distance),
    foto_url:         fotoUrl,
    estado:           'pendiente',
    feedback:         '',
    reviewed_at:      null
  });
  return rRef.key;
}
