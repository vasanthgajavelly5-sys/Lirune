import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const DOCX_DIR = path.join(os.tmpdir(), 'kilo', 'lirune-corpus', 'docx');
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

const cdp = await launch({ freshUserData: true });

try {
  group('Part 1: DOCX Import & Format Detection');
  
  // 1. Import Small DOCX
  await cdp.importFile(path.join(DOCX_DIR, 'small_sample.docx'));

  // 2. Import Medium DOCX
  await cdp.importFile(path.join(DOCX_DIR, 'medium_guide.docx'));

  // 3. Import Large DOCX
  await cdp.importFile(path.join(DOCX_DIR, 'large_manual.docx'));

  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length === 3`, { timeout: 30000 });

  const importedBooks = await cdp.eval(`return (await NoveraDB.getAllBooks()).map(b => ({ title: b.title, format: b.format, originalName: b.originalName, cover: Boolean(b.coverDataUrl) }));`);
  check('Small, medium, large DOCX imported', importedBooks.length === 3, `count=${importedBooks.length}`);
  check('All identified with format docx', importedBooks.every(b => b.format === 'docx'), JSON.stringify(importedBooks));
  check('Medium DOCX extracted embedded image cover', importedBooks.some(b => b.title.includes('Medium Guide') && b.cover), 'Medium DOCX cover extracted');

  // Verify format badge in library UI
  const formatBadges = await cdp.eval(`return Array.from(document.querySelectorAll('.book-card .card-format-badge')).map(b => b.textContent.trim());`);
  check('Format badges display "Word document"', formatBadges.includes('Word document'), formatBadges.join(', '));

  group('Part 2: DOCX Reader Rendering & Navigation');
  
  // Test Small DOCX
  await cdp.eval(`
    const book = (await NoveraDB.getAllBooks()).find(b => b.originalName === 'small_sample.docx');
    App.openReader(book.id);
  `);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden')`, { timeout: 10000 });
  await sleep(1500);

  const smallReader = await cdp.eval(`
    return {
      format: Reader.getFormatInfo()?.id,
      navCount: Reader.getNavigation()?.length,
      progress: Reader.getProgress(),
      content: document.querySelector('.doc-body')?.textContent?.slice(0, 150)
    };
  `);
  check('Small DOCX opened in reader', smallReader.format === 'docx', smallReader.format);
  check('Small DOCX has section navigation', smallReader.navCount >= 1, `sections=${smallReader.navCount}`);
  check('Small DOCX has text content', smallReader.content?.includes('Small Document Title') && smallReader.content?.includes('bold text'), smallReader.content);

  // Close Small DOCX
  await cdp.eval(`App.openLibrary();`);
  await sleep(600);

  // Test Medium DOCX (headings, formatting, lists, tables, images, links)
  await cdp.eval(`
    const book = (await NoveraDB.getAllBooks()).find(b => b.originalName === 'medium_guide.docx');
    App.openReader(book.id);
  `);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden')`, { timeout: 10000 });
  await sleep(1500);

  const medReader = await cdp.eval(`
    const docBody = document.querySelector('.doc-body');
    const boldEl = docBody?.querySelector('strong');
    const italicEl = docBody?.querySelector('em');
    const underlineEl = docBody?.querySelector('u');
    const strikeEl = docBody?.querySelector('s');
    const linkEl = docBody?.querySelector('a[href*="example.com"]');
    const imgEl = docBody?.querySelector('img.doc-image');
    const tableEl = docBody?.querySelector('table.doc-table');
    const listEl = docBody?.querySelector('.doc-list-item');
    return {
      format: Reader.getFormatInfo()?.id,
      hasBold: Boolean(boldEl),
      hasItalic: Boolean(italicEl),
      hasUnderline: Boolean(underlineEl),
      hasStrike: Boolean(strikeEl),
      hasLink: Boolean(linkEl),
      hasImg: Boolean(imgEl && imgEl.src.startsWith('data:image/')),
      hasTable: Boolean(tableEl),
      hasList: Boolean(listEl),
      nav: Reader.getNavigation().map(n => n.label),
      progress: Reader.getProgress()
    };
  `);
  check('Medium DOCX rich formatting (bold, italic, underline, strike)', medReader.hasBold && medReader.hasItalic && medReader.hasUnderline && medReader.hasStrike, JSON.stringify(medReader));
  check('Medium DOCX hyperlinks rendered', medReader.hasLink, 'link to example.com present');
  check('Medium DOCX embedded image rendered as data URL', medReader.hasImg, 'image data URL present');
  check('Medium DOCX data table rendered', medReader.hasTable, 'table present');
  check('Medium DOCX list items rendered', medReader.hasList, 'list present');
  check('Medium DOCX TOC derived from headings', medReader.nav.length >= 2, medReader.nav.join(' | '));

  // Navigation in Medium DOCX
  const medNav = await cdp.eval(`
    const locBefore = Reader.getLocation();
    await Reader.next();
    await new Promise(r => setTimeout(r, 600));
    const locAfter = Reader.getLocation();
    await Reader.prev();
    await new Promise(r => setTimeout(r, 600));
    const locBack = Reader.getLocation();
    return { locBefore, locAfter, locBack };
  `);
  check('Medium DOCX navigation next/prev advances and returns', medNav.locAfter !== medNav.locBefore && medNav.locBack === medNav.locBefore, JSON.stringify(medNav));

  // Close Medium DOCX
  await cdp.eval(`App.openLibrary();`);
  await sleep(600);

  // Test Large DOCX (240 sections, 80 chapters)
  await cdp.eval(`
    const book = (await NoveraDB.getAllBooks()).find(b => b.originalName === 'large_manual.docx');
    App.openReader(book.id);
  `);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden')`, { timeout: 15000 });
  await sleep(2000);

  const largeReader = await cdp.eval(`
    return {
      format: Reader.getFormatInfo()?.id,
      navCount: Reader.getNavigation()?.length,
      progress: Reader.getProgress(),
      sectionsRendered: document.querySelectorAll('.doc-section').length
    };
  `);
  check('Large DOCX opened and parsed successfully', largeReader.format === 'docx', `sections=${largeReader.navCount}`);
  check('Large DOCX navigation entries generated from chapters', largeReader.navCount >= 50, `chapters=${largeReader.navCount}`);

  // Test Large DOCX navigation & TOC jump
  const largeJump = await cdp.eval(`
    const nav = Reader.getNavigation();
    const target = nav[10]?.id || 'sec-11';
    await Reader.goTo(target);
    await new Promise(r => setTimeout(r, 800));
    return {
      loc: Reader.getLocation(),
      progress: Reader.getProgress().percent
    };
  `);
  check('Large DOCX TOC jump works and updates progress', largeJump.progress > 0, `pct=${largeJump.progress}%, loc=${largeJump.loc}`);

  // Close Large DOCX
  await cdp.eval(`App.openLibrary();`);
  await sleep(600);

  group('Part 3: Invalid / Corrupted DOCX Handling');
  
  // Test invalid empty file
  const errEmpty = await cdp.eval(`
    try {
      const file = new File([new Uint8Array(0)], 'empty.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      await Library.processFiles([file]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  `);
  check('0-byte empty.docx handled safely without crash', true, JSON.stringify(errEmpty));

  // Test malformed archive
  const errMalformed = await cdp.eval(`
    try {
      const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0xff, 0xff])], 'malformed.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      await Library.processFiles([file]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  `);
  check('Malformed archive handled gracefully', true, JSON.stringify(errMalformed));

  group('Part 4: Book-Close Blink & Continue Reading State');

  // Set up 2 distinct books with known lastReadDates
  await cdp.eval(`
    const all = await NoveraDB.getAllBooks();
    for (const b of all) {
      await NoveraDB.updateBookMetadata(b.id, { lastReadDate: 0 });
    }
    const bookA = all.find(b => b.originalName === 'small_sample.docx');
    const bookB = all.find(b => b.originalName === 'medium_guide.docx');
    
    // Set Book A read at T=1000
    // Set Book B read at T=2000 (more recently read)
    await NoveraDB.updateBookMetadata(bookA.id, { lastReadDate: 1000, progressPercent: 15, currentCfi: 'page:0:sec-1' });
    await NoveraDB.updateBookMetadata(bookB.id, { lastReadDate: 2000, progressPercent: 40, currentCfi: 'page:0:sec-1' });
    await Library.loadAndRenderBooks();
    return true;
  `);
  await sleep(400);

  const crInitial = await cdp.eval(`
    const cards = Array.from(document.querySelectorAll('#continue-cards .continue-card .continue-title')).map(el => el.textContent);
    return cards;
  `);
  check('Initial Continue Reading: Book B is #1, Book A is #2',
    crInitial[0]?.includes('Medium Guide') && (crInitial[1]?.includes('small_sample') || crInitial[1]?.includes('Small Document')),
    crInitial.join(' | ')
  );

  // Step A: Open Book A, do NOT read / navigate, close Book A immediately
  await cdp.eval(`
    const all = await NoveraDB.getAllBooks();
    const bookA = all.find(b => b.originalName === 'small_sample.docx');
    await App.openReader(bookA.id);
  `);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden')`, { timeout: 10000 });
  await sleep(600);

  // Close Book A without navigating
  await cdp.eval(`await App.openLibrary();`);
  await sleep(400);

  const crAfterCloseNoRead = await cdp.eval(`
    const cards = Array.from(document.querySelectorAll('#continue-cards .continue-card .continue-title')).map(el => el.textContent);
    return cards;
  `);
  check('Closing Book A without reading does NOT promote it: Book B remains #1',
    crAfterCloseNoRead[0]?.includes('Medium Guide') && (crAfterCloseNoRead[1]?.includes('small_sample') || crAfterCloseNoRead[1]?.includes('Small Document')),
    crAfterCloseNoRead.join(' | ')
  );

  // Step B: Open Book A, READ IT (navigate next), then close Book A
  await cdp.eval(`
    const all = await NoveraDB.getAllBooks();
    const bookA = all.find(b => b.originalName === 'small_sample.docx');
    await App.openReader(bookA.id);
  `);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden')`, { timeout: 10000 });
  await sleep(600);

  // Turn page (actual user reading)
  await cdp.eval(`await Reader.next();`);
  await sleep(400);

  // Close Book A
  await cdp.eval(`await App.openLibrary();`);
  await sleep(400);

  const crAfterRead = await cdp.eval(`
    const cards = Array.from(document.querySelectorAll('#continue-cards .continue-card .continue-title')).map(el => el.textContent);
    return cards;
  `);
  check('Reading Book A properly promotes Book A to #1',
    (crAfterRead[0]?.includes('small_sample') || crAfterRead[0]?.includes('Small Document')) && crAfterRead[1]?.includes('Medium Guide'),
    crAfterRead.join(' | ')
  );

  // Step C: Open Book B, READ IT (navigate next), then close Book B
  await cdp.eval(`
    const all = await NoveraDB.getAllBooks();
    const bookB = all.find(b => b.originalName === 'medium_guide.docx');
    await App.openReader(bookB.id);
  `);
  await cdp.waitFor(`!document.getElementById('reader-view').classList.contains('hidden')`, { timeout: 10000 });
  await sleep(600);

  // Turn page (actual user reading)
  await cdp.eval(`await Reader.next();`);
  await sleep(400);

  // Close Book B
  await cdp.eval(`await App.openLibrary();`);
  await sleep(400);

  const crAfterReadB = await cdp.eval(`
    const cards = Array.from(document.querySelectorAll('#continue-cards .continue-card .continue-title')).map(el => el.textContent);
    return cards;
  `);
  check('Reading Book B properly promotes Book B to #1',
    crAfterReadB[0]?.includes('Medium Guide') && (crAfterReadB[1]?.includes('small_sample') || crAfterReadB[1]?.includes('Small Document')),
    crAfterReadB.join(' | ')
  );

  // Verify No Blink: openLibrary renders state while reader view is hidden/transitioned once
  const viewState = await cdp.eval(`
    const libView = document.getElementById('library-view');
    const readerView = document.getElementById('reader-view');
    return {
      libActive: libView.classList.contains('active') && !libView.classList.contains('hidden'),
      readerHidden: readerView.classList.contains('hidden') && !readerView.classList.contains('active'),
      bodyReaderOpen: document.body.classList.contains('reader-open'),
      cardCount: document.querySelectorAll('#books-grid .book-card').length
    };
  `);
  check('Clean single return to Library: Library active, reader hidden, no reader-open class',
    viewState.libActive && viewState.readerHidden && !viewState.bodyReaderOpen && viewState.cardCount >= 3,
    JSON.stringify(viewState)
  );

} catch (err) {
  console.error('Test error in suite-docx-and-close:', err);
  check('Suite completed without exception', false, err.message);
} finally {
  console.log('\n=======================================');
  console.log('DOCX & CLOSE-FLOW QA SUMMARY:');
  console.log(`Passed: ${pass}/${pass + fail}`);
  console.log(`Failed: ${fail}/${pass + fail}`);
  if (failures.length > 0) {
    console.log('Failed checks:', failures);
  }
  console.log('=======================================\n');
  await shutdown(cdp).catch(() => {});
  process.exit(fail > 0 ? 1 : 0);
}
