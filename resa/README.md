# Resa

Experimental Linux support for the **Fantech Thor II X16v2** (`30fa:1440`).
The app uses Electron for its interface, a Go helper for device operations,
and an embedded Python worker for bounded HID configuration transactions.

## Install and run

From this directory, use a normal Linux desktop user with GNU Make,
Go 1.22+, Node.js 22.12+, Python 3 at `/usr/bin/python3`, and pnpm 10.25.0.

```sh
make install
make desktop
```

Installation downloads pinned dependencies from `pnpm-lock.yaml`.
`make desktop` builds `bin/resa`, prepares the sandboxed preload and launches
Electron. Run these commands from the repository root instead if preferred:

```sh
make resa-install
make resa-run
```

Java, Ghidra, a Windows VM and the vendor utility are not needed to run Resa.
The optional `make setup-tools` target installs a private research toolchain;
it is separate from desktop setup and requires network access and Python 3.12+.

## Device permissions

The mouse must belong to Linux. Release it from VirtualBox USB passthrough
before loading its settings. Cached discovery does not require opening hidraw,
but native reads and Apply require read/write access to the configuration
interface. Do not run Electron as root or make every hidraw device writable.

On a desktop using systemd-logind, an administrator can install the supplied
[interface-specific access rule](udev/70-resa.rules):

```sh
sudo install -m 0644 udev/70-resa.rules /etc/udev/rules.d/70-resa.rules
sudo udevadm control --reload-rules
```

Unplug/reconnect the mouse, then check access as your normal desktop user.
The rule grants access through the active local session's `uaccess` mechanism
and matches only this product's configuration interface. Other session managers
may require administrator-specific access configuration. Installation needs sudo;
the app itself does not. Rule syntax is checked locally; actual access on each
distribution/session remains a hardware setup check.

Use **Refresh** to reload the device. Loading settings uses active vendor
feature requests; it is different from read-only cached discovery.

## Use the app

Edit settings, then select **Apply changes** to send supported edits. Editing
alone does not commit mouse configuration. A failed Apply retains pending edits;
**Retry read** reloads the baseline while preserving edited fields.

| Area | Available behavior |
| --- | --- |
| Buttons | Seven slots; Left/Right/Middle click, Back, Forward, Rapid Fire, DPI Loop, DPI up/down, Color cycle. At least one Left click must remain. |
| Sensitivity | Six DPI stages, 200–12,800 decoded range, enabled stages, active stage and 125/250/500/1000 Hz polling choices. |
| Lighting | Captured effects including Mono Water; seven palette slots, participation, brightness, speed and effect-specific direction/symmetry. Unsupported effects stay unavailable. |
| Button reaction | Seven response selectors; ordinary button actions are preserved. Lights off suppresses reaction-enable flags; Lights on restores retained choices. |
| Device timing | Vendor Double Click Speed field, 8–300 ms. This does not change the Linux desktop double-click threshold. |
| Desktop behavior | Separate Apply for Cinnamon/GNOME pointer speed; optional X11 imwheel multiplier while Resa is open. |
| Profiles and model | Four local presets, Undo, 2D/3D view, orbit/zoom, focus view and reference photos. |
| Input test | App-window events and counters from any mouse; pauses on focus loss. No global keyboard or mouse capture. |
| Macros | Local timeline preview only; no onboard macro upload or keyboard shortcut programming. |

The 3D model is an approximation. Its lighting is a profile preview, not a
simulation of measured physical effects. Palette channels are quantized to four
bits; exact Windows picker rounding and physical colors are not established.
Local presets do not switch onboard profiles.

## Backups and recovery

Configuration Apply checks the device revision, preserves unrelated fields,
backs up changed fields and verifies stored readback. Failed writes attempt
rollback and report recovery errors. **Device details → Restore previous mouse
settings** restores fields from the last usable configuration backup.

Backups are private files at `~/.config/resa/device-backup.json`, or under an
absolute `XDG_CONFIG_HOME`. Do not publish backups. Legacy live RGB uses a
separate path and cannot be restored by this backup. A combined configuration
and RGB update can partially succeed; read the footer before retrying.

Desktop pointer/wheel changes use **Apply desktop settings**, separately from
mouse configuration. Optional wheel support requires `/usr/bin/imwheel` and
an X11 session. Resa refuses to replace a custom `~/.imwheelrc` or take over an
unrelated imwheel process. These settings affect the Linux session, not just
this mouse, and are not stored onboard.

## Preview and CLI

Preview requires Node.js and no Electron installation or mouse:

```sh
make preview
```

Open <http://127.0.0.1:4173>. The browser preview has no native bridge.
For an offline preview, run `node scripts/export-preview.js` and open the
locally generated `evidence/desktop-preview.html`; it is excluded from Git.

```sh
make app ARGS='list --json'
make app ARGS='list --all'
make app ARGS='lighting --brightness 4 --speed 3 --json'
```

`list` reads cached sysfs metadata without opening device nodes. `--all`
includes other HID devices. The lighting example returns a dry-run report plan;
explicit `--apply --experimental` flags are required to send that legacy report.
Native `device read|apply|restore|rgb` commands consume typed JSON from the
desktop bridge. There is no raw packet, address or firmware-write API.

## Troubleshooting

- **No mouse found:** check Linux USB ownership and reconnect, then Refresh.
- **Permission denied:** inspect the configuration node's access and udev
  metadata using the steps above. Run as your regular desktop user.
- **Helper missing:** run `make build` here, then restart the app.
- **Electron will not launch:** use a normal graphical session and check the
  terminal output and Electron's platform dependencies. Keep its sandbox enabled.
- **Read or revision error:** use Retry read before another Apply. Avoid running
  two control tools against the same mouse.
- **3D unavailable:** use the 2D view; WebGL depends on the graphics environment.
- **Wheel controls unavailable:** check X11, the optional imwheel package and
  whether a custom imwheel config/process is already present.

## Verification and evidence limits

```sh
make test
make desktop-check
```

From the root, `make resa-check` also runs Go vet and tool-archive tests.
JavaScript checks need Node only. Go has no external module dependencies.

Tests cover emulated configuration operations, backup/rollback, bridge
validation and UI models. They do not prove physical DPI, polling frequency,
visible lighting, click behavior or persistence after reconnect. Native Electron
startup and target-desktop visual review are separate checks.

The [public evidence summaries](evidence/README.md) retain capture hashes and
field interpretations. [PROTOCOL.md](PROTOCOL.md) records historical recovery
notes. Raw captures, decompilations, local diagnostics and old staging copies
stay private; referenced research paths are not included in a public checkout.
