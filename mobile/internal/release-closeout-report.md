# Lirune Reader Close-Out & Release Publication Report

**Generated**: 2026-10-28  
**Repository**: `vasanthgajavelly5-sys/Lirune`  
**Platforms**: Android (Expo / React Native / Kotlin) & Windows Desktop (Electron)

---

## 1. Executive Summary

Both target branches—`android` (`feat/scroll-v2-only` via PR #4) and `lirune-store-home`—have been thoroughly audited, verified across automated test suites, clean-installed, smoke-tested, upgraded over prior baselines, merged, and published as **Pre-Releases** in compliance with all owner settings and gates.

| Metric | Android Release | Windows Desktop Release |
| :--- | :--- | :--- |
| **Release Tag** | `v4.9.3` | `v5.6.2` |
| **Release Type** | Pre-Release | Pre-Release |
| **Target Branch / Commit** | `android` (`4ed18e3150d40eb7745b7a75e9426ac4e60f2b14`) | `lirune-store-home` (`2a1a42b`) |
| **Primary Artifact** | `Lirune-Reader-v4.9.3-release.apk` | `Lirune Reader-5.6.2-Setup.exe` |
| **File Size** | 77,532,452 bytes (~73.9 MB) | 122,950,141 bytes (~117.2 MB) |
| **SHA-256 Checksum** | `d41c1d9f453ba8de2c907a0f66e4b2b09dbe577fd4fb0d332d4a98a8f2be7672` | `0421c955db7e207617cf93dd5dff3b4056aa570565b08fed1f888a2b91bf30db` |
| **Release URL** | [GitHub Release v4.9.3](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v4.9.3) | [GitHub Release v5.6.2](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v5.6.2) |

---

## 2. Owner Settings & Evaluation

- `OWNER_TESTED_ON_PHYSICAL_TABLET`: **NO**  
  *Decision*: Both releases were published with `--prerelease` (NOT marked as "latest").
- `PUBLISH_IF_ALL_GATES_PASS`: **YES**  
  *Decision*: All gates G1 through G4 passed with 100% success; pre-releases were published.
- `ALLOW_AGENT_TO_MERGE_PRS`: **YES**  
  *Decision*: PR #4 was merged cleanly via merge commit without requiring administrator bypass.

---

## 3. Verification Gates Summary

| Gate | Description | Status | Evidence / Outcome |
| :--- | :--- | :--- | :--- |
| **Gate G1** | GitHub Tasks & Security Alerts | **PASS** | 0 CodeQL alerts, 0 Gitleaks secret alerts, 0 bug issues, 100% green CI runs. |
| **Gate G2** | Android Close-Out | **PASS** | 380/380 unit tests pass; `typecheck`, `lint`, and `check:pdfjs` clean; clean signed release build; zero forbidden permissions (`INTERNET`, `SYSTEM_ALERT_WINDOW`, `WRITE_EXTERNAL_STORAGE`); emulator smoke + soak + upgrade passed. |
| **Gate G3** | Desktop Close-Out | **PASS** | 41/41 unit & hardening tests pass; `validate:release:config` clean; 0 npm audit vulnerabilities; NSIS installer built; silent install, in-place upgrade over v5.6.1, and clean uninstall verified. |
| **Gate G4** | Cross-Branch Security & Licensing | **PASS** | Full Gitleaks secret scan passed; GPL-3.0 license compatibility verified; full git diffs verified against published tags `v4.9.0` and `v5.6.1`. |

---

## 4. Android Close-Out Details (`v4.9.3`)

### 4.1 Scope & Feature Highlights
- **Scroll Engine v2 Exclusivity**: Scroll Engine v2 is now the sole continuous-reading engine. Legacy Scroll Engine v1 monolithic chapter injection, sentinel intersection observers, and host drain timers were eliminated.
- **Removed Settings Toggle**: Experimental "Scroll Engine (v1 / v2)" toggle row removed from Settings Sheet; continuous reading now seamlessly defaults to v2.
- **Backward Compatibility**: Preserved reading position parsers for `loc:v2:...`, legacy `spine:N:scroll:Y`, `spine:N:frac:F`, and simple `spine:N`. Upgraded users resume reading at their exact previous location.
- **Permission Hardening**: Manifest overlay (`tools:node="remove"`) permanently strips `android.permission.INTERNET`, `android.permission.SYSTEM_ALERT_WINDOW`, and `android.permission.WRITE_EXTERNAL_STORAGE`. All exports/backups write to app-private storage or delegate to SAF.

### 4.2 Permission Dump Verification (`aapt2 dump permissions`)
```text
package: com.lirune.reader
uses-permission: name='android.permission.READ_EXTERNAL_STORAGE' maxSdkVersion='32'
uses-permission: name='android.permission.VIBRATE'
permission: com.lirune.reader.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
uses-permission: name='com.lirune.reader.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
```
*Confirmed: Zero network access, zero overlay windows, zero raw shared storage writes.*

### 4.3 Signing Fingerprint (`apksigner verify --print-certs`)
- **Owner**: `CN=Lirune Reader Release, OU=Android`
- **SHA-256**: `ef68ec8a2182a7870debc0eceb28311a758d449219b84e7a9833379cdee516d1`
- **SHA-1**: `ef668b29ba556c4d425558c3f26e87f40c3f3bdc`
- Verified matching production release `v4.9.0`.

### 4.4 Emulator Verification Summary
- **Android 11 API 30 (`tab_lowend`, unrooted `uid=2000`)**:
  - Fresh install & cold start: Clean logcat, 0 crashes.
  - Open-With Content URI intent: Successfully copied content URI (`content://media/external/file/46`) to private storage and rendered.
  - Format smoke: EPUB, PDF, FB2, MOBI, CBZ, and TXT opened and rendered without errors.
  - Continuous scroll & rotation: Resized fonts, rotated orientation, force-stopped app, and verified position restored accurately.
  - Upgrade over published `v4.9.0`: Schema migrated cleanly, all seed books, progress markers, and annotations preserved intact.
  - Soak test: 250 swipes across 11,562 frames; 8.5% jank (zero frozen frames); PSS stable from 169.9MB to 169.7MB (0 leak).
  - Clean uninstall: Removed all app data from `/sdcard/Android/data/com.lirune.reader`.
- **Android 15 API 35 (`tab_modern`, unrooted `uid=2000`)**:
  - Fresh install & cold start: 0 crashes, clean uninstall.

---

## 5. Desktop Close-Out Details (`v5.6.2`)

### 5.1 Scope & Feature Highlights
- **Security & IPC Hardening**: FB2 cover sanitization against SVG/XSS breakout; safe unzipping limits (max uncompressed size, max entries, entry ratio) preventing zip bombs; context isolation and strict argument validation across all IPC channels.
- **Launcher Fix**: Fixed Windows batch launcher `Launch-Lirune.bat` syntax and added system architecture spec.
- **CI Hardening**: Integrated CodeQL v4, Gitleaks v3, and GitHub dependency review.

### 5.2 Build & Packaging Verification
- **Command**: `npm run dist`
- **Target**: Windows NSIS x64
- **Artifact**: `dist/Lirune Reader-5.6.2-Setup.exe` (122,950,141 bytes)
- **Authenticode Signature**: `NotSigned` (Open-source community release; SmartScreen guidance included in release notes)
- **Layer 1-3 Release Validation**: `npm run validate:release` exited 0.

### 5.3 Host Install / Upgrade / Uninstall Tests
- **Silent Install**: Executed `Lirune Reader-5.6.2-Setup.exe /S`; ExitCode: `0`.
- **In-Place Upgrade**: Installed baseline v5.6.1, executed v5.6.2 installer `/S`; ExitCode: `0`; upgraded installation verified in `%LOCALAPPDATA%\Programs\Lirune Reader`.
- **Silent Uninstall**: Executed uninstaller `/S`; ExitCode: `0`; directory removed cleanly while preserving user data in `%APPDATA%\lirune`.

---

## 6. GitHub Publication & Provenance Attestation

### 6.1 Android Pre-Release (`v4.9.3`)
- **Tag**: `v4.9.3`
- **Commit**: `4ed18e3150d40eb7745b7a75e9426ac4e60f2b14`
- **Status**: Published as Pre-Release
- **Workflow Run**: `40566764809` (Release Integrity & Checksums: SUCCESS)
- **Assets**:
  - `Lirune-Reader-v4.9.3-release.apk` (SHA-256: `d41c1d9f453ba8de2c907a0f66e4b2b09dbe577fd4fb0d332d4a98a8f2be7672`)
  - `SHA256SUMS.txt`

### 6.2 Desktop Pre-Release (`v5.6.2`)
- **Tag**: `v5.6.2`
- **Commit**: `2a1a42b109e2cf3da7d722bf3534a78129ff2d51` (HEAD of `lirune-store-home`)
- **Status**: Published as Pre-Release
- **Workflow Run**: `40567249361` (Release Integrity & Checksums: SUCCESS)
- **Assets**:
  - `Lirune Reader-5.6.2-Setup.exe` (SHA-256: `0421c955db7e207617cf93dd5dff3b4056aa570565b08fed1f888a2b91bf30db`)
  - `SHA256SUMS.txt`

### 6.3 Public Asset Verification
Both published release assets were downloaded independently from the GitHub Releases CDN via `gh release download` and re-hashed:
- `v4.9.3` downloaded APK hash matched local build bit-for-bit (`D41C1D9F453BA8DE2C907A0F66E4B2B09DBE577FD4FB0D332D4A98A8F2BE7672`).
- `v5.6.2` downloaded EXE hash matched local build bit-for-bit (`0421C955DB7E207617CF93DD5DFF3B4056AA570565B08FED1F888A2B91BF30DB`).

---

## 7. Conclusion

All tasks, validations, branch merges, and release publications for both the Android app and the Windows Desktop app are **100% COMPLETE**.
