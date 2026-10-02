# EPUB and Storage Engineering Continuation

Date: 2026-10-02
Branch: `android` (`315d7f2` at start of this continuation)

## Completed in source

### EPUB

- `EpubReaderView` passes archive data to JSZip as an `ArrayBuffer`, avoiding a persistent Base64 parser input. Expo's legacy file API still produces Base64 transiently, so large-book peak memory is not eliminated.
- EPUB inline and linked chapter stylesheets are gathered. Local image/font URLs are resolved from the ZIP and embedded; external stylesheet links, imports, and resources are dropped.
- Continuous-scroll chapter injection now begins on the WebView load event rather than a 100 ms timer. Hydration fills cached and uncached chapter sections in one WebView document, then restores saved scroll and enables scroll-progress reporting. This avoids injecting before the document exists and avoids leaving cached chapters blank after a source reload.
- No new live EPUB or format QA was performed after the user's instruction to pause format testing.

### Storage/import

- App storage directory creation failures are surfaced instead of silently continuing to a later opaque copy failure.
- Failed or zero-byte book copies and failed cover writes clean up partial files.
- Book-file deletion failure no longer prevents an independent app-owned cover cleanup attempt.
- Re-linking now copies the selected document into app-private durable storage and updates `filePath`; the old URI is retained only as provenance, and the prior managed copy is removed after the DB update succeeds.
- `deleteBookFiles` now refuses paths outside the app's managed `books/` directory, so library cleanup cannot target an original SAF/content URI.
- Storage usage counts actual non-directory book files and includes cover bytes.
- Duplicate detection no longer treats equal file size or substring title matches as proof of a duplicate. It uses an exact normalized title match within the detected format when known.
- Relinking a book invalidates its old per-book cache before the replacement URI is resolved.

## Not verified / remains

- No SAF folder permission, revocation, restart, Download, nested-folder, scan, duplicate/import, malformed-file, or large-file live flows were run in this continuation.
- Whole-book EPUB scrolling, CSS/font fixtures, internal-link/anchor navigation, large-book startup time, memory, tablet layout, and EPUB controls still need authorized live validation before PASS/release claims.
- The Expo fallback for SAF copies still reads through Base64 in JS and is not streaming; large SAF imports can have high memory cost.
- Exact title matching avoids false-positive duplicate suppression but does not identify identical file contents imported under different names; content hashing is not implemented.
- Release build, signing, package audit, final static checks, commit/push/tag, and GitHub release remain outstanding.

## Final checks and release gate — 2026-10-02

- `npm test`: PASS, 49/49 (includes two focused CSS safety/resource tests).
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 0 errors and 19 warnings (pre-existing warnings; none remain in the touched EPUB helper).
- `git diff --check`: PASS.
- `:app:assembleRelease`: JS bundle, native compilation, manifest/resource processing, and lintVital completed; packaging stopped at `:app:packageRelease` because release signing config has no `storeFile`. Only `mobile/android/app/debug.keystore` is present and no signing variables are set.
- An official distribution is also gated on the existing provenance audit: the mobile LICENSE does not match the stated project license, dictionary/font source terms are undocumented, and PDF.js advisory/version attribution needs reconciliation. See `copilot-provenance-license-audit.md` and `copilot-known-issues.md`.
- No release APK, SHA-256, size audit, final install smoke test, v4.0.5 tag, or GitHub release exists. Source branch publication is separate from an official distributable and does not satisfy the release requirement.
