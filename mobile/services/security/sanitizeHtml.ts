/**
 * Sanitizes untrusted book markup without a runtime DOM or third-party package.
 * The output is intended to be inserted into a reader-owned WebView document.
 *
 * Design notes:
 * - SVG is NOT in REMOVED_CONTENT_TAGS. Safe inline SVG (diagrams, icons,
 *   decorative elements, illustrations) is preserved. Only elements that can act
 *   rather than draw are blocked.
 * - MathML is preserved: Android WebView (Chromium) has shipped a MathML
 *   renderer since Android 8, so `<math>` survives sanitisation with all of its
 *   presentation attributes intact.
 * - epub:type, xml:lang, aria-* and similar namespaced/ARIA attributes are kept
 *   because they carry semantic roles used by TTS, navigation and footnotes.
 * - HTML comments are dropped: some EPUBs embed conditional IE comments with JS.
 *   Nothing is ever promoted out of a comment, so hiding markup there cannot
 *   resurrect it.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g;

/** Tags whose entire subtree (opening + content + closing) is removed. */
const REMOVED_CONTENT_TAGS = new Set([
  'script',
  'style',      // EPUB stylesheets are inlined before sanitisation; any remaining <style> is suspect
  'form',
  'frame',
  'frameset',
  'iframe',
  'object',
  'embed',
  'applet',
  'noscript',   // often contains hostile fallback markup
]);

/** Tags removed but whose children are kept. */
const REMOVED_TAGS = new Set(['meta', 'base', 'link', 'head', 'html', 'body']);

/**
 * SVG/SMIL elements that can act rather than draw.
 *
 * Everything else in the SVG vocabulary is allowed through: `path`, `use`,
 * `filter`, gradients, `foreignObject` and friends are exactly how publishers
 * ship diagrams, charts and ornamental art, and Android WebView renders them
 * natively. `<script>` is already covered by REMOVED_CONTENT_TAGS; the rest here
 * are the SMIL/event elements that have no place in a book.
 */
const BLOCKED_SVG_ELEMENTS = new Set(['handler', 'listener', 'set', 'discard', 'audio', 'video']);

/**
 * SMIL animation elements. They are legitimate on animated covers, but one that
 * targets `href` can turn a link into script without any `javascript:` literal
 * surviving on the element itself, so those are dropped outright.
 */
const SMIL_ELEMENTS = new Set(['animate', 'animatetransform', 'animatemotion', 'animatecolor']);
const SMIL_DRIVER_ATTRIBUTES = ['to', 'from', 'values', 'by'];

const ACTIVE_STYLE =
  /expression\s*\(|javascript\s*:|-moz-binding|behavior\s*:|@import|<\s*\//i;

function decodeUrlEntities(value: string): string {
  return value
    .replace(/&#x([\da-f]+);?/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);?/g, (_match, code: string) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&colon;/gi, ':')
    .replace(CONTROL_CHARS, '');
}

function isSafeResource(value: string, allowDataImage: boolean): boolean {
  const url = decodeUrlEntities(value.trim());
  if (!url || url.startsWith('//')) return false;
  if (allowDataImage && /^data:(?:image\/(?:bmp|gif|jpe?g|png|webp|avif|svg\+xml)|font\/)/i.test(url)) {
    return true;
  }
  // Relative paths and fragment anchors are safe
  if (url.startsWith('#') || url.startsWith('./') || url.startsWith('../') || !url.includes(':')) return true;
  return false;
}

/** Decodes the HTML entities an attribute value can carry before a URL check. */
function decodeAttributeEntities(value: string): string {
  return value
    .replace(/&quot;|&#0*34;|&#x0*22;/gi, '"')
    .replace(/&apos;|&#0*39;|&#x0*27;/gi, "'")
    .replace(/&amp;/gi, '&');
}

/**
 * Escapes an attribute value for output.
 *
 * Only ampersands that do not already start a character reference are escaped —
 * otherwise a value that legitimately carries `&quot;` (an inline style
 * produced by the resource inliner, for example) would come back as
 * `&amp;quot;` and stop being valid CSS.
 */
function escapeAttributeValue(value: string): string {
  return value
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,8}|#[xX][0-9a-fA-F]{1,8});)/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/**
 * True when a `style` attribute only references inline/fragment resources.
 *
 * After `inlineMarkupResources` runs, book inline styles contain `url("data:…")`
 * for background images, list markers and borders. Those must survive; a raw
 * relative `url(…)` never reaches this point and is rejected.
 */
function isSafeStyleValue(value: string): boolean {
  if (ACTIVE_STYLE.test(value)) return false;

  let cursor = 0;
  const lower = value.toLowerCase();
  while (cursor < value.length) {
    const at = lower.indexOf('url(', cursor);
    if (at === -1) return true;
    let j = at + 4;
    let quote: string | null = null;
    while (j < value.length) {
      const ch = value[j];
      if (quote) {
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ')') break;
      j++;
    }
    if (j >= value.length) return false; // unterminated url()
    const raw = decodeUrlEntities(decodeAttributeEntities(value.slice(at + 4, j).trim()))
      .replace(/^['"]|['"]$/g, '')
      .trim();
    if (!raw) return false;
    if (raw.startsWith('#')) {
      cursor = j + 1;
      continue;
    }
    if (/^data:(?:image|font)\//i.test(raw)) {
      cursor = j + 1;
      continue;
    }
    return false;
  }
  return true;
}

function sanitizeAttributes(source: string, tagName: string): string {
  const attributes: string[] = [];
  // Matches: name, name="value", name='value', name=value (unquoted)
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  const lowerTag = tagName.toLowerCase();

  if (SMIL_ELEMENTS.has(lowerTag)) {
    // An animation whose target is a URL attribute can rewrite it to anything.
    const target = /\battributeName\s*=\s*["']?([^"'\s>]+)/i.exec(source);
    if (target && /^(?:xlink:)?href$/i.test(target[1])) {
      return `<${tagName}`;
    }
  }

  while ((match = attributePattern.exec(source)) !== null) {
    const name = match[1];
    if (!name) continue;
    const lowerName = name.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];

    // Strip all event handlers (onclick, onmouseover, onfocus, etc.)
    if (/^on[a-z]/i.test(lowerName)) continue;
    // Strip javascript: protocol anywhere
    if (value !== undefined && /javascript\s*:/i.test(decodeUrlEntities(value))) continue;
    // SMIL never gets to choose a value; the animation is decorative only.
    if (SMIL_ELEMENTS.has(lowerTag) && SMIL_DRIVER_ATTRIBUTES.includes(lowerName)) continue;

    if (lowerName === 'href' || lowerName === 'xlink:href') {
      if (value === undefined) continue;
      // Fragment anchors (#section) are always safe — used for TOC navigation
      if (value.startsWith('#')) {
        attributes.push(`${name}="${escapeAttributeValue(value)}"`);
        continue;
      }
      if (!isSafeResource(value, false)) continue;
    }

    if (lowerName === 'src') {
      if (value === undefined || !isSafeResource(value, true)) continue;
    }

    if (lowerName === 'srcset' || lowerName === 'poster' || lowerName === 'action') continue;

if (lowerName === 'style' && value !== undefined) {
      if (!isSafeStyleValue(value)) continue;
    }

    // Allow epub:type, xml:lang, aria-*, data-* and all normal attributes
    if (value === undefined) attributes.push(name);
    else attributes.push(`${name}="${escapeAttributeValue(value)}"`);
  }

  const suffix = attributes.length ? ` ${attributes.join(' ')}` : '';
  return `<${tagName}${suffix}`;
}

/**
 * Removes active content and unsafe resources while preserving book markup, inline
 * SVG and MathML.
 *
 * This is a single pass on purpose: attribute values are re-escaped on the way
 * out, so a second pass would double-escape every `&`. CDATA payloads recurse
 * through `sanitizeOnce`, which is where the recursion budget lives.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeOnce(html, 0);
}

function sanitizeOnce(html: string, depth: number): string {
  // Token pattern: comments | CDATA | declarations | <tags>
  const tokenPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*\?>|<[^>]*>/g;
  const removedStack: string[] = [];
  let output = '';
  let cursor = 0;
  let token: RegExpExecArray | null;

  while ((token = tokenPattern.exec(html)) !== null) {
    // Collect text nodes outside removed sections
    if (removedStack.length === 0) output += html.slice(cursor, token.index);
    const raw = token[0];
    cursor = tokenPattern.lastIndex;

    // Inside a removed-content section: track nesting, skip everything
    if (removedStack.length > 0) {
      const closing = raw.match(/^<\s*\/\s*([\w:-]+)/);
      const opening = raw.match(/^<\s*([\w:-]+)/);
      if (closing) {
        const closingName = closing[1].toLowerCase();
        if (closingName === removedStack[removedStack.length - 1]) {
          removedStack.pop();
        } else if (REMOVED_CONTENT_TAGS.has(closingName)) {
          // Malformed nesting — pop any matching ancestor
          const idx = [...removedStack].reverse().findIndex((n) => n === closingName);
          if (idx !== -1) removedStack.splice(removedStack.length - 1 - idx);
        }
      } else if (opening && !/^<\s*\//.test(raw) && !/\/\s*>$/.test(raw)) {
        const openName = opening[1].toLowerCase();
        if (REMOVED_CONTENT_TAGS.has(openName)) {
          removedStack.push(openName);
        }
      }
      continue;
    }

    // Comments carry no reader-visible content and are a known hostile hiding place.
    if (raw.startsWith('<!--')) continue;

    // CDATA: unwrap and re-sanitise the payload so wrapped MathML/SVG survives
    // while wrapped scripts do not.
    if (raw.toUpperCase().startsWith('<![CDATA[')) {
      const inner = raw.slice(9, raw.length - 3);
      if (inner && depth < 6) output += sanitizeOnce(inner, depth + 1);
      continue;
    }

    // Doctype / processing instruction: never meaningful inside a reader document.
    if (raw.startsWith('<!') || raw.startsWith('<?')) continue;

    const closing = raw.match(/^<\s*\/\s*([\w:-]+)[^>]*>/);
    if (closing) {
      const name = closing[1].toLowerCase();
      if (
        !REMOVED_CONTENT_TAGS.has(name) &&
        !REMOVED_TAGS.has(name) &&
        !BLOCKED_SVG_ELEMENTS.has(name)
      ) {
        output += `</${closing[1]}>`;
      }
      continue;
    }

    const opening = raw.match(/^<\s*([\w:-]+)([\s\S]*?)(\/?)\s*>$/);
    if (!opening) {
      // Malformed tag — pass text through escaped (angle brackets in text content)
      output += raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      continue;
    }

    const name = opening[1].toLowerCase();
    const selfClosing = opening[3] === '/';

    if (REMOVED_CONTENT_TAGS.has(name) || BLOCKED_SVG_ELEMENTS.has(name)) {
      if (!selfClosing) removedStack.push(name);
      continue;
    }
    if (REMOVED_TAGS.has(name)) {
      // Don't push to removedStack — we want their children
      continue;
    }

    output += `${sanitizeAttributes(opening[2], opening[1])}${selfClosing ? ' />' : '>'}`;
  }

  // Append remaining text after the last token
  if (removedStack.length === 0) output += html.slice(cursor);
  return output;
}
