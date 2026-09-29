# Third-Party Notices

Lirune Reader distributes the following runtime and build dependencies. Their license texts are included in the installed application where provided by the package manager.

- `epubjs` 0.3.x: MIT License.
- `jszip` 3.10.x: MIT License.
- `pdfjs-dist` 3.11.x (Apache License 2.0): the PDF rendering engine is
  **vendored into the mobile application bundle** by `mobile/scripts/gen-pdfjs.js`
  so that PDF reading works with no network access. The unmodified license text
  is preserved at the head of each generated source file.
- Electron 44.x: MIT License and bundled Chromium/Node.js third-party notices.
- `electron-builder` 26.x: MIT License, used for packaging and not required by the installed reader at runtime.

The application does not bundle remote fonts or a third-party online service. See the installed dependency license files and Electron's generated `LICENSES.chromium.html` for the complete notices.

The Novera compatibility identifiers retained in the application are project-local historical identifiers for existing data and do not indicate bundled third-party code.
