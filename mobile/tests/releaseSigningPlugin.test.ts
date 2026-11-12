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

/** The SDK 57 template as `expo prebuild` actually generates it. */
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
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableProguardInReleaseBuilds
        }
    }
}
`;

/** A template that already declares a release signing config. */
const TEMPLATE_WITH_RELEASE = TEMPLATE.replace(
  /    signingConfigs \{\n/,
  `    signingConfigs {\n        release {\n            storeFile file('debug.keystore')\n            storePassword 'android'\n            keyAlias 'androiddebugkey'\n            keyPassword 'android'\n        }\n`
);

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
  const releaseBuildType = /release \{[\s\S]*?\n        \}/.exec(
    patched.slice(patched.indexOf('buildTypes {'))
  );
  assert.ok(releaseBuildType, 'buildTypes.release must exist');
  assert.match(releaseBuildType[0], /signingConfig signingConfigs\.release/);
  // buildTypes.debug still points at the debug config, which is correct.
  assert.match(patched, /debug \{[\s\S]*?signingConfig signingConfigs\.debug/);
});

test('the debug signing config is left alone', () => {
  const patched = addReleaseSigning(TEMPLATE);
  assert.match(patched, /debug \{\s*\n\s*storeFile file\('debug\.keystore'\)/);
  // Only the release block is added.
  assert.equal((patched.match(/androiddebugkey/g) || []).length, 1);
});

test('the release block lands inside signingConfigs, not after it', () => {
  const patched = addReleaseSigning(TEMPLATE);
  // A `release` block placed outside signingConfigs fails the build with
  // "Could not find method release()".
  assert.match(patched, /signingConfigs \{[\s\S]*\n        release \{[\s\S]*\n        \}\n    \}\n    buildTypes \{/);
  assert.doesNotMatch(patched, /\n    \}\n {8}release \{/);
});

test('an existing release signing config is replaced, not duplicated', () => {
  const patched = addReleaseSigning(TEMPLATE_WITH_RELEASE);
  assert.equal((patched.match(/signingConfigs \{/g) || []).length, 1);
  assert.equal((patched.match(new RegExp(SIGNING_MARKER, 'g')) || []).length, 1);
  // The old debug-key release config is gone; buildTypes.release is switched over.
  assert.match(patched, /signingConfig signingConfigs\.release/);
  assert.equal((patched.match(/androiddebugkey/g) || []).length, 1);
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

test('the release block fails closed with GradleException if credentials are missing on release tasks', () => {
  const patched = addReleaseSigning(TEMPLATE);
  assert.match(patched, /throw new GradleException/);
  assert.match(patched, /Missing release signing credentials/);
  assert.match(patched, /Production release builds must fail closed when credentials are absent/);
});

