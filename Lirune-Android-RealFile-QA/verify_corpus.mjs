#!/usr/bin/env node
/**
 * Engine-level verification of the Lirune QA corpus using the app's own
 * dependencies (JSZip and pdfjs-dist, resolved from ../mobile/node_modules),
 * so the fixtures are checked with the same code paths the app uses.
 *
 * Run:  node Lirune-Android-RealFile-QA/verify_corpus.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '..', 'mobile', 'noop.js'));
const JSZip = require('jszip');

const VALID = path.join(HERE, 'valid');
const EDGE = path.join(HERE, 'edge');

let checks = 0;
const failures = [];
function check(label, ok, detail = '') {
  checks++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures.push(label);
}

async function loadZip(file) {
  const buf = fs.readFileSync(file);
  return JSZip.loadAsync(buf);
}

async function verifyEpubWithJSZip() {
  const zip = await loadZip(path.join(VALID, 'sample-minimal.epub'));
  const names = Object.keys(zip.files);
  check('jszip: epub opens', true, `${names.length} entries`);
  const mimetype = await zip.file('mimetype').async('string');
  check('jszip: mimetype readable', mimetype === 'application/epub+zip', mimetype);

  const container = await zip.file('META-INF/container.xml').async('string');
  const opfPath = container.match(/full-path=["']([^"']+)["']/i)[1];
  check('jszip: container full-path regex used by MetadataExtractor', opfPath === 'OEBPS/content.opf', opfPath);

  const opf = await zip.file(opfPath).async('string');
  const title = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i)[1].trim();
  const author = opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i)[1].trim();
  const desc = opf.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i)[1].trim();
  const itemrefs = opf.match(/<itemref\b[^>]*>/gi) || [];
  const metaCover = opf.match(/<meta\b[^>]*\bname=["']cover["'][^>]*\bcontent=["']([^"']+)["']/i);
  check('jszip: MetadataExtractor title parse', title === 'The Lighthouse at Sker Point', title);
  check('jszip: MetadataExtractor author parse', author.length > 0, author);
  check('jszip: MetadataExtractor description parse', desc.length > 40, `${desc.length} chars`);
  check('jszip: MetadataExtractor chapter count (spine itemrefs)', itemrefs.length === 6, String(itemrefs.length));
  check('jszip: MetadataExtractor meta name=cover -> id', !!metaCover, metaCover ? metaCover[1] : 'none');

  const coverHref = /<item\b[^>]*id="cover-img"[^>]*href="([^"]+)"/.exec(opf)[1];
  const coverEntry = zip.file('OEBPS/' + coverHref);
  check('jszip: cover image manifest entry resolves', !!coverEntry, coverHref);
  const coverB64 = await coverEntry.async('base64');
  check('jszip: cover image non-trivial', coverB64.length > 5000, `${coverB64.length} base64 chars`);

  let textChars = 0;
  for (const name of names.filter((n) => n.startsWith('OEBPS/chapter'))) {
    const html = await zip.file(name).async('string');
    textChars += (html.replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length;
  }
  check('jszip: readable body text across chapters', textChars > 600, `${textChars} words`);
}

async function verifyZipContainerWithJSZip() {
  const zip = await loadZip(path.join(EDGE, 'epub-in-zip.zip'));
  const entries = Object.entries(zip.files).filter(([, e]) => !e.dir);
  check('jszip: container entry list', entries.length === 1, entries.map(([p]) => p).join(','));
  const [entryPath, entry] = entries[0];
  const fileName = entryPath.split('/').pop();
  check('jszip: ZipInspectionService file name split', fileName === 'sample-minimal.epub', fileName);
  const inner = await entry.async('nodebuffer');
  const innerZip = await JSZip.loadAsync(inner);
  check('jszip: inner epub loads after extraction', innerZip.file('mimetype') !== null);
}

async function expectZipFailure(label, file) {
  try {
    await loadZip(file);
    check(label, false, 'unexpectedly loaded');
  } catch (err) {
    check(label, true, `${err.constructor.name}: ${String(err.message).slice(0, 60)}`);
  }
}

async function verifyPdfWithPdfjs() {
  const pdfjs = await import(
    pathToFileURL(createRequire(path.join(HERE, '..', 'mobile', 'noop.js')).resolve('pdfjs-dist/legacy/build/pdf.mjs'))
  );
  const { getDocument, OPS } = pdfjs;

  for (const [name, expectImage] of [
    ['sample-text.pdf', false],
    ['sample-cover-xmp.pdf', true],
  ]) {
    const file = path.join(VALID, name);
    const doc = await getDocument({
      data: new Uint8Array(fs.readFileSync(file)),
      useSystemFonts: false,
      isEvalSupported: false,
    }).promise;
    check(`pdfjs: ${name} opens`, doc.numPages === 2, `${doc.numPages} pages`);

    const meta = await doc.getMetadata();
    const info = meta.info || {};
    check(`pdfjs: ${name} Info.Title`, !!info.Title, String(info.Title));
    check(`pdfjs: ${name} Info.Author`, !!info.Author, String(info.Author));
    const xmp = meta.metadata ? meta.metadata.get('dc:title') : null;
    const xmpTitle = xmp && typeof xmp.toString === 'function' ? xmp.toString() : JSON.stringify(xmp);
    check(`pdfjs: ${name} XMP dc:title parsed`, !!xmp, xmpTitle.slice(0, 60));

    let chars = 0;
    let ops = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const opList = await page.getOperatorList();
      ops += opList.fnArray.length;
      const content = await page.getTextContent();
      chars += content.items.map((i) => i.str).join('').trim().length;
      page.cleanup();
    }
    check(`pdfjs: ${name} extracts text`, chars > 800, `${chars} chars`);
    check(`pdfjs: ${name} has drawing ops`, ops > 20, `${ops} ops`);

    if (expectImage) {
      const page = await doc.getPage(1);
      const opList = await page.getOperatorList();
      const hasImage = opList.fnArray.includes(OPS.paintImageXObject);
      check('pdfjs: cover page has an image XObject', hasImage, hasImage ? 'present' : 'none');
      page.cleanup();
      const rawXmp = meta.metadata ? meta.metadata.getRaw('xmpMM:Thumbnails') : null;
      const hasThumb = !!rawXmp && rawXmp.includes('xmpMM:Thumbnails') && rawXmp.includes('cover.jpg');
      check('pdfjs: XMP xmpMM:Thumbnails present', hasThumb, hasThumb ? 'yes' : 'no');
    }
    await doc.destroy();
  }
}

async function main() {
  await verifyEpubWithJSZip();
  await verifyZipContainerWithJSZip();
  await expectZipFailure('jszip: zero-byte .epub rejected', path.join(EDGE, 'zero-byte.epub'));
  await expectZipFailure('jszip: corrupt .epub rejected', path.join(EDGE, 'corrupt-zip.epub'));
  await verifyPdfWithPdfjs();

  console.log(`\n${checks} checks, ${failures.length} failures`);
  failures.forEach((f) => console.log('  FAILED: ' + f));
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
