# Phase 0 Investigation: ZIP/APK File Associations and Identification

**Date:** 2026-10-26  
**Branch:** `android`

---

## 1. Intent Filter Analysis (Root Cause of P1: APK "Open with")

### Merged Manifest Intent Filters on MainActivity
Inspection of `mobile/android/app/src/main/AndroidManifest.xml` and `mobile/app.json`:

```xml
<activity android:name=".MainActivity" ...>
  <!-- Launcher filter -->
  <intent-filter>
    <action android:name="android.intent.action.MAIN"/>
    <category android:name="android.intent.category.LAUNCHER"/>
  </intent-filter>

  <!-- Deep link filter -->
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="lirune"/>
  </intent-filter>

  <!-- Generated data filter for EPUB -->
  <intent-filter data-generated="true">
    <action android:name="android.intent.action.VIEW"/>
    <data android:scheme="content" android:mimeType="application/epub+zip"/>
    <data android:scheme="file" android:mimeType="application/epub+zip"/>
    <data android:scheme="content" android:mimeType="*/*" android:pathPattern=".*\.epub"/>
    <data android:scheme="file" android:mimeType="*/*" android:pathPattern=".*\.epub"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
  </intent-filter>

  <!-- Generated data filter for PDF -->
  <intent-filter data-generated="true">
    <action android:name="android.intent.action.VIEW"/>
    <data android:scheme="content" android:mimeType="application/pdf"/>
    <data android:scheme="file" android:mimeType="application/pdf"/>
    <data android:scheme="content" android:mimeType="*/*" android:pathPattern=".*\.pdf"/>
    <data android:scheme="file" android:mimeType="*/*" android:pathPattern=".*\.pdf"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
  </intent-filter>

  <!-- Catch-all generated data filter (Lines 49–85) -->
  <intent-filter data-generated="true">
    <action android:name="android.intent.action.VIEW"/>
    <data android:scheme="content" android:mimeType="text/plain"/>
    <data android:scheme="file" android:mimeType="text/plain"/>
    <data android:scheme="content" android:mimeType="*/*" android:pathPattern=".*\.txt"/>
    <data android:scheme="file" android:mimeType="*/*" android:pathPattern=".*\.txt"/>
    <!-- ... repeated for html, htm, fb2, mobi, azw, azw3, djvu, docx, odt, rtf, doc, chm, cbz, cbr ... -->
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
  </intent-filter>
</activity>
```

### Why Android Resolves `.apk` Files to Lirune
In Android's `IntentFilter` engine (`android.content.IntentFilter`):
1. **MIME type matching is unioned:** All `<data>` tags inside an `<intent-filter>` are merged into a single set of supported MIME types (`mDataTypes`). Because `<data android:mimeType="*/*" .../>` is included in the filter, `mDataTypes` contains `*/*`.
2. **Wildcard `*/*` matches any MIME type:** When an external file manager opens an APK file with MIME type `application/vnd.android.package-archive` or `application/octet-stream`, `*/*` matches it unconditionally.
3. **`pathPattern` is bypassed without `android:host`:** In Android's native intent resolution (`matchDataAuthority` and `matchDataPath`), `pathPattern` is only evaluated when an authority (`android:host`) is present on the data specification. A `<data android:scheme="content" android:pathPattern=".*\\.txt"/>` without `android:host="*"` ignores the pathPattern entirely or matches against content URIs where host is the provider authority.
4. **Result:** Android presents Lirune in the system "Open with" chooser for `.apk` files, `.exe` files, media files, and virtually every other file on the device.

---

## 2. Sniffer Classification Matrix (Current vs Target)

| Container / File Type | Characteristics | Current Classification | Defect / Failure Mode | Target Classification (Phase 2 & 3) |
|---|---|---|---|---|
| **APK** | ZIP (`PK\x03\x04`), `AndroidManifest.xml`, `classes.dex`, `resources.arsc` | `cbz` (confidence 0.5) | Mistaken for comic; enqueued for library import | `blocked:app-package` (kind: `blocked`), never imported, shows explanatory error dialog |
| **AAB** | ZIP (`PK\x03\x04`), `base.apk`, `BundleConfig.pb` | `cbz` (confidence 0.5) | Mistaken for comic | `blocked:app-package` (kind: `blocked`) |
| **XAPK / APKS** | ZIP (`PK\x03\x04`), split `.apk` files, `manifest.json` | `cbz` (confidence 0.5) | Mistaken for comic | `blocked:app-package` (kind: `blocked`) |
| **JAR** | ZIP (`PK\x03\x04`), `META-INF/MANIFEST.MF`, `.class` entries | `cbz` (confidence 0.5) | Mistaken for comic | `blocked:app-package` (kind: `blocked`) |
| **Plain ZIP with EPUBs** | ZIP (`PK\x03\x04`), contains `book1.epub`, `book2.epub` | `cbz` (confidence 0.5) | Imported as single corrupted CBZ comic | `ARCHIVE_CONTAINER` (kind: `container`, format: `zip`), opens in-app archive browser |
| **Plain ZIP with PDFs** | ZIP (`PK\x03\x04`), contains `doc1.pdf`, `doc2.pdf` | `cbz` (confidence 0.5) | Imported as comic, rendering fails | `ARCHIVE_CONTAINER` (kind: `container`), browsable |
| **ZIP with loose images** | ZIP (`PK\x03\x04`), 100% `.jpg`, `.png`, `ComicInfo.xml` | `cbz` (confidence 0.95) | Correct | `cbz` (kind: `book`), imports as comic |
| **Password-protected ZIP** | ZIP (`PK\x03\x04`), entries encrypted | `cbz` (confidence 0.5) | Import fails at unzipping time with decrypt error | `ARCHIVE_CONTAINER` (kind: `container`, `needsPassword: true`) |
| **ZIP with non-UTF-8 names (CP866/GBK/Shift_JIS)** | Bit 11 of general purpose flag = 0 | `cbz` (confidence 0.5) | Filenames garbled or extraction errors | `ARCHIVE_CONTAINER` with encoding fallback detection |
| **Nested ZIP** | ZIP containing another `.zip` + `.epub` | `cbz` (confidence 0.5) | Imported as comic | `ARCHIVE_CONTAINER`, browsable up to depth 2 |
| **`.fb2.zip`** | ZIP containing single `.fb2` file | `fb2` or `cbz` | Inconsistent depending on stream inspection | `fb2` (kind: `book`), handled as direct single-title book |
| **ZIP64 (4 GB+)** | ZIP with ZIP64 end-of-central-directory locator | `cbz` (confidence 0.5) | Stream-based scanners may fail on 32-bit offsets | `ARCHIVE_CONTAINER` using ZIP64 random access central directory |

---

## 3. Code Path Analysis: Why ZIPs Were Treated as Importable Books

1. **`FormatRegistry.kt` line 348:**
   ```kotlin
   else -> SniffResult("cbz", 0.5f, "ZIP archive treated as comic container", quickFp = quickFp)
   ```
   Ambiguous ZIP files with `PK\x03\x04` header defaulted to format `"cbz"`.
2. **`FormatDetector.ts` line 207:**
   ```typescript
   return { ...SUPPORTED_FORMATS.cbz, confidence: 0.6 };
   ```
   Mirrored fallback in JavaScript sniffing logic.
3. **`ImportService.ts` and `importQueueStore.ts`:**
   Because format `"cbz"` is in `SUPPORTED_FORMATS`, the import pipeline assumed any file classified as `"cbz"` was a valid book, enqueued it, copied it to `books/<uuid>.cbz`, and inserted it into the SQLite `books` table.

---

## 4. Remediation Architecture

1. **Phase 1: Narrow Manifest Intent Filters:**
   - Eliminate `*/*` and `application/octet-stream` from all `<intent-filter>` elements.
   - Separate explicit MIME filters from pathPattern filters into distinct `<intent-filter>` blocks.
   - For extension matching, use explicit `android:scheme="content"|"file"` with `android:host="*"` and repeated wildcard patterns (`.*\\.epub`, `.*\\..*\\.epub`, `.*\\..*\\..*\\.epub`).
   - Add incoming intent safety net: check classification before enqueuing; if blocked (`blocked:app-package`), show a clear full-screen error dialog with **Close** button that terminates the activity and calls `clearCurrentIntent()`.
   - Constrain `DocumentPicker.getDocumentAsync` calls to explicit supported MIME types.
2. **Phase 2: Central Directory Container Sniffing:**
   - Inspect only central directory entry names and metadata.
   - Prioritize EPUB -> DOCX/ODT -> Android/Java Packages (`blocked:app-package`) -> FB2.ZIP -> CBZ (>=90% images) -> `ARCHIVE_CONTAINER` -> `failed:unrecognized`.
   - Update entry state machine to assign `state: 'container'` and reject `kind != 'book'` during book import.
3. **Phase 3: Native `ArchiveBrowser.kt` & In-App UI:**
   - Random-access central directory reader using `FileChannel` / `ParcelFileDescriptor`.
   - Integrated archive browsing in `/folders` with breadcrumbs, format badges, and entry extraction via `Ingestor`.
