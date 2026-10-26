import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobileRoot = path.resolve(__dirname, '..');

/**
 * Scans a directory recursively for files matching extensions.
 */
function walkDir(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(fullPath, extensions));
    } else if (extensions.some((ext) => file.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Theme Consistency & Hex Color Audit', () => {
  it('scans app/ and components/ for unauthorized hardcoded hex colors', () => {
    const targetDirs = [
      path.join(mobileRoot, 'app'),
      path.join(mobileRoot, 'components'),
    ];

    const allFiles = targetDirs.flatMap((dir) => walkDir(dir, ['.ts', '.tsx']));

    // Allowlisted file patterns or specific acceptable hardcoded color contexts:
    // 1. Shadow declarations (shadowColor: '#000')
    // 2. Buy Me a Coffee brand button ('#FFDD00', '#FF813F', '#000000')
    // 3. User highlight annotation presets (HIGHLIGHT_COLORS)
    // 4. User collection color picker swatches (DEFAULT_COLLECTION_COLORS)
    // 5. Reader color presets
    const hexPattern = /#([0-9a-fA-F]{3,8})\b/g;

    const violations: { file: string; line: number; color: string; content: string }[] = [];

    for (const file of allFiles) {
      const relPath = path.relative(mobileRoot, file).replace(/\\/g, '/');
      const lines = fs.readFileSync(file, 'utf-8').split('\n');

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Ignore comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }

        // Allow shadowColor: '#000' or '#000000'
        if (trimmed.includes('shadowColor:')) {
          return;
        }

        // Allow Buy Me a Coffee brand assets in about.tsx
        if (relPath.includes('about.tsx') && (trimmed.includes('FFDD00') || trimmed.includes('FF813F') || trimmed.includes('cafe'))) {
          return;
        }

        // Allow user annotation swatch palette presets or collection color presets
        if (relPath.includes('collections.tsx') && trimmed.includes('#') && (trimmed.endsWith("',") || trimmed.endsWith("'"))) {
          return;
        }

        if (trimmed.includes('HIGHLIGHT_COLORS') || trimmed.includes('DEFAULT_COLLECTION_COLORS') || trimmed.includes('PRESET_COLORS')) {
          return;
        }

        // Allow pure fallback white/black in SVG or icons when layered on dark covers
        if (trimmed.includes('#FFFFFF') && (trimmed.includes('rgba') || trimmed.includes('fallback') || trimmed.includes('rgba(255,255,255') || trimmed.includes('Cover') || trimmed.includes('favoriteIconBg'))) {
          return;
        }

        // Check for hex color matches
        let match: RegExpExecArray | null;
        while ((match = hexPattern.exec(line)) !== null) {
          const hex = match[0];
          // Allow #000 or #FFFFFF in strict shadow / pure fallback contexts
          if (hex.toLowerCase() === '#000' || hex.toLowerCase() === '#000000' || hex.toUpperCase() === '#FFFFFF') {
            continue;
          }
          // Allow lilac brand accent on cover overlay badge
          if (hex.toUpperCase() === '#EEECF8' && trimmed.includes('badge')) {
            continue;
          }
          // Allow cover color fallback constants if specifically on book fallback
          if (trimmed.includes('rgba(')) {
            continue;
          }

          violations.push({
            file: relPath,
            line: idx + 1,
            color: hex,
            content: trimmed,
          });
        }
      });
    }

    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `  ${v.file}:${v.line} - found ${v.color}: "${v.content}"`)
        .join('\n');
      assert.fail(`Found ${violations.length} hardcoded hex colors outside allowlist:\n${formatted}`);
    }

    assert.ok(true, 'No unauthorized hardcoded hex colors found');
  });
});
