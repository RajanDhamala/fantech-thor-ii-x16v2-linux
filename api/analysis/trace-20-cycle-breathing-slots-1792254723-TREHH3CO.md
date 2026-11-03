# 20 Cycle Breathing: slots 2–7 mapped in one recording

Source: `../captures/vm-052785d3b59d/trace-20-cycle-breathing-slots-1792254723-TREHH3CO.pcapng`  
SHA-256: `5d3ab9df81854b4b86009e31ca3876ddb7ac8496fb00cc9bde96a9d7548b55fd`

The operator reports completing the guided one-color change per slot from 2
through 7, using white and leaving slot 1, speed and toggles fixed. The recording
is named 20 rather than the proposed 19; its original name and metadata remain
unchanged. Startup plus all six complete Apply sequences are present. There is
no need to repeat the palette-slot mapping.

| Apply | GUI slot | Window (seconds) | Changed coordinates | Evidence frames |
| --- | --- | --- | --- | --- |
| 1 | 2 | 22.686352–26.571510 | `0023: ff→0f`, `0024: 8f→0f` | 19287, 19294 |
| 2 | 3 | 32.398133–36.042516 | `0027: f0→00`, `0028: 8f→0f` | 31833, 31856 |
| 3 | 4 | 42.551175–46.227751 | `0029: f0→00`, `002b: f0→00` | 44687, 44707 |
| 4 | 5 | 50.382757–54.056376 | `002d: f0→00`, `002e: ff→0f` | 57513, 57522 |
| 5 | 6 | 58.148846–61.873684 | `002f: f3→03` | 69854 |
| 6 | 7 | 67.050800–70.436920 | `003e: 8f→00` | 83780 |

Every burst contains 867 comparable command-18 candidates and the fixed final
Apply pair. Between Apply bursts, only the listed palette fields change. The
first Apply also changes the known startup/Apply byte `006f` from `00` to `04`.
Components already encoded as zero do not change when white is selected; their
channel associations are corroborated by the retained static serializer.

## Palette ownership

| GUI slot | Red | Green | Blue |
| --- | --- | --- | --- |
| 1 | `0020` high nibble | `0021` high nibble | `0022` high nibble |
| 2 | `0023` high nibble | `0024` high nibble | `0025` high nibble |
| 3 | `0026` high nibble | `0027` high nibble | `0028` high nibble |
| 4 | `0029` high nibble | `002a` high nibble | `002b` high nibble |
| 5 | `002c` high nibble | `002d` high nibble | `002e` high nibble |
| 6 | `002f` high nibble | `0030` high nibble | `0031` high nibble |
| 7 | `003e` high nibble | `003e` low nibble | `003f` low nibble |

**Slot 7 is special.** It does not follow a sequential three-byte stride. The
Apply code at `resa/evidence/ghidra-typed-pass/00419e20.c` packs user color 6 R/G
as `R*16+G` at `003e`, then brightness plus B at `003f`. The final GUI change
independently corroborates this separate slot group. Blue is zero both before
and after the white change, so its unchanged low-nibble association is static
corroboration, not a separately observed blue-channel transition.

For slots 1–6, preserve the low nibbles, which contain DPI colors. For slot 7,
preserve the upper `003f` bits, including brightness mask `70`. All first-six
DPI nibbles, slot-1 bytes, mode/speed `001c=95`, participation `001d=ff`, and
brightness byte `003f=40` remain unchanged across every phase. Final slots
2–7 have zero user component nibbles, consistent with the guided white choices;
slot 1 retains the prior black. No restoration was requested for this sweep.

## Verification and boundaries

The source has 91,359 records over 72.008594 seconds, including 54,773 shortened
records. A local parser checks PCAPNG block sizes and Linux USB headers. A fresh
sharkd instance independently verifies the full packet count, five-second
partition and exact changed-field/finalizer bytes; counts are in the JSON.
Original files are preserved; missing payload bytes are not reconstructed. The
static source identity is pinned in the JSON. These are local-parser, sharkd and
retained-static observations, not newly produced REA Evidence.

Slot identities follow the guided order and operator completion report. Exact
white RGB dialog values were not photographed; every channel on every slot was
not separately changed. Other slot toggle bits are static correlations beyond
the isolated slot-1 test. Physical colors, timing, brightness and persistence
remain unmeasured. No device commands or Resa app changes were performed during
this analysis.

Cycle mode/speed, slot-1 toggle, custom black and all seven GUI palette groups
are now recorded. Reuse the earlier Light On brightness capture; next inspect
Flowing Water controls before planning speed/direction tests.
