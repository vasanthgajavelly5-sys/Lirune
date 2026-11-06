# Third-Party Notices

Lirune Reader distributes the following runtime and build dependencies. Their license texts are included in the installed application where provided by the package manager.

## Runtime dependencies

- `epubjs` 0.3.93: BSD-2-Clause License.
  Copyright (c) 2013, FuturePress. All rights reserved.
  The bundled `epubjs` package also ships the Adobe Source Code Pro font
  under the SIL Open Font License 1.1 (`epubjs/documentation/html/assets/fonts/`). Lirune Reader
  does not use that font; it is included only because it is part of the
  upstream package. Its OFL license text ships alongside it.
- `jszip` 3.10.1: Dual-licensed under MIT OR GPL-3.0-or-later. Lirune Reader
  uses it under the MIT option.
  Copyright (c) 2009-2016 Stuart Knightley, David Duponchel,
  Franz Buchinger, António Afonso.
  The application loads only `jszip/dist/jszip.min.js`; the `vendor/FileSaver.js`
  source file present in the npm package is not loaded at runtime and is not
  shipped in the application bundle.
- `pdfjs-dist` 4.10.38: Apache License, Version 2.0.
  Copyright 2023 Mozilla Foundation and contributors.
  This product includes software developed at the Mozilla Foundation
  (https://www.mozilla.org/).
- `libarchive-wasm` 1.2.0: MIT License.
  Copyright (c) ofk (https://github.com/ofk/).
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
  EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
  OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
  ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
  DEALINGS IN THE SOFTWARE.
  Bundles `libarchive` WebAssembly binary compiled from libarchive (BSD-2-Clause):
  Copyright (c) 2003-2018 Tim Kientzle. All rights reserved.
  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:
  1. Redistributions of source code must retain the above copyright notice,
     this list of conditions and the following disclaimer.
  2. Redistributions in binary form must reproduce the above copyright notice,
     this list of conditions and the following disclaimer in the documentation
     and/or other materials provided with the distribution.
  THIS SOFTWARE IS PROVIDED BY THE AUTHOR(S) ``AS IS'' AND ANY EXPRESS OR
  IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
  MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
  EVENT SHALL THE AUTHOR(S) BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
  PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
  BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
  OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
  ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
- `localforage` 1.10.0: Apache License, Version 2.0. A transitive dependency
  of `epubjs`. Copyright 2013 Mozilla Foundation and contributors.
- `@xmldom/xmldom` 0.7.13: MIT License. A transitive dependency of `epubjs`.
  Copyright 2019-present Christopher J. Brody and other contributors;
  Copyright 2012-2017 @jindw (jindw@xidea.org) and other contributors.
- `core-js` 3.x: MIT License. A transitive dependency of `epubjs`.
  Copyright (c) 2014-present, Denis Pushkarev and contributors.
- `lodash` 4.x: MIT License. A transitive dependency of `epubjs`.
  Copyright OpenJS Foundation and other contributors.
- `pako` 1.0.11: MIT AND Zlib License. A transitive dependency of `jszip`.
  Copyright (c) 2014-2017, Vitaly Puzrin and Andrei Tuputcyn (MIT);
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