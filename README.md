# Lirune

Lirune is a private, local-first, open-source document and ebook reader designed
for offline reading.

Books stay on your device. Lirune requires no account, no cloud backend, no
sign-in, and no advertising. Once a book is available locally, reading it needs
no network access.

## Features

- **Local library** — imported books, cover art, progress, favourites,
  collections, and grid/list views.
- **Import from device storage** — pick individual files, or discover books in
  bulk with Scan Phone and Scan Folder, including Storage Access Framework
  (SAF) folders the user has granted access to.
- **18 document formats** — see [Supported Formats](#supported-formats).
- **EPUB reading** — paginated (column) and continuous scrolling layouts, table
  of contents, reading-position restoration, embedded images and fonts, inline
  SVG diagrams, MathML, footnotes, and publisher typography.
- **Reading controls** — font size, font family, line height, margins, text
  alignment, paragraph spacing, themes (light/dark/sepia and more), page gaps,
  and pinch-to-zoom.
- **Text search** — in-book search across the publication with excerpts.
- **Bookmarks and annotations** — highlights, notes, and bookmarks stored
  locally per book.
- **Text-to-Speech** — offline speech playback of the current chapter, with
  voice selection.
- **Offline dictionary** — a bundled public-domain dictionary, usable without a
  network connection.
- **PDF reading** — rendered locally through a vendored PDF.js build; no upload
  and no online viewer.

## Supported Formats

Verified against the Android implementation's format table
(`mobile/models/Book.ts`, `mobile/services/discovery/FormatDetector.ts`):

| Format | Extensions | Notes |
|---|---|---|
| EPUB | `.epub` | Full reader; see [EPUB Engine](#epub-engine) |
| PDF | `.pdf` | Local PDF.js renderer |
| TXT | `.txt` | Plain text with encoding detection |
| HTML | `.html`, `.htm` | Sanitised local rendering |
| FB2 | `.fb2` | FictionBook |
| CBZ | `.cbz` | Comic book archive |
| CBR | `.cbr` | Comic book archive |
| MOBI | `.mobi` | PalmDoc/MOBI |
| AZW | `.azw` | Kindle |
| AZW3 | `.azw3`, `.kf8` | Kindle |
| DJVU | `.djvu` | DjVu |
| DOC | `.doc` | Word 97-2003 binary |
| DOCX | `.docx` | Office Open XML |
| RTF | `.rtf` | Rich Text Format |
| ODT | `.odt` | OpenDocument Text |
| CHM | `.chm` | Compiled HTML help |
| ZIP | `.zip` | Archive listing |
| RAR | `.rar` | Archive listing |

Format detection uses file extension first and then binary magic bytes, so a
mis-labelled file is still identified correctly.

## Platforms

### Android

The active development target. Lirune is a native Android application built
with the Expo SDK and React Native, packaged as a signed APK and distributed
through GitHub Releases.

- Application ID: `com.lirune.reader`
- Minimum SDK 24 (Android 7.0), target SDK 36
- ABIs: `arm64-v8a`, `x86_64`
- Runs on phones and tablets; the reader geometry adapts to the measured
  viewport, including two-column reading on tablets and correct behaviour in
  landscape

Download the APK from the [Releases page](#download).

### Windows

An existing desktop version lives at the repository root: an Electron
application (`main.js`, `preload.js`, `js/`) packaged with `electron-builder` as
an NSIS installer. It supports EPUB reading with paginated and scrolling
layouts, a local library, in-book search, bookmarks, highlights, notes, and
annotation export.

The Windows implementation is not changed as part of the Android release. It is
tracked on its own branch (`lirune-desktop-4.1`); the root `main` branch carries
the desktop project and this README.

## Privacy & Offline

Lirune is designed around local reading.

- Books are stored in, and read from, local device storage.
- No account is required for local reading.
- No cloud sync is required.
- No advertising is served or required.
- No analytics or telemetry backend is part of the application.
- Reading a book that is already on the device does not require network access.

Files that are imported are copied into the application's own storage so the
library keeps working even if the original location moves. Reading state,
bookmarks, and annotations are stored locally and stay with the device.

## EPUB Engine

The Android app contains a purpose-built EPUB pipeline in
`mobile/services/epub/`. It is not a browser engine: content is parsed, made
self-contained, sanitised, and handed to a sandboxed renderer.

- **Archive and session management** (`archive.ts`) — one session object per
  open publication, owning the ZIP, the resource index, and the embedded
  resource cache. Disposed on book switch so nothing leaks between books.
- **Efficient resource lookup** — a normalized path index (exact, case-folded,
  and unique file-name match) replaces a linear scan over every archive entry.
- **Cached embedded resources** — images and fonts are read and base64-encoded
  at most once per session, with an LRU byte budget so memory stays bounded.
- **CSS `@import` handling** (`inlineCss.ts`) — nested import chains are
  inlined in cascade order, media conditions are preserved, and cycles and
  duplicates are handled.
- **Embedded images** — `src`, `xlink:href`, and `url()` inside inline `style`
  attributes are resolved to embedded data URIs, including publisher background
  images and list markers.
- **Embedded fonts / `@font-face`** — `.woff`, `.woff2`, `.ttf`, and `.otf`
  sources are embedded, with `font-family`, `font-weight`, `font-style`,
  `font-stretch`, and `unicode-range` preserved.
- **SVG** — safe inline SVG (diagrams, illustrations, icons) is preserved;
  cover-only SVG wrappers become ordinary images; scripts, event handlers, and
  SMIL activation vectors are stripped.
- **TOC navigation** — EPUB 3 `nav` and EPUB 2 `ncx` are both read, and chapter
  titles prefer the book's own navigation metadata over generic placeholders.
- **Continuous reading** — all chapters are rendered into one scrolling
  document and hydrated progressively.
- **Reading-position restoration** — the position is captured as a stable
  anchor (element id, character offset, chapter, and scroll ratio) and restored
  after a font-size, margin, theme, or orientation change.
- **Responsive reader geometry** (`services/reader/readerLayout.ts`) — column
  width, side insets, and padding are derived from the measured container and
  the real safe-area insets, so nothing is hardcoded to a screen size.
- **Safe content handling** (`services/security/sanitizeHtml.ts`) — scripts,
  event handlers, unsafe URL schemes, embedded objects, and active CSS
  constructs are removed, while semantic markup, namespaced attributes such as
  `epub:type`, MathML, and publisher typography are kept.

Compatibility: standard EPUB 2 and EPUB 3 packages with
`META-INF/container.xml` and an OPF package document, including nested OPF
paths, incomplete metadata, and books whose relative image paths are wrong.
DRM-protected books are detected and rejected; Lirune does not bypass DRM.

## Download

Android builds are published on the repository's Releases page:

<https://github.com/vasanthgajavelly5-sys/Lirune/releases>

The current Android release is **v4.0.6** (versionCode 3). Each release page
lists the APK size and its SHA-256 checksum, so a downloaded file can be
verified before installation.

To install an APK, enable "Install unknown apps" for your file manager or
browser and open the downloaded file, or install over ADB:

```powershell
adb install -r Lirune-Reader-4.0.6.apk
```

Windows builds, when published, are attached to the same Releases page as an
NSIS installer. Unsigned development builds may trigger Windows reputation or
Application Control warnings; verify that installers came from the official
project release.

## Development

### Android (`android` branch, `mobile/`)

Requirements: Node.js 20 or newer, npm, JDK 17, and the Android SDK.

```powershell
git clone https://github.com/vasanthgajavelly5-sys/Lirune.git
cd Lirune
git checkout android
cd mobile
npm ci
```

Useful commands, run from `mobile/`:

```powershell
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm test                 # node:test suite, including the EPUB corpus harness
```

Release APK (credentials are supplied through Gradle properties and are never
committed):

```powershell
cd android
gradlew.bat assembleRelease
```

The signed artifact is written to
`mobile/android/app/build/outputs/apk/release/app-release.apk`.

`mobile/android/` is generated locally by the Expo prebuild workflow and is
intentionally not committed. Changes to native Android code therefore live in
that local directory.

### Windows (`main` branch, repository root)

Requirements: Windows 10 or later, Node.js 20 or newer, and npm.

```powershell
git clone https://github.com/vasanthgajavelly5-sys/Lirune.git
cd Lirune
npm ci
npm start
```

Useful commands:

```powershell
npm run lint
npm test
npm run audit
npm run validate:corpus
npm run pack
npm run dist:win
npm run validate:release
npm run dist:store
```

## Project Structure

```
Lirune/
├── main.js, preload.js, index.html   Windows desktop application entry points
├── js/                               Windows desktop modules
├── css/, assets/                     Windows desktop assets
├── scripts/                          Windows build, lint and validation scripts
├── test/                             Windows test suite
├── docs/                             Project documentation
└── mobile/                           Android application (Expo / React Native)
    ├── app/                          Routes (library, files, reader, settings)
    ├── components/reader/            Per-format reader views
    ├── services/epub/                EPUB pipeline (archive, markup, CSS, chapters)
    ├── services/reader/              Reader geometry and position handling
    ├── services/security/            Content sanitisation and budget guards
    ├── services/storage/             Local file and native storage access
    ├── models/, state/, theme/       Domain types, stores, reader themes
    └── tests/                        Android test suite and EPUB corpus harness
```

Local QA corpora and generated user storage are ignored by Git. Do not commit
books, private libraries, credentials, or generated user data.

## License

Copyright © 2026 Vasanth Gajavelly and Lirune Reader contributors.

Lirune Reader is free and open-source software licensed under the
[GNU General Public License v3.0 only](LICENSE). See [COPYRIGHT.md](COPYRIGHT.md)
for the project notice and [mobile/THIRD_PARTY_NOTICES.md](mobile/THIRD_PARTY_NOTICES.md)
for the Android dependency set.