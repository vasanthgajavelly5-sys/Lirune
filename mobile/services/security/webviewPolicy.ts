/**
 * Lirune Reader Mobile — WebView Navigation Policy
 *
 * Every reader WebView renders untrusted third-party documents. Without an
 * explicit navigation delegate, react-native-webview's default behaviour (with
 * `originWhitelist={['*']}`) is to allow ANY url to load, which lets a crafted
 * EPUB/HTML/FB2 chapter navigate the reader off the book with no prompt.
 *
 * This policy is deny-by-default: it permits only the in-memory document
 * origins the reader itself creates, and blocks everything else.
 */

import type { WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';

/** Schemes the reader legitimately needs in its own generated documents. */
const ALLOWED_SCHEMES = ['about:', 'data:', 'blob:', 'about:blank'];

/** The reader never navigates anywhere; it re-renders instead. */
export const READER_HTML_SOURCE = { html: '' } as const;

/**
 * Returns true only for the document origins the reader itself creates.
 *
 * Because the source is always an in-memory `{ html }` string it resolves to
 * `about:blank`, so an external `https://` (or `file://`, `intent://`) request
 * from inside a book is always rejected.
 */
export function allowReaderNavigation(request: WebViewNavigation): boolean {
  const url = request.url ?? '';
  if (!url) return true; // initial about:blank handshake
  return ALLOWED_SCHEMES.some((scheme) => url.toLowerCase().startsWith(scheme));
}

/**
 * The subset of props that makes a reader WebView safe. Spread onto every
 * reader WebView so the policy cannot be forgotten on a new view.
 */
export const READER_WEBVIEW_PROPS = {
  originWhitelist: ['about:blank', 'data:*', 'blob:*'],
  onShouldStartLoadWithRequest: allowReaderNavigation,
  allowFileAccess: false,
  allowFileAccessFromFileURLs: false,
  allowUniversalAccessFromFileURLs: false,
  setSupportMultipleWindows: false,
};
