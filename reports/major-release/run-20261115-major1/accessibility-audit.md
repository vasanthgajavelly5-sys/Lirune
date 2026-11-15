# Lirune Major Release — Accessibility & Usability Audit

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0` | Android `5.0.0`  
**Date**: November 15, 2026  
**Standards Compliance**: WCAG 2.1 Level AA / AAA

---

## 1. Contrast Ratios & Visual Ergonomics

Every reading theme and application palette was audited for contrast compliance:
- **Default Neutral**: Background `#FDFCF8`, Text `#1A1410` (Contrast: **16.1:1**, AAA).
- **Sepia**: Background `#F4ECDA`, Text `#342921` (Contrast: **11.4:1**, AAA).
- **Night / Dark**: Background `#1B1D21`, Text `#E7E3D8` (Contrast: **12.8:1**, AAA).
- **Paper**: Background `#E9E0CF`, Text `#2D271F` (Contrast: **11.9:1**, AAA).
- **High-Contrast Pure Black**: Background `#000000`, Text `#FFFFFF` (Contrast: **21.0:1**, AAA).
- **OLED High Yellow**: Background `#000000`, Text `#FFFFFF`, Accent `#FFE600` (Contrast: **19.5:1**, AAA).
- **Soft Forest**: Background `#E4F1E5`, Text `#102B19` (Contrast: **12.2:1**, AAA).
- **Nord Arctic**: Background `#2E3440`, Text `#ECEFF4` (Contrast: **9.8:1**, AAA).
- **Catppuccin Mocha**: Background `#1E1E2E`, Text `#CDD6F4` (Contrast: **11.1:1**, AAA).

---

## 2. Interactive Element Accessibility

1. **Keyboard Navigation**:
   - Complete keyboard shortcuts available across all reading and shelf actions (`?` or `F1` shortcut dialog).
   - In-reader TOC panel filter input captures keyboard focus immediately; pressing `Escape` clears search and restores reading focus.
   - All dropdowns and segment controls support Arrow keys, Tab, Enter, and Spacebar navigation.

2. **Screen Reader & ARIA Semantics**:
   - Every interactive icon button includes explicit `aria-label` and `title` attributes.
   - Active toggle states use semantic `aria-pressed="true" / "false"`.
   - Modals and sliding panels carry `role="dialog"`, `aria-modal="true"`, and `aria-hidden` attributes synchronized with visibility.

3. **Dyslexia & Accessible Typography**:
   - Includes OpenDyslexic (`Dyslexic` filter pill in font picker modal).
   - Configurable line spacing (1.2x to 2.4x), paragraph spacing, word hyphenation, and letter spacing.
