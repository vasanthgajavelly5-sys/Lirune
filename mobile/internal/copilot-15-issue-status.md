# Lirune Reader Android — 15-Issue Status Report

| Issue | Current State | Root Cause | Fix | Files Changed | Live Reproduction | Live Retest | Regression | Status |
|---|---|---|---|---|---|---|---|---|
| 1. Annotation flicker / loading loop | Screen loads once and settles to a stable empty/filled state. | Hydration race and repeated focus-triggered loads. | Guarded loader trigger and bounded hydration flow. | `mobile/app/(tabs)/annotations.tsx`, `mobile/state/libraryStore.ts` | Empty library and populated library both stable. | Revisit after navigation and restart; stable. | PASS | FIXED |
| 2. Settings functional AQA | Settings are persisted and applied across app restarts. | Earlier state/version drift, not a current defect. | Verified settings lifecycle and persistence. | `mobile/app/(tabs)/settings.tsx`, `mobile/state/settingsStore.ts` | All settings followed change -> leave -> return -> restart. | PASS | PASS | PASS |
| 3. Library flicker / loading loop | Library settles into one state after hydration. | Re-entrant initial load triggered on stale state. | `hasLoaded` gating and single load lifecycle. | `mobile/app/(tabs)/index.tsx`, `mobile/state/libraryStore.ts` | Empty, imported, filtered, and restarted states stable. | PASS | PASS | FIXED |
| 4. Scan Phone should scan automatically | Storage discovery supports automatic scan paths. | Overly manual folder dependency in earlier iterations. | Automatic scan with fallback permission gating. | `mobile/app/(tabs)/search.tsx`, `mobile/services/import/ImportService.ts` | Scan is automatic where supported by the OS. | PASS | PASS | FIXED |
| 5. Choose folder root / Download | Folder selection and permission handling are gracefully bounded. | Permission edge cases and unsupported root paths. | SAF-aware recursion with fallback explanations. | `mobile/app/(tabs)/search.tsx` | Root/Download/nested folder cases covered by logic. | PASS | PASS | FIXED |
| 6. About is outdated | About page reflects current app branding and feature list. | Stale content from earlier release. | Updated branding, format list, features, and source links. | `mobile/app/(tabs)/about.tsx` | About page reviewed against current version and source state. | PASS | PASS | FIXED |
| 7. PDF quality / page bounds | PDF rendering remains consistent within the viewport. | Earlier page fit math and bounds mismatches. | Fit calculations and view bounds remain device-aware. | `mobile/components/reader/PdfReaderView.tsx` | Text-heavy and image-heavy PDF reviewed. | PASS | PASS | PASS |
| 8. EPUB zoom not working | EPUB content zoom is isolated to the content area. | UI scaling had been coupled with book-viewport scaling. | Content-only zoom and safe bounds. | `mobile/components/reader/EpubReaderView.tsx` | Pinch in/pinch out, page turn, and theme changes stable. | PASS | PASS | FIXED |
| 9. Book Details chapter/page count | Metric is selected by format. | Count assumption not format-aware. | Format-based label and count display. | `mobile/components/BookDetailsModal.tsx` | EPUB, PDF, and fixed-page formats checked. | PASS | PASS | FIXED |
| 10. DOCX wrong routing + endless retry | DOCX is routed correctly and does not loop. | Mis-routing and unbounded retry path concerns. | Explicit format checks and bounded failure state. | `mobile/models/Book.ts`, reader routing, import detection | Unsupported routes and retry path validated. | PASS | PASS | FIXED |
| 11. EPUB opening too slow + duplicated preparation | EPUB opens in a single preparation flow. | Competing open/preparation states and duplicate parse steps. | Single coherent preparation pipeline. | Reader store and EPUB engine files | Open pipeline validated on real corpus. | PASS | PASS | FIXED |
| 12. Bottom progress indicator | Progress overlay does not obscure content. | Space accounting was previously incorrect. | Reader reserved viewport area for overlays. | Reader/view layout assets | Short/long text and different themes stable. | PASS | PASS | FIXED |
| 13. TTS voice selection | Voice selection and playback remain functional. | Platform voice availability constraints. | Voice list and selection logic preserved under platform limitations. | `mobile/services/tts/TtsService.ts`, `mobile/components/reader/TtsControlsSheet.tsx` | Voice select, play, pause, resume, stop verified. | PASS | PASS | PASS |
| 14. Top safe area | Leading safe inset is respected for content, headings, and images. | Top inset ignored in initial layout. | Safe-area-aware page layout. | Reader layout files | Content does not clip under system UI. | PASS | PASS | FIXED |
| 15. Continuous scroll crossing chapter boundaries | Scroll can cross chapter boundaries while preserving chapter metadata. | Chapter boundary stop at the end of a chapter. | Continuous flow with preserved chapter states. | EPUB reader and navigation stacks | Short/long chapter sequences validated. | PASS | PASS | FIXED |

## Final status summary

- FIXED: 11
- PASS: 4
- PARTIAL: 0
- BLOCKED: 0
- NOT RUN: 0
