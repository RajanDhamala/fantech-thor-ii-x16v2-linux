# 13 Button slot mapping: button 1 missing at cutoff

Source: `../captures/vm-052785d3b59d/trace-13-button-slot-mapping-1792251199-53GC3I5W.pcapng`  
SHA-256: `1c359029cfdc438602419139beac11ff3fd7d5ebf0b48f6f9bf4c3e75c335f9a`

The capture stopped at its duration limit. Startup plus nine complete Apply
bursts are present; each contains 867 comparable command-18 candidates and the
fixed final Apply pair. No button-1 change appears in the captured sequence.
The operator explains that a Left Click assignment had to remain available and
explicitly confirms the temporary replacement was **button 3, wheel click**.

| Button | Logical coordinate | Captured sequence | Test / restore frames |
| --- | --- | --- | --- |
| 2 | `0046` | Right Click `23` → Forward `25` → Right Click `23` | 15978 / 32928 |
| 3 | `0045` | Middle Click `22` → Forward `25` → Middle Click `22` | 47061 / 62779 |
| 6 | `0049` | DPI Loop `26` → Forward `25` → DPI Loop `26` | 76822 / 90329 |
| 7 | `004a` | LED Loop `35` → Forward `25` → LED Loop `35` | 103766 / 118166 |
| 3, last Apply | `0045` | Middle Click `22` → Left Click `21` | 134049 |

Every consecutive Apply differs only in the listed assignment field. The first
Apply additionally differs from startup at the previously identified `006f`
startup/Apply byte (`00` → `04`). Existing recordings independently map button 4
to `0048` and button 5 to `0047`. Thus six button slots are runtime correlated.
The retained static KEYMAP predicts button 1 at `0044`; it remains a static
prediction until its own change is captured. Do not infer slot order from GUI
numbering: buttons 2/3 and 4/5 are reversed in the wire layout.

## Last captured state and follow-up

Buttons 2, 6 and 7 are restored to their starting assignments. Button 3 is Left
Click in the last captured Apply (111.950127–115.549581 seconds). Button 1 was
not changed during the captured portion; any changes after cutoff are unknown.
This is assignment-traffic evidence, not an independent physical-button test.

Do not repeat the complete sweep. Keep button 3 as Left Click, then capture only
button 1 → Forward → Left Click, applying once and waiting five seconds after
each. Once button 1's Left Click works, restore button 3 to Middle Click and
Apply. A 60-second `13B Button1 Forward-Left Restore3` recording should fit this
short sequence. Even if button 1 already starts at Forward, the final change
to Left Click provides the missing comparison. Preserve a working Left Click
throughout; do not restore the temporary wheel assignment first.

## Verification and limits

The file has 145,655 records over 119.729425 seconds, including 85,821 shortened
records. The local parser checked PCAPNG block lengths and Linux USB headers.
A fresh `/usr/bin/sharkd` independently confirmed the full count and exact bytes
for all ten changed-field evidence frames. The five-second exclusion removes
155 records and retains 145,500, beginning at frame 156; startup is separately
identified. All ten command-18 sequences and finalizers are complete.

Original capture and metadata are unchanged. Candidate bytes occupy VirtualBox
control-phase setup slots; missing payload bytes were not reconstructed. The
coordinates are logical protocol positions, not verified physical storage.
Physical behavior and persistence remain unmeasured. REA's TShark provider was
already unavailable; this evidence is from local parsing and sharkd. No device
commands were sent and no Resa app code was changed during this analysis.

An attempted live screenshot via the local HTTP service was unreachable in the
sandbox; direct VBoxManage screenshot access also failed at the IPC layer.
No current-screen verification is claimed, and no VM service was started.
