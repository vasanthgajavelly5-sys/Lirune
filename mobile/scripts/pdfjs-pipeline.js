const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build');

const babelPlugins = [
  require.resolve('@babel/plugin-transform-class-static-block', { paths: [root] }),
  require.resolve('@babel/plugin-transform-logical-assignment-operators', { paths: [root] }),
  require.resolve('@babel/plugin-transform-private-methods', { paths: [root] }),
  require.resolve('@babel/plugin-transform-class-properties', { paths: [root] }),
  require.resolve('@babel/plugin-transform-private-property-in-object', { paths: [root] }),
  require.resolve('@babel/plugin-transform-nullish-coalescing-operator', { paths: [root] }),
  require.resolve('@babel/plugin-transform-optional-chaining', { paths: [root] }),
];

const sources = [
  ['PDFJS_SOURCE', 'pdf.min.mjs', 'pdfjsLib', ['getDocument', 'GlobalWorkerOptions', 'PDFWorker']],
  ['PDFJS_WORKER', 'pdf.worker.min.mjs', 'pdfjsWorker', ['WorkerMessageHandler']],
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

function transformForAndroidWebView(content) {
  const transformed = babel.transformSync(content, {
    plugins: babelPlugins,
    babelrc: false,
    configFile: false,
    compact: true,
  });
  return transformed && transformed.code ? transformed.code : content;
}

function readTransformedAsset(name) {
  const source = sources.find((entry) => entry[0] === name);
  if (!source) throw new Error(`Unknown PDF.js asset: ${name}`);
  const [, file, globalName, requiredExports] = source;
  const fullPath = path.join(buildDir, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing ${fullPath} — is pdfjs-dist installed?`);
  }
  const moduleSource = fs.readFileSync(fullPath, 'utf8');
  return transformForAndroidWebView(
    convertModuleToClassic(moduleSource, globalName, requiredExports)
  );
}

module.exports = {
  buildDir,
  sources,
  readTransformedAsset,
};
