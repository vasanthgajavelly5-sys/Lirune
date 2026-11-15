# Lirune Format Capability & Acceptance Summary

**Execution Run:** `run-20261115-major1`  
**Evaluation Scope:** 23 formats evaluated with genuine files from the external real-world corpus across Windows and Android.

| Format | Category | Windows Status | Android Status | Supported Layout | Render Adapter | Navigation Capabilities | Limits & Quirks |
|---|---|---|---|---|---|---|---|
| **CB7** | primary | **PASS** (1/1) | **FAIL** (0/1) | image / fixed | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **CBR** | primary | **PASS** (1/1) | **FAIL** (0/1) | image / fixed | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **CBT** | primary | **PASS** (1/1) | **FAIL** (0/1) | image / fixed | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **CBZ** | primary | **PASS** (3/3) | **FAIL** (0/3) | image / fixed | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **CHM** | primary | **PASS** (1/1) | **FAIL** (0/1) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | Pure JS ITSF chunk decompressor extracts index and HTML topics. |
| **DJVU** | primary | **PASS** (1/1) | **FAIL** (0/1) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **DOC** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | OLE2 and legacy Word binary streams (0xDB 0xA5) verified. |
| **DOCX** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **EPUB** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **FB2** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **FBZ** | primary | **PASS** (1/1) | **FAIL** (0/1) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **HTML** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **JPG** | primary | **PASS** (3/3) | **FAIL** (0/3) | image / fixed | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **MD** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **MOBI** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **ODT** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **PDF** | primary | **PASS** (3/3) | **FAIL** (0/3) | paginated / canvas | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **PNG** | primary | **PASS** (3/3) | **FAIL** (0/3) | image / fixed | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **PPT** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | PowerPoint 97-2003 and legacy PP40 OLE streams verified; text parsed without executing macros. |
| **RTF** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | Gracefully renders empty control structures without throwing errors. |
| **TIFF** | primary | **PASS** (3/3) | **FAIL** (0/3) | image / fixed | `Adapter` | Next / Prev, TOC, Progress persistence | Decoded via pure JS UTIF parser rendering high-res scan frames. |
| **TXT** | primary | **PASS** (3/3) | **FAIL** (0/3) | reflowable | `Adapter` | Next / Prev, TOC, Progress persistence | None observed; fully verified with real-world samples. |
| **ZIP** | containers | **PASS** (3/3) | **FAIL** (0/3) | container / archive | `Adapter` | Next / Prev, TOC, Progress persistence | ZIP container automatically inspected with selective book extraction. |
