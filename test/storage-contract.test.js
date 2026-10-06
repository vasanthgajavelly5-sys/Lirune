const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprintBuffer, storageIdForFingerprint, isStorageId } = require('../scripts/storage-contract');

test('fingerprint and storage identity are content based', () => {
  const first = fingerprintBuffer(Buffer.from('same filename, different content'));
  const second = fingerprintBuffer(Buffer.from('different content'));
  assert.notEqual(first, second);
  assert.equal(storageIdForFingerprint(first), `${first}.epub`);
  assert.equal(isStorageId(`${first}.epub`), true);
  assert.equal(isStorageId('550e8400-e29b-41d4-a716-446655440000.epub'), true);
  assert.equal(isStorageId('book.epub'), false);
});

test('invalid storage identities are rejected', () => {
  assert.throws(() => storageIdForFingerprint('weak-name'), /fingerprint/);
  assert.equal(isStorageId('../book.epub'), false);
  assert.equal(isStorageId(`${'a'.repeat(64)}.EPUB`), true);
});

test('managed storage keeps the real format extension', () => {
  const fingerprint = fingerprintBuffer(Buffer.from('a pdf'));
  assert.equal(storageIdForFingerprint(fingerprint, 'pdf'), `${fingerprint}.pdf`);
  assert.equal(storageIdForFingerprint(fingerprint, 'cbz'), `${fingerprint}.cbz`);
  assert.equal(storageIdForFingerprint(fingerprint, 'docx'), `${fingerprint}.docx`);
  assert.equal(isStorageId(`${fingerprint}.cbz`), true);
  assert.equal(isStorageId(`${fingerprint}.docx`), true);
  assert.equal(isStorageId(`${fingerprint}.html`), true);
  assert.equal(isStorageId(`${fingerprint}.fb2`), true);
});

test('unsupported or unsafe storage extensions are refused', () => {
  const fingerprint = fingerprintBuffer(Buffer.from('a rar comic'));
  assert.throws(() => storageIdForFingerprint(fingerprint, 'cbr'), /Unsupported/);
  assert.throws(() => storageIdForFingerprint(fingerprint, '../evil'), /Unsupported/);
  assert.equal(isStorageId(`${fingerprint}.cbr`), false);
  assert.equal(isStorageId(`${fingerprint}.exe`), false);
  assert.equal(isStorageId(`${fingerprint}.epub.exe`), false);
});
