# Recording 22: Flowing Water speed, direction and symmetry

All eight planned Applies are complete, including the final Symmetry-off change. Startup still contains the preceding Enraptured minimum setting; the first Apply selects Flowing Water and maximum speed.

Source: `captures/vm-052785d3b59d/trace-22-flowing-water-speed-direction-symmetry-1792255672-3QJOHJGS.pcapng`. SHA-256: `8b90f61ed132023c294b5915ff5c2aaf61d861f74a03df8d73bf84f46956abf7`.

| Phase | `001c` | `0033` | `003a` | Changed-field frame |
| --- | --- | --- | --- | --- |
| Startup, Enraptured minimum | b0 | 9f | 0b | 460 |
| Flowing Water maximum, Clockwise, symmetry off | b5 | 1f | 0b | 17640 / 18091 |
| Speed middle | b2 | 1f | 0b | 31800 |
| Speed minimum | b0 | 1f | 0b | 46184 |
| Anti Clockwise | b0 | 1f | 1b | 60123 |
| Two way | b0 | 1f | 2b | 73340 |
| Overwrite | b0 | 1f | 3b | 86116 |
| Symmetry checked | b0 | 1f | 7b | 100326 |
| Symmetry unchecked | b0 | 1f | 3b | 114282 |

Flowing Water is full mode 3: `001c` mask `70` gives low mode bits, and `0033` mask `80` gives the high mode bit, cleared here. Speed uses `001c` mask `07`, with maximum/middle/minimum codes `5/2/0`.

Direction uses `003a` mask `30`, shifted four bits: Clockwise=0, Anti Clockwise=1, Two way=2, Overwrite=3. Symmetry uses mask `40`. Preserve the other `003a` bits (`8f`); this recording leaves their value `0b` unchanged. The retained vendor serializer `../resa/evidence/ghidra-typed-pass/00419e20.c` near line 1138 corroborates this packing.

There are nine complete bursts including startup, each with 867 command-18 candidate records and the fixed final pair `07 18 10 00 00 00 00 00`, `07 18 00 00 00 00 00 00`. In the first startup-to-Apply comparison, the known `006f: 00→04` also changes. All subsequent comparisons isolate exactly the intended speed, direction or symmetry field. Brightness (`003f=40`), palette and other candidate settings remain unchanged.

The full capture has 125,979 packets over 64.328194 seconds, with 74,683 shortened records. A fresh `/usr/bin/sharkd` decoder agrees on packet count; 133 packets precede the five-second cutoff. It independently verifies 54 selected records covering four fields and both finalizers in every burst. Startup is identified separately despite occurring after five seconds. The matching JSON retains exact frames, differences, original metadata, source digests and limitations; [flowing-water-mapping.json](flowing-water-mapping.json) provides the reusable mapping.

Labels follow the guided operator sequence, also recorded in capture metadata. Raw speed values do not measure animation timing. VirtualBox setup-slot candidate bytes are inspected without reconstructing absent payloads. REA's packet provider was previously unavailable; these local parser and sharkd findings are not new REA Evidence. No analyst device commands or Resa implementation changes were performed. This capture does not independently test Flowing Water brightness endpoints, palette behavior, physical effects or persistence.
