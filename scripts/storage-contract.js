const crypto = require('crypto');

const SUPPORTED_EXTENSIONS = ['epub', 'pdf', 'txt', 'html', 'htm', 'fb2', 'cbz', 'docx'];
const EXTENSION_PATTERN = SUPPORTED_EXTENSIONS.join('|');

function fingerprintBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function storageIdForFingerprint(fingerprint, extension = 'epub') {
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error('Invalid book fingerprint');
  const ext = String(extension || 'epub').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!SUPPORTED_EXTENSIONS.includes(ext)) throw new Error('Unsupported managed storage extension');
  return `${fingerprint.toLowerCase()}.${ext}`;
}

function isStorageId(value) {
  if (typeof value !== 'string') return false;
  return new RegExp(`^[a-f0-9-]{16,80}\\.(?:${EXTENSION_PATTERN})$`, 'i').test(value);
}

module.exports = { fingerprintBuffer, storageIdForFingerprint, isStorageId, SUPPORTED_EXTENSIONS };
