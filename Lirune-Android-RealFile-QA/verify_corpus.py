#!/usr/bin/env python3
"""
Structural verification for the Lirune Reader real-file QA corpus.

Checks every generated file without any third-party book content:
  - ZIP containers (EPUB mimetype rules, CBZ entries, nested EPUB in ZIP)
  - XML well-formedness (container.xml, OPF, NCX, nav, XHTML, FB2)
  - UTF-8 / non-UTF-8 text decoding
  - FB2 binary payload round-trip
  - MOBI (PDB/PalmDOC/MOBI magic) and RAR5 signature/header CRC

PDF rendering/metadata is verified separately by verify_corpus.mjs (pdfjs-dist).
Run from anywhere:  python Lirune-Android-RealFile-QA/verify_corpus.py
"""

import io
import os
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
import zlib

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
VALID = os.path.join(HERE, "valid")
EDGE = os.path.join(HERE, "edge")

failures = []
checks = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global checks
    checks += 1
    status = "PASS" if ok else "FAIL"
    print("[%s] %s%s" % (status, label, (" - " + detail) if detail else ""))
    if not ok:
        failures.append(label)


def xml_ok(label: str, data: bytes) -> None:
    try:
        ET.fromstring(data)
        check(label, True)
    except Exception as exc:  # noqa: BLE001
        check(label, False, str(exc))


def verify_epub() -> None:
    path = os.path.join(VALID, "sample-minimal.epub")
    with open(path, "rb") as f:
        raw = f.read()
    check("epub: ZIP magic", raw[:2] == b"PK", raw[:4].hex())
    with zipfile.ZipFile(path) as z:
        check("epub: no corrupt entries", z.testzip() is None)
        infos = z.infolist()
        check("epub: mimetype is first entry", infos[0].filename == "mimetype", infos[0].filename)
        check(
            "epub: mimetype stored (uncompressed)",
            infos[0].compress_type == zipfile.ZIP_STORED,
            "compress_type=%d" % infos[0].compress_type,
        )
        mt = z.read("mimetype")
        check("epub: mimetype value", mt == b"application/epub+zip", mt.decode())
        names = z.namelist()
        for required in (
            "META-INF/container.xml",
            "OEBPS/content.opf",
            "OEBPS/nav.xhtml",
            "OEBPS/toc.ncx",
            "OEBPS/style.css",
            "OEBPS/cover.xhtml",
            "OEBPS/images/cover.jpg",
        ):
            check("epub: contains %s" % required, required in names)
        chapters = [n for n in names if n.startswith("OEBPS/chapter")]
        check("epub: 5 content documents", len(chapters) == 5, str(len(chapters)))
        xml_ok("epub: container.xml well-formed", z.read("META-INF/container.xml"))
        opf = z.read("OEBPS/content.opf")
        xml_ok("epub: OPF well-formed", opf)
        check("epub: EPUB3 package version", b'version="3.0"' in opf)
        check("epub: nav item declared", b'properties="nav"' in opf)
        check("epub: NCX declared in spine", b'toc="ncx"' in opf)
        check("epub: 6 itemrefs (cover + 5 chapters)", opf.count(b"<itemref") == 6,
              str(opf.count(b"<itemref")))
        check("epub: dc:title present", b"<dc:title>" in opf)
        check("epub: dc:creator present", b"<dc:creator>" in opf)
        check("epub: meta name=cover present", b'name="cover"' in opf)
        xml_ok("epub: nav.xhtml well-formed", z.read("OEBPS/nav.xhtml"))
        check("epub: nav has toc role", b'epub:type="toc"' in z.read("OEBPS/nav.xhtml"))
        xml_ok("epub: toc.ncx well-formed", z.read("OEBPS/toc.ncx"))
        check("epub: NCX has 5 navPoints", z.read("OEBPS/toc.ncx").count(b"<navPoint") == 5)
        for c in chapters:
            xml_ok("epub: %s well-formed" % os.path.basename(c), z.read(c))
            body = z.read(c)
            check("epub: %s has text" % os.path.basename(c), b"<p>" in body and len(body) > 800,
                  "%d bytes" % len(body))
        img = Image.open(io.BytesIO(z.read("OEBPS/images/cover.jpg")))
        check("epub: cover image decodes", img.size == (600, 900), str(img.size))


def verify_cbz() -> None:
    path = os.path.join(VALID, "sample-comic.cbz")
    with zipfile.ZipFile(path) as z:
        check("cbz: no corrupt entries", z.testzip() is None)
        pages = [n for n in z.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png"))]
        check("cbz: 5-10 JPEG pages", 5 <= len(pages) <= 10, "%d pages" % len(pages))
        for p in pages:
            img = Image.open(io.BytesIO(z.read(p)))
            check("cbz: %s decodes as JPEG" % os.path.basename(p), img.format == "JPEG",
                  "%s %s" % (img.format, str(img.size)))
        check("cbz: pages sorted naturally", pages == sorted(pages))
        check("cbz: ComicInfo.xml present", "ComicInfo.xml" in z.namelist())


def verify_zip_container() -> None:
    path = os.path.join(EDGE, "epub-in-zip.zip")
    with zipfile.ZipFile(path) as z:
        check("zip: no corrupt entries", z.testzip() is None)
        entries = [n for n in z.namelist() if not n.endswith("/")]
        check("zip: exactly one file entry", len(entries) == 1, str(entries))
        check("zip: entry is nested .epub", entries[0].endswith(".epub"), entries[0])
        inner = z.read(entries[0])
        check("zip: nested payload is a ZIP", inner[:2] == b"PK")
        with zipfile.ZipFile(io.BytesIO(inner)) as iz:
            check("zip: nested epub has mimetype", "mimetype" in iz.namelist())
            check("zip: nested epub mimetype value",
                  iz.read("mimetype") == b"application/epub+zip")


def verify_pdf_headers() -> None:
    for name, expect_meta in (("sample-text.pdf", True), ("sample-cover-xmp.pdf", True)):
        path = os.path.join(VALID, name)
        with open(path, "rb") as f:
            raw = f.read()
        check("%s: PDF header" % name, raw.startswith(b"%PDF-1.7"), raw[:8].decode("latin-1"))
        check("%s: EOF marker" % name, raw.rstrip().endswith(b"%%EOF"))
        check("%s: startxref present" % name, b"startxref" in raw)
        check("%s: Info dictionary" % name, b"/Author (" in raw and b"/Title (" in raw)
        check("%s: XMP metadata stream" % name if expect_meta else "%s: no XMP" % name,
              b"/Subtype /XML" in raw, "")
        check("%s: XMP dc:title" % name, b"<dc:title>" in raw)
    with open(os.path.join(VALID, "sample-cover-xmp.pdf"), "rb") as f:
        raw = f.read()
    check("cover pdf: DCTDecode image XObject", b"/Filter /DCTDecode" in raw)
    check("cover pdf: XMP thumbnail reference", b"xmpMM:Thumbnails" in raw and b"cover.jpg" in raw)


def verify_fb2() -> None:
    path = os.path.join(VALID, "sample-story.fb2")
    with open(path, "rb") as f:
        data = f.read()
    root = ET.fromstring(data)
    ns = {"fb": "http://www.gribuser.ru/xml/fictionbook/2.0"}
    check("fb2: root is FictionBook", root.tag.endswith("}FictionBook"), root.tag)
    check("fb2: title present", root.find(".//fb:book-title", ns) is not None)
    check("fb2: author present", root.find(".//fb:author", ns) is not None)
    genres = [g.text for g in root.findall(".//fb:genre", ns)]
    check("fb2: genre present", bool(genres), ",".join(g or "" for g in genres))
    check("fb2: annotation present", root.find(".//fb:annotation", ns) is not None)
    check("fb2: coverpage image reference", root.find(".//fb:coverpage", ns) is not None)
    sections = root.findall(".//fb:body/fb:section", ns)
    check("fb2: 5 chapters", len(sections) == 5, str(len(sections)))
    binary = root.find(".//fb:binary", ns)
    check("fb2: embedded binary declared", binary is not None)
    if binary is not None:
        check("fb2: binary id referenced by coverpage",
              b'#' + binary.get("id", "").encode() in data)
        check("fb2: binary content-type image/jpeg", binary.get("content-type") == "image/jpeg")
        import base64
        img_bytes = base64.b64decode("".join((binary.text or "").split()))
        img = Image.open(io.BytesIO(img_bytes))
        check("fb2: cover image decodes", img.format == "JPEG", "%s %s" % (img.format, str(img.size)))
    check("fb2: empty-line/poem markup present", b"<poem>" in data and b"<empty-line/>" in data)


def verify_html() -> None:
    path = os.path.join(VALID, "sample-book.html")
    with open(path, "rb") as f:
        data = f.read()
    text = data.decode("utf-8")
    check("html: utf-8 decodes", True)
    check("html: doctype", text.lstrip().lower().startswith("<!doctype html"))
    check("html: <title>", "<title>%s</title>" % "The Lighthouse at Sker Point" in text)
    check("html: meta charset", '<meta charset="utf-8">' in text)
    check("html: meta author", 'name="author"' in text)
    check("html: meta description", 'name="description"' in text)
    check("html: headings h1/h2", text.count("<h1") == 1 and text.count("<h2") >= 3,
          "h1=%d h2=%d" % (text.count("<h1"), text.count("<h2")))
    check("html: paragraphs", text.count("<p>") + text.count("<p ") >= 4,
          str(text.count("<p>")))
    check("html: inline data-URI image", "data:image/jpeg;base64," in text)
    import base64
    b64 = text.split("data:image/jpeg;base64,")[1].split('"')[0]
    img = Image.open(io.BytesIO(base64.b64decode(b64)))
    check("html: inline image decodes", img.format == "JPEG", "%s %s" % (img.format, str(img.size)))


def verify_txt() -> None:
    path = os.path.join(VALID, "sample-large-mixed.txt")
    size = os.path.getsize(path)
    check("txt: larger than 1 MB", size > 1024 * 1024, "%d bytes" % size)
    with open(path, "rb") as f:
        data = f.read()
    try:
        text = data.decode("utf-8")
        check("txt: strict UTF-8 decode", True)
    except UnicodeDecodeError as exc:
        check("txt: strict UTF-8 decode", False, str(exc))
        return
    check("txt: no BOM", not data.startswith(b"\xef\xbb\xbf"))
    check("txt: contains CJK", any("\u3000" <= c <= "\u9fff" or "\uff00" <= c <= "\uffef" for c in text))
    check("txt: contains astral emoji", any(ord(c) > 0xFFFF for c in text))
    check("txt: has CRLF lines", "\r\n" in text)
    check("txt: has very long unbroken line", max(len(l) for l in text.split("\n")) > 5000,
          "max line %d chars" % max(len(l) for l in text.split("\n")))
    check("txt: has indented lines", any(l.startswith("    ") for l in text.split("\n")))
    check("txt: first non-empty line usable as title",
          text.split("\n")[0].strip() == "The Lighthouse at Sker Point", text.split("\n")[0][:60])


def verify_edge_binaries() -> None:
    check("edge: zero-byte.epub is empty",
          os.path.getsize(os.path.join(EDGE, "zero-byte.epub")) == 0)

    with open(os.path.join(EDGE, "corrupt-zip.epub"), "rb") as f:
        raw = f.read()
    check("edge: corrupt-zip.epub has local header sig", raw[:4] == b"PK\x03\x04")
    try:
        zipfile.ZipFile(io.BytesIO(raw))
        check("edge: corrupt-zip.epub fails to open", False, "unexpectedly opened")
    except Exception as exc:  # noqa: BLE001
        check("edge: corrupt-zip.epub fails to open", True, type(exc).__name__)

    with open(os.path.join(EDGE, "latin1-encoded.txt"), "rb") as f:
        raw = f.read()
    try:
        raw.decode("utf-8")
        check("edge: latin1 file is not valid UTF-8", False, "decoded as UTF-8")
    except UnicodeDecodeError:
        check("edge: latin1 file is not valid UTF-8", True)
    check("edge: latin1 file decodes as latin-1", "Café" in raw.decode("latin-1"))

    with open(os.path.join(EDGE, "utf16le-encoded.txt"), "rb") as f:
        raw = f.read()
    check("edge: utf16 file has LE BOM", raw[:2] == b"\xff\xfe", raw[:2].hex())
    check("edge: utf16 file has NUL padding bytes", b"\x00" in raw[2:6], raw[2:6].hex())
    decoded = raw.decode("utf-16")
    check("edge: utf16 decodes to readable text", "UTF-16 LE sample" in decoded)

    with open(os.path.join(EDGE, "unsupported.mobi"), "rb") as f:
        raw = f.read()
    name = b"LiruneQAUnsupportedSample"
    check("edge: mobi PDB name field", raw[:len(name)] == name, raw[:len(name)].decode())
    check("edge: mobi PDB name NUL-padded to 32", raw[len(name):32] == b"\x00" * (32 - len(name)))
    check("edge: mobi type/creator", raw[60:68] == b"BOOKTYPE", raw[60:68].decode())
    rec_count = struct.unpack_from(">H", raw, 76)[0]
    check("edge: mobi record count", rec_count == 3, str(rec_count))
    # record info list: 8 bytes per record (uid, offset) starting at offset 78
    rec_offsets = [struct.unpack_from(">I", raw, 78 + 8 * i + 4)[0] for i in range(rec_count)]
    check("edge: mobi record offsets ascending",
          rec_offsets == sorted(rec_offsets) and len(set(rec_offsets)) == 3, str(rec_offsets))
    check("edge: mobi PalmDOC compression=none", raw[rec_offsets[0]:rec_offsets[0] + 2] == b"\x01\x00")
    check("edge: mobi MOBI magic at record 1", raw[rec_offsets[1]:rec_offsets[1] + 4] == b"MOBI",
          raw[rec_offsets[1]:rec_offsets[1] + 4].decode("latin-1"))
    check("edge: mobi MOBI header length", struct.unpack_from(">H", raw, rec_offsets[1] + 4)[0] == 232)
    text_off = rec_offsets[2]
    check("edge: mobi text record readable", b"The Lighthouse at Sker Point" in raw[text_off:])

    with open(os.path.join(EDGE, "unsupported.cbr"), "rb") as f:
        raw = f.read()
    check("edge: cbr RAR5 signature", raw[:8] == b"Rar!\x1a\x07\x01\x00", raw[:8].hex())

    def read_vint(buf: bytes, pos: int):
        value, shift = 0, 0
        while True:
            b = buf[pos]
            pos += 1
            value |= (b & 0x7F) << shift
            shift += 7
            if not b & 0x80:
                return value, pos

    pos, types, names_ok, crc_ok = 8, [], False, True
    unpacked = 0
    while pos < len(raw):
        crc = struct.unpack_from("<I", raw, pos)[0]
        pos += 4
        hdr_start = pos
        size, pos = read_vint(raw, pos)
        # RAR5 HEADER_CRC32 covers the header from the header-size field onward
        header = raw[hdr_start:pos + size]
        if (zlib.crc32(header) & 0xFFFFFFFF) != crc:
            crc_ok = False
            break
        htype, off = read_vint(header, (pos - hdr_start))
        types.append(htype)
        pos += size
        if htype == 2:  # file header - parse fields to find the data area
            flags, off = read_vint(header, off)
            unpacked, off = read_vint(header, off)
            _attrs, off = read_vint(header, off)
            if flags & 0x0002:
                off += 4
            if flags & 0x0004:
                off += 4
            _comp, off = read_vint(header, off)
            _host, off = read_vint(header, off)
            name_len, off = read_vint(header, off)
            names_ok = header[off:off + name_len] == b"cover.jpg"
            pos += unpacked  # stored (method 0) data area follows the header
    check("edge: cbr header CRC valid", crc_ok)
    check("edge: cbr main archive header", 1 in types, str(types))
    check("edge: cbr file header with stored data", 2 in types, str(types))
    check("edge: cbr end-of-archive header", 5 in types, str(types))
    check("edge: cbr file name parsed", names_ok)
    check("edge: cbr reaches EOF cleanly", pos == len(raw), "pos=%d len=%d" % (pos, len(raw)))


def main() -> int:
    verify_epub()
    verify_pdf_headers()
    verify_txt()
    verify_fb2()
    verify_cbz()
    verify_html()
    verify_zip_container()
    verify_edge_binaries()
    print("\n%d checks, %d failures" % (checks, len(failures)))
    for f in failures:
        print("  FAILED: %s" % f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
