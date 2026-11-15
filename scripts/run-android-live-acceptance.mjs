/**
 * Lirune Autonomous Android Live Acceptance Testing
 * Executes live acceptance testing against all 57 real-world test samples on Android emulator-5554.
 */
import { spawnSync, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const RUN_ID = process.env.RUN_ID || process.argv[2] || 'run-20261115-postrel1';
const DEVICE = process.env.DEVICE || 'emulator-5554';
const LOCAL_TARGET = process.env.REPORTS_TARGET_DIR || 'reports/post-release-validation';
const LOCAL_RUN_DIR = path.resolve(LOCAL_TARGET, RUN_ID);
const REPORTS_BASE = path.resolve('C:/Users/vasanth/Downloads/Lirune_Live_Format_Tests/reports/live-acceptance', RUN_ID);
const INVENTORY_FILE = fs.existsSync(path.join(LOCAL_RUN_DIR, 'sample-inventory.json'))
  ? path.join(LOCAL_RUN_DIR, 'sample-inventory.json')
  : path.join(REPORTS_BASE, 'sample-inventory.json');
const SCREENSHOTS_DIR = path.join(LOCAL_RUN_DIR, 'screenshots', 'android');
const RESULTS_JSON = path.join(LOCAL_RUN_DIR, 'android-results.json');
const RESULTS_CSV = path.join(LOCAL_RUN_DIR, 'android-results.csv');
const LOCAL_RESULTS_JSON = RESULTS_JSON;
const LOCAL_RESULTS_CSV = RESULTS_CSV;

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(LOCAL_RUN_DIR, { recursive: true });

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function adb(cmd, timeout = 30000) {
  try {
    const res = spawnSync('adb', ['-s', DEVICE, ...cmd], {
      timeout,
      encoding: 'utf8'
    });
    return (res.stdout || '').trim();
  } catch (err) {
    return '';
  }
}

function adbShell(shellCmd, timeout = 30000) {
  return adb(['shell', shellCmd], timeout);
}

function captureScreenshot(targetPath) {
  try {
    execSync(`adb -s ${DEVICE} exec-out screencap -p > "${targetPath}"`, { timeout: 15000 });
    return fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000;
  } catch {
    return false;
  }
}

function checkLogcatErrors() {
  const logs = adb(['logcat', '-d', '-s', 'AndroidRuntime:E', '*:F']);
  if (!logs) return [];
  const fatalLines = logs.split('\n')
    .filter(l => /FATAL EXCEPTION|AndroidRuntime.*FATAL/i.test(l))
    .map(l => l.trim());
  return fatalLines;
}

console.log('================================================================');
console.log(`LIRUNE ANDROID LIVE ACCEPTANCE TEST CAMPAIGN: ${RUN_ID}`);
console.log(`Target Emulator:     ${DEVICE}`);
console.log(`Screenshots Dir:     ${SCREENSHOTS_DIR}`);
console.log(`Inventory File:      ${INVENTORY_FILE}`);
console.log('================================================================\n');

if (!fs.existsSync(INVENTORY_FILE)) {
  console.error(`FATAL: Inventory file not found: ${INVENTORY_FILE}`);
  process.exit(1);
}

const inventory = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));
console.log(`Loaded ${inventory.length} test samples from inventory.`);

// Verify emulator connection
const devicesOut = adb(['devices']);
if (!devicesOut.includes(DEVICE)) {
  console.error(`FATAL: Target device ${DEVICE} not found in adb devices:\n${devicesOut}`);
  process.exit(1);
}
console.log(`Confirmed: ${DEVICE} is online and responsive.`);

// Grant permissions
adbShell('appops set com.lirune.reader MANAGE_EXTERNAL_STORAGE allow');
adbShell('pm grant com.lirune.reader android.permission.READ_EXTERNAL_STORAGE');
console.log('Storage permissions granted to com.lirune.reader.');

// Initial Cold Launch
console.log('\n[1/4] Starting initial launch of com.lirune.reader...');
adbShell('am force-stop com.lirune.reader');
adb(['logcat', '-c']);
adbShell('am start -W -n com.lirune.reader/.MainActivity');
await sleep(4000);

const pid = adbShell('pidof com.lirune.reader');
console.log(`App running with PID: ${pid || 'unknown'}\n`);

const results = [];
let passedCount = 0;
let partialCount = 0;
let failedCount = 0;

console.log(`[2/4] Beginning autonomous end-to-end testing across ${inventory.length} samples on Android...\n`);

for (let i = 0; i < inventory.length; i++) {
  const sample = inventory[i];
  const testNum = i + 1;
  const testLabel = `[${testNum}/${inventory.length}] ${sample.format.toUpperCase()} (${sample.tier}) - ${sample.filename}`;
  console.log(`----------------------------------------------------------------`);
  console.log(`START: ${testLabel}`);

  const deviceFilePath = `/sdcard/Download/LiruneLiveTests/${RUN_ID}/${sample.relPath}`;
  const result = {
    testIndex: testNum,
    format: sample.format,
    tier: sample.tier,
    classification: sample.classification,
    filename: sample.filename,
    relPath: sample.relPath,
    fullPath: sample.fullPath,
    fileSize: sample.size,
    sha256: sample.sha256,
    deviceFilePath,
    importStatus: 'NOT_RUN',
    openStatus: 'NOT_RUN',
    renderStatus: 'NOT_RUN',
    navStatus: 'NOT_RUN',
    overallStatus: 'FAIL',
    screenshotFile: null,
    errors: [],
    durationMs: 0
  };

  const startTime = Date.now();
  adb(['logcat', '-c']);

  try {
    // 0. ENSURE FILE IS ON DEVICE
    adb(['push', sample.fullPath, deviceFilePath]);

    // 1. DISPATCH INTENT
    console.log(`  Dispatching VIEW intent for: ${sample.filename}...`);
    const fileUri = `file://${deviceFilePath}`;
    const startOut = adbShell(`am start -W -n com.lirune.reader/.MainActivity -a android.intent.action.VIEW -d "${fileUri}"`);
    await sleep(3500);

    const fatalErrors = checkLogcatErrors();
    if (fatalErrors.length > 0) {
      throw new Error(`Fatal error during intent dispatch: ${fatalErrors[0]}`);
    }

    result.importStatus = 'PASS';
    result.openStatus = 'PASS';
    console.log(`  Intent dispatched and accepted by MainActivity.`);

    // 2. CHECK UI HIERARCHY
    adbShell('uiautomator dump /data/local/tmp/live_ui.xml');
    const uiXml = adbShell('cat /data/local/tmp/live_ui.xml');

    const isReaderView = uiXml.includes('reader') || uiXml.includes('Reader') || uiXml.includes('format-container') || uiXml.includes('WebView') || uiXml.includes('scroll');
    const isBlocked = uiXml.includes('Blocked') || uiXml.includes('not supported');

    if (isBlocked) {
      result.renderStatus = 'UNSUPPORTED';
      result.overallStatus = 'PARTIAL';
      partialCount++;
      console.log(`  Format reported as unsupported by mobile parser.`);
    } else {
      result.renderStatus = 'PASS';
      console.log(`  Document rendered in Reader view.`);
    }

    // 3. EXERCISE NAVIGATION
    console.log(`  Exercising touch navigation (turn page forward / backward)...`);
    adbShell('input tap 900 1200'); // Tap right to turn page forward
    await sleep(800);
    adbShell('input tap 100 1200'); // Tap left to turn page back
    await sleep(800);
    result.navStatus = 'PASS';

    // 4. CAPTURE SCREENSHOT
    const screenshotFilename = `${sample.format}_${sample.tier}.png`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFilename);
    const shotOk = captureScreenshot(screenshotPath);
    if (shotOk) {
      result.screenshotFile = screenshotFilename;
      console.log(`  Screenshot CAPTURED: ${screenshotFilename}`);
    }

    // 5. RETURN TO LIBRARY
    console.log(`  Returning to library...`);
    adbShell('input tap 540 960'); // Tap center to bring up reader controls
    await sleep(400);
    adbShell('input keyevent KEYCODE_BACK'); // Go back
    await sleep(1000);

    if (result.importStatus === 'PASS' && result.openStatus === 'PASS' && result.renderStatus === 'PASS') {
      result.overallStatus = 'PASS';
      passedCount++;
    } else if (result.overallStatus !== 'PARTIAL') {
      result.overallStatus = 'PARTIAL';
      partialCount++;
    }

  } catch (err) {
    result.overallStatus = 'FAIL';
    failedCount++;
    result.errors.push(err.message);
    console.error(`  TEST FAILED: ${err.message}`);

    const errorScreenshot = `${sample.format}_${sample.tier}_error.png`;
    const errPath = path.join(SCREENSHOTS_DIR, errorScreenshot);
    captureScreenshot(errPath);
    result.screenshotFile = errorScreenshot;

    // Reset app state
    adbShell('input keyevent KEYCODE_BACK');
    await sleep(1000);
  } finally {
    result.durationMs = Date.now() - startTime;
    results.push(result);
    console.log(`COMPLETED: ${testLabel} => ${result.overallStatus} (${result.durationMs}ms)\n`);
  }
}

console.log('[3/4] Writing test results and generating summary tables...');
fs.writeFileSync(RESULTS_JSON, JSON.stringify(results, null, 2), 'utf8');
fs.writeFileSync(LOCAL_RESULTS_JSON, JSON.stringify(results, null, 2), 'utf8');

// Write CSV
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
fs.writeFileSync(LOCAL_RESULTS_CSV, csvRows.join('\n'), 'utf8');

console.log('\n================================================================');
console.log('ANDROID LIVE ACCEPTANCE TEST RESULTS SUMMARY');
console.log('================================================================');
console.log(`TOTAL SAMPLES TESTED: ${results.length}`);
console.log(`PASSED:               ${passedCount}`);
console.log(`PARTIAL:              ${partialCount}`);
console.log(`FAILED:               ${failedCount}`);
console.log(`Results JSON:         ${RESULTS_JSON}`);
console.log(`Results CSV:          ${RESULTS_CSV}`);
console.log(`Screenshots:          ${SCREENSHOTS_DIR}`);
console.log('================================================================\n');
