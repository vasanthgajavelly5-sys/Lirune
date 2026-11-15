# Lirune Reader v4.9.4 (Beta) — Multi-Format Mobile Engine & Hermes Bytecode Optimization

Lirune Reader v4.9.4 (Beta) brings full cross-platform format parity to Android mobile devices, backed by a pre-compiled Hermes bytecode bundle and hardened sandboxing.

### 🌟 Key Highlights & Enhancements

- **Universal Mobile Reading Engine:**
  - Full ingestion, parsing, and rendering for all primary formats: EPUB, MOBI, AZW, AZW3, DOC, DOCX, ODT, RTF, TXT, MD, FB2, FBZ, PDF, and DJVU.
  - Native comic archive extraction for CBZ, CBR, CBT, and CB7 with safe entry budget validation.
  - Scanned book support for multi-frame TIFF and image books (PNG, JPG).
  - 100% acceptance testing pass rate across 57 real-world test samples on Android (emulator-5554 / Android 11+).

- **Performance & Virtualization:**
  - **Pre-Compiled Hermes Bytecode:** Bundled ahead of time into optimized bytecode (`13MB`), achieving lightning-fast cold app launches and instant reader mounting.
  - **Scroll Engine v2 Virtualization:** 60fps continuous vertical scrolling with dynamic window hydration and memory recycling.

- **Security & Privacy Guarantees:**
  - **Zero Network Permissions:** `android.permission.INTERNET` is strictly removed from production release manifests.
  - **Offline Storage Access Framework (SAF):** Local document picking and sandboxed SQLite database.
  - **Archive Decompression Bounds:** Zip-bomb ratio detection and max entry count enforcement.

### 📦 Release Verification & Checksums

| Package | Filename | SHA-256 Checksum |
|---|---|---|
| **Android Release APK** | `Lirune-Reader-v4.9.4-release.apk` | `46472b2f894f5e3fccfcf20cbeda15ec32c6508a2016717a12eb74089e966e05` |

*To verify your download on Android/Linux:*
```bash
sha256sum Lirune-Reader-v4.9.4-release.apk
```
*On Windows (PowerShell):*
```powershell
Get-FileHash -Algorithm SHA256 .\Lirune-Reader-v4.9.4-release.apk
```
