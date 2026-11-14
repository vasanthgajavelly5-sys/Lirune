# Lirune Reader Mobile — Storage Architecture Technical Specification

**Version:** 2.0  
**Branch:** `android`  
**Date:** 2026-10-26

---

## Table of Contents

1. [Permission Model & Manifest Compliance](#1-permission-model--manifest-compliance)
2. [Architecture Overview](#2-architecture-overview)
3. [Format Detection & DRM Inspection](#3-format-detection--drm-inspection)
4. [Storage Access Framework (SAF) & Grant Lifecycle](#4-storage-access-framework-saf--grant-lifecycle)
5. [Scanner & Incremental Identity (`quick_fp`)](#5-scanner--incremental-identity-quick_fp)
6. [Ingestion Pipeline & Job Journaling](#6-ingestion-pipeline--job-journaling)
7. [Random-Access Reading: BookSession & ResourceServer](#7-random-access-reading-booksession--resourceserver)
8. [SQLite Schema & Versioned Migrations](#8-sqlite-schema--versioned-migrations)
9. [Two-Layer Folders & Custom File Manager](#9-two-layer-folders--custom-file-manager)
10. [Optional "All Files" Build Flavor (`LIRUNE_ALLFILES=1`)](#10-optional-all-files-build-flavor-lirune_allfiles1)

---

## 1. Permission Model & Manifest Compliance

### Corrected Android Storage Matrix

| API Level | Android Version | Storage Mechanism | Required Permissions |
|---|---|---|---|
| **29** | Android 10 | App-private files + SAF | None for app-private or SAF (`ACTION_OPEN_DOCUMENT_TREE`) |
| **30** | Android 11 | App-private files + SAF | None. Root and `Download` restricted by SAF security policy |
| **33** | Android 13 | App-private files + SAF | None. (`READ_MEDIA_*` does not cover document/book formats) |
| **34+** | Android 14+ | App-private files + SAF | None. All SAF access mediated through ContentResolver grants |
| **Optional Flavor** | Android 11+ (`LIRUNE_ALLFILES=1`) | Root filesystem direct access | `MANAGE_EXTERNAL_STORAGE` (Settings flow, non-Play Store) |

### Key Clarifications & Corrected Assumptions
1. **No Storage Permissions in Default Build:** Storage Access Framework (SAF) grants read/write permissions directly through URI permission tokens. No `<uses-permission>` tags (`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `MANAGE_DOCUMENTS`, `READ_MEDIA_*`) are needed or permitted in the Play Store build.
2. **`MANAGE_DOCUMENTS` Removed:** `android.permission.MANAGE_DOCUMENTS` is a signature-level permission reserved strictly for system document providers. Third-party applications cannot hold this permission.
3. **App-Private Storage Deletion:** Files in app-private storage (`context.filesDir` / `documentDirectory`) are deleted by the operating system upon application uninstall. To preserve managed files across uninstalls, the user can configure a persistent SAF library directory.

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        JavaScript / UI Layer                           │
│  ├── /folders (Layer 1: Locations, Layer 2: Custom In-App Browser)     │
│  ├── /search  (Files discovery & quick filters)                        │
│  ├── scanStore.ts, importQueueStore.ts, libraryStore.ts                │
│  └── NativeStorageBridge.ts (Strict TypeScript typed wrapper)          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ JSI / Coroutine Bridge
┌────────────────────────────────────▼───────────────────────────────────┐
│                        Kotlin Native Module                            │
│  ├── SourceManager     → Persisted SAF grants, launch validation, LRU  │
│  ├── Scanner           → Queue-based BFS coroutine, streaming batches  │
│  ├── FormatRegistry    → Pluggable sniffers (17+ formats) & DRM check  │
│  ├── Ingestor          → Single-pass copy + SHA-256 + atomic rename    │
│  ├── BookSession       → Random-access FileChannel / ParcelFileDesc    │
│  ├── ResourceServer    → Localhost HTTP Range server for WebViews      │
│  └── StorageBackend    → SafStorageBackend / AllFilesStorageBackend    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Format Detection & DRM Inspection

Detection is **content-based** (magic byte signatures and container structure inspection). File extensions and MIME types provided by Android content providers (which frequently default to `application/octet-stream`) are only used as secondary tie-breakers.

### Content-Based Sniffers (17+ Supported Formats)

| Format | Magic Bytes / Signature / Container Check | Confidence |
|---|---|---|
| **PDF** | `%PDF-` within the first 1024 bytes; checks for `/Encrypt` dict | 0.99 |
| **EPUB** | ZIP container; first entry `mimetype` == `application/epub+zip` or `META-INF/container.xml` | 1.00 |
| **CBZ** | ZIP container; contains only images (+ optional `ComicInfo.xml`) | 0.92 |
| **CBR** | `Rar!\x1A\x07\x00` (RAR4) or `Rar!\x1A\x07\x01\x00` (RAR5) | 0.98 |
| **CB7** | `7z\xBC\xAF\x27\x1C` | 0.98 |
| **MOBI / AZW3** | Bytes 60–67 == `BOOKMOBI` or `TEXtREAd`; KF8 flag in EXTH header | 0.95 |
| **FB2** | XML root `<FictionBook` (or `.fb2.zip` containing `<FictionBook`) | 0.95 |
| **DjVu** | `AT&TFORM` followed by `DJVU` or `DJVM` | 0.98 |
| **CHM** | `ITSF` at offset 0 | 0.99 |
| **RTF** | `{\rtf` at offset 0 | 0.99 |
| **DOCX** | ZIP container containing `word/document.xml` | 0.95 |
| **ODT** | ZIP container containing `content.xml` and `application/vnd.oasis.opendocument.text` | 0.95 |
| **TXT** | Valid UTF-8 / UTF-16 BOM or ASCII/UTF-8 text with no NUL characters | 0.70 |
| **Markdown** | Text file with Markdown headings (`# `), lists, or formatting | 0.75 |
| **HTML** | Begins with `<!DOCTYPE html` or `<html>` / `<head>` | 0.90 |

### DRM Detection
Files protected by DRM are identified during sniffing and marked with state `failed:drm` to inform the user before attempting to open:
- **EPUB:** `META-INF/encryption.xml` containing encryption algorithms other than standard font obfuscation (`http://www.idpf.org/2008/embedding`, `http://ns.adobe.com/pdf/enc#RC`), or Adobe ADEPT `rights.xml`.
- **Kindle (MOBI/AZW3):** Header encryption flags in MOBI record 0.
- **PDF:** Trailer or catalog dictionary containing `/Encrypt`.

---

## 4. Storage Access Framework (SAF) & Grant Lifecycle

### Grant Acquisition & Launch Validation
1. **Grant Time:** When a user selects a directory, the app calls:
   ```kotlin
   context.contentResolver.takePersistableUriPermission(
       uri,
       Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
   )
   ```
2. **Cold Start Validation:** On application startup, `SourceManager` queries `contentResolver.persistedUriPermissions`. If any registered source in SQLite no longer has an active system grant, it is marked `grant_valid = 0`. The UI displays a "Re-authorize" button rather than failing silently or crashing.
3. **Grant Limits & LRU Pruning:** Android limits active persistable grants (128 on API ≤30, 512 on API 31+). When active grants reach 90% of the threshold, `SourceManager` releases the least-recently-used grants (`releasePersistableUriPermission`).

---

## 5. Scanner & Incremental Identity (`quick_fp`)

### Queue-Based BFS Coroutine Scanner
- Non-recursive breadth-first search implemented via Kotlin coroutines on `Dispatchers.IO`.
- Streams results in batches of 200 items (`onScanBatch`, `onScanProgress`, `onScanDone`).
- Cancellable at any point via coroutine cancellation (`isActive`).
- Skips hidden files (`.`), system directories (`.thumbnails`, `Android/data`, `Android/obb`), and files under 1 KB.

### Fast Identity Fingerprinting (`quick_fp`)
```
quick_fp = "${fileSize}:${sha256(first 64KB + last 64KB)}"
```
- Cheap to compute during discovery without reading whole files.
- Rescan diffs on `(doc_id, size, mtime)`. Unchanged entries are skipped instantly, enabling 10,000-file folders to rescan in under 2 seconds.

---

## 6. Ingestion Pipeline & Job Journaling

### Ingest Modes
- **Managed (Default):** Streams `ContentResolver.openInputStream(uri)` directly to a temporary file (`books/<uuid>.part`) while simultaneously computing the full SHA-256 via `DigestOutputStream`. Performs `fsync()` and an atomic rename to `books/<uuid>.<ext>`. If a book with the same SHA-256 already exists, the temp file is deleted and deduped.
- **Linked:** Retains the book in its original location and accesses it via `openFileDescriptor("r")`. Probes seekability (`ParcelFileDescriptor.statSize >= 0` and seek verification). Non-seekable streams automatically fall back to managed mode.

### Job Journaling
All ingest operations are journaled in the `jobs` SQLite table (`type`, `entry_id`, `state`, `progress`, `error`). On startup, any incomplete jobs from an unexpected termination are either resumed or rolled back cleanly, leaving zero orphaned `.part` files.

---

## 7. Random-Access Reading: BookSession & ResourceServer

### Zero Full-Load Guarantee
Books are **never** read into JavaScript memory as large `ArrayBuffer`s.
- **BookSession:** Native module manages open file handles (`openBook(bookId) -> handleId`). JavaScript requests arbitrary slices on demand (`read(handleId, offset, length)`).
- **ResourceServer:** High-performance local HTTP server running on `127.0.0.1`. Serves book resources to reader WebViews using virtual origins with standard `Accept-Ranges: bytes` and `Content-Range: bytes start-end/total` headers.

---

## 8. SQLite Schema & Versioned Migrations

Database migration **v2** introduces foreign keys, WAL mode, and indices for real-time querying:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_uri TEXT UNIQUE NOT NULL,
  label TEXT,
  volume_id TEXT,
  status TEXT DEFAULT 'active',
  last_scan_at INTEGER,
  grant_valid INTEGER DEFAULT 1,
  import_mode TEXT DEFAULT 'managed'
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  doc_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  parent_doc_id TEXT,
  name TEXT NOT NULL,
  size INTEGER,
  mtime INTEGER,
  sniff_format TEXT,
  confidence REAL,
  quick_fp TEXT,
  state TEXT DEFAULT 'discovered',
  fail_reason TEXT,
  UNIQUE(source_id, doc_id)
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT,
  format TEXT NOT NULL,
  sha256 TEXT UNIQUE,
  quick_fp TEXT,
  cover_path TEXT,
  meta_json TEXT,
  chapter_count INTEGER DEFAULT 0,
  added_at INTEGER
);

CREATE TABLE IF NOT EXISTS book_files (
  book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
  mode TEXT CHECK(mode IN ('managed','linked')),
  path_or_uri TEXT NOT NULL,
  size INTEGER,
  seekable INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  progress REAL DEFAULT 0,
  error TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS book_locations (
  book_id TEXT NOT NULL,
  spine_index INTEGER NOT NULL,
  cfi TEXT,
  character_offset INTEGER,
  percentage REAL,
  created_at INTEGER,
  PRIMARY KEY (book_id, spine_index)
);

CREATE INDEX IF NOT EXISTS idx_entries_state ON entries(state);
CREATE INDEX IF NOT EXISTS idx_entries_fp ON entries(quick_fp);
```

---

## 9. Two-Layer Folders & Custom File Manager

### Layer 1: Locations
- Displays storage volumes (`internal`, `sdcard`, `usb_otg`) with available and total capacity.
- Displays all persisted SAF sources with status indicators (`Active`, `Invalid / Needs Re-authorization`).
- Action card to add locations using `ACTION_OPEN_DOCUMENT_TREE` or individual files using `ACTION_OPEN_DOCUMENT` with multi-select.

### Layer 2: Custom In-App Browser
- Navigates child documents within granted trees using `DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)`.
- Interactive breadcrumb navigation with jump-to-segment and parent-level navigation.
- Grid and list view modes with persisted preferences.
- Multi-select actions: batch import, recursive folder import, ignore list.
- Fast sorting (name, date, size, type) and instant search filtering.

---

## 10. Optional "All Files" Build Flavor (`LIRUNE_ALLFILES=1`)

For sideloaded builds or power-user distributions:
- `AllFilesStorageBackend` uses `MANAGE_EXTERNAL_STORAGE` and `java.io.File` for direct filesystem access across root storage.
- Enabled at build time via Expo config plugin flag `LIRUNE_ALLFILES=1`.
- Play Store production builds default to `LIRUNE_ALLFILES=0` and contain zero privileged storage permissions.