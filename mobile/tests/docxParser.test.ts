import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { DocxParser } from '../services/docx/DocxParser.ts';

test('DOCX parser accepts Base64 strings from Expo FileSystem', async () => {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p></w:body></w:document>'
  );
  const base64 = await zip.generateAsync({ type: 'base64' });

  const parsed = await DocxParser.parse(base64);

  assert.match(parsed.html, /Hello DOCX/);
});
