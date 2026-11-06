## 5.6.3 - 2026-11-06

### Changed
- Replaced the RAR/CBR decoder with libarchive-wasm for licence compatibility.

## 5.6.2 - 2026-10-28

### Security
- FB2 Cover Sanitization & XSS Prevention: Thoroughly sanitized FB2 cover data URLs to protect against SVG payload execution, CSS expression injection, and attribute breakout attacks.
- Archive Exhaustion & Zip-Bomb Protection: Implemented strict unpacking limits (maximum uncompressed size caps, maximum file counts, and entry ratio checks) across archive extraction flows.
- IPC Bridge Hardening: Enforced context isolation, strict parameter validation, path TTLs, safe sender validation, and eliminated unsafe remote IPC channels.

### Fixed
- Batch Launcher Fix: Corrected syntax and escape handling in `Launch-Lirune.bat` and documented the architecture specification.
- Cross-Platform Test Execution: Updated test runner commands to operate consistently across Windows PowerShell and Unix shells.

## 5.6.1 - 2026-10-25

### Added
- Distraction-Free Fullscreen Reading: Status bar, reading progress stripe, and top toolbar are hidden in focused fullscreen mode; floating frosted glass controls pill provides immediate TOC and Settings access.
- Quick Themes in Side Panel: Direct visual theme swatches in reading settings drawer for one-click theme switching.
- Window Controls & Desktop Chrome: Dynamic maximize/restore button state synchronization and crisp window management controls.

## 5.6.0 - 2026-10-23

### Added
- Fullscreen Table of Contents: Dedicated floating frosted glass action pill in fullscreen mode containing TOC and Settings buttons.
- Responsive Sizing for Restored / Split Windows: Adaptive toolbar actions capsule preventing button congestion or collisions down to 720px window widths.
- Smooth Top Hover Reveal: Polished fullscreen top edge reveal interaction.

## 5.5.0 - 2026-10-09

### Added
- Custom Glass Dropdowns: Replaced default select controls with accessible glass dropdowns featuring arrow navigation, aria-expanded, and auto-sync.
- Settings UI: Refined frosted glass card surfaces, typographic alignment, and About card structure.
- Launcher & Packaging: Windows Desktop Microsoft Store AppX and NSIS release packages.

## 5.0.0 - Lirune V5 Major Upgrade

### Improvements & Fixes
- **Library List View** — Redesigned list mode into a true horizontal list layout displaying compact book cover, title, author, reading progress bar, chapter/page count, favorite control, direct read action, and options menu.
- **Windows File Association & Double-Click** — Reliable OS file open handling for both cold application launches and active running instances, resolving imported books and immediately opening the reader.
- **Continuous Reading Mode** — Refactored EPUB continuous scrolling with dedicated continuous manager, coordinated scroll ownership, natural wheel and trackpad handling, and dedicated keyboard navigation.
- **Subtle Motion & Transitions** — Replaced bouncy spring animations with calm, fast, and purposeful UI transitions across views, modals, cards, and reader controls; full support for prefers-reduced-motion.
- **Async Session Token Protection** — Guarded asynchronous reader operations (locations, TOC, annotations, progress persistence) against cross-book mutations and race conditions.
- **Controlled Import Memory Overhead** — Streamlined bulk file and folder imports to avoid holding duplicate in-memory buffers simultaneously.
- **Currently Reading Multi-Book Capacity** — Expanded Currently Reading strip to display up to two books simultaneously in most-recently-read order, with independent reading progress, duplicate protection, and restart persistence.

## 4.1.0 - Bug fixes & format parity

### Bug fixes
- **File click in folder now opens the book directly** — clicking a book file in a folder-imported collection previously showed the library screen; the reader now opens immediately after import.
- **Theme no longer flashes on startup** — light-mode users no longer see a brief dark flash; the saved theme is applied before the first paint using a synchronous localStorage cache.
- **EPUB arrow-key navigation restored** — ArrowRight/ArrowLeft/PageDown/PageUp and Space now reliably navigate pages regardless of whether the EPUB iframe or the outer window has focus; a direct fallback handler ensures keys are never silently dropped.
- **Arrow keys work correctly in scroll mode** — in Scroll layout, ArrowRight/Left scroll the page instead of jumping to the next spine item, matching the behaviour of ArrowDown/Up.

### New format support (parity with Android)
- **DOCX** — Microsoft Word 2007+ documents. Headings become chapters; bold and italic inline runs are preserved.
- **ODT** — OpenDocument Text files. Title, author, and heading structure are extracted.
- **RTF** — Rich Text Format. Control words are stripped and prose is rendered as flowing paragraphs.
- All three formats show the document's own title and author in the library card.

## 4.0.4

- Replaced legacy sample book with an original built-in first-run tutorial: "Welcome to Lirune".
- Added a full offline guide covering library management, reading customization, keyboard shortcuts, annotations, and local-first backups.
- Replaced sample cover with an original dynamic canvas-generated Lirune design.
- Removed all legacy sample references and third-party sample text.
- Finalized Microsoft Store package identity and release assets.

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
