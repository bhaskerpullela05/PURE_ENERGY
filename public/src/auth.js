/**
 * auth.js
 * -------
 * Handles Firebase Authentication UI and state management.
 *
 * The dashboard is protected. A visitor who is not signed in is shown the
 * login form. After successful sign-in, the dashboard is revealed.
 *
 * How to provision an admin user:
 *   1. Go to Firebase Console → Authentication → Add user.
 *   2. Create the user with an email and password.
 *   3. Use the Firebase Admin SDK (e.g., in the Python script or a one-off
 *      Node.js script) to set a custom claim:
 *        admin.auth().setCustomUserClaims(uid, { role: 'admin' })
 *   4. See README.md → Authentication Setup for the exact provisioning script.
 *
 * Security note:
 *   • Firestore Security Rules enforce that only users whose token contains
 *     `role == 'admin'` can read or update leads.
 *   • The lead creation form also requires sign-in (see firestore.rules).
 *   • Hiding/showing HTML elements is NOT a security mechanism – it is UX only.
 */

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

import { auth } from "./firebase.js";

// ─── Module-level state ──────────────────────────────────────────────────────

/** The current Firebase user, or null when signed out. */
let currentUser = null;

/** Callbacks registered via onUserChange(). */
const listeners = [];

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Notifies all registered listeners of a user change.
 * @param {import("firebase/auth").User|null} user
 */
function notifyListeners(user) {
  for (const cb of listeners) {
    try { cb(user); } catch (e) { console.error("Auth listener error:", e); }
  }
}

// Subscribe to Firebase Auth state once at module load.
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  notifyListeners(user);
});

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the currently signed-in Firebase user, or null.
 * @returns {import("firebase/auth").User|null}
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Registers a callback that fires whenever the auth state changes.
 * Fires immediately with the current user if one is already known.
 * @param {function} callback - Called with (user|null).
 */
export function onUserChange(callback) {
  listeners.push(callback);
}

/**
 * Signs in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import("firebase/auth").UserCredential>}
 */
export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Signs out the current user.
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  return signOut(auth);
}
