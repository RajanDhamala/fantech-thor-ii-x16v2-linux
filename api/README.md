# ScreenDrop

A responsive Go + HTMX + Tailwind page for capturing a VirtualBox VM and viewing or downloading its screenshot from your phone.

## Setup

Requirements: Go 1.25+, a local VirtualBox installation and a running VM owned
by the same user as the server. Screenshot capture needs `VBoxManage` on `PATH`.
Packet decoding additionally needs Wireshark's `sharkd`. VM mouse input needs
the VirtualBox Python SDK (`vboxapi`) available to `/usr/bin/python3`, or to the
interpreter selected by `VBOX_PYTHON`. See the optional capabilities below.

From the repository root:

```sh
make screendrop-deps
VM_NAME='Your VM name' make screendrop-run
```

This root command binds to localhost. To launch directly from `api/`:

```sh
go mod download
VM_NAME='Your VM name' LISTEN_ADDR='127.0.0.1:3030' go run .
```

## Configuration

| Variable | Default when running directly | Purpose |
| --- | --- | --- |
| `VM_NAME` | `Win !0` | Existing VirtualBox VM name; set this for your machine. |
| `LISTEN_ADDR` | `0.0.0.0:3030` | HTTP bind address. Root Makefile defaults to `127.0.0.1:3030`. |
| `SCREENSHOT_DIR` | `assets` | Saved PNG directory, relative to the server working directory. |
| `CAPTURE_DIR` | `captures` | Private recording directory. |
| `CONTROL_TOKEN` | Random at startup | HTTP VM input token; keep private. |
| `VBOX_PYTHON` | `/usr/bin/python3` | Python interpreter for VM workers. |
| `VM_NETWORK_ADAPTER` | `1` | VM NIC index, 1–8. |
| `VM_USB_VENDOR` / `VM_USB_PRODUCT` | `30fa` / `1440` | Exact USB target for optional mouse captures. |

Configuration is read from the process environment; `.env` files are not
automatically loaded. Node/npm are needed only to rebuild frontend assets.

## Gallery and capture

Open `http://localhost:3030` on this computer. On a phone connected to the same Wi-Fi, open the **LAN URL printed in the terminal**, then tap **Take screenshot**. The preview updates without reloading; tap the image for its original size or **Download** to save the PNG. If needed, allow TCP port 3030 through your computer's firewall for your local network.

The **Screenshot gallery** keeps all captures, newest first. Tap any thumbnail to open the viewer, then swipe left/right on your phone or use the previous/next buttons or arrow keys. **Play slideshow** advances every four seconds; pause, zoom to actual size, or download the image currently on screen. Captures remain available after a page refresh or server restart, including when the VM is stopped.

Use **Delete** on a gallery card, the preview, or the viewer to open a confirmation popup with the selected image. **Cancel**, Escape, or clicking outside the popup leaves the image untouched. Only **Delete screenshot** removes the file permanently. Deletion requires only the popup confirmation, with no control token. The gallery, preview, and open slideshow update after deletion, including when the last image is removed.

Open **Network** in the header (or `/network`) for the live packet explorer. Choose **Physical mouse · USB/HID** (default), pass the real mouse through to the VM using VirtualBox **Devices → USB**, choose a duration, and press **Start capture**. Start/Stop briefly reconnects the selected mouse inside the VM to enable/disable VirtualBox's USB capture. The default target is the connected Fantech `30fa:1440`; set `VM_USB_VENDOR` and `VM_USB_PRODUCT` to four-digit hex IDs for a different target. Exactly one matching device must exist and it must already belong to this VM. The worker refuses to take a host device or a device captured by another VM. No HID configuration reports are sent by the capture worker. It restores the original VM attachment after recording.

Before starting, enter a **Recording name** such as `01 Startup`, `02 Unchanged Apply`, or `03 DPI 800 to 1600`. Optional **Notes** record what you do, starting settings, and visible results. Names appear in the live/saved selector; selecting a capture shows its name, notes, and filenames. Old unnamed recordings remain available. API/MCP callers may omit a name for an automatic timestamp label.

Each recording is stored locally as two files, with no database:

```text
captures/vm-<VM-name-hash>/
  trace-01-startup-<timestamp>-<unique-id>.pcapng
  trace-01-startup-<timestamp>-<unique-id>.pcapng.json
```

The capture contains the original packets. Its JSON companion stores the full name, notes, source/VM information, start/end times, and completion/recovery status. The name in the filename is shortened and sanitized; the full name stays in JSON. Reusing a name creates another unique recording. Metadata survives Stop, recovery, page refreshes, and app restarts. Use the JSON files to identify experiments during later analysis. Names support up to 120 characters; notes up to 2000. For example, keep startup, unchanged Apply, and each individual setting change as separate named recordings.

Packets update every **one second** while recording, with separate row colors for USB control, HID, USB, DNS, TCP, UDP, HTTP, TLS, and ICMP/ARP. **Control / configuration** is the default USB filter (`usb.transfer_type == 0x02`) so routine interrupt/movement reports stay hidden. Presets include all USB/HID, decoded HID only, interrupt reports, and bulk/vendor data; **All protocols** explicitly removes the filter. HID decoding depends on captured descriptors; undecoded USB control transfers remain available. Captures expose on-wire device requests, not Windows API function names or call stacks. VirtualBox USB capture is documented in [Oracle's guide](https://docs.oracle.com/en/virtualization/virtualbox/6.0/admin/usbtrafficcapturing.html); filter fields follow [Wireshark's USB reference](https://www.wireshark.org/docs/dfref/u/usb.html).

Choose **VM network adapter** to record network traffic instead. Its default filter includes TCP, UDP, DNS, ICMP, and ARP, with individual protocol presets. NIC recording cannot capture USB/HID traffic. Set `VM_NETWORK_ADAPTER` to 1–8 (default 1). Existing external NIC traces are preserved and previous trace settings restored. A NIC trace whose filename changes externally is left untouched.

**Live** follows matching packets and keeps the latest 200 rows in the browser. Turn it off to browse 100 matching packets per page with Previous/Next. Capture data stays intact on disk. The one-second polling loop skips overlapping requests; decoder latency can delay an update. Growing PCAP/PCAPNG files are decoded from private snapshots containing only complete records/blocks, so a partially written final packet waits for the next poll. Downloads become available after recording stops.

The decoder is Wireshark's `sharkd` (`command -v sharkd`); TShark and elevated host capture permissions are not needed. The worker uses Python's standard library (`VBOX_PYTHON`, default `/usr/bin/python3`) and `VBoxManage`, without VirtualBox Python bindings. The VM must be running. USB startup checks the configured VM first and preserves VirtualBox USB-permission warnings, even when VBoxManage returns an empty list with exit status zero. Startup and recovery errors appear directly below Start/Stop, including worker exit details when available. If the VM was renamed, check `VBoxManage list runningvms` and launch with `VM_NAME='actual VM name' go run .`.

Captures stop after 1–120 seconds (default 30), near 20 MiB, on explicit Stop, or when the owning server exits. A Linux parent-exit signal and exclusive capture lock are shared by web/MCP workers. If cleanup fails, a recovery record remains: start the VM if needed and press **Stop / recover**. Saved `.pcap`/`.pcapng` files live in `captures/vm-<VM-name-hash>/` (`CAPTURE_DIR` changes the parent). They survive refreshes and restarts. Analysis is limited to 64 MiB; larger stopped captures can still be downloaded for desktop Wireshark. The page does not decrypt TLS or expose arbitrary decoder commands, filesystem paths, or host capture interfaces. Capture operations retain the existing trusted-LAN access model, same-origin checks, and explicit start/stop request header, without a control token.

The default VM is `Win !0`, matching the original API. VirtualBox must be installed and the VM running under the same user as the server. Change the source or listen address with:

```sh
VM_NAME='Your VM name' LISTEN_ADDR='0.0.0.0:3030' go run .
```

The default listen address is `0.0.0.0:3030`. The service has no login; use it on a trusted LAN. Devices that can reach it can request VM screenshots. No router port forwarding is needed.

The **Control the VM** panel also supports text entry, shortcuts, mouse clicks, double clicks, right clicks, pointer movement and scrolling. Enter the randomly generated **control token printed in the terminal** to send input. Set `CONTROL_TOKEN` in the environment for a fixed token. The token is kept only in the open page and is required for `POST /input`; cross-origin input requests are rejected. HTTP LAN traffic is unencrypted, so use this on your trusted network. Screenshots and the gallery retain their existing access behavior.

Enable **Click screenshot to control**, wait for the fresh capture, then tap the main preview. Coordinates are mapped to the original image even when it is scaled or letterboxed. Every successful input is followed by a new capture. The full-size viewer and old gallery images remain view-only.

Text entry supports up to 1000 printable ASCII characters and assumes the guest uses a US keyboard layout. Send Enter, Tab and shortcuts separately with the key selector. Input goes to the guest's currently focused application; typing does not press Enter automatically. Mouse control uses the installed VirtualBox Python SDK (`vboxapi`) through `/usr/bin/python3`; set `VBOX_PYTHON` if your SDK uses another Python. The guest must support absolute pointing (for example, USB Tablet or Guest Additions). No host keyboard/mouse automation, guest credentials, shell-command API, or VM configuration changes are used.

- `GET /` — mobile-friendly page.
- `POST /capture` — captures once and returns an HTML preview for HTMX, or a full page for a normal form submission.
- `GET /ss` — captures once and returns the original PNG, preserving the existing API.
- `GET /screenshots/{filename}` — views a saved PNG; add `?download=1` to download it.
- `POST /input` — JSON input action; requires `X-Control-Token`.
- `DELETE /screenshots/{filename}` — permanently removes one saved PNG; requires `X-Confirm-Delete: true` and rejects cross-origin requests. No control token is needed. The web page sends this only after modal confirmation. No MCP delete tool is exposed.
- `GET /network` — mobile-friendly VM network page.
- `GET /api/network` — active trace, saved capture list, and decoder availability.
- `POST /api/network/start` — JSON `{"name":"01 Startup","notes":"Open the app without changing settings","duration_seconds":30,"source":"usb"}` (`source` defaults to `network` for existing API clients) and `X-VM-Network: true`.
- `POST /api/network/stop` — stop or recover a managed capture, with `X-VM-Network: true`.
- `GET /api/network/packets?file=trace-….pcap&filter=dns&offset=0&limit=100` — live/saved Wireshark summaries (limit 1–200); add `since=<cursor>` to request only new frames. Response includes `cursor`, `more`, and `live`.
- `GET /network/captures/{filename}` — download a stopped PCAP/PCAPNG.

For example, keyboard JSON is `{"action":"text","text":"hello"}` or `{"action":"key","key":"CTRL+A"}`. Mouse JSON is `{"action":"click","x":100,"y":200,"button":"left","clicks":1}`; use `move` for movement or `scroll` with `wheel` (-10 to -1 up, 1 to 10 down). Coordinates are zero-based primary-display screenshot pixels and are checked against a fresh VM frame.

To expose the same capabilities as local MCP tools, run:

```sh
go run . -mcp
```

This starts the MCP stdio transport instead of the HTTP server. Your MCP client launches it as a subprocess; it is not a background LAN endpoint. The tools are `screenshot` (returns the PNG image and saves it to history), `keyboard_input` (`action: text` or `key`), and `mouse_control` (`action: move`, `click` or `scroll`), plus:

- `network_capture`: `{"action":"start","source":"usb","name":"01 Startup","notes":"Open app, no Apply","duration_seconds":30}` or `{"action":"stop"}`. Omit `source` for VM network capture.
- `network_status`: `{}` lists saved PCAP filenames and any active recording.
- `network_packets`: `{"filename":"trace-….pcapng","filter":"usb.transfer_type == 0x02","since":0,"limit":200}` returns decoded live/saved packets. Poll every second using the returned `cursor` as `since` to append new frames; `more` indicates a remaining backlog.

All tools stay scoped to `VM_NAME` and, for packet capture, `VM_NETWORK_ADAPTER` or the configured USB target. Input tools can change guest data; approve them in your client only for the VM task you intend. Clients should capture before mouse actions and after input to verify results. Web tokens are not needed for trusted local stdio clients.

For a client configuration, build once with `go build -buildvcs=false -o bin/screendrop .`, then use this standard MCP server entry:

```json
{
  "mcpServers": {
    "screendrop": {
      "command": "/absolute/path/to/checkout/api/bin/screendrop",
      "args": ["-mcp"],
      "env": {
        "VM_NAME": "Your VM name",
        "SCREENSHOT_DIR": "/absolute/path/to/private/screenshots",
        "CAPTURE_DIR": "/absolute/path/to/private/captures",
        "VM_NETWORK_ADAPTER": "1"
      }
    }
  }
}
```

Web and MCP processes can share the gallery and capture folders. Input sequences are serialized inside each process; avoid keyboard/mouse control of the same VM from both simultaneously. Network captures use a shared file lock and can be stopped from either interface. The tools use the [official Go MCP SDK](https://github.com/modelcontextprotocol/go-sdk); packet decoding uses [Wireshark sharkd](https://www.wireshark.org/docs/man-pages/sharkd.html).

Captures time out after 15 seconds. Screenshots from both capture endpoints are saved in `assets/` by default. Existing PNGs in that folder also appear in the gallery. Set `SCREENSHOT_DIR` to use another folder. Files remain until you remove them from that folder; older captures that were only displayed by the previous temporary-preview version cannot be recovered automatically. The page does not poll or capture automatically.

Tailwind CSS and HTMX are served locally and embedded into the Go binary. Node is only needed when editing/rebuilding frontend assets:

```sh
npm ci
npm run build
go test ./...
/usr/bin/python3 -m unittest discover -s scripts -p '*_test.py'
```

Use `npm run watch` while editing templates/styles, and restart `go run .` to reload embedded files.
