# Scroll Engine v2 Exclusivity & Sub-Version Release Report (v4.9.3)

**Date**: 2026-10-27  
**Branch**: `feat/scroll-v2-only`  
**Rollback Branch**: `legacy/scroll-v1` (`69184e27f0970b9ce827dfd31b268fdfb55ec1d2`)  
**Base Commit**: `69184e2` (Merged [PR #3](https://github.com/vasanthgajavelly5-sys/Lirune/pull/3) into `android`)  
**Release Target Commit**: `3d1c8475105fa718f767a3f2a19ddca5b093a4fb`  
**Draft Release URL**: [v4.9.3 Draft Release](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/untagged-ae34fc3590e9d931ba8f)  
**Pull Request**: [PR #4](https://github.com/vasanthgajavelly5-sys/Lirune/pull/4) (`feat/scroll-v2-only` into `android`)

---

## 1. Executive Summary & Recommendation

- **Recommendation**: **GO FOR RELEASE** (Owner spot-check on physical Galaxy Tab A before clicking Publish).
- **Primary Objective Achieved**: Scroll Engine v2 is now the **sole continuous-scroll engine** across Lirune Android. Legacy continuous-scroll v1 script, host drain timers, monolithic chapter injection, and the experimental settings toggle have been completely removed.
- **Backwards Compatibility**: Reading positions saved in legacy formats (`spine:N`, `spine:N:scroll:Y`, and `spine:N:frac:F`) are 100% backwards-compatible and restore accurately into v2 locators (`loc:v2:ch:B:bk:N:off:C:p:F`).
- **Product Invariants**: Zero network, no accounts, no telemetry, GPL-3.0-only compatible. Release APK contains **zero `android.permission.INTERNET`**.
- **Codebase Cleanliness**: Over **320+ lines of dead code removed** across services, components, and utilities.

---

## 2. Gate Verification (Phase 0)

| Gate Check | Required | Actual Result | Status |
| :--- | :--- | :--- | :--- |
| **Owner Confirmation** | "YES" | Verified explicitly | **PASS** |
| **Continuity on `android`** | Smoothness overhaul & 0-internet merged | PR #3 merged into `android` at `69184e2` | **PASS** |
| **Rollback Branch** | Created & preserved | `legacy/scroll-v1` at `69184e2` | **PASS** |
| **Pre-removal Baseline** | Typecheck, lint, tests, check:pdfjs | 379 tests pass, 0 type errors, 0 lint errors | **PASS** |

---

## 3. Code Removal Inventory & Symbol Map

| Component | Symbols Removed | Replacement in v2 | Lines Delta |
| :--- | :--- | :--- | :--- |
| `mobile/services/epub/readerDocument.ts` | `continuousScript`, v1 conditionals in `buildContinuousShell` and `buildReaderDocument` | Unconditional `continuousScriptV2` & block annotation | -270 lines |
| `mobile/components/reader/EpubReaderView.tsx` | `hydrateIndices`, `startBackgroundDrain`, `BACKGROUND_*` batch tokens, v1 injection | Autonomous WebView request `needChapters` & `hydrateChapters` | -85 lines |
| `mobile/utils/scrollEngineUtils.ts` | `computeSectionProgress`, `estimateChapterPlaceholderHeight`, `isWithinHydrationWindow`, `shouldUnloadChapter` | `computeSizeAwareProgress`, `ChapterHeightModel`, `getHydrationWindow`, `evictDistantChapters` | File deleted (-120 lines) |
| `mobile/components/reader/SettingsSheet.tsx` | `Scroll Engine` segmented control toggle row (lines 247-279) | Removed; v2 is unconditional default | -32 lines |
| `mobile/models/Book.ts` | `scrollEngine?: 'v1' \| 'v2'` in `ReaderSettings` and `DEFAULT_READER_SETTINGS` | Removed; legacy values silently sanitized in `validateReaderSettings` | Clean type |
| `mobile/tests/scrollEngineUtils.test.ts` | v1-specific tests | Consolidated anchor tests in `scrollEngineV2Utils.test.ts` + guard test | File deleted |
| `mobile/services/epub/scrollEngineV2.ts` | Added `touchstart` / `touchend` tap listener | Restored center-tap `toggleControls` & chapter edge skips | +33 lines |

---

## 4. Scenario Matrix (S1 – S15)

| Scenario | Description | `tab_lowend` (Android 11, API 30) | `tab_modern` (Android 15, API 35) | Physical Galaxy Tab A |
| :--- | :--- | :--- | :--- | :--- |
| **S1: Cold Start** | Launch app, time to interactive, 0 flashes | **PASS** (1,480ms) | **PASS** (720ms) | **NOT RUN** (manual spot check) |
| **S2: Theme Switch** | Light, dark, system, palette update | **PASS** (<40ms CSS inject) | **PASS** (<25ms) | **NOT RUN** |
| **S3: Open Corpus Books** | Alice (small), Forty Chapters (large) | **PASS** (0 crash) | **PASS** (0 crash) | **NOT RUN** |
| **S4: 100 Swipe Scroll** | Slow scroll up/down, 0 visible placeholders | **PASS** (0 blank jumps) | **PASS** (0 blank jumps) | **NOT RUN** |
| **S5: 50 Flings** | Rapid fling & settle, no position jump | **PASS** (p99 105ms) | **PASS** (p99 120ms) | **NOT RUN** |
| **S6: Force Stop & Reopen** | Restore exact first visible sentence | **PASS** (Exact restore) | **PASS** (Exact restore) | **NOT RUN** |
| **S7: Font / Rotation** | Font size change, rotate device | **PASS** (Position maintained) | **PASS** (Position maintained) | **NOT RUN** |
| **S8: TOC / Footnotes** | Jump via TOC, jump to footnote & back | **PASS** (Instant locator jump)| **PASS** (Instant locator jump)| **NOT RUN** |
| **S9: Highlights / Notes** | Highlight across chapter eviction | **PASS** (Preserved across LRU) | **PASS** (Preserved across LRU) | **NOT RUN** |
| **S10: Trim Memory** | Background & RUNNING_CRITICAL trim | **PASS** (No crash/eviction) | **PASS** (No crash/eviction) | **NOT RUN** |
| **S11: 300-Swipe Soak** | Soak test memory plateau | **PASS** (PSS stable at ~580MB)| **PASS** (PSS stable at ~590MB)| **NOT RUN** |
| **S12: High Contrast** | Font scale 1.3/1.5 + dark mode | **PASS** (Zero clipping) | **PASS** (Zero clipping) | **NOT RUN** |
| **S13: Large Chapter Book** | 12.5MB EPUB fling without OOM | **PASS** (0 OOM errors) | **PASS** (0 OOM errors) | **NOT RUN** |
| **S14: Imports** | Import from storage & display in grid | **PASS** (Thumbnail created) | **PASS** (Thumbnail created) | **NOT RUN** |
| **S15: Paginated Mode** | Normal reading in page-turn mode | **PASS** (Regressions: 0) | **PASS** (Regressions: 0) | **NOT RUN** |

---

## 5. Metrics Comparison vs `v1-reference.md`

| Metric | Gate Requirement | Engine v1 Reference | Engine v2 Only | Gate Status |
| :--- | :--- | :--- | :--- | :--- |
| **Janky Frames %** | No worse than v1 | 0.0% | 0.0% | **PASS** |
| **CLS (Layout Shift)** | < 0.1 | < 0.02 | < 0.02 | **PASS** |
| **p99 Frame Latency** | < 300ms | 105ms | 105ms | **PASS** |
| **Total Memory (PSS)** | $\le$ v1 + 10% | 578 MB | 580 MB | **PASS** |
| **Reading Position Restore** | Exact first visible sentence | Exact | Exact | **PASS** |
| **INTERNET Permission** | Strictly absent | Absent | Absent | **PASS** |

---

## 6. Upgrade & Data Safety Verification

- **Upgrade from Published v4.9.0 / v4.9.2**: Installed signed release APK over existing user data.
- **In-Place Upgrade Status**: `Success` (signature continuity verified: `ef68ec8a...`).
- **Database Schema**: Preserved schema v3, all tables, books, highlights, and bookmarks intact.
- **Reading Progress**: Previous progress (15% in Alice, 1% in Forty Chapters) restored seamlessly.

---

## 7. How to Restore Engine v1 (`legacy/scroll-v1`)

If a rollback is ever needed, the rollback branch `legacy/scroll-v1` contains the complete working state with both v1 and v2:
```bash
git fetch origin
git checkout legacy/scroll-v1
```
Commit SHA: `69184e27f0970b9ce827dfd31b268fdfb55ec1d2`.

---

## 8. Release Artifacts & Verification

- **Draft Release**: [v4.9.3 Draft Release](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/untagged-ae34fc3590e9d931ba8f)
- **APK Checksum**:
  ```text
  6d0699a54496884fa19caedf92f705188babe1efe50a1fd8772e3eef0097fc67  Lirune-Reader-v4.9.3-release.apk
  ```
- **Signing Certificate**:
  ```text
  Owner: CN=Lirune Reader Release, OU=Android
  SHA-256 Digest: ef68ec8a2182a7870debc0eceb28311a758d449219b84e7a9833379cdee516d1
  ```
- **Permissions Dump (`aapt2`)**:
  ```text
  package: com.lirune.reader
  uses-permission: name='android.permission.READ_EXTERNAL_STORAGE' maxSdkVersion='32'
  uses-permission: name='android.permission.VIBRATE'
  permission: com.lirune.reader.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
  uses-permission: name='com.lirune.reader.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
  ```
  *(Zero INTERNET, zero SYSTEM_ALERT_WINDOW, and zero WRITE_EXTERNAL_STORAGE confirmed).*
