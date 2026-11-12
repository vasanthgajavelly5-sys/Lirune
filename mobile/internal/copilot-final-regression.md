# Final Regression Report

Date: 2026-10-01
Branch: `android`

## Automated checks

| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | PASS |
| Node regression suite (`npm test`) | PASS: 45/45 |
| PDF.js generated asset check | PASS |
| Expo Android export | PASS |
| ESLint | PASS with 7 warnings, 0 errors |
| Native Gradle debug build | BLOCKED: Java/JAVA_HOME unavailable |
| Android install/emulator | BLOCKED: adb/Android SDK unavailable |
| GPU visual QA | BLOCKED |
| 18-format live matrix | BLOCKED |
| 15-issue live acceptance | BLOCKED |

## Changes included in this cycle

- Hydration guard for library/annotation loading loops.
- Shared dependency-free document sanitizer and security policy migration across HTML-producing readers.
- EPUB retry, restore gating, scroll progress, zoom, and safe-area handling.
- PDF restore queue and canonical thumbnail page positions.
- DOCX restore and selection/TTS wiring.
- TTS chapter-content input and persisted voice selection.
- Serialized/coalesced reading-progress writes.
- Import-size limit and failed-copy cleanup.
- EPUB archive entry/expansion/compression budgets.
- SAF-oriented manifest permissions and disabled Android backup.
- Release signing no longer falls back to the debug keystore.
- Current Phase A-E and acceptance reports.

## Residual blockers

1. Install a supported JDK and configure `JAVA_HOME`.
2. Configure Android SDK platform-tools/emulator and launch the API 35 NVIDIA GPU image.
3. Run build/install/live UI tests and capture screenshots/logs.
4. Replace the current PDF.js vulnerable line through a controlled major upgrade or documented compensating control.
5. Complete continuous multi-chapter EPUB rendering and bounded archive/resource parsing.
6. Resolve dictionary/font provenance and correct the mobile license/notice arrangement.

The project must not be declared release-complete until these device and provenance blockers are resolved or explicitly accepted by the release owner.
