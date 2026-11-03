# Recording 23: Flowing Water slot-1 color and participation

All three Applies are complete. Flowing Water slot 1 uses the same palette coordinates and participation bit previously observed in Cycle Breathing. The selected color is not the pure-red endpoint; this does not prevent confirming the shared fields.

Source: `captures/vm-052785d3b59d/trace-23-flowing-water-slot1-color-toggle-1792255930-3DTBTLSV.pcapng`. SHA-256: `bab1d8383e455fa09a21b7d532858f326d0a89aeacd0c9ecefc6bf7472623e27`.

| Phase | `0020/0021/0022` | `001d` | `003a` | Selected frames |
| --- | --- | --- | --- | --- |
| Startup | f0 / ff / ff | ff | 3b | 410 / 417 / 424 |
| Color Apply | 00 / ff / 7f | ff | 0b | 17448 / 17457 / 17464 |
| Slot 1 off | 00 / ff / 7f | fe | 0b | 31541 |
| Slot 1 on | 00 / ff / 7f | ff | 0b | 45385 |

The user palette occupies the high nibbles of `0020/0021/0022`; low nibbles remain `0/f/f`, preserving the separate DPI palette. Slot 1 changes from raw user RGB nibbles `15/15/15` to `0/15/7`, matching the established inverted four-bit layout. Pure red would use `0/15/15`; exact chosen eight-bit RGB was not photographed and is not inferred here.

The first Apply also changes direction from Overwrite to Clockwise (`003a: 3b→0b`) and the known startup-to-Apply coordinate `006f: 00→04`. Its color transition is therefore not an entirely isolated Apply. The following two Applies each change only `001d` bit 0, `ff→fe→ff`, confirming the shared slot-1 participation field with a complete restore.

Mode/speed (`001c=b0`, `0033=1f`), symmetry and brightness (`003f=40`) remain fixed. Slots 2–7 remain unchanged; their Flowing Water behavior has not been independently swept. Their existing Cycle Breathing and retained static serializer mapping remains separately labeled evidence, including special slot-7 packing.

All four bursts, including startup, contain 867 command-18 candidate records and end with `07 18 10 00 00 00 00 00`, `07 18 00 00 00 00 00 00`. The full file has 57,627 packets over 37.896533 seconds, including 34,007 shortened records. A fresh `/usr/bin/sharkd` decoder agrees on packet count and verifies 40 selected records covering eight fields and both finalizers in every burst. The five-second cutoff excludes 133 packets; startup is still identified separately.

The matching JSON retains exact frames, differences, metadata and limits; [flowing-water-mapping.json](flowing-water-mapping.json) includes the cross-effect confirmation. No missing payload was reconstructed, no new REA Evidence is claimed, and no analyst device commands or Resa implementation changes were performed. Physical color, participation behavior and persistence remain unmeasured.
