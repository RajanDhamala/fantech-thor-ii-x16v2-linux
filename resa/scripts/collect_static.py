"""Reproduce local evidence after extraction. Parses bytes; never loads vendor code.

Requires only Python's standard library and the already-installed objdump/strings.
This script is deliberately limited to the exact extracted application build.
"""
import hashlib
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evidence'
APP = ROOT / 'extracted/payload/fantech_x16v2_gaming_mouse.e'
SHA = '0c57c57868ab44cdf1c65411a66abce78bec879482dc427ddde991eac5c39b19'


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def main():
    b = APP.read_bytes()
    if hashlib.sha256(b).hexdigest() != SHA:
        raise ValueError('Unexpected application build')
    OUT.mkdir(exist_ok=True)
    manifest = []
    for p in sorted((ROOT / 'extracted').rglob('*')):
        if p.is_file():
            data = p.read_bytes()
            manifest.append(dict(path=str(p.relative_to(ROOT)), bytes=len(data),
                                 sha256=hashlib.sha256(data).hexdigest()))
    save('extracted-manifest.json', manifest)
    pe = struct.unpack_from('<I', b, 0x3c)[0]
    n = struct.unpack_from('<H', b, pe + 6)[0]
    opt = pe + 24
    opt_size = struct.unpack_from('<H', b, pe + 20)[0]
    base = struct.unpack_from('<I', b, opt + 28)[0]
    sections = []
    for i in range(n):
        o = opt + opt_size + 40 * i
        vs, rva, rs, off = struct.unpack_from('<4I', b, o + 8)
        sections.append(dict(name=b[o:o+8].rstrip(b'\0').decode(),
                             rva=rva, virtual_bytes=vs, file_bytes=rs, offset=off))

    def raw(va):
        for s in sections:
            if s['rva'] <= va-base < s['rva'] + s['file_bytes']:
                return s['offset'] + va-base-s['rva']
        raise ValueError(f'No file-backed mapping for {va:#x}')

    imports = []
    imprva = struct.unpack_from('<I', b, opt + 104)[0]
    o = raw(base + imprva)
    while any(b[o:o+20]):
        orig, _, _, name, iat = struct.unpack_from('<5I', b, o)
        pos = raw(base + (orig or iat))
        dll = b[raw(base+name):].split(b'\0', 1)[0].decode()
        j = 0
        while (thunk := struct.unpack_from('<I', b, pos + 4*j)[0]):
            symbol = ('ordinal:' + str(thunk & 65535) if thunk & 0x80000000 else
                      b[raw(base+thunk)+2:].split(b'\0', 1)[0].decode())
            imports.append(dict(dll=dll, symbol=symbol, iat_va=hex(base+iat+4*j)))
            j += 1
        o += 20
    save('imports.json', imports)
    table = b[raw(0x663060):raw(0x663060)+23]
    save('pe-summary.json', dict(sha256=SHA, image_base=hex(base), sections=sections,
         cli_directory=struct.unpack_from('<II', b, opt+96+14*8),
         dpi_table=dict(va='0x663060', offset=hex(raw(0x663060)), bytes=list(table))))
    regions = [
        ('memory', 0x413850, 0x413b40), ('dpi-labels', 0x417d8d, 0x417f08),
        ('dpi-index', 0x41a90b, 0x41a95c), ('dpi-packing', 0x41b41d, 0x41bc6d),
        ('button-candidates', 0x41af00, 0x41b3d7),
        ('macro-candidates', 0x41f43b, 0x41f57b),
        ('lighting', 0x429dc0, 0x429f90), ('device-identity', 0x4310ba, 0x4310f0),
        ('device-enumeration', 0x419830, 0x419d50),
        ('hid-caps', 0x419d50, 0x419d94), ('feature-thunks', 0x5c8f8f, 0x5c8fbf),
    ]
    for name, start, end in regions:
        result = subprocess.run(['objdump', '-d', '-Mintel',
            '--start-address='+hex(start), '--stop-address='+hex(end), str(APP)],
            capture_output=True, text=True, check=True)
        (OUT / (name+'.asm')).write_text(result.stdout)
    for name, args in [('app-pe.txt', ['objdump','-x']),
                       ('app-disassembly.txt',['objdump','-d','-Mintel']),
                       ('app-strings-ascii.txt',['strings','-a','-t','x']),
                       ('app-strings-utf16.txt',['strings','-a','-e','l','-t','x'])]:
        with (OUT / name).open('w') as f:
            subprocess.run(args+[str(APP)], stdout=f, check=True)

    # MSI !File is column-major: 3 string IDs, int32 size, 2 string IDs, 2 int16s.
    msi = ROOT / 'extracted/msi'
    pool, data = (msi/'!_StringPool').read_bytes(), (msi/'!_StringData').read_bytes()
    cp, flags = struct.unpack_from('<HH', pool)
    if flags != 0 or len(pool) % 4:
        raise ValueError('Unsupported MSI string pool format')
    strings, pos = {0: ''}, 0
    for idx, off in enumerate(range(4, len(pool), 4), 1):
        length, _ = struct.unpack_from('<HH', pool, off)
        strings[idx] = data[pos:pos+length].decode('cp'+str(cp), errors='strict')
        pos += length
    if pos != len(data):
        raise ValueError('MSI string pool length mismatch')
    data = (msi/'!File').read_bytes()
    if len(data) != 150*18:
        raise ValueError('Unexpected MSI file table')
    cols, pos = [], 0
    for size in [2,2,2,4,2,2,2,2]:
        cols.append([int.from_bytes(data[pos+i*size:pos+(i+1)*size], 'little')
                     for i in range(150)])
        pos += 150*size
    records = []
    for row in range(150):
        v = [c[row] for c in cols]
        key = strings[v[0]]
        if Path(key).name != key or '/' in key or '\\' in key:
            raise ValueError('Unsafe cabinet key')
        payload = ROOT/'extracted/payload'/key
        if payload.stat().st_size != v[3]-0x80000000:
            raise ValueError('MSI member size mismatch')
        records.append(dict(cab_key=key, component=strings[v[1]],
            installed_name=strings[v[2]], bytes=v[3]-0x80000000, sequence=v[7]-0x8000))
    save('msi-files.json', records)
    print('Verified exact application, 150 MSI payload file sizes, imports and focused disassembly.')


if __name__ == '__main__':
    main()
