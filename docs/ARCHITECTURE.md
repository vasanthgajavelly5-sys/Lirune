# Lirune Reader Architecture

Lirune Reader is an Electron desktop application with a local-only renderer, a privileged main process, and IndexedDB state storage.

## Data flow

- `main.js` owns the BrowserWindow, Windows file association routing, managed EPUB storage, validation, and privileged filesystem operations.
- `preload.js` exposes a narrow `contextBridge` API. Renderer code does not access Node.js or IndexedDB outside the centralized DB module.
- `js/db.js` stores metadata, progress, annotations, preferences, collections, and favorites in IndexedDB.
- EPUB binaries are stored under the existing `%APPDATA%/Lirune Reader/books/<sha256>.epub` path and are read only for the selected book.
- `js/library.js` handles metadata rendering and import coordination.
- `js/epubLoader.js` owns the active epub.js book/rendition and reader state.

## Storage migration

Database version 3 adds managed storage metadata and collections. Legacy records containing `fileData` are migrated after the database opens. Each binary is validated and written to a deterministic SHA-256 storage identity before the IndexedDB record is replaced without `fileData`. A failed database write removes only a file confirmed to have been created by that migration attempt.

## Security boundaries

The renderer runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`. Privileged IPC handlers validate the sender frame and validate managed storage identities. Imported EPUBs are treated as untrusted archives; DRM markers and encrypted resources are rejected.

## Release limitations

The repository has focused contract tests, but not yet a complete browser/Windows integration suite. Install, upgrade, association, and uninstall smoke tests require a Windows environment that permits the unsigned installer or a properly signed CI artifact.

Metadata backups are versioned JSON files containing library state, annotations, preferences, and collections. They intentionally do not embed managed EPUB binaries; the managed files remain in local application storage and should be backed up separately for a complete library copy.
