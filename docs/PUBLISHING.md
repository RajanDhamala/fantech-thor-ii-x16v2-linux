# Publishing to GitHub

Run all commands from the repository root.

```sh
make build
make check
git status --short
git diff --check
```

The audit includes tracked and unignored files plus the staged versions of files.
Ignored files already tracked by Git fail the check. It also rejects embedded Git
repositories, symlinks, common key/credential files, raw captures, binaries,
machine-specific home paths, oversized files and common token formats. Findings
contain file names and line numbers, without credential values.

The public tree includes `resa/`, `api/`, source photos, embedded web assets,
lockfiles, tests, static analysis notes, compact protocol summaries and reviewed
mapping/filtered trace reports under `api/analysis/`. Each trace has a Markdown
explanation and matching JSON evidence. Local VM names and USB instance UUIDs are
redacted and personal absolute paths normalized; capture hashes are retained.
Raw USB/network recordings,
screenshots, device backups, agent metadata, session exports, vendor dumps,
downloaded tools and duplicate staging copies stay local under ignore rules.
Nothing needs to be deleted from the local workspace to exclude it from Git.

Review photos visually before publication; the automated audit does not inspect
image content. EXIF/GPS metadata should also be checked when adding new images.
Do not attach raw captures to issues: they can contain network addresses,
credentials, guest data and device identifiers.

Once the checks pass, explicitly stage the public tree:

```sh
git add .github .editorconfig .gitignore README.md CONTRIBUTING.md LICENSE \
  THIRD_PARTY_NOTICES.md SECURITY.md Makefile docs scripts resa api
make audit
git diff --cached --stat
git diff --cached --check
git commit -m "Prepare Resa and ScreenDrop for public release"
git remote -v
git push -u master main
```

`master` above is the existing remote name; `main` is the local branch. Adjust
the remote name if your checkout uses `origin`. Check the destination before
pushing. Never use force-push to replace unexpected remote history; fetch and
review it first.

This check scans the current working tree and index, not previous commits or
the remote repository. For later releases, scan the full Git history with a
dedicated secret scanner as well. A clean pattern scan cannot guarantee that
no secret exists. If a real credential was ever committed or shared, revoke or
rotate it before dealing with history cleanup.

Run dependency advisory scans separately when network access is available:

```sh
(cd resa && pnpm audit)
(cd api && npm audit)
```

These cover JavaScript dependencies. A Go vulnerability scan requires a separately
installed `govulncheck`; it is not bundled in this project. Local test success
does not establish current dependency vulnerability status.

The initial audit results and remaining validation limits are recorded in
[AUDIT.md](AUDIT.md). No hardware changes are needed for these checks.
