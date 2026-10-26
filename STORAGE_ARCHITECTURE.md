# Lirune Reader Mobile — Storage Architecture Technical Specification

**Version:** 1.0  
**Branch:** `android`  
**Date:** 2026-10-26

---

## Table of Contents

1. [Permission Model](#1-permission-model)
2. [Architecture Overview](#2-architecture-overview)
3. [App-Private Storage](#3-app-private-storage)
4. [SAF / User Storage](#4-saf--user-storage)
5. [Import Pipeline](#5-import-pipeline)
6. [Reading Access](#6-reading-access)
7. [AndroidManifest Permissions](#7-androidmanifest-permissions)
8. [Security Design Decisions](#8-security-design-decisions)
9. [Folders Screen Implementation Path](#9-folders-screen-implementation-path)

---

## 1. Permission Model

| API Level | Android Version | Storage Access | Required Permission |
|-----------|-----------------|----------------|---------------------|
| 29 | Android 10 | App-private only (`/data/data/...`) | None |
| 30 | Android 11 | App-private + MediaStore | `READ_EXTERNAL_STORAGE` (legacy) |
| 33 | Android 13+ | App-private + MediaStore + SAF | `READ_MEDIA_IMAGES/VIDEO/AUDIO` + SAF intents |

**This app uses SAF (Storage Access Framework) exclusively — no `MANAGE_EXTERNAL_STORAGE` (All Files Access).**

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  JavaScript Layer (React Native / Expo)                     │
│  ├── FileStorage.ts          → App-private directory        │
│  ├── NativeStorageBridge.ts  → SAF / ContentProvider        │
│  └── ImportService.ts        → DocumentPicker + copy        │
└─────────────────────────────────────────────────────────────┘
                              ↓ JSI / TurboModule
┌─────────────────────────────────────────────────────────────┐
│  Native Layer (Kotlin)                                      │
│  ├── LiruneStorageModule.kt   → SAF, MediaStore, file I/O  │
│  └── LiruneStoragePackage.kt  → TurboModule registration    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. App-Private Storage (`FileStorage.ts`)

**Location:** `${FileSystem.documentDirectory}books/` and `covers/`

```typescript
// mobile/services/storage/FileStorage.ts
const BOOKS_DIR = `${FileSystem.documentDirectory || ''}books/`;
const COVERS_DIR = `${FileSystem.documentDirectory || ''}covers/`;
```

| Operation | API | Notes |
|-----------|-----|-------|
| Write book | `FileSystem.writeAsStringAsync()` / `makeDirectoryAsync()` | Atomic via `.part` staging |
| Read book | `FileSystem.readAsArrayBuffer()` | Returns `ArrayBuffer` |
| Delete | `FileSystem.deleteAsync()` | Idempotent |
| Cleanup partials | `readDirectoryAsync()` + filter `.part` | Runs on app start |

**No permissions needed** — fully sandboxed to app.

---

## 4. SAF / User Storage (`NativeStorageBridge.ts` + Kotlin)

**Entry Point:** `DocumentPicker.getDocumentAsync()` + `Intent.ACTION_OPEN_DOCUMENT_TREE`

### Kotlin: `LiruneStorageModule.kt`

```kotlin
// Key methods exposed to JS via TurboModule
@ReactMethod fun pickFolder(promise: Promise)                    // SAF folder picker
@ReactMethod fun scanStorage(uri: String, promise: Promise)      // Recursive scan
@ReactMethod fun readFile(uri: String, promise: Promise)         // Read via ContentResolver
@ReactMethod fun copyToAppStorage(uri: String, fileName: String, promise: Promise)
@ReactMethod fun getFileSha256(uri: String, promise: Promise)    // For dedup
@ReactMethod fun readZipEntryText(path: String, entryPath: String, maxBytes: Double, promise: Promise)
@ReactMethod fun clearCurrentIntent(promise: Promise)
```

### SAF Flow (User picks folder)

```
User taps "Scan Phone" or "Import"
       ↓
DocumentPicker / ACTION_OPEN_DOCUMENT_TREE
       ↓
User grants URI permission (persistableUriPermission)
       ↓
persistUriPermission(uri, FLAG_PERSISTABLE_URI_PERMISSION)
       ↓
Uri stored in settingsStore.authorizedFolderUris (SQLite)
       ↓
On next launch: takePersistableUriPermission() to re-acquire
```

### Recursive Scan (used by Files/Folders screen)

```kotlin
// scanStorage(uri) in LiruneStorageModule.kt
fun scanStorage(uri: String): List<DiscoveredFile> {
    val documents = DocumentsContract.buildChildDocumentsUriUsingTree(
        uri, DocumentsContract.getTreeDocumentId(uri))
    val cursor = contentResolver.query(documents, PROJECTION, null, null, null)
    // Recurse into directories (MIME_TYPE = "vnd.android.document/directory")
    // Collect files matching SUPPORTED_EXTENSIONS
    // Return: [{ uri, name, size, mimeType, lastModified, isDirectory }]
}
```

---

## 5. Import Pipeline (User File → App Storage)

```
User selects file via DocumentPicker
       ↓
ImportService.pickAndImportBook()
       ↓
FormatDetector.detect(uri)           ← MIME + extension check
       ↓
DuplicateCheck.findDuplicate(sha256, fileSize)  ← SQLite query
       ↓
FileStorage.copyToAppStorage(sourceUri, destFileName)
       ↓
  → Native: copyToAppStorage() streams via ContentResolver.openInputStream()
  → Writes to ${documentDirectory}books/<uuid>.ext
  → Stages as .part → renames on success (atomic)
       ↓
MetadataExtractor.extract(uri)       ← EPUB: reads OPF/NCX; PDF: pdf.js; etc.
       ↓
BookRepository.insert(book)          ← SQLite
       ↓
LibraryStore.loadLibrary()           ← React state update
```

---

## 6. Reading Access (Reader)

| Format | Access Method |
|--------|---------------|
| EPUB | `EpubArchive.open(buffer)` → reads from app-private file (`ArrayBuffer`) |
| PDF | `PdfReaderView` → `fileStorage.readAsArrayBuffer()` → chunks to WebView |
| CBZ/CBR | Extracts to cache dir → serves images via `file://` |
| Others | Read from app-private copy |

**No SAF needed at read time** — all books are copied to app-private storage on import.

---

## 7. AndroidManifest Permissions

```xml
<!-- Added by withLiruneStorage plugin -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />

<!-- For SAF document picker -->
<uses-permission android:name="android.permission.MANAGE_DOCUMENTS" />

<!-- NO MANAGE_EXTERNAL_STORAGE (All Files Access) -->
```

*Configured via `mobile/plugins/withLiruneStorage.js` Expo config plugin.*

---

## 8. Security Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Copy on import** | Avoids holding SAF URI permissions long-term; survives app updates/uninstalls |
| **SHA-256 dedup** | Content-based, not filename-based; works across folders |
| **`.part` staging** | Crash-safe writes; cleanup on next launch |
| **No All Files Access** | Play Store compliant; user controls exact folders via SAF |
| **Persisted URI permissions** | Re-acquires access on cold start without re-prompting |
| **WebView reads local files** | No CORS/content:// issues; `file://` works in WebView |

---

## 9. Folders Screen Implementation Path

For the "Folders" feature, use these APIs:

```typescript
// 1. Pick root folder
const rootUri = await nativeStorage.pickFolder()

// 2. Recursive scan
const files = await nativeStorage.scanStorage(rootUri)

// 3. Read/import file
await nativeStorage.readFile(fileUri)

// 4. Persist authorization
await settingsStore.addAuthorizedFolderUri(rootUri)

// 5. Re-acquire on cold start (in RootLayout/AppInitializer)
await nativeStorage.takePersistableUriPermission(uri)
```

**Key files to reference:**
- `mobile/app/(tabs)/search.tsx` — existing Files screen with SAF integration
- `mobile/services/storage/NativeStorageBridge.ts` — JS ↔ Kotlin bridge
- `mobile/state/settingsStore.ts` — `authorizedFolderUris` persistence
- `mobile/plugins/native/lirune-storage/LiruneStorageModule.kt` — native implementation

---

## Conversion to PDF

To convert this markdown to PDF:

```bash
# Using pandoc (recommended)
pandoc STORAGE_ARCHITECTURE.md -o STORAGE_ARCHITECTURE.pdf \
  --pdf-engine=weasyprint \
  -V geometry:margin=1in \
  -V fontsize=11pt

# Or using VS Code: "Markdown: Export to PDF" command
# Or using GitHub: View raw → Print → Save as PDF
```