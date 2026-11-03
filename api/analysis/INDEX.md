# Published protocol analysis

These mapping JSONs, written trace reports and filtered JSON evidence document
the protocol investigation used during Resa's development. They retain configuration bytes, masks, observed transitions,
capture hashes and the limits of each conclusion. They are historical research
snapshots; use the [Resa README](../../resa/README.md) for current app behavior
and the [support summaries](../../resa/evidence/README.md) for implementation scope.

| Files | Evidence |
| --- | --- |
| [dpi-mapping.json](dpi-mapping.json) | DPI table, packed stage values, enable mask and active stage. |
| [polling-rate-mapping.json](polling-rate-mapping.json) | Captured polling choices and configuration codes. |
| [button-slot-mapping.json](button-slot-mapping.json) | All seven button slot coordinates. |
| [button-action-mapping.json](button-action-mapping.json) | Ordinary action dictionary and preserved flag masks. |
| [button-mapping.json](button-mapping.json), [button5-mapping.json](button5-mapping.json) | Earlier per-button observations and capture context. |
| [lighting-mapping.json](lighting-mapping.json) | Early mixed-effect field comparisons and static corroboration. |
| [dpi-breathing-mapping.json](dpi-breathing-mapping.json) | Mode and speed field observations. |
| [cycle-breathing-mapping.json](cycle-breathing-mapping.json) | Palette packing and slot participation. |
| [neon-flicker-enraptured-mapping.json](neon-flicker-enraptured-mapping.json) | Speed codes and shared mode fields. |
| [flowing-water-mapping.json](flowing-water-mapping.json) | Speed, direction, symmetry and palette observations. |
| [button-response-mapping.json](button-response-mapping.json) | Per-button response selectors alongside ordinary actions. |
| [mono-water-mapping.json](mono-water-mapping.json) | Mode, speed, brightness and all seven palette slots. |

## Recording reports

Each recording has a Markdown explanation and its matching JSON containing
filtered USB/HID report correlations, selected decoded traffic, counts, capture
hashes and limitations. Local VM names and host-assigned USB UUIDs are redacted;
personal absolute paths are replaced with relative research paths. The original
recordings remain private. Published JSONs are analysis exports, not replacement
PCAP files or complete reconstructed USB payloads.

| Recording | Written report | Filtered JSON |
| --- | --- | --- |
| 01 Startup — USB baseline | [Markdown](trace-01-startup-1792205592-47SEJ7V6.md) | [JSON](trace-01-startup-1792205592-47SEJ7V6.json) |
| 02 Unchanged Apply — reopened app plus Apply | [Markdown](trace-02-unchanged-apply-1792205863-MDT4Z6WL.md) | [JSON](trace-02-unchanged-apply-1792205863-MDT4Z6WL.json) |
| 03 Repeat Apply — recording comparison | [Markdown](trace-03-repeat-apply-1792206079-X3LQVAL3.md) | [JSON](trace-03-repeat-apply-1792206079-X3LQVAL3.json) |
| 04 Polling 1000 to 500 — controlled forward change | [Markdown](trace-04-polling-1000-to-500-1792206857-QPDF4WZS.md) | [JSON](trace-04-polling-1000-to-500-1792206857-QPDF4WZS.json) |
| 05 Polling 500 to 1000 — reverse configuration check | [Markdown](trace-05-polling-500-to-1000-1792207040-6LHSSJUX.md) | [JSON](trace-05-polling-500-to-1000-1792207040-6LHSSJUX.json) |
| 06 Polling Sweep 250–125–1000 — complete rate-code table | [Markdown](trace-06-polling-sweep-250-125-1000-1792207271-XOHBMEBE.md) | [JSON](trace-06-polling-sweep-250-125-1000-1792207271-XOHBMEBE.json) |
| 07 DPI stage 1 sweep — runtime corroboration of packed DPI encoding | [Markdown](trace-07-dpi-stage-1-sweep-1792207729-YDYKEDTC.md) | [JSON](trace-07-dpi-stage-1-sweep-1792207729-YDYKEDTC.json) |
| 08 Button 4 assignment sweep — first assignment corrected to Left Click | [Markdown](trace-08-button4-forward-middle-backward-fordward-1792208411-ZG4EIUHF.md) | [JSON](trace-08-button4-forward-middle-backward-fordward-1792208411-ZG4EIUHF.json) |
| 09 LED mixed effect, timing, direction, and brightness changes | [Markdown](trace-09-led-effects-lighton-flowing-neon-cycle-1792209114-NSIHEELM.md) | [JSON](trace-09-led-effects-lighton-flowing-neon-cycle-1792209114-NSIHEELM.json) |
| 10 Light On brightness sweep — off remains unconfirmed | [Markdown](trace-10-led-brightness-on-off-1792209568-IRWKJBIU.md) | [JSON](trace-10-led-brightness-on-off-1792209568-IRWKJBIU.json) |
| 11 Button 5: Forward, Backward, Rapid Fire | [Markdown](trace-11-button5-1792240266-NXMGP7X5.md) | [JSON](trace-11-button5-1792240266-NXMGP7X5.json) |
| 12 Button 5 remaining actions | [Markdown](trace-12-button5-remaining-action-1792250416-TEKTHPZD.md) | [JSON](trace-12-button5-remaining-action-1792250416-TEKTHPZD.json) |
| 13 Button slot mapping: button 1 missing at cutoff | [Markdown](trace-13-button-slot-mapping-1792251199-53GC3I5W.md) | [JSON](trace-13-button-slot-mapping-1792251199-53GC3I5W.json) |
| 13 follow-up: button 1 mapped; restore not captured | [Markdown](trace-13-button1-fordward-left-1792251871-HG3OUP7G.md) | [JSON](trace-13-button1-fordward-left-1792251871-HG3OUP7G.json) |
| 14 DPI Breathing: actual speed maximum → middle → minimum | [Markdown](trace-14-dpi-breathing-effect-mode-1792253270-YNZCS6IK.md) | [JSON](trace-14-dpi-breathing-effect-mode-1792253270-YNZCS6IK.json) |
| 15 Cycle Breathing speed | [Markdown](trace-15-cycle-breathing-speed-max-mid-main-1792253669-QUN2RKNS.md) | [JSON](trace-15-cycle-breathing-speed-max-mid-main-1792253669-QUN2RKNS.json) |
| 16 Cycle Breathing slot-1 participation | [Markdown](trace-16-toggle-only-slot-1-off-1792253770-BTYGOSG3.md) | [JSON](trace-16-toggle-only-slot-1-off-1792253770-BTYGOSG3.json) |
| 17 Slot-1 colors; final custom Apply incomplete | [Markdown](trace-17-change-only-slot-1-through-red-green-blue-1792253835-A3JUTOF7.md) | [JSON](trace-17-change-only-slot-1-through-red-green-blue-1792253835-A3JUTOF7.json) |
| 18 Slot-1 custom color: complete black Apply confirmed | [Markdown](trace-18-cycle-breathing-slot1-custom-confirm-1792254427-VCIUW4UY.md) | [JSON](trace-18-cycle-breathing-slot1-custom-confirm-1792254427-VCIUW4UY.json) |
| 20 Cycle Breathing: slots 2–7 mapped in one recording | [Markdown](trace-20-cycle-breathing-slots-1792254723-TREHH3CO.md) | [JSON](trace-20-cycle-breathing-slots-1792254723-TREHH3CO.json) |
| Recording 21: Neon, Flicker and Enraptured speed | [Markdown](trace-21-neon-flicker-enraptured-1792255088-4CHDUC3F.md) | [JSON](trace-21-neon-flicker-enraptured-1792255088-4CHDUC3F.json) |
| Recording 22: Flowing Water speed, direction and symmetry | [Markdown](trace-22-flowing-water-speed-direction-symmetry-1792255672-3QJOHJGS.md) | [JSON](trace-22-flowing-water-speed-direction-symmetry-1792255672-3QJOHJGS.json) |
| Recording 23: Flowing Water slot-1 color and participation | [Markdown](trace-23-flowing-water-slot1-color-toggle-1792255930-3DTBTLSV.md) | [JSON](trace-23-flowing-water-slot1-color-toggle-1792255930-3DTBTLSV.json) |
| Recording 24: Button Response choices on button 1 | [Markdown](trace-24-button-response-button1-effects-1792256277-555NGYCE.md) | [JSON](trace-24-button-response-button1-effects-1792256277-555NGYCE.json) |
| Recording 25: Button Response selectors 2–7 | [Markdown](trace-25-button-response-flowing-water-1792256524-7I7UFFPJ.md) | [JSON](trace-25-button-response-flowing-water-1792256524-7I7UFFPJ.json) |
| Recording 26: sensitivity, scroll and Double Click Speed | [Markdown](trace-26-advanced-sensitivity-scroll-doubleclick-1792304302-XCM3YW6M.md) | [JSON](trace-26-advanced-sensitivity-scroll-doubleclick-1792304302-XCM3YW6M.json) |
| Recording 27: Mono Water mode, speed, direction and symmetry | [Markdown](trace-27-mono-water-ampde-speed-direction-1792401710-NYCAUUKD.md) | [JSON](trace-27-mono-water-ampde-speed-direction-1792401710-NYCAUUKD.json) |
| Recording 28: Mono Water brightness | [Markdown](trace-28-mono-water-brightness-1792428713-UJQ7FOCG.md) | [JSON](trace-28-mono-water-brightness-1792428713-UJQ7FOCG.json) |
| Recording 29: Mono Water slot colors and toggles | [Markdown](trace-29-mono-water-all-7-slots-color-toggle-1792429242-GHGGFUJU.md) | [JSON](trace-29-mono-water-all-7-slots-color-toggle-1792429242-GHGGFUJU.json) |
| Mono Water follow-up: slots5-7 colors and toggles | [Markdown](trace-29-mono-water-all-5-7-ots-1792429467-ML3WCPYF.md) | [JSON](trace-29-mono-water-all-5-7-ots-1792429467-ML3WCPYF.json) |

The [main static analysis](../../resa/ANALYSIS.md) describes extraction, transport
recovery, tool methods and the boundaries of the recovered protocol. Some findings
in historical reports were superseded by later recordings or app implementation;
read their dates and limitations alongside current support summaries.

References to captures, screenshots, full decoder comparisons and static dumps
identify local research inputs that are not distributed here. Source/capture
hashes are retained. Protocol product IDs and report bytes are intentionally public.

Raw captures, bulk decoder dumps, device backups, test-session snapshots,
screenshots and vendor software remain ignored. No recording needs to be replayed
to run Resa. These observations do not establish physical DPI, polling frequency,
visible output or persistence after reconnect.

## Updating these reports

Keep the matching Markdown and JSON filenames together. Retain capture SHA-256
values, observed frames, filters and limitations so later changes remain traceable.
Redact local VM names, USB instance UUIDs and personal paths before adding exports.
Keep the original recordings and metadata private, then run `make audit` from
the repository root before staging and again after staging.
