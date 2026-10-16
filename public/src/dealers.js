/**
 * dealers.js
 * ----------
 * Loads the dealer list and implements the pincode-prefix matching logic.
 *
 * Assignment rules implemented here:
 *  1. Pincodes are treated as strings.
 *  2. The first three characters of the pincode form the "prefix".
 *  3. Each dealer may have multiple prefixes separated by "|".
 *  4. Whitespace around prefixes is trimmed.
 *  5. Empty or malformed prefixes are skipped.
 *  6. If no dealer matches, the lead is assigned to "In-house Sales".
 *  7. If multiple dealers match the same prefix (overlap), the dealer that
 *     appears first in the list (lowest dealer_id alphabetically) is chosen.
 *     This policy is deterministic and is documented here.
 *
 * The dealer list is embedded here rather than fetched at runtime to keep the
 * app compatible with the Firebase Spark (free) plan and to avoid a network
 * round-trip on every lead creation.  If the dealer list needs to be managed
 * dynamically, move it to a Firestore collection and add a read rule for
 * authenticated users.
 */

/**
 * Dealer records derived directly from data/dealers.csv.
 * Do NOT invent or alter dealer names or prefixes.
 */
export const DEALERS = [
  { id: "D01", name: "Sri Sai Power Solutions",  city: "Hyderabad",     prefixes: ["500"] },
  { id: "D02", name: "Kandi Energy Point",        city: "Sangareddy",    prefixes: ["502"] },
  { id: "D03", name: "Warangal Green Systems",    city: "Warangal",      prefixes: ["506"] },
  { id: "D04", name: "Karimnagar Solar Hub",      city: "Karimnagar",    prefixes: ["505"] },
  { id: "D05", name: "Vizag Home Power",          city: "Visakhapatnam", prefixes: ["530", "531"] },
  { id: "D06", name: "Krishna Energy Store",      city: "Vijayawada",    prefixes: ["520", "521"] },
  { id: "D07", name: "Guntur Battery World",      city: "Guntur",        prefixes: ["522"] },
  { id: "D08", name: "Tirupati PowerHouse",       city: "Tirupati",      prefixes: ["517"] }
];

export const INHOUSE_DEALER = "In-house Sales";

/**
 * Builds a prefix → dealer map from the DEALERS list.
 * If two dealers share a prefix (overlap), the one that appears first in the
 * DEALERS array wins.  This makes the assignment deterministic and auditable.
 *
 * @returns {Map<string, string>} prefix → dealer name
 */
function buildPrefixMap() {
  const map = new Map();
  for (const dealer of DEALERS) {
    for (const prefix of dealer.prefixes) {
      const trimmed = prefix.trim();
      if (!trimmed) continue; // skip empty tokens
      if (!map.has(trimmed)) {
        // First dealer wins in case of overlap.
        map.set(trimmed, dealer.name);
      }
    }
  }
  return map;
}

// Build the map once at module load time.
const PREFIX_MAP = buildPrefixMap();

/**
 * Assigns a dealer to a lead based on the first three digits of the pincode.
 *
 * @param {string} pincode - A 6-digit pincode string.
 * @returns {string} Dealer name, or "In-house Sales" if no match.
 */
export function assignDealer(pincode) {
  if (typeof pincode !== "string" || pincode.length < 3) {
    return INHOUSE_DEALER;
  }
  const prefix = pincode.substring(0, 3);
  return PREFIX_MAP.get(prefix) ?? INHOUSE_DEALER;
}

/**
 * Returns the full dealer object for a given dealer name, or null.
 * Useful for displaying dealer contact information.
 *
 * @param {string} name
 * @returns {Object|null}
 */
export function getDealerByName(name) {
  return DEALERS.find(d => d.name === name) ?? null;
}
