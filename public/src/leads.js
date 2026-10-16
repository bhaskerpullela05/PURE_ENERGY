/**
 * leads.js
 * --------
 * All Firestore operations for the leads collection.
 *
 * ─── Duplicate-prevention strategy ─────────────────────────────────────────
 * The document ID for every lead is set to the normalized 10-digit mobile
 * number (e.g. "9447712782").  Because Firestore document IDs are unique
 * within a collection, attempting to create a second lead with the same
 * mobile number will collide at the database level.
 *
 * We use a Firestore transaction to:
 *   1. Read the would-be document.
 *   2. If it already exists → abort and throw a DuplicateMobileError.
 *   3. If it does not exist → write the lead document.
 *
 * This is safe under concurrent submissions: Firestore transactions are
 * serialized for the same document, so two concurrent requests for the same
 * mobile number result in exactly one success and one failure.
 *
 * Trade-offs documented in README.md:
 *   • Using the mobile number as the document ID couples the data model to
 *     that field. If a customer ever changes their number, the document would
 *     need to be migrated.
 *   • This approach works on the Spark (free) plan without Cloud Functions.
 *
 * ─── Data model ─────────────────────────────────────────────────────────────
 * Collection: leads
 * Document ID: normalized 10-digit mobile number
 * Fields:
 *   leadId    string   — same as the document ID (mobile number) for imports
 *                         it matches the original lead_id from the CSV
 *   name      string
 *   mobile    string   — normalized 10-digit string
 *   pincode   string   — 6-digit string
 *   product   string
 *   source    string
 *   dealer    string   — assigned dealer name or "In-house Sales"
 *   status    string   — "New" | "Contacted" | "Converted" | "Lost"
 *   createdOn Timestamp (server-generated)
 *   updatedOn Timestamp (server-generated)
 */

import {
  collection,
  doc,
  getDocs,
  runTransaction,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

import { db }           from "./firebase.js";
import { assignDealer } from "./dealers.js";

// Firestore collection references
const leadsCol = collection(db, "leads");

// ─── Custom error classes ────────────────────────────────────────────────────

export class DuplicateMobileError extends Error {
  constructor(mobile) {
    super(`A lead with mobile number ${mobile} already exists.`);
    this.name = "DuplicateMobileError";
    this.mobile = mobile;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Creates a new lead in Firestore.
 *
 * Uses a transaction to atomically check uniqueness and write.
 * The document ID is the normalized mobile number.
 *
 * @param {{ name, mobile, pincode, product, source }} cleaned - Pre-validated form data.
 * @returns {Promise<string>} The new document ID (= mobile number).
 * @throws {DuplicateMobileError} If the mobile number already has a lead.
 */
export async function createLead(cleaned) {
  const { name, mobile, pincode, product, source } = cleaned;
  const dealer = assignDealer(pincode);

  // Document reference – mobile number is the unique key.
  const docRef = doc(db, "leads", mobile);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(docRef);
    if (snap.exists()) {
      throw new DuplicateMobileError(mobile);
    }
    tx.set(docRef, {
      leadId:    mobile,   // For new leads created via the form
      name,
      mobile,
      pincode,
      product,
      source,
      dealer,
      status:    "New",
      createdOn: serverTimestamp(),
      updatedOn: serverTimestamp()
    });
  });

  return mobile;
}

/**
 * Updates the status of an existing lead.
 * Only the status and updatedOn fields are changed.
 * Firestore Security Rules enforce that only admin users can call this.
 *
 * @param {string} docId  - The lead document ID.
 * @param {string} status - One of: New, Contacted, Converted, Lost.
 * @returns {Promise<void>}
 */
export async function updateLeadStatus(docId, status) {
  const VALID = ["New", "Contacted", "Converted", "Lost"];
  if (!VALID.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const docRef = doc(db, "leads", docId);
  await updateDoc(docRef, {
    status,
    updatedOn: serverTimestamp()
  });
}

/**
 * Fetches all leads once (for the initial dashboard load).
 * Ordered by createdOn descending (newest first).
 *
 * @returns {Promise<Array<Object>>} Array of lead data objects with `id` field.
 */
export async function fetchAllLeads() {
  const q = query(leadsCol, orderBy("createdOn", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribes to real-time lead updates.
 * Calls the provided callback whenever the leads collection changes.
 *
 * @param {function} callback - Called with an array of lead objects.
 * @returns {function} Unsubscribe function.
 */
export function subscribeToLeads(callback) {
  const q = query(leadsCol, orderBy("createdOn", "desc"));
  return onSnapshot(q, (snap) => {
    const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(leads);
  });
}
