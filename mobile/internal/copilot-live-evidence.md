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
