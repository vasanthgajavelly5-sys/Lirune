## Lirune Reader 5.6.0 — Windows Desktop & Store Release

Lirune 5.6.0 introduces dedicated fullscreen Table of Contents access, responsive non-congested toolbar controls for unmaximized/split desktop windows, and updated distribution packages.

### Highlights & Improvements

- **Fullscreen Table of Contents**: Added a dedicated floating frosted glass action pill (`focus-floating-controls`) in fullscreen/focus mode containing the Table of Contents button (`focus-toc-btn`) and Reading Settings button (`focus-settings-btn`), allowing immediate chapter navigation without leaving fullscreen.
- **Smooth Top Hover Reveal**: Fixed the fullscreen top edge reveal interaction so hovering near the top border smoothly slides down the complete smart toolbar.
- **Uncluttered Actions Capsule**: Replaced loose, congested icon buttons with a unified frosted glass reader actions capsule (`.toolbar-actions`) and a subtle hairline divider separating reader tools from OS window management buttons.
- **Responsive Sizing for Restored / Split Windows**: Added adaptive media queries and flexible center progress layout so toolbar buttons never wrap, squeeze, or collide into center chapter information or window controls when the desktop window is resized or unmaximized (tested down to 720px and below).
- **Capability Syncing**: Synchronized format capabilities across both standard toolbar buttons and floating fullscreen buttons, ensuring unsupported format actions are cleanly disabled.
- **Comprehensive QA Audits**: Passed all 17 unit tests, 20 fullscreen & congestion tests, 24 DOCX tests, and 22 verification tests.

### Distribution Assets

- **Windows Desktop Installer:** `Lirune Reader-5.6.0-Setup.exe`
- **Windows Store Package:** `Lirune Reader-5.6.0-Setup.appx`
- **Blockmap:** `Lirune Reader-5.6.0-Setup.exe.blockmap`
