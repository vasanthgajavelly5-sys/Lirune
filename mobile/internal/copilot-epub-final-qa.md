# EPUB Final QA Status

Date: 2026-10-01

## Evidence boundary

Static and parser checks are current. The official Android GPU emulator was not available, so visual, gesture, timing, memory, and full-book persistence claims remain BLOCKED.

| Area | Current state | Verification | Status |
|---|---|---|---|
| EPUB2 container/OPF/spine/NCX | Implemented with path normalization and fallbacks | Corpus/regression tests | PARTIAL |
| EPUB3 navigation | Implemented | Source review/parser corpus | PARTIAL |
| XHTML/CSS/resources | Chapter extraction, local stylesheet/resource inlining, and sanitizer | No live content fixture after latest change | PARTIAL |
| Images/SVG/fonts | Image inlining exists; local CSS font/image URLs are now embedded. SVG image edge cases remain | Source only | PARTIAL |
| Opening speed | Initial chapter is lazy; ZIP now enters JSZip as binary after the file-system Base64 bridge conversion. Archive still loads in full and full-book profiling is outstanding | No device timing | PARTIAL |
| Page mode | Column pagination and page turns present; zoom/safe-area fixed in source | No gesture/screenshot test | PARTIAL |
| Continuous mode | One WebView document contains chapter sections; chapter hydration now waits for WebView load and restores scroll after hydration | No full-book scroll test | PARTIAL |
| Zoom | Paginated viewport allows scaling; continuous viewport allows scaling | No pinch test | PARTIAL |
| Typography/themes | Settings-driven HTML styles | No screenshot matrix | PARTIAL |
| Search | Chapter search and results exist | Parser/source only | PARTIAL |
| Annotations/bookmarks | Shared store integration exists | No live location test | PARTIAL |
| TTS | Active chapter content is supplied for EPUB/DOCX; voice persistence added | No device voice test | PARTIAL |
| Progress/persistence | Startup restore gate and scroll/page reporting improved; writes queued | Unit/typecheck only | PARTIAL |
| Top safe area | Paginated content includes top inset padding | No cutout screenshot | PARTIAL |
| Bottom safe area | Footer uses bottom inset; content padding added in page mode | No screenshot | PARTIAL |
| Malformed files | Error state/retry and path tests exist | No torture run on device | PARTIAL |
| Large books/memory | Import cap and EPUB archive budgets added; whole ZIP and chapter cache still occupy memory | No profiler/emulator | BLOCKED |

## Current fixes

- Sanitized chapter markup and unsafe resource attributes.
- Added retry/remount path for EPUB load errors.
- Prevented initial progress from overwriting restored state before viewport feedback.
- Added scroll progress messages.
- Enabled paginated zoom and safe-area-aware content padding.
- Added import-size rejection and progress write coalescing.

## Remaining engineering work

The current continuous-scroll model uses one WebView document with explicit chapter markers and location mapping. Its load-time chapter hydration has been hardened, but whole-book scroll behavior still requires emulator regression. PDF.js should move to a patched advisory-free release after a controlled asset migration.

## 2026-10-02 engineering continuation

- Continuous chapter population no longer runs from a 100 ms timer that could beat WebView creation. The WebView load callback hydrates chapters into the single continuous document, including already-cached chapters after source/theme reload, and applies saved scroll only after population. Progress messages are ignored during hydration. This is source-level work only; the user asked to pause format QA, so no EPUB live retest has been run.
- EPUB archive bytes now pass to JSZip as an ArrayBuffer instead of a Base64 string. Expo's legacy file API still produces a temporary Base64 string internally, so this does not eliminate bridge conversion or full-archive memory use.
- Chapter stylesheets and inline styles are collected; local CSS image/font resources are embedded and external CSS resources/imports are dropped. Sanitizer/security review and EPUB fixture coverage are still required.
- Do not mark continuous scrolling, CSS/font support, startup performance, or EPUB controls as live PASS until separately authorized QA resumes.
