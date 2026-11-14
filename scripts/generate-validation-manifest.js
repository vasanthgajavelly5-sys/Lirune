const fs = require('fs');
const path = require('path');

const catalogue = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'format-catalogue.json'), 'utf8')
);

const manifestEntries = [];

// Helper to construct sample slot
function createSampleSlot(tier, formatId, ext) {
  return {
    tier, // 'low' | 'medium' | 'high'
    targetFilename: `${formatId}_sample_${tier}.${ext}`,
    sourceUrl: null,
    licence: 'Public Domain / CC0 / Open Source / Permissive Test Sample',
    expectedSha256: null,
    actualSha256: null,
    fileSizeBytes: null,
    validationStatus: 'staged_manifest_ready',
    validationEvidence: {
      windowsResult: 'NOT TESTED',
      androidResult: 'NOT TESTED',
      libraryIntegration: 'NOT TESTED',
      coverThumbnailResult: 'NOT TESTED',
      applicableReaderFeatures: 'NOT TESTED',
      settingsPersistence: 'NOT TESTED',
      offlineBehaviour: 'NOT TESTED',
      securityIntegrity: 'NOT TESTED'
    }
  };
}

for (const family of catalogue.sharedFormatFamilies) {
  const primaryExt = family.extensions[0].replace(/^\./, '');
  manifestEntries.push({
    formatId: family.id,
    canonicalFamily: family.canonicalFamily,
    displayName: family.displayName,
    category: family.category,
    classification: family.classification,
    primaryExtension: primaryExt,
    allExtensions: family.extensions,
    aliases: family.aliases,
    mimeTypes: family.mimeTypes,
    currentPlatformStatus: family.platformStatus,
    targetFinalClassification: family.classification === 'primary' ? 'PRIMARY_50' : family.classification.toUpperCase(),
    samples: [
      createSampleSlot('low', family.id, primaryExt),
      createSampleSlot('medium', family.id, primaryExt),
      createSampleSlot('high', family.id, primaryExt)
    ]
  });
}

for (const container of catalogue.containerCapabilities) {
  const primaryExt = container.extensions[0].replace(/^\./, '');
  manifestEntries.push({
    formatId: container.id,
    canonicalFamily: container.displayName,
    displayName: container.displayName,
    category: 'container',
    classification: 'container',
    primaryExtension: primaryExt,
    allExtensions: container.extensions,
    aliases: [],
    mimeTypes: container.mimeTypes,
    currentPlatformStatus: { windows: 'container_inspection', android: 'container_inspection' },
    targetFinalClassification: 'CONTAINER_CAPABILITY',
    samples: [
      createSampleSlot('low', container.id, primaryExt),
      createSampleSlot('medium', container.id, primaryExt),
      createSampleSlot('high', container.id, primaryExt)
    ]
  });
}

const manifest = {
  manifestSchemaVersion: 1,
  campaign: 'Phase 2 Real-File Three-Sample Validation Campaign',
  description: 'Prepared test manifest schema for all candidate format families across Windows and Android',
  totalFormatEntries: manifestEntries.length,
  totalSampleSlots: manifestEntries.length * 3,
  matrix: manifestEntries
};

fs.writeFileSync(
  path.resolve(__dirname, '..', 'format-validation-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8'
);

console.log('Successfully generated format-validation-manifest.json:');
console.log(`- Total Format Entries: ${manifest.totalFormatEntries}`);
console.log(`- Total Sample Slots (3 per format): ${manifest.totalSampleSlots}`);
