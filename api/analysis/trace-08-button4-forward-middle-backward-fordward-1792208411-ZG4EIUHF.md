# 08 Button 4 assignment sweep — first assignment corrected to Left Click

Source: `../captures/vm-052785d3b59d/trace-08-button4-forward-middle-backward-fordward-1792208411-ZG4EIUHF.pcapng`  
SHA-256: `d22ea70f5ad0b9a70bff99ead5448062c2e570df2c876e6f67ce93acca482fd8`

## Operator correction

The operator clarified that the first assignment for button 4 was **Left Click**, not the planned Middle Click. The original recording name still mentions Middle; its name, metadata, and capture bytes are preserved. The remaining labels follow the guided Backward and Forward restoration steps. The preceding screenshot shows Game I highlighted and button 4 assigned to Forward.

## Analysis window

The complete file has 64,209 records over 40.671789 seconds (6,581,376 bytes). Filtering `frame.time_relative >= 5` retains 61,908, excludes 2,301, and begins at frame 2302. A fresh sharkd decoder with pagination verified both partitions sum to the full count. Startup is handled separately.

## Captured changes

Each phase has 867 comparable outgoing command-18 candidate records. The changed field is logical coordinate `0048`, represented by `07 18 03 00 48 00 VALUE 07`.

| Phase | Feature window (seconds) | Field value | Evidence frame |
| --- | --- | --- | --- |
| Startup: Forward | 6.218569–9.518285 | `25` | 4468 |
| First Apply: Left Click (operator correction) | 18.330642–21.517903 | `21` | 21410 |
| Second Apply: Backward (guided sequence) | 25.991013–29.127958 | `24` | 36446 |
| Restore Apply: Forward (guided sequence) | 33.063622–36.252973 | `25` | 50586 |

The first and second Apply phases each differ from recording 07 final Apply at only candidate report 84 (one-based): `25→21` and `25→24`. The final phase matches **all 867** candidate byte strings from that reference. Startup differs only at the known startup-versus-Apply field `006F` (`00` versus `04`).

The captured sequence correlates Left Click with `21`, Backward with `24`, and Forward with `25` for this observed slot. UI label attribution comes from the screenshot and operator actions, not the byte values alone. Do not derive GUI button numbering from sequential slot offsets. Middle Click was not tested here.

## Other state and limits

The first-stage DPI packed byte stays `E4` (4000), enable mask stays `3D` (stage 2 disabled), and polling code stays `00` (1000 Hz UI setting). No extra configuration change is needed to explain the three Apply phases.

37,298 records have captured lengths below original lengths. Comparison uses candidate data-stage bytes in VirtualBox control-phase setup slots; missing bytes are not reconstructed. This confirms a packet pattern for the observed slot, not physical button behavior, every action/profile, physical memory addresses, or a safe standalone Linux write sequence. No hardware commands were replayed.

## Next

This corrected representative button sweep is usable; no repeat is required for the accidental first selection. Inspect an LED-tab screenshot before selecting a small lighting experiment.

