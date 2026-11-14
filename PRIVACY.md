# Lirune Reader Privacy

Lirune Reader is strictly local-first and offline-only. It does not require an account, cloud library, analytics SDK, crash reporting service, or telemetry.

## Zero Network Access
- **No Internet Permission:** On Android, release APKs explicitly remove the `android.permission.INTERNET` permission at build time using a manifest release overlay with `tools:node="remove"`. The operating system physically restricts the application from creating network sockets, binding ports, or executing HTTP requests.
- **Offline Document Rendering:** All document formats (EPUB, PDF via vendored PDF.js, FB2, MOBI, CBZ, TXT, RTF, DOCX) are parsed and rendered entirely on-device.
- **Zero Remote Assets:** The application shell has no runtime dependencies on remote CDNs, Google Fonts, or external stylesheets. All typefaces, icons, and rendering engines are vendored locally within the APK.

## Local Storage & Data Retention
- Imported books are stored exclusively in internal app storage (`files/books/`).
- Metadata, bookmarks, annotations, notes, and reading progress are stored in a local SQLite database on mobile and IndexedDB on desktop.
- Lirune Reader never uploads, transmits, or synchronizes your library, reading positions, or notes with any remote server.
- The only external link in the application is an explicit donation link in the About screen that opens the user's default external web browser via the system launcher; no web traffic ever routes through Lirune Reader itself.

## DRM Policy
Lirune Reader rejects DRM-protected and encrypted-resource files; it does not contain DRM-circumvention tools or proprietary decryption keys.

## Data Removal
Uninstalling the application removes the app and its internal files. Users may back up their SQLite database or exported notes before resetting device storage.
