# Lirune Published Package Asset Verification Report

**Scope**: GitHub Release Assets + Website Download Assets ONLY  
**Target Milestone**: Windows \`6.0.0\` | Android \`5.0.0\`  
**Run ID**: \`run-20261115-final1\`  
**Date & Time**: November 15, 2026 at 17:27 UTC+05:30  
**Verification Owner**: Swarm Coordinator  
**Specialist Delegation Note**: Coordinator ran on Gemini 3.8 Flash due to exhaustion of Claude Sonnet quota (reported truthfully per Section 1).  

---

## 1. Executive Summary

This evaluation establishes with cryptographic certainty that the downloadable Windows and Android application packages published on GitHub Releases and exposed on the official Lirune website are the authentic, latest intended production builds.

Every binary copy was independently verified through:
1. Local production build inspection.
2. Direct binary download from GitHub Releases.
3. Direct binary download following the live redirect URLs exposed on the production website ([https://lirune-reader.web.app/downloads](https://lirune-reader.web.app/downloads)).
4. Full byte-for-byte SHA-256 digest computation and internal binary metadata inspection.

---

## 2. Platform A: Windows 6.0.0 Package Verification

### 2.1 Local Production Artifact
- **File Path**: \`C:\\Users\\vasanth\\Desktop\\Programs\\Epub reader\\dist\\Lirune.Reader-6.0.0-Setup.exe\`
- **File Size**: \`125,533,631 bytes\` (119.7 MB)
- **Local SHA-256 Digest**: \`5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5\`
- **Internal Version Metadata**:
  - \`FileVersion\`: \`6.0.0\`
  - \`ProductVersion\`: \`6.0.0\`
  - \`ProductName\`: \`Lirune Reader\`
  - \`CompanyName\`: \`Vasanth Gajavelly\`
  - \`FileDescription\`: \`A private, open-source Windows EPUB reader\`

### 2.2 GitHub Release Asset
- **Release Tag**: \`v6.0.0\`
- **Release URL**: [https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v6.0.0](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v6.0.0)
- **Direct Asset URL**: \`https://github.com/vasanthgajavelly5-sys/Lirune/releases/download/v6.0.0/Lirune.Reader-6.0.0-Setup.exe\`
- **Downloaded Filename**: \`Lirune.Reader-6.0.0-Setup.exe\`
- **Downloaded Size**: \`125,533,631 bytes\`
- **Downloaded SHA-256 Digest**: \`5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5\`
- **Internal Version Metadata**: Confirmed \`6.0.0\`

### 2.3 Live Website Download Asset
- **Website Page**: \`https://lirune-reader.web.app/downloads\`
- **Discovered Download Link**: \`https://github.com/vasanthgajavelly5-sys/Lirune/releases/download/v6.0.0/Lirune.Reader-6.0.0-Setup.exe\`
- **Resolved Redirect Target**: \`https://objects.githubusercontent.com/github-production-release-asset-2e65be/...\`
- **Downloaded Filename**: \`Lirune.Reader-6.0.0-Setup.exe\`
- **Downloaded Size**: \`125,533,631 bytes\`
- **Downloaded SHA-256 Digest**: \`5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5\`
- **Internal Version Metadata**: Confirmed \`6.0.0\`

### 2.4 Windows 6.0.0 Identity Comparison

| Source | File Size | SHA-256 Digest | Internal Version |
|:---|:---:|:---:|:---:|
| **Local Production Artifact** | \`125,533,631 bytes\` | \`5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5\` | \`6.0.0\` |
| **GitHub Releases (\`v6.0.0\`)** | \`125,533,631 bytes\` | \`5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5\` | \`6.0.0\` |
| **Live Production Website** | \`125,533,631 bytes\` | \`5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5\` | \`6.0.0\` |

**Windows 6.0.0 Verdict**: **EXACT BYTE-FOR-BYTE MATCH (PASS)**

---

## 3. Platform B: Android 5.0.0 Package Verification

### 3.1 Initial Assessment & Root Cause of Correction
During initial inspection of the pre-existing published APK, package metadata dumped via \`aapt2 dump badging\` revealed that while the artifact name was \`Lirune-Reader-v5.0.0-release.apk\` and \`app.json\` specified version \`5.0.0\` (versionCode \`13\`), the native generated \`mobile/android/app/build.gradle\` had retained \`versionName "4.9.4"\` and \`versionCode 12\`.

In strict adherence to **Section 7: Correction Rules**:
1. Preserved backup of previous APK (\`4ceaa7d6b999ab23dbe909feaf987cc7d69ca43edfcae5817289ac1b83f27fd1\`) at \`artifacts/published-backup/app-release-4.9.4-backup.apk\`.
2. Synchronized \`mobile/android/app/build.gradle\` (\`versionCode 13\`, \`versionName "5.0.0"\`).
3. Executed clean \`:app:assembleRelease\` signed with the official \`lirune-release\` RSA 4096-bit keystore.
4. Uploaded new production APKs (\`app-release.apk\` and \`Lirune-Reader-v5.0.0-release.apk\`) to GitHub release tag \`android-v5.0.0\` with \`--clobber\`.
5. Updated \`src/data/releases.json\` on the website and re-deployed to Firebase Hosting.
6. Re-downloaded and verified both the GitHub release asset and website download link.

### 3.2 Local Production Artifact
- **File Path**: \`C:\\Users\\vasanth\\Desktop\\Programs\\Epub reader\\mobile\\android\\app\\build\\outputs\\apk\\release\\app-release.apk\`
- **File Size**: \`77,601,599 bytes\` (74.0 MB)
- **Local SHA-256 Digest**: \`de223c1d90cee0e0c1c3360569dd84706be4c5d93bbdf00a39c027ba05e7a776\`
- **Package ID**: \`com.lirune.reader\`
- **Internal Version Code**: \`13\`
- **Internal Version Name**: \`5.0.0\`
- **Target SDK**: \`36\` | **Min SDK**: \`24\`
- **Signing Scheme**: Scheme v2 (APK Signature Scheme v2) Verified
  - **Certificate DN**: \`CN=Lirune Reader Release, OU=Android\`
  - **Certificate SHA-256**: \`ef68ec8a2182a7870debc0eceb28311a758d449219b84e7a9833379cdee516d1\`

### 3.3 GitHub Release Asset
- **Release Tag**: \`android-v5.0.0\`
- **Release URL**: [https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/android-v5.0.0](https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/android-v5.0.0)
- **Direct Asset URL**: \`https://github.com/vasanthgajavelly5-sys/Lirune/releases/download/android-v5.0.0/Lirune-Reader-v5.0.0-release.apk\`
- **Alternative Asset URL**: \`https://github.com/vasanthgajavelly5-sys/Lirune/releases/download/android-v5.0.0/app-release.apk\`
- **Downloaded Filename**: \`Lirune-Reader-v5.0.0-release.apk\`
- **Downloaded Size**: \`77,601,599 bytes\`
- **Downloaded SHA-256 Digest**: \`de223c1d90cee0e0c1c3360569dd84706be4c5d93bbdf00a39c027ba05e7a776\`
- **Internal Package Metadata**:
  - Package ID: \`com.lirune.reader\`
  - Version Code: \`13\`
  - Version Name: \`5.0.0\`
  - Signing Scheme v2: Verified (\`CN=Lirune Reader Release, OU=Android\`)

### 3.4 Live Website Download Asset
- **Website Page**: \`https://lirune-reader.web.app/downloads\`
- **Discovered Download Link**: \`https://github.com/vasanthgajavelly5-sys/Lirune/releases/download/android-v5.0.0/app-release.apk\`
- **Resolved Redirect Target**: \`https://objects.githubusercontent.com/github-production-release-asset-2e65be/...\`
- **Downloaded Filename**: \`app-release.apk\`
- **Downloaded Size**: \`77,601,599 bytes\`
- **Downloaded SHA-256 Digest**: \`de223c1d90cee0e0c1c3360569dd84706be4c5d93bbdf00a39c027ba05e7a776\`
- **Internal Package Metadata**:
  - Package ID: \`com.lirune.reader\`
  - Version Code: \`13\`
  - Version Name: \`5.0.0\`
  - Signing Scheme v2: Verified (\`CN=Lirune Reader Release, OU=Android\`)

### 3.5 Android 5.0.0 Identity Comparison

| Source | File Size | SHA-256 Digest | Internal Version |
|:---|:---:|:---:|:---:|
| **Local Production Artifact** | \`77,601,599 bytes\` | \`de223c1d90cee0e0c1c3360569dd84706be4c5d93bbdf00a39c027ba05e7a776\` | \`5.0.0\` (code 13) |
| **GitHub Releases (\`android-v5.0.0\`)** | \`77,601,599 bytes\` | \`de223c1d90cee0e0c1c3360569dd84706be4c5d93bbdf00a39c027ba05e7a776\` | \`5.0.0\` (code 13) |
| **Live Production Website** | \`77,601,599 bytes\` | \`de223c1d90cee0e0c1c3360569dd84706be4c5d93bbdf00a39c027ba05e7a776\` | \`5.0.0\` (code 13) |

**Android 5.0.0 Verdict**: **EXACT BYTE-FOR-BYTE MATCH (PASS AFTER CORRECTION)**

---

## 4. Final Verdict

**PASS AFTER CORRECTION**

- **Windows 6.0.0**: 100% verified on first evaluation. Local artifact, GitHub release asset, and live website download are byte-for-byte identical with internal version \`6.0.0\`.
- **Android 5.0.0**: A version discrepancy was identified (\`versionName\` \`4.9.4\` in build.gradle despite tag \`android-v5.0.0\`), safely corrected with a preserved backup, re-assembled with official release signing, uploaded to GitHub Releases, updated on the production website, and independently downloaded from both remote endpoints. All three copies are now byte-for-byte identical with internal version \`5.0.0\`.
- **Zero Outstanding Discrepancies**: There are no remaining mismatches on either platform.
