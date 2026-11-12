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
  ['PDFJS_SOURCE', 'pdf.min.mjs'],
  ['PDFJS_WORKER', 'pdf.worker.min.mjs'],
];

function convertModuleToClassic(content, globalName, requiredExports) {
  content = content.replace(/import\.meta\.url/g, 'undefined');
  const exportPattern = /export\{([\s\S]*?)\};\s*$/;
  const match = content.match(exportPattern);
  if (!match || match.index === undefined) {
    throw new Error(`Could not find the module export list for ${globalName}`);
  }

  const bindings = {};
  for (const entry of match[1].split(',')) {
    const parts = entry.trim().split(/\s+as\s+/);
    if (parts.length === 2) bindings[parts[1]] = parts[0];
  }

  const bridge = requiredExports.map((exportName) => {
    const localName = bindings[exportName];
    if (!localName) throw new Error(`Missing ${exportName} export in ${globalName}`);
    return `${exportName}: ${localName}`;
  });

  return `${content.slice(0, match.index)}globalThis.${globalName} = { ${bridge.join(', ')} };`;
}

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
  let content = fs.readFileSync(full, 'utf8');
  content = convertModuleToClassic(
    content,
    name === 'PDFJS_SOURCE' ? 'pdfjsLib' : 'pdfjsWorker',
    name === 'PDFJS_SOURCE'
      ? ['getDocument', 'GlobalWorkerOptions', 'PDFWorker']
      : ['WorkerMessageHandler']
  );

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
