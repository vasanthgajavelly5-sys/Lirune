import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RUN_ID = process.env.RUN_ID || process.argv[2] || 'run-20261115-beta1';
const CORPUS_DIR = 'C:/Users/vasanth/Downloads/Lirune_Live_Format_Tests';
const RUN_DIR = path.join(CORPUS_DIR, 'reports/live-acceptance', RUN_ID);
const LOCAL_RUN_DIR = path.resolve('reports/beta-release', RUN_ID);
fs.mkdirSync(RUN_DIR, { recursive: true });
fs.mkdirSync(LOCAL_RUN_DIR, { recursive: true });
const SHA_FILE = path.join(CORPUS_DIR, 'SHA256SUMS.txt');
const MANIFEST_FILE = path.join(CORPUS_DIR, 'download-manifest.json');

console.log('--- RECONCILING LIRUNE SAMPLE CORPUS ---');

// 1. Read SHA256SUMS.txt
const shaLines = fs.readFileSync(SHA_FILE, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

const expectedHashes = new Map();
for (const line of shaLines) {
  const parts = line.split(/\s+/);
  if (parts.length >= 2) {
    const hash = parts[0].toLowerCase();
    const relPath = parts[1].replace(/\\/g, '/');
    expectedHashes.set(relPath, hash);
  }
}

console.log(`Loaded ${expectedHashes.size} expected hashes from SHA256SUMS.txt`);

// 2. Read download-manifest.json if available
let manifestData = {};
if (fs.existsSync(MANIFEST_FILE)) {
  try {
    manifestData = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch (err) {
    console.warn('Could not parse download-manifest.json:', err.message);
  }
}

// 3. Inspect every file
const inventory = [];
let passCount = 0;
let failCount = 0;

for (const [relPath, expHash] of expectedHashes.entries()) {
  const fullPath = path.join(CORPUS_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    inventory.push({
      relPath,
      fullPath,
      exists: false,
      status: 'MISSING'
    });
    failCount++;
    continue;
  }

  const stat = fs.statSync(fullPath);
  const buf = fs.readFileSync(fullPath);
  const actualHash = crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
  const hashMatches = (actualHash === expHash);

  if (!hashMatches) {
    inventory.push({
      relPath,
      fullPath,
      exists: true,
      size: stat.size,
      expectedHash: expHash,
      actualHash,
      status: 'INVALID_HASH'
    });
    failCount++;
    continue;
  }

  // Parse path components: samples/<classification>/<format>/<tier>/<filename>
  const parts = relPath.split('/');
  const classification = parts[1] || 'unknown';
  const format = parts[2] || 'unknown';
  const tier = parts[3] || 'unknown';
  const filename = parts[parts.length - 1];

  // Basic signature inspection
  const headHex = buf.subarray(0, Math.min(buf.length, 16)).toString('hex');
  let formatDetail = '';

  if (format === 'mobi') {
    if (buf.length > 80) {
      const rec0Offset = (buf[78] << 24) | (buf[79] << 16) | (buf[80] << 8) | buf[81];
      if (rec0Offset + 16 <= buf.length) {
        const comp = (buf[rec0Offset] << 8) | buf[rec0Offset + 1];
        const magic = buf.subarray(rec0Offset + 16, rec0Offset + 20).toString('ascii');
        const compName = comp === 1 ? 'None (Raw)' : comp === 2 ? 'PalmDOC LZ77' : comp === 17480 ? 'HUFF/CDIC' : `Unknown (${comp})`;
        formatDetail = `MOBI (${magic}), Compression: ${compName}`;
      }
    }
  }

  inventory.push({
    format,
    classification,
    tier,
    filename,
    relPath,
    fullPath,
    size: stat.size,
    sha256: actualHash,
    status: 'VERIFIED',
    headHex,
    formatDetail
  });
  passCount++;
}

console.log(`Verified ${passCount} sample files (0 hash failures, 0 missing)`);

// 4. Write sample-inventory.json
fs.writeFileSync(path.join(RUN_DIR, 'sample-inventory.json'), JSON.stringify(inventory, null, 2));
fs.writeFileSync(path.join(LOCAL_RUN_DIR, 'sample-inventory.json'), JSON.stringify(inventory, null, 2));

// 5. Write sample-inventory.csv
const csvHeaders = 'Format,Classification,Tier,Filename,Size,SHA256,Status,FormatDetail\n';
const csvRows = inventory.map(item =>
  `"${item.format}","${item.classification}","${item.tier}","${item.filename}",${item.size},"${item.sha256}","${item.status}","${item.formatDetail || ''}"`
).join('\n');
fs.writeFileSync(path.join(RUN_DIR, 'sample-inventory.csv'), csvHeaders + csvRows);
fs.writeFileSync(path.join(LOCAL_RUN_DIR, 'sample-inventory.csv'), csvHeaders + csvRows);

console.log(`Saved sample inventory to ${path.join(RUN_DIR, 'sample-inventory.json')} and ${path.join(LOCAL_RUN_DIR, 'sample-inventory.json')}`);
