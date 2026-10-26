# Lirune Android — Performance Baseline Report (Phase 0)

Captured on: 2026-10-27
Target Device Profile: AVD `tab_lowend` (10.1" WXGA Tablet 1280x800, Android API 30, x86_64, 3072MB RAM, 2 CPU Cores, WHPX acceleration)
App Version: Lirune Reader 4.9.1 (Debug build, Hermes JS engine)

---

## 1. Cold Start Performance (`am start -W`)

Measured across 5 consecutive cold launches (`am force-stop` followed by `am start -W -n com.lirune.reader/.MainActivity`):

| Run | Status | TotalTime (ms) | WaitTime (ms) |
|---|---|---|---|
| Run 1 (cold) | ok | 1940 | 1942 |
| Run 2 | ok | 1459 | 1462 |
| Run 3 | ok | 1381 | 1383 |
| Run 4 | ok | 1422 | 1424 |
| Run 5 | ok | 1340 | 1341 |
| **Average** | | **1508.4** | **1510.4** |
| **Median** | | **1422.0** | **1424.0** |

---

## 2. Book Open Time (Time to First Readable Text)

Measured from book open session dispatch to completion of package extraction / location generation / first WebView render:

| Book Tier | File & Size | Measured Time | Key Bottlenecks |
|---|---|---|---|
| **Small EPUB** | `alice.epub` (188 KB, 15 spine items) | **~3.6 s** | Blocking location generation runs concurrently with initial render; Hermes garbage collection paused main thread for ~350ms. |
| **Large EPUB** | `epub-long.epub` (12.4 MB, 41 spine items) | **~5.5 s** | Synchronous OPF and location generation; heavy initial DOM injection. |

---

## 3. UI Scroll Jank & Frame Times (`dumpsys gfxinfo`)

Measured during standard user interaction flings and slow drag scrolls:

| Area | Total Frames | Janky Frames | Jank % | 50th %ile | 90th %ile | 95th %ile | 99th %ile |
|---|---|---|---|---|---|---|---|
| **Reader View (Continuous Scroll v1)** | 677 | 538 | **79.47% – 96.23%** | 29 ms | 36 – 44 ms | 48 – 65 ms | 61 – 150 ms |
| **Library List (FlatList)** | 159 | 76 | **47.80%** | 22 ms | 38 ms | 57 ms | 121 ms |

---

## 4. Observations & Areas for Overhaul

1. **Reader Continuous Scroll Jank:** The v1 continuous scroll engine experiences high jank (~80-96% janky frames) on low-end hardware due to querying DOM rects during scroll, bulk chapter injection, and layout recalculations.
2. **First-Frame Startup:** White/dark flash and cold start latency (>1.5s) can be mitigated by `expo-splash-screen` synchronization, solid background color in `app.json`, and deferring background housekeeping off the critical path.
3. **Book Open Latency:** Deferring `BookLocationService` generation to idle time after first paint and caching parsed EPUB spine/TOC data will drastically cut open time.
4. **Library Scrolling:** `BookCard` memoization, optimized FlatList rendering batches, and 400px cover thumbnail generation will cut library jank.
