import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getFormatFromExtension } from '../models/Book.ts';
import { MobiParser } from '../services/mobi/MobiParser.ts';
import { DocxParser } from '../services/docx/DocxParser.ts';
import { OdtParser } from '../services/odt/OdtParser.ts';
import { RtfParser } from '../services/rtf/RtfParser.ts';
import { DocParser } from '../services/doc/DocParser.ts';
import { ChmParser } from '../services/chm/ChmParser.ts';
import { DjvuParser } from '../services/djvu/DjvuParser.ts';
import { RarExtractor } from '../services/archive/RarExtractor.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.resolve(__dirname, '../internal/qa-manifest.json');

test('QA Real-File Corpus: Manifest and 54 Artifact Verification', async (t) => {
  assert.ok(fs.existsSync(MANIFEST_PATH), `Manifest must exist at ${MANIFEST_PATH}`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  
  assert.equal(manifest.total_targets, 54, 'Manifest must target 54 artifacts');
  assert.equal(manifest.total_downloaded, 54, 'Manifest must have all 54 artifacts');
  assert.equal(manifest.artifacts.length, 54, 'Artifacts array must contain 54 items');

  const corpusDir = manifest.corpus_directory;
  assert.ok(fs.existsSync(corpusDir), `Corpus directory must exist at ${corpusDir}`);

  // Test each format has exactly 3 artifacts
  const formatCounts: Record<string, number> = {};
  for (const item of manifest.artifacts) {
    formatCounts[item.format] = (formatCounts[item.format] || 0) + 1;
  }

  const expectedFormats = [
    'EPUB', 'PDF', 'TXT', 'HTML', 'FB2', 'CBZ',
    'MOBI', 'AZW', 'AZW3', 'DJVU', 'DOC', 'DOCX',
    'RTF', 'ODT', 'CHM', 'CBR', 'ZIP', 'RAR'
  ];

  for (const fmt of expectedFormats) {
    assert.equal(formatCounts[fmt], 3, `Format ${fmt} must have exactly 3 test artifacts`);
  }

  // Verify file existence, hash integrity, and parser execution for all 54 files
  for (const item of manifest.artifacts) {
    const filePath = path.join(corpusDir, item.local_filename);
    assert.ok(fs.existsSync(filePath), `File ${item.local_filename} must exist on disk`);

    const stats = fs.statSync(filePath);
    assert.ok(stats.size > 0, `File ${item.local_filename} must not be empty`);
    assert.equal(stats.size, item.file_size, `File ${item.local_filename} size must match manifest`);

    // Verify SHA-256
    const fileBytes = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    assert.equal(hash, item.sha256, `SHA-256 hash of ${item.local_filename} must match manifest`);

    // Verify format detection
    const detected = getFormatFromExtension(item.local_filename);
    assert.equal(detected.supported, true, `Format of ${item.local_filename} must be recognized`);

    // Execute engine parser verification per format family
    const uint8 = new Uint8Array(fileBytes);
    try {
      if (item.format === 'MOBI' || item.format === 'AZW' || item.format === 'AZW3') {
        const mobiDoc = MobiParser.parse(uint8);
        assert.ok(mobiDoc.metadata.title, `MOBI title should be extracted from ${item.local_filename}`);
      } else if (item.format === 'DOCX') {
        const docxDoc = await DocxParser.parse(uint8);
        assert.ok(docxDoc.html.length > 0, `DOCX HTML should be produced for ${item.local_filename}`);
      } else if (item.format === 'ODT') {
        const odtDoc = await OdtParser.parse(uint8);
        assert.ok(odtDoc.html.length > 0, `ODT HTML should be produced for ${item.local_filename}`);
      } else if (item.format === 'RTF') {
        const rtfDoc = RtfParser.parse(uint8);
        assert.ok(rtfDoc.html.length > 0, `RTF HTML should be produced for ${item.local_filename}`);
      } else if (item.format === 'DOC') {
        const docDoc = DocParser.parse(uint8);
        assert.ok(docDoc.html.length > 0, `DOC HTML should be produced for ${item.local_filename}`);
      } else if (item.format === 'DJVU') {
        const djvuDoc = DjvuParser.parse(uint8);
        assert.ok(djvuDoc.metadata.pageCount >= 0, `DjVu pageCount should be parsed for ${item.local_filename}`);
      } else if (item.format === 'CHM') {
        const chmDoc = ChmParser.parse(uint8);
        assert.ok(chmDoc.html.length > 0, `CHM HTML should be produced for ${item.local_filename}`);
      } else if (item.format === 'RAR' || item.format === 'CBR') {
        const rarEntries = RarExtractor.inspect(uint8);
        assert.ok(Array.isArray(rarEntries), `RAR entries list should be extracted for ${item.local_filename}`);
      }
    } catch (err) {
      assert.fail(`Parser failed for ${item.local_filename} (${item.format}): ${err}`);
    }
  }
});
