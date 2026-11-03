# 10 Light On brightness sweep — off remains unconfirmed

Source: `../captures/vm-052785d3b59d/trace-10-led-brightness-on-off-1792209568-IRWKJBIU.pcapng`  
SHA-256: `b090a0caf0f0c57dbaf5cc2ca03105e83245f2fdabeaab7a0d08d2c2344efaef`

## Operator correction and capture

The guided sequence was Light On with maximum brightness, lowest reachable brightness, then middle brightness, applying at each step. The operator reports being unable to move the slider to its absolute start/minimum. The preceding screenshot shows Light On with only a brightness slider. Physical light output at the lowest reachable setting remains unconfirmed. Do not infer an off test from the recording name.

The file contains 62,369 records over 69.069326 seconds (6,390,016 bytes). The requested five-second exclusion retains 60,776, excludes 1,593, and starts at frame 1594. A fresh, paginated sharkd decoder verified that both partitions sum to the complete capture. Originals are unchanged.

## Captured values

Each of four phases has 867 comparable command-18 candidate records. Startup is separated from the three Apply sequences.

| Phase | Feature window (seconds) | Mode/timing field 001C | Brightness field 003F | Raw brightness | Brightness frame |
| --- | --- | --- | --- | --- | --- |
| Startup (previous persisted state) | 9.497355–12.812098 | `90` | `50` | 5 | 6773 |
| Apply 1 (guided maximum) | 28.834590–32.156518 | `A0` | `00` | 0 | 22237 |
| Apply 2 (guided lowest reachable; absolute minimum not reached) | 46.260546–49.359615 | `A0` | `60` | 6 | 36609 |
| Apply 3 (guided middle) | 51.400856–54.562242 | `A0` | `40` | 4 | 49717 |

The brightness report template is `07 18 03 07 38 00 VALUE 07`: block coordinate `0038` plus offset `07`, logical coordinate `003F`. Retained static Apply code identifies raw brightness as `(VALUE >> 4) & 7`.

Startup matches recording 09 final Apply except the known startup-versus-Apply field `006F`. The first Apply changes mode/timing `001C: 90→A0` and brightness `003F: 50→00`; all other candidate bytes match the reference. The next two Apply actions each change **only one of 867 records**, the brightness value `00→60→40`; the other 866 records are identical. Mode/timing stays `A0`, with packed mode bits 2, across all three.

The captured raw sequence is **0 → 6 → 4**. Given the requested maximum → lowest reachable → middle order, this suggests an inverse slider encoding: larger observed raw code corresponds to a lower requested brightness. It does not establish exact percentages or measured luminance. In particular, **raw code 0 must not be called off** based on its numeric value. Code 7 was not observed here and remains uninterpreted.

## Result and remaining scope

This is useful brightness evidence; the inaccessible slider endpoint does not invalidate the recording. It does **not** prove that the lights can be turned fully off. Final state is the Light On candidate mode with raw brightness code 4, not restoration of recording 09. Color selection remains unverified. Confirm whether the physical lights glowed at the lowest setting before choosing any further test. No full RGB or direction sweep is needed.

36,378 records are shortened. Comparisons use observed candidate data-stage bytes in VirtualBox control-phase setup slots and reconstruct no missing bytes. These logical coordinates are not verified physical memory addresses. No device writes or batch replay were performed by the analyst; safe standalone Linux behavior remains unverified.


## Existing Linux off support

The operator reports that the earlier cloned Linux configuration can turn the lights off and considers that sufficient. Read-only inspection confirms an explicit Off branch in `FantechX9ThorDriver/x16_backend.py` (exact source path and SHA-256 are in the JSON report). Its behavior was not rerun here. Reuse that existing path rather than collecting another Windows off test. Recording 10 still does not establish an off value for its command-18 brightness field; do not merge that field with the separate live command-13/14 path.
