import hashlib
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile

from setup_tools import checked_archive, unpack


class ToolSetupTests(unittest.TestCase):
    def test_cached_archive_must_match_publisher_hash_and_size(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            content = b"verified cache fixture"
            expected = hashlib.sha256(content).hexdigest()
            target = cache / expected
            target.write_bytes(content)
            self.assertEqual(checked_archive("unused", expected, len(content), cache), target)
            target.write_bytes(b"corrupted")
            with self.assertRaises(ValueError):
                checked_archive("unused", expected, len(content), cache)

    def test_zip_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "bad.zip"
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("../escape", "bad")
            with self.assertRaises(ValueError):
                unpack(archive, root / "out", "zip")
            self.assertFalse((root / "escape").exists())

    def test_tar_escaping_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "bad.tar.gz"
            with tarfile.open(archive, "w:gz") as t:
                link = tarfile.TarInfo("jdk/bin/escape")
                link.type = tarfile.SYMTYPE
                link.linkname = "../../../escape"
                t.addfile(link)
            with self.assertRaises(tarfile.FilterError):
                unpack(archive, root / "out", "tar")
            self.assertFalse((root / "escape").exists())

    def test_zip_executable_permissions_are_restored(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "good.zip"
            with zipfile.ZipFile(archive, "w") as z:
                entry = zipfile.ZipInfo("ghidra/support/analyzeHeadless")
                entry.external_attr = 0o100755 << 16
                z.writestr(entry, "#!/bin/sh\n")
            unpack(archive, root / "out", "zip")
            self.assertEqual((root / "out/ghidra/support/analyzeHeadless").stat().st_mode & 0o777, 0o755)


if __name__ == "__main__":
    unittest.main()
