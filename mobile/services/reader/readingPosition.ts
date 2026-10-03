/**
 * Lirune Reader Mobile — reading position preservation
 *
 * Rotating the device, changing the font size or switching theme reloads the
 * reader WebView document. A raw pixel offset captured before the reload is
 * meaningless afterwards, because the content width, line count and column height
 * have all changed. What stays stable across a reflow is:
 *
 *   - an element with an `id` (EPUB sections almost always have them), plus
 *   - a character offset into the document's text, and
 *   - as a last resort, a scroll ratio.
 *
 * The script below captures all three, cheapest first, and restores using the
 * best one available in the new layout. It is plain ES5 so it runs unchanged on
 * every WebView the reader targets.
 */

export type ReaderMode = 'paginated' | 'continuous';

export interface ReadingPosition {
  /** Spine index of the nearest chapter marker (continuous mode). */
  chapterIndex?: number;
  /** `id` of the nearest identified ancestor element. */
  anchorId?: string;
  /** Character offset into the document's text content. */
  textOffset?: number;
  /** Fraction of the scrollable extent, used when no better anchor exists. */
  ratio?: number;
  /** Paginated mode: the column index the reader was on. */
  page?: number;
  /** Fraction of total columns in paginated mode. */
  pageRatio?: number;
}

export function isReadingPosition(value: unknown): value is ReadingPosition {
  return (
    !!value &&
    typeof value === 'object' &&
    (typeof (value as ReadingPosition).textOffset === 'number' ||
      typeof (value as ReadingPosition).anchorId === 'string' ||
      typeof (value as ReadingPosition).ratio === 'number')
  );
}

const POSITION_HELPERS = `
(function () {
  if (window.__lirunePosition && window.__lirunePosition.mode === '__MODE__') return;
  window.__lirunePosition = { mode: '__MODE__' };

  var PROBE_OFFSET = 12;
  var MAX_TEXT_WALK = 2000000;

  function probeY() {
    return PROBE_OFFSET;
  }

  function visibleElement() {
    var y = probeY();
    var w = window.innerWidth || 1;
    var el = document.elementFromPoint(Math.max(1, w / 2), Math.max(1, Math.min(y, (window.innerHeight || 2) - 1)));
    return el || document.body;
  }

  function nearestAnchorId() {
    var el = visibleElement();
    var hops = 0;
    while (el && hops < 8) {
      if (el.id) return el.id;
      el = el.parentElement;
      hops++;
    }
    return null;
  }

  function nearestChapterIndex() {
    var el = visibleElement();
    var hops = 0;
    while (el && hops < 24) {
      if (el.getAttribute && el.getAttribute('data-chapter-index') !== null) {
        return Number(el.getAttribute('data-chapter-index')) || 0;
      }
      el = el.parentElement;
      hops++;
    }
    return null;
  }

  function textNodes() {
    var root = document.body || document.documentElement;
    if (!root) return [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue;
      if (value && value.trim()) nodes.push(node);
      if (nodes.length > 20000) break;
    }
    return nodes;
  }

  function rectTopAt(node, index) {
    try {
      var range = document.createRange();
      range.setStart(node, Math.max(0, Math.min(index, node.nodeValue.length - 1)));
      range.setEnd(node, Math.max(1, Math.min(index + 1, node.nodeValue.length)));
      var rect = range.getBoundingClientRect();
      range.detach && range.detach();
      return rect && rect.height ? rect.top : null;
    } catch (e) {
      return null;
    }
  }

  function captureTextOffset() {
    var target = probeY();
    var nodes = textNodes();
    var total = 0;
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      var value = node.nodeValue;
      var top = rectTopAt(node, 0);
      if (top !== null && top <= target) {
        // Binary search the character closest to the probe line.
        var lo = 0;
        var hi = value.length - 1;
        var best = 0;
        while (lo <= hi) {
          var mid = (lo + hi) >> 1;
          var midTop = rectTopAt(node, mid);
          if (midTop === null) break;
          if (midTop <= target) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
        return total + best;
      }
      total += value.length;
      if (total > MAX_TEXT_WALK) return null;
    }
    return null;
  }

  function restoreTextOffset(offset) {
    var nodes = textNodes();
    var total = 0;
    for (var n = 0; n < nodes.length; n++) {
      var value = nodes[n].nodeValue;
      if (total + value.length >= offset) {
        var index = Math.max(0, offset - total);
        var top = rectTopAt(nodes[n], index);
        if (top !== null) return top;
        return null;
      }
      total += value.length;
    }
    return null;
  }

  function capture() {
    var position = {};
    var chapter = nearestChapterIndex();
    if (chapter !== null) position.chapterIndex = chapter;
    var anchorId = nearestAnchorId();
    if (anchorId) position.anchorId = anchorId;
    var offset = captureTextOffset();
    if (offset !== null) position.textOffset = offset;
    var doc = document.documentElement;
    var scrollable = Math.max(1, (doc ? doc.scrollHeight : 1) - (window.innerHeight || 0));
    position.ratio = Math.max(0, Math.min(1, (window.pageYOffset || 0) / scrollable));
    if (window.__lirunePager) {
      position.page = window.__lirunePager.getPage();
      position.pageRatio = window.__lirunePager.getPageRatio();
    }
    return position;
  }

  window.__liruneCapturePosition = capture;
})();
`;

const RESTORE_CONTINUOUS = `
(function (position) {
  if (!position) return;

  if (typeof position.chapterIndex === 'number') {
    var section = document.getElementById('chapter-' + position.chapterIndex);
    if (section) {
      if (position.anchorId) {
        var anchor = document.getElementById(position.anchorId);
        if (anchor && section.contains(anchor)) {
          var offset = anchor.getBoundingClientRect().top + (window.pageYOffset || 0) - 8;
          window.scrollTo(0, Math.max(0, offset));
          window.dispatchEvent(new Event('scroll'));
          return;
        }
      }
      if (typeof position.textOffset === 'number' && window.__liruneRestoreTextOffset) {
        var y = window.__liruneRestoreTextOffset(position.textOffset);
        if (y !== null) {
          window.scrollTo(0, Math.max(0, y - 8));
          window.dispatchEvent(new Event('scroll'));
          return;
        }
      }
      var top = section.getBoundingClientRect().top + (window.pageYOffset || 0);
      var height = section.offsetHeight || 1;
      window.scrollTo(0, Math.max(0, top + (typeof position.ratio === 'number' ? position.ratio * height : 0)));
      window.dispatchEvent(new Event('scroll'));
      return;
    }
  }

  if (typeof position.ratio === 'number') {
    var doc = document.documentElement;
    var scrollable = Math.max(0, doc.scrollHeight - (window.innerHeight || 0));
    window.scrollTo(0, Math.round(scrollable * position.ratio));
  }
})(POSITION);
`;

const RESTORE_PAGINATED = `
(function (position) {
  if (!position || !window.__lirunePager) return;
  var content = document.getElementById('book-content');
  if (!content) return;
  window.__lirunePager.measure();

  var target = null;
  if (position.anchorId) target = document.getElementById(position.anchorId);
  if (!target && typeof position.textOffset === 'number' && window.__liruneFindTextElement) {
    target = window.__liruneFindTextElement(position.textOffset);
  }
  if (target) {
    var left = target.offsetLeft || 0;
    var page = Math.floor((left + (window.__lirunePager.getColumnStep() / 2)) / Math.max(1, window.__lirunePager.getColumnStep()));
    window.__lirunePager.setPage(page);
    return;
  }
  var total = window.__lirunePager.getPageCount();
  var ratio = typeof position.pageRatio === 'number' ? position.pageRatio : position.ratio;
  if (typeof ratio === 'number' && total > 1) {
    window.__lirunePager.setPage(Math.min(total - 1, Math.max(0, Math.round(ratio * (total - 1)))));
  } else if (typeof position.page === 'number') {
    window.__lirunePager.setPage(position.page);
  }
})(POSITION);
`;

/** Script installed in the reader document that exposes position helpers. */
export function readingPositionScript(mode: ReaderMode): string {
  return (
    POSITION_HELPERS.replace(/__MODE__/g, mode) +
    `
(function () {
  window.__liruneRestoreTextOffset = function (offset) {
    var nodes = [];
    var root = document.body || document.documentElement;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim()) nodes.push(node);
    }
    var total = 0;
    for (var n = 0; n < nodes.length; n++) {
      var value = nodes[n].nodeValue;
      if (total + value.length >= offset) {
        var range = document.createRange();
        var index = Math.max(0, Math.min(offset - total, value.length - 1));
        range.setStart(nodes[n], index);
        range.setEnd(nodes[n], Math.min(value.length, index + 1));
        var rect = range.getBoundingClientRect();
        return rect ? rect.top + (window.pageYOffset || 0) : null;
      }
      total += value.length;
    }
    return null;
  };

  window.__liruneFindTextElement = function (offset) {
    var root = document.body || document.documentElement;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node;
    var total = 0;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue;
      if (!value || !value.trim()) continue;
      if (total + value.length >= offset) return node.parentElement;
      total += value.length;
    }
    return null;
  };

  window.__liruneRequestPosition = function () {
    if (!window.__liruneCapturePosition) return;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'readingPosition',
        position: window.__liruneCapturePosition()
      }));
    } catch (e) {}
  };
})();
`
  );
}

/** Script that asks the WebView for its current logical position. */
export const REQUEST_POSITION_JS =
  'if (window.__liruneRequestPosition) { window.__liruneRequestPosition(); } true;';

function restoreScript(mode: ReaderMode, position: ReadingPosition | null): string {
  if (!position) return '';
  const serialized = JSON.stringify(position);
  const template = mode === 'continuous' ? RESTORE_CONTINUOUS : RESTORE_PAGINATED;
  // Function replacement so `$` sequences inside an id are never interpreted.
  return template.replace('POSITION', () => serialized);
}

/**
 * Script run after a layout-affecting reload to put the reader back where they
 * were, expressed in the new geometry.
 */
export function restorePositionScript(
  mode: ReaderMode,
  position: ReadingPosition | null,
  delayMs = 80
): string {
  const body = restoreScript(mode, position);
  if (!body) return '';
  return `window.setTimeout(function () { try { ${body} } catch (e) {} }, ${Math.max(0, delayMs)}); true;`;
}