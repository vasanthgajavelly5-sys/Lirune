# Testing & CI/CD Guide — Lirune Reader

This document outlines the testing architecture, local execution commands, performance budgets, and CI/CD pipelines for Lirune Reader.

---

## 1. Test Architecture & Layers

Lirune Reader utilizes a layered, deterministic testing strategy:

```
┌────────────────────────────────────────────────────────┐
│                   E2E & Format Tests                   │
│   (Live Format Adapters, Settings QC, CDP Headless)    │
├────────────────────────────────────────────────────────┤
│                 Performance Benchmarks                 │
│      (Startup, 10k Parse, Archive, Heap Stability)     │
├────────────────────────────────────────────────────────┤
│                   Integration Tests                    │
│   (IPC Contracts, Storage Persistence, Archive Safety) │
├────────────────────────────────────────────────────────┤
│                       Unit Tests                       │
│    (Settings Model, Format Signatures, Sanitization)   │
└────────────────────────────────────────────────────────┘
```

### 1.1 Unit Tests (`test/unit/` & `test/*.test.js`)
- **Execution:** Pure Node.js built-in runner (`node --test`).
- **Scope:** Pure logic, algorithms, default schemas, boundary clamping, and input validation:
  - `test/unit/settings-model.test.js`: Schema defaults, range clamping, reading profiles, per-book overrides.
  - `test/unit/format-detection.test.js`: Magic byte signatures, ZIP container disambiguation (EPUB vs DOCX vs ODT vs FBZ vs CBZ), edge cases (empty, truncated, and misnamed files).
  - `test/unit/document-sanitization.test.js`: Active tag stripping (`<script>`, `<object>`, `<iframe>`, `<svg>`), inline handler removal (`onerror`, `onclick`), protocol exploit defense, cover URL validation.
  - `test/unit/layout-calculations.test.js`: Auto column calculation logic, WCAG AA theme contrast ratios.
  - Existing suite: 75 foundational tests across storage contracts, TOC, typography, and hardening.

### 1.2 Integration Tests (`test/integration/`)
- **Execution:** Pure Node.js built-in runner with real filesystem & mock Electron boundaries.
- **Scope:** Component contracts and persistence pipelines without bypassing actual logic:
  - `test/integration/ipc-contracts.test.js`: Complete 1:1 parity between `preload.js` invoke/send calls and `main.js` handlers; sender authorization against untrusted origins; one-time token lifecycle.
  - `test/integration/storage-persistence.test.js`: Real disk storage in isolated temp directories, SHA-256 content addressability, deduplication, tamper detection, and extension allowlisting.
  - `test/integration/archive-pipeline.test.js`: Synthetic archive extraction, noise filtering (`.DS_Store`, `Thumbs.db`), Zip Slip directory traversal blocking, and decompression bomb limit enforcement.

### 1.3 End-to-End Tests (`test/e2e/`)
- **Execution:** Live Electron instance controlled via Chrome DevTools Protocol (`qa/cdp.mjs`).
- **Profile Isolation & Safety:** Each run creates a unique, isolated temporary profile directory (`lirune-qa-profile-XXXXXX`). Shared directories such as `.qa-userdata` and user-specified `LIRUNE_USER_DATA` are never deleted or modified. Early process exits are caught with full stdout/stderr diagnostic reporting.
- **Test Suites:**
  - `test/e2e/smoke.mjs`: App bootstrap, core globals, app theme switching (`light` <-> `dark`), accent color application, quick/full settings toggle, synthetic document rendering, clean shutdown.
  - `test/e2e/format-e2e.mjs`: Adapter-level execution of representative formats (TXT, HTML, FB2, DOCX, ODT, RTF, MD, FBZ, CBZ) through their actual reader adapters with observable typography, zoom, alignment, and theme rendering (does not simulate the full import-to-library-to-reader user flow).
  - `test/e2e/format-matrix.mjs`: Capability matrix schema inspection.

### 1.4 Performance Benchmarks (`test/perf/benchmark.mjs`)
- **Execution:** Controlled multi-iteration benchmarking with statistical reporting (min, max, median, spread).
- **Enforced Regression Gates:**
  - **Cold App Startup:** < 8,000ms.
  - **Large Document Parse (10,000 lines):** Median < 700ms across 5 runs.
  - **Application Archive Pipeline (`BookFormat.detect`):** Median < 400ms across 5 runs.
  - **Memory Growth Budget:** Net heap growth < 40MB across 10 repeated document mount/destroy cycles.
- **Diagnostics (Non-Enforced):**
  - Theme switching latency across 14 themes reported for contributor reference.

---

## 2. Running Tests Locally

| Command | Layer / Purpose | Typical Duration |
|---|---|---|
| `npm test` | All Unit & Integration tests | ~600ms |
| `npm run test:unit` | Pure logic and unit tests only | ~450ms |
| `npm run test:integration` | Component and persistence integration tests | ~150ms |
| `npm run test:e2e:smoke` | Fast live Electron CDP smoke test | ~1.5s |
| `npm run test:e2e:formats` | Adapter-level format & settings tests | ~2.0s |
| `npm run test:e2e:matrix` | Settings × Format capability matrix inspection | ~1.5s |
| `npm run test:perf` | Performance benchmark and regression checks | ~3.5s |
| `npm run test:all` | Complete test suite (Unit + Integration + E2E + Perf) | ~9.0s |
| `npm run lint` | Syntax check on all scripts | ~2.0s |
| `npm audit` | Full production and dev dependency vulnerability audit | ~1.0s |
| `npm run pack` | Local unsigned Windows directory build verification | ~25s |

---

## 3. Settings × Format Matrix & Coverage Status

| Format | Layout Class | Typography | Alignment | Columns (Auto/1/2) | Themes | Zoom | Live E2E Tested |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **EPUB** | Reflowable | Supported | Supported | Supported | Supported | Supported | Tested in `qa/suite-formats-reader.mjs` |
| **PDF** | Fixed Canvas | Inapplicable* | Inapplicable* | Inapplicable* | Supported (CSS) | Supported | Tested in `qa/suite-formats-reader.mjs` |
| **TXT** | Reflowable | Supported | Supported | Supported | Supported | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **HTML** | Reflowable | Supported | Supported | Supported | Supported | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **FB2** | Reflowable | Supported | Supported | Supported | Supported | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **DOCX** | Reflowable | Supported | Supported | Supported | Supported | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **ODT** | Reflowable | Supported | Supported | Supported | Supported | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **RTF** | Reflowable | Supported | Supported | Supported | Supported | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **MD** | Reflowable | Supported | Supported | Supported | Supported | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **FBZ** | Reflowable | Supported | Supported | Supported | Supported | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **CBZ** | Image Archive | Inapplicable* | Inapplicable* | Inapplicable* | Supported (UI) | Supported | **Verified Live** (`test/e2e/format-e2e.mjs`) |
| **MOBI** | Reflowable | Supported | Supported | Supported | Supported | Supported | Verified via format signature & parser |
| **CBR** | Image Archive | Inapplicable* | Inapplicable* | Inapplicable* | Supported (UI) | Supported | *Coverage Gap: Requires RAR unrar wasm* |
| **DOC** | Reflowable | Supported | Supported | Supported | Supported | Supported | *Coverage Gap: Requires binary OLE fixture* |
| **CHM** | Reflowable | Supported | Supported | Supported | Supported | Supported | *Coverage Gap: Requires binary ITSF fixture* |
| **DJVU** | Reflowable | Supported | Supported | Supported | Supported | Supported | *Coverage Gap: Requires binary IFF fixture* |

*\*Note: Fixed and image formats (PDF, CBZ, CBR) do not expose typography or column reflow because their layout is fixed or image-based. Zoom and theme adaptations apply cleanly.*

---

## 4. Dependency Security Audit (`npm audit`)

### Advisory & Override Details
- **Advisory:** `GHSA-g3hv-75wg-m249` (moderate severity ReDoS in `minimatch` via globparts amplification).
- **Affected Range:** `>=7.0.0 <11.0.1`.
- **Location:** Dev dependency path `electron-builder -> app-builder-lib -> @electron/universal -> minimatch`.
- **Runtime Exposure:** Zero. This is purely a build-time packager dependency and is never included in the application bundle.
- **Fix:** In `package.json`, added override:
  ```json
  "overrides": {
    "@xmldom/xmldom": "^0.8.15",
    "minimatch": "^11.0.8"
  }
  ```
- **Verification:** Both full `npm audit` and `npm audit --omit=dev` report `0 vulnerabilities`.

---

## 5. CI/CD Workflows (`.github/workflows/`)

### 5.1 Main Pull Request & Push Gate (`ci.yml`)
- **Triggers:** Pull requests and pushes targeting `main`, `master`, `lirune-store-home`, and `android`.
- **Desktop Job (`validate-desktop`):**
  - **Runner:** `windows-latest`
  - **Checks:** `npm ci`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e:smoke`, `npm run test:e2e:formats`, `npm run test:e2e:matrix`, `npm run test:perf`, `npm audit`, `npm run validate:corpus`, `npm run validate:release:config`, `npm run pack`.
  - **Permissions:** `contents: read`
- **Mobile Job (`validate-mobile`):**
  - **Runner:** `ubuntu-latest` (React Native / Android checks).

### 5.2 Release & Package Verification (`package-validation.yml`)
- **Triggers:** Weekly scheduled run or manual `workflow_dispatch`.
- **Scope:** Builds and validates unsigned test artifacts (NSIS `.exe` and Store `.appx`) without claiming Store certification or submission:
  1. `npm run dist:win` -> `npm run validate:release`
  2. `npm run dist:store` -> `npm run validate:release:store`
  3. Records SHA-256 artifact checksums for diagnostic logs.
