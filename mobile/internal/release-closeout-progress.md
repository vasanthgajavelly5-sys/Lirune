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

- [ ] **PHASE 2: Android Close-Out (`android`, PR #4)**
  - [ ] 2.1 Code checks (`npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:pdfjs`, `npm audit --omit=dev`)
  - [ ] 2.2 Repo hygiene on PR branch (no committed APKs, keystores, or artifacts)
  - [ ] 2.3 Clean-build permission proof (`expo prebuild --clean`, assembleRelease, aapt2 dump permissions, apksigner fingerprint match)
  - [ ] 2.4 Install / Uninstall / Migration tests on emulators without root tricks:
    - [ ] Fresh install, cold start, clean logcat
    - [ ] Import paths (Open-with intent, folder-picker, Downloads)
    - [ ] Format smoke (EPUB, PDF, FB2, MOBI, CBZ, TXT, DJVU)
    - [ ] Scroll mode deep verification (Scroll Engine v2, rotation, font resize, position restore)
    - [ ] Upgrade over published v4.9.0 release APK (schema, annotations, legacy scroll positions)
    - [ ] Complete uninstall clean-up check
    - [ ] 10-minute soak test with PSS sampling and gfxinfo
  - [ ] 2.5 Set Android version 4.9.3 (code 11) everywhere & update CHANGELOG
  - [ ] Evaluate GATE G2

- [ ] **PHASE 3: Desktop "Store Home" Close-Out (`lirune-store-home`)**
  - [ ] 3.1 Code checks (`npm ci`, `npm run lint`, `npm test`, `npm run validate:corpus`, `npm audit --omit=dev`, `npm run validate:release:config`)
  - [ ] 3.2 Electron security review (BrowserWindow webPreferences, IPC handlers, CSP, navigation, sanitization)
  - [ ] 3.3 Repo hygiene & naming check
  - [ ] 3.4 Build NSIS installer (`npm run dist`), record SHA-256 and Authenticode signature status
  - [ ] 3.5 Install / Uninstall tests (Windows Sandbox or backed-up user data):
    - [ ] Silent install, shortcuts, Programs & Features
    - [ ] Desktop smoke test (import, read, scroll, theme, font, highlight, position restore)
    - [ ] Upgrade test over latest published v5.6.1 installer
    - [ ] Uninstall verification & user data preservation check
    - [ ] Restore owner's user-data if run on host
  - [ ] 3.6 Bump version to 5.6.2 everywhere & update CHANGELOG
  - [ ] Evaluate GATE G3

- [ ] **PHASE 4: Cross-Branch Code & Security Check**
  - [ ] Full-history secret scan (`gitleaks`)
  - [ ] Dependency & THIRD_PARTY_NOTICES license review (GPL-3.0 compatibility)
  - [ ] Full git diff summary against latest published releases
  - [ ] Evaluate GATE G4

- [ ] **PHASE 5: PR Merge**
  - [ ] Check CI status on PR #4 (`feat/scroll-v2-only` -> `android`)
  - [ ] Merge PR #4 with merge commit
  - [ ] Verify merged tree equals built release tree
  - [ ] Check desktop branch status (PR to `lirune-store-home` if needed, or verify clean state)

- [ ] **PHASE 6: Publish Pre-Releases**
  - [ ] Verify gates G1, G2, G3, G4 all passed
  - [ ] Prepare Android release (draft first, assets `Lirune-Reader-v4.9.3-release.apk`, `SHA256SUMS.txt`, notes)
  - [ ] Publish Android pre-release (`gh release edit v4.9.3 --draft=false --prerelease`)
  - [ ] Prepare Desktop release (draft first, NSIS installer, `SHA256SUMS.txt`, notes with SmartScreen warning)
  - [ ] Publish Desktop pre-release (`gh release edit v5.6.2 --draft=false --prerelease`)

- [ ] **PHASE 7: Post-Publish Verification & Final Report**
  - [ ] Verify Release Integrity workflows & attestation
  - [ ] Download public release assets from GitHub and verify SHA-256, aapt2, apksigner, installer
  - [ ] Check README badges & download links on default branch
  - [ ] Produce comprehensive final report
