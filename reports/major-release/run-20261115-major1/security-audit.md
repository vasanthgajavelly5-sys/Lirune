# Lirune Major Release — Security Audit & Defense Verification

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0` | Android `5.0.0`  
**Date**: November 15, 2026  
**Auditor**: Antigravity Security & Hardening Suite

---

## 1. Threat Model & Boundaries

Lirune operates on untrusted user-supplied files (downloaded books, community archives, email attachments). Any malformed or hostile file must not:
1. Escape the local sandboxed reader view.
2. Execute arbitrary system commands or JavaScript on the host OS.
3. Traverse outside the designated library storage directory.
4. Exfiltrate personal data, reading habits, or document contents over the network.

---

## 2. Hardening Measures & Verification

### 2.1 IPC Channel Security (`main.js` & `preload.js`)
- All IPC handlers strictly invoke `requireTrustedSender(event)`, rejecting events origin-spoofed or dispatched from unauthorized frames.
- Preload context bridge (`liruneDesktop` / `noveraDesktop`) exposes minimal, tightly-scoped functions; raw Electron objects (`ipcRenderer`, `shell`, `remote`) are never exposed to the web runtime.
- `shell:open-external` rejects all protocols except valid external HTTP/HTTPS URLs. Internal settings (`ms-settings:defaultapps`) are gated behind dedicated, parameterless handler `system:open-default-apps`.

### 2.2 Content Sanitization & XSS Defense
- FB2, HTML, and Markdown renderers enforce `DOMPurify.sanitize()` with strict attribute allowlists.
- All inline JavaScript handlers (`onload`, `onclick`, `onerror`, etc.) are permanently stripped.
- Injected `<svg>` `foreignObject`, `<iframe>`, `<embed>`, and `<object>` elements are completely removed.
- Cover URLs allowlist only safe base64 raster formats (`image/jpeg`, `image/png`, `image/webp`).

### 2.3 Archive Safety (Zip-Slip & Decompression Bombs)
- Decompression aggregate limit: 512MB maximum.
- Single entry extraction limit: 64MB maximum.
- Total entry count limit: 10,000 entries.
- Canonical path checks block all directory traversal attacks (`../`, `..\`, absolute paths).

### 2.4 Dependency Vulnerability Scan
- Production dependency audit (`npm run audit:prod`): **0 vulnerabilities**.
- `@xmldom/xmldom` verified at safe patched version (`>= 0.8.15`).
