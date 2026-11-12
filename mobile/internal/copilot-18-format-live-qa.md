# 18-Format Live QA Status

Date: 2026-10-01

The requested NVIDIA GPU emulator run was not executable in this environment. `adb` was not available, `ANDROID_HOME`/`ANDROID_SDK_ROOT` were unset, and native Gradle assembly was blocked by missing Java. Therefore no format is marked live PASS.

| Format | Source/parser evidence | Import/open/navigation/reopen live evidence | Status |
|---|---|---|---|
| EPUB | Corpus/parser tests and EPUB source review | Not run | BLOCKED |
| TXT | Parser/unit evidence | Not run | BLOCKED |
| HTML | Parser/source review and sanitizer tests | Not run | BLOCKED |
| FB2 | Corpus/parser evidence | Not run | BLOCKED |
| MOBI | Corpus/parser evidence | Not run | BLOCKED |
| AZW | Corpus/parser evidence | Not run | BLOCKED |
| AZW3 | Corpus/parser evidence | Not run | BLOCKED |
| DOCX | Parser/source review | Not run | BLOCKED |
| ODT | Parser/source review | Not run | BLOCKED |
| RTF | Parser/source review | Not run | BLOCKED |
| DOC | Parser/source review | Not run | BLOCKED |
| CHM | Parser/source review | Not run | BLOCKED |
| PDF | PDF.js asset and parser evidence | Not run | BLOCKED |
| DJVU | Source/corpus evidence | Not run | BLOCKED |
| CBZ | Source/corpus evidence | Not run | BLOCKED |
| CBR | Source/corpus evidence | Not run | BLOCKED |
| ZIP | Inspection/parser evidence | Not run | BLOCKED |
| RAR | Inspection/parser evidence | Not run | BLOCKED |

## Required follow-up

Install/configure JDK, Android SDK platform-tools/emulator, launch API 35 NVIDIA GPU emulator, build/install the APK, and execute the format matrix with screenshots and persistence assertions. Existing runtime corpus PASS values are parser/corpus evidence only and must not be promoted to live PASS.

## Resumed live update — 2026-10-02

The previous environment blocker is cleared: `qa_android` booted, the debug APK built and installed, and the existing 18 imported books remained available inside the app. The old `/sdcard/Download/lirune-qa-corpus` path did not survive the emulator restart. Do not treat discovery/import evidence as reader-depth coverage.

| Format | Updated live reader evidence | Current reader-depth status |
|---|---|---|
| EPUB | Prior live deep-session evidence retained; no complete replay today | PARTIAL |
| DOC | Prior session recorded opening | PARTIAL |
| MOBI | Prior session recorded opening | PARTIAL |
| FB2 | Prior session record says pass for one sample | PARTIAL |
| CHM | AutoHotKey v1.0 Help was previously opened | PARTIAL |
| CBZ | Pepper Carrot episode 1 opened, displayed five pages, navigated, and restored page 2 after reopen | PARTIAL (one sample) |
| CBR | Pepper Carrot episode 1 opened, displayed five pages, navigated, and restored page 2 after reopen; restoration defect fixed | PARTIAL (one sample) |
| ODT | Textract Raw Text (odt) opened on API 35; screenshot visually shows expected sample heading and spaced text; Maestro reader-navigation flow passes. Body text was not exposed to Maestro accessibility assertions. | PARTIAL (one sample, visual content only) |
| FB2 | Pandoc FictionBook Test (fb2) opened; screenshot visually shows Section 1, expected introductory text, and heading hierarchy. | PARTIAL (one sample, visual content only) |
| RTF | Apache Tika Simple RTF initially exposed generator metadata and lost the curly apostrophe. Parser now removes ignorable groups, preserves body text, maps RTF punctuation controls, and decodes Windows-1252 hex escapes. Live screenshot after fix shows “Test d’indexation Word”; Maestro open flow passes. | PARTIAL (one sample; targeted content fix verified) |
| DOCX | Python Docx Test (docx) was a valid ZIP, but the reader passed its Base64 string to JSZip without Base64 decoding. Parser now enables Base64 mode for strings. Live screenshot shows expected heading and paragraph. | PARTIAL (one sample; parser defect fixed and live verified) |
| DOC | Apache Tika Word Doc (doc) opened; screenshot shows title/subtitle, heading levels, body paragraphs, emphasis, and table text. | PARTIAL (one sample, visual content only) |
| PDF | W3C Dummy PDF initially showed a duplicate-identifier script error; pdf.js and its worker are now isolated in function scopes. Reader reports page 1/1; follow-up screenshot after render shows the expected “Dummy PDF file” page content. | PARTIAL (one sample, visual render verified) |
| TXT | `Alice in Wonderland (txt)` opened and displayed the Gutenberg title, license preamble, and metadata as readable text. | PARTIAL (one sample, visual content only) |
| HTML | `Alice Chapter 1 (html)` displayed the Gutenberg title, author, and linked table of contents. Its relative cover image is broken in the reader. | PARTIAL (one sample; relative image unresolved) |
| MOBI | `Alice in Wonderland (mobi)` opens but renders garbled compressed bytes/control metadata. Inspection shows this sample uses HUFF/CDIC; the parser only handles uncompressed and PalmDOC, then falls back to raw bytes. | FAIL (reader content unusable; unsupported compression) |
| AZW | `Alice in Wonderland (azw)` opens but renders garbled text/control data, consistent with unsupported MOBI-family compression. | FAIL (reader content unusable) |
| AZW3 | `Alice in Wonderland (azw3)` opens but renders XML fragments and corrupted text. | FAIL (reader content unusable) |
| DJVU | Not opened in this resumed session; import/parser evidence remains separate | NOT RUN (reader depth) |

## Additional live update — 2026-10-02

ODT sample `Textract Raw Text (odt)` opened successfully in the installed Android app. Visual screenshot `mobile/internal/qa_odt_open.png` shows the expected heading “Sample OpenOffice Writer file with tabs and multiple spaces”. Maestro flow `mobile/e2e/16_odt_live.yaml` passes launch, library-ready, book selection, and reader navigation. Maestro does not expose the rendered reader body in its text hierarchy, so content evidence is visual. The legacy multi-format flow 13 remains stale: it fails at its missing `Alice in Wonderland` TXT selector because that book is not in the retained 18-book library.

The complete matrix is still open: all three samples, content correctness, controls, errors, import/reopen, and progress behavior remain to be audited per format. ODT, RTF, and DOCX now have one-sample live evidence; this does not complete their matrix.

## Additional live update — 2026-10-02 (continued)

- FB2 `Pandoc FictionBook Test (fb2)` opened; screenshot `mobile/internal/qa_fb2_open.png` shows formatted section text/headings; flow `mobile/e2e/17_fb2_live.yaml` passes. One sample only.
- RTF `Apache Tika Simple RTF (rtf)` revealed a genuine display defect: generator metadata leaked into the page and `\rquote` was dropped. `RtfParser` now removes ignorable destination groups, strips only the root RTF marker, maps punctuation controls, and decodes Windows-1252 hex escapes. Screenshot `mobile/internal/qa_rtf_fixed.png` shows the corrected “Test d’indexation Word”. Flow `mobile/e2e/18_rtf_live.yaml` passes.
- DOCX `Python Docx Test (docx)` is a valid ZIP, but the reader gave it to JSZip as Base64 without enabling Base64 decoding. `DocxParser` now enables Base64 mode for string input. Screenshot `mobile/internal/qa_docx_fixed.png` shows the expected heading and paragraph; flow `mobile/e2e/19_docx_live.yaml` passes.
- DOC `Apache Tika Word Doc (doc)` opened and rendered heading levels, paragraph text, emphasis, and table text; screenshot `mobile/internal/qa_doc_open.png`, flow `mobile/e2e/20_doc_live.yaml`.
- PDF `W3C Dummy PDF (pdf)` initially failed with `Identifier 'i' has already been declared`. The pdf.js and worker bundles are now wrapped in function scopes; the reader reports 1/1 and follow-up screenshot `mobile/internal/qa_pdf_late.png` shows the expected “Dummy PDF file” page. Flow `mobile/e2e/21_pdf_live.yaml` passes navigation.
- TXT `Alice in Wonderland (txt)` opened and visually displayed readable Gutenberg title and text; screenshot `mobile/internal/qa_txt_open.png`, flow `mobile/e2e/22_txt_live.yaml`.
- HTML `Alice Chapter 1 (html)` opened and displayed a title, author, and contents; relative cover URL renders as a broken image. Screenshot `mobile/internal/qa_html_open.png`, flow `mobile/e2e/23_html_live.yaml`.
- MOBI `Alice in Wonderland (mobi)` opens but displays corrupted text. Extracted device file is a valid 241 KB MOBI; parser output is gibberish because this sample uses HUFF/CDIC compression and `MobiParser` falls back to decoding raw text records for it. Screenshot `mobile/internal/qa_mobi_open.png`, flow `mobile/e2e/24_mobi_live.yaml`. This is a confirmed reader defect; no HUFF/CDIC fix has been made.
- AZW `Alice in Wonderland (azw)` and AZW3 `Alice in Wonderland (azw3)` both open but display corrupted text / raw structural data. Screenshots `mobile/internal/qa_azw_open.png` and `mobile/internal/qa_azw3_open.png`; flows `mobile/e2e/25_azw_live.yaml` and `mobile/e2e/26_azw3_live.yaml`. These are confirmed reader failures, not full-depth checks.
- Added parser regression tests for RTF and DOCX. `npm test` now passes 47/47; `npm run typecheck` passes; lint has 0 errors and 19 warnings. The legacy 13 flow still fails on its absent TXT title and is stale.

## Format QA pause — 2026-10-02

Per the user's instruction, no more file-format reader tests are being run in this work phase. The partial live evidence above is saved as-is. Fixes already made and current known defects are explicitly listed; the full requested matrix remains incomplete. Focus has moved to EPUB engine and storage improvements. Run the final code checks only after those two work areas are complete.
