# Current 15-Issue Status

Date: 2026-10-02
Evidence rule: retain the prior live-session evidence in `overnight-status.md`; this resumed session reran only issues explicitly noted below.

| Issue | Reproduced/source evidence | Root cause | Fix in current tree | Live verification | Regression | Status |
|---|---|---|---|---|---|---|
| 1 Annotations flicker/loading | Concurrent focus loads were guarded | Re-entrant async hydration | In-flight guard added | PASS (prior live session; not rerun today) | hydration guard test passes | PASS |
| 2 Settings functional AQA | Source paths reviewed | Device persistence was exercised in the prior live session | Clear-data cleanup and settings paths improved | PASS (prior live session; not rerun today) | typecheck/tests pass | PASS |
| 3 Library flicker/loading | Duplicate load path reproduced in regression | Concurrent `loadLibrary` calls | Guarded store and screen | PASS (prior live session; no flicker observed) | targeted guard test passes | PASS |
| 4 Scan Phone | Direct external path scan confirmed | Scoped storage mismatch | SAF-oriented discovery path present | PASS (prior live session; not rerun today) | no current regression run | PASS |
| 5 Choose Folder root/Download | Android docs confirm platform restrictions | ACTION_OPEN_DOCUMENT_TREE restrictions | Requires UI messaging/SAF handling | BLOCKED | no device test | PARTIAL |
| 6 About outdated | Live About and drawer showed `4.0.4` while Android config/build was `4.0.5` | Hard-coded version strings drifted from Expo config | About and drawer now read `Constants.expoConfig.version` | PASS (Maestro asserts `Version 4.0.5 (Android)`; drawer screenshot confirms `v4.0.5`) | typecheck and live flow pass | PASS |
| 7 PDF bounds/quality | Source reviewed; no visual proof | WebView/canvas quality needs device inspection | Restore/thumbnails fixed; PDF remains security-upgrade candidate | BLOCKED | PDF.js check passes | PARTIAL |
| 8 EPUB zoom | Paginated viewport disabled scaling | `user-scalable=no` | Zoom enabled and viewport-fit added | BLOCKED | typecheck/tests pass | PARTIAL |
| 9 Book Details counts | Source reviewed | Format-specific semantics need real files | Existing format logic retained | BLOCKED | corpus/parser tests only | PARTIAL |
| 10 DOCX routing/retry | Source route is DOCX-specific; prior retry risk audited | Restore/selection gaps and error lifecycle | DOCX restore/selection fixed; torture test blocked | BLOCKED | typecheck passes | PARTIAL |
| 11 EPUB opening speed/status | Lazy chapter loading exists; no timing evidence | Whole-file base64/ZIP materialization | Import cap, archive budgets, and cache reset added; profiling pending | BLOCKED | export passes | PARTIAL |
| 12 EPUB progress overlap | Footer uses safe-area bottom offset in source | Overlay can obscure content in some layouts | Bottom inset/footer handling present | PASS (prior EPUB live session; not rerun today) | no current regression run | PASS |
| 13 TTS voice selection | Voice list exists; persistence was absent | Process-local selected voice | Repository-backed hydration/save added | PASS (prior EPUB live session; voice dialog tested) | typecheck/tests pass | PASS |
| 14 EPUB top safe area | Android 15 edge-to-edge confirmed upstream | Content viewport did not include top inset | Paginated EPUB top/bottom padding added | PASS (prior EPUB visual session; not rerun today) | typecheck/export pass | PASS |
| 15 Continuous EPUB chapter boundaries | Continuous mode is chapter-local WebView | Chapter transitions are separate renders | Whole-book progress tokens and scroll restoration improved; genuine whole-book continuity still pending | BLOCKED | regression/typecheck pass | PARTIAL |

## Current automated evidence

- `npm run typecheck`: PASS
- `npm test`: 45 PASS, 0 FAIL
- `npm run check:pdfjs`: PASS
- `npx expo export --platform android`: PASS
- `npm run lint`: no errors; legacy warnings remain
- Native debug Gradle build: PASS (`:app:assembleDebug`)
- Debug APK install: PASS (`adb install -r`), package `com.lirune.reader`, version name `4.0.5`
- Emulator: online, Android 15 / API 35; Metro reverse tunnel active
- Live Maestro: CBR page navigation/progress restore PASS; CBZ page navigation/progress restore PASS; About version assertion PASS
- One cold launch produced a React Native Fabric SIGSEGV; four later cold launches passed with a 60-second content wait. Cause remains unproven.

PASS entries 1, 2, 3, 4, 12, 13, and 14 retain recorded prior live evidence. Issue 6 was reverified today. PASS here does not mean all other app surfaces or the full regression have been rerun.
