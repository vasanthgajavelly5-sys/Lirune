const fs = require('fs');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function testPdf() {
  const candidates = [
    'mobile/test-fixtures/LiruneQA/pdf-small.pdf',
    'test-fixtures/LiruneQA/pdf-small.pdf',
    'test-fixtures/zip-suite/plain.pdf'
  ];
  const file = candidates.find(c => fs.existsSync(c));
  if (!file) {
    console.log('Skipping test-pdf: no sample pdf found');
    return;
  }
  console.log('Testing pdf reading with:', file);
  const data = new Uint8Array(fs.readFileSync(file));
  console.log('Read bytes:', data.length);
  const doc = await pdfjs.getDocument({ data }).promise;
  console.log('PDF loaded! Page count:', doc.numPages);
  const page = await doc.getPage(1);
  console.log('Page 1 viewport:', page.getViewport({ scale: 1 }));
}

testPdf().catch(console.error);
