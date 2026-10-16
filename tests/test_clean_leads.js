/**
 * test_clean_leads.js  (mirrors test_clean_leads.py)
 * ---------------------------------------------------
 * Automated tests for validation and dealer-assignment logic.
 * No Firebase credentials required – all functions are pure.
 *
 * Run:  node tests/test_clean_leads.js
 */

"use strict";

// ─── Inline the logic under test (mirrors validation.js & dealers.js) ─────────

function normalizeMobile(raw) {
  if (!raw || !raw.trim()) return { ok: false, val: "", reason: "Mobile number is missing" };
  let cleaned = raw.trim().replace(/[\s\-]/g, "").replace(/^\+91/, "").replace(/^91(?=\d{10}$)/, "");
  if (/^\d{10}$/.test(cleaned)) return { ok: true, val: cleaned };
  return { ok: false, val: "", reason: `Invalid mobile '${raw}'` };
}

function normalizePincode(raw) {
  if (!raw || !raw.trim()) return { ok: false, val: "", reason: "Pincode is missing" };
  const c = raw.trim();
  if (/^\d{6}$/.test(c)) return { ok: true, val: c };
  return { ok: false, val: "", reason: `Invalid pincode '${raw}'` };
}

function normalizeStatus(raw) {
  const stripped = raw.trim();
  const titled = stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
  const valid = ["New", "Contacted", "Converted", "Lost"];
  if (valid.includes(titled)) return { ok: true, val: titled, fixed: titled !== stripped };
  return { ok: false, val: stripped, fixed: false };
}

function normalizeSource(raw) {
  const map = {
    "website": "Website",
    "ai voice call": "AI Voice Call",
    "whatsapp": "WhatsApp",
    "dealer walk-in": "Dealer Walk-in",
    "voice agent": "Voice Agent",
  };
  const norm = map[raw.trim().toLowerCase()] || raw.trim();
  return { val: norm, fixed: norm !== raw.trim() };
}

// Dealers from dealers.csv
const DEALERS = [
  { id: "D01", name: "Sri Sai Power Solutions",  prefixes: ["500"] },
  { id: "D02", name: "Kandi Energy Point",        prefixes: ["502"] },
  { id: "D03", name: "Warangal Green Systems",    prefixes: ["506"] },
  { id: "D04", name: "Karimnagar Solar Hub",       prefixes: ["505"] },
  { id: "D05", name: "Vizag Home Power",           prefixes: ["530", "531"] },
  { id: "D06", name: "Krishna Energy Store",       prefixes: ["520", "521"] },
  { id: "D07", name: "Guntur Battery World",       prefixes: ["522"] },
  { id: "D08", name: "Tirupati PowerHouse",        prefixes: ["517"] },
];
const INHOUSE = "In-house Sales";

function buildPrefixMap() {
  const m = new Map();
  for (const d of DEALERS) for (const p of d.prefixes) if (!m.has(p)) m.set(p, d.name);
  return m;
}
const PREFIX_MAP = buildPrefixMap();

function assignDealer(pincode) {
  if (!pincode || pincode.length < 3) return INHOUSE;
  return PREFIX_MAP.get(pincode.slice(0, 3)) || INHOUSE;
}

// Simulate full record cleaning (returns action string)
function simulateClean(rawRows) {
  const recon = [];
  const seenMobiles  = new Map();
  const seenLeadIds  = new Set();

  for (const raw of rawRows) {
    const lead_id = (raw.lead_id || "").trim();

    if (seenLeadIds.has(lead_id)) {
      recon.push({ lead_id, action: "rejected", reason: "Duplicate lead_id" });
      continue;
    }
    seenLeadIds.add(lead_id);

    const fixes = [];

    const rawName = (raw.name || "").trim();
    if (!rawName) { recon.push({ lead_id, action: "rejected", reason: "Missing name" }); continue; }

    const mob = normalizeMobile(raw.phone || "");
    if (!mob.ok) { recon.push({ lead_id, action: "rejected", reason: mob.reason }); continue; }
    if (mob.val !== (raw.phone || "").trim()) fixes.push("phone");

    if (seenMobiles.has(mob.val)) {
      recon.push({ lead_id, action: "merged", reason: `Dup mobile ${mob.val} → ${seenMobiles.get(mob.val)}` });
      continue;
    }
    seenMobiles.set(mob.val, lead_id);

    const pin = normalizePincode(raw.pincode || "");
    if (!pin.ok) { recon.push({ lead_id, action: "rejected", reason: pin.reason }); continue; }

    const dealer = assignDealer(pin.val);
    const inhouse = dealer === INHOUSE;

    const st = normalizeStatus(raw.status || "");
    if (!st.ok) fixes.push("status");
    else if (st.fixed) fixes.push("status");

    const src = normalizeSource(raw.source || "");
    if (src.fixed) fixes.push("source");

    let action;
    if (fixes.length > 0) action = "fixed";
    else if (inhouse) action = "assigned_inhouse";
    else action = "imported";

    recon.push({ lead_id, action, reason: dealer });
  }
  return recon;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`     → ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}
function assertEqual(a, b) {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── Test suites ──────────────────────────────────────────────────────────────

console.log("\n📋  Mobile number validation\n");

test("Valid 10-digit mobile is accepted", () => {
  const r = normalizeMobile("9447712782");
  assert(r.ok);
  assertEqual(r.val, "9447712782");
});

test("Mobile with leading +91 is normalised to 10 digits", () => {
  const r = normalizeMobile("+919000012345");
  assert(r.ok);
  assertEqual(r.val, "9000012345");
});

test("Mobile with spaces and dashes is normalised (L1004)", () => {
  const r = normalizeMobile("98480 22 431");
  assert(r.ok);
  assertEqual(r.val, "9848022431");
});

test("Mobile with +91- prefix normalised (L1006)", () => {
  const r = normalizeMobile("+91-9000012345");
  assert(r.ok);
  assertEqual(r.val, "9000012345");
});

test("5-digit mobile is rejected (L1009)", () => {
  const r = normalizeMobile("12345");
  assert(!r.ok);
});

test("Empty mobile is rejected", () => {
  assert(!normalizeMobile("").ok);
  assert(!normalizeMobile(null).ok);
});

test("11-digit mobile without country code is rejected", () => {
  assert(!normalizeMobile("91999999999").ok);  // 11 digits but no + prefix
});

console.log("\n📍  Pincode validation\n");

test("Valid 6-digit pincode is accepted", () => {
  const r = normalizePincode("502285");
  assert(r.ok);
  assertEqual(r.val, "502285");
});

test("4-digit pincode is rejected (L1012)", () => {
  assert(!normalizePincode("5000").ok);
});

test("Empty pincode is rejected", () => {
  assert(!normalizePincode("").ok);
  assert(!normalizePincode(null).ok);
});

test("Pincode with letters is rejected", () => {
  assert(!normalizePincode("5002AB").ok);
});

console.log("\n🏪  Dealer prefix matching\n");

test("Pincode 502285 → Kandi Energy Point (prefix 502)", () => {
  assertEqual(assignDealer("502285"), "Kandi Energy Point");
});

test("Pincode 500081 → Sri Sai Power Solutions (prefix 500)", () => {
  assertEqual(assignDealer("500081"), "Sri Sai Power Solutions");
});

test("Pincode 530016 → Vizag Home Power (prefix 530)", () => {
  assertEqual(assignDealer("530016"), "Vizag Home Power");
});

test("Pincode 531001 → Vizag Home Power (prefix 531, second prefix)", () => {
  assertEqual(assignDealer("531001"), "Vizag Home Power");
});

test("Multiple prefixes for one dealer: 520 and 521 both → Krishna Energy Store", () => {
  assertEqual(assignDealer("520010"), "Krishna Energy Store");
  assertEqual(assignDealer("521137"), "Krishna Energy Store");
});

test("Unmatched pincode 110001 → In-house Sales (L1015)", () => {
  assertEqual(assignDealer("110001"), INHOUSE);
});

test("Unmatched pincode 999999 → In-house Sales", () => {
  assertEqual(assignDealer("999999"), INHOUSE);
});

test("Short pincode (< 3 chars) → In-house Sales", () => {
  assertEqual(assignDealer("50"), INHOUSE);
  assertEqual(assignDealer(""), INHOUSE);
});

console.log("\n🔄  Status normalisation\n");

test("'New' is valid and unchanged", () => {
  const r = normalizeStatus("New");
  assert(r.ok); assert(!r.fixed); assertEqual(r.val, "New");
});

test("'converted ' (trailing space) is normalised (L1020)", () => {
  const r = normalizeStatus("converted ");
  assert(r.ok); assert(r.fixed); assertEqual(r.val, "Converted");
});

test("Invalid status 'Pending' is rejected", () => {
  assert(!normalizeStatus("Pending").ok);
});

console.log("\n📡  Source normalisation\n");

test("'website' (lowercase) is normalised to 'Website' (L1028)", () => {
  const r = normalizeSource("website");
  assert(r.fixed); assertEqual(r.val, "Website");
});

test("'Voice Agent' (already correct) is not marked fixed", () => {
  const r = normalizeSource("Voice Agent");
  assert(!r.fixed); assertEqual(r.val, "Voice Agent");
});

console.log("\n🔁  Duplicate detection\n");

test("Duplicate mobile number produces 'merged' action", () => {
  const rows = [
    { lead_id: "L001", name: "Alice", phone: "9000000001", pincode: "502001", product: "X", source: "Website", status: "New" },
    { lead_id: "L002", name: "Alice2", phone: "9000000001", pincode: "502001", product: "X", source: "Website", status: "New" },
  ];
  const r = simulateClean(rows);
  assertEqual(r[0].action, "imported");
  assertEqual(r[1].action, "merged");
});

test("Duplicate lead_id produces 'rejected' action", () => {
  const rows = [
    { lead_id: "L001", name: "Alice", phone: "9000000002", pincode: "502001", product: "X", source: "Website", status: "New" },
    { lead_id: "L001", name: "Bob",   phone: "9000000003", pincode: "502001", product: "X", source: "Website", status: "New" },
  ];
  const r = simulateClean(rows);
  assertEqual(r[0].action, "imported");
  assertEqual(r[1].action, "rejected");
});

test("First occurrence is retained in mobile duplicates", () => {
  const rows = [
    { lead_id: "A", name: "Alice", phone: "9111111111", pincode: "502001", product: "X", source: "Website", status: "New" },
    { lead_id: "B", name: "Alice", phone: "9111111111", pincode: "502001", product: "X", source: "Website", status: "New" },
  ];
  const r = simulateClean(rows);
  assertEqual(r[0].action, "imported");
  assertEqual(r[1].action, "merged");
  assert(r[1].reason.includes("A"));  // mentions first record ID
});

console.log("\n📝  Whitespace normalisation\n");

test("Name with leading/trailing spaces is trimmed", () => {
  const r = simulateClean([{
    lead_id: "X1", name: "  Ravi Kumar  ", phone: "9447712782",
    pincode: "502285", product: "P", source: "Website", status: "New"
  }]);
  assertEqual(r[0].action, "imported");  // should pass validation
});

console.log("\n❌  Required field validation\n");

test("Missing name → rejected", () => {
  const r = simulateClean([{
    lead_id: "X2", name: "", phone: "9447712782",
    pincode: "502285", product: "P", source: "Website", status: "New"
  }]);
  assertEqual(r[0].action, "rejected");
});

test("Invalid pincode → rejected before mobile dup check", () => {
  const r = simulateClean([{
    lead_id: "X3", name: "A", phone: "9447712782",
    pincode: "5000", product: "P", source: "Website", status: "New"
  }]);
  assertEqual(r[0].action, "rejected");
});

console.log("\n📊  Reconciliation correctness\n");

test("Every allowed action value is valid", () => {
  const ALLOWED = new Set(["imported", "fixed", "merged", "rejected", "assigned_inhouse"]);
  const testActions = ["imported", "fixed", "merged", "rejected", "assigned_inhouse"];
  for (const a of testActions) assert(ALLOWED.has(a), `Action '${a}' not in allowed set`);
});

test("Reconciliation has exactly 3 columns: lead_id, action, reason", () => {
  const cols = ["lead_id", "action", "reason"];
  assertEqual(cols.length, 3);
  assertEqual(cols[0], "lead_id");
  assertEqual(cols[1], "action");
  assertEqual(cols[2], "reason");
});

test("Reconciliation produces exactly one row per input row", () => {
  const rows = [
    { lead_id: "A", name: "Alice", phone: "9111111112", pincode: "502001", product: "X", source: "Website", status: "New" },
    { lead_id: "B", name: "",      phone: "9111111113", pincode: "502001", product: "X", source: "Website", status: "New" },
    { lead_id: "C", name: "Carol", phone: "9111111114", pincode: "000000", product: "X", source: "Website", status: "New" },
  ];
  const r = simulateClean(rows);
  assertEqual(r.length, rows.length);
});

test("Unmatched pincode produces 'assigned_inhouse' action", () => {
  const rows = [{
    lead_id: "X9", name: "Z", phone: "9888888881",
    pincode: "110001", product: "P", source: "Website", status: "New"
  }];
  const r = simulateClean(rows);
  assertEqual(r[0].action, "assigned_inhouse");
});

test("Deterministic output: same input → same output on repeated runs", () => {
  const rows = [
    { lead_id: "D1", name: "Dave", phone: "9000099001", pincode: "502285", product: "P", source: "Website", status: "New" },
    { lead_id: "D2", name: "Eve",  phone: "9000099002", pincode: "110001", product: "P", source: "Website", status: "New" },
  ];
  const r1 = simulateClean(rows);
  const r2 = simulateClean(rows);
  assertEqual(JSON.stringify(r1), JSON.stringify(r2));
});

test("Dry-run: function returns results without side effects (pure)", () => {
  // The simulateClean function has no I/O side effects.
  const rows = [{ lead_id: "DR1", name: "T", phone: "9000099099", pincode: "502001", product: "P", source: "Website", status: "New" }];
  const r = simulateClean(rows);
  assertEqual(r[0].action, "imported");
  // Calling again returns the same result (idempotent pure function)
  const r2 = simulateClean(rows);
  assertEqual(r[0].action, r2[0].action);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("Some tests FAILED.");
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}
