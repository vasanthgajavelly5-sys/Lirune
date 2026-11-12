/**
 * Test for the LiruneScreen Expo config plugin.
 *
 * `mobile/android/` is git-ignored, so the Kotlin module only survives
 * `expo prebuild --clean` if the plugin re-installs it. The Kotlin compile itself
 * cannot be checked here, but the MainApplication patch — the part that silently
 * produces an app without "Keep Screen Awake" — can be asserted on directly,
 * including idempotency and coexistence with `withLiruneStorage`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerPackageInMainApplication } = require('../plugins/withLiruneScreen.js');
const storagePlugin = require('../plugins/withLiruneStorage.js');

const APPLY_SHAPE = `package com.lirune.reader

import android.app.Application

import com.facebook.react.PackageList

class MainApplication : Application() {
  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
        }
    )
  }
}
`;

const PLAIN_SHAPE = `package com.lirune.reader

import com.facebook.react.PackageList

val packages = PackageList(this).packages
`;

test('registers LiruneScreenPackage inside the PackageList apply block', () => {
  const patched = registerPackageInMainApplication(APPLY_SHAPE);
  assert.match(patched, /import com\.lirune\.reader\.screen\.LiruneScreenPackage/);
  assert.match(patched, /PackageList\(this\)\.packages\.apply \{\s*\n\s*add\(LiruneScreenPackage\(\)\)/);
  assert.match(patched, /\}\s*\n\s*\}/);
});

test('the patch is idempotent across repeated prebuilds', () => {
  const once = registerPackageInMainApplication(APPLY_SHAPE);
  const twice = registerPackageInMainApplication(once);
  assert.equal(twice, once);
  assert.equal((twice.match(/add\(LiruneScreenPackage\(\)\)/g) || []).length, 1);
  assert.equal((twice.match(/import com\.lirune\.reader\.screen\.LiruneScreenPackage/g) || []).length, 1);
});

test('rewrites a bare PackageList(this).packages into an apply block', () => {
  const patched = registerPackageInMainApplication(PLAIN_SHAPE);
  assert.match(patched, /PackageList\(this\)\.packages\.apply \{/);
  assert.match(patched, /add\(LiruneScreenPackage\(\)\)/);
});

test('coexists with the storage plugin in one MainApplication', () => {
  // Both plugins patch the same file, in either order, so a prebuild cannot end
  // up with one module registered and the other missing.
  const storageThenScreen = registerPackageInMainApplication(
    storagePlugin.registerPackageInMainApplication(APPLY_SHAPE)
  );
  assert.match(storageThenScreen, /add\(LiruneStoragePackage\(\)\)/);
  assert.match(storageThenScreen, /add\(LiruneScreenPackage\(\)\)/);

  const screenThenStorage = storagePlugin.registerPackageInMainApplication(
    registerPackageInMainApplication(APPLY_SHAPE)
  );
  assert.match(screenThenStorage, /add\(LiruneStoragePackage\(\)\)/);
  assert.match(screenThenStorage, /add\(LiruneScreenPackage\(\)\)/);
});

test('fails loudly when the generated template no longer matches', () => {
  assert.throws(
    () => registerPackageInMainApplication('package com.lirune.reader\n\nclass MainApplication\n'),
    /withLiruneScreen/
  );
});