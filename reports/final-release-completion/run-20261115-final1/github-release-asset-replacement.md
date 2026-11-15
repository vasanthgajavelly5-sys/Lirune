# GitHub Release Asset Replacement & Verification Report

**Run ID**: `run-20261115-final1`  
**Repository**: `vasanthgajavelly5-sys/Lirune`  
**Date**: November 15, 2026  

---

## 1. Android Release Asset Replacement (`android-v5.0.0`)
- **Reason**: Fix confirmed `NoClassDefFoundError: ExifInterface` defect in Fresco rendering engine affecting HEIC/HEIF images, and eliminate "Native ingest returned null" error paths.
- **Asset Replaced**: `Lirune-Reader-v5.0.0-release.apk`
- **Replacement Command**: `gh release upload android-v5.0.0 "mobile\android\app\build\outputs\apk\release\app-release.apk#Lirune-Reader-v5.0.0-release.apk" --clobber`
- **New Asset Size**: 77,601,603 bytes.
- **New Asset SHA-256**: `4ceaa7d6b999ab23dbe909feaf987cc7d69ca43edfcae5817289ac1b83f27fd1`
- **Release Notes Updated**: Release notes updated with new SHA-256 fingerprint and ExifInterface resolution details.

## 2. Windows Release Asset Status (`v6.0.0`)
- **Asset**: `Lirune.Reader-6.0.0-Setup.exe`
- **Asset Size**: 125,533,631 bytes.
- **Asset SHA-256**: `5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5`
- **Status**: Verified intact, unchanged, and validated.
