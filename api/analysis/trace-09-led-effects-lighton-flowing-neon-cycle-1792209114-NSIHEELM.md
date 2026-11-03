# 09 LED mixed effect, timing, direction, and brightness changes

Source: `../captures/vm-052785d3b59d/trace-09-led-effects-lighton-flowing-neon-cycle-1792209114-NSIHEELM.pcapng`  
SHA-256: `c344b3b519089592b98955096a3001989053ae22443805fc08a8079c5b5439ed`

## What was recorded

The name follows the guided Light On → Flowing Water → Neon → Cycle sequence, but the operator reports additional adjustments, including speed and clockwise/two-way direction controls. The operator later clarified that Flowing Water direction choices were adjusted (clockwise, anticlockwise, two-way; exact order not recalled), and the Neon speed slider was changed. Visible physical results and exact per-Apply labels remain unconfirmed. Treat this as a mixed exploratory recording rather than an isolated four-effect test. No new intermediate screenshots accompany recording 09.

The original file has 153,527 records over 82.467440 seconds and is 15,700,488 bytes. Filtering `frame.time_relative >= 5` retains 149,195, excludes 4,332, and begins at frame 4333. A fresh paginated sharkd instance verified the partition. Raw files and operator metadata are untouched.

## Sequences and fields

Startup begins before the five-second cutoff; only its 515-record suffix remains in the comparison window. Afterwards there are ten complete, comparable 867-record command-18 sequences. Compared with recording 08 restored Apply, every changed candidate record is one of logical fields `001C`, `003A`, or `003F`. All other candidate bytes in those complete sequences match the reference, including the known DPI, stage-enable, polling and button fields.

| Phase | Feature window (seconds) | 001C | 003A | 003F | Changes since preceding complete Apply |
| --- | --- | --- | --- | --- | --- |
| Reference 08 | — | `9B` | `0B` | `00` | — |
| Apply 1 | 13.211187–16.489650 | `A3` | `0B` | `00` | 001C: 9B→A3 |
| Apply 2 | 18.672426–21.989310 | `A3` | `0B` | `50` | 003F: 00→50 |
| Apply 3 | 29.960381–33.207690 | `B3` | `0B` | `50` | 001C: A3→B3 |
| Apply 4 | 36.946141–40.036178 | `B3` | `0B` | `50` | identical candidate sequence |
| Apply 5 | 41.183122–44.285643 | `B3` | `2B` | `50` | 003A: 0B→2B |
| Apply 6 | 45.810578–48.911907 | `B3` | `3B` | `50` | 003A: 2B→3B |
| Apply 7 | 54.852150–58.020128 | `E3` | `0B` | `50` | 001C: B3→E3, 003A: 3B→0B |
| Apply 8 | 59.586226–62.785740 | `E0` | `0B` | `50` | 001C: E3→E0 |
| Apply 9 | 64.580043–67.849540 | `E0` | `0B` | `50` | identical candidate sequence |
| Apply 10 | 76.179976–79.191970 | `90` | `0B` | `50` | 001C: E0→90 |

The retained static Apply decompilation corroborates mode/timing packing in `001C`, direction/symmetry packing in `003A`, and brightness packing in `003F`. The INI saver independently names the backing globals. Exact paths and SHA-256 identities are in the JSON report. These are software-field semantics corroborated by captured changes, not independently measured hardware effects.

Mode bits `(001C >> 4) & 7` follow `2,2,3,3,3,3,6,6,6,1` across the ten Apply sequences; timing bits `001C & 7` move from 3 to 0 at Apply 8. Direction bits `(003A >> 4) & 3` move `0→2→3→0`. Brightness bits `(003F >> 4) & 7` move `0→5` at Apply 2 and remain 5. The direction code names and UI speed scale remain unassigned until the operator clarifies the action order. The mode translation has special cases and must not be treated as a dropdown index formula.

Apply 3→4 and 8→9 contain identical candidate sequences. The final Apply does **not** restore the complete previous configuration: field `001C` is `90` rather than `9B` and `003F` is `50` rather than `00`. Returning to the original effect label alone does not prove restoration of its timing/brightness or separate flag.

## Limits and next step

91,057 records are shorter than their original lengths. Candidate data-stage bytes are present in VirtualBox control-phase setup slots; missing data is not reconstructed. No standalone command-13/14 candidate prefixes were found in retained control setup slots or captured payload prefixes; that bounded search is not proof of protocol-wide absence. No safe standalone Linux replay/write sequence or physical behavior is established.

Preserve this useful mixed recording. The requested RGB scope is color, on/off, and basic brightness/speed, so exact direction code names and exhaustive effect coverage are deferred. No repeat is required for direction mapping. Inspect the Light On controls in a screenshot before choosing a minimal color/on-off recording; do not infer that a zero brightness value is physically off without observing it.

