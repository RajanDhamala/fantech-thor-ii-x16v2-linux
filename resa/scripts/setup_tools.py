"""Install a verified portable JDK 21 and Ghidra into this project, without sudo.

Uses official Adoptium/GitHub release metadata. Never runs the Windows target.
Python 3.12+ is required for filtered tar extraction.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
GHIDRA_VERSION = "12.1.4"
JDK_METADATA = "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=linux&vendor=eclipse"
GHIDRA_METADATA = "https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/Ghidra_12.1.4_build"
MAX_ARCHIVE = 1024 * 1024 * 1024
MAX_UNPACKED = 3 * MAX_ARCHIVE


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "resa-local-setup/0.1"})
    return urllib.request.urlopen(request, timeout=30)


def metadata(url):
    print(f"Reading official metadata: {url}", flush=True)
    with fetch(url) as response:
        data = response.read(4 * 1024 * 1024 + 1)
    if len(data) > 4 * 1024 * 1024:
        raise ValueError("Release metadata exceeds the expected size")
    return json.loads(data)


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def checked_archive(url, expected_hash, expected_size, cache):
    if not re.fullmatch(r"[a-fA-F0-9]{64}", expected_hash):
        raise ValueError("The publisher did not supply a valid SHA-256")
    if not isinstance(expected_size, int) or not 0 < expected_size <= MAX_ARCHIVE:
        raise ValueError("Unexpected archive size")
    expected_hash = expected_hash.lower()
    target = cache / expected_hash
    if target.exists():
        if target.is_symlink() or target.stat().st_size != expected_size or digest(target) != expected_hash:
            raise ValueError(f"Cached archive failed verification: {target}")
        print(f"Using verified cached archive: {target.name}", flush=True)
        return target
    print(f"Downloading {expected_size // (1024 * 1024)} MiB from {url}", flush=True)
    descriptor, name = tempfile.mkstemp(prefix="download-", dir=cache)
    partial = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as output, fetch(url) as response:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > expected_size:
                    raise ValueError("Download exceeds publisher's declared size")
                output.write(chunk)
        if total != expected_size or digest(partial) != expected_hash:
            raise ValueError("Download failed publisher size/SHA-256 verification")
        partial.rename(target)
        return target
    finally:
        partial.unlink(missing_ok=True)


def safe_member(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ValueError(f"Unsafe archive member: {name}")
    return path


def unpack(archive, destination, kind):
    if kind == "tar":
        with tarfile.open(archive, "r:gz") as source:
            members = source.getmembers()
            if len(members) > 50000 or sum(m.size for m in members) > MAX_UNPACKED:
                raise ValueError("Unexpected unpacked archive size")
            for member in members:
                safe_member(member.name)
            # Rejects links that escape destination, device nodes and unsafe modes.
            source.extractall(destination, filter="data")
    else:
        with zipfile.ZipFile(archive) as source:
            entries = source.infolist()
            if len(entries) > 50000 or sum(m.file_size for m in entries) > MAX_UNPACKED:
                raise ValueError("Unexpected unpacked archive size")
            for entry in entries:
                path = safe_member(entry.filename)
                mode = entry.external_attr >> 16
                if stat.S_ISLNK(mode):
                    raise ValueError("Unexpected symbolic link in Ghidra ZIP")
                target = destination.joinpath(*path.parts)
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with source.open(entry) as data, target.open("xb") as output:
                        shutil.copyfileobj(data, output)
                    target.chmod(0o755 if mode & 0o111 else 0o644)


def check_jdk(path):
    if not (path / "bin/javac").is_file() or not (path / "bin/java").is_file():
        raise ValueError(f"Full JDK missing at {path}; a Java runtime alone is insufficient")
    result = subprocess.run([str(path / "bin/javac"), "-version"],
                            capture_output=True, text=True, check=True, timeout=10)
    version = (result.stdout + result.stderr).strip()
    if not re.match(r"javac 21(?:\.|\s|$)", version):
        raise ValueError(f"Expected JDK 21, found {version}")
    runtime = subprocess.run([str(path / "bin/java"), "-version"],
                             capture_output=True, text=True, check=True, timeout=10)
    if not re.search(r'version "21(?:\.|\")', runtime.stdout + runtime.stderr):
        raise ValueError("The installed Java runtime is not version 21")
    print(f"Verified {version}: {path}", flush=True)


def check_ghidra(path):
    properties = path / "Ghidra/application.properties"
    if not properties.is_file() or f"application.version={GHIDRA_VERSION}" not in properties.read_text():
        raise ValueError(f"Ghidra {GHIDRA_VERSION} missing at {path}")
    for relative in ["support/analyzeHeadless", "Ghidra/Features/Decompiler/os/linux_x86_64/decompile"]:
        if not os.access(path / relative, os.X_OK):
            raise ValueError(f"Required executable missing: {path / relative}")
    print(f"Verified Ghidra {GHIDRA_VERSION}: {path}", flush=True)


def install(archive, stable_name, kind, check):
    stable = TOOLS / stable_name
    if stable.exists() or stable.is_symlink():
        check(stable)
        return
    installs = TOOLS / "installs"
    installs.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="unpack-", dir=TOOLS) as temporary:
        staging = Path(temporary)
        unpack(archive, staging, kind)
        children = list(staging.iterdir())
        if len(children) != 1 or not children[0].is_dir():
            raise ValueError("Expected one tool directory in the archive")
        check(children[0])
        destination = installs / children[0].name
        if destination.exists() or destination.is_symlink():
            check(destination)
        else:
            children[0].rename(destination)
        stable.symlink_to(destination.relative_to(TOOLS), target_is_directory=True)


def record_install(name, release, url, checksum):
    manifest = TOOLS / "install-manifest.json"
    records = json.loads(manifest.read_text()) if manifest.exists() else {}
    records[name] = {"release": release, "url": url, "sha256": checksum}
    manifest.write_text(json.dumps(records, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify local tools without downloading")
    args = parser.parse_args()
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "AMD64"):
        raise ValueError("This setup currently supports Linux x86-64 only")
    if sys.version_info < (3, 12):
        raise ValueError("Python 3.12+ is required for safe archive extraction")
    if args.check:
        check_jdk(TOOLS / "jdk-21")
        check_ghidra(TOOLS / "ghidra")
        return
    TOOLS.mkdir(exist_ok=True)
    cache = TOOLS / "downloads"
    cache.mkdir(exist_ok=True)
    if (TOOLS / "jdk-21").exists():
        check_jdk(TOOLS / "jdk-21")
    else:
        assets = metadata(JDK_METADATA)
        if len(assets) != 1:
            raise ValueError("Expected one matching Adoptium JDK release")
        asset = assets[0]
        package = asset["binary"]["package"]
        if not package["link"].startswith("https://github.com/adoptium/temurin21-binaries/releases/download/"):
            raise ValueError("Unexpected JDK publisher/download location")
        archive = checked_archive(package["link"], package["checksum"], package["size"], cache)
        install(archive, "jdk-21", "tar", check_jdk)
        record_install("jdk", asset["release_name"], package["link"], package["checksum"])
    if (TOOLS / "ghidra").exists():
        check_ghidra(TOOLS / "ghidra")
    else:
        release = metadata(GHIDRA_METADATA)
        assets = [a for a in release["assets"] if a["name"].startswith("ghidra_12.1.4_PUBLIC_") and a["name"].endswith(".zip")]
        if len(assets) != 1:
            raise ValueError("Expected one matching official Ghidra release archive")
        asset = assets[0]
        if not asset["browser_download_url"].startswith("https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/"):
            raise ValueError("Unexpected Ghidra download location")
        checksum = asset.get("digest", "")
        if not checksum.startswith("sha256:"):
            raise ValueError("GitHub release metadata has no SHA-256; refusing unverified installation")
        archive = checked_archive(asset["browser_download_url"], checksum[7:], asset["size"], cache)
        install(archive, "ghidra", "zip", check_ghidra)
        record_install("ghidra", GHIDRA_VERSION, asset["browser_download_url"], checksum[7:])
    environment = (
        f"export JAVA_HOME={shlex.quote(str(TOOLS / 'jdk-21'))}\n"
        f"export GHIDRA_INSTALL_DIR={shlex.quote(str(TOOLS / 'ghidra'))}\n"
        'export PATH="$JAVA_HOME/bin:$PATH"\n'
    )
    (TOOLS / "rea-env.sh").write_text(environment)
    print("Tools installed. Use: source tools/rea-env.sh", flush=True)
    print("Restart/reconnect REA with this environment for Ghidra analysis.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, tarfile.TarError, zipfile.BadZipFile) as error:
        print(f"Tool setup stopped: {error}", file=sys.stderr)
        sys.exit(1)
