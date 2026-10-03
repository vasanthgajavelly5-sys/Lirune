/**
 * Lirune Reader Mobile — EPUB internal path resolution
 *
 * EPUB-internal hrefs (in the OPF manifest, the NCX, and chapter markup) are
 * relative, percent-encoded, and may contain `..` segments. Naive string
 * concatenation with the OPF directory silently fails on real-world books, so
 * all of it goes through here.
 */

/**
 * Decodes a percent-encoded href without throwing on malformed input.
 */
export function safeDecode(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function collapseSegments(combined: string): string {
  const parts: string[] = [];
  for (const segment of combined.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join('/');
}

/**
 * Resolves an EPUB-internal href against the directory containing the OPF.
 *
 * Handles percent-encoding (`Chapter%201.xhtml`), `..` segments
 * (`../shared/ch1.xhtml`), fragment suffixes (`chapter.xhtml#section`), and
 * leading-slash absolute paths.
 */
export function resolveZipPath(baseDir: string, href: string): string {
  const withoutFragment = href.split('#')[0];
  const decoded = safeDecode(withoutFragment);
  const combined = decoded.startsWith('/') ? decoded : baseDir + decoded;
  return collapseSegments(combined);
}

/**
 * Canonical form of a ZIP entry name, used as the archive lookup key.
 *
 * Real-world EPUBs ship entries written as `.\OEBPS\Text\ch1.xhtml`,
 * `/OEBPS/Text/ch1.xhtml` or `OEBPS/./Text/ch1.xhtml`. All of those address the
 * same resource, so they must produce one key — otherwise the per-archive index
 * silently misses and the reader falls back to an O(n) scan.
 *
 * Case is deliberately preserved: EPUB paths are case-sensitive and two entries
 * that differ only in case are two different resources.
 */
export function normalizeEntryPath(name: string): string {
  const slashed = safeDecode(name.replace(/\\/g, '/'));
  const trimmed = slashed.startsWith('/') ? slashed.slice(1) : slashed;
  return collapseSegments(trimmed);
}

/**
 * Directory portion of an archive path, including the trailing slash, or an
 * empty string when the resource sits at the archive root.
 */
export function archiveDirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash + 1);
}
