# Live Emulator Evidence

Date: 2026-10-02

## Environment

- Emulator: `emulator-5554` / AVD `qa_android`
- Android: 15 / API 35
- Host GPU: NVIDIA GeForce RTX 2050
- Emulator GPU mode: host
- Vulkan device: NVIDIA GeForce RTX 2050, API 1.4.329
- GLES renderer: Android Emulator OpenGL ES Translator (NVIDIA GeForce RTX 2050), OpenGL ES 3.1
- React Native renderer: Skia GPU (`debug.hwui.renderer=skiagl`)
- Display: 1080x2400 at 420 dpi, 60 Hz

## Build and launch

- JDK: Temurin 17.0.20.1 at `C:\Users\vasanth\jdk17`
- Android SDK: `C:\Users\vasanth\android-sdk`
- Native debug build: completed with `:app:assembleDebug`
- APK install: succeeded with `adb install -r`
- Debug bundle: loaded through Metro using `adb reverse tcp:8081 tcp:8081`
- React Native startup: `Running "main"` observed in logcat
- Startup fatal exception: none observed after Metro connection
- Initial PSS after launch: approximately 100 MB

## Scope correction

No user profile, account, sign-in, analytics, or cloud-sync feature was added. Matches for `profile` in build output are AndroidX profileinstaller/baseline-profile internals. External support/source links were removed from the app UI to keep the product offline-only.

## Current live limitation

The app launch path is verified on the emulator. Full 15-issue interaction, 18-format opening, EPUB gesture/scroll, PDF visual, TTS voice, and settings persistence flows still require deliberate UI automation/corpus injection and are not marked PASS here.

## Resumed live QA — 2026-10-02

Environment recovered: `qa_android` / `emulator-5554`, Android 15 / API 35, host GPU; Gradle debug build succeeded, APK installed, Metro reverse active. The app retained 18 imported books in its SQLite/files sandbox, but `/sdcard/Download/lirune-qa-corpus` is absent after the emulator restart.

Verified live in this resumed session:

- CBR `Pepper Carrot Episode 01 (cbr)`: page 1/5 rendered, page navigation worked, and page 2/5 restored after leaving and reopening. Screenshot: `mobile/internal/cbr_fixed_page2.png`. Maestro: `mobile/e2e/14_cbr_progress_restore.yaml`.
- CBZ `Pepper Carrot Episode 01 (cbz)`: page 1/5 rendered, page navigation worked, and page 2/5 restored after leaving and reopening. Maestro: `mobile/e2e/15_cbz_progress_restore.yaml`.
- About screen now displays `Version 4.0.5 (Android)` and the drawer displays `v4.0.5`. Screenshot: `mobile/internal/about_version_fixed.png`. Maestro: updated `mobile/e2e/05_about_screen.yaml`.
- `npm run typecheck`: PASS.

The About mismatch was a real live discrepancy: both UI locations said 4.0.4 while `mobile/app.json` and the installed Android package said 4.0.5. They now use `Constants.expoConfig.version`.

Startup note: a fresh baseline launch once produced a blank screen followed by a React Native Fabric `MountingCoordinator::pullTransaction` SIGSEGV. Four subsequent cold launches with a 60-second library-load wait passed. A temporary `enableScreens(false)` experiment did not establish causality and was reverted. Do not claim the native crash is fixed; continue cold-start sampling and collect a symbolicated tombstone if it recurs.

Remaining live gaps at the end of this emulator session: no full 18-format run, no current full settings/annotation/TTS/dictionary regression, no issue 15 whole-book multi-chapter proof, and no tablet/landscape pass. The resumed format checks and PDF visual render evidence are recorded in `copilot-18-format-live-qa.md`. The user has since asked to pause additional format testing and prioritize EPUB engine and storage work.
