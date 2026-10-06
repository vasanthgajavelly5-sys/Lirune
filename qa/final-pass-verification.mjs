import { launch, shutdown, sleep } from './cdp.mjs';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const cdp = await launch({ freshUserData: true });
try {
  console.log('--- Checking 15 Final Items ---');

  // Item 14: Starts in Light mode immediately
  const startupTheme = await cdp.eval(`
    return {
      htmlTheme: document.documentElement.getAttribute('data-theme'),
      bodyTheme: document.body.getAttribute('data-theme'),
      appTheme: typeof ThemeManager !== 'undefined' ? ThemeManager.getAppTheme() : null
    };
  `);
  check('Starts in Light mode by default', startupTheme.htmlTheme === 'light' && startupTheme.appTheme === 'light', JSON.stringify(startupTheme));

  // Item 2 & 3: Default welcome state
  const welcomeState = await cdp.eval(`
    const titles = Array.from(document.querySelectorAll('.card-title, .continue-title')).map(el => el.textContent);
    const hasSker = titles.some(t => t.includes('Sker Point') || t.includes('Lighthouse'));
    const dropZoneVisible = !document.getElementById('drop-zone')?.classList.contains('has-books');
    const books = typeof NoveraDB !== 'undefined' ? await NoveraDB.getAllBooks() : [];
    return {
      hasSker,
      dropZoneVisible,
      bookCount: books.length,
      sampleBtnExists: !!document.getElementById('sample-book-btn')
    };
  `);
  check('No QA corpus / Sker Point in default library', !welcomeState.hasSker, JSON.stringify(welcomeState));
  check('Approved Lirune welcome hero/dropzone displayed', welcomeState.dropZoneVisible && welcomeState.sampleBtnExists, JSON.stringify(welcomeState));

  // Item 13: Generic import UI wording audit
  const importWording = await cdp.eval(`
    return {
      addMoreTitle: document.getElementById('add-more-btn')?.getAttribute('title'),
      importSubtitle: document.querySelector('#import-modal .modal-subtitle')?.textContent,
      importFileText: document.getElementById('import-file-btn')?.textContent,
      importFolderText: document.getElementById('import-folder-btn')?.textContent
    };
  `);
  check('Generic import wording does not say EPUB', 
    !importWording.addMoreTitle?.includes('EPUB') && 
    !importWording.importSubtitle?.includes('one EPUB') &&
    !importWording.importFileText?.includes('one EPUB'),
    JSON.stringify(importWording)
  );

  // Generate welcome book to test cards, covers, sorting, and grouping
  await cdp.eval(`Library.generateSampleBook(); return true;`);
  await cdp.waitFor(`EpubLoader.isLoaded() && !document.getElementById('reader-view').classList.contains('hidden')`, { timeout: 30000 });
  await cdp.eval(`App.openLibrary(); return true;`);
  await sleep(500);

  // Item 5 & 15: Cover rendering and drag prevention on badge
  const cardBadgeAndCover = await cdp.eval(`
    const card = document.querySelector('.book-card');
    const badge = card?.querySelector('.card-format-badge');
    const cover = card?.querySelector('.card-cover');
    const coverWrap = card?.querySelector('.card-cover-wrap');
    return {
      hasCard: !!card,
      hasCover: !!cover,
      coverSrc: cover?.src?.slice(0, 30),
      badgeText: badge?.textContent,
      badgeUserSelect: badge ? getComputedStyle(badge).userSelect : null,
      cardUserSelect: card ? getComputedStyle(card).userSelect : null
    };
  `);
  check('Cover rendered sharply from data URL', cardBadgeAndCover.hasCover && cardBadgeAndCover.coverSrc?.startsWith('data:image/'), JSON.stringify(cardBadgeAndCover));
  check('File-type badge and card prevent native drag/selection', cardBadgeAndCover.badgeUserSelect === 'none' && cardBadgeAndCover.cardUserSelect === 'none', JSON.stringify(cardBadgeAndCover));

  // Item 9: Sort by Type
  const sortOptions = await cdp.eval(`
    const sel = document.getElementById('sort-select');
    return Array.from(sel?.options || []).map(o => o.value);
  `);
  check('Sort options include "type"', sortOptions.includes('type'), JSON.stringify(sortOptions));

  // Add a synthetic second book with different type to test type sorting & group by type
  await cdp.eval(`
    await NoveraDB.saveBook({
      id: 'book-test-pdf',
      title: 'Algorithm Handbook',
      author: 'QA Specialist',
      format: 'pdf',
      lastReadDate: Date.now() + 500,
      progressPercent: 20
    });
    await Library.loadAndRenderBooks();
    return true;
  `);
  await sleep(300);

  // Test Sort by Type
  await cdp.eval(`Library.setView({ sortBy: 'type', sortOrder: 'asc' }); return true;`);
  await sleep(200);
  const sortedTitlesAsc = await cdp.eval(`
    return Array.from(document.querySelectorAll('#books-grid .book-card .card-title')).map(el => el.textContent);
  `);
  check('Type sort ascending works', sortedTitlesAsc[0] === 'Welcome to Lirune' && sortedTitlesAsc[1] === 'Algorithm Handbook', JSON.stringify(sortedTitlesAsc));

  await cdp.eval(`Library.setView({ sortBy: 'type', sortOrder: 'desc' }); return true;`);
  await sleep(200);
  const sortedTitlesDesc = await cdp.eval(`
    return Array.from(document.querySelectorAll('#books-grid .book-card .card-title')).map(el => el.textContent);
  `);
  check('Type sort descending works', sortedTitlesDesc[0] === 'Algorithm Handbook' && sortedTitlesDesc[1] === 'Welcome to Lirune', JSON.stringify(sortedTitlesDesc));

  // Item 10: Group by Type OFF by default and works when ON
  const groupDefault = await cdp.eval(`return Library.getViewState().groupByType;`);
  check('Group by Type is OFF by default', groupDefault === false);

  await cdp.eval(`Library.setView({ groupByType: true }); return true;`);
  await sleep(300);
  const groupHeaders = await cdp.eval(`
    return Array.from(document.querySelectorAll('#books-grid .library-group-title')).map(el => el.textContent);
  `);
  check('Group by Type ON displays format section headers', groupHeaders.includes('EPUB') && groupHeaders.includes('PDF'), JSON.stringify(groupHeaders));

  // Item 7: About only has one Buy Me a Coffee button
  const coffeeButtons = await cdp.eval(`
    const aboutPane = document.querySelector('[data-section="about"]');
    return aboutPane ? aboutPane.querySelectorAll('a[href*="buymeacoffee"]').length : 0;
  `);
  check('About has exactly ONE Buy Me a Coffee button', coffeeButtons === 1, `count=${coffeeButtons}`);

  // Item 8: Accessibility settings expanded
  const a11yControls = await cdp.eval(`
    const host = document.getElementById('accessibility-controls');
    const switches = Array.from(host?.querySelectorAll('.setting-switch') || []).map(s => s.id);
    return switches;
  `);
  check('Accessibility has useful controls', 
    a11yControls.includes('fs-reduce-motion') &&
    a11yControls.includes('fs-focus-outlines') &&
    a11yControls.includes('fs-large-controls') &&
    a11yControls.includes('fs-high-contrast'),
    JSON.stringify(a11yControls)
  );

  // Item 11: General settings not empty
  const genControls = await cdp.eval(`
    const host = document.getElementById('general-controls');
    const switches = Array.from(host?.querySelectorAll('.setting-switch') || []).map(s => s.id);
    return switches;
  `);
  check('General settings populated with preferences', 
    genControls.includes('fs-confirm-delete') &&
    genControls.includes('fs-restore-last'),
    JSON.stringify(genControls)
  );

  // Item 6 & 12: Settings visual styling
  const settingsStyle = await cdp.eval(`
    const grp = document.querySelector('.settings-group');
    if (!grp) return null;
    const cs = getComputedStyle(grp);
    return {
      border: cs.borderWidth,
      borderRadius: cs.borderRadius,
      padding: cs.padding
    };
  `);
  check('Settings groups have structured container borders and padding', !!settingsStyle && settingsStyle.border !== '0px', JSON.stringify(settingsStyle));

} catch (err) {
  console.error('Error during pass-verification:', err);
  check('Suite completed without exception', false, err.message);
} finally {
  console.log('\n=======================================');
  console.log('15-ITEMS VERIFICATION SUMMARY:');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log('=======================================\n');
  await shutdown(cdp).catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
}
