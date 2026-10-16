/**
 * import_leads.js
 * ---------------
 * Imports cleaned legacy leads directly into the live Cloud Firestore database.
 * Uses Firestore REST API with the project's web API key.
 *
 * Run: node scripts/import_leads.js
 */

const fs   = require('fs');
const path = require('path');

const PROJECT_ID = 'purepower-leads';
const API_KEY    = 'AIzaSyC4odjBbJ1__t9RiBHi_hK6o-Mz2q1RRi8';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Dealer prefix mapping from dealers.csv
const PREFIX_MAP = {
  '500': 'Sri Sai Power Solutions',
  '502': 'Kandi Energy Point',
  '505': 'Karimnagar Solar Hub',
  '506': 'Warangal Green Systems',
  '517': 'Tirupati PowerHouse',
  '520': 'Krishna Energy Store',
  '521': 'Krishna Energy Store',
  '522': 'Guntur Battery World',
  '530': 'Vizag Home Power',
  '531': 'Vizag Home Power'
};

function assignDealer(pincode) {
  if (!pincode || pincode.length < 3) return 'In-house Sales';
  const prefix = pincode.substring(0, 3);
  return PREFIX_MAP[prefix] || 'In-house Sales';
}

function normalizeMobile(phone) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.substring(2);
  }
  return digits.length === 10 ? digits : null;
}

function normalizeStatus(s) {
  const map = {
    'new': 'New',
    'contacted': 'Contacted',
    'converted': 'Converted',
    'lost': 'Lost'
  };
  return map[(s || '').trim().toLowerCase()] || 'New';
}

function normalizeSource(s) {
  const map = {
    'website': 'Website',
    'ai voice call': 'AI Voice Call',
    'whatsapp': 'WhatsApp',
    'dealer walk-in': 'Dealer Walk-in',
    'voice agent': 'Voice Agent'
  };
  return map[(s || '').trim().toLowerCase()] || 'Website';
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const d = new Date(dateStr.trim());
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

// Simple CSV parser for legacy_leads.csv
function parseCsv(filepath) {
  const text = fs.readFileSync(filepath, 'utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const header = lines[0].split(',').map(c => c.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= header.length) {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h] = parts[idx] ? parts[idx].trim() : '';
      });
      rows.push(obj);
    }
  }
  return rows;
}

async function uploadLead(lead) {
  const url = `${BASE_URL}/leads/${lead.mobile}?key=${API_KEY}`;
  const body = {
    fields: {
      leadId:    { stringValue: lead.lead_id },
      name:      { stringValue: lead.name },
      mobile:    { stringValue: lead.mobile },
      pincode:   { stringValue: lead.pincode },
      product:   { stringValue: lead.product },
      source:    { stringValue: lead.source },
      dealer:    { stringValue: lead.dealer },
      status:    { stringValue: lead.status },
      createdOn: { timestampValue: lead.createdOn },
      updatedOn: { timestampValue: new Date().toISOString() }
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload ${lead.lead_id}: ${err}`);
  }
}

async function run() {
  console.log(`\n==================================================`);
  console.log(`  🚀 PuREPower Leads Live Importer`);
  console.log(`  Target Project: ${PROJECT_ID}`);
  console.log(`==================================================\n`);

  const rawRows = parseCsv(path.join(__dirname, '../data/legacy_leads.csv'));
  const reconRows = parseCsv(path.join(__dirname, '../reports/reconciliation.csv'));

  const reconMap = new Map();
  reconRows.forEach(r => reconMap.set(r.lead_id, r.action));

  const seenIds = new Set();
  const seenMobiles = new Set();
  let uploadedCount = 0;

  for (const raw of rawRows) {
    const action = reconMap.get(raw.lead_id);
    if (!action || action === 'rejected' || action === 'merged') {
      continue;
    }

    if (seenIds.has(raw.lead_id)) continue;
    seenIds.add(raw.lead_id);

    const mobile = normalizeMobile(raw.phone);
    if (!mobile || seenMobiles.has(mobile)) continue;
    seenMobiles.add(mobile);

    const lead = {
      lead_id:   raw.lead_id,
      name:      raw.name,
      mobile:    mobile,
      pincode:   raw.pincode,
      product:   raw.product || 'PuREPower Home 5kWh',
      source:    normalizeSource(raw.source),
      dealer:    assignDealer(raw.pincode),
      status:    normalizeStatus(raw.status),
      createdOn: parseDate(raw.created_on)
    };

    try {
      await uploadLead(lead);
      uploadedCount++;
      console.log(`  ✓ [${lead.lead_id}] ${lead.name.padEnd(16)} | ${lead.mobile} | Pincode ${lead.pincode} → ${lead.dealer}`);
    } catch (e) {
      console.error(`  ✗ [${lead.lead_id}] Error: ${e.message}`);
    }
  }

  console.log(`\n==================================================`);
  console.log(`  🎉 Successfully imported ${uploadedCount} leads to Firestore!`);
  console.log(`  🌐 Check your live dashboard: https://purepower-leads.web.app`);
  console.log(`==================================================\n`);
}

run().catch(console.error);
