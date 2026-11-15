# Storage Access Framework (SAF), Content URI Lifecycle & Cache Persistence Audit
## Run ID: `run-20261115-postrel1`

---

## 1. Executive Summary

This audit examines the Android Storage Access Framework (SAF) integration, Content Resolver URI handling, permission lifecycles, and cache file isolation within Lirune Android 5.0.0.

---

## 2. SAF Architecture & URI Types

Lirune handles files across four distinct Android storage modalities:
1. **Managed Internal Storage**: Private directory at `context.filesDir/books/` (`/data/user/0/com.lirune.reader/files/books/`), accessible only to the application.
2. **DocumentPicker Transient URIs**: `content://com.android.providers.media.documents/...` or `content://com.android.externalstorage.documents/...` returned when a user selects a file via `expo-document-picker`.
3. **SAF Directory Trees**: Persistent tree URIs obtained via `OPEN_DOCUMENT_TREE` when a user links a local folder.
4. **Direct File Path**: `file:///sdcard/...` or `/storage/emulated/0/...` accessible when `MANAGE_EXTERNAL_STORAGE` is granted on Android 11+ (API 30+).

---

## 3. Transient URI Risks & Root Cause Analysis

### The Problem with `copyToCacheDirectory: false`
When `DocumentPicker.getDocumentAsync` was called with `copyToCacheDirectory: false`, the system file picker returned a `content://` URI with temporary URI permissions bound to the picker activity's task:
- The permission flags (`FLAG_GRANT_READ_URI_PERMISSION`) are ephemeral.
- If the app is sent to the background or if garbage collection collects the parent intent, permissions can expire.
- On several Android versions (particularly Android 13+ and Samsung/Xiaomi devices), `ContentResolver.openInputStream(uri)` can only be invoked a limited number of times before the system revokes transient read access.
- Because the previous ingestion pipeline attempted multi-pass sniffing and streaming (up to 4–6 opens on the same URI), transient URIs frequently threw `SecurityException: Permission Denial` or returned a null/closed input stream.

### Remediation: Durable Cache Copying
1. **DocumentPicker Configuration**:
   ```typescript
   const result = await DocumentPicker.getDocumentAsync({
     type: [...SUPPORTED_DOCUMENT_MIMES, '*/*'],
     multiple: true,
     copyToCacheDirectory: true, // <--- PERSISTS TO DURABLE APP CACHE
   });
   ```
   By setting `copyToCacheDirectory: true`, Expo automatically copies the picked document into the application's private cache directory (`context.cacheDir/DocumentPicker/`) and returns a durable `file://` or cache content URI.
2. **Single-Pass Stream Consumption**:
   In `Ingestor.kt`, the stream is consumed in a single linear pass into `context.filesDir/books/$bookId.part`. No secondary `openInputStream()` is ever performed on the source URI.
3. **Automated Part-File Cleanup**:
   If the app crashes or the process is killed mid-transfer:
   ```kotlin
   init {
       if (!booksDir.exists()) {
           booksDir.mkdirs()
       } else {
           booksDir.listFiles { _, name -> name.endsWith(".part") }?.forEach { stale ->
               try { stale.delete() } catch (_: Exception) {}
           }
       }
   }
   ```
   All stale `.part` files are automatically purged on startup.

---

## 4. SAF Tree Permissions & Persistence

For linked folders (`OPEN_DOCUMENT_TREE`):
1. **Permission Persistence**:
   ```kotlin
   context.contentResolver.takePersistableUriPermission(
       treeUri,
       Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
   )
   ```
2. **Tree Traversal Integrity**:
   `Scanner.kt` utilizes `DocumentsContract.buildChildDocumentsUriUsingTree()` and traverses up to `maxDepth = 10`, maintaining a `visitedDocIds` set to prevent cyclic symlinks or infinite loops.
3. **MIME & Extension Routing**:
   `StorageBackend.kt` checks all 71 supported format extensions (`FormatRegistry.isSupported(ext)`), preventing valid formats from having their format set to null.

---

## 5. Security & Privacy Guarantees

- **No Remote Telemetry**: Zero external network requests during file picking, extraction, sniffing, or ingestion.
- **Strict Sandboxing**: Imported documents are isolated in private app storage with `0700` directory permissions.
- **Path Traversal Protection**: All file operations reject `..` traversal segments and verify canonical paths before writing.
