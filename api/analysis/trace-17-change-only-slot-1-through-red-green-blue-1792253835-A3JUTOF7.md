# 17 Slot-1 colors; final custom Apply incomplete

Source: `../captures/vm-052785d3b59d/trace-17-change-only-slot-1-through-red-green-blue-1792253835-A3JUTOF7.pcapng`  
SHA-256: `e519e2f7353fb7b4c794fa26a85f18709b8ecb9a919798bbf56bef812a47e721`

The operator confirms **only slot 1** was edited, and a custom color was chosen
last. Exact custom RGB values were not supplied. The first three color Applies
are complete; the final custom-color Apply is cut off. Preserve the useful
earlier phases and do not label the final write verified or restored.

| Phase | Window (seconds) | `0020` / `0021` / `0022` | User R/G/B nibbles | Candidate count |
| --- | --- | --- | --- | --- |
| Startup | 7.123546–10.916225 | `00 1f ff` | 0 / 1 / 15 | 867 |
| Guided red | 18.958816–22.617923 | `00 ff ff` | 0 / 15 / 15 | 867 |
| Guided green | 28.394840–32.009028 | `f0 0f ff` | 15 / 0 / 15 | 867 |
| Guided blue choice | 39.423855–42.943087 | `f0 7f 0f` | 15 / 7 / 0 | 867 |
| Final custom attempt | 56.276585–59.035495 | `f0 ff ff` | 15 / 15 / 15 | **652, incomplete** |

Reports `07 18 03 OFFSET 20 00 VALUE 07`, offsets 0/1/2, carry slot-1 channels.
The retained Apply code, `ghidra-typed-pass/00419e20.c:956` onward, combines
`LED_USER` channel values in each byte's **high nibble** with DPI color values
in the **low nibble**. `00422610.c:493` onward loads the seven named RGB triples;
the retained config defaults supply the same initial 0/1/15 triple. The custom
palette must preserve the lower nibbles to avoid altering DPI colors.

Channel identity is thus corroborated by isolated operator actions and static
serialization, not just adjacent byte addresses. The blue choice includes a
nonzero green component; without the picker values it must not be relabeled
pure RGB blue. The retained palette loader reconstructs a display channel as
`255 - 16*nibble`; that is a representative quantized value, not proof of the
exact RGB picked by the user. Four-bit channels do not establish 24-bit physical
precision or the exact encoder rounding rule.

The first four bursts end with the known fixed final Apply pair. The custom
attempt instead ends at `07 18 09 00 30 02 00 07`, after 652 of the usual 867
comparable reports; its finalization pair is absent. The changed color bytes
are visible in the prefix, but the capture does not establish successful final
activation or persistence. It is 215 candidate reports shorter than a complete
sequence; absent bytes are not reconstructed.

The file contains 67,618 records over 59.063535 seconds, including 39,980
shortened records. A fresh sharkd instance confirms the count, 567 records before
five seconds, and 25 exact setting/tail frames. The remaining window has 67,051
records. Cycle mode/speed `90` and participation `ff` stay fixed in all captured
prefixes. Original capture and metadata are unchanged. These are local-parser,
sharkd and retained static observations; no new REA Evidence is claimed.

Next: one short capture of a known custom RGB on slot 1, confirming the picker,
clicking Apply once and waiting at least ten seconds before Stop. No need to
repeat the completed speed/toggle/RGB steps. Other slots still need isolated
GUI correlation. Physical color, cycling and persistence remain unmeasured.
No device commands or Resa app changes were performed during this analysis.
