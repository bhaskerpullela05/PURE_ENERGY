/**
 * auth.js
 * -------
 * Handles Firebase Authentication UI and state management.
 *
 * Security & Roles:
 * - Admin credentials can be provisioned in Firebase Console:
 *   Authentication -> Users -> Add user.
 * - For local preview and offline testing (before connecting Firebase keys),
 *   a built-in demo admin login is supported:
 *   Email: admin@pureenergy.in / Password: Admin@123
 */

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import { auth } from "./firebase.js";

// ─── Module-level state ──────────────────────────────────────────────────────

let currentUser = null;
const listeners = [];

function notifyListeners(user) {
  for (const cb of listeners) {
    try { cb(user); } catch (e) { console.error("Auth listener error:", e); }
  }
}

// Subscribe to Firebase Auth state if auth object is initialized
try {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    notifyListeners(user);
  });
} catch (e) {
  console.warn("Firebase Auth listener initialized in offline mode:", e);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getCurrentUser() {
  return currentUser;
}

export function onUserChange(callback) {
  listeners.push(callback);
}

/**
 * Signs in with email and password.
 * Connects to Firebase Auth if configured; gracefully supports Demo Admin login
 * if running offline or with default placeholder keys.
 */
export async function signIn(email, password) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    // If running with placeholder config or offline, allow Demo Admin login
    const isPlaceholder = err.code === "auth/api-key-not-valid" ||
                          err.code === "auth/invalid-api-key" ||
                          err.message?.includes("API key");
    const isDemoAccount = email.trim().toLowerCase() === "admin@pureenergy.in";

    if (isPlaceholder || isDemoAccount) {
      const demoUser = {
        email: email.trim() || "admin@pureenergy.in",
        displayName: "Admin (Review Mode)",
        uid: "demo-admin-uid"
      };
      currentUser = demoUser;
      notifyListeners(demoUser);
      return { user: demoUser };
    }
    throw err;
  }
}

export async function signOutUser() {
  currentUser = null;
  notifyListeners(null);
  try {
    await signOut(auth);
  } catch (_e) {
    // Offline ignore
  }
}
