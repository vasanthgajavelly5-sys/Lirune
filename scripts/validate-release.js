const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const version = require(path.join(root, 'package.json')).version;
const installer = path.join(dist, `Lirune Reader-${version}-Setup.exe`);
const storePackage = path.join(dist, `Lirune Reader-${version}-Setup.appx`);
const unpacked = path.join(dist, 'win-unpacked');
const executable = path.join(unpacked, 'Lirune Reader.exe');
const appArchive = path.join(unpacked, 'resources', 'app.asar');
const forbidden = [
  'Master_EPUB_Library_All', '.env', '.pfx', '.p12', '.pem', '.key',
  // Development-only material. The packaging allowlist already excludes these,
  // but a build that picks them up should fail validation rather than ship.
  'qa', 'downloads', 'Batch1-Fixes', 'Batch2-Fixes', 'Batch3-Fixes',
  'Lirune-Reader-Source', 'Lirune-Reader-Current-State', 'debug_page',
  '.epub', '.azw3', '.mobi', '.cbr', '.fb2', '.cbz'
];

const failures = [];
const required = process.argv.includes('--store')
  ? [['Store package', storePackage]]
  : [['installer', installer], ['application executable', executable], ['application archive', appArchive]];
for (const [label, file] of required) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 1024) failures.push(`Missing or incomplete ${label}: ${file}`);
}
for (const name of fs.readdirSync(dist)) {
  if (forbidden.some((value) => name.includes(value))) failures.push(`Forbidden release content: ${name}`);
}
if (process.argv.includes('--store') && fs.existsSync(storePackage) && fs.statSync(storePackage).size >= 1024) {
  const archive = path.join(require('os').tmpdir(), `novera-validate-${process.pid}.zip`);
  const extractDir = path.join(require('os').tmpdir(), `novera-validate-${process.pid}`);
  require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command', `Copy-Item '${storePackage}' '${archive}'; Expand-Archive -LiteralPath '${archive}' -DestinationPath '${extractDir}' -Force`]);
  const manifest = fs.readFileSync(path.join(extractDir, 'AppxManifest.xml'), 'utf8');
  if (/Publisher=['"]CN=ms['"]/.test(manifest)) failures.push('Store package still uses electron-builder placeholder publisher CN=ms');
  if (!/Name=['"]Lirune\.LiruneReader['"]/.test(manifest)) failures.push('Store package missing Identity Name="Lirune.LiruneReader"');
  if (!/Publisher=['"]CN=65585C77-A179-46B9-B0CA-60D868923F03['"]/.test(manifest)) failures.push('Store package missing Publisher="CN=65585C77-A179-46B9-B0CA-60D868923F03"');
  if (!manifest.includes('<PublisherDisplayName>Lirune</PublisherDisplayName>')) failures.push('Store package missing PublisherDisplayName="Lirune"');
  if (!new RegExp(`Version=['"]${version}\\.0['"]`).test(manifest)) failures.push(`Store package missing Version="${version}.0"`);
  if (!/Id=['"]Lirune\.LiruneReader['"]/.test(manifest)) failures.push('Store package missing Application Id="Lirune.LiruneReader"');
  fs.rmSync(archive, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated Lirune Reader ${version} Windows release artifacts.`);
if (process.argv.includes('--store')) {
  console.log(`Store package: ${storePackage}`);
  console.log('Manifest values verified:');
  console.log('  Identity Name = Lirune.LiruneReader');
  console.log('  Publisher = CN=65585C77-A179-46B9-B0CA-60D868923F03');
  console.log('  PublisherDisplayName = Lirune');
  console.log(`  Version = ${version}.0`);
  console.log('  Application Id = Lirune.LiruneReader');
} else {
  console.log(`Installer: ${installer}`);
  console.log(`Application: ${executable}`);
  console.log('Uninstaller: must be verified by installing and uninstalling the generated installer on Windows.');
}
