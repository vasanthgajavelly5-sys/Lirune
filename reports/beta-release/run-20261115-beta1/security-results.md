# Security Validation Results — Acceptance Run run-20261115-beta1

## 1. HTML & Script Injection Sanitization
- **Windows (MSG & Document Adapters):** HTML message bodies and styled documents are sanitized through AST/DOM parser trees. Script tags, inline event attributes (`onload`, `onerror`, `onclick`), iframes, and `javascript:` / `vbscript:` URI schemes are completely stripped prior to DOM attachment.
- **Android:** Markdown and HTML content rendered through safe React Native elements or sandboxed WebViews with `allowFileAccessFromFileURLs=false` and disabled JavaScript execution for untrusted formats.

## 2. Archive Expansion Budget & Zip Bomb Protection
- Both Windows (`documentAdapter.js:validateZipBudget`) and Android (`archiveBudget.ts:validateZipBudget`) enforce strict expansion budgets:
  - Max uncompressed size: 500 MB
  - Max file count: 10,000 entries
  - Max compression ratio: 100:1
- Archive headers are verified before decompression begins.

## 3. Profile & Data Isolation
- Windows testing executed in a strictly isolated profile:
  `%TEMP%\LiruneLiveTests\run-20261115-beta1\windows-profile`
- The user's production library and personal data were never accessed or mutated.
- Android testing executed exclusively on emulator (`emulator-5554`) with dedicated test paths under `/sdcard/Download/LiruneLiveTests/run-20261115-beta1/`.

## 4. Offline Verification
- Both applications function 100% locally with zero remote network egress.
- No external CDN scripts, remote fonts, or telemetry calls were initiated during test execution.
