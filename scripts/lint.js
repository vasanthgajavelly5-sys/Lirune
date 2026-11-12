const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [path.join(root, 'main.js'), path.join(root, 'preload.js')];

// Module files cannot be parsed as CommonJS, so they are syntax checked from a
// temporary .mjs copy instead.
const moduleFiles = [];

function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'qa') continue;
      collect(full);
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    } else if (entry.name.endsWith('.mjs')) {
      moduleFiles.push(full);
    }
  }
}

for (const directory of ['js', 'scripts']) {
  collect(path.join(root, directory));
}

let failed = false;

function report(target, status) {
  if (status === 0) return;
  failed = true;
  console.error(`FAIL ${path.relative(root, target)}`);
}

for (const file of files) {
  report(file, spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }).status);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lirune-lint-'));
for (const file of moduleFiles) {
  const copy = path.join(tempDir, `${path.basename(file, '.mjs')}-${Buffer.from(path.relative(root, file)).toString('hex')}.mjs`);
  fs.copyFileSync(file, copy);
  report(file, spawnSync(process.execPath, ['--check', copy], { stdio: 'inherit' }).status);
  fs.rmSync(copy, { force: true });
}
fs.rmSync(tempDir, { recursive: true, force: true });

if (!failed) {
  console.log(`lint ok: ${files.length} scripts, ${moduleFiles.length} modules`);
}
process.exitCode = failed ? 1 : 0;
