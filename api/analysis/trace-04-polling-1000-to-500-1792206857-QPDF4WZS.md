# 04 Polling 1000 to 500 — controlled forward change

Source: `../captures/vm-052785d3b59d/trace-04-polling-1000-to-500-1792206857-QPDF4WZS.pcapng`  
SHA-256: `b6c2dd73db717e5b775ee03763d44cbdbf3b1ab0d72b412df53e407ddf9506ce`

## Operator-confirmed action

Only Polling Rate was changed from **1000 Hz to 500 Hz**, followed by Apply in Fantech. The source metadata notes say Dpi change, but the operator explicitly confirmed polling rate only; original notes and capture remain unchanged.

## Five-second analysis window and startup separation

The full file contains 25,271 USB records over 24.637237 seconds and occupies 2,580,384 bytes. Analysis loads the original capture, then excludes `frame.time_relative < 5`, retaining 22,201 records and excluding 3,070. Both partitions were checked against the whole-file record count with a fresh sharkd process for this capture.

Some startup traffic occurs after five seconds. The retained startup burst at 5.010307–7.667883 seconds contains 655 candidate report-07/command-18 data-stage records. These exactly match the suffix of the 01 Startup candidate sequence, so the entire matched remainder is excluded from setting-change attribution. The comparison does not mistake the cutoff's missing startup prefix for a device-setting change.

## Isolated candidate-byte difference

The later burst at 19.525061–22.730289 seconds contains 867 comparable candidate command-18 data-stage records. Compared against the 1000 Hz Apply sequence in 02, repeated in 03, **866 are identical and one differs**:

| Candidate sequence position | Reference 1000 Hz Apply | Recording 04, 500 Hz Apply | Recording frame |
| --- | --- | --- | --- |
| 30 | `07 18 03 06 18 00 00 07` | `07 18 03 06 18 00 01 07` | 13258 |

The differing byte is byte index 6 (the seventh byte). A candidate interpretation is a polling-rate configuration value at command-18 block coordinate `0x0018`, offset `0x06`: `00` for the 1000 Hz UI selection, `01` for 500 Hz. This is a **candidate mapping**, pending the reverse experiment. Block/offset syntax does not establish a physical storage address. The unchanged-Apply `00 → 04` difference at another candidate record is controlled for by comparing against Apply, not startup.

## Evidence limits

15,229 original capture records have captured lengths below original lengths. Candidate eight-byte comparisons use VirtualBox's separate control-phase setup slots, selected by control-submit, endpoint-zero OUT, URB length 8, prefix `07 18`. These are not a reconstructed complete payload stream. The physical report frequency has not been independently measured. UI event timing is inferred from the operator's action and later burst; no exact click marker was recorded. No captured report or Linux control command was sent back to the mouse.

## Next reverse check

Record `05 Polling 500 to 1000`, with a two-minute duration. Start recording, reopen Fantech, confirm 500 Hz is selected, wait five seconds, select only 1000 Hz and Apply once, wait five seconds, then stop. A reverse `01 → 00` at this same candidate field will strengthen the mapping. Keep the Game I profile, DPI 4000, and all other controls unchanged.
