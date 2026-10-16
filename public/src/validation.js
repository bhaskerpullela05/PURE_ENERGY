/**
 * validation.js
 * -------------
 * Pure functions that validate lead form fields.
 * No Firebase dependency – can be unit-tested in isolation.
 *
 * All functions return { valid: boolean, error: string }.
 */

/**
 * Strips all whitespace from a mobile number string and returns only the
 * digits and a leading '+' if present.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeMobile(raw) {
  if (typeof raw !== "string") return "";
  // Remove spaces, dashes. Keep digits and leading +.
  return raw.replace(/[\s\-]/g, "");
}

/**
 * Converts a normalized mobile string (+91XXXXXXXXXX or XXXXXXXXXX) to a
 * plain 10-digit number string.  Returns null if it cannot be reduced.
 * @param {string} normalized
 * @returns {string|null}
 */
export function extractTenDigits(normalized) {
  // Remove country code +91 or 0
  let digits = normalized.replace(/^\+91/, "").replace(/^0/, "");
  if (/^\d{10}$/.test(digits)) return digits;
  return null;
}

/**
 * Validates that a mobile number is exactly 10 digits after normalization.
 * @param {string} raw
 * @returns {{ valid: boolean, error: string, normalized: string|null }}
 */
export function validateMobile(raw) {
  const stripped = normalizeMobile(raw);
  const tenDigits = extractTenDigits(stripped);
  if (!tenDigits) {
    return {
      valid:      false,
      error:      "Mobile number must be exactly 10 digits.",
      normalized: null
    };
  }
  return { valid: true, error: "", normalized: tenDigits };
}

/**
 * Validates that a pincode is exactly 6 digits.
 * Pincodes are stored as strings, never as numbers.
 * @param {string} raw
 * @returns {{ valid: boolean, error: string, normalized: string|null }}
 */
export function validatePincode(raw) {
  const trimmed = String(raw || "").trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return {
      valid:      false,
      error:      "Pincode must be exactly 6 digits.",
      normalized: null
    };
  }
  return { valid: true, error: "", normalized: trimmed };
}

/**
 * Validates that a name is non-empty after whitespace trimming.
 * @param {string} raw
 * @returns {{ valid: boolean, error: string, normalized: string|null }}
 */
export function validateName(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { valid: false, error: "Name is required.", normalized: null };
  }
  return { valid: true, error: "", normalized: trimmed };
}

/**
 * Validates that a product field is non-empty.
 * @param {string} raw
 * @returns {{ valid: boolean, error: string, normalized: string|null }}
 */
export function validateProduct(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { valid: false, error: "Product is required.", normalized: null };
  }
  return { valid: true, error: "", normalized: trimmed };
}

/**
 * Allowed lead source values.
 */
export const VALID_SOURCES = [
  "Website",
  "AI Voice Call",
  "WhatsApp",
  "Dealer Walk-in",
  "Voice Agent"
];

/**
 * Allowed lead status values.
 */
export const VALID_STATUSES = ["New", "Contacted", "Converted", "Lost"];

/**
 * Validates that a source value is one of the allowed values.
 * @param {string} raw
 * @returns {{ valid: boolean, error: string }}
 */
export function validateSource(raw) {
  if (!VALID_SOURCES.includes(raw)) {
    return { valid: false, error: `Source must be one of: ${VALID_SOURCES.join(", ")}` };
  }
  return { valid: true, error: "" };
}

/**
 * Validates all lead form fields together.
 * Returns an object with a cleaned lead payload (if valid) or field errors.
 *
 * @param {{ name, mobile, pincode, product, source }} fields
 * @returns {{ valid: boolean, errors: Object, cleaned: Object|null }}
 */
export function validateLeadForm(fields) {
  const errors = {};

  const nameResult    = validateName(fields.name);
  const mobileResult  = validateMobile(fields.mobile);
  const pincodeResult = validatePincode(fields.pincode);
  const productResult = validateProduct(fields.product);
  const sourceResult  = validateSource(fields.source);

  if (!nameResult.valid)    errors.name    = nameResult.error;
  if (!mobileResult.valid)  errors.mobile  = mobileResult.error;
  if (!pincodeResult.valid) errors.pincode = pincodeResult.error;
  if (!productResult.valid) errors.product = productResult.error;
  if (!sourceResult.valid)  errors.source  = sourceResult.error;

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, cleaned: null };
  }

  return {
    valid: true,
    errors: {},
    cleaned: {
      name:    nameResult.normalized,
      mobile:  mobileResult.normalized,
      pincode: pincodeResult.normalized,
      product: productResult.normalized,
      source:  fields.source
    }
  };
}
