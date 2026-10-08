/**
 * Lirune Reader — Application Preferences
 *
 * Owns the application-wide preferences that are neither reading settings
 * nor library display settings: app theme, accent, reader theme and custom
 * reader colors live in ThemeManager, typography and layout live in
 * ReaderSettings, and the library presentation lives in Library. This module
 * holds what is left, so there is exactly one owner per preference.
 *
 * Everything is stored through NoveraDB's existing preference store under a
 * single key. There is no second store and no localStorage copy.
 */

const AppPrefs = (() => {
  const DEFAULTS = {
    reduceMotion: false,
    confirmDelete: true,
    restoreLastBook: false,
    highContrast: false,
    largeControls: false,
    focusOutlines: false,
    // General
    saveProgress: true,
    escToLibrary: true,
    windowTitleProgress: false,
    openShelfAfterImport: true,
    // Appearance
    followSystemTheme: false,
    glassEffect: true,
    roundedCovers: true,
    elevatedCardShadows: true,
    // Reading
    tapToTurn: true,
    readingFooterBar: true,
    smoothScroll: true,
    autoHyphenation: true,
    // Library
    showProgressBadge: true,
    showFormatBadge: true,
    showContinueReading: true,
    coverFit: 'cover',
    // Accessibility
    dyslexicFont: false,
    underlineLinks: false,
    keyboardNavCues: true
  };

  let current = { ...DEFAULTS };
  let persistTimer = null;
  let systemThemeListenerAttached = false;

  async function init() {
    const saved = await NoveraDB.getPref('appPrefs', DEFAULTS);
    current = normalize(saved);
    apply();
    bindGlobalListeners();
  }

  function normalize(prefs) {
    const source = prefs || {};
    return {
      reduceMotion: source.reduceMotion === true,
      confirmDelete: source.confirmDelete !== false,
      restoreLastBook: source.restoreLastBook === true,
      highContrast: source.highContrast === true,
      largeControls: source.largeControls === true,
      focusOutlines: source.focusOutlines === true,
      saveProgress: source.saveProgress !== false,
      escToLibrary: source.escToLibrary !== false,
      windowTitleProgress: source.windowTitleProgress === true,
      openShelfAfterImport: source.openShelfAfterImport !== false,
      followSystemTheme: source.followSystemTheme === true,
      glassEffect: source.glassEffect !== false,
      roundedCovers: source.roundedCovers !== false,
      elevatedCardShadows: source.elevatedCardShadows !== false,
      tapToTurn: source.tapToTurn !== false,
      readingFooterBar: source.readingFooterBar !== false,
      smoothScroll: source.smoothScroll !== false,
      autoHyphenation: source.autoHyphenation !== false,
      showProgressBadge: source.showProgressBadge !== false,
      showFormatBadge: source.showFormatBadge !== false,
      showContinueReading: source.showContinueReading !== false,
      coverFit: source.coverFit === 'contain' ? 'contain' : 'cover',
      dyslexicFont: source.dyslexicFont === true,
      underlineLinks: source.underlineLinks === true,
      keyboardNavCues: source.keyboardNavCues !== false
    };
  }

  function bindGlobalListeners() {
    if (!systemThemeListenerAttached && window.matchMedia) {
      systemThemeListenerAttached = true;
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (current.followSystemTheme && typeof ThemeManager !== 'undefined') {
            ThemeManager.setAppTheme(e.matches ? 'dark' : 'light');
          }
        });
      } catch (_) {}
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && current.escToLibrary) {
        if (typeof App !== 'undefined' && App.getSettingsContext() === 'reader') {
          // If a settings drawer or modal is open, let the drawer close first
          const settingsOpen = document.getElementById('settings-panel')?.classList.contains('open');
          const modalOpen = document.querySelector('.modal:not(.hidden)');
          if (!settingsOpen && !modalOpen && typeof App.closeBook === 'function') {
            App.closeBook();
          }
        }
      }
    });
  }

  function apply() {
    document.documentElement.dataset.reduceMotion = current.reduceMotion ? 'on' : 'off';
    document.documentElement.dataset.highContrast = current.highContrast ? 'on' : 'off';
    document.documentElement.dataset.largeControls = current.largeControls ? 'on' : 'off';
    document.documentElement.dataset.focusOutlines = current.focusOutlines ? 'on' : 'off';
    document.documentElement.dataset.glassEffect = current.glassEffect ? 'on' : 'off';
    document.documentElement.dataset.roundedCovers = current.roundedCovers ? 'on' : 'off';
    document.documentElement.dataset.cardShadows = current.elevatedCardShadows ? 'on' : 'off';
    document.documentElement.dataset.underlineLinks = current.underlineLinks ? 'on' : 'off';
    document.documentElement.dataset.hyphenation = current.autoHyphenation ? 'on' : 'off';
    document.documentElement.dataset.progressBadges = current.showProgressBadge ? 'on' : 'off';
    document.documentElement.dataset.formatBadges = current.showFormatBadge ? 'on' : 'off';
    document.documentElement.dataset.continueReading = current.showContinueReading ? 'on' : 'off';
    document.documentElement.dataset.coverFit = current.coverFit;
    document.documentElement.dataset.dyslexicFont = current.dyslexicFont ? 'on' : 'off';
    document.documentElement.dataset.footerBar = current.readingFooterBar ? 'on' : 'off';
    document.documentElement.dataset.smoothScroll = current.smoothScroll ? 'on' : 'off';
    document.documentElement.dataset.keyboardCues = current.keyboardNavCues ? 'on' : 'off';

    if (current.followSystemTheme && typeof ThemeManager !== 'undefined') {
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (ThemeManager.getAppTheme() !== (isDark ? 'dark' : 'light')) {
        ThemeManager.setAppTheme(isDark ? 'dark' : 'light', false);
      }
    }
  }

  function getAll() {
    return { ...current };
  }

  function set(patch) {
    if (!patch || typeof patch !== 'object') return getAll();
    const next = normalize({ ...current, ...patch });
    current = next;
    apply();
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => NoveraDB.setPref('appPrefs', { ...current }), 200);
    return getAll();
  }

  function reset() {
    clearTimeout(persistTimer);
    current = { ...DEFAULTS };
    apply();
    NoveraDB.setPref('appPrefs', { ...current });
    return getAll();
  }

  return { init, getAll, set, reset };
})();
