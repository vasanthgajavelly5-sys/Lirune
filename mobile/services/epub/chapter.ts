/**
 * Lirune Reader Mobile — EPUB chapter assembly
 *
 * Turns one content document from the archive into everything the reader needs:
 * sanitised body markup plus self-contained CSS with fonts and images embedded.
 *
 * The order of the passes matters and is documented inline below.
 */

import type { EpubArchive } from './archive.ts';
import { sanitizeHtml } from '../security/sanitizeHtml.ts';
import { inlineEpubCss, createCssInlineState } from './inlineCss.ts';
import {
  convertBareImageElements,
  extractBodyContent,
  extractChapterTitle,
  inlineMarkupResources,
  normalizeSvgCovers,
  scanTokens,
  parseAttributes,
} from './markup.ts';
import { archiveDirname, resolveZipPath } from './zipPaths.ts';

export interface ChapterDocument {
  /** Chapter title, preferring the book's own navigation metadata. */
  title: string;
  /** Sanitised body markup, without any wrapper element. */
  body: string;
  /**
   * Book CSS with every local resource embedded as a data URI, split per
   * source stylesheet. Continuous mode concatenates the union across chapters
   * and de-duplicates by path, so a shared `book.css` is emitted once.
   */
  stylesheets: { path: string; css: string }[];
  /** Convenience join of `stylesheets`. */
  css: string;
  /** Number of images embedded into the body (diagnostics / QA harness). */
  imageCount: number;
  /** Number of @font-face declarations preserved (diagnostics / QA harness). */
  fontCount: number;
}

export interface ExtractChapterOptions {
  /**
   * Title from the OPF navigation document (EPUB 3 `nav`, then NCX). It wins when
   * it says something specific; a placeholder like "Chapter 3" yields to a real
   * chapter heading in the content document.
   */
  navigationTitle?: string;
}

interface CssChunk {
  /** Inline CSS text, or null when the sheet has to be read from the archive. */
  css: string | null;
  /** Archive path the sheet came from; the base for its relative URLs. */
  path: string;
}

/**
 * Collects the stylesheets a content document declares: inline `<style>` blocks
 * and `<link rel="stylesheet">` references, in document order.
 */
function collectStylesheets(document: string, chapterPath: string): CssChunk[] {
  const tokens = scanTokens(document, { opaque: new Set() });
  const chapterDir = archiveDirname(chapterPath);
  const chunks: CssChunk[] = [];

  for (const token of tokens) {
    if (token.closing) continue;
    if (token.lower === 'style') {
      // The tokenizer skips raw-text content, so read the body directly.
      const close = document.toLowerCase().indexOf('</style', token.end);
      const end = close === -1 ? document.length : close;
      const css = document.slice(token.end, end);
      if (css.trim()) chunks.push({ css, path: chapterPath });
      continue;
    }
    if (token.lower !== 'link') continue;
    const attributes = parseAttributes(token.attrs);
    const rel = attributes.find((a) => a.name === 'rel')?.value ?? '';
    const href = attributes.find((a) => a.name === 'href')?.value;
    if (!href || !/\bstylesheet\b/i.test(rel)) continue;
    if (/^(?:https?:|\/\/|data:)/i.test(href)) continue;
    const path = resolveZipPath(chapterDir, href);
    if (path) chunks.push({ css: null, path });
  }

  return chunks;
}

const FONT_FACE = /@font-face/gi;

/**
 * Placeholder labels publishers put in their own navigation document.
 *
 * `Chapter 3` in an NCX carries no information, so it must not beat a real
 * chapter heading found in the content document.
 */
function isGenericChapterTitle(title: string): boolean {
  const normalized = title.replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  return /^(?:chapter|part|book|section|appendix|front\s*matter)\b[\s\d.,:;ivxlcdm]*$/i.test(normalized);
}

/**
 * Resolves the chapter title.
 *
 * Order: the book's own navigation metadata (EPUB 3 `nav`, then NCX) when it says
 * something specific; otherwise the first real body heading; otherwise the
 * document `<title>`; otherwise whatever placeholder we started with.
 */
export function resolveChapterTitle(
  navigationTitle: string | undefined,
  heading: { title: string; source: string }
): string {
  const nav = navigationTitle?.trim();
  if (nav && !isGenericChapterTitle(nav)) return nav;
  if (heading.title) return heading.title;
  return nav || 'Chapter';
}

/**
 * Assembles one chapter.
 *
 * Pass order:
 *  1. stylesheets  — read + inline CSS with `@import` chains resolved and every
 *     local `url()` (images *and* fonts) embedded as a data URI;
 *  2. resources    — inline `src`, `xlink:href` and inline `style="…url(…)"`;
 *  3. SVG covers   — replace cover-only `<svg><image/></svg>` with `<img>`,
 *     leaving every other inline SVG untouched;
 *  4. body         — extract `<body>` with the comment/CDATA-aware scanner;
 *  5. sanitise     — strip active content, keep semantics, MathML and SVG.
 */
export async function extractChapterDocument(
  archive: EpubArchive,
  chapterPath: string,
  options: ExtractChapterOptions = {}
): Promise<ChapterDocument> {
  const document = await archive.readText(chapterPath);
  if (!document) {
    return {
      title: options.navigationTitle || 'Chapter',
      body: '<p>Content not found.</p>',
      stylesheets: [],
      css: '',
      imageCount: 0,
      fontCount: 0,
    };
  }

  const chapterDir = archiveDirname(chapterPath);

  // 1. Stylesheets
  const chunks = collectStylesheets(document, chapterPath);
  const cssState = createCssInlineState();
  const stylesheets: { path: string; css: string }[] = [];
  for (const chunk of chunks) {
    const raw = chunk.css !== null ? chunk.css : await archive.readText(chunk.path);
    if (!raw || !raw.trim()) continue;
    const inlined = await inlineEpubCss(raw, chunk.path, archive, cssState);
    if (inlined.trim()) stylesheets.push({ path: chunk.path, css: inlined });
  }
  const css = stylesheets.map((sheet) => sheet.css).join('\n');

  // 2. Resources inside the markup
  const withResources = await inlineMarkupResources(document, chapterDir, archive);

  // 3. SVG covers + bare <image> elements
  const withImages = convertBareImageElements(normalizeSvgCovers(withResources));

  // 4. Body
  const body = extractBodyContent(withImages);

  // 5. Sanitise
  const sanitized = sanitizeHtml(body.content);

  const imageCount = (sanitized.match(/<img\b/gi) || []).length + (sanitized.match(/<image\b/gi) || []).length;
  const fontCount = (css.match(FONT_FACE) || []).length;

  const heading = extractChapterTitle(withImages);
  const title = resolveChapterTitle(options.navigationTitle, heading);

  return { title, body: sanitized, stylesheets, css, imageCount, fontCount };
}