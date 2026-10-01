# Lirune Reader Architecture Remediation Plan

Date: 2026-10-01

## Guiding Decision

Do not rewrite stable reader surfaces or upgrade Expo/RN merely for recency. Remediate trust boundaries, bounded resource use, async ownership, and evidence quality first. Keep Expo SDK 57/RN 0.86 for the current release line; evaluate SDK 58 only after it becomes stable and a compatibility branch exists.

## Workstreams

### 1. Security and content isolation

- Introduce one structural document sanitizer for all generated reader HTML.
- Remove scripts, event attributes, forms, frames, unsafe schemes, external resources, and active SVG content from imported documents.
- Apply `READER_WEBVIEW_PROPS` to every engine and add CSP to generated HTML.
- Keep bridge scripts separate from document content and use message schemas with bounded payloads.
- Add malicious HTML/EPUB/DOCX/CHM fixtures.

### 2. Storage/import/SAF

- Use DocumentPicker/SAF as the primary path; direct path scanning becomes an explicitly best-effort capability.
- Persist folder URI permissions where native support permits and validate them on startup.
- Resolve display name and MIME from the provider before extension fallback.
- Add file-size, archive-entry, decompressed-size, image-size, and chapter-count budgets.
- Hash copied content for duplicate detection; never use title similarity as the sole identity.

### 3. Reader session and persistence

- Add a reader-session controller with monotonically increasing request IDs and cancellation/ignore-stale semantics.
- Make route book ID the source of truth and make `openBook` idempotent.
- Debounce progress updates in the UI layer, serialize repository writes per book, and flush on exit/background.
- Store TTS voice preference through the settings repository.

### 4. EPUB engine

- Parse container/OPF/manifest/spine with bounded XML handling and normalized ZIP paths.
- Keep lazy chapter loading and bounded adjacent-chapter prefetch.
- Build a single continuous document model where chapter boundaries are explicit sections in one scrollable WebView, while preserving chapter identity for progress/TOC.
- Use sanitized resource inlining or a controlled local asset scheme; do not expose arbitrary file access.
- Preserve CFI/scroll restoration and add tests for EPUB2, EPUB3, anchors, images, SVG, fonts, malformed archives, and large chapters.

### 5. Android configuration/release

- Remove MANAGE_EXTERNAL_STORAGE, legacy read/write, media, and SYSTEM_ALERT_WINDOW unless a demonstrated feature requires them.
- Configure explicit backup/data-extraction exclusions for private books and annotations.
- Replace debug release signing with a documented CI/Play App Signing contract; never commit secrets.
- Generate native configuration from one source and validate merged manifest in CI.

### 6. Evidence and QA

- Split parser/corpus tests from Android E2E tests.
- Every PASS must identify a device/emulator, build hash, test steps, and observable assertion.
- Add Maestro/Appium or equivalent flows for the 15 issues, settings persistence, import torture cases, and representative 18-format matrix.
- Block release when emulator tooling or required artifacts are missing instead of converting to PASS.

## Sequence

1. Complete audit and report artifacts.
2. Add sanitizer and WebView policy tests; then migrate all engines.
3. Remove permission/release-signing hazards with a native build check.
4. Add import/resource budgets and SAF metadata handling.
5. Add reader session/progress serialization.
6. Improve EPUB continuous model and resource handling.
7. Add/execute emulator E2E flows.
8. Rebuild, install, live-test, fix, and repeat.
9. Perform second code review and update final reports.

## Deferred Upgrade Decisions

- **Expo SDK 58 beta:** reject for production; violates the request to avoid pre-release adoption.
- **React Native 0.87:** defer; requires Node 22, AGP 9, Kotlin 2.0+ and likely Expo alignment.
- **react-native-webview 14/15/16:** defer until a dedicated migration; upstream releases include Android API and New Architecture changes.
- **pdfjs-dist 6.x:** investigate in a security branch because the current 3.11.x line is covered by a high advisory, but do not upgrade without regenerated assets and PDF corpus regression.
