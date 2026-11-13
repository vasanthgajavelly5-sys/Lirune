const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeStyleMock() {
  const map = new Map();
  return {
    colorScheme: '',
    backgroundColor: '',
    setProperty(k, v) { map.set(k, String(v)); },
    getPropertyValue(k) { return map.get(k) || ''; },
    removeProperty(k) { map.delete(k); },
    _entries() { return map; }
  };
}

function makeElementMock(id) {
  const attrs = new Map();
  const classes = new Set();
  return {
    id,
    dataset: {},
    style: makeStyleMock(),
    classList: {
      add(...items) { items.forEach(i => classes.add(i)); },
      remove(...items) { items.forEach(i => classes.delete(i)); },
      contains(item) { return classes.has(item); },
      toggle(item, force) {
        const next = force === undefined ? !classes.has(item) : !!force;
        if (next) classes.add(item); else classes.delete(item);
        return next;
      }
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    removeAttribute(k) { attrs.delete(k); }
  };
}

function loadThemeManagerHarness() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'themes.js'), 'utf8');
  const elements = new Map([
    ['reader-view', makeElementMock('reader-view')],
    ['reader-content-wrap', makeElementMock('reader-content-wrap')],
    ['epub-container', makeElementMock('epub-container')],
    ['toc-panel', makeElementMock('toc-panel')],
    ['settings-panel', makeElementMock('settings-panel')],
    ['annotations-panel', makeElementMock('annotations-panel')]
  ]);

  const body = makeElementMock('body');
  const documentElement = makeElementMock('html');
  const store = new Map();
  const prefs = new Map();
  const listeners = new Map();

  const context = {
    window: {
      dispatchEvent() {}
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    localStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); }
    },
    NoveraDB: {
      async getPref(k, fallback) { return prefs.has(k) ? prefs.get(k) : fallback; },
      async setPref(k, v) { prefs.set(k, v); }
    },
    EpubLoader: {
      isLoaded() { return false; },
      applyTheme() {}
    },
    document: {
      documentElement,
      body,
      getElementById(id) { return elements.get(id) || null; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      addEventListener(type, listener) { listeners.set(type, listener); }
    },
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  const ThemeManager = vm.runInContext(`${code}\nThemeManager;`, context);
  return { ThemeManager, elements, body, documentElement, prefs, listeners };
}

test('custom app accent is applied to reader panels and updates live', async () => {
  const { ThemeManager, elements, body, documentElement, prefs, listeners } = loadThemeManagerHarness();
  prefs.set('accentColor', '#919325');
  await ThemeManager.init();
  body.classList.add('reader-open');
  ThemeManager.setReaderTheme('sepia', false);

  const panel = elements.get('settings-panel');
  assert.equal(panel.style.getPropertyValue('--accent'), '#919325');
  assert.equal(panel.style.getPropertyValue('--reader-panel-switch-active-bg'), '#919325');
  assert.equal(panel.style.getPropertyValue('--bg-surface'), '#FAF3E4');

  listeners.get('input')({ target: { id: 'app-accent-color', value: '#E57373', closest: () => null } });
  assert.equal(documentElement.style.getPropertyValue('--accent'), '#E57373');
  assert.equal(panel.style.getPropertyValue('--accent'), '#E57373');
  assert.equal(panel.style.getPropertyValue('--reader-panel-switch-active-bg'), '#E57373');
  assert.equal(panel.style.getPropertyValue('--bg-surface'), '#FAF3E4');
});

test('Reader panels stay un-overridden in Library view and follow reader theme in Reader view', async () => {
  const { ThemeManager, elements, body, documentElement } = loadThemeManagerHarness();
  await ThemeManager.init();

  const panelIds = ['toc-panel', 'settings-panel', 'annotations-panel'];

  // Library view: appTheme applies globally; reader panels carry no reader-theme override.
  ThemeManager.setAppTheme('dark', false);
  for (const id of panelIds) {
    const el = elements.get(id);
    assert.equal(el.getAttribute('data-reader-panel-theme'), null);
    assert.equal(el.style.getPropertyValue('--bg-surface'), '');
  }
  assert.equal(documentElement.getAttribute('data-theme'), 'dark');

  // Open Reader with Light Reader Theme (sepia) while App Theme is Dark
  body.classList.add('reader-open');
  ThemeManager.setReaderTheme('sepia', false);
  for (const id of panelIds) {
    const el = elements.get(id);
    assert.equal(el.getAttribute('data-reader-panel-theme'), 'light', `${id} should be light in sepia`);
    assert.equal(el.getAttribute('data-reader-theme-name'), 'sepia');
    assert.equal(el.style.getPropertyValue('--bg-surface'), '#FAF3E4');
    assert.equal(el.style.getPropertyValue('--text-primary'), '#342921');
  }

  // Flip App Theme to Light while still reading -> reader panels stay dark in Night theme
  ThemeManager.setReaderTheme('night', false);
  ThemeManager.setAppTheme('light', false);
  assert.equal(documentElement.getAttribute('data-theme'), 'light');
  for (const id of panelIds) {
    const el = elements.get(id);
    assert.equal(el.getAttribute('data-reader-panel-theme'), 'dark', `${id} should remain dark in night`);
    assert.equal(el.getAttribute('data-reader-theme-name'), 'night');
    assert.equal(el.style.getPropertyValue('--bg-surface'), '#24272C');
    assert.equal(el.style.getPropertyValue('--text-primary'), '#E7E3D8');
  }

  // Verify every built-in preset sets valid polarity and non-empty tokens
  const darkPresets = ['night', 'contrast1', 'contrast2', 'contrast3', 'nord', 'gruvbox', 'solarized', 'rosepine', 'dracula', 'mocha'];
  const lightPresets = ['neutral', 'sepia', 'paper', 'contrast4'];
  for (const name of darkPresets) {
    ThemeManager.setReaderTheme(name, false);
    assert.equal(elements.get('settings-panel').getAttribute('data-reader-panel-theme'), 'dark', `${name} polarity`);
    assert.ok(elements.get('toc-panel').style.getPropertyValue('--text-on-accent'));
  }
  for (const name of lightPresets) {
    ThemeManager.setReaderTheme(name, false);
    assert.equal(elements.get('settings-panel').getAttribute('data-reader-panel-theme'), 'light', `${name} polarity`);
    assert.ok(elements.get('toc-panel').style.getPropertyValue('--text-on-accent'));
  }

  // Custom theme check
  ThemeManager.setReaderTheme('custom', false);
  assert.equal(elements.get('settings-panel').getAttribute('data-reader-theme-name'), 'custom');
  assert.equal(elements.get('settings-panel').getAttribute('data-reader-panel-theme'), 'light');

  // Return to Library -> reader-panel overrides cleanly removed
  body.classList.remove('reader-open');
  ThemeManager.syncReaderPanels(false);
  for (const id of panelIds) {
    const el = elements.get(id);
    assert.equal(el.getAttribute('data-reader-panel-theme'), null);
    assert.equal(el.getAttribute('data-reader-theme-name'), null);
    assert.equal(el.style.getPropertyValue('--bg-surface'), '');
    assert.equal(el.style.getPropertyValue('--text-primary'), '');
  }
});

test('CSS & App wiring preserve reader-panel theme isolation', () => {
  const panelsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'panels.css'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  assert.ok(componentsCss.includes('.panel[data-reader-panel-theme] .custom-dropdown-menu'));
  assert.ok(panelsCss.includes('.panel[data-reader-panel-theme] .setting-switch'));
  assert.ok(panelsCss.includes('.panel[data-reader-panel-theme] .segmented'));
  assert.ok(panelsCss.includes('.panel[data-reader-panel-theme] .quick-expand-btn'));
  assert.ok(panelsCss.includes('.panel[data-reader-panel-theme] .full-settings-nav-item'));
  assert.ok(panelsCss.includes('.panel[data-reader-panel-theme] .settings-group'));
  assert.ok(appJs.includes('ThemeManager.syncReaderPanels?.(true)'));
  assert.ok(appJs.includes('ThemeManager.syncReaderPanels?.(false)'));
});

