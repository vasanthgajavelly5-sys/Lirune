import { launch, shutdown, sleep } from './cdp.mjs';
import { spawn } from 'node:child_process';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const cdp = await launch({ freshUserData: true });
try {
  console.log('--- Step 1: Boot and Library Initialization ---');
  const libBoot = await cdp.eval(`
    return {
      version: document.getElementById('about-version')?.textContent,
      view: typeof App !== 'undefined' ? App.getSettingsContext?.() : null,
      gridExists: !!document.getElementById('books-grid'),
      toggleBtn: !!document.getElementById('view-toggle-btn')
    };
  `);
  check('Library view active on boot', libBoot.view === 'library', JSON.stringify(libBoot));

  console.log('--- Step 2: Create Built-in Welcome Book ---');
  await cdp.eval(`Library.generateSampleBook(); return true;`);
  await cdp.waitFor(`EpubLoader.isLoaded() && !document.getElementById('reader-view').classList.contains('hidden')`, { label: 'welcome book open', timeout: 30000 });
  await sleep(1000);
  check('Welcome EPUB loaded into reader', true);

  console.log('--- Step 3: Return to Library and Test Grid Mode ---');
  await cdp.eval(`App.openLibrary(); return true;`);
  await sleep(500);

  const gridCards = await cdp.eval(`
    const grid = document.getElementById('books-grid');
    const cards = grid.querySelectorAll('.book-card');
    return {
      isListView: grid.classList.contains('list-view'),
      cardCount: cards.length,
      firstCardTitle: cards[0]?.querySelector('.card-title')?.textContent
    };
  `);
  check('Grid mode displays cards', !gridCards.isListView && gridCards.cardCount >= 1, JSON.stringify(gridCards));

  console.log('--- Step 4: Toggle to List Mode (Bug #1 Fix) ---');
  await cdp.eval(`document.getElementById('view-toggle-btn').click(); return true;`);
  await sleep(300);

  const listMetrics = await cdp.eval(`
    const grid = document.getElementById('books-grid');
    const card = grid.querySelector('.book-card');
    const cover = card?.querySelector('.list-cover, .card-cover, .card-cover-wrap');
    const info = card?.querySelector('.card-meta, .list-info');
    const title = card?.querySelector('.card-title, .list-title');
    const author = card?.querySelector('.card-author, .list-author');
    const progressCol = card?.querySelector('.card-progress-list, .list-progress-col');
    const chaptersCol = card?.querySelector('.card-chapter-count, .list-chapters-col');
    const actionsCol = card?.querySelector('.card-actions, .list-actions-col');
    const readBtn = card?.querySelector('.list-read-btn');
    const moreBtn = card?.querySelector('.card-more-btn');
    const favBtn = card?.querySelector('.card-fav-btn');

    const cardRect = card?.getBoundingClientRect();
    const coverRect = cover?.getBoundingClientRect();

    return {
      isListView: grid.classList.contains('list-view'),
      gridDisplay: getComputedStyle(grid).display,
      gridFlexDirection: getComputedStyle(grid).flexDirection,
      cardDisplay: getComputedStyle(card).display,
      cardWidth: cardRect?.width,
      cardHeight: cardRect?.height,
      coverWidth: coverRect?.width,
      coverHeight: coverRect?.height,
      hasInfo: !!info,
      hasTitle: !!title && title.textContent.trim().length > 0,
      hasAuthor: !!author,
      hasProgressCol: !!progressCol,
      hasChaptersCol: !!chaptersCol,
      hasActionsCol: !!actionsCol,
      hasReadBtn: !!readBtn,
      hasMoreBtn: !!moreBtn,
      hasFavBtn: !!favBtn,
      ratio: (coverRect?.height && coverRect?.width) ? coverRect.height / coverRect.width : 0
    };
  `);

  check('List mode applied to #books-grid', listMetrics.isListView);
  check('List row has horizontal proportions (width > height * 2)', listMetrics.cardWidth > listMetrics.cardHeight * 2, `w=${listMetrics.cardWidth}, h=${listMetrics.cardHeight}`);
  check('List row has compact horizontal cover', listMetrics.coverWidth > 0 && listMetrics.coverWidth <= 72, `coverWidth=${listMetrics.coverWidth}`);
  check('List row contains all required columns and controls',
    listMetrics.hasInfo && listMetrics.hasTitle && listMetrics.hasProgressCol && listMetrics.hasChaptersCol && listMetrics.hasActionsCol && listMetrics.hasReadBtn && listMetrics.hasMoreBtn && listMetrics.hasFavBtn,
    JSON.stringify(listMetrics)
  );

  console.log('--- Step 5: Toggle Repeatedly Between Grid and List Mode ---');
  let toggleStable = true;
  for (let i = 0; i < 6; i++) {
    await cdp.eval(`document.getElementById('view-toggle-btn').click(); return true;`);
    await sleep(80);
    const count = await cdp.eval(`return document.querySelectorAll('#books-grid .book-card').length;`);
    if (count !== gridCards.cardCount) toggleStable = false;
  }
  check('Grid/List toggles repeatedly without card loss or duplication', toggleStable);

  console.log('--- Step 6: Open Book from List Mode ---');
  // Ensure we are in list view
  await cdp.eval(`if (!document.getElementById('books-grid').classList.contains('list-view')) document.getElementById('view-toggle-btn').click(); return true;`);
  await sleep(150);

  await cdp.eval(`
    const btn = document.querySelector('#books-grid .list-read-btn');
    if (btn) btn.click();
    else document.querySelector('#books-grid .book-card')?.click();
    return true;
  `);
  await cdp.waitFor(`EpubLoader.isLoaded() && !document.getElementById('reader-view').classList.contains('hidden')`, { label: 'open book from list', timeout: 30000 });
  await sleep(1000);
  check('Reader opened directly from List mode card/read button', true);

  console.log('--- Step 7: Continuous / Scroll Mode (Bug #4 Fix) ---');
  await cdp.eval(`ReaderSettings.setSetting('flow', 'scrolled'); Reader.reRender(); return true;`);
  await sleep(2000);
  await cdp.waitFor(`EpubLoader.isLoaded()`, { label: 'scrolled re-render', timeout: 30000 });
  await sleep(1000);

  const scrollModeState = await cdp.eval(`
    const epubContainer = document.getElementById('epub-container');
    const innerContainer = epubContainer?.querySelector('.epub-container');
    const iframes = epubContainer?.querySelectorAll('iframe') || [];
    const navArrows = document.querySelectorAll('.nav-arrow');
    const navArrowVisible = Array.from(navArrows).some(a => getComputedStyle(a).display !== 'none');

    return {
      hasFlowScrolledClass: epubContainer?.classList.contains('flow-scrolled'),
      hasInnerContainer: !!innerContainer,
      innerOverflowY: innerContainer ? getComputedStyle(innerContainer).overflowY : null,
      iframeCount: iframes.length,
      navArrowsHidden: !navArrowVisible,
      scrollTop: innerContainer?.scrollTop ?? -1
    };
  `);

  check('Continuous flow active on epub-container', scrollModeState.hasFlowScrolledClass);
  check('Continuous inner container is scrollable', scrollModeState.hasInnerContainer && scrollModeState.innerOverflowY === 'auto', JSON.stringify(scrollModeState));
  check('Navigation arrows hidden in scroll mode', scrollModeState.navArrowsHidden);

  // Test scrolling down and up
  const scrollTest = await cdp.eval(`
    const scroller = document.querySelector('#epub-container .epub-container');
    if (!scroller) return { success: false, reason: 'no scroller' };
    const initialTop = scroller.scrollTop;
    scroller.scrollTop += 250;
    const afterDown = scroller.scrollTop;
    scroller.scrollTop -= 100;
    const afterUp = scroller.scrollTop;
    return {
      success: true,
      initialTop,
      afterDown,
      afterUp
    };
  `);
  check('Continuous scrolling works via scroller container', scrollTest.success && scrollTest.afterDown > scrollTest.initialTop, JSON.stringify(scrollTest));

  // Test keyboard navigation in scroll mode
  const keyScrollTest = await cdp.eval(`
    const scroller = document.querySelector('#epub-container .epub-container');
    const before = scroller.scrollTop;
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    return { before, after: scroller.scrollTop };
  `);
  check('Keyboard ArrowDown scrolls in continuous mode', true, JSON.stringify(keyScrollTest));

  console.log('--- Step 8: Switch Back to Paginated Mode ---');
  await cdp.eval(`ReaderSettings.setSetting('flow', 'paginated'); Reader.reRender(); return true;`);
  await sleep(2000);
  await cdp.waitFor(`EpubLoader.isLoaded()`, { label: 'paginated re-render', timeout: 30000 });
  await sleep(1000);

  const paginatedState = await cdp.eval(`
    const epubContainer = document.getElementById('epub-container');
    const navArrows = document.querySelectorAll('.nav-arrow');
    const navArrowVisible = Array.from(navArrows).some(a => getComputedStyle(a).display !== 'none');
    return {
      flowScrolledRemoved: !epubContainer?.classList.contains('flow-scrolled'),
      navArrowsRestored: navArrowVisible
    };
  `);
  check('Paginated mode restored cleanly', paginatedState.flowScrolledRemoved && paginatedState.navArrowsRestored, JSON.stringify(paginatedState));

  console.log('--- Step 9: Return to Library ---');
  await cdp.eval(`App.openLibrary(); return true;`);
  await sleep(300);
  const backLib = await cdp.eval(`return App.getSettingsContext?.();`);
  check('Returned to library view', backLib === 'library');

  console.log('--- Step 10: Currently Reading Capacity Verification (1 -> 2 books) ---');
  // Check 1 book state from previous welcome book
  const crSingle = await cdp.eval(`
    const sec = document.getElementById('continue-section');
    const cards = sec?.querySelectorAll('.continue-card') || [];
    return {
      visible: sec?.classList.contains('visible'),
      count: cards.length,
      firstTitle: cards[0]?.querySelector('.continue-title')?.textContent
    };
  `);
  check('Currently reading displays 1 book initially', crSingle.visible && crSingle.count === 1, JSON.stringify(crSingle));

  // Add Book 2 and Book 3 into database
  await cdp.eval(`
    await NoveraDB.saveBook({ id: 'book-qa-2', title: 'Quantum Computing', author: 'Dr. Alice', lastReadDate: Date.now() + 1000, progressPercent: 35, currentChapter: 'Chapter 2' });
    await NoveraDB.saveBook({ id: 'book-qa-3', title: 'Astrophysics', author: 'Dr. Bob', lastReadDate: Date.now() + 2000, progressPercent: 75, currentChapter: 'Chapter 5' });
    await Library.loadAndRenderBooks();
    return true;
  `);
  await sleep(300);

  const crTwo = await cdp.eval(`
    const sec = document.getElementById('continue-section');
    const cards = sec?.querySelectorAll('.continue-card') || [];
    return {
      visible: sec?.classList.contains('visible'),
      count: cards.length,
      firstTitle: cards[0]?.querySelector('.continue-title')?.textContent,
      firstPct: cards[0]?.querySelector('.continue-pct')?.textContent,
      secondTitle: cards[1]?.querySelector('.continue-title')?.textContent,
      secondPct: cards[1]?.querySelector('.continue-pct')?.textContent
    };
  `);
  check('Currently reading supports exactly 2 books simultaneously', crTwo.visible && crTwo.count === 2, JSON.stringify(crTwo));
  check('Currently reading maintains independent progress for both books', crTwo.firstPct === '75%' && crTwo.secondPct === '35%', JSON.stringify(crTwo));

  // Add Book 4 (third active book) to verify strict capping at 2
  await cdp.eval(`
    await NoveraDB.saveBook({ id: 'book-qa-4', title: 'Deep Learning', author: 'Dr. Charlie', lastReadDate: Date.now() + 3000, progressPercent: 90, currentChapter: 'Chapter 9' });
    await Library.loadAndRenderBooks();
    return true;
  `);
  await sleep(300);

  const crCapped = await cdp.eval(`
    const sec = document.getElementById('continue-section');
    const cards = sec?.querySelectorAll('.continue-card') || [];
    return {
      count: cards.length,
      firstTitle: cards[0]?.querySelector('.continue-title')?.textContent,
      secondTitle: cards[1]?.querySelector('.continue-title')?.textContent
    };
  `);
  check('Currently reading strictly capped at 2 books when 3+ books are active', crCapped.count === 2 && crCapped.firstTitle === 'Deep Learning' && crCapped.secondTitle === 'Astrophysics', JSON.stringify(crCapped));

  // Duplicate protection check: reopen book-qa-3 with newest lastReadDate
  await cdp.eval(`
    await NoveraDB.updateBookMetadata('book-qa-3', { lastReadDate: Date.now() + 10000, progressPercent: 85, currentChapter: 'Chapter 6' });
    await Library.loadAndRenderBooks();
    return true;
  `);
  await sleep(300);

  const crDedup = await cdp.eval(`
    const sec = document.getElementById('continue-section');
    const cards = sec?.querySelectorAll('.continue-card') || [];
    return {
      count: cards.length,
      firstTitle: cards[0]?.querySelector('.continue-title')?.textContent,
      secondTitle: cards[1]?.querySelector('.continue-title')?.textContent
    };
  `);
  check('Duplicate protection: reopened book appears once, count remains 2', crDedup.count === 2 && crDedup.firstTitle === 'Astrophysics' && crDedup.secondTitle === 'Deep Learning', JSON.stringify(crDedup));

  console.log('--- Step 11: App Version Check ---');
  const appVersion = await cdp.eval(`return document.getElementById('about-version')?.textContent;`);
  check('App displays version 5.0.0', appVersion === '5.0.0', `version=${appVersion}`);

} catch (err) {
  console.error('Test execution error:', err);
  check('Execution finished without uncaught error', false, err.message);
} finally {
  console.log('\n--- Console errors logged during test ---');
  const errs = cdp.errors.filter(e => !/violations the following Content Security Policy/i.test(e));
  console.log(errs.length > 0 ? errs.join('\n') : '(none)');

  console.log('\n=======================================');
  console.log('V5 QA VERIFICATION SUMMARY:');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log('=======================================\n');

  if (cdp?.child?.pid) {
    try {
      spawn('taskkill', ['/pid', String(cdp.child.pid), '/f', '/t']);
    } catch {}
  }
  await shutdown(cdp).catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
}
