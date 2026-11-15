const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catPath = path.join(root, 'format-catalogue.json');
const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));

const outDir = path.join(root, 'reports', 'final-release-completion', 'run-20261115-final1');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// 1. Build canonical-format-catalogue.csv
// Columns: id,name,category,extensions,aliases,classification,windowsAdapter,androidAdapter,windowsStatus,androidStatus,eligibleFor50Plus,notes

const canonicalRows = [];
canonicalRows.push([
  'id',
  'name',
  'category',
  'extensions',
  'aliases',
  'classification',
  'windowsAdapter',
  'androidAdapter',
  'windowsStatus',
  'androidStatus',
  'eligibleFor50Plus',
  'notes'
].join(','));

const allFamilies = [
  ...cat.primaryFormatFamilies,
  ...cat.extendedFormatFamilies,
  ...cat.partialFormatFamilies,
  ...cat.containerCapabilities
];

for (const f of allFamilies) {
  const id = f.id;
  const name = f.displayName;
  const category = f.category;
  const extensions = (f.extensions || []).join(';');
  const aliases = (f.aliases || []).join(';');
  const classification = f.classification;
  
  let windowsAdapter = f.adapters?.windows || '';
  let androidAdapter = f.adapters?.android || '';
  let windowsStatus = 'NONE';
  let androidStatus = 'NONE';
  let eligibleFor50Plus = 'FALSE';
  let notes = '';

  if (classification === 'primary') {
    windowsStatus = 'FULL';
    androidStatus = 'FULL';
    eligibleFor50Plus = (windowsAdapter && androidAdapter) ? 'TRUE' : 'FALSE';
    notes = f.knownLimitations ? `Primary canonical family. ${f.knownLimitations}` : 'Primary canonical format family; full parity on Windows and Android.';
  } else if (classification === 'extended') {
    windowsStatus = 'FULL';
    androidStatus = 'FULL';
    eligibleFor50Plus = 'FALSE';
    notes = 'Extended format family fully supported but excluded from canonical 50+ primary claim count.';
  } else if (classification === 'partial') {
    windowsStatus = 'PARTIAL';
    androidStatus = 'PARTIAL';
    eligibleFor50Plus = 'FALSE';
    const sub = f.platformStatus?.windows || 'partial';
    notes = `Partial format family (${sub}); non-qualifying for 50+ claim. ${f.knownLimitations || ''}`.trim();
  } else if (classification === 'container') {
    windowsStatus = 'NONE';
    androidStatus = 'NONE';
    eligibleFor50Plus = 'FALSE';
    windowsAdapter = '';
    androidAdapter = '';
    notes = f.purpose || 'Container capability inspected during import; not an individual book reader format.';
  }

  canonicalRows.push([
    escapeCsv(id),
    escapeCsv(name),
    escapeCsv(category),
    escapeCsv(extensions),
    escapeCsv(aliases),
    escapeCsv(classification),
    escapeCsv(windowsAdapter),
    escapeCsv(androidAdapter),
    escapeCsv(windowsStatus),
    escapeCsv(androidStatus),
    escapeCsv(eligibleFor50Plus),
    escapeCsv(notes)
  ].join(','));
}

fs.writeFileSync(path.join(outDir, 'canonical-format-catalogue.csv'), canonicalRows.join('\n'), 'utf8');
console.log('Wrote canonical-format-catalogue.csv');

// 2. Build 50-plus-eligibility-matrix.csv
// Columns: rank,id,name,category,windowsStatus,androidStatus,eligibleForClaim,exclusionReason
// Sort: eligible FULL formats first (ranked 1-N), then partial, then containers.

const matrixRows = [];
matrixRows.push([
  'rank',
  'id',
  'name',
  'category',
  'windowsStatus',
  'androidStatus',
  'eligibleForClaim',
  'exclusionReason'
].join(','));

let rank = 1;
// Primary (eligible FULL)
for (const f of cat.primaryFormatFamilies) {
  matrixRows.push([
    rank++,
    escapeCsv(f.id),
    escapeCsv(f.displayName),
    escapeCsv(f.category),
    'FULL',
    'FULL',
    'TRUE',
    'None (Eligible Primary Format)'
  ].join(','));
}

// Extended (Full support, but outside 50 primary canonical scope)
for (const f of cat.extendedFormatFamilies) {
  matrixRows.push([
    '-',
    escapeCsv(f.id),
    escapeCsv(f.displayName),
    escapeCsv(f.category),
    'FULL',
    'FULL',
    'FALSE',
    'Extended format family outside canonical 50 primary scope'
  ].join(','));
}

// Partial
for (const f of cat.partialFormatFamilies) {
  matrixRows.push([
    '-',
    escapeCsv(f.id),
    escapeCsv(f.displayName),
    escapeCsv(f.category),
    'PARTIAL',
    'PARTIAL',
    'FALSE',
    `Partial support only (${f.platformStatus?.windows || 'preview/extraction only'})`
  ].join(','));
}

// Container
for (const f of cat.containerCapabilities) {
  matrixRows.push([
    '-',
    escapeCsv(f.id),
    escapeCsv(f.displayName),
    escapeCsv(f.category),
    'NONE',
    'NONE',
    'FALSE',
    'Container archive capability, not a document reader family'
  ].join(','));
}

fs.writeFileSync(path.join(outDir, '50-plus-eligibility-matrix.csv'), matrixRows.join('\n'), 'utf8');
console.log('Wrote 50-plus-eligibility-matrix.csv');
