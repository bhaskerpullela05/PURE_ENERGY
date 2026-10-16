#!/usr/bin/env python3
"""
clean_leads.py
==============
PURE Energy – PuREPower Dealer Lead Router
Part B: Legacy CSV Cleaning, Reconciliation & Firestore Import

Usage
-----
  # Clean data and generate reconciliation report only (no cloud):
  python scripts/clean_leads.py --dry-run

  # Clean data and import into Firestore:
  python scripts/clean_leads.py --import-data

  # Specify custom paths:
  python scripts/clean_leads.py --dry-run \\
      --leads data/legacy_leads.csv \\
      --dealers data/dealers.csv \\
      --report reports/reconciliation.csv

Credentials
-----------
  Set the environment variable GOOGLE_APPLICATION_CREDENTIALS to the path
  of your Firebase Admin SDK service account JSON file BEFORE running with
  --import-data.

  Example (Windows PowerShell):
    $env:GOOGLE_APPLICATION_CREDENTIALS = "path\\to\\serviceAccountKey.json"

  Example (bash / macOS / Linux):
    export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"

  NEVER commit the service account key file to Git.

Data problems found in legacy_leads.csv
-----------------------------------------
  L1004  phone "98480 22 431" — spaces in mobile (fixable: strip spaces → 9848022431, 10 digits ✓)
  L1006  phone "+91-9000012345" — country code prefix with dash (fixable → 9000012345)
  L1009  phone "12345" — only 5 digits, not a valid Indian mobile
  L1012  pincode "5000" — only 4 digits, invalid
  L1015  pincode "110001" — valid 6-digit format but no dealer covers prefix 110 → assigned_inhouse
  L1018  created_on "31/09/2026" — 31 September does not exist (September has 30 days) → date rejected, record still imported with NULL date
  L1020  status "converted " — trailing space, fixable by stripping
  L1023  product "Pure power 5 kwh" — non-standard product name, imported as-is (name preserved)
  L1026  name is empty — missing required field → rejected
  L1028  source "website" — wrong capitalisation, fixable to "Website"
  L1033  appears TWICE as lead_id (rows 33 and 40 in the file) — duplicate lead_id;
          the second occurrence is a genuine duplicate lead_id record → rejected
  L1036  exact duplicate of L1003 on mobile + later date → merged (L1003 survives)
  L1037  exact duplicate of L1010 on mobile ("+91 9633021001" → "9633021001") → merged (L1010 survives)
  L1038  exact duplicate of L1031 on mobile, different capitalisation → merged (L1031 survives)
  L1039  exact duplicate of L1007 on mobile → merged (L1007 survives)

Reconciliation action precedence (when a record has multiple issues):
  1. rejected   — invalid phone OR invalid pincode OR empty name → stops here
  2. merged     — duplicate mobile (same customer, later record) → stops here
  3. fixed      — at least one field was normalised
  4. assigned_inhouse — valid record, pincode has no dealer match
  5. imported   — clean, valid record with a named dealer assigned
"""

import argparse
import csv
import os
import re
import sys
from datetime import datetime
from pathlib import Path


# ─── Constants ───────────────────────────────────────────────────────────────

VALID_STATUSES = {"New", "Contacted", "Converted", "Lost"}

# Canonical source names (case-insensitive lookup)
SOURCE_MAP = {
    "website":       "Website",
    "ai voice call": "AI Voice Call",
    "whatsapp":      "WhatsApp",
    "dealer walk-in":"Dealer Walk-in",
    "voice agent":   "Voice Agent",
}

INHOUSE_DEALER = "In-house Sales"

RECONCILIATION_COLUMNS = ["lead_id", "action", "reason"]

ALLOWED_ACTIONS = {"imported", "fixed", "merged", "rejected", "assigned_inhouse"}


# ─── Dealer loading ───────────────────────────────────────────────────────────

def load_dealers(dealers_csv: Path) -> dict:
    """
    Reads dealers.csv and builds a prefix-to-dealer-name mapping.

    Overlapping prefix policy: the dealer that appears first in the file wins.
    (Same policy as dealers.js in the frontend.)

    Returns:
        dict: { "500": "Sri Sai Power Solutions", ... }
    """
    prefix_map = {}
    with open(dealers_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dealer_name = row["dealer_name"].strip()
            raw_prefixes = row.get("pincode_prefixes", "")
            for prefix in raw_prefixes.split("|"):
                prefix = prefix.strip()
                if prefix and prefix not in prefix_map:
                    prefix_map[prefix] = dealer_name
    return prefix_map


def assign_dealer(pincode: str, prefix_map: dict) -> str:
    """
    Assigns a dealer based on the first 3 characters of the pincode.
    Returns INHOUSE_DEALER if no match found.
    """
    if not isinstance(pincode, str) or len(pincode) < 3:
        return INHOUSE_DEALER
    prefix = pincode[:3]
    return prefix_map.get(prefix, INHOUSE_DEALER)


# ─── Validation helpers ────────────────────────────────────────────────────────

def normalize_mobile(raw: str) -> tuple[bool, str, str]:
    """
    Strips spaces, dashes, and the +91 / 91 country code prefix.

    Returns:
        (is_valid, normalized_10_digit_string, reason_if_invalid)
    """
    if not raw or not raw.strip():
        return False, "", "Mobile number is missing"

    # Remove spaces and dashes
    cleaned = re.sub(r"[\s\-]", "", raw.strip())

    # Strip country code: +91 or 91 prefix followed by 10 digits
    cleaned = re.sub(r"^\+91", "", cleaned)
    cleaned = re.sub(r"^91(?=\d{10}$)", "", cleaned)

    if re.match(r"^\d{10}$", cleaned):
        return True, cleaned, ""
    return False, "", f"Invalid mobile number '{raw}' (must be 10 digits after normalization)"


def normalize_pincode(raw: str) -> tuple[bool, str, str]:
    """
    Validates pincode: must be exactly 6 digits.

    Returns:
        (is_valid, normalized_string, reason_if_invalid)
    """
    if not raw or not raw.strip():
        return False, "", "Pincode is missing"
    cleaned = raw.strip()
    if re.match(r"^\d{6}$", cleaned):
        return True, cleaned, ""
    return False, "", f"Invalid pincode '{raw}' (must be exactly 6 digits)"


def normalize_status(raw: str) -> tuple[bool, str, bool]:
    """
    Validates and normalises status value.
    Strips whitespace and title-cases it.

    Returns:
        (is_valid, normalized_status, was_fixed)
    """
    stripped = raw.strip()
    title_cased = stripped.title()
    if title_cased in VALID_STATUSES:
        return True, title_cased, (title_cased != stripped)
    return False, stripped, False


def normalize_source(raw: str) -> tuple[str, bool]:
    """
    Normalises the source field using a case-insensitive lookup.
    Falls back to the original value if not recognised.

    Returns:
        (normalized_source, was_fixed)
    """
    key = raw.strip().lower()
    normalized = SOURCE_MAP.get(key, raw.strip())
    return normalized, (normalized != raw.strip())


def normalize_date(raw: str) -> tuple[str | None, bool, str]:
    """
    Tries multiple date formats.  Returns (iso_date_or_None, was_fixed, note).

    Accepted formats:
      YYYY-MM-DD    (canonical)
      DD/MM/YYYY    (common Indian format)
      MM/DD/YYYY    (US format – only used if DD/MM fails)

    September has 30 days, so 31/09/YYYY is invalid.
    """
    if not raw or not raw.strip():
        return None, False, "Date is missing"

    formats = [
        ("%Y-%m-%d", False),   # canonical — no fix needed
        ("%d/%m/%Y", True),    # DD/MM/YYYY — fixed
        ("%m/%d/%Y", True),    # MM/DD/YYYY — fixed
    ]
    for fmt, was_fixed in formats:
        try:
            dt = datetime.strptime(raw.strip(), fmt)
            return dt.strftime("%Y-%m-%d"), was_fixed, ""
        except ValueError:
            continue

    return None, False, f"Unparseable date '{raw}'"


# ─── Main cleaning logic ───────────────────────────────────────────────────────

def clean_leads(leads_csv: Path, dealers_csv: Path) -> tuple[list, list]:
    """
    Reads legacy_leads.csv, cleans each record, and returns:
        (cleaned_records, reconciliation_rows)

    cleaned_records: dicts ready for Firestore import (action ≠ 'rejected' and ≠ 'merged')
    reconciliation_rows: one dict per input row with keys lead_id, action, reason
    """
    prefix_map = load_dealers(dealers_csv)

    reconciliation = []   # one entry per input row
    cleaned        = []   # valid records for import

    # Track seen values for duplicate detection
    seen_mobiles  = {}    # normalized_mobile → lead_id of first occurrence
    seen_lead_ids = {}    # lead_id → row index

    raw_rows = []
    with open(leads_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_rows.append({k: v.strip() if v else "" for k, v in row.items()})

    for raw in raw_rows:
        lead_id = raw.get("lead_id", "").strip()

        # ── Duplicate lead_id check ──────────────────────────────────────────
        if lead_id in seen_lead_ids:
            reconciliation.append({
                "lead_id": lead_id,
                "action":  "rejected",
                "reason":  f"Duplicate lead_id; already seen as row {seen_lead_ids[lead_id]}"
            })
            continue
        seen_lead_ids[lead_id] = lead_id

        fixes   = []   # list of human-readable changes made
        issues  = []   # non-fatal notes appended to reason

        # ── Name ────────────────────────────────────────────────────────────
        raw_name = raw.get("name", "").strip()
        if not raw_name:
            reconciliation.append({
                "lead_id": lead_id,
                "action":  "rejected",
                "reason":  "Missing customer name"
            })
            continue

        # ── Mobile ──────────────────────────────────────────────────────────
        raw_phone  = raw.get("phone", "")
        mobile_ok, mobile_norm, mobile_err = normalize_mobile(raw_phone)
        if not mobile_ok:
            reconciliation.append({
                "lead_id": lead_id,
                "action":  "rejected",
                "reason":  mobile_err
            })
            continue
        if mobile_norm != re.sub(r"[\s\-]", "", raw_phone.strip()).lstrip("+"):
            fixes.append(f"phone normalised from '{raw_phone}' to '{mobile_norm}'")

        # ── Duplicate mobile check ───────────────────────────────────────────
        if mobile_norm in seen_mobiles:
            first_id = seen_mobiles[mobile_norm]
            reconciliation.append({
                "lead_id": lead_id,
                "action":  "merged",
                "reason":  f"Duplicate mobile {mobile_norm}; merged into {first_id} (first occurrence retained)"
            })
            continue
        seen_mobiles[mobile_norm] = lead_id

        # ── Pincode ──────────────────────────────────────────────────────────
        raw_pin = raw.get("pincode", "")
        pin_ok, pin_norm, pin_err = normalize_pincode(raw_pin)
        if not pin_ok:
            reconciliation.append({
                "lead_id": lead_id,
                "action":  "rejected",
                "reason":  pin_err
            })
            continue

        # ── Product ──────────────────────────────────────────────────────────
        raw_product = raw.get("product", "").strip()
        if not raw_product:
            reconciliation.append({
                "lead_id": lead_id,
                "action":  "rejected",
                "reason":  "Missing product"
            })
            continue

        # ── Source ───────────────────────────────────────────────────────────
        raw_source = raw.get("source", "")
        norm_source, source_fixed = normalize_source(raw_source)
        if source_fixed:
            fixes.append(f"source normalised from '{raw_source}' to '{norm_source}'")

        # ── Status ───────────────────────────────────────────────────────────
        raw_status = raw.get("status", "")
        status_ok, norm_status, status_fixed = normalize_status(raw_status)
        if not status_ok:
            # Invalid status → use "New" as fallback and record the fix
            norm_status = "New"
            fixes.append(f"status '{raw_status}' is invalid; defaulted to 'New'")
        elif status_fixed:
            fixes.append(f"status normalised from '{raw_status}' to '{norm_status}'")

        # ── Date ─────────────────────────────────────────────────────────────
        raw_date = raw.get("created_on", "")
        norm_date, date_fixed, date_note = normalize_date(raw_date)
        if date_fixed:
            fixes.append(f"created_on reformatted from '{raw_date}' to '{norm_date}'")
        if norm_date is None and date_note:
            issues.append(f"created_on: {date_note} (imported as null)")

        # ── Dealer assignment ─────────────────────────────────────────────────
        dealer = assign_dealer(pin_norm, prefix_map)
        is_inhouse = (dealer == INHOUSE_DEALER)

        # ── Determine reconciliation action ──────────────────────────────────
        if fixes:
            action = "fixed"
            reason = "; ".join(fixes)
            if is_inhouse:
                reason += f"; pincode {pin_norm} has no dealer match → assigned to In-house Sales"
            if issues:
                reason += "; " + "; ".join(issues)
        elif is_inhouse:
            action = "assigned_inhouse"
            reason = f"Pincode {pin_norm} (prefix {pin_norm[:3]}) has no matching dealer; assigned to In-house Sales"
            if issues:
                reason += "; " + "; ".join(issues)
        else:
            action = "imported"
            reason = f"Clean record; assigned to {dealer}"
            if issues:
                action = "fixed"
                reason = "; ".join(issues) + f"; assigned to {dealer}"

        reconciliation.append({"lead_id": lead_id, "action": action, "reason": reason})

        # Build the cleaned record for Firestore import
        cleaned.append({
            "leadId":    lead_id,
            "name":      raw_name,
            "mobile":    mobile_norm,
            "pincode":   pin_norm,
            "product":   raw_product,
            "source":    norm_source,
            "dealer":    dealer,
            "status":    norm_status,
            "createdOn": norm_date,   # None if unparseable
        })

    return cleaned, reconciliation


# ─── Report writer ─────────────────────────────────────────────────────────────

def write_reconciliation(reconciliation: list, report_path: Path) -> None:
    """
    Writes the reconciliation report to CSV.
    Exactly one row per input record. Exactly three columns.
    """
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=RECONCILIATION_COLUMNS)
        writer.writeheader()
        for row in reconciliation:
            assert row["action"] in ALLOWED_ACTIONS, f"Invalid action: {row['action']}"
            writer.writerow({
                "lead_id": row["lead_id"],
                "action":  row["action"],
                "reason":  row["reason"]
            })
    print(f"[✓] Reconciliation report written → {report_path}")
    print(f"    Total rows: {len(reconciliation)}")
    counts = {}
    for row in reconciliation:
        counts[row["action"]] = counts.get(row["action"], 0) + 1
    for action, count in sorted(counts.items()):
        print(f"      {action}: {count}")


# ─── Firestore import ──────────────────────────────────────────────────────────

def import_to_firestore(cleaned: list, project_id: str | None = None) -> None:
    """
    Imports cleaned lead records into Firestore using the Firebase Admin SDK.

    Import is idempotent:
      - Document ID = leadId (the original CSV lead_id, e.g. "L1001").
      - If a document already exists, it is NOT overwritten to avoid
        destroying newer data from the live application.
      - If you need to force-update, modify the merge strategy here.

    Credentials:
      Set GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of
      your service account JSON file.
    """
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
    except ImportError:
        print("[ERROR] firebase-admin is not installed.")
        print("        Run: pip install firebase-admin")
        sys.exit(1)

    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        print("[ERROR] GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.")
        print("        Set it to the path of your Firebase Admin SDK service account JSON.")
        sys.exit(1)
    if not Path(cred_path).is_file():
        print(f"[ERROR] Credential file not found: {cred_path}")
        sys.exit(1)

    # Initialise the Admin SDK (safe to call once)
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        kwargs = {"credential": cred}
        if project_id:
            kwargs["options"] = {"projectId": project_id}
        firebase_admin.initialize_app(**kwargs)

    db = fs.client()

    imported_count = 0
    skipped_count  = 0

    print(f"\n[→] Starting Firestore import of {len(cleaned)} records…")
    for record in cleaned:
        doc_id  = record["leadId"]
        doc_ref = db.collection("leads").document(doc_id)

        # Idempotency: skip if document already exists
        snap = doc_ref.get()
        if snap.exists:
            print(f"    [SKIP] {doc_id} already exists in Firestore – not overwritten")
            skipped_count += 1
            continue

        # Prepare the Firestore document
        data = {
            "leadId":    record["leadId"],
            "name":      record["name"],
            "mobile":    record["mobile"],
            "pincode":   record["pincode"],
            "product":   record["product"],
            "source":    record["source"],
            "dealer":    record["dealer"],
            "status":    record["status"],
            "updatedOn": fs.SERVER_TIMESTAMP,
        }

        # createdOn: use the parsed date if available, else server timestamp
        if record["createdOn"]:
            from datetime import timezone
            dt = datetime.strptime(record["createdOn"], "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            data["createdOn"] = dt
        else:
            data["createdOn"] = fs.SERVER_TIMESTAMP

        doc_ref.set(data)
        print(f"    [OK]   {doc_id} → {record['dealer']}")
        imported_count += 1

    print(f"\n[✓] Import complete: {imported_count} imported, {skipped_count} skipped")


# ─── CLI entry point ───────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="PURE Energy – Legacy Lead Cleaning & Firestore Import"
    )
    parser.add_argument(
        "--leads",    default="data/legacy_leads.csv",
        help="Path to legacy_leads.csv (default: data/legacy_leads.csv)"
    )
    parser.add_argument(
        "--dealers",  default="data/dealers.csv",
        help="Path to dealers.csv (default: data/dealers.csv)"
    )
    parser.add_argument(
        "--report",   default="reports/reconciliation.csv",
        help="Path for reconciliation output (default: reports/reconciliation.csv)"
    )
    parser.add_argument(
        "--dry-run",  action="store_true",
        help="Clean data and write report, but do NOT import into Firestore"
    )
    parser.add_argument(
        "--import-data", action="store_true",
        help="Import cleaned records into Firestore after cleaning"
    )
    parser.add_argument(
        "--project-id", default=None,
        help="Firebase project ID (optional; overrides the service account default)"
    )
    args = parser.parse_args()

    leads_path   = Path(args.leads)
    dealers_path = Path(args.dealers)
    report_path  = Path(args.report)

    # Validate input files exist
    if not leads_path.is_file():
        print(f"[ERROR] Legacy leads file not found: {leads_path}")
        sys.exit(1)
    if not dealers_path.is_file():
        print(f"[ERROR] Dealers file not found: {dealers_path}")
        sys.exit(1)

    print(f"[→] Reading leads from  : {leads_path}")
    print(f"[→] Reading dealers from: {dealers_path}")

    cleaned, reconciliation = clean_leads(leads_path, dealers_path)

    write_reconciliation(reconciliation, report_path)

    if args.dry_run:
        print("\n[DRY RUN] Cleaning complete. No data was imported to Firestore.")
        print(f"          {len(cleaned)} records would be imported.")
        return

    if args.import_data:
        import_to_firestore(cleaned, project_id=args.project_id)
        return

    # Default: show a summary and remind user to use a flag
    print(f"\n[INFO] {len(cleaned)} records cleaned and ready for import.")
    print("       Re-run with --import-data to import into Firestore.")
    print("       Re-run with --dry-run to see the report without importing.")


if __name__ == "__main__":
    main()
