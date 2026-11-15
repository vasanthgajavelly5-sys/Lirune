# Lirune Major Release — Performance & Memory Benchmarks

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0` | Android `5.0.0`  
**Date**: November 15, 2026

---

## 1. Performance Gate Verification

Performance gates were tested and validated under strict memory and throughput constraints:

### 1.1 Content Fingerprinting & SHA-256 Throughput
- **Budget**: `< 400ms` for 5,000 blocks.
- **Measured**: **24.55ms** (`PASS`).
- **Safety Margin**: 93.8% below maximum allocated budget.

### 1.2 Memory Heap Growth Under Cyclic Storage Operations
- **Budget**: `< 25MB` heap growth during 100 cyclic store/retrieve operations.
- **Measured**: **11.77MB** (`PASS`).
- **Safety Margin**: 52.9% below maximum allowable growth.

### 1.3 Document Opening Latency
- Measured across all 57 live format samples in isolated profile:
  - Average reader open time: **284ms**.
  - Fastest open: **261ms** (`md_sample_low.md`).
  - Heaviest open: **655ms** (`tiff_sample_high.tiff`).
  - No sample exceeded the 2.5s initial layout budget.

### 1.4 Rendering & Frame Rate
- Virtualized `ScrollEngineV2` maintains steady 60fps scrolling on both desktop and mobile runtimes.
- Elimination of unneeded `backdrop-filter` on badge pills resolved prior scrolling frame drops.
- Hardware-accelerated compositing (`translateZ(0)`) applied to virtualized chapter containers.
