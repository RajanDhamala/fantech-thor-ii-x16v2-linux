# Recording 24: Button Response choices on button 1

All four response choices are correlated, and all five Applies are complete. The final intended Cycle Breathing restore is absent: the last burst repeats Mono Water unchanged. No repeat is needed to collect the effect dictionary.

Source: `captures/vm-052785d3b59d/trace-24-button-response-button1-effects-1792256277-555NGYCE.pcapng`. SHA-256: `330536f108c10349e67f115715680b1c9d7782ebecf580fccd130dc66938b636`.

| Phase | Button-1 coordinate `0044` | Response code, bits 7:6 | Frame |
| --- | --- | --- | --- |
| Startup, Cycle Breathing | 21 | 0 | 792 |
| Apply 1, Cycle Breathing | 21 | 0 | 16204 |
| Apply 2, Flowing Water | 61 | 1 | 31597 |
| Apply 3, Comet Streak | a1 | 2 | 46122 |
| Apply 4, Mono Water | e1 | 3 | 61254 |
| Apply 5, intended Cycle restore | e1, unchanged Mono Water | 3 | 76062 |

The response selector occupies mask `c0`, shifted six bits; preserve the other bits (`3f`). Bit 5 stays set throughout and the ordinary action remains Left Click (`01`, low five bits). Do not treat the whole `e0` mask as the effect selector. Apart from the known first-Apply `006f: 00→04`, each changed response Apply isolates `0044`; the final two bursts match all 867 command-18 candidates.

Button Response was already selected at startup. Global bytes stay `001c=9a`, `0033=1f`: the separate flag `001c & 08` is set, alongside low mode 1 and speed code 2. This capture does not isolate the mode-entry transition; the dropdown's index 12 must not be written as a normal packed mode index without its translation.

Other button bytes remain `0045=21`, `0046=23`, `0047=24`, `0048=25`, `0049=26`, `004a=35`. Ordinary slot associations are previously mapped, but the other six response selectors remain unchanged in this capture. The next grouped recording will select Flowing Water once per button 2–7, one additional change per Apply, with no intermediate restores.

Retained vendor serializer `../resa/evidence/ghidra-typed-pass/00419e20.c` near line 1193 corroborates the packing: response value times `40`, a separate value shifted five bits, plus the ordinary action. [button-response-mapping.json](button-response-mapping.json) records masks and source digest.

The full file has 87,567 packets over 47.382947 seconds, including 51,577 shortened records. Six bursts, including startup, contain 867 command-18 candidates each and the complete fixed final pair `07 18 10 00 00 00 00 00`, `07 18 00 00 00 00 00 00`. A fresh `/usr/bin/sharkd` agrees on packet count and independently verifies 66 selected records: both global fields, all seven button bytes and both finalizers in every burst. The five-second exclusion removes 161 packets; startup is still identified separately. The matching JSON retains original metadata, exact frames, decoder verification and limitations.

Labels follow the guided sequence and original capture notes; the absent final restore is not assigned a cause. Missing VirtualBox payloads are not reconstructed. These local parser/sharkd and retained static findings are not new REA Evidence. No analyst device commands or Resa implementation changes were performed; physical response effects and persistence remain unmeasured.
