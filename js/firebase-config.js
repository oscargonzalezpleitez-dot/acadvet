// =============================================================================
// AcadVet USAM — Configuración de Firebase
// =============================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey:            "AIzaSyDsypCuOI00MIkow2rATpd3FjujP5jVBwM",
  authDomain:        "acadvet-usam.firebaseapp.com",
  databaseURL:       "https://acadvet-usam-default-rtdb.firebaseio.com",
  projectId:         "acadvet-usam",
  storageBucket:     "acadvet-usam.firebasestorage.app",
  messagingSenderId: "1020301218871",
  appId:             "1:1020301218871:web:7f28eda174b8af9bc45bb2"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firebase Console → Project Settings → Cloud Messaging → Web configuration
// → "Generate key pair". Necesaria para pedir el token de push (js/push.js).
export const VAPID_KEY = 'BITWewAv4NBQmSXsVct7p9zrPAHdNYFqa_7TWIVOAdGPOfGkrOOktZys8tXZk27QSgPaSrhcOzL0oZkoWPw5ZTw';
