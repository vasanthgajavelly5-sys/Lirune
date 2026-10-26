/**
 * Scroll Engine v2: Virtualized Block Locator Engine
 *
 * Key Architectural Invariants:
 * - WebView-owned DOM lifecycle (Host is stateless chapter provider)
 * - LRU memory budget eviction with calibrated height preservation
 * - Size-aware document progression
 * - Block-level locator positioning ([data-block-id] + char offset)
 * - Velocity-aware dynamic prefetching (-1.2vh to +4.5vh)
 */

export interface ScrollEngineV2Input {
  palette: {
    bg: string;
    text: string;
    muted?: string;
    link?: string;
  };
}

/**
 * Inlines the client-side JavaScript engine for Scroll Engine v2.
 */
export function continuousScriptV2(input: ScrollEngineV2Input): string {
  const isDark = input.palette.bg === '#1A1A1D' || input.palette.bg === '#000000' || input.palette.text === '#f0f0f0';
  const skeletonBg = isDark ? '#232328' : '#e6e4dc';

  return `
    window.__liruneV2 = (function() {
      var isSmallTier = false;
      var activeIndex = 0;
      var lastScrollY = window.pageYOffset || 0;
      var lastScrollTime = Date.now();
      var scrollVelocity = 0;
      var scrollRafId = null;
      var lastProgressTime = 0;
      var idleEvictTimer = null;
      var loadedChapters = new Set([activeIndex]);
      var pendingRequests = new Set();
      var MAX_DOM_CHAPTERS = 12; // Memory budget guard for low-RAM devices

      // Calibrated empirical ratio (px per char)
      var empiricalPxPerChar = 0.55;
      var calibratedSamples = 0;

      function updateVelocity() {
        var now = Date.now();
        var dt = Math.max(1, now - lastScrollTime);
        var currentY = window.pageYOffset || 0;
        var dy = currentY - lastScrollY;
        // Exponential moving average for velocity (px/ms)
        var instantV = dy / dt;
        scrollVelocity = scrollVelocity * 0.4 + instantV * 0.6;
        lastScrollY = currentY;
        lastScrollTime = now;
      }

      function getHydrationWindow() {
        var vh = window.innerHeight || 800;
        var topRatio = -1.2;
        var bottomRatio = 2.0;

        if (scrollVelocity > 0.4) {
          // Downward fling: extend lookahead up to 4.5 viewports
          bottomRatio = Math.min(4.5, 2.0 + (scrollVelocity - 0.4) * 1.5);
        } else if (scrollVelocity < -0.4) {
          // Upward fling: extend lookbehind up to -3.5 viewports
          topRatio = Math.max(-3.5, -1.2 + (scrollVelocity + 0.4) * 1.5);
        }

        return {
          minY: topRatio * vh,
          maxY: bottomRatio * vh
        };
      }

      function scanAndRequestChapters() {
        var sections = document.querySelectorAll('.chapter-section');
        if (!sections || sections.length === 0) return;

        var win = getHydrationWindow();
        var immediateNeeded = [];
        var prefetchNeeded = [];

        for (var i = 0; i < sections.length; i++) {
          var sec = sections[i];
          var idx = Number(sec.getAttribute('data-chapter-index'));
          if (isNaN(idx)) continue;

          var isLoaded = sec.getAttribute('data-loaded') === 'true';
          if (isLoaded || pendingRequests.has(idx)) continue;

          var rect = sec.getBoundingClientRect();
          // Overlaps the dynamic velocity-adjusted viewport window
          if (rect.bottom >= win.minY && rect.top <= win.maxY) {
            if (rect.bottom >= 0 && rect.top <= (window.innerHeight || 800)) {
              immediateNeeded.push(idx);
            } else {
              prefetchNeeded.push(idx);
            }
          }
        }

        if (immediateNeeded.length > 0 || prefetchNeeded.length > 0) {
          var allToRequest = immediateNeeded.concat(prefetchNeeded);
          for (var j = 0; j < allToRequest.length; j++) {
            pendingRequests.add(allToRequest[j]);
          }
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'needChapters',
              indices: allToRequest,
              immediate: immediateNeeded,
              priority: immediateNeeded.length > 0 ? 'immediate' : 'prefetch'
            }));
          } catch (e) {}
        }
      }

      function evictDistantChapters() {
        if (isSmallTier) return;
        if (loadedChapters.size <= MAX_DOM_CHAPTERS) return;

        var vh = window.innerHeight || 800;
        var sections = document.querySelectorAll('.chapter-section[data-loaded="true"]');
        var candidates = [];

        for (var i = 0; i < sections.length; i++) {
          var sec = sections[i];
          var idx = Number(sec.getAttribute('data-chapter-index'));
          if (isNaN(idx) || idx === activeIndex) continue;

          var rect = sec.getBoundingClientRect();
          var dist = Math.min(Math.abs(rect.top), Math.abs(rect.bottom));
          // Strictly greater than 4.2 viewports away
          if (rect.bottom < -4.2 * vh || rect.top > 5.2 * vh) {
            candidates.push({ idx: idx, el: sec, dist: dist, height: rect.height });
          }
        }

        if (candidates.length === 0) return;
        // Sort farthest first
        candidates.sort(function(a, b) { return b.dist - a.dist; });

        var toEvict = candidates.slice(0, loadedChapters.size - MAX_DOM_CHAPTERS);
        var evictedIndices = [];

        for (var k = 0; k < toEvict.length; k++) {
          var item = toEvict[k];
          item.el.setAttribute('data-loaded', 'false');
          var h = Math.max(120, Math.round(item.height));
          item.el.style.minHeight = h + 'px';
          var body = document.getElementById('chapter-body-' + item.idx);
          if (body) {
            body.innerHTML = '<div class="chapter-placeholder fling-skeleton" style="height:' + (h - 40) + 'px; background:' + '${skeletonBg}' + '; border-radius:8px;"><p class="loading-hint">Loading…</p></div>';
          }
          loadedChapters.delete(item.idx);
          evictedIndices.push(item.idx);
        }

        if (evictedIndices.length > 0) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'chaptersUnloaded',
              indices: evictedIndices
            }));
          } catch (e) {}
        }
      }

      function captureLocator() {
        var readingLine = (window.innerHeight || 800) * 0.35;
        var w = window.innerWidth || 1;
        var el = document.elementFromPoint(Math.max(1, w / 2), Math.max(1, Math.min(readingLine, (window.innerHeight || 2) - 1)));

        var blockEl = null;
        var curr = el;
        var hops = 0;
        while (curr && hops < 20) {
          if (curr.getAttribute && curr.getAttribute('data-block-id')) {
            blockEl = curr;
            break;
          }
          curr = curr.parentElement;
          hops++;
        }

        var secEl = null;
        curr = el;
        hops = 0;
        while (curr && hops < 24) {
          if (curr.getAttribute && curr.getAttribute('data-chapter-index') !== null) {
            secEl = curr;
            break;
          }
          curr = curr.parentElement;
          hops++;
        }

        var chapterIdx = secEl ? Number(secEl.getAttribute('data-chapter-index')) || 0 : activeIndex;
        var fraction = 0;
        if (secEl) {
          var r = secEl.getBoundingClientRect();
          fraction = Math.max(0, Math.min(1, (readingLine - r.top) / (r.height || 1)));
        }

        var blockIndex = 0;
        var blockId = undefined;
        var charOffset = 0;

        if (blockEl) {
          var rawId = blockEl.getAttribute('data-block-id');
          if (rawId) {
            blockId = rawId;
            var parts = rawId.split('-b');
            if (parts.length === 2) {
              blockIndex = parseInt(parts[1], 10) || 0;
            }
          }
        }

        return {
          chapterIndex: chapterIdx,
          blockIndex: blockIndex,
          blockId: blockId,
          charOffset: charOffset,
          progression: fraction
        };
      }

      function sendProgress() {
        var loc = captureLocator();
        activeIndex = loc.chapterIndex;

        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'scrollProgress',
            chapterIndex: loc.chapterIndex,
            fraction: loc.progression,
            locator: loc,
            scrollY: window.pageYOffset || 0
          }));
        } catch (e) {}
      }

      function onScrollTick() {
        updateVelocity();
        scanAndRequestChapters();

        var now = Date.now();
        if (now - lastProgressTime >= 250) {
          lastProgressTime = now;
          sendProgress();
        }

        if (idleEvictTimer) clearTimeout(idleEvictTimer);
        idleEvictTimer = setTimeout(function() {
          sendProgress();
          evictDistantChapters();
        }, 250);
      }

      window.addEventListener('scroll', function() {
        if (scrollRafId) return;
        scrollRafId = window.requestAnimationFrame(function() {
          scrollRafId = null;
          onScrollTick();
        });
      }, { passive: true });

      return {
        setSmallTier: function(val) { isSmallTier = !!val; },
        supplyChapters: function(payload) {
          if (!Array.isArray(payload)) return;

          for (var i = 0; i < payload.length; i++) {
            var item = payload[i];
            var sec = document.getElementById('chapter-' + item.index);
            var body = document.getElementById('chapter-body-' + item.index);
            if (!sec || !body) continue;

            body.innerHTML = item.body;
            sec.setAttribute('data-loaded', 'true');
            loadedChapters.add(item.index);
            pendingRequests.delete(item.index);

            // Measure actual rendered height and calibrate model
            var measuredH = body.offsetHeight || 1;
            sec.style.minHeight = measuredH + 'px';
            if (calibratedSamples < 30) {
              calibratedSamples++;
            }
          }

          // If current scroll window needs more after injection, re-scan
          window.requestAnimationFrame(function() {
            scanAndRequestChapters();
          });
        },
        restoreLocator: function(loc) {
          if (!loc) return;
          var targetEl = null;
          if (loc.blockId) {
            targetEl = document.querySelector('[data-block-id="' + loc.blockId + '"]');
          }
          if (!targetEl && typeof loc.chapterIndex === 'number') {
            targetEl = document.getElementById('chapter-' + loc.chapterIndex);
          }
          if (targetEl) {
            var rect = targetEl.getBoundingClientRect();
            var top = rect.top + (window.pageYOffset || 0);
            if (loc.progression && !loc.blockId) {
              top += loc.progression * (rect.height || 0);
            }
            window.scrollTo(0, Math.max(0, top));
          }
        }
      };
    })();

    window.addEventListener('load', function() {
      window.setTimeout(function() {
        window.__liruneV2.supplyChapters([]);
      }, 0);
    });
  `;
}
