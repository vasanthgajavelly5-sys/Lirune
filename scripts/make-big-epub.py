#!/usr/bin/env python3
"""
Generate valid EPUB test fixtures with configurable chapter counts:
- 500 chapters
- 2,000 chapters
- 5,000 chapters
Includes variants:
- standard (with nested NCX/nav TOC matching number of entries)
- no-toc (flat spine and no TOC entries)
"""

import sys
import os
import zipfile
import argparse

def generate_epub(output_path, chapter_count, include_toc=True, nested_toc=True):
    print(f"Generating {output_path} ({chapter_count} chapters, TOC={include_toc}, nested={nested_toc})...")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        # 1. mimetype (MUST be stored, uncompressed, first entry)
        z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)

        # 2. META-INF/container.xml
        container_xml = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""
        z.writestr('META-INF/container.xml', container_xml)

        # 3. Chapters
        manifest_items = []
        spine_items = []
        ncx_points = []
        nav_items = []

        if include_toc:
            manifest_items.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
            manifest_items.append('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')

        for i in range(1, chapter_count + 1):
            chap_id = f"chap_{i}"
            chap_filename = f"chapter_{i}.xhtml"
            chap_title = f"Chapter {i}"
            
            manifest_items.append(f'<item id="{chap_id}" href="{chap_filename}" media-type="application/xhtml+xml"/>')
            spine_items.append(f'<itemref idref="{chap_id}"/>')

            # XHTML Content
            chap_content = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <title>{chap_title}</title>
</head>
<body>
  <h1>{chap_title}</h1>
  <p>This is the first paragraph of {chap_title}. It provides content for performance and volume benchmarks.</p>
  <p>Reading large books with thousands of chapters tests spine indexing, memory usage, and pagination performance.</p>
</body>
</html>"""
            z.writestr(f"OEBPS/{chap_filename}", chap_content)

        # Build TOC if enabled
        if include_toc:
            # NCX & Nav (nested every 10 chapters if nested_toc is True)
            ncx_lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                         '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">',
                         '  <head>',
                         '    <meta name="dtb:uid" content="urn:uuid:lirune-big-epub-test"/>',
                         '    <meta name="dtb:depth" content="2"/>',
                         '    <meta name="dtb:totalPageCount" content="0"/>',
                         '    <meta name="dtb:maxPageNumber" content="0"/>',
                         '  </head>',
                         '  <docTitle><text>Big EPUB Test Fixture</text></docTitle>',
                         '  <navMap>']

            nav_lines = ['<?xml version="1.0" encoding="utf-8"?>',
                         '<!DOCTYPE html>',
                         '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">',
                         '<head><title>Table of Contents</title></head>',
                         '<body>',
                         '  <nav epub:type="toc" id="toc">',
                         '    <h1>Table of Contents</h1>',
                         '    <ol>']

            play_order = 1
            i = 1
            while i <= chapter_count:
                if nested_toc and i % 10 == 1 and i + 9 <= chapter_count:
                    # Section header with nested items
                    sec_title = f"Section {(i - 1) // 10 + 1}"
                    ncx_lines.append(f'    <navPoint id="np_{play_order}" playOrder="{play_order}">')
                    ncx_lines.append(f'      <navLabel><text>{sec_title}</text></navLabel>')
                    ncx_lines.append(f'      <content src="chapter_{i}.xhtml"/>')
                    play_order += 1
                    nav_lines.append(f'      <li><a href="chapter_{i}.xhtml">{sec_title}</a><ol>')

                    for j in range(i, i + 10):
                        ncx_lines.append(f'      <navPoint id="np_{play_order}" playOrder="{play_order}">')
                        ncx_lines.append(f'        <navLabel><text>Chapter {j}</text></navLabel>')
                        ncx_lines.append(f'        <content src="chapter_{j}.xhtml"/>')
                        ncx_lines.append('      </navPoint>')
                        play_order += 1
                        nav_lines.append(f'        <li><a href="chapter_{j}.xhtml">Chapter {j}</a></li>')

                    ncx_lines.append('    </navPoint>')
                    nav_lines.append('      </ol></li>')
                    i += 10
                else:
                    ncx_lines.append(f'    <navPoint id="np_{play_order}" playOrder="{play_order}">')
                    ncx_lines.append(f'      <navLabel><text>Chapter {i}</text></navLabel>')
                    ncx_lines.append(f'      <content src="chapter_{i}.xhtml"/>')
                    ncx_lines.append('    </navPoint>')
                    play_order += 1
                    nav_lines.append(f'      <li><a href="chapter_{i}.xhtml">Chapter {i}</a></li>')
                    i += 1

            ncx_lines.append('  </navMap>')
            ncx_lines.append('</ncx>')
            z.writestr("OEBPS/toc.ncx", "\n".join(ncx_lines))

            nav_lines.append('    </ol>')
            nav_lines.append('  </nav>')
            nav_lines.append('</body>')
            nav_lines.append('</html>')
            z.writestr("OEBPS/nav.xhtml", "\n".join(nav_lines))

        # 4. content.opf
        toc_attr = ' toc="ncx"' if include_toc else ''
        opf_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:lirune-big-epub-test-{chapter_count}</dc:identifier>
    <dc:title>Big EPUB Fixture - {chapter_count} Chapters</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>Lirune Performance Harness</dc:creator>
    <meta property="dcterms:modified">2026-10-26T12:00:00Z</meta>
  </metadata>
  <manifest>
    {"\n    ".join(manifest_items)}
  </manifest>
  <spine{toc_attr}>
    {"\n    ".join(spine_items)}
  </spine>
</package>"""
        z.writestr("OEBPS/content.opf", opf_xml)

    size = os.path.getsize(output_path)
    print(f"Generated {output_path} ({size:,} bytes)")

def main():
    parser = argparse.ArgumentParser(description="Generate large EPUB fixtures for benchmark testing")
    parser.add_argument("--counts", nargs="+", type=int, default=[500, 2000, 5000], help="Chapter counts to generate")
    parser.add_argument("--outdir", default="test-assets/big-epubs", help="Output directory")
    args = parser.parse_args()

    for count in args.counts:
        # Standard variant (nested TOC)
        standard_path = os.path.join(args.outdir, f"epub_{count}_chapters.epub")
        generate_epub(standard_path, count, include_toc=True, nested_toc=True)

        # No-TOC flat-spine variant
        notoc_path = os.path.join(args.outdir, f"epub_{count}_chapters_notoc.epub")
        generate_epub(notoc_path, count, include_toc=False, nested_toc=False)

if __name__ == "__main__":
    main()
