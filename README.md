# Resa — Fantech Thor II X16v2 for Linux

An experimental Linux desktop app for configuring the Fantech Thor II X16v2
(`30fa:1440`). Resa combines an Electron interface, a Go helper and a Python
HID worker. This repository also includes **ScreenDrop**, a separate VirtualBox
screenshot and capture tool used during protocol research.

Resa supports seven button assignments, six DPI stages, polling rate, captured
lighting controls, local presets and an interactive 2D/3D mouse view. Onboard
macro upload is not implemented; the macro editor is a local preview.
Stored-byte readback and automated tests do not establish physical effects,
effective DPI or persistence after reconnect. See [supported behavior and
limits](resa/README.md).

## Quick start: Resa

Requirements: Linux desktop, GNU Make, Go 1.22+, Node.js 22.12+,
Python 3 at `/usr/bin/python3`, and **pnpm 10.25.0** available on `PATH`.
Install these through your usual toolchain manager before continuing.
Internet access is needed for the initial Electron download.

```sh
git clone https://github.com/RajanDhamala/fantech-thor-ii-x16v2-linux.git
cd fantech-thor-ii-x16v2-linux
make resa-install
make resa-run
```

Run as your normal desktop user. `make resa-run` builds the Go helper and opens
Electron. Java, Ghidra, the Windows software and ScreenDrop are not needed to
run Resa. A connected mouse needs access to its configuration hidraw interface;
see [device permissions](resa/README.md#device-permissions).

Preview the interface without Electron or a connected mouse:

```sh
make resa-preview
```

Open <http://127.0.0.1:4173>. The preview uses Node.js only and cannot change
hardware. Read-only cached device discovery is also available:

```sh
make resa-cli ARGS='list --json'
```

## ScreenDrop

Requirements: Go 1.25+, VirtualBox and a running VM owned by the server user.
The full workspace checks require Go 1.25+ because they include ScreenDrop.

```sh
make screendrop-deps
VM_NAME='Your VM name' make screendrop-run
```

Open <http://127.0.0.1:3030>. The root command binds to localhost by default.
To share with a trusted LAN, set `LISTEN_ADDR='0.0.0.0:3030'` explicitly.
Screenshots, capture downloads and deletion have no login; VM input uses a
control token printed at startup. HTTP is unencrypted. See
[ScreenDrop setup and configuration](api/README.md) before enabling LAN access.

Embedded web assets are already included. Node/npm are needed only to rebuild
them after editing templates or styles:

```sh
make screendrop-install
make screendrop-assets
```

## Repository layout

```text
.
├── .github/workflows/
│   └── check.yml                  GitHub build, test and publication checks
├── resa/                          Desktop app and local device helper
│   ├── desktop/
│   │   ├── main.js                Electron main process; launches the Go helper
│   │   ├── preload.js             Restricted IPC bridge exposed to the UI
│   │   ├── renderer.js            UI state and interactions
│   │   ├── index.html             Desktop page
│   │   └── styles.css             UI styles; sibling modules/tests handle controls
│   ├── cmd/resa/main.go            Go CLI entry point
│   ├── internal/
│   │   ├── discovery/             Cached Linux device discovery
│   │   ├── device/                Go launcher, embedded worker.py and Python tests
│   │   ├── hidraw/                Go HID transport for the legacy lighting path
│   │   └── lighting/              Legacy lighting report builder and tests
│   ├── assets/                    Five reference photos used by the app
│   ├── evidence/                  Protocol support JSONs and descriptor test fixture
│   ├── scripts/                   Preview, preload and optional research utilities
│   ├── udev/70-resa.rules          Optional configuration-interface access rule
│   ├── go.mod                     Go module definition
│   ├── package.json               Desktop dependency and script definitions
│   ├── pnpm-lock.yaml             Pinned desktop dependencies
│   ├── pnpm-workspace.yaml         Dependency build policy
│   ├── Makefile                    Resa-only commands
│   ├── README.md                   Setup, controls and troubleshooting
│   ├── ANALYSIS.md                 Written static analysis and research findings
│   └── PROTOCOL.md                 Historical protocol recovery notes
├── api/                           ScreenDrop; separate from the desktop app
│   ├── main.go                    HTTP server entry point and screenshot routes
│   ├── control.go                 VirtualBox input operations
│   ├── gallery.go                 Saved screenshot storage
│   ├── network.go                 Recording and packet-decoder management
│   ├── mcp.go                     Local MCP server
│   ├── analysis/
│   │   ├── INDEX.md               Published research index and evidence limits
│   │   ├── *-mapping.json         13 reviewed DPI, polling, button and lighting reports
│   │   ├── trace-*.md             30 written recording-analysis reports
│   │   └── trace-*.json           30 matching filtered traffic/evidence reports
│   ├── scripts/                   Python VirtualBox workers and tests
│   ├── templates/                 HTML templates
│   ├── web/input.css              Tailwind source
│   ├── static/                    Embedded CSS/JS and HTMX license notice
│   ├── go.mod, go.sum             Go dependencies
│   ├── package.json               Web asset build scripts
│   ├── package-lock.json          Pinned web asset dependencies
│   └── README.md                  Setup, environment variables and API usage
├── scripts/
│   ├── audit-publication.py       Checks public files and staged content
│   └── test_audit_publication.py  Publication guard integration tests
├── docs/
│   ├── AUDIT.md                   Findings, verification and remaining limits
│   └── PUBLISHING.md              Staging, scanning and GitHub push commands
├── .editorconfig                  Shared formatting conventions
├── .gitignore                     Private data, captures and build exclusions
├── Makefile                       Workspace commands
├── README.md                      Project entry point
├── CONTRIBUTING.md                Development workflow
├── SECURITY.md                    Security model and reporting guidance
├── THIRD_PARTY_NOTICES.md          Dependency and vendor notices
└── LICENSE                        MIT license for original project code
```

This shows the publishable structure; tests and supporting modules also live
beside their source files. Each app retains its own dependency manifests and
lockfiles. Historical staging
copies, raw recordings, screenshots, device backups, vendor artifacts and local
session exports are excluded from Git. They are not required to run either app.

## Build and verify

After downloading ScreenDrop's Go dependencies once:

```sh
make build
make check
```

`make build` produces `resa/bin/resa` and `api/bin/screendrop`. `make check`
runs Go/Python tests, JavaScript checks, Go vet, archive-verification tests and
the publication audit. These checks do not launch Electron or apply mouse settings.
Node is sufficient for the JavaScript checks; Electron installation is not needed.

Use `make resa-check` or `make screendrop-check` for focused checks and
`make audit` before committing. Resa uses its project build cache; ScreenDrop uses the normal Go cache.
Set `GOCACHE` in your environment if you need a different ScreenDrop cache path.
Run `make help` to see all commands.

## Documentation and license

- [Resa setup, usage and troubleshooting](resa/README.md)
- [ScreenDrop setup and environment variables](api/README.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Audit results](docs/AUDIT.md) and [publication guide](docs/PUBLISHING.md)
- [Protocol recovery notes](resa/PROTOCOL.md)

Original code is [MIT licensed](LICENSE). Dependencies retain their own terms;
see [third-party notices](THIRD_PARTY_NOTICES.md). This is an independent project
and is not an official Fantech driver.
