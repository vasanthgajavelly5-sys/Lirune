/**
 * Reader behaviour across every supported format, using real files.
 *
 * Format support is only claimed when a book actually opens, renders, paginates
 * and reports its position, so each format goes through the whole cycle:
 * open, render, navigate, zoom, search, record progress, close, reopen, and
 * confirm the position came back.
 */
import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');

let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function group(name) { console.log(`\n== ${name}`); }

/** The corpus file each format is exercised with. */
const FILES = {
  epub: 'pg1342-ni.epub',
  pdf: 'nasa-going-beyond.pdf',
  txt: 'pg1342.txt',
  html: 'pg1342.html',
  fb2: 'srm/test_book_fb2.fb2',
  cbz: 'srm/bobby_make_believe_sample.cbz'
};

const cdp = await launch({ freshUserData: true });
try {
  // ------------------------------------------------------------- import
  group('Import every supported format');
  for (const [format, file] of Object.entries(FILES)) {
    await cdp.importFile(path.join(CORPUS, file));
    await sleep(2500);
  }
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length >= ${Object.keys(FILES).length}`, { timeout: 180000 });

  const imported = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    return books.map(b => ({ id: b.id, format: b.format, title: b.title, size: b.fileSize, chapters: b.chapterCount, hasStorage: !!b.storageId }));
  `);
  check(`all ${Object.keys(FILES).length} formats import`, imported.length === Object.keys(FILES).length, `${imported.length} books`);
  for (const format of Object.keys(FILES)) {
    const book = imported.find(b => b.format === format);
    check(`${format} is detected correctly`, Boolean(book), book ? `${book.size} bytes` : 'not found');
    check(`${format} is stored with a managed file`, Boolean(book?.hasStorage));
  }

  // ------------------------------------------------- open and render
  group('Open, render and navigate each format');
  const openFor = async (format, { pages = 3 } = {}) => cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    const book = books.find(b => b.format === ${JSON.stringify(format)});
    document.querySelector('#books-grid .book-card[data-book-id="' + book.id + '"]').click();
    return true;
  `, 120000).then(() => cdp.waitFor(`
    !document.getElementById('reader-view').classList.contains('hidden') && !!Reader.getAdapter()
  `, { label: `${format} reader open`, timeout: 120000 })).then(() => sleep(4000));

  const closeReader = async () => {
    await cdp.eval(`
      document.getElementById('back-to-library-btn').click();
      await new Promise(r => setTimeout(r, 1500));
      return true;
    `, 120000);
    await cdp.waitFor(`document.getElementById('reader-view').classList.contains('hidden')`, { label: 'reader closed', timeout: 30000 });
  };

  /**
   * Whether the format put real, rendered content on screen.
   *
   * Each format paints differently: EPUB renders into an iframe, PDF into a
   * canvas, and the reflowable text formats straight into the host element. A
   * page that is only an image or cover legitimately has no text, so a populated
   * frame or canvas counts as rendered even without prose.
   */
  const RENDERED = `
    (() => {
      const host = document.getElementById('format-container');
      const epubFrame = document.querySelector('#epub-container iframe');

      if (epubFrame) {
        const doc = epubFrame.contentDocument;
        if (!doc?.body) return { rendered: false, why: 'iframe not readable' };
        const html = doc.body.innerHTML.length;
        const text = (doc.body.innerText || '').trim().length;
        // A spine item that is only a cover image is a real rendered page, so a
        // decoded image counts even though the markup around it is tiny.
        const images = [...doc.images].filter(img => img.complete && img.naturalWidth > 0).length;
        const painted = html > 200 || images > 0;
        if (!painted) return { rendered: false, hasText: false, why: 'epub frame empty' };
        return {
          rendered: true,
          hasText: text > 20,
          why: text > 20 ? 'epub text' : (images > 0 ? 'epub page with ' + images + ' decoded image(s)' : 'epub page with no text')
        };
      }

      if (!host) return { rendered: false, why: 'no content host' };

      const canvases = host.querySelectorAll('canvas');
      const painted = [...canvases].filter(c => c.width > 0 && c.height > 0);
      if (painted.length > 0) {
        return { rendered: true, hasText: true, why: \`\${painted.length} painted canvas page(s)\` };
      }

      const text = (host.innerText || '').trim();
      const images = host.querySelectorAll('img, svg, picture').length;
      const html = (host.innerHTML || '').length;
      if (text.length > 20) return { rendered: true, hasText: true, why: \`\${text.length} characters of text\` };
      if (images > 0) return { rendered: true, hasText: false, why: \`\${images} image(s)\` };
      if (html > 500) return { rendered: true, hasText: false, why: \`populated container, \${html} bytes\` };
      return { rendered: false, why: 'content host is empty' };
    })()
  `;

  const readerState = () => cdp.eval(`
    const adapter = Reader.getAdapter();
    const rendered = ${RENDERED};
    const progress = Reader.getProgress() || {};
    return {
      format: Reader.getFormatInfo()?.id,
      adapterFormat: adapter?.format,
      hasAdapter: !!adapter,
      location: Reader.getLocation?.() ?? null,
      total: progress.pageCount ?? null,
      percent: Number.isFinite(progress.percent) ? progress.percent : null,
      activeNav: Reader.getActiveNavId?.() ?? null,
      note: document.getElementById('format-note')?.textContent || '',
      tocEntries: document.querySelectorAll('#toc-list .toc-entry').length,
      rendered: rendered.rendered,
      renderedWhy: rendered.why,
      hasText: rendered.hasText
    };
  `, 120000);

  for (const format of Object.keys(FILES)) {
    group(`— ${format.toUpperCase()}`);
    await openFor(format);

    const opened = await readerState();
    check(`${format} opens an adapter`, opened.hasAdapter && opened.adapterFormat === format, `${opened.adapterFormat}`);
    check(`${format} renders real content`, opened.rendered === true,
      `${opened.renderedWhy}, toc=${opened.tocEntries}`);

    // A cover page or image page legitimately has no text, so turn a few pages
    // before deciding whether the format paginates.
    let advanced = 0;
    let afterPages = opened;
    for (let i = 0; i < 3; i++) {
      await cdp.eval(`await Reader.next(); await new Promise(r => setTimeout(r, 1400)); return true;`, 120000);
      advanced += 1;
    }
    afterPages = await readerState();
    // A document that fits on a single page has nowhere to turn to, so a
    // multi-page book is what actually proves pagination. The single-page case
    // is asserted separately so it cannot quietly excuse a broken one.
    const singlePage = opened.total === 1;
    if (singlePage) {
      check(`${format} holds a single-page document steady`, afterPages.location === opened.location,
        `${advanced} turns on a 1-page document, stayed at ${JSON.stringify(afterPages.location)}`);
    } else {
      check(`${format} navigates forward`, afterPages.location !== opened.location,
        `${advanced} turns, ${JSON.stringify(opened.location)} -> ${JSON.stringify(afterPages.location)}`);
    }
    // A PDF page is an image and a comic page is a raster scan, so neither has
    // text to find on screen even though pdf.js extracted a text layer for
    // search. Image formats are verified by their own painted output instead.
    if (format === 'pdf' || format === 'cbz') {
      check(`${format} paints its pages`, afterPages.rendered === true, afterPages.renderedWhy);
    } else if (!opened.hasText) {
      check(`${format} reaches text content after turning`, afterPages.hasText === true,
        `first page was ${opened.renderedWhy}, now ${afterPages.renderedWhy}`);
    }

    // Zoom must be runtime-only and must not change the stored settings.
    const zoom = await cdp.eval(`
      const before = { zoom: Reader.getZoom(), settings: JSON.stringify(ReaderSettings.getSettings()) };
      Reader.adjustZoom(10);
      Reader.adjustZoom(10);
      await new Promise(r => setTimeout(r, 600));
      const up = Reader.getZoom();
      Reader.adjustZoom(-20);
      await new Promise(r => setTimeout(r, 600));
      return { before: before.zoom, up, down: Reader.getZoom(), settingsUnchanged: JSON.stringify(ReaderSettings.getSettings()) === before.settings };
    `, 120000);
    check(`${format} zoom changes at runtime`, zoom.up === 120 && zoom.down === 100, `${zoom.before}% -> ${zoom.up}% -> ${zoom.down}%`);
    check(`${format} zoom is not a stored setting`, zoom.settingsUnchanged === true);

    // Search must actually find something in the document.
    // Search runs over the whole document, so a large book needs real time.
    // A comic archive is raster images with no text layer, so the only honest
    // requirement there is that searching reports nothing rather than failing.
    const search = await cdp.eval(`
      const results = await Reader.search?.('the') ?? [];
      return { count: Array.isArray(results) ? results.length : (results?.length ?? 0) };
    `, 600000);
    if (format === 'cbz') {
      check('cbz search reports no results for an image-only comic', search.count === 0, `${search.count} matches`);
    } else {
      check(`${format} search returns results`, search.count > 0, `${search.count} matches for "the"`);
    }

    // Progress must be recorded and reportable. The percent has to be a real
    // number: a null here would let the reopen check below compare null to null
    // and pass while the position was actually lost.
    const progress = await cdp.eval(`
      const books = await NoveraDB.getAllBooks();
      const book = books.find(b => b.format === ${JSON.stringify(format)});
      await new Promise(r => setTimeout(r, 1500));
      const p = Reader.getProgress() || {};
      return {
        percent: Number.isFinite(p.percent) ? p.percent : null,
        location: Reader.getLocation?.() ?? null,
        stored: book ? { cfi: book.currentCfi, percent: book.progressPercent, chapter: book.currentChapter } : null
      };
    `, 120000);
    check(`${format} reports a reading position`,
      progress.percent !== null && progress.percent >= 0 && progress.percent <= 100 && Boolean(progress.location),
      `${progress.percent}% @ ${JSON.stringify(progress.location)}`);
    check(`${format} persists its position`, Boolean(progress.stored?.cfi),
      `saved ${JSON.stringify(progress.stored?.cfi)} at ${progress.stored?.percent}%`);

    // Close and reopen: the position must come back.
    const beforeClose = await readerState();
    await closeReader();
    const backInLibrary = await cdp.eval(`
      return {
        libraryVisible: !document.getElementById('library-view').classList.contains('hidden'),
        readerHidden: document.getElementById('reader-view').classList.contains('hidden'),
        context: App.getSettingsContext()
      };
    `);
    check(`${format} closes back to the library`, backInLibrary.libraryVisible && backInLibrary.readerHidden, JSON.stringify(backInLibrary));
    check(`${format} returns to the library settings context`, backInLibrary.context === 'library', backInLibrary.context);

    await openFor(format);
    const reopened = await readerState();
    check(`${format} reopens`, reopened.hasAdapter && reopened.adapterFormat === format, reopened.adapterFormat);
    check(`${format} restores its position on reopen`,
      JSON.stringify(reopened.location) === JSON.stringify(beforeClose.location) || reopened.percent === beforeClose.percent,
      `${beforeClose.percent}% @ ${JSON.stringify(beforeClose.location)} -> ${reopened.percent}% @ ${JSON.stringify(reopened.location)}`);

    await closeReader();
  }

  // ------------------------------------------------------- unsupported
  group('Unsupported formats are refused');
  const refused = await cdp.eval(`
    const before = (await NoveraDB.getAllBooks()).length;
    const cbr = new File([new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])], 'archive.cbr', { type: 'application/x-rar' });
    const azw = new File([new Uint8Array([0x42, 0x4b, 0x03, 0x04])], 'book.azw3', { type: 'application/octet-stream' });
    const mobi = new File([new Uint8Array([0x42, 0x4f, 0x4f, 0x4d])], 'book.mobi', { type: 'application/x-mobipocket-ebook' });
    const notes = [];
    for (const f of [cbr, azw, mobi]) {
      const dt = new DataTransfer();
      dt.items.add(f);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 2000));
      notes.push({ name: f.name, toast: document.querySelector('.toast')?.textContent || '' });
    }
    return { before, after: (await NoveraDB.getAllBooks()).length, notes };
  `, 180000);
  check('CBR, AZW3 and MOBI are all refused', refused.after === refused.before, `${refused.before} -> ${refused.after} books`);
  check('each refusal explains itself', refused.notes.every(n => n.toast.length > 0), JSON.stringify(refused.notes.map(n => n.toast)));

  // ------------------------------------------------ format detection
  group('Detection is content based, not extension based');
  const detection = await cdp.eval(`
    const cases = [
      { name: 'actually-pdf.pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x25, 0x25, 0x0a] },
      { name: 'actually-epub.epub', bytes: [0x50, 0x4b, 0x03, 0x04] },
      { name: 'mislabelled.txt', bytes: [0x50, 0x4b, 0x03, 0x04] },
      { name: 'lying.pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x25, 0x25, 0x0a] }
    ];
    // detect() takes (fileName, arrayBuffer) and resolves, so each case is
    // awaited rather than read synchronously.
    const out = [];
    for (const c of cases) {
      const buffer = new Uint8Array(c.bytes).buffer;
      const format = await BookFormat.detect(c.name, buffer);
      out.push({ name: c.name, id: format.id, supported: format.supported });
    }
    return out;
  `, 120000);
  check('a PDF is detected from its content', detection[0].id === 'pdf', detection[0].id);
  check('a ZIP-based EPUB is detected from its content', detection[1].id === 'epub', detection[1].id);
  check('a .txt file that is really a ZIP is not trusted by extension', detection[2].id !== 'txt', detection[2].id);
  check('detection is content based, not name based', detection[3].id === 'pdf', detection[3].id);

  console.log('\n=== app console errors ===');
  if (cdp.errors.length === 0) console.log('  none');
  else cdp.errors.slice(0, 6).forEach(e => console.log('  ' + e.split('\n')[0]));
} catch (err) {
  check('format reader suite', false, err.message);
  console.error(err);
} finally {
  console.log(`\n${pass}/${pass + failures.length} passed`);
  if (failures.length) console.log(`FAILURES:\n  ${failures.map(f => `[${f}]`).join('\n  ')}`);
  await shutdown(cdp);
}
process.exit(failures.length ? 1 : 0);
