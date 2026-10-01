/**
 * Sanitizes untrusted book markup without a runtime DOM or third-party package.
 * The output is intended to be inserted into a reader-owned WebView document.
 */

const REMOVED_CONTENT_TAGS = new Set([
  'script',
  'style',
  'form',
  'frame',
  'iframe',
  'object',
  'embed',
  'svg',
]);

const REMOVED_TAGS = new Set(['meta', 'base']);

function decodeUrlEntities(value: string): string {
  return value
    .replace(/&#x([\da-f]+);?/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);?/g, (_match, code: string) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/[\u0000-\u0020]+/g, '');
}

function isSafeResource(value: string, allowDataImage: boolean): boolean {
  const url = decodeUrlEntities(value.trim());
  if (!url || url.startsWith('//')) return false;
  if (allowDataImage && /^data:image\/(?:bmp|gif|jpe?g|png|webp)(?:;[^,]*)?,/i.test(url)) {
    return true;
  }
  return !/^[a-z][a-z\d+.-]*:/i.test(url);
}

function sanitizeAttributes(source: string, tagName: string): string {
  const attributes: string[] = [];
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(source)) !== null) {
    const name = match[1];
    const lowerName = name.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];

    if (lowerName.startsWith('on')) continue;
    if (lowerName === 'href' || lowerName === 'xlink:href') {
      if (value === undefined || !isSafeResource(value, false)) continue;
    }
    if (lowerName === 'src' || lowerName === 'srcset' || lowerName === 'poster') {
      if (value === undefined || lowerName !== 'src' || !isSafeResource(value, true)) continue;
    }
    if (lowerName === 'style' && value !== undefined && /url\s*\(|expression\s*\(|@import/i.test(value)) {
      continue;
    }

    if (value === undefined) attributes.push(name);
    else attributes.push(`${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`);
  }

  const suffix = attributes.length ? ` ${attributes.join(' ')}` : '';
  return `<${tagName}${suffix}`;
}

/** Removes active content and unsafe resources while preserving book markup and data images. */
export function sanitizeHtml(html: string): string {
  const tokenPattern = /<!--[\s\S]*?-->|<[^>]*>/g;
  const removedStack: string[] = [];
  let output = '';
  let cursor = 0;
  let token: RegExpExecArray | null;

  while ((token = tokenPattern.exec(html)) !== null) {
    if (removedStack.length === 0) output += html.slice(cursor, token.index);
    const raw = token[0];
    cursor = tokenPattern.lastIndex;

    if (removedStack.length > 0) {
      const closing = raw.match(/^<\s*\/\s*([\w:-]+)/);
      const opening = raw.match(/^<\s*([\w:-]+)/);
      if (closing && closing[1].toLowerCase() === removedStack[removedStack.length - 1]) {
        removedStack.pop();
      } else if (opening && !/^<\s*\//.test(raw) && !/\/\s*>$/.test(raw)) {
        if (opening[1].toLowerCase() === removedStack[removedStack.length - 1]) {
          removedStack.push(opening[1].toLowerCase());
        }
      }
      continue;
    }

    if (raw.startsWith('<!--')) {
      output += raw;
      continue;
    }

    const closing = raw.match(/^<\s*\/\s*([\w:-]+)[^>]*>/);
    if (closing) {
      const name = closing[1].toLowerCase();
      if (!REMOVED_CONTENT_TAGS.has(name) && !REMOVED_TAGS.has(name)) output += `</${closing[1]}>`;
      continue;
    }

    const opening = raw.match(/^<\s*([\w:-]+)([\s\S]*?)(\/?)>$/);
    if (!opening) {
      output += raw;
      continue;
    }

    const name = opening[1].toLowerCase();
    const selfClosing = opening[3] === '/';
    if (REMOVED_CONTENT_TAGS.has(name)) {
      if (!selfClosing) removedStack.push(name);
      continue;
    }
    if (REMOVED_TAGS.has(name)) continue;

    output += `${sanitizeAttributes(opening[2], opening[1])}${selfClosing ? ' />' : '>'}`;
  }

  if (removedStack.length === 0) output += html.slice(cursor);
  return output;
}