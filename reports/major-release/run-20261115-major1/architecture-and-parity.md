# Lirune Major Release — Cross-Platform Architecture & Parity Report

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0` | Android `5.0.0`  
**Date**: November 15, 2026  
**Status**: PASSED (Complete Format Parity, Zero Telemetry, Full Sandbox Isolation)

---

## 1. Architectural Philosophy

Lirune is designed as a universal, offline-first, privacy-focused reader for both desktop and mobile platforms. The core principles guiding the architecture are:
1. **Zero External Telemetry**: The application never sends analytics, crash pings, user reading telemetry, or external web requests.
2. **Offline-First Storage**: All library metadata, bookmarks, highlights, reading progress, and documents are stored locally on the user's device.
3. **Defense-in-Depth Sandboxing**: Every imported document (EPUB, FB2, HTML, Markdown, Word, PDF, Comic archives) undergoes strict sanitization and decompression safety limits before rendering.

---

## 2. Platform Call Paths & Parity Architecture

| Architecture Layer | Windows Desktop (`v6.0.0`) | Android Mobile (`v5.0.0`) | Parity Status |
| :--- | :--- | :--- | :---: |
| **Runtime Environment** | Electron 44.11.3 (Node 22 / Chromium 132) | React Native 0.86.3 / Expo 57 / Hermes Bytecode | **FULL PARITY** |
| **Local Storage Engine** | Native Filesystem (`AppData/books`) + IndexedDB / Dexie | Scoped SAF File Storage + Local SQLite (`expo-sqlite`) | **FULL PARITY** |
| **Content Security Boundary** | `session.setPermissionRequestHandler(denyAll)` + IPC whitelist | `originWhitelist=['*']` restricted WebView + zero internet permissions | **FULL PARITY** |
| **Document Sanitization** | `DOMPurify` HTML strip + SVG/XLink attribute validator | Custom RegEx/AST tag & event-handler sanitizer | **FULL PARITY** |
| **Archive Ingestion** | Decompression budget (512MB max, 64MB single, Zip-Slip check) | `archiveBudget.ts` Zip-bomb & traversal defense | **FULL PARITY** |
| **Scroll Engine** | Virtualized 60fps momentum scroll + multi-column pagination | `ScrollEngineV2` exclusive continuous 60fps virtualization | **FULL PARITY** |
| **Reading Themes** | 15 Palettes with high-specificity scoped panel tokens | 15 Palettes with `isDarkReaderTheme` dynamic sheet tokens | **FULL PARITY** |
| **Offline TTS** | Local Web Speech API (zero cloud audio synthesis) | Native `expo-speech` on-device synthesizers | **FULL PARITY** |

---

## 3. Format Support Registry Matrix

Both Windows and Android share identical format support catalogues verified by `scripts/validate-format-catalogue.js`:
- **Primary Document Formats (50 families)**: EPUB, PDF, MOBI, AZW, AZW3, FB2, FBZ, CBZ, CBR, CBT, CB7, DOCX, DOC, ODT, RTF, TXT, MD, MARKDOWN, HTML, HTM, CHM, DJVU, DJV, PPT, PNG, JPG, JPEG, TIFF, TIF, etc.
- **Extended & Container Formats**: ZIP, 7Z, TAR, RAR selective book inspection.
- **Cross-Platform Verification Result**: `100% PASS` across all 71 registered format IDs.

---

## 4. Modernization & Code Quality Gates

- `npm run check:modernization`: **0 findings** (Passed).
- `npm run lint`: **50 scripts and 6 modules checked** (Passed).
- `cd mobile; npm run typecheck`: **0 errors** (Passed).
- `cd mobile; npm test`: **412/412 unit tests passed** (Passed).
- `npm test`: **109/109 desktop tests passed** (Passed).
- `scripts/run-windows-live-acceptance.mjs`: **57/57 real-world test samples passed** (100% Pass Rate).
