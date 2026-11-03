# Recording 25: Button Response selectors 2–7

All six Applies are complete and isolate the intended response selectors. Together with recording 24, all seven button-response coordinates are now runtime correlated. No repeated per-button effect sweep is needed.

Source: `captures/vm-052785d3b59d/trace-25-button-response-flowing-water-1792256524-7I7UFFPJ.pcapng`. SHA-256: `588995d0213475bea7b8020a52d3430cada5584743fccb1223fedc14e004b572`.

| Button | Guided selector | Coordinate | Cycle → Flowing Water | Changed frame |
| --- | --- | --- | --- | --- |
| 2 | Right | 0046 | 23 → 63 | 17300 |
| 3 | Wheel press / middle click | 0045 | 21 → 61 | 32215 |
| 4 | Side button 4 | 0048 | 25 → 65 | 48184 |
| 5 | Side button 5 | 0047 | 24 → 64 | 61391 |
| 6 | DPI button | 0049 | 26 → 66 | 76189 |
| 7 | Lighting button | 004a | 35 → 75 | 90828 |

Each change selects response code 1 in bits 7:6 (`c0`), preserving low-six-bit mask `3f`, including the ordinary action and separate bit 5. The first Apply additionally makes the known startup-to-Apply `006f: 00→04` change. Every later comparison changes exactly the intended button byte. Previously changed selectors remain Flowing Water.

Button 1 stays Mono Water (`0044=e1`). Global Button Response bytes remain `001c=9a`, `0033=1f`; its mode-entry transition is not isolated here. Final buttons 2–7 are Flowing Water and no restore was requested. The wheel association is wheel press, with no separate scroll-up/down selector captured.

Recording 24 supplies the four-choice dictionary on button 1: Cycle Breathing/Flowing Water/Comet Streak/Mono Water → `0/1/2/3`. Applying that dictionary to the other selectors is supported by the retained shared serializer; this recording tests only Flowing Water on those six buttons. [button-response-mapping.json](button-response-mapping.json) combines the evidence without claiming four separate choices were captured on every button.

The full file contains 100,475 packets over 62.888040 seconds, including 59,331 shortened records. All seven bursts, including startup, contain 867 command-18 candidates and the fixed final pair `07 18 10 00 00 00 00 00`, `07 18 00 00 00 00 00 00`. A fresh `/usr/bin/sharkd` agrees on packet count and verifies 77 selected records: both global fields, all seven button bytes and both finalizers in each burst. The five-second exclusion removes 133 packets; startup is still identified separately.

The matching JSON preserves exact differences, selected frames, metadata and limitations. Labels follow the operator sequence and capture notes. Shortened VirtualBox candidate setup bytes are not reconstructed; local parser/sharkd findings are not new REA Evidence. No analyst device commands or Resa implementation changes were performed. Physical click-triggered effects, timing and persistence remain unmeasured.
