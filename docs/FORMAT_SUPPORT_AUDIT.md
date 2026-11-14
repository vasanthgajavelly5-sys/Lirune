# Lirune Format Support Audit

## Scope

This audit establishes the first canonical format-support contract for Windows
and Android. It is an audit and foundation only: no new reader engine is
claimed as implemented by this change.

The machine-readable registry is
[`format-catalogue.json`](../format-catalogue.json). It counts canonical
format families, keeps aliases on the family entry, and separates archive
containers from document readers.

## Current contract

The registry records **16 stable format IDs** currently represented by both
platform reader paths and **16 canonical format families**:

- EPUB
- PDF
- Plain text
- HTML
- FictionBook
- CBZ
- CBR
- DOC
- DOCX
- ODT
- RTF
- Markdown
- FBZ
- MOBI / AZW / AZW3
- CHM
- DjVu

MOBI, AZW, and AZW3 are represented by the single desktop `mobi` family entry
with aliases. Android retains separate internal profile IDs, which are
validated as aliases or platform variants rather than additional families.

## Confirmed parity concern

CB7/7Z is not a fully supported shared reader family. Android detects CB7 and
routes it to the CBZ reader, which uses JSZip; the same component explicitly
reports that CB7 is not supported when loading fails. It must remain a
documented blocker until a real 7Z reader is implemented and accepted on both
platforms.

RAR/CBR also requires real compressed RAR4 and RAR5 acceptance samples. The
current Android `RarExtractor` explicitly rejects RAR5, so a successful
signature detection is not sufficient evidence for full CBR support.

## Candidate implementation order

1. Correct the existing Level 0 contract and acceptance evidence, beginning
   with CB7 and compressed CBR.
2. Add standalone image reading for JPG, PNG, WebP, TIFF, and BMP/GIF where
   safe dimension and memory limits can be enforced identically.
3. Add CSV/TSV and office document viewers only after selecting maintained,
   licence-compatible offline parsers for both platforms.
4. Add structured text, email, web archive, fixed-layout, contact, and
   calendar viewers as separate capabilities with dedicated security tests.
5. Treat PST/OST, Apple iWork, legacy WPS, and macro-enabled formats as
   feasibility investigations until parser and security evidence exists.

## Evidence

- Windows format IDs and detection rules: `js/formats.js`,
  `js/reader/readerController.js`.
- Android format IDs and aliases: `mobile/models/Book.ts`,
  `mobile/plugins/native/lirune-storage/FormatRegistry.kt`.
- Android reader dispatch: `mobile/app/reader.tsx`.
- Android CBZ/CB7 behavior: `mobile/components/reader/CbzReaderView.tsx`.
- Android RAR limitation: `mobile/services/archive/RarExtractor.ts`.
- Existing format tests: `test/format-validation.test.js`,
  `mobile/tests/formatMatrix.test.ts`, and `mobile/tests/formatSniffer.test.ts`.

## Not yet tested by this foundation

- Three real samples per claimed format.
- Windows launcher acceptance for every sample.
- Android emulator acceptance for every sample.
- Physical-device behavior.
- New Level 1–3 format engines.
- Release packaging, installation, upgrade, and uninstall gates.
