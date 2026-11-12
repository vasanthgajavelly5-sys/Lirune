/**
 * Lirune Reader Mobile — Format Capability Abstraction
 * Defines document capabilities, layout modes, and supported features across
 * reflowable, fixed-layout, and container formats.
 */

import { BookFormat } from './Book';

export type DocumentLayoutType = 'reflowable' | 'fixed' | 'container';

export interface DocumentCapabilities {
  layout: DocumentLayoutType;
  supportsPageMode: boolean;
  supportsScrollMode: boolean;
  supportsCustomFonts: boolean;
  supportsTextAlignment: boolean;
  supportsLineHeight: boolean;
  supportsParagraphSpacing: boolean;
  supportsMargins: boolean;
  supportsThemes: boolean;
  supportsTOC: boolean;
  supportsSearch: boolean;
  supportsHighlights: boolean;
  supportsBookmarks: boolean;
  supportsNotes: boolean;
  supportsTts: boolean;
  supportsThumbnails: boolean;
  supportsZoom: boolean;
}

export const REFLOWABLE_CAPABILITIES: DocumentCapabilities = {
  layout: 'reflowable',
  supportsPageMode: true,
  supportsScrollMode: true,
  supportsCustomFonts: true,
  supportsTextAlignment: true,
  supportsLineHeight: true,
  supportsParagraphSpacing: true,
  supportsMargins: true,
  supportsThemes: true,
  supportsTOC: true,
  supportsSearch: true,
  supportsHighlights: true,
  supportsBookmarks: true,
  supportsNotes: true,
  supportsTts: true,
  supportsThumbnails: false,
  supportsZoom: false,
};

export const FIXED_PAGE_CAPABILITIES: DocumentCapabilities = {
  layout: 'fixed',
  supportsPageMode: true,
  supportsScrollMode: true,
  supportsCustomFonts: false,
  supportsTextAlignment: false,
  supportsLineHeight: false,
  supportsParagraphSpacing: false,
  supportsMargins: false,
  supportsThemes: true,
  supportsTOC: true,
  supportsSearch: true,
  supportsHighlights: false,
  supportsBookmarks: true,
  supportsNotes: true,
  supportsTts: false,
  supportsThumbnails: true,
  supportsZoom: true,
};

export const COMIC_CAPABILITIES: DocumentCapabilities = {
  layout: 'fixed',
  supportsPageMode: true,
  supportsScrollMode: false,
  supportsCustomFonts: false,
  supportsTextAlignment: false,
  supportsLineHeight: false,
  supportsParagraphSpacing: false,
  supportsMargins: false,
  supportsThemes: true,
  supportsTOC: false,
  supportsSearch: false,
  supportsHighlights: false,
  supportsBookmarks: true,
  supportsNotes: false,
  supportsTts: false,
  supportsThumbnails: true,
  supportsZoom: true,
};

export const CONTAINER_CAPABILITIES: DocumentCapabilities = {
  layout: 'container',
  supportsPageMode: false,
  supportsScrollMode: false,
  supportsCustomFonts: false,
  supportsTextAlignment: false,
  supportsLineHeight: false,
  supportsParagraphSpacing: false,
  supportsMargins: false,
  supportsThemes: true,
  supportsTOC: false,
  supportsSearch: false,
  supportsHighlights: false,
  supportsBookmarks: false,
  supportsNotes: false,
  supportsTts: false,
  supportsThumbnails: false,
  supportsZoom: false,
};

export function getDocumentCapabilities(format: BookFormat): DocumentCapabilities {
  switch (format) {
    case 'epub':
    case 'mobi':
    case 'azw':
    case 'azw3':
    case 'fb2':
    case 'doc':
    case 'docx':
    case 'rtf':
    case 'odt':
    case 'txt':
    case 'html':
    case 'chm':
      return REFLOWABLE_CAPABILITIES;

    case 'pdf':
    case 'djvu':
      return FIXED_PAGE_CAPABILITIES;

    case 'cbz':
    case 'cbr':
      return COMIC_CAPABILITIES;

    case 'zip':
    case 'rar':
      return CONTAINER_CAPABILITIES;

    default:
      return REFLOWABLE_CAPABILITIES;
  }
}
