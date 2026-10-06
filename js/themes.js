/**
 * Lirune Reader — Separate application and reader theme management.
 */

const ThemeManager = (() => {
  const APP_THEMES = ['dark', 'light'];
  const READER_THEMES = ['neutral', 'sepia', 'night', 'paper', 'contrast1', 'contrast2', 'contrast3', 'contrast4', 'custom'];
  const LEGACY_READER_THEMES = { dark: 'night', light: 'neutral', oled: 'night', sepia: 'sepia' };
  let currentAppTheme = 'dark';
  let currentReaderTheme = 'neutral';
  let customColors = null;
  let persistTimer = null;
  const DEFAULT_ACCENT = '#EEECF8';

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
    const legacyTheme = await NoveraDB.getPref('theme', 'dark');
    const savedAppTheme = await NoveraDB.getPref('appTheme', APP_THEMES.includes(legacyTheme) ? legacyTheme : 'dark');
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
    if (!APP_THEMES.includes(themeName)) themeName = 'dark';
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
    window.dispatchEvent(new CustomEvent('novera:appthemechange', { detail: { theme: themeName } }));
  }

  function normalizeAccent(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toUpperCase() : DEFAULT_ACCENT;
  }

  function accentRgb(hex) {
    const value = normalizeAccent(hex).slice(1);
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }

  function applyAccent(value, persist = true) {
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
    root.style.setProperty('--accent-text', luminance > 0.62 ? foreground : accent);
    root.style.setProperty('--text-on-accent', foreground);
    root.style.setProperty('--gradient-accent', `linear-gradient(135deg, ${accent}, ${active})`);
    root.style.setProperty('--border-accent', `rgba(${red},${green},${blue},0.48)`);
    root.style.setProperty('--accent-subtle', `rgba(${red},${green},${blue},0.13)`);
    root.style.setProperty('--accent-subtle-h', `rgba(${red},${green},${blue},0.22)`);
    root.style.setProperty('--accent-glow', `rgba(${red},${green},${blue},0.18)`);
    root.style.setProperty('--accent-glow-strong', `rgba(${red},${green},${blue},0.3)`);
    const input = document.getElementById('app-accent-color');
    if (input) input.value = accent;
    if (persist) persist('accentColor', accent);
  }

  function setReaderTheme(themeName, persist = true) {
    if (!READER_THEMES.includes(themeName)) themeName = 'night';
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
    updateCustomUI();
    if (persist) persist('readerTheme', themeName);

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
    getAppTheme,
    getReaderTheme,
    getThemeColors,
    APP_THEMES,
    READER_THEMES
    ,DEFAULT_ACCENT
  };
})();
