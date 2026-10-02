import JSZip from 'jszip';
import { resolveZipPath } from './zipPaths.ts';

function mediaTypeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', woff: 'font/woff', woff2: 'font/woff2',
    ttf: 'font/ttf', otf: 'font/otf',
  } as Record<string, string>)[ext || ''] || 'application/octet-stream';
}

/** Inlines local EPUB CSS resources and removes links/imports that leave the archive. */
export async function inlineEpubCss(css: string, cssPath: string, zip: JSZip): Promise<string> {
  const cssDir = cssPath.includes('/') ? cssPath.slice(0, cssPath.lastIndexOf('/') + 1) : '';
  css = css.replace(/@import\b[^;]*;?/gi, '');
  const urls = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)];
  for (const match of urls) {
    const href = match[2].trim();
    if (!href || href.startsWith('#') || /^(?:data:|https?:|\/\/)/i.test(href)) {
      css = css.split(match[0]).join('');
      continue;
    }
    const assetPath = resolveZipPath(cssDir, href);
    const asset = zip.file(assetPath) || Object.values(zip.files).find((file) => file.name.toLowerCase() === assetPath.toLowerCase());
    if (!asset) {
      css = css.split(match[0]).join('');
      continue;
    }
    const dataUri = `data:${mediaTypeForPath(assetPath)};base64,${await asset.async('base64')}`;
    css = css.split(match[0]).join(`url("${dataUri}")`);
  }
  return css
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/(?:behavior|-moz-binding)\s*:[^;}]*;?/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<[^>]*>/g, '');
}
