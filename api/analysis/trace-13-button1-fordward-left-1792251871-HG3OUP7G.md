# 13 follow-up: button 1 mapped; restore not captured

Source: `../captures/vm-052785d3b59d/trace-13-button1-fordward-left-1792251871-HG3OUP7G.pcapng`  
SHA-256: `22bf6c077c1c98ef5067c16b0f335b8de51c3edb449327badf4648d0f096f6b7`

This recording is sufficient to map button 1. Its name says Forward-Left, but the
bytes show startup with Left Click followed by one Apply changing it to Forward.
The duration limit ends the recording before any captured restore.

| Phase | Feature window (seconds) | Button 1 | Button 3 | Evidence frames |
| --- | --- | --- | --- | --- |
| Startup | 16.080182–20.373175 | Left Click `21` | Left Click `21` | 6105 / 6116 |
| Apply | 48.770580–52.465615 | Forward `25` | Left Click `21` | 17048 / 17056 |

Both bursts contain all 867 comparable command-18 candidate reports and the
fixed final Apply pair. Only candidate 78 changes for the assignment:
`07 18 03 04 40 00 21 07` → `07 18 03 04 40 00 25 07`, identifying logical
coordinate `0044` (block `0040`, offset `04`). The other difference is the
already known startup/Apply field `006f` (`00` → `04`). This matches the static
KEYMAP prediction and completes runtime correlation for all seven GUI slots:

| GUI button | Logical coordinate |
| --- | --- |
| 1 | `0044` |
| 2 | `0046` |
| 3 | `0045` |
| 4 | `0048` |
| 5 | `0047` |
| 6 | `0049` |
| 7 | `004a` |

No repeat is needed for slot identification. For restoring ordinary behavior,
keep wheel button 3 as Left Click while setting button 1 to Left Click and
clicking Apply. Once button 1 works, restore button 3 to Middle Click and Apply.
There is no requirement to record these restores again for the mapping.

## Verification and limits

The local parser validates PCAPNG block lengths and USB headers. The file has
30,257 records over 59.947864 seconds and 17,722 shortened records. A fresh
`/usr/bin/sharkd` independently confirmed the packet count and exact captured
bytes for both button fields in both bursts. The matching JSON records the
five-second exclusion counts. Original capture and metadata are preserved.
Candidate bytes occupy VirtualBox control-phase setup slots; missing data is
not reconstructed. Assignment traffic and logical coordinates do not establish
physical behavior, persistence, storage type, or keyboard/modifier encoding.

A live host check now lists `[redacted local identifier]` as running, `/api/network` returns the saved
USB recording as stopped, and `/ss` returns HTTP 200 with a valid PNG. The PNG
shows the Windows desktop; it does not verify current Button-tab assignments.
No new USB recording or device write was started for this check. No Resa app
code was changed during this analysis.
