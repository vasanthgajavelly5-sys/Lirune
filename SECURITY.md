# Security Policy

## Supported Versions

Security fixes are actively maintained for the latest release on the primary branches:
- **Windows Desktop:** `main` and latest packaged release.
- **Android Mobile:** `android` and latest APK release.

## Reporting a Vulnerability

Please **do not** disclose suspected security vulnerabilities in public issues, discussions, or pull requests.

Report vulnerabilities privately using GitHub's Private Vulnerability Reporting channel:

<https://github.com/vasanthgajavelly5-sys/Lirune/security/advisories/new>

### What to Include in Your Report
To help us triage and remediate issues promptly, please provide:
1. **Description:** A concise explanation of the vulnerability and its potential impact.
2. **Reproduction Steps:** Step-by-step instructions or a safe, minimal synthetic reproduction file (e.g., an HTML/EPUB/FB2 sample with inert demonstration payloads).
3. **Target Platform:** Affected version, operating system (Windows/Android), and installation source (installer, APK, or source build).
4. **Logs & Diagnostics:** Relevant error messages with any personal filenames, tokens, or paths removed.
5. **Mitigation Suggestion:** If you have identified a potential fix, please describe it.

### Handling and Disclosure Process
- Maintainers aim to acknowledge reports within a reasonable timeframe (typically 3–5 business days).
- Please provide maintainers sufficient time to remediate and publish a verified fix before disclosing details publicly.
- Do not include copyrighted publications, private libraries, or personal credentials in test artifacts.

## Scope

Lirune Reader is a local-first, privacy-focused application. Reports related to the following areas are especially critical:
- Document sanitization and parser safety (EPUB, PDF, FB2, CBZ, DOCX, DjVu, RTF, ODT).
- Sandbox escapes, context-isolation bypasses, or unrestricted IPC mechanisms in the Electron shell.
- Android WebView navigation bypasses, intent spoofing, or storage path traversal.
- Dependency vulnerabilities affecting runtime execution.
