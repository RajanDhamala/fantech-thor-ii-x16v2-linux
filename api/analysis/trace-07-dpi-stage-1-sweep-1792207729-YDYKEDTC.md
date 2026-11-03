# 07 DPI stage 1 sweep — runtime corroboration of packed DPI encoding

Source: `../captures/vm-052785d3b59d/trace-07-dpi-stage-1-sweep-1792207729-YDYKEDTC.pcapng`  
SHA-256: `bd1339ccbd701e138d50839f23a8dd6eaf7c1daf648cb30cec18414b714a66b6`

## Capture and window

The operator completed the guided first-stage sweep through 800, 1600, and 4000 DPI, pressing Apply at each step. The preceding screenshot showed stage 1 at 200 and the second-stage checkbox disabled.

The complete capture contains 58,355 USB records over 57.106873 seconds and occupies 5,972,560 bytes. Analysis excludes the first five seconds with `frame.time_relative >= 5`, retaining 57,478 records and excluding 877. A fresh decoder with pagination verifies that the partitions sum to the full count. Startup is kept separate from the setting changes.

## Recorded values

Each of four feature bursts has 867 comparable outgoing command-18 candidate data-stage records. The first is startup with the preceding 200-DPI selection; the next three align with the guided 800/1600/4000 Apply actions:

| Phase | Feature setup window (seconds) | Logical field 0015 | First-stage code | Decoded first-stage DPI |
| --- | --- | --- | --- | --- |
| Startup | 6.781535–10.256507 | `14` | `01` | 200 |
| First Apply | 32.158960–35.428568 | `44` | `04` | 800 |
| Second Apply | 41.713728–44.898931 | `84` | `08` | 1600 |
| Restore Apply | 51.537941–54.804172 | `E4` | `0E` | 4000 |

The observed report changes are in command-18 block coordinate `0010`, offset `05`: `07 18 03 05 10 00 VALUE 07`. The high nibble changes for stage 1, while low nibble `4` belongs to stage 2 and stays fixed. Coordinates and packing are corroborated against the existing X16v2 decoder source, not assumed to be physical memory addresses.

## Other controls and checkbox state

Throughout all four phases:

- Other DPI stage values decode to 800, 1200, 4800, 7200, and 12800.
- Stage 1 remains selected.
- The known polling-rate field stays `00`, corresponding to the captured 1000 Hz UI setting.
- Enable mask stays `3D`: stage 2 is disabled and the other five stages are enabled. Original 01–06 baseline mask was `3F` (all six enabled). Thus the DPI sweep itself keeps the checkbox state fixed, but the final full configuration does not exactly restore the earlier six-enabled-stage baseline.
- The known startup-versus-Apply field is handled separately; it is not attributed to DPI.

Comparing the three Apply phases with each other isolates the one packed DPI byte. Comparing directly with old baseline would also show the already-disabled stage-2 bit; that is recorded as a separate constant state, not a DPI-value effect.

## Static source cross-check

The existing X16v2-specific source `../../FantechX9ThorDriver/x16_dpi.py` (SHA-256 `54d24896b92506a4c2b3da20d75d4d765ddd9a7cc4be15bfc2df7d57d50860e1`) was inspected read-only. Only constant tuples were evaluated through `ast.literal_eval`; no module import, controller execution, or USB operation occurred. Its four sample codes (200→01, 800→04, 1600→08, 4000→0E), stage-pair packing, enable bits, and high-code-bit packing agree with the captured values. Remaining entries in its 23-value DPI table are retained as static-only evidence; this capture does not experimentally verify every DPI choice.

## Limits and next step

34,371 records have captured lengths smaller than original lengths. Candidate report comparisons use separate VirtualBox control-phase setup slots, not a reconstructed complete payload stream. Actual optical DPI and physical sensitivity were not independently measured. No safe Linux write, arbitrary memory operation, or captured batch replay is established or executed here.

The stage-1 sample sweep is sufficient to corroborate the existing code pattern for now. Move to a small lighting experiment based on the actual LED-tab controls; inspect its screenshot before choosing colors/effects. If the original six-stage setup is desired, restore the checkbox above 800 before the next recording and keep it fixed thereafter.
