import { launch, shutdown, sleep } from '../../qa/cdp.mjs';
import JSZip from 'jszip';

console.log('================================================================');
console.log('      LIRUNE READER ADAPTER-LEVEL FORMAT & SETTINGS TESTS       ');
console.log('================================================================\n');

const cdp = await launch({ freshUserData: true });

async function buildFixtures() {
  const dotPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

  // DOCX
  const docxZip = new JSZip();
  docxZip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  docxZip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  docxZip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Chapter 1: The Word Journey</w:t></w:r></w:p><w:p><w:r><w:t>Expected DOCX narrative body text.</w:t></w:r></w:p></w:body></w:document>');
  const docxBuf = await docxZip.generateAsync({ type: 'nodebuffer' });

  // ODT
  const odtZip = new JSZip();
  odtZip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  odtZip.file('content.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h text:outline-level="1">Chapter 1: OpenDocument Standard</text:h><text:p>Expected ODT narrative body text.</text:p></office:text></office:body></office:document-content>');
  const odtBuf = await odtZip.generateAsync({ type: 'nodebuffer' });

  // CBZ
  const cbzZip = new JSZip();
  cbzZip.file('page_001.png', dotPng);
  cbzZip.file('page_002.png', dotPng);
  const cbzBuf = await cbzZip.generateAsync({ type: 'nodebuffer' });

  // FBZ
  const fbzZip = new JSZip();
  fbzZip.file('book.fb2', '<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><body><section><title><p>Chapter 1: Archive Book</p></title><p>Expected FBZ narrative body text.</p></section></body></FictionBook>');
  const fbzBuf = await fbzZip.generateAsync({ type: 'nodebuffer' });

  return {
    txt: {
      b64: Buffer.from('Chapter 1\n\nExpected TXT narrative body text.').toString('base64'),
      needle: 'Expected TXT narrative body text.'
    },
    html: {
      b64: Buffer.from('<!DOCTYPE html><html><body><h1>Chapter 1</h1><p>Expected HTML narrative body text.</p></body></html>').toString('base64'),
      needle: 'Expected HTML narrative body text.'
    },
    fb2: {
      b64: Buffer.from('<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><body><section><title><p>Chapter 1</p></title><p>Expected FB2 narrative body text.</p></section></body></FictionBook>').toString('base64'),
      needle: 'Expected FB2 narrative body text.'
    },
    rtf: {
      b64: Buffer.from('{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Times;}}\\f0\\fs24 Chapter 1\\par Expected RTF narrative body text.\\par}').toString('base64'),
      needle: 'Expected RTF narrative body text.'
    },
    md: {
      b64: Buffer.from('# Chapter 1\n\nExpected Markdown narrative body text with **bold**.').toString('base64'),
      needle: 'Expected Markdown narrative body text'
    },
    docx: {
      b64: docxBuf.toString('base64'),
      needle: 'Expected DOCX narrative body text.'
    },
    odt: {
      b64: odtBuf.toString('base64'),
      needle: 'Expected ODT narrative body text.'
    },
    fbz: {
      b64: fbzBuf.toString('base64'),
      needle: 'Expected FBZ narrative body text.'
    },
    cbz: {
      b64: cbzBuf.toString('base64'),
      needle: null // Image based
    }
  };
}

const fixtures = await buildFixtures();

const testPlan = [
  { id: 'txt', label: 'Plain Text', adapter: 'TextAdapter.Adapter', fixture: fixtures.txt, reflowable: true },
  { id: 'html', label: 'HTML Document', adapter: 'HtmlAdapter.Adapter', fixture: fixtures.html, reflowable: true },
  { id: 'fb2', label: 'FictionBook 2', adapter: 'Fb2Adapter.Adapter', fixture: fixtures.fb2, reflowable: true },
  { id: 'docx', label: 'Word (DOCX)', adapter: 'DocxAdapter.Adapter', fixture: fixtures.docx, reflowable: true },
  { id: 'odt', label: 'OpenDocument (ODT)', adapter: 'OdtAdapter.Adapter', fixture: fixtures.odt, reflowable: true },
  { id: 'rtf', label: 'Rich Text (RTF)', adapter: 'RtfAdapter.Adapter', fixture: fixtures.rtf, reflowable: true },
  { id: 'md', label: 'Markdown', adapter: 'MarkdownAdapter.Adapter', fixture: fixtures.md, reflowable: true },
  { id: 'fbz', label: 'FictionBook ZIP', adapter: 'Fb2Adapter.Adapter', fixture: fixtures.fbz, reflowable: true },
  { id: 'cbz', label: 'Comic Archive', adapter: 'CbzAdapter.Adapter', fixture: fixtures.cbz, reflowable: false }
];

const results = [];
let anyFailed = false;

try {
  console.log('Testing individual format adapters with synthetic fixtures...\n');

  for (const item of testPlan) {
    process.stdout.write(`  [Adapter] ${item.label.padEnd(22)} (${item.id.padEnd(4)}) ... `);

    const check = await cdp.eval(`
      const b64 = "${item.fixture.b64}";
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);

      const host = document.createElement('div');
      host.id = 'e2e-format-host-' + "${item.id}";
      host.style.width = '800px';
      host.style.height = '600px';
      host.style.position = 'relative';
      document.body.appendChild(host);

      const record = {
        id: 'e2e-book-' + "${item.id}",
        title: 'E2E ' + "${item.label}",
        format: "${item.id}",
        fileData: buf.buffer
      };

      const AdapterClass = ${item.adapter};
      const adapter = new AdapterClass(host, record);

      try {
        try {
          await adapter.open();

          // 1. Content Verification: Ensure adapter rendered expected fixture text or image
          let contentVerified = false;
          let contentDetail = '';
          if (${item.reflowable}) {
            if (!adapter.viewport || !adapter.element) {
              contentVerified = false;
              contentDetail = 'FAILED: adapter.viewport or adapter.element not mounted';
            } else {
              const text = adapter.viewport.textContent || '';
              const needle = "${item.fixture.needle || ''}";
              if (!needle) {
                contentVerified = false;
                contentDetail = 'FAILED: missing fixture search string';
              } else {
                contentVerified = text.includes(needle);
                contentDetail = contentVerified ? 'matched fixture string' : 'missing fixture text ("' + needle + '")';
              }
            }
          } else {
            // CBZ image adapter
            const hasImage = Boolean(adapter.image && adapter.image.style && adapter.pages?.length === 2 && adapter.viewportEl);
            contentVerified = hasImage;
            contentDetail = hasImage ? 'rendered image element with 2 pages' : 'image element or pages not mounted';
          }

          // 2. Typography and Alignment Checks (Only for reflowable formats)
          let typographyVerified = false;
          let alignmentVerified = false;
          let typoDetail = '';
          let alignDetail = '';

          if (${item.reflowable}) {
            if (!adapter.element || typeof adapter._applyTypography !== 'function') {
              typographyVerified = false;
              alignmentVerified = false;
              typoDetail = 'FAILED: adapter.element or _applyTypography unavailable';
              alignDetail = 'FAILED: adapter.element or _applyTypography unavailable';
            } else {
              // Apply typography through the real adapter method: fontSize=28, alignment=center
              adapter.settings = { ...adapter.settings, fontSize: 28, alignment: 'center', lineHeight: 1.8 };
              adapter._applyTypography();

              const docEl = adapter.element;
              void docEl.offsetHeight;
              const computed = getComputedStyle(docEl);
              const computedSize = computed.fontSize;
              const varSize = docEl.style.getPropertyValue('--doc-font-size');
              typographyVerified = (varSize === '28.00px' && (computedSize === '28px' || computedSize === '28.00px'));
              typoDetail = 'var=' + varSize + ', computed=' + computedSize;

              const computedAlign = computed.textAlign;
              const varAlign = docEl.style.getPropertyValue('--doc-align');
              alignmentVerified = (varAlign === 'center' && computedAlign === 'center');
              alignDetail = 'var=' + varAlign + ', computed=' + computedAlign;
            }
          }

          // 3. Zoom Check through adapter.setZoom API
          let zoomVerified = false;
          let zoomDetail = '';
          if (${item.reflowable}) {
            if (!adapter.element || typeof adapter.setZoom !== 'function' || typeof adapter.getZoom !== 'function') {
              zoomVerified = false;
              zoomDetail = 'FAILED: adapter.element or zoom API unavailable';
            } else {
              // At fontSize=28 and zoom=150, font size should scale to 28 * 1.5 = 42.00px
              adapter.setZoom(150);
              void adapter.element.offsetHeight;
              const zoomedVarSize = adapter.element.style.getPropertyValue('--doc-font-size');
              const zoomedComputedSize = getComputedStyle(adapter.element).fontSize;
              zoomVerified = (adapter.getZoom() === 150 && zoomedVarSize === '42.00px' && (zoomedComputedSize === '42px' || zoomedComputedSize === '42.00px'));
              zoomDetail = 'zoom=' + adapter.getZoom() + '%, var=' + zoomedVarSize + ', computed=' + zoomedComputedSize;
            }
          } else {
            // CBZ image zoom
            if (!adapter.image || typeof adapter.setZoom !== 'function' || typeof adapter.getZoom !== 'function') {
              zoomVerified = false;
              zoomDetail = 'FAILED: adapter.image or zoom API unavailable';
            } else {
              const initialWidth = parseInt(adapter.image.style.width || '0', 10);
              adapter.setZoom(150);
              const newWidth = parseInt(adapter.image.style.width || '0', 10);
              zoomVerified = (adapter.getZoom() === 150 && initialWidth > 0 && newWidth > initialWidth);
              zoomDetail = 'zoom=' + adapter.getZoom() + '%, initialWidth=' + initialWidth + 'px, zoomedWidth=' + newWidth + 'px';
            }
          }

          // 4. Theme Check: Apply known theme through real theme API and assert state and rendered style
          // Fails if #reader-view is absent, or if the applied background style does not match night theme
          const readerView = document.getElementById('reader-view');
          let themeVerified = false;
          let themeDetail = '';

          if (!readerView) {
            themeVerified = false;
            themeDetail = 'FAILED: #reader-view element is absent from DOM';
          } else {
            ThemeManager.setReaderTheme('night');
            const currentTheme = ThemeManager.getReaderTheme();
            const varBg = (readerView.style.getPropertyValue('--reader-theme-bg') || '').trim();
            const inlineBg = (readerView.style.backgroundColor || '').trim();
            const computedBg = getComputedStyle(readerView).backgroundColor.trim();

            const isNightState = (currentTheme === 'night');
            const isVarBgNight = (varBg.toUpperCase() === '#1B1D21');
            const isRenderedBgNight = (inlineBg.toUpperCase() === '#1B1D21' || computedBg === 'rgb(27, 29, 33)');

            themeVerified = isNightState && isVarBgNight && isRenderedBgNight;
            themeDetail = 'theme=' + currentTheme + ', varBg=' + varBg + ', inlineBg=' + inlineBg + ', computedBg=' + computedBg;
            if (!themeVerified) {
              themeDetail = 'FAILED: expected night theme and #1B1D21 bg, got ' + themeDetail;
            }
          }

          return {
            id: "${item.id}",
            label: "${item.label}",
            reflowable: ${item.reflowable},
            contentVerified,
            contentDetail,
            typographyVerified: ${item.reflowable} ? typographyVerified : 'Inapplicable (Fixed/Image)',
            typoDetail,
            alignmentVerified: ${item.reflowable} ? alignmentVerified : 'Inapplicable (Fixed/Image)',
            alignDetail,
            zoomVerified,
            zoomDetail,
            themeVerified,
            themeDetail,
            ok: contentVerified && zoomVerified && themeVerified && (${item.reflowable} ? (typographyVerified && alignmentVerified) : true)
          };
        } catch (execErr) {
          return {
            id: "${item.id}",
            label: "${item.label}",
            reflowable: ${item.reflowable},
            contentVerified: false,
            contentDetail: 'CRASH: ' + execErr.message,
            typographyVerified: false,
            typoDetail: 'CRASH',
            alignmentVerified: false,
            alignDetail: 'CRASH',
            zoomVerified: false,
            zoomDetail: 'CRASH',
            themeVerified: false,
            themeDetail: 'CRASH',
            ok: false
          };
        }
      } finally {
        // Safe DOM cleanup
        if (adapter && typeof adapter.destroy === 'function') {
          adapter.destroy();
        }
        host.remove();
      }
    `);

    results.push(check);

    if (check.ok) {
      console.log('PASS');
      console.log(`    ↳ Content: ${check.contentDetail}`);
      console.log(`    ↳ Zoom: ${check.zoomDetail}`);
      if (item.reflowable) {
        console.log(`    ↳ Typography: ${check.typoDetail}`);
        console.log(`    ↳ Alignment: ${check.alignDetail}`);
      }
      console.log(`    ↳ Theme: ${check.themeDetail}`);
    } else {
      console.log('FAIL');
      console.log(`    ✖ Content: ${check.contentVerified} (${check.contentDetail})`);
      console.log(`    ✖ Zoom: ${check.zoomVerified} (${check.zoomDetail})`);
      if (item.reflowable) {
        console.log(`    ✖ Typography: ${check.typographyVerified} (${check.typoDetail})`);
        console.log(`    ✖ Alignment: ${check.alignmentVerified} (${check.alignDetail})`);
      }
      console.log(`    ✖ Theme: ${check.themeVerified} (${check.themeDetail})`);
      anyFailed = true;
    }
  }

  console.log('\n========================================================================================');
  console.log('                        ADAPTER-LEVEL TEST VERIFICATION REPORT                          ');
  console.log('========================================================================================');
  console.log('| Format | Content Verified | Zoom Observable | Typography Observable | Alignment Observable |');
  console.log('|--------|:----------------:|:---------------:|:---------------------:|:--------------------:|');

  for (const r of results) {
    const mark = (v) => typeof v === 'boolean' ? (v ? '     PASS     ' : '     FAIL     ') : ` ${v} `;
    console.log(
      `| ${r.id.padEnd(6)} | ${mark(r.contentVerified)} | ${mark(r.zoomVerified)} | ${String(mark(r.typographyVerified)).padEnd(21)} | ${String(mark(r.alignmentVerified)).padEnd(20)} |`
    );
  }
  console.log('========================================================================================\n');

  console.log('Coverage Scope & Explicit Limitations:');
  console.log('  ✔ Tested with real synthetic fixtures: TXT, HTML, FB2, DOCX, ODT, RTF, MD, FBZ, CBZ (9 formats)');
  console.log('  ✔ Exercised in corpus test suite: EPUB, PDF (tested via epubjs / pdfjs-dist in qa/)');
  console.log('  ✔ Formats with inapplicable controls: CBZ, PDF (typography and column reflow are not applicable to fixed/image pages)');
  console.log('  ⚠ Documented Coverage Gaps (Not claimed as E2E passed):');
  console.log('     • CBR: Requires proprietary RAR archive / unrar WASM decompressor');
  console.log('     • DOC: Legacy Word 97-2003 OLE2 Compound Document (not yet tested with live binary fixture)');
  console.log('     • CHM: Compiled HTML Help ITSF binary (not yet tested with live binary fixture)');
  console.log('     • DJVU: AT&T FORM IFF binary (not yet tested with live binary fixture)');

  if (anyFailed) {
    throw new Error('One or more format adapter tests failed verification');
  }

  console.log('\n✔ All 9 adapter-level format tests passed strict observable verification!');
} catch (err) {
  console.error('\n✖ Format E2E Test Suite Failed:', err.message || err);
  process.exitCode = 1;
} finally {
  try {
    await shutdown(cdp);
  } catch {}
  process.exit(process.exitCode || 0);
}
