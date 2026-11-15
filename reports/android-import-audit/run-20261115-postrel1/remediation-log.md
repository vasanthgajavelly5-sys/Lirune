# Complete Engineering Remediation Log
## Run ID: `run-20261115-postrel1`

---

## 1. Remediation Changeset Summary

| File Path | Component | Type | Nature of Fix |
|---|---|---|---|
| `mobile/services/storage/NativeStorageBridge.ts` | Bridge | TypeScript | Re-throw native errors in `ingestFile` and `extractEntryToImport` rather than swallowing into `null` |
| `mobile/plugins/native/lirune-storage/FormatRegistry.kt` | Native Storage | Kotlin | Expanded `SUPPORTED_FORMATS` & `BOOK_ARCHIVE_EXTENSIONS` to 71 format IDs; fixed nested EPUB check; normalized Windows backslash paths; added OOXML (`xlsx`, `pptx`, `xlsb`), ODF (`ods`, `odp`), XPS, and image magic bytes |
| `mobile/android/app/src/main/java/com/lirune/reader/storage/FormatRegistry.kt` | Native App | Kotlin | Synchronized with `plugins/native` implementation to guarantee Gradle release APK parity |
| `mobile/plugins/native/lirune-storage/Ingestor.kt` | Native Storage | Kotlin | Converted `ingestManaged()` to single-pass stream copy into `.part` file, followed by seekable `sniffFile()` on disk; eliminates transient stream exhaustion |
| `mobile/android/app/src/main/java/com/lirune/reader/storage/Ingestor.kt` | Native App | Kotlin | Synchronized with `plugins/native` implementation |
| `mobile/app/folders/index.tsx` | UI / Picker | TypeScript/React | Set `copyToCacheDirectory: true`; added `'*/*'` wildcard; fixed fallback format extension to prevent defaulting unknown formats to `'epub'` |
| `mobile/models/Book.ts` | Data Models | TypeScript | Added `'*/*'` to `SUPPORTED_DOCUMENT_MIMES` |
| `main.js` | Desktop Backend | JavaScript/Node | Registered IPC handler for `heif:decode` using Node `libheif-js` and `xlsb:parse` using Node `xlsb-parser` |
| `js/formats.js` | Desktop Formats | JavaScript | Added `xl/workbook.bin` to XLSB zip detection; disambiguated generic XML (`<?xml`) from FB2 (`<FictionBook`) |
| `js/adapters/imageAdapter.js` | Desktop Reader | JavaScript | Direct native Chromium AVIF decoding |

---

## 2. Verification Evidence

1. **Mobile Unit Test Suite**:
   ```
   ℹ tests 412
   ℹ suites 9
   ℹ pass 412
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 14842.0204
   ```
2. **Mobile TypeScript Validation**:
   ```
   > mobile@5.0.0 typecheck
   > tsc --noEmit
   [Exited with code 0 - zero type errors]
   ```
3. **Mobile ESLint Validation**:
   ```
   > mobile@5.0.0 lint
   > eslint . --ext .ts,.tsx
   [Exited with code 0 - zero lint errors]
   ```
4. **Desktop Unit & Modernization Gates**:
   - `npm test`: 100 unit tests passed, 9 integration tests passed.
   - `npm run check:modernization`: 0 findings.
   - `npm run lint`: clean.
5. **Windows Live Acceptance**:
   - `141 / 141 passed (100%)` across all 50 primary format families across low, medium, and high complexity tiers.
6. **Android Release Compilation**:
   - `assembleRelease`: `BUILD SUCCESSFUL in 4m 3s`.
   - Output: `mobile/android/app/build/outputs/apk/release/app-release.apk` (SHA-256 verified, signed).
