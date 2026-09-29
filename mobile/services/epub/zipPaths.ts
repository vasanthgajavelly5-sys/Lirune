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
