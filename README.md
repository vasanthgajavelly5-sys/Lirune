# Lirune Reader

> **Lirune — 50+ formats supported. One reader. Every document. Your device. Your privacy.**

[![Download on Microsoft Store](https://img.shields.io/badge/Microsoft_Store-Get_the_App-0078D7?logo=microsoft&logoColor=white)](https://apps.microsoft.com/detail/9PDNFZ146HDX?hl=en-us&gl=IN&ocid=pdpshare)
[![GitHub Windows Release](https://img.shields.io/github/v/release/vasanthgajavelly5-sys/Lirune?label=Windows%20Release)](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v6.0.0)
[![Android APK Release](https://img.shields.io/badge/Android%20APK-v5.0.0-3DDC84?logo=android&logoColor=white)](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/android-v5.0.0)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Lirune Reader is a free, private, and open-source multi-format reading application available on the **[Microsoft Store](https://apps.microsoft.com/detail/9PDNFZ146HDX?hl=en-us&gl=IN&ocid=pdpshare)**, as a **Windows Desktop Installer / Portable Executable** (v6.0.0), and for **Android** (v5.0.0 Direct Release APK). It keeps your library, reading progress, highlights, notes, typography themes, and preferences strictly on your device without requiring an account, cloud sync, telemetry, or an internet connection.

---

## Supported Document & E-Book Formats

Lirune Reader features full cross-platform parity across **50 canonical primary format families** on both Windows and Android:

| Category | Canonical Format Families | Supported Extensions & Aliases | Reader Engine & Security |
|:---|:---|:---|:---|
| **E-Books** | EPUB, Kindle / MOBI, Kobo EPUB, FictionBook, FictionBook Archive, DjVu, Compiled HTML Help | `.epub`, `.mobi`, `.kepub.epub`, `.kepub`, `.fb2`, `.fbz`, `.djvu`, `.chm` | Reflowable OPF/NCX parser, styled chapter viewer with touch/keyboard pagination, in-book search, DjVu canvas, and CHM extraction. |
| **Documents** | PDF, Plain Text, Markdown, Word Document, Legacy Word, OpenDocument Text, Rich Text, XPS Document | `.pdf`, `.txt`, `.md`, `.docx`, `.doc`, `.odt`, `.rtf`, `.xps` | Integrated offline PDF.js engine, virtualized chunked plaintext, CommonMark markdown, ODF/OOXML unpackers, and XPS layout engine. |
| **Spreadsheets** | CSV, TSV, Excel Workbook, Legacy Excel, OpenDocument Spreadsheet, Macro-enabled Excel, Excel Template, Excel Binary Workbook | `.csv`, `.tsv`, `.xlsx`, `.xls`, `.ods`, `.xlsm`, `.xltx`, `.xlsb` | Modern & legacy spreadsheet renderers, high-performance table virtualization, formula/value display, and sheet tab navigation. |
| **Presentations** | PowerPoint Presentation, Legacy PowerPoint, OpenDocument Presentation, PowerPoint Slide Show | `.pptx`, `.ppt`, `.odp`, `.ppsx` | Slide-by-slide presentation viewer, shape and text frame extraction, thumbnail previews, and keyboard/touch navigation. |
| **Comic Books** | Comic ZIP, Comic RAR, Comic TAR, Comic 7-Zip | `.cbz`, `.cbr`, `.cbt`, `.cb7` | High-resolution image archive extractors with zip-bomb protection, lazy frame decoding, and spread/fit modes. |
| **Images** | JPEG, PNG, WebP, GIF, Bitmap, SVG, TIFF, AVIF, HEIC, HEIF | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.svg`, `.tiff`, `.tif`, `.avif`, `.heic`, `.heif` | Native raster Blurring/rendering, SVG sanitization, multi-frame support, UTIF TIFF engine, and libheif HEIC/HEIF decoding. |
| **Web Documents** | HTML Document, MHTML Web Archive | `.html`, `.htm`, `.mht`, `.mhtml` | Sanitized local HTML viewer with typography, heading-based TOC, and multi-part MIME archive unpacking. |
| **Structured Data & Logs** | XML Document, JSON Document, YAML Document, Log File | `.xml`, `.json`, `.yaml`, `.yml`, `.log` | Syntax-aware structured data formatters, folding trees, search, and timestamped log navigators. |
| **Communications & Personal Data** | Email Message, vCard Contact, iCalendar Event | `.eml`, `.vcf`, `.ics` | RFC-compliant MIME message parser, vCard address book cards, and iCalendar event schedule viewers. |

### Archive Container Capabilities
- **ZIP, RAR, 7Z**: Handled as archive inspection containers (`archive:inspect`), allowing selective browsing and importing of books contained within archives. Archive containers do not count as document format families.

### Safe Extended Compatibility
- **MSG, JXL, TOML, OXPS, PPTM, POTX, POTM**: Fully supported extended compatibility format families available across both platforms.

*Note: DRM-protected files, password-encrypted containers, and executable macros are strictly rejected. Lirune Reader respects copyright and preserves device security.*

---

## Key Features

- **50+ Formats Supported**: Read e-books, documents, spreadsheets, presentations, comics, images, web archives, and structured data in one single application.
- **Reading Comfort**: Paginated or continuous vertical scroll modes, responsive font sizing, line height, margins, and custom themes (including Nord, Gruvbox, Solarized Light/Dark, Dracula, OLED Night, Sepia, and Neutral).
- **Study & Annotations**: Interactive table of contents, in-book search, bookmarks, highlights, notes, and Markdown annotation export.
- **Privacy & Zero Telemetry**: 100% offline operation. No accounts, no analytics, no external tracking, and zero remote font dependencies.
- **Security Hardened**: DOMPurify HTML sanitization, context isolation, strict CSP, path traversal (Zip-Slip) guards, and 512 MB file bounds.
- **Windows Direct File Association**: Double-click any supported document in Windows Explorer to open it directly into the Reader view.

---

## Available Platforms & Installation

### 1. Windows (Desktop & Microsoft Store)
- **Microsoft Store (Official)**: [Install from the Microsoft Store](https://apps.microsoft.com/detail/9PDNFZ146HDX?hl=en-us&gl=IN&ocid=pdpshare) (Product ID: `9PDNFZ146HDX`).
- **Direct Installer**: Download `Lirune Reader-6.0.0-Setup.exe` from [GitHub Releases](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v6.0.0).
- **Portable / Batch Launcher**: Run `Launch-Lirune.bat` to launch the local build directly.

### 2. Android (Mobile & Tablet)
- **Edition**: Lirune Reader for Android (v5.0.0), powered by React Native and Expo Router.
- **Direct APK**: Download `Lirune-Reader-v5.0.0-release.apk` directly from [GitHub Releases](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/android-v5.0.0).
- **Mobile Engine**: Features exclusive virtualized **Scroll Engine v2**, native SQLite storage, Android Storage Access Framework (SAF) folder browsing, and zero network permissions (`android.permission.INTERNET` stripped from production release builds).
- **Source Code**: Maintained in the `android` branch under the `mobile/` directory.

---

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
npm test                    # Run all discovered Windows desktop tests
npm run lint                # Static analysis and linting
npm run check:modernization # Reject newly introduced legacy API patterns
npm run validate:formats    # Validate canonical format catalogue and platform parity
npm run dist:win            # Build Windows NSIS installer
npm run dist:store          # Build Microsoft Store AppX package
npm run validate:release    # Validate release configuration and artifacts
```

To build Android:
```powershell
git checkout android
cd mobile
npm install
npm test
npm run typecheck
cd android
./gradlew :app:assembleRelease
```

---

## Privacy & Security

Books and reading data stay on your computer or phone. Managed book binaries are stored in private local storage. IndexedDB / SQLite store metadata, reading state, annotations, and preferences.

Lirune Reader does not collect telemetry, make remote API requests, or send reading data over the network. See [PRIVACY.md](docs/PRIVACY.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Troubleshooting

- **A book will not import:** Check the displayed error. Lirune Reader rejects invalid archives, missing package files, encrypted resources, and DRM-protected books.
- **Windows SmartScreen warning:** Lirune is an independent open-source project. If SmartScreen shows an unrecognized app warning on unsigned releases, click "More info" -> "Run anyway", or install directly via the [Microsoft Store](https://apps.microsoft.com/detail/9PDNFZ146HDX?hl=en-us&gl=IN&ocid=pdpshare).
- **Android installation:** Enable "Install unknown apps" in Android settings for your browser or file manager to install the standalone APK.

---

## License

Copyright © 2026 Vasanth Gajavelly.

Lirune Reader is licensed under the GNU General Public License v3.0 only (GPL-3.0-only).

See [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md) for licensing and copyright information. Third-party components retain their respective licences and copyright notices.
