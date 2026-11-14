const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const packageJson = require('../package.json');

const signingKeys = ['CSC_LINK', 'CSC_NAME', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK'];
const configuredSigning = signingKeys.filter((key) => process.env[key]);
const hasCertificate = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK || process.env.CSC_NAME);
const hasPasswordOnly = Boolean(process.env.CSC_KEY_PASSWORD) && !hasCertificate;

if (hasPasswordOnly || (configuredSigning.length > 0 && !hasCertificate)) {
  console.error('Signing configuration is incomplete. Set CSC_LINK (and CSC_KEY_PASSWORD when required), or clear all CSC_* signing variables for an unsigned local build.');
  process.exit(1);
}

const env = { ...process.env };
if (!hasCertificate) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  env.ELECTRON_BUILDER_ALLOW_UNRESOLVED_CERTIFICATE = 'true';
  console.log('Building an unsigned local NSIS installer: no signing certificate is configured.');
} else {
  console.log('Building a signed NSIS installer using the configured certificate.');
}

const args = [require.resolve('electron-builder/cli.js'), '--win', 'nsis'];
let temporaryConfig;
let temporaryDir;
if (!hasCertificate) {
  const localConfig = JSON.parse(JSON.stringify(packageJson.build));
  localConfig.win = {
    ...localConfig.win,
    signExecutable: false,
    signAndEditExecutable: true,
    forceCodeSigning: false
  };
  temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lirune-build-'));
  temporaryConfig = path.join(temporaryDir, 'electron-builder.json');
  fs.writeFileSync(temporaryConfig, JSON.stringify(localConfig), { mode: 0o600 });
  args.push('--config', temporaryConfig);
}
const result = spawnSync(process.execPath, args, {
  env,
  stdio: 'inherit'
});
if (temporaryDir) fs.rmSync(temporaryDir, { recursive: true, force: true });
process.exitCode = result.status === null ? 1 : result.status;
