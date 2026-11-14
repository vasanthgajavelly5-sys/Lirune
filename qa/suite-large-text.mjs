/**
 * Large-text performance regression.
 *
 * A plain-text file used to freeze the renderer for a long time after it was
 * opened. `TextAdapter.buildSections` produced ONE paragraph containing every
 * line break in the file, and the layout engine had to re-break that single
 * enormous inline formatting context across every paginated column each time
 * the typography changed. A single zoom step blocked the main thread for
 * roughly 90 seconds and the window stopped responding; a no-op CDP evaluation
 * issued right after the open took about 107 seconds to come back.
 *
 * Two things had to be true for that not to happen. Splitting on blank lines
 * only works once line endings are normalised, because a CRLF blank line is
 * \r\n\r\n and its two newlines are not adjacent. And a file that separates
 * every line with a single newline never produces blank lines at all, so it
 * still has to be split per line. Either fix alone is enough; the original code
 * had neither, and this suite was confirmed to fail with both reverted: the
 * document collapses to a single paragraph of 14,912 <br> and a no-op
 * evaluation hangs outright.
 *
 * The contract this file protects is therefore responsiveness, not merely "the
 * book eventually opens". A suite that only waited longer would have passed
 * against the broken build, which is why the bound below is measured on an
 * evaluation that does nothing at all and is deliberately generous: it exists
 * to catch a return to multi-minute main-thread saturation, not to police
 * normal layout jitter.
 */
import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function group(name) {
  console.log(`\n== ${name}`);
}

// How long a no-op evaluation may take. The broken build took ~107,000 ms. The
// fixed build returns in well under a second. 8s sits far below the regression
// and far above ordinary layout noise, so it fails only on the real defect and
// does not flake on a slow machine.
const RESPONSIVENESS_BUDGET_MS = 8000;

// A hard ceiling so a true hang surfaces as a clear failure instead of sitting
// on the test for the default CDP timeout.
const EVAL_HARD_TIMEOUT_MS = 45000;

const cdp = await launch({ freshUserData: true });
try {
  group('Import a large plain-text book');
  await cdp.importFile(path.join(CORPUS, 'pg1342.txt'));
  await sleep(5000);
  const imported = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    const book = books.find(b => b.format === 'txt');
    return { count: books.length, found: !!book, size: book ? book.fileSize : 0 };
  `, 120000);
  check('the large TXT imported', imported.found, `${imported.size} bytes`);

  group('Open and measure renderer responsiveness');
  // The click itself is excluded from the budget: it legitimately does real
  // work. What matters is that the window is usable immediately afterwards.
  await cdp.eval(`
    const book = (await NoveraDB.getAllBooks()).find(b => b.format === 'txt');
    document.querySelector('#books-grid .book-card[data-book-id="' + book.id + '"]').click();
    return true;
  `, EVAL_HARD_TIMEOUT_MS);
  await sleep(2000);

  const start = Date.now();
  let stallMs = null;
  try {
    await cdp.eval(`return true;`, EVAL_HARD_TIMEOUT_MS);
    stallMs = Date.now() - start;
  } catch (error) {
    stallMs = `hung (${error.message})`;
  }
  check(
    'the renderer is responsive immediately after a large TXT opens',
    typeof stallMs === 'number' && stallMs < RESPONSIVENESS_BUDGET_MS,
    `no-op eval took ${stallMs}ms, budget ${RESPONSIVENESS_BUDGET_MS}ms (it hung outright in the broken build)`
  );

  group('The document is a real, navigable document');
  const shape = await cdp.eval(`
    const adapter = Reader.getAdapter();
    const el = adapter && adapter.element;
    if (!el) return { ok: false };
    const paragraphs = el.querySelectorAll('p').length;
    const brs = el.querySelectorAll('br').length;
    return {
      ok: true,
      paragraphs,
      brs,
      textLength: (el.innerText || '').length,
      total: adapter.getProgress ? adapter.getProgress().pageCount : null
    };
  `, EVAL_HARD_TIMEOUT_MS);
  check('the document rendered paragraphs', shape.ok && shape.paragraphs > 1,
    `${shape.paragraphs} paragraphs, ${shape.brs} <br>, ${shape.textLength} chars`);
  // The defect was one paragraph holding the whole file. If the split ever
  // regresses, this catches it even when the book happens to still open.
  check('the text was not collapsed into a single paragraph', shape.paragraphs > 100,
    `${shape.paragraphs} paragraphs`);

  group('Navigation stays responsive');
  const turn = Date.now();
  await cdp.eval(`await Reader.next(); return true;`, EVAL_HARD_TIMEOUT_MS);
  const nextMs = Date.now() - turn;
  check('a page turn returns promptly', nextMs < RESPONSIVENESS_BUDGET_MS, `${nextMs}ms`);

  group('Search and zoom, the operations that used to force a full re-break');
  const searchStart = Date.now();
  const search = await cdp.eval(`
    const t = performance.now();
    const r = await Reader.search('the');
    return { ms: Math.round(performance.now() - t), n: (r || []).length };
  `, EVAL_HARD_TIMEOUT_MS);
  check('search returns results', search.n > 0, `${search.n} matches in ${search.ms}ms (${Date.now() - searchStart}ms round trip)`);

  // This is the specific operation that blocked for ~90s in the broken build:
  // changing typography re-breaks the inline formatting context.
  const zoomStart = Date.now();
  await cdp.eval(`
    Reader.adjustZoom(10);
    await new Promise(r => setTimeout(r, 400));
    return true;
  `, EVAL_HARD_TIMEOUT_MS);
  const zoomMs = Date.now() - zoomStart;
  check('a zoom step returns promptly', zoomMs < RESPONSIVENESS_BUDGET_MS,
    `${zoomMs}ms (this blocked for ~90,000ms in the broken build)`);

  group('Responsiveness survives a window resize');
  const resizeStart = Date.now();
  await cdp.eval(`
    window.dispatchEvent(new Event('resize'));
    await new Promise(r => setTimeout(r, 500));
    return true;
  `, EVAL_HARD_TIMEOUT_MS);
  const resizeMs = Date.now() - resizeStart;
  check('a window resize returns promptly', resizeMs < RESPONSIVENESS_BUDGET_MS, `${resizeMs}ms`);

  group('Close and reopen');
  // The close button is the real user path. Reader.close() only tears down the
  // adapter and never returns to the library view, so calling it directly would
  // assert against an internal teardown rather than the behaviour under test.
  await cdp.eval(`
    document.getElementById('back-to-library-btn').click();
    await new Promise(r => setTimeout(r, 1500));
    return true;
  `, EVAL_HARD_TIMEOUT_MS);
  const close = await cdp.eval(`
    return {
      libraryVisible: !document.getElementById('library-view').classList.contains('hidden'),
      readerHidden: document.getElementById('reader-view').classList.contains('hidden')
    };
  `, EVAL_HARD_TIMEOUT_MS);
  check('the reader closes back to the library', close.libraryVisible && close.readerHidden, JSON.stringify(close));

  const reopenStart = Date.now();
  await cdp.eval(`
    const book = (await NoveraDB.getAllBooks()).find(b => b.format === 'txt');
    document.querySelector('#books-grid .book-card[data-book-id="' + book.id + '"]').click();
    return true;
  `, EVAL_HARD_TIMEOUT_MS);
  await sleep(2000);
  const reopenStallStart = Date.now();
  await cdp.eval(`return true;`, EVAL_HARD_TIMEOUT_MS);
  const reopenStallMs = Date.now() - reopenStallStart;
  check('reopening the large TXT is also responsive', reopenStallMs < RESPONSIVENESS_BUDGET_MS,
    `${reopenStallMs}ms after a ${Date.now() - reopenStart}ms open`);

  group('No console errors were produced');
  check('no console errors', cdp.errors.length === 0, cdp.errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await shutdown(cdp);
}

console.log(`\n${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log('FAILURES:');
  failures.forEach(f => console.log(`  [${f}]`));
  process.exit(1);
}
