const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
globalThis.DOMParser = DOMParser;
globalThis.XMLSerializer = XMLSerializer;

const docAdapterSrc = fs.readFileSync(path.join(__dirname, '../../js/reader/documentAdapter.js'), 'utf8');
const docModule = new Function(`
  const DOMParser = globalThis.DOMParser;
  const XMLSerializer = globalThis.XMLSerializer;
  ${docAdapterSrc}
  return DocumentAdapter;
`)();

const Utils = require('../../js/utils');

test('Document Sanitization - Script and Hostile Tag Stripping', () => {
  const hostileHtml = `
    <div>
      <script>alert("pwned")</script>
      <p>Legitimate paragraph content.</p>
      <iframe src="https://evil.com"></iframe>
      <object data="malware.swf"></object>
      <embed src="exploit.pdf"></embed>
      <svg><foreignObject><script>evil()</script></foreignObject></svg>
      <math><mi>x</mi></math>
    </div>
  `;

  const clean = docModule.sanitizeHtml(hostileHtml);
  assert.ok(!clean.includes('<script'), 'Must not contain script tags');
  assert.ok(!clean.includes('alert("pwned")'), 'Must strip script contents');
  assert.ok(!clean.includes('<iframe'), 'Must strip iframe tags');
  assert.ok(!clean.includes('<object'), 'Must strip object tags');
  assert.ok(!clean.includes('<embed'), 'Must strip embed tags');
  assert.ok(!clean.includes('<svg'), 'Must strip svg tags');
  assert.ok(!clean.includes('<foreignObject'), 'Must strip foreignObject tags');
  assert.ok(!clean.includes('<math'), 'Must strip math tags');
  assert.ok(clean.includes('Legitimate paragraph content.'), 'Must preserve safe paragraph text');
});

test('Document Sanitization - Inline Event Handlers and Protocol Exploits', () => {
  const payload = `
    <div>
      <a href="javascript:alert(1)" onclick="stealCookies()">Evil link</a>
      <img src="file:///C:/passwords.txt" onerror="sendTokens()" />
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" alt="dot" />
      <p>Clean text</p>
    </div>
  `;

  const clean = docModule.sanitizeHtml(payload);
  assert.ok(!clean.includes('onclick='), 'Must strip onclick attributes');
  assert.ok(!clean.includes('onerror='), 'Must strip onerror attributes');
  assert.ok(!clean.includes('javascript:'), 'Must neutralize javascript: URI');
  assert.ok(!clean.includes('file:///'), 'Must strip file: image source');
  assert.ok(clean.includes('data:image/png;base64,'), 'Must preserve valid raster data URI');
  assert.ok(clean.includes('Clean text'), 'Must preserve safe text');
});

test('Document Sanitization - Attribute Escaping & Cover URL Strictness', () => {
  // Test Utils.escapeAttr
  const dirtyAttr = 'title" onfocus="alert(1)" data-x=\'<script> & " \'';
  const escaped = Utils.escapeAttr(dirtyAttr);
  assert.ok(!escaped.includes('"'), 'Double quotes must be escaped');
  assert.ok(!escaped.includes('<'), '< must be escaped');
  assert.ok(!escaped.includes('>'), '> must be escaped');

  // Test Utils.sanitizeCoverUrl
  assert.equal(Utils.sanitizeCoverUrl('javascript:alert(1)'), null, 'Must reject javascript: covers');
  assert.equal(Utils.sanitizeCoverUrl('http://insecure.com/cover.jpg'), null, 'Must reject insecure http covers');
  assert.equal(Utils.sanitizeCoverUrl('https://remote.com/cover.jpg'), null, 'Must reject external remote URLs to protect reader privacy');
  assert.equal(Utils.sanitizeCoverUrl('file:///C:/secret.png'), null, 'Must reject file: scheme');
  assert.equal(Utils.sanitizeCoverUrl('data:text/html;base64,123'), null, 'Must reject non-image data URIs');
  assert.equal(Utils.sanitizeCoverUrl('data:image/svg+xml;base64,PHN2Zz4='), null, 'Must reject SVG covers');

  // Valid base64 raster images
  const validJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const validPng = 'data:image/png;base64,iVBORw0KGgo==';
  assert.equal(Utils.sanitizeCoverUrl(validJpeg), validJpeg);
  assert.equal(Utils.sanitizeCoverUrl(validPng), validPng);
});
