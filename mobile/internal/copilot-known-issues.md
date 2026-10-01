# Lirune Reader Known Issues and Upstream Review

Date: 2026-10-01

## Technology Decisions

| Area | Current | Upstream evidence | Decision |
|---|---|---|---|
| React Native | 0.86.3 | Official RN 0.86 release describes Android 15 edge-to-edge support; 0.87 raises toolchain requirements to Node 22, AGP 9, Kotlin 2.0+ | Keep 0.86 for this pass; upgrade requires an Expo compatibility migration and is not a bug fix. |
| Expo | SDK 57.0.26 | Expo changelog lists SDK 57 stable and SDK 58 beta on 2026-09-16 | Do not adopt SDK 58 beta. |
| react-native-webview | 13.16.1 | Upstream releases show 14 requires API 24 and 15/16 introduce New Architecture and breaking changes | Keep 13.16.1 until a controlled compatibility migration; apply local WebView hardening now. |
| Android edge-to-edge | target SDK behavior | Android docs state SDK 35+ enforces edge-to-edge and requires system-bar/display-cutout insets | Preserve safe-area work and audit every reader overlay. |
| SAF | DocumentPicker/SAF | Android docs recommend ACTION_OPEN_DOCUMENT and ACTION_OPEN_DOCUMENT_TREE, with persistable URI permissions and no broad storage permission for user-selected files | Make SAF the primary discovery/import path. |
| WebView | generated HTML | Android security guidance recommends disabling file access, avoiding file://, and using WebViewAssetLoader where local assets are required | Keep generated in-memory documents, sanitize input, disable unsafe access, and deny navigation. |

## Dependency Audit

`npm audit --json` on the current lockfile reported 16 vulnerabilities: 13 moderate, 2 high, and 1 critical across 1052 installed dependency entries.

Notable findings:

- `pdfjs-dist` 3.11.x: high severity advisory GHSA-wgrm-67xf-hhpq for arbitrary JavaScript execution when opening a malicious PDF; audit range includes `<=4.1.392`. The package is direct and its generated code is vendored into the app. Upgrade to 6.x is a major migration and must be tested against the current WebView bundle pipeline.
- `tar`: critical/high transitive path traversal and symlink/hardlink issues through tooling dependencies. Keep build tooling patched through the Expo/RN upgrade path; do not force an unrelated major Expo downgrade/upgrade from npm audit's suggested version.
- `expo`, `@expo/cli`, `expo-router`, `query-string`, and related transitive entries: moderate audit findings with major-version fixes suggested by npm. The suggested versions do not match this Expo SDK's compatibility contract, so no blind upgrade is approved.
- `uuid`, `xcode`, `@mapbox/node-pre-gyp`, and `decode-uri-component`: additional audit entries require dependency-tree review during the planned SDK/toolchain upgrade.

The audit output is advisory evidence, not proof that every issue is reachable in the Android release. Reachability and mitigation must be tested after PDF sanitization, WebView hardening, and dependency decisions.

## Upstream/Runtime Risks

- Android 15/SDK 35 draws edge-to-edge by default; content and controls must account for system bars and display cutouts.
- `ACTION_OPEN_DOCUMENT_TREE` cannot select the storage root or Download on Android 11+, so UI must explain platform restrictions rather than promise unsupported locations.
- WebView JavaScript plus untrusted document markup is a file-based XSS risk even when navigation is blocked; the current tree adds sanitization and restrictive props, but device fixtures are still required.
- React Native 0.84 makes Hermes V1 default, 0.86 improves Android edge-to-edge, and 0.87 requires a materially newer toolchain. These are migration considerations, not reasons for an untested upgrade.

## Current Open Issues

- No configured Android SDK/ADB means no current emulator evidence.
- Release signing now fails closed without externally supplied credentials, but has not been release-built here.
- Permissions and backup behavior are narrowed in source but need merged-manifest validation.
- All inspected HTML-producing engines now share the sanitation/security wrapper.
- Runtime QA reports now distinguish parser-only dimensions from observable device evidence.
