/**
 * Lirune Reader Mobile — display cutout plugin
 *
 * Landscape reading on a punch-hole or notch phone leaves a strip of the screen
 * the system will not draw into unless the window opts in with
 * `windowLayoutInDisplayCutoutMode=shortEdges`. The reader already treats the
 * cutout as safe-area insets (`useStableInsets` → `computeReaderLayout`), so this
 * only has to tell the window it may extend into that area; the insets still keep
 * text out of the hole.
 *
 * This edits `values/styles.xml` as text through `withDangerousMod` rather than
 * through `withAndroidStyles`: in @expo/config-plugins 57 the styles mod parses
 * the file into a shape that keeps only ONE `<item>` per `<style>`, so writing it
 * back would silently delete the other AppTheme items (colorPrimary,
 * statusBarColor, navigationBarColor) on every prebuild. A string edit keeps the
 * rest of the file byte-identical.
 */

const fs = require('fs');
const path = require('path');

const { AndroidConfig, withDangerousMod } = require('@expo/config-plugins');

const TARGET_STYLE = 'AppTheme';
const ITEM_NAME = 'android:windowLayoutInDisplayCutoutMode';
const ITEM_VALUE = 'shortEdges';

function addCutoutMode(styles) {
  if (styles.includes(ITEM_NAME)) return styles;

  const pattern = new RegExp(`(<style\\b[^>]*name="${TARGET_STYLE}"[^>]*>)([\\s\\S]*?)(</style>)`);
  const match = pattern.exec(styles);
  if (!match) {
    throw new Error(
      `withCutoutMode: no <style name="${TARGET_STYLE}"> in styles.xml; the generated template changed.`
    );
  }
  // Kept last so it is applied after every value the theme parent sets.
  const item = `\n    <item name="${ITEM_NAME}">${ITEM_VALUE}</item>`;
  return styles.replace(pattern, `${match[1]}${match[2]}${item}\n  ${match[3]}`);
}

module.exports = function withCutoutMode(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const stylesPath = await AndroidConfig.Styles.getProjectStylesXMLPathAsync(projectRoot);
      if (!fs.existsSync(stylesPath)) {
        throw new Error(`withCutoutMode: ${platformProjectRoot} has no res/values/styles.xml.`);
      }
      const styles = fs.readFileSync(stylesPath, 'utf8');
      const patched = addCutoutMode(styles);
      if (patched !== styles) fs.writeFileSync(stylesPath, patched, 'utf8');
      return cfg;
    },
  ]);
};

module.exports.addCutoutMode = addCutoutMode;
module.exports.STYLES_RELATIVE_PATH = path.join('app', 'src', 'main', 'res', 'values', 'styles.xml');