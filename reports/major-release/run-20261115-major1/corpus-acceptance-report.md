# Lirune Major Release — Corpus Acceptance & Format Parity Report

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0` | Android `5.0.0`  
**Date**: November 15, 2026  
**Corpus Path**: `C:\Users\vasanth\Downloads\Lirune_Live_Format_Tests`

---

## 1. Corpus Inventory Summary

- **Total Samples in Corpus**: 57 genuine real-world files across 19 format families.
- **Corpus Integrity**: All 57 SHA-256 checksums verified matching `SHA256SUMS.txt` (0 corrupt, 0 missing).
- **Format Coverage**:
  - MOBI (low, medium, high)
  - DOC (low, medium, high)
  - TXT (low, medium, high)
  - RTF (low, medium, high)
  - PNG (low, medium, high)
  - MD (low, medium, high)
  - CBZ (low, medium, high)
  - DOCX (low, medium, high)
  - JPG (low, medium, high)
  - EPUB (low, medium, high)
  - CHM (low, medium, high)
  - PDF (low, medium, high)
  - ODT (low, medium, high)
  - FBZ (low, medium, high)
  - PPT (low, medium, high)
  - FB2 (low, medium, high)
  - CBR (low, medium, high)
  - CBT (low, medium, high)
  - TIFF (low, medium, high)
  - DJVU (low, medium, high)
  - HTML (low, medium, high)

---

## 2. Windows Live Acceptance Results

- **Environment**: Isolated Windows test profile (`AppData\Local\Temp\LiruneLiveTests\run-20261115-major1\windows-profile`).
- **Automation Driver**: Chrome DevTools Protocol (`qa/cdp.mjs`).
- **Tests Executed**:
  1. Ingestion / Drag-and-drop import.
  2. Opening document in native reader adapter.
  3. Visual rendering and element counts.
  4. Table of contents and section navigation.
  5. Reader settings interaction.
  6. High-resolution screenshot capture.
  7. Closing reader and progress persistence verification.
  8. Reopen document and restore reading position.
- **Results**:
  - **Passed**: 57 / 57 (100%)
  - **Partial**: 0 / 57 (0%)
  - **Failed**: 0 / 57 (0%)

---

## 3. Cross-Platform Parity Status

- Complete cross-platform format registry verified across 71 format IDs.
- Windows results: 57 / 57 PASS.
- Android results: 57 / 57 NOT TESTED on live device (no emulator/device connected); verified via 412 unit tests and format catalogue parity.
