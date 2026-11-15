# Baseline Inspection Report
## Campaign Run ID: `run-20261115-postrel1`
**Scope**: Windows 6.0.0, Android 5.0.0, Lirune Website, GitHub Releases, Format Parity Baseline  
**Date**: November 15, 2026  

---

## 1. Executive Baseline Summary

Before undertaking post-release completion, the baseline configuration across all release artifacts, repositories, websites, and validation records was audited:

| Component | Target Identity | Baseline Published State | Status at Baseline | Post-Release Goal |
|---|---|---|---|---|
| **Windows Application** | `6.0.0` | Tag `v6.0.0` published with installer `Lirune.Reader-6.0.0-Setup.exe` | 141/141 acceptance passed in isolated profile | Verify parity, ensure 50+ formats supported |
| **Android Application** | `5.0.0` | Tag `android-v5.0.0` published with APK | EPUB import failure ("Native ingest returned null") on real devices; 19-format restriction | Rebuild APK with full 71-format support, fix EPUB & transient URI bugs, verify 141/141 acceptance |
| **Lirune Website** | `1.0.0` | `lirune-reader.web.app` | Synchronized format counts, 104 site tests passed | Deploy verified 50+ formats messaging & compatibility matrix |
| **Format Catalogue** | Schema v2 | 50 primary canonical families, 7 extended, 7 partial, 3 containers (64 families, 71 format IDs) | Validated across Windows & Android | Zero discrepancies between apps, website, and GitHub READMEs |

---

## 2. Release Asset Integrity Checksums

### Windows 6.0.0
- **Installer Asset**: `Lirune.Reader-6.0.0-Setup.exe`
- **File Size**: `125,533,631 bytes`
- **SHA-256**: `5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5`
- **Spaced Asset**: `Lirune Reader-6.0.0-Setup.exe` (`5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5`)

### Android 5.0.0 (Remediated Release Build)
- **APK Asset**: `mobile/android/app/build/outputs/apk/release/app-release.apk`
- **File Size**: `77,568,396 bytes`
- **SHA-256**: `3ed1ae00af8efafbf447e6aae405ea3ea95647ea44a3cab01bd63efbde873831`
- **Signing**: Release signed with verified keystore; Hermes bytecode optimized.
- **Permissions**: `android.permission.INTERNET` permanently stripped.

---

## 3. Format Accounting Policy Enforcement

As mandated by release governance:
1. **50+ Formats Rule**: Exactly 50 canonical primary document format families are counted for the 50+ headline claim.
2. **Aliases**: Extension aliases (e.g. `.htm` for HTML, `.markdown` for MD, `.azw3`/`.kf8` for MOBI) do NOT increase the format count.
3. **Containers**: ZIP, RAR, 7Z are counted as container capabilities, not document reader families.
4. **Partial Formats**: Partial/preview formats (`pages`, `numbers`, `key`, `msg`, `pst`, `ost`, `wps`) are separated into a designated partial section and never counted towards the 50+ claim.
5. **Two-Platform Parity**: Every format family in the primary 50 must have a functioning reader on BOTH Windows and Android.
