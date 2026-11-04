# Security

To report a suspected vulnerability, use this repository's GitHub Security
Advisories "Report a vulnerability" option if available. Otherwise open an issue
asking for a private reporting channel, without exploit details, secrets or
private captures. There is no promised response time or formal support window.

## Resa

Run Electron as a normal desktop user. The renderer has context isolation,
sandboxing, no Node integration, fixed IPC operations and no remote page content.
The helper checks the exact mouse identity and descriptor before device operations.
Discovery reads cached metadata; loading settings sends active feature requests.
Apply and restore can change mouse configuration. Device backups are private local
files, normally `~/.config/resa/device-backup.json`. Do not upload them.

Hardware controls are experimental. Readback and emulated tests cannot prove
physical effects, effective DPI, reporting frequency or persistence after reconnect.

## ScreenDrop

`make screendrop-run` binds to localhost by default. Direct `go run .` in `api/`
retains its existing `0.0.0.0:3030` default. Override `LISTEN_ADDR` deliberately
when sharing with a trusted LAN. Do not expose this service directly to the Internet.

Screenshots, deletion, capture controls and capture downloads have no login.
VM keyboard/mouse input requires the control token for HTTP requests. Same-origin
checks and request headers are not user authentication. HTTP traffic is unencrypted.
MCP stdio clients have the input/capture capabilities of the local server user.

## Before publication

Run `make audit` before committing. It checks tracked and unignored files, and
also scans staged blobs so staged secrets cannot be hidden by editing a file later.
It reports paths and line numbers without echoing matched secret values.
It detects common credential patterns and forbidden file types; it is not an
exhaustive security review or a vulnerability database scan. See
[the publication guide](docs/PUBLISHING.md) for its limits and release checks.
