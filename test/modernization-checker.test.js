const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const checkerScript = path.join(root, 'scripts', 'check-modernization.js');

test('rejects shared deprecated Node APIs', () => {
  const result = spawnSync(process.execPath, [checkerScript], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `Modernization check failed: ${result.stderr || result.stdout}`);
  assert.match(result.stdout, /Modernization check passed/);
});

test('modernization baseline file exists and is valid JSON', () => {
  const baselinePath = path.join(root, 'scripts', 'modernization-baseline.json');
  assert.ok(fs.existsSync(baselinePath));
  const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  assert.ok(Array.isArray(parsed.findings));
});
