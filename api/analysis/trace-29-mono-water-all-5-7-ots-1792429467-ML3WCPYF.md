# Mono Water follow-up: slots5-7 colors and toggles

All nine planned Applies are complete. There are eleven complete867-candidate bursts: startup, one normalization Apply restoring slot5 participation (ef->ff), then three color/off/on Applies per slot5/6/7. Every burst includes both captured finalizers.
Source: `captures/vm-052785d3b59d/trace-29-mono-water-all-5-7-ots-1792429467-ML3WCPYF.pcapng`. SHA-256: `ff2cca45ad37592650124f5edd122679b81057b0129f8c0364b0c56e464ea219`.

| Slot | Palette coordinates and masks | Off/on participation bytes |
| --- | --- | --- |
| 5 | 002c/002d/002e high nibbles | ef / ff |
| 6 | 002f/0030/0031 high nibbles | df / ff |
| 7 | 003e high/low nibbles;003f low nibble | bf / ff |

Participation is001d bits10/20/40 for slots5/6/7. Off/on Applies isolate that field. Slot7 changes003e00->0f and003f60->6f while brightness stays at raw6; the blue low nibble must not overwrite brightness. Mode, speed, direction and symmetry stay fixed.

The independent sharkd pass agrees on162185 packets and verifies84 selected field/finalizer records. Capture duration72.659644s;95386 records are shortened. The user stopped this recording normally, before either limit.

Together with the first recording29, Mono Water now has captured color edits and both toggle states for all seven GUI slots. Recordings27 and28 supply mode, speed, three directions, symmetry and brightness anchors. This establishes capture coverage, not physical effect or persistence verification.

- Both original and follow-up recordings are named29 by the user; identify them by full filename and SHA256. The follow-up is not a trace30 file.
- Nine planned color/off/on Applies follow one initial slot5 enable Apply and startup.
- Exact chosen 8-bit RGB values are unknown without picker evidence. Some channels remain unchanged; their association uses the established shared palette layout.
- Slot7 uses003e for R/G and003f low nibble for B. Its003f change60->6f preserves brightness code6.
- VirtualBox shortened frames preserve candidate setup-slot bytes; absent payloads are not reconstructed.
- Local parser/sharkd evidence is not new REA Evidence; its TShark provider remains unavailable.
- No analyst device writes or app implementation changes. Physical colors, animation and persistence remain user checks.
