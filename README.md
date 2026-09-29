# Lirune Reader

> A calm, private home for your EPUB library on Windows.

Lirune Reader is a free and open-source Windows desktop reader for EPUB books. It keeps your library, reading progress, highlights, notes, themes, and preferences on your computer without an account or cloud library.

## Features

- Local library with cover art, search, sorting, grid/list views, progress, favorites, collections, and continue reading.
- EPUB 2 and EPUB 3 reading in paginated or scrolling layouts.
- Table of contents, in-book search, bookmarks, highlights, notes, and Markdown annotation export.
- Single-file, folder, recursive, drag-and-drop, and Explorer imports.
- Collision-safe managed EPUB storage outside normal IndexedDB metadata reads.
- Local metadata backup and restore.
- Offline-first operation with no account, cloud library, telemetry, or remote font dependency.

## Install On Windows

Download the latest `Lirune Reader-<version>-Setup.exe` from the repository's Releases page. The installer adds Start Menu and desktop shortcuts and associates `.epub` files with Lirune Reader.

Unsigned development releases may trigger Windows reputation or Application Control warnings. Verify that installers came from the official project release before running them.

## EPUB Compatibility

Lirune Reader accepts standard EPUB 2 and EPUB 3 ZIP packages with `META-INF/container.xml` and an OPF package document. It supports nested OPF paths, Unicode filenames, incomplete metadata, and cover resources when epub.js can resolve them.

DRM-protected books and EPUBs with encrypted resources are detected and rejected. Lirune Reader does not bypass DRM. Malformed archives and invalid package documents are reported without stopping a folder import.

## Privacy

Books and reading data stay on the computer. Managed EPUB binaries are stored in local application storage. IndexedDB stores metadata, reading state, annotations, preferences, favorites, and collections; it does not serve as the library's binary store after migration.

Lirune Reader does not require an account and does not upload book content, annotations, or library metadata. See [PRIVACY.md](docs/PRIVACY.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

Requirements: Windows 10 or later, Node.js 20 or newer, and npm.

```powershell
git clone https://github.com/vasanthgajavelly5-sys/Lirune.git
cd Lirune
npm ci
npm start
```

> The repository was renamed from **Novera** to **Lirune** on GitHub. GitHub redirects the old URL, so existing clone links, issue links, and release links continue to work.

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

`Master_EPUB_Library_All/` is an optional local regression corpus and is intentionally ignored by Git. Do not add books, private libraries, credentials, or generated user storage to commits.

## Mobile App

The `android` branch contains the Lirune Reader mobile foundation in [mobile](mobile). It uses Expo and React Native and remains a separate mobile integration layer.

## Troubleshooting

- **A book will not import:** Check the displayed error. Lirune Reader rejects invalid archives, missing package files, encrypted resources, and DRM-protected books.
- **An EPUB does not open from Explorer:** Re-run the installer and try again. The installer registers the `.epub` association.
- **The app will not start from source:** Run `npm ci`, confirm Node.js with `node --version`, and retry `npm start`.
- **I need to reset my library:** Back up application data first. Resetting application data removes books, annotations, and preferences.

## License

Copyright © 2026 Lirune Reader contributors.

Lirune Reader is licensed under the [GNU General Public License v3.0 only](LICENSE). See [COPYRIGHT.md](COPYRIGHT.md) for the project notice.
