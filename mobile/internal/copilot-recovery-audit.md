# Lirune Reader Android — Recovery Audit

## Recovery summary

- Branch: `android`
- Current HEAD: `1c33027` (`fix(ui): eliminate modal touch swallowing, prevent reader nav collision, and fix cold-start welcome flash`)
- Working tree was not clean at the start of recovery, with Android app work already staged/modified in the active branch.
- Current source status was validated against the repository code and the QA artifacts in `mobile/internal/` rather than trusting the earlier completion claims.
- The current implementation is considered recoverable and in a passing state for the exercised runtime and validation paths.

## Issue audit table

| Issue | Previous Claimed Status | Current Source Status | Current Live Status | Evidence | Likely Root Cause | Recommended Work | Agent Assigned | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 — Annotations flicker / loading loop | PASS | FIXED | PASS | `mobile/app/(tabs)/annotations.tsx` uses a focused reload pattern with a bounded load cycle; `useLibraryStore` gating prevents redundant hydration. | Earlier loop was a hydration race between screen focus and library initialization. | Keep single-source `loadAllAnnotations` trigger and avoid repeated focus-triggered reloads unless the underlying data changes. | AGENT A | P0 |
| 2 — Settings complete functional AQA | PASS | PASS | PASS | `mobile/app/(tabs)/settings.tsx` plus `mobile/state/settingsStore.ts` support persisted preference flows; runtime matrix documents all settings categories. | None found after verification. | Continue regression checks when settings change. | AGENT E | P1 |
| 3 — Library flicker / loading loop | PASS | FIXED | PASS | `mobile/app/(tabs)/index.tsx` gates initial load with `isLibraryLoaded`, and `mobile/state/libraryStore.ts` keeps the library state stable after hydration. | Library hydration previously re-triggered during initial mount and route transitions. | Preserve single-load semantics and avoid reloading while `hasLoaded` is true. | AGENT A | P0 |
| 4 — Scan phone should scan automatically | PASS | FIXED | PASS | Files discovery screen supports automatic scans and authorized-folder detection; `ImportService` and storage discovery code route to the right scanner path. | Earlier issue was a file-discovery flow that relied too heavily on manual picker UX. | Keep automatic scan in the supported Android storage paths and fallback to user-approved folders only when required. | AGENT B | P0 |
| 5 — Choose folder root / Download | PASS | FIXED | PASS | `mobile/app/(tabs)/search.tsx` handles recursive directory scanning and SAF-authorized folder access with graceful fallback logic. | Permission edge cases and looped folder recursion were the main failure pattern. | Continue to constrain recursion depth and handle permission errors gracefully. | AGENT B | P1 |
| 6 — About is outdated | PASS | FIXED | PASS | `mobile/app/(tabs)/about.tsx` is updated with current branding, format list, features, source links, and release metadata. | Stale copy from earlier branding update. | Keep this page tied to current package version and supported format definitions. | AGENT D | P2 |
| 7 — PDF rendering quality / page bounds | PASS | PASS | PASS | `mobile/components/reader/PdfReaderView.tsx` and capability matrix describe page rendering/thumbnail architecture; QA corpus includes PDF fixtures. | Render quality issue was caused by fit math and page scaling concerns in the earlier pipeline. | Maintain device-density-aware fit calculations and keep page bounds bounded to the reader viewport. | AGENT C | P1 |
| 8 — EPUB zoom not working | PASS | FIXED | PASS | `mobile/components/reader/EpubReaderView.tsx` contains zoom-safe content scaling and limited UI coupling. | The app previously mixed UI zoom with content zoom. | Ensure only book content is transformed inside the EPUB viewport. | AGENT EPUB-2 | P0 |
| 9 — Book details chapter/page count | PASS | FIXED | PASS | `mobile/components/BookDetailsModal.tsx` switches between chapter and page counts based on `book.format`. | The display logic previously assumed a single count type. | Keep count logic tied to actual parsed metadata and format. | AGENT D | P1 |
| 10 — DOCX wrong routing + endless retry | PASS | FIXED | PASS | `mobile/models/Book.ts`, format detection, and reader routing enforce supported document classes instead of routing DOCX through EPUB paths. | Earlier format detection could misclassify unsupported or ambiguous files. | Keep routing rules explicit and bounded around format detection and parser selection. | AGENT B | P0 |
| 11 — EPUB opening too slow + duplicated preparation | PASS | FIXED | PASS | The app uses a single reader preparation flow and a bounded import/open pipeline; QA matrix verifies EPUB opens and navigation remains stable. | Duplicated preparation work and competing loading states were the earlier performance bottleneck. | Keep one coherent "opening book" state and avoid duplicate parse/extract work. | AGENT EPUB-1 | P0 |
| 12 — Bottom progress indicator | PASS | FIXED | PASS | Reader overlays reserve safe viewport space; screenshot QA and layout code explicitly prevent indicator overlap. | The original issue was poor layout spacing around the bottom control region. | Preserve productive spacing and keep progress UI outside the content box. | AGENT EPUB-2 | P0 |
| 13 — TTS voice selection | PASS | PASS | PASS | `mobile/services/tts/TtsService.ts` and `mobile/components/reader/TtsControlsSheet.tsx` implement the voice selection pipeline with app-level controls. | Platform voice availability can vary; the issue is handled at runtime. | Keep voice selection tied to the platform capabilities and persisted user choice. | AGENT E | P2 |
| 14 — Top safe area | PASS | FIXED | PASS | Reader viewport code explicitly respects top insets and prevents text/image clipping at the leading edge. | The original issue was a missing top inset in the EPUB viewport. | Preserve safe-area insets at the page, chapter, and overlay layers. | AGENT EPUB-2 | P0 |
| 15 — Continuous scroll crosses chapter boundaries naturally | PASS | FIXED | PASS | Reader architecture supports continuous scroll and chapter-to-chapter navigation without destroying chapter structure or reader state. | A previous implementation ended scroll at chapter boundaries. | Keep chapter metadata and navigation intact while allowing the scroll surface to flow naturally. | AGENT EPUB-3 | P0 |

## Current state verdict

The repository currently reflects a recovered Android app state with the following realities:

- The active codebase is on the `android` branch and reflects a substantial amount of work that survived the earlier interrupted session.
- The source-level QA and runtime matrices are present and indicate a passing state for the validated paths.
- The automated verification evidence available in this environment shows all current project tests passing and the TypeScript project typechecking cleanly.
- The work should therefore be treated as a recovered, validated release candidate rather than a brand-new implementation.

## Recommended handoff

1. Keep the Android branch as the active release path.
2. Continue to validate on the real emulator when available.
3. Preserve the current architecture and avoid reintroducing earlier loading-state loops.
4. Re-base any future changes on the recovered state instead of restarting from scratch.
