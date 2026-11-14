const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const {
  fingerprintBuffer,
  storageIdForFingerprint,
  isStorageId,
  SUPPORTED_EXTENSIONS
} = require('../../scripts/storage-contract');

test('Storage Persistence - Real Disk Storage Lifecycle & Deduplication', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lirune-storage-test-'));

  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const bookAContent = Buffer.from('Chapter 1: The First Story\n\nOnce upon a time in a digital library...');
  const bookBContent = Buffer.from('Chapter 1: The Second Story\n\nA completely different tale.');

  // 1. Compute fingerprints
  const fpA = fingerprintBuffer(bookAContent);
  const fpB = fingerprintBuffer(bookBContent);
  assert.notEqual(fpA, fpB, 'Different contents must produce different SHA-256 fingerprints');

  // 2. Generate storage IDs
  const storageIdA = storageIdForFingerprint(fpA, 'epub');
  const storageIdB = storageIdForFingerprint(fpB, 'pdf');
  assert.equal(isStorageId(storageIdA), true);
  assert.equal(isStorageId(storageIdB), true);
  assert.ok(storageIdA.endsWith('.epub'));
  assert.ok(storageIdB.endsWith('.pdf'));

  // 3. Write files to managed storage directory
  const filePathA = path.join(tempDir, storageIdA);
  const filePathB = path.join(tempDir, storageIdB);
  fs.writeFileSync(filePathA, bookAContent);
  fs.writeFileSync(filePathB, bookBContent);

  assert.equal(fs.existsSync(filePathA), true);
  assert.equal(fs.existsSync(filePathB), true);

  // 4. Read back and verify exact byte matching
  const readBackA = fs.readFileSync(filePathA);
  assert.deepEqual(readBackA, bookAContent, 'Read bytes must match written bytes');
  assert.equal(fingerprintBuffer(readBackA), fpA, 'Fingerprint of read file must match original');

  // 5. Deduplication check: storing identical content again yields same storage ID
  const duplicateA = Buffer.from('Chapter 1: The First Story\n\nOnce upon a time in a digital library...');
  const fpDup = fingerprintBuffer(duplicateA);
  const storageIdDup = storageIdForFingerprint(fpDup, 'epub');
  assert.equal(storageIdDup, storageIdA, 'Identical content must reuse existing storage ID');

  // 6. Delete file from storage
  fs.unlinkSync(filePathA);
  assert.equal(fs.existsSync(filePathA), false, 'Deleted file must be removed from storage');
  assert.equal(fs.existsSync(filePathB), true, 'Unrelated files must remain untouched');
});

test('Storage Persistence - Tamper Detection and Integrity Verification', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lirune-tamper-test-'));

  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const originalContent = Buffer.from('Sensitive Document Content');
  const fp = fingerprintBuffer(originalContent);
  const storageId = storageIdForFingerprint(fp, 'docx');
  const targetFile = path.join(tempDir, storageId);

  fs.writeFileSync(targetFile, originalContent);

  // Verify initial integrity
  let onDisk = fs.readFileSync(targetFile);
  assert.equal(fingerprintBuffer(onDisk), fp);

  // Simulate file tampering / bit-rot
  fs.writeFileSync(targetFile, Buffer.from('Tampered Document Content'));
  const tamperedOnDisk = fs.readFileSync(targetFile);
  const tamperedFp = fingerprintBuffer(tamperedOnDisk);

  assert.notEqual(tamperedFp, fp, 'Tampered file must fail fingerprint verification');
});

test('Storage Persistence - Extension Allowlist and Boundary Rejections', () => {
  const sampleFp = crypto.randomBytes(32).toString('hex');

  // Every claimed extension in SUPPORTED_EXTENSIONS must be accepted
  for (const ext of SUPPORTED_EXTENSIONS) {
    const id = storageIdForFingerprint(sampleFp, ext);
    assert.equal(isStorageId(id), true, `Extension "${ext}" must be recognized as valid storage ID`);
  }

  // Dangerous or unapproved extensions must be rejected
  const maliciousExtensions = ['exe', 'bat', 'sh', 'dll', 'cmd', 'ps1', 'vbs', 'bin', 'msi', 'reg'];
  for (const badExt of maliciousExtensions) {
    assert.throws(
      () => storageIdForFingerprint(sampleFp, badExt),
      /Unsupported/,
      `Dangerous extension "${badExt}" must be refused by storage contract`
    );
  }

  // Path traversal storage IDs must be rejected by isStorageId
  assert.equal(isStorageId('../evil.epub'), false);
  assert.equal(isStorageId('..\\evil.pdf'), false);
  assert.equal(isStorageId('/root/book.epub'), false);
  assert.equal(isStorageId('C:\\Windows\\book.epub'), false);
});

