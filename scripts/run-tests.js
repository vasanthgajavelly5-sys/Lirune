#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'all';

function findTests(directory) {
  const fullDirectory = path.join(root, directory);
  if (!fs.existsSync(fullDirectory)) return [];
  return fs.readdirSync(fullDirectory)
    .filter((name) => name.endsWith('.test.js'))
    .map((name) => path.join(directory, name));
}

function testsForMode(selectedMode) {
  const unit = findTests(path.join('test', 'unit'));
  const integration = findTests(path.join('test', 'integration'));
  const rootTests = findTests('test');

  if (selectedMode === 'unit') return [...unit, ...rootTests];
  if (selectedMode === 'integration') return integration;
  if (selectedMode === 'all') return [...unit, ...integration, ...rootTests];
  console.error(`Unknown desktop test mode: ${selectedMode}`);
  process.exit(2);
}

const files = testsForMode(mode);
if (files.length === 0) {
  console.log(`No desktop tests found for mode "${mode}"; nothing to run.`);
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
