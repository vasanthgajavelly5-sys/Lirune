/**
 * Cross-format reader checks.
 *
 * The `Reader` facade owns the surfaces every adapter shares: navigation
 * panel, status line, page navigation, progress and zoom. These checks open
 * each supported format and confirm that facade behaves the same way for all
 * of them, and that unsupported archives are refused with a reason.
 */
import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');
let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function group(name) {
  console.log(`\n== ${name}`);
}

const FILES = [
  { format: 'pdf', path: 'srm/test_book_pdf.pdf', name: 'test_book_pdf.pdf' },
  { format: 'pdf', path: 'naca-to-nasa.pdf', name: 'naca-to-nasa.pdf' },
  { format: 'txt', path: 'pg1342.txt', name: 'pg1342.txt' },
  { format: 'html', path: 'pg1342.html', name: 'pg1342.html' },
  { format: 'fb2', path: 'srm/test_book_fb2.fb2', name: 'test_book_fb2.fb2' },
  { format: 'cbz', path: 'srm/bobby_make_believe_sample.cbz', name: 'bobby_make_believe_sample.cbz' },
  { format: 'cbz', path: 'srm/Elf_Receiver_Radio-Craft_August_1936.cbz', name: 'Elf_Receiver_Radio-Craft_August_1936.cbz' }
];

const cdp = await launch({ freshUserData: true });
try {
  group('Import pipeline');
  for (const file of FILES) {
    await cdp.importFile(path.join(CORPUS, file.path));
  }
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length === ${FILES.length}`, { timeout: 120000 });
  const titles = await cdp.eval(`return [...document.querySelectorAll('#books-grid .book-card')].map(c => c.dataset.format);`);
  check('every supported format is imported', titles.length === FILES.length, titles.join(','));

  for (const file of FILES) {
    group(`${file.format.toUpperCase()} — ${file.name}`);
    try {
      await checkFile(file);
    } catch (error) {
      check(`${file.name} checks complete`, false, error.message);
      console.error(cdp.output().slice(-1500));
    }
  }

  async function checkFile(file) {
    const opened = await cdp.eval(`
      const book = (await NoveraDB.getAllBooks()).find(b => b.originalName === ${JSON.stringify(file.name)});
      if (!book) return { error: 'book not found', names: (await NoveraDB.getAllBooks()).map(b => b.originalName) };
      const card = document.querySelector('#books-grid .book-card[data-book-id="' + book.id + '"]');
      if (!card) return { error: 'card not rendered', cards: document.querySelectorAll('#books-grid .book-card').length };
      card.click();
      await new Promise(r => setTimeout(r, 6000));
      return {
        book,
        format: Reader.getFormatInfo().id,
        visible: !document.getElementById('reader-view').classList.contains('hidden'),
        nav: Reader.getNavigation().length,
        progress: Reader.getProgress(),
        zoom: Reader.getZoom()
      };
    `, 180000);
    if (opened.error) {
      check(`opens ${file.name}`, false, `${opened.error}: ${JSON.stringify(opened.names)}`);
      return;
    }
    check('opens in the reader', opened.visible && opened.format === file.format, `${opened.format}, ${opened.progress.locationLabel}`);
    check('reports a reading position', !!opened.progress.locationLabel, opened.progress.locationLabel);

    // A one-page document has nowhere to navigate to, so paging is only
    // meaningful for documents that actually have more than one page.
    if ((opened.progress.pageCount ?? 1) > 1) {
      const navigated = await cdp.eval(`
        const first = Reader.getLocation();
        await Reader.next();
        await new Promise(r => setTimeout(r, 1500));
        const afterNext = { location: Reader.getLocation(), pct: Reader.getProgress().percent };
        await Reader.prev();
        await new Promise(r => setTimeout(r, 1500));
        const afterPrev = { location: Reader.getLocation(), pct: Reader.getProgress().percent };
        return { first, afterNext, afterPrev };
      `, 180000);
      check('page navigation advances and returns',
        String(navigated.afterNext.location) !== String(navigated.first) && String(navigated.afterPrev.location) === String(navigated.first),
        `${navigated.first} -> ${navigated.afterNext.location} -> ${navigated.afterPrev.location}`);
    } else {
      console.log(`  SKIP  page navigation (single ${opened.progress.pageCount}-page document)`);
    }

    const panel = await cdp.eval(`
      document.getElementById('toc-toggle-btn').click();
      await new Promise(r => setTimeout(r, 400));
      const rows = [...document.querySelectorAll('#toc-list .toc-entry')];
      return {
        open: document.getElementById('toc-panel').classList.contains('open'),
        rows: rows.length,
        active: rows.filter(e => e.classList.contains('active')).length,
        activeAttr: rows.filter(e => e.getAttribute('aria-current') === 'true').length,
        title: document.getElementById('toc-panel-title')?.textContent
      };
    `, 180000);
    check('navigation panel renders its own entries', panel.open && panel.rows === opened.nav, `${panel.rows} rows, "${panel.title}"`);
    if (panel.rows > 0) {
      check('exactly one entry is marked current', panel.activeAttr === 1, `${panel.activeAttr} of ${panel.rows}`);
    }
    await cdp.eval(`App.closeDrawer('toc-panel'); return true;`);

    const zoomed = await cdp.eval(`
      const before = Reader.getZoom();
      Reader.setZoom(140);
      await new Promise(r => setTimeout(r, 400));
      return { before, after: Reader.getZoom() };
    `);
    check('zoom is applied through the facade', zoomed.after === 140, `${zoomed.before}% -> ${zoomed.after}%`);

    const closed = await cdp.eval(`
      document.getElementById('back-to-library-btn').click();
      await new Promise(r => setTimeout(r, 1500));
      return {
        hidden: document.getElementById('reader-view').classList.contains('hidden'),
        cards: document.querySelectorAll('#books-grid .book-card').length
      };
    `);
    check('closes back to the library', closed.hidden && closed.cards === FILES.length, `${closed.cards} cards`);
  }

  group('Unsupported archives');
  // Real archive headers, imported through the normal drop path: the library
  // must refuse them with a reason instead of silently adding an unopenable
  // book.
  const beforeCount = await cdp.eval(`return document.querySelectorAll('#books-grid .book-card').length;`);
  for (const file of ['srm/bobby_make_believe_sample.cbr', 'pg1342.azw3']) {
    await cdp.importFile(path.join(CORPUS, file));
    await sleep(3000);
  }
  const refusal = await cdp.eval(`
    return {
      cards: document.querySelectorAll('#books-grid .book-card').length,
      toast: document.querySelector('.toast, .toast-message, [class*="toast"]')?.textContent?.trim() || null,
      body: document.body.innerText.match(/CBR[^.]{0,80}|MOBI[^.]{0,80}/i)?.[0] || null
    };
  `);
  check('unsupported archives are not added to the library', refusal.cards === beforeCount, `${beforeCount} -> ${refusal.cards}`);
  check('an unsupported archive explains why', /RAR|MOBI|Kindle|Comic archive \(RAR\)/i.test(`${refusal.toast || ''} ${refusal.body || ''}`), refusal.toast || refusal.body);
} catch (err) {
  check('formats suite', false, err.message);
  console.error(err);
} finally {
  console.log(`\n${pass}/${pass + fail} passed`);
  if (failures.length) console.log(`FAILURES:\n  ${failures.map(f => `[${f}]`).join('\n  ')}`);
  await shutdown(cdp);
}
process.exit(fail ? 1 : 0);
