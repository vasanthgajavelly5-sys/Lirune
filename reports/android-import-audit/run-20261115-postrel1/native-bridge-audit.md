# Android Native Bridge, JNI & Kotlin Module Security/Lifecycle Audit
## Run ID: `run-20261115-postrel1`

---

## 1. Executive Summary

This audit assesses the communication bridge between the JavaScript/React Native runtime and the Android Kotlin native modules (`LiruneStorageModule`, `LiruneScreenModule`), evaluating thread safety, serialization integrity, exception propagation, memory usage, and file descriptor lifecycles.

---

## 2. Bridge Interfaces & Serialization Audit

### A. Bridge Methods & React Methods

| Bridge Method | Native `@ReactMethod` | Thread Dispatcher | Error Rejection Code | Status |
|---|---|---|---|---|
| `sniff(uriOrPath, fallbackName)` | `sniffFile` | `Dispatchers.IO` | `SNIFF_ERROR` | Audited & Validated |
| `ingestFile(options)` | `ingestFile` | `Dispatchers.IO` (Semaphore 2) | `INGEST_ERROR` | Audited & Validated |
| `openBookSession(pathOrUri)` | `openBookSession` | `Dispatchers.IO` | `SESSION_ERROR` | Audited & Validated |
| `readBookSession(handleId, offset, length)` | `readBookSession` | `Dispatchers.IO` | `READ_ERROR` | Audited & Validated |
| `closeBookSession(handleId)` | `closeBookSession` | `Dispatchers.IO` | `CLOSE_ERROR` | Audited & Validated |
| `openArchive(uriOrPath, password)` | `openArchive` | `Dispatchers.IO` | `ARCHIVE_ERROR` | Audited & Validated |
| `listArchiveEntries(handleId, path)` | `listArchiveEntries` | `Dispatchers.IO` | `LIST_ERROR` | Audited & Validated |
| `extractEntryToImport(...)` | `extractEntryToImport` | `Dispatchers.IO` | `EXTRACT_ERROR` | Audited & Validated |
| `closeArchive(handleId)` | `closeArchive` | `Dispatchers.IO` | `CLOSE_ERROR` | Audited & Validated |

### B. Serialization & Argument Validation
- **Options Dict**: Verified in `LiruneStorageModule.kt`. Options map keys (`uri`, `name`, `format`, `mode`, `jobId`, `existingSha256List`) are checked with `hasKey()` and safe getters (`getString`, `getDouble`, `getArray`). Nullable strings fall back to safe defaults (`mode ?: "managed"`, `name ?: "book"`).
- **Return Maps**: Native results (`IngestResult`, `SniffResult`, `ArchiveEntryMeta`) are mapped to `WritableMap` / `Arguments.createMap()` with strong primitives:
  - `bookId`: string (UUID)
  - `sha256`: string (hex lowercase 64-char)
  - `size`: double (Long converted to double for JS safe integer range)
  - `isDuplicate`: boolean
  - `format`: string

---

## 3. Concurrency, Thread Safety & Resource Lifecycle

1. **Coroutine Scope & Dispatchers**:
   - All I/O operations are launched on `Dispatchers.IO` within `moduleScope` (`CoroutineScope(SupervisorJob() + Dispatchers.Default)`).
   - `Ingestor` employs a `Semaphore(2)` to limit concurrent ingestion tasks, preventing disk saturation, OOM, and CPU starvation during bulk imports.
2. **File Descriptor Leaks**:
   - `ParcelFileDescriptor` instances obtained via `contentResolver.openFileDescriptor(uri, "r")` are wrapped in `try/finally` blocks and explicitly closed.
   - `FileChannel` and `RandomAccessFile` in seekable operations are cleanly closed in `finally` blocks.
3. **Atomic File Ingestion**:
   - Incomplete files are written with `.part` extension (`$bookId.part`).
   - `DigestOutputStream` wraps `FileOutputStream` with `MessageDigest.getInstance("SHA-256")`.
   - `fos.fd.sync()` is called prior to file rename, ensuring hardware-level durability.
   - File is renamed atomically via `partFile.renameTo(finalFile)` only after verification and deduplication checks pass.
   - Any thrown exception during copy or validation unlinks the `.part` file immediately.

---

## 4. Bridge Exception Propagation Fix

**Previous Flaw**:
`NativeStorageBridge.ts` caught all rejections from `LiruneStorage.ingestFile()` and returned `null`.
```typescript
// BEFORE (Defective)
try {
  return await LiruneStorage.ingestFile(options);
} catch (err) {
  logger.warn(TAG, 'ingestFile failed', err);
  return null;
}
```

**Remediated Implementation**:
Exceptions are re-thrown so that the caller (`importQueueStore`) catches the real error message and displays it in the UI and error reports:
```typescript
// AFTER (Remediated)
try {
  return await LiruneStorage.ingestFile(options);
} catch (err) {
  logger.warn(TAG, 'ingestFile failed', err);
  throw err;
}
```

---

## 5. Security & Isolation Safeguards

- **Zip Slip Traversal**:
  - `ArchiveBrowser.kt` and `Ingestor.kt` validate that entry destination paths remain strictly within `booksDir`:
    ```kotlin
    val destFile = File(booksDir, targetName)
    if (!destFile.canonicalPath.startsWith(booksDir.canonicalPath)) {
        throw SecurityException("Zip Slip directory traversal blocked: $targetName")
    }
    ```
- **Zip Bomb Defense**:
  - Uncompressed entry size is validated against uncompressed size budgets (max 500 MB per book, max compression ratio 100:1).
- **Executable Package Blocking**:
  - Android package files (`apk`, `aab`, `dex`, `jar`, `xpi`, `class`, `so`, `dll`) are permanently classified as `kind = "blocked"` and immediately rejected by native ingestors.
