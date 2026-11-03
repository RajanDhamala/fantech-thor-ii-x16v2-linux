"""Inspect the vendor's three-decimal-digit byte serialization, offline only.

The codec is corroborated by Ghidra functions 0x43e860 / 0x43e950.
Decoded file records are not USB packets or a recovered onboard macro format.
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ("constmacro.dat", "_dat", "pubg_en.dat", "pubg_cn.dat")


def inspect(name):
    path = ROOT / "extracted/payload" / name
    if path.stat().st_size > 1_000_000:
        raise ValueError("Unexpected macro file size")
    data = path.read_bytes()
    data.decode("ascii", errors="strict")
    result = {"path": str(path.relative_to(ROOT)),
              "sha256": hashlib.sha256(data).hexdigest(),
              "encoding": "ASCII", "records": []}
    section = None
    offset = 0
    for number, line in enumerate(data.splitlines(keepends=True), 1):
        content = line.rstrip(b"\r\n")
        if content.startswith(b"[") and content.endswith(b"]"):
            section = content[1:-1].decode("ascii")
        elif section == "Init" and content.startswith(b"DAT_VER="):
            result["dat_ver"] = int(content.split(b"=", 1)[1])
        elif section == "Macros" and content.startswith(b"macroNum="):
            result["declared_macro_count"] = int(content.split(b"=", 1)[1])
        elif section == "Macros" and re.fullmatch(rb"\d+=\d+", content):
            key, digits = content.split(b"=", 1)
            if len(digits) % 3:
                raise ValueError(f"{name}:{number}: partial three-digit byte")
            values = [int(digits[i:i + 3]) for i in range(0, len(digits), 3)]
            if any(value > 255 for value in values):
                raise ValueError(f"{name}:{number}: value exceeds one byte")
            decoded = bytes(values)
            prefix = decoded[:60].decode("utf-16le", errors="strict").split("\0", 1)[0]
            result["records"].append({
                "key": key.decode("ascii"), "source_line": number,
                "value_file_offset": offset + len(key) + 1,
                "digit_length": len(digits), "decoded_length": len(decoded),
                "decoded_sha256": hashlib.sha256(decoded).hexdigest(),
                "first_60_bytes_as_utf16le": prefix,
                "first_96_bytes_hex": decoded[:96].hex(" "),
            })
        offset += len(line)
    result["serialized_record_count"] = len(result["records"])
    return result


if __name__ == "__main__":
    print(json.dumps({
        "scope": "Vendor file serialization, not USB report/event semantics",
        "codec_evidence": ["ghidra-macro-codec-pass/0043e860.c", "ghidra-macro-pass/0043e950.c"],
        "source_offset_rule": "decoded byte n begins at value_file_offset + 3*n",
        "files": [inspect(name) for name in FILES],
    }, indent=2, ensure_ascii=False))
