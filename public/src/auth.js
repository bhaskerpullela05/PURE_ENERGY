/**
 * auth.js
 * -------
 * Handles Firebase Authentication UI and session state management.
 *
 * Authentication Flow:
 * - Direct integration with Firebase Authentication SDK.
 * - Visitors log in using Email and Password configured in Firebase Console.
 * - Credentials are authenticated directly against Firebase Auth backend servers.
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
    try {
      cb(user);
    } catch (e) {
      console.error("Auth listener error:", e);
    }
  }
}

// Subscribe to Firebase Auth state
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  notifyListeners(user);
});

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the currently signed-in Firebase user, or null if signed out.
 * @returns {import("firebase/auth").User|null}
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Registers a callback invoked whenever the user logs in or out.
 * @param {function(import("firebase/auth").User|null): void} callback
 */
export function onUserChange(callback) {
  listeners.push(callback);
}

/**
 * Authenticates user credentials with Firebase Authentication backend.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import("firebase/auth").UserCredential>}
 */
export async function signIn(email, password) {
  return await signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Signs out the current user session from Firebase.
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  return await signOut(auth);
}
