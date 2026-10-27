const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Typography and Themes consistency test suite', () => {
  const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'settings.js'), 'utf8');
  const themesJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'themes.js'), 'utf8');
  const settingsUIJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'settingsUI.js'), 'utf8');
  const panelsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'panels.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // Verify font options present in settings.js
  const expectedFonts = [
    'Serif', 'Sans-Serif', 'Cormorant', 'Merriweather', 'Literata', 'Inter',
    'Lora', 'EBGaramond', 'Bitter', 'SourceSerif', 'OpenDyslexic', 'Playfair',
    'Vollkorn', 'Alegreya', 'Charter', 'Monospace', 'Original'
  ];
  for (const font of expectedFonts) {
    assert.ok(settingsJs.includes(font), `settings.js should define or handle font: ${font}`);
  }

  // Verify getFontCssStack exists in settings.js
  assert.ok(settingsJs.includes('function getFontCssStack'), 'settings.js must define getFontCssStack');
  assert.ok(settingsJs.includes('getFontCssStack'), 'settings.js must export getFontCssStack');

  // Verify all new themes in themes.js
  const expectedThemes = [
    'neutral', 'sepia', 'night', 'paper',
    'contrast1', 'contrast2', 'contrast3', 'contrast4',
    'nord', 'gruvbox', 'solarized', 'rosepine', 'dracula', 'mocha'
  ];
  for (const theme of expectedThemes) {
    assert.ok(themesJs.includes(`'${theme}'`), `themes.js should include theme in READER_THEMES: ${theme}`);
    assert.ok(themesJs.includes(`${theme}: {`), `themes.js should define THEME_COLORS for: ${theme}`);
    assert.ok(panelsCss.includes(`.theme-swatch-${theme}`), `panels.css must define .theme-swatch-${theme}`);
    assert.ok(settingsUIJs.includes(`data-theme="${theme}"`), `settingsUI.js must include swatch button for: ${theme}`);
  }
});

test('Custom Glass Dropdown suite — unified rounded dropdowns across settings and library', () => {
  const utilsJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
  const settingsUIJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'settingsUI.js'), 'utf8');
  const libraryJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'library.js'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');
  const panelsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'panels.css'), 'utf8');

  // Verify enhanceSelect and enhanceAllSelects in utils.js
  assert.ok(utilsJs.includes('enhanceSelect:'), 'Utils must define enhanceSelect');
  assert.ok(utilsJs.includes('enhanceAllSelects:'), 'Utils must define enhanceAllSelects');
  assert.ok(utilsJs.includes('custom-dropdown-trigger'), 'enhanceSelect must create custom-dropdown-trigger');
  assert.ok(utilsJs.includes('custom-dropdown-menu'), 'enhanceSelect must create custom-dropdown-menu');
  assert.ok(utilsJs.includes('custom-dropdown-item-check'), 'enhanceSelect must create item checkmark icon');

  // Verify settingsUI.js calls enhanceAllSelects
  assert.ok(settingsUIJs.includes('Utils.enhanceAllSelects(host)'), 'SettingsUI must enhance selects in renderQuick');
  assert.ok(settingsUIJs.includes('Utils.enhanceAllSelects(document.getElementById(\'settings-panel\'))'), 'SettingsUI must enhance selects on init');
  assert.ok(settingsUIJs.includes('_customDropdownSync?.()'), 'SettingsUI setSelect must sync custom dropdown');

  // Verify library.js delegates to Utils.enhanceSelect
  assert.ok(libraryJs.includes('Utils.enhanceSelect(select)'), 'Library must delegate enhanceSelect to Utils');

  // Verify CSS styles for custom dropdown
  assert.ok(componentsCss.includes('.custom-dropdown-menu'), 'components.css must style .custom-dropdown-menu');
  assert.ok(componentsCss.includes('border-radius: 16px'), 'components.css custom dropdown menu must have rounded 16px edges');
  assert.ok(componentsCss.includes('.custom-dropdown-item'), 'components.css must style .custom-dropdown-item');
  assert.ok(componentsCss.includes('.custom-dropdown-item.active'), 'components.css must style active dropdown item');
  assert.ok(panelsCss.includes('#settings-panel .custom-dropdown-menu'), 'panels.css must configure settings dropdown menu positioning');
});

