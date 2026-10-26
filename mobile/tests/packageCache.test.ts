/**
 * Lirune Mobile - EPUB Package Cache Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPackageCacheKey,
  serializeEpubPackage,
  deserializeEpubPackage,
  PackageCacheManager,
  PACKAGE_CACHE_VERSION,
} from '../services/epub/packageCache.ts';
import type { EpubPackage } from '../services/epub/package.ts';

describe('EPUB Package Cache', () => {
  describe('getPackageCacheKey', () => {
    it('generates deterministic cache keys', () => {
      const key1 = getPackageCacheKey({ id: 'book-1', fileSize: 1024, mtime: 5000 });
      const key2 = getPackageCacheKey({ id: 'book-1', fileSize: 1024, mtime: 5000 });
      assert.equal(key1, key2);
      assert.equal(key1, `book-1:1024:5000:v${PACKAGE_CACHE_VERSION}`);
    });

    it('invalidates key when file size changes', () => {
      const k1 = getPackageCacheKey({ id: 'book-1', fileSize: 1000, mtime: 5000 });
      const k2 = getPackageCacheKey({ id: 'book-1', fileSize: 1001, mtime: 5000 });
      assert.notEqual(k1, k2);
    });

    it('invalidates key when mtime changes', () => {
      const k1 = getPackageCacheKey({ id: 'book-1', fileSize: 1000, mtime: 5000 });
      const k2 = getPackageCacheKey({ id: 'book-1', fileSize: 1000, mtime: 5001 });
      assert.notEqual(k1, k2);
    });

    it('invalidates key when pipeline version changes', () => {
      const k1 = getPackageCacheKey({ id: 'book-1', fileSize: 1000, mtime: 5000 }, 1);
      const k2 = getPackageCacheKey({ id: 'book-1', fileSize: 1000, mtime: 5000 }, 2);
      assert.notEqual(k1, k2);
    });

    it('handles undefined or missing optional fields gracefully', () => {
      const k = getPackageCacheKey({ id: 'book-2' });
      assert.equal(k, `book-2:0:0:v${PACKAGE_CACHE_VERSION}`);
    });
  });

  describe('serializeEpubPackage & deserializeEpubPackage', () => {
    it('correctly serializes and deserializes an EpubPackage with Maps and arrays intact', () => {
      const samplePackage: EpubPackage = {
        opfPath: 'OEBPS/content.opf',
        opfDir: 'OEBPS/',
        manifest: new Map([
          ['ch1', { id: 'ch1', href: 'ch1.xhtml', mediaType: 'application/xhtml+xml', path: 'OEBPS/ch1.xhtml' }],
          ['img1', { id: 'img1', href: 'img1.png', mediaType: 'image/png', path: 'OEBPS/img1.png' }],
        ]),
        spine: [
          { idref: 'ch1', path: 'OEBPS/ch1.xhtml', linear: true },
        ],
        toc: [
          { id: 'ch1', label: 'Chapter 1', href: 'spine:0' },
        ],
        chapterTitles: ['Chapter 1'],
        logicalChapters: [
          {
            type: 'chapter',
            chapterNumber: 1,
            totalChapters: 10,
            displayTitle: 'Chapter 1',
            headerSubtitle: 'Chapter 1 of 10',
          },
        ],
        publicationTitle: 'Test Publication',
        coverPath: 'OEBPS/img1.png',
        metadata: {
          title: 'Test Publication',
          authors: ['Test Author'],
        },
      };

      const serialized = serializeEpubPackage(samplePackage);
      assert.equal(Array.isArray(serialized.manifest), true);
      assert.equal(serialized.manifest.length, 2);

      const deserialized = deserializeEpubPackage(serialized);
      assert.equal(deserialized.opfPath, samplePackage.opfPath);
      assert.equal(deserialized.manifest instanceof Map, true);
      assert.equal(deserialized.manifest.size, 2);
      assert.deepEqual(deserialized.manifest.get('ch1'), samplePackage.manifest.get('ch1'));
      assert.deepEqual(deserialized.spine, samplePackage.spine);
      assert.deepEqual(deserialized.toc, samplePackage.toc);
      assert.deepEqual(deserialized.chapterTitles, samplePackage.chapterTitles);
      assert.deepEqual(deserialized.logicalChapters, samplePackage.logicalChapters);
      assert.equal(deserialized.publicationTitle, samplePackage.publicationTitle);
      assert.equal(deserialized.coverPath, samplePackage.coverPath);
    });
  });

  describe('PackageCacheManager', () => {
    it('stores, retrieves, and evicts entries according to LRU capacity', () => {
      const manager = new PackageCacheManager();
      const pkg = { opfPath: 'dummy.opf' } as EpubPackage;

      manager.set('k1', pkg);
      assert.equal(manager.has('k1'), true);
      assert.equal(manager.get('k1'), pkg);
      assert.equal(manager.get('nonexistent'), null);

      manager.clear();
      assert.equal(manager.has('k1'), false);
      assert.equal(manager.size, 0);
    });
  });
});
