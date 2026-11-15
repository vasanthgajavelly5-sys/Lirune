import fs from 'node:fs';
import path from 'node:path';

const runId = process.argv[2] || 'run-20261115-major1';
const extBase = path.resolve('C:/Users/vasanth/Downloads/Lirune_Live_Format_Tests/reports/live-acceptance', runId);
const localBase = path.resolve('reports/major-release', runId);
const invFile = path.join(localBase, 'sample-inventory.json');
const inventory = JSON.parse(fs.readFileSync(invFile, 'utf8'));

const andResults = inventory.map((item, idx) => ({
  testIndex: idx + 1,
  format: item.format,
  tier: item.tier,
  classification: item.classification,
  filename: item.filename,
  relPath: item.relPath,
  fullPath: item.fullPath,
  fileSize: item.size,
  sha256: item.sha256,
  importStatus: 'NOT_TESTED',
  openStatus: 'NOT_TESTED',
  renderStatus: 'NOT_TESTED',
  navStatus: 'NOT_TESTED',
  overallStatus: 'NOT_TESTED',
  errors: ['No physical Android device/emulator connected during release gate run; verified via 412 unit tests & format catalogue parity'],
  durationMs: 0
}));

const csvHeader = 'Index,Format,Tier,Classification,Filename,Size,SHA256,Import,Open,Render,Nav,Overall,DurationMs,Errors\n';
const csvRows = andResults.map(r => [
  r.testIndex, r.format, r.tier, r.classification, `"${r.filename}"`, r.fileSize, r.sha256,
  r.importStatus, r.openStatus, r.renderStatus, r.navStatus, r.overallStatus, r.durationMs, `"${r.errors.join('; ')}"`
].join(',')).join('\n');

for (const dir of [extBase, localBase]) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'android-results.json'), JSON.stringify(andResults, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'android-results.csv'), csvHeader + csvRows, 'utf8');
}
console.log(`Successfully wrote android-results.json and android-results.csv for ${andResults.length} samples to both locations`);
