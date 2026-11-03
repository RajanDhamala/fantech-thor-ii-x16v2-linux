# 05 Polling 500 to 1000 — reverse configuration check

Source: `../captures/vm-052785d3b59d/trace-05-polling-500-to-1000-1792207040-6LHSSJUX.pcapng`  
SHA-256: `b1b9231f3b90f7320844a920dce61d5b3d6925597ffaac9a532d3d0619666af4`

## Action and analysis scope

The user reported completion of the guided polling-rate restoration from 500 to 1000 Hz with one Apply. Original notes say Dpi change from 500 to 1k; the guided action concerns polling rate, and the source notes remain unchanged.

The file contains 28,809 USB records over 21.054307 seconds, 2,948,336 bytes. The requested `frame.time_relative >= 5` window retains 28,676 records and excludes 133. A fresh sharkd process confirms both partitions sum to the whole-file total.

## Startup separated from Apply

The first feature-request burst is at 6.458449–9.852196 seconds; the later one at 14.714402–18.102584 seconds. Each has 867 comparable eight-byte report-07/command-18 candidate data-stage records.

The first burst retains the 500 Hz candidate value `01`; compared with the 500 Hz Apply sequence, only the known startup-versus-Apply field at candidate record 131 differs (`04` during Apply versus `00` during startup). This first burst is not treated as the rate-changing action. Seeing a prior value in startup does not establish where it was stored or independently measure hardware rate.

## Reverse byte change

| Candidate position | Prior 500 Hz Apply (04) | Restored 1000 Hz Apply (05) | Frame in 05 |
| --- | --- | --- | --- |
| 30 | `07 18 03 06 18 00 01 07` | `07 18 03 06 18 00 00 07` | 16360 |

The second burst matches **all 867 candidate byte strings** in the earlier 1000 Hz Apply sequence from 02/03. Compared with 500 Hz in 04, 866 records match and only the above byte changes.

Together, 04 and 05 support the UI/configuration mapping at command-18 block coordinate `0x0018`, offset `0x06`: **1000 Hz → `00`; 500 Hz → `01`**. This is controlled forward-and-reverse capture evidence for this mouse/application, not a measured physical polling frequency or a proven physical memory address. Do not infer 250/125 Hz codes without captures.

## Limits

16,998 records have captured lengths below original lengths. Candidate comparisons use raw setup-slot bytes in separate VirtualBox control-phase records; they do not reconstruct missing payloads. Exact click timestamps were not logged. Existing capinfos and the read-only full-file block parser confirm file size, count, duration, and SHA-256. No Windows application was launched, device command replayed, or Linux write attempted by this analysis.

## Next experiment

Record `06 Polling 1000 to 250`: start recording, reopen Fantech, verify 1000 Hz selected, wait five seconds, select only 250 Hz and Apply once, wait five seconds, then stop. Keep profile, DPI, and all other controls unchanged. Use a two-minute duration. Subsequent 125 Hz and restore captures can complete the rate-code table before DPI experiments.
