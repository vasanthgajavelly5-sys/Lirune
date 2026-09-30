const fs = require('fs');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function testPdf() {
  console.log('Testing pdf reading...');
  const file = 'mobile/test-fixtures/LiruneQA/pdf-small.pdf';
  const data = new Uint8Array(fs.readFileSync(file));
  console.log('Read bytes:', data.length);
  const doc = await pdfjs.getDocument({ data }).promise;
  console.log('PDF loaded! Page count:', doc.numPages);
  const page = await doc.getPage(1);
  console.log('Page 1 viewport:', page.getViewport({ scale: 1 }));
}

testPdf().catch(console.error);
