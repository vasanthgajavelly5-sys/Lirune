# Lirune Reader Mobile — Android File Associations & Intent Filters

**Version:** 2.0  
**Date:** 2026-10-26  
**Config Plugin Source of Truth:** `mobile/plugins/withLiruneStorage.js`

---

## 1. Overview & Security Design

Prior to v2.0, the application declared catch-all wildcard filters (`*/*` and pathPatterns without explicit authorities) in `AndroidManifest.xml`. On Android, wildcard MIME types in an `<intent-filter>` union match any incoming file regardless of extension, which caused Lirune to appear in the system "Open with" chooser for `.apk`, `.exe`, and arbitrary unrelated system files.

Starting in v2.0:
1. **Zero Wildcards:** All `*/*` and `application/octet-stream` filters are completely eliminated.
2. **Strict MIME Matching:** Dedicated `VIEW`, `SEND`, and `SEND_MULTIPLE` intent filters with explicit MIME types.
3. **Explicit Extension Matching:** Case-insensitive repeated globs (`.*\\.ext`, `.*\\..*\\.ext`, `.*\\..*\\..*\\.ext`) bound strictly to `android:scheme="content"|"file"` with `android:host="*"`.
4. **Safety Net Sniffing:** When an incoming intent arrives, the content is inspected natively via `FormatRegistry` before any import or database write occurs. Blocked packages (`.apk`, `.aab`, `.jar`) or unknown files show an explanatory full-screen dialog with a **Close** action that finishes the activity, preventing half-imported entries.
5. **No Dangerous Associations:** Extensions such as `apk`, `jar`, `aab`, `xapk`, `apks`, `dex`, `exe`, `class`, `arsc`, `so`, and `dll` are strictly forbidden from the manifest and ignored during scans.

---

## 2. Supported Formats & MIME Matrix

All values are defined in `mobile/plugins/withLiruneStorage.js` (`SUPPORTED_MIME_TYPES`, `SUPPORTED_EXTENSIONS`) and mirrored in `mobile/models/Book.ts` (`SUPPORTED_DOCUMENT_MIMES`):

| Format Category | Format ID | Extensions | MIME Types | Intent Handling |
|---|---|---|---|---|
| **E-Books** | `epub` | `epub` | `application/epub+zip` | Direct Reader / Library Import |
| **Documents** | `pdf` | `pdf` | `application/pdf` | Direct Reader / Library Import |
| **Text** | `txt` | `txt` | `text/plain` | Direct Reader / Library Import |
| **Web** | `html` | `html`, `htm`, `xhtml` | `text/html` | Direct Reader / Library Import |
| **FictionBook** | `fb2` | `fb2` | `application/x-fictionbook+xml` | Direct Reader / Library Import |
| **Comics** | `cbz` | `cbz` | `application/vnd.comicbook+zip`, `application/x-cbz` | Direct Reader / Library Import |
| **Comics** | `cbr` | `cbr` | `application/vnd.comicbook-rar`, `application/x-cbr` | Direct Reader / Library Import |
| **Comics** | `cb7` | `cb7`, `7z` | `application/x-7z-compressed`, `application/x-cb7` | Direct Reader / Library Import |
| **Kindle** | `mobi` | `mobi`, `prc` | `application/x-mobipocket-ebook` | Direct Reader / Library Import |
| **Kindle** | `azw` | `azw` | `application/vnd.amazon.ebook` | Direct Reader / Library Import |
| **Kindle** | `azw3` | `azw3`, `kf8` | `application/x-mobi8-ebook` | Direct Reader / Library Import |
| **Documents** | `djvu` | `djvu`, `djv` | `image/vnd.djvu`, `image/x-djvu` | Direct Reader / Library Import |
| **Office** | `doc` | `doc` | `application/msword` | Direct Reader / Library Import |
| **Office** | `docx` | `docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Direct Reader / Library Import |
| **Documents** | `rtf` | `rtf` | `application/rtf`, `text/rtf` | Direct Reader / Library Import |
| **Office** | `odt` | `odt` | `application/vnd.oasis.opendocument.text` | Direct Reader / Library Import |
| **Help** | `chm` | `chm` | `application/vnd.ms-htmlhelp`, `application/x-chm` | Direct Reader / Library Import |
| **Containers** | `zip` | `zip` | `application/zip`, `application/x-zip-compressed`, `application/x-zip` | **Opens Archive Browser** (Phase 3) |

> **Note on `.rar` and `.7z`:** While `.cbr` (comic RAR) and `.cb7` (comic 7z) are supported comic formats, raw generic `.rar` and `.7z` container browsing is out of scope and omitted from file associations.

---

## 3. How to Add a New Format (Single Place to Edit)

To add a new format `xyz`:

1. **Edit `mobile/plugins/withLiruneStorage.js`:**
   - Add the MIME type(s) to `SUPPORTED_MIME_TYPES`.
   - Add the extension(s) to `SUPPORTED_EXTENSIONS`.
2. **Edit `mobile/models/Book.ts`:**
   - Add format definition to `SUPPORTED_FORMATS` and `SUPPORTED_DOCUMENT_MIMES`.
3. **Add Sniffer in `FormatRegistry.kt`:**
   - Add magic bytes / container sniffing in `FormatRegistry.kt` (and test in `formatSniffer.test.ts`).
4. **Run prebuild / manifest check:**
   - `npm test` runs `nativeStoragePlugin.test.ts` to automatically verify that the manifest has been configured with no catch-alls and includes the new format.
