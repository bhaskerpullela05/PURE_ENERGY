/**
 * firebase.js
 * -----------
 * Initialises the Firebase app and exports the core service objects.
 *
 * IMPORTANT: Replace the firebaseConfig object below with the real values
 * from your Firebase Console:
 *   Firebase Console → Project Settings → Your apps → SDK setup and config
 *
 * These values are NOT secret – they are the client-side identifiers that
 * Firebase uses to route SDK calls to the right project. Security is
 * enforced by Firestore Security Rules and Firebase Authentication, NOT
 * by keeping these values hidden.
 *
 * For local development you can also create a `public/src/firebase-config.js`
 * file that is listed in .gitignore and import from there.
 */

import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore }         from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth }              from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ─── Replace every value here with your real Firebase project config ─────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);
export default app;
