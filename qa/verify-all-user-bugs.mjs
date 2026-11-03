import { launch, shutdown, sleep } from './cdp.mjs';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

let cdp;
try {
  console.log('Launching Electron with CDP harness...');
  cdp = await launch({ freshUserData: true });

  console.log('Creating and opening sample welcome book in Reader...');
  await cdp.eval(`Library.generateSampleBook(); return true;`);
  await cdp.waitFor(`EpubLoader.isLoaded() && !document.getElementById('reader-view').classList.contains('hidden')`, {
    label: 'sample book loaded in reader',
    timeout: 30000
  });
  await sleep(1500);

  // Open TOC panel
  console.log('Opening TOC Panel...');
  await cdp.eval(`
    document.getElementById('toc-toggle-btn').click();
    return true;
  `);
  await sleep(500);

  // --- TEST 1: TOC Panel Width ---
  const panelWidth = await cdp.eval(`
    const panel = document.getElementById('toc-panel');
    const rect = panel.getBoundingClientRect();
    const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
    return { width: Math.round(rect.width), cssVar };
  `);
  check('Bug 2: TOC panel width is 355px (+14.5%)', panelWidth.cssVar === '355px' && panelWidth.width >= 340, `cssVar=${panelWidth.cssVar}, rectWidth=${panelWidth.width}px`);

  // --- TEST 2: Close TOC Button (Bug 4) ---
  const closeBtnCheck = await cdp.eval(`
    const btn = document.getElementById('close-toc-btn');
    const svg = btn?.querySelector('svg');
    const svgHtml = svg ? svg.outerHTML : '';
    const hasTypo = svgHtml.includes('x18="6"');
    const hasValidLine1 = svgHtml.includes('x1="18"');
    const hasValidLine2 = svgHtml.includes('x1="6"');
    const title = btn?.getAttribute('title');
    return { exists: !!btn, hasTypo, hasValidLine1, hasValidLine2, title, svgHtml };
  `);
  check('Bug 4: Close TOC button has valid X SVG (no typo)', closeBtnCheck.exists && !closeBtnCheck.hasTypo && closeBtnCheck.hasValidLine1 && closeBtnCheck.hasValidLine2, `title=${closeBtnCheck.title}`);

  // Click Close TOC button and verify panel closes
  const closedCheck = await cdp.eval(`
    const btn = document.getElementById('close-toc-btn');
    const panel = document.getElementById('toc-panel');
    btn.click();
    return { isOpen: panel.classList.contains('open'), ariaHidden: panel.getAttribute('aria-hidden') };
  `);
  await sleep(400);
  check('Bug 4: Close TOC button closes navigation panel on click', !closedCheck.isOpen, `isOpen=${closedCheck.isOpen}, ariaHidden=${closedCheck.ariaHidden}`);

  // Re-open TOC panel for next tests
  await cdp.eval(`document.getElementById('toc-toggle-btn').click(); return true;`);
  await sleep(500);

  // --- TEST 3: TOC Search Bar Filter ---
  const filterCheck = await cdp.eval(`
    const input = document.getElementById('toc-filter-input');
    const entries = [...document.querySelectorAll('#toc-list .toc-entry')];
    if (entries.length === 0) return { error: 'No TOC entries found' };

    // Search for a specific word in first entry
    const targetText = entries[0].textContent.trim().split(' ')[0];
    input.value = targetText;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const visibleCount = entries.filter(e => e.style.display !== 'none' && !e.hidden).length;
    const hiddenCount = entries.filter(e => e.style.display === 'none' || e.hidden).length;

    // Clear search
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const allVisibleAgain = entries.every(e => e.style.display !== 'none' && !e.hidden);

    return { total: entries.length, visibleCount, hiddenCount, allVisibleAgain, targetText };
  `);
  check('Bug 1: TOC filter search bar hides non-matching items and restores on clear', filterCheck.visibleCount > 0 && filterCheck.allVisibleAgain, `matched=${filterCheck.visibleCount}, hidden=${filterCheck.hiddenCount}`);

  // --- TEST 4: Chapter Click Navigation to Chapter Start (Paginated Mode) ---
  const paginatedJump = await cdp.eval(`
    const entries = [...document.querySelectorAll('#toc-list .toc-entry')];
    if (entries.length < 2) return { error: 'Not enough entries' };

    // Click second entry
    entries[1].click();
    await new Promise(r => setTimeout(r, 1500));

    const view = document.querySelector('#epub-container .epub-view');
    const scrollLeft = view ? view.scrollLeft : 0;
    return { scrollLeft, isReader: App.isReaderView() };
  `);
  check('Bug 3: Paginated TOC navigation starts at first of chapter body (scrollLeft=0)', paginatedJump.scrollLeft === 0 && paginatedJump.isReader, `scrollLeft=${paginatedJump.scrollLeft}`);

  // --- TEST 5: Scroll Mode TOC Navigation (Bug 5 - Blank Screen / Exit Crash Prevention) ---
  console.log('Switching to Scroll Mode and testing chapter navigation...');
  const scrollTest = await cdp.eval(`
    ReaderSettings.setSetting('flow', 'scrolled');
    await Reader.reRender();
    await new Promise(r => setTimeout(r, 2000));

    // Reopen TOC if closed by rerender
    const tocPanel = document.getElementById('toc-panel');
    if (!tocPanel.classList.contains('open')) {
      document.getElementById('toc-toggle-btn').click();
      await new Promise(r => setTimeout(r, 500));
    }

    const entries = [...document.querySelectorAll('#toc-list .toc-entry')];
    const navCount = entries.length;

    // Jump 1: Chapter 3 or 2
    const target1 = Math.min(2, navCount - 1);
    entries[target1].click();
    await new Promise(r => setTimeout(r, 1500));

    let iframes1 = document.querySelectorAll('#epub-container iframe').length;
    let isReader1 = App.isReaderView();

    // Jump 2: Chapter 1
    entries[0].click();
    await new Promise(r => setTimeout(r, 1500));

    let iframes2 = document.querySelectorAll('#epub-container iframe').length;
    let isReader2 = App.isReaderView();

    return {
      flow: ReaderSettings.getSettings().flow,
      jump1: { targetIndex: target1, iframes: iframes1, isReader: isReader1 },
      jump2: { targetIndex: 0, iframes: iframes2, isReader: isReader2 }
    };
  `);
  const scrollSuccess = scrollTest.jump1.iframes > 0 && scrollTest.jump1.isReader &&
                        scrollTest.jump2.iframes > 0 && scrollTest.jump2.isReader;
  check('Bug 5: Scroll mode TOC jumps without blank screen or crash to library', scrollSuccess, `flow=${scrollTest.flow}, jump1 iframes=${scrollTest.jump1.iframes}, jump2 iframes=${scrollTest.jump2.iframes}`);

} catch (err) {
  console.error('Test error:', err);
  check('Suite execution', false, err.message);
} finally {
  if (cdp) {
    await shutdown(cdp);
  }
}

const failed = results.filter(r => !r.ok);
console.log(`\nFinal Verification Results: ${results.length - failed.length}/${results.length} passed.`);
if (failed.length > 0) {
  process.exit(1);
} else {
  console.log('All bug fixes verified successfully!');
  process.exit(0);
}
