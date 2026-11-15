# Lirune Major Release — File Associations & Windows Shell Integration Report

**Run ID**: `run-20261115-major1`  
**Milestone**: Windows `6.0.0`  
**Date**: November 15, 2026  
**Status**: PASSED (All 28 Formats Registered, Single-Instance Lock, Shell Launchers Verified)

---

## 1. Scope & Objective

To establish Lirune as a premier, universal offline-first reader on Windows, the application has expanded native OS integration:
1. Register all 28 openable formats with Windows Explorer and the Windows Registry.
2. Ensure both closed-application cold launch and already-running double-click events open the target document immediately.
3. Support batch file selection (multiple files passed from Explorer).
4. Provide a 1-click "Make Lirune my default reader" option in Settings linking to Windows Default Apps (`ms-settings:defaultapps`).

---

## 2. Supported Format Registrations (All 28 Formats)

The following 28 document, archive, and image formats are now registered in `package.json` under `build.fileAssociations` and dynamically established at launch via `ensureWindowsRegistryAssociation()` in `main.js`:

| # | Extension | Format Description | Role | ProgID |
| :-: | :--- | :--- | :---: | :--- |
| 1 | `.epub` | EPUB Electronic Publication | Viewer | `Lirune.epub` |
| 2 | `.pdf` | Portable Document Format | Viewer | `Lirune.pdf` |
| 3 | `.mobi` | Mobipocket E-Book | Viewer | `Lirune.mobi` |
| 4 | `.azw` | Amazon Kindle E-Book | Viewer | `Lirune.azw` |
| 5 | `.azw3` | Kindle Format 8 (KF8) | Viewer | `Lirune.azw3` |
| 6 | `.fb2` | FictionBook 2.0 | Viewer | `Lirune.fb2` |
| 7 | `.fbz` | Compressed FictionBook | Viewer | `Lirune.fbz` |
| 8 | `.cbz` | Comic Book Archive (ZIP) | Viewer | `Lirune.cbz` |
| 9 | `.cbr` | Comic Book Archive (RAR) | Viewer | `Lirune.cbr` |
| 10 | `.cbt` | Comic Book Archive (TAR) | Viewer | `Lirune.cbt` |
| 11 | `.cb7` | Comic Book Archive (7Z) | Viewer | `Lirune.cb7` |
| 12 | `.docx` | Microsoft Word Document | Viewer | `Lirune.docx` |
| 13 | `.doc` | Microsoft Word 97-2004 Document | Viewer | `Lirune.doc` |
| 14 | `.odt` | OpenDocument Text Document | Viewer | `Lirune.odt` |
| 15 | `.rtf` | Rich Text Format | Viewer | `Lirune.rtf` |
| 16 | `.txt` | Plain Text Document | Viewer | `Lirune.txt` |
| 17 | `.md` | Markdown Document | Viewer | `Lirune.md` |
| 18 | `.markdown` | Markdown Document | Viewer | `Lirune.markdown` |
| 19 | `.html` | HyperText Markup Language | Viewer | `Lirune.html` |
| 20 | `.htm` | HyperText Markup Language | Viewer | `Lirune.htm` |
| 21 | `.chm` | Compiled HTML Help Document | Viewer | `Lirune.chm` |
| 22 | `.djvu` | DjVu Document | Viewer | `Lirune.djvu` |
| 23 | `.djv` | DjVu Document | Viewer | `Lirune.djv` |
| 24 | `.ppt` | PowerPoint Presentation | Viewer | `Lirune.ppt` |
| 25 | `.png` | Portable Network Graphic | Viewer | `Lirune.png` |
| 26 | `.jpg` | JPEG Raster Image | Viewer | `Lirune.jpg` |
| 27 | `.jpeg` | JPEG Raster Image | Viewer | `Lirune.jpeg` |
| 28 | `.tiff` / `.tif` | Tagged Image File Format | Viewer | `Lirune.tiff` / `Lirune.tif` |

---

## 3. Windows Shell & Registry Architecture

When running on Windows as a packaged application, Lirune configures the user's registry hive (`HKCU`) under:
- `HKCU\Software\Classes\Applications\Lirune Reader.exe\SupportedTypes`: Populated with all 28 extensions.
- `HKCU\Software\Classes\<ProgID>\shell\open\command`: Pointing to `"<exe>" "%1"`.
- `HKCU\Software\Classes\.<ext>\OpenWithProgids`: Associating `<ProgID>`.
- `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.<ext>\OpenWithProgids`: Populating Explorer's "Open with..." context menu.
- `HKCU\Software\Lirune Reader\Capabilities\FileAssociations`: Enabling Windows Default Apps integration.
- `HKCU\Software\RegisteredApplications`: Registering Lirune Reader Capabilities.

---

## 4. Single-Instance & Launch Lifecycle

### 4.1 Cold Launch (App Closed)
When the user double-clicks any registered book file:
1. `extractBookArgs(process.argv)` extracts and sanitizes valid file paths.
2. The initial file path is authorized via `authorizeBookPath()` (enforcing time-to-live and one-time consumption).
3. `mainWindow` starts; once `signalRendererReady` is received from the UI, `open-files-from-os` and `open-file-from-os` events dispatch to the renderer.
4. Dedicated loading screen (`showStorageOpenOverlay`) indicates book reading and database indexing.

### 4.2 Second-Instance Launch (App Already Running)
When the user double-clicks another file while Lirune is running:
1. `app.requestSingleInstanceLock()` intercepts the attempt.
2. The primary process's `app.on('second-instance')` handler receives the command-line arguments.
3. The main window is restored if minimized, brought to foreground, and focused.
4. If multiple files are passed, the first file is opened in the reader immediately, and remaining files are safely ingested into the library queue in the background.

---

## 5. "Make Lirune My Default Reader" Integration

In **Settings > General**:
- If running inside the desktop runtime (`window.noveraDesktop.openDefaultAppsSettings`), a new setting card is presented:
  - **Label**: `Default book reader`
  - **Sublabel**: `Set Lirune as your default reader for EPUB, PDF, and reading formats in Windows`
  - **Action Button**: `Make Lirune my default reader`
- Clicking this button invokes IPC channel `system:open-default-apps`.
- The main process executes `shell.openExternal('ms-settings:defaultapps')`, directly launching Windows Settings where users can assign Lirune as default with a single click.
