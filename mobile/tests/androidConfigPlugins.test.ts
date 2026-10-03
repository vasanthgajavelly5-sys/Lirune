/**
 * Tests for the Android app-config plugins.
 *
 * Both plugins rewrite files that `expo prebuild` regenerates, so a template
 * change has to fail here rather than silently shipping an app that ignores
 * rotation or recreates the reader on a font-size change. The fixtures below are
 * the shapes Expo SDK 57 actually generates.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { addCutoutMode } = require('../plugins/withCutoutMode.js');
const { addConfigChanges, REQUIRED_CONFIG_CHANGES } = require('../plugins/withAndroidConfigChanges.js');

const STYLES_XML = `<resources xmlns:tools="http://schemas.android.com/tools">
  <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="android:statusBarColor">@android:color/transparent</item>
  </style>
</resources>
`;

const MANIFEST = {
  manifest: {
    application: [
      {
        $: { 'android:name': '.MainApplication' },
        activity: [
          {
            $: {
              'android:name': '.MainActivity',
              'android:configChanges':
                'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize|assetsPaths',
            },
          },
        ],
      },
    ],
  },
};

test('cutout mode is added to AppTheme only', () => {
  const patched = addCutoutMode(STYLES_XML);
  assert.match(patched, /<item name="android:windowLayoutInDisplayCutoutMode">shortEdges<\/item>/);
  // Only AppTheme may change; the splash theme inherits from it.
  assert.equal((patched.match(/windowLayoutInDisplayCutoutMode/g) || []).length, 1);
});

test('cutout mode patch is idempotent', () => {
  const once = addCutoutMode(STYLES_XML);
  const twice = addCutoutMode(once);
  assert.equal(twice, once);
});

test('cutout mode fails loudly when AppTheme is gone', () => {
  assert.throws(() => addCutoutMode('<resources></resources>'), /withCutoutMode/);
});

test('configChanges gains density and fontScale without losing existing entries', () => {
  const patched = addConfigChanges(structuredClone(MANIFEST));
  const value = patched.manifest.application[0].activity[0].$['android:configChanges'].split('|');
  for (const required of REQUIRED_CONFIG_CHANGES) {
    assert.ok(value.includes(required), `missing configChanges entry: ${required}`);
  }
  // Expo adds assetsPaths for bundle loading; it must survive.
  assert.ok(value.includes('assetsPaths'));
});

test('configChanges patch never duplicates an entry', () => {
  const patched = addConfigChanges(structuredClone(MANIFEST));
  const value = patched.manifest.application[0].activity[0].$['android:configChanges'].split('|');
  assert.equal(new Set(value).size, value.length);
});

test('configChanges handles an activity with no declared changes', () => {
  const bare = { manifest: { application: [{ activity: [{ $: { 'android:name': '.MainActivity' } }] }] } };
  const patched = addConfigChanges(bare);
  assert.equal(
    patched.manifest.application[0].activity[0].$['android:configChanges'],
    REQUIRED_CONFIG_CHANGES.join('|')
  );
});