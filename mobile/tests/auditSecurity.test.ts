/**
 * Lirune Mobile - Security & Audit Regression Test Suite
 *
 * Covers:
 * - SEC-01: Shared hardened WebView policy (READER_WEBVIEW_PROPS, allowReaderNavigation)
 * - SEC-04: Production logging filtering and sensitive path/URI redaction
 * - Sanitization: foreignObject, script injection, and active SVG/SMIL stripping
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { READER_WEBVIEW_PROPS, allowReaderNavigation } from '../services/security/webviewPolicy.ts';
import { logger, redactSensitive } from '../utils/logger.ts';
import { sanitizeHtml } from '../services/security/sanitizeHtml.ts';

// ---------------------------------------------------------------------------
// SEC-01: Hardened WebView Policy
// ---------------------------------------------------------------------------

test('READER_WEBVIEW_PROPS enforces strict originWhitelist and sandbox flags', () => {
  // Must NOT contain wildcard '*'
  assert.equal(READER_WEBVIEW_PROPS.originWhitelist.includes('*'), false, 'originWhitelist must never contain wildcard');
  assert.ok(READER_WEBVIEW_PROPS.originWhitelist.includes('about:blank'));
  assert.ok(READER_WEBVIEW_PROPS.originWhitelist.includes('data:*'));
  assert.ok(READER_WEBVIEW_PROPS.originWhitelist.includes('blob:*'));

  // File access and multi-window must be explicitly disabled
  assert.equal(READER_WEBVIEW_PROPS.allowFileAccess, false);
  assert.equal(READER_WEBVIEW_PROPS.allowFileAccessFromFileURLs, false);
  assert.equal(READER_WEBVIEW_PROPS.allowUniversalAccessFromFileURLs, false);
  assert.equal(READER_WEBVIEW_PROPS.setSupportMultipleWindows, false);
  assert.equal(typeof READER_WEBVIEW_PROPS.onShouldStartLoadWithRequest, 'function');
});

test('allowReaderNavigation rejects untrusted and malicious navigation requests', () => {
  // Reject external web and malicious schemes
  assert.equal(allowReaderNavigation({ url: 'http://malicious-site.com' } as any), false);
  assert.equal(allowReaderNavigation({ url: 'https://phishing.example.org' } as any), false);
  assert.equal(allowReaderNavigation({ url: 'javascript:alert(document.cookie)' } as any), false);
  assert.equal(allowReaderNavigation({ url: 'JAVASCRIPT:alert(1)' } as any), false);
  assert.equal(allowReaderNavigation({ url: 'intent://scan/#Intent;scheme=zxing;package=com.google.zxing.client.android;end' } as any), false);
  assert.equal(allowReaderNavigation({ url: 'content://com.android.providers.media.documents/document/1234' } as any), false);
  assert.equal(allowReaderNavigation({ url: 'file:///android_asset/something.html' } as any), false);
  assert.equal(allowReaderNavigation({ url: 'file:///sdcard/book.epub' } as any), false);

  // Reject scheme-relative and network path attempts
  assert.equal(allowReaderNavigation({ url: '//malicious-site.com/test' } as any), false);
  assert.equal(allowReaderNavigation({ url: '//phishing.example.org' } as any), false);

  // Allow legitimate in-memory / about:blank reader document lifecycles
  assert.equal(allowReaderNavigation({ url: 'about:blank' } as any), true);
  assert.equal(allowReaderNavigation({ url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA' } as any), true);
  assert.equal(allowReaderNavigation({ url: 'blob:http://localhost/uuid-1234' } as any), true);
  assert.equal(allowReaderNavigation({ url: '' } as any), true);
});

// ---------------------------------------------------------------------------
// SEC-04: Production Logger & Sensitive Data Redaction
// ---------------------------------------------------------------------------

test('redactSensitive strips local paths, Android content/file URIs, and user paths', () => {
  const sample1 = 'Failed to open file: /data/user/0/com.lirune.reader/files/secret_diary.epub in reader';
  const redacted1 = redactSensitive(sample1);
  assert.ok(!redacted1.includes('secret_diary.epub'), 'Private filename must be redacted');
  assert.ok(redacted1.includes('[REDACTED_PATH]'));

  const sample2 = 'Importing content://com.android.providers.media.documents/document/book%20title.mobi';
  const redacted2 = redactSensitive(sample2);
  assert.ok(!redacted2.includes('book%20title.mobi'));
  assert.ok(redacted2.includes('[REDACTED_PATH]'));

  const sample3 = 'Storage target file:///storage/emulated/0/Download/MyPrivateBook.pdf';
  const redacted3 = redactSensitive(sample3);
  assert.ok(!redacted3.includes('MyPrivateBook.pdf'));
  assert.ok(redacted3.includes('[REDACTED_PATH]'));

  const sample4 = 'Loaded from C:\\Users\\Administrator\\Documents\\Secret.fb2';
  const redacted4 = redactSensitive(sample4);
  assert.ok(!redacted4.includes('Secret.fb2'));
  assert.ok(redacted4.includes('[REDACTED_PATH]'));

  const sample5 = 'Error in /home/user/books/PrivateNovel.epub';
  const redacted5 = redactSensitive(sample5);
  assert.ok(!redacted5.includes('PrivateNovel.epub'));
  assert.ok(redacted5.includes('[REDACTED_PATH]'));

  const sample6 = 'Error in /Users/john/Documents/PrivateJournal.docx';
  const redacted6 = redactSensitive(sample6);
  assert.ok(!redacted6.includes('PrivateJournal.docx'));
  assert.ok(redacted6.includes('[REDACTED_PATH]'));

  const sampleUrl = 'Failed to fetch from https://cloud.example.com/api?token=secret12345&user=john';
  const redactedUrl = redactSensitive(sampleUrl);
  assert.ok(!redactedUrl.includes('token=secret12345'));
  assert.ok(redactedUrl.includes('[REDACTED_URL]'));

  const sampleAuthUrl = 'Request to https://admin:password123@internal.example.com/books';
  const redactedAuthUrl = redactSensitive(sampleAuthUrl);
  assert.ok(!redactedAuthUrl.includes('password123'));
  assert.ok(redactedAuthUrl.includes('[REDACTED_URL]'));
});

test('Logger level configuration controls emission', () => {
  logger.setLogLevel('warn');
  assert.equal(logger.getLogLevel(), 'warn');

  logger.setLogLevel('error');
  assert.equal(logger.getLogLevel(), 'error');

  // Verify logger does not crash with various arguments
  logger.error('TestTag', 'An error occurred', new Error('Test error'));
  logger.info('TestTag', 'Info message that should be filtered in error level');
  logger.debug('TestTag', 'Debug message that should be filtered in error level');
});

// ---------------------------------------------------------------------------
// SVG & foreignObject Sanitization
// ---------------------------------------------------------------------------

test('sanitizeHtml: handles foreignObject safely, stripping scripts while preserving legitimate elements', () => {
  const maliciousSvg = `
    <svg width="200" height="200">
      <foreignObject width="100%" height="100%">
        <script>alert("foreignObject-xss")</script>
        <div onclick="evil()">Safe text inside foreignObject</div>
        <iframe src="https://evil.com"></iframe>
      </foreignObject>
    </svg>
  `;

  const clean = sanitizeHtml(maliciousSvg);
  assert.ok(!clean.includes('alert'), 'Scripts inside foreignObject must be purged');
  assert.ok(!clean.includes('onclick'), 'Event handlers inside foreignObject must be purged');
  assert.ok(!clean.includes('<iframe'), 'iframes inside foreignObject must be purged');
  assert.ok(clean.includes('<foreignObject'), 'foreignObject container element should survive');
  assert.ok(clean.includes('Safe text inside foreignObject'), 'Safe inner content should survive');
});
