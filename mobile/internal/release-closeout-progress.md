# Release Closeout Progress & Tracking

## Owner Settings
- `OWNER_TESTED_ON_PHYSICAL_TABLET`: **NO** (Releases will be published as **PRE-RELEASE**)
- `PUBLISH_IF_ALL_GATES_PASS`: **YES**
- `ALLOW_AGENT_TO_MERGE_PRS`: **YES**

---

## Phase 0: Discovery State Table

| Branch | Platform | HEAD SHA | Last Commit Date | Version / Code | Ahead / Behind | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `main` | Default root | `80102f0936c9c69adf0d078e441393db6f8240ae` | 2026-10-03 | 5.5.0 | Baseline | Active |
| `lirune-store-home` | Windows Desktop (Electron) | `282f4110a4853c1802b503be2bed2928f9f38a54` | 2026-10-27 | 5.6.1 | 53 ahead, 1 behind `main` | Active target for Desktop v5.6.2 |
| `android` | Android (Expo / RN / Kotlin) | `69184e2bbdfd32395427c9eb8af8a6f7abad5769` | 2026-10-27 | 4.9.2 (code 10) | 75 ahead, 1 behind `main` | Target for PR #4 merge |
| `feat/scroll-v2-only` | Android PR #4 branch | `7ffdd8479fa38e8d1756d6eaf2c7351457a6d87a` | 2026-10-27 | 4.9.3 (code 11) | 5 ahead, 0 behind `android` | PR #4 Head |
| `legacy/scroll-v1` | Rollback reference | `69184e2bbdfd32395427c9eb8af8a6f7abad5769` | 2026-10-27 | 4.9.2 (code 10) | 0 ahead, 0 behind `android` | Reference rollback |

### Target Release Decisions
- **Android Target**: `4.9.3` (versionCode `11`), Tag: `v4.9.3` (Next after published `v4.9.0`).
- **Desktop Target**: `5.6.2`, Tag: `v5.6.2` (Next patch after published `v5.6.1`).
- **Branch Protection**: `android`, `lirune-store-home`, and `main` have force-push/deletion protection; agent PR merges without bypass are allowed.

---

## Progress Checklist

- [x] **PHASE 0: Discovery (read-only)**
  - [x] Fetch all & prune remotes
  - [x] Record branch SHAs, versions, tags, and PRs
  - [x] Inspect branch protection rules
  - [x] Determine next version numbers (`v4.9.3` Android, `v5.6.2` Desktop)
  - [x] Output state table

- [x] **PHASE 1: GitHub Task & Alert Check**
  - [x] Workflow runs & conclusions: 100% green on `feat/scroll-v2-only`, `android`, and `lirune-store-home` (CI, CodeQL, Gitleaks, Dependency Review)
  - [x] Code scanning alerts (CodeQL): 0 open alerts
  - [x] Secret scanning alerts & push protection: 0 open alerts, secret scanning & push protection enabled
  - [x] Dependabot alerts & open PRs: PR #1 and #2 target legacy `main`; open alerts documented; no blockers for release branches
  - [x] Open bug/security issues & vulnerability reports: 0 open issues, 0 advisories
  - [x] Evaluate GATE G1: **PASS**

- [x] **PHASE 2: Android Close-Out (`android`, PR #4)**
  - [x] 2.1 Code checks (`npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:pdfjs`, `npm audit --omit=dev`)
  - [x] 2.2 Repo hygiene on PR branch (no committed APKs, keystores, or artifacts)
  - [x] 2.3 Clean-build permission proof (`expo prebuild --clean`, assembleRelease, aapt2 dump permissions, apksigner fingerprint match)
  - [x] 2.4 Install / Uninstall / Migration tests on emulators without root tricks:
    - [x] Fresh install, cold start, clean logcat
    - [x] Import paths (Open-with intent, folder-picker, Downloads)
    - [x] Format smoke (EPUB, PDF, FB2, MOBI, CBZ, TXT, DJVU)
    - [x] Scroll mode deep verification (Scroll Engine v2, rotation, font resize, position restore)
    - [x] Upgrade over published v4.9.0 release APK (schema, annotations, legacy scroll positions)
    - [x] Complete uninstall clean-up check
    - [x] 10-minute soak test with PSS sampling and gfxinfo
  - [x] 2.5 Set Android version 4.9.3 (code 11) everywhere & update CHANGELOG
  - [x] Evaluate GATE G2: **PASS**

- [x] **PHASE 3: Desktop "Store Home" Close-Out (`lirune-store-home`)**
  - [x] 3.1 Code checks (`npm ci`, `npm run lint`, `npm test` 41/41 passing, `validate:release:config`, `npm audit --omit=dev` 0 vulnerabilities)
  - [x] 3.2 Electron security review (BrowserWindow webPreferences, IPC handlers, CSP, navigation, sanitization)
  - [x] 3.3 Repo hygiene & naming check (no stale release artifacts in dist/)
  - [x] 3.4 Build NSIS installer (`Lirune Reader-5.6.2-Setup.exe`, 122,950,141 bytes, SHA-256 `0421c955db7e207617cf93dd5dff3b4056aa570565b08fed1f888a2b91bf30db`, Authenticode: `NotSigned`)
  - [x] 3.5 Install / Uninstall tests:
    - [x] Silent install (`/S`), shortcuts, Programs & Features entry verified
    - [x] Desktop smoke test (import, read, scroll, theme, font, highlight, position restore)
    - [x] Upgrade test in-place over baseline v5.6.1 installer (exit code 0)
    - [x] Silent uninstall (`/S`) cleanly verified; user data preserved
  - [x] 3.6 Bump version to 5.6.2 everywhere, release notes created, committed, and pushed to origin
  - [x] Evaluate GATE G3: **PASS**

- [x] **PHASE 4: Cross-Branch Code & Security Check**
  - [x] Full-history secret scan (`gitleaks` passing in CI, 0 GitHub secret alerts)
  - [x] Dependency & THIRD_PARTY_NOTICES license review (GPL-3.0 compatibility)
  - [x] Full git diff summary against latest published releases (v4.9.0 and v5.6.1)
  - [x] Evaluate GATE G4: **PASS**

- [x] **PHASE 5: PR Merge**
  - [x] Check CI status on PR #4 (100% green: CodeQL, Mobile Validation, Dependency Review, Gitleaks)
  - [x] Merge PR #4 into `android` with merge commit (`4ed18e3150d40eb7745b7a75e9426ac4e60f2b14`)
  - [x] Verify merged tree equals built release tree
  - [x] Desktop branch `lirune-store-home` HEAD (`2a1a42b`) synchronized with origin

- [x] **PHASE 6: Publish Pre-Releases**
  - [x] Verify gates G1, G2, G3, G4 all passed
  - [x] Android release published:
    - Tag: `v4.9.3` (Pre-release)
    - Target: `android` (`4ed18e3150d40eb7745b7a75e9426ac4e60f2b14`)
    - URL: https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v4.9.3
    - Assets: `Lirune-Reader-v4.9.3-release.apk`, `SHA256SUMS.txt`
  - [x] Desktop release published:
    - Tag: `v5.6.2` (Pre-release)
    - Target: `lirune-store-home` (`842be0f` / `2a1a42b`)
    - URL: https://github.com/vasanthgajavelly5-sys/Lirune/releases/tag/v5.6.2
    - Assets: `Lirune Reader-5.6.2-Setup.exe`, `SHA256SUMS.txt`

- [x] **PHASE 7: Post-Publish Verification & Final Report**
  - [x] Verify Release Integrity workflows & attestation (both runs passed)
  - [x] Download public release assets from GitHub and verify SHA-256 matches bit-for-bit
  - [x] Produce comprehensive final report in `mobile/internal/release-closeout-report.md`

