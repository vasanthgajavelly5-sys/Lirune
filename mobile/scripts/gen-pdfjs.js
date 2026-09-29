/**
 * Generates mobile/services/pdf/pdfjsAssets.ts
 *
 * The PDF reader must work with no network access, so pdf.js is vendored into
 * the app bundle instead of being fetched from a CDN at runtime. This script
 * reads the UMD builds out of node_modules and emits them as string literals
 * that the reader inlines into its WebView.
 *
 * Run with:  npm run gen:pdfjs
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build');
const outDir = path.join(root, 'services', 'pdf');
const outFile = path.join(outDir, 'pdfjsAssets.ts');

const sources = [
  ['PDFJS_SOURCE', 'pdf.min.js'],
  ['PDFJS_WORKER', 'pdf.worker.min.js'],
];

const parts = [
  '/**',
  ' * AUTO-GENERATED FILE - do not edit by hand.',
  ' *',
  ' * Regenerate with: npm run gen:pdfjs',
  ' *',
  ' * Contains the pdf.js UMD builds as string literals so the PDF reader can run',
  ' * fully offline instead of fetching the library from a CDN at runtime.',
  ' */',
  '',
];

for (const [name, file] of sources) {
  const full = path.join(buildDir, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing ${full} — is pdfjs-dist installed?`);
    process.exit(1);
  }
  const content = fs.readFileSync(full, 'utf8');

  // Emit a plain JSON string literal holding the RAW library source. The source
  // contains backticks and ${, so the consumer must escape it via
  // `escapeForTemplateLiteral()` at the point it is inlined into HTML.
  parts.push(
    `export const ${name}: string = ${JSON.stringify(content)};`,
    ''
  );
  console.log(`${file} -> ${name} (${(content.length / 1024).toFixed(0)} KB)`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, parts.join('\n'), 'utf8');
console.log(`Wrote ${outFile}`);
