/**
 * Lirune Reader Mobile — activity configChanges plugin
 *
 * React Native recreates the activity on a configuration change that is not
 * declared in `android:configChanges`, and a recreated activity throws away the
 * reader WebView: the book reloads and the position has to be restored from the
 * database, which reads as a random jump mid-chapter.
 *
 * `density` and `fontScale` are the two that matter here: Android raises both when
 * the user changes display size or font size, and a fold/unfold or a split-screen
 * resize can move `smallestScreenSize`. All three must be handled in-process so
 * the reader re-lays out through its own measured `onLayout` instead of remounting.
 */

const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

const REQUIRED_CONFIG_CHANGES = [
  'keyboard',
  'keyboardHidden',
  'orientation',
  'screenSize',
  'screenLayout',
  'smallestScreenSize',
  'uiMode',
  'density',
  'fontScale',
];

function addConfigChanges(androidManifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
  const current = (activity.$['android:configChanges'] || '').split('|').filter(Boolean);
  const merged = [...current];
  for (const change of REQUIRED_CONFIG_CHANGES) {
    if (!merged.includes(change)) merged.push(change);
  }
  activity.$['android:configChanges'] = merged.join('|');
  return androidManifest;
}

module.exports = function withAndroidConfigChanges(config) {
  return withAndroidManifest(config, (cfg) => {
    addConfigChanges(cfg.modResults);
    return cfg;
  });
};

module.exports.addConfigChanges = addConfigChanges;
module.exports.REQUIRED_CONFIG_CHANGES = REQUIRED_CONFIG_CHANGES;