/**
 * Lirune Reader Mobile — EPUB stylesheet inlining
 *
 * The reader injects book CSS straight into a `<style>` element of its own
 * document, so every relative resource has to become self-contained. This module
 * walks the stylesheet once, resolving:
 *
 *   - `@import` chains (relative to the importing file, nested, cycle-safe,
 *     deduplicated, media conditions preserved, cascade order preserved)
 *   - `url()` references in every declaration — images, `@font-face` sources,
 *     backgrounds, list markers — against the archive
 *
 * and stripping the constructs that would turn a book stylesheet into an
 * execution vector.
 *
 * The walk is a single left-to-right scan with an explicit string/comment/block
 * state machine. It never runs a `[\s\S]*?` style search across a whole sheet,
 * so a malformed or hostile stylesheet cannot cause backtracking blowups.
 */

import { resolveZipPath } from './zipPaths.ts';

/** The subset of `EpubArchive` the stylesheet pipeline needs. */
export interface EpubCssResourceSource {
  readText(path: string): Promise<string | null>;
  dataUri(path: string): Promise<string | null>;
}

/** Shared per-document state so one chapter never inlines a sheet twice. */
export interface CssInlineState {
  /** Archive paths already inlined into the current document. */
  seen: Set<string>;
  /** Guard against pathological or hostile `@import` chains. */
  imports: number;
}

export function createCssInlineState(seedPaths: string[] = []): CssInlineState {
  const seen = new Set<string>();
  for (const path of seedPaths) seen.add(path);
  return { seen, imports: 0 };
}

const MAX_IMPORT_DEPTH = 8;
const MAX_IMPORT_TOTAL = 64;
const MAX_NESTING_DEPTH = 12;

/** Declarations that would let book CSS take over the reader chrome. */
const BLOCKED_DECLARATIONS =
  /(?:^|[;{\s])(?:position\s*:\s*fixed|position\s*:\s*sticky|behavior\s*:|-moz-binding\s*:|binding\s*:)/i;

const ACTIVE_DECLARATION = /expression\s*\(|javascript\s*:|-moz-binding|behavior\s*:/i;

/**
 * Layout declarations removed from the reader container rules only. These are
 * the ones that produce the classic EPUB failure modes: a body rule that kills
 * the reader margin, or a fixed-position publisher banner that covers the page
 * indicator. Rules targeting real content are left completely alone.
 */
const CONTAINER_BLOCKED_PROPERTIES =
  /^(?:background|background-color|background-image|width|min-width|max-width|height|min-height|max-height|margin|margin-top|margin-right|margin-bottom|margin-left|position|inset|top|right|bottom|left|transform|overflow|overflow-x|overflow-y|display)\b/i;

/** Pagination hints that are meaningless on the reader container itself. */
const CONTAINER_BREAK_PROPERTY = /^(?:break-(?:before|after|inside)|page-break-(?:before|after|inside))\s*:\s*(?:page|always|left|right|recto|verso|avoid-page)/i;

const PLACEHOLDER_PREFIX = '\u0001';
const PLACEHOLDER_SUFFIX = '\u0001';
const MAX_URL_REFS = 512;

/* -------------------------------------------------------------------------- */
/* low level scanners                                                          */
/* -------------------------------------------------------------------------- */

/** Index just past the end of a CSS comment starting at `start`, or css.length. */
function skipComment(css: string, start: number): number {
  const end = css.indexOf('*/', start + 2);
  return end === -1 ? css.length : end + 2;
}

/** Index just past the closing quote of the string starting at `start`. */
function skipString(css: string, start: number): number {
  const quote = css[start];
  let i = start + 1;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    // An unterminated string ends at the newline; never swallow the rest of the
    // stylesheet because of one bad quote.
    if (ch === '\n') return i;
    i++;
  }
  return css.length;
}

/** Index just past the `}` matching the `{` at `start`, or css.length. */
function matchBlock(css: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      i = skipComment(css, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return css.length;
}

/** Splits a declaration list on top-level `;`. */
function splitDeclarations(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let i = 0;
  let start = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '/' && body[i + 1] === '*') {
      i = skipComment(body, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(body, i);
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(body.slice(start));
  return parts;
}

/** Splits a selector list on top-level commas. */
function splitSelectors(selectorList: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let i = 0;
  let start = 0;
  while (i < selectorList.length) {
    const ch = selectorList[i];
    if (ch === '"' || ch === "'") {
      i = skipString(selectorList, i);
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(selectorList.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(selectorList.slice(start));
  return parts;
}

/* -------------------------------------------------------------------------- */
/* url() references                                                            */
/* -------------------------------------------------------------------------- */

interface UrlRef {
  placeholder: string;
  raw: string;
  baseDir: string;
}

/**
 * Replaces every `url(...)` token in `text` with a placeholder and records the
 * reference so it can be resolved against the right base directory.
 *
 * The scan is explicit rather than regex-based because `url("data:image/svg+xml…")`
 * may legitimately contain parentheses inside the quoted value.
 */
function collectUrlRefs(
  text: string,
  baseDir: string,
  refs: UrlRef[],
  nextIndex: { value: number }
): string {
  if (nextIndex.value >= MAX_URL_REFS) return text;
  let out = '';
  let cursor = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '*') {
      i = skipComment(text, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(text, i);
      continue;
    }
    if ((ch === 'u' || ch === 'U') && (text[i + 1] === 'r' || text[i + 1] === 'R') && text[i + 2] === 'l' && text[i + 3] === '(') {
      let j = i + 4;
      let quote: string | null = null;
      while (j < text.length) {
        const c = text[j];
        if (quote) {
          if (c === '\\') {
            j += 2;
            continue;
          }
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ')') break;
        else if (c === '\n') break;
        j++;
      }
      if (j >= text.length) break; // unterminated url() — leave the rest alone
      const raw = text.slice(i + 4, j).trim().replace(/^['"]|['"]$/g, '');
      const placeholder = `${PLACEHOLDER_PREFIX}u${nextIndex.value}${PLACEHOLDER_SUFFIX}`;
      nextIndex.value++;
      out += text.slice(cursor, i) + placeholder;
      cursor = j + 1;
      i = j + 1;
      refs.push({ placeholder, raw, baseDir });
      continue;
    }
    i++;
  }

  out += text.slice(cursor);
  return out;
}

/** URLs the reader must never rewrite. */
function isOpaqueOrInlineUri(raw: string): 'keep' | 'drop' | null {
  if (!raw) return 'drop';
  if (raw.startsWith('#')) return 'keep'; // SVG filter / gradient fragment
  if (/^data:/i.test(raw)) return 'keep';
  if (/^(?:https?|blob|about|file|ftp|mailto|tel|javascript|vbscript):/i.test(raw)) return 'drop';
  if (raw.startsWith('//')) return 'drop';
  return null;
}

/** Wraps a resolved reference back into a CSS `url("…")` token. */
function toUrlToken(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `url("${escaped}")`;
}

async function resolveUrlRef(
  ref: UrlRef,
  source: EpubCssResourceSource
): Promise<string | null> {
  const verdict = isOpaqueOrInlineUri(ref.raw);
  if (verdict === 'keep') return toUrlToken(ref.raw);
  if (verdict === 'drop') return null;
  const path = resolveZipPath(ref.baseDir, ref.raw);
  if (!path) return null;
  const uri = await source.dataUri(path);
  return uri ? toUrlToken(uri) : null;
}

/* -------------------------------------------------------------------------- */
/* selector + declaration rewriting                                            */
/* -------------------------------------------------------------------------- */

/**
 * Republishes `html` / `body` rules against the reader's own content container.
 *
 * A publisher `body { margin: 0; background: #fff }` would otherwise strip the
 * reading margin or paint over the theme. Class specificity also means the rule
 * outranks the original element selector, which is what keeps the reader
 * geometry intact without `!important`.
 */
function rewriteSelector(selector: string): string {
  const rewritten = selector.replace(
    /(^|[\s>+~,(])(?:html|body)(?=[\s>+~,.:#[]|$)/gi,
    '$1.epub-content'
  );
  return rewritten.replace(/\.epub-content\s+\.epub-content/g, '.epub-content').trim();
}

function isReaderContainerSelector(selector: string): boolean {
  const normalized = selector.replace(/\s+/g, ' ').trim();
  return (
    normalized === '.epub-content' ||
    normalized === '#book-content' ||
    normalized === '#continuous-container' ||
    normalized === '#viewport' ||
    normalized === 'html' ||
    normalized === 'body'
  );
}

interface DeclarationContext {
  source: EpubCssResourceSource;
  baseDir: string;
  refs: UrlRef[];
  nextIndex: { value: number };
  /** @font-face / @page blocks must keep every descriptor the book declared. */
  preserveLayout: boolean;
}

function sanitizeDeclaration(raw: string, ctx: DeclarationContext): string {
  const declaration = raw.trim();
  if (!declaration) return '';

  // Active content never survives, in any block type.
  if (ACTIVE_DECLARATION.test(declaration)) return '';

  const colon = declaration.indexOf(':');
  const property = colon === -1 ? '' : declaration.slice(0, colon).trim();

  if (!ctx.preserveLayout) {
    if (BLOCKED_DECLARATIONS.test(declaration)) return '';
    if (CONTAINER_BREAK_PROPERTY.test(declaration)) return '';
    if (property && CONTAINER_BLOCKED_PROPERTIES.test(property)) return '';
  }

  return collectUrlRefs(declaration, ctx.baseDir, ctx.refs, ctx.nextIndex);
}

function transformDeclarations(body: string, ctx: DeclarationContext): string {
  const kept = splitDeclarations(body)
    .map((declaration) => sanitizeDeclaration(declaration, ctx))
    .filter(Boolean);
  return kept.length ? `${kept.join(';')};` : '';
}

/* -------------------------------------------------------------------------- */
/* @import                                                                     */
/* -------------------------------------------------------------------------- */

const IMPORT_STATEMENT =
  /^@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)|"([^"]*)"|'([^']*)')([^;]*)$/i;

interface ImportRequest {
  href: string;
  media: string;
}

function parseImportStatement(statement: string): ImportRequest | null {
  const match = statement.replace(/\s+/g, ' ').trim().match(IMPORT_STATEMENT);
  if (!match) return null;
  const href = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '';
  if (!href.trim()) return null;
  const media = (match[6] || '').trim();
  return { href: href.trim(), media };
}

/* -------------------------------------------------------------------------- */
/* the walk                                                                    */
/* -------------------------------------------------------------------------- */

const MEDIA_RULES = new Set(['media', 'supports', 'document', 'layer', 'scope', 'container']);
const DECLARATION_BLOCK_RULES = new Set([
  'font-face',
  'page',
  'viewport',
  'counter-style',
  'property',
  'font-palette-values',
  'position-try',
]);

interface WalkContext extends DeclarationContext {
  state: CssInlineState;
  depth: number;
}

async function transformStylesheet(css: string, ctx: WalkContext): Promise<string> {
  const out: string[] = [];
  let i = 0;
  // `start` tracks the beginning of the current prelude so the scanner slices
  // instead of concatenating character by character.
  let start = 0;

  const emit = (value: string) => {
    if (value) out.push(value);
  };

  while (i < css.length) {
    const ch = css[i];

    if (ch === '/' && css[i + 1] === '*') {
      i = skipComment(css, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }
    if (ch === '{') {
      const stop = matchBlock(css, i);
      const body = css.slice(i + 1, stop - 1);
      const selector = css.slice(start, i).trim();
      start = stop;
      i = stop;

      if (ctx.depth >= MAX_NESTING_DEPTH) {
        emit(`${selector}{}`);
        continue;
      }

      const atRule = selector.match(/^@([a-z-]+)/i);
      const keyword = atRule ? atRule[1].toLowerCase() : '';

      if (atRule && MEDIA_RULES.has(keyword)) {
        // Conditional group rules: recurse so nested url()/@import still resolve.
        const inner = await transformStylesheet(body, { ...ctx, depth: ctx.depth + 1 });
        emit(`${selector}{${inner}}`);
        continue;
      }
      if (atRule && DECLARATION_BLOCK_RULES.has(keyword)) {
        // @font-face descriptors (family/weight/style/stretch/unicode-range) are
        // preserved verbatim; only the src url() is rewritten.
        const inner = transformDeclarations(body, { ...ctx, preserveLayout: true });
        if (keyword === 'font-face') {
          // A book whose embedded font file is missing (a broken container entry, a
          // publisher bug) must not hold the text invisible for the font-load
          // timeout: `swap` paints the fallback immediately.
          emit(`${selector}{font-display:swap;${inner}}`);
          continue;
        }
        emit(`${selector}{${inner}}`);
        continue;
      }
      if (atRule) {
        // @keyframes and anything else: keep the structure, resolve references.
        const inner = await transformStylesheet(body, { ...ctx, depth: ctx.depth + 1 });
        emit(`${selector}{${inner}}`);
        continue;
      }

      const selectors = splitSelectors(selector).map(rewriteSelector).filter(Boolean);
      if (selectors.length === 0) continue;
      const isContainer = selectors.every(isReaderContainerSelector);
      const inner = transformDeclarations(body, { ...ctx, preserveLayout: !isContainer });
      emit(`${selectors.join(',')}{${inner}}`);
      continue;
    }
    if (ch === '}') {
      // Stray close brace in malformed CSS: drop it rather than let it unbalance
      // the reader's own stylesheet.
      i++;
      start = i;
      continue;
    }
    if (ch === ';') {
      const statement = css.slice(start, i).trim();
      start = i + 1;
      i++;

      if (!statement.startsWith('@')) {
        if (!ACTIVE_DECLARATION.test(statement)) emit(`${statement};`);
        continue;
      }
      const atRule = statement.match(/^@([a-z-]+)/i);
      const keyword = atRule ? atRule[1].toLowerCase() : '';

      if (keyword === 'import') {
        const replacement = await resolveImportStatement(statement, ctx);
        if (replacement) emit(replacement);
        continue;
      }
      if (keyword === 'charset') {
        // The injected <style> is UTF-8; a stale @charset would mis-declare it.
        continue;
      }
      if (ACTIVE_DECLARATION.test(statement)) continue;
      emit(`${statement};`);
      continue;
    }

    i++;
  }

  const tail = css.slice(start).trim();
  if (tail) {
    if (tail.startsWith('@import')) {
      const replacement = await resolveImportStatement(tail, ctx);
      if (replacement) emit(replacement);
    } else if (!ACTIVE_DECLARATION.test(tail)) {
      emit(`${tail};`);
    }
  }

  return out.join('');
}

/**
 * Replaces one `@import` with the imported sheet's content, in place, so the
 * cascade order of the original stylesheet is preserved exactly.
 */
async function resolveImportStatement(statement: string, ctx: WalkContext): Promise<string> {
  const request = parseImportStatement(statement);
  if (!request) return '';

  const verdict = isOpaqueOrInlineUri(request.href);
  if (verdict === 'keep') return ''; // @import url(data:…) is never useful here
  if (verdict === 'drop') return '';

  const { state } = ctx;
  if (state.imports >= MAX_IMPORT_TOTAL || ctx.depth >= MAX_IMPORT_DEPTH) return '';

  const path = resolveZipPath(ctx.baseDir, request.href);
  if (!path || state.seen.has(path)) return ''; // cycle or duplicate
  state.imports++;

  let content: string | null = null;
  try {
    content = await ctx.source.readText(path);
  } catch {
    content = null;
  }
  if (!content) return '';

  state.seen.add(path);
  const importedDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const inner = await transformStylesheet(content, {
    ...ctx,
    baseDir: importedDir,
    depth: ctx.depth + 1,
  });
  // `path` stays in `state.seen` for the rest of the document: that single set is
  // both the cycle guard and the duplicate-import dedupe. Re-inlining an identical
  // stylesheet cannot change the outcome, only the size of the document.

  // A media condition is preserved by re-wrapping the imported rules, so a
  // `print.css` import cannot repaint the screen edition.
  const media = request.media;
  if (media && !/^(all|screen)\b/i.test(media)) {
    return `@media ${media}{${inner}}`;
  }
  return inner;
}

/* -------------------------------------------------------------------------- */
/* entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Neutralises anything that could terminate the reader's own `<style>` element.
 * `content: "</style><script>…"` is the classic breakout, and CSS understands
 * the `\00003c` escape as `<`.
 */
function neutraliseTagBreakout(css: string): string {
  return css.replace(/</g, '\\00003c ');
}

async function resolvePlaceholders(css: string, refs: UrlRef[], source: EpubCssResourceSource): Promise<string> {
  if (refs.length === 0) return css;

  // Resolve each distinct (directory, url) pair once, in parallel.
  const unique = new Map<string, UrlRef>();
  for (const ref of refs) {
    const key = `${ref.baseDir}\u0000${ref.raw}`;
    if (!unique.has(key)) unique.set(key, ref);
  }
  const uniqueRefs = [...unique.values()];
  const values = await Promise.all(
    uniqueRefs.map(async (ref) => {
      try {
        return await resolveUrlRef(ref, source);
      } catch {
        return null;
      }
    })
  );
  const tokenByUniqueKey = new Map<string, string>();
  uniqueRefs.forEach((ref, index) => {
    tokenByUniqueKey.set(`${ref.baseDir}\u0000${ref.raw}`, values[index] ?? '');
  });

  // Placeholders were emitted in `refs` order, so a single forward pass swaps
  // them without needing to search the whole string each time.
  let out = '';
  let cursor = 0;
  for (const ref of refs) {
    const at = css.indexOf(ref.placeholder, cursor);
    if (at === -1) continue;
    out += css.slice(cursor, at) + tokenByUniqueKey.get(`${ref.baseDir}\u0000${ref.raw}`);
    cursor = at + ref.placeholder.length;
  }
  out += css.slice(cursor);
  return out;
}

/**
 * Inlines an EPUB stylesheet: resolves `@import`, embeds local resources as data
 * URIs and strips reader-hostile declarations.
 *
 * @param css      Raw CSS text read from the archive (or from an inline `<style>`).
 * @param cssPath  Archive path the CSS came from, used as the base for relative URLs.
 * @param source   Archive accessor (an `EpubArchive` in production).
 * @param state    Optional per-document state so a sheet is never inlined twice.
 */
export async function inlineEpubCss(
  css: string,
  cssPath: string,
  source: EpubCssResourceSource,
  state?: CssInlineState
): Promise<string> {
  if (!css || !css.trim()) return '';

  const inlineState = state ?? createCssInlineState();
  // Seed with the stylesheet itself so `a.css` importing `a.css` terminates.
  if (cssPath) inlineState.seen.add(cssPath);

  const baseDir = cssPath.includes('/') ? cssPath.slice(0, cssPath.lastIndexOf('/') + 1) : '';
  const refs: UrlRef[] = [];
  const nextIndex = { value: 0 };

  const ctx: WalkContext = {
    source,
    baseDir,
    refs,
    nextIndex,
    preserveLayout: false,
    state: inlineState,
    depth: 0,
  };

  const transformed = await transformStylesheet(css, ctx);
  const resolved = await resolvePlaceholders(transformed, refs, source);
  return neutraliseTagBreakout(resolved);
}