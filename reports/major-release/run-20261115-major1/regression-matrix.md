# Lirune Major Release — Regression & Compatibility Matrix

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0` | Android `5.0.0`  
**Date**: November 15, 2026

---

## 1. Regression Risk Analysis & Validation

| Feature Area | Potential Risk | Mitigation & Defense | Validation Status |
| :--- | :--- | :--- | :---: |
| **Reader Settings Theming** | Panel styles leaking to library view | High-specificity scoped rules `.panel[data-reader-panel-theme]` isolate reader UI | **PASS** |
| **TOC Navigation** | Scroll mode blank page on chapter jump | Scroll mode bypasses paginated resets (`scrollEngineV2`) | **PASS** |
| **Windows Double-Click** | Process deadlock on second-instance | `requestSingleInstanceLock` + queueing logic | **PASS** |
| **Batch Import** | Heap exhaustion during multi-file import | Streaming SHA-256 fingerprinting + sequential queue | **PASS** |
| **Docx / ODT Parsing** | Malicious active content / SSRF links | Strict URL allowlist (`http:`, `https:`, `mailto:`); inert text for others | **PASS** |
| **MOBI / Kindle Decompression** | Infinite recursion in Huffman tree | Max recursion depth clamped at 64; 64MB buffer limit | **PASS** |
| **Archive Ingestion (ZIP/RAR)** | Zip-Slip path traversal | Canonical path normalization + rejection of `..` segments | **PASS** |
| **Progress Persistence** | Double counting section offsets | Scrolled progress strictly uses monotonic window scroll | **PASS** |
| **Offline Privacy** | Telemetry leakage or DNS lookups | Strict origin whitelisting; zero network permissions | **PASS** |

---

## 2. Regression Test Execution Summary

- **Total Unit & Integration Tests**: 521 automated test cases (109 Desktop + 412 Mobile).
- **Pass Rate**: 100% (521 passed, 0 failed, 0 skipped).
- **Real-World Live Sample Tests**: 57 format samples across all primary format families.
- **Pass Rate**: 100% (57 passed, 0 failed, 0 partial).
