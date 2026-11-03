# 14 DPI Breathing: actual speed maximum → middle → minimum

Source: `../captures/vm-052785d3b59d/trace-14-dpi-breathing-effect-mode-1792253270-YNZCS6IK.pcapng`  
SHA-256: `7571442fe701ab3aa12a1625a69aebbfe0fbc65e4057ffb5d38eaa1d42f21ec8`

The operator explicitly confirms changing the **Speed** slider under **DPI
Breathing Effect**, applying at maximum, middle, then minimum. This differs
from the earlier proposed Light On → DPI Breathing → Light On mode test. The
actual speed sweep is useful; original capture name and metadata are unchanged.
The preceding screenshot selected DPI Breathing but its open menu hid controls.

| Phase | Feature window (seconds) | Field `001c` | Speed bits | Frame |
| --- | --- | --- | --- | --- |
| Startup | 8.818903–12.680964 | `80` | `0` | 1280 |
| Maximum | 16.827349–20.398592 | `85` | `5` | 14016 |
| Middle | 25.275071–28.868630 | `82` | `2` | 25406 |
| Minimum | 30.595778–34.118951 | `80` | `0` | 38414 |

Every phase contains 867 comparable command-18 candidate reports. The field is
`07 18 03 04 18 00 VALUE 07`, logical coordinate `001c`. The low three bits vary
`5 → 2 → 0`; mode bits `(VALUE >> 4) & 7` stay zero, and upper bits stay `80`.
Between Apply steps, only candidate 28 changes. The first Apply additionally
changes the already known startup/Apply field `006f` from `00` to `04`.
Brightness `003f` remains `40`, direction/symmetry `003a` remains `0b`, and all
other comparable candidates stay fixed. Every phase ends with the fixed final
Apply pair previously established by captures and vendor code.

This associates DPI Breathing with mode bits zero under operator context and
corroborates the retained static speed/timing mask `07`. The maximum/middle/
minimum slider positions map to raw 5/2/0. No exact percentage, physical period,
frequency, speed-direction measurement or arbitrary intermediate value is
established. There is no Light On transition or restore in this recording;
the final captured state is minimum-speed DPI Breathing under operator context.

## Verification and next

The file has 50,199 records over 34.565905 seconds, including 30,293 shortened
records. The local parser checks PCAPNG block lengths and USB headers. A fresh
`/usr/bin/sharkd` independently confirms the count and exact bytes for all four
selected speed records. The JSON retains the five-second exclusion counts and
per-phase differences. Candidate bytes occupy VirtualBox control-phase setup
slots; missing payload bytes are not reconstructed. These are local-parser and
sharkd observations, not REA Evidence; its TShark provider remains unavailable.

A fresh API screenshot shows the Windows desktop rather than the effect
controls. Physical breathing and speed changes have not yet been reported, and
the closed-menu control panel still needs visual inspection. No new device
configuration commands were sent and no Resa code was changed in this analysis.

Keep this capture; there is no need to repeat its speed sweep. Next is Cycle
Breathing with an isolated maximum → middle → minimum Speed sequence. Other
effect controls and color linkage need their own evidence where applicable.
