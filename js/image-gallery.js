// =============================================================================
// AcadVet USAM — Módulo 2: Galería de Microscopía
// =============================================================================
import { getDatabase, ref, push, remove, onValue }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { app } from './firebase-config.js';

const rtdb    = getDatabase(app);
const storage = getStorage(app);

export const GALLERY_CATEGORIES = [
  { id: 'bacteriologia', label: 'Bacteriología',  color: '#6C63FF' },
  { id: 'micologia',     label: 'Micología',       color: '#00B894' },
  { id: 'lab_clinico',   label: 'Lab Clínico',     color: '#00D2D3' },
  { id: 'histologia',    label: 'Histología',      color: '#FF6B6B' },
];

// Sube imagen a Storage y guarda metadata en RTDB
// onProgress(pct: 0-100) se llama durante la subida
export function uploadGalleryImage(file, { name, category, desc, tags }, onProgress) {
  return new Promise((resolve, reject) => {
    const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fileRef  = sRef(storage, `lab_images/${filename}`);
    const task     = uploadBytesResumable(fileRef, file);

    task.on('state_changed',
      snap => {
        const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
        onProgress?.(pct);
      },
      reject,
      async () => {
        try {
          const url    = await getDownloadURL(task.snapshot.ref);
          const newRef = await push(ref(rtdb, 'lab_images'), {
            name:       name.trim(),
            category,
            desc:       desc.trim(),
            tags:       tags.trim(),
            url,
            path:       `lab_images/${filename}`,
            created_at: Date.now(),
          });
          resolve({ id: newRef.key, url, path: `lab_images/${filename}` });
        } catch (e) { reject(e); }
      }
    );
  });
}

// Elimina imagen de RTDB y del Storage
export async function deleteGalleryImage(id, path) {
  await remove(ref(rtdb, `lab_images/${id}`));
  if (path) {
    try { await deleteObject(sRef(storage, path)); } catch { /* ya no existe */ }
  }
}

// Escucha cambios en la galería completa
export function listenGallery(callback) {
  return onValue(ref(rtdb, 'lab_images'), snap => {
    if (!snap.exists()) { callback([]); return; }
    const list = Object.entries(snap.val())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.created_at - a.created_at);
    callback(list);
  });
}
