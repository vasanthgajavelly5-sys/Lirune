## 4.0.5 - Android v4.0.5 release

- Fixed EPUB table-of-contents targets so internal fragments are preserved, and restored
  the correct chapter after a continuous-document hydration instead of the last chapter.
- Ignored stale reader scroll events while a requested chapter navigation is still pending.
- Bound the resolved reader source to the book it was resolved for. Switching books inside
  one app session previously handed the newly mounted engine the previous book's file path,
  which surfaced as spurious parse errors in unrelated formats.
- Restated `mobile/LICENSE` as GPL-3.0-only and added `mobile/THIRD_PARTY_NOTICES.md`
  covering the real Android dependency set, the vendored Apache-2.0 PDF.js, and the
  public-domain offline dictionary.
- Added Maestro flows for corpus import, an 18-format reader matrix, reader-session
  isolation, and EPUB deep QA.
- Moved stray QA screenshots out of the application source root into the live-QA evidence
  folder and ignored transient device-run output.

## 4.0.0 - Production hardening

- Moved managed EPUB binaries out of normal IndexedDB library reads.
- Added deterministic SHA-256 storage identities and legacy migration safeguards.
- Added verified managed reads, favorite state, collection metadata, and library filters.
- Added bounded cancellable in-book search and debounced reader/theme preference writes.
- Added offline CSP and removed Google Fonts runtime dependency.
- Added local Windows release validation and Store preparation documentation.

# Changelog

## 3.5.0 - 2026-09-17

- Added app-controlled light and dark themes for native controls instead of relying on Windows system colors.
- Added a dedicated themed loading card while the library is loading.
- Prevented the empty-library state from appearing before library data is ready.
- Added a frameless full-page window experience with custom minimize, maximize, and close controls.
- Added draggable application toolbars while preserving interactive search and reader controls.
- Improved EPUB loading and local library storage handling.
