# Resa — Fantech Thor II X16v2 for Linux

**Resa is an unofficial Linux app for configuring the Fantech Thor II X16v2 mouse.**
It was built by reverse engineering the Windows software and the mouse's USB
communication. This is an independent project, unaffiliated with Fantech.

## Features

- Assign actions to the mouse's seven buttons.
- Configure six DPI stages and the polling rate.
- Adjust supported RGB effects, colors, brightness and speed.
- Save local presets and preview settings in a 2D/3D mouse view.

Support is experimental and specific to the X16v2 (`30fa:1440`). The macro
editor is a local preview; uploading macros to the mouse is not implemented.
See [supported controls and limitations](resa/README.md#use-the-app).

## Install and run

You need a Linux desktop, GNU Make, Go 1.22+, Node.js 22.12+,
Python 3 at `/usr/bin/python3`, and pnpm 10.25.0.

```sh
git clone https://github.com/RajanDhamala/fantech-thor-ii-x16v2-linux.git
cd fantech-thor-ii-x16v2-linux
make resa-install
make resa-run
```

Connect the mouse to Linux and run the app as your normal user.
If access is denied, follow the [device permissions setup](resa/README.md#device-permissions).
Select **Apply changes** in the app to save supported settings to the mouse.

To preview the interface in a browser:

```sh
make resa-preview
```

Open <http://127.0.0.1:4173>. The browser preview cannot change mouse settings.

## Project folders

```text
resa/             Mouse app, device communication and protocol notes
  desktop/        Electron desktop interface
  internal/       Go helper code and Python mouse configuration worker
  evidence/       Protocol evidence summaries
api/              ScreenDrop: VM screenshots and USB/network traffic capture used for research
  analysis/       Capture analysis and mouse setting mappings
scripts/          Repository checks
docs/             Audit and publishing notes
```

Resa uses Electron, Go and Python. ScreenDrop is a separate research tool;
you do not need it or a Windows VM to run the mouse app.

## Development

```sh
make resa-check
```

See the [Resa guide](resa/README.md) for setup and troubleshooting,
[ScreenDrop guide](api/README.md) for research tools, and
[Contributing](CONTRIBUTING.md) for development instructions.

Original project code is [MIT licensed](LICENSE).
