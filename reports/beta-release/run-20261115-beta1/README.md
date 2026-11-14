# Lirune Live Acceptance Test Campaign

**Run Identifier:** `run-20261115-beta1`  
**Execution Timestamp:** 2026-11-14T22:25:27.196Z  
**Target Environments:**
- **Windows:** Electron 39.2.7 / Chromium 134 / Node.js 22.14.0 (Windows 11 x64)
- **Android:** Expo 52.0.46 / React Native 0.76.7 / Hermes (Android 11 / API 30 on emulator-5554)

## Corpus Overview
Testing was executed exclusively against the external real-world sample corpus at:
`C:\Users\vasanth\Downloads\Lirune_Live_Format_Tests`

- Total Test Samples: **57**
- Formats Evaluated: **23** (`mobi, doc, txt, fbz, cb7, ppt, chm, png, zip, md, cbz, docx, jpg, epub, pdf, odt, rtf, fb2, cbr, cbt, tiff, djvu, html`)
- Test Tiers: Low, Medium, High across all available formats

## Deliverables in this Run Directory
- `sample-inventory.json` & `sample-inventory.csv`: Complete inventory of all 57 real-world test samples with SHA-256 hashes.
- `windows-results.json` & `windows-results.csv`: Windows Electron acceptance results across all test phases.
- `android-results.json` & `android-results.csv`: Android emulator acceptance results across all test phases.
- `cross-platform-results.csv`: Unified cross-platform comparison matrix.
- `format-summary.md`: Format-by-format capability, layout, adapter, and quirks summary.
- `executive-summary.md`: Release-gate assessment, acceptance scorecard, and architectural status.
- `failures.md`: Detailed log of any edge cases, timeouts, or format quirks encountered.
- `fixes-applied.md`: Comprehensive technical log of all autonomous fixes applied.
- `security-results.md`: Audit confirmation of sanitization, CSP, isolated profile, and offline boundaries.
- `environment-report.md`: Hardware, operating system, and runtime execution specifications.
- `final-verification.md`: Verification of modernization baseline, format parity, and regression gates.
