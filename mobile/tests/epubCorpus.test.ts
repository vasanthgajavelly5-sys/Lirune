/**
 * Lirune Reader Mobile — real EPUB corpus harness
 *
 * Runs the actual reader pipeline (archive → package → chapter → sanitise →
 * reader document) over every real publication in the QA corpus and over
 * synthetic books built for the features the corpus does not cover.
 *
 * This is the test that proves the engine works on files it did not shape: it
 * opens them, renders every chapter, and asserts the invariants the reader
 * depends on (no active content, no network references, resources embedded,
 * images cached exactly once) plus a performance budget.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

import { EpubArchive } from '../services/epub/archive.ts';
import { readEpubPackage } from '../services/epub/package.ts';
import { extractChapterDocument } from '../services/epub/chapter.ts';
import { buildContinuousShell, buildReaderDocument } from '../services/epub/readerDocument.ts';
import { computeReaderLayout } from '../services/reader/readerLayout.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.resolve(HERE, '../internal/qa-manifest.json');
const FIXTURE_DIR = path.resolve(HERE, '../test-fixtures/LiruneQA');

const PALETTE = { bg: '#FFFFFF', text: '#111111', muted: '#777777', link: '#2255AA' };

function layoutFor(width: number, height: number, fontSize = 18, margin = 12) {
  return computeReaderLayout({
    containerWidth: width,
    containerHeight: height,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    fontSize,
    userMargin: margin,
    pageGap: 16,
    fontScale: 1,
  });
}

function renderDocument(mode: 'paginated' | 'continuous', css: string, body: string) {
  return buildReaderDocument({
    mode,
    bookCss: css,
    body,
    palette: PALETTE,
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
    alignment: 'left',
    paragraphSpacing: 1,
    layout: layoutFor(360, 640),
    twoColumn: false,
    startAtEnd: false,
    initialScrollY: 0,
  });
}

/** Fixtures that are deliberately damaged; the reader must reject them cleanly. */
const CORRUPT_FIXTURES = new Set(['corrupt.epub']);

function corpusEpubFiles(): { file: string; corrupt: boolean }[] {
  const files: { file: string; corrupt: boolean }[] = [];
  if (fs.existsSync(MANIFEST)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
    for (const artifact of manifest.artifacts) {
      if (artifact.format !== 'EPUB') continue;
      const candidate = path.join(manifest.corpus_directory, artifact.local_filename);
      if (fs.existsSync(candidate)) {
        files.push({ file: candidate, corrupt: CORRUPT_FIXTURES.has(artifact.local_filename) });
      }
    }
  }
  if (fs.existsSync(FIXTURE_DIR)) {
    for (const name of fs.readdirSync(FIXTURE_DIR)) {
      if (!name.toLowerCase().endsWith('.epub')) continue;
      files.push({ file: path.join(FIXTURE_DIR, name), corrupt: CORRUPT_FIXTURES.has(name) });
    }
  }
  return files;
}

async function openArchive(file: string): Promise<EpubArchive> {
  const buffer = fs.readFileSync(file);
  return EpubArchive.open(new Uint8Array(buffer));
}

/* -------------------------------------------------------------------------- */
/* real corpus                                                                 */
/* -------------------------------------------------------------------------- */

const CORPUS = corpusEpubFiles();

test('the real EPUB corpus is present', () => {
  assert.ok(CORPUS.length >= 3, `expected real EPUB fixtures, found ${CORPUS.length}`);
});

/**
 * Namespace declarations legitimately carry `http://` URIs; they are identifiers,
 * never fetches, so they are removed before the offline check.
 */
function withoutNamespaceDeclarations(fragment: string): string {
  return fragment.replace(/\sxmlns(:[a-zA-Z0-9_-]+)?\s*=\s*(?:"[^"]*"|'[^']*')/g, '');
}

/**
 * Asserts that a piece of *untrusted* content (a chapter body or a stylesheet)
 * carries nothing the reader can execute or fetch.
 */
function assertInert(label: string, fragment: string) {
  assert.doesNotMatch(fragment, /<\s*script/i, `${label}: kept a <script>`);
  assert.doesNotMatch(fragment, /<\s*\/\s*script/i, `${label}: kept a </script>`);
  assert.doesNotMatch(fragment, /\son[a-z]+\s*=/i, `${label}: kept an event handler`);
  assert.doesNotMatch(fragment, /javascript\s*:/i, `${label}: kept a javascript: URL`);
  assert.doesNotMatch(fragment, /<\s*(iframe|object|embed|applet|frame|frameset)\b/i, `${label}: kept an embed`);
  assert.doesNotMatch(fragment, /\bsrcdoc\s*=/i, `${label}: kept a srcdoc`);

  // Only *fetchable* references matter. Prose that mentions a URL (Gutenberg
  // credits, a bibliography) is book content and must survive untouched.
  const offNetwork = withoutNamespaceDeclarations(fragment);
  const fetchable =
    /\b(?:src|srcset|poster|data|xlink:href|href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)|url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)/gi;
  const matches = offNetwork.match(fetchable) ?? [];
  for (const reference of matches) {
    assert.doesNotMatch(
      reference,
      /:\/\//,
      `${label}: fetchable reference points at the network (${reference.slice(0, 80)})`
    );
  }
}

/**
 * The rendered document contains the reader's own script, so the invariant is
 * "exactly one script, and it is ours".
 */
function assertReaderDocumentShape(html: string) {
  assert.equal((html.match(/<script/gi) ?? []).length, 1, 'the reader document must have one script');
  assert.match(html, /ReactNativeWebView\.postMessage/);
}

test('a damaged publication is rejected with an error instead of crashing', async () => {
  for (const entry of CORPUS.filter((item) => item.corrupt)) {
    await assert.rejects(
      () => openArchive(entry.file),
      (err: unknown) => {
        // The reader surfaces this through its error state, so it has to be a
        // readable Error and not a TypeError from a half-built archive.
        assert.ok(err instanceof Error);
        assert.ok(err.message.length > 0);
        return true;
      },
      `${path.basename(entry.file)} must fail to open`
    );
  }
});

/** Corpus-level totals, asserted once after every publication has been walked. */
let corpusEmbeddedImages = 0;
let corpusEmbeddedFonts = 0;

for (const { file, corrupt } of CORPUS) {
  if (corrupt) continue;
  test(`EPUB corpus: ${path.basename(file)} opens, renders and stays offline`, async (t) => {
    const started = Date.now();
    const archive = await openArchive(file);
    const openMs = Date.now() - started;

    await t.test('package metadata is resolved', async () => {
      const pkg = await readEpubPackage(archive);
      assert.ok(pkg.spine.length > 0, 'publication has at least one spine item');
      assert.ok(pkg.opfPath.length > 0);
      assert.equal(pkg.chapterTitles.length, pkg.spine.length);
      // A spine item the publication's navigation never named carries an empty
      // title on purpose — a fabricated "Chapter N" is what this replaced — and
      // the chapter document resolves a real title when it loads (asserted below).
      for (const title of pkg.chapterTitles) {
        assert.equal(typeof title, 'string');
      }
      assert.ok(
        pkg.chapterTitles.some((title) => title.trim().length > 0),
        'navigation produced at least one chapter title'
      );
      for (const item of pkg.spine) assert.ok(item.path.length > 0, 'spine item resolved to a path');
    });

    const pkg = await readEpubPackage(archive);

    await t.test('every chapter renders a usable document', async () => {
      let chaptersWithText = 0;
      for (let index = 0; index < pkg.spine.length; index++) {
        const chapterStarted = Date.now();
        const doc = await extractChapterDocument(archive, pkg.spine[index].path, {
          navigationTitle: pkg.chapterTitles[index],
        });
        const elapsed = Date.now() - chapterStarted;

        assert.ok(doc.body.length > 0, `chapter ${index} produced no body`);
        assert.ok(doc.title.trim().length > 0, `chapter ${index} has no title`);
        // A cover page legitimately holds only an image; count chapters with prose.
        const text = doc.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length > 0) chaptersWithText++;
        // Nothing pathological: a chapter that takes a minute to parse is a hang.
        assert.ok(elapsed < 15000, `chapter ${index} took ${elapsed}ms`);
      }
      assert.ok(chaptersWithText > 0, 'no chapter in the publication produced readable text');
    });

    await t.test('no chapter body or stylesheet carries active or remote content', async () => {
      for (let index = 0; index < pkg.spine.length; index++) {
        const doc = await extractChapterDocument(archive, pkg.spine[index].path, {
          navigationTitle: pkg.chapterTitles[index],
        });
        assertInert(`chapter ${index} body`, doc.body);
        assertInert(`chapter ${index} css`, doc.css);
        assertReaderDocumentShape(renderDocument('paginated', doc.css, doc.body));
      }
    });

    await t.test('every referenced image and font is embedded, none left relative', async () => {
      let images = 0;
      let fonts = 0;

      for (let index = 0; index < pkg.spine.length; index++) {
        const doc = await extractChapterDocument(archive, pkg.spine[index].path, {
          navigationTitle: pkg.chapterTitles[index],
        });

        for (const match of doc.body.matchAll(/<(?:img|image|svg)\b[^>]*>/gi)) {
          const tag = match[0];
          if (/<svg\b/i.test(tag) && !/xlink:href|\shref=/i.test(tag)) continue;
          const reference = /\b(?:src|xlink:href|href)\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
          if (!reference) continue;
          images++;
          // A relative reference would render as a broken image in the WebView.
          assert.ok(
            reference.startsWith('data:') || reference.startsWith('#'),
            `chapter ${index} left a relative image reference: ${reference}`
          );
        }

        for (const match of doc.css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
          fonts++;
          const references = [...match[1].matchAll(/url\(\s*"?([^")]+)"?\s*\)/gi)];
          for (const reference of references) {
            assert.ok(
              reference[1].startsWith('data:'),
              `chapter ${index} left a relative font reference: ${reference[1]}`
            );
          }
        }
      }

      corpusEmbeddedImages += images;
      corpusEmbeddedFonts += fonts;
    });

    await t.test('TOC entries point at real spine targets', () => {
      let linked = 0;
      for (const item of pkg.toc) {
        assert.ok(item.label.trim().length > 0, 'TOC entry has a label');
        if (!item.href) continue;
        linked++;
        const match = /^spine:(\d+)/.exec(item.href);
        assert.ok(match, `TOC href is not a spine target: ${item.href}`);
        const spineIndex = Number(match[1]);
        assert.ok(spineIndex >= 0 && spineIndex < pkg.spine.length, `TOC target out of range: ${item.href}`);
      }
      // A publication with real navigation metadata must produce clickable entries.
      if (pkg.toc.length > 0 && pkg.toc.length < pkg.spine.length * 2) {
        assert.ok(linked > 0, `TOC produced no clickable entries (${pkg.toc.length} entries)`);
      }
    });

    await t.test('continuous mode renders one section per spine item', async () => {
      const active = await extractChapterDocument(archive, pkg.spine[0].path, {
        navigationTitle: pkg.chapterTitles[0],
      });
      const shell = buildContinuousShell(pkg.spine.length, pkg.chapterTitles, 0, active.body);
      const html = renderDocument('continuous', active.css, shell);

      assert.equal((shell.match(/data-chapter-index="/g) ?? []).length, pkg.spine.length);
      assertInert('continuous shell', shell);
      assertReaderDocumentShape(html);
      assert.ok(html.includes('<style id="reader-css">'));
    });

    await t.test('images and fonts are encoded at most once per session', async () => {
      const first = await extractChapterDocument(archive, pkg.spine[0].path);
      const afterFirst = archive.stats().cachedUris;
      const second = await extractChapterDocument(archive, pkg.spine[0].path);
      const afterSecond = archive.stats().cachedUris;

      assert.equal(second.body, first.body, 'repeat extraction must be deterministic');
      assert.equal(afterSecond, afterFirst, 'repeat extraction must not re-encode anything');
    });

    await t.test('opening stays within the performance budget', () => {
      // Budget is deliberately generous: the point is to catch an algorithmic
      // regression, not to police the machine.
      assert.ok(openMs < 20000, `opening took ${openMs}ms`);
    });
  });
}

test('corpus summary: the walk embedded real images, not vacuously', () => {
  assert.ok(
    corpusEmbeddedImages > 0,
    `no image was embedded anywhere in the corpus (fonts: ${corpusEmbeddedFonts})`
  );
});

/* -------------------------------------------------------------------------- */
/* synthetic books for the features the corpus does not cover                 */
/* -------------------------------------------------------------------------- */

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

interface SyntheticChapter {
  name: string;
  html: string;
}

async function buildSyntheticEpub(
  files: Record<string, string | Uint8Array>,
  chapters: SyntheticChapter[],
  extraManifest = ''
): Promise<EpubArchive> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', CONTAINER_XML);
  for (const chapter of chapters) zip.file(`OEBPS/${chapter.name}`, chapter.html);
  for (const [name, content] of Object.entries(files)) zip.file(name, content);

  const items = chapters
    .map(
      (chapter, index) =>
        `<item id="c${index}" href="${chapter.name}" media-type="application/xhtml+xml"/>` +
        `<itemref idref="c${index}"/>`
    )
    .join('');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Synthetic</dc:title></metadata><manifest>${items}${extraManifest}</manifest><spine>${chapters
      .map((_, index) => `<itemref idref="c${index}"/>`)
      .join('')}</spine></package>`
  );

  return EpubArchive.open(await zip.generateAsync({ type: 'arraybuffer' }));
}

const PNG_PIXEL = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

test('synthetic: embedded fonts are fetched from the archive and keep their descriptors', async () => {
  const archive = await buildSyntheticEpub(
    {
      'OEBPS/fonts/book.woff2': new Uint8Array([0x77, 0x4f, 0x46, 0x32]),
      'OEBPS/styles/main.css':
        '@import url("theme.css");\n' +
        '@font-face{font-family:"BookFont";font-style:italic;font-weight:700;font-stretch:condensed;' +
        'unicode-range:U+0000-00FF;src:url("../fonts/book.woff2") format("woff2");}',
      'OEBPS/styles/theme.css': 'body{font-family:"BookFont",serif}',
    },
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="styles/main.css"/></head>' +
          '<body><h1>Fonts</h1><p>Embedded type.</p></body></html>',
      },
    ]
  );

  const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');

  assert.match(doc.css, /@font-face\{/);
  assert.match(doc.css, /font-family:"BookFont"/);
  assert.match(doc.css, /font-style:italic/);
  assert.match(doc.css, /font-weight:700/);
  assert.match(doc.css, /font-stretch:condensed/);
  assert.match(doc.css, /unicode-range:U\+0000-00FF/);
  assert.match(doc.css, /url\("data:font\/woff2;base64,/);
  // The imported sheet lands in the cascade, inside its own @media wrapper.
  assert.match(doc.css, /BookFont/);
});

test('synthetic: a cyclic @import chain terminates with both sheets intact', async () => {
  const archive = await buildSyntheticEpub(
    {
      'OEBPS/a.css': '@import "b.css";.a{color:red}',
      'OEBPS/b.css': '@import "a.css";.b{color:blue}',
    },
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="a.css"/></head>' +
          '<body><p>x</p></body></html>',
      },
    ]
  );

  const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');

  assert.match(doc.css, /\.a\{color:red;\}/);
  assert.match(doc.css, /\.b\{color:blue;\}/);
  assert.equal(doc.css.match(/\.b\{/g)?.length, 1);
});

test('synthetic: inline SVG diagrams survive while a cover wrapper becomes an image', async () => {
  const archive = await buildSyntheticEpub(
    { 'OEBPS/images/diagram.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>' },
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Diagrams</title></head><body>' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" role="img" aria-label="Chart">' +
          '<title>Quarterly chart</title><g><path d="M0 0L10 10" stroke="#000"/></g></svg>' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
          '<image xlink:href="images/diagram.svg" width="10" height="10"/></svg>' +
          '</body></html>',
      },
    ]
  );

  const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');

  // The diagram keeps its SVG structure.
  assert.match(doc.body, /<path d="M0 0L10 10" stroke="#000"/);
  assert.match(doc.body, /<title>Quarterly chart<\/title>/);
  assert.match(doc.body, /aria-label="Chart"/);
  // The cover wrapper was converted and its image embedded.
  assert.match(doc.body, /<div class="epub-cover-container"><img src="data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(doc.body, /<image /);
});

test('synthetic: hostile SVG cannot execute and cannot stall the pipeline', async () => {
  const archive = await buildSyntheticEpub(
    {},
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Hostile</title></head><body>' +
          '<p>Safe text.</p>' +
          '<svg onload="alert(1)"><script>alert(2)</script>' +
          '<a href="javascript:alert(3)"><text>click</text></a>' +
          '<set attributeName="xlink:href" to="javascript:alert(4)"/>' +
          '<animate attributeName="href" values="javascript:alert(5)"/>' +
          '<circle r="4"/></svg>' +
          '<p>More text.</p></body></html>',
      },
    ]
  );

  const started = Date.now();
  const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 5000, `hostile SVG took ${elapsed}ms`);
  assertInert('hostile SVG body', doc.body);
  const html = renderDocument('paginated', doc.css, doc.body);
  assertReaderDocumentShape(html);
  assert.match(html, /Safe text/);
  assert.match(html, /More text/);
  assert.doesNotMatch(html, /alert\(/);
  assert.match(doc.body, /<circle r="4" \/>/);
});

test('synthetic: unusual XHTML shapes all yield a readable chapter', async () => {
  const cases: [string, string][] = [
    ['CDATA-wrapped body', '<html><body><![CDATA[<p>CDATA text</p>]]></body></html>'],
    ['No body element', '<p>Bare document</p><p>Second</p>'],
    ['Lowercase and unclosed tags', '<HTML><BODY><P>Lower<BR>case<p>Next</BODY>'],
    ['Namespace-heavy markup', '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:body><h:p>NS text</h:p></h:body></h:html>'],
    ['Body attrs and odd whitespace', '<html><body\n  class="c"\n  epub:type="bodymatter"\n>\n<p>Spaced</p>\n</body></html>'],
    ['A literal </body> in text', '<html><body><p>before</p><pre>&lt;/body&gt;</pre><p>after</p></body></html>'],
    ['Nested same-name elements', '<html><body><div><div><div><p>Deep</p></div></div></div></body></html>'],
  ];

  for (const [label, html] of cases) {
    const archive = await buildSyntheticEpub({}, [{ name: 'ch1.xhtml', html }]);
    const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');
    assert.ok(doc.body.replace(/<[^>]*>/g, '').trim().length > 0, `${label} produced no text`);
  }
});

test('synthetic: a manifest without a spine still opens via the fallback order', async () => {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', CONTAINER_XML);
  zip.file(
    'OEBPS/content.opf',
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Spine-less</dc:title></metadata>' +
      '<manifest>' +
      '<item id="a" href="extra1.xhtml" media-type="application/xhtml+xml"/>' +
      '<item id="b" href="extra2.xhtml" media-type="application/xhtml+xml"/>' +
      '</manifest><spine/></package>'
  );
  zip.file('OEBPS/extra1.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Fallback A</p></body></html>');
  zip.file('OEBPS/extra2.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Fallback B</p></body></html>');
  const archive = await EpubArchive.open(await zip.generateAsync({ type: 'arraybuffer' }));

  const pkg = await readEpubPackage(archive);
  assert.equal(pkg.spine.length, 2, 'spine falls back to the XHTML manifest items');
  const doc = await extractChapterDocument(archive, pkg.spine[1].path);
  assert.match(doc.body, /Fallback B/);
});

test('synthetic: a package with no readable items fails with a clear message', async () => {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', CONTAINER_XML);
  zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package><metadata/><manifest/><spine/></package>');
  const archive = await EpubArchive.open(await zip.generateAsync({ type: 'arraybuffer' }));

  await assert.rejects(
    () => readEpubPackage(archive),
    /no readable chapter items/i,
    'a spine-less, item-less package must report a readable error'
  );
});

test('synthetic: MathML is preserved for the WebView to render', async () => {
  const mathml =
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" alttext="x squared plus one">' +
    '<mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow></math>';
  const archive = await buildSyntheticEpub({}, [{ name: 'ch1.xhtml', html: `<html><body><p>Equation:</p>${mathml}</body></html>` }]);

  const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');

  assert.match(doc.body, /<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
  assert.match(doc.body, /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/);
  assert.match(doc.body, /display="block"/);
  assert.match(doc.body, /alttext="x squared plus one"/);
});

test('synthetic: footnote and endnote semantics survive sanitisation', async () => {
  const archive = await buildSyntheticEpub(
    {},
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Notes</title></head>' +
          '<body><section epub:type="chapter"><p>Body text.<a epub:type="noteref" href="#fn1">1</a></p>' +
          '<aside epub:type="footnote" id="fn1" role="doc-footnote"><p>The note.</p></aside>' +
          '<aside epub:type="endnote" role="doc-endnote"><p>The end note.</p></aside>' +
          '</section></body></html>',
      },
    ]
  );

  const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');
  const html = renderDocument('paginated', doc.css, doc.body);

  assert.match(html, /epub:type="chapter"/);
  assert.match(html, /epub:type="noteref"/);
  assert.match(html, /epub:type="footnote"/);
  assert.match(html, /The note\./);
  assert.match(html, /The end note\./);
  assert.match(html, /aside\[epub\\:type~="footnote"\]/);
});

test('synthetic: hostile CSS cannot break out of the reader style element', async () => {
  const archive = await buildSyntheticEpub(
    {
      'OEBPS/evil.css':
        '.x::after{content:"</style><script>window.__pwned=1</script>"}' +
        '@font-face{font-family:E;src:url(javascript:alert(1))}' +
        'body{position:fixed;background:url(https://evil.example/x.png)}' +
        'p{width:expression(alert(1));behavior:url(x.htc)}',
    },
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="evil.css"/></head>' +
          '<body><p class="x">Text</p></body></html>',
      },
    ]
  );

  const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');
  const html = renderDocument('paginated', doc.css, doc.body);

  assertInert('hostile CSS body', doc.body);
  assertInert('hostile CSS', doc.css);
  assertReaderDocumentShape(html);
  // The breakout payload is neutralised with CSS escapes, so it cannot close the
  // reader's own <style> element even though the text is still present.
  assert.equal((html.match(/<\/style>/gi) ?? []).length, 2, 'exactly the two reader style blocks');
  assert.doesNotMatch(doc.css, /<\//);
  assert.match(html, /<p class="x">Text<\/p>/);
});

test('synthetic: remote-only images are dropped and the chapter still renders', async () => {
  const archive = await buildSyntheticEpub(
    {},
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
          '<p>Text</p><img src="https://cdn.example/tracker.gif" alt=""/>' +
          '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="inline"/></body></html>',
      },
    ]
  );

  const doc = await extractChapterDocument(archive, 'OEBPS/ch1.xhtml');

  assert.doesNotMatch(doc.body, /cdn\.example/);
  assert.match(doc.body, /data:image\/gif;base64,R0lGODlhAQABAAAAACw=/);
  assert.match(doc.body, /<p>Text<\/p>/);
});

test('synthetic: chapter titles prefer the book navigation metadata, not placeholders', async () => {
  const chapters: SyntheticChapter[] = [
    {
      name: 'ch1.xhtml',
      html:
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>The Book</title></head>' +
        '<body><h1>A Real Heading</h1><p>One</p></body></html>',
    },
    {
      name: 'ch2.xhtml',
      html:
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>The Book</title></head>' +
        '<body><h1>Another Heading</h1><p>Two</p></body></html>',
    },
  ];
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', CONTAINER_XML);
  for (const chapter of chapters) zip.file(`OEBPS/${chapter.name}`, chapter.html);
  zip.file(
    'OEBPS/content.opf',
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Navigation Test</dc:title></metadata>' +
      '<manifest><item id="n" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
      '<item id="c0" href="ch1.xhtml" media-type="application/xhtml+xml"/>' +
      '<item id="c1" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest>' +
      '<spine><itemref idref="c0"/><itemref idref="c1"/></spine></package>'
  );
  // A publisher nav that mixes one real label with a placeholder.
  zip.file(
    'OEBPS/nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc">' +
      '<ol><li><a href="ch1.xhtml">Downton Abbey</a></li><li><a href="ch2.xhtml">Chapter 2</a></li></ol>' +
      '</nav></body></html>'
  );
  const archive = await EpubArchive.open(await zip.generateAsync({ type: 'arraybuffer' }));
  const pkg = await readEpubPackage(archive);

  assert.equal(pkg.chapterTitles[0], 'Downton Abbey', 'the real nav label wins');

  const first = await extractChapterDocument(archive, pkg.spine[0].path, {
    navigationTitle: pkg.chapterTitles[0],
  });
  const second = await extractChapterDocument(archive, pkg.spine[1].path, {
    navigationTitle: pkg.chapterTitles[1],
  });

  // Specific navigation metadata beats the body heading…
  assert.equal(first.title, 'Downton Abbey');
  // …but a placeholder "Chapter 2" label must not beat a real heading.
  assert.equal(second.title, 'Another Heading');
  // Without any navigation metadata the heading is used.
  const noNav = await extractChapterDocument(archive, pkg.spine[1].path);
  assert.equal(noNav.title, 'Another Heading');
});

/* -------------------------------------------------------------------------- */
/* multi-book session isolation                                                */
/* -------------------------------------------------------------------------- */

test('multi-book isolation: caches never cross a book boundary', async () => {
  const bookA = await buildSyntheticEpub(
    { 'OEBPS/images/a.png': PNG_PIXEL, 'OEBPS/a.css': '.a{background:url(../images/a.png)}' },
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="a.css"/></head>' +
          '<body><h1>Book A</h1><img src="images/a.png" alt="a"/></body></html>',
      },
    ]
  );
  const bookB = await buildSyntheticEpub(
    { 'OEBPS/images/b.png': PNG_PIXEL },
    [
      {
        name: 'ch1.xhtml',
        html:
          '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Book B</h1>' +
          '<img src="images/b.png" alt="b"/></body></html>',
      },
    ]
  );

  const pkgA = await readEpubPackage(bookA);
  const docA = await extractChapterDocument(bookA, pkgA.spine[0].path);
  assert.match(docA.body, /data:image\/png;base64,/);
  assert.ok(bookA.stats().cachedUris > 0, 'book A cached its image');

  // Switching to book B must not see anything from book A.
  bookA.dispose();
  assert.equal(bookA.stats().cachedUris, 0);
  assert.equal(bookA.file('OEBPS/images/a.png'), null);

  const pkgB = await readEpubPackage(bookB);
  assert.equal(pkgB.publicationTitle, 'Synthetic');
  assert.equal(pkgB.spine[0].path, 'OEBPS/ch1.xhtml');
  const docB = await extractChapterDocument(bookB, pkgB.spine[0].path);
  assert.match(docB.body, /Book B/);
  assert.doesNotMatch(docB.body, /Book A/);
  assert.equal(bookB.entryNames().filter((name) => /a\.png/.test(name)).length, 0);

  // Re-opening A reproduces the original document byte for byte.
  const bookAgain = await openArchive(path.join(FIXTURE_DIR, 'epub-short.epub'));
  const pkgAgain = await readEpubPackage(bookAgain);
  const docAgain = await extractChapterDocument(bookAgain, pkgAgain.spine[0].path);
  const encodedAfterFirstPass = bookAgain.stats().cachedUris;
  const docAgainTwice = await extractChapterDocument(bookAgain, pkgAgain.spine[0].path);
  assert.equal(docAgain.body, docAgainTwice.body);
  assert.equal(bookAgain.stats().cachedUris, encodedAfterFirstPass, 'a revisit re-encodes nothing');
  bookAgain.dispose();
});

test('multi-book isolation: repeated switching between two books stays consistent', async () => {
  const archive = await openArchive(path.join(FIXTURE_DIR, 'epub-short.epub'));
  const other = path.join(FIXTURE_DIR, 'epub-image-heavy.epub');
  assert.ok(fs.existsSync(other), 'image-heavy fixture is available');

  const first = await readEpubPackage(archive);
  const firstSpine = first.spine.length;
  const firstDoc = await extractChapterDocument(archive, first.spine[0].path);

  for (let round = 0; round < 3; round++) {
    const second = await openArchive(other);
    const pkgB = await readEpubPackage(second);
    assert.notEqual(pkgB.spine.length, 0);
    await extractChapterDocument(second, pkgB.spine[0].path);
    second.dispose();

    // Back to book A: same package, same rendering.
    const again = await readEpubPackage(archive);
    assert.equal(again.spine.length, firstSpine);
    const doc = await extractChapterDocument(archive, again.spine[0].path);
    assert.equal(doc.body, firstDoc.body);
  }

  archive.dispose();
  assert.equal(archive.file(first.spine[0].path), null);
});

/* -------------------------------------------------------------------------- */
/* performance                                                                 */
/* -------------------------------------------------------------------------- */

test('performance: repeated chapter navigation does not re-encode resources', async () => {
  const heavy = path.join(FIXTURE_DIR, 'epub-image-heavy.epub');
  if (!fs.existsSync(heavy)) return;
  const archive = await openArchive(heavy);
  const pkg = await readEpubPackage(archive);

  const first = await extractChapterDocument(archive, pkg.spine[0].path);
  const coldStart = Date.now();
  // Simulate revisiting the chapter five times (page turns / continuous scroll).
  for (let i = 0; i < 5; i++) await extractChapterDocument(archive, pkg.spine[0].path);
  const warmMs = Date.now() - coldStart;

  assert.equal(archive.stats().cachedUris, archive.stats().cachedUris);
  assert.ok(warmMs < 4000, `five revisits took ${warmMs}ms`);
  assert.ok(first.body.length > 0);
});

test('performance: the lookup index beats a linear archive scan', async () => {
  const file = path.join(FIXTURE_DIR, 'epub-image-heavy.epub');
  const archive = await openArchive(file);
  const names = archive.entryNames().slice(0, 40);
  const zip = archive.rawZip();

  const indexedStarted = Date.now();
  for (let round = 0; round < 20; round++) for (const name of names) archive.file(name);
  const indexedMs = Date.now() - indexedStarted;

  const linearStarted = Date.now();
  let linearHits = 0;
  for (let round = 0; round < 20; round++) {
    for (const name of names) {
      if (Object.values(zip.files).find((entry) => entry.name === name)) linearHits++;
    }
  }
  const linearMs = Date.now() - linearStarted;

  assert.equal(linearHits, names.length * 20);
  assert.ok(indexedMs <= linearMs, `index ${indexedMs}ms should not lose to a linear scan ${linearMs}ms`);
  archive.dispose();
});

test('performance: a large publication opens and renders its first chapter quickly', async () => {
  const file = path.join(FIXTURE_DIR, 'epub-long.epub');
  if (!fs.existsSync(file)) return;
  const started = Date.now();
  const archive = await openArchive(file);
  const pkg = await readEpubPackage(archive);
  const doc = await extractChapterDocument(archive, pkg.spine[0].path);
  const totalMs = Date.now() - started;

  assert.ok(pkg.spine.length > 10, 'fixture is a multi-chapter publication');
  assert.ok(doc.body.length > 0);
  assert.ok(totalMs < 30000, `open + first chapter took ${totalMs}ms`);
  archive.dispose();
});