# Lirune Reader

> A calm, private home for your library on Windows & Android.

[![Download on Microsoft Store](https://img.shields.io/badge/Microsoft_Store-Get_the_App-0078D7?logo=microsoft&logoColor=white)](https://apps.microsoft.com/detail/9PDNFZ146HDX?hl=en-us&gl=IN&ocid=pdpshare)
[![GitHub Windows Release](https://img.shields.io/github/v/release/vasanthgajavelly5-sys/Lirune?label=Windows%20Release)](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v5.6.2)
[![Android APK Release](https://img.shields.io/badge/Android%20APK-v4.9.3-3DDC84?logo=android&logoColor=white)](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v4.9.3)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Lirune Reader is a free, private, and open-source reading application available on the **[Microsoft Store](https://apps.microsoft.com/detail/9PDNFZ146HDX?hl=en-us&gl=IN&ocid=pdpshare)**, as a **Windows Desktop Installer / Portable Executable**, and for **Android (Direct Release APK)**. It keeps your library, reading progress, highlights, notes, typography themes, and preferences strictly on your device without requiring an account, cloud sync, or internet connection.

## Supported Document & E-Book Formats

Lirune Reader supports **19 universal document, e-book, and comic book formats** across both Windows and Android:

| Category | Format Extensions | Reader Engine & Security |
|:---|:---|:---|
| **Standard E-Books** | `.epub` (EPUB 2 / 3) | Full spine pagination & continuous virtualized scroll, custom styling, TOC. |
| **PDF Documents** | `.pdf` | Integrated offline PDF.js engine with page jumping and zoom controls. |
| **Kindle Formats** | `.mobi`, `.azw`, `.azw3` | PalmDOC & KF8 record unpacking with text extraction. |
| **FictionBook2** | `.fb2`, `.fbz` (Zipped FB2) | Clean XML parser, base64 cover extraction, and strict XSS sanitization. |
| **Office Documents** | `.docx`, `.doc`, `.odt`, `.rtf` | Word & OpenDocument XML unpacker, RTF control-word tokenizer (no macros). |
| **Text & Markup** | `.txt`, `.md`, `.html`, `.htm` | Clean CommonMark markdown, encoded plaintext, and script-stripped HTML. |
| **Comic Books** | `.cbz`, `.cbr`, `.cb7` | High-resolution image archive extraction with zip-bomb protection. |
| **Reference & Scanned**| `.chm`, `.djvu` | ITSF compiled help HTML extraction and DjVu layered document viewer. |

*Note: DRM-protected files and encrypted proprietary containers are rejected. Lirune Reader respects copyright and does not circumvent copy protection.*

## Key Features

- **Universal Multi-Format Library**: Grid and list views, cover art caching, reading progress, favorites, collections, and continue reading.
- **Reading Comfort**: Paginated or continuous vertical scroll modes, responsive font sizing, line height, margins, and custom themes (including Nord, Gruvbox, Solarized, Dracula, OLED, and Sepia).
- **Study & Annotations**: Interactive table of contents, in-book search, bookmarks, highlights, notes, and Markdown annotation export.
- **Privacy & Zero Telemetry**: 100% offline operation. No accounts, no analytics, no external tracking, and zero remote font dependencies.
- **Security Hardened**: DOMPurify HTML sanitization, context isolation, strict CSP, path traversal (Zip-Slip) guards, and 512 MB file bounds.

## Available Platforms & Installation

### 1. Windows (Desktop & Microsoft Store)
- **Microsoft Store (Official)**: [Install from the Microsoft Store](https://apps.microsoft.com/detail/9PDNFZ146HDX?hl=en-us&gl=IN&ocid=pdpshare) (Product ID: `9PDNFZ146HDX`).
- **Direct Installer**: Download `Lirune Reader-5.6.2-Setup.exe` from [GitHub Releases](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v5.6.2).
- **Portable / Batch Launcher**: Run `Launch-Lirune.bat` to launch the local build directly.

### 2. Android (Mobile & Tablet)
- **Edition**: Lirune Reader for Android (v4.9.3+), powered by React Native and Expo Router.
- **Direct APK**: Download `Lirune-Reader-v4.9.3-release.apk` directly from [GitHub Releases](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v4.9.3).
- **Mobile Engine**: Features exclusive virtualized **Scroll Engine v2**, native SQLite storage, Android Storage Access Framework (SAF) folder browsing, and zero network permissions (`android.permission.INTERNET` stripped from production release builds).
- **Source Code**: Maintained in the `android` branch under the `mobile/` directory.

## Development

All changes follow the repository's permanent modernization and validation
rules in [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md),
[CODE_QUALITY_CHECKLIST.md](CODE_QUALITY_CHECKLIST.md), and
[DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md).

Requirements: Windows 10/11, Node.js 20 or newer, and npm.

```powershell
git clone https://github.com/vasanthgajavelly5-sys/Lirune.git
cd Lirune
npm ci
npm start
```

Useful commands:

```powershell
npm test                  # Run all discovered Windows desktop tests
npm run lint              # Static analysis and linting
npm run check:modernization # Reject newly introduced legacy API patterns
npm run dist:win          # Build Windows NSIS installer
npm run dist:store        # Build Microsoft Store AppX package
npm run validate:release  # Validate release configuration and artifacts
```

To build Android:
```powershell
git checkout android
cd mobile
npm install
npm test
cd android
./gradlew :app:assembleRelease
```

## Privacy & Security

Books and reading data stay on your computer or phone. Managed book binaries are stored in private local storage. IndexedDB / SQLite store metadata, reading state, annotations, and preferences.

Lirune Reader does not collect telemetry, make remote API requests, or send reading data over the network. See [PRIVACY.md](docs/PRIVACY.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Troubleshooting

- **A book will not import:** Check the displayed error. Lirune Reader rejects invalid archives, missing package files, encrypted resources, and DRM-protected books.
- **Windows SmartScreen warning:** Lirune is an independent open-source project. If SmartScreen shows an unrecognized app warning on unsigned releases, click "More info" -> "Run anyway", or install directly via the [Microsoft Store](https://apps.microsoft.com/detail/9PDNFZ146HDX?hl=en-us&gl=IN&ocid=pdpshare).
- **Android installation:** Enable "Install unknown apps" in Android settings for your browser or file manager to install the standalone APK.

## License

Copyright © 2026 Vasanth Gajavelly.

Lirune Reader is licensed under the GNU General Public License v3.0 only (GPL-3.0-only).

See [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md) for licensing and copyright information. Third-party components retain their respective licences and copyright notices.
