# Contributing

## Choose the project

- `resa/`: Electron UI, Go helper, Python device worker and protocol summaries.
- `api/`: ScreenDrop server, web UI and VirtualBox workers.
- `scripts/` and `docs/`: workspace publication checks and documentation.

Keep project boundaries intact. Historical staging copies and session reports
are private local research history; make new Resa changes in `resa/`.

## Development workflow

1. Read the relevant README and inspect `git status --short`.
2. Keep changes focused. Preserve unrelated edits. Use `gofmt` for Go.
3. Run `make resa-check` or `make screendrop-check` for the affected app.
4. Run `make build` after changing build paths or Go entry points. Run
   `make screendrop-assets` after changing ScreenDrop templates or styles.
5. Run `make check` for workspace changes, then `git diff --check`.
6. State what changed, which checks passed and what remains unverified.

Commit dependency lockfiles when updating dependencies. Desktop dependencies
use pnpm 10.25.0 with a frozen lockfile; ScreenDrop asset dependencies use npm ci.
Hardware-free checks need Go 1.25+, Node 22.12+, Python 3 and GNU Make.
Download ScreenDrop Go dependencies first with `make screendrop-deps`.

## Hardware and capture evidence

Tests use emulated devices or fake VM commands. Distinguish these from actual
mouse behavior, desktop visual checks and persistence after reconnect. Match
protocol changes to the exact device and capture evidence; do not infer packet
layouts from a similar controller.

Discovery reads cached sysfs metadata. Loading device settings sends active
feature requests. Read [the protocol notes](resa/PROTOCOL.md) before changing
native behavior. Keep raw recordings private and retain relevant capture hashes,
field mappings and limitations in compact summaries.

## Publication and licensing

Run `make audit` before committing and again after staging. Never add files with
`git add -f` merely to bypass ignore rules. The audit is a pattern check, not a
complete security guarantee; follow [the publication guide](docs/PUBLISHING.md).

Original code is MIT licensed. Retain third-party notices. Do not add vendor
executables, extracted resources or decompilation dumps to the public tree.
