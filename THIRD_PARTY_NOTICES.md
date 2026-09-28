# Third-Party Notices

Lirune Reader distributes the following runtime and build dependencies. Their license texts are included in the installed application where provided by the package manager.

## Runtime dependencies

- `epubjs` 0.3.93: BSD-2-Clause License.
  Copyright (c) 2013, FuturePress. All rights reserved.
  The bundled `epubjs` package also ships the Adobe Source Code Pro font
  under the SIL Open Font License 1.1 (`epubjs/types/fonts`). Lirune Reader
  does not use that font; it is included only because it is part of the
  upstream package. Its OFL license text ships alongside it.
- `jszip` 3.10.1: Dual-licensed under MIT OR GPL-3.0-or-later. Lirune Reader
  uses it under the MIT option.
  Copyright (c) 2009-2016 Stuart Knightley, David Duponchel,
  Franz Buchinger, António Afonso.
- `pdfjs-dist` 4.10.38: Apache License, Version 2.0.
  Copyright 2023 Mozilla Foundation and contributors. The full license text
  is shipped as `node_modules/pdfjs-dist/LICENSE` inside the application.
  This product includes software developed at the Mozilla Foundation
  (https://www.mozilla.org/).
- `localforage` 1.10.0: Apache License, Version 2.0. A transitive dependency
  of `epubjs`. Copyright 2013 Mozilla Foundation and contributors.
- `@xmldom/xmldom` 0.7.13: MIT License. A transitive dependency of `epubjs`.
  Copyright (c) 2012-present Xiaoying Zhang and contributors.
- `core-js` 3.x: MIT License. A transitive dependency of `epubjs`.
  Copyright (c) 2014-present, Denis Pushkarev and contributors.
- `lodash` 4.x: MIT License. A transitive dependency of `epubjs`.
  Copyright OpenJS Foundation and other contributors.
- `pako` 1.0.11: MIT AND Zlib License. A transitive dependency of `jszip`.
  Copyright (c) 2018-2024, Andrey Sitnik and contributors (MIT);
  Copyright (c) 1995-2017, Jean-Marc Loutey and contributors (Zlib).
- `isarray` 1.0.0, `marks-pane` 1.0.9, `path-webpack` 0.0.3,
  `@types/localforage` 0.0.34, `event-emitter` 0.3.5: MIT License.
  Transitive dependencies of `epubjs`. These packages do not ship their own
  license file, so their copyright and permission notice is reproduced here.
  - `isarray` — Copyright (c) 2013 Julian Gruber.
  - `marks-pane` — Copyright (c) 2018-present, contributors.
  - `path-webpack` — Copyright (c) 2015-present, contributors.
  - `@types/localforage` — Copyright (c) Microsoft Corporation and contributors.
  - `event-emitter` — Copyright (c) 2013-2017, Arnout de Vries and contributors.
- `lie` 3.3.0, `es5-ext` 0.10.x, `readable-stream` 2.3.8 and their own small
  dependencies (`immediate`, `inherits`, `core-util-is`, `isarray`,
  `process-nextick-args`, `safe-buffer`, `setimmediate`, `string_decoder`,
  `util-deprecate`, `next-tick`, `type`, `ext`, `esniff`, `d`,
  `es6-symbol`, `es6-weak-map`, `es6-iterator`, `es6-number`, `es6-string`,
  `es6-regexp`, `es6-object`, `es6-function`, `es6-collections`,
  `es6-promise`, `esniff`, `next-tick`, `es5-ext`): MIT License
  (`es5-ext` is ISC). These arrive through `localforage` and `jszip`. Their
  license files ship inside the installed packages where the package includes
  one.

## Build-time dependencies

- Electron 44.x: MIT License and bundled Chromium/Node.js third-party notices.
- `electron-builder` 26.x: MIT License, used for packaging and not required by the installed reader at runtime.

## Notes

The application does not bundle remote fonts or a third-party online service. See the installed dependency license files and Electron's generated `LICENSES.chromium.html` for the complete notices.

The Lirune compatibility identifiers retained in the application are project-local historical identifiers for existing data and do not indicate bundled third-party code.

A full provenance review, including assets and test fixtures, is recorded in `IP_LICENSE_AUDIT.md`. That document is an engineering review and not a legal opinion.
