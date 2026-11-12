# Lirune Reader v5.6.1 Release Notes

## Summary
Lirune Reader v5.6.1 delivers an extensively audited and polished reading and desktop experience:

### 1. Distraction-Free Fullscreen Reading
- **Clean Immersion**: Reader status bar (`#reader-statusbar`), reading progress stripe (`#reading-stripe`), and the top toolbar are hidden in focused fullscreen mode so book text is never obstructed.
- **Unified Floating Controls Pill**: A sleek, frosted glass floating pill at top-right hosts Table of Contents (TOC), Reading Settings, and Exit Fullscreen buttons for quiet, immediate access.
- **Smooth Restoration**: Exiting fullscreen instantly restores the desktop reader toolbar and status bar.

### 2. Window Controls & Desktop Chrome
- **Crisp Window Controls**: Fixed window minimize, maximize/restore, and close buttons so they are sharp and clearly legible, never faded or greyed out.
- **Dynamic Maximize/Restore State**: Real-time synchronization between Electron and the window chrome: the maximize button dynamically toggles its icon and tooltip between "Maximize" and "Restore Down" to match window state.

### 3. Quick Themes in Side Panel
- **1-Click Theme Selection**: Direct visual theme swatches (Neutral, Sepia, Night, Paper, OLED, Amber, Navy, Sage) directly inside the reading settings drawer for fast theme switching without diving into submenus.

### 4. Codebase Audit & Hardening
- **Keyboard Shortcuts**: Fixed `Escape` shortcut handling in preferences to correctly return to the library without referencing obsolete APIs.
- **Indentation & Formatting**: Cleaned up indentation across `settings.js`, `epubLoader.js`, and `appPrefs.js`.
- **Integrity**: Comprehensive test suite (17 unit & hardening tests, 26 fullscreen & congestion assertions, 22 V5 end-to-end verification steps) 100% passing.
