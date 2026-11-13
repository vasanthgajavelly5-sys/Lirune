/**
 * Lirune Reader — Separate application and reader theme management.
 */

const ThemeManager = (() => {
  const APP_THEMES = ['dark', 'light'];
  const READER_THEMES = [
    'neutral', 'sepia', 'night', 'paper',
    'contrast1', 'contrast2', 'contrast3', 'contrast4',
    'nord', 'gruvbox', 'solarized', 'rosepine', 'dracula', 'mocha',
    'custom'
  ];
  const LEGACY_READER_THEMES = { dark: 'night', light: 'neutral', oled: 'contrast1', sepia: 'sepia' };
  let currentAppTheme = 'light';
  let currentReaderTheme = 'neutral';
  let customColors = null;
  let persistTimer = null;
  const DEFAULT_ACCENT = '#426F86';

  const THEME_COLORS = {
    neutral: {
      bg: '#FDFCF8',
      surface: '#FFFFFF',
      text: '#1A1410',
      muted: '#6B6055',
      link: '#245A8D',
      selection: 'rgba(36,90,141,0.25)',
      selectionText: '#000000'
    },
    sepia: {
      bg: '#F4ECDA',
      surface: '#FAF3E4',
      text: '#342921',
      muted: '#7A6B5D',
      link: '#8C5F20',
      selection: 'rgba(217,119,6,0.3)',
      selectionText: '#000000'
    },
    night: {
      bg: '#1B1D21', surface: '#24272C', text: '#E7E3D8', muted: '#A7A49B',
      link: '#8FC7E8', selection: 'rgba(143,199,232,0.35)', selectionText: '#FFFFFF'
    },
    paper: {
      bg: '#E9E0CF', surface: '#F7F0E2', text: '#2D271F', muted: '#756A5B',
      link: '#6B4F2A', selection: 'rgba(107,79,42,0.25)', selectionText: '#FFFFFF'
    },
    contrast1: {
      bg: '#000000', surface: '#111111', text: '#FFFFFF', muted: '#D0D0D0',
      link: '#FFFFFF', selection: 'rgba(255,255,255,0.38)', selectionText: '#000000'
    },
    contrast2: {
      bg: '#000000', surface: '#151515', text: '#FFFFFF', muted: '#E2E2E2',
      link: '#FFE600', selection: 'rgba(255,230,0,0.45)', selectionText: '#000000'
    },
    contrast3: {
      bg: '#071426', surface: '#102542', text: '#FFFFFF', muted: '#C6D5E8',
      link: '#7DD3FC', selection: 'rgba(125,211,252,0.42)', selectionText: '#00111F'
    },
    contrast4: {
      bg: '#E4F1E5', surface: '#F3FAF3', text: '#102B19', muted: '#4D6B55',
      link: '#176B3A', selection: 'rgba(23,107,58,0.28)', selectionText: '#FFFFFF'
    },
    nord: {
      bg: '#2E3440', surface: '#3B4252', text: '#ECEFF4', muted: '#D8DEE9',
      link: '#88C0D0', selection: 'rgba(136,192,208,0.35)', selectionText: '#FFFFFF'
    },
    gruvbox: {
      bg: '#282828', surface: '#32302F', text: '#EBDBB2', muted: '#A89984',
      link: '#FABD2F', selection: 'rgba(250,189,47,0.35)', selectionText: '#282828'
    },
    solarized: {
      bg: '#002B36', surface: '#073642', text: '#93A1A1', muted: '#657B83',
      link: '#2AA198', selection: 'rgba(42,161,152,0.35)', selectionText: '#002B36'
    },
    rosepine: {
      bg: '#191724', surface: '#1F1D2E', text: '#E0DEF4', muted: '#908CAA',
      link: '#EB6F92', selection: 'rgba(235,111,146,0.35)', selectionText: '#FFFFFF'
    },
    dracula: {
      bg: '#282A36', surface: '#343746', text: '#F8F8F2', muted: '#6272A4',
      link: '#BD93F9', selection: 'rgba(189,147,249,0.35)', selectionText: '#282A36'
    },
    mocha: {
      bg: '#1E1E2E', surface: '#24273A', text: '#CDD6F4', muted: '#A6ADC8',
      link: '#CBA6F7', selection: 'rgba(203,166,247,0.35)', selectionText: '#1E1E2E'
    }
  };

  const DEFAULT_CUSTOM_COLORS = { bg: '#FDFCF8', text: '#1A1410', muted: '#6B6055', link: '#245A8D', selection: '#8DB7D9' };

  function persist(key, value) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => NoveraDB.setPref(key, value), 250);
  }

  function normalizeHex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toUpperCase() : fallback;
  }

  function normalizeCustomColors(colors) {
    const source = colors || {};
    return {
      bg: normalizeHex(source.bg, DEFAULT_CUSTOM_COLORS.bg),
      text: normalizeHex(source.text, DEFAULT_CUSTOM_COLORS.text),
      muted: normalizeHex(source.muted, DEFAULT_CUSTOM_COLORS.muted),
      link: normalizeHex(source.link, DEFAULT_CUSTOM_COLORS.link),
      selection: normalizeHex(source.selection, DEFAULT_CUSTOM_COLORS.selection)
    };
  }

  function selectionColor(hex) {
    const value = hex.replace('#', '');
    return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},0.38)`;
  }

  async function init() {
    let cachedTheme = null;
    try { cachedTheme = localStorage.getItem('lirune-app-theme'); } catch (_) {}
    const dbAppTheme = await NoveraDB.getPref('appTheme', null);
    const legacyTheme = await NoveraDB.getPref('theme', null);
    const savedAppTheme = (dbAppTheme && APP_THEMES.includes(dbAppTheme))
      ? dbAppTheme
      : (cachedTheme && APP_THEMES.includes(cachedTheme))
        ? cachedTheme
        : (legacyTheme && APP_THEMES.includes(legacyTheme))
          ? legacyTheme
          : 'light';
    customColors = normalizeCustomColors(await NoveraDB.getPref('customReaderTheme', DEFAULT_CUSTOM_COLORS));
    const savedReaderTheme = await NoveraDB.getPref('readerTheme', 'neutral');
    applyAccent(await NoveraDB.getPref('accentColor', DEFAULT_ACCENT), false);
    const migratedReaderTheme = LEGACY_READER_THEMES[savedReaderTheme] || (READER_THEMES.includes(savedReaderTheme) ? savedReaderTheme : 'neutral');
    setAppTheme(savedAppTheme, false);
    setReaderTheme(migratedReaderTheme, savedReaderTheme !== migratedReaderTheme);
    updateCustomUI();
    bindUIEvents();
  }

  function setAppTheme(themeName, persist = true) {
    if (!APP_THEMES.includes(themeName)) themeName = 'light';
    currentAppTheme = themeName;

    document.documentElement.setAttribute('data-theme', themeName);
    document.body.setAttribute('data-theme', themeName);

    // Write to localStorage immediately so the anti-flash <script> in index.html
    // can apply the correct theme synchronously on next app launch, before IndexedDB
    // is even opened — this eliminates the dark→light repaint on startup.
    try { localStorage.setItem('lirune-app-theme', themeName); } catch (_) {}

    if (persist) {
      NoveraDB.setPref('appTheme', themeName);
    }

    document.querySelectorAll('[data-app-theme]').forEach(control => {
      const isActive = control.dataset.appTheme === themeName;
      control.classList.toggle('active', isActive);
      control.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    const themeSwitch = document.getElementById('app-theme-switch');
    if (themeSwitch) {
      const isDark = themeName === 'dark';
      themeSwitch.dataset.state = themeName;
      themeSwitch.setAttribute('aria-checked', isDark ? 'true' : 'false');
      themeSwitch.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    syncReaderPanels();
    window.dispatchEvent(new CustomEvent('novera:appthemechange', { detail: { theme: themeName } }));
  }

  function normalizeAccent(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toUpperCase() : DEFAULT_ACCENT;
  }

  function accentRgb(hex) {
    const value = normalizeAccent(hex).slice(1);
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }

  function applyAccent(value, shouldPersist = true) {
    const accent = normalizeAccent(value);
    const [red, green, blue] = accentRgb(accent);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const foreground = luminance > 0.62 ? '#11151B' : '#FFFFFF';
    const hover = `rgb(${Math.min(255, red + 18)},${Math.min(255, green + 18)},${Math.min(255, blue + 18)})`;
    const active = `rgb(${Math.max(0, red - 24)},${Math.max(0, green - 24)},${Math.max(0, blue - 24)})`;
    const root = document.documentElement;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-hover', hover);
    root.style.setProperty('--accent-active', active);
    // --accent-text is always a legible foreground that can be placed on top
    // of an accent-coloured surface; it is never the raw accent hex.
    root.style.setProperty('--accent-text', foreground);
    root.style.setProperty('--text-on-accent', foreground);
    root.style.setProperty('--gradient-accent', accent);
    root.style.setProperty('--gradient-accent-soft', `rgba(${red},${green},${blue},0.08)`);
    root.style.setProperty('--border-accent', `rgba(${red},${green},${blue},0.48)`);
    root.style.setProperty('--accent-subtle', `rgba(${red},${green},${blue},0.13)`);
    root.style.setProperty('--accent-subtle-h', `rgba(${red},${green},${blue},0.22)`);
    root.style.setProperty('--accent-glow', `rgba(${red},${green},${blue},0.08)`);
    root.style.setProperty('--accent-glow-strong', `rgba(${red},${green},${blue},0.12)`);
    const input = document.getElementById('app-accent-color');
    if (input) input.value = accent;
    syncReaderPanels();
    if (shouldPersist) persist('accentColor', accent);
  }

  function hexToRgb(hex) {
    const clean = normalizeHex(hex, '#000000').slice(1);
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16)
    ];
  }

  function rgbToHex(r, g, b) {
    const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
    return `#${[clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }

  function rgbaFromHex(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function mixHex(hexA, hexB, weightB) {
    const [r1, g1, b1] = hexToRgb(hexA);
    const [r2, g2, b2] = hexToRgb(hexB);
    const w = Math.max(0, Math.min(1, weightB));
    return rgbToHex(r1 + (r2 - r1) * w, g1 + (g2 - g1) * w, b1 + (b2 - b1) * w);
  }

  function relativeLuminance(hex) {
    const channels = hexToRgb(hex).map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(hexA, hexB) {
    const lumA = relativeLuminance(hexA);
    const lumB = relativeLuminance(hexB);
    const lighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function isDarkColor(hex) {
    return relativeLuminance(hex) < 0.22;
  }

  function pickReadableForeground(bgHex) {
    const lightOption = '#FFFFFF';
    const darkOption = '#11151B';
    return contrastRatio(bgHex, lightOption) >= contrastRatio(bgHex, darkOption)
      ? lightOption
      : darkOption;
  }

  const READER_PANEL_IDS = ['toc-panel', 'settings-panel', 'annotations-panel'];
  const READER_SCOPED_TOKEN_PROPS = [
    '--bg-base', '--bg-surface', '--bg-elevated', '--bg-card', '--bg-overlay',
    '--bg-glass', '--bg-glass-nav', '--bg-hover', '--bg-active', '--bg-input', '--bg-inset',
    '--text-primary', '--text-secondary', '--text-tertiary', '--text-muted', '--text-on-accent',
    '--border-subtle', '--border-default', '--border-strong', '--border-accent',
    '--accent', '--accent-hover', '--accent-active', '--accent-text',
    '--gradient-accent', '--accent-subtle', '--accent-subtle-h',
    '--accent-glow', '--accent-glow-strong',
    '--reader-panel-switch-bg', '--reader-panel-switch-active-bg',
    '--reader-panel-segment-bg', '--reader-panel-segment-active-bg', '--reader-panel-segment-active-fg',
    '--reader-panel-dropdown-bg', '--reader-panel-group-bg', '--reader-panel-btn-bg',
    'accent-color'
  ];

  function computeReaderPanelTokens(colors) {
    const bgHex = normalizeHex(colors.bg, '#FDFCF8');
    const surfaceHex = normalizeHex(colors.surface || colors.bg, bgHex);
    const textHex = normalizeHex(colors.text, '#1A1410');
    const mutedHex = normalizeHex(colors.muted, '#6B6055');
    const appAccent = normalizeAccent(document.documentElement.style.getPropertyValue('--accent') || DEFAULT_ACCENT);
    const dark = isDarkColor(surfaceHex);
    const accentFg = pickReadableForeground(appAccent);
    const accentStyle = document.documentElement.style;
    const accentToken = (name, fallback) => accentStyle.getPropertyValue(name).trim() || fallback;
    const accentActive = accentToken('--accent-active', mixHex(appAccent, '#000000', 0.16));

    return {
      isDark: dark,
      props: {
        '--bg-base': bgHex,
        '--bg-surface': surfaceHex,
        '--bg-elevated': mixHex(surfaceHex, dark ? '#FFFFFF' : '#000000', dark ? 0.06 : 0.03),
        '--bg-card': surfaceHex,
        '--bg-overlay': mixHex(surfaceHex, textHex, 0.08),
        '--bg-glass': rgbaFromHex(surfaceHex, 0.94),
        '--bg-glass-nav': rgbaFromHex(surfaceHex, 0.97),
        '--bg-hover': rgbaFromHex(textHex, dark ? 0.09 : 0.055),
        '--bg-active': rgbaFromHex(textHex, dark ? 0.15 : 0.09),
        '--bg-input': rgbaFromHex(textHex, dark ? 0.08 : 0.05),
        '--bg-inset': rgbaFromHex(textHex, dark ? 0.07 : 0.05),
        '--text-primary': textHex,
        '--text-secondary': mixHex(textHex, mutedHex, 0.35),
        '--text-tertiary': mutedHex,
        '--text-muted': mutedHex,
        '--text-on-accent': accentFg,
        '--border-subtle': rgbaFromHex(textHex, dark ? 0.13 : 0.1),
        '--border-default': rgbaFromHex(textHex, dark ? 0.22 : 0.16),
        '--border-strong': rgbaFromHex(textHex, dark ? 0.34 : 0.26),
        '--border-accent': accentToken('--border-accent', rgbaFromHex(appAccent, 0.54)),
        '--accent': appAccent,
        '--accent-hover': accentToken('--accent-hover', mixHex(appAccent, dark ? '#FFFFFF' : '#000000', 0.12)),
        '--accent-active': accentActive,
        '--accent-text': appAccent,
        '--gradient-accent': accentToken('--gradient-accent', appAccent),
        '--accent-subtle': accentToken('--accent-subtle', rgbaFromHex(appAccent, dark ? 0.18 : 0.14)),
        '--accent-subtle-h': accentToken('--accent-subtle-h', rgbaFromHex(appAccent, dark ? 0.26 : 0.22)),
        '--accent-glow': accentToken('--accent-glow', rgbaFromHex(appAccent, 0.2)),
        '--accent-glow-strong': accentToken('--accent-glow-strong', rgbaFromHex(appAccent, 0.32)),
        '--reader-panel-switch-bg': rgbaFromHex(textHex, dark ? 0.16 : 0.14),
        '--reader-panel-switch-active-bg': appAccent,
        '--reader-panel-segment-bg': rgbaFromHex(textHex, dark ? 0.08 : 0.055),
        '--reader-panel-segment-active-bg': mixHex(surfaceHex, '#FFFFFF', dark ? 0.16 : 0.65),
        '--reader-panel-segment-active-fg': textHex,
        '--reader-panel-dropdown-bg': rgbaFromHex(mixHex(surfaceHex, bgHex, 0.25), 0.96),
        '--reader-panel-group-bg': rgbaFromHex(textHex, dark ? 0.045 : 0.035),
        '--reader-panel-btn-bg': rgbaFromHex(textHex, dark ? 0.065 : 0.045),
        'accent-color': appAccent
      }
    };
  }

  function clearReaderPanelTheme(el) {
    if (!el) return;
    el.removeAttribute('data-reader-panel-theme');
    el.removeAttribute('data-reader-theme-name');
    if (el.style) {
      el.style.colorScheme = '';
      for (const prop of READER_SCOPED_TOKEN_PROPS) {
        el.style.removeProperty(prop);
      }
    }
  }

  function applyReaderPanelTheme(el, themeName, tokens) {
    if (!el || !el.style) return;
    el.setAttribute('data-reader-panel-theme', tokens.isDark ? 'dark' : 'light');
    el.setAttribute('data-reader-theme-name', themeName);
    el.style.colorScheme = tokens.isDark ? 'dark' : 'light';
    for (const [prop, val] of Object.entries(tokens.props)) {
      el.style.setProperty(prop, val);
    }
  }

  function syncReaderPanels(isReaderOpen) {
    if (typeof document === 'undefined') return;
    const readerActive = typeof isReaderOpen === 'boolean'
      ? isReaderOpen
      : !!document.body?.classList?.contains('reader-open');
    const colors = getThemeColors(currentReaderTheme);
    const readerView = document.getElementById('reader-view');
    const targets = [...READER_PANEL_IDS.map(id => document.getElementById(id)), readerView].filter(Boolean);

    if (!readerActive) {
      for (const el of targets) clearReaderPanelTheme(el);
      return;
    }

    const tokens = computeReaderPanelTokens(colors);
    for (const el of targets) applyReaderPanelTheme(el, currentReaderTheme, tokens);
  }

  function setReaderTheme(themeName, shouldPersist = true) {
    if (!READER_THEMES.includes(themeName)) themeName = 'neutral';
    currentReaderTheme = themeName;
    const colors = getThemeColors(themeName);

    const readerView = document.getElementById('reader-view');
    const contentWrap = document.getElementById('reader-content-wrap');
    const epubContainer = document.getElementById('epub-container');
    if (readerView) {
      readerView.style.backgroundColor = colors.bg;
      readerView.style.setProperty('--reader-theme-bg', colors.bg);
      readerView.style.setProperty('--reader-theme-surface', colors.surface || colors.bg);
      readerView.style.setProperty('--reader-theme-text', colors.text);
      readerView.style.setProperty('--reader-theme-muted', colors.muted);
      readerView.style.setProperty('--reader-theme-border', `${colors.muted}55`);
    }
    if (contentWrap) contentWrap.style.backgroundColor = colors.bg;
    if (epubContainer) epubContainer.style.backgroundColor = colors.bg;

    document.querySelectorAll('.theme-preset').forEach(preset => {
      preset.classList.toggle('active', preset.dataset.theme === themeName);
      preset.setAttribute('aria-pressed', preset.dataset.theme === themeName ? 'true' : 'false');
    });
    const qsThemeSelect = document.getElementById('qs-theme-select');
    if (qsThemeSelect) {
      if (qsThemeSelect.value !== themeName) {
        qsThemeSelect.value = themeName;
      }
      qsThemeSelect._customDropdownSync?.();
    }
    updateCustomUI();
    syncReaderPanels();
    if (shouldPersist) persist('readerTheme', themeName);

    // Apply directly into EPUB iframe page content
    if (typeof EpubLoader !== 'undefined' && EpubLoader.isLoaded()) {
      EpubLoader.applyTheme(themeName);
    }

    window.dispatchEvent(new CustomEvent('novera:readerThemeChange', { detail: { theme: themeName, colors } }));
  }

  function getThemeColors(theme) {
    if (theme === 'custom') {
      return { ...customColors, surface: customColors.bg, selection: selectionColor(customColors.selection), selectionText: '#000000' };
    }
    return THEME_COLORS[theme] || THEME_COLORS.night;
  }

  function updateCustomUI() {
    document.querySelectorAll('[data-custom-color]').forEach(input => {
      input.value = customColors[input.dataset.customColor];
    });
    const preview = document.getElementById('custom-theme-preview');
    const swatch = document.querySelector('.theme-swatch-custom');
    if (preview) {
      preview.style.backgroundColor = customColors.bg;
      preview.style.color = customColors.text;
    }
    if (swatch) swatch.style.background = `linear-gradient(135deg, ${customColors.bg} 50%, ${customColors.link} 50%)`;
  }

  function setCustomColor(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_CUSTOM_COLORS, key)) return;
    customColors = normalizeCustomColors({ ...customColors, [key]: value });
    persist('customReaderTheme', customColors);
    updateCustomUI();
    if (currentReaderTheme === 'custom') setReaderTheme('custom');
  }

  function resetCustomTheme() {
    customColors = { ...DEFAULT_CUSTOM_COLORS };
    persist('customReaderTheme', customColors);
    updateCustomUI();
    setReaderTheme('custom');
  }

  function bindUIEvents() {
    document.addEventListener('click', (e) => {
      const themeSwitch = e.target.closest('#app-theme-switch');
      if (themeSwitch) {
        setAppTheme(currentAppTheme === 'dark' ? 'light' : 'dark');
        return;
      }
      const preset = e.target.closest('.theme-preset');
      if (preset && preset.dataset.theme) {
        setReaderTheme(preset.dataset.theme);
        return;
      }
      const resetCustom = e.target.closest('#reset-custom-theme-btn');
      if (resetCustom) {
        resetCustomTheme();
        return;
      }
      const resetAccent = e.target.closest('#reset-accent-btn');
      if (resetAccent) {
        applyAccent(DEFAULT_ACCENT);
        return;
      }
      const appPreset = e.target.closest('[data-app-theme]');
      if (appPreset && appPreset.dataset.appTheme) setAppTheme(appPreset.dataset.appTheme);
    });
    document.addEventListener('input', (e) => {
      const input = e.target.closest('[data-custom-color]');
      if (input) setCustomColor(input.dataset.customColor, input.value);
      if (e.target.id === 'app-accent-color') applyAccent(e.target.value);
    });
  }

  function getAppTheme() {
    return currentAppTheme;
  }

  function getReaderTheme() {
    return currentReaderTheme;
  }

  return {
    init,
    setAppTheme,
    setReaderTheme,
    syncReaderPanels,
    getAppTheme,
    getReaderTheme,
    getThemeColors,
    applyAccent,
    APP_THEMES,
    READER_THEMES
    ,DEFAULT_ACCENT
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}

