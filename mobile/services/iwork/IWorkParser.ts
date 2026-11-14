/**
 * Lirune Reader Mobile — Pure TypeScript Apple iWork (Pages, Numbers, Keynote) Parser
 * Inspects iWork ZIP package, extracts embedded QuickLook preview images or document metadata.
 * Zero new dependencies.
 */

import JSZip from 'jszip';
import { validateZipArchive } from '../security/archiveBudget.ts';

export interface ParsedIWork {
  title: string;
  format: 'pages' | 'numbers' | 'key';
  previewImage?: string; // data URL or base64
  html: string;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class IWorkParser {
  static async parse(
    buffer: ArrayBuffer | Uint8Array | string,
    filename: string
  ): Promise<ParsedIWork> {
    const ext = filename.split('.').pop()?.toLowerCase() || 'pages';
    const format = (ext === 'numbers' ? 'numbers' : ext === 'key' ? 'key' : 'pages') as
      | 'pages'
      | 'numbers'
      | 'key';

    const zip =
      typeof buffer === 'string'
        ? await JSZip.loadAsync(buffer, { base64: true })
        : await JSZip.loadAsync(buffer);
    validateZipArchive(zip);

    let previewImage: string | undefined;

    // 1. Look for QuickLook/Preview.pdf or Preview.jpg or Thumbnail.jpg
    const previewCandidates = [
      'QuickLook/Preview.jpg',
      'QuickLook/Thumbnail.jpg',
      'preview.jpg',
      'QuickLook/Preview.png',
      'preview.png',
    ];

    for (const cand of previewCandidates) {
      const file = zip.file(cand);
      if (file) {
        const b64 = await file.async('base64');
        const mime = cand.endsWith('.png') ? 'image/png' : 'image/jpeg';
        previewImage = `data:${mime};base64,${b64}`;
        break;
      }
    }

    const title = filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Apple iWork Document';

    const htmlParts: string[] = [
      `<div class="lirune-iwork-document">`,
      `<h2 class="lirune-iwork-title">${escapeHtml(title)}</h2>`,
      `<p class="lirune-iwork-badge">Apple ${format.toUpperCase()} Document</p>`,
    ];

    if (previewImage) {
      htmlParts.push(
        `<div class="lirune-iwork-preview"><img src="${previewImage}" alt="Document Preview" style="max-width:100%;height:auto;border-radius:8px;"/></div>`
      );
    } else {
      htmlParts.push(
        `<div class="lirune-iwork-notice"><p><em>This ${format.toUpperCase()} document contains no embedded QuickLook preview. Text inspection requires Pages / Numbers export to PDF or EPUB.</em></p></div>`
      );
    }

    htmlParts.push(`</div>`);
    const html = htmlParts.join('\n');

    return { title, format, previewImage, html };
  }
}
