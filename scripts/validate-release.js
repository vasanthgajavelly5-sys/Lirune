/**
 * Lirune Reader — release validation.
 *
 * Three deterministic layers, none of which touch the network or compare
 * timestamps, so repeated runs on the same tree always produce the same
 * verdict:
 *
 *   1. Configuration   — always runs. Version coherence, the packaging
 *                        allowlist, the NSIS include, and the promise that no
 *                        development-only material can reach production.
 *   2. Freshness       — runs when dist/ holds artifacts for the current
 *                        version. A stale artifact from an earlier build is
 *                        rejected rather than shipped.
 *   3. Contents        — runs when app.asar exists. The archive must actually
 *                        contain the runtime files the application loads, and
 *                        must not contain development material.
 *
 * `--config` stops after layer 1, which lets the packaging rules be checked on
 * a machine that has not built anything yet.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const packageJson = require(path.join(root, 'package.json'));
const version = packageJson.version;

const storeMode = process.argv.includes('--store');
const configOnly = process.argv.includes('--config');

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);
const note = (message) => notes.push(message);

// ---------------------------------------------------------------------------
// Glob matching for the packaging allowlist.
//
// build.files uses a small, well understood subset: exact paths, `dir/**`
// trees, and `!` negations that win over any earlier include. A directory
// pattern also matches everything beneath it, matching how electron-builder
// expands a path that has no magic characters.
// ---------------------------------------------------------------------------

/**
 * Expand `{a,b}` alternation, including the empty alternative in `{,/**}` that
 * electron-builder patterns use to mean "the directory itself and everything
 * under it".
 */
function expandBraces(pattern) {
  const open = pattern.indexOf('{');
  if (open === -1) return [pattern];
  let depth = 0;
  let close = -1;
  for (let i = open; i < pattern.length; i += 1) {
    if (pattern[i] === '{') depth += 1;
    else if (pattern[i] === '}') {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close === -1) return [pattern];

  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const body = pattern.slice(open + 1, close);

  const parts = [];
  let current = '';
  let inner = 0;
  for (const char of body) {
    if (char === '{') inner += 1;
    if (char === '}') inner -= 1;
    if (char === ',' && inner === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);

  return parts.flatMap((part) => expandBraces(head + part + tail));
}

function toRegExp(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` spans directories and may match nothing at all.
        if (pattern[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if ('\\^$.|+()[]{}'.includes(char)) source += '\\';
    source += char;
  }
  return new RegExp(`^${source}$`);
}

const compile = (pattern) => expandBraces(pattern).map(toRegExp);
const test = (rules, value) => rules.some((rule) => rule.test(value));

const patterns = (packageJson.build && packageJson.build.files) || [];
const includes = [];
const excludes = [];
for (const raw of patterns) {
  if (typeof raw !== 'string') continue;
  const negated = raw.startsWith('!');
  // The `!` marks the rule as an exclusion; it is not part of the path.
  const pattern = raw.replace(/^!/, '').replace(/^\.\//, '').replace(/\\/g, '/');
  if (negated) excludes.push(pattern);
  else includes.push(pattern);
}
const includeMatchers = includes.flatMap(compile);
const excludeMatchers = excludes.flatMap(compile);

/**
 * Decide whether a repository-relative path survives the allowlist.
 *
 * electron-builder resolves the two halves of the tree differently. Files in
 * the application tree are matched against the include patterns exactly as
 * written. `node_modules/` is instead handled by the dependency collector,
 * which walks every production dependency and keeps all of it, applying only
 * the `!` negations. That is why the packaging rules for dependencies are
 * written as exclusions: a positive `node_modules/x/**` pattern does not
 * restrict anything.
 */
function isPackaged(candidate) {
  const value = candidate.replace(/\\/g, '/').replace(/^\.\//, '');
  const inDependencyTree = value.startsWith('node_modules/');
  if (!inDependencyTree) {
    let matched = false;
    for (const rule of includeMatchers) {
      if (rule.test(value)) matched = true;
    }
    for (const rule of excludeMatchers) {
      if (rule.test(value)) matched = false;
    }
    return matched;
  }
  return !test(excludeMatchers, value);
}

// ---------------------------------------------------------------------------
// Layer 1 — configuration
// ---------------------------------------------------------------------------

function walk(dir, base = dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, base, out);
    } else {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function checkVersionCoherence() {
  const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (!semver.test(version)) fail(`package.json version is not a release version: ${version}`);

  const lockPath = path.join(root, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    fail('package-lock.json is missing; the release must be reproducible from the lockfile');
  } else {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (lock.version !== version) {
      fail(`package-lock.json version ${lock.version} does not match package.json version ${version}`);
    }
    for (const [name, range] of Object.entries(packageJson.dependencies || {})) {
      const locked = lock.packages && lock.packages[`node_modules/${name}`];
      if (locked && locked.version && !range.includes(locked.version) && range !== '*') {
        note(`dependency ${name} is locked at ${locked.version} while package.json requests ${range}`);
      }
    }
  }
}

function checkRequiredRuntimeFiles() {
  // Every file the application loads from node_modules at runtime. If one of
  // these is not packaged the reader starts and then fails on first use.
  const required = [
    { file: 'node_modules/epubjs/dist/epub.min.js', why: 'index.html loads the EPUB.js browser bundle' },
    { file: 'node_modules/jszip/dist/jszip.min.js', why: 'index.html loads the JSZip browser bundle' },
    { file: 'node_modules/pdfjs-dist/build/pdf.min.mjs', why: 'js/reader/pdfjs-loader.js imports the pdf.js module' },
    { file: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs', why: 'js/reader/pdfjs-loader.js sets it as the pdf.js worker' }
  ];

  for (const { file, why } of required) {
    if (!isPackaged(file)) fail(`${file} is not covered by build.files but is required at runtime (${why})`);
    if (!fs.existsSync(path.join(root, file))) {
      fail(`${file} is required at runtime but is not installed; run npm ci before building`);
    }
  }

  // The application files the archive must carry.
  for (const file of ['main.js', 'preload.js', 'index.html', 'scripts/storage-contract.js']) {
    if (!isPackaged(file)) fail(`${file} is not covered by build.files`);
  }
  for (const dir of ['js', 'css', 'assets']) {
    if (!isPackaged(`${dir}/x`)) fail(`build.files does not cover the ${dir}/ tree`);
  }
}

function checkNsisInclude() {
  const nsis = (packageJson.build && packageJson.build.nsis) || {};
  const include = nsis.include;
  if (include == null || String(include).trim() === '') {
    if (fs.existsSync(path.join(root, 'scripts', 'nsis-include.nsh'))) {
      note('scripts/nsis-include.nsh exists but build.nsis.include is not set, so electron-builder will ignore it');
    }
    return;
  }
  // electron-builder throws InvalidConfigurationError when a configured include
  // cannot be resolved, which turns a stale path into a failed build.
  const candidates = [path.join(root, include), path.join(root, 'build', include)];
  if (!candidates.some((candidate) => fs.existsSync(candidate))) {
    fail(`build.nsis.include points at "${include}" but that file does not exist; electron-builder cannot resolve it`);
  }
}

/**
 * Development-only material that must never reach a production build. These
 * are checked against the allowlist so a future permissive pattern is caught
 * before it is built, not after.
 */
const FORBIDDEN_PRODUCTION_PATHS = [
  { match: /^qa(\/|$)/, why: 'QA automation harness' },
  { match: /^test(\/|$)/, why: 'unit tests' },
  { match: /^downloads(\/|$)/, why: 'downloader scratch directory' },
  { match: /^\.qa-userdata(\/|$)/, why: 'QA profile data' },
  { match: /^docs(\/|$)/, why: 'internal documentation' },
  { match: /^mobile(\/|$)/, why: 'separate mobile application' },
  { match: /^mobile[\\/]/, why: 'separate mobile application' },
  { match: /^Batch[0-9]+-Fixes(\/|$)/, why: 'development scratch directory' }
];

const FORBIDDEN_FILE_NAMES = [
  { test: (name) => name === 'debug_page.html', why: 'debug scratch page' },
  { test: (name) => /\.(epub|azw3|mobi|cbz|cbr|fb2)$/i.test(name), why: 'book file' },
  { test: (name) => /\.(pfx|p12|pem|key|crt|cer|keystore|jks|epubcheck)$/i.test(name), why: 'certificate or key material' },
  { test: (name) => name === '.env' || name.startsWith('.env.'), why: 'local environment secrets' },
  { test: (name) => /(snapshot|baseline|golden)[-_.]/i.test(name) && /\.(json|txt|html|png)$/i.test(name), why: 'temporary test snapshot' }
];

function checkNoForbiddenProductionContent() {
  // Only the tracked source tree is scanned; node_modules is a third-party
  // tree whose contents are governed by the explicit allowlist rules above.
  for (const file of walk(root)) {
    const base = file.split('/').pop();
    const forbiddenPath = FORBIDDEN_PRODUCTION_PATHS.find((entry) => entry.match.test(file));
    if (forbiddenPath) {
      if (isPackaged(file)) fail(`${file} would be packaged but is ${forbiddenPath.why}`);
      continue;
    }
    const forbiddenFile = FORBIDDEN_FILE_NAMES.find((entry) => entry.test(base));
    if (forbiddenFile) {
      if (isPackaged(file)) fail(`${file} would be packaged but is ${forbiddenFile.why}`);
    }
  }
}

function checkNoPlatformBinaries() {
  // pdfjs-dist ships optional native decoders and a legacy build. Only the two
  // files the loader names may be packaged; everything else is dead weight.
  const pdfRoot = path.join(root, 'node_modules', 'pdfjs-dist');
  if (!fs.existsSync(pdfRoot)) return;
  for (const file of walk(pdfRoot, pdfRoot)) {
    const relative = `node_modules/pdfjs-dist/${file}`;
    if (!isPackaged(relative)) continue;
    // `LICENSE` is required by Apache-2.0 and the README carries the upstream
    // attribution the licence audit expects to travel with the shipped code.
    //
    // The sandbox bundle is deliberately absent. Only the pdf.js web viewer
    // loads it, through `GenericScripting`, and this application uses the core
    // library with a real Worker; neither pdf.min.mjs nor pdf.worker.min.mjs
    // references it.
    //
    // `cmaps/` and `standard_fonts/` are loaded on demand rather than by an
    // import. pdf.js fetches a CMap when a document uses a CJK or legacy
    // encoding, and falls back to the bundled standard fonts when a document
    // does not embed its own. Because that only happens for certain books, a
    // corpus of English test PDFs never exercises the path and no test would
    // notice the files were missing. They stay in the package.
    const allowed = new Set([
      'build/pdf.min.mjs',
      'build/pdf.worker.min.mjs',
      'LICENSE',
      'README.md',
      'package.json'
    ]);
    const conditional = file.startsWith('cmaps/') || file.startsWith('standard_fonts/');
    if (!allowed.has(file) && !conditional) {
      fail(`${relative} would be packaged but is not a file the PDF runtime loads`);
    }
  }
}

/**
 * Optional native dependencies pull in per-platform binaries for operating
 * systems this release never targets. They are large, they are not loaded, and
 * shipping a foreign-architecture binary is a licence and trust problem rather
 * than a convenience.
 */
const FORBIDDEN_DEPENDENCY_ROOTS = [
  { prefix: 'node_modules/@napi-rs/', why: 'optional native canvas binaries, one per platform' }
];

function checkNoOptionalNativeBinaries() {
  for (const { prefix, why } of FORBIDDEN_DEPENDENCY_ROOTS) {
    const dependencyRoot = path.join(root, prefix);
    if (!fs.existsSync(dependencyRoot)) continue;
    for (const file of walk(dependencyRoot, dependencyRoot)) {
      const relative = `${prefix}${file}`;
      if (isPackaged(relative)) fail(`${relative} would be packaged but is ${why}`);
    }
  }
}

checkVersionCoherence();
checkRequiredRuntimeFiles();
checkNsisInclude();
checkNoForbiddenProductionContent();
checkNoPlatformBinaries();
checkNoOptionalNativeBinaries();

// ---------------------------------------------------------------------------
// Layers 2 and 3 — artifacts. Skipped under --config.
// ---------------------------------------------------------------------------

const installer = path.join(dist, `Lirune Reader-${version}-Setup.exe`);
const storePackage = path.join(dist, `Lirune Reader-${version}-Setup.appx`);
const unpacked = path.join(dist, 'win-unpacked');
const executable = path.join(unpacked, 'Lirune Reader.exe');
const appArchive = path.join(unpacked, 'resources', 'app.asar');

function readArchive() {
  try {
    return require('@electron/asar');
  } catch {
    return null;
  }
}

function checkArtifacts() {
  const required = storeMode
    ? [['Store package', storePackage]]
    : [['installer', installer], ['application executable', executable], ['application archive', appArchive]];
  for (const [label, file] of required) {
    if (!fs.existsSync(file) || fs.statSync(file).size < 1024) {
      fail(`Missing or incomplete ${label}: ${file} (build the release before validating it)`);
    }
  }
  if (!fs.existsSync(dist)) return;

  for (const name of fs.readdirSync(dist)) {
    if (name === 'win-unpacked' || name === 'builder-debug.yml' || name === 'builder-effective-config.yaml' || name === 'latest.yml') continue;
    // An artifact for a version other than the one being released is a stale
    // build left over from an earlier release.
    const match = /^Lirune Reader-(.+?)-Setup\.(exe|appx|appxbundle|msix)$/.exec(name);
    if (match && match[1] !== version) {
      fail(`Stale release artifact for version ${match[1]} is present in dist/; remove it before publishing ${version}`);
    }
  }
}

function checkStoreManifest() {
  if (!fs.existsSync(storePackage) || fs.statSync(storePackage).size < 1024) return;
  const os = require('os');
  const archive = path.join(os.tmpdir(), `lirune-validate-${process.pid}.zip`);
  const extractDir = path.join(os.tmpdir(), `lirune-validate-${process.pid}`);
  require('child_process').execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Copy-Item '${storePackage}' '${archive}'; Expand-Archive -LiteralPath '${archive}' -DestinationPath '${extractDir}' -Force`
  ]);
  try {
    const manifest = fs.readFileSync(path.join(extractDir, 'AppxManifest.xml'), 'utf8');
    const expected = [
      // Anchored to the <Identity> element, and every pattern must expose a
      // capture group: the comparison below reads match[1], so a literal
      // pattern without one can never satisfy the check.
      ['Identity Name', /<Identity[^>]*\sName=['"]([^'"]*)['"]/, 'Lirune.LiruneReader'],
      ['Publisher', /Publisher=['"]([^'"]*)['"]/, 'CN=65585C77-A179-46B9-B0CA-60D868923F03'],
      ['PublisherDisplayName', /<PublisherDisplayName>([^<]*)<\/PublisherDisplayName>/, 'Lirune'],
      ['Version', new RegExp(`Version=['"]([^'"]*)['"]`), `${version}.0`],
      ['Application Id', /<Application[^>]*Id=['"]([^'"]*)['"]/, 'Lirune.LiruneReader']
    ];
    for (const [label, pattern, want] of expected) {
      const match = pattern.exec(manifest);
      if (!match) {
        fail(`Store package is missing ${label}`);
      } else if (match[1] !== want) {
        fail(`Store package ${label} is "${match[1]}" but must be "${want}"`);
      }
    }
    if (!/Publisher=['"]CN=ms['"]/.test(manifest)) {
      // guarded above by the exact publisher match
    } else {
      fail('Store package still uses the electron-builder placeholder publisher CN=ms');
    }
    if (!/fileTypeAssociation|epub/i.test(manifest)) {
      note('Store package manifest shows no .epub file association; confirm the registration in Partner Center');
    }
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

function checkArchiveContents() {
  if (!fs.existsSync(appArchive)) return;
  const asar = readArchive();
  if (!asar) {
    fail('Cannot inspect app.asar: @electron/asar is unavailable. Run npm ci before validating a build.');
    return;
  }
  const entries = asar.listPackage(appArchive).map((entry) => entry.replace(/\\/g, '/').replace(/^\//, ''));
  // asar lists directories as bare names with no trailing marker, so the file
  // set is derived from the archive header, which distinguishes the two.
  const header = asar.getRawHeader(appArchive).header;
  const files = new Set();
  // The full archive path, not the bare name. The header is a tree of basenames,
  // so a set built from the leaf names alone would report every runtime
  // dependency as missing even when it is present in the archive.
  const walkHeader = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files || {})) {
      const fullPath = prefix ? `${prefix}/${name}` : name;
      if (child.files) walkHeader(child, fullPath);
      else files.add(fullPath);
    }
  };
  walkHeader(header, '');
  const isFileEntry = (entry) => {
    let cursor = header;
    const parts = entry.split('/');
    for (let i = 0; i < parts.length; i += 1) {
      const child = cursor.files && cursor.files[parts[i]];
      if (!child) return false;
      if (i === parts.length - 1) return !child.files;
      cursor = child;
    }
    return false;
  };
  const present = files;
  // The archive file set is normalised to POSIX paths, but asar resolves
  // lookups with native separators, so reads go through this helper.
  const readFromArchive = (archive, posixPath) =>
    asar.extractFile(archive, posixPath.split('/').join(path.sep));

  // Freshness: the archive must have been built from the current source, not
  // merely carry the current version number.
  const embedded = JSON.parse(asar.extractFile(appArchive, 'package.json').toString('utf8'));
  if (embedded.version !== version) {
    fail(`app.asar reports version ${embedded.version} but the release version is ${version}; the artifact is stale`);
  }
  const sourceIndex = fs.readFileSync(path.join(root, 'index.html'));
  const archivedIndex = asar.extractFile(appArchive, 'index.html');
  if (crypto.createHash('sha256').update(sourceIndex).digest('hex')
    !== crypto.createHash('sha256').update(archivedIndex).digest('hex')) {
    fail('app.asar contains an index.html that differs from the source tree; the artifact is stale. Rebuild before releasing.');
  }
  const sourceMain = fs.readFileSync(path.join(root, 'main.js'));
  const archivedMain = asar.extractFile(appArchive, 'main.js');
  if (crypto.createHash('sha256').update(sourceMain).digest('hex')
    !== crypto.createHash('sha256').update(archivedMain).digest('hex')) {
    fail('app.asar contains a main.js that differs from the source tree; the artifact is stale. Rebuild before releasing.');
  }

  // Completeness: the runtime dependencies must actually be in the archive.
  for (const file of [
    'node_modules/epubjs/dist/epub.min.js',
    'node_modules/jszip/dist/jszip.min.js',
    'node_modules/pdfjs-dist/build/pdf.min.mjs',
    'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
  ]) {
    if (!present.has(file)) fail(`app.asar is missing ${file}, which the application loads at runtime`);
  }

  // Licence coverage for the third-party code that is shipped.
  for (const file of [
    'node_modules/epubjs/license',
    'node_modules/jszip/LICENSE.markdown',
    'node_modules/pdfjs-dist/LICENSE'
  ]) {
    if (!present.has(file)) fail(`app.asar is missing ${file}; shipped third-party code must carry its licence text`);
  }

  // Main-process dependencies must actually resolve inside the archive. The
  // renderer assets above only prove the browser bundles were shipped; a main
  // process `require()` that resolves to a file the packaging rules stripped
  // produces an app that crashes on startup, which no amount of asset
  // checking would catch.
  for (const entryPoint of ['main.js', 'preload.js', 'scripts/storage-contract.js']) {
    let source;
    try {
      source = readFromArchive(appArchive, entryPoint).toString('utf8');
    } catch {
      fail(`app.asar is missing ${entryPoint}`);
      continue;
    }
    for (const match of source.matchAll(/require\(\s*['"]([^'".][^'"]*)['"]\s*\)/g)) {
      const specifier = match[1];
      if (specifier.startsWith('node:')) continue;
      // `electron` and the Node built-ins are supplied by the runtime rather
      // than shipped inside the archive, so only real packages are checked.
      if (specifier === 'electron' || require('module').builtinModules.includes(specifier)) continue;
      const packageName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      if (!present.has(`node_modules/${packageName}/package.json`)) {
        fail(`app.asar is missing node_modules/${packageName}, which ${entryPoint} requires at startup`);
        continue;
      }
      const manifest = JSON.parse(
        readFromArchive(appArchive, `node_modules/${packageName}/package.json`).toString('utf8')
      );
      const main = (manifest.main || 'index.js').replace(/^\.\//, '');
      const entryCandidates = [
        `node_modules/${packageName}/${main}`,
        `node_modules/${packageName}/${main}.js`,
        `node_modules/${packageName}/${main}.json`,
        `node_modules/${packageName}/${main}/index.js`
      ];
      if (!entryCandidates.some((candidate) => present.has(candidate))) {
        fail(
          `app.asar ships node_modules/${packageName} but not its main entry ` +
            `(${main}), which ${entryPoint} requires at startup`
        );
      }
    }
  }

  // Production hygiene: nothing development-only may be inside the archive.
  for (const entry of entries) {
    const base = entry.split('/').pop();
    const forbiddenPath = FORBIDDEN_PRODUCTION_PATHS.find((rule) => rule.match.test(entry));
    if (forbiddenPath) {
      fail(`app.asar contains ${entry}, which is ${forbiddenPath.why}`);
      continue;
    }
    const forbiddenFile = FORBIDDEN_FILE_NAMES.find((rule) => rule.test(base));
    if (forbiddenFile) fail(`app.asar contains ${entry}, which is ${forbiddenFile.why}`);
  }

  // The allowlist must be honoured: nothing in the archive may be a file the
  // configuration would have excluded.
  for (const entry of entries) {
    // Only real files are subject to the allowlist.
    if (!isFileEntry(entry)) continue;
    if (isPackaged(entry)) continue;
    // electron-builder always injects the application's own package.json and
    // may add files that carry no licence obligation.
    if (entry === 'package.json') continue;
    if (entry.startsWith('node_modules/') && entry.endsWith('/package.json')) continue;
    if (entry.startsWith('node_modules/') && /^(licen[cs]e|copying|notice|authors)(\.[a-z0-9]+)?$/i.test(entry.split('/').pop())) continue;
    if (entry === 'node_modules/.bin' || entry.startsWith('node_modules/.bin/')) continue;
    fail(`app.asar contains ${entry}, which build.files excludes; the artifact does not match the packaging configuration`);
  }
}

if (!configOnly) {
  checkArtifacts();
  checkArchiveContents();
  checkStoreManifest();
}

// ---------------------------------------------------------------------------

if (failures.length) {
  console.error(`Release validation failed for Lirune Reader ${version}:`);
  console.error(failures.map((message) => `  - ${message}`).join('\n'));
  process.exit(1);
}

for (const message of notes) console.log(`Note: ${message}`);

console.log(`Validated Lirune Reader ${version} release configuration.`);
if (configOnly) {
  console.log('Artifact checks were skipped (--config).');
  console.log('Run npm run validate:release after building to check the artifacts themselves.');
} else if (storeMode) {
  console.log(`Store package: ${storePackage}`);
  console.log('Manifest values verified:');
  console.log('  Identity Name = Lirune.LiruneReader');
  console.log('  Publisher = CN=65585C77-A179-46B9-B0CA-60D868923F03');
  console.log('  PublisherDisplayName = Lirune');
  console.log(`  Version = ${version}.0`);
  console.log('  Application Id = Lirune.LiruneReader');
} else {
  console.log(`Installer: ${installer}`);
  console.log(`Application: ${executable}`);
  console.log('Uninstaller: must be verified by installing and uninstalling the generated installer on Windows.');
}
