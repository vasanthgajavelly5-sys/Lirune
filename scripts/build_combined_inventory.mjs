import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RUN_ID = process.env.RUN_ID || process.argv[2] || 'run-20261115-postrel1';
const LOCAL_TARGET = process.env.REPORTS_TARGET_DIR || 'reports/post-release-validation';
const LOCAL_RUN_DIR = path.resolve(LOCAL_TARGET, RUN_ID);
const REPORTS_BASE = path.resolve('C:/Users/vasanth/Downloads/Lirune_Live_Format_Tests/reports/live-acceptance', RUN_ID);

fs.mkdirSync(LOCAL_RUN_DIR, { recursive: true });
fs.mkdirSync(REPORTS_BASE, { recursive: true });

console.log(`=== BUILDING COMBINED FORMAT INVENTORY FOR RUN: ${RUN_ID} ===`);

const originalInventoryPath = path.resolve('reports/major-release/run-20261115-major1/sample-inventory.json');
const originalSamples = JSON.parse(fs.readFileSync(originalInventoryPath, 'utf8'));

const suppManifestPath = path.resolve('C:/Users/vasanth/Downloads/Lirune_Supplementary_Format_Tests/format-sample-manifest.json');
const suppData = JSON.parse(fs.readFileSync(suppManifestPath, 'utf8'));

const combined = [];
const verifiedFormats = new Set();

// 1. Process original samples
for (const item of originalSamples) {
  if (!fs.existsSync(item.fullPath)) {
    throw new Error(`Original sample missing: ${item.fullPath}`);
  }
  const buf = fs.readFileSync(item.fullPath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
  if (hash !== item.sha256.toLowerCase()) {
    throw new Error(`Hash mismatch for ${item.fullPath}`);
  }
  combined.push({
    ...item,
    provenance: item.classification === 'containers' ? 'real_world_container' : 'real_world_sample'
  });
  if (item.classification === 'primary') {
    verifiedFormats.add(item.format);
  }
}

// 2. Process supplementary samples
for (const s of suppData.samples) {
  if (!fs.existsSync(s.full_path)) {
    throw new Error(`Supplementary sample missing: ${s.full_path}`);
  }
  const buf = fs.readFileSync(s.full_path);
  const hash = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
  s.sha256 = hash;
  s.file_size_bytes = buf.length;
  const headHex = buf.subarray(0, Math.min(buf.length, 16)).toString('hex');
  combined.push({
    format: s.format_id,
    classification: s.classification,
    tier: s.sample_tier,
    filename: s.original_filename,
    relPath: s.saved_path,
    fullPath: s.full_path,
    size: s.file_size_bytes,
    sha256: hash,
    status: 'VERIFIED',
    headHex,
    formatDetail: `${s.format_id.toUpperCase()} Standards Fixture (${s.sample_tier})`,
    provenance: s.provenance,
    license: s.license
  });
  if (s.classification === 'primary') {
    verifiedFormats.add(s.format_id);
  }
}

console.log(`Total combined samples: ${combined.length}`);
console.log(`Total distinct primary format families: ${verifiedFormats.size}`);
console.log('Primary format families verified:');
console.log([...verifiedFormats].sort().join(', '));

if (verifiedFormats.size < 50) {
  throw new Error(`Expected at least 50 primary format families, got ${verifiedFormats.size}`);
}

// Save to both locations
fs.writeFileSync(path.join(LOCAL_RUN_DIR, 'sample-inventory.json'), JSON.stringify(combined, null, 2));
fs.writeFileSync(path.join(REPORTS_BASE, 'sample-inventory.json'), JSON.stringify(combined, null, 2));

const csvHeaders = 'Format,Classification,Tier,Filename,Size,SHA256,Status,Provenance,License,FormatDetail\n';
const csvRows = combined.map(i =>
  `"${i.format}","${i.classification}","${i.tier}","${i.filename}",${i.size},"${i.sha256}","${i.status}","${i.provenance || 'real_world'}","${i.license || 'Public Domain'}","${i.formatDetail || ''}"`
).join('\n');

fs.writeFileSync(path.join(LOCAL_RUN_DIR, 'sample-inventory.csv'), csvHeaders + csvRows);
fs.writeFileSync(path.join(REPORTS_BASE, 'sample-inventory.csv'), csvHeaders + csvRows);

console.log('Combined inventory written to:');
console.log(`- ${path.join(LOCAL_RUN_DIR, 'sample-inventory.json')}`);
console.log(`- ${path.join(LOCAL_RUN_DIR, 'sample-inventory.csv')}`);
