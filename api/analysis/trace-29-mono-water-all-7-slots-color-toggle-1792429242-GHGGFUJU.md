# Recording 29: Mono Water slot colors and toggles

The recording stopped at the configured size limit after89.658902 captured seconds. Its metadata explicitly reports `size limit`; it did not reach the120-second deadline.

Slots1-4 each have three complete Applies: color edit, participation off, participation on. Slot5 has a complete color Apply and an incomplete off Apply. Slots6-7 are not recorded.
Source: `captures/vm-052785d3b59d/trace-29-mono-water-all-7-slots-color-toggle-1792429242-GHGGFUJU.pcapng`. SHA-256: `e3c0fdb323eeaa152f07e8c6c1ef8d6f28013a535b7dafeec045779a32351bcd`.

There are13 complete Applies plus startup (867 candidates each, both captured finalizers). The final partial off Apply contains481 candidates, including001d=ef, but no finalizers. Never treat its completion or final mouse state as verified.

| Slot | Color complete | Off complete | On complete | Toggle mask |
| --- | --- | --- | --- | --- |
| 1 | yes | yes | yes | 01 |
| 2 | yes | yes | yes | 02 |
| 3 | yes | yes | yes | 04 |
| 4 | yes | yes | yes | 08 |
| 5 | yes | no | not recorded | 10 |

Color changes occupy the previously known high-nibble palette groups0020-002b for slots1-4 and002c-002e for slot5. Their low nibbles are preserved. Isolated toggles at001d map slots1-4 to01/02/04/08 and return toff after each on Apply. The partial slot5 off candidate has bit10 clear; completion is not claimed.

The independent sharkd decoder agrees on205803 packets and verifies120 selected records, including palette fields and finalizer boundaries. The capture contains121816 shortened records.

Next recording30 restarts at slot5 with a different color, then off/on, and repeats for6 and7. This completes nine Applies without repeating slots1-4. Keep other controls fixed.

- Guided sequence, user estimate and isolated field differences identify slots. Exact chosen RGB values are unphotographed; four-bit stored nibbles do not establish arbitrary 8-bit RGB.
- The slot5 off sequence is incomplete in the capture. No finalizer or physical state is inferred; a vendor operation may have continued after recording stopped.
- Many VirtualBox frames are shortened; candidate setup-slot bytes are inspected without reconstructing missing bytes.
- Independent sharkd verification is local evidence, not REA Evidence; its TShark provider remains unavailable.
- No analyst device commands or Resa implementation changes were performed; physical colors and persistence remain unmeasured.
