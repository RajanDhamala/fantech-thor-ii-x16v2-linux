# Recording 27: Mono Water mode, speed, direction and symmetry

All eight planned Applies are complete, plus a separate startup burst containing the preceding Button Response state. No extra Apply is required.

Source: `captures/vm-052785d3b59d/trace-27-mono-water-ampde-speed-direction-1792401710-NYCAUUKD.pcapng`. SHA-256: `8e3d4aba9cd2d1d4463b427d005665126b9cc35f321af7d81f963e548e1deadb`.

| Phase | 001c | 0033 | 003a | Field frame |
| --- | --- | --- | --- | --- |
| Startup: Button Response | 9a | 1f | 0b | 2912 |
| Mono Water baseline | c2 | 1f | 0b | 20840 |
| Speed maximum | c5 | 1f | 0b | 34758 |
| Speed middle | c2 | 1f | 0b | 48601 |
| Speed minimum | c0 | 1f | 0b | 61776 |
| Anti Clockwise | c0 | 1f | 1b | 75552 |
| Two way | c0 | 1f | 2b | 88928 |
| Symmetry on | c0 | 1f | 6b | 102006 |
| Symmetry off | c0 | 1f | 2b | 115776 |

Mono Water is mode4: 001c mask70 encodes the lower three mode bits and 0033 mask80 the upper bit (clear here). The Button Response flag at 001c mask08 is cleared. Speed occupies 001c mask07; maximum/middle/minimum map to5/2/0. Preserve unrelated bits.

Direction occupies 003a mask30, shifted4: Clockwise0, Anti Clockwise1, Two way2. The inspected Mono Water UI has no Overwrite option. Symmetry uses003a mask40; preserve003a mask8f. The final off/on/off sequence is2b/6b/2b.

Startup to baseline also changes the known006f field00->04. Subsequent Applies isolate exactly the planned speed, direction or symmetry field. Brightness003f remains40; palette and slot participation are unchanged.

Each of the nine bursts has867 command18 candidate records and the fixed finalizer pair0718100000000000 / 0718000000000000. The local parser counted127349 packets over79.475707s, including75368 shortened frames. An independent sharkd pass agreed on the total and verified72 selected field/finalizer records.

Labels follow the recording notes and guided user sequence. Speed codes do not measure animation timing. Missing bytes in shortened records are not reconstructed. REA TShark support remains unavailable; no new REA Evidence is claimed. No analyst device writes or app implementation changes were performed. Brightness endpoints, colors, slot toggles, physical effects and persistence remain separate checks.
