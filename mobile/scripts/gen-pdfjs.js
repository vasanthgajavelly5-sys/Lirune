/**
 * Generates mobile/services/pdf/pdfjsAssets.ts from the pinned pdfjs-dist
 * dependency. The shared pipeline preserves the offline bundle and applies the
 * Android WebView compatibility transforms used by validation.
 */

const fs = require('node:fs');
const path = require('node:path');
const { readTransformedAsset, sources } = require('./pdfjs-pipeline');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'services', 'pdf');
const outFile = path.join(outDir, 'pdfjsAssets.ts');

const parts = [
  '/**',
  ' * AUTO-GENERATED FILE - do not edit by hand.',
  ' *',
  ' * Regenerate with: npm run gen:pdfjs',
  ' *',
  ' * Contains the pdf.js Android WebView-compatible bundle as string literals',
  ' * so the PDF reader can run fully offline instead of using a CDN.',
  ' */',
  '',
];

for (const [name, file] of sources) {
  const content = readTransformedAsset(name);
  parts.push(`export const ${name}: string = ${JSON.stringify(content)};`, '');
  console.log(`${file} -> ${name} (${(content.length / 1024).toFixed(0)} KB)`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, parts.join('\n'), 'utf8');
console.log(`Wrote ${outFile}`);
