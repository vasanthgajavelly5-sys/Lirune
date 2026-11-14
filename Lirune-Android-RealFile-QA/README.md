# Lirune Reader - Real-File QA Corpus

Synthetic, legally-clean sample book files for testing Lirune Reader (Android) against
real files on disk and inside a real SAF-picked folder.

Every byte here is produced by `generate_corpus.py` from placeholder prose written for
this corpus. No third-party or proprietary books are copied, and no file in this
directory is tracked by git.

## Layout

```
Lirune-Android-RealFile-QA/
  README.md            tracked
  generate_corpus.py   tracked - regenerates every file below
  verify_corpus.py     tracked - structural verification (ZIP/XML/FB2/MOBI/RAR)
  verify_corpus.mjs    tracked - JS-side verification (jszip + pdfjs-dist)
  valid/               gitignored - files the app must fully support
  edge/                gitignored - malformed / unsupported inputs
```

## Regenerate and verify

```bash
python Lirune-Android-RealFile-QA/generate_corpus.py     # requires Python 3.9+ and Pillow
python Lirune-Android-RealFile-QA/verify_corpus.py       # 124 structural checks
node    Lirune-Android-RealFile-QA/verify_corpus.mjs     # 30 checks (jszip, pdfjs-dist)
```

`verify_corpus.mjs` needs the app's own dev dependencies (`jszip`, `pdfjs-dist`); run it
from the repo root so module resolution finds `node_modules`. Both verifiers are
independent of the app code and only assert container structure, metadata, and decodability.

## valid/ - must open and render

| File | Size | Purpose |
| --- | --- | --- |
| `valid/sample-minimal.epub` | 15,588 B | EPUB 3 reference fixture. Stored-first `mimetype` (`application/epub+zip`), `META-INF/container.xml`, `OEBPS/content.opf` with `version="3.0"`, nav doc with `epub:type="toc"`, NCX fallback with 5 navPoints, 6 spine itemrefs (cover + 5 chapters), `dc:title`/`dc:creator`/`dc:description`, `meta name="cover"` -> `OEBPS/images/cover.jpg` (600x900 JPEG). Exercises metadata extraction, TOC, chapter loading, and cover rendering. |
| `valid/sample-text.pdf` | 6,046 B | Small text PDF, PDF 1.7, 2 pages, `/Info` with Title and Author plus an XMP packet. Exercises text-layer extraction and PDF metadata fallback order. |
| `valid/sample-cover-xmp.pdf` | 21,100 B | PDF 1.7, 2 pages, first page carries a `/DCTDecode` JPEG cover and XMP `xmpMM:Thumbnails` referencing `cover.jpg`. Exercises PDF cover-image rendering and XMP thumbnail discovery. |
| `valid/sample-large-mixed.txt` | 1,250,230 B | TXT > 1 MB mixing ASCII, CJK, Hangul, and astral-plane emoji. Contains CRLF blocks, 4-space-indented lines, a ~6 KB unbroken line, an emoji run, and periodic lines with no trailing newline. Targets `chunkIndex.ts` chunk cutting, byte-offset mapping, and UTF-8 window reads. |
| `valid/sample-story.fb2` | 16,701 B | Valid FictionBook 2. Title, author, `science_fiction` genre, annotation, keywords, `<coverpage><image l:href="#cover.jpg"/></coverpage>` with a base64 `<binary content-type="image/jpeg">` (300x450), 5 body sections, plus `<empty-line/>` and `<poem>/<stanza>/<v>` markup. Exercises the FB2 parser and embedded-cover path. |
| `valid/sample-comic.cbz` | 245,988 B | Valid CBZ with 8 naturally-sorted JPEG pages (`pages/page01.jpg` ... `page08.jpg`, 900x1350 each) plus a `ComicInfo.xml` metadata entry. Exercises image-only archive detection, page ordering, and lazy page streaming. |
| `valid/sample-book.html` | 11,903 B | Single-file HTML book: doctype, `<title>`, `meta charset/author/description/generator/dcterms.created`, one `h1` + three `h2`, paragraphs, inline CSS, and one inline `data:image/jpeg;base64` cover. Exercises HTML import, metadata scraping, and inline image handling. |

## edge/ - must fail gracefully

| File | Size | Expected behaviour |
| --- | --- | --- |
| `edge/zero-byte.epub` | 0 B | Empty file. Import must be rejected with a non-crashing error ("End of data reached"), not a hang or an empty library row. |
| `edge/corrupt-zip.epub` | 218 B | Valid `PK\x03\x04` local header signature followed by garbage and no central directory. Proves rejection is driven by real ZIP parsing ("can't find end of central directory"), not by an extension check. |
| `edge/latin1-encoded.txt` | 194 B | Windows-1252 text (French/German/Spanish/Italian/Portuguese accents) that is invalid UTF-8. Exercises the non-UTF-8 decode fallback; must not surface mojibake or throw. |
| `edge/utf16le-encoded.txt` | 334 B | UTF-16 LE with BOM, NUL-interleaved bytes, and CJK/Hangul/astral content. Exercises BOM sniffing and wide-char decoding. |
| `edge/epub-in-zip.zip` | 15,736 B | ZIP containing one entry, `books/sample-minimal.epub`. Exercises `ZipInspectionService` entry enumeration and the "extract then open" import path. |
| `edge/unsupported.mobi` | 606 B | Structurally valid PDB / PalmDOC / MOBI stub: 32-byte NUL-padded name, `BOOKTYPE` type, 3 records, `MOBI` magic with 232-byte header, readable text record. Must be reported as unsupported format, not mis-detected as EPUB. |
| `edge/unsupported.cbr` | 4,750 B | Structurally valid RAR5 stream: `Rar!\x1a\x07\x01\x00` signature, main archive header, stored `cover.jpg` file header, end-of-archive header, all header CRCs valid. Must be reported as unsupported format. |

## Notes

- All fixture text is original placeholder prose. Chapter titles and sentences are short
  synthetic strings authored for this corpus.
- Timestamps are pinned to 2026-01-15 09:30:00 so regeneration is byte-stable and QA runs
  are reproducible.
- The corpus is gitignored via `Lirune-Android-RealFile-QA/*` with explicit negations for
  this README and the three scripts. `git status` should never list any file in `valid/` or
  `edge/`.
