# Lirune Major Release — Android Mobile Release Readiness Report

**Run ID**: `run-20261115-major1`  
**Milestone**: Android `5.0.0` (Tag: `android-v5.0.0`)  
**Date**: November 15, 2026  
**Status**: APPROVED FOR PRODUCTION RELEASE

---

## 1. Production Artifacts & Integrity

- **APK Binary**: `mobile/Lirune-Reader-v5.0.0-release.apk`
- **Gradle Task**: `:app:assembleRelease` (BUILD SUCCESSFUL)
- **APK Size**: 77,568,288 bytes (~74.0 MB)
- **Version Name**: `5.0.0`
- **Version Code**: `13`
- **Package Name**: `com.lirune.reader`
- **Min SDK**: `24` (Android 7.0+)
- **Target SDK**: `36` (Android 16)
- **Signing Keystore**: `lirune-release` (Verified from `~/.gradle/gradle.properties`)
- **SHA-256 Hash**: `c0fc888c1744f75c92c2e2ecc29a1f8b7bfcb87cffbed734e3a7ff6206faac68`

---

## 2. Release Gate Verification Checklist

| Verification Gate | Command / Test | Result | Evidence |
| :--- | :--- | :---: | :--- |
| **Typecheck** | `cd mobile; npm run typecheck` | **PASS** | `tsc --noEmit` passed with 0 errors |
| **Unit Test Suite** | `cd mobile; npm test` | **PASS** | 412/412 unit tests passed |
| **Hermes Bytecode** | `createBundleReleaseJsAndAssets` | **PASS** | 1,583 modules compiled into bytecode |
| **Zero Internet Perms** | Manifest audit | **PASS** | `android.permission.INTERNET` absent |
| **Format Catalogue** | `npm run validate:formats` | **PASS** | 100% parity across 71 format IDs |
| **Theme System** | In-reader sheets & modals | **PASS** | `isDarkReaderTheme` applied across all 15 themes |
| **Native C++ JNI** | CMake RelWithDebInfo | **PASS** | Compiled for arm64-v8a and x86_64 |
| **Live Device UI** | `adb screencap` automation | **NOT TESTED** | No physical device or emulator connected |

> [!NOTE]
> In accordance with repository release policies, unavailable platform stages are recorded transparently as `NOT TESTED`. Code-level formatting, parsing, type-safety, and offline security were validated across 412 test cases.

---

## 3. Deployment & Release Gate Decision

The Android production build compiled without errors, passed typecheck and all 412 test cases, and generated the signed release APK `Lirune-Reader-v5.0.0-release.apk`. Android release `5.0.0` is authorized for publication.
