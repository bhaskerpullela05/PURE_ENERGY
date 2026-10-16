/**
 * dashboard.js
 * ------------
 * Renders the admin dashboard.
 *
 * Responsibilities:
 *   • Subscribes to real-time lead updates from Firestore.
 *   • Displays summary statistics (total, by dealer, by status).
 *   • Renders the leads table with filters.
 *   • Handles status change via a dropdown and saves to Firestore.
 *   • Cleans up the Firestore subscription when the user signs out.
 *
 * This module expects the following DOM elements to be present in index.html:
 *   #stat-total, #stat-by-dealer, #stat-by-status
 *   #leads-table-body, #filter-dealer, #filter-status, #search-input
 *   #dashboard-error
 */

import { subscribeToLeads, updateLeadStatus } from "./leads.js";
import { VALID_STATUSES }                      from "./validation.js";

// ─── Module state ────────────────────────────────────────────────────────────
let allLeads       = [];      // Full dataset from Firestore
let unsubscribeFn  = null;    // Firestore listener cleanup

// Active filter state
const filters = { dealer: "", status: "", search: "" };

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Starts the dashboard: subscribes to Firestore and sets up UI event listeners.
 * Should be called once when the admin user signs in.
 */
export function initDashboard() {
  setupFilterListeners();

  unsubscribeFn = subscribeToLeads((leads) => {
    allLeads = leads;
    render();
  });
}

/**
 * Stops the dashboard: unsubscribes from Firestore.
 * Should be called when the user signs out.
 */
export function teardownDashboard() {
  if (unsubscribeFn) {
    unsubscribeFn();
    unsubscribeFn = null;
  }
  allLeads = [];
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Main render function. Applies filters and updates every dashboard element.
 */
function render() {
  const filtered = applyFilters(allLeads);
  renderStats(allLeads);         // Stats always use the full dataset
  populateFilterOptions(allLeads);
  renderTable(filtered);
}

/**
 * Applies the active dealer, status, and search filters.
 * @param {Array<Object>} leads
 * @returns {Array<Object>}
 */
function applyFilters(leads) {
  return leads.filter(lead => {
    if (filters.dealer && lead.dealer !== filters.dealer) return false;
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = [
        lead.name, lead.mobile, lead.pincode, lead.product, lead.source
      ].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Renders summary statistics.
 * @param {Array<Object>} leads
 */
function renderStats(leads) {
  // Total count
  const totalEl = document.getElementById("stat-total");
  if (totalEl) totalEl.textContent = leads.length;

  // By dealer
  const byDealer = groupBy(leads, "dealer");
  const dealerEl = document.getElementById("stat-by-dealer");
  if (dealerEl) {
    if (leads.length === 0) {
      dealerEl.innerHTML = '<p class="empty-stat">No leads yet.</p>';
    } else {
      dealerEl.innerHTML = Object.entries(byDealer)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) =>
          `<div class="stat-row">
             <span class="stat-label">${escHtml(name)}</span>
             <span class="stat-badge">${count}</span>
           </div>`)
        .join("");
    }
  }

  // By status
  const byStatus = groupBy(leads, "status");
  const statusEl = document.getElementById("stat-by-status");
  if (statusEl) {
    if (leads.length === 0) {
      statusEl.innerHTML = '<p class="empty-stat">No leads yet.</p>';
    } else {
      statusEl.innerHTML = VALID_STATUSES
        .map(s => {
          const count = byStatus[s] ?? 0;
          return `<div class="stat-row">
                    <span class="stat-label status-dot status-${s.toLowerCase()}">${escHtml(s)}</span>
                    <span class="stat-badge">${count}</span>
                  </div>`;
        })
        .join("");
    }
  }
}

/**
 * Populates the dealer and status filter dropdowns with unique values from data.
 * @param {Array<Object>} leads
 */
function populateFilterOptions(leads) {
  const dealerSel = document.getElementById("filter-dealer");
  const statusSel = document.getElementById("filter-status");
  if (!dealerSel || !statusSel) return;

  const currentDealer = dealerSel.value;
  const currentStatus = statusSel.value;

  // Dealer options
  const dealers = [...new Set(leads.map(l => l.dealer).filter(Boolean))].sort();
  dealerSel.innerHTML = '<option value="">All Dealers</option>' +
    dealers.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join("");
  dealerSel.value = currentDealer;

  // Status options are fixed
  statusSel.innerHTML = '<option value="">All Statuses</option>' +
    VALID_STATUSES.map(s => `<option value="${s}">${s}</option>`).join("");
  statusSel.value = currentStatus;
}

/**
 * Renders the leads table body.
 * @param {Array<Object>} leads
 */
function renderTable(leads) {
  const tbody = document.getElementById("leads-table-body");
  if (!tbody) return;

  if (leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          No leads match the current filters.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = leads.map(lead => {
    const created = formatTimestamp(lead.createdOn);
    const statusOptions = VALID_STATUSES
      .map(s => `<option value="${s}" ${lead.status === s ? "selected" : ""}>${s}</option>`)
      .join("");

    return `
      <tr data-id="${escHtml(lead.id)}">
        <td>${escHtml(lead.name ?? "—")}</td>
        <td>${escHtml(lead.mobile ?? "—")}</td>
        <td>${escHtml(lead.pincode ?? "—")}</td>
        <td>${escHtml(lead.product ?? "—")}</td>
        <td>${escHtml(lead.source ?? "—")}</td>
        <td>${escHtml(lead.dealer ?? "—")}</td>
        <td>
          <select class="status-select status-${(lead.status ?? "").toLowerCase()}"
                  data-lead-id="${escHtml(lead.id)}"
                  aria-label="Change status for ${escHtml(lead.name ?? "lead")}">
            ${statusOptions}
          </select>
        </td>
        <td>${created}</td>
      </tr>`;
  }).join("");

  // Attach change handlers to status selects
  tbody.querySelectorAll(".status-select").forEach(sel => {
    sel.addEventListener("change", handleStatusChange);
  });
}

// ─── Event handlers ──────────────────────────────────────────────────────────

/**
 * Handles a status-dropdown change event.
 * @param {Event} e
 */
async function handleStatusChange(e) {
  const sel      = e.target;
  const leadId   = sel.dataset.leadId;
  const newStatus = sel.value;

  sel.disabled = true;
  clearDashboardError();

  try {
    await updateLeadStatus(leadId, newStatus);
    // Optimistically update the select's colour class
    sel.className = `status-select status-${newStatus.toLowerCase()}`;
  } catch (err) {
    console.error("Status update failed:", err);
    showDashboardError(`Failed to update status: ${err.message}`);
    // Revert to the previous value by re-rendering
    render();
  } finally {
    sel.disabled = false;
  }
}

/**
 * Wires up filter and search inputs.
 */
function setupFilterListeners() {
  const dealerSel  = document.getElementById("filter-dealer");
  const statusSel  = document.getElementById("filter-status");
  const searchInp  = document.getElementById("search-input");

  if (dealerSel) dealerSel.addEventListener("change", e => { filters.dealer = e.target.value; render(); });
  if (statusSel) statusSel.addEventListener("change", e => { filters.status = e.target.value; render(); });
  if (searchInp) searchInp.addEventListener("input",  e => { filters.search = e.target.value.trim(); render(); });
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Groups an array of objects by the value of a given key.
 * @param {Array<Object>} arr
 * @param {string} key
 * @returns {Object} { value: count }
 */
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const val = item[key] ?? "Unknown";
    acc[val] = (acc[val] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * Formats a Firestore Timestamp or ISO string to a readable date.
 * @param {any} ts
 * @returns {string}
 */
function formatTimestamp(ts) {
  if (!ts) return "—";
  // Firestore Timestamp has a .toDate() method
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    year: "numeric", month: "short", day: "2-digit"
  });
}

/**
 * Escapes HTML special characters to prevent XSS in innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showDashboardError(msg) {
  const el = document.getElementById("dashboard-error");
  if (el) { el.textContent = msg; el.hidden = false; }
}

function clearDashboardError() {
  const el = document.getElementById("dashboard-error");
  if (el) { el.textContent = ""; el.hidden = true; }
}

export { escHtml };
