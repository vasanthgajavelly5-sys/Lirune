# Lirune Reader Android Code Audit

Date: 2026-10-01
Branch: `android`
HEAD at audit: `79b1de6`
Scope: `mobile/` source, native Android configuration, tests, reports, and build scripts.

## Executive Result

The recovered application is not release-clean. The source contains fixes for hydration, reader position, import cleanup, EPUB layout, shared document sanitization, progress serialization, and least-privilege configuration, but older QA reports overstate device coverage. The highest-risk remaining issues are unbounded archive/base64 parsing, the vulnerable vendored PDF.js line, release-signing validation, and missing live emulator evidence.

## Findings

### Critical

1. **Document trust boundary required remediation.** All inspected HTML-producing engines now use the shared sanitizer and restrictive WebView props, but the sanitizer is dependency-free and still requires malicious-device testing.
2. **Release signing requires external credentials and validation.** `mobile/android/app/build.gradle` no longer assigns the debug key to release, but no configured release keystore exists in this environment.

### High

3. **Whole-file base64 and archive materialization are used broadly.** EPUB, PDF, office, comic, and archive paths load complete files and often maintain several decoded representations. A 512 MB import cap now exists, but decompressed-size, chapter-count, and image-size budgets remain incomplete.
4. **Parser matrix is now explicitly non-live.** `runtimeCorpusMatrix.test.ts` labels UI dimensions `NOT_RUN (Parser Matrix)` instead of claiming Android behavior. Real E2E evidence is still absent.
5. **Scan Phone relies on direct external paths.** `search.tsx` probes `/storage/emulated/0` paths despite scoped-storage/SAF restrictions and without a guaranteed permission model.
6. **Progress writes are not globally coalesced or serialized.** `readerStore.updateProgress` persists on every engine callback. Several WebViews emit from scroll listeners. Out-of-order writes can regress position and cause jank.
7. **Reader open/source resolution has competing async ownership.** Root intent handling, tabs, annotations, and `reader.tsx` can all open or resolve a book. There is no session request generation or cancellation contract.
8. **Native privacy configuration is now narrowed in source.** Broad storage/media/network/overlay permissions were removed and backup disabled, but the final merged manifest has not been independently validated because native tooling is unavailable.
9. **Parser and archive limits are incomplete.** Regex-based XML/HTML handling and archive extraction lack consistent expansion, input, and output budgets.

### Medium

10. TTS voice selection is repository-backed and persisted in the current tree; device restart verification is blocked.
11. Web annotation aggregation has platform-specific empty fallbacks.
12. Library preference writes are fire-and-forget and may reorder.
13. Extensionless content URIs may fall back to EPUB routing without reliable MIME/display-name resolution.
14. Duplicate detection relies on heuristic title/size matching and can produce false positives.
15. Expo configuration and committed native configuration drift (`app.json` plugins/permissions versus native files).
16. Reports and version metadata are stale relative to the current dirty worktree.

## Existing Strengths

- Zustand stores are relatively small and understandable.
- App-private copy is the correct durability baseline for imported files.
- EPUB path normalization and PDF inline-script escaping have focused regression tests.
- WebView navigation policy exists and correctly blocks external schemes for consumers that use it.
- The current source has a duplicate hydration guard and a targeted regression test.

## Audit Validation

- `npm run typecheck`: passed during the current audit cycle.
- `npm test`: current suite passed 44 tests in the current engineering cycle.
- `npm run lint`: no errors; warnings remain in unrelated/legacy files.
- `npm run check:pdfjs`: passed.
- `npx expo export --platform android`: passed.
- Android live validation: BLOCKED. `adb` is not on PATH and neither `ANDROID_HOME` nor `ANDROID_SDK_ROOT` is configured.

## Required Remediation Order

1. Add bounded archive/resource handling and migrate the vulnerable PDF.js line.
2. Validate the narrowed manifest and CI/Play-App-Signing contract with native tooling.
3. Add session identity and cancellable source resolution.
4. Replace parser-only dimensions with observable emulator tests.
7. Reconcile Expo/native configuration and regenerate/inspect the merged manifest.
8. Repeat all 15 issue checks and 18-format checks on the real emulator.
