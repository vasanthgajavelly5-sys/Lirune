# Lirune Reader v4.8.0 (Android) — Maintenance, Stability & Production Upgrade

## Highlights & Fixes in v4.8.0

### 1. Reader State Lifecycle & Asynchronous Race Elimination (Issue 12)
- Implemented an `activeOpenSession` generation guard in `readerStore.ts` ensuring that rapid book switches immediately cancel or discard superseded background database queries.
- Stale asynchronous state from previously selected books can no longer overwrite active book state, bookmarks, highlights, notes, or reading progress.
- Added automated regression tests verifying isolation under fast book-switching and reopening cycles.

### 2. Format Honesty & Archive Dispatch Hardening (Issues 13 & 14)
- **ZIP & RAR Archive Honesty:** Removed direct file association and intent filters for raw `.zip` and `.rar` files. Container archives are explicitly marked as `supported: false` in discovery metadata (`(Container Archive)`) since they are imported/unpacked into books rather than opened directly as single-document titles.
- **RAR5 & CBR Clarification:** `RarExtractor` now strictly rejects RAR5 archives with a clean, descriptive error (`Unsupported archive format: RAR5 format is not supported`) instead of generating fake empty entries.
- CBR reader now provides clear user messaging advising users to use CBZ or uncompressed CBR if a compressed RAR archive is opened.
- Safe buffer bounds checking prevents infinite loops or CPU hangs on corrupted archive headers.

### 3. Memory Safety & Large-File Stream Processing (Issue 15)
- Eliminated dangerous `entire file -> Base64 string -> atob -> memory` conversions in `CbrReaderView` and `MetadataExtractor`.
- Replaced with direct array buffer reads via `fileStorage.readAsArrayBuffer` / `ExpoFile.bytes()`.
- Added a 150MB memory safeguard in `CbrReaderView` and chunked base64 output streaming (`CHUNK_SIZE = 32KB`) to eliminate memory pressure and Out-Of-Memory crashes.

### 4. Release Signing Fail-Closed Architecture (Issue 16)
- Hardened `withReleaseSigning.js` Gradle plugin: release builds now throw an explicit `GradleException` if production keystore credentials are missing, preventing silent fallbacks to debug signing configurations during production releases.
- Validated real production signature via `apksigner verify`: verified with v2 signature scheme using RSA 4096-bit production key (`CN=Lirune Reader Release, OU=Android`).

### 5. Settings Validation & Corrupted State Fallbacks (Issue 24)
- Added strict validators for `validateReaderSettings`, `validateAccessibilitySettings`, and `validateAppTheme`.
- Persistence layer now validates and clamps all settings (margins, gaps, brightness, scaling, contrast) safely to defaults on corrupted or unexpected stored states.

### 6. Diagnostics & Clean Production Environment (Issue 22)
- Removed global `LogBox.ignoreAllLogs()` diagnostic suppression from root layout.
- Clean production runtime logs verified on physical/emulator target with zero unhandled exceptions.

### 7. End-to-End Runtime QA & Verification
- Full test suite passed: **298 / 298 automated unit and regression tests passed**.
- TypeScript typecheck passed with zero errors (`tsc --noEmit`).
- ESLint passed with zero errors.
- Real Android release APK (`com.lirune.reader`, versionCode 7, versionName 4.8.0) verified via `aapt dump badging`, `apksigner`, `adb install -r`, and interactive UI smoke tests (Library, Reader, Settings Sheet, Font switching, Book switching).

---
**Artifact:** `Lirune-Reader-v4.8.0-release.apk`
**Package:** `com.lirune.reader`
**Version:** `4.8.0` (Code `7`)
**Target SDK:** 36 (Android 16) / Min SDK: 24 (Android 7.0)
**Signature:** v2 (Full Production Signed, RSA 4096-bit)
