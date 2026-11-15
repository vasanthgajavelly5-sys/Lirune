# Lirune Reader v5.0.0 — Major Mobile Release: In-Reader Theme Parity, 50+ Format Engine & Offline Privacy

Lirune v5.0.0 is the milestone major release for Android, delivering comprehensive in-reader theme parity, full Hermes bytecode optimization, robust multi-format engine across 50 canonical primary format families, and zero network permissions.

### Highlights
- **In-Reader Theme Parity**: Settings sheet, Table of Contents sheet, Annotations sheet, Search sheet, and Dictionary modals dynamically inherit colors, surfaces, borders, and typography from the active reader palette across all 15 reading themes.
- **Modern Dark Theme Support**: Added proper dark-surface token mapping for Nord, Gruvbox, Solarized, Rosé Pine, Dracula, and Mocha; corrected classification for Soft Forest.
- **Hermes Bytecode Engine**: Pre-compiled 1,583 JavaScript modules for instant reader launch and fluid 60fps scrolling.
- **Zero Internet Permissions**: `android.permission.INTERNET` permanently stripped from release builds. Zero tracking, zero telemetry, zero analytics.
- **50+ Formats Supported**: Validated cross-platform engine with 100% live acceptance across all 50 primary canonical format families (EPUB, PDF, MOBI, KEPUB, FB2, FBZ, DJVU, CHM, DOCX, DOC, ODT, RTF, TXT, MD, XPS, CSV, TSV, XLSX, XLS, ODS, XLSM, XLTX, XLSB, PPTX, PPT, ODP, PPSX, CBZ, CBR, CBT, CB7, JPG, PNG, WEBP, GIF, BMP, SVG, TIFF, AVIF, HEIC, HEIF, HTML, MHTML, XML, JSON, YAML, LOG, EML, VCF, ICS) and archive inspection containers (ZIP, RAR, 7Z).
- **100% Android Live Acceptance Pass Rate**: 141 out of 141 real-world document samples (low, medium, and high complexity) verified on Android emulator runtime.
- **412 Automated Test Cases Passed**: Complete test coverage across navigation, layout, security, and storage layers.

### Checksums & Artifacts
| Artifact | Filename | SHA-256 Checksum |
| :--- | :--- | :--- |
| **Android Release APK** | `Lirune-Reader-v5.0.0-release.apk` | `4ceaa7d6b999ab23dbe909feaf987cc7d69ca43edfcae5817289ac1b83f27fd1` |

### Verification Instructions
- **PowerShell**: `Get-FileHash -Algorithm SHA256 Lirune-Reader-v5.0.0-release.apk`
- **Linux / macOS**: `sha256sum Lirune-Reader-v5.0.0-release.apk`
