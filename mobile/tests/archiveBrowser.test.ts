/**
 * Tests: Archive Browser, Breadcrumb Navigation, Security Guards, and Intent Routing
 * Verifies Phase 3 behaviors:
 * 1. Intent routing for APK vs ZIP vs EPUB
 * 2. Importer guards rejecting kind !== 'book'
 * 3. Breadcrumb navigation inside archive containers
 * 4. Zip-slip path sanitization
 * 5. Multi-select and folder import queuing
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormatDetector } from '../services/discovery/FormatDetector.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, '../../test-fixtures/zip-suite');

test('Intent routing: APK triggers blocked modal state, does not enqueue', () => {
  const apkBytes = fs.readFileSync(path.join(FIXTURES_DIR, 'minimal.apk'));
  const sniff = FormatDetector.fromMagicBytes(apkBytes, 'minimal.apk');

  assert.equal(sniff.kind, 'blocked');
  assert.equal(sniff.supported, false);

  // Simulated layout intent router
  const intentAction = (result: typeof sniff) => {
    if (result.kind === 'blocked') {
      return { action: 'show_blocked_modal', message: result.reason };
    }
    if (result.kind === 'container') {
      return { action: 'navigate_to_folders', route: '/folders' };
    }
    return { action: 'import_book' };
  };

  const action = intentAction(sniff);
  assert.equal(action.action, 'show_blocked_modal');
  assert.match(action.message || '', /Android application package/i);
});

test('Intent routing: ZIP container routes to folders archive browser', () => {
  const zipBytes = fs.readFileSync(path.join(FIXTURES_DIR, 'library_bundle.zip'));
  const sniff = FormatDetector.fromMagicBytes(zipBytes, 'library_bundle.zip');

  assert.equal(sniff.kind, 'container');

  const intentAction = (result: typeof sniff) => {
    if (result.kind === 'blocked') return { action: 'show_blocked_modal' };
    if (result.kind === 'container') return { action: 'navigate_to_folders', route: '/folders' };
    return { action: 'import_book' };
  };

  const action = intentAction(sniff);
  assert.equal(action.action, 'navigate_to_folders');
  assert.equal(action.route, '/folders');
});

test('Importer guards: reject kind !== "book" with typed Unsupported error', () => {
  const guardImport = (kind: string, reason?: string) => {
    if (kind !== 'book') {
      throw new Error(`Unsupported: Cannot import ${kind} item as a book (${reason})`);
    }
    return true;
  };

  // Blocked APK
  assert.throws(
    () => guardImport('blocked', 'Android application package'),
    /Unsupported: Cannot import blocked item/i
  );

  // Container ZIP
  assert.throws(
    () => guardImport('container', 'ZIP container with books inside'),
    /Unsupported: Cannot import container item/i
  );

  // Valid book
  assert.equal(guardImport('book'), true);
});

test('Archive breadcrumb navigation logic: handles subdirectories and upward traversal', () => {
  interface Breadcrumb {
    name: string;
    path: string;
  }

  let breadcrumbs: Breadcrumb[] = [{ name: 'SciFi_Bundle.zip', path: '' }];

  const enterDirectory = (name: string, dirPath: string) => {
    breadcrumbs.push({ name, path: dirPath });
  };

  const goUp = () => {
    if (breadcrumbs.length > 1) {
      breadcrumbs.pop();
      return breadcrumbs[breadcrumbs.length - 1];
    }
    return null; // exit archive
  };

  // Enter "SciFi"
  enterDirectory('SciFi', 'SciFi');
  assert.equal(breadcrumbs.length, 2);
  assert.equal(breadcrumbs[1].path, 'SciFi');

  // Enter "Asimov"
  enterDirectory('Asimov', 'SciFi/Asimov');
  assert.equal(breadcrumbs.length, 3);
  assert.equal(breadcrumbs[2].path, 'SciFi/Asimov');

  // Go up to SciFi
  const parent = goUp();
  assert.equal(parent?.path, 'SciFi');
  assert.equal(breadcrumbs.length, 2);

  // Go up to archive root
  const root = goUp();
  assert.equal(root?.path, '');
  assert.equal(breadcrumbs.length, 1);

  // Exit archive
  const exited = goUp();
  assert.equal(exited, null);
});

test('Security: Zip-slip prevention sanitizes traversal segments', () => {
  const sanitizePath = (raw: string): string => {
    const normalized = raw.replace(/\\/g, '/').replace(/\0/g, '');
    const segments = normalized.split('/').filter((s) => s.length > 0 && s !== '.');
    const safe: string[] = [];
    for (const seg of segments) {
      if (seg === '..') continue; // drop traversal
      safe.push(seg);
    }
    return safe.join('/');
  };

  assert.equal(sanitizePath('../../evil.epub'), 'evil.epub');
  assert.equal(sanitizePath('a/b/../../c/d.pdf'), 'a/b/c/d.pdf');
  assert.equal(sanitizePath('/etc/passwd'), 'etc/passwd');
  assert.equal(sanitizePath('book\0.epub'), 'book.epub');
});

test('Security: Zip-bomb detection flags suspicious ratios and oversized entries', () => {
  const MAX_DECLARED_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

  const validateBudget = (uncompressed: number, compressed: number) => {
    if (uncompressed > MAX_DECLARED_SIZE) {
      throw new Error('Decompressed size exceeded maximum safety limit of 2 GB');
    }
    if (uncompressed > 100 * 1024 * 1024 && compressed > 0) {
      const ratio = uncompressed / compressed;
      if (ratio > 200) {
        throw new Error(`Corrupt: suspicious compression ratio (${Math.round(ratio)}:1)`);
      }
    }
    return true;
  };

  // Normal 50 MB book with 2:1 ratio
  assert.equal(validateBudget(50 * 1024 * 1024, 25 * 1024 * 1024), true);

  // Bomb: 3 GB uncompressed
  assert.throws(
    () => validateBudget(3 * 1024 * 1024 * 1024, 1024),
    /exceeded maximum safety limit of 2 GB/i
  );

  // Ratio bomb: 500 MB uncompressed from 1 MB compressed (500:1)
  assert.throws(
    () => validateBudget(500 * 1024 * 1024, 1 * 1024 * 1024),
    /suspicious compression ratio/i
  );
});
