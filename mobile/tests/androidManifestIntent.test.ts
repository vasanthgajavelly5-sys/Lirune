/**
 * Regression & contract tests for Android Manifest intent filters, largeHeap
 * allocation, release permission stripping, and MainActivity intent normalization.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');

const {
  cleanAndConfigureIntentFilters,
  cleanManifestPermissions,
  patchMainActivityIntentNormalization,
  RELEASE_MANIFEST_CONTENT,
} = require('../plugins/withLiruneStorage.js');

const BASE_MANIFEST = () => ({
  manifest: {
    'uses-permission': [
      { $: { 'android:name': 'android.permission.INTERNET' } },
      { $: { 'android:name': 'android.permission.MANAGE_DOCUMENTS' } },
    ],
    application: [
      {
        $: { 'android:name': '.MainApplication' },
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
                data: [{ $: { 'android:scheme': 'lirune' } }],
              },
            ],
          },
        ],
      },
    ],
  },
});

test('withLiruneStorage enforces largeHeap and properly separated file/content/SEND intent filters', () => {
  const raw = BASE_MANIFEST();
  cleanManifestPermissions(raw.manifest, true);
  const manifest = cleanAndConfigureIntentFilters(raw.manifest);
  const app = manifest.application[0];
  assert.equal(app.$['android:largeHeap'], 'true', 'largeHeap must be enabled for multi-MB EPUB base64 decoding');

  const filters = app.activity[0]['intent-filter'];

  // file:// pathPattern filter must NEVER carry android:host="*" (Android fails matching file URIs with host="*")
  const filePathFilters = filters.filter((f: any) =>
    f.data?.some((d: any) => d.$?.['android:scheme'] === 'file' && d.$?.['android:pathPattern'])
  );
  assert.ok(filePathFilters.length >= 1, 'Expected file:// pathPattern filter');
  for (const f of filePathFilters) {
    for (const d of f.data) {
      assert.equal(d.$['android:host'], undefined, 'file:// data entry must not set android:host="*"');
    }
  }

  // Generic binary stream fallback for Downloads/Files/WhatsApp VIEW intents
  const hasOctetView = filters.some(
    (f: any) =>
      f.action?.some((a: any) => a.$?.['android:name'] === 'android.intent.action.VIEW') &&
      f.data?.some((d: any) => d.$?.['android:scheme'] === 'content' && d.$?.['android:mimeType'] === 'application/octet-stream')
  );
  assert.equal(hasOctetView, true, 'VIEW intent filter must match content:// with application/octet-stream');

  // ACTION_SEND and ACTION_SEND_MULTIPLE must accept both EPUB and binary stream MIME types
  for (const action of ['android.intent.action.SEND', 'android.intent.action.SEND_MULTIPLE']) {
    const f = filters.find((x: any) => x.action?.some((a: any) => a.$?.['android:name'] === action));
    assert.ok(f, `Expected ${action} intent filter`);
    assert.ok(
      f.data?.some((d: any) => d.$?.['android:mimeType'] === 'application/epub+zip'),
      `${action} must support application/epub+zip`
    );
    assert.ok(
      f.data?.some((d: any) => d.$?.['android:mimeType'] === 'application/octet-stream'),
      `${action} must support application/octet-stream`
    );
  }
});

test('Release manifest overlay strips INTERNET permission for strict offline privacy', () => {
  assert.match(RELEASE_MANIFEST_CONTENT, /android\.permission\.INTERNET"[^>]*tools:node="remove"/);
});

test('MainActivity intent normalization survives expo prebuild and handles ClipData + EXTRA_STREAM', () => {
  const samplePrebuild = `package com.lirune.reader
import android.os.Bundle
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate = TODO()
}
`;

  const patched = patchMainActivityIntentNormalization(samplePrebuild);
  const patchedTwice = patchMainActivityIntentNormalization(patched);
  assert.equal(patchedTwice, patched, 'MainActivity patch must be idempotent');
  assert.match(patched, /fun normalizeIntent\(/);
  assert.match(patched, /clipData/);
  assert.match(patched, /EXTRA_STREAM/);
  assert.match(patched, /override fun onNewIntent\(/);

  // Also check the live MainActivity.kt when android tree is present on disk
  const liveMainActivity = path.join(mobileRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'lirune', 'reader', 'MainActivity.kt');
  if (fs.existsSync(liveMainActivity)) {
    const liveSrc = fs.readFileSync(liveMainActivity, 'utf8');
    assert.match(liveSrc, /fun normalizeIntent\(/);
    assert.match(liveSrc, /clipData/);
    assert.match(liveSrc, /EXTRA_STREAM/);
  }
});
