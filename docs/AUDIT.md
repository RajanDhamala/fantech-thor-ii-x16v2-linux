# Publication audit

Reviewed on 2026-11-01. Scope: Resa and ScreenDrop source prepared for the first
public commit. This is a local source/publication review, not a penetration test
or a guarantee that all vulnerabilities or secrets have been found.

## Changes

- Restored missing root build, test, check, install, preview and CLI targets.
  Removed documentation/commands for the absent legacy GTK driver.
- Rewrote the root and Resa READMEs around reproducible setup and current features.
  Added ScreenDrop prerequisites, environment configuration and portable MCP paths.
- Added MIT licensing, third-party notices, security guidance and a publication guide.
- Excluded raw captures, screenshots, session history, vendor dumps, downloaded tools
  and duplicate staging trees. All remain available locally. Public protocol
  summaries retain field mappings and capture hashes; their raw inputs stay private.
- Removed a personal absolute path from a public summary. Excluded the underside
  reference photo containing the printed device label, while retaining the original
  locally. The public gallery uses the five remaining photos.
- Made desktop dependency installation use its frozen pnpm lockfile.
- Fixed two missing browser-preview module routes.
- Made the root ScreenDrop launch command default to localhost; direct app defaults
  and the existing trusted-LAN access model are documented in SECURITY.md.
- Added a publication guard for public paths and staged content, with integration
  tests for staged secrets, ignored tracked files, captures and symlinks. Matched
  secret values are never printed by the guard.
- Added an optional interface-specific udev rule and administrator setup guidance.
  No access rules were installed and no mouse settings were applied during the audit.
- Added GitHub Actions for hardware-free build/check on pushes and pull requests.
  Actions are pinned to upstream commit hashes, with read-only repository permissions
  and checkout credential persistence disabled.

## Local evidence

`make build check` passes in the workspace: both Go modules build, Go tests/vet
pass, Resa's JavaScript checks pass, 49 device-worker emulation tests pass,
22 ScreenDrop Python tests pass and four tool-archive tests pass.
The publication guard's four integration tests also pass.

A clean export containing only the 121 publishable paths also passes
`make build check`, with all 121 files staged in an isolated temporary Git
index and zero scan findings. This verifies that ignored research files and
installed JavaScript dependencies are not needed for those checks. The original
workspace index was left unchanged.

Markdown file targets resolve within the public tree. All 11 JavaScript modules
reachable from the renderer have preview routes. An HTTP preview smoke test was
attempted, but the environment denied binding the localhost socket; browser
runtime and visual behavior remain unverified. Workflow YAML parses and all
action references use full commit hashes; a hosted workflow run remains pending.

`udevadm verify resa/udev/70-resa.rules` passes syntax validation. This does not
establish device access in a target desktop session. The five public source photos
were visually inspected; all six original JPEGs have no EXIF/GPS tags or JPEG
comments. The underside image is excluded because of its visible label.

The public tree is approximately 1.2 MiB, reduced from approximately 105 MiB of
initial candidates, without deleting local research files. The final pattern
scan has zero findings for the working tree. Staged versions are checked too;
the existing root index still contains three earlier staged files and must be
updated to include these changes before committing.

## Limits and release checks

Earlier mapping-only follow-up: 13 reviewed protocol mapping JSONs and their index were
now included under `api/analysis/`. Personal absolute paths were replaced in two
reports; source/capture hashes and protocol observations were retained. Raw trace
exports, full decoder comparisons, device backups and session snapshots remain
excluded. The public set now contains 135 paths (approximately 1.28 MiB), with
zero pattern findings and five passing publication-guard integration tests.
At that checkpoint the root index contained only the three earlier staged files.

Trace publication follow-up: all 30 `trace-*.md` reports and their 30 matching
filtered JSON exports are now eligible, alongside the main `resa/ANALYSIS.md`.
VM names and host-assigned USB UUIDs were redacted from JSON metadata; personal
paths were normalized. A comparison against private original copies verified
that all JSON keys, numeric fields, arrays, packet evidence and capture hashes
were retained; only 65 identifying/path strings changed, with a publication note
added to each JSON. Originals were preserved privately outside the repository.
The research index links every Markdown/JSON pair. Raw PCAPs, screenshots,
bulk decoder comparisons, device backups and session exports remain excluded.
The public tree now contains 196 paths (approximately 12.61 MiB), with zero
pattern findings and six passing publication-guard integration tests.
Staging these changes in the workspace was attempted, but Git could not create
`.git/index.lock` because `.git` is mounted read-only in this environment. The
workspace index remains unchanged; staging must be performed from a writable
local terminal before committing or pushing.

- Registry advisory queries were attempted. `pnpm audit` timed out and `npm audit`
  failed DNS resolution for registry.npmjs.org. Dependency vulnerability status is
  unverified; rerun those checks from a network-enabled environment. `govulncheck`
  is not installed here.
- The guard checks common credential formats and unsafe file paths, not every
  possible secret or previous Git history. It is not a substitute for history
  scanning or human review of new artifacts.
- Native Electron startup/visual interaction, a real VirtualBox session, physical
  mouse settings and persistence after reconnect are separate validation steps.
- GitHub Actions has been configured, but a hosted run has not yet been observed.
- No commit or push was made by this audit. Follow [PUBLISHING.md](PUBLISHING.md)
  to stage the reviewed tree, rescan the index and publish.
