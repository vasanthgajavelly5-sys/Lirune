/**
 * Lirune Reader Mobile — EPUB content-document markup handling
 *
 * Everything that happens to a chapter document between "read bytes out of the
 * ZIP" and "sanitise and hand to the WebView" lives here:
 *
 *   - robust `<body>` extraction that survives comments, CDATA sections,
 *     `<script>`/`<style>` raw text and `</body>` appearing inside them
 *   - resource inlining for `src`, `xlink:href` and `url()` inside inline
 *     `style` attributes (background-image, list-style-image, borders …)
 *   - bounded SVG handling: cover wrappers become `<img>`, every other inline SVG
 *     is left intact so diagrams keep rendering
 *   - chapter title extraction that prefers real chapter headings over the
 *     `<title>` element (which is frequently just the book title, repeated)
 *
 * The scanner below is a single-pass state machine. It is used in place of the
 * chained `[\s\S]*?` regular expressions this engine used previously, which could
 * backtrack catastrophically on a malformed or hostile document.
 */

import { resolveZipPath } from './zipPaths.ts';
import type { EpubArchive } from './archive.ts';

/* -------------------------------------------------------------------------- */
/* tokenizer                                                                   */
/* -------------------------------------------------------------------------- */

/** Elements whose content is raw text and must never be scanned as markup. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

/** Elements dropped together with their content. */
const OPAQUE_ELEMENTS = new Set(['script', 'noscript']);

export interface TagToken {
  /** Offset of `<` in the source. */
  start: number;
  /** Offset just past `>`. */
  end: number;
  /** Tag name with original case. */
  name: string;
  /** Lower-cased tag name. */
  lower: string;
  /** Raw attribute text between the name and the closing `>` / `/>`. */
  attrs: string;
  closing: boolean;
  selfClosing: boolean;
}

/** Attributes whose value span is tracked so a replacement can be spliced in. */
export interface Attribute {
  name: string;
  /** Original case, used when rewriting. */
  rawName: string;
  value: string | null;
  quote: '"' | "'" | '';
  /** Offset of the value inside the source document. */
  valueStart: number;
  valueEnd: number;
}

const ATTRIBUTE_NAME_STOP = /[\s=/>]/;

/**
 * Parses the attributes of a start tag, recording the exact source span of each
 * value so a replacement can be spliced in without re-serialising the tag.
 *
 * `offset` is the position of `attrs[0]` inside the original document.
 */
export function parseAttributes(attrs: string, offset = 0): Attribute[] {
  const result: Attribute[] = [];
  let i = 0;
  while (i < attrs.length) {
    while (i < attrs.length && /[\s/]/.test(attrs[i])) i++;
    if (i >= attrs.length) break;

    const nameStart = i;
    while (i < attrs.length && !ATTRIBUTE_NAME_STOP.test(attrs[i])) i++;
    const rawName = attrs.slice(nameStart, i);
    if (!rawName) {
      i++;
      continue;
    }
    const name = rawName.toLowerCase();

    let j = i;
    while (j < attrs.length && /[\s]/.test(attrs[j])) j++;
    if (attrs[j] !== '=') {
      result.push({ name, rawName, value: null, quote: '', valueStart: 0, valueEnd: 0 });
      continue;
    }
    j++;
    while (j < attrs.length && /\s/.test(attrs[j])) j++;

    const quoteChar = attrs[j];
    if (quoteChar === '"' || quoteChar === "'") {
      const close = attrs.indexOf(quoteChar, j + 1);
      const stop = close === -1 ? attrs.length : close;
      result.push({
        name,
        rawName,
        value: attrs.slice(j + 1, stop),
        quote: quoteChar,
        valueStart: offset + j + 1,
        valueEnd: offset + stop,
      });
      i = stop + 1;
      continue;
    }

    const valueStart = j;
    while (j < attrs.length && !/[\s>]/.test(attrs[j])) j++;
    result.push({
      name,
      rawName,
      value: attrs.slice(valueStart, j),
      quote: '',
      valueStart: offset + valueStart,
      valueEnd: offset + j,
    });
    i = j;
  }
  return result;
}

interface ScanOptions {
  /** Drop these elements along with their content. */
  opaque?: Set<string>;
}

/**
 * Walks a content document and returns every markup token.
 *
 * Comments, CDATA sections, doctypes and raw-text element contents are skipped,
 * so a `</body>` inside a script string can never be mistaken for the real one.
 */
export function scanTokens(html: string, options: ScanOptions = {}): TagToken[] {
  const opaque = options.opaque ?? OPAQUE_ELEMENTS;
  const tokens: TagToken[] = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    // Comment
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    // CDATA / bogus comment
    if (html.startsWith('<![CDATA[', lt)) {
      const end = html.indexOf(']]>', lt + 9);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    // Closing tag
    if (html[lt + 1] === '/') {
      const end = html.indexOf('>', lt);
      const stop = end === -1 ? html.length : end + 1;
      const name = html.slice(lt + 2, stop - 1).trim();
      tokens.push({
        start: lt,
        end: stop,
        name: name.split(/\s/)[0] || '',
        lower: name.split(/\s/)[0].toLowerCase(),
        attrs: '',
        closing: true,
        selfClosing: false,
      });
      i = stop;
      continue;
    }

    const end = findTagEnd(html, lt);
    if (end <= lt) {
      // Unterminated tag: treat the `<` as text and keep scanning.
      i = lt + 1;
      continue;
    }
    const raw = html.slice(lt + 1, end);
    const selfClosing = /\/\s*$/.test(raw);
    const nameMatch = /^([^\s/>]+)/.exec(raw);
    const name = nameMatch ? nameMatch[1] : '';
    const token: TagToken = {
      start: lt,
      end: end + 1,
      name,
      lower: name.toLowerCase(),
      attrs: raw.slice(name.length, selfClosing ? raw.length - 1 : undefined),
      closing: false,
      selfClosing,
    };
    tokens.push(token);
    i = end + 1;

    if (RAW_TEXT_ELEMENTS.has(token.lower) && !selfClosing) {
      // Skip the raw text body: its content is never markup.
      const closeTag = `</${token.lower}`;
      const at = html.toLowerCase().indexOf(closeTag, i);
      i = at === -1 ? html.length : at;
      continue;
    }
    if (opaque.has(token.lower) && !selfClosing) {
      const closeTag = `</${token.lower}`;
      const at = html.toLowerCase().indexOf(closeTag, i);
      i = at === -1 ? html.length : at;
    }
  }

  return tokens;
}

/** Index of the `>` that closes the tag starting at `start`, quote-aware. */
function findTagEnd(html: string, start: number): number {
  let i = start + 1;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < html.length && html[j] !== ch) j++;
      if (j >= html.length) return html.length - 1;
      i = j + 1;
      continue;
    }
    if (ch === '>') return i;
    if (ch === '<') return i - 1; // malformed: this tag is unterminated
    i++;
  }
  return html.length - 1;
}

/**
 * Index of the token that closes the element opened at `openIndex`, or -1.
 *
 * Depth-aware, so `<h2><span>a</span></h2>` closes at the `</h2>` rather than at
 * the nested `</span>`.
 */
export function findElementEnd(tokens: TagToken[], openIndex: number): number {
  const name = tokens[openIndex].lower;
  if (tokens[openIndex].selfClosing) return -1;
  let depth = 0;
  for (let i = openIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.lower !== name) continue;
    if (token.closing) {
      if (depth === 0) return i;
      depth--;
    } else if (!token.selfClosing) {
      depth++;
    }
  }
  return -1;
}

/** Inner markup of the element opened at `openIndex`. */
export function elementInner(html: string, tokens: TagToken[], openIndex: number): string {
  const open = tokens[openIndex];
  const close = findElementEnd(tokens, openIndex);
  return html.slice(open.end, close === -1 ? html.length : tokens[close].start);
}

/* -------------------------------------------------------------------------- */
/* body extraction                                                             */
/* -------------------------------------------------------------------------- */

export interface BodyExtraction {
  /** Attribute text of the `<body>` tag, e.g. ` class="x" epub:type="bodymatter"`. */
  bodyAttrs: string;
  /** Inner markup of `<body>`. */
  content: string;
  found: boolean;
}

/**
 * Extracts `<body>` content from an EPUB content document.
 *
 * The document is tokenised first, so a `</body>` inside a comment, a CDATA
 * section or a `<script>` string is skipped instead of ending the body early.
 * Documents without a `<body>` (some malformed real-world files) fall back to
 * the whole document minus `<head>`.
 */
export function extractBodyContent(html: string): BodyExtraction {
  const tokens = scanTokens(html, { opaque: new Set() });

  let bodyStart = -1;
  let bodyEnd = -1;
  let bodyToken: TagToken | null = null;
  let headEnd = -1;

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];
    if (token.lower === 'body' && !token.closing) {
      if (bodyStart === -1) {
        bodyStart = token.end;
        bodyToken = token;
      }
      continue;
    }
    if (token.lower === 'body' && token.closing && bodyStart !== -1 && bodyEnd === -1) {
      bodyEnd = token.start;
      break;
    }
    if (token.lower === 'head' && token.closing && headEnd === -1) {
      headEnd = token.start;
    }
  }

  if (bodyStart !== -1) {
    return {
      bodyAttrs: bodyToken ? bodyToken.attrs.trim() : '',
      content: html.slice(bodyStart, bodyEnd === -1 ? html.length : bodyEnd),
      found: true,
    };
  }

  // No <body>: drop a leading <head> block if present and use the remainder.
  const cut = headEnd === -1 ? 0 : headEnd;
  return { bodyAttrs: '', content: html.slice(cut), found: false };
}

/* -------------------------------------------------------------------------- */
/* inline CSS url() resolution                                                 */
/* -------------------------------------------------------------------------- */

/** Attributes that reference a binary resource and must become data URIs. */
const RESOURCE_ATTRIBUTES = new Set(['src', 'xlink:href', 'href', 'data', 'poster']);

function isInlineableHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith('#')) return true;
  if (/^data:/i.test(href)) return true;
  if (/^(?:https?|blob|about|file|ftp|mailto|tel|javascript|vbscript):/i.test(href)) return false;
  if (href.startsWith('//')) return false;
  return true;
}

function cssUnescape(value: string): string {
  return value.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
  });
}

/**
 * Inline style values reach us straight from the document, so a quote inside a
 * `url()` may still be entity-encoded. Decode both layers before deciding what
 * the reference actually points at.
 */
function decodeUrlValue(value: string): string {
  return cssUnescape(
    value
      .replace(/&quot;|&#0*34;|&#x0*22;/gi, '"')
      .replace(/&apos;|&#0*39;|&#x0*27;/gi, "'")
      .replace(/&amp;/gi, '&')
  );
}

/** Rewrites every `url(...)` in an inline style declaration. */
export async function inlineStyleUrls(
  style: string,
  baseDir: string,
  archive: EpubArchive
): Promise<string> {
  if (!/url\s*\(/i.test(style)) return style;

  const matches: { start: number; end: number; raw: string }[] = [];
  let i = 0;
  while (i < style.length) {
    const at = style.toLowerCase().indexOf('url(', i);
    if (at === -1) break;
    let j = at + 4;
    let quote: string | null = null;
    while (j < style.length) {
      const c = style[j];
      if (quote) {
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ')') break;
      j++;
    }
    if (j >= style.length) break;
    const raw = style
      .slice(at + 4, j)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    matches.push({ start: at, end: j + 1, raw });
    i = j + 1;
  }
  if (matches.length === 0) return style;

  const resolutions = await Promise.all(
    matches.map(async ({ raw }) => {
      // Quotes may be literal or entity-encoded, so decode first and unwrap after.
      const href = decodeUrlValue(raw)
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .trim();
      if (!isInlineableHref(href)) return null;
      // Fragments and inline data URIs are returned verbatim: re-wrapping them
      // would only re-encode the quotes they already carry.
      if (href.startsWith('#') || /^data:/i.test(href)) return raw;
      const path = resolveZipPath(baseDir, href);
      if (!path) return null;
      return (await archive.dataUri(path)) ?? null;
    })
  );

  let out = '';
  let cursor = 0;
  for (let m = 0; m < matches.length; m++) {
    const resolved = resolutions[m];
    out += style.slice(cursor, matches[m].start);
    out += resolved === null ? '' : `url("${resolved.replace(/"/g, '\\"')}")`;
    cursor = matches[m].end;
  }
  out += style.slice(cursor);
  return out;
}

/**
 * Rewrites every resource reference in a content document: `src`, `xlink:href`
 * and `url()` inside `style` attributes.
 *
 * `href` on anchors is deliberately left alone: the reader drives navigation from
 * the OPF spine, and rewriting chapter links would inline unrelated chapters.
 */
export async function inlineMarkupResources(
  html: string,
  baseDir: string,
  archive: EpubArchive
): Promise<string> {
  const tokens = scanTokens(html);
  if (tokens.length === 0) return html;

  const edits: { start: number; end: number; value: string }[] = [];

  for (const token of tokens) {
    if (token.closing || !token.attrs) continue;
    // `attrs` begins immediately after the tag name, so the attribute value spans
    // have to be offset into document coordinates.
    const attributeOffset = token.start + 1 + token.name.length;
    const attributes = parseAttributes(token.attrs, attributeOffset);
    const values = await Promise.all(
      attributes.map(async (attribute) => {
        if (attribute.value === null) return null;
        if (attribute.name === 'style') {
          const inlined = await inlineStyleUrls(attribute.value, baseDir, archive);
          return inlined === attribute.value ? null : inlined;
        }
        if (!RESOURCE_ATTRIBUTES.has(attribute.name)) return null;
        if (attribute.name === 'href' && token.lower !== 'image') return null;
        const href = attribute.value.trim();
        if (!isInlineableHref(href)) return null;
        if (href.startsWith('#') || /^data:/i.test(href)) return null;
        const path = resolveZipPath(baseDir, href);
        if (!path) return null;
        return (await archive.dataUri(path)) ?? null;
      })
    );

    attributes.forEach((attribute, index) => {
      const value = values[index];
      if (value === null) return;
      if (attribute.valueEnd <= attribute.valueStart) return;
      // The replacement is spliced between the attribute's own quote characters,
      // so a quote in the new value has to be entity-encoded for that delimiter.
      const escaped =
        attribute.quote === "'" ? value.replace(/'/g, '&#39;') : value.replace(/"/g, '&quot;');
      edits.push({ start: attribute.valueStart, end: attribute.valueEnd, value: escaped });
    });
  }

  if (edits.length === 0) return html;

  let out = '';
  let cursor = 0;
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    if (edit.start < cursor) continue;
    out += html.slice(cursor, edit.start) + edit.value;
    cursor = edit.end;
  }
  out += html.slice(cursor);
  return out;
}

/* -------------------------------------------------------------------------- */
/* SVG                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Upper bound on how much of an `<svg>` element the cover transform will look at.
 * A cover is a thin wrapper around one image; anything larger is a diagram and
 * must be left alone. This bound is what keeps a hostile 10 MB "SVG" from
 * turning into a long backtracking scan.
 */
const SVG_SCAN_BUDGET = 96 * 1024;

/**
 * Replaces full-page SVG cover wrappers with a plain `<img>`.
 *
 * Many EPUB covers ship as `<svg><image xlink:href="cover.jpg"/></svg>`. WebViews
 * render that inconsistently (and Android's often renders nothing), so the reader
 * converts it. Crucially this only fires when the SVG contains nothing but an
 * image — an inline SVG diagram or illustration is left byte-for-byte intact.
 */
export function normalizeSvgCovers(html: string): string {
  const tokens = scanTokens(html);
  if (tokens.length === 0) return html;

  interface SvgRange {
    start: number;
    openEnd: number;
    closeStart: number;
    end: number;
  }

  const ranges: SvgRange[] = [];
  const stack: number[] = [];
  for (const token of tokens) {
    if (token.lower !== 'svg') continue;
    if (token.closing) {
      const open = stack.pop();
      if (open !== undefined) {
        ranges[open].closeStart = token.start;
        ranges[open].end = token.end;
      }
      continue;
    }
    if (token.selfClosing) continue;
    stack.push(ranges.length);
    ranges.push({ start: token.start, openEnd: token.end, closeStart: -1, end: -1 });
  }

  const edits: { start: number; end: number; value: string }[] = [];
  let coveredUntil = -1;
  for (const range of ranges) {
    if (range.closeStart === -1) continue;
    // A range nested inside one already replaced needs no work of its own.
    if (range.start < coveredUntil) continue;
    if (range.end - range.start > SVG_SCAN_BUDGET) continue;
    const replacement = buildCoverReplacement(html.slice(range.openEnd, range.closeStart));
    if (!replacement) continue;
    edits.push({ start: range.start, end: range.end, value: replacement });
    coveredUntil = range.end;
  }

  if (edits.length === 0) return html;

  let out = '';
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    out += html.slice(cursor, edit.start) + edit.value;
    cursor = edit.end;
  }
  out += html.slice(cursor);
  return out;
}

function buildCoverReplacement(inner: string): string | null {
  const tags = scanTokens(inner);
  if (tags.length !== 1) return null;
  const image = tags[0];
  if (image.lower !== 'image' || image.closing) return null;
  const attributes = parseAttributes(image.attrs);
  const hrefAttribute =
    attributes.find((a) => a.name === 'xlink:href') ?? attributes.find((a) => a.name === 'href');
  const href = hrefAttribute?.value;
  if (!href) return null;
  const alt = attributes.find((a) => a.name === 'alt')?.value ?? '';
  return (
    `<div class="epub-cover-container">` +
    `<img src="${escapeAttribute(href)}" alt="${escapeAttribute(alt)}" ` +
    `style="max-width:100%;max-height:80vh;object-fit:contain;margin:auto;display:block;" />` +
    `</div>`
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Converts bare `<image src="…">` elements into `<img>`.
 *
 * A handful of EPUB 2 files emit `<image>` straight into `<body>` instead of
 * wrapping it in `<svg>`. Chromium renders an unknown `<image>` element as
 * nothing at all, so the figure silently disappears. Elements inside a real
 * `<svg>` subtree are left alone — those are legitimate SVG and already render.
 */
export function convertBareImageElements(html: string): string {
  const tokens = scanTokens(html);
  if (tokens.length === 0) return html;

  let svgDepth = 0;
  const edits: { start: number; end: number; value: string }[] = [];

  for (const token of tokens) {
    if (token.lower === 'svg') {
      svgDepth = token.closing ? Math.max(0, svgDepth - 1) : token.selfClosing ? svgDepth : svgDepth + 1;
      continue;
    }
    if (token.lower !== 'image' || token.closing || svgDepth > 0) continue;
    edits.push({
      start: token.start,
      end: token.end,
      value: `<img${token.attrs}${token.selfClosing ? ' /' : ''}>`,
    });
  }

  if (edits.length === 0) return html;

  let out = '';
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    out += html.slice(cursor, edit.start) + edit.value;
    cursor = edit.end;
  }
  out += html.slice(cursor);
  return out;
}

/* -------------------------------------------------------------------------- */
/* title extraction                                                            */
/* -------------------------------------------------------------------------- */

function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ChapterTitleResult {
  title: string;
  /** Where the title came from, for diagnostics and tests. */
  source: 'heading' | 'document-title' | 'none';
}

/**
 * Picks the most chapter-like title for a content document.
 *
 * Order of preference:
 *   1. the first real body heading (h1 → h2 → h3), skipping image-only headings
 *      (publisher logos) and anything inside `<nav>`;
 *   2. `<dc:title>`-style `<title>` element, which many books fill with the
 *      chapter name — and which is skipped when the heading already answered.
 *
 * The previous implementation always preferred `<title>`, which is the book
 * title in most EPUB 2 files, so every chapter showed the same label.
 */
export function extractChapterTitle(html: string): ChapterTitleResult {
  const tokens = scanTokens(html);
  let navDepth = 0;
  const candidates: { level: number; text: string }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.lower === 'nav') {
      if (token.closing) navDepth = Math.max(0, navDepth - 1);
      else if (!token.selfClosing) navDepth++;
      continue;
    }
    const match = /^h([1-6])$/.exec(token.lower);
    if (!match || token.closing || token.selfClosing) continue;
    const level = Number(match[1]);
    if (level > 3) continue;

    if (navDepth > 0) continue;

    const inner = elementInner(html, tokens, i);
    const text = textOf(inner);
    if (!text || text.length > 240) continue;
    // An image-only heading is a publisher logo, not a chapter title.
    if (hasImageOnlyContent(inner)) continue;
    candidates.push({ level, text });
  }

  if (candidates.length > 0) {
    const best = candidates.find((c) => c.level === 1) ?? candidates.find((c) => c.level === 2) ?? candidates[0];
    return { title: best.text, source: 'heading' };
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]{0,400}?)<\/title\s*>/i);
  if (titleMatch) {
    const text = textOf(titleMatch[1]);
    if (text) return { title: text, source: 'document-title' };
  }

  return { title: '', source: 'none' };
}

function hasImageOnlyContent(fragment: string): boolean {
  const tokens = scanTokens(fragment);
  const text = textOf(fragment);
  if (text) return false;
  return tokens.some((token) => token.lower === 'img' || token.lower === 'image' || token.lower === 'svg');
}

/**
 * Elements that carry no text of their own, so the first *meaningful* element of
 * a body can be past them. A publisher logo or a decorative rule before the
 * chapter heading does not make the heading disappear.
 */
const TRANSPARENT_ELEMENTS = new Set([
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'body',
  'span',
  'center',
  'img',
  'image',
  'svg',
  'picture',
  'figure',
  'br',
  'hr',
]);

/** Upper bound on how far into a body this look: a chapter heading is at the top. */
const HEADING_SCAN_LIMIT = 40;

/**
 * True when the first meaningful element of a body is an `h1`–`h3` with text.
 *
 * Continuous mode injects its own chapter header. When the chapter document also
 * opens with its own heading the reader showed the same title twice, so the shell
 * asks this first and hides its header when the book already labels the chapter.
 */
export function startsWithHeading(bodyHtml: string): boolean {
  if (!bodyHtml) return false;
  const tokens = scanTokens(bodyHtml, { opaque: new Set() });
  const limit = Math.min(tokens.length, HEADING_SCAN_LIMIT);

  let cursor = 0;
  let transparentDepth = 0;

  for (let i = 0; i < limit; i++) {
    const token = tokens[i];

    // Any text ahead of the first element means the body does not open with one.
    if (bodyHtml.slice(cursor, token.start).trim()) return false;
    cursor = token.end;

    if (token.closing) {
      if (transparentDepth > 0) transparentDepth--;
      continue;
    }

    if (/^h[1-3]$/.test(token.lower)) {
      const inner = elementInner(bodyHtml, tokens, i);
      const text = textOf(inner);
      if (!text) return false;
      // An image-only heading is a publisher logo, not a chapter title.
      return !hasImageOnlyContent(inner);
    }

    // An anchor only wraps through when it holds no text of its own.
    const transparent =
      TRANSPARENT_ELEMENTS.has(token.lower) ||
      (token.lower === 'a' && !textOf(elementInner(bodyHtml, tokens, i)));
    if (transparent) {
      if (!token.selfClosing) transparentDepth++;
      continue;
    }

    return false;
  }

  return false;
}

/** Strips tags from a fragment for excerpt/plain-text use. */
export function toPlainText(html: string): string {
  return textOf(html);
}