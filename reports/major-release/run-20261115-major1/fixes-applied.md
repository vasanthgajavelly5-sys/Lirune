# Technical Log: Autonomous Fixes Applied During Acceptance Testing

## 1. Storage Contract Allowlist Expansion (`main.js`, `scripts/storage-contract.js`)
- **Problem:** Files with extensions `cb7, cbt, ppt, png, jpg, tiff, xls, msg, chm, djvu` failed with `"Unsupported managed storage extension"` upon import.
- **Root Cause:** `SUPPORTED_EXTENSIONS` in `main.js` and `scripts/storage-contract.js` had a legacy hardcoded 21-element list instead of dynamically referencing `BookFormat.importExtensions()`.
- **Resolution:** Synchronized `SUPPORTED_EXTENSIONS` with `BookFormat.importExtensions()` (86 extensions). All formats can now be saved into managed storage.

## 2. Word 2.0/6.0/95 Binary Document Ingestion & Rendering (`main.js`, `js/reader/docAdapters.js`)
- **Problem:** `doc_sample_medium.doc` (Word 95 binary document starting with `0xDB 0xA5`) failed buffer validation and threw `"Unsupported archive format"`.
- **Resolution:** Updated `validateBookBuffer` to recognize magic bytes `0xDB 0xA5`. Updated `parseDoc` in `docAdapters.js` to extract text from binary streams starting at offset 0. Verified 212 paragraphs rendered.

## 3. Comic & Archive Adapter Stabilization (`js/reader/readerController.js`, `js/reader/cbzAdapter.js`)
- **Problem:** `cb7` and `cbt` threw `ReferenceError: exports is not defined` in browser renderer when loading CommonJS `libarchive-wasm`. `naturalCompare` caused a ReferenceError in CBR metadata extraction.
- **Resolution:** Mapped `cbr, cbt, cb7, zip, rar` to `CbrAdapter` (which delegates extraction to Node.js IPC). Replaced `naturalCompare` with standard `String.prototype.localeCompare`.

## 4. OLE2 Subtype Detection Disambiguation (`js/formats.js`)
- **Problem:** `ppt_sample_medium.ppt` was misdetected as `xls` because the presentation text contained the word `"Book"` in UTF-16LE, matching a naive Excel detection check.
- **Resolution:** Required explicit `ext === 'xls'` when matching `"Book"`, and prioritized PowerPoint signatures (`PowerPoint`, `PP40`, `Current User`).

## 5. Legacy PowerPoint 4.0/95 Text Extraction (`js/reader/legacyOfficeAdapter.js`)
- **Problem:** PowerPoint 4.0 files failed with `"Legacy PPT document stream is missing"` because they lack the `PowerPoint Document` stream present in PPT 97-2003.
- **Resolution:** Added support for `PP40` and `Current User` streams. Implemented fallback printable string extraction for early presentation structures.

## 6. Safe Resolution of CFB in Legacy Office & Spreadsheet Adapters (`js/reader/legacySpreadsheetAdapter.js`, `index.html`)
- **Problem:** `import('cfb')` threw `TypeError: Failed to resolve module specifier 'cfb'` in browser renderer.
- **Resolution:** Loaded `node_modules/cfb/cfb.js` via standard script tag and resolved `window.CFB || (await import('../../node_modules/cfb/cfb.js'))`.

## 7. RTF Graceful Empty Document Handling (`js/reader/officeAdapters.js`)
- **Problem:** `rtf_sample_low.rtf` (7-byte header `{\rtf1}`) threw `"This RTF file appears to be empty"` which aborted reader loading.
- **Resolution:** Rendered an empty document notice `"<em>(Empty document)</em>"` instead of throwing an error.

## 8. Android Offline Hermes Bundle Assembly (`mobile/`)
- **Problem:** React Native Metro bundler failed to resolve `fs` required by static imports of `libarchive-wasm`. Debug APK crashed without embedded JS bundle.
- **Resolution:** Replaced static imports with guarded dynamic imports (`getLibArchive`). Generated offline bundle via `npx expo export -p android`, embedded bundle into APK assets, and successfully assembled debug APK with Gradle.
