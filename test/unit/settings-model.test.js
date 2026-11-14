const test = require('node:test');
const assert = require('node:assert/strict');

// Minimal browser/DOM shims for testing ReaderSettings logic in pure Node
global.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  documentElement: { setAttribute: () => {}, style: { setProperty: () => {} } },
  body: { setAttribute: () => {} }
};
global.CustomEvent = class CustomEvent { constructor(name, detail) { this.name = name; this.detail = detail; } };
global.NoveraDB = {
  getPref: async (k, def) => def,
  setPref: async () => {},
  deletePref: async () => {}
};
global.Utils = {
  escapeHTML: s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  showToast: () => {}
};
global.Reader = {
  applySettings: () => {},
  applyAllSettings: () => {},
  updateProgressUI: () => {}
};

const ReaderSettings = require('../../js/settings');

test('Settings Model - Defaults and Core Schema', () => {
  const defaults = ReaderSettings.defaults();
  assert.ok(defaults, 'defaults object must be defined');

  // Typography defaults
  assert.equal(defaults.fontSize, 18, 'Default font size should be 18');
  assert.equal(defaults.lineHeight, 1.6, 'Default line height should be 1.6');
  assert.equal(defaults.fontFamily, 'Cormorant Garamond', 'Default font family should be Cormorant Garamond');
  assert.equal(defaults.alignment, 'left', 'Default alignment should be left');
  assert.equal(defaults.flow, 'paginated', 'Default flow should be paginated');
  assert.equal(defaults.spread, 'auto', 'Default spread mode should be auto');

  // Spacing defaults
  assert.equal(defaults.letterSpacing, 0.0, 'Default letter spacing should be 0.0');
  assert.equal(defaults.wordSpacing, 0.0, 'Default word spacing should be 0.0');
  assert.equal(defaults.paragraphSpacing, 1.0, 'Default paragraph spacing should be 1.0');
  assert.equal(defaults.margin, 10, 'Default margin should be 10');

  // Reader display defaults
  assert.equal(defaults.progressShowChapter, true, 'Default progressShowChapter should be true');
  assert.equal(defaults.progressShowPage, true, 'Default progressShowPage should be true');
  assert.equal(defaults.progressShowPercent, true, 'Default progressShowPercent should be true');
  assert.equal(defaults.perBookOverride, false, 'Default perBookOverride should be false');
});

test('Settings Model - Font Stacks and Available Fonts', () => {
  const fonts = ReaderSettings.getFonts();
  assert.ok(Array.isArray(fonts) && fonts.length > 5, 'Should expose a rich list of reader fonts');
  const fontIds = fonts.map(f => f.id);
  assert.ok(fontIds.includes('Serif'));
  assert.ok(fontIds.includes('Sans-Serif'));
  assert.ok(fontIds.includes('Monospace'));
  assert.ok(fontIds.includes('OpenDyslexic'));

  // Test getFontCssStack mappings
  const serifStack = ReaderSettings.getFontCssStack('Serif');
  assert.ok(serifStack.includes('serif'), 'Serif stack should contain fallback serif');

  const sansStack = ReaderSettings.getFontCssStack('Sans-Serif');
  assert.ok(sansStack.includes('sans-serif'), 'Sans stack should contain sans-serif');

  const monoStack = ReaderSettings.getFontCssStack('Monospace');
  assert.ok(monoStack.includes('monospace'), 'Monospace stack should contain monospace');

  const dyslexicStack = ReaderSettings.getFontCssStack('OpenDyslexic');
  assert.ok(dyslexicStack.includes('OpenDyslexic'), 'OpenDyslexic should be in its stack');
});

test('Settings Model - Reading Profiles Management', async () => {
  const profiles = ReaderSettings.getProfiles();
  assert.ok(Array.isArray(profiles), 'Profiles should return an array');
  assert.ok(profiles.length >= 1, 'Should have at least 1 default profile');

  const defProfile = profiles.find(p => p.id === 'default');
  assert.ok(defProfile, 'A default profile must exist');
  assert.ok(defProfile.name.includes('Default'));

  // Set active typography and save a new custom profile
  ReaderSettings.setSetting('fontSize', 22, false);
  ReaderSettings.setSetting('lineHeight', 1.8, false);
  ReaderSettings.setSetting('alignment', 'left', false);

  const custom = await ReaderSettings.saveProfile('Night Focus');
  assert.ok(custom && custom.id, 'saveProfile should return saved profile with an id');

  const updatedProfiles = ReaderSettings.getProfiles();
  assert.ok(updatedProfiles.some(p => p.name === 'Night Focus'), 'Newly saved profile must be listed');

  // Change active settings
  ReaderSettings.setSetting('fontSize', 14, false);
  assert.equal(ReaderSettings.getSettings().fontSize, 14);

  // Apply profile
  const applied = await ReaderSettings.applyProfile(custom.id);
  assert.ok(applied, 'applyProfile should succeed for existing profile');
  const activeSettings = ReaderSettings.getSettings();
  assert.equal(activeSettings.fontSize, 22);
  assert.equal(activeSettings.lineHeight, 1.8);
  assert.equal(activeSettings.alignment, 'left');

  // Deleting default profile should be rejected
  const deleteDefaultResult = await ReaderSettings.deleteProfile('default');
  assert.equal(deleteDefaultResult, false, 'Default profile cannot be deleted');

  // Delete custom profile
  const deleteCustomResult = await ReaderSettings.deleteProfile(custom.id);
  assert.equal(deleteCustomResult, true, 'Custom profile should be deletable');
});

test('Settings Model - Per-Book Overrides Lifecycle', async () => {
  // Reset settings
  ReaderSettings.reset();
  const globalFontSize = ReaderSettings.getSettings().fontSize;

  // Simulate opening Book A
  await ReaderSettings.loadBookSettings('book-alpha-123');
  assert.equal(ReaderSettings.getCurrentBookId(), 'book-alpha-123');
  assert.equal(ReaderSettings.getSettings().perBookOverride, false);

  // Enable per-book override for Book A
  ReaderSettings.setPerBookOverride(true);
  ReaderSettings.setSetting('fontSize', 26, false);
  assert.equal(ReaderSettings.getSettings().fontSize, 26);

  // Simulate unloading Book A
  await ReaderSettings.unloadBookSettings();
  assert.equal(ReaderSettings.getCurrentBookId(), null);

  // Settings should revert to global
  assert.equal(ReaderSettings.getSettings().fontSize, globalFontSize, 'Unloading book should restore global settings');
});
