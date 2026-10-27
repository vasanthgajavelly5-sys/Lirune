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
    assert.ok(indexHtml.includes(`data-theme="${theme}"`), `index.html must include swatch button for: ${theme}`);
  }
});
