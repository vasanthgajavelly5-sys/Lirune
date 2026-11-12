# Lirune Reader v5.6.2 Release Notes

## Summary
Lirune Reader v5.6.2 delivers comprehensive security hardening across rendering and IPC subsystems, fixes cross-platform launcher scripts, upgrades automated static analysis, and provides verified Windows desktop installer artifacts.

---

### Highlights

#### 1. Security & IPC Hardening
- **FB2 Cover Sanitization & XSS Prevention**: Thoroughly sanitized FB2 cover data URLs to protect against SVG payload execution, CSS expression injection, and attribute breakout attacks.
- **Archive Exhaustion & Zip-Bomb Protection**: Implemented strict unpacking limits (maximum uncompressed size caps, maximum file counts, and entry ratio checks) across archive extraction flows.
- **IPC Bridge Hardening**: Enforced context isolation, strict parameter validation, path TTLs, safe sender validation, and eliminated unsafe remote IPC channels.

#### 2. Desktop Launcher & Platform Fixes
- **Batch Launcher Fix**: Corrected syntax and escape handling in `Launch-Lirune.bat` and documented the architecture specification.
- **Cross-Platform Test Execution**: Updated test runner commands to operate consistently across Windows PowerShell and Unix shells without relying on shell glob expansion.

#### 3. Continuous Integration & Code Scanning
- **CodeQL & Dependency Review**: Upgraded CodeQL to v4, added Gitleaks v3 secrets scanning, and integrated GitHub dependency review workflows.
- **Scoped CI Workflows**: Partitioned desktop and mobile validation jobs to run strictly within their relevant change scopes.

---

### Installation & SmartScreen Notice
Because Lirune is an independent open-source application and binaries are not signed with a paid commercial Extended Validation (EV) certificate, Windows SmartScreen may present a warning:
> *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

To install:
1. Click **More info**.
2. Click **Run anyway**.

---

### Integrity Verification

#### SHA-256 Checksums
```text
0421c955db7e207617cf93dd5dff3b4056aa570565b08fed1f888a2b91bf30db  Lirune Reader-5.6.2-Setup.exe
```

Verify via PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 "Lirune Reader-5.6.2-Setup.exe"
```
