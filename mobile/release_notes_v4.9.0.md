# Lirune Reader v4.9.0 (Android) — Reader Engine Upgrade, Typography Suite & Store Hardening

## Highlights & Upgrades in v4.9.0

### 1. Reader Engine Theme Cascade & Publisher Override Architecture
- Resolved publisher EPUB CSS stylesheet priority conflicts (e.g. Project Gutenberg `pgepub.css`, `body.tei.tei-text`, Calibre classes) where publisher stylesheets previously forced `#ffffff` / `#000000` text rendering.
- Implemented `readerThemeOverrideCss()` injected with high-priority `!important` cascading rules into `#reader-css`.
- Synchronized reader background, text, and headings across all reading palettes (**Sepia**, **Night**, **Pure Black**, **Paper**, **High Yellow**, **Deep Navy**, **Soft Forest**).
- Real-time stylesheet synchronization across EPUB, PDF, MOBI, FB2, DOCX, and HTML viewers.

### 2. Typography Suite & Categorized Font Selection
- Integrated 16 freely usable / SIL Open Font License reading typefaces:
  - **Serif:** Cormorant, Merriweather, Literata, Lora, EB Garamond, Source Serif, Vollkorn, Alegreya
  - **Sans:** Modern Sans, Inter, Roboto, Work Sans
  - **Slab Serif:** Bitter, Rokkitt
  - **Dyslexic / Accessibility:** OpenDyslexic
- Implemented a compact **"More Fonts (16 available)..."** selector button in the appearance sheet.
- Added a full-screen bottom modal with category filters (**All**, **Serif**, **Sans**, **Slab**, **Dyslexic**), font descriptions, and open license transparency.

### 3. Safe-Area Modal Boundary & Display Cutout Hardening
- Appearance and settings sheets now strictly respect top and bottom display safe-area boundaries (`insets.top + 4`, `insets.bottom + 4`).
- Eliminated sheet bleeding into device punch-hole cutouts and Android system navigation bars.
- Applied floating card aesthetics with `borderRadius: 20` and unified theme backdrop colors.

### 4. Dynamic File Discovery Filtering & Real-Time Count Accuracy
- File discovery counts (`X of Y found`, `Select All New (X)`, `Import Selected (X)`) now dynamically recalculate in real-time as format filter chips (EPUB, PDF, Kindle, FB2) and search filters are toggled.
- Android Storage Access warning automatically dismisses once full SAF storage permission has been granted.

### 5. Community & Creator Support Card
- Added the official **Support the Project** card in the About screen.
- Features a **Buy Me a Coffee** button directly linking to `https://buymeacoffee.com/vasanthgajavelly` matching repository funding specifications.

### 6. Cover Artwork Stability & Library Cache
- Resolved cover image error reset state in `BookCard.tsx`, preventing broken artwork placeholder glitches when covers reload or re-resolve.

### 7. End-to-End Automated Testing & Quality Assurance
- **303 passed out of 303 automated tests** (0 failures).
- TypeScript strict typecheck passed with 0 errors.
- Real-device live emulator verification across EPUB, PDF, MOBI, AZW, FB2, CBZ, and CBR formats.

---
**Artifact:** `Lirune-Reader-v4.9.0-release.apk`
**Package:** `com.lirune.reader`
**Version:** `4.9.0` (Code `8`)
**Target SDK:** 36 (Android 16) / Min SDK: 24 (Android 7.0)
**Signature:** v2 (Full Production Signed, RSA 4096-bit)
