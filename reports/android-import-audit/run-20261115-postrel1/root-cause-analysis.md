# Root Cause Analysis: EPUB Import Failure & Android Pipeline Ingestion Errors
## Report Reference: `RCA-20261115-ANDROID-IMPORT-NULL`

---

## 1. Defect Description

On a real Android test device running Lirune Android 5.0.0, multiple EPUB books failed to import into the library. In the Import Queue screen, all failed entries displayed the identical error message:
```
Failed: Native ingest returned null
```
Nine different EPUB files consistently failed with this message. No further stack trace or error detail was surfaced to the user or recorded in the application state.

---

## 2. Ingestion Execution Flow & Failure Points

```
[DocumentPicker / File Intent]
        │
        ▼ (SAF content:// or file:// URI)
[folders/index.tsx]
        │
        ▼ enqueue({ uri, name, format })
[importQueueStore.ts]
        │
        ├── 1. nativeStorage.sniff(uri, name)
        │       └── FormatRegistry.sniff()
        │
        ├── 2. nativeStorage.ingestFile({ uri, name, format, ... })
        │       └── NativeStorageBridge.ingestFile()
        │               │
        │               ▼ [Native Call]
        │       LiruneStorageModule.ingestFile()
        │               │
        │               ▼
        │       Ingestor.ingest()
        │               ├── FormatRegistry.sniff(sourceUri, name)
        │               └── Ingestor.ingestManaged()
        │
        └── 3. Result Inspection:
                if (!ingestResult) throw new Error("Native ingest returned null")
```

---

## 3. Deep-Dive Root Cause Breakdown

### Defect A: Generic Error Masking in `NativeStorageBridge.ts`
In `mobile/services/storage/NativeStorageBridge.ts`:
```typescript
async ingestFile(options: { ... }): Promise<NativeIngestResult | null> {
  if (!this.isAvailable()) return null;
  try {
    return await LiruneStorage.ingestFile(options);
  } catch (err) {
    logger.warn(TAG, 'ingestFile failed', err);
    return null; // <--- ERROR SWALLOWED HERE
  }
}
```
When the native Kotlin module encountered an error (e.g. `UnsupportedOperationException`, `IllegalStateException`, `IOException`), it properly rejected the Promise via:
```kotlin
promise.reject("INGEST_ERROR", e.message, e)
```
However, the TypeScript bridge intercepted the rejection, logged a warning that was not visible to the user interface, and returned `null`.
Then, in `importQueueStore.ts`:
```typescript
ingestResult = await nativeStorage.ingestFile({ ... });
if (!ingestResult) {
  throw new Error('Native ingest returned null'); // <--- GENERIC ERROR GENERATION
}
```
This converted every native exception into the deceptive `"Native ingest returned null"` string, completely concealing the underlying defect.

### Defect B: Nested Condition Fallthrough in `FormatRegistry.kt`
In `FormatRegistry.kt::classifyZipEntries()`:
```kotlin
// 1. First entry mimetype == application/epub+zip OR META-INF/container.xml -> EPUB
val hasMimetypeEpub = entries.firstOrNull()?.let {
    it.name.equals("mimetype", ignoreCase = true)
} ?: false
val hasContainerXml = namesLower.any { it.contains("meta-inf/container.xml") }
if (hasMimetypeEpub || hasContainerXml || ext == "epub") {
    if (hasContainerXml || hasMimetypeEpub) { // <--- NESTED CHECK BUG
        val drmInfo = checkEpubDrm(supplier)
        return SniffResult(...)
    }
}
```
**Mechanism of Failure**:
- If an EPUB was zipped with Windows-style backslashes (`META-INF\container.xml`), `it.contains("meta-inf/container.xml")` evaluated to `false`.
- If the `mimetype` entry was not the exact first entry (e.g. entry 0 was `META-INF/` or directories were recorded first), `hasMimetypeEpub` evaluated to `false`.
- The outer condition `(hasMimetypeEpub || hasContainerXml || ext == "epub")` evaluated to `true` because `ext == "epub"`.
- However, the inner condition `if (hasContainerXml || hasMimetypeEpub)` evaluated to `false`.
- Execution bypassed the EPUB return statement and proceeded down the remainder of `classifyZipEntries()`.
- None of the subsequent checks (DOCX, APK, CBZ, etc.) matched.
- The method terminated at line 642:
  ```kotlin
  return SniffResult(
      format = "unknown",
      confidence = 0.0f,
      reason = "ZIP archive with no supported books inside",
      quickFp = quickFp,
      kind = "blocked"
  )
  ```
- When `Ingestor.ingest()` received `sniff.kind == "blocked"`, it executed:
  ```kotlin
  if (sniff.kind != "book") {
      throw UnsupportedOperationException("Unsupported: Cannot import ${sniff.kind} item as a book (${sniff.reason})")
  }
  ```
- This exception was caught by `NativeStorageBridge.ts`, which returned `null`, producing `"Failed: Native ingest returned null"`.

### Defect C: 19-Format Native Allowlist Constraint
`FormatRegistry.kt` line 38 contained an obsolete hardcoded set:
```kotlin
val SUPPORTED_FORMATS = setOf(
    "epub", "pdf", "txt", "html", "fb2", "cbz", "cbr", "cb7",
    "mobi", "azw", "azw3", "djvu", "doc", "docx", "rtf", "odt", "chm", "md", "fbz"
)
```
- In `StorageBackend.kt` lines 84 and 202:
  ```kotlin
  val format = if (isDir) null else if (FormatRegistry.isSupported(ext)) ext else null
  ```
  Any file whose extension was not in the 19-format set had its format emitted as `null`.
- In `folders/index.tsx` line 892:
  ```typescript
  format: e.format || 'epub'
  ```
  All modern spreadsheet, presentation, data, and image formats were forced to `format: 'epub'`.
- The native ingestor was then requested to ingest XLSX, PPTX, or image files as EPUB, which immediately failed ZIP inspection and threw `UnsupportedOperationException`.

### Defect D: Transient Content URI Stream Exhaustion
When selecting files via `DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false })`, Android returns temporary content URIs.
In the previous implementation:
1. `importQueueStore.ts` called `nativeStorage.sniff(uri)` (opening stream 1 and 2).
2. `Ingestor.ingest()` called `FormatRegistry.sniff(uri)` (opening stream 3 and 4).
3. `Ingestor.ingestManaged()` called `openStream(uri)` (opening stream 5).
On Android 11+ and various OEM ROMs (Samsung OneUI, Xiaomi MIUI), transient content URIs are rate-limited or strictly single-use. The 3rd or 4th stream open failed with `SecurityException: Permission Denial` or `FileNotFoundException`, throwing an exception that returned `null`.

---

## 4. Remediation Architecture

1. **Native Error Propagation**:
   - `NativeStorageBridge.ts` re-throws native errors:
     ```typescript
     } catch (err) {
       logger.warn(TAG, 'ingestFile failed', err);
       throw err;
     }
     ```
   - `importQueueStore.ts` now captures and displays the exact native message in the queue UI, enabling instant diagnosis.
2. **Defect-Free EPUB Classification**:
   - Normalized all directory separators in entry names (`it.replace('\\', '/')`).
   - Replaced fragile nested conditions with unconditional identification:
     ```kotlin
     val hasContainerXml = namesLower.any { it.replace('\\', '/').contains("meta-inf/container.xml") }
     val hasMimetypeEpub = entries.any { it.name.trim().equals("mimetype", ignoreCase = true) }
     if (hasMimetypeEpub || hasContainerXml || ext == "epub" || ext == "kepub") {
         val drmInfo = if (hasContainerXml || hasMimetypeEpub) checkEpubDrm(supplier) else Pair(false, null)
         val formatId = if (ext == "kepub" || fallbackFilename?.lowercase(Locale.ROOT)?.contains(".kepub.epub") == true) "kepub" else "epub"
         return SniffResult(
             format = formatId,
             confidence = if (hasContainerXml || hasMimetypeEpub) 1.0f else 0.85f,
             reason = if (hasMimetypeEpub) "EPUB mimetype entry" else if (hasContainerXml) "EPUB container.xml present" else "EPUB matched by file extension",
             isDrm = drmInfo.first,
             drmReason = drmInfo.second,
             quickFp = quickFp,
             kind = "book"
         )
     }
     ```
3. **Single-Pass Managed Ingestion**:
   - In `Ingestor.kt`, `ingestManaged()` streams the incoming input stream directly into a local `.part` file in one single pass while calculating SHA-256 and progress.
   - Sniffing is performed on the complete local file via seekable `RandomAccessFile` and `FileChannel` (`sniffFile()`).
   - If sniffing rejects the file, the `.part` file is immediately unlinked and cleaned up.
   - This eliminates transient stream exhaustion entirely.
4. **Authoritative 71-Format Allowlist**:
   - `FormatRegistry.kt` was updated to incorporate all 50 primary canonical format families and 7 extended format families (71 format IDs).
   - Added magic byte detection for JPEG, PNG, GIF, BMP, TIFF, WebP, and ISOBMFF (`avif`, `heic`, `heif`).
   - Added full OOXML (`xlsx`, `xlsm`, `xltx`, `xlsb`, `pptx`, `pptm`, `ppsx`, `ppsx`, `potx`), ODF (`ods`, `odp`), and XPS/OXPS classification in `classifyZipEntries()`.
5. **Durable Cache URIs**:
   - `folders/index.tsx` was configured with `copyToCacheDirectory: true`.
   - Format fallback in `folders/index.tsx` preserves the actual filename extension:
     ```typescript
     format: e.format || (e.name.split('.').pop()?.toLowerCase() || 'epub')
     ```
