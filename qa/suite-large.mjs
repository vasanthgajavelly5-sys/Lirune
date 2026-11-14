/**
 * Large library behaviour, and duplicate/collection/favourite/import handling.
 *
 * The 300-book case is built through the application's own import path in
 * batches, because the batched renderer and the intersection observer for
 * chapter counts only engage when books arrive in quantity. Generating them any
 * other way would test a path a user never takes.
 */
import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');
const GEN = path.join(os.tmpdir(), 'kilo', 'gen-books');
const BOOK_COUNT = 300;

let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function group(name) { console.log(`\n== ${name}`); }

/**
 * Builds small but genuinely distinct TXT books. Distinct content matters: the
 * duplicate check is content-fingerprint based, so identical files would be
 * rejected and the library would never reach the size under test.
 */
function generateBooks(count) {
  fs.rmSync(GEN, { recursive: true, force: true });
  fs.mkdirSync(GEN, { recursive: true });
  const made = [];
  for (let i = 0; i < count; i++) {
    const title = `Library Volume ${String(i + 1).padStart(3, '0')}`;
    const body = [
      title,
      `Author ${String.fromCharCode(65 + (i % 26))} Writer`,
      `Volume ${i + 1} of ${count}.`,
      '',
      ...Array.from({ length: 40 }, (_, line) =>
        `Chapter ${Math.floor(line / 8) + 1}, line ${line + 1}. ${title} contains a distinct passage number ${crypto.randomBytes(6).toString('hex')}.`)
    ].join('\n');
    const file = path.join(GEN, `volume-${String(i + 1).padStart(3, '0')}.txt`);
    fs.writeFileSync(file, body, 'utf8');
    made.push({ file, title });
  }
  return made;
}

const books = generateBooks(BOOK_COUNT);
console.log(`generated ${books.length} distinct books in ${GEN}`);

const cdp = await launch({ freshUserData: true });
try {
  // ---------------------------------------------------------- duplicate first
  group('Duplicate detection');
  await cdp.importFile(path.join(CORPUS, 'pg1342-ni.epub'));
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length >= 1`, { timeout: 90000 });
  const firstId = await cdp.eval(`const b = (await NoveraDB.getAllBooks())[0]; return b.id;`);

  const duplicate = await cdp.eval(`
    const before = (await NoveraDB.getAllBooks()).length;
    const file = document.getElementById('file-input');
    const buf = await window.noveraDesktop.readManagedBook(
      (await NoveraDB.getAllBooks())[0].storageId,
      (await NoveraDB.getAllBooks())[0].fingerprint,
      (await NoveraDB.getAllBooks())[0].fileSize
    );
    window.__qaDup = new File([new Uint8Array(buf)], 'copy-of-the-same-book.epub', { type: 'application/epub+zip' });
    const dt = new DataTransfer();
    dt.items.add(window.__qaDup);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 6000));
    return { before, after: (await NoveraDB.getAllBooks()).length };
  `, 180000);
  check('re-importing the same book does not create a second record',
    duplicate.after === duplicate.before, `${duplicate.before} -> ${duplicate.after}`);
  check('the original record is the one kept', duplicate.after === 1, String(duplicate.after));

  // Two different files with the SAME filename must both be kept.
  const sameName = await cdp.eval(`
    const before = (await NoveraDB.getAllBooks()).length;
    const one = new File(['completely different content one ' + Date.now()], 'identical-name.txt', { type: 'text/plain' });
    const two = new File(['completely different content two ' + (Date.now() + 1)], 'identical-name.txt', { type: 'text/plain' });
    for (const f of [one, two]) {
      const dt = new DataTransfer();
      dt.items.add(f);
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 2500));
    }
    await new Promise(r => setTimeout(r, 3000));
    return { before, after: (await NoveraDB.getAllBooks()).length };
  `, 180000);
  check('different books with the same filename are both kept', sameName.after === sameName.before + 2,
    `${sameName.before} -> ${sameName.after}`);

  // Clean slate for the large library run.
  await cdp.eval(`
    const result = await Library.deleteAllBooks();
    await new Promise(r => setTimeout(r, 1500));
    return { removed: result.removed, left: (await NoveraDB.getAllBooks()).length };
  `, 300000);
  check('the library can be emptied for a clean large-library run', true, 'reset complete');

  // ------------------------------------------------------------- big library
  group(`Importing ${BOOK_COUNT} books`);
  const started = Date.now();
  const progress = [];
  for (let i = 0; i < books.length; i += 25) {
    const slice = books.slice(i, i + 25);
    for (const book of slice) {
      await cdp.eval(`
        const text = ${JSON.stringify(fs.readFileSync(book.file, 'utf8'))};
        const file = new File([text], ${JSON.stringify(path.basename(book.file))}, { type: 'text/plain' });
        const dt = new DataTransfer();
        dt.items.add(file);
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        return true;
      `);
    }
    // Let the import queue and batched renderer settle before pushing more in.
    await sleep(400);
    const count = await cdp.eval(`return (await NoveraDB.getAllBooks()).length;`);
    progress.push(count);
    if (i % 100 === 0) console.log(`    after ${i + slice.length} imports: ${count} in library`);
  }
  const importSeconds = Math.round((Date.now() - started) / 1000);

  // Wait for the final render pass to finish.
  for (let i = 0; i < 60; i++) {
    const settled = await cdp.eval(`
      const db = (await NoveraDB.getAllBooks()).length;
      return { db, dom: document.querySelectorAll('#books-grid .book-card').length };
    `);
    if (settled.db === settled.dom) break;
    await sleep(500);
  }

  const loaded = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    return {
      db: books.length,
      dom: document.querySelectorAll('#books-grid .book-card').length,
      count: document.getElementById('book-count')?.textContent || '',
      gridVisible: document.getElementById('books-grid').classList.contains('visible'),
      emptyHidden: document.getElementById('empty-state').classList.contains('hidden')
    };
  `);
  check(`all ${BOOK_COUNT} books are stored`, loaded.db === BOOK_COUNT, String(loaded.db));
  check('the library renders every book, not just the first batch', loaded.dom === BOOK_COUNT, `${loaded.dom} cards`);
  check('the shelf is visible, not blank', loaded.gridVisible === true);
  check('the empty state is not showing', loaded.emptyHidden === true);
  check('the book counter matches the library', loaded.count === `${BOOK_COUNT} books`, loaded.count);
  console.log(`    import took ${importSeconds}s`);

  // ------------------------------------------------------------- scroll
  group('Scrolling a large shelf');
  const scrolled = await cdp.eval(`
    // #lib-content is the scroll container; the library view clips its content.
    const scroller = document.getElementById('lib-content');
    const before = scroller.scrollTop;
    scroller.scrollTop = scroller.scrollHeight;
    await new Promise(r => setTimeout(r, 900));
    const atBottom = scroller.scrollTop;
    const bottomVisible = (() => {
      const cards = [...document.querySelectorAll('#books-grid .book-card')];
      const last = cards[cards.length - 1];
      if (!last) return false;
      const box = last.getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0;
    })();
    const firstScrolledAway = (() => {
      const first = document.querySelector('#books-grid .book-card');
      return first ? first.getBoundingClientRect().bottom <= 0 : false;
    })();
    scroller.scrollTop = 0;
    await new Promise(r => setTimeout(r, 600));
    return {
      before, atBottom, back: scroller.scrollTop,
      scrollable: scroller.scrollHeight > scroller.clientHeight + 4,
      height: scroller.scrollHeight, client: scroller.clientHeight,
      bottomVisible, firstScrolledAway
    };
  `, 120000);
  check('the shelf is actually scrollable', scrolled.scrollable === true, `${scrolled.height}px of content in ${scrolled.client}px`);
  check('scrolling to the end works', scrolled.atBottom > scrolled.before, `${scrolled.before} -> ${scrolled.atBottom}`);
  check('the last book is actually on screen after scrolling', scrolled.bottomVisible === true);
  check('the first book has really scrolled out of view', scrolled.firstScrolledAway === true);
  check('scrolling back to the top works', scrolled.back === 0, String(scrolled.back));

  const rapid = await cdp.eval(`
    const scroller = document.getElementById('lib-content');
    let maxSeen = 0;
    for (let i = 0; i < 40; i++) {
      scroller.scrollTop = (scroller.scrollHeight / 40) * i;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      maxSeen = Math.max(maxSeen, scroller.scrollTop);
      await new Promise(r => requestAnimationFrame(r));
    }
    scroller.scrollTop = 0;
    await new Promise(r => setTimeout(r, 1200));
    return {
      cards: document.querySelectorAll('#books-grid .book-card').length,
      visible: document.getElementById('books-grid').classList.contains('visible'),
      maxSeen,
      reached: maxSeen > 0
    };
  `, 180000);
  check('rapid scrolling leaves every card intact', rapid.cards === BOOK_COUNT, `${rapid.cards} cards`);
  check('rapid scrolling does not blank the shelf', rapid.visible === true);
  check('rapid scrolling actually moves through the shelf', rapid.reached === true, `max scrollTop ${rapid.maxSeen}`);

  // ------------------------------------------------------------- sort
  group('Sorting a large shelf');
  // Each sort is verified against the key it actually sorts on. Checking by
  // title instead would fail for date-based sorts, because 300 books imported
  // in a few seconds legitimately share a millisecond.
  const sorts = [
    { sortBy: 'title', order: 'asc', key: b => b.title.toLowerCase() },
    { sortBy: 'title', order: 'desc', key: b => b.title.toLowerCase() },
    { sortBy: 'author', order: 'asc', key: b => (b.author || '').toLowerCase() },
    { sortBy: 'added', order: 'desc', key: b => Number(b.dateAdded) || 0 },
    { sortBy: 'progress', order: 'desc', key: b => Number(b.progressPercent) || 0 },
    { sortBy: 'recent', order: 'desc', key: b => Number(b.lastReadDate) || 0 }
  ];
  for (const spec of sorts) {
    const result = await cdp.eval(`
      await Library.setView({ sortBy: ${JSON.stringify(spec.sortBy)}, sortOrder: ${JSON.stringify(spec.order)} });
      await new Promise(r => setTimeout(r, 1100));
      const all = await NoveraDB.getAllBooks();
      const byId = new Map(all.map(b => [b.id, b]));
      const shown = [...document.querySelectorAll('#books-grid .book-card')];
      const keys = shown.map(c => {
        const book = byId.get(c.dataset.bookId);
        const value = book ? (${spec.key.toString()})(book) : null;
        return typeof value === 'string' ? value : Number(value);
      });
      const direction = ${JSON.stringify(spec.order)} === 'asc' ? 1 : -1;
      // The comparison is always "previous element against current one".
      // Subtracting strings yields NaN, so strings use localeCompare. A NaN
      // result would make every comparison false and the check meaningless.
      const ordered = keys.every((k, i) => {
        if (i === 0) return true;
        const cmp = typeof k === 'string' ? keys[i - 1].localeCompare(k) : keys[i - 1] - k;
        return cmp * direction <= 0;
      });
      // The shelf must also be a complete, duplicate-free permutation.
      const ids = shown.map(c => c.dataset.bookId);
      return { count: ids.length, unique: new Set(ids).size, total: all.length, ordered, first: keys[0], last: keys[keys.length - 1] };
    `, 240000);
    check(`sort by ${spec.sortBy} ${spec.order} orders the whole shelf`, result.count === BOOK_COUNT && result.ordered,
      `${result.count} cards, ${result.first} .. ${result.last}`);
    check(`sort by ${spec.sortBy} ${spec.order} shows every book exactly once`,
      result.unique === BOOK_COUNT && result.total === BOOK_COUNT, `${result.unique} unique of ${result.total}`);
  }

  // Sorting must not change which books are shown, only their order.
  const setStable = await cdp.eval(`
    const collect = async sort => {
      await Library.setView({ sortBy: sort });
      await new Promise(r => setTimeout(r, 900));
      return [...document.querySelectorAll('#books-grid .book-card')].map(c => c.dataset.bookId).sort();
    };
    const byTitle = await collect('title');
    const byAdded = await collect('added');
    return { same: JSON.stringify(byTitle) === JSON.stringify(byAdded) };
  `, 240000);
  check('changing the sort does not add or lose books', setStable.same === true);

  // ------------------------------------------------------------- filters
  group('Filtering a large shelf');
  const filters = await cdp.eval(`
    const out = {};
    const count = () => document.querySelectorAll('#books-grid .book-card').length;
    const setFilter = async id => {
      const el = document.getElementById(id);
      el.value = id === 'collection-select' ? 'all' : el.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
    };

    document.getElementById('filter-select').value = 'unread';
    document.getElementById('filter-select').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    out.unread = count();

    document.getElementById('filter-select').value = 'finished';
    document.getElementById('filter-select').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    out.finished = count();

    document.getElementById('filter-select').value = 'favorites';
    document.getElementById('filter-select').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    out.favorites = count();

    document.getElementById('filter-select').value = 'all';
    document.getElementById('filter-select').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    out.all = count();
    return out;
  `, 180000);
  check('unread filter shows every unread book', filters.unread === BOOK_COUNT, String(filters.unread));
  check('finished filter shows none of them', filters.finished === 0, String(filters.finished));
  check('favorites filter shows none before any are set', filters.favorites === 0, String(filters.favorites));
  check('clearing the filter restores the whole shelf', filters.all === BOOK_COUNT, String(filters.all));

  // ------------------------------------------------------- favourites
  group('Favourites on a large shelf');
  const favs = await cdp.eval(`
    const out = {};
    const cards = [...document.querySelectorAll('#books-grid .book-card')].slice(0, 5);
    const ids = cards.map(c => c.dataset.bookId);

    for (const card of cards) {
      card.querySelector('.card-fav').click();
      await new Promise(r => setTimeout(r, 250));
    }
    await new Promise(r => setTimeout(r, 800));

    const books = await NoveraDB.getAllBooks();
    out.storedFavs = books.filter(b => b.favorite).map(b => b.id).sort();
    // The card marks a favourite by showing the button and filling its icon.
    out.markedInDom = cards.filter(c => {
      const btn = c.querySelector('.card-fav');
      return btn && btn.classList.contains('visible') && btn.querySelector('svg')?.getAttribute('fill') === 'currentColor';
    }).length;
    out.ids = ids.sort();

    // Favourite filter must now show exactly the five.
    document.getElementById('filter-select').value = 'favorites';
    document.getElementById('filter-select').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    out.favoriteCards = document.querySelectorAll('#books-grid .book-card').length;
    out.favoriteIds = [...document.querySelectorAll('#books-grid .book-card')].map(c => c.dataset.bookId).sort();

    // Un-favourite one and confirm the view follows.
    const firstFav = document.querySelector('#books-grid .book-card .card-fav');
    firstFav.click();
    await new Promise(r => setTimeout(r, 900));
    out.afterUnfavourite = document.querySelectorAll('#books-grid .book-card').length;

    document.getElementById('filter-select').value = 'all';
    document.getElementById('filter-select').dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    out.stillAll = document.querySelectorAll('#books-grid .book-card').length;
    return out;
  `, 300000);
  check('favourites are written to the database', favs.storedFavs.length === 5, String(favs.storedFavs.length));
  check('favourites are shown on the cards', favs.markedInDom === 5, String(favs.markedInDom));
  check('the favourites filter shows exactly the favourites', favs.favoriteCards === 5 && JSON.stringify(favs.favoriteIds) === JSON.stringify(favs.ids),
    `${favs.favoriteCards} shown`);
  check('un-favouriting updates the filtered view', favs.afterUnfavourite === 4, String(favs.afterUnfavourite));
  check('clearing the filter still shows everything', favs.stillAll === BOOK_COUNT, String(favs.stillAll));

  // ------------------------------------------------------- collections
  group('Collections on a large shelf');
  const coll = await cdp.eval(`
    const out = {};
    // saveCollection resolves with the IndexedDB request, not the record, so
    // the collection is read back to prove it was written.
    await NoveraDB.saveCollection({ id: 'qa-collection-1', name: 'QA Shelf', dateCreated: Date.now() });
    out.saved = (await NoveraDB.getCollections()).find(c => c.id === 'qa-collection-1')?.name || null;

    const books = (await NoveraDB.getAllBooks()).slice(0, 10);
    for (const book of books) {
      await NoveraDB.setBookCollection(book.id, 'qa-collection-1', true);
    }
    out.expected = books.map(b => b.id).sort();

    // Reload from the database so nothing is being read from memory.
    const reread = await NoveraDB.getAllBooks();
    out.members = reread.filter(b => b.collectionIds?.includes('qa-collection-1')).map(b => b.id).sort();

    // Removing one member must not affect the others.
    await NoveraDB.setBookCollection(books[0].id, 'qa-collection-1', false);
    const afterRemove = await NoveraDB.getAllBooks();
    out.afterRemove = afterRemove.filter(b => b.collectionIds?.includes('qa-collection-1')).map(b => b.id).sort();

    // Deleting the collection must detach it from every book, not delete books.
    await NoveraDB.deleteCollection('qa-collection-1');
    const afterDelete = await NoveraDB.getAllBooks();
    out.totalAfterDelete = afterDelete.length;
    out.stillReferencing = afterDelete.filter(b => b.collectionIds?.includes('qa-collection-1')).length;
    return out;
  `, 300000);
  check('a collection can be created', coll.saved === 'QA Shelf', coll.saved);
  check('books join a collection', JSON.stringify(coll.members) === JSON.stringify(coll.expected), `${coll.members.length} members`);
  check('removing one book leaves the others in the collection', coll.afterRemove.length === coll.expected.length - 1,
    `${coll.afterRemove.length} members`);
  check('deleting a collection keeps every book', coll.totalAfterDelete === BOOK_COUNT, String(coll.totalAfterDelete));
  check('deleting a collection detaches it from every book', coll.stillReferencing === 0, String(coll.stillReferencing));

  // ------------------------------------------------------- chapter counts
  group('Chapter counts on a large shelf');
  const chapters = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    const withCount = books.filter(b => Number.isFinite(Number(b.chapterCount)));
    return { total: books.length, counted: withCount.length };
  `, 300000);
  check('chapter counting does not break a large library', chapters.total === BOOK_COUNT, String(chapters.total));
  console.log(`    ${chapters.counted} of ${chapters.total} books have a chapter count resolved`);

  // ------------------------------------------------------- home zoom
  group('Home zoom on a large shelf');
  const zoom = await cdp.eval(`
    const out = {};
    const lib = document.getElementById('library-view');
    const before = document.querySelectorAll('#books-grid .book-card').length;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    out.afterShortcut = { zoom: lib.style.zoom, value: App.getHomeZoom(), cards: document.querySelectorAll('#books-grid .book-card').length };
    out.controlVisible = document.getElementById('home-zoom-control').classList.contains('visible');

    for (let i = 0; i < 12; i++) document.querySelector('#home-zoom-control [data-zoom-increase]').click();
    await new Promise(r => setTimeout(r, 500));
    out.max = App.getHomeZoom();
    out.cardsAtMax = document.querySelectorAll('#books-grid .book-card').length;

    for (let i = 0; i < 20; i++) document.querySelector('#home-zoom-control [data-zoom-decrease]').click();
    await new Promise(r => setTimeout(r, 500));
    out.min = App.getHomeZoom();
    out.cardsAtMin = document.querySelectorAll('#books-grid .book-card').length;

    App.setHomeZoom(100);
    await new Promise(r => setTimeout(r, 500));
    out.restored = App.getHomeZoom();
    out.cardsFinal = document.querySelectorAll('#books-grid .book-card').length;
    out.before = before;
    out.readerUntouched = Reader.getZoom();
    return out;
  `, 300000);
  check('zooming the home view does not rebuild the library',
    zoom.afterShortcut.cards === BOOK_COUNT && zoom.cardsAtMax === BOOK_COUNT && zoom.cardsFinal === BOOK_COUNT,
    `${zoom.before} -> ${zoom.afterShortcut.cards} -> ${zoom.cardsAtMax} -> ${zoom.cardsFinal}`);
  check('zooming home does not blank the shelf', zoom.cardsFinal === BOOK_COUNT, String(zoom.cardsFinal));
  check('home zoom applies to the library view', zoom.afterShortcut.zoom === '110%' && zoom.afterShortcut.value === 110,
    `${zoom.afterShortcut.zoom} / ${zoom.afterShortcut.value}`);
  check('the zoom control appears on change', zoom.controlVisible === true);
  check('home zoom clamps at 150%', zoom.max === 150, String(zoom.max));
  check('home zoom clamps at 75%', zoom.min === 75, String(zoom.min));
  check('home zoom returns to 100%', zoom.restored === 100, String(zoom.restored));
  check('home zoom leaves reader zoom alone', zoom.readerUntouched === 100, String(zoom.readerUntouched));

  // ------------------------------------------------------- list view at scale
  group('List view at scale');
  const listView = await cdp.eval(`
    await Library.setView({ view: 'list' });
    await new Promise(r => setTimeout(r, 1500));
    const grid = document.getElementById('books-grid');
    return {
      listClass: grid.classList.contains('list-view'),
      cards: document.querySelectorAll('#books-grid .book-card').length,
      chaptersShown: document.querySelectorAll('#books-grid .card-chapter-count').length,
      toggle: document.getElementById('view-toggle-btn').classList.contains('active')
    };
  `, 180000);
  check('list view applies at scale', listView.listClass && listView.toggle === true);
  check('list view renders every book', listView.cards === BOOK_COUNT, String(listView.cards));
  check('list view shows chapter counts', listView.chaptersShown > 0, `${listView.chaptersShown} rows with counts`);

  const backToGrid = await cdp.eval(`
    await Library.setView({ view: 'grid' });
    await new Promise(r => setTimeout(r, 1500));
    return { cards: document.querySelectorAll('#books-grid .book-card').length, list: document.getElementById('books-grid').classList.contains('list-view') };
  `, 180000);
  check('switching back to grid works at scale', backToGrid.cards === BOOK_COUNT && !backToGrid.list, String(backToGrid.cards));

  console.log('\n=== app console errors ===');
  if (cdp.errors.length === 0) console.log('  none');
  else cdp.errors.slice(0, 6).forEach(e => console.log('  ' + e.split('\n')[0]));
    // Search must be answered from a large shelf within a usable time.
    const searchStart = Date.now();
    const search = await cdp.eval(`
      const input = document.getElementById('lib-search-input');
      input.value = 'Volume 1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1200));
      const shown = document.querySelectorAll('#books-grid .book-card').length;
      const titles = [...document.querySelectorAll('#books-grid .card-title')].map(e => e.textContent);
      return { shown, allMatch: titles.every(t => t.includes('Volume 1')), count: titles.length };
    `, 180000);
    check(`search on a large shelf answers quickly (${Date.now() - searchStart}ms)`, Date.now() - searchStart < 60000, `${Date.now() - searchStart}ms`);
    check('search narrows the shelf to real matches', search.shown > 0 && search.shown < BOOK_COUNT && search.allMatch,
      `${search.shown} shown, all match: ${search.allMatch}`);

    const cleared = await cdp.eval(`
      const input = document.getElementById('lib-search-input');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1200));
      return { shown: document.querySelectorAll('#books-grid .book-card').length };
    `, 180000);
    check('clearing the search restores the whole shelf', cleared.shown === BOOK_COUNT, String(cleared.shown));

  } catch (err) {
    check('large library suite', false, err.message);
    console.error(err);
  } finally {
  console.log(`\n${pass}/${pass + failures.length} passed`);
  if (failures.length) console.log(`FAILURES:\n  ${failures.map(f => `[${f}]`).join('\n  ')}`);
  await shutdown(cdp);
}
process.exit(failures.length ? 1 : 0);
