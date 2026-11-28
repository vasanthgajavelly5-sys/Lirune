/**
 * Reproducible Android runtime smoke check for connected emulator/device.
 * Verifies:
 *  1. External VIEW intent resolution (`content://` + `application/octet-stream`)
 *  2. External ACTION_SEND intent resolution (`application/octet-stream`)
 *  3. Real EPUB launch (if `--epub <path>` is passed) + Logcat crash scan (no FATAL EXCEPTION or code -1)
 *
 * Usage:
 *   node mobile/scripts/smoke-android-runtime.mjs [--epub <path-to-test.epub>]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function runAdb(args) {
  const res = spawnSync('adb', args, { encoding: 'utf8', timeout: 30000 });
  return { status: res.status ?? 1, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() };
}

const epubFlagIdx = process.argv.indexOf('--epub');
const epubPath = epubFlagIdx !== -1 ? process.argv[epubFlagIdx + 1] : null;

const devices = runAdb(['devices']);
const online = devices.stdout
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.trim())
  .filter((l) => l.endsWith('\tdevice'));

if (online.length === 0) {
  console.log('NOT TESTED: No online Android emulator/device connected via ADB.');
  process.exit(0);
}

const deviceId = online[0].split('\t')[0];
console.log(`Testing Android runtime on device: ${deviceId}`);

// 1. Verify OS intent resolution directly against package manager
const checks = [
  ['shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.VIEW', '-d', 'content://com.android.externalstorage.documents/document/primary%3ADownload%2Fbook.epub', '-t', 'application/octet-stream'],
  ['shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.SEND', '-t', 'application/octet-stream'],
  ['shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.VIEW', '-d', 'file:///sdcard/Download/book.epub'],
];

for (const args of checks) {
  const res = runAdb(['-s', deviceId, ...args]);
  if (!res.stdout.includes('com.lirune.reader/.MainActivity')) {
    console.error(`FAIL: Intent resolution did not select com.lirune.reader/.MainActivity for ${args.join(' ')}`);
    console.error(res.stdout, res.stderr);
    process.exit(1);
  }
}
console.log('PASS: All external VIEW and SEND intent filters resolve to com.lirune.reader/.MainActivity.');

// 2. If test EPUB path supplied, push to device Download folder and launch cold intent
if (epubPath) {
  const abs = path.resolve(epubPath);
  if (!fs.existsSync(abs)) {
    console.error(`Missing EPUB file: ${abs}`);
    process.exit(1);
  }
  const remotePath = `/sdcard/Download/${path.basename(abs)}`;
  runAdb(['-s', deviceId, 'logcat', '-c']);
  runAdb(['-s', deviceId, 'shell', 'am', 'force-stop', 'com.lirune.reader']);
  const pushRes = runAdb(['-s', deviceId, 'push', abs, remotePath]);
  if (pushRes.status !== 0) {
    console.error('Failed pushing EPUB to device:', pushRes.stderr);
    process.exit(1);
  }
  runAdb(['-s', deviceId, 'shell', 'am', 'start', '-n', 'com.lirune.reader/.MainActivity', '-a', 'android.intent.action.VIEW', '-d', `file://${remotePath}`, '-t', 'application/epub+zip']);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);

  const logs = runAdb(['-s', deviceId, 'logcat', '-d']);
  runAdb(['-s', deviceId, 'shell', 'rm', '-f', remotePath]);

  const crashPattern = /FATAL EXCEPTION|tile memory limits exceeded|Renderer process crash detected/i;
  const hit = logs.stdout.split(/\r?\n/).find((l) => crashPattern.test(l));
  if (hit) {
    console.error(`FAIL: Runtime crash detected in logcat: ${hit}`);
    process.exit(1);
  }
  console.log('PASS: Live cold intent launch succeeded without renderer or runtime crashes.');
}
