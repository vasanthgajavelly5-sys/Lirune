import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { inlineEpubCss } from '../services/epub/inlineCss.ts';

test('EPUB CSS embeds local resources and drops imports and remote URLs', async () => {
  const zip = new JSZip();
  zip.file('EPUB/Fonts/Reader.woff', new Uint8Array([0, 1, 2]));
  zip.file('EPUB/Images/paper.png', new Uint8Array([3, 4]));

  const css = await inlineEpubCss(
    '@import url(https://example.invalid/remote.css);' +
      '@font-face{font-family:Reader;src:url("../Fonts/Reader.woff")}' +
      'body{background:url(../Images/paper.png)}' +
      'p{background:url(https://example.invalid/pixel.png)}',
    'EPUB/Styles/book.css',
    zip
  );

  assert.match(css, /font\/woff;base64,AAEC/);
  assert.match(css, /image\/png;base64,AwQ=/);
  assert.doesNotMatch(css, /@import|example\.invalid/);
});

test('EPUB CSS removes active style constructs', async () => {
  const css = await inlineEpubCss(
    'p{width:expression(alert(1));behavior:url(x);-moz-binding:url(x);background:url(javascript:alert(1))}',
    'chapter.css',
    new JSZip()
  );

  assert.doesNotMatch(css, /expression|behavior|-moz-binding|javascript:/i);
});
