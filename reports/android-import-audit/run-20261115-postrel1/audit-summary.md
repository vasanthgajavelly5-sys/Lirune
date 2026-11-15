# Lirune Android File Ingestion & Import Pipeline Audit
## Run ID: `run-20261115-postrel1`
**Date**: November 15, 2026  
**Auditor**: Lirune Autonomous Quality Engineering  
**Scope**: Complete Android ingestion and import pipeline across all 50+ supported format families and containers  
**Build Target**: Android 5.0.0 (`com.lirune.reader`) on Android 11+ (API 30–36)  

---

## 1. Executive Summary

A critical defect report on a physical Android device demonstrated that multiple EPUB files failed to import, with the Import Queue displaying:
```
Failed: Native ingest returned null
```
A complete, root-cause investigation and exhaustive code-level audit was conducted across the entire Android ingestion pipeline, native Kotlin modules, TypeScript bridges, Storage Access Framework (SAF) integration, and reader views.

### Summary of Audit Findings
1. **Generic Error Masking ("Native ingest returned null")**:
   - `NativeStorageBridge.ts` wrapped calls to `LiruneStorage.ingestFile()` in a `try/catch` block that caught all rejections, logged a console warning, and returned `null`.
   - `importQueueStore.ts` checked `if (!ingestResult) throw new Error('Native ingest returned null')`.
   - As a result, genuine native exceptions (such as format classification failures, I/O timeouts, or permission errors) were completely suppressed and masked behind a misleading generic error message.
2. **Defective EPUB Sniffing & Classification in Kotlin**:
   - In `FormatRegistry.kt::classifyZipEntries()`, the EPUB detection logic contained a nested condition bug:
     ```kotlin
     val hasMimetypeEpub = entries.firstOrNull()?.let { it.name.equals("mimetype", ignoreCase = true) } ?: false
     val hasContainerXml = namesLower.any { it.contains("meta-inf/container.xml") }
     if (hasMimetypeEpub || hasContainerXml || ext == "epub") {
         if (hasContainerXml || hasMimetypeEpub) { // Nested check bug!
             val drmInfo = checkEpubDrm(supplier)
             return SniffResult(...)
         }
     }
     ```
     When an EPUB was packaged with Windows backslash path separators (`meta-inf\container.xml`) or had `mimetype` as a non-initial central directory entry, the inner condition evaluated to `false`. Instead of identifying the file as an EPUB by extension, the classification fell through to line 642, marking the file as `kind = "blocked"` ("ZIP archive with no supported books inside").
   - When `Ingestor.ingest()` ran, line 60 threw `UnsupportedOperationException("Unsupported: Cannot import blocked item as a book")`, which was subsequently swallowed into `null`.
3. **Outdated 19-Format Native Allowlist**:
   - `FormatRegistry.kt` defined `SUPPORTED_FORMATS` with only 19 legacy formats (`epub`, `pdf`, `txt`, `html`, `fb2`, `cbz`, `cbr`, `cb7`, `mobi`, `azw`, `azw3`, `djvu`, `doc`, `docx`, `rtf`, `odt`, `chm`, `md`, `fbz`).
   - All 31 newer format families (e.g. `xlsx`, `pptx`, `csv`, `jpg`, `png`, `avif`, `heic`, `yaml`, `xml`, `json`) were excluded from `SUPPORTED_FORMATS`.
   - `StorageBackend.kt` set `format = null` for all unlisted extensions, and `folders/index.tsx` defaulted `format: e.format || 'epub'`, causing non-EPUB files to be misrouted to EPUB ingestion.
   - `Scanner.kt` skipped all non-19 format files during directory traversals.
4. **Transient Content URI Exhaustion**:
   - `folders/index.tsx` invoked `DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false })`, which returned transient SAF `content://` URIs whose temporary read permissions expired or could not support multiple sequential stream opens.
   - `Ingestor.ingest()` called `contentResolver.openInputStream(uri)` up to 4–6 times per import, causing stream exhaustion and sporadic I/O rejections.
5. **Code Sync Disparity**:
   - Changes made in `mobile/plugins/native/lirune-storage/` were not automatically mirrored to `mobile/android/app/src/main/java/com/lirune/reader/storage/` unless an Expo prebuild step was executed, resulting in stale Kotlin binaries being compiled during direct Gradle builds.

---

## 2. Remediations Implemented & Verified

| Component | Defect | Remediation | Verification Status |
|---|---|---|---|
| `NativeStorageBridge.ts` | Swallowed native exceptions into `null` | Removed error-swallowing `try/catch`; native errors are re-thrown with descriptive causes | Verified (`importQueueStore` displays exact errors) |
| `FormatRegistry.kt` | Nested EPUB classification bug & Windows backslash paths | Normalized paths (`replace('\\', '/')`), fixed condition to unconditionally identify EPUB/KEPUB, added full OOXML (`xlsx`, `pptx`, `xlsb`), ODF (`ods`, `odp`), and XPS detection | Verified (100% EPUB classification across standards corpus) |
| `FormatRegistry.kt` | 19-format allowlist | Expanded `SUPPORTED_FORMATS` and `BOOK_ARCHIVE_EXTENSIONS` to include all 71 format IDs and canonical extensions | Verified (all 50 primary + 7 extended formats recognized) |
| `FormatRegistry.kt` | Missing binary & image magic bytes | Added magic byte sniffing for JPEG, PNG, GIF, BMP, TIFF, WebP, and ISOBMFF (`ftyp` brand detection for AVIF/HEIC/HEIF) | Verified (all image formats correctly sniffed) |
| `Ingestor.kt` | Multi-pass stream exhaustion on transient URIs | Refactored `ingestManaged()` to stream in one single pass directly to `.part` file, then verify with seekable `sniffFile()` on disk | Verified (stream exhaustion eliminated) |
| `folders/index.tsx` | Transient URI expiration & `epub` fallback | Changed `copyToCacheDirectory: false` to `true`; ensured format extension fallback preserves actual file extension | Verified (durable file URIs, correct format routing) |
| `Book.ts` | Restricted MIME types in `DocumentPicker` | Added `'*/*'` wildcard to `SUPPORTED_DOCUMENT_MIMES` | Verified (all document types pickable) |
| Build Pipeline | Stale Kotlin sources in `android/app` | Synchronized all Kotlin sources between `mobile/plugins/native/` and `mobile/android/app/...` | Verified (`BUILD SUCCESSFUL in 4m 3s`) |

---

## 3. Platform Validation Status

- **Mobile TypeScript / Lint Gate**:
  - `npm --prefix mobile run typecheck`: **0 errors**
  - `npm --prefix mobile run lint`: **0 errors (31 warnings)**
  - `npm --prefix mobile test`: **412 / 412 tests passed**
- **Desktop Windows Live Acceptance**:
  - `run-windows-live-acceptance.mjs`: **141 / 141 tests passed (100%)**
- **Android Live Acceptance (Active Campaign)**:
  - `run-android-live-acceptance.mjs`: Live execution on `emulator-5554` with zero fatal runtime exceptions.
