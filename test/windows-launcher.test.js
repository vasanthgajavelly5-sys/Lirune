const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const batPath = path.join(root, 'Launch-Lirune.bat');

test('Launch-Lirune.bat exists and is non-empty', () => {
  assert.ok(fs.existsSync(batPath), 'Launch-Lirune.bat should exist');
  const stats = fs.statSync(batPath);
  assert.ok(stats.size > 100, 'Launch-Lirune.bat should be non-empty');
});

test('Launch-Lirune.bat succeeds with --test-dry-run', () => {
  const result = spawnSync('cmd.exe', ['/c', batPath, '--test-dry-run'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `Dry run exited with ${result.status}: ${result.stderr || result.stdout}`);
  assert.match(result.stdout, /Launcher syntax and environment verified successfully/);
});

test('Launch-Lirune.bat succeeds with --validate-only', () => {
  const result = spawnSync('cmd.exe', ['/c', batPath, '--validate-only'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `Validation run exited with ${result.status}: ${result.stderr || result.stdout}`);
  assert.match(result.stdout, /verified/i);
});

test('Launch-Lirune.bat avoids unsafe indiscriminate commands', () => {
  const content = fs.readFileSync(batPath, 'utf8');
  assert.doesNotMatch(content, /taskkill\s+\/IM\s+electron\.exe/i, 'Must not indiscriminately kill all electron processes');
});
