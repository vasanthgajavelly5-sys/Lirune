# IP & License Audit — Lirune Reader 4.0.3

**Repository:** `C:\Users\vasanth\Desktop\Programs\Epub reader`
**Product:** Lirune Reader (package `lirune`, `productName: "Lirune Reader"`, version 4.0.3)
**Former project name:** Novera (still the GitHub repository name and the internal compatibility namespace)
**Branch audited:** `lirune-store-home` (HEAD `2f11b4c Release Lirune Reader 4.0.3`)
**Date of audit:** 2026-09-28

> **Nature of this document.** This is an engineering **provenance and license-compliance audit**, not a legal opinion and not a legal clearance. Nothing here should be read as a statement that the project is "copyright safe", "legally cleared", or free of legal risk. Several items are explicitly escalated to human/legal review in **Section 13**. Where a license could not be verified from files inside this repository, it is classified **PROVENANCE UNKNOWN** and the verification step is stated.
>
> **Read-only guarantee.** This audit was performed read-only. The only file created is this document, `IP_LICENSE_AUDIT.md`. No source file, config file, license file, lockfile, dependency, or build artifact was modified. `npm install`, builds, and packaging were not run.

---

## 1. Scope

### In scope

- Direct and transitive dependency licenses for the desktop application.
- The project's own license and notice files.
- Bundled and referenced binary/visual assets (icons, store logos, fonts).
- The built-in "Welcome to Lirune" first-run book content.
- QA/test fixtures and whether any of them can leak into a production package.
- Source-code provenance signals across the shipped renderer/main-process code.
- Public-facing documentation text and stale product names.
- Git remote/branch facts.

### Explicitly out of scope

- Runtime security review, vulnerability assessment, or dependency CVE status.
- Windows Store / Microsoft Partner Center policy compliance.
- Cryptography or DRM-circumvention analysis (the app explicitly rejects DRM and does not bypass it — see `js/library.js:2342` in the built-in guide text and `docs/PRIVACY.md`).
- Any legal determination about the downloaded third-party books referenced by the untracked `download_*.py` scripts (escalated in Section 13).

### Method and evidence sources

| Evidence | How obtained |
|---|---|
| Dependency licenses | `node_modules/<pkg>/package.json` `license` field, cross-checked against `package-lock.json` `packages[*].license`, and the shipped `LICENSE`/`license` file where present |
| Packaged contents | `dist/win-unpacked/resources/app.asar` enumerated read-only with `node -e "require('@electron/asar').listPackage(...)"` |
| Packaging rules | `package.json` `build.files`, plus the recorded `dist/builder-effective-config.yaml` and `dist/builder-debug.yml` from the last local build |
| Git tracking | `git ls-files`, `git ls-files --others --exclude-standard`, `git ls-files --others --ignored --exclude-standard`, `git check-ignore -v` |
| History of removed content | `git log -S`, `git show <commit> -- <file>` (read-only) |

### A note on the working tree state

The working tree is **not clean**. `git status --short` shows 17 modified tracked files (including `package.json`, `package-lock.json`, `index.html`, `js/library.js`) and 18 untracked entries. Critically, `js/formats.js`, `js/appPrefs.js`, `js/settingsUI.js`, and the whole `js/reader/` directory are **untracked** — they are referenced by `index.html` and are required at runtime, but they are not in git. This is a provenance and release-integrity issue in its own right (see **Section 12**).

---

## 2. Project license

### Declared license

`package.json:29`

```json
"license": "GPL-3.0-only"
```

### License file

`LICENSE` at the repository root is the **full, unmodified GNU General Public License Version 3, 29 June 2007** text (553 lines). Verified by reading the header:

```
                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
```

The `LICENSE` file is unmodified upstream GPL-3.0 text and contains no project-specific copyright header — that is the expected and conventional arrangement for GPL projects, with the project notice carried separately.

### Copyright notice

`COPYRIGHT.md` (4 lines, complete):

```
Copyright © 2026 Vasanth Gajavelly.

Lirune Reader is free and open-source software licensed under
the GNU General Public License v3.0.
```

`package.json:48` (build metadata) carries `Copyright © 2026 Vasanth Gajavelly`; `package.json:28` sets `author: "Vasanth Gajavelly"`.

### Consistency of naming across license surfaces

| Location | Wording | Consistent? |
|---|---|---|
| `package.json:29` | `GPL-3.0-only` | Yes |
| `COPYRIGHT.md:1` | `Copyright © 2026 Vasanth Gajavelly` | Yes |
| `README.md:76` | `Copyright © 2026 Lirune Reader contributors.` | **Divergent** — see below |
| `package.json:48` | `Copyright © 2026 Vasanth Gajavelly` | Yes |

**Finding (naming inconsistency, low severity):** `README.md:76` says "Lirune Reader contributors" while `COPYRIGHT.md:1` and `package.json:48` say "Vasanth Gajavelly". These are not contradictory (a sole author is also a contributor), but for a project that states it is "free and open-source" with a LICENSE that invites contributions, the holder-of-copyright line should be decided deliberately rather than drifting. Flagged for human decision, not as a defect.

### GPL-3.0 obligations relevant to this audit

GPL-3.0 §5 requires that a "Conveyed" work (a binary distribution, which the NSIS installer is) be accompanied by the **Corresponding Source**. Practically, for an Electron app this means the release must be accompanied by complete, buildable source for the application code. This is a compliance obligation that depends on the release process, not on the repository contents alone, and is escalated in **Section 13**.

Note: `COPYRIGHT.md` is **not** included in `build.files` (`package.json:53-65`), so it is not shipped inside `app.asar`. `LICENSE` and `THIRD_PARTY_NOTICES.md` **are** shipped (verified: both present at the asar root).

---

## 3. Dependency inventory

### How licenses were verified

For every package below, the license was read from the `license` field in `node_modules/<pkg>/package.json` and cross-checked against the `license` field recorded in `package-lock.json` `packages["node_modules/<pkg>"]`. Where a `LICENSE`/`license`/`NOTICE` file exists in the package, its existence and first copyright line are noted. Attribution obligation is stated for **redistribution of a binary** (which the NSIS installer is).

### 3.1 Direct production dependencies (shipped in the installer)

| Package | Version | License (SPDX) | Direct/Transitive | Prod/Dev | Attribution required in binary? | Verified where |
|---|---|---|---|---|---|---|
| `epubjs` | 0.3.93 | **BSD-2-Clause** | Direct | prod | **Yes** — retain copyright notice in source *and* binary redistributions | `node_modules/epubjs/package.json` `license`; `node_modules/epubjs/license` line 1: `Copyright (c) 2013, FuturePress`; repo `https://github.com/futurepress/epub.js` |
| `jszip` | 3.10.1 | **(MIT OR GPL-3.0-or-later)** (dual) | Direct | prod | **Yes** under MIT — retain copyright + permission notice | `node_modules/jszip/package.json` `license`; `node_modules/jszip/LICENSE.markdown` line 5: `Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso`; repo `https://github.com/Stuk/jszip.git` |
| `pdfjs-dist` | 4.10.38 | **Apache-2.0** | Direct | prod | **Yes** — Apache-2.0 §4 requires shipping a copy of the License; §4(d) requires retaining any `NOTICE` content | `node_modules/pdfjs-dist/package.json` `license`; `node_modules/pdfjs-dist/LICENSE` (full Apache 2.0 text); repo `git+https://github.com/mozilla/pdf.js.git`, homepage `https://mozilla.github.io/pdf.js/` |

`pdfjs-dist` was added to `package.json` in the **uncommitted** working tree (`git diff package.json` shows the single added line). It is loaded via an ES module shim, `js/reader/pdfjs-loader.js:10`:

```js
import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';
```

`js/reader/pdfjs-loader.js:1-8` contains a project-authored comment explicitly framing the licence boundary:

> *"pdf.js is distributed as ES modules only. This tiny module is the single place where it enters the application; … makes its licence boundary explicit (Apache-2.0)."*

**Also inside `epubjs` but not attributed by the project:** `node_modules/jszip/vendor/FileSaver.js` header reads:

```
/*! FileSaver.js
 *  A saveAs() FileSaver implementation.
 *  By Eli Grey, http://eligrey.com
 *    License: X11/MIT
```

This file is present on disk in `node_modules/jszip/vendor/` and **is** inside the packaged asar (verified: `/node_modules/jszip/vendor/FileSaver.js` in `app.asar`). It is X11/MIT-licensed third-party code whose header says "See LICENSE.md" — but no `LICENSE.md` exists in `node_modules/jszip/vendor/` (only `FileSaver.js`). This is an upstream jszip packaging detail, not a project defect, but it is a concrete attribution-chain gap inside the shipped artifact. See **Section 10**.

### 3.2 Transitive production dependencies actually present in the shipped `app.asar`

These are pulled in by `epubjs` and `jszip` and are enumerated from `app.asar` itself, so this reflects what is really shipped rather than what the lockfile merely permits.

| Package | Version | License (SPDX) | Pulled in by | Attribution required? | License file shipped in asar? | Verified where |
|---|---|---|---|---|---|---|
| `core-js` | 3.50.0 | MIT | epubjs | Yes (MIT notice) | Yes — `core-js/LICENSE` | `node_modules/core-js/package.json`; `LICENSE` |
| `core-util-is` | 1.0.3 | MIT | readable-stream | Yes | Yes | package `LICENSE` |
| `d` | 1.0.2 | ISC | es5-ext | Yes (ISC notice) | Yes | package `LICENSE` |
| `es5-ext` | 0.10.64 | ISC | es6-iterator | Yes | Yes | package `LICENSE` |
| `es6-iterator` | 2.0.3 | MIT | es6-symbol | Yes | Yes | package `LICENSE` |
| `es6-symbol` | 3.1.4 | ISC | epubjs (via marks-pane) | Yes | Yes | package `LICENSE` |
| `esniff` | 2.0.1 | ISC | es5-ext | Yes | Yes | package `LICENSE` |
| `event-emitter` | 0.3.5 | MIT | epubjs | Yes | Yes | package `LICENSE` |
| `ext` | 1.7.0 | ISC | es5-ext | Yes | Yes | package `LICENSE` |
| `immediate` | 3.0.6 | MIT | setimmediate | Yes | Yes — `LICENSE.txt` | package `LICENSE.txt` |
| `inherits` | 2.0.4 | ISC | readable-stream | Yes | Yes | package `LICENSE` |
| `isarray` | 1.0.0 | MIT | readable-stream / setimmediate | Yes | **No license file** | `node_modules/isarray/package.json` only |
| `lie` | 3.3.0 | MIT | localforage, jszip | Yes | Yes — `license.md` | `node_modules/lie/license.md` |
| `localforage` | 1.10.0 | **Apache-2.0** | epubjs | **Yes** — Apache-2.0 requires shipping the License | Yes — `localforage/LICENSE` | `node_modules/localforage/package.json` `license`; repo `https://github.com/localForage/localForage.git` |
| `lodash` | 4.18.1 | MIT | epubjs | Yes | Yes | `node_modules/lodash/package.json`; `LICENSE` |
| `marks-pane` | 1.0.9 | MIT | epubjs | Yes | **No license file** | `node_modules/marks-pane/package.json` only |
| `next-tick` | 1.1.0 | ISC | jszip | Yes | Yes | package `LICENSE` |
| `pako` | 1.0.11 | **(MIT AND Zlib)** | jszip | Yes (both) | Yes — `pako/LICENSE` contains both texts; line 3: `Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn` | `node_modules/pako/package.json`; `LICENSE`; repo `nodeca/pako` |
| `path-webpack` | 0.0.3 | MIT | epubjs | Yes | **No license file** | `node_modules/path-webpack/package.json` only |
| `process-nextick-args` | 2.0.1 | MIT | readable-stream | Yes | Yes — `license.md` | package `license.md` |
| `readable-stream` | 2.3.8 | MIT | jszip | Yes | Yes | package `LICENSE` |
| `safe-buffer` | 5.1.2 | MIT | readable-stream | Yes | Yes | package `LICENSE` |
| `setimmediate` | 1.0.5 | MIT | jszip | Yes | Yes — `LICENSE.txt` | package `LICENSE.txt` |
| `string_decoder` | 1.1.1 | MIT | readable-stream | Yes | Yes | package `LICENSE` |
| `type` | 2.7.3 | ISC | marks-pane | Yes | Yes | package `LICENSE` |
| `util-deprecate` | 1.0.2 | MIT | readable-stream | Yes | Yes | package `LICENSE` |
| `@types/localforage` | 0.0.34 | MIT | epubjs (types-only stub) | Yes (trivial) | **No license file** | `node_modules/@types/localforage/package.json`; lockfile line 809 marks it a deprecated stub |
| `@xmldom/xmldom` | **0.7.13** | **MIT** | epubjs | Yes | Yes — `LICENSE` | Shipped copy verified from `app.asar`: `node_modules/@xmldom/xmldom/package.json` `version: 0.7.13`, `license: MIT`. On-disk top-level `node_modules/@xmldom/xmldom` is 0.8.15 but is the **dev** copy pulled in by `plist`; the production copy lives at `node_modules/epubjs/node_modules/@xmldom/xmldom` (0.7.13). `LICENSE` line 1: `Copyright 2019 - present Christopher J. Brody and other contributors…` |

**Note on `@xmldom/xmldom` (the "xmldom" the audit was asked to look at):** it is **not** a direct dependency of this project. It is a transitive dependency of `epubjs@0.3.93`, which pins `^0.7.5`. The version that ships is **0.7.13**, MIT. The 0.8.15 copy visible at the top level of `node_modules` is marked `"dev": true` in `package-lock.json` and is used by `electron-builder`'s `plist` dependency; it is not the one packaged.

**Note on `core-js`:** 3,903 of the 6,166 entries in `app.asar` are `core-js` files. This is expected — `epubjs` depends on `core-js@^3.18.3` and `epub.min.js` is a prebuilt UMD bundle. It is a build-size issue, not a license issue.

### 3.3 `pdfjs-dist` optional dependency tree — installed but not shipped

`pdfjs-dist@4.10.38` declares an **optional** dependency on `@napi-rs/canvas@^0.1.65`. It is installed in the working tree along with 12 platform-specific binary packages:

| Package | Version | License | Prod/Dev | Shipped in asar? |
|---|---|---|---|---|
| `@napi-rs/canvas` (+ 12 platform variants) | 0.1.100 | MIT | prod (optional) | **No** — verified absent from `app.asar` |

`node_modules/@napi-rs/canvas/package.json` → `license: "MIT"`, repo `https://github.com/Brooooooklyn/canvas.git`. Because these are optional and are not in `build.files`, they are not redistributed. **If `pdfjs-dist` is ever wired into the packaging, this must be re-checked** — MIT requires the notice to travel with the binaries.

### 3.4 Direct dev dependencies (not shipped in the installer)

| Package | Version | License | Attribution required? | Verified where |
|---|---|---|---|---|
| `electron` | 44.3.0 | **MIT** | **Yes** — plus Chromium/Node bundled third-party notices | `node_modules/electron/package.json` `license: "MIT"`; `node_modules/electron/LICENSE` lines 1-2: `Copyright (c) Electron contributors` / `Copyright (c) 2013-2020 GitHub Inc.` |
| `electron-builder` | 26.15.3 | **MIT** | Build-time only; not redistributed in the reader | `node_modules/electron-builder/package.json` `license: "MIT"`; `node_modules/electron-builder/LICENSE` |

**Electron's bundled notices are present in the shipped artifact.** Verified present in `dist/win-unpacked/`: `LICENSE.electron.txt` and `LICENSES.chromium.html`. This satisfies the practical part of Electron's notice obligation for the Chromium/Node third-party components. This is the strongest single attribution fact in the whole audit.

### 3.5 Dev dependency tree — license summary

`package-lock.json` resolves **273** top-level packages. The full dev tree license distribution, read from `node_modules/*/package.json` and the lockfile:

| License | Count | Examples |
|---|---|---|
| MIT | ~205 | electron, electron-builder, ajv, chalk, commander, yargs, undici, form-data |
| ISC | ~35 | semver, glob, rimraf, minimatch, lru-cache, yallist, signal-exit, once |
| BSD-2-Clause | 4 | `@electron-internal/extract-zip`, `@electron/osx-sign`, `@electron/windows-sign`, `dotenv`, `dotenv-expand` |
| BSD-3-Clause | 10 | `asn1js`, `bytestreamjs`, `duplexer2`, `fast-uri`, `global-agent`, `pkijs`, `roarr`, `source-map`, `sprintf-js` |
| Apache-2.0 | 7 | `sumchecker`, `ejs`, `jake`, `filelist`, `exponential-backoff`, `@malept/cross-spawn-promise`, `localforage` |
| BlueOak-1.0.0 | 5 | `chownr`, `isexe`, `minimatch`, `minipass`, `sax`, `tar` |
| Python-2.0 | 1 | `argparse` |
| 0BSD | 1 | `tslib` |
| WTFPL / WTFPL-OR-ISC | 2 | `truncate-utf8-bytes`, `sanitize-filename` |
| MIT-OR-CC0 / MIT-OR-GPL | 2 | `type-fest`, `jszip`, `pako` |

**All permissive.** No copyleft dependency in the dev tree that would impose obligations beyond GPL-3.0's own terms, and no GPL-incompatible license detected. `argparse` under `Python-2.0` and `BlueOak-1.0.0` are unusual but are permissive, dev-only, and not redistributed.

### 3.6 Mobile (`mobile/`) dependency tree — separate product surface, not shipped in the Windows installer

`mobile/package.json` declares Expo 57 / React Native 0.86 / React 19.2.3. `mobile/package-lock.json` is a separate 233 KB lockfile. These are **not** part of the desktop build (`build.files` does not reference `mobile/`). `mobile/LICENSE` is an MIT license naming **650 Industries, Inc. (Expo)** — i.e. the standard Expo starter license, not a project-authored license. This is a licensing surface that exists in the repository but is not exercised by the Windows release; see **Section 11**.

### 3.7 Runtime font dependencies — none

Verified: **no font files** (`.woff`, `.woff2`, `.ttf`, `.otf`, `.eot`) are bundled by the project, and **no `@font-face` rule and no remote font URL** exists in `index.html` or any file in `css/`. `index.html:7` sets a strict CSP with `font-src 'self' data:` and `connect-src 'self'`, which would block remote fonts at runtime. `docs/PRIVACY.md` states the app "no longer depends on Google Fonts", and `CHANGELOG.md` 4.0.0 records "Added offline CSP and removed Google Fonts runtime dependency" — both claims verified as accurate.

**One nuance worth recording:** `css/tokens.css:336-343` and `index.html:536-560` name commercial typefaces as *preferred* local fonts:

```css
--font-ui:      'Cormorant Garamond', Georgia, 'Times New Roman', serif;
--font-lora:    'Lora', Georgia, 'Times New Roman', serif;
--font-playfair:'Playfair Display', Georgia, serif;
--font-mono:    'JetBrains Mono', 'Fira Code', Consolas, monospace;
```

These are **CSS family-name references, not embedded fonts**. The app does not ship the font software, does not download it, and simply falls back to Georgia/Consolas when the user does not have the named face installed. Naming a typeface in CSS is not distribution of that typeface. **No font license obligation arises from the project.** This is worth stating explicitly because the audit brief asked about it.

---

## 4. Third-party notices

### 4.1 What the project ships today

`THIRD_PARTY_NOTICES.md` (12 lines, complete):

```
# Third-Party Notices

Lirune Reader distributes the following runtime and build dependencies. Their license texts are included in the installed application where provided by the package manager.

- `epubjs` 0.3.93: BSD-2-Clause License.
- `jszip` 3.10.1: Dual-licensed under MIT OR GPL-3.0-or-later.
- Electron 44.x: MIT License and bundled Chromium/Node.js third-party notices.
- `electron-builder` 26.x: MIT License, used for packaging and not required by the installed reader at runtime.

The application does not bundle remote fonts or a third-party online service. See the installed dependency license files and Electron's generated `LICENSES.chromium.html` for the complete notices.

The Lirune compatibility identifiers retained in the application are project-local historical identifiers for existing data and do not indicate bundled third-party code.
```

### 4.2 Concrete gaps between what is shipped and what is documented

The notices file takes a reasonable stance — it names the headline dependencies and delegates to the license files shipped inside the package. That approach is defensible. But measured against what is actually inside `app.asar`, there are four concrete gaps.

| # | Gap | Evidence | Severity |
|---|---|---|---|
| **G1** | **`pdfjs-dist` (Apache-2.0) is not mentioned at all** in `THIRD_PARTY_NOTICES.md`, despite being a direct production dependency loaded at runtime. Apache-2.0 §4(a) requires that recipients receive a copy of the License when you distribute the Work or a Derivative of it. The file is also not inside `build.files` in any form, so no `pdfjs-dist/LICENSE` is shipped. | `package.json:110` declares it; `js/reader/pdfjs-loader.js:10` imports it; `index.html:23` loads the shim; `THIRD_PARTY_NOTICES.md:5-8` omits it; `app.asar` contains **0** pdfjs files | **High** |
| **G2** | **`localforage` (Apache-2.0) is not mentioned** in the notices file, though it ships inside `app.asar` at `node_modules/localforage/` (43 entries) with its `LICENSE`. | `app.asar` enumeration; `node_modules/localforage/package.json` | Medium |
| **G3** | **~26 other shipped third-party packages are not enumerated** — core-js, lodash, pako, @xmldom/xmldom, lie, marks-pane, event-emitter, type, es5-ext/es6-*/esniff/ext/d, readable-stream and its 6 deps, string_decoder, safe-buffer, process-nextick-args, isarray, next-tick, setimmediate, immediate, inherits, core-util-is, path-webpack, @types/localforage. The file's blanket statement ("license texts are included in the installed application") is **true for 25 of 26 of them**, but `isarray`, `marks-pane`, `path-webpack`, and `@types/localforage` ship **with no license file at all**. | `app.asar` enumeration: `isarray`, `marks-pane`, `path-webpack`, `@types/localforage` return no license file | Medium |
| **G4** | **`@xmldom/xmldom` (MIT) is not named** despite being a real shipped runtime component that parses untrusted EPUB XML. | `app.asar`: `node_modules/@xmldom/xmldom` present with `LICENSE` | Low |

### 4.3 What the project gets right

- `LICENSE` (GPL-3.0) **is** shipped inside `app.asar` (verified at the archive root).
- `THIRD_PARTY_NOTICES.md` **is** shipped inside `app.asar`.
- `LICENSES.chromium.html` and `LICENSE.electron.txt` are shipped in `dist/win-unpacked/` — this is the correct and complete way to discharge Electron/Chromium's notice obligations.
- The project does not misstate that fonts are bundled; that claim is accurate.
- The final paragraph of the notices file, explaining that `Novera` identifiers are local compatibility identifiers rather than bundled third-party code, is a correct and useful clarification.
- No third-party license text is copied into the project's own files, which avoids the derivative-licensing question entirely.

### 4.4 The `build.files` allowlist excludes the license files it needs

`package.json:53-65`:

```json
"files": [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "main.js",
  "preload.js",
  "scripts/storage-contract.js",
  "index.html",
  "css/**/*",
  "js/**/*",
  "assets/**/*",
  "node_modules/epubjs/**/*",
  "node_modules/jszip/**/*"
]
```

Note what is **absent**: `node_modules/pdfjs-dist/**/*`. This is simultaneously a **packaging bug** (PDF import will fail in a packaged build — see Section 12) and a **license gap** (the Apache-2.0 text has no path into the distribution). Fixing the bug fixes the license gap.

---

## 5. Asset inventory

### 5.1 Project assets (`assets/` and `build/`)

| File | Size | Origin | License | Attribution required? | Evidence |
|---|---|---|---|---|---|
| `assets/icon.png` | 4,227 B | **Generated in-house** | Project-owned (falls under GPL-3.0) | No | Produced by `generate_icon.py:4-27` (`create_icon()`) — pure Pillow `ImageDraw` primitives, no external source |
| `assets/icon.ico` | 25,607 B | **Generated in-house** | Project-owned | No | `generate_icon.py:29-33` — multi-resolution ICO built from the same drawn image |
| `assets/StoreLogo_1080x1080.png` | 10,884 B | **Generated in-house** | Project-owned | No | `generate_icon.py:35-94` (`create_store_logos()`) |
| `assets/StoreLogo_2160x2160.png` | 31,800 B | **Generated in-house** | Project-owned | No | Same generator |
| `build/appx/StoreLogo.png` | 2,203 B | **Generated in-house** (Store tile variant) | Project-owned | No | Tracked in git; consumed by `scripts/build-store.js:13` |
| `build/appx/Square44x44Logo.png` | 1,919 B | Generated in-house | Project-owned | No | Same |
| `build/appx/Square150x150Logo.png` | 6,549 B | Generated in-house | Project-owned | No | Same |
| `build/appx/Wide310x150Logo.png` | 5,899 B | Generated in-house | Project-owned | No | Same |

**Conclusion: the entire "Lirune" brand identity is drawn from scratch by a 98-line Python script using nothing but `PIL.ImageDraw` rectangles, polygons, and lines.** No stock icon, no icon font, no template, no traced artwork. This is the cleanest part of the audit.

The brand mark is also drawn a second time, independently, in pure code: `generateWelcomeCoverDataUrl()` at `js/library.js:2645-2769` draws the welcome-book cover on a `<canvas>` with `createLinearGradient`, `roundRect`, `quadraticCurveTo`, and `fillText` calls. Also project-authored.

### 5.2 In-repo UI graphics

All UI iconography is **inline SVG written directly into `index.html` and generated from JS in `js/utils.js` and `js/library.js`** — approximately 40 hand-authored `<svg>` elements using `stroke="currentColor"` and a 24×24 viewBox. Examples: `index.html:44` (app logo), `index.html:58` (search), `index.html:67` (grid view), `index.html:273` (bookmark), `index.html:288` (expand).

**Attribution note for human review:** these follow a very common 24×24 / `stroke-width: 2` / round-cap-and-join outline convention that is widely shared across open-source icon sets (Lucide, Feather, Heroicons and relatives use near-identical geometry for search, plus, bookmark, and chevrons). This audit is deliberately **conservative**: geometric similarity of simple primitives (a magnifier, a plus sign, a chevron) is not evidence of copying, and no icon library is imported, vendored, or referenced anywhere in the repository. Classified **OWN CODE**, with the observation recorded for transparency rather than as a finding.

There are **no standalone `.svg` files** in the repository, **no `.jpg`/`.jpeg`/`.webp` files** anywhere, and **no `.mp3`/`.wav` files** anywhere. The single non-PNG vector file in the tree is `node_modules/jszip/graph.svg` inside the dependency, not project content.

### 5.3 Fonts

**Project-bundled fonts: none. Remote fonts: none. This is a clean result.**

- No `@font-face` rule in `index.html` or any of the 6 files in `css/` (verified by regex search across all of them).
- No `fonts.googleapis.com` or `fonts.gstatic.com` reference in `index.html` or `css/`.
- No font binaries (`*.woff*`, `*.ttf`, `*.otf`, `*.eot`) anywhere in the tracked tree.
- `index.html:7` CSP: `font-src 'self' data:; connect-src 'self'` — remote font loading is blocked at runtime by policy, not merely by convention.

The named typefaces (`Cormorant Garamond`, `Lora`, `Playfair Display`, `Inter`, `JetBrains Mono` — `css/tokens.css:336-343`, `js/settingsUI.js:38-44`) are CSS family-name preferences with system fallbacks. **No font license obligation arises.** This directly contradicts the risk the audit brief anticipated, and it is worth stating plainly so it is not re-litigated.

### 5.4 Book cover images

Cover images are **never bundled**. They are either (a) extracted at import time from the user's own EPUB/CBZ and stored as a runtime data URL (`js/library.js:857`, `:906`, `:931`, `:975`), or (b) generated at runtime by the project-authored canvas routine. No third-party cover artwork exists in the repository or in the packaged application.

### 5.5 One third-party asset that *is* shipped, unintentionally

`epubjs@0.3.93` ships a `documentation/` folder containing the **Adobe Source Code Pro** font family in 14 binary formats (`.eot`, `.otf`, `.ttf`, `.woff`, `.woff2`) plus `source-code-pro.css`. Verified in the shipped asar:

```
/node_modules/epubjs/documentation/html/assets/fonts/EOT/SourceCodePro-Bold.eot
/node_modules/epubjs/documentation/html/assets/fonts/OTF/SourceCodePro-Regular.otf
/node_modules/epubjs/documentation/html/assets/fonts/TTF/SourceCodePro-Bold.ttf
/node_modules/epubjs/documentation/html/assets/fonts/WOFF2/...   (×2)
/node_modules/epubjs/documentation/html/assets/fonts/WOFF/...    (×2)
...  (41 epubjs/documentation entries in total)
```

`node_modules/epubjs/documentation/html/assets/fonts/LICENSE.txt` line 1 reads:

> `Copyright 2010, 2012 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name 'Source'. All Rights Reserved.`

licensed under **SIL Open Font License 1.1**.

**Assessment:** these are documentation-only assets of the epub.js project, not used by Lirune at all — Lirune loads `epub.min.js`, not the docs. The **OFL 1.1 license text ships alongside them** in the asar, so the OFL's own notice requirement is technically satisfied. But this is ~41 files of pure dead weight in a signed installer, and the reserved-font-name clause in the OFL makes font redistribution a legally sensitive area generally. Classified **THIRD-PARTY WITH LICENSE (OFL-1.1), shipped unintentionally, notice technically present**. Recommend narrowing the packaging filter rather than treating it as a blocker.

---

## 6. Sample-content review

### 6.1 The old "Alice in Wonderland" sample content has been removed — verified

The desktop sample book was **"Alice's Adventures in Wonderland"** and is **no longer present** in the current code. This was confirmed three independent ways:

1. **Current working tree:** A repo-wide search (excluding `node_modules`, `dist`, `.git`, `.qa-userdata`) for `Alice in Wonderland`, `Alice's Adventures`, `Lewis Carroll`, `Charles Dodgson`, `Wonderland`, `Through the Looking-Glass`, `Peter Pan`, `A Tale of Two Cities` returns **zero matches in any shipped desktop source file**. The only hits are in excluded locations:
   - `.kilo/worktrees/just-duck/js/library.js:958-1168` — a stale Kilo agent-manager worktree, excluded by `.git/info/exclude:9`
   - `mobile/src/sampleBooks.ts:6-7` — mobile placeholder metadata (see 6.4)
   - `qa/suite-core.mjs:330` — a comment about the test corpus

2. **Git history:** `git log -S "Alice's Adventures in Wonderland" -- js/library.js` returns two commits. `git show e67ed56 -- js/library.js` ("Prepare Lirune Reader 4.0.1", 2026-09-25) shows the exact removal, including the deleted public-domain text:

   ```
   -  // Built-in Sample Classic EPUB Generator (Alice's Adventures in Wonderland)
   +  // Built-in Sample Guide EPUB Generator (Welcome to Lirune)
   -  Utils.toast('Generating sample book: "Alice in Wonderland"...');
   +  Utils.toast('Generating sample book: "Welcome to Lirune"...');
   -  <dc:creator>Lewis Carroll</dc:creator>
   -  <dc:identifier ...>urn:uuid:novera-sample-alice-1865</dc:identifier>
   +  <dc:identifier ...>urn:uuid:lirune-welcome-guide-4-0</dc:identifier>
   ```

   `git show HEAD:js/library.js | Select-String "Alice"` returns **0 matches**, confirming the removal is committed.

3. **Changelog:** `CHANGELOG.md:3-7` records it explicitly:
   > *"Replaced legacy sample book with an original built-in first-run tutorial: 'Welcome to Lirune'."* and *"Removed all legacy sample references and third-party sample text."*

**Legal significance of the removal:** the removed text was Charles Dodgson's 1865 work, which is unambiguously in the public domain in essentially all jurisdictions, so the original inclusion was very likely fine. The removal is nonetheless a good hygiene outcome — the project no longer ships *any* third-party literary text, which removes an entire class of questions about edition-specific text, translation rights, and cover artwork.

### 6.2 The current "Welcome to Lirune" book is original project-authored content

`generateSampleBook()` at `js/library.js:1948` builds a complete EPUB at runtime with JSZip, containing 11 chapters. Read in full. Every paragraph is product documentation written for this project. Verbatim samples:

- `js/library.js:2093` — *"Lirune is a calm, local-first EPUB reader for Windows. It is designed to keep your personal reading experience focused and your library safely on your computer."*
- `js/library.js:2096` — *"Lirune is built upon five foundational principles:"* followed by a five-item list (Local, Private, Focused, Customizable, Windows-Friendly)
- `js/library.js:2253` — *"Choose from six curated highlight shades: Yellow, Blue, Green, Pink, Purple, or Orange."*
- `js/library.js:2514-2552` — a keyboard-shortcut table whose entries match the actual bindings in `js/settings.js` and `js/app.js`
- `js/library.js:2599` — a link to the project's own Buy Me a Coffee page

**No excerpt, quotation, or passage from any published work appears.** The book documents the product that ships it. Classified **OWN CODE / project-authored content**.

**Verification that could not be completed:** authorship of prose written with AI assistance cannot be established or refuted from the repository alone. See **Section 7**.

### 6.3 No third-party book metadata remains embedded in the desktop app

Searched for hard-coded book metadata (titles, authors, ISBNs) across `js/`, `index.html`, `main.js`, `preload.js`. Every book-related identifier in the shipped code is either a UI label, a format identifier, or a `data-*` attribute:

- `js/library.js:794`, `:1374`, `:1711` — `'Unknown Author'` / `book.author || 'Unknown'` placeholders
- `js/formats.js:20-27` — format definitions (`epub`, `pdf`, `txt`, `html`, `fb2`, `cbz`, `mobi`, `cbr`) with MIME types and capability flags
- `js/library.js:2611-2626` — the welcome book's own metadata record, all project-authored

**No third-party book title, author, ISBN, or cover is embedded in the desktop application.** Classified **clean**.

### 6.4 The mobile app does retain third-party book metadata

`mobile/src/sampleBooks.ts` (34 lines, complete) hard-codes three placeholder library entries:

```ts
{ id: 'alice',       title: 'Alice in Wonderland',              author: 'Lewis Carroll' }
{ id: 'frankenstein', title: 'Frankenstein',                    author: 'Mary Shelley' }
{ id: 'sherlock',     title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle' }
```

with invented progress percentages, chapter names, and descriptions. Consumed at `mobile/App.tsx:14,20` as the initial library state.

**Assessment:** this is **title-and-author metadata only** — no text, no cover image, no excerpt. All three works are long out of copyright, and factual bibliographic references (title, author) are not copyrightable subject matter. The fictional descriptions are project-written. So this is very likely low-risk.

**However**, it is inconsistent with the desktop cleanup, and the chapter name `"Chapter VII · A Mad Tea-Party"` (`mobile/src/sampleBooks.ts:12`) references a specific chapter of a specific edition — a stronger reference than title/author alone. Classified **THIRD-PARTY METADATA (public-domain works, no text included) — low risk, flagged for consistency**. Not packaged in the Windows release.

### 6.5 Test corpora contain real books — see Section 7

The QA corpus used by `qa/suite-formats.mjs:32-40` references `pg1342-ni.epub` (Project Gutenberg #1342, *Pride and Prejudice*), `naca-to-nasa.pdf`, `srm/Elf_Receiver_Radio-Craft_August_1936.cbz` (*Radio-Craft*, 1936 — a **commercial magazine, not public domain**), and `srm/bobby_make_believe_sample.cbz`. These live in `%TEMP%\kilo\lirune-corpus`, **outside the repository**, and are covered in **Section 7**.

---

## 7. Test-fixture review

### 7.1 Are any test fixtures tracked in git? — Verified: no book files are tracked

Full `git ls-files` output (83 files) was enumerated. Filtering for book/document/archive extensions:

```
$ git ls-files | grep -E '\.(epub|pdf|txt|html|fb2|cbz|azw3|cbr|zip)$'
(no results)
```

The only tracked binary assets are the 11 PNG/ICO brand files listed in Section 5.1. **Zero EPUB, PDF, TXT, HTML, FB2, CBZ, AZW3, CBR, or ZIP files are tracked in git.**

### 7.2 Untracked book files present on disk

| File | Size | Git status | Ignored? | Rule |
|---|---|---|---|---|
| `downloads/The_Villain_Refused_To_Play_By_The_Script.epub` | 1,897 B | Untracked | **Yes** | `.gitignore:9` → `*.epub` |
| `.qa-userdata/books/3f6bb9d6….txt` | 772 KB | Untracked | **Yes** | `.gitignore:13` → `.qa-userdata/` |
| `.qa-userdata/books/420b05f6….html` | 806 KB | Untracked | **Yes** | same |
| `.qa-userdata/books/767f00c2….cbz` | 1.1 MB | Untracked | **Yes** | same |
| `.qa-userdata/books/d650f338….pdf` | **12.4 MB** | Untracked | **Yes** | same |
| `.qa-userdata/books/ebc9cfb6….pdf` | 14.9 KB | Untracked | **Yes** | same |
| `.qa-userdata/books/ec9ce7fa….cbz` | 1.7 MB | Untracked | **Yes** | same |
| `.qa-userdata/books/10bf31d1….fb2` | 733 B | Untracked | **Yes** | same |

Confirmed via `git check-ignore -v`:
```
.gitignore:9:*.epub     downloads/The_Villain_Refused_To_Play_By_The_Script.epub
.gitignore:13:.qa-userdata/  .qa-userdata/window-state.json
```

`.gitignore` also covers `Master_EPUB_Library_All/`, `qa/artifacts/`, `corpus-inventory.txt`, `corpus-failures.txt`, and all credential/certificate extensions (`.pem`, `.key`, `.pfx`, `.p12`, `*.env`). This is a well-constructed ignore file.

### 7.3 THE CRITICAL QUESTION: would any QA/dev material leak into a production package?

**Answer: No, and the mechanism is a positive allowlist rather than a fragile denylist.** This was verified three ways.

**(a) The `files` allowlist.** `package.json:53-65` lists exactly what ships. Anything not matching one of those patterns is excluded. `dist/builder-effective-config.yaml` (the config electron-builder actually used for the last build) confirms the same list was applied.

**(b) Direct verification against the real artifact.** `app.asar` was enumerated: 6,166 entries. Every one falls under `LICENSE`, `THIRD_PARTY_NOTICES.md`, `package.json`, `main.js`, `preload.js`, `index.html`, `css/`, `js/`, `assets/`, `scripts/storage-contract.js`, or `node_modules/`. Explicitly confirmed **absent** from the archive:

| Material | In `app.asar`? | Why |
|---|---|---|
| `qa/` (9 `.mjs` dev-tooling files) | **No** | Not in `build.files` |
| `Batch1-Fixes/`, `Batch2-Fixes/`, `Batch3-Fixes/` (~90 files, full app snapshots) | **No** | Not in `build.files` |
| `Lirune-Reader-Source.zip`, `Lirune-Reader-Current-State.zip` | **No** | Not in `build.files` |
| `debug_page.html` (82 KB) | **No** | Not in `build.files` |
| `download_*.py` (7 scripts) | **No** | Not in `build.files` |
| `test/storage-contract.test.js` | **No** | Not in `build.files` |
| `scripts/lint.js`, `build-win.js`, `build-store.js`, `validate-*.js` | **No** | Only `scripts/storage-contract.js` is allowlisted |
| `docs/` (5 `.md` files) | **No** | Not in `build.files` |
| `generate_icon.py` | **No** | Not in `build.files` |
| `Launch-Novera.bat` | **No** | Not in `build.files` |
| `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `COPYRIGHT.md`, `README.md` | **No** | Not in `build.files` |
| `Master_EPUB_Library_All/`, `downloads/`, `.qa-userdata/` | **No** | Not in `build.files` (and absent from disk for the first) |

**(c) The `Lirune-Reader-*.zip` archives.** Inspected read-only with `System.IO.Compression.ZipFile.OpenRead`. Both contain the same 32 entries: 7 `js/*.js`, 6 `css/*.css`, 8 `scripts/*.py`→`scripts/*.js`, 4 `assets/*`, `index.html`, `package.json`, `package-lock.json`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `README.md`. **No books, no QA material.** They are stale source snapshots from an earlier version and are not packaged.

**Assessment:** the packaging configuration is sound with respect to QA/dev leakage. This is the strongest part of the audit alongside the asset inventory.

### 7.4 Gaps in the packaging config worth noting (none of which leak QA material)

| # | Gap | Evidence | Impact |
|---|---|---|---|
| P1 | **`js/reader/` and `js/formats.js` are NOT in the built artifact** | `app.asar` has 0 entries under `js/reader/`; `js/formats.js` absent; the asar's `index.html` is 58,800 bytes vs 72,130 on disk, and its script list stops at 9 scripts vs 17 in the current `index.html` | **The built installer is stale** — see Section 12 |
| P2 | **`pdfjs-dist` is not in `build.files`** | `package.json:53-65`; 0 pdfjs entries in `app.asar` | **PDF import will fail at runtime** in a packaged build — see Section 12 |
| P3 | `validate-release.js:12` forbids only `Master_EPUB_Library_All`, `.env`, `.pfx`, `.p12`, `.pem`, `.key` in `dist/` | read directly | The validator would not catch a future accidental inclusion of `qa/` or a stray book file. Recommend extending the list as defence-in-depth. |
| P4 | `build/files` omits `COPYRIGHT.md`, `README.md`, `docs/`, `CHANGELOG.md` | `package.json:53-65` | Minor. GPL source-obligation is about the release as a whole, not the asar. But shipping `COPYRIGHT.md` and `README.md` inside the app would make the in-app attribution story self-contained. |
| P5 | `nsis.include: "scripts/nsis-include.nsh"` is configured but **the file does not exist** in the working tree | `package.json:104`; `Test-Path scripts/nsis-include.nsh` → False. It exists only inside the `Batch*-Fixes/` snapshots and inside the `Lirune-Reader-*.zip` archives | A fresh `electron-builder` run may fail or warn. Note that `docs/WINDOWS_RELEASE.md:3` says "No custom NSIS script or uninstall hook is configured", which contradicts `package.json:104`. Likely leftover config. |

### 7.5 Untracked dev scripts that scrape third-party content — escalate

Seven Python scripts sit in the repository root, all untracked but **not gitignored**:

```
download_crimson_browser.py   download_crimson_direct.py    download_crimson_hybrid.py
download_crimson_manual.py    download_crimson_your_chrome.py
download_novels.py            download_novels_playwright.py
```

`download_crimson_browser.py:20` shows the target:
```python
novel_url = "https://crimsonscrolls.net/novel/the-villain-refused-to-play-by-the-script/"
```
`download_novels.py:2-4`: *"Download novels from CrimsonScrolls (using WP REST API) and Novelpia and convert to EPUB."* They use `cloudscraper`, `playwright`, `bs4`, and `ebooklib` to scrape and repackage web novels into EPUBs, with anti-bot evasion headers.

**These do not ship** (verified: no `download_*.py` in `app.asar`; not in `build.files`). But they exist in the working tree, they are **not** in `.gitignore`, and one has already produced `downloads/The_Villain_Refused_To_Play_By_The_Script.epub`.

Three distinct concerns, in ascending order of importance:
1. **Hygiene:** these are untracked and unignored, so a careless `git add -A` would commit them to a public repository. Recommend adding them (and `downloads/`, `debug_page.html`, `Lirune-Reader-*.zip`, `Batch*-Fixes/`) to `.gitignore` or moving them out of the tree.
2. **ToS / robots:** automated scraping with anti-bot-evasion headers is a terms-of-service question for the target sites, independent of copyright.
3. **Copyright of the scraped output:** a contemporary commercial web novel is almost certainly in copyright. The generated EPUB is a derivative reproduction. This is escalated to **Section 13**. The mitigating facts are that none of it is tracked, none of it is packaged, and `README.md:61` and `CONTRIBUTING.md:33` both explicitly instruct contributors not to redistribute copyrighted EPUB files.

---

## 8. Source-code provenance findings

Searched all tracked and untracked source (`.js`, `.html`, `.css`, `.md`, `.ts`, `.tsx`, `.mjs`, `.json`, `.py`, `.bat`, `.nsh`, `.yml`) excluding `node_modules`, `dist`, `.git`, `.qa-userdata`, and the `.kilo` worktree, for: `copied from`, `adapted from`, `based on`, `borrowed from`, `TODO: remove`, `vendor`, `@license`, `Copyright (c)`, `SPDX-License`, `public domain`, `stackoverflow.com`, `github.com`, `gist.github.com`.

### 8.1 Findings

| # | Location | Match | Classification | Reasoning |
|---|---|---|---|---|
| F1 | `js/library.js:2342` | `Lirune respects copyright and digital packaging standards. Encrypted or DRM-protected files (such as Adobe ADEPT or proprietary vendor locks) cannot be opened.` | **OWN CODE** | Prose inside the generated welcome book. Mentions Adobe ADEPT as a technical format name, not as copied text. |
| F2 | `COPYRIGHT.md:1` | `Copyright © 2026 Vasanth Gajavelly.` | **OWN CODE** | Project's own notice. |
| F3 | `LICENSE:4` and other GPL lines | `Copyright (C) 2007 Free Software Foundation` | **OWN CODE (verbatim upstream)** | The unmodified GPL-3.0 license text. Not a provenance concern. |
| F4 | `download_crimson_direct.py:69` | `# Download chapters 1-170 (based on the chapter list showing 170 chapters)` | **OWN CODE** | A comment about a scraped page's contents, not about source code. |
| F5 | `package.json:32,35,37`, `README.md:40,41`, `SECURITY.md:13` | `github.com/vasanthgajavelly5-sys/Novera` | **OWN CODE** | The project's own repository. |
| F6 | `mobile/LICENSE:3` | `Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)` | **THIRD-PARTY WITH LICENSE** | The standard Expo template MIT license, correctly retaining Expo's copyright. Not a defect; simply a license surface to be aware of. |
| F7 | `mobile/.gitignore:1`, `package-lock.json` (many) | `github.com/sponsors/...` URLs | **THIRD-PARTY METADATA** | npm funding metadata inside the lockfile. Not code. |

### 8.2 What was NOT found (negative findings, recorded explicitly)

- **No** `stackoverflow.com` URL anywhere in the repository outside `node_modules`.
- **No** `gist.github.com` URL.
- **No** `copied from`, `adapted from`, `borrowed from`, or `TODO: remove` in any project file.
- **No** `@license`, `SPDX-License-Identifier`, or third-party `Copyright (c)` header in **any shipped source file** — checked `index.html`, `main.js`, `preload.js`, all 19 files in `js/`, all 6 files in `css/`.
- **No** vendored third-party JavaScript in the project tree. All third-party runtime code arrives through `node_modules` and is loaded by reference from `index.html:19-20` and `js/reader/pdfjs-loader.js:10`. There is no inlined or pasted third-party source.
- **No** stack traces, decompiled output, or minified blobs pasted into project files.
- **No** book text, lyrics, poems, or other literary content in any source file.

### 8.3 Classification summary

Every file in the shipped application classifies as **OWN CODE**, with the sole exception of the runtime dependencies in `node_modules` (Section 3), the Expo template license in `mobile/` (F6), and the third-party book metadata in `mobile/src/sampleBooks.ts` (Section 6.4).

### 8.4 AI-code provenance note

**The project contains AI-assisted code. This audit makes no claim, and none can be made, that AI-generated code is copyright-free or copyrighted.** The practical implications:

1. **Authorship of the project's own code is not in question here.** The declared author is a single named human (`package.json:28`, `COPYRIGHT.md:1`, `index.html:752` "Created by **Vasanth Gajavelly**"), and all git commits are authored by `Vasanth Gajavelly <vasanth.gajavelly2000@gmail.com>`. The copyright in a GPL work vests in the human author; the tool is not an author.

2. **What is actually verifiable.** I searched the shipped source for copied third-party code and found none (Section 8.2). That is a real, evidence-backed result: no third-party source was pasted into this project.

3. **What is not verifiable from the repository.** Whether any generated passage happens to reproduce protected expression closely enough to raise a question cannot be determined by searching the repository for attribution strings. It requires comparing the project's prose against a corpus, which is a legal-review task, not an engineering one. Escalated to **Section 13**.

4. **Places where third-party code IS incorporated** (the complete list, from findings above):

   | Location | What | License | Notice shipped? |
   |---|---|---|---|
   | `node_modules/epubjs/` → `index.html:20` loads `dist/epub.min.js` | epub.js browser bundle | BSD-2-Clause | **Yes** — `node_modules/epubjs/license` in asar |
   | `node_modules/jszip/` → `index.html:19` loads `dist/jszip.min.js` | JSZip bundle | MIT OR GPL-3.0-or-later | **Yes** — `LICENSE.markdown` in asar |
   | `node_modules/jszip/vendor/FileSaver.js` (in asar) | Eli Grey FileSaver.js | X11/MIT | **Header only** — points to a `LICENSE.md` that does not exist in the vendor dir |
   | `node_modules/epubjs/documentation/…/fonts/` (41 files in asar) | Adobe Source Code Pro | OFL-1.1 | **Yes** — `LICENSE.txt` in asar |
   | `node_modules/localforage/`, `core-js/`, `lodash/`, `pako/`, `@xmldom/xmldom/`, and 20+ others (in asar) | Transitive runtime deps | MIT / ISC / Apache-2.0 | Mostly **yes** (25/26) |
   | `node_modules/pdfjs-dist/` (referenced, **not shipped**) | Mozilla pdf.js | Apache-2.0 | **No** — see Section 12 |
   | Electron/Chromium runtime (`dist/win-unpacked/`) | Electron 44.3.0 | MIT + bundled notices | **Yes** — `LICENSES.chromium.html`, `LICENSE.electron.txt` |

---

## 9. Potential license compatibility issues

**Overall finding: no license incompatibility was found.** GPL-3.0-only is one of the most permissive "copyleft-outbound" choices available and is compatible with every license in the dependency tree. Stated as an engineering compatibility observation, not a legal clearance.

### 9.1 Compatibility matrix

| Dependency | License | GPL-3.0 compatible? | Notes |
|---|---|---|---|
| `epubjs` | BSD-2-Clause | **Yes** | Permissive; only obligation is notice retention |
| `jszip` | MIT **OR** GPL-3.0-or-later | **Yes** | Dual-licensed. The project can satisfy this by shipping the MIT path (retain notice) **or** the GPL-3.0-or-later path. MIT is the lower-obligation choice and is what the shipped `LICENSE.markdown` provides. |
| `pdfjs-dist` | Apache-2.0 | **Yes** | Apache-2.0 → GPLv3 is a well-established one-way compatibility. Two practical conditions: (a) ship a copy of the Apache-2.0 License; (b) **do not** apply the Apache patent grant in a way that conflicts — in practice, add a `NOTICE`-preservation step and retain any `NOTICE` file. `pdfjs-dist` contains **no `NOTICE` file** (verified: package root contains only `CODE_OF_CONDUCT.md`, `LICENSE`, `package.json`, `README.md`, `webpack.mjs`), so condition (b) reduces to (a) plus retaining the license text. |
| `localforage` | Apache-2.0 | **Yes** | Same conditions; `LICENSE` does ship in the asar. |
| `pako` | (MIT AND Zlib) | **Yes** | Both conjuncts are permissive. `pako/LICENSE` ships and contains both texts. |
| `@xmldom/xmldom` | MIT | **Yes** | Notice ships. |
| `electron` | MIT | **Yes** | Plus Chromium's bundled notices, which ship. |
| `electron-builder` | MIT | **Yes** | Build-time only. |
| `lodash`, `core-js`, `lie`, `marks-pane`, `type`, `readable-stream` + 6 deps, `es5-ext`/`es6-*`/`esniff`/`ext`/`d`, `event-emitter`, `setimmediate`, `immediate`, `inherits`, `core-util-is`, `isarray`, `path-webpack`, `next-tick`, `safe-buffer`, `string_decoder`, `util-deprecate`, `process-nextick-args` | MIT / ISC | **Yes** | All permissive |
| epubjs's bundled Adobe Source Code Pro fonts | OFL-1.1 | **Yes** | OFL is a font-specific license, GPL-3.0 compatible for combined works. `LICENSE.txt` ships. Note the OFL's **Reserved Font Name** clause: the name "Source Code Pro" and "Source" may not be used for *modified* versions. The project does not modify or redistribute these fonts under its own name, so this does not bind. |
| `mobile/` (Expo 57 / RN 0.86 / React 19) | MIT ecosystem | **Yes** | Separate build surface; not shipped in the Windows installer. |

### 9.2 Issues worth flagging

**C1 — Apache-2.0 attribution for `pdfjs-dist` is not currently satisfied.** This is the single most concrete license-compliance gap in the project. `pdfjs-dist` is a direct runtime dependency (`package.json:110`), loaded by `index.html:23` → `js/reader/pdfjs-loader.js:10`, and is Apache-2.0, whose §4(a) requires shipping a copy of the License with any distribution. Currently: not in `THIRD_PARTY_NOTICES.md`, not in `build.files`, not in `app.asar`. As things stand the *shipped* artifact does not contain pdf.js at all (a separate functional bug), so no Apache-2.0 distribution currently occurs — but the moment the packaging is fixed, the attribution must land in the same change. **These two must be fixed together.**

**C2 — `jszip` dual-license election is implicit, not documented.** The project relies on the MIT option but never says so. Not a violation, but recording the election would make the compliance posture explicit and auditable. Note also that GPL-3.0-or-later is a *weaker* grant than GPL-3.0-only in the "or later" direction; choosing MIT avoids the question entirely.

**C3 — ISC attribution format is unverifiable from the shipped artifact.** ISC requires the copyright notice and permission notice to be reproduced. Four shipped packages are ISC (`d`, `es5-ext`, `es6-symbol`, `esniff`, `ext`, `next-tick`, `inherits`) and each ships its `LICENSE` file, so the obligation is met. No action needed; recorded for completeness.

**C4 — The GPL "Corresponding Source" obligation is a release-process obligation, not a repository one.** GPL-3.0 §5(d)/(e) require that a binary distribution be accompanied by complete source, or a written offer. `Lirune-Reader-Source.zip` exists in the working tree (32 entries) and appears intended for this, but it is **untracked, not gitignored, stale relative to the current code, and does not include the untracked `js/reader/` directory that the current build requires.** Whether the release process actually satisfies GPL-3.0's source obligation cannot be determined from the repository. Escalated to **Section 13**.

---

## 10. Required attribution/actions

Concrete, prioritized actions. Each names what was verified and what remains to be done.

### Priority 1 — required before a release that ships pdf.js

| # | Action | Why | Verified basis |
|---|---|---|---|
| **A1** | Add `node_modules/pdfjs-dist/**/*` to `build.files` **and** add a `pdfjs-dist` entry to `THIRD_PARTY_NOTICES.md` in the same change. | `pdfjs-dist` is a direct runtime dependency with an ESM loader entry point. Without it, PDF import fails at runtime. With it, Apache-2.0 §4(a) requires shipping the License. | `package.json:110`; `index.html:23`; `js/reader/pdfjs-loader.js:10`; `app.asar` has 0 pdfjs entries; `THIRD_PARTY_NOTICES.md:5-8` omits it |
| **A2** | Confirm the `@napi-rs/canvas` optional dependency tree ships its MIT notice if it is ever bundled. | MIT requires the notice to travel with redistributed binaries. 12 platform binaries are installed and currently unshipped. | `node_modules/@napi-rs/canvas/package.json` `license: "MIT"` |

### Priority 2 — attribution completeness for what already ships

| # | Action | Why | Verified basis |
|---|---|---|---|
| **A3** | Add `localforage` (Apache-2.0) and `@xmldom/xmldom` (MIT) to `THIRD_PARTY_NOTICES.md`. | Both ship inside the app. Apache-2.0 in particular requires the License text travel with it. | `app.asar` enumeration; `node_modules/localforage/package.json`; `app.asar` `node_modules/@xmldom/xmldom/package.json` version 0.7.13 |
| **A4** | Either enumerate all ~26 shipped transitive packages, or add an explicit generated `LICENSES/` bundle to `build.files` and point the notices file at it. The current blanket sentence is accurate for 25 of 26 packages. | An explicit, generated notice set is auditable and does not drift as dependencies change. | `app.asar` enumeration: 4 packages ship with no license file (`isarray`, `marks-pane`, `path-webpack`, `@types/localforage`) |
| **A5** | Narrow the `node_modules/epubjs/**/*` filter to exclude `documentation/`, `src/`, `test/`, and `.github/`. | Removes 41 files including 14 OFL-licensed Adobe font binaries that the app never uses. | `app.asar`: 41 `epubjs/documentation` entries; 151 total epubjs entries |
| **A6** | Ship a `vendor-notices` entry for the `jszip/vendor/FileSaver.js` X11/MIT code, or note in `THIRD_PARTY_NOTICES.md` that the jszip MIT license covers it. | The file's own header references a `LICENSE.md` that does not exist in the vendor directory. | `node_modules/jszip/vendor/FileSaver.js` header lines 1-5; `Get-ChildItem node_modules/jszip/vendor` returns only `FileSaver.js` |
| **A7** | Consider adding `COPYRIGHT.md` and `README.md` to `build.files`. | Makes the in-application attribution story self-contained without requiring the user to visit the repository. | `package.json:53-65` omits both; both are tracked in git |

### Priority 3 — repository hygiene (reduces future provenance risk)

| # | Action | Why | Verified basis |
|---|---|---|---|
| **A8** | Add `downloads/`, `debug_page.html`, `Lirune-Reader-*.zip`, `Batch1-Fixes/`, `Batch2-Fixes/`, `Batch3-Fixes/`, and `download_*.py` to `.gitignore` (or move them out of the tree). | All are untracked and **not** currently ignored. A `git add -A` would commit scraped-content tooling and full duplicate app snapshots to a public repository. | `git check-ignore -v` returns no match for these paths; `git ls-files --others --exclude-standard` lists all of them |
| **A9** | Commit the untracked shipped source: `js/formats.js`, `js/appPrefs.js`, `js/settingsUI.js`, `js/reader/*.js` (8 files). | `index.html` loads all of them at runtime. They are required for the application to function and are currently absent from version control — which means the GPL Corresponding Source obligation cannot be met from the repository alone. | `git status --short js/` shows 4 `??` entries; `index.html:23,1067,1069,1072-1078,1080` |
| **A10** | Rebuild the release artifact from the current source, or explicitly mark the existing `dist/` output as stale. | The `app.asar` in `dist/` is from 2026-09-26 00:47; the source files it should contain were modified 2026-09-28 21:40+. It lacks `js/reader/`, `js/formats.js`, `js/settingsUI.js`, `js/appPrefs.js`, and `pdfjs-dist` entirely. | File timestamps; `app.asar` `index.html` is 58,800 bytes vs 72,130 on disk; `app.asar` script list is 9 vs 17 |
| **A11** | Regenerate or remove `Lirune-Reader-Source.zip` and `Lirune-Reader-Current-State.zip`. | Both are stale (32 entries, no `js/reader/`, old `package.json` without `pdfjs-dist`). If used for the GPL source offer, they must match the shipped binary. | Both zips inspected read-only; neither contains `js/reader/` |
| **A12** | Extend the `forbidden` list in `scripts/validate-release.js:12`. | Currently only `Master_EPUB_Library_All`, `.env`, `.pfx`, `.p12`, `.pem`, `.key`. Adding `qa`, `downloads`, `.qa-userdata`, `*.epub` gives defence-in-depth if `build.files` is ever loosened. | `scripts/validate-release.js:12` read directly |
| **A13** | Reconcile `package.json:104` (`nsis.include: "scripts/nsis-include.nsh"`, file does not exist) with `docs/WINDOWS_RELEASE.md:3` ("No custom NSIS script or uninstall hook is configured"). | One of the two is stale. Also verify the build does not fail on the missing include. | `Test-Path scripts/nsis-include.nsh` → False; file exists only in `Batch*-Fixes/` and the zips |

### Priority 4 — product-name and copy decisions (Section 11 / 13)

| # | Action | Why |
|---|---|---|
| **A14** | Decide the copyright holder line: `README.md:76` says "Lirune Reader contributors", `COPYRIGHT.md:1` says "Vasanth Gajavelly". Make them agree. | Consistency on a license surface. |
| **A15** | Decide whether `mobile/src/sampleBooks.ts` should keep its Alice/Frankenstein/Sherlock placeholders. | Low legal risk (titles + authors of public-domain works, no text), but inconsistent with the desktop cleanup. `mobile/src/sampleBooks.ts:12` references a specific chapter by name. |
| **A16** | Replace or remove the `download_*.py` scraping scripts. | ToS and copyright questions that do not belong in a GPL open-source repository. |

---

## 11. Unknown/provenance-review items

Items I could **not** resolve from the repository. Each states exactly what would be needed.

### 11.1 PROVENANCE UNKNOWN

| # | Item | What is unknown | What would resolve it |
|---|---|---|---|
| U1 | **Authorship of the "Welcome to Lirune" book prose** (`js/library.js:2085-2603`) | The text reads as project-authored product documentation, and no excerpt from any published work was found. But prose generated with AI assistance cannot be authenticated from the repository, and "no match found by string search" is weaker evidence than "no match found by corpus comparison". | Human confirmation from the author of the drafting process, plus (if a reviewer wants certainty) a similarity check against a protected-work corpus. This is a legal-review task. |
| U2 | **Origin of the UI SVG icon geometry** | The ~40 inline icons in `index.html` follow a widely-shared 24×24 / `stroke-width: 2` outline convention. No icon library is imported, vendored, or referenced. Simple primitives (magnifier, plus, chevron, bookmark) are not copyrightable, so this is very likely fine — but I did not perform a geometric comparison against any specific icon set. | Visual/geometric comparison against Lucide, Feather, Heroicons, and Tabler if a reviewer wants to rule it out. Note the icons are simple geometric primitives; this is very likely a non-issue. |
| U3 | **`mobile/` dependency provenance** | `mobile/package-lock.json` is a 233 KB lockfile for Expo 57 / RN 0.86 / React 19. I did not enumerate all of its licenses (it is a separate build surface, not shipped in the Windows installer). | The same `node_modules/<pkg>/package.json` sweep I ran for the desktop, executed inside `mobile/`. |
| U4 | **`mobile/LICENSE` is the Expo template license** | `mobile/LICENSE:3` names 650 Industries (Expo) as copyright holder. Whether the *project's own* mobile code is intended to be under this license, or whether this file is a leftover from the Expo scaffold, is not determinable from the repository. | Author decision: either replace with a project GPL-3.0 LICENSE or document the MIT licensing of the mobile layer. |
| U5 | **Actual content of the QA corpus** | `qa/*.mjs` reference `%TEMP%\kilo\lirune-corpus` — outside the repository, and I did not have it. Filenames visible in `qa/suite-formats.mjs:32-40` include `pg1342-ni.epub` (Project Gutenberg, public domain), `naca-to-nasa.pdf` (US government work, public domain), and **`Elf_Receiver_Radio-Craft_August_1936.cbz`** (*Radio-Craft*, 1936 — a **commercially published magazine, likely still in copyright**) and `bobby_make_believe_sample.cbz` (origin unknown). None are in the repository and none are packaged. | Inspect the corpus directory and confirm each file's license and source. Relevant only if the corpus is ever redistributed. |
| U6 | **`downloads/The_Villain_Refused_To_Play_By_The_Script.epub`** | 1,897 bytes, untracked, gitignored. Produced by `download_crimson_*.py` from `crimsonscrolls.net`. A contemporary web novel is almost certainly in copyright, and the EPUB is a derivative reproduction. | Legal review, plus a decision on whether these tools should exist in the repository at all. Not tracked, not packaged. |
| U7 | **The 6,500-line `index.html` and 2,793-line `js/library.js`** | No pasted third-party blobs were found by attribution-string search. But I did not run a full-text similarity comparison against external corpora, which is the only method that would definitively rule out close reproduction. | Corpus comparison, or author attestation. Same category as U1. |
| U8 | **Whether the release process satisfies GPL-3.0 §5** | The repository contains no release workflow (`.github/` holds only `FUNDING.yml` — no CI). Whether the installer is published alongside complete corresponding source, or with a written offer, is not determinable from the repository. | Review the actual release process and the published release artifacts. |
| U9 | **Code-signing and Store publisher identity** | `scripts/build-store.js:19-23` hard-codes `publisher: 'CN=65585C77-A179-46B9-B0CA-60D868923F03'` and `publisherDisplayName: 'Lirune'`. `docs/STORE_SUBMISSION.md` says the Store build "has not been performed by this repository automation". Ownership of that certificate/identity was not verified. | Confirmation from the author that the Partner Center identity is theirs. Not a license issue per se, but a provenance-adjacent fact. |
| U10 | **`dist/` artifact provenance** | `dist/` is gitignored. The 4.0.2 and 4.0.3 installers and the `.appx` in `dist/` were produced by a previous local build. Their contents were not audited (the `.appx` in particular — it is a 167 MB signed-adjacent package). | Extract and enumerate the `.appx` the same way as `app.asar` if Store submission is imminent. |

### 11.2 VERIFIED — no further action

- Project license: GPL-3.0-only, `LICENSE` is unmodified upstream GPL-3.0 text.
- No third-party literary text in any shipped desktop source file.
- No bundled or remote fonts in the project.
- No QA/dev/book material in the packaged `app.asar`.
- No book files tracked in git.
- Electron and Chromium notice files ship with the build.
- No vendored third-party JavaScript in the project tree.

---

## 12. Release blockers

Ordered by severity. "Blocker" here means *the release should not ship until this is resolved* — a mix of engineering and compliance reasons.

### B1 — CRITICAL: the packaged application cannot render PDFs, and the pdf.js attribution is missing

**The `pdfjs-dist` dependency is declared and wired into the UI, but is excluded from the packaging allowlist.**

- `package.json:110` declares `"pdfjs-dist": "^4.10.38"`.
- `index.html:23` loads `js/reader/pdfjs-loader.js` as a module.
- `js/reader/pdfjs-loader.js:10` does `import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs'`.
- `package.json:53-65` `build.files` allowlists `node_modules/epubjs/**/*` and `node_modules/jszip/**/*` but **not** `node_modules/pdfjs-dist/**/*`.
- Verified in the built artifact: **`app.asar` contains 0 pdfjs entries.**

**Consequence:** the module import fails at runtime, `window.pdfjsLib` is never set, the `lirune:pdfjs-ready` event never fires, and every PDF import fails. `js/formats.js:21` advertises `pdf` as `supported: true`, and `js/reader/pdfAdapter.js` (14,446 bytes) is written against pdf.js — so the UI promises a capability the package cannot deliver.

**Compounding compliance issue:** this must be fixed **together with** the Apache-2.0 attribution in A1. Bundling pdf.js without shipping its License would create the violation; not bundling it is a functional bug. One change fixes both.

**Note:** the `dist/` artifacts currently in the tree predate the pdf.js work entirely (built 2026-09-26; `pdfjs-dist` added to `package.json` in the uncommitted working tree at 2026-09-28 20:57). So the shipped 4.0.3 installer is *not* currently violating Apache-2.0 — it simply lacks PDF support. The violation appears the moment someone "fixes" the packaging without the attribution.

### B2 — CRITICAL: the release artifact is stale and does not match the source

The `app.asar` in `dist/` was built 2026-09-26 00:47. The source it should contain was modified 2026-09-28 21:40+.

| Missing from `app.asar` | Referenced by | Source file size |
|---|---|---|
| `js/reader/` (all 8 files) | `index.html:23, 1072-1078` | ~85 KB total |
| `js/formats.js` | `index.html:1067` | 8,000 B |
| `js/appPrefs.js` | `index.html:1069` | 1,759 B |
| `js/settingsUI.js` | `index.html:1080` | 24,815 B |
| `pdfjs-dist` (entire package) | `js/reader/pdfjs-loader.js:10` | ~1.7 MB of `.mjs` |

The asar's own `index.html` is 58,800 bytes and references 9 scripts; the current `index.html` is 72,130 bytes and references 17. The asar's `package.json` lists only `epubjs` and `jszip` as dependencies; the current `package.json` lists `pdfjs-dist` too.

**Consequence:** `dist/Lirune Reader-4.0.3-Setup.exe` (114 MB) and `dist/Lirune Reader-4.0.3-Setup.appx` (167 MB) **do not contain the current application.** Publishing them would ship a two-day-old build that lacks the entire multi-format reader layer, the PDF renderer, CBZ/FB2/TXT/HTML support, and the settings UI. `docs/WINDOWS_RELEASE.md:19` already warns: *"Do not publish a small or partially generated installer left by a failed build."*

**Required action:** rebuild from the current source and re-validate, or explicitly mark the existing artifacts as non-releasable.

### B3 — HIGH: the shipped source code is not in version control

`js/formats.js`, `js/appPrefs.js`, `js/settingsUI.js`, and the entire `js/reader/` directory are **untracked** (`git status` shows `??`) while being **required at runtime** by `index.html`. 17 other tracked files are modified but uncommitted, including `package.json`, `package-lock.json`, `index.html`, and `js/library.js`.

**Consequence:** a clone of the repository **cannot run the application**. More seriously for this audit: **GPL-3.0 §5 requires that a binary distribution be accompanied by the Corresponding Source.** If the release is published from this working tree, the corresponding source that a recipient receives from the GitHub repository is incomplete and **will not build or run**. This is a compliance blocker, not merely a hygiene issue.

**Required action:** A9 — commit the untracked runtime files and the modified ones before any release.

### B4 — MEDIUM: Apache-2.0 attribution gaps in shipped third-party code

- `localforage` (Apache-2.0) ships in the app but is not in `THIRD_PARTY_NOTICES.md` (A3). Its `LICENSE` does ship in the asar, which is the primary §4(a) obligation, but the notices file is the project's own attribution statement and is incomplete.
- `isarray`, `marks-pane`, `path-webpack`, and `@types/localforage` ship inside the app with **no license file and no notice** anywhere (A4). All four are MIT-licensed and require their copyright notice in binary redistributions. `@types/localforage` is a deprecated stub with no copyright header to begin with; the other three have `package.json` `license: "MIT"` but no `LICENSE` file in the published npm tarball.

**Consequence:** three MIT-licensed packages are redistributed in binary form without their required copyright notice. This is a concrete, verifiable attribution gap.

**Required action:** A4 — generate and ship a complete `LICENSES/` set from the installed tree, or enumerate all shipped packages and their notice lines.

### B5 — MEDIUM: the source-of-truth notices file is being distributed in a form that understates coverage

`THIRD_PARTY_NOTICES.md:3` asserts:

> *"Their license texts are included in the installed application where provided by the package manager."*

This is accurate as written — the phrase "where provided" is a correct hedge, and for 25 of 26 shipped packages it is factually true. But the file names only 4 dependencies while ~30 ship, and a reader relying on it as the attribution statement would come away with an incomplete picture. The `epubjs` entry also omits the OFL-licensed Adobe Source Code Pro fonts that ship inside it, and the `jszip` entry omits the vendored X11/MIT FileSaver.js.

**Required action:** A3–A6.

### B6 — LOW: untracked scraping tooling in the repository root

The seven `download_*.py` scripts and the `debug_page.html` file (an 82 KB saved 403 error page from a novel-downloading site) are untracked and **not gitignored**. They cannot leak into a package (verified — not in `build.files`, not in `app.asar`), but a `git add -A` would commit them to a public GPL repository.

**Required action:** A8, A16.

---

## 13. Items requiring human/legal review

**None of the items in this section can be resolved by engineering analysis.** Each requires a qualified human — and for U6 and the GPL source question, most likely qualified legal counsel.

### R1 — GPL-3.0 §5 Corresponding Source obligation for the release — **HIGHEST PRIORITY**

GPL-3.0 §5(d) requires that a conveyed binary be accompanied by the complete Corresponding Source, or §5(e) a written offer. For an Electron application, "Corresponding Source" includes the build scripts, dependency manifests, and any build instructions sufficient to produce an identical binary.

**The current state does not support compliance.** The application code required to run is **not committed to the repository** (B3), and the `Lirune-Reader-Source.zip` archive in the working tree is stale and incomplete (A11). A recipient who downloads the installer and clones the public repository would receive source that **cannot build or run**.

**For legal review / author decision:**
- Will the source be published as a tagged commit on the public repository that exactly matches each release?
- Is `Lirune-Reader-Source.zip` intended to be that artifact? If so, it must be regenerated per release and verified against the shipped binary.
- Do the `dist/`, `Batch*-Fixes/`, and `.kilo/` directories need to be excluded from any source publication?
- Is a §5(e) written offer needed for any distribution channel?

### R2 — Copyright status of the scraped web-novel EPUB and the `download_*.py` tools — **HIGH**

`download_crimson_*.py` (5 scripts) scrape `crimsonscrolls.net` and `download_novels.py` scrapes CrimsonScrolls and Novelpia, using `cloudscraper` with anti-bot-evasion headers and Playwright to bypass bot protection, then repackaging the content into EPUBs via `ebooklib`. One output already exists on disk: `downloads/The_Villain_Refused_To_Play_By_The_Script.epub`.

**For legal review:**
- **Copyright:** a contemporary commercial web novel is almost certainly in copyright. Programmatically downloading and repackaging it creates a reproduction and a derivative work. Even though nothing is tracked or packaged, the tools and their output exist in the working tree of a public GPL repository.
- **Terms of service:** automated scraping combined with explicit bot-detection evasion is a ToS question independent of copyright, and evasion is an aggravating factor.
- **Recommendation to author:** remove these scripts and `downloads/` from the working tree entirely (A8, A16). They serve no purpose in the shipped product, and their presence creates exposure with no offsetting benefit.

### R3 — Copyright status of the QA test corpus — **MEDIUM**

`qa/suite-formats.mjs:32-40` references files including `Elf_Receiver_Radio-Craft_August_1936.cbz`. *Radio-Craft* (1936) was a **commercially published magazine**; 1936 magazine content is very likely still in copyright in the US (pre-1964 works are protected) and elsewhere. `bobby_make_believe_sample.cbz` has unknown provenance.

**Mitigating facts, all verified:** the corpus lives in `%TEMP%` outside the repository; nothing is tracked; nothing is packaged; `README.md:61` and `CONTRIBUTING.md:33` both explicitly prohibit redistributing copyrighted EPUB files.

**For author action:** confirm the provenance and license of every file in the corpus, and replace any still-in-copyright item with a public-domain or self-authored equivalent. This matters only if the corpus is ever shared or archived — which is exactly the kind of accident that `.gitignore:12` (`qa/artifacts/`) and the packaging allowlist are designed to prevent, and which both currently work.

### R4 — Authorship of AI-assisted prose and code — **MEDIUM**

The project contains AI-assisted code and documentation. **This audit makes no claim in either direction about whether AI-generated output is copyrightable.** That question is jurisdiction-specific and contested, and it is not an engineering question.

**What was verified (genuine findings, not assumptions):** no third-party source code was pasted into the project; no attribution markers, no vendored blobs, no external-URL citations; the entire brand identity is drawn from scratch by a 98-line script; the welcome book is product documentation with no excerpt from any published work.

**What was not verified, and cannot be:** whether any generated passage reproduces protected expression closely enough to matter. String-matching a repository for attribution markers cannot answer this; only a similarity comparison against a protected-work corpus can, and only a qualified reviewer should interpret the result.

**For author/legal review:**
- Retain a record of the drafting process for the project.
- If a reviewer wants higher assurance than this audit provides, commission a similarity check on the longest prose artifacts: the welcome book (`js/library.js:2085-2603`) and `README.md`.
- Consider an IP/AI contribution policy in `CONTRIBUTING.md` clarifying the project's position on AI-assisted contributions, which is increasingly a Partner Center and enterprise-procurement question.

### R5 — Trademark and brand availability for "Lirune" — **MEDIUM (unassessed)**

This audit covered copyright and open-source licensing only. It did **not** assess:

- Whether "Lirune" is available as a trademark in the target jurisdictions, or whether it collides with existing marks in the e-reader / reading-app space.
- Whether "Lirune Reader" conflicts with the `com.novera.reader` app ID or the Store identity `Lirune.LiruneReader` (`scripts/build-store.js:20-23`).
- Whether the previous names (Novera, and any earlier ones) carry residual trademark or goodwill considerations now that the product has been renamed.
- Whether the Buy Me a Coffee and GitHub Sponsors arrangements (`index.html:709-725`, `.github/FUNDING.yml`) create any obligations.

**Search performed:** `Folio` and `Vellune` return **zero matches** anywhere in the repository outside `node_modules` and the excluded `.kilo` worktree. `Novera` occurrences are fully enumerated in Section 8.1 / Section 11 and none are unlicensed.

**For legal review:** a trademark clearance search for "Lirune" in the US, EU, and India (the author's apparent jurisdiction, per commit authorship) before Store submission or any public marketing.

### R6 — Microsoft Store / Partner Center disclosure accuracy — **MEDIUM**

`docs/STORE_SUBMISSION.md` states submission "has not been performed by this repository automation" and that the identity "should not" be invented. `scripts/build-store.js` nonetheless hard-codes a specific publisher certificate thumbprint. The `dist/` directory contains a 167 MB `.appx` for 4.0.2 and 4.0.3.

**For author/legal review:** confirm that (a) the hard-coded publisher identity is owned by the author, (b) the Store listing's privacy declaration accurately matches actual app behaviour (the app is local-only, makes no network requests, and loads no remote content — verified: strict CSP, no remote URLs in shipped source, no telemetry), and (c) the listing does not make claims about third-party content handling that the code does not support.

### R7 — Scope limitation of this audit

This audit examined **licensing, attribution, and provenance of code and assets**. It did **not** examine:

- Patent risk. `pdfjs-dist` is Apache-2.0, which includes an express patent grant; no other dependency carries a known patent grant that I evaluated. A full patent review is a legal task.
- Trademark (see R5).
- Export control or encryption regulation. The app uses Node's `crypto` for SHA-256 fingerprinting and rejects DRM; I did not assess regulatory classification.
- Privacy-law compliance (GDPR, DPDP Act, etc.). The app is local-only, which is favourable, but that assessment is outside this scope.
- Dependency **vulnerability** status. `npm audit` was not run, per the read-only constraint.
- The mobile build's full dependency license set (U3).

---

## Appendix A — Verification commands used

All read-only. Reproducible by anyone re-running this audit.

```powershell
# Dependency licenses (lockfile + installed package.json)
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package-lock.json','utf8'));..."

# LICENSE files present in the shipped artifact
node -e "const asar=require('@electron/asar');const list=asar.listPackage('dist/win-unpacked/resources/app.asar');..."

# Packaged contents (proves QA/dev material is excluded)
node -e "const asar=require('@electron/asar');console.log(asar.listPackage('dist/win-unpacked/resources/app.asar').length);"

# Git tracking facts
git ls-files
git ls-files --others --exclude-standard
git ls-files --others --ignored --exclude-standard
git check-ignore -v downloads/The_Villain_Refused_To_Play_By_The_Script.epub

# Removed sample content
git log --oneline -S "Alice's Adventures in Wonderland" -- js/library.js
git show e67ed56 -- js/library.js

# Stale-build evidence
Get-Item dist\win-unpacked\resources\app.asar, index.html | Select-Object Name, LastWriteTime

# Remote fonts (expected: no results)
Select-String -Path index.html, css\*.css -Pattern "font-face|fonts.googleapis|fonts.gstatic"

# Stale product names (expected: Folio/Vellune -> no results)
Select-String -Path <sources> -Pattern "Folio|Vellune" -CaseSensitive:$false
```

## Appendix B — One-line summary

The dependency licenses are all permissive and GPL-3.0-compatible; the brand assets are entirely generated by project code; the shipped welcome book is original product documentation with the old Alice in Wonderland text verifiably removed in commit `e67ed56`; no book files are tracked in git; and no QA, dev, or third-party book material can reach a production package. The concrete problems are packaging rather than licensing: **`pdfjs-dist` is wired into the UI but excluded from `build.files` (B1)**, **the `dist/` artifact is two days stale and lacks the entire `js/reader/` layer (B2)**, **the runtime source files are untracked so the repository cannot satisfy GPL-3.0 §5 (B3)**, and **three MIT-licensed packages ship with no copyright notice while Apache-2.0 packages are under-documented in `THIRD_PARTY_NOTICES.md` (B4)**. Items R1 through R7 require human and legal judgement and are not resolvable from the repository.
