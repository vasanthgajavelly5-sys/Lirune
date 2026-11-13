const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');

global.JSZip = JSZip;
const BookFormat = require('../../js/formats');

function toArrayBuffer(buf) {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; i++) view[i] = buf[i];
  return ab;
}

test('Format Detection - Magic Byte Signatures', async () => {
  // 1. PDF
  const pdfHeader = Buffer.from('%PDF-1.7 and document content');
  const pdfDetect = await BookFormat.detect('sample.bin', toArrayBuffer(pdfHeader));
  assert.equal(pdfDetect.id, 'pdf');
  assert.equal(pdfDetect.source, 'signature');

  // 2. CBR / RAR
  const cbrHeader = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
  const cbrDetect = await BookFormat.detect('comic.bin', toArrayBuffer(cbrHeader));
  assert.equal(cbrDetect.id, 'cbr');
  assert.equal(cbrDetect.source, 'signature');

  // 3. DOC (OLE2 Compound Document)
  const docHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
  const docDetect = await BookFormat.detect('document.bin', toArrayBuffer(docHeader));
  assert.equal(docDetect.id, 'doc');
  assert.equal(docDetect.source, 'signature');

  // 4. CHM (ITSF)
  const chmHeader = Buffer.from('ITSF\x03\x00\x00\x00');
  const chmDetect = await BookFormat.detect('help.bin', toArrayBuffer(chmHeader));
  assert.equal(chmDetect.id, 'chm');
  assert.equal(chmDetect.source, 'signature');

  // 5. DjVu (AT&T)
  const djvuHeader = Buffer.from('AT&TFORM\x00\x00');
  const djvuDetect = await BookFormat.detect('scanned.bin', toArrayBuffer(djvuHeader));
  assert.equal(djvuDetect.id, 'djvu');
  assert.equal(djvuDetect.source, 'signature');

  // 6. MOBI (PalmDOC BOOKMOBI header at offset 60)
  const mobiBuf = Buffer.alloc(100);
  mobiBuf.write('BOOKMOBI', 60, 'ascii');
  const mobiDetect = await BookFormat.detect('kindle.bin', toArrayBuffer(mobiBuf));
  assert.equal(mobiDetect.id, 'mobi');
  assert.equal(mobiDetect.source, 'signature');

  // 7. RTF
  const rtfHeader = Buffer.from('{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times;}} Hello World }');
  const rtfDetect = await BookFormat.detect('sample.bin', toArrayBuffer(rtfHeader));
  assert.equal(rtfDetect.id, 'rtf');
  assert.equal(rtfDetect.source, 'signature');

  // 8. FB2 (FictionBook XML)
  const fb2Header = Buffer.from('<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">');
  const fb2Detect = await BookFormat.detect('book.bin', toArrayBuffer(fb2Header));
  assert.equal(fb2Detect.id, 'fb2');
  assert.equal(fb2Detect.source, 'signature');

  // 9. HTML
  const htmlHeader = Buffer.from('<!DOCTYPE html><html><head><title>Test</title></head><body><p>Text</p></body></html>');
  const htmlDetect = await BookFormat.detect('page.bin', toArrayBuffer(htmlHeader));
  assert.equal(htmlDetect.id, 'html');
  assert.equal(htmlDetect.source, 'signature');

  // 10. Plain text
  const txtHeader = Buffer.from('Chapter 1\n\nIt was a dark and stormy night. The rain fell in torrents.');
  const txtDetect = await BookFormat.detect('story.txt', toArrayBuffer(txtHeader));
  assert.equal(txtDetect.id, 'txt');
  assert.equal(txtDetect.source, 'signature');
});

test('Format Detection - ZIP Container Disambiguation', async () => {
  // 1. Synthetic EPUB (contains META-INF/container.xml)
  const epubZip = new JSZip();
  epubZip.file('mimetype', 'application/epub+zip');
  epubZip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const epubBuf = await epubZip.generateAsync({ type: 'nodebuffer' });
  const epubDetect = await BookFormat.detect('unknown.bin', toArrayBuffer(epubBuf));
  assert.equal(epubDetect.id, 'epub');

  // 2. Synthetic DOCX (contains word/document.xml)
  const docxZip = new JSZip();
  docxZip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>');
  const docxBuf = await docxZip.generateAsync({ type: 'nodebuffer' });
  const docxDetect = await BookFormat.detect('unknown.bin', toArrayBuffer(docxBuf));
  assert.equal(docxDetect.id, 'docx');

  // 3. Synthetic ODT (contains mimetype application/vnd.oasis.opendocument.text)
  const odtZip = new JSZip();
  odtZip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  odtZip.file('content.xml', '<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"></office:document-content>');
  const odtBuf = await odtZip.generateAsync({ type: 'nodebuffer' });
  const odtDetect = await BookFormat.detect('unknown.bin', toArrayBuffer(odtBuf));
  assert.equal(odtDetect.id, 'odt');

  // 4. Synthetic CBZ (contains image files)
  const cbzZip = new JSZip();
  cbzZip.file('page01.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  cbzZip.file('page02.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const cbzBuf = await cbzZip.generateAsync({ type: 'nodebuffer' });
  const cbzDetect = await BookFormat.detect('unknown.bin', toArrayBuffer(cbzBuf));
  assert.equal(cbzDetect.id, 'cbz');

  // 5. Synthetic FBZ (contains an fb2 file)
  const fbzZip = new JSZip();
  fbzZip.file('book.fb2', '<FictionBook></FictionBook>');
  const fbzBuf = await fbzZip.generateAsync({ type: 'nodebuffer' });
  const fbzDetect = await BookFormat.detect('unknown.bin', toArrayBuffer(fbzBuf));
  assert.equal(fbzDetect.id, 'fbz');
});

test('Format Detection - Edge Cases, Malformed Buffers, and Misnamed Files', async () => {
  // Empty buffer
  const emptyDetect = await BookFormat.detect('empty.epub', new ArrayBuffer(0));
  assert.equal(emptyDetect.id, 'epub', 'Empty buffer with extension should fall back to extension');

  // Completely unknown binary without known extension
  const randomJunk = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  const unknownDetect = await BookFormat.detect('random.xyz', toArrayBuffer(randomJunk));
  assert.equal(unknownDetect.id, 'unknown');
  assert.equal(unknownDetect.supported, false);

  // Misnamed file: PDF named as .txt
  const pdfMisnamed = Buffer.from('%PDF-1.5 fake text file');
  const misnamedDetect = await BookFormat.detect('document.txt', toArrayBuffer(pdfMisnamed));
  assert.equal(misnamedDetect.id, 'pdf', 'Magic byte signature must override misleading .txt extension');

  // Misnamed file: EPUB named as .zip
  const epubZip = new JSZip();
  epubZip.file('META-INF/container.xml', '<container/>');
  const epubBuf = await epubZip.generateAsync({ type: 'nodebuffer' });
  const zipDetect = await BookFormat.detect('archive.zip', toArrayBuffer(epubBuf));
  assert.equal(zipDetect.id, 'epub', 'ZIP container inspection must recognize EPUB even if named .zip');

  // Empty ZIP archive (no files)
  const emptyZip = new JSZip();
  const emptyZipBuf = await emptyZip.generateAsync({ type: 'nodebuffer' });
  const emptyZipDetect = await BookFormat.detect('empty.zip', toArrayBuffer(emptyZipBuf));
  assert.equal(emptyZipDetect.id, 'unknown');
  assert.equal(emptyZipDetect.supported, false);
});
