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
const {
  registerPackageInMainApplication,
  cleanManifestPermissions,
  cleanAndConfigureIntentFilters,
  SUPPORTED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
  writeReleaseManifestOverlay,
  RELEASE_MANIFEST_CONTENT,
} = require('../plugins/withLiruneStorage.js');
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

test('cleanManifestPermissions strips MANAGE_DOCUMENTS, READ_MEDIA_* and retains READ_EXTERNAL_STORAGE with maxSdkVersion 32', () => {
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
  assert.deepEqual(names, ['android.permission.INTERNET', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.VIBRATE']);
  const readExt = cleaned['uses-permission'].find(
    (p: any) => p.$['android:name'] === 'android.permission.READ_EXTERNAL_STORAGE'
  );
  assert.equal(readExt?.$?.['android:maxSdkVersion'], '32');
});

test('cleanManifestPermissions adds MANAGE_EXTERNAL_STORAGE when isAllFiles is true and retains READ_EXTERNAL_STORAGE', () => {
  const manifest = {
    'uses-permission': [
      { $: { 'android:name': 'android.permission.VIBRATE' } },
      { $: { 'android:name': 'android.permission.READ_EXTERNAL_STORAGE' } },
    ],
  };

  const cleaned = cleanManifestPermissions(manifest, true);
  const names = cleaned['uses-permission'].map((p: any) => p.$['android:name']);
  assert.deepEqual(names, ['android.permission.VIBRATE', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.MANAGE_EXTERNAL_STORAGE']);
  const readExt = cleaned['uses-permission'].find(
    (p: any) => p.$['android:name'] === 'android.permission.READ_EXTERNAL_STORAGE'
  );
  assert.equal(readExt?.$?.['android:maxSdkVersion'], '32');
});

test('cleanAndConfigureIntentFilters removes catch-alls and configures explicit intent filters', () => {
  const manifest = {
    application: [
      {
        activity: [
          {
            $: { 'android:name': '.MainActivity' },
            'intent-filter': [
              {
                action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
              },
              {
                action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
                category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
                data: [
                  { $: { 'android:scheme': 'content', 'android:mimeType': '*/*' } },
                  { $: { 'android:scheme': 'file', 'android:mimeType': 'application/octet-stream' } },
                  { $: { 'android:scheme': 'content', 'android:pathPattern': '.*' } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const configured = cleanAndConfigureIntentFilters(manifest);
  const mainActivity = configured.application[0].activity[0];
  const filters = mainActivity['intent-filter'];

  // 1. Assert launcher filter preserved
  assert.ok(filters.some((f: any) => f.action?.[0]?.$?.['android:name'] === 'android.intent.action.MAIN'));

  // 2. Collect all data items across all filters
  const allData = filters.flatMap((f: any) => f.data || []).map((d: any) => d.$);

  // 3. Assert NO */* mimeType anywhere
  const starMimes = allData.filter((d: any) => d['android:mimeType'] === '*/*');
  assert.equal(starMimes.length, 0, 'Must not contain */* wildcard mimeType');

  // 4. Assert NO application/octet-stream anywhere
  const octetMimes = allData.filter((d: any) => d['android:mimeType'] === 'application/octet-stream');
  assert.equal(octetMimes.length, 0, 'Must not contain application/octet-stream');

  // 5. Assert NO mimeType-less content filter without pathPattern
  const bareContent = allData.filter((d: any) => d['android:scheme'] === 'content' && !d['android:mimeType'] && !d['android:pathPattern']);
  assert.equal(bareContent.length, 0, 'Must not contain bare scheme=content without mimeType or pathPattern');

  // 6. Assert NO blocked extensions in pathPattern
  const allPatterns = allData.map((d: any) => d['android:pathPattern']).filter(Boolean);
  for (const blocked of BLOCKED_EXTENSIONS) {
    const matched = allPatterns.filter((p: string) => p.toLowerCase().includes(`.${blocked}`));
    assert.equal(matched.length, 0, `Must not associate with blocked extension .${blocked}`);
  }

  // 7. Assert every supported extension has pathPattern filters
  for (const ext of SUPPORTED_EXTENSIONS) {
    const hasExt = allPatterns.some((p: string) => p.toLowerCase().includes(`.${ext.toLowerCase()}`));
    assert.ok(hasExt, `Must have pathPattern filter for supported extension .${ext}`);
  }

  // 8. Assert SEND and SEND_MULTIPLE exist
  assert.ok(filters.some((f: any) => f.action?.[0]?.$?.['android:name'] === 'android.intent.action.SEND'));
  assert.ok(filters.some((f: any) => f.action?.[0]?.$?.['android:name'] === 'android.intent.action.SEND_MULTIPLE'));
});

test('writeReleaseManifestOverlay generates src/release/AndroidManifest.xml with tools:node="remove" for INTERNET', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lirune-manifest-test-'));
  try {
    const writtenPath = writeReleaseManifestOverlay(tmpDir);
    assert.ok(fs.existsSync(writtenPath), 'Overlay manifest must exist');
    const content = fs.readFileSync(writtenPath, 'utf8');
    assert.match(content, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
    assert.match(content, /<uses-permission\s+android:name="android\.permission\.INTERNET"\s+tools:node="remove"\s*\/>/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RELEASE_MANIFEST_CONTENT strictly removes INTERNET while cleanManifestPermissions preserves VIBRATE and storage permissions', () => {
  // 1. Assert release overlay targets INTERNET with tools:node="remove"
  assert.match(RELEASE_MANIFEST_CONTENT, /<uses-permission\s+android:name="android\.permission\.INTERNET"\s+tools:node="remove"\s*\/>/);

  // 2. Assert cleanManifestPermissions preserves VIBRATE and READ_EXTERNAL_STORAGE in main manifest
  const manifest = {
    'uses-permission': [
      { $: { 'android:name': 'android.permission.INTERNET' } },
      { $: { 'android:name': 'android.permission.VIBRATE' } },
      { $: { 'android:name': 'android.permission.READ_EXTERNAL_STORAGE' } },
    ],
  };
  const cleaned = cleanManifestPermissions(manifest, false);
  const names = cleaned['uses-permission'].map((p: any) => p.$['android:name']);
  assert.ok(names.includes('android.permission.VIBRATE'), 'VIBRATE must be preserved');
  assert.ok(names.includes('android.permission.READ_EXTERNAL_STORAGE'), 'READ_EXTERNAL_STORAGE must be preserved');
  assert.ok(names.includes('android.permission.INTERNET'), 'INTERNET kept in main manifest for Metro dev');
});