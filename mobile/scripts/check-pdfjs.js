// Verifies the generated pdfjsAssets.ts round-trips correctly.
//
// Two independent checks per constant:
//  1. the emitted string literal evaluates to byte-identical library source
//  2. escapeForTemplateLiteral() output evaluates AS A TEMPLATE LITERAL back to
//     the original bytes, which is exactly how the reader uses it
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const generated = fs.readFileSync(
  path.join(root, 'services', 'pdf', 'pdfjsAssets.ts'),
  'utf8'
);

const cases = [
  ['PDFJS_SOURCE', path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.min.js')],
  ['PDFJS_WORKER', path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.js')],
];

let failed = false;

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : n;
}

for (const [name, originalPath] of cases) {
  const re = new RegExp('export const ' + name + ': string = ([\\s\\S]*?);\\r?\\n');
  const m = generated.match(re);
  if (!m) {
    console.log(name + ': PATTERN NOT FOUND');
    failed = true;
    continue;
  }

  const original = fs.readFileSync(originalPath, 'utf8');

  // 1. literal -> value
  let value;
  try {
    value = JSON.parse(m[1]);
  } catch (e) {
    console.log(name + ': JSON PARSE FAILED - ' + e.message);
    failed = true;
    continue;
  }
  const litOk = value === original;
  console.log(name + ': literalValueMatchesOriginal=' + litOk + ' bytes=' + value.length);
  if (!litOk) {
    failed = true;
    const d = firstDiff(value, original);
    console.log('  first diff at ' + d);
  }

  // 2. escape -> template literal evaluation -> original
  //    Re-implements escapeForTemplateLiteral to keep this check standalone.
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

  let evaluated;
  try {
    evaluated = new Function('return `' + escaped + '`')();
  } catch (e) {
    console.log(name + ': TEMPLATE EVAL THREW - ' + e.message);
    failed = true;
    continue;
  }
  const tplOk = evaluated === original;
  console.log(name + ': templateLiteralRoundTrip=' + tplOk);
  if (!tplOk) {
    failed = true;
    const d = firstDiff(evaluated, original);
    console.log('  first diff at ' + d);
  }
}

if (failed) {
  console.log('RESULT: FAIL');
  process.exit(1);
}
console.log('RESULT: PASS');
