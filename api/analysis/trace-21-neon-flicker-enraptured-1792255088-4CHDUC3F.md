# Recording 21: Neon, Flicker and Enraptured speed

All nine planned maximum → middle → minimum speed steps are complete. The capture contains startup plus ten Apply bursts: one additional unchanged Apply follows Flicker minimum. Its purpose is unknown; it does not require another recording.

Source: `captures/vm-052785d3b59d/trace-21-neon-flicker-enraptured-1792255088-4CHDUC3F.pcapng`. SHA-256: `0f8291babc194cbf21b32a2fc349589c8cfcfbe4dbcf0f56b59e2a00a742b088`.

## Observed settings

| Phase | `001c` | `0033` | Full mode | Raw speed | `001c` frame |
| --- | --- | --- | --- | --- | --- |
| Startup, Cycle Breathing | 95 | 1f | 1 | 5 | 3182 |
| Neon maximum | e5 | 1f | 6 | 5 | 13488 |
| Neon middle | e2 | 1f | 6 | 2 | 23916 |
| Neon minimum | e0 | 1f | 6 | 0 | 37620 |
| Flicker maximum | 85 | 9f | 8 | 5 | 48456 |
| Flicker middle | 82 | 9f | 8 | 2 | 57880 |
| Flicker minimum | 80 | 9f | 8 | 0 | 67540 |
| Additional identical Apply | 80 | 9f | 8 | 0 | 77532 |
| Enraptured maximum | b5 | 9f | 11 | 5 | 90500 |
| Enraptured middle | b2 | 9f | 11 | 2 | 100918 |
| Enraptured minimum | b0 | 9f | 11 | 0 | 110636 |

Each burst contains 867 command-18 candidate records and ends with the fixed pair `07 18 10 00 00 00 00 00`, `07 18 00 00 00 00 00 00`. The additional Flicker Apply matches all 867 preceding candidates. Apart from the known startup-to-Apply change at `006f`, differences are confined to `001c` and `0033`.

## Mode packing

The mode spans two coordinates:

```text
mode = ((value_001c >> 4) & 7) | (((value_0033 >> 7) & 1) << 3)
speed = value_001c & 7
```

Preserve unrelated bits: mode owns `001c & 70` and `0033 & 80`; the low seven bits of `0033` remain `1f` here. Reading only `001c` would confuse Flicker with mode 0 and Enraptured with mode 3. The retained vendor Apply source `../resa/evidence/ghidra-typed-pass/00419e20.c` independently corroborates both mode parts (SHA-256 `0871f814c5a37732f52d84efe5f9fe08c718d77d13fbb866f13e7c733f26e5ec`). The separate Button Response flag remains outside this result.

## Verification and limits

The full file contains 121,875 packets over 94.834193 seconds, including 75,231 shortened records. The five-second exclusion removes 859 packets; startup is still identified separately. A fresh `/usr/bin/sharkd` decoder agrees on packet count and verifies 44 selected records: both mode fields and the final pair in every burst. Exact records and comparisons are retained in the matching JSON; the reusable mapping is [neon-flicker-enraptured-mapping.json](neon-flicker-enraptured-mapping.json).

Effect labels and slider positions follow the guided operator sequence. Raw codes establish maximum/middle/minimum correlations, not measured animation timing. Candidate bytes come from VirtualBox setup slots; missing payloads are not reconstructed. No new REA Evidence is claimed because its TShark provider was unavailable. No device commands or Resa implementation changes were performed for this analysis; physical behavior and persistence remain unmeasured.
