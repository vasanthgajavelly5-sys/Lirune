#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'scripts', 'modernization-baseline.json');
const sourceExtensions = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.kt', '.kts', '.java', '.gradle', '.ps1', '.bat'
]);
const ignoredSegments = new Set([
  'node_modules', 'dist', 'build', '.git', '.expo', 'android',
  'test', 'tests', 'e2e', 'test-fixtures', 'test-assets', 'artifacts', 'scratch'
]);
const patterns = [
  { id: 'react-legacy-lifecycle', expression: /\b(?:componentWillMount|componentWillReceiveProps|componentWillUpdate)\b/g },
  { id: 'react-unsafe-lifecycle', expression: /\bUNSAFE_componentWill(?:Mount|ReceiveProps|Update)\b/g },
  { id: 'react-dom-render', expression: /\bReactDOM\.render\s*\(/g },
  { id: 'react-find-dom-node', expression: /\bfindDOMNode\s*\(/g },
  { id: 'node-deprecated-buffer', expression: /\bnew\s+Buffer\s*\(/g },
  { id: 'node-deprecated-url-parse', expression: /\burl\.parse\s*\(/g },
  { id: 'node-deprecated-fs-rmdir', expression: /\bfs\.rmdir(?:Sync)?\s*\(/g },
  { id: 'android-deprecated-activity-result', expression: /\b(?:startActivityForResult|onActivityResult)\s*\(/g }
];

function isSourceFile(filePath) {
  const relative = path.relative(root, filePath);
  if (relative === path.join('scripts', 'check-modernization.js')) return false;
  if (relative === path.join('mobile', 'services', 'pdf', 'pdfjsAssets.ts')) return false;
  return sourceExtensions.has(path.extname(filePath).toLowerCase())
    && !relative.split(path.sep).some((segment) => ignoredSegments.has(segment));
}

function maintainedFiles(directory = root) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredSegments.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...maintainedFiles(fullPath));
    else if (isSourceFile(fullPath)) files.push(fullPath);
  }
  return files;
}

function filesFromArguments(argumentsList) {
  return argumentsList.filter((file) => !file.startsWith('--'))
    .map((file) => path.resolve(root, file)).filter(isSourceFile);
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function scan(files) {
  const findings = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern.expression)) {
        findings.push({
          id: pattern.id,
          file: path.relative(root, file).replaceAll(path.sep, '/'),
          line: lineNumber(text, match.index)
        });
      }
    }
  }
  return findings;
}

function findingKey(finding) {
  return `${finding.id}|${finding.file}|${finding.line}`;
}

const argumentsList = process.argv.slice(2);
const baselineArgumentIndex = argumentsList.indexOf('--baseline');
const selectedBaselinePath = baselineArgumentIndex >= 0
  ? path.resolve(root, argumentsList[baselineArgumentIndex + 1])
  : baselinePath;
if (!selectedBaselinePath || !fs.existsSync(selectedBaselinePath)) {
  console.error(`Modernization baseline not found: ${selectedBaselinePath}`);
  process.exit(2);
}
const baseline = JSON.parse(fs.readFileSync(selectedBaselinePath, 'utf8'));
const files = filesFromArguments(argumentsList.filter((file, index) => (
  file !== '--baseline'
  && (baselineArgumentIndex < 0 || index !== baselineArgumentIndex + 1)
)));
const findings = scan(files.length > 0 ? files : maintainedFiles());
const allowed = new Set((baseline.findings || []).map(findingKey));
const newFindings = findings.filter((finding) => !allowed.has(findingKey(finding)));
const currentKeys = new Set(findings.map(findingKey));
const removedFindings = (baseline.findings || []).filter(
  (finding) => !currentKeys.has(findingKey(finding))
);

if (newFindings.length > 0) {
  console.error('Modernization check failed: newly detected legacy API patterns.');
  for (const finding of newFindings) {
    console.error(`  ${finding.file}:${finding.line} ${finding.id}`);
  }
  process.exit(1);
}

console.log(`Modernization check passed (${findings.length} acknowledged finding(s)).`);
if (removedFindings.length > 0) {
  console.log(`Removed baseline findings: ${removedFindings.length}`);
}
