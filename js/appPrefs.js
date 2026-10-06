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
    focusOutlines: false
  };

  let current = { ...DEFAULTS };
  let persistTimer = null;

  async function init() {
    const saved = await NoveraDB.getPref('appPrefs', DEFAULTS);
    current = normalize(saved);
    apply();
  }

  function normalize(prefs) {
    const source = prefs || {};
    return {
      reduceMotion: source.reduceMotion === true,
      confirmDelete: source.confirmDelete !== false,
      restoreLastBook: source.restoreLastBook === true,
      highContrast: source.highContrast === true,
      largeControls: source.largeControls === true,
      focusOutlines: source.focusOutlines === true
    };
  }

  function apply() {
    document.documentElement.dataset.reduceMotion = current.reduceMotion ? 'on' : 'off';
    document.documentElement.dataset.highContrast = current.highContrast ? 'on' : 'off';
    document.documentElement.dataset.largeControls = current.largeControls ? 'on' : 'off';
    document.documentElement.dataset.focusOutlines = current.focusOutlines ? 'on' : 'off';
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
