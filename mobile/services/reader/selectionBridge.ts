/**
 * Lirune Reader Mobile — text selection bridge
 *
 * The WebView-based readers (EPUB, HTML, FB2) need to report the reader's
 * current text selection back to React Native so a highlight can be created.
 * Injected into the reader's generated document.
 */

export interface SelectionPayload {
  text: string;
  /** Document-relative position of the selection, 0..1. */
  top: number;
}

/**
 * JS injected into reader documents to watch for text selection.
 *
 * Uses `selectionchange` plus a deferred `touchend`, because Android's WebView
 * does not always settle the selection by the time touchend fires.
 */
export const SELECTION_WATCHER_JS = `
(function () {
  if (window.__liruneSelectionWatcher) return;
  window.__liruneSelectionWatcher = true;

  function post(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  }

  var lastText = '';

  function report() {
    var sel = window.getSelection ? window.getSelection() : null;
    var text = sel ? String(sel).trim() : '';

    if (!text) {
      if (lastText) {
        lastText = '';
        post({ type: 'selection', text: '', top: 0 });
      }
      return;
    }
    if (text === lastText) return;
    lastText = text;

    var top = 0;
    try {
      var rect = sel.getRangeAt(0).getBoundingClientRect();
      var docHeight = Math.max(1, document.documentElement.scrollHeight);
      top = (rect.top + window.scrollY) / docHeight;
    } catch (e) {}

    post({ type: 'selection', text: text.slice(0, 2000), top: top });
  }

  document.addEventListener('selectionchange', report);
  document.addEventListener('mouseup', report);
  document.addEventListener('touchend', function () { setTimeout(report, 150); });
})();
`;

/** Parses a WebView message into a selection payload, or null. */
export function parseSelectionMessage(
  raw: unknown
): SelectionPayload | null {
  if (typeof raw !== 'string') return null;
  let data: { type?: string; text?: string; top?: number };
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data?.type !== 'selection') return null;
  return {
    text: typeof data.text === 'string' ? data.text : '',
    top: typeof data.top === 'number' ? data.top : 0,
  };
}
