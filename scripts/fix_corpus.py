import os, struct, io, zipfile, subprocess, shutil

SUPP = "C:/Users/vasanth/Downloads/Lirune_Supplementary_Format_Tests/samples/primary"

# 1. BIFF8 XLS
def gen_biff8_xls(tier):
    sheet_name = b'LiruneData'
    ws_offset = 20 + 4 + 9 + len(sheet_name) + 4
    stream = bytearray()
    stream.extend(struct.pack('<HH HHHH II', 0x0809, 16, 0x0600, 0x0005, 0x0dbb, 0x0cc0, 0x00000001, 0x00000006))
    bs_data = bytearray()
    bs_data.extend(struct.pack('<I BB H B', ws_offset, 0, 0, len(sheet_name), 0))
    bs_data.extend(sheet_name)
    stream.extend(struct.pack('<HH', 0x0085, len(bs_data)))
    stream.extend(bs_data)
    stream.extend(struct.pack('<HH', 0x000A, 0))
    
    stream.extend(struct.pack('<HH HHHH II', 0x0809, 16, 0x0600, 0x0010, 0x0dbb, 0x0cc0, 0x00000001, 0x00000006))
    count = 5 if tier == 'low' else 25 if tier == 'medium' else 75
    for r in range(count):
        stream.extend(struct.pack('<HH HHH d', 0x0203, 14, r, 0, 0, float(r * 10 + 5)))
    stream.extend(struct.pack('<HH', 0x000A, 0))
    
    if len(stream) < 4096:
        stream.extend(b'\x00' * (4096 - len(stream)))
        
    header = bytearray(512)
    header[0:8] = b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1'
    struct.pack_into('<H', header, 24, 0x003E)
    struct.pack_into('<H', header, 26, 0x0003)
    struct.pack_into('<H', header, 28, 0xFFFE)
    struct.pack_into('<H', header, 30, 9)
    struct.pack_into('<H', header, 32, 6)
    struct.pack_into('<I', header, 44, 1)
    struct.pack_into('<I', header, 48, 1)
    struct.pack_into('<I', header, 56, 4096)
    struct.pack_into('<I', header, 60, 0xFFFFFFFE)
    struct.pack_into('<I', header, 68, 0xFFFFFFFE)
    struct.pack_into('<I', header, 76, 0)
    for i in range(1, 109):
        struct.pack_into('<I', header, 76 + i*4, 0xFFFFFFFF)
        
    wb_sectors = (len(stream) + 511) // 512
    fat = bytearray(512)
    struct.pack_into('<I', fat, 0, 0xFFFFFFFD)
    struct.pack_into('<I', fat, 4, 0xFFFFFFFE)
    for s in range(wb_sectors):
        next_s = 2 + s + 1 if s < wb_sectors - 1 else 0xFFFFFFFE
        struct.pack_into('<I', fat, (2 + s) * 4, next_s)
    for rem in range(2 + wb_sectors, 128):
        struct.pack_into('<I', fat, rem * 4, 0xFFFFFFFF)
        
    dir_sector = bytearray(512)
    root_name = 'Root Entry\x00'.encode('utf-16le')
    dir_sector[0:len(root_name)] = root_name
    struct.pack_into('<H', dir_sector, 64, len(root_name))
    dir_sector[66] = 5
    dir_sector[67] = 1
    struct.pack_into('<I', dir_sector, 68, 0xFFFFFFFF)
    struct.pack_into('<I', dir_sector, 72, 0xFFFFFFFF)
    struct.pack_into('<I', dir_sector, 76, 1)
    struct.pack_into('<I', dir_sector, 116, 0xFFFFFFFE)
    
    wb_name = 'Workbook\x00'.encode('utf-16le')
    offset = 128
    dir_sector[offset:offset+len(wb_name)] = wb_name
    struct.pack_into('<H', dir_sector, offset + 64, len(wb_name))
    dir_sector[offset + 66] = 2
    dir_sector[offset + 67] = 1
    struct.pack_into('<I', dir_sector, offset + 68, 0xFFFFFFFF)
    struct.pack_into('<I', dir_sector, offset + 72, 0xFFFFFFFF)
    struct.pack_into('<I', dir_sector, offset + 76, 0xFFFFFFFF)
    struct.pack_into('<I', dir_sector, offset + 116, 2)
    struct.pack_into('<I', dir_sector, offset + 120, len(stream))
    
    pad_len = wb_sectors * 512 - len(stream)
    padded_stream = stream + b'\x00' * pad_len
    return bytes(header + fat + dir_sector + padded_stream)

for t in ['low', 'medium', 'high']:
    out = os.path.join(SUPP, 'xls', t, f'xls_sample_{t}.xls')
    with open(out, 'wb') as f:
        f.write(gen_biff8_xls(t))
    print(f'Wrote {out}: {os.path.getsize(out)} bytes')

# 2. XLSB
def gen_xlsb(tier):
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/>
  <Override PartName="/xl/workbook.bin" ContentType="application/vnd.ms-excel.workbook"/>
  <Override PartName="/xl/worksheets/sheet1.bin" ContentType="application/vnd.ms-excel.worksheet"/>
</Types>""")
        zf.writestr('_rels/.rels', """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.bin"/>
</Relationships>""")
        zf.writestr('xl/_rels/workbook.bin.rels', """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.bin"/>
</Relationships>""")
        
        rid = 'rId1'.encode('utf-16le')
        sname = 'Sheet1'.encode('utf-16le')
        bsh_payload = bytearray()
        bsh_payload.extend(struct.pack('<I B BBB I', 1, 0, 0, 0, 0, len('rId1')))
        bsh_payload.extend(rid)
        bsh_payload.extend(struct.pack('<I', len('Sheet1')))
        bsh_payload.extend(sname)
        wb_bin = bytes([0x9C, 0x01, len(bsh_payload)]) + bytes(bsh_payload)
        zf.writestr('xl/workbook.bin', wb_bin)
        
        count = 5 if tier == 'low' else 25 if tier == 'medium' else 75
        sheet_bin = bytearray()
        for r in range(count):
            sheet_bin.extend(bytes([0x00, 0x04]))
            sheet_bin.extend(struct.pack('<I', r))
            sheet_bin.extend(bytes([0x05, 0x10]))
            cell = bytearray(16)
            struct.pack_into('<IHHd', cell, 0, 0, 0, 0, float(r * 10 + 5))
            sheet_bin.extend(cell)
        zf.writestr('xl/worksheets/sheet1.bin', bytes(sheet_bin))
    return bio.getvalue()

for t in ['low', 'medium', 'high']:
    out = os.path.join(SUPP, 'xlsb', t, f'xlsb_sample_{t}.xlsb')
    with open(out, 'wb') as f:
        f.write(gen_xlsb(t))
    print(f'Wrote {out}: {os.path.getsize(out)} bytes')

# 3. AVIF using ffmpeg
for t, s, c in [('low', '320x240', 'blue'), ('medium', '640x480', 'green'), ('high', '1280x720', 'red')]:
    out = os.path.join(SUPP, 'avif', t, f'avif_sample_{t}.avif')
    subprocess.run(['ffmpeg', '-f', 'lavfi', '-i', f'color=c={c}:s={s}', '-frames:v', '1', '-c:v', 'libsvtav1', '-pix_fmt', 'yuv420p', out, '-y'], check=True, capture_output=True)
    print(f'Generated {out}: {os.path.getsize(out)} bytes')

# 4. HEIC & HEIF using genuine downloaded test files
heic_map = {
    'low': 'temp_heic_low.heic',
    'medium': 'temp_heic_med.heic',
    'high': 'temp_heic1.heic'
}
for t, src in heic_map.items():
    dst_heic = os.path.join(SUPP, 'heic', t, f'heic_sample_{t}.heic')
    dst_heif = os.path.join(SUPP, 'heif', t, f'heif_sample_{t}.heif')
    shutil.copyfile(src, dst_heic)
    shutil.copyfile(src, dst_heif)
    print(f'Copied real HEIC to {dst_heic} and {dst_heif}')

print('ALL FIXTURES SUCCESSFULLY REGENERATED!')
