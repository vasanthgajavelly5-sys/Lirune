import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');
const SRM = path.join(CORPUS, 'srm');

const results = [];
let current = '';
function check(name, ok, detail = '') {
  results.push({ group: current, name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function group(name) {
  current = name;
  console.log(`\n== ${name}`);
}

const cdp = await launch({ freshUserData: true });

async function openByFormat(format, titleFragment = '') {
  await cdp.eval(`
    const cards = [...document.querySelectorAll('#books-grid .book-card')];
    const card = cards.find(c => c.dataset.format === ${JSON.stringify(format)}
      && (!${JSON.stringify(titleFragment)} || (c.querySelector('.card-title')?.textContent || '').toLowerCase().includes(${JSON.stringify(titleFragment.toLowerCase())})));
    if (!card) throw new Error('no ' + ${JSON.stringify(format)} + ' card in: ' + cards.map(c => c.dataset.format + ':' + c.querySelector('.card-title')?.textContent).join(' | '));
    card.click();
    return true;
  `);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden') && !!Reader.getAdapter()`, { label: `open ${format}`, timeout: 90000 });
  await sleep(1400);
}

async function closeReader() {
  await cdp.eval(`
    document.getElementById('back-to-library-btn').click();
    await new Promise(r => setTimeout(r, 900));
    return !document.getElementById('reader-view').classList.contains('hidden') === false;
  `);
  await cdp.waitFor(`document.getElementById('reader-view').classList.contains('hidden')`, { label: 'reader closed', timeout: 20000 });
}

async function state() {
  return cdp.eval(`
    const fmt = Reader.getFormatInfo();
    const adapter = Reader.getAdapter();
    return {
      format: fmt?.id,
      supported: fmt?.supported,
      title: document.getElementById('reader-title').textContent,
      author: document.getElementById('reader-author').textContent,
      progress: Reader.getProgress(),
      location: Reader.getLocation(),
      navCount: Reader.getNavigation().length,
      capabilities: adapter?.capabilities,
      loading: !document.getElementById('reader-loading').classList.contains('hidden'),
      note: document.getElementById('format-note')?.textContent,
      tocDisabled: document.getElementById('toc-toggle-btn')?.hasAttribute('disabled'),
      searchDisabled: document.getElementById('search-toggle-btn')?.hasAttribute('disabled')
    };
  `);
}

/** Renders a text fingerprint of whatever the adapter actually put on screen. */
async function screenFingerprint() {
  return cdp.eval(`
    const adapter = Reader.getAdapter();
    const format = Reader.getFormatInfo()?.id;
    if (format === 'epub') {
      const f = document.querySelector('#epub-container iframe');
      return (f?.contentDocument?.body?.innerText || '').trim().slice(0, 120);
    }
    const host = document.getElementById('format-container');
    if (!host) return '';
    if (format === 'cbz') {
      const img = host.querySelector('img');
      return img ? \`img:\${img.naturalWidth}x\${img.naturalHeight}:\${(img.style.width||'')}\` : '';
    }
    if (format === 'pdf') {
      const c = host.querySelector('canvas');
      return c ? \`canvas:\${c.width}x\${c.height}\` : '';
    }
    const body = host.querySelector('.doc-body');
    return (body?.innerText || '').trim().slice(0, 120);
  `);
}

try {
  // ---------------------------------------------------------------- imports
  group('Import pipeline');
  const files = [
    'pg1342-ni.epub',
    'pg1342.txt',
    'pg1342.html',
    'srm/test_book_fb2.fb2',
    'srm/bobby_make_believe_sample.cbz',
    'srm/Elf_Receiver_Radio-Craft_August_1936.cbz',
    'srm/test_book_pdf.pdf',
    'naca-to-nasa.pdf'
  ];
  for (const name of files) {
    const src = path.join(CORPUS, name);
    if (!fs.existsSync(src)) { check(`corpus ${name} present`, false, 'missing'); continue; }
    const before = await cdp.eval(`return document.querySelectorAll('#books-grid .book-card').length;`);
    await cdp.importFile(src);
    try {
      await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length > ${before}`, { label: `import ${name}`, timeout: 120000 });
      check(`import ${name}`, true);
    } catch {
      check(`import ${name}`, false, 'no new card');
    }
  }
  const cards = await cdp.eval(`
    return [...document.querySelectorAll('#books-grid .book-card')].map(c => ({
      title: c.querySelector('.card-title')?.textContent,
      author: c.querySelector('.card-author')?.textContent,
      hasCover: !!c.querySelector('.card-cover')
    }));
  `);
  check('all books rendered', cards.length === files.length, JSON.stringify(cards, null, 1));

  // Unsupported formats must be refused, not silently mis-rendered.
  const unsupported = await cdp.eval(`
    const cbr = await BookFormat.detect('x.cbr', ${JSON.stringify(Array.from(fs.readFileSync(path.join(SRM, 'bobby_make_believe_sample.cbr')).subarray(0, 8)))});
    return { id: cbr.id, supported: cbr.supported, reason: cbr.reason };
  `);
  check('CBR detected as unsupported', unsupported.id === 'cbr' && unsupported.supported === false, JSON.stringify(unsupported));

  // ---------------------------------------------------------------- EPUB
  group('EPUB — table of contents, navigation, progress, zoom');
  await openByFormat('epub');
  let s = await state();
  check('EPUB opens', s.format === 'epub' && s.progress.percent >= 0, JSON.stringify({ f: s.format, title: s.title }));
  check('EPUB metadata from package document', /Pride/.test(s.title) && /Austen/.test(s.author), `${s.title} / ${s.author}`);

  const tocInfo = await cdp.eval(`
    document.getElementById('toc-toggle-btn').click();
    await new Promise(r => setTimeout(r, 400));
    const list = document.getElementById('toc-list');
    const entries = [...list.querySelectorAll('.toc-entry')];
    return {
      open: document.getElementById('toc-panel').classList.contains('open'),
      count: entries.length,
      depths: [...new Set(entries.map(e => [...e.classList].find(c => c.startsWith('depth-'))))],
      filterEnabled: !document.getElementById('toc-filter-input').hasAttribute('disabled')
    };
  `);
  check('TOC opens with entries', tocInfo.open && tocInfo.count > 5, JSON.stringify(tocInfo));

  const tocJump = await cdp.eval(`
    const target = document.querySelectorAll('#toc-list .toc-entry')[12];
    const label = target.textContent.trim();
    target.click();
    await new Promise(r => setTimeout(r, 1500));
    return {
      label,
      closed: !document.getElementById('toc-panel').classList.contains('open'),
      active: document.querySelectorAll('#toc-list .toc-entry.active').length,
      chapter: document.getElementById('progress-chapter').textContent,
      location: Reader.getLocation().slice(0, 30),
      screen: (document.querySelector('#epub-container iframe')?.contentDocument?.body?.innerText || '').trim().slice(0, 60)
    };
  `);
  check('TOC click navigates and closes panel', tocJump.closed && /CHAPTER|Chapter|THE PROJECT/i.test(tocJump.chapter), JSON.stringify(tocJump));
  check('TOC marks the current chapter', tocJump.active === 1, `active=${tocJump.active}`);

  const tocReopen = await cdp.eval(`
    document.getElementById('toc-toggle-btn').click();
    await new Promise(r => setTimeout(r, 400));
    const before = Reader.getLocation();
    const count = document.querySelectorAll('#toc-list .toc-entry').length;
    document.getElementById('close-toc-btn').click();
    await new Promise(r => setTimeout(r, 300));
    return { count, after: Reader.getLocation(), kept: before === Reader.getLocation(), stillOpen: document.getElementById('toc-panel').classList.contains('open') };
  `);
  check('TOC close/reopen keeps position', tocReopen.kept && tocReopen.count > 5, JSON.stringify(tocReopen));

  const pageNav = await cdp.eval(`
    const grab = () => (document.querySelector('#epub-container iframe')?.contentDocument?.body?.innerText || '').trim().slice(0, 80);
    const p0 = Reader.getLocation();
    document.getElementById('next-btn').click();
    await new Promise(r => setTimeout(r, 1100));
    const p1 = Reader.getLocation();
    document.getElementById('next-btn').click();
    await new Promise(r => setTimeout(r, 1100));
    const p2 = Reader.getLocation();
    document.getElementById('prev-btn').click();
    await new Promise(r => setTimeout(r, 1100));
    const p3 = Reader.getLocation();
    return { advanced: p0 !== p1 && p1 !== p2, returned: p3 === p1, pct: document.getElementById('page-info').textContent, page: document.getElementById('status-page').textContent };
  `);
  check('EPUB page navigation advances and returns', pageNav.advanced && pageNav.returned, JSON.stringify(pageNav));
  check('EPUB shows location + percentage', /%|Page/.test(pageNav.pct), `${pageNav.pct} / ${pageNav.page}`);

  const eSearch = await cdp.eval(`
    document.getElementById('search-input').value = 'Bennet';
    Reader.search('Bennet');
    await new Promise(r => setTimeout(r, 6000));
    return {
      count: document.getElementById('search-count').textContent,
      rows: document.querySelectorAll('#search-results .search-result').length,
      active: document.querySelectorAll('#search-results .search-result.active').length
    };
  `);
  check('EPUB in-book search returns results', eSearch.rows > 0, JSON.stringify(eSearch));

  const eZoom = await cdp.eval(`
    const iframe = document.querySelector('#epub-container iframe');
    const read = () => parseFloat(getComputedStyle(iframe.contentDocument.body).fontSize);
    const before = read();
    document.querySelector('#reader-zoom-control [data-zoom-increase]').click();
    await new Promise(r => setTimeout(r, 600));
    const after = read();
    const overlay = document.getElementById('reader-zoom-control');
    return {
      before, after,
      zoom: Reader.getZoom(),
      visible: overlay.classList.contains('visible'),
      display: getComputedStyle(overlay).display,
      opacity: getComputedStyle(overlay).opacity,
      value: overlay.querySelector('[data-zoom-value]').textContent
    };
  `);
  check('reader floating zoom changes EPUB typography', eZoom.after > eZoom.before, JSON.stringify(eZoom));
  check('reader floating zoom control is visible on change', eZoom.visible && eZoom.display !== 'none' && parseFloat(eZoom.opacity) > 0.5, JSON.stringify(eZoom));

  const eZoomRange = await cdp.eval(`
    const btn = document.querySelector('#reader-zoom-control [data-zoom-increase]');
    for (let i = 0; i < 20; i++) { btn.click(); }
    await new Promise(r => setTimeout(r, 1200));
    const max = Reader.getZoom();
    const out = document.querySelector('#reader-zoom-control [data-zoom-decrease]');
    for (let i = 0; i < 30; i++) { out.click(); }
    await new Promise(r => setTimeout(r, 1200));
    return { max, min: Reader.getZoom(), maxDisabled: btn.hasAttribute('disabled') };
  `);
  check('reader zoom clamps to 50–200%', eZoomRange.max === 200 && eZoomRange.min === 50, JSON.stringify(eZoomRange));

  const eZoomAutoHide = await cdp.eval(`
    Reader.setZoom(120);
    await new Promise(r => setTimeout(r, 200));
    const shown = document.getElementById('reader-zoom-control').classList.contains('visible');
    await new Promise(r => setTimeout(r, 2600));
    const hidden = !document.getElementById('reader-zoom-control').classList.contains('visible');
    Reader.setZoom(130);
    await new Promise(r => setTimeout(r, 200));
    const back = document.getElementById('reader-zoom-control').classList.contains('visible');
    return { shown, hidden, back };
  `);
  check('reader zoom control fades then returns', eZoomAutoHide.shown && eZoomAutoHide.hidden && eZoomAutoHide.back, JSON.stringify(eZoomAutoHide));

  const eKeys = await cdp.eval(`
    Reader.setZoom(100);
    const before = Reader.getZoom();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const plus = Reader.getZoom();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', code: 'Equal', shiftKey: true, ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const shiftPlus = Reader.getZoom();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', code: 'Minus', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const minus = Reader.getZoom();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'NumpadAdd', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const numpad = Reader.getZoom();
    Reader.setZoom(100);
    return { before, plus, shiftPlus, minus, numpad };
  `);
  check('Ctrl +/=/Shift+/numpad zoom all reach the reader', eKeys.plus === 110 && eKeys.shiftPlus === 120 && eKeys.minus === 110 && eKeys.numpad === 120, JSON.stringify(eKeys));

  const ePersist = await cdp.eval(`
    const before = Reader.getLocation();
    const pct = Reader.getProgress().percent;
    const chapter = document.getElementById('progress-chapter').textContent;
    return { before, pct, chapter };
  `);
  await closeReader();
  await sleep(600);
  await openByFormat('epub');
  const eReopen = await cdp.eval(`return { location: Reader.getLocation(), pct: Reader.getProgress().percent, chapter: document.getElementById('progress-chapter').textContent };`);
  // A paginated reader cannot restore the exact saved CFI: reopening lands on
  // the page that contains the saved position, so the CFI reports that page's
  // start. The contract is that the reader returns to the same point in the
  // book, measured by percentage and chapter.
  check('EPUB position restored after close/reopen',
    Math.abs(eReopen.pct - ePersist.pct) <= 1 && eReopen.chapter === ePersist.chapter,
    JSON.stringify({ saved: ePersist, restored: eReopen }));
  await closeReader();

  // ---------------------------------------------------------------- home zoom
  group('Home zoom');
  const homeZoom = await cdp.eval(`
    const lib = document.getElementById('library-view');
    const before = lib.style.zoom;
    const countBefore = document.querySelectorAll('#books-grid .book-card').length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const ctrl = { zoom: lib.style.zoom, value: App.getHomeZoom(), visible: document.getElementById('home-zoom-control').classList.contains('visible') };
    document.querySelector('#home-zoom-control [data-zoom-increase]').click();
    await new Promise(r => setTimeout(r, 300));
    const click = { zoom: lib.style.zoom, value: App.getHomeZoom() };
    for (let i = 0; i < 12; i++) document.querySelector('#home-zoom-control [data-zoom-increase]').click();
    await new Promise(r => setTimeout(r, 400));
    const max = { zoom: lib.style.zoom, value: App.getHomeZoom() };
    for (let i = 0; i < 20; i++) document.querySelector('#home-zoom-control [data-zoom-decrease]').click();
    await new Promise(r => setTimeout(r, 400));
    const min = { zoom: lib.style.zoom, value: App.getHomeZoom() };
    return { before, ctrl, click, max, min, countBefore, countAfter: document.querySelectorAll('#books-grid .book-card').length, readerZoomUntouched: Reader.getZoom() };
  `);
  check('home zoom responds to Ctrl++ and floating +', homeZoom.ctrl.zoom === '110%' && homeZoom.click.zoom === '120%', JSON.stringify(homeZoom.ctrl));
  check('home zoom clamps to 75–150%', homeZoom.max.value === 150 && homeZoom.min.value === 75, JSON.stringify({ max: homeZoom.max, min: homeZoom.min }));
  check('home zoom control appears on change', homeZoom.ctrl.visible === true, JSON.stringify(homeZoom.ctrl));
  check('home zoom does not rebuild the library', homeZoom.countBefore === homeZoom.countAfter, `${homeZoom.countBefore} -> ${homeZoom.countAfter}`);
  check('home zoom is independent of reader zoom', homeZoom.readerZoomUntouched === 100, String(homeZoom.readerZoomUntouched));

  const homeFilter = await cdp.eval(`
    App.setHomeZoom(100);
    const input = document.getElementById('lib-search-input');
    input.value = 'pride';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const filtered = document.querySelectorAll('#books-grid .book-card').length;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    return { filtered, restored: document.querySelectorAll('#books-grid .book-card').length };
  `);
  // The corpus deliberately holds two Pride and Prejudice editions, so a
  // search for "pride" must keep both of them.
  check('library search/filter still works after zooming', homeFilter.filtered === 2 && homeFilter.restored === 8, JSON.stringify(homeFilter));

} catch (err) {
  check('suite', false, err.message);
  console.error(err);
} finally {
  console.log('\n--- app console errors ---');
  console.log(cdp.errors.filter(e => !/Content Security Policy|violates the following/.test(e)).slice(0, 25).join('\n') || '(none)');
  await shutdown(cdp);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('FAILURES:\n' + failed.map(f => `  [${f.group}] ${f.name}: ${f.detail}`).join('\n'));
process.exit(failed.length ? 1 : 0);
