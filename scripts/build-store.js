const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const packageJson = require('../package.json');

const config = JSON.parse(JSON.stringify(packageJson.build));
const projectRoot = path.join(__dirname, '..');
const buildResourcesDir = path.join(projectRoot, 'build');
const appxAssetsDir = path.join(buildResourcesDir, 'appx');
const requiredAppxAssets = ['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'Wide310x150Logo.png'];
const requiredSourceAssets = ['assets/icon.png', 'assets/icon.ico', 'assets/StoreLogo_1080x1080.png', 'assets/StoreLogo_2160x2160.png'];
const missingAppxAssets = requiredAppxAssets.filter(name => !fs.existsSync(path.join(appxAssetsDir, name)));
const missingSourceAssets = requiredSourceAssets.filter(name => !fs.existsSync(path.join(projectRoot, name)));
if (missingAppxAssets.length || missingSourceAssets.length) {
  if (missingAppxAssets.length) console.error(`Missing APPX assets: ${missingAppxAssets.join(', ')}`);
  if (missingSourceAssets.length) console.error(`Missing source assets: ${missingSourceAssets.join(', ')}`);
  process.exit(1);
}
config.directories = { ...(config.directories || {}), buildResources: buildResourcesDir };
config.appx = {
  ...(config.appx || {}),
  publisher: 'CN=65585C77-A179-46B9-B0CA-60D868923F03',
  publisherDisplayName: 'Lirune',
  identityName: 'Lirune.LiruneReader',
  applicationId: 'Lirune.LiruneReader'
};
config.win = { ...(config.win || {}), target: [{ target: 'appx', arch: ['x64'] }] };
const configPath = path.join(os.tmpdir(), `novera-store-${process.pid}.json`);
fs.writeFileSync(configPath, JSON.stringify(config));
const hookPath = path.join(__dirname, 'builder-env-hook.js');
const result = spawnSync(process.execPath, ['-r', hookPath, require.resolve('electron-builder/cli.js'), '--win', 'appx', '--config', configPath], {
  stdio: 'inherit',
  env: { ...process.env }
});
fs.rmSync(configPath, { force: true });
process.exitCode = result.status === null ? 1 : result.status;
