#!/usr/bin/env python3
"""Check public working files and staged blobs without printing secret values."""

from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 5 * 1024 * 1024
PRIVATE_DIRS = {
    '.aws', '.ssh', '.codex', '.agents', 'node_modules', '.pnpm-store',
    '.venv', 'venv', '__pycache__', '.cache', 'bin', 'dist', 'build',
    'captures', 'screenshots', 'tools', 'extracted',
}
PRIVATE_SUFFIXES = {
    '.pem', '.key', '.p12', '.pfx', '.jks', '.pcap', '.pcapng',
    '.exe', '.dll', '.msi', '.cab', '.log',
}
PATTERNS = {
    'private key': re.compile(rb'-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----'),
    'AWS access key': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'GitHub token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b'),
    'OpenAI-style token': re.compile(rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b'),
    'Slack token': re.compile(rb'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
    'Google API key': re.compile(rb'\bAIza[0-9A-Za-z_-]{35}\b'),
    'literal bearer token': re.compile(rb'(?i)bearer\s+[A-Za-z0-9_.-]{24,}'),
    'URL credentials': re.compile(rb'(?i)https?://[^\s/@:]+:[^\s/@]+@'),
    'personal home path': re.compile(rb'(?:/home/[A-Za-z0-9_.-]+/|/Users/[A-Za-z0-9_.-]+/|[A-Za-z]:\\Users\\[A-Za-z0-9_.-]+\\)'),
}


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def paths(output):
    return {p.decode('utf-8', 'surrogateescape') for p in output.split(b'\0') if p}


def private_path(name):
    path = PurePosixPath(name)
    base = path.name.lower()
    return (
        bool(set(path.parts) & PRIVATE_DIRS)
        or '.git' in path.parts
        or path.suffix.lower() in PRIVATE_SUFFIXES
        or base in {'credentials', 'credentials.json', '.npmrc', '.netrc', '.pypirc', 'device-backup.json'}
        or base.startswith(('id_rsa', 'id_ed25519'))
        or 'service-account' in base
        or base.startswith('.env') and not base.endswith('.example')
        or name.startswith('api/resa-')
        or name.startswith('api/analysis/') and not (
            base == 'index.md' or base.endswith('-mapping.json')
            or re.fullmatch(r'trace-.*\.(?:md|json)', base)
        )
        or name == 'api/SESSION_HANDOFF.md'
        or name.startswith('api/RESA_')
        or name == 'resa/docs/DEVELOPMENT_HISTORY.md'
        or name.startswith('resa/evidence/') and not (
            base in {'readme.md', 'linux-discovery.json'} or base.endswith('-support.json')
        )
    )


def inspect_blob(label, data, problems):
    if len(data) > MAX_BYTES:
        problems.add(f'{label}: exceeds 5 MiB publication limit')
        return
    if data.startswith((b'\x7fELF', b'MZ', b'PK\x03\x04')):
        problems.add(f'{label}: executable or archive')
        return
    # Images are reviewed separately; do not interpret compressed bytes as text.
    if data.startswith((b'\xff\xd8\xff', b'\x89PNG\r\n\x1a\n')):
        return
    if b'\0' in data:
        problems.add(f'{label}: unexpected binary content')
        return
    for kind, pattern in PATTERNS.items():
        for match in pattern.finditer(data):
            line = data.count(b'\n', 0, match.start()) + 1
            problems.add(f'{label}:{line}: {kind}')


def main():
    problems = set()
    tracked = paths(git('ls-files', '-z', '--cached'))
    ignored_tracked = paths(git('ls-files', '-z', '--cached', '--ignored', '--exclude-standard'))
    for name in ignored_tracked:
        problems.add(f'{name}: tracked despite ignore rules')
    candidates = tracked | paths(git('ls-files', '-z', '--others', '--exclude-standard'))
    total = 0
    for name in sorted(candidates):
        path = ROOT / name
        if private_path(name):
            problems.add(f'{name}: private/generated path is publishable')
        if path.is_symlink():
            problems.add(f'{name}: symlink needs explicit review')
        elif path.is_file():
            total += path.stat().st_size
            if path.stat().st_size > MAX_BYTES:
                problems.add(f'{name}: exceeds 5 MiB publication limit')
            else:
                inspect_blob(name, path.read_bytes(), problems)
        elif path.is_dir():
            problems.add(f'{name}: embedded repository/directory needs review')
    staged_count = 0
    for entry in git('ls-files', '-z', '--stage').split(b'\0'):
        if not entry:
            continue
        metadata, name_bytes = entry.split(b'\t', 1)
        mode, sha, stage = metadata.split()
        name = name_bytes.decode('utf-8', 'surrogateescape')
        if stage != b'0' or mode not in (b'100644', b'100755'):
            problems.add(f'{name}: staged conflict, symlink or submodule')
            continue
        staged_count += 1
        size = int(git('cat-file', '-s', sha.decode()))
        if size > MAX_BYTES:
            problems.add(f'{name} (staged): exceeds 5 MiB publication limit')
        else:
            inspect_blob(f'{name} (staged)', git('cat-file', 'blob', sha.decode()), problems)
    for item in sorted(problems):
        print(item)
    print(f'Checked {len(candidates)} public paths ({total / 1024 / 1024:.2f} MiB), '
          f'{staged_count} staged blobs; {len(problems)} findings.')
    print('Pattern check only; Git history, image content and dependency advisories require separate review.')
    return int(bool(problems))


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, subprocess.CalledProcessError):
        print('Audit could not read the repository or index.', file=sys.stderr)
        sys.exit(2)
