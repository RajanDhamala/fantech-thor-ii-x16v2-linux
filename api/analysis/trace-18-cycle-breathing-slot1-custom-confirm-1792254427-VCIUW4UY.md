# 18 Slot-1 custom color: complete black Apply confirmed

Source: `../captures/vm-052785d3b59d/trace-18-cycle-breathing-slot1-custom-confirm-1792254427-VCIUW4UY.pcapng`  
SHA-256: `df2c0effe241b9bafb941713b230e4f7b811134fb80729a2f5fad42786fc488b`

Picker screenshot: `../assets/screenshot-1792254476989891737.png`. It visibly
shows Red **0**, Green **0**, Blue **0**, luminosity **0**, hue 178 and saturation
31. The preview is black. A crosshair in the colored area does not create a
visible color at zero luminosity; users can raise the vertical luminance slider
or enter RGB values directly. The dialog remains open in the screenshot, before
the final captured Apply.

| Phase | Window (seconds) | `0020` / `0021` / `0022` | User RGB nibbles | Complete |
| --- | --- | --- | --- | --- |
| Startup | 12.881024–16.912434 | `b0 7f 3f` | 11 / 7 / 3 | Yes |
| First Apply | 27.053215–30.891400 | `f0 ff 0f` | 15 / 15 / 0 | Yes |
| Final Apply, screenshot black | 53.646943–57.430067 | `f0 ff ff` | 15 / 15 / 15 | Yes |

All three bursts have 867 comparable command-18 candidates and the fixed final
Apply pair. Finalization is present at frames **37130** and **37139**. The first
Apply changes only the three palette channel bytes plus the known `006f`
startup/Apply marker. The final Apply changes only the blue-channel high nibble
at `0022`, frame **28130**, from `0` to `f`; red and green already have high
nibble `f`. The lower DPI-palette nibbles stay **0/f/f** in every phase.
Cycle mode/speed stays `95` throughout, rather than the earlier capture's `90`.

This supplies an exact selected-RGB endpoint: screenshot RGB **0/0/0** correlates
with user palette nibbles **15/15/15** in a complete later Apply. The startup
nibbles 11/7/3 are consistent with the earlier suggested RGB 64/128/192 under
the candidate quantization formula, but exact startup picker values were not
photographed or confirmed. Do not label that consistency as a second exact RGB
measurement. Intermediate rounding boundaries, physical precision and every
8-bit input remain unverified.

The recording-17 completion gap is resolved by this new complete custom-color
example. Its old capture remains historically incomplete. No repeat of 18 is
needed. Other GUI color slots remain uncorrelated individually; the next short
recording changes and restores slots 2 and 3 with exact noted RGB values.

## Verification and boundaries

The file contains 37,147 records over 59.344005 seconds, including 22,467 shortened
records. The local parser checks PCAPNG block lengths and USB headers. A fresh
`/usr/bin/sharkd` independently confirms the packet count, five-second exclusion,
and exact bytes for 15 palette/finalizer records. Exclusion counts and screenshot
digest are retained in the JSON report. Original capture and screenshot are
unchanged; missing bytes are not reconstructed. These are local-parser/sharkd
and retained-static observations, not new REA Evidence.

A complete vendor transaction is not an independent measurement of physical
color, brightness, cycling or persistence. No new device configuration commands
were sent and no Resa application code was changed during this analysis.
