const { execSync } = require('child_process');
const { Buffer } = require('buffer');
const fs = require('fs');
const JSZip = require('jszip');

async function main() {
  console.log('Fetching base64 from device...');
  const b64 = execSync(
    'adb shell "run-as com.lirune.reader base64 /data/user/0/com.lirune.reader/files/books/0d39c9fc-e203-44d6-8802-72ddbadf77ca.epub"',
    { maxBuffer: 100 * 1024 * 1024, encoding: 'utf8' }
  ).replace(/\r?\n/g, '');

  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync('mobile/internal/test_book_binary.epub', buf);
  console.log('Saved binary, size:', buf.length);

  const zip = await JSZip.loadAsync(buf);
  console.log('Zip loaded, files count:', Object.keys(zip.files).length);
  const container = await zip.file('META-INF/container.xml')?.async('text');
  const opfMatch = container.match(/full-path=["']([^"']+)["']/i);
  const opfPath = opfMatch ? opfMatch[1] : 'OEBPS/content.opf';
  console.log('opfPath:', opfPath);
  const opf = await zip.file(opfPath)?.async('text');

  const spineIdrefs = [];
  const spineTagRegex = /<itemref\b([^>]+)\/?>/gi;
  let m;
  while ((m = spineTagRegex.exec(opf)) !== null) {
    const idref = m[1].match(/\bidref=["']([^"']+)["']/i);
    if (idref) spineIdrefs.push(idref[1]);
  }
  console.log('Spine count:', spineIdrefs.length, 'first 5:', spineIdrefs.slice(0, 5));

  const manifest = {};
  const itemRegex = /<item\b([^>]+)\/?>/gi;
  while ((m = itemRegex.exec(opf)) !== null) {
    const id = m[1].match(/\bid=[\"']([^\"']+)[\"']/i);
    const href = m[1].match(/\bhref=[\"']([^\"']+)[\"']/i);
    if (id && href) manifest[id[1]] = href[1];
  }

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  for (let i = 0; i < Math.min(3, spineIdrefs.length); i++) {
    const id = spineIdrefs[i];
    const href = manifest[id];
    console.log(`\n--- Spine[${i}]: id=${id} href=${href} ---`);
    const path = opfDir + href;
    const file = zip.file(path) || Object.values(zip.files).find(f => f.name.toLowerCase() === path.toLowerCase());
    if (file) {
      const content = await file.async('text');
      console.log('Length:', content.length);
      console.log('Preview:', content.slice(0, 400));
    } else {
      console.log('File NOT found in zip for path:', path);
    }
  }
}

main().catch(console.error);
