import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { inlineEpubCss } from '../services/epub/inlineCss.ts';
import { EpubArchive } from '../services/epub/archive.ts';

async function archiveFrom(zip: JSZip): Promise<EpubArchive> {
  return EpubArchive.open(await zip.generateAsync({ type: 'arraybuffer' }));
}

test('EPUB CSS embeds local resources and drops remote URLs', async () => {
  const zip = new JSZip();
  zip.file('EPUB/Fonts/Reader.woff', new Uint8Array([0, 1, 2]));
  zip.file('EPUB/Images/paper.png', new Uint8Array([3, 4]));
  const archive = await archiveFrom(zip);

  const css = await inlineEpubCss(
    '@import url(https://example.invalid/remote.css);' +
      '@font-face{font-family:Reader;src:url("../Fonts/Reader.woff")}' +
      'section{background:url(../Images/paper.png)}' +
      'p{background:url(https://example.invalid/pixel.png)}',
    'EPUB/Styles/book.css',
    archive
  );

  assert.match(css, /font\/woff;base64,AAEC/);
  assert.match(css, /image\/png;base64,AwQ=/);
  assert.doesNotMatch(css, /@import|example\.invalid/);
});

test('a book page background never repaints the reader theme', async () => {
  const zip = new JSZip();
  zip.file('EPUB/Images/paper.png', new Uint8Array([3, 4]));
  const archive = await archiveFrom(zip);

  const css = await inlineEpubCss(
    'body,html{background:#fff url(../Images/paper.png) no-repeat;background-color:#111}',
    'EPUB/Styles/book.css',
    archive
  );

  assert.doesNotMatch(css, /paper\.png/);
  assert.doesNotMatch(css, /#111|#fff/);
});

test('EPUB CSS removes active style constructs', async () => {
  const css = await inlineEpubCss(
    'p{width:expression(alert(1));behavior:url(x);-moz-binding:url(x);background:url(javascript:alert(1))}',
    'chapter.css',
    await archiveFrom(new JSZip())
  );

  assert.doesNotMatch(css, /expression|behavior|-moz-binding|javascript:/i);
});

test('@import chains are inlined in cascade order and deduplicated', async () => {
  const zip = new JSZip();
  zip.file('OEBPS/css/base.css', '.base{color:red}');
  zip.file('OEBPS/css/theme.css', '@import url("base.css");.theme{color:blue}');
  zip.file('OEBPS/css/print.css', '.print-only{display:none}');
  const archive = await archiveFrom(zip);

  const css = await inlineEpubCss(
    '@import "css/theme.css";\n.main{color:green}\n@import url("css/theme.css");',
    'OEBPS/main.css',
    archive
  );

  // base.css must land inside theme.css, before theme's own rule…
  const baseAt = css.indexOf('.base');
  const themeAt = css.indexOf('.theme');
  const mainAt = css.indexOf('.main');
  assert.ok(baseAt >= 0 && themeAt > baseAt, 'nested import precedes its importer rule');
  assert.ok(mainAt > themeAt, 'the import keeps its original cascade position');
  // …and the repeated import is emitted only once.
  assert.equal(css.split('.theme').length - 1, 1);
});

test('@import cycles terminate instead of recursing forever', async () => {
  const zip = new JSZip();
  zip.file('OEBPS/a.css', '@import "b.css";.a{}');
  zip.file('OEBPS/b.css', '@import "a.css";.b{}');
  const archive = await archiveFrom(zip);

  const css = await inlineEpubCss('@import "a.css";', 'OEBPS/main.css', archive);

  assert.match(css, /\.a\{\}/);
  assert.match(css, /\.b\{\}/);
});

test('@import media conditions are preserved', async () => {
  const zip = new JSZip();
  zip.file('OEBPS/print.css', '.x{color:#000}');
  const archive = await archiveFrom(zip);

  const css = await inlineEpubCss('@import url("print.css") print and (min-width:100px);', 'OEBPS/main.css', archive);

  assert.match(css, /@media print and \(min-width:100px\)/);
  assert.match(css, /\.x\{/);
});

test('@font-face descriptors survive while the font is embedded', async () => {
  const zip = new JSZip();
  zip.file('OEBPS/fonts/book.woff2', new Uint8Array([9, 9, 9]));
  const archive = await archiveFrom(zip);

  const css = await inlineEpubCss(
    '@font-face{font-family:"BookFont";font-style:italic;font-weight:600 800;font-stretch:condensed;' +
      'unicode-range:U+0025-00FF;src:url(../fonts/book.woff2) format("woff2"),local(Arial)}',
    'OEBPS/style/main.css',
    archive
  );

  assert.match(css, /font-family:"BookFont"/);
  assert.match(css, /font-style:italic/);
  assert.match(css, /font-weight:600 800/);
  assert.match(css, /font-stretch:condensed/);
  assert.match(css, /unicode-range:U\+0025-00FF/);
  assert.match(css, /font\/woff2;base64,/);
  assert.match(css, /local\(Arial\)/);
});

test('fragment url() references and inline data URIs are never rewritten', async () => {
  const archive = await archiveFrom(new JSZip());
  const css = await inlineEpubCss(
    '.a{fill:url(#gradient)}' +
      '.b{background:url("data:image/png;base64,AAAA")}' +
      '.c{background:url(blob:https://example.invalid/xyz)}',
    'OEBPS/main.css',
    archive
  );

  assert.match(css, /fill:url\(#gradient\)|fill:url\("#gradient"\)/);
  assert.match(css, /data:image\/png;base64,AAAA/);
  assert.doesNotMatch(css, /blob:/);
});

test('book CSS cannot terminate the reader style element', async () => {
  const archive = await archiveFrom(new JSZip());
  const css = await inlineEpubCss('.x::after{content:"</style><script>alert(1)</script>"}', 'OEBPS/main.css', archive);

  assert.doesNotMatch(css, /<style/i);
  assert.doesNotMatch(css, /<script/i);
});

test('publisher typography survives while container geometry is neutralised', async () => {
  const archive = await archiveFrom(new JSZip());
  const css = await inlineEpubCss(
    'body{margin:0 auto;background:#fff;position:fixed;page-break-before:always}' +
      '.dropcap::first-letter{float:left;font-size:3em}' +
      'blockquote{text-indent:0;margin-left:2em;line-height:1.4}' +
      'p+p{text-indent:1.5em;text-align:justify}',
    'OEBPS/main.css',
    archive
  );

  assert.match(css, /\.epub-content\{/);
  assert.doesNotMatch(css, /\.epub-content\{[^}]*position/m);
  assert.doesNotMatch(css, /\.epub-content\{[^}]*background/m);
  assert.match(css, /::first-letter\{float:left;font-size:3em;\}/);
  assert.match(css, /blockquote\{[^}]*text-indent:0/);
  assert.match(css, /p\+p\{[^}]*text-align:justify/);
});

test('pagination hints on content are preserved, not stripped', async () => {
  const archive = await archiveFrom(new JSZip());
  const css = await inlineEpubCss(
    'h2.chapter{page-break-before:always;break-before:page}' +
      '.scene{page-break-inside:avoid;break-inside:avoid}',
    'OEBPS/main.css',
    archive
  );

  assert.match(css, /page-break-before:always/);
  assert.match(css, /break-inside:avoid/);
});

test('conditional group rules keep their media query', async () => {
  const archive = await archiveFrom(new JSZip());
  const css = await inlineEpubCss('@media print{body{color:#000}p{display:none}}', 'OEBPS/main.css', archive);

  assert.match(css, /@media print\{/);
  assert.match(css, /\.epub-content\{color:#000;\}/);
});

test('a malformed stylesheet is processed without hanging', async () => {
  const archive = await archiveFrom(new JSZip());
  const hostile = '@import "a.css";'.repeat(200) + 'p{color:red}' + '{'.repeat(500);
  const started = Date.now();
  const css = await inlineEpubCss(hostile, 'OEBPS/main.css', archive);
  assert.ok(Date.now() - started < 5000, 'processing must stay bounded');
  assert.match(css, /p\{color:red;\}/);
});