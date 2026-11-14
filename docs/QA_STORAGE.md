# Lirune Reader Mobile — Storage & Folders QA Verification Checklist

This document details the manual quality assurance procedures and verification test cases for the Lirune Storage Engine v2, Folders File Manager, and Scale Reader.

---

## 1. Format Detection & Content-Based Sniffing

| ID | Test Scenario | Steps | Expected Result | Pass / Fail |
|---|---|---|---|---|
| **SNF-01** | EPUB served with `application/octet-stream` | Import an EPUB from a cloud provider / HTTP server returning generic MIME `application/octet-stream`. | Format is correctly identified as `epub` via magic bytes / container sniff; title and cover are parsed. | PASS |
| **SNF-02** | Renamed extension (`book.epub` -> `book.bin`) | Rename an EPUB file to `.bin` and browse via Folders. | File shows `EPUB` format badge and opens properly in the EPUB reader. | PASS |
| **SNF-03** | Extensionless book file | Place an EPUB or PDF with no file extension into an indexed folder. | Detected as EPUB or PDF by magic bytes; not skipped or dropped. | PASS |
| **SNF-04** | All 17+ Supported Formats | Place 1 sample file each of PDF, EPUB, MOBI, AZW3, FB2, CBZ, CBR, CB7, DJVU, CHM, RTF, DOCX, ODT, TXT, MD, HTML into a test folder. | All 17+ formats show their respective format badge and can be queued for import. | PASS |
| **SNF-05** | Unknown binary file | Place an unsupported binary file (e.g., an `.exe` or random blob). | File is marked as `failed:unrecognized` with a human-readable reason in details; not silently lost. | PASS |
| **SNF-06** | Adobe ADEPT / Encrypted EPUB | Import an EPUB with Adobe DRM (`rights.xml` or non-font encryption in `encryption.xml`). | File is flagged as `failed:drm` with message "Digital Rights Management (DRM) detected"; does not crash reader. | PASS |
| **SNF-07** | Encrypted PDF | Import a password-protected or certificate-encrypted PDF. | Detected as `failed:drm` or shows password prompt; app does not crash or freeze. | PASS |

---

## 2. Storage Access Framework & Permission Lifecycles

| ID | Test Scenario | Steps | Expected Result | Pass / Fail |
|---|---|---|---|---|
| **SAF-01** | Granting a folder via Add Location | In Folders -> Add Location, pick a directory in `Documents` or `Books`. | Location card appears in Layer 1; directory contents load immediately. | PASS |
| **SAF-02** | Restrictive Root Handling (Android 11+) | Attempt to select the root of Internal Storage (`/`) or `Download` in tree picker. | App displays friendly guidance dialog: "Android doesn't allow selecting this folder directly. Pick a subfolder like Documents or Books." | PASS |
| **SAF-03** | Multi-file loose selection | In Folders -> Add individual files, multi-select several EPUBs across folders. | Files are imported directly into the library without requiring whole-tree access. | PASS |
| **SAF-04** | Revoke grant in system settings | Grant a folder -> Go to Android App Settings -> Clear Permissions / Revoke storage access -> Relaunch Lirune. | Source card shows "Invalid / Needs Re-authorization" with a "Re-authorize" button; app does not crash. | PASS |
| **SAF-05** | Re-authorize revoked grant | Tap "Re-authorize" on the invalid source card and pick the folder again. | Status updates to `Active`; browsing and indexing resume immediately. | PASS |
| **SAF-06** | Grant limit LRU pruning | Simulate granting 120+ (API 30) or 500+ (API 31+) folder URIs. | App releases least-recently-used persistable grants before hitting OS quota; does not crash. | PASS |

---

## 3. Large-Scale Folder Navigation & Scanner Responsiveness

| ID | Test Scenario | Steps | Expected Result | Pass / Fail |
|---|---|---|---|---|
| **SCN-01** | 10,000+ file directory browse | Navigate to a folder containing 10,000+ files. | Initial batch of 200 files renders in < 200 ms; scrolling remains fluid (no UI lockup > 100 ms). | PASS |
| **SCN-02** | Live scan progress & cancellation | Start a recursive scan on a large directory -> tap "Cancel" mid-scan. | Progress updates smoothly; scanning halts immediately upon cancellation; UI remains responsive. | PASS |
| **SCN-03** | Instant rescan without changes | Run rescan on a previously indexed 10,000-file folder where no files changed. | Rescan completes in under 2 seconds using `(doc_id, size, mtime)` diffing. | PASS |
| **SCN-04** | Vanished file handling | Index a folder -> delete one file outside Lirune -> rescan folder. | Vanished entry is marked `missing` in database; existing library record remains intact. | PASS |

---

## 4. Ingestion Pipeline, Crash Recovery & Dedup

| ID | Test Scenario | Steps | Expected Result | Pass / Fail |
|---|---|---|---|---|
| **ING-01** | Force kill mid-import | Begin importing a 300 MB book -> kill app process while progress is at 50% -> relaunch. | On launch, journal cleaner cleans up orphaned `.part` file; no corrupted book in library. | PASS |
| **ING-02** | Duplicate book import (Deduplication) | Import a book -> import the same book again under a different name or path. | Single-pass SHA-256 detects duplicate; temp file deleted; existing book record reused. | PASS |
| **ING-03** | Linked vs Managed fallback | Choose "Linked" mode on a file from a cloud provider returning non-seekable streams. | App detects non-seekable descriptor and automatically falls back to managed copy without failing. | PASS |

---

## 5. Workstream B: 2,000+ Chapter EPUB Scale Reader

| ID | Test Scenario | Steps | Expected Result | Pass / Fail |
|---|---|---|---|---|
| **EPB-01** | 2,000-chapter EPUB initial load | Open `test-fixtures/epub-2000-chapters.epub`. | Opens to first page in ≤ 1.5 s; peak JS heap growth < 50 MB; no bridge OOM or stack overflow. | PASS |
| **EPB-02** | 5,000-chapter EPUB initial load | Open `test-fixtures/epub-5000-chapters.epub`. | Opens to first page in ≤ 3.0 s; windowed rendering keeps DOM light (±2 chapters). | PASS |
| **EPB-03** | Rapid chapter-to-chapter turns | Rapidly turn pages across 100 chapters. | Navigation response ≤ 300 ms per transition; off-screen chapters are unloaded. | PASS |
| **EPB-04** | Virtualized TOC with 5,000 items | Open Chapter Sheet / TOC on the 5,000-chapter book. | Smooth 60 fps scrolling; fixed item height FlashList; search filter immediately narrows list. | PASS |
| **EPB-05** | Graceful degradation on bad chapter | Open an EPUB where Chapter 42 has corrupted XML or a missing manifest target. | Chapter displays placeholder warning; reader does NOT abort or close book; next chapters work. | PASS |

---

## 6. Custom In-App Folders Navigation

| ID | Test Scenario | Steps | Expected Result | Pass / Fail |
|---|---|---|---|---|
| **NAV-01** | Deep nested navigation | Navigate 5+ levels deep into subfolders (e.g. `Books > Sci-Fi > Asimov > Foundation > Extras`). | Breadcrumbs update correctly; tapping any segment jumps directly to that level. | PASS |
| **NAV-02** | Hardware back-button hierarchy | Press hardware back button at level 3. | Goes up to level 2 -> level 1 -> exits to Locations Layer 1 -> exits screen. | PASS |
| **NAV-03** | Multi-select batch import | Long-press a file to enter multi-select -> select 5 files and 1 folder -> tap "Import". | Bottom action bar indicates item count and total size; all selected items are enqueued. | PASS |
| **NAV-04** | Sorting and filtering persistence | Toggle to Grid view, sort by Size Descending, filter "Books only" -> exit and re-enter. | View mode, sorting, and filter states are preserved. | PASS |

---

## 7. Storage Diagnostics

| ID | Test Scenario | Steps | Expected Result | Pass / Fail |
|---|---|---|---|---|
| **DIA-01** | View diagnostics in Settings | Navigate to Settings -> Developer -> Storage Diagnostics. | Modal opens displaying registered sources, grant validity, job journal, and recent logs. | PASS |
| **DIA-02** | Copy diagnostic report | Tap "Copy Diagnostics" button. | Complete JSON report copied to clipboard. | PASS |

---

## 8. ZIP / APK Identification, File Association Chooser & Archive Browser

| ID | Test Scenario | Steps | Expected Result | Pass / Fail |
|---|---|---|---|---|
| **ARC-01** | Android Resolver / "Open with" exclusion for APK | 1. From third-party file manager (e.g. Files by Google), long-press an `.apk` file.<br>2. Run shell command:<br>`adb shell am start -a android.intent.action.VIEW -t application/vnd.android.package-archive -d "content://..."`<br>3. Check resolver candidates with `adb shell pm query-intent-activities -a android.intent.action.VIEW -t application/vnd.android.package-archive`. | Lirune is **NOT** listed in the Android "Open with" chooser or candidate activity resolver list. | PASS |
| **ARC-02** | Trojan APK renamed to `.zip`, `.epub`, `.bin` | 1. Rename `sample.apk` to `sample.zip` (or `.epub`, `.bin`, or extensionless).<br>2. Pick or open via in-app DocumentPicker or VIEW intent. | File is detected as `blocked:app-package`. App displays full-screen `BlockedFileModal` stating "Lirune can't open this file: it looks like an Android app package (.apk)". Tapping **Close** clears intent and exits safely; never imported or enqueued. | PASS |
| **ARC-03** | ZIP container browsing & selective import | 1. Place a `.zip` containing 3 EPUBs and 1 PDF in a folder.<br>2. Browse in Folders screen. Tap the ZIP container.<br>3. Select 2 EPUB entries -> tap "Import (2)". | Container opens in virtual directory view showing archive breadcrumbs. Selected 2 EPUB entries stream into library via `importQueueStore`. ZIP file itself is **not** imported into library. | PASS |
| **ARC-04** | Direct Book formats in ZIP (CBZ, EPUB, DOCX, ODT, FB2.ZIP) | Browse/import standard `.cbz`, `.epub`, `.docx`, `.odt`, and `.fb2.zip`. | All 5 formats are identified as `kind: 'book'` (not container) and import directly into the library as readable books. | PASS |
| **ARC-05** | Encrypted ZIP container password prompt | 1. Open an encrypted ZIP container (ZipCrypto or AES).<br>2. When prompted, enter an incorrect password.<br>3. Enter the correct password. | Incorrect password displays inline error without crashing (capped at 5 attempts before backing out). Password is held purely in memory (never logged/stored). Entries unlock and list correctly on correct password. | PASS |
| **ARC-06** | Zip-slip (`../../evil.epub`) protection | Attempt to open or extract an entry named `../../evil.epub`. | Path traversal is sanitized and rejected; extraction destination remains strictly `<uuid>.<ext>` inside managed storage; traversal fails safely. | PASS |
| **ARC-07** | Zip-bomb ratio protection (>200:1 on >100 MB / 2 GB cap) | Open a synthetic zip-bomb (small compressed payload expanding to gigabytes). | `SafeGuardInputStream` halts extraction with typed `Corrupt: suspicious compression ratio` or max declared size exceeded; app memory and disk protected. | PASS |
| **ARC-08** | Non-UTF-8 filename encodings (CP866, GBK, Shift_JIS) | Open a ZIP created on Windows/legacy OS with CP866 or GBK filenames without the UTF-8 header flag bit. | Charset detector transparently falls back through CP437 -> CP866 -> GBK -> Shift_JIS; entry names render properly without mojibake. | PASS |
| **ARC-09** | Large 2 GB+ ZIP browsing performance | Browse a multi-gigabyte ZIP archive with thousands of entries. | Index parses random-access Central Directory; first rows render in < 500 ms; JS heap remains lean and peak native memory stays under 100 MB. | PASS |
| **ARC-10** | Crash recovery / kill app mid-entry extract | 1. Begin extracting a 500 MB entry from a container.<br>2. Force-kill app (`am force-stop`) mid-stream.<br>3. Re-launch Lirune. | Journal cleaner sweeps temporary `.part` files on startup; no orphaned files or corrupt entries in library. | PASS |
| **ARC-11** | Rescan speed with 500 ZIP containers | Run folder rescan on a directory containing 500 ZIP archives where none changed. | Rescan completes in < 2 seconds because scanner only checks central directory metadata (mtime/size) without decompressing or listing entries. | PASS |

