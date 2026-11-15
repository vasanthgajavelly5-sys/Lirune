# Lirune Major Release — Windows Desktop Release Readiness Report

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0` (Tag: `v6.0.0`)  
**Date**: November 15, 2026  
**Status**: APPROVED FOR PRODUCTION RELEASE

---

## 1. Production Artifacts & Integrity

- **Installer Binary**: `dist/Lirune Reader-6.0.0-Setup.exe` (and copy `dist/Lirune.Reader-6.0.0-Setup.exe`)
- **Installer Size**: 125,533,631 bytes (~119.7 MB)
- **Installer Target**: NSIS 64-bit Windows Installer (`oneClick: false`, `perMachine: false`)
- **SHA-256 Hash**: `5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5`
- **Packaged Executable**: `dist/win-unpacked/Lirune Reader.exe`
- **Launcher Validation**: `Launch-Lirune.bat --validate-only` verified executable presence and syntax (`PASS`).

---

## 2. Release Gate Verification Checklist

| Verification Gate | Command / Test | Result | Evidence |
| :--- | :--- | :---: | :--- |
| **Lint & Syntax** | `npm run lint` | **PASS** | 50 scripts & 6 modules clean |
| **Modernization** | `npm run check:modernization` | **PASS** | 0 legacy API violations |
| **Automated Tests** | `npm test` | **PASS** | 109/109 tests passed |
| **Format Catalogue** | `npm run validate:formats` | **PASS** | 100% parity across 71 format IDs |
| **Format Matrix** | `test/format-validation.test.js` | **PASS** | Validated against corrupt/mismatched buffers |
| **Zip-Slip & Bombs** | `test/archive-pipeline.test.js` | **PASS** | Strict 512MB aggregate / 64MB single entry limit |
| **Shell Launcher** | `Launch-Lirune.bat --test-dry-run` | **PASS** | Verified clean startup without taskkill |
| **Live Acceptance** | `scripts/run-windows-live-acceptance.mjs` | **PASS** | 57/57 real-world test samples (100% Pass) |
| **Reading Themes** | In-reader panels scoped CSS | **PASS** | All 15 themes tested without leakage |
| **File Associations** | Windows Registry & Shell | **PASS** | 28 extensions registered with ProgIDs |

---

## 3. Deployment & Release Gate Decision

Every mandatory release gate in the repository's Release Gate Policy has been executed and verified. Zero regressions were detected. Windows release `6.0.0` is authorized for publication.
