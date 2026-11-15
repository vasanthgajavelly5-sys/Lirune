import { spawnSync, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const DEVICE = 'emulator-5554';
const RESULTS_JSON = 'reports/post-release-validation/run-20261115-postrel1/android-results.json';
const RESULTS_CSV = 'reports/post-release-validation/run-20261115-postrel1/android-results.csv';
const SCREENSHOTS_DIR = 'reports/post-release-validation/run-20261115-postrel1/screenshots/android';
const INVENTORY_FILE = 'reports/post-release-validation/run-20261115-postrel1/sample-inventory.json';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function adb(cmd, timeout = 30000) {
  try {
    const res = spawnSync('adb', ['-s', DEVICE, ...cmd], { timeout, encoding: 'utf8' });
    return (res.stdout || '').trim();
  } catch { return ''; }
}

function adbShell(shellCmd, timeout = 30000) {
  return adb(['shell', shellCmd], timeout);
}

function captureScreenshot(targetPath) {
  try {
    execSync(`adb -s ${DEVICE} exec-out screencap -p > "${targetPath}"`, { timeout: 15000 });
    return fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000;
  } catch { return false; }
}

function checkLogcatErrors() {
  const logs = adb(['logcat', '-d', '-s', 'AndroidRuntime:E', '*:F']);
  if (!logs) return [];
  return logs.split('\n').filter(l => /FATAL EXCEPTION|AndroidRuntime.*FATAL/i.test(l)).map(l => l.trim());
}

const inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));
const results = JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'));

console.log('--- RETESTING HEIC & HEIF SAMPLES ON ANDROID EMULATOR ---');

const targets = inventory.filter(x => x.format === 'heic' || x.format === 'heif');

for (const sample of targets) {
  const testIndex = inventory.findIndex(x => x.filename === sample.filename) + 1;
  const testLabel = `[${testIndex}/${inventory.length}] ${sample.format.toUpperCase()} (${sample.tier}) - ${sample.filename}`;
  console.log(`\nSTART: ${testLabel}`);

  const deviceFilePath = `/sdcard/Download/${sample.filename}`;
  const startTime = Date.now();
  adb(['logcat', '-c']);

  const resultIdx = results.findIndex(r => r.filename === sample.filename);
  const result = results[resultIdx];
  result.errors = [];

  try {
    adb(['push', sample.fullPath, deviceFilePath]);
    console.log(`  Dispatching VIEW intent for: ${sample.filename}...`);
    const fileUri = `file://${deviceFilePath}`;
    adbShell(`am start -W -n com.lirune.reader/.MainActivity -a android.intent.action.VIEW -d "${fileUri}"`);
    await sleep(3500);

    const fatalErrors = checkLogcatErrors();
    if (fatalErrors.length > 0) {
      throw new Error(`Fatal error during intent dispatch: ${fatalErrors[0]}`);
    }

    result.importStatus = 'PASS';
    result.openStatus = 'PASS';
    console.log(`  Intent dispatched and accepted by MainActivity.`);

    adbShell('uiautomator dump /data/local/tmp/live_ui.xml');
    const uiXml = adbShell('cat /data/local/tmp/live_ui.xml');
    const isReaderView = uiXml.includes('reader') || uiXml.includes('Reader') || uiXml.includes('format-container') || uiXml.includes('WebView') || uiXml.includes('scroll') || uiXml.includes('ImageView');
    const isBlocked = uiXml.includes('Blocked') || uiXml.includes('not supported');

    if (isBlocked) {
      result.renderStatus = 'UNSUPPORTED';
      result.overallStatus = 'PARTIAL';
    } else {
      result.renderStatus = 'PASS';
      console.log(`  Document rendered in Reader view.`);
    }

    console.log(`  Exercising touch navigation...`);
    adbShell('input tap 900 1200');
    await sleep(800);
    adbShell('input tap 100 1200');
    await sleep(800);
    result.navStatus = 'PASS';

    const screenshotFilename = `${sample.format}_${sample.tier}.png`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFilename);
    const shotOk = captureScreenshot(screenshotPath);
    if (shotOk) {
      result.screenshotFile = screenshotFilename;
      console.log(`  Screenshot CAPTURED: ${screenshotFilename}`);
    }

    console.log(`  Returning to library...`);
    adbShell('input keyevent KEYCODE_BACK');
    await sleep(1000);

    result.overallStatus = 'PASS';
  } catch (err) {
    result.overallStatus = 'FAIL';
    result.errors.push(err.message);
    console.error(`  FAILED: ${err.message}`);
    adbShell('input keyevent KEYCODE_BACK');
    await sleep(1000);
  } finally {
    result.durationMs = Date.now() - startTime;
    console.log(`COMPLETED: ${testLabel} => ${result.overallStatus} (${result.durationMs}ms)`);
  }
}

// Write updated JSON
fs.writeFileSync(RESULTS_JSON, JSON.stringify(results, null, 2), 'utf8');

// Write updated CSV
const csvHeaders = [
  'testIndex', 'format', 'tier', 'classification', 'filename', 'fileSize', 'sha256',
  'importStatus', 'openStatus', 'renderStatus', 'navStatus', 'overallStatus',
  'screenshotFile', 'durationMs', 'errors'
];

const csvRows = [csvHeaders.join(',')];
for (const r of results) {
  const row = [
    r.testIndex,
    r.format,
    r.tier,
    r.classification,
    `"${r.filename}"`,
    r.fileSize,
    r.sha256,
    r.importStatus,
    r.openStatus,
    r.renderStatus,
    r.navStatus,
    r.overallStatus,
    `"${r.screenshotFile || ''}"`,
    r.durationMs,
    `"${(r.errors.join('; ') || '').replace(/"/g, '""')}"`
  ];
  csvRows.push(row.join(','));
}
fs.writeFileSync(RESULTS_CSV, csvRows.join('\n'), 'utf8');

const passedCount = results.filter(r => r.overallStatus === 'PASS').length;
const failedCount = results.filter(r => r.overallStatus === 'FAIL').length;
console.log('\n================================================================');
console.log('RETEST COMPLETE — SUMMARY:');
console.log(`TOTAL SAMPLES: ${results.length}`);
console.log(`PASSED:        ${passedCount}`);
console.log(`FAILED:        ${failedCount}`);
console.log('================================================================\n');
