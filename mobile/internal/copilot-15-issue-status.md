# Current 15-Issue Status

Date: 2026-10-01
Evidence rule: device-only claims remain BLOCKED without the official emulator.

| Issue | Reproduced/source evidence | Root cause | Fix in current tree | Live verification | Regression | Status |
|---|---|---|---|---|---|---|
| 1 Annotations flicker/loading | Concurrent focus loads were guarded | Re-entrant async hydration | In-flight guard added | BLOCKED: no adb | hydration guard test passes | PARTIAL |
| 2 Settings functional AQA | Source paths reviewed | Device persistence not exercised | Clear-data cleanup and settings paths improved | BLOCKED | typecheck/tests pass | PARTIAL |
| 3 Library flicker/loading | Duplicate load path reproduced in regression | Concurrent `loadLibrary` calls | Guarded store and screen | BLOCKED | targeted guard test passes | PARTIAL |
| 4 Scan Phone | Direct external path scan confirmed | Scoped storage mismatch | Not yet migrated to SAF-first discovery | BLOCKED | no device test | NOT RUN |
| 5 Choose Folder root/Download | Android docs confirm platform restrictions | ACTION_OPEN_DOCUMENT_TREE restrictions | Requires UI messaging/SAF handling | BLOCKED | no device test | PARTIAL |
| 6 About outdated | Version/report drift found | Stale metadata | About/version updated in current tree | BLOCKED | typecheck passes | PARTIAL |
| 7 PDF bounds/quality | Source reviewed; no visual proof | WebView/canvas quality needs device inspection | Restore/thumbnails fixed; PDF remains security-upgrade candidate | BLOCKED | PDF.js check passes | PARTIAL |
| 8 EPUB zoom | Paginated viewport disabled scaling | `user-scalable=no` | Zoom enabled and viewport-fit added | BLOCKED | typecheck/tests pass | PARTIAL |
| 9 Book Details counts | Source reviewed | Format-specific semantics need real files | Existing format logic retained | BLOCKED | corpus/parser tests only | PARTIAL |
| 10 DOCX routing/retry | Source route is DOCX-specific; prior retry risk audited | Restore/selection gaps and error lifecycle | DOCX restore/selection fixed; torture test blocked | BLOCKED | typecheck passes | PARTIAL |
| 11 EPUB opening speed/status | Lazy chapter loading exists; no timing evidence | Whole-file base64/ZIP materialization | Import cap, archive budgets, and cache reset added; profiling pending | BLOCKED | export passes | PARTIAL |
| 12 EPUB progress overlap | Footer uses safe-area bottom offset in source | Overlay can obscure content in some layouts | Bottom inset/footer handling present | BLOCKED | no screenshot | PARTIAL |
| 13 TTS voice selection | Voice list exists; persistence was absent | Process-local selected voice | Repository-backed hydration/save added | BLOCKED | typecheck/tests pass | PARTIAL |
| 14 EPUB top safe area | Android 15 edge-to-edge confirmed upstream | Content viewport did not include top inset | Paginated EPUB top/bottom padding added | BLOCKED | typecheck/export pass | PARTIAL |
| 15 Continuous EPUB chapter boundaries | Continuous mode is chapter-local WebView | Chapter transitions are separate renders | Whole-book progress tokens and scroll restoration improved; genuine whole-book continuity still pending | BLOCKED | regression/typecheck pass | PARTIAL |

## Current automated evidence

- `npm run typecheck`: PASS
- `npm test`: 45 PASS, 0 FAIL
- `npm run check:pdfjs`: PASS
- `npx expo export --platform android`: PASS
- `npm run lint`: no errors; legacy warnings remain
- Native Gradle build: BLOCKED because Java/JAVA_HOME is unavailable
- Emulator install/live UI: BLOCKED because Android SDK/adb is unavailable

No issue is marked final PASS without current observable device evidence.
