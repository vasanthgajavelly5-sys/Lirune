#!/usr/bin/env python3
"""
Generates tiny test fixtures (< 50 KB each) for testing ZIP/APK classification,
archive browsing, encoding fallbacks, and security guards.
"""

import os
import sys
import zipfile
import io
import struct

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "test-fixtures", "zip-suite")
os.makedirs(FIXTURES_DIR, exist_ok=True)

def write_zip(filename, entries, comment=b""):
    path = os.path.join(FIXTURES_DIR, filename)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)
        if comment:
            z.comment = comment
    return path

# 1. Minimal APK: AndroidManifest.xml, classes.dex, META-INF/CERT.RSA
write_zip("minimal.apk", {
    "AndroidManifest.xml": b"\x03\x00\x08\x00BinaryXmlManifestContentHere",
    "classes.dex": b"dex\n035\x00DummyDexBytesHeaderAndStrings",
    "resources.arsc": b"\x02\x00\x0c\x00ResourceTableBytes",
    "META-INF/CERT.RSA": b"Pkcs7CertificateSignatureBytes",
})

# 2. Minimal JAR: META-INF/MANIFEST.MF, com/example/App.class
write_zip("minimal.jar", {
    "META-INF/MANIFEST.MF": b"Manifest-Version: 1.0\r\nMain-Class: com.example.App\r\n\r\n",
    "com/example/App.class": b"\xca\xfe\xba\xbe\x00\x00\x00\x34ClassBytecodeBytes",
})

# 3. Minimal AAB / APKS / XAPK
write_zip("minimal.aab", {
    "BundleConfig.pb": b"ProtoBufBundleConfig",
    "base/manifest/AndroidManifest.xml": b"BinaryXml",
    "base/dex/classes.dex": b"dex\n035",
})

write_zip("minimal.xapk", {
    "manifest.json": b'{"xapk_version": 1, "package_name": "com.test.app"}',
    "base.apk": b"PK\x03\x04DummyApkContent",
})

# 4. Minimal EPUB
write_zip("minimal.epub", {
    "mimetype": b"application/epub+zip",
    "META-INF/container.xml": b'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    "content.opf": b'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test Title</dc:title></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
    "c1.xhtml": b'<!DOCTYPE html><html><body><h1>Chapter 1</h1></body></html>',
})

# 5. Minimal CBZ (images + ComicInfo.xml)
png_pixel = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
write_zip("minimal.cbz", {
    "001.png": png_pixel,
    "002.png": png_pixel,
    "ComicInfo.xml": b"<ComicInfo><Title>Sample Comic</Title></ComicInfo>",
})

# 6. Minimal DOCX
write_zip("minimal.docx", {
    "[Content_Types].xml": b'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    "word/document.xml": b'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p></w:body></w:document>',
})

# 7. Minimal ODT
write_zip("minimal.odt", {
    "mimetype": b"application/vnd.oasis.opendocument.text",
    "content.xml": b'<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>Hello ODT</text:p></office:text></office:body></office:document-content>',
})

# 8. Plain ZIP containing 3 EPUBs + 1 PDF (ARCHIVE_CONTAINER)
epub_data = open(os.path.join(FIXTURES_DIR, "minimal.epub"), "rb").read()
pdf_data = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n115\n%%EOF\n"

write_zip("library_bundle.zip", {
    "SciFi/Asimov_Foundation.epub": epub_data,
    "SciFi/Clarke_Odyssey.epub": epub_data,
    "Fantasy/Tolkien_Hobbit.epub": epub_data,
    "NonFiction/Physics_Manual.pdf": pdf_data,
    "README.txt": b"Enjoy these books!",
})

# 9. ZIP containing ONLY .txt files (failed:unrecognized)
write_zip("text_notes_only.zip", {
    "notes/todo.txt": b"1. Clean room\n2. Buy milk",
    "notes/ideas.txt": b"App idea: good epub reader",
})

# 10. Minimal FB2.ZIP
fb2_xml = b'<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Single FB2</book-title></title-info></description><body><section><p>Hello FB2</p></section></body></FictionBook>'
write_zip("single_book.fb2.zip", {
    "book.fb2": fb2_xml,
})

# 11. Nested ZIP (ZIP containing another zip and a book)
inner_zip_bytes = io.BytesIO()
with zipfile.ZipFile(inner_zip_bytes, "w") as z_inner:
    z_inner.writestr("deep_book.epub", epub_data)

write_zip("nested_archive.zip", {
    "inner_collection.zip": inner_zip_bytes.getvalue(),
    "top_level.epub": epub_data,
})

# 12. CP866 encoded filename without UTF-8 bit (bit 11 = 0)
def write_raw_zip_entry(filename, entry_name_bytes, data_bytes, flags=0):
    path = os.path.join(FIXTURES_DIR, filename)
    with open(path, "wb") as f:
        # Local file header
        f.write(b"PK\x03\x04")
        f.write(struct.pack("<HHHHHIIIHH", 20, flags, 0, 0, 0, 0, len(data_bytes), len(data_bytes), len(entry_name_bytes), 0))
        f.write(entry_name_bytes)
        f.write(data_bytes)
        cd_offset = f.tell()
        # Central directory header
        f.write(b"PK\x01\x02")
        f.write(struct.pack("<HHHHHHIIIHHHHHII", 20, 20, flags, 0, 0, 0, 0, len(data_bytes), len(data_bytes), len(entry_name_bytes), 0, 0, 0, 0, 0, 0))
        f.write(entry_name_bytes)
        cd_size = f.tell() - cd_offset
        # EOCD
        f.write(b"PK\x05\x06")
        f.write(struct.pack("<HHHHIIH", 0, 0, 1, 1, cd_size, cd_offset, 0))

# "Книга.epub" in CP866 encoding:
# К = 0x8A, н = 0xAD, и = 0xA8, г = 0xA3, а = 0xA0
cp866_name = b"\x8a\xad\xa8\xa3\xa0.epub"
write_raw_zip_entry("cp866_names.zip", cp866_name, epub_data, flags=0)

# 13. Zip-slip test fixture: entry with ../../evil.epub
write_raw_zip_entry("zip_slip_malicious.zip", b"../../evil.epub", b"Malicious payload", flags=0x800)

# 14. Zip with leading junk bytes (Self-extracting executable or prefix garbage)
junk_prefix = b"MZ\x90\x00\x03\x00\x00\x00This is simulated self-extracting header data"
zip_data = open(os.path.join(FIXTURES_DIR, "library_bundle.zip"), "rb").read()
with open(os.path.join(FIXTURES_DIR, "junk_prefix_sfx.zip"), "wb") as f:
    f.write(junk_prefix)
    f.write(zip_data)

# 15. Truncated ZIP (missing EOCD)
with open(os.path.join(FIXTURES_DIR, "truncated_corrupt.zip"), "wb") as f:
    f.write(zip_data[:len(zip_data) - 50])

print("Successfully generated all ZIP fixtures in:", FIXTURES_DIR)
