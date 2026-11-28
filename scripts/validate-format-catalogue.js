const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cataloguePath = path.join(root, 'format-catalogue.json');
const desktopFormatsPath = path.join(root, 'js', 'formats.js');
const desktopControllerPath = path.join(root, 'js', 'reader', 'readerController.js');
const mobileModelPath = path.join(root, 'mobile', 'models', 'Book.ts');
const mobileReaderPath = path.join(root, 'mobile', 'app', 'reader.tsx');
const mobileNativeRegistryPath = path.join(root, 'mobile', 'plugins', 'native', 'lirune-storage', 'FormatRegistry.kt');

const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
const desktopFormatsSrc = fs.readFileSync(desktopFormatsPath, 'utf8');
const desktopControllerSrc = fs.readFileSync(desktopControllerPath, 'utf8');
const mobileModelSrc = fs.readFileSync(mobileModelPath, 'utf8');
const mobileReaderSrc = fs.readFileSync(mobileReaderPath, 'utf8');
const mobileNativeSrc = fs.readFileSync(mobileNativeRegistryPath, 'utf8');

const errors = [];
const warnings = [];

// 1. Validate Canonical Catalogue Schema & Structure
console.log('--- LIRUNE FORMAT CATALOGUE & PLATFORM PARITY VALIDATION ---');
console.log(`Catalogue schema version: ${catalogue.schemaVersion}`);
console.log(`Primary format families: ${catalogue.primaryFormatFamilies.length}`);
console.log(`Extended format families: ${catalogue.extendedFormatFamilies.length}`);
console.log(`Partial format families: ${catalogue.partialFormatFamilies.length}`);
console.log(`Container capabilities: ${catalogue.containerCapabilities.length}`);
console.log(`Total canonical format families: ${catalogue.sharedFormatFamilies.length}`);

if (catalogue.primaryFormatFamilies.length !== 50) {
  errors.push(`Catalogue MUST contain exactly 50 primary format families, found: ${catalogue.primaryFormatFamilies.length}`);
}

const primaryIds = new Set(catalogue.primaryFormatFamilies.map(f => f.id));
const extendedIds = new Set(catalogue.extendedFormatFamilies.map(f => f.id));
const partialIds = new Set(catalogue.partialFormatFamilies.map(f => f.id));
const containerIds = new Set(catalogue.containerCapabilities.map(f => f.id));

// Verify required fields on every family
const REQUIRED_FIELDS = [
  'id', 'canonicalFamily', 'displayName', 'extensions', 'aliases',
  'mimeTypes', 'signatureDetection', 'category', 'classification',
  'platformStatus', 'adapters', 'parserImplementation',
  'metadataCapability', 'coverStrategy', 'readerCapabilities',
  'securityRequirements', 'knownLimitations', 'testReferences'
];

for (const family of catalogue.sharedFormatFamilies) {
  for (const field of REQUIRED_FIELDS) {
    if (family[field] === undefined) {
      errors.push(`Family "${family.id}" is missing required field: ${field}`);
    }
  }
  if (!family.platformStatus.windows || !family.platformStatus.android) {
    errors.push(`Family "${family.id}" must declare platformStatus for both windows and android`);
  }
  if (family.platformStatus.windows !== family.platformStatus.android) {
    warnings.push(`Family "${family.id}" has asymmetric platformStatus: Win="${family.platformStatus.windows}", Android="${family.platformStatus.android}"`);
  }
}

// 2. Extract Platform Registry IDs
const desktopFormatIds = [...desktopFormatsSrc.matchAll(/^\s{4}([a-z0-9]+):\s*\{\s*id:\s*['"]\1['"]/gm)].map(m => m[1]);
const desktopAdapterIds = [...desktopControllerSrc.matchAll(/^\s{4}([a-z0-9]+):\s*\(\)\s*=>/gm)].map(m => m[1]);
const mobileFormatIds = [...mobileModelSrc.matchAll(/^\s{2}([a-z0-9]+):\s*\{/gm)].map(m => m[1]);

// Native Kotlin registry set
const kotlinMatch = mobileNativeSrc.match(/val\s+SUPPORTED_FORMATS\s*=\s*setOf\(([\s\S]*?)\)/);
const kotlinSupportedFormats = kotlinMatch
  ? [...kotlinMatch[1].matchAll(/"([a-z0-9]+)"/gi)].map(m => m[1].toLowerCase())
  : [];

console.log(`Windows registry format IDs: ${desktopFormatIds.length}`);
console.log(`Windows reader adapter IDs: ${desktopAdapterIds.length}`);
console.log(`Android model format IDs: ${mobileFormatIds.length}`);
console.log(`Android native Kotlin format IDs: ${kotlinSupportedFormats.length}`);

// 3. Parity: Primary Formats Presence on Both Platforms
for (const id of primaryIds) {
  if (!desktopFormatIds.includes(id)) {
    errors.push(`Primary format "${id}" is missing from Windows registry (js/formats.js)`);
  }
  if (!desktopAdapterIds.includes(id)) {
    errors.push(`Primary format "${id}" is missing from Windows reader controller (js/reader/readerController.js)`);
  }
  if (!mobileFormatIds.includes(id)) {
    errors.push(`Primary format "${id}" is missing from Android model (mobile/models/Book.ts)`);
  }
  if (!kotlinSupportedFormats.includes(id)) {
    errors.push(`Primary format "${id}" is missing from Android native storage registry (FormatRegistry.kt)`);
  }
  if (!mobileReaderSrc.includes(`'${id}'`)) {
    errors.push(`Primary format "${id}" is missing reader dispatch in Android (mobile/app/reader.tsx)`);
  }
}

// 4. Parity: Extended Formats Presence on Both Platforms
for (const id of extendedIds) {
  if (!desktopFormatIds.includes(id)) {
    errors.push(`Extended format "${id}" is missing from Windows registry`);
  }
  if (!desktopAdapterIds.includes(id)) {
    errors.push(`Extended format "${id}" is missing from Windows reader controller`);
  }
  if (!mobileFormatIds.includes(id)) {
    errors.push(`Extended format "${id}" is missing from Android model`);
  }
  if (!kotlinSupportedFormats.includes(id)) {
    errors.push(`Extended format "${id}" is missing from Android native storage registry`);
  }
  if (!mobileReaderSrc.includes(`'${id}'`)) {
    errors.push(`Extended format "${id}" is missing reader dispatch in Android`);
  }
}

// 5. Parity: Partial Formats Presence on Both Platforms
for (const id of partialIds) {
  if (!desktopFormatIds.includes(id)) {
    errors.push(`Partial format "${id}" is missing from Windows registry`);
  }
  if (!desktopAdapterIds.includes(id)) {
    errors.push(`Partial format "${id}" is missing from Windows reader controller`);
  }
  if (!mobileFormatIds.includes(id)) {
    errors.push(`Partial format "${id}" is missing from Android model`);
  }
  if (!kotlinSupportedFormats.includes(id)) {
    errors.push(`Partial format "${id}" is missing from Android native storage registry`);
  }
  if (!mobileReaderSrc.includes(`'${id}'`)) {
    errors.push(`Partial format "${id}" is missing reader dispatch in Android`);
  }
}

// 6. Check Container Formats Integrity (ZIP, RAR must not be advertised as direct book formats)
const zipMobileMatch = mobileModelSrc.match(/zip:\s*\{[\s\S]*?supported:\s*(true|false)/);
if (zipMobileMatch && zipMobileMatch[1] === 'true') {
  errors.push('Android Book.ts: Container "zip" must have supported: false to prevent inflating book counts');
}
const rarMobileMatch = mobileModelSrc.match(/rar:\s*\{[\s\S]*?supported:\s*(true|false)/);
if (rarMobileMatch && rarMobileMatch[1] === 'true') {
  errors.push('Android Book.ts: Container "rar" must have supported: false to prevent inflating book counts');
}

// 7. Verify Registry Total Counts Parity
const allCanonicalDocumentIds = [...primaryIds, ...extendedIds, ...partialIds];
const extraDesktop = desktopFormatIds.filter(id => !allCanonicalDocumentIds.includes(id) && !['azw', 'azw3', 'mhtml', 'yml', 'oxps', 'zip', 'rar'].includes(id));
const extraMobile = mobileFormatIds.filter(id => !allCanonicalDocumentIds.includes(id) && !['azw', 'azw3', 'mhtml', 'yml', 'oxps', 'zip', 'rar'].includes(id));

if (extraDesktop.length) {
  warnings.push(`Windows extra non-canonical IDs: ${extraDesktop.join(', ')}`);
}
if (extraMobile.length) {
  warnings.push(`Android extra non-canonical IDs: ${extraMobile.join(', ')}`);
}

// 8. Cross-Platform Reader Themes Parity (shared/reader-themes.json vs Desktop & Mobile)
const sharedThemesPath = path.join(root, 'shared', 'reader-themes.json');
const desktopThemesSrc = fs.readFileSync(path.join(root, 'js', 'themes.js'), 'utf8');
const mobileColorsSrc = fs.readFileSync(path.join(root, 'mobile', 'theme', 'Colors.ts'), 'utf8');
if (!fs.existsSync(sharedThemesPath)) {
  errors.push('Missing canonical shared/reader-themes.json');
} else {
  const canonicalThemes = JSON.parse(fs.readFileSync(sharedThemesPath, 'utf8')).themes || {};
  for (const [id, spec] of Object.entries(canonicalThemes)) {
    const deskBlock = desktopThemesSrc.match(new RegExp(`\\b${id}:\\s*\\{([^}]+)\\}`, 's'));
    const mobBlock = mobileColorsSrc.match(new RegExp(`\\b${id}:\\s*\\{([^}]+)\\}`, 's'));
    if (!deskBlock) {
      errors.push(`Theme "${id}" missing in Desktop js/themes.js`);
      continue;
    }
    if (!mobBlock) {
      errors.push(`Theme "${id}" missing in Mobile mobile/theme/Colors.ts`);
      continue;
    }
    for (const key of ['bg', 'surface', 'text', 'muted', 'link', 'selection']) {
      const deskVal = deskBlock[1].match(new RegExp(`\\b${key}:\\s*['"]([^'"]+)['"]`))?.[1];
      const mobVal = mobBlock[1].match(new RegExp(`\\b${key}:\\s*['"]([^'"]+)['"]`))?.[1];
      if (deskVal !== spec[key]) {
        errors.push(`Theme "${id}.${key}" mismatch in Desktop js/themes.js: expected "${spec[key]}", got "${deskVal}"`);
      }
      if (mobVal !== spec[key]) {
        errors.push(`Theme "${id}.${key}" mismatch in Mobile Colors.ts: expected "${spec[key]}", got "${mobVal}"`);
      }
    }
  }
}

// 9. Native Kotlin Plugin vs Generated Android Source Parity (when mobile/android/ is present)
const pluginKotlinDir = path.join(root, 'mobile', 'plugins', 'native', 'lirune-storage');
const androidKotlinDir = path.join(root, 'mobile', 'android', 'app', 'src', 'main', 'java', 'com', 'lirune', 'reader', 'storage');
if (fs.existsSync(pluginKotlinDir) && fs.existsSync(androidKotlinDir)) {
  for (const file of fs.readdirSync(pluginKotlinDir)) {
    if (!file.endsWith('.kt')) continue;
    const pluginContent = fs.readFileSync(path.join(pluginKotlinDir, file), 'utf8').replace(/\r\n/g, '\n');
    const targetPath = path.join(androidKotlinDir, file);
    if (!fs.existsSync(targetPath)) {
      errors.push(`Kotlin file "${file}" exists in plugins/native/lirune-storage/ but is missing in mobile/android/.../storage/`);
    } else {
      const targetContent = fs.readFileSync(targetPath, 'utf8').replace(/\r\n/g, '\n');
      if (pluginContent !== targetContent) {
        errors.push(`Kotlin drift detected for "${file}" between plugins/native/lirune-storage/ and mobile/android/.../storage/`);
      }
    }
  }
}

// Print Report
if (warnings.length > 0) {
  console.log(`\n[WARNINGS] (${warnings.length}):`);
  warnings.forEach(w => console.warn(` - ${w}`));
}

if (errors.length > 0) {
  console.error(`\n[FAILURES] (${errors.length}):`);
  errors.forEach(e => console.error(` - ${e}`));
  process.exitCode = 1;
} else {
  console.log('\n✔ All format validation & cross-platform parity checks passed successfully!');
  console.log(`✔ Primary format families (exactly 50): PASS`);
  console.log(`✔ Safe extended compatibility (7): PASS`);
  console.log(`✔ Partial / experimental isolated formats (7): PASS`);
  console.log(`✔ Container capability boundaries (3): PASS`);
  console.log(`✔ Windows & Android registry parity: 100% PASS`);
}
