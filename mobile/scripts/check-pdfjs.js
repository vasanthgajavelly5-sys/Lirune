// Verifies generated PDF.js assets against the exact generation pipeline.

const fs = require('node:fs');
const path = require('node:path');
const { readTransformedAsset, sources } = require('./pdfjs-pipeline');

const root = path.resolve(__dirname, '..');
const generated = fs.readFileSync(
  path.join(root, 'services', 'pdf', 'pdfjsAssets.ts'),
  'utf8'
);

let failed = false;

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : n;
}

for (const [name] of sources) {
  const re = new RegExp(`export const ${name}: string = ([\\s\\S]*?);\\r?\\n`);
  const match = generated.match(re);
  if (!match) {
    console.error(`${name}: generated export not found`);
    failed = true;
    continue;
  }

  const expected = readTransformedAsset(name);
  let value;
  try {
    value = JSON.parse(match[1]);
  } catch (error) {
    console.error(`${name}: generated string is not valid JSON: ${error.message}`);
    failed = true;
    continue;
  }

  const matches = value === expected;
  console.log(`${name}: generatedMatchesPipeline=${matches} bytes=${value.length}`);
  if (!matches) {
    console.error(`  first diff at ${firstDiff(value, expected)}`);
    failed = true;
  }

  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  try {
    const evaluated = new Function(`return \`${escaped}\`;`)();
    if (evaluated !== expected) {
      console.error(`${name}: template literal round-trip failed`);
      failed = true;
    }
  } catch (error) {
    console.error(`${name}: template literal evaluation failed: ${error.message}`);
    failed = true;
  }
}

if (failed) {
  console.error('RESULT: FAIL');
  process.exit(1);
}
console.log('RESULT: PASS');
