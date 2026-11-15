# Lirune Reader 6.0.0 — Major Release: Deep Reading-Theme Parity, 50+ Formats & Shell Integration

Lirune 6.0.0 is a milestone major release delivering seamless reading-theme parity, full Windows shell and file association integration across all registered formats, single-instance cold/warm launching, and robust offline-first reading performance.

### Highlights
- **Deep Reading-Theme Parity**: Settings and Table of Contents (TOC) panels opened inside the reader strictly follow the active reading theme (all 15 palettes: Neutral, Sepia, Night, Paper, Contrast 1–4, Nord, Gruvbox, Solarized, Rosé Pine, Dracula, Mocha, and Custom). Zero style leakage from ancestor app theme.
- **50+ Formats Supported**: Complete cross-platform parity across all 50 canonical primary format families (E-books, Documents, Spreadsheets, Presentations, Comics, Images, Web archives, Structured data, and Communications) plus archive containers.
- **Single-Instance OS Integration**: Double-clicking files in Windows Explorer while Lirune is open brings the window to focus, opens the file immediately, and queues multiple selected files smoothly.
- **Make Lirune My Default Reader**: 1-click shortcut in Settings linking directly to Windows Default Apps (`ms-settings:defaultapps`).
- **Offline & Private**: Zero telemetry, zero analytics, local text-to-speech, strict sandbox isolation.
- **100% Windows Live Acceptance Pass Rate**: Verified against 141 real-world test samples (low, medium, and high complexity) in an isolated clean environment.

### Checksums & Artifacts
| Artifact | Filename | SHA-256 Checksum |
| :--- | :--- | :--- |
| **Windows Installer** | `Lirune.Reader-6.0.0-Setup.exe` | `5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5` |
| **Windows Installer (Spaced)** | `Lirune Reader-6.0.0-Setup.exe` | `5fa2d29d4bf478259b89ff0c6641a2cf404ce1736b5d2cd75bf6f9e64727a7a5` |

### Verification Instructions
- **PowerShell**: `Get-FileHash -Algorithm SHA256 "Lirune.Reader-6.0.0-Setup.exe"`
- **Linux / macOS**: `sha256sum "Lirune.Reader-6.0.0-Setup.exe"`
