# 06 Polling Sweep 250–125–1000 — complete rate-code table

Source: `../captures/vm-052785d3b59d/trace-06-polling-sweep-250-125-1000-1792207271-XOHBMEBE.pcapng`  
SHA-256: `8682aceb4e331b90c325e0c8b605a22602163d1dba7fefa2949044bc203b1cb7`

## Scope and capture checks

Guided actions were 250 Hz Apply, 125 Hz Apply, then restoration to 1000 Hz Apply, with pauses and no other intended changes. Original metadata notes say Dpi change from base; guided context is polling rate and original notes are unchanged.

The full file contains 53,711 USB records, lasts 47.625828 seconds, and occupies 5,489,584 bytes. The requested `frame.time_relative >= 5` display-filtered window retains 53,270 records and excludes 441. Counts were paginated in a fresh sharkd process and partition-checked against the whole file. No source data was truncated or altered.

## Four distinct bursts

Each burst contains 867 comparable outgoing report-07/command-18 candidate data-stage records:

| Burst / action | Feature setup window, seconds | Polling candidate frame | Candidate bytes |
| --- | --- | --- | --- |
| Startup at 1000 Hz | 5.198666–8.621414 | 878 | `07 18 03 06 18 00 00 07` |
| Select 250 Hz and Apply | 14.357868–17.590806 | 16178 | `07 18 03 06 18 00 03 07` |
| Select 125 Hz and Apply | 25.800206–29.059954 | 28572 | `07 18 03 06 18 00 07 07` |
| Restore 1000 Hz and Apply | 41.306461–44.451220 | 42126 | `07 18 03 06 18 00 00 07` |

All 867 startup candidate byte strings match 01 Startup. Each of the 250 and 125 Hz Apply bursts differs from the prior 1000 Hz Apply baseline in exactly one candidate record: record 30, byte index 6. All 867 candidate strings in the final 1000 Hz Apply burst match the prior 1000 Hz Apply baseline exactly. Startup is excluded from setting comparisons even though it lies beyond the five-second cutoff.

## Captured configuration mapping

The controlled captures 04–06 establish these observed UI/configuration associations at command-18 block coordinate `0x0018`, offset `0x06`:

| UI polling rate | Code | Evidence |
| --- | --- | --- |
| 1000 Hz | `00` | 02/03 baseline, 05 reverse, 06 final restoration |
| 500 Hz | `01` | 04 forward and starting configuration in 05 |
| 250 Hz | `03` | 06 second burst |
| 125 Hz | `07` | 06 third burst |

The four values fit `code = (1000 / rate_hz) - 1`, or an integer millisecond interval minus one. This formula is an inference supported by the four recorded choices, not evidence that other rates are supported. Future controls should allow only these four established values until other choices have evidence.

## Limits and handoff

32,049 records have captured lengths smaller than original lengths. Comparisons use the raw eight-byte setup slots of separate VirtualBox control-phase records, not reconstructed missing `usb.capdata`. Actual physical report frequency has not been measured. Block/offset coordinates do not establish physical storage addresses, and no safe standalone Linux write sequence is established by this byte table alone. No device write or command replay was performed during analysis.

`polling-rate-mapping.json` retains the completed mapping and provenance. Polling-rate capture collection is complete for the four visible UI choices. The next small experiment should change only one DPI stage through a few known visible values and restore the original, in a single named recording. Keep polling fixed at the restored 1000 Hz and all other controls unchanged.
