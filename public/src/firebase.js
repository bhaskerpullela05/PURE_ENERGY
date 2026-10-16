/**
 * firebase.js
 * -----------
 * Initialises the Firebase app and exports the core service objects.
 *
 * Firebase Hosting Integration:
 * When deployed to Firebase Hosting, Firebase automatically serves
 * `/__/firebase/init.json` containing your project's configuration.
 * This module checks for that file dynamically.
 *
 * For local development or non-Firebase hosting:
 * Replace the values in `firebaseConfig` below with your real project keys:
 *   Firebase Console → Project Settings → General → Your apps → Web app
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ─── Default / Fallback Firebase configuration ────────────────────────────────
let firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// Automatic detection on Firebase Hosting:
// If placeholder is detected, attempt to load live configuration from Firebase Hosting
if (firebaseConfig.projectId === "YOUR_PROJECT_ID" && typeof window !== "undefined") {
  try {
    const res = await fetch("/__/firebase/init.json");
    if (res.ok) {
      const liveConfig = await res.json();
      if (liveConfig && liveConfig.projectId) {
        firebaseConfig = liveConfig;
      }
    }
  } catch (_err) {
    // Local development or non-hosting environment — fallback to static config
  }
}

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);
export default app;
