"""Extract the inspected X16v2 installer as data; never execute vendor code.

The InstallShield stream format and byte transform were investigated using
https://github.com/lifenjoiner/ISx (ISx.c). This is a version-specific parser,
not a general installer unpacker. Output files are verified before writing.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import zlib


INSTALLER_SHA256 = "13aa8c2972de408e00dfb1ef8ab4597d51f1862e33dbac47ae75e8152d128c01"
INSTALLER_SIZE = 7_800_529
STREAM_OFFSET = 0x17CC00
MAX_MEMBER_SIZE = 16 * 1024 * 1024
MEMBERS = {
    "0x0409.ini": (22_490, "089d3068e42958dd2c0aec668e5b7e57b7584aca5c77132b1bcbe3a1da33ef54"),
    "Fantech X16v2 Gaming Mouse.msi": (7_853_056, "d7fdbb4a12a9db88a45081462faac2db0c7f58e1b6b62c231cdf7f66bfab0bb0"),
    "Setup.ini": (5_342, "6a671dfa100bd18f1157c4f3bf5495a2f9734837b114c5f46dd8891a240d457e"),
}


def inflate_bounded(data):
    inflater = zlib.decompressobj()
    result = inflater.decompress(data, MAX_MEMBER_SIZE + 1)
    if (len(result) > MAX_MEMBER_SIZE or not inflater.eof
            or inflater.unused_data or inflater.unconsumed_tail):
        raise ValueError("Invalid, oversized, or incomplete compressed member")
    return result


def unpack(data):
    if (len(data) != INSTALLER_SIZE
            or hashlib.sha256(data).hexdigest() != INSTALLER_SHA256):
        raise ValueError("Installer does not match the inspected version; refusing extraction")
    signature, count, stream_type = struct.unpack_from("<14sHI", data, STREAM_OFFSET)
    if signature != b"ISSetupStream\0" or count != 3 or stream_type != 3:
        raise ValueError("Unexpected InstallShield stream")
    offset = STREAM_OFFSET + 46
    members = {}
    for _ in range(count):
        name_size, flags, _, size, _, compressed = struct.unpack_from("<II2sI8sH", data, offset)
        offset += 24
        if (not 0 < name_size <= 512 or name_size % 2
                or offset + name_size + size > len(data)
                or flags != 6 or compressed != 1):
            raise ValueError("Unexpected member attributes")
        name = data[offset:offset + name_size].decode("utf-16-le").rstrip("\0")
        offset += name_size
        # An exact allowlist prevents paths, duplicate names, and unrecognized files.
        if name not in MEMBERS or name in members:
            raise ValueError("Unexpected or duplicate member name")
        seed = name.encode("utf-8")
        magic = (0x13, 0x35, 0x86, 0x07)
        key = bytes(value ^ magic[i % 4] for i, value in enumerate(seed))
        stored = data[offset:offset + size]
        decoded = bytes(
            (~(((value << 4) | (value >> 4)) ^ key[(i % 1024) % len(key)])) & 255
            for i, value in enumerate(stored)
        )
        result = inflate_bounded(decoded)
        expected_size, expected_hash = MEMBERS[name]
        if len(result) != expected_size or hashlib.sha256(result).hexdigest() != expected_hash:
            raise ValueError("Extracted member failed size/hash verification")
        members[name] = result
        offset += size
    if offset != len(data):
        raise ValueError("Unexpected trailing data")
    return members


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", type=Path)
    parser.add_argument("output", type=Path, help="New output directory; existing paths are refused")
    args = parser.parse_args()
    try:
        with args.installer.open("rb") as source:
            members = unpack(source.read(INSTALLER_SIZE + 1))
        args.output.mkdir(mode=0o700, exist_ok=False)
        for name, content in members.items():
            descriptor = os.open(args.output / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(descriptor, "wb") as target:
                target.write(content)
        print(json.dumps({name: {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
                          for name, content in members.items()}, indent=2))
    except (OSError, ValueError, struct.error, UnicodeError, zlib.error) as error:
        parser.exit(1, f"Extraction failed: {error}\n")


if __name__ == "__main__":
    main()
