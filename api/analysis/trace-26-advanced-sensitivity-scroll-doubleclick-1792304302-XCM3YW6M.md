# Recording 26: sensitivity, scroll and Double Click Speed

All ten observed Applies, plus startup, are complete: each contains 867
command-18 candidates and the fixed final pair. The planned nine Applies plus
the reported sensitivity return from1 to10 explain the count, but identical
payloads prevent uniquely identifying individual sensitivity/scroll steps.

The first Apply changes only the known startup field006f00→04. The next six
Applies leave every candidate identical. Only the final three Applies change
001a/001b: `2c01`→`9600`→`0800`, decoding to300/150/8 milliseconds. Startup
and earlier Applies hold50ms. These are two-byte little-endian integers,
corroborated by the retained Apply serialization of DAT_0066304c. Its INI name
is FIRE_TIME; the vendor label does not establish a Linux double-click threshold.

Sensitivity and scroll produce no captured configuration delta. Retained Apply
code independently calls Windows SystemParametersInfoW: pointer speed0x71 and
scroll lines0x69. The sensitivity level table1..11 maps to Windows
`1,2,4,6,8,10,12,14,16,18,20`; wheel speed is passed as a line count. These
are host settings, and are not a Linux calibration or hidden HID write.

The source capture SHA-256 is `0cd5a14becb04059cac453a94132fabb0ef326b94c186aa6df5f0d5863ce6843`. It contains140,363
packets over100.008771seconds, including84,475 shortened records. A fresh
sharkd decoder agrees on packet count and verifies44 selected timing/finalizer
records.133 packets precede the five-second cutoff; startup is still separately
identified after that window. Exact frames and limitations are in the matching
JSON, and full candidate comparisons in advanced-controls-raw-comparison.json.

Implementation uses bounded8..300ms integer steps for device timing. Only the
8/50/150/300 anchors were captured; arbitrary intermediate physical timing has
not been measured. Linux pointer levels use the installed Cinnamon/GNOME speed
setting. Optional X11 imwheel support uses1..11 output repetitions per wheel
event, not an assertion of equal Windows scroll-line distances.

No device/desktop writes or real wheel-helper startup were performed during
analysis or implementation checks. Local parser/sharkd findings are not new REA
Evidence; shortened payloads are never reconstructed.
