# EPUB Final QA Status

Date: 2026-10-01

## Evidence boundary

Static and parser checks are current. The official Android GPU emulator was not available, so visual, gesture, timing, memory, and full-book persistence claims remain BLOCKED.

| Area | Current state | Verification | Status |
|---|---|---|---|
| EPUB2 container/OPF/spine/NCX | Implemented with path normalization and fallbacks | Corpus/regression tests | PARTIAL |
| EPUB3 navigation | Implemented | Source review/parser corpus | PARTIAL |
| XHTML/CSS/resources | Chapter extraction, image inlining, sanitizer | Sanitizer tests/typecheck | PARTIAL |
| Images/SVG/fonts | Images supported; SVG is intentionally removed by sanitizer; font behavior untested live | Source only | PARTIAL |
| Opening speed | Lazy initial chapter and adjacent prefetch; whole EPUB still base64-loaded | No device timing | PARTIAL |
| Page mode | Column pagination and page turns present; zoom/safe-area fixed in source | No gesture/screenshot test | PARTIAL |
| Continuous mode | Scroll progress now reported; chapters remain separate WebViews | No full-book scroll test | PARTIAL |
| Zoom | Paginated viewport allows scaling; continuous viewport allows scaling | No pinch test | PARTIAL |
| Typography/themes | Settings-driven HTML styles | No screenshot matrix | PARTIAL |
| Search | Chapter search and results exist | Parser/source only | PARTIAL |
| Annotations/bookmarks | Shared store integration exists | No live location test | PARTIAL |
| TTS | Active chapter content is supplied for EPUB/DOCX; voice persistence added | No device voice test | PARTIAL |
| Progress/persistence | Startup restore gate and scroll/page reporting improved; writes queued | Unit/typecheck only | PARTIAL |
| Top safe area | Paginated content includes top inset padding | No cutout screenshot | PARTIAL |
| Bottom safe area | Footer uses bottom inset; content padding added in page mode | No screenshot | PARTIAL |
| Malformed files | Error state/retry and path tests exist | No torture run on device | PARTIAL |
| Large books/memory | Import cap and EPUB archive budgets added; complete base64 model remains | No profiler/emulator | BLOCKED |

## Current fixes

- Sanitized chapter markup and unsafe resource attributes.
- Added retry/remount path for EPUB load errors.
- Prevented initial progress from overwriting restored state before viewport feedback.
- Added scroll progress messages.
- Enabled paginated zoom and safe-area-aware content padding.
- Added import-size rejection and progress write coalescing.

## Remaining engineering work

A genuine continuous-scroll EPUB model should render multiple sanitized chapters in one scroll document with explicit chapter markers and location mapping. PDF.js should move to a patched advisory-free release after a controlled asset migration. Both require emulator regression before release claims.
