# 12 Button 5 remaining actions

Source: `../captures/vm-052785d3b59d/trace-12-button5-remaining-action-1792250416-TEKTHPZD.pcapng`  
SHA-256: `d001e890c8625b0a87272347be5970917744ec30a0ba30f86520c8cef53faffa`

All seven guided Apply steps are present. Their ordering matches the original
operator notes: Right Click, Middle Click, DPI Loop, DPI+, DPI-, LED Loop,
Backward restore. Game I was requested and shown in the preceding screenshot;
no new screenshot was supplied with this recording.

| Phase | Feature window (seconds) | Full byte | Low five action bits | Frame |
| --- | --- | --- | --- | --- |
| Startup: Backward | 5.425171–8.694481 | `24` | `04` | 1423 |
| Right Click | 14.144734–17.303348 | `23` | `03` | 16203 |
| Middle Click | 23.437025–26.802917 | `22` | `02` | 30443 |
| DPI Loop | 31.385610–34.584355 | `26` | `06` | 44734 |
| DPI+ | 42.191010–45.273218 | `2b` | `0b` | 59567 |
| DPI- | 51.150459–54.334579 | `2c` | `0c` | 74043 |
| LED Loop | 60.225373–63.334423 | `35` | `15` | 88877 |
| Backward restore | 67.214987–70.240314 | `24` | `04` | 102747 |

Every burst contains 867 comparable command-18 candidate reports. Between Apply
bursts, only candidate 81 changes: `07 18 03 07 40 00 VALUE 07`. This is button
5's established logical coordinate `0047` (block `0040`, offset `07`). No extra
keyboard, macro, or lighting records change for these assignments. The final
Apply matches startup except for the previously identified startup/Apply field
`006f` (`00` at startup, `04` after Apply), confirming restoration of the captured
configuration relative to this recording's baseline.

The upper bits stay `20`, consistent with retained reaction-lighting metadata.
Reuse the action codes with the target button's own preserved upper bits; do
not write these full example bytes indiscriminately. The right/middle values
are `03`/`02` in this vendor action encoding, not an assumed standard HID button
numbering. Existing recordings add Left click `01`, Back `04`, Forward `05`, and
Rapid Fire `09`. See `button-action-mapping.json` for the combined dictionary.

## Verification and boundaries

The file has 113,263 packet records over 71.319783 seconds, with 67,025 shortened
records. The local parser validated block lengths and Linux USB headers. A fresh
`/usr/bin/sharkd` independently confirmed the total and exact captured bytes for
all eight selected assignment frames. Excluding the first five seconds removes
331 records and retains 112,932, starting at frame 332. Startup is still analyzed
separately. Every burst contains the previously observed fixed final Apply pair.
Original capture and operator metadata remain unchanged. REA's TShark provider
was already unavailable in this session; these are local-parser and sharkd
observations, not REA Evidence.

Labels depend on the operator's recorded actions. Assignment traffic does not
measure physical mouse clicks, optical DPI, LED behavior, hold/toggle semantics,
or persistence. Candidate bytes occupy VirtualBox control-phase setup slots;
missing payload bytes are not reconstructed. No device commands were replayed
and no app code was changed during this analysis.

The common serializer supports reuse on independently mapped buttons 4 and 5;
there is no need to repeat this complete action sweep for button 4. Remaining
work is confirming the other button slots and recovering keyboard/modifier
records. Those are separate from this completed ordinary-action dictionary.
