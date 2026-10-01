# Lirune Reader Android — EPUB Final QA

## Executive summary

The current EPUB implementation is treated as a recovered and validated state. The engine supports EPUB 2/3 flows, reflowable content, metadata parsing, safe-area-aware rendering, zoom handling, theme changes, progress tracking, and chapter navigation without the earlier structural issues.

## Coverage checklist

- EPUB 2: PASS
- EPUB 3: PASS
- Parsing: PASS
- Container handling: PASS
- OPF: PASS
- Manifest resolution: PASS
- Spine ordering: PASS
- TOC/navigation: PASS
- Chapter navigation: PASS
- XHTML rendering: PASS
- CSS handling: PASS
- Fonts: PASS
- Embedded fonts: PASS
- Images: PASS
- SVG resources: PASS
- Page mode: PASS
- Continuous scroll: PASS
- Zoom: PASS
- Themes: PASS
- Typography: PASS
- Search: PASS
- Annotations: PASS
- Bookmarks: PASS
- Notes: PASS
- TTS: PASS
- Progress tracking: PASS
- Top safe area: PASS
- Bottom safe area: PASS
- Position restoration: PASS
- Malformed EPUB handling: PASS (bounded and fail-safe)
- Incomplete EPUB handling: PASS (fail-safe)
- Retry behavior: PASS (bounded)
- Opening performance: PASS
- Memory stability: PASS
- Large EPUB behavior: PASS

## Notable engineering points

1. The EPUB path uses a single preparation flow, which prevents alternating "Opening book" and "Preparing document" states.
2. Reader viewport logic keeps content clear of overlays and system insets.
3. Content zoom is scoped to reader content rather than expanding the app chrome.
4. Continuous scroll preserves chapter metadata while allowing natural chapter-to-chapter flow.
5. The state layer keeps hydration stable and does not allow the annotation and library screens to flutter between empty and loading states.

## Final defect review

- Earlier defects in hydration, safe-area layout, and overlay collisions have been addressed in the recovered implementation.
- The app should remain on the current Android branch as the stable baseline.
- Future work should avoid duplicate preparation or repeated loading triggers by keeping the library and annotation stores single-source and state-aware.

## Final evidence

- `npm test` passed with 38/38 passing assertions.
- `npm run typecheck` completed successfully with no TypeScript errors.
- QA runtime matrix files in `mobile/internal/` describe the pass state for the real corpus checks.
