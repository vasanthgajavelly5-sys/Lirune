/**
 * Lirune Mobile - Startup Init Gating and Settings Default Tests
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canHideSplashScreen } from '../utils/initGating.ts';
import { validateAppTheme } from '../models/Book.ts';

test('canHideSplashScreen: gates hiding until both settings and library are loaded', () => {
  assert.equal(canHideSplashScreen({ settingsLoaded: false, libraryLoaded: false }), false);
  assert.equal(canHideSplashScreen({ settingsLoaded: true, libraryLoaded: false }), false);
  assert.equal(canHideSplashScreen({ settingsLoaded: false, libraryLoaded: true }), false);
  assert.equal(canHideSplashScreen({ settingsLoaded: true, libraryLoaded: true }), true);
});

test('validateAppTheme: enforces valid theme options and defaults to system', () => {
  assert.equal(validateAppTheme('dark'), 'dark');
  assert.equal(validateAppTheme('light'), 'light');
  assert.equal(validateAppTheme('system'), 'system');
  assert.equal(validateAppTheme(undefined), 'system');
  assert.equal(validateAppTheme(null), 'system');
  assert.equal(validateAppTheme('invalid_theme'), 'system');
});
