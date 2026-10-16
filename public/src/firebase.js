/**
 * firebase.js
 * -----------
 * Initialises the Firebase app and exports the core service objects.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ─── PuREPower Firebase configuration ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyC4odjBbJ1__t9RiBHi_hK6o-Mz2q1RRi8",
  authDomain:        "purepower-leads.firebaseapp.com",
  projectId:         "purepower-leads",
  storageBucket:     "purepower-leads.firebasestorage.app",
  messagingSenderId: "431208190128",
  appId:             "1:431208190128:web:14cfcd35cb9b7e1f522b75"
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);
export default app;
