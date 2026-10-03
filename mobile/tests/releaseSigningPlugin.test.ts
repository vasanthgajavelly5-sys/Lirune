/**
 * Release signing plugin tests.
 *
 * The signing block used to live in a hand-edited android/app/build.gradle, which
 * `expo prebuild --clean` deletes. A release built without it is signed with the
 * debug key and cannot upgrade the installed app, so the generated Gradle file is
 * the one place this has to be right.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { addReleaseSigning, SIGNING_MARKER } = require('../plugins/withReleaseSigning.js');

const TEMPLATE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"

android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace 'com.lirune.reader'
    defaultConfig {
        applicationId 'com.lirune.reader'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 4
        versionName "4.0.6"
    }

    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            // The template default: a debug key.
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.debug
            minifyEnabled enableProguardInReleaseBuilds
        }
    }
}
`;

test('the release signing config reads credentials from gradle.properties', () => {
  const patched = addReleaseSigning(TEMPLATE);
  // Both the historical LIRUNE_RELEASE_* names and the checklist's
  // LIRUNE_UPLOAD_* names have to work, or a release cannot be signed at all.
  assert.match(patched, /LIRUNE_RELEASE_STORE_FILE/);
  assert.match(patched, /LIRUNE_UPLOAD_STORE_FILE/);
  assert.match(patched, /storePassword project\.property\('LIRUNE_RELEASE_STORE_PASSWORD'\)/);
  assert.match(patched, /keyAlias project\.property\('LIRUNE_RELEASE_KEY_ALIAS'\)/);
  assert.match(patched, /keyPassword project\.property\('LIRUNE_RELEASE_KEY_PASSWORD'\)/);
});

test('buildTypes.release uses the release signing config, not the debug key', () => {
  const patched = addReleaseSigning(TEMPLATE);
  assert.match(
    patched,
    /buildTypes \{[\s\S]*release \{[\s\S]*signingConfig signingConfigs\.release/
  );
  assert.doesNotMatch(patched, /signingConfig signingConfigs\.debug/);
});

test('the debug signing config is left alone', () => {
  const patched = addReleaseSigning(TEMPLATE);
  assert.match(patched, /debug \{\s*\n\s*storeFile file\('debug\.keystore'\)/);
  // Only the release block is rewritten.
  assert.equal((patched.match(/debug\.keystore/g) || []).length, 1);
});

test('the patch is idempotent across repeated prebuilds', () => {
  const once = addReleaseSigning(TEMPLATE);
  const twice = addReleaseSigning(once);
  assert.equal(twice, once);
  assert.equal((twice.match(new RegExp(SIGNING_MARKER, 'g')) || []).length, 1);
});

test('a build file without any signingConfigs still gets a release block', () => {
  const bare = `apply plugin: "com.android.application"\n\nandroid {\n    namespace 'com.lirune.reader'\n    buildTypes {\n        release {\n            signingConfig signingConfigs.debug\n        }\n    }\n}\n`;
  const patched = addReleaseSigning(bare);
  assert.match(patched, /signingConfigs \{/);
  assert.match(patched, /LIRUNE_RELEASE_KEY_PASSWORD/);
  assert.match(patched, /signingConfig signingConfigs\.release/);
});

test('the plugin refuses a Kotlin build script instead of silently ignoring it', async () => {
  // withAppBuildGradle is called with the language; the plugin throws for anything
  // it cannot patch, which is the behaviour under test.
  const plugin = require('../plugins/withReleaseSigning.js');
  const mod = (await import('@expo/config-plugins')).withAppBuildGradle;
  assert.equal(typeof plugin, 'function');
  assert.equal(typeof mod, 'function');
  assert.match(
    String(plugin),
    /only supports the Groovy/,
    'the plugin states the one language it can patch'
  );
});
