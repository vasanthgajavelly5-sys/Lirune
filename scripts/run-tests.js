const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mode = process.argv[2] || 'all';

function findTests(dir) {
  const fullDir = path.join(root, dir);
  if (!fs.existsSync(fullDir)) return [];
  return fs.readdirSync(fullDir)
    .filter(f => f.endsWith('.test.js'))
    .map(f => path.join(dir, f));
}

let files = [];
if (mode === 'unit') {
  files = [...findTests(path.join('test', 'unit')), ...findTests('test')];
} else if (mode === 'integration') {
  files = findTests(path.join('test', 'integration'));
} else {
  files = [
    ...findTests(path.join('test', 'unit')),
    ...findTests(path.join('test', 'integration')),
    ...findTests('test')
  ];
}

const res = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit'
});

process.exit(res.status ?? 1);

