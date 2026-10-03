/**
 * Table-of-contents resolution tests.
 *
 * Two bugs motivated these: EPUB 2 NCX `content src` values were stored raw and
 * compared against spine paths that include the OPF directory (so every entry in
 * an `OEBPS/toc.ncx` pointed at nothing), and EPUB 3 `nav` hrefs lost their
 * `#fragment` because `resolveZipPath` strips it. Nested entries were also
 * flattened to depth 0, which is what made the chapter list a flat wall of text.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import { EpubArchive } from '../../services/epub/archive.ts';
import { readEpubPackage, type EpubPackage } from '../../services/epub/package.ts';

async function readPackage(files: Record<string, string>): Promise<EpubPackage> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const archive = await EpubArchive.open(await zip.generateAsync({ type: 'uint8array' }));
  return readEpubPackage(archive);
}

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

function opf(spine: string, manifest: string): string {
  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Sample</dc:title></metadata>
  <manifest>${manifest}</manifest>
  <spine>${spine}</spine>
</package>`;
}

test('NCX src is resolved against the NCX directory and keeps its fragment', async () => {
  const pkg = await readPackage({
    'mimetype': 'application/epub+zip',
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': opf(
      '<itemref idref="ch1"/><itemref idref="ch2"/>',
      '<item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="ch2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
    ),
    'OEBPS/toc.ncx': `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1" playOrder="1">
      <navLabel><text>First</text></navLabel>
      <content src="Text/ch1.xhtml"/>
    </navPoint>
    <navPoint id="n2" playOrder="2">
      <navLabel><text>Section one point two</text></navLabel>
      <content src="Text/ch1.xhtml#s2"/>
    </navPoint>
    <navPoint id="n3" playOrder="3">
      <navLabel><text>Second</text></navLabel>
      <content src="Text/ch2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`,
  });

  assert.equal(pkg.spine[1].path, 'OEBPS/Text/ch2.xhtml');
  assert.equal(pkg.toc[0].href, 'spine:0');
  assert.equal(pkg.toc[1].href, 'spine:0:anchor:s2');
  assert.equal(pkg.toc[2].href, 'spine:1');
});

test('NCX navPoint nesting produces TOC depth', async () => {
  const pkg = await readPackage({
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': opf(
      '<itemref idref="ch1"/>',
      '<item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
    ),
    'OEBPS/toc.ncx': `<ncx><navMap>
  <navPoint id="a"><navLabel><text>Part One</text></navLabel><content src="Text/ch1.xhtml"/>
    <navPoint id="b"><navLabel><text>Chapter 1</text></navLabel><content src="Text/ch1.xhtml#c1"/></navPoint>
  </navPoint>
</navMap></ncx>`,
  });

  assert.deepEqual(
    pkg.toc.map((item) => [item.label, item.depth ?? 0]),
    [
      ['Part One', 0],
      ['Chapter 1', 1],
    ]
  );
});

test('EPUB 3 nav hrefs decode percent-encoding and keep nesting depth', async () => {
  const pkg = await readPackage({
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': opf(
      '<itemref idref="c1"/>',
      '<item id="c1" href="Text/Chapter%201.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    ),
    'OEBPS/Text/nav.xhtml': `<html xmlns:epub="http://www.idpf.org/2007/ops">
  <body><nav epub:type="toc"><ol>
    <li><a href="Chapter%201.xhtml">Chapter 1</a></li>
  </ol></nav></body></html>`,
  });

  assert.equal(pkg.spine[0].path, 'OEBPS/Text/Chapter 1.xhtml');
  assert.equal(pkg.toc.length, 1);
  assert.equal(pkg.toc[0].href, 'spine:0');
  assert.equal(pkg.toc[0].label, 'Chapter 1');
});

test('EPUB 3 nav with nested ol produces TOC depth', async () => {
  const pkg = await readPackage({
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': opf(
      '<itemref idref="c1"/><itemref idref="c2"/>',
      '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    ),
    'OEBPS/Text/nav.xhtml': `<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
  <nav epub:type="toc">
    <ol>
      <li><span>Part One</span>
        <ol><li><a href="c1.xhtml">Chapter 1</a></li></ol>
      </li>
      <li><a href="c2.xhtml">Chapter 2</a></li>
    </ol>
  </nav>
</body></html>`,
  });

  assert.deepEqual(
    pkg.toc.map((item) => [item.label, item.depth ?? 0]),
    [
      ['Chapter 1', 1],
      ['Chapter 2', 0],
    ]
  );
});

test('a nav entry outside the spine is kept but carries no target', async () => {
  const pkg = await readPackage({
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': opf(
      '<itemref idref="c1"/>',
      '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
    ),
    'OEBPS/Text/nav.xhtml': `<html xmlns:epub="http://www.idpf.org/2007/ops"><body>
  <nav epub:type="toc"><ol>
    <li><a href="frontmatter.xhtml">Front matter</a></li>
    <li><a href="c1.xhtml">Chapter 1</a></li>
  </ol></nav>
</body></html>`,
  });

  assert.equal(pkg.toc.length, 2);
  assert.equal(pkg.toc[0].href, undefined);
  assert.equal(pkg.toc[1].href, 'spine:0');
});

test('chapter titles stay empty for spine items the navigation never named', async () => {
  const pkg = await readPackage({
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': opf(
      '<itemref idref="cover" linear="no"/><itemref idref="c1"/>',
      '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
    ),
    'OEBPS/toc.ncx': `<ncx><navMap>
  <navPoint id="a"><navLabel><text>Chapter 1</text></navLabel><content src="Text/c1.xhtml"/></navPoint>
</navMap></ncx>`,
  });

  // A fabricated "Chapter 2" for the cover page is what the plan calls out.
  assert.deepEqual(pkg.chapterTitles, ['', 'Chapter 1']);
  assert.equal(pkg.spine[0].linear, false);
  assert.equal(pkg.spine[1].linear, true);
});
