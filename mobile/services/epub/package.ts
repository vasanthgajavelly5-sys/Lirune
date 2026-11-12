/**
 * Lirune Reader Mobile — EPUB package document parsing
 *
 * Reads `META-INF/container.xml`, the OPF manifest, the spine, and the table of
 * contents (EPUB 3 `nav` first, EPUB 2 NCX second).
 *
 * This lives outside the React component for two reasons: the parsing is the part
 * that has to be exercised by the automated EPUB corpus harness, and the reader
 * needs spine-index → chapter-title resolution in more than one place.
 */

import type { EpubArchive } from './archive.ts';
import { resolveZipHref, resolveZipPath, normalizeEntryPath } from './zipPaths.ts';
import { createSpineTarget, buildLogicalNavigationModel, type LogicalChapterInfo } from './navigation.ts';
import { scanTokens, parseAttributes, toPlainText, elementInner, findElementEnd } from './markup.ts';
import type { TOCItem } from '../../models/Book.ts';

export interface EpubManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
  /** Archive path of the item. */
  path: string;
}

export interface EpubSpineItem {
  idref: string;
  /** Archive path of the content document. */
  path: string;
  linear: boolean;
}

export interface EpubPackage {
  opfPath: string;
  opfDir: string;
  manifest: Map<string, EpubManifestItem>;
  spine: EpubSpineItem[];
  /** Table of contents with hrefs rewritten to `spine:N[:anchor:x]` targets. */
  toc: TOCItem[];
  /** Chapter title per spine index, already resolved from nav/NCX/headings. */
  chapterTitles: string[];
  /** Logical reading unit and story chapter model per spine index. */
  logicalChapters: LogicalChapterInfo[];
  publicationTitle: string;
  coverPath: string | null;
  /** Full Dublin Core metadata, shared with import and with the Files screen. */
  metadata: OpfMetadata;
}

export interface OpfMetadata {
  title: string;
  /** Every `dc:creator`, in document order, already decoded. */
  authors: string[];
  description?: string;
  language?: string;
  publisher?: string;
  identifier?: string;
  date?: string;
  /** `calibre:series` / `belongs-to-collection` series name. */
  series?: string;
  /** Href of the manifest item marked as the cover, already archive-relative. */
  coverHref?: string;
}

/** Decodes CDATA wrappers and the XML entities a publisher can legally use. */
export function decodeXmlText(raw: string): string {
  // CDATA first: `toPlainText` sees `<![CDATA[…]]>` as a tag and would drop it.
  return toPlainText(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function firstTagText(xml: string, tag: string): string {
  const pattern = new RegExp(`<(?:(?:\\w+):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${tag}\\s*>`, 'i');
  const match = pattern.exec(xml);
  if (!match) return '';
  return decodeXmlText(match[1]).trim();
}

function allTagTexts(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<(?:(?:\\w+):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${tag}\\s*>`, 'gi');
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const value = decodeXmlText(match[1]).trim();
    if (value) results.push(value);
  }
  return results;
}

/**
 * Reads the Dublin Core metadata out of an OPF document.
 *
 * Shared by the reader (which has the archive open), by import and by discovery
 * (which has two ZIP entries to hand), so the file list and the imported book can
 * never disagree about a title or an author.
 */
export function parseOpfMetadata(opfXml: string, opfPath?: string): OpfMetadata {
  const metadataBlock = /<metadata\b[^>]*>([\s\S]*?)<\/metadata\s*>/i.exec(opfXml);
  const metadataXml = metadataBlock ? metadataBlock[1] : opfXml;
  const manifestBlock = /<manifest\b[^>]*>([\s\S]*?)<\/manifest\s*>/i.exec(opfXml);
  const manifestXml = manifestBlock ? manifestBlock[1] : '';
  const baseDir = opfPath && opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // EPUB 2 names the cover with <meta name="cover" content="id">; EPUB 3 marks the
  // manifest item with properties="cover-image".
  let coverHref: string | undefined;
  const coverMeta = /<meta\b[^>]*\bname\s*=\s*["']cover["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/i.exec(metadataXml);
  if (coverMeta) {
    const itemPattern = new RegExp(
      `<item\\b[^>]*\\bid\\s*=\\s*["']${coverMeta[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
      'i'
    );
    const item = itemPattern.exec(manifestXml);
    const href = item ? parseAttributes(item[0]).find((a) => a.name === 'href')?.value : undefined;
    if (href) coverHref = resolveZipPath(baseDir, href);
  }
  if (!coverHref) {
    const propsItem = /<item\b[^>]*\bproperties\s*=\s*["'][^"']*cover-image[^"']*["'][^>]*>/i.exec(manifestXml);
    const href = propsItem ? parseAttributes(propsItem[0]).find((a) => a.name === 'href')?.value : undefined;
    if (href) coverHref = resolveZipPath(baseDir, href);
  }

  const calibreSeries = firstTagText(metadataXml, 'calibre:series');
  const belongsTo = /<belongs-to-collection\b[^>]*>([\s\S]*?)<\/belongs-to-collection\s*>/i.exec(metadataXml);
  const collectionName = belongsTo ? firstTagText(belongsTo[1], 'collection-name') : '';

  return {
    title: firstTagText(metadataXml, 'title'),
    authors: allTagTexts(metadataXml, 'creator'),
    description: firstTagText(metadataXml, 'description') || undefined,
    language: firstTagText(metadataXml, 'language') || undefined,
    publisher: firstTagText(metadataXml, 'publisher') || undefined,
    identifier: firstTagText(metadataXml, 'identifier') || undefined,
    date: firstTagText(metadataXml, 'date') || undefined,
    series: calibreSeries || collectionName || undefined,
    coverHref,
  };
}

/** Attribute-order agnostic attribute reader for XML start tags. */
function attribute(raw: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(raw);
  if (!match) return null;
  return match[1] ?? match[2] ?? '';
}

function parseFullPath(containerXml: string): string | null {
  const rootFile = /<rootfile\b([^>]*)>/i.exec(containerXml);
  if (rootFile) {
    const fullPath = attribute(rootFile[1], 'full-path');
    if (fullPath) return fullPath;
  }
  const legacy = /full-path\s*=\s*["']([^"']+)["']/i.exec(containerXml);
  return legacy ? legacy[1] : null;
}

function parseMetadataTitle(opfXml: string): string {
  const dcTitle = /<dc:title\b[^>]*>([\s\S]{0,300}?)<\/dc:title\s*>/i.exec(opfXml);
  if (dcTitle) {
    const text = toPlainText(dcTitle[1]);
    if (text) return text;
  }
  const legacy = /<title\b[^>]*>([\s\S]{0,300}?)<\/title\s*>/i.exec(opfXml);
  return legacy ? toPlainText(legacy[1]) : '';
}

/**
 * Resolves the cover image declared by `meta name="cover"` or the EPUB 3
 * `properties="cover-image"` manifest item.
 */
function resolveCover(
  opfXml: string,
  opfDir: string,
  manifest: Map<string, EpubManifestItem>
): string | null {
  const metaCover = /<meta\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaCover.exec(opfXml)) !== null) {
    const name = attribute(match[1], 'name');
    if (name?.toLowerCase() !== 'cover') continue;
    const content = attribute(match[1], 'content');
    const item = content ? manifest.get(content) : undefined;
    if (item) return item.path;
    if (content) {
      const candidate = resolveZipPath(opfDir, content);
      if (candidate) return candidate;
    }
  }
  for (const item of manifest.values()) {
    if (item.properties?.split(/\s+/).includes('cover-image')) return item.path;
  }
  return null;
}

interface NavEntry {
  label: string;
  /** Archive path of the target, already resolved against the nav document's directory. */
  path: string;
  /** Element id inside the target, when the href carried a `#fragment`. */
  fragment?: string;
  depth: number;
}

/**
 * EPUB 3 navigation document.
 *
 * Prefers the `epub:type="toc"` nav; falls back to the whole document, which is
 * what most EPUB 3 files use anyway. `<ol>` nesting is counted while walking so
 * a nested entry indents under its parent instead of flattening to the left.
 */
function parseNavDocument(navXhtml: string, navDir: string): NavEntry[] {
  const tokens = scanTokens(navXhtml);
  const tocNavs: number[] = [];
  const navs: number[] = [];
  tokens.forEach((token, index) => {
    if (token.lower !== 'nav' || token.closing) return;
    if (
      token.attrs.match(/\bepub:type\s*=\s*["']toc["']/i) ||
      token.attrs.match(/\brole\s*=\s*["']doc-toc["']/i)
    ) {
      tocNavs.push(index);
    } else {
      navs.push(index);
    }
  });

  const scopeIndexes = tocNavs.length > 0 ? tocNavs : navs;
  const entries: NavEntry[] = [];

  for (const scopeIndex of scopeIndexes) {
    const end = findElementEnd(tokens, scopeIndex);
    let olDepth = 0;
    for (let i = scopeIndex + 1; i < (end === -1 ? tokens.length : end); i++) {
      const token = tokens[i];
      if (token.lower === 'ol') {
        if (!token.closing && !token.selfClosing) olDepth++;
        else if (token.closing) olDepth = Math.max(0, olDepth - 1);
        continue;
      }
      if (token.lower !== 'a' || token.closing) continue;
      const href = parseAttributes(token.attrs).find((a) => a.name === 'href')?.value;
      if (!href) continue;
      const label = toPlainText(elementInner(navXhtml, tokens, i));
      if (!label) continue;
      const target = resolveZipHref(navDir, href);
      if (!target.path) continue;
      entries.push({ label, path: target.path, fragment: target.fragment, depth: Math.max(0, olDepth - 1) });
    }
    if (entries.length > 0) break;
  }

  return entries;
}

/**
 * EPUB 2 NCX: nested `navPoint` elements, flattened in document order.
 *
 * `src` is relative to the directory holding the NCX (usually the same directory
 * as the OPF), never to the archive root — resolving it against the archive root
 * is why NCX entries in `OEBPS/toc.ncx` used to point at nothing.
 */
function parseNcxDocument(ncxXml: string, ncxDir: string): NavEntry[] {
  const tokens = scanTokens(ncxXml);
  const entries: NavEntry[] = [];
  const navPointDepth: number[] = [];
  let depth = 0;

  tokens.forEach((token, index) => {
    if (token.lower !== 'navpoint') return;
    const closing = token.closing;
    const selfClosing = token.selfClosing;

    if (closing) {
      depth = Math.max(0, depth - 1);
      navPointDepth.pop();
      return;
    }
    if (selfClosing) return;

    const currentDepth = depth;
    depth++;
    navPointDepth.push(currentDepth);

    const close = findElementEnd(tokens, index);
    const block = ncxXml.slice(token.end, close === -1 ? ncxXml.length : tokens[close].start);

    const textMatch = /<text\b[^>]*>([\s\S]{0,300}?)<\/text\s*>/i.exec(block);
    const contentMatch = /<content\b([^>]*)\/?>/i.exec(block);
    if (!textMatch || !contentMatch) return;
    const label = toPlainText(textMatch[1]);
    const src = attribute(contentMatch[1], 'src');
    if (!label || !src) return;
    const target = resolveZipHref(ncxDir, src);
    if (!target.path) return;
    entries.push({ label, path: target.path, fragment: target.fragment, depth: currentDepth });
  });

  return entries;
}

/**
 * Reads the whole package structure for one archive.
 *
 * Every lookup goes through the archive's normalized index, so manifest hrefs
 * that disagree with the archive's own file names still resolve.
 */
export async function readEpubPackage(archive: EpubArchive): Promise<EpubPackage> {
  const containerXml = await archive.readText('META-INF/container.xml');
  if (!containerXml) throw new Error('Missing META-INF/container.xml in EPUB archive.');

  const opfPath = parseFullPath(containerXml) || 'OEBPS/content.opf';
  const opfXml = await archive.readText(opfPath);
  if (!opfXml) throw new Error(`Missing OPF manifest at ${opfPath}`);

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // Manifest
  const manifest = new Map<string, EpubManifestItem>();
  const itemTag = /<item\b([^>]*?)\/?>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemTag.exec(opfXml)) !== null) {
    const raw = itemMatch[1];
    const id = attribute(raw, 'id');
    const href = attribute(raw, 'href');
    if (!id || !href) continue;
    manifest.set(id, {
      id,
      href,
      mediaType: (attribute(raw, 'media-type') || 'application/xhtml+xml').toLowerCase(),
      properties: attribute(raw, 'properties') || undefined,
      path: resolveZipPath(opfDir, href),
    });
  }

  // Spine
  const spine: EpubSpineItem[] = [];
  const itemref = /<itemref\b([^>]*?)\/?>/gi;
  let itemrefMatch: RegExpExecArray | null;
  while ((itemrefMatch = itemref.exec(opfXml)) !== null) {
    const raw = itemrefMatch[1];
    const idref = attribute(raw, 'idref');
    if (!idref) continue;
    const item = manifest.get(idref);
    if (!item) continue;
    spine.push({
      idref,
      path: item.path,
      linear: (attribute(raw, 'linear') || 'yes').toLowerCase() !== 'no',
    });
  }

  // Fallback for malformed packages: every XHTML manifest item, in document order.
  if (spine.length === 0) {
    for (const item of manifest.values()) {
      if (
        item.mediaType.includes('xhtml') ||
        item.mediaType.includes('html') ||
        /\.(?:xhtml|html|htm)$/i.test(item.href)
      ) {
        spine.push({ idref: item.id, path: item.path, linear: true });
      }
    }
  }

  if (spine.length === 0) {
    throw new Error('This EPUB publication contains no readable chapter items.');
  }

  // Spine index lookup, tolerant of case differences in publisher manifests.
  const spineIndexByPath = new Map<string, number>();
  spine.forEach((item, index) => {
    const key = normalizeEntryPath(item.path).toLowerCase();
    if (item.path && !spineIndexByPath.has(key)) spineIndexByPath.set(key, index);
  });
  const spineIndexFor = (archivePath: string): number | null => {
    if (!archivePath) return null;
    const normalized = normalizeEntryPath(archivePath).toLowerCase();
    const direct = spineIndexByPath.get(normalized);
    if (direct !== undefined) return direct;
    // Fallback: match by filename if path prefix differed (e.g. OEBPS/ vs root)
    const fileName = normalized.split('/').pop();
    if (fileName) {
      const match = spine.findIndex((item) => {
        const p = normalizeEntryPath(item.path).toLowerCase();
        return p.endsWith('/' + fileName) || p === fileName;
      });
      if (match !== -1) return match;
    }
    return null;
  };

  // Table of contents
  let entries: NavEntry[] = [];
  const navItem = [...manifest.values()].find(
    (item) =>
      item.properties?.split(/\s+/).includes('nav') ||
      /nav\.xhtml$/i.test(item.href) ||
      /toc\.xhtml$/i.test(item.href)
  );
  if (navItem) {
    const navXhtml = await archive.readText(navItem.path);
    if (navXhtml) {
      const navDir = navItem.path.includes('/')
        ? navItem.path.slice(0, navItem.path.lastIndexOf('/') + 1)
        : '';
      entries = parseNavDocument(navXhtml, navDir);
    }
  }
  if (entries.length === 0) {
    const ncxItem = [...manifest.values()].find(
      (item) => item.mediaType === 'application/x-dtbncx+xml' || /\.ncx$/i.test(item.href)
    );
    if (ncxItem) {
      const ncxXml = await archive.readText(ncxItem.path);
      if (ncxXml) {
        const ncxDir = ncxItem.path.includes('/')
          ? ncxItem.path.slice(0, ncxItem.path.lastIndexOf('/') + 1)
          : '';
        entries = parseNcxDocument(ncxXml, ncxDir);
      }
    }
  }

  const toc: TOCItem[] = [];
  const chapterTitleByIndex = new Map<number, string>();
  entries.forEach((entry, order) => {
    // `entry.path` is already an archive path (resolved against the navigation
    // document for nav, against the NCX directory for NCX), so it must not be
    // resolved again.
    const index = spineIndexFor(entry.path);
    const id = `toc_${order}`;
    // An entry that does not land on a spine item (a standalone TOC page, an
    // external link) stays in the list — dropping it would hide real chapters —
    // but carries no target.
    const href = index === null ? undefined : createSpineTarget(index, entry.fragment);
    if (index !== null && !chapterTitleByIndex.has(index)) {
      // The book's own navigation metadata is the best chapter title there is.
      chapterTitleByIndex.set(index, entry.label);
    }
    toc.push({ id, label: entry.label, href, depth: entry.depth });
  });

  /**
   * No nav match means the book never named this spine item. Returning '' instead
   * of `Chapter N` keeps a fabricated number out of the UI: the caller substitutes
   * the title resolved from the chapter document once it has been loaded, and only
   * falls back to a positional label when even that is empty.
   */
  const chapterTitles = spine.map((_, index) => chapterTitleByIndex.get(index) || '');
  const logicalChapters = buildLogicalNavigationModel(spine, chapterTitles);

  return {
    opfPath,
    opfDir,
    manifest,
    spine,
    toc,
    chapterTitles,
    logicalChapters,
    publicationTitle: parseMetadataTitle(opfXml),
    coverPath: resolveCover(opfXml, opfDir, manifest),
    metadata: parseOpfMetadata(opfXml, opfPath),
  };
}