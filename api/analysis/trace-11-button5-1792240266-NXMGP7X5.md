# 11 Button 5: Forward, Backward, Rapid Fire

Source: `../captures/vm-052785d3b59d/trace-11-button5-1792240266-NXMGP7X5.pcapng`  
SHA-256: `9795847f7d6f7f608aa967a2c20d9012809a89381758c28ed6d89f55ce0b87e8`

The preceding screenshot shows Game I selected and button 5 assigned to Backward. The operator confirmed completion of the guided sequence. The capture has startup and three Apply bursts; it does **not** contain the instructed fourth Apply restoring Backward after Rapid Fire. Original capture and metadata are preserved.

## Captured settings

| Phase | Feature window (seconds) | Button-5 byte | Evidence frame |
| --- | --- | --- | --- |
| Startup: Backward | 6.963733–10.452865 | `24` | 2593 |
| First Apply: Forward | 14.846679–17.983833 | `25` | 17283 |
| Second Apply: Backward | 23.693018–27.030995 | `24` | 31351 |
| Third Apply: Rapid Fire | 35.627179–38.859041 | `29` | 46617 |

All four bursts contain 867 comparable outgoing command-18 candidate records. The button-5 candidate is `07 18 03 07 40 00 VALUE 07`: block `0040`, offset `07`, logical coordinate `0047`. This differs from button 4's previously observed coordinate `0048`; GUI numbering must not be treated as sequential protocol coordinates.

Between the three Apply bursts, only candidate 81 (one-based) changes. Startup additionally differs at the already known startup/Apply field `006f`. Each burst ends with the fixed final Apply pair observed in earlier captures. Action labels depend on the screenshot and operator sequence, not on byte values alone.

The preserved upper bits are `20`; the low five action bits correlate Backward with `04`, Forward with `05`, and Rapid Fire with `09`. This fits the retained static shared action serializer and KEYMAP ordering documented in `../../resa/PROTOCOL.md`. It supports a common implementation structure with per-button coordinates. It does not validate Rapid Fire on button 4 or enable all seven buttons.

## Verification and limits

The original file contains 58,053 records over 39.252030 seconds, with 34,220 shortened records. An independent fresh `/usr/bin/sharkd` decoder confirmed the total, selected frame times/bytes, and 1,377 records before five seconds. Setting comparisons use the remaining 56,676 records and separate startup. The local parser validates PCAPNG block lengths and parses Linux USB headers. REA's packet tool was unavailable because its required TShark command is not configured; these are local-parser and sharkd observations, not REA Evidence.

Candidate bytes occupy VirtualBox control-phase setup slots; missing payload bytes are not reconstructed. Logical coordinates are not verified physical memory addresses. This recording establishes assignment traffic, not physical repeated-click timing, hold/toggle behavior, persistence, or safe standalone Linux writes. No packets were replayed during analysis.

Last captured assignment: **Rapid Fire**. Restore button 5 to Backward through the vendor UI before another isolated experiment if that is the desired baseline. The operator subsequently chose to reuse the common Rapid Fire action on the already mapped button-4 slot without another recording. The implementation was staged in `../resa-update/`, tested, then installed into `../../resa/` with the helper rebuilt; see `../RESA_SIDE_BUTTONS.md`. Physical Rapid Fire behavior remains unmeasured by the agent.
