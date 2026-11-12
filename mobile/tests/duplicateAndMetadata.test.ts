/**
 * Duplicate-detection and OPF metadata tests.
 *
 * The old rule compared an imported file name against an existing book's title, so
 * a renamed copy of a book imported again and two different books sharing a file
 * name were silently skipped. Both directions are pinned down here, together with
 * the shared OPF parser that discovery and import now agree on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findDuplicate,
  isDuplicateOf,
  normalizeFileName,
  normalizeForMatch,
} from '../services/import/duplicateCheck.ts';
import { decodeXmlText, parseOpfMetadata } from '../services/epub/package.ts';
import type { Book } from '../models/Book.ts';

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 'b1',
    title: 'Alice in Wonderland',
    author: 'Lewis Carroll',
    format: 'epub',
    uri: 'file:///storage/emulated/0/Alice.epub',
    filePath: '/data/books/b1/Alice.epub',
    fileSize: 1024,
    coverColor: '#2C2D35',
    progress: 0,
    chapterCount: 1,
    isFavorite: false,
    collectionIds: [],
    dateAdded: 0,
    availability: 'available',
    metadata: { sourceFileName: 'Alice.epub', sourceFileSize: 1024 },
    ...overrides,
  } as Book;
}

test('a renamed copy of the same book is a duplicate once its metadata has been read', () => {
  const existing = book();
  // Discovery reads the OPF of a local EPUB, so a scan of a renamed copy knows its
  // real title before the user can try to import it again.
  assert.ok(
    isDuplicateOf(
      { format: 'epub', fileName: 'alice-final-v2.epub', size: 1024, title: 'Alice in Wonderland', author: 'Lewis Carroll' },
      existing
    )
  );
});

test('two different books with the same file name both import', () => {
  const existing = book();
  // Same name, different bytes: not the same book.
  assert.equal(
    isDuplicateOf({ format: 'epub', fileName: 'Alice.epub', size: 2048 }, existing),
    false
  );
});

test('a same-size file with the same title and author is a duplicate even when renamed', () => {
  const existing = book({ metadata: { sourceFileName: 'unknown-download', sourceFileSize: 2048 } });
  assert.ok(
    isDuplicateOf(
      { format: 'epub', fileName: 'whatever.epub', size: 2048, title: 'alice in wonderland', author: 'Lewis Carroll' },
      existing
    )
  );
});

test('a different book that happens to share a title is not a duplicate', () => {
  const existing = book({ title: 'Collected Poems', author: 'Ada Byron' });
  assert.equal(
    isDuplicateOf({ format: 'epub', fileName: 'collected-poems.epub', size: 2048, title: 'Collected Poems', author: 'Someone Else' }, existing),
    false
  );
});

test('a different format is never a duplicate', () => {
  assert.equal(isDuplicateOf({ format: 'pdf', fileName: 'Alice.epub', size: 1024 }, book()), false);
});

test('a name-only match without a size is not enough to skip an import', () => {
  const existing = book();
  // Neither side knows the size (an SAF URI before the copy): importing is safer
  // than silently telling the user the book is already there.
  assert.equal(isDuplicateOf({ format: 'epub', fileName: 'Alice.epub' }, existing), false);
  assert.equal(
    isDuplicateOf({ format: 'epub', fileName: 'Alice.epub' }, book({ fileSize: 0, metadata: {} })),
    false
  );
});

test('findDuplicate scans the library', () => {
  const library = [book({ id: 'other', format: 'pdf', metadata: {} }), book()];
  assert.equal(findDuplicate({ format: 'epub', fileName: 'Alice.epub', size: 1024 }, library)?.id, 'b1');
  assert.equal(findDuplicate({ format: 'epub', fileName: 'Nothing.epub', size: 99 }, library), undefined);
});

test('normalisation ignores case, punctuation and accents', () => {
  assert.equal(normalizeForMatch('Café au Lait!'), normalizeForMatch('cafe-au-lait'));
  assert.equal(normalizeFileName('Alice_In_Wonderland.epub'), 'aliceinwonderland');
});

/* -------------------------------------------------------------------------- */
/* OPF metadata                                                               */
/* -------------------------------------------------------------------------- */

const OPF = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title><![CDATA[Tom &amp; Jerry]]></dc:title>
    <dc:creator>William &amp; Mary</dc:creator>
    <dc:creator opf:role="aut">Second Author</dc:creator>
    <dc:language>en-GB</dc:language>
    <dc:publisher>Example Press</dc:publisher>
    <dc:description>A &quot;story&quot;.</dc:description>
    <meta name="calibre:series" content="Ignored"/>
  </metadata>
  <manifest>
    <item id="cover" href="Images/cover.jpg" media-type="image/jpeg"/>
    <item id="cover3" href="images/cover2.jpg" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine><itemref idref="cover"/></spine>
</package>`;

test('the OPF parser reads titles, every author and the language', () => {
  const metadata = parseOpfMetadata(OPF, 'OEBPS/content.opf');
  assert.equal(metadata.title, 'Tom & Jerry');
  assert.deepEqual(metadata.authors, ['William & Mary', 'Second Author']);
  assert.equal(metadata.language, 'en-GB');
  assert.equal(metadata.publisher, 'Example Press');
  assert.equal(metadata.description, 'A "story".');
});

test('the OPF parser resolves the cover against the OPF directory', () => {
  const metadata = parseOpfMetadata(OPF, 'OEBPS/content.opf');
  assert.equal(metadata.coverHref, 'OEBPS/images/cover2.jpg');
});

test('XML entities and CDATA are decoded', () => {
  assert.equal(decodeXmlText('<![CDATA[Tea &amp; Coffee]]>'), 'Tea & Coffee');
  assert.equal(decodeXmlText('a &lt;b&gt; &quot;c&quot; &#39;d&#39; &#x41;'), `a <b> "c" 'd' A`);
});

test('a CDATA title survives the parser', () => {
  const metadata = parseOpfMetadata(
    '<package><metadata><dc:title xmlns:dc="x"><![CDATA[Wrapped]]></dc:title></metadata></package>',
    'content.opf'
  );
  assert.equal(metadata.title, 'Wrapped');
});
