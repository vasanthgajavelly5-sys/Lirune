const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tscBin = path.join(root, 'mobile', 'node_modules', 'typescript', 'bin', 'tsc');

if (!fs.existsSync(tscBin)) {
  console.log('NOT TESTED: mobile TypeScript compiler not installed; run `npm --prefix mobile ci` first.');
  process.exit(0);
}

const res = spawnSync(process.execPath, [tscBin, '-p', path.join(root, 'tsconfig.desktop.json'), '--noEmit'], {
  stdio: 'inherit',
  cwd: root,
});

process.exitCode = res.status === null ? 1 : res.status;
