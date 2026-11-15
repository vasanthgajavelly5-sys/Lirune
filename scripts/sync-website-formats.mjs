import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('..', 'Lirune-Website');
const appRoot = path.resolve('.');
const cataloguePath = path.join(appRoot, 'format-catalogue.json');
const targetPath = path.join(root, 'src', 'data', 'formats.json');

const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));

const CATEGORY_MAP = {
  'ebook': 'E-Books & Literature',
  'document': 'Documents & Office',
  'spreadsheet': 'Spreadsheets & Tables',
  'presentation': 'Presentations & Slides',
  'comic': 'Comics & Manga',
  'image': 'High-Resolution Images',
  'web': 'Web Archives & HTML',
  'structured-text': 'Structured Text & Data',
  'communication': 'Email, Contacts & Calendars',
  'container': 'Archive Containers (Inspection)'
};

const websiteFormats = [];

for (const fam of catalogue.primaryFormatFamilies) {
  websiteFormats.push({
    id: fam.id,
    name: fam.displayName,
    extensions: fam.extensions.map(e => `.${e}`),
    category: CATEGORY_MAP[fam.category] || fam.category,
    layout: fam.readerCapabilities.typography ? 'Reflowable' : (fam.readerCapabilities.zoom ? 'Fixed / Visual' : 'Structured'),
    windows: 'Fully supported',
    android: 'Fully supported',
    status: 'Fully supported',
    classification: 'primary',
    engine: `${fam.adapters.windows} (Desktop) / ${fam.adapters.android} (Android)`,
    details: `Full native parsing and reader support for ${fam.displayName}. Metadata extraction: ${fam.metadataCapability}. Cover: ${fam.coverStrategy}.`,
    limitations: fam.knownLimitations || 'None for DRM-free files.'
  });
}

// Add container capabilities distinctly marked
for (const c of catalogue.containerCapabilities) {
  websiteFormats.push({
    id: c.id,
    name: c.displayName,
    extensions: c.extensions.map(e => `.${e}`),
    category: CATEGORY_MAP['container'],
    layout: 'Archive Container (Inspection)',
    windows: 'Supported (Container Inspection)',
    android: 'Supported (Container Inspection)',
    status: 'Container Capability',
    classification: 'container',
    engine: 'Native Archive Inspection Engine',
    details: c.purpose,
    limitations: 'Archive container only; directly opened archives inspect internal entries rather than rendering as a single book.'
  });
}

fs.writeFileSync(targetPath, JSON.stringify(websiteFormats, null, 2), 'utf8');
console.log(`Generated website formats.json with ${websiteFormats.length} entries (${catalogue.primaryFormatFamilies.length} primary families + ${catalogue.containerCapabilities.length} containers).`);
