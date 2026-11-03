# 16 Cycle Breathing slot-1 participation

Source: `../captures/vm-052785d3b59d/trace-16-toggle-only-slot-1-off-1792253770-BTYGOSG3.pcapng`  
SHA-256: `45c94aec8a8c4a8f61b970ed2c5ca896556d3c17151f7f7d7fab21d8326f0dd5`

| Phase | Window (seconds) | `001d` | Evidence frame |
| --- | --- | --- | --- |
| Startup, slot 1 enabled | 6.943015–10.690781 | `ff` | see JSON |
| Slot 1 disabled | 12.777449–16.300788 | `fe` | 14261 |
| Slot 1 enabled again | 18.538523–22.019430 | `ff` | 26721 |

All three phases have 867 comparable command-18 reports and the final Apply
pair. Report `07 18 03 05 18 00 VALUE 07` identifies logical coordinate `001d`.
Only bit 0 changes for the guided slot-1 toggle. The first Apply additionally
changes the known `006f` startup/Apply byte; other candidate records remain
fixed. Cycle Breathing mode/speed stays `90`, and colors stay unchanged.
The restore matches the startup candidates apart from `006f`.

The retained Apply code at `resa/evidence/ghidra-typed-pass/00419e20.c` packs
seven participation flags in the low seven bits and the separate user-color
enable in bit 7. Only slot 1/bit 0 is isolated by this recording; preserve all
other bits and do not claim every GUI toggle was independently tested.

The file has 38,863 records over 22.955949 seconds, with 23,325 shortened records.
A fresh sharkd decoder confirms the full count, 133 records before five seconds,
and 12 selected setting/tail frames. The remaining window has 38,730 records.
Originals are unchanged and missing payload bytes are not reconstructed. Labels
follow the guided steps and operator completion, not byte values alone. Physical
cycling and persistence are unmeasured. No device commands or app changes were
performed during this analysis. Exact static identities are in the JSON report.
