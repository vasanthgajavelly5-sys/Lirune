# Lirune Cross-Platform Format Parity Matrix
## Campaign Run ID: `run-20261115-postrel1`
**Platforms**: Windows 6.0.0 (Desktop) & Android 5.0.0 (Mobile)

## 1. 50 Primary Canonical Format Families (Headline Support)

| # | Canonical Family | Format ID | Extensions / Aliases | Category | Windows Adapter | Android Adapter | Windows Acceptance | Android Acceptance | Parity Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **EPUB** | `epub` | `epub` | ebook | EpubReaderAdapter | EpubReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 2 | **Kindle / MOBI** | `mobi` | `mobi, azw, azw3, prc, kf8` | ebook | MobiAdapter | MobiReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 3 | **Kobo EPUB** | `kepub` | `kepub.epub, kepub` | ebook | EpubReaderAdapter | EpubReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 4 | **FictionBook** | `fb2` | `fb2` | ebook | Fb2Adapter | Fb2ReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 5 | **FictionBook Archive** | `fbz` | `fbz` | ebook | Fb2Adapter | Fb2ReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 6 | **DjVu** | `djvu` | `djvu, djv` | ebook | DjvuAdapter | DjvuReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 7 | **Compiled HTML Help** | `chm` | `chm` | ebook | ChmAdapter | ChmReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 8 | **PDF** | `pdf` | `pdf` | document | PdfAdapter | PdfReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 9 | **Plain Text** | `txt` | `txt` | document | TextAdapter | TxtReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 10 | **Markdown** | `md` | `md, markdown` | document | MarkdownAdapter | MdReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 11 | **Word Document** | `docx` | `docx` | document | DocxAdapter | DocxReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 12 | **Legacy Word** | `doc` | `doc` | document | DocAdapter | DocReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 13 | **OpenDocument Text** | `odt` | `odt` | document | OdtAdapter | OdtReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 14 | **Rich Text** | `rtf` | `rtf` | document | RtfAdapter | RtfReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 15 | **XPS Document** | `xps` | `xps, oxps` | document | XpsAdapter | XpsReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 16 | **CSV** | `csv` | `csv` | spreadsheet | ExpansionAdapters.CsvAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 17 | **TSV** | `tsv` | `tsv` | spreadsheet | ExpansionAdapters.TsvAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 18 | **Excel Workbook** | `xlsx` | `xlsx` | spreadsheet | SpreadsheetAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 19 | **Legacy Excel** | `xls` | `xls` | spreadsheet | LegacySpreadsheetAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 20 | **OpenDocument Spreadsheet** | `ods` | `ods` | spreadsheet | SpreadsheetAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 21 | **Macro-enabled Excel** | `xlsm` | `xlsm` | spreadsheet | SpreadsheetAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 22 | **Excel Template** | `xltx` | `xltx` | spreadsheet | SpreadsheetAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 23 | **Excel Binary Workbook** | `xlsb` | `xlsb` | spreadsheet | ExpansionAdapters.XlsbAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 24 | **PowerPoint Presentation** | `pptx` | `pptx` | presentation | PresentationAdapter | PresentationReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 25 | **Legacy PowerPoint** | `ppt` | `ppt` | presentation | LegacyOfficeAdapter | DocReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 26 | **OpenDocument Presentation** | `odp` | `odp` | presentation | PresentationAdapter | PresentationReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 27 | **PowerPoint Slide Show** | `ppsx` | `ppsx` | presentation | PresentationAdapter | PresentationReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 28 | **Comic ZIP** | `cbz` | `cbz` | comic | CbzAdapter | CbzReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 29 | **Comic RAR** | `cbr` | `cbr` | comic | ArchiveComicAdapter | CbrReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 30 | **Comic TAR** | `cbt` | `cbt, tar` | comic | ArchiveComicAdapter | CbrReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 31 | **Comic 7-Zip** | `cb7` | `cb7, 7z` | comic | ArchiveComicAdapter | CbrReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 32 | **JPEG Image** | `jpg` | `jpg, jpeg, jpeg` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 33 | **PNG Image** | `png` | `png` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 34 | **WebP Image** | `webp` | `webp` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 35 | **GIF Image** | `gif` | `gif` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 36 | **Bitmap Image** | `bmp` | `bmp` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 37 | **SVG Vector Image** | `svg` | `svg` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 38 | **TIFF Image** | `tiff` | `tiff, tif, tif` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 39 | **AVIF Image** | `avif` | `avif` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 40 | **HEIC Image** | `heic` | `heic` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 41 | **HEIF Image** | `heif` | `heif` | image | ImageAdapter | ImageReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 42 | **HTML Document** | `html` | `html, htm, htm, xhtml` | web | HtmlAdapter | HtmlReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 43 | **MHTML Web Archive** | `mht` | `mht, mhtml, mhtml` | web | ExpansionAdapters.MhtAdapter | EmailReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 44 | **XML Document** | `xml` | `xml` | structured-text | ExpansionAdapters.XmlAdapter | StructuredTextReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 45 | **JSON Document** | `json` | `json` | structured-text | ExpansionAdapters.JsonAdapter | StructuredTextReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 46 | **YAML Document** | `yaml` | `yaml, yml, yml` | structured-text | ExpansionAdapters.YamlAdapter | StructuredTextReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 47 | **Log File** | `log` | `log` | structured-text | ExpansionAdapters.LogAdapter | StructuredTextReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 48 | **Email Message** | `eml` | `eml` | communication | ExpansionAdapters.EmlAdapter | EmailReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 49 | **vCard Contact** | `vcf` | `vcf` | communication | ExpansionAdapters.VcfAdapter | VCardCalendarReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 50 | **iCalendar Event** | `ics` | `ics` | communication | ExpansionAdapters.IcsAdapter | VCardCalendarReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |

## 2. Extended Format Families (Fully Implemented Outside 50)

| # | Canonical Family | Format ID | Extensions / Aliases | Category | Windows Adapter | Android Adapter | Windows Acceptance | Android Acceptance | Parity Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Mailbox Archive** | `mbox` | `mbox` | communication | ExpansionAdapters.MboxAdapter | EmailReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 2 | **Macro-enabled Excel Template** | `xltm` | `xltm` | spreadsheet | SpreadsheetAdapter | SpreadsheetReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 3 | **Macro-enabled PowerPoint** | `pptm` | `pptm` | presentation | PresentationAdapter | PresentationReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 4 | **Legacy PowerPoint Slide Show** | `pps` | `pps` | presentation | LegacyOfficeAdapter | DocReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 5 | **Macro-enabled PowerPoint Show** | `ppsm` | `ppsm` | presentation | PresentationAdapter | PresentationReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 6 | **PowerPoint Template** | `potx` | `potx` | presentation | PresentationAdapter | PresentationReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |
| 7 | **Macro-enabled PowerPoint Template** | `potm` | `potm` | presentation | PresentationAdapter | PresentationReaderView | **PASS** (100%) | **PASS** (100%) | **FULL PARITY** |

## 3. Container Capabilities (Archive Inspection)

| # | Capability | Format ID | Extensions | Windows Handler | Android Handler | In-App Browsing | Extraction |
|---|---|---|---|---|---|---|---|
| 1 | **undefined** | `zip` | `zip` | ArchiveHandler | ArchiveBrowser | Verified | Verified |
| 2 | **undefined** | `rar` | `rar` | ArchiveHandler | ArchiveBrowser | Verified | Verified |
| 3 | **undefined** | `7z` | `7z` | ArchiveHandler | ArchiveBrowser | Verified | Verified |

## 4. Partial / Preview Formats (Disclosed Limitations)

| # | Format ID | Canonical Family | Extensions | Windows Support | Android Support | Disclosed Limitation |
|---|---|---|---|---|---|---|
| 1 | `pages` | **Apple Pages** | `pages` | Partial | Partial | Embedded QuickLook preview only. Does not parse proprietary Apple snappy/protobuf .iwa streams natively. |
| 2 | `numbers` | **Apple Numbers** | `numbers` | Partial | Partial | Embedded QuickLook preview only. Interactive cell calculations not supported. |
| 3 | `key` | **Apple Keynote** | `key` | Partial | Partial | Embedded QuickLook preview only. Animations and transitions omitted. |
| 4 | `pst` | **Outlook Personal Storage** | `pst` | Partial | Partial | Proprietary MAPI B-Tree inspection extracts top-level messages only; complex subfolder trees and calendar MAPI objects are partially parsed. |
| 5 | `ost` | **Outlook Offline Storage** | `ost` | Partial | Partial | Offline cache table reader with partial folder hierarchy extraction. |
| 6 | `wps` | **WPS Document** | `wps` | Partial | Partial | Legacy binary format text extraction only; complex layout formatting and margins omitted. |
| 7 | `msg` | **Outlook Message** | `msg` | Partial | Partial | Extracts message headers and text/HTML body cleanly; embedded compound attachments require manual save. |
