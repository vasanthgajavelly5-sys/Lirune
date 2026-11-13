const test = require('node:test');
const assert = require('node:assert/strict');

const Themes = require('../../js/themes');

// Helper to compute WCAG 2.0 relative luminance and contrast ratio
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = luminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = luminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test('Layout & Themes - Reader Theme Color Contrasts Meet Readability Thresholds', () => {
  const allThemes = Themes.READER_THEMES;
  assert.ok(Array.isArray(allThemes) && allThemes.length >= 8);

  for (const themeName of allThemes) {
    if (themeName === 'custom') continue;
    const colors = Themes.getThemeColors(themeName);
    assert.ok(colors.bg, `Theme ${themeName} must define bg color`);
    assert.ok(colors.text, `Theme ${themeName} must define text color`);

    const ratio = contrastRatio(colors.bg, colors.text);
    // WCAG AA requires at least 4.5:1 for body text
    assert.ok(
      ratio >= 4.5,
      `Theme ${themeName} text/bg contrast ratio (${ratio.toFixed(2)}) must meet WCAG AA minimum 4.5:1`
    );
  }
});

test('Layout Calculations - Viewport Auto Column Calculation Logic', () => {
  // Pure logic for column count decision based on window viewport width
  function determineColumnCount(viewportWidth, spreadSetting) {
    if (spreadSetting === 'single' || spreadSetting === 'none') return 1;
    if (spreadSetting === 'double') return 2;
    // Auto mode: single column on viewports under 1100px; 2 columns on >= 1100px
    return viewportWidth >= 1100 ? 2 : 1;
  }

  // Single mode forced
  assert.equal(determineColumnCount(1400, 'single'), 1);
  assert.equal(determineColumnCount(800, 'single'), 1);

  // Double mode forced
  assert.equal(determineColumnCount(1400, 'double'), 2);
  assert.equal(determineColumnCount(800, 'double'), 2);

  // Auto mode adaptive
  assert.equal(determineColumnCount(600, 'auto'), 1, 'Narrow width must use single column in auto');
  assert.equal(determineColumnCount(950, 'auto'), 1, 'Tablet portrait width must use single column in auto');
  assert.equal(determineColumnCount(1100, 'auto'), 2, 'Wide width must adapt to 2 columns in auto');
  assert.equal(determineColumnCount(1600, 'auto'), 2, 'Large desktop monitor must adapt to 2 columns in auto');
});

