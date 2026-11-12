import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import fs from 'node:fs';

const TEST_FILES = [
  { file: 'art_of_strategy.md', format: 'md', label: 'Markdown (.md)' },
  { file: 'alice.mobi', format: 'mobi', label: 'Kindle MOBI (.mobi)' },
  { file: 'sample_book.fbz', format: 'fbz', label: 'FictionBook Archive (.fbz)' },
  { file: 'sample_comic.cbr', format: 'cbr', label: 'Comic Archive RAR (.cbr)' }
];

let passes = 0;
let fails = 0;
const results = [];

function record(name, ok, details = '') {
  if (ok) {
    passes++;
    console.log(`  [PASS] ${name}${details ? ` -> ${details}` : ''}`);
  } else {
    fails++;
    console.log(`  [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
  }
  results.push({ name, ok, details });
}

console.log('================================================================');
console.log('STARTING LIVE ELECTRON QA SUITE FOR EXTENDED FORMATS');
console.log('Formats: Markdown (.md), Kindle (.mobi), FictionBook (.fbz), Comic (.cbr)');
console.log('================================================================\n');

const cdp = await launch({ freshUserData: true });

try {
  // 1. IMPORT ALL FILES
  console.log('== 1. Importing real test files into library');
  for (const t of TEST_FILES) {
    const filePath = path.resolve('test-docs', t.file);
    if (!fs.existsSync(filePath)) throw new Error(`Missing test file: ${filePath}`);
    console.log(`  Importing ${t.file}...`);
    await cdp.importFile(filePath);
    await sleep(2500);
  }

  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length >= ${TEST_FILES.length}`, {
    timeout: 30000,
    label: 'all books appear in library grid'
  });

  const books = await cdp.eval(`
    const all = await NoveraDB.getAllBooks();
    return all.map(b => ({
      id: b.id,
      title: b.title,
      author: b.author,
      format: b.format,
      fileSize: b.fileSize,
      chapterCount: b.chapterCount,
      hasStorage: !!b.storageId
    }));
  `);

  record('All 4 files imported successfully into DB', Array.isArray(books) && books.length === TEST_FILES.length, `${books?.length || 0} books in DB`);

  for (const t of TEST_FILES) {
    const book = books?.find(b => b.format === t.format);
    record(`Book [${t.format}] registered with correct format`, !!book, book ? `Title: "${book.title}", Storage: ${book.hasStorage}` : 'NOT FOUND');
    record(`Book [${t.format}] has managed storage file`, !!book?.hasStorage);
  }

  // 2. OPEN AND EXERCISE EACH BOOK
  for (const t of TEST_FILES) {
    console.log(`\n== 2. Testing Reader for [${t.label}]`);
    const book = books.find(b => b.format === t.format);
    if (!book) continue;

    // Click book card in library
    await cdp.eval(`
      const card = document.querySelector('#books-grid .book-card[data-book-id="${book.id}"]');
      if (card) card.click();
      return true;
    `);

    // Wait for reader view and adapter
    await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden') && !!Reader.getAdapter()`, {
      timeout: 30000,
      label: `reader opened for ${t.format}`
    });
    await sleep(2000);

    const readerState = await cdp.eval(`
      const ad = Reader.getAdapter();
      const host = document.getElementById('format-container');
      return {
        adapterName: ad?.constructor?.name,
        title: document.getElementById('book-title')?.textContent?.trim(),
        renderedBytes: host ? host.innerHTML.length : 0,
        capabilities: ad?.capabilities,
        flow: ad?.flow,
        navCount: ad?.getNavigation ? ad.getNavigation().length : 0,
        location: ad?.getLocation ? ad.getLocation() : null
      };
    `);

    record(`[${t.format}] Reader opened successfully`, !!readerState.adapterName, `Adapter: ${readerState.adapterName}, Title: "${readerState.title}", Rendered: ${readerState.renderedBytes} chars`);

    // Flow mode testing for reflowable formats
    if (readerState.capabilities?.typography) {
      console.log(`  Testing Paginated <-> Scrolled flow mode for [${t.format}]...`);
      // Switch to scrolled
      await cdp.eval(`
        Reader.getAdapter().applySettings({ flow: 'scrolled' });
        return true;
      `);
      await sleep(1500);

      const flowState = await cdp.eval(`return Reader.getAdapter().flow;`);
      record(`[${t.format}] Switched to Scrolled mode`, flowState === 'scrolled', `Current flow: ${flowState}`);

      // If TOC exists, test chapter jump in scrolled mode
      if (readerState.navCount > 1) {
        const jumpRes = await cdp.eval(`
          const ad = Reader.getAdapter();
          const nav = ad.getNavigation();
          const target = nav[1].target;
          ad.goTo(target);
          return { target, newLoc: ad.getLocation() };
        `);
        record(`[${t.format}] TOC chapter jump in scrolled mode`, !!jumpRes?.newLoc, `Jumped to chapter 2 (${jumpRes?.target})`);
        await sleep(1000);
      }

      // Switch back to paginated
      await cdp.eval(`
        Reader.getAdapter().applySettings({ flow: 'paginated' });
        return true;
      `);
      await sleep(1500);
      const restoredFlow = await cdp.eval(`return Reader.getAdapter().flow;`);
      record(`[${t.format}] Restored to Paginated mode`, restoredFlow === 'paginated');
    } else if (t.format === 'cbr') {
      console.log(`  Testing Comic page rendering & navigation for [${t.format}]...`);
      const comicRes = await cdp.eval(`
        const ad = Reader.getAdapter();
        const initial = ad.pageIndex;
        await ad.next();
        return { initial, next: ad.pageIndex, total: ad.pages.length };
      `);
      record(`[${t.format}] Comic page next() navigation`, comicRes.next > comicRes.initial || comicRes.total === 1, `Page ${comicRes.next + 1} of ${comicRes.total}`);
    }

    // Return to library
    await cdp.eval(`
      document.getElementById('back-to-library-btn').click();
      return true;
    `);
    await cdp.waitFor(`document.getElementById('reader-view').classList.contains('hidden')`, {
      timeout: 15000,
      label: 'returned to library'
    });
    await sleep(1000);
    record(`[${t.format}] Clean return to library`, true);
  }

  console.log('\n================================================================');
  console.log(`QA RESULTS: ${passes} PASSED, ${fails} FAILED`);
  console.log('================================================================\n');

  if (fails > 0) {
    process.exit(1);
  }
} finally {
  await shutdown(cdp);
}
