# Recording 28: Mono Water brightness

All three planned Applies are complete, plus startup.
Source: `captures/vm-052785d3b59d/trace-28-mono-water-brightness-1792428713-UJQ7FOCG.pcapng`. SHA-256: `306eb8403a8d3b1013d585569aea93593eaa8ef20bba4949c9269fdcc7b7f8b1`.

| Phase | 003f | Brightness code | Frame |
| --- | --- | --- | --- |
| Startup | 40 | 4 | 1275 |
| Maximum | 00 | 0 | 16887 |
| Middle | 40 | 4 | 31003 |
| Minimum | 60 | 6 | 44727 |

The brightness field is003f mask70, preserving8f (including slot7 blue in the low nibble). Maximum/middle/minimum are0/4/6. Code0 is maximum brightness, not Off. The first Apply also changes the previously observed006f candidate00->04. Subsequent Applies isolate only003f. Mode4, minimum speed, Two way and symmetry off stay fixed. Palette and participation are unchanged.

Each burst has867 candidates and both captured finalizers. The independent sharkd check agrees on56499 packets and verifies32 selected records. There are33443 shortened frames.

Limitations:
- Guided maximum/middle/minimum labels follow recording notes and user completion; brightness output and persistence are not physically measured.
- Raw codes0/4/6 are captured slider positions, not a calibrated perceptual brightness scale.
- Shortened VirtualBox records are inspected as captured setup-slot candidate bytes; absent bytes are not reconstructed.
- No new REA Evidence: REA_TSHARK_COMMAND remains unavailable. Local parser and independent sharkd verification used.
- No analyst device write or Resa implementation change.
