# 15 Cycle Breathing speed

Source: `../captures/vm-052785d3b59d/trace-15-cycle-breathing-speed-max-mid-main-1792253669-QUN2RKNS.pcapng`  
SHA-256: `a79cab1a508ee2a8c2beb43f5b8c6ce0e36eab9b329d437830efc2f8b7227d69`

| Phase | Window (seconds) | `001c` | Speed | Evidence frame |
| --- | --- | --- | --- | --- |
| Startup, DPI Breathing | 6.777450–10.459058 | `80` | 0 | see JSON |
| Cycle Breathing maximum | 17.643607–21.238940 | `95` | 5 | 14388 |
| Middle | 23.348341–26.942364 | `92` | 2 | 27238 |
| Minimum | 29.196876–32.661340 | `90` | 0 | 39994 |

All four phases have 867 comparable command-18 candidate reports and the fixed
final Apply pair. The report is `07 18 03 04 18 00 VALUE 07`. Mode bits under
mask `70` change from DPI Breathing code 0 to Cycle Breathing code 1. Speed bits
under `07` follow 5/2/0. Only `001c` changes between Apply phases; the first
Apply additionally changes the known startup/Apply field `006f` from `00` to
`04`. All comparable palette, participation and other setting records stay fixed.

The file has 47,111 records over 32.974101 seconds, including 28,749 shortened
records. A fresh sharkd decoder independently confirms the full count, 133
records before five seconds, and 16 selected setting/tail frames. The retained
window has 46,978 records; startup is separately identified. Originals are
preserved. These are local-parser/sharkd observations, not new REA Evidence.

Labels follow the guided sequence and operator completion report. Physical
speed, timing units, breathing behavior and persistence remain unmeasured.
Candidate setup-slot bytes are not reconstructed where shortened. No device
commands were sent and no Resa app code was changed during analysis.
