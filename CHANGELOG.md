## Unreleased - Android reader hardening

Fixes and hardening across the Android edition; every phase is a separate commit.

### Native module and app config
- The `LiruneStorage` Kotlin module is now tracked in the repository and
  re-installed by `plugins/withLiruneStorage.js` on every prebuild, so
  `prebuild --clean` can no longer silently delete it. A missing module is logged
  at startup and reported in the Files screen.
- `plugins/withCutoutMode.js`, `plugins/withAndroidConfigChanges.js` and
  `plugins/withReleaseSigning.js` replace hand-edited files in the generated
  `android/` tree.
- Orientation follows the system rotation lock, `MANAGE_EXTERNAL_STORAGE` and
  `READ_EXTERNAL_STORAGE` are declared, `versionCode` is tracked, and the build
  covers `armeabi-v7a`, `arm64-v8a`, `x86` and `x86_64`.
- Landscape can draw into the display cutout while safe-area insets keep text out
  of it; `density`/`fontScale` changes re-lay out instead of recreating the
  activity.

### EPUB
- One heading per chapter in scroll mode, and no fabricated "Chapter N" for a
  spine item the publication never named.
- Table-of-contents entries resolve: NCX `src` against the NCX directory, nav
  hrefs keep their `#fragment`, percent-encoded names decode, and nested
  `ol`/`navPoint` levels indent.
- Chapter turns skip `linear="no"` items while every spine index, chapter id and
  CFI keeps addressing the same document.
- Books are read as bytes instead of base64, the page count is rounded up and
  re-measured once fonts, images and resize settle, and a missing embedded font
  can no longer leave text invisible.
- Metadata comes from one shared OPF parser: entities, CDATA, every `dc:creator`,
  language, publisher, date, series and both cover conventions.

### Layout
- Reader chrome toggling no longer re-flows the text: stable safe-area insets,
  nothing is painted before the container is measured, font scale is reactive,
  geometry settles for 200ms before it is applied, and module-level
  `Dimensions.get('window')` reads are gone.
- Two columns need two readable measures and a 720dp window with 24dp of
  hysteresis, instead of flipping at 600dp; a new Columns setting (auto/1/2)
  overrides it.

### Files and storage
- Scan Phone no longer lists the app's own imported copies, can see Downloads and
  the storage root with All files access (explained before it is requested), shows
  a cancellable native walk with progress, and always falls back to MediaStore and
  the authorised folders.
- Rows show the real title and author, read from the EPUB's OPF without copying
  the book; duplicate detection uses format, size and file name or title+author
  instead of comparing a file name to a title.

### PDF
- The document is streamed into the viewer in 512KB ranges with real progress,
  layout is pushed instead of baked in, renders are queued rather than cancelled
  on a shared canvas, the canvas is capped at 16MP, and fit mode is explicit.
- Search, outline-as-contents, pinch re-render, panning, Retry and password
  prompts are wired; import reads only the ends of the file.

### Robustness
- A killed WebView renderer is detected, the position is flushed and the view is
  rebuilt.
- Reading progress is flushed when the app leaves the foreground and when the
  reader closes.
- Imports are staged as `.part` files and renamed after verification, stale ones
  are cleaned at startup, and a free-space check runs before copying.

## 4.0.6 - Android v4.0.6 release (EPUB engine)

EPUB reading pipeline rebuilt around a per-publication session, and the
responsive reader geometry corrected.

### EPUB engine

- Added a per-publication `EpubArchive` session that owns the ZIP, a normalized
  resource index, and the embedded-resource cache. It is disposed when the book
  changes, so nothing can leak between books.
- Replaced the per-lookup linear archive scan with a normalized lookup index
  (exact path, case-folded path, then a unique file-name match). Measured 4-24x
  faster than the previous `Object.values(zip.files).find(...)` fallback, and it
  recovers books whose own relative image paths do not resolve.
- Embedded resources (images, fonts) are now read and base64-encoded at most
  once per session, behind a least-recently-used byte budget so an
  image-heavy publication cannot grow the heap without limit.
- Implemented CSS `@import` resolution: nested chains are inlined in cascade
  order, media conditions are preserved, duplicate and cyclic imports terminate
  safely, and the earlier blanket removal of `@import` is gone.
- Implemented embedded font support. `.woff`, `.woff2`, `.ttf`, and `.otf`
  sources inside `@font-face` are resolved from the publication and embedded,
  with `font-family`, `font-weight`, `font-style`, `font-stretch`, and
  `unicode-range` preserved.
- Resource discovery now covers `url()` inside inline `style` attributes
  (`background-image`, `background`, `list-style-image`, borders) in addition to
  `src` and `xlink:href`. `data:`, `http:`, `https:`, `blob:`, and
  fragment-only references are left untouched.
- Replaced the fragile `<body>` regular expression with a comment-, CDATA-, and
  raw-text-aware scanner, so a `</body>` inside a comment or a script string no
  longer truncates a chapter.
- Safe inline SVG is preserved again (diagrams, illustrations, icons, MathML),
  including `epub:type`, `xml:*`, and ARIA attributes. Cover-only
  `<svg><image/></svg>` wrappers still become ordinary images. The SVG cover
  transform is now a bounded scan, so a malformed or oversized document can no
  longer stall the UI thread.
- Chapter titles now prefer the book's own navigation metadata (EPUB 3 `nav`,
  then NCX) over the document `<title>`, which is frequently just the book
  title repeated in every chapter. Generic placeholders such as `Chapter 3`
  still yield to a real chapter heading.
- Fixed TOC targets being resolved twice against the package directory, which
  left every navigation entry unclickable.

### Reader

- Fixed an infinite render loop ("Maximum update depth exceeded") that crashed the
  reader when turning a page at the end of a chapter. The reader published its own
  progress CFI, the host echoed it back as a navigation target, and the reader
  chased it between two chapters forever. Navigation targets that are the
  reader's own progress echo, or a request that has already been honoured, are
  now ignored.
- Fixed the next text column bleeding into the right edge of every page. In CSS
  multicol, padding on the container insets the whole flow rather than separating
  neighbouring columns, so the reading margin now sits on the content inside each
  column fragment and one page is exactly one viewport wide.
- Fixed a chapter reporting a page count of 1 regardless of its length: the page
  count is now measured from the column flow rather than the padded content box.
- Fixed the two-column inset on tablets, where the margin computed for one wide
  centred column left no room for text in a half-width column.
- Reading position now survives layout-affecting changes. Rotating, changing
  font size, margin, line height, alignment, or theme captures a stable anchor
  (element id, character offset, chapter, scroll ratio) before the document is
  re-rendered and restores it afterwards, instead of replaying a stale pixel
  offset.
- Fixed horizontal clipping in the paginated reader: the column container was
  `content-box` with a `100vw` width plus horizontal padding, so its content
  extended past the viewport. Column width and side insets are now derived from
  the measured content box.
- Side-inset rounding is clamped so `sideOffset + columnWidth` can never exceed
  the space available, including with asymmetric safe-area insets.
- Publisher typography is preserved (drop caps, indents, floats, blockquotes,
  small caps, `page-break-*` hints) while reader-owned safety rules are layered
  after the book stylesheet so they win without stripping legitimate CSS.
- Continuous mode renders one document at load time and hydrates the remaining
  chapters in batches, instead of re-rendering on every scroll position change.
- Progress and scroll state are reset when a different book is opened.

### Content safety

- Single-pass sanitiser that is idempotent and no longer double-escapes
  character references in attribute values.
- HTML comments dropped (conditional-comment scripts cannot execute); CDATA
  sections unwrapped and re-sanitised so wrapped content is preserved but
  wrapped scripts are not.
- SMIL animation elements that target `href`/`xlink:href` are dropped, and
  event handlers, `javascript:` URLs, `expression()`, `behavior`, and
  `-moz-binding` remain blocked in every context.
- Stylesheets can no longer terminate the reader's own `<style>` element.

### Storage

- Android import prefers a native content-URI stream copy, with the existing
  `copyAsync` and base64 paths kept as fallbacks.
- Scan Phone now performs MediaStore discovery through a native bridge, which
  works on Android 10+ without `MANAGE_EXTERNAL_STORAGE`, and still scans
  well-known paths when they are accessible.

### Verification

- 198 automated tests, including a real-publication corpus harness that opens
  every EPUB in the QA corpus, renders every chapter, and asserts there is no
  active content and no fetchable reference to the network.
- TypeScript and lint clean.
- Signed release APK installed and exercised on an Android 16 emulator: library,
  EPUB open, TOC navigation, chapter and page navigation, continuous scrolling,
  font size, theme, rotation, and switching between EPUB, DJVU, CBZ and TXT —
  each resolving to its own distinct file path.
- The release APK is a signed `assembleRelease` build, `versionCode 3`,
  signed with the existing `CN=Lirune Reader Release` key.

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

