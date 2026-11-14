/**
 * Storage, integrity, repair, orphan and backup behaviour.
 *
 * These tests deliberately break things rather than only reading state. A file
 * is deleted behind the library's back, a file is corrupted, an orphan is
 * planted, and malformed backups are fed in, because that is the only way to
 * know the recovery paths actually work.
 */
import { launch, shutdown, sleep } from './cdp.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const CORPUS = path.join(os.tmpdir(), 'kilo', 'lirune-corpus');
const WORK = path.join(os.tmpdir(), 'kilo', 'storage-work');

let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function group(name) {
  console.log(`\n== ${name}`);
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const cdp = await launch({ freshUserData: true });
try {
  // ---------------------------------------------------------------- fixtures
  group('Fixtures');
  await cdp.importFile(path.join(CORPUS, 'pg1342-ni.epub'));
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length >= 1`, { timeout: 90000 });
  await cdp.importFile(path.join(CORPUS, 'pg1342.txt'));
  await cdp.waitFor(`document.querySelectorAll('#books-grid .book-card').length >= 2`, { timeout: 90000 });
  check('two books imported', true);

  // The managed folder, resolved through the app rather than guessed.
  const storageDir = (await cdp.eval(`return await window.noveraDesktop.getStoragePath();`)).trim();
  check('managed storage directory is reported', Boolean(storageDir) && fs.existsSync(storageDir), storageDir);

  // ------------------------------------------------- 2A storage information
  group('Storage information');
  const stats = await cdp.eval(`return await Library.getBookStats();`);
  check('book count comes from the database', stats.books === 2, String(stats.books));
  check('formats are counted', Object.keys(stats.byFormat).length === 2, JSON.stringify(stats.byFormat));
  check('recorded bytes are a real measured sum', stats.recordedBytes > 0 && Number.isFinite(stats.recordedBytes), String(stats.recordedBytes));
  check('actual disk usage is measured, not assumed', stats.actualBytes !== null && stats.actualBytes > 0, String(stats.actualBytes));
  check('actual usage matches recorded usage on a healthy library', stats.actualBytes === stats.recordedBytes,
    `${stats.actualBytes} vs ${stats.recordedBytes}`);
  check('managed file count is measured', stats.managedFiles === 2, String(stats.managedFiles));
  check('library location is reported', stats.storageLocation === storageDir, String(stats.storageLocation));
  check('collections counted', stats.collections === 0, String(stats.collections));

  const storageLocationIsHonest = await cdp.eval(`
    const s = await Library.getBookStats();
    return { shown: s.storageLocation, isAbsolute: /^[A-Za-z]:[\\\\/]/.test(String(s.storageLocation || '')) };
  `);
  check('library location is a real absolute path', storageLocationIsHonest.isAbsolute, storageLocationIsHonest.shown);

  // ------------------------------------------- 2B integrity check: healthy
  group('Integrity check on a healthy library');
  const healthy = await cdp.eval(`
    const before = (await NoveraDB.getAllBooks()).map(b => ({ id: b.id, availability: b.availability || null }));
    const report = await Library.runIntegrityCheck();
    const after = (await NoveraDB.getAllBooks()).map(b => ({ id: b.id, availability: b.availability || null }));
    return { report, before, after };
  `, 300000);
  check('check reports it is supported', healthy.report.supported === true);
  check('both books are healthy', healthy.report.healthy.length === 2 && healthy.report.issues === 0,
    `healthy=${healthy.report.healthy.length} issues=${healthy.report.issues}`);
  check('no files are missing', healthy.report.missingFile.length === 0);
  check('no files are damaged', healthy.report.damaged.length === 0);
  check('no orphans on a clean library', healthy.report.orphans.length === 0);
  check('a check writes nothing to the database', JSON.stringify(healthy.before) === JSON.stringify(healthy.after),
    JSON.stringify(healthy.after));

  // ------------------------------------------ 2B integrity: missing file
  group('Integrity check finds a file deleted behind its back');
  const victim = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    const b = books.find(x => x.format === 'epub');
    return { id: b.id, title: b.title, storageId: b.storageId };
  `);
  // Delete the managed file directly, without telling the application.
  fs.unlinkSync(path.join(storageDir, victim.storageId));
  check('managed file removed from disk', !fs.existsSync(path.join(storageDir, victim.storageId)), victim.storageId);

  const missing = await cdp.eval(`return await Library.runIntegrityCheck();`, 300000);
  check('the missing file is detected', missing.missingFile.length === 1 && missing.missingFile[0].id === victim.id,
    JSON.stringify(missing.missingFile.map(b => b.title)));
  check('the missing book is not reported as healthy', !missing.healthy.some(b => b.id === victim.id));
  check('a missing file counts as an issue', missing.issues === 1, String(missing.issues));
  check('the other book is still healthy', missing.healthy.length === 1);
  check('the check still does not write availability flags',
    (await cdp.eval(`const b = await NoveraDB.getBook(${JSON.stringify(victim.id)}); return b.availability || null;`)) === null);

  // ------------------------------------------------------ 2C apply + repair
  group('Recording the result, then repairing');
  const applied = await cdp.eval(`
    const report = await Library.runIntegrityCheck();
    const result = await Library.applyIntegrityReport(report);
    const book = await NoveraDB.getBook(${JSON.stringify(victim.id)});
    const other = (await Library.runIntegrityCheck()).healthy[0];
    const otherBook = await NoveraDB.getBook(other.id);
    return { result, victimAvailability: book.availability || null, otherAvailability: otherBook.availability || null };
  `, 300000);
  check('applying the report marks the book unavailable', applied.victimAvailability === 'unavailable', String(applied.victimAvailability));
  check('applying the report marks healthy books available', applied.otherAvailability === 'available', String(applied.otherAvailability));

  // Put the file back and confirm repair only claims what it truly fixed.
  const originalBuffer = fs.readFileSync(path.join(CORPUS, 'pg1342-ni.epub'));
  fs.writeFileSync(path.join(storageDir, victim.storageId), originalBuffer);
  const repaired = await cdp.eval(`
    const report = await Library.runIntegrityCheck();
    const result = await Library.repairLibrary(report);
    const book = await NoveraDB.getBook(${JSON.stringify(victim.id)});
    return { result, availability: book.availability || null, healthyNow: report.healthy.length };
  `, 300000);
  check('repair restores a book whose file is intact again', repaired.result.repaired === 1, JSON.stringify(repaired.result));
  check('the repaired book is available again', repaired.availability === 'available', String(repaired.availability));

  // A genuinely missing file must never be reported as repaired.
  fs.unlinkSync(path.join(storageDir, victim.storageId));
  const unrepairable = await cdp.eval(`
    const report = await Library.runIntegrityCheck();
    const result = await Library.repairLibrary(report);
    return { result, missing: report.missingFile.length };
  `, 300000);
  check('repair refuses to claim a missing file is fixed', unrepairable.result.repaired === 0, JSON.stringify(unrepairable.result));
  check('a missing file is reported as needing the original', unrepairable.result.notRepairable === 1, String(unrepairable.result.notRepairable));
  fs.writeFileSync(path.join(storageDir, victim.storageId), originalBuffer);

  // ------------------------------------------------------- damaged file
  group('Integrity check detects a corrupted file');
  // Same length, different bytes: only a content hash can catch this.
  const corrupt = Buffer.from(originalBuffer);
  corrupt[Math.floor(corrupt.length / 2)] ^= 0xFF;
  fs.writeFileSync(path.join(storageDir, victim.storageId), corrupt);
  const damaged = await cdp.eval(`return await Library.runIntegrityCheck();`, 300000);
  check('a same-size corruption is caught by the fingerprint', damaged.damaged.length === 1, JSON.stringify(damaged.damaged.map(b => b.detail)));
  check('a damaged book is not counted as healthy', !damaged.healthy.some(b => b.id === victim.id));
  check('the damage is explained', /do not match/i.test(damaged.damaged[0]?.detail || ''), damaged.damaged[0]?.detail);

  // Truncated file: caught by size, without even needing the hash.
  fs.writeFileSync(path.join(storageDir, victim.storageId), originalBuffer.subarray(0, 1000));
  const truncated = await cdp.eval(`return await Library.runIntegrityCheck();`, 300000);
  check('a truncated file is detected', truncated.damaged.length === 1, JSON.stringify(truncated.damaged.map(b => b.detail)));
  check('truncation is explained with both sizes', /Expected .* bytes, found /.test(truncated.damaged[0]?.detail || ''), truncated.damaged[0]?.detail);
  fs.writeFileSync(path.join(storageDir, victim.storageId), originalBuffer);

  // ---------------------------------------------------------- 2D orphans
  group('Orphan detection and cleanup');
  const orphanId = `${'a'.repeat(64)}.epub`;
  const orphanPath = path.join(storageDir, orphanId);
  fs.writeFileSync(orphanPath, Buffer.from('not a real book'));
  const orphanScan = await cdp.eval(`return await Library.runIntegrityCheck();`, 300000);
  check('an unreferenced file is detected as an orphan', orphanScan.orphans.includes(orphanId), JSON.stringify(orphanScan.orphans));
  check('a real book is never reported as an orphan', !orphanScan.orphans.includes(victim.storageId));
  check('an orphan is not counted as a book problem', orphanScan.issues === 0, String(orphanScan.issues));

  // The main process must refuse to delete a referenced file even if asked.
  const refused = await cdp.eval(`
    return await window.noveraDesktop.deleteOrphanFiles([${JSON.stringify(victim.storageId)}], [${JSON.stringify(victim.storageId)}]);
  `);
  check('cleanup refuses to delete a referenced file', refused.removed.length === 0 && refused.skipped[0]?.reason === 'referenced',
    JSON.stringify(refused));

  // Library-level cleanup also re-filters against current references.
  const libraryRefused = await cdp.eval(`return await Library.cleanupOrphans([${JSON.stringify(victim.storageId)}]);`);
  check('library cleanup drops a referenced file from the delete list', libraryRefused.removed.length === 0, JSON.stringify(libraryRefused));
  check('the referenced file still exists on disk', fs.existsSync(path.join(storageDir, victim.storageId)));

  const cleaned = await cdp.eval(`return await Library.cleanupOrphans([${JSON.stringify(orphanId)}]);`, 120000);
  check('an orphan is removed when cleanup is asked', cleaned.removed.includes(orphanId), JSON.stringify(cleaned.removed));
  check('the orphan file is gone from disk', !fs.existsSync(orphanPath));
  check('cleanup did not touch the real book file', fs.existsSync(path.join(storageDir, victim.storageId)));
  const afterCleanup = await cdp.eval(`return (await Library.runIntegrityCheck()).orphans.length;`, 300000);
  check('no orphans remain after cleanup', afterCleanup === 0, String(afterCleanup));

  // Cleanup of nothing must be a no-op, not an error.
  const noop = await cdp.eval(`return await Library.cleanupOrphans([]);`);
  check('cleanup with nothing to do does nothing', noop.removed.length === 0);

  // ------------------------------------------------------- 2E backup
  group('Backup');
  const backup = await cdp.eval(`
    const { document, bytes } = await Library.createMetadataBackup();
    return { document, bytes };
  `, 120000);
  check('backup is versioned', backup.document.format === 'LIRUNE_METADATA_BACKUP' && backup.document.version === 1,
    `${backup.document.format} v${backup.document.version}`);
  check('backup contains both books', backup.document.books.length === 2, String(backup.document.books.length));
  check('backup records what it holds', Array.isArray(backup.document.contents) && backup.document.contents.length === 4,
    JSON.stringify(backup.document.contents));
  check('backup has a real creation date', !Number.isNaN(Date.parse(backup.document.createdAt)), backup.document.createdAt);
  check('backup size is real', backup.bytes > 100, `${backup.bytes} bytes`);

  const backupSample = backup.document.books[0];
  check('book title is preserved', typeof backupSample.title === 'string' && backupSample.title.length > 0, backupSample.title);
  check('book format is preserved', typeof backupSample.format === 'string', backupSample.format);
  check('fingerprint is preserved for duplicate detection', /^[0-9a-f]{64}$/.test(backupSample.fingerprint || ''), String(backupSample.fingerprint).slice(0, 12));
  check('favourites are preserved', typeof backupSample.favorite === 'boolean', String(backupSample.favorite));
  check('collection membership is preserved', Array.isArray(backupSample.collectionIds), JSON.stringify(backupSample.collectionIds));
  check('reading position is preserved', 'progressPercent' in backupSample && 'currentChapter' in backupSample,
    `${backupSample.progressPercent} / ${backupSample.currentChapter}`);

  // ---------------------------------------------- 2G backup security
  group('Backup contents are safe to share');
  const secrets = await cdp.eval(`
    await NoveraDB.setPref('someAuthToken', 'super-secret-value');
    await NoveraDB.setPref('userEmail', 'someone@example.com');
    await NoveraDB.setPref('sessionCookie', 'abc123');
    await NoveraDB.setPref('licenseKey', 'XXXX-YYYY');
    const { document } = await Library.createMetadataBackup();
    return { keys: Object.keys(document.preferences), text: JSON.stringify(document) };
  `, 120000);
  const leaked = ['super-secret-value', 'someone@example.com', 'abc123', 'XXXX-YYYY']
    .filter(needle => secrets.text.includes(needle));
  check('secrets in the preference store are not exported', leaked.length === 0, `leaked: ${JSON.stringify(leaked)}`);
  check('only allow-listed preferences travel', secrets.keys.every(key =>
    ['appTheme', 'readerTheme', 'accentColor', 'readerSettings', 'libraryView', 'appPrefs'].includes(key)),
    JSON.stringify(secrets.keys));

  const noSystemPaths = await cdp.eval(`
    const { document } = await Library.createMetadataBackup();
    const text = JSON.stringify(document);
    return {
      hasUserName: /C:\\\\Users\\\\[^\\\\"]+/.test(text),
      hasAppData: /AppData/i.test(text)
    };
  `);
  check('no user directory paths in the backup', noSystemPaths.hasUserName === false);
  check('no AppData paths in the backup', noSystemPaths.hasAppData === false);
  check('no book file contents in the backup', await cdp.eval(`
    const { document } = await Library.createMetadataBackup();
    return !Object.values(document.books).some(b => b.fileData || b.coverBlob);
  `) === true);

  // -------------------------------------------------------- 2F restore
  group('Restore validation');
  const writeFile = (name, contents) => {
    const p = path.join(WORK, name);
    fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2));
    return p;
  };
  const inspectPath = async file => cdp.eval(`
    const file = new File([${JSON.stringify(fs.readFileSync(file, 'utf8'))}], 'backup.json', { type: 'application/json' });
    const result = await Library.inspectBackupFile(file);
    return { ok: result.ok, error: result.error || null, summary: result.summary || null };
  `, 120000);

  const validFile = writeFile('valid.json', backup.document);
  const valid = await inspectPath(validFile);
  check('a valid backup is accepted', valid.ok === true, valid.error || '');
  check('the summary counts new and existing books', valid.summary.newBooks === 0 && valid.summary.alreadyPresent === 2,
    JSON.stringify(valid.summary));

  const malformed = await inspectPath(writeFile('malformed.json', '{ this is not json'));
  check('malformed JSON is rejected', malformed.ok === false && /not valid JSON/i.test(malformed.error || ''), malformed.error);

  const notABackup = await inspectPath(writeFile('other.json', { hello: 'world' }));
  check('an unrelated JSON file is rejected', notABackup.ok === false && /not a Lirune backup/i.test(notABackup.error || ''), notABackup.error);

  const empty = await inspectPath(writeFile('empty.json', { format: 'LIRUNE_METADATA_BACKUP', version: 1, books: [], annotations: [], collections: [], preferences: {} }));
  check('a valid but empty backup is accepted', empty.ok === true, empty.error || '');
  check('an empty backup reports nothing to add', empty.summary.newBooks === 0 && empty.summary.books === 0, JSON.stringify(empty.summary));

  // Version 2 is genuinely newer than this build, so it must be refused with
  // the "update first" reason. A version below 1 is the unsupported case.
  const futureVersion = await inspectPath(writeFile('future.json', { ...backup.document, version: 99 }));
  check('a newer backup version is rejected with a clear reason', futureVersion.ok === false && /newer version/i.test(futureVersion.error || ''), futureVersion.error);

  const oldVersion = await inspectPath(writeFile('v0.json', { ...backup.document, version: 0 }));
  check('an unsupported version is rejected', oldVersion.ok === false && /unsupported backup format/i.test(oldVersion.error || ''), oldVersion.error);

  const nextVersion = await inspectPath(writeFile('v2.json', { ...backup.document, version: 2 }));
  check('the next version up is refused as needing an update', nextVersion.ok === false && /newer version/i.test(nextVersion.error || ''), nextVersion.error);

  const missingSections = await inspectPath(writeFile('nosections.json', { format: 'LIRUNE_METADATA_BACKUP', version: 1 }));
  check('a backup missing its books section is rejected', missingSections.ok === false, missingSections.error);

  const legacy = await inspectPath(writeFile('legacy.json', { format: 'NOVERA_METADATA_BACKUP', version: 1, books: [], annotations: [] }));
  check('an old-brand backup is identified, not silently accepted', legacy.ok === false && /older version/i.test(legacy.error || ''), legacy.error);

  const array = await inspectPath(writeFile('array.json', [1, 2, 3]));
  check('a JSON array is rejected', array.ok === false, array.error);

  // ------------------------------------------------ restore behaviour
  group('Restore merges without destroying anything');
  // Mark the books so we can prove existing data survives a restore.
  await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    await NoveraDB.updateFavorite(books[0].id, true);
    await NoveraDB.updateBookMetadata(books[0].id, { currentChapter: 'Local progress marker' });
    return true;
  `);
  const beforeRestore = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    return { count: books.length, ids: books.map(b => b.id).sort(), fav: books.filter(b => b.favorite).map(b => b.id) };
  `);

  // A backup that contains one brand-new book plus the two existing ones.
  const restoreDoc = {
    ...backup.document,
    books: [
      ...backup.document.books,
      {
        id: 'restored-book-1',
        title: 'Restored From Backup',
        author: 'Backup Author',
        description: '',
        format: 'epub',
        originalName: 'restored.epub',
        fileSize: 1234,
        fingerprint: 'b'.repeat(64),
        storageId: null,
        schemaVersion: 3,
        chapterCount: 3,
        coverDataUrl: null,
        favorite: false,
        collectionIds: [],
        dateAdded: 1700000000000,
        lastReadDate: 0,
        currentCfi: null,
        progressPercent: 42,
        currentChapter: 'Chapter Nine',
        availability: 'available'
      }
    ]
  };
  const restoreFile = writeFile('restore.json', restoreDoc);
  const restoreResult = await cdp.eval(`
    const file = new File([${JSON.stringify(fs.readFileSync(restoreFile, 'utf8'))}], 'backup.json', { type: 'application/json' });
    const inspection = await Library.inspectBackupFile(file);
    if (!inspection.ok) return { error: inspection.error };
    const result = await Library.applyBackup(inspection, { includePreferences: true });
    const books = await NoveraDB.getAllBooks();
    return {
      result,
      count: books.length,
      ids: books.map(b => b.id).sort(),
      restored: books.find(b => b.id === 'restored-book-1') || null,
      favStillSet: books.filter(b => b.favorite).map(b => b.id)
    };
  `, 180000);
  check('restore adds only the new book', restoreResult.result.booksAdded === 1 && restoreResult.result.booksSkipped === 2,
    JSON.stringify(restoreResult.result));
  check('the library gained exactly one book', restoreResult.count === beforeRestore.count + 1, `${beforeRestore.count} -> ${restoreResult.count}`);
  check('existing books are untouched', JSON.stringify(restoreResult.ids) === JSON.stringify([...beforeRestore.ids, 'restored-book-1'].sort()),
    JSON.stringify(restoreResult.ids));
  check('existing favourites survive a restore', restoreResult.favStillSet.length === 1 && restoreResult.favStillSet[0] === beforeRestore.fav[0],
    JSON.stringify(restoreResult.favStillSet));
  check('a restored book keeps its reading position', restoreResult.restored?.progressPercent === 42 && restoreResult.restored?.currentChapter === 'Chapter Nine',
    `${restoreResult.restored?.progressPercent} / ${restoreResult.restored?.currentChapter}`);
  check('a restored book is marked as needing its file', restoreResult.restored?.availability === 'needs-file', String(restoreResult.restored?.availability));

  const localProgressKept = await cdp.eval(`
    const books = await NoveraDB.getAllBooks();
    return books.find(b => b.currentChapter === 'Local progress marker') ? 'kept' : 'lost';
  `);
  check('local reading progress is not overwritten by the backup', localProgressKept === 'kept', localProgressKept);

  // Restoring the same backup twice must not duplicate anything.
  const secondRestore = await cdp.eval(`
    const file = new File([${JSON.stringify(fs.readFileSync(restoreFile, 'utf8'))}], 'backup.json', { type: 'application/json' });
    const inspection = await Library.inspectBackupFile(file);
    const result = await Library.applyBackup(inspection, { includePreferences: false });
    return { result, count: (await NoveraDB.getAllBooks()).length };
  `, 180000);
  check('restoring the same backup twice adds nothing', secondRestore.result.booksAdded === 0 && secondRestore.count === restoreResult.count,
    `${secondRestore.result.booksAdded} added, ${secondRestore.count} books`);
  check('duplicate books are detected by fingerprint', secondRestore.result.booksSkipped === 3, String(secondRestore.result.booksSkipped));

  // Restored metadata must not be claimed as readable.
  const restoredOpenable = await cdp.eval(`
    const book = (await NoveraDB.getAllBooks()).find(b => b.id === 'restored-book-1');
    return { availability: book.availability, hasStorage: !!book.storageId };
  `);
  check('a restored book is not presented as readable', restoredOpenable.availability === 'needs-file' && !restoredOpenable.hasStorage,
    JSON.stringify(restoredOpenable));

  // The integrity check must treat a file-less restored record honestly: it is
  // neither healthy nor a missing file, because nothing was ever lost.
  const afterRestoreCheck = await cdp.eval(`
    const report = await Library.runIntegrityCheck();
    const restored = report.noFile.find(b => b.id === 'restored-book-1');
    return {
      noFile: report.noFile.map(b => b.id),
      missing: report.missingFile.length,
      healthy: report.healthy.map(b => b.id),
      migration: report.needsMigration.length,
      issues: report.issues,
      restoredFound: !!restored
    };
  `, 300000);
  check('a restored metadata-only book is reported as having no file', afterRestoreCheck.restoredFound === true,
    JSON.stringify(afterRestoreCheck.noFile));
  check('a restored metadata-only book is not counted as healthy', !afterRestoreCheck.healthy.includes('restored-book-1'),
    JSON.stringify(afterRestoreCheck.healthy));
  check('a restored metadata-only book is not reported as a missing file', afterRestoreCheck.missing === 0, String(afterRestoreCheck.missing));
  check('a restored metadata-only book is not counted as corruption', afterRestoreCheck.issues === 0, String(afterRestoreCheck.issues));

  console.log('\n=== app console errors ===');
  if (cdp.errors.length === 0) console.log('  none');
  else cdp.errors.slice(0, 5).forEach(e => console.log('  ' + e.split('\n')[0]));
} catch (err) {
  check('storage suite', false, err.message);
  console.error(err);
} finally {
  console.log(`\n${pass}/${pass + failures.length} passed`);
  if (failures.length) console.log(`FAILURES:\n  ${failures.map(f => `[${f}]`).join('\n  ')}`);
  await shutdown(cdp);
}
process.exit(failures.length ? 1 : 0);
