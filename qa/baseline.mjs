import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';

const CORPUS = process.env.LIRUNE_CORPUS
  || path.join(os.tmpdir(), 'kilo', 'lirune-corpus');
const ART = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), 'artifacts');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const cdp = await launch({ freshUserData: true });
try {
  // ---- Library boot ----
  const libState = await cdp.eval(`
    return {
      version: document.getElementById('about-version')?.textContent,
      loaderHidden: document.getElementById('lib-loading')?.classList.contains('hidden'),
      emptyVisible: !document.getElementById('empty-library')?.classList.contains('hidden'),
      searchBtn: !!document.getElementById('lib-search-input'),
      sortSelect: !!document.getElementById('sort-select'),
      cols: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    };
  `);
  check('library boots', libState.loaderHidden === true, JSON.stringify(libState));

  // ---- Import ----
  const before = await cdp.eval(`return document.querySelectorAll('#books-grid .book-card').length;`);
  await cdp.importFile(path.join(CORPUS, 'pg1342-ni.epub'));
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length > ${before}`, { label: 'import', timeout: 60000 });
  const card = await cdp.eval(`
    const c = document.querySelector('#books-grid .book-card');
    return {
      count: document.querySelectorAll('#books-grid .book-card').length,
      title: c?.querySelector('.card-title')?.textContent,
      author: c?.querySelector('.card-author')?.textContent,
      chapters: c?.textContent.match(/(\\d+)\\s+chapters?/)?.[0] || null
    };
  `);
  check('EPUB import + render', card.count === 1 && /Pride/.test(card.title || ''), JSON.stringify(card));
  check('chapter count shown', !!card.chapters, String(card.chapters));

  // ---- Open reader ----
  await cdp.eval(`document.querySelector('#books-grid .book-card').click(); return true;`);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden') && EpubLoader.isLoaded()`, { label: 'reader open', timeout: 60000 });
  await sleep(2500);
  const reader = await cdp.eval(`
    const f = document.querySelector('#epub-container iframe');
    return {
      title: document.getElementById('reader-title').textContent,
      iframe: !!f,
      bodyText: (f?.contentDocument?.body?.innerText || '').slice(0, 60),
      loadingHidden: document.getElementById('reader-loading').classList.contains('hidden'),
      chapter: document.getElementById('progress-chapter').textContent,
      page: document.getElementById('page-info').textContent
    };
  `);
  check('reader renders EPUB content', !!reader.iframe && reader.bodyText.length > 5, JSON.stringify(reader));

  // ---- TOC ----
  const toc = await cdp.eval(`
    document.getElementById('toc-toggle-btn').click();
    await new Promise(r => setTimeout(r, 500));
    const list = document.getElementById('toc-list');
    return {
      open: document.getElementById('toc-panel').classList.contains('open'),
      entries: list.querySelectorAll('.toc-entry').length,
      depths: [...list.querySelectorAll('.toc-entry')].map(e => e.className).slice(0, 5),
      filter: !!document.getElementById('toc-filter-input')
    };
  `);
  check('TOC panel opens with entries', toc.open && toc.entries > 0, JSON.stringify(toc));

  const jump = await cdp.eval(`
    const before = document.getElementById('reader-title').textContent;
    const target = document.querySelectorAll('#toc-list .toc-entry')[5];
    const label = target.textContent.trim();
    target.click();
    await new Promise(r => setTimeout(r, 1200));
    return {
      label,
      chapter: document.getElementById('progress-chapter').textContent,
      tocOpen: document.getElementById('toc-panel').classList.contains('open'),
      bodyText: (document.querySelector('#epub-container iframe')?.contentDocument?.body?.innerText || '').slice(0, 50)
    };
  `);
  check('TOC entry navigates', jump.chapter !== 'Chapter' && jump.tocOpen === false, JSON.stringify(jump));

  // ---- Navigation ----
  const nav = await cdp.eval(`
    const cfiOf = () => EpubLoader.getDebugLocation && EpubLoader.getDebugLocation();
    const t0 = document.querySelector('#epub-container iframe')?.contentDocument?.body?.innerText?.slice(0,40);
    document.getElementById('next-btn').click();
    await new Promise(r => setTimeout(r, 900));
    const t1 = document.querySelector('#epub-container iframe')?.contentDocument?.body?.innerText?.slice(0,40);
    document.getElementById('prev-btn').click();
    await new Promise(r => setTimeout(r, 900));
    const t2 = document.querySelector('#epub-container iframe')?.contentDocument?.body?.innerText?.slice(0,40);
    return { t0, t1, t2, changed: t0 !== t1, returned: t0 === t2, pct: document.getElementById('page-info').textContent };
  `);
  check('next/prev page navigation', nav.changed && nav.returned, JSON.stringify(nav));

  // ---- Reader zoom ----
  const zoom = await cdp.eval(`
    const iframe = document.querySelector('#epub-container iframe');
    const before = getComputedStyle(iframe.contentDocument.body).fontSize;
    const overlay = document.getElementById('zoom-overlay');
    const overlayVisible = overlay.classList.contains('visible');
    const computedDisplay = getComputedStyle(overlay).display;
    document.getElementById('zoom-in-btn').click();
    await new Promise(r => setTimeout(r, 700));
    const after = getComputedStyle(iframe.contentDocument.body).fontSize;
    return {
      before, after, overlayVisible, computedDisplay,
      value: document.getElementById('zoom-overlay-value').textContent,
      zoom: ReaderSettings.getZoom()
    };
  `);
  check('reader zoom changes EPUB typography', parseFloat(zoom.after) > parseFloat(zoom.before), JSON.stringify(zoom));
  check('floating zoom overlay is visible', zoom.overlayVisible && zoom.computedDisplay !== 'none', JSON.stringify(zoom));

  // ---- Home zoom ----
  const home = await cdp.eval(`
    document.getElementById('back-to-library-btn').click();
    await new Promise(r => setTimeout(r, 1200));
    const lib = document.getElementById('library-view');
    const zoomIn = lib.querySelector('[id^="lib-zoom"], [id*="zoom"]');
    return { zoom: lib.style.zoom, hasFloating: !!zoomIn, books: document.querySelectorAll('#books-grid .book-card').length };
  `);
  check('home zoom state resets / library intact', home.books === 1, JSON.stringify(home));

  // ---- Progress persistence ----
  const persist = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    return books.map(b => ({ title: b.title, pct: b.progressPercent, cfi: !!b.currentCfi, chapter: b.currentChapter }));
  `);
  check('progress persisted to DB', persist.every(b => b.cfi), JSON.stringify(persist));
} catch (err) {
  check('baseline run', false, err.message);
  console.error(err);
} finally {
  console.log('\n--- console errors ---');
  console.log(cdp.errors.slice(0, 20).join('\n') || '(none)');
  await shutdown(cdp);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
