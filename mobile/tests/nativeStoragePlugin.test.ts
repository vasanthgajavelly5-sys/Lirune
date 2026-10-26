/**
 * Test for the LiruneStorage Expo config plugin.
 *
 * `mobile/android/` is git-ignored, so the Kotlin module only survives
 * `expo prebuild --clean` if the plugin re-installs it. The Kotlin compile itself
 * cannot be checked here, but the MainApplication patch — the part that silently
 * produces an app without the module — can be asserted on directly, including
 * idempotency and the older `PackageList(this).packages` template shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerPackageInMainApplication, cleanManifestPermissions } = require('../plugins/withLiruneStorage.js');

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

test('registers LiruneStoragePackage inside the PackageList apply block', () => {
  const patched = registerPackageInMainApplication(APPLY_SHAPE);
  assert.match(patched, /import com\.lirune\.reader\.storage\.LiruneStoragePackage/);
  assert.match(patched, /PackageList\(this\)\.packages\.apply \{\s*\n\s*add\(LiruneStoragePackage\(\)\)/);
  // The original empty apply block must survive so the Kotlin stays valid.
  assert.match(patched, /\}\s*\n\s*\}/);
});

test('the patch is idempotent across repeated prebuilds', () => {
  const once = registerPackageInMainApplication(APPLY_SHAPE);
  const twice = registerPackageInMainApplication(once);
  assert.equal(twice, once);
  assert.equal((twice.match(/add\(LiruneStoragePackage\(\)\)/g) || []).length, 1);
  assert.equal((twice.match(/import com\.lirune\.reader\.storage\.LiruneStoragePackage/g) || []).length, 1);
});

test('rewrites a bare PackageList(this).packages into an apply block', () => {
  const patched = registerPackageInMainApplication(PLAIN_SHAPE);
  assert.match(patched, /PackageList\(this\)\.packages\.apply \{/);
  assert.match(patched, /add\(LiruneStoragePackage\(\)\)/);
});

test('fails loudly when the generated template no longer matches', () => {
  assert.throws(
    () => registerPackageInMainApplication('package com.lirune.reader\n\nclass MainApplication\n'),
    /withLiruneStorage/
  );
});

test('cleanManifestPermissions strips MANAGE_DOCUMENTS, READ_MEDIA_*, READ_EXTERNAL_STORAGE', () => {
  const manifest = {
    'uses-permission': [
      { $: { 'android:name': 'android.permission.INTERNET' } },
      { $: { 'android:name': 'android.permission.READ_EXTERNAL_STORAGE' } },
      { $: { 'android:name': 'android.permission.MANAGE_DOCUMENTS' } },
      { $: { 'android:name': 'android.permission.READ_MEDIA_IMAGES' } },
      { $: { 'android:name': 'android.permission.VIBRATE' } },
      { $: { 'android:name': 'android.permission.MANAGE_EXTERNAL_STORAGE' } },
    ],
  };

  const cleaned = cleanManifestPermissions(manifest, false);
  const names = cleaned['uses-permission'].map((p: any) => p.$['android:name']);
  assert.deepEqual(names, ['android.permission.INTERNET', 'android.permission.VIBRATE']);
});

test('cleanManifestPermissions adds MANAGE_EXTERNAL_STORAGE when isAllFiles is true', () => {
  const manifest = {
    'uses-permission': [
      { $: { 'android:name': 'android.permission.VIBRATE' } },
      { $: { 'android:name': 'android.permission.READ_EXTERNAL_STORAGE' } },
    ],
  };

  const cleaned = cleanManifestPermissions(manifest, true);
  const names = cleaned['uses-permission'].map((p: any) => p.$['android:name']);
  assert.deepEqual(names, ['android.permission.VIBRATE', 'android.permission.MANAGE_EXTERNAL_STORAGE']);
});