# Fantech Thor II X16v2: recovered HID protocol

These are historical recovery notes, including superseded implementation limits.
For current native reads, Apply, recovery and supported controls, use the
[app README](README.md) and [compact evidence summaries](evidence/README.md).
Referenced raw recordings, disassembly and decompilations are private local
research artifacts and are excluded from the public checkout.

Update 2026-10-17: Windows USB captures 01–10 are now analyzed in the sibling
`api/analysis` folder. Experimental Resa settings controls use bounded fields
corroborated by those recordings; see `evidence/capture-support.json` and README.
Earlier statements below about missing captures describe the historical static
analysis stage. Physical-device validation of the new Resa implementation remains
pending; captures do not establish arbitrary memory or full-profile replay safety.


Scope: application SHA-256
`0c57c57868ab44cdf1c65411a66abce78bec879482dc427ddde991eac5c39b19`,
extracted from the supplied installer. Static interpretations below have not been
validated with Windows USB captures or configuration tests on hardware.
Artifact hashes and field mappings are retained in the compact evidence summaries;
[ANALYSIS.md](ANALYSIS.md) contains the historical written investigation.

## Device and transport

| Field | Evidence |
| --- | --- |
| USB VID/PID | `30fa:1440`: application instructions and current Linux sysfs agree |
| Manufacturer/product | Current sysfs: `FANTECH` / `FANTECH-X16v2` |
| Configuration USB interface | Current descriptor on interface `01` |
| Configuration collection | Usage page `ff01`, usage `01` |
| Report | Feature, ID `07`, seven payload bytes, eight bytes including ID |
| Windows send/receive | `HidD_SetFeature` / `HidD_GetFeature` |
| Linux transport | Experimental lighting only: `HIDIOCSFEATURE(8)` via hidraw; no `HIDIOCGFEATURE` implemented |

The exact cached configuration-collection descriptor is:

```text
06 01 ff 09 01 a1 01 85 07 15 00 26 ff 00 09 20 95 07 75 08 b1 02 c0
```

Report size and identity are observed; accepted command semantics are not yet
observed. Windows feature buffers include the report ID in byte zero, as documented
by [Microsoft](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/hidsdi/nf-hidsdi-hidd_setfeature).
Linux feature ioctls use the control endpoint and likewise require the report ID
prefix; ordinary hidraw `write()` is not a substitute for feature transmission.
See the [Linux hidraw API](https://docs.kernel.org/hid/hidraw.html).
`resa list` sends no USB request. The separate, explicitly enabled experimental
lighting path below sends one feature report; it implements no memory read.

## Memory command family `18`

Confirmed byte construction at `0x413850..0x413937` (`evidence/memory.asm`):

```text
byte 0  07               report ID
byte 1  18               command family
byte 2  OP               bit-packed operation/flags
byte 3  OFFSET           byte index relative to base
byte 4  ADDRESS_LO       base address, low byte
byte 5  ADDRESS_HI       base address, high byte
byte 6  VALUE            byte to stage, or zero in read/commit/exit calls
byte 7  LAST_OFFSET      transfer length minus one
```

The builder takes ten explicit stack arguments. Its operation is the low byte of
`(p1<<5)+(p2<<4)+(p3<<2)+(p4<<3)+(p5<<1)+p6`; it copies address `p7`,
offset `p8`, last offset `p9`, and value `p10`. These are recovered calling
relationships, not original parameter names. The confirmed helper call sites
produce these operations:

| OP | Static role | Evidence |
| --- | --- | --- |
| `03` | Stage a byte | writer `0x41398b`, preparation `0x413b03` |
| `05` | Request byte, followed by GetFeature | reader `0x413a43`, `0x413a64` |
| `09` | Commit staged block | writer `0x4139b8` |
| `00` | Exit/end operation | `0x4139de`, `0x413aa6`, `0x413b33` |

“Stage”, “commit”, and “exit” describe the inferred transaction structure. Actual
controller memory technology, page boundaries, atomicity, persistence, error
behavior and wear characteristics remain unknown. Do not treat every address
accepted by the 16-bit builder as safe configuration storage.

### Vendor write helper

`0x413940(base, data, n)` produces:

1. For each `i=0..n-1`, send `07 18 03 i LO HI data[i] (n-1)`.
2. After staging the entire block, call Sleep(4 ms).
3. Send `07 18 09 00 LO HI 00 (n-1)`.
4. Sleep(2 ms).
5. Send `07 18 00 00 LO HI 00 00`.

There is no 4 ms sleep between individual stage packets in this helper. Windows
scheduling makes these requested sleeps different from measured bus timing.
The apply routine commonly uses eight-byte blocks. It also writes larger and
unrelated configuration regions, so replaying its entire transaction is unsafe
as a narrowly scoped DPI/RGB implementation.

### Vendor read helper

`0x4139f0(base, out, n)` first calls `0x413ac0(base,n)`. That preparation sends
`OP=03` zero-valued stage packets for every offset, sleeping 2 ms after each,
then sleeps another 2 ms and sends an exit packet. **It does not send `09`.**
The reason for this preparation and whether staging has side effects are unknown.

The subsequent read loop sends `07 18 05 i LO HI 00 (n-1)`, waits 2 ms, calls
GetFeature on the shared buffer, and copies returned **byte 1** into `out[i]`.
After the loop it waits 2 ms and sends an all-zero-parameter `18` exit report
(base zero). A full response layout/acknowledgement grammar was not recovered.
The buffer length is obtained from HID capabilities.

Direct Ghidra decompilation now corroborates this builder, writer, preparation,
and reader in `evidence/ghidra-first-pass/00413850.c`, `00413940.c`, `00413ac0.c`,
and `004139f0.c`. Those routines ignore the HID API return values; the reader
copies byte 1 even when success was not checked. A Linux implementation must
check transport results rather than copying this behavior. Device-level response
validation still requires captures; no success/acknowledgement grammar is proved.

This “read” is not passive discovery: it transmits feature reports including
zero-staging. It is intentionally absent from the Go CLI until reviewed and
approved for hardware testing.

## DPI codes and packed fields

Observed table: VA `0x663060`, file offset `0x260e60`:

```text
01 02 03 04 05 06 07 08 09 0a 0c 0d 0e 0f 10 11 12 13 14 15 16 17 18
```

`evidence/dpi-index.asm` shows six indexes translated with this table.
`evidence/dpi-labels.asm` establishes the UI display conversion:

| UI index | Code hex | Displayed DPI |
| ---: | ---: | ---: |
| 0 | 01 | 200 |
| 1 | 02 | 400 |
| 2 | 03 | 600 |
| 3 | 04 | 800 |
| 4 | 05 | 1000 |
| 5 | 06 | 1200 |
| 6 | 07 | 1400 |
| 7 | 08 | 1600 |
| 8 | 09 | 1800 |
| 9 | 0a | 2000 |
| 10 | 0c | 2400 |
| 11 | 0d | 3200 |
| 12 | 0e | 4000 |
| 13 | 0f | 4800 |
| 14 | 10 | 5600 |
| 15 | 11 | 6400 |
| 16 | 12 | 7200 |
| 17 | 13 | 8000 |
| 18 | 14 | 8800 |
| 19 | 15 | 9600 |
| 20 | 16 | 10400 |
| 21 | 17 | 11200 |
| 22 | 18 | 12800 |

Code `0b` is absent. These are UI labels, not measured resolution.

Derived memory fields, evidence `0x41b529..0x41bc22`:

| Address hex | Field |
| --- | --- |
| `0013` | Bits 0–5 hold bit 4 of stage codes 0–5, respectively |
| `0015` | Stage 0 low nibble in high nibble; stage 1 low nibble in low nibble |
| `0016` | Stage 2 high nibble; stage 3 low nibble |
| `0017` | Stage 4 high nibble; stage 5 low nibble |
| `0018` | Selected stage in bits 0–2; vendor constructs `18 + (stage & 7)` |
| `0019` | Bits 0–5 are enables for stages 0–5 |

The cursor advances to `0008` at `0x41af00`, `0010` at `0x41b430`, and `0018`
at `0x41b804`. Packing at `0x41b5c1` supplies offset 3; low-nibble pairs are
stored at offsets 5, 6, 7. Block calls occur at `0x41b695` and `0x41bc22`.
Other bytes in these blocks contain other settings. Bits not described above
must remain unowned; firmware semantics cannot be inferred from a full-block
vendor overwrite.

Packaged `[ShareData]` indexes `1,3,5,13,16,22` translate to codes
`02 04 06 0f 12 18`; their derived packing is `30` at `0013`,
`24 6f 28` at `0015..0017`, selected byte `18`, enable mask `3f`.
These are default-file calculations, not observed on-device bytes.

Illustrative packet derived from the builder: staging value `30` at base `0010`,
offset 3 of an eight-byte block is `07 18 03 03 10 00 30 07`.
This documents byte order only; it is not an approved command or a safe standalone
DPI change. No checksum is computed in this builder; device-side validation is unknown.

## Lighting builders `13` and `14`

Evidence: `evidence/lighting.asm`. These are exact symbolic constructions;
user-facing names for every parameter have not been verified.
Direct Ghidra output in `evidence/ghidra-first-pass/00429dc0.c` and `00429ee0.c`
agrees with the byte assignments below. Its inferred lighting signatures are
imperfect, so the stack-argument numbering remains based on the disassembly.

At `0x429dc0`, let `p1..p11` denote the eleven explicit stack arguments;
`Gaddr` denotes the dword stored at that application VA. Each expression is
truncated to one byte when stored. The division/shift formula below assumes
nonnegative UI values (the compiler implements signed division toward zero):

```text
b0 = 07
b1 = 13
b2 = (G663058 << 7) + p1
b3 = (p2 << 7) + (p3 << 4) + (p10 << 3) + (p4 & 7)
b4 = (G669d64 << 7) + (G669d68 << 6) + ((G669d6c << 4) & 30h) + p8
b5 = G669d70 & 7
b6 = (p11 >> 8) & 3
b7 = p11 & ffh
```

Arguments 5, 6, 7 and 9 are not used by this function. Its direct callers show
this builder is referenced by code, not that any specific mode succeeds on the
mouse. The 10-bit split argument is confirmed; calling it brightness, duration,
or a color without caller/capture evidence would be a guess.

The INI saver and caller trace now give these software meanings:

| Source/field | Recovered meaning |
| --- | --- |
| `G663058`, byte 2 high contribution | `LED_USER_COLER_EN` (spelling preserved) |
| Caller `p1`, byte 2 low contribution | `CYC_7COL_EN` in `0x4448a0` |
| Caller `p3`, byte 3 shifted four | `LED_TYPE` in that caller |
| Caller `p4 & 7`, byte 3 low bits | `LED_CYC_TIME` / `LED_CYCTIME`, same stored byte |
| `G669d64`, `G669d68`, `G669d6c`, byte 4 | `LED_FEATURE_SCOLOR`, `LED_FEATURE_SYMMETRY`, `LED_FEATURE_DIREC` |
| `G669d70 & 7`, byte 5 | `LED_BRIGHT` |

`0x4448a0` passes `(CYC_7COL_EN,1,LED_TYPE,LED_CYC_TIME,1,1,
LED_FEATURE_DIREC,0b,LED_BRIGHT,0,4002h)`, so this caller produces `00 02`
in the last two bytes. Their physical meaning is still unknown. This is an
assembly-backed stack argument list; the incomplete decompiler prototypes
must not renumber it. The type-to-effect-name table, timing units, and mapping
from the Linux UI's percentage controls remain unverified.

### Implemented experimental lighting subset

Following the user's request to try customization before Windows captures, the
CLI/desktop expose only raw brightness and timing values 0..7. The packaged
`[ShareData]` defaults (`extracted/payload/config.ini:524–526,550–556`) select
`LED_TYPE=7`, `CYC_7COL_EN=127`, `LED_USER_COLER_EN=1`, and zero feature flags.
Combining these defaults with the caller arguments above yields:

```text
07 13 ff (f0 | timing) 0b brightness 00 02
example: brightness=4, timing=3 -> 07 13 ff f3 0b 04 00 02
```

This is confirmed **byte construction**, not confirmed standalone device behavior.
Mode 7 has no proven named-effect mapping. Brightness scale, timing units/direction,
physical side effects, acknowledgements, and persistence have not been measured.
The experiment selects this fixed vendor mode and does not read/preserve/back up
current lighting. The Linux percentage/effect/color preview controls are separate.

Sequencing caveat: `evidence/ghidra-caller-pass/004448a0.c:26–33` first calls
`0x4139f0(base=18h,n=8)`, then `0x42a380(stage&7)` (another `07 14` send), then
the `13` builder. The `13` builder overwrites all eight bytes itself, so it has
no inherited packet-tail dependency (`evidence/lighting.asm:14–82`). This does
**not** prove the preceding operations are unnecessary to firmware. They are not
replayed because their broader state/side effects remain unresolved. A single
`13` transfer might have no visible effect; do not respond by adding speculative
memory, commit, palette, or retry sequences.

`internal/lighting` pins the complete interface-01 descriptor SHA-256
`0ec3eb2dc293bd8edcb490f5cee9ab272ebec8f4e0edc5f9f365f1bab53b2018`, product,
bus, VID/PID, and exactly one candidate. `internal/hidraw` rechecks kernel-cached
identity/descriptor on the open fd and independently allowlists the report bytes.
Only an explicit desktop Apply or CLI `--apply --experimental` sends. Dry runs
do not open devices. Kernel acceptance of eight bytes produces `sent-unverified`;
no firmware acknowledgement or persistence readback is claimed. Errors and short
returns are not retried. Hardware transfer has not been exercised in this session.

At `0x429ee0(index, flag)`, define three dwords `C0,C1,C2` at
`0x669ed0 + 12*index`, `+4`, `+8`:

```text
b0 = 07
b1 = 14
b2 = ((index << 5) & e0h) + (flag << 4) + C1
b3 = (C0 << 4) + C2
b4..b7 = existing shared-buffer contents, not assigned by this function
```

The INI saver confirms `C0=R`, `C1=G`, `C2=B` for seven stored user colors.
Thus byte 2's low nibble is green, and byte 3 is red-high/blue-low, assuming
valid 0..15 components. Seven stored entries do not establish seven accepted
hardware palette slots. The flag meaning, whether firmware ignores trailing bytes,
and runtime reachability of this builder still need verification. A linear
direct-call search found no caller of `0x429ee0`; indirect references were not
exhaustively resolved without Ghidra. Do not manufacture an all-zero tail or
claim every candidate packet is used. A separate `14` builder also exists near
`0x42a39e`, and `0a`, `11`, `12`, `10` builders exist elsewhere; their complete
roles are outside the confirmed findings.

## Button remapping, macros, and profiles

The Apply trace now confirms the button serialization path. See
`evidence/ghidra-resource-pass/0042f590.c`,
`evidence/ghidra-caller-pass/00424080.c`, and
`evidence/ghidra-typed-pass/00419e20.c` (especially lines 500–850, 1180–1330).

For UI button index `j=0..6`, KEYMAP gives one-based slot `M[j]`:

```text
UI index j:       0  1  2  3  4  5  6
KEYMAP M[j]:      1  3  2  5  4  6  7
wire slot index:  0  2  1  4  3  5  6
```

For each software bank `g=0..3`, Apply translates the DWORD action setting at
`0x6698b8 + 0x30*g + 4*j` and assigns its byte to
`0x6ce984 + 14*g + M[j]-1`. Recovered primitive translations are:

| Stored integer (decimal) | Translated byte (hex) |
| --- | --- |
| `0..6` | Same value |
| `7..14`, `16..17` | Value minus 5 |
| `15` | `15h` |
| `18` | `14h`, with separate metadata also set |
| `19..22` | Value plus 4 |
| `30000`, `30001`, `30002`, `30003`, `30004` | `0ah`, `00h`, `10h`, `1bh`, `1ch`, respectively |
| `40000` | `16h` |

Other ranges enter macro/extended paths or additional flags; this table is not
a complete action dictionary. Human-facing action labels still require
correlation. In the enhanced branch (`byte G663077 != 0`), slot bytes also add
`LED_REACT_TYPE * 40h` and `LED_REACT_EN * 20h`, after those per-button values
are reordered through KEYMAP. For valid source ranges this places the reaction
type in bits 7–6, its enable in bit 5, and the action in bits 4–0. The assignment
chain is `0x669ca0 → 0x6ceb7b` (type) and `0x669be0 → 0x6cebac` (enable), with
bank/slot indexing; the first slot reads `0x6ceb7c` and `0x6cebb0`.
These are named software fields, not captured physical lighting behavior.
G663077 is initially 1 in this artifact, but
that initial byte is not a runtime observation of the selected branch.

The enhanced branch serializes button bytes at these **static memory offsets**:

| Software bank | One-based slots | Destination |
| --- | --- | --- |
| 0 | 1–8; 9; 10–12 | `0008..000f`; `0010`; `003b..003d` |
| 1 | 1–4; 5–12 | `0044..0047`; `0048..004f` |
| 2 | 1–8; 9–12 | `0050..0057`; `0058..005b` |
| 3 | 1–8; 9–12 | `0060..0067`; `0068..006b` |

They are mixed into larger blocks containing unrelated settings. Default Config0
values translate/reorder to `01 02 03 04 05 06 15` for slots 1–7 before metadata.
That is a packaged-default calculation, not a device read or approved write.
Config0 enables reaction lighting on the active seven buttons with type zero;
including those defaults gives `21 22 23 24 25 26 35` for these slots in the
enhanced branch. The eighth byte is not established by the seven-button default
tuple, so this is not a complete eight-byte block to transmit.
Slots beyond the seven advertised buttons and firmware bank activation remain
unverified. Four serialized software banks do not by themselves prove four
independent persistent onboard profiles.

Macro files use three decimal digits per byte, confirmed by formatter
`0x43e860` and parser `0x43e950`. The first 60 decoded bytes produce zero-padded
UTF-16LE names in the inspected records. `evidence/macro-records.json` retains
32 decoded-prefix summaries and original-file coordinates. `DAT_VER` changes
the reader's layout; it rebuilds separate arrays inside stride-`0xb92` records
and converts some key fields through `0x428220`. This is file serialization,
not a direct byte image suitable for device upload.

Apply allocates candidate macro storage beginning at `0400h`, writes a
70×8-byte table beginning at `00a0h`, records a pointer at `006eh`, and rejects
some pointer growth above `0f1fh`. These are software-side allocation/write
patterns in the enhanced branch, not measured hardware capacity. Event types,
delay units, full record grammar, loops/cancellation and execution location are
not verified. There is no implemented onboard macro upload command.

`DPI_SPEED` and `WHEEL_SPEED` also feed Windows `SystemParametersInfoW` pointer
speed and scroll-line operations. Those calls are host settings, not vendor USB
commands; see ANALYSIS.md for the API reference and exact globals.

Four named software configurations in the INI do not establish four onboard
profiles. Profile selection may simply reapply one configuration image. Onboard
banking, power-cycle persistence and activation semantics require evidence.

## Required Windows capture set

No capture is included, and none of these actions was performed by this agent.
An actual Windows PC or a Windows VM with the **physical USB mouse passed
through** can supply the next captures. Generic VM cursor sharing exposes a
virtual pointing device, which is insufficient for the vendor HID interface.
Confirm Windows sees VID/PID `30fa:1440` and the vendor application detects it
before capturing. Record that a VM was used; virtualization can affect timing
and resets. [Oracle's USB documentation](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/working-with-vms.html)
describes direct device attachment and filters. A VM is a proposed user-run
capture environment; this agent has not installed or launched one.
Use an existing Windows USBPcap/Wireshark installation if available; installing
capture tools is a separate approval decision. Capture on the controller that
contains the mouse. Save raw full-length `.pcapng`/`.pcap`, not only screenshots
or exported hex lines. Retain submission and completion records, status codes,
timestamps, descriptors, control setup packets and complete data payloads.

Use one capture per numbered scenario and provide a sidecar with Windows/app
version, mouse VID/PID, descriptor dump, initial settings, action timestamps,
and the single value changed. Save exported/INI configs before/after where possible.
Keep the capture focused on the mouse to avoid collecting other keyboard traffic.
Do not invoke firmware update, factory reset, bootloader, or arbitrary memory tools.

| Capture | Exact actions and question resolved |
| --- | --- |
| `01-enumeration-idle` | Start before plugging in; plug mouse, wait 5 s, launch utility, wait 5 s without clicking Apply, close. Establish descriptors, selected interface, startup reads/writes and unsolicited traffic. |
| `02-noop-apply` | Open with unchanged settings; wait 2 s, click Apply once, wait 5 s, close. Establish full transaction framing and distinguish no-op rewrites from true deltas. |
| `03-dpi-low-nibble` | Record all six initial values. Change only stage 0 from 400 to 800, Apply, wait 3 s; change back and Apply. If baseline differs, record an equivalent single-stage transition explicitly. Confirm packed nibble and neighbor preservation. |
| `04-dpi-high-bit` | With other values fixed, change a single stage 4800→5600, Apply; then restore. This crosses code `0f→10` and separates high-bit mask from nibble packing. |
| `05-dpi-stage-mask` | Select stage 1 then stage 0, recording whether selection needs Apply. In separate marked intervals disable/re-enable one non-current stage and Apply. Resolve selected-stage and enable-mask writes. |
| `06-lighting` | In separate marked intervals choose static/off/breathing; change only one color component at a time (R only, G only, B only), then brightness, then speed. Record exact UI values and Apply behavior for each interval. Resolve `13` flags, `14` reachability, color order, trailing bytes and persistence writes. |
| `07-one-button` | Use a side button so primary click remains available. Remap only that button from its current action to another ordinary mouse action, Apply, press once, then restore and Apply. Separately map a benign keyboard key. Resolve slot order, action bytes, modifiers and optional records. |
| `08-one-macro` | In a harmless text field, create one macro: A down, 100 ms delay, A up; assign to a side button and single-shot mode. Apply, press once, close utility, press once again, then restore original assignment. Record whether events continue with app closed. Distinguish host/onboard behavior and event/delay encoding. If available, separately test 200 ms delay and loop count 2 with clear stop behavior. |
| `09-profiles-persistence` | Use two software profiles differing in exactly one harmless setting. Switch profiles, mark selection versus Apply, then close/reopen utility. Separately power-replug the mouse while utility is closed and record the resulting setting. Resolve reapplication versus onboard banks and persistence. |

For each modifying scenario, include an independent baseline and restoration;
avoid combining macro, DPI, profile and lighting changes into a single Apply.
Record whether changing the UI sends a packet immediately before Apply.

Expected USB HID control requests, **inferred from the API, not observed here**:
feature SET_REPORT uses request type `21h`, request `09h`, `wValue=0307h`;
feature GET_REPORT uses `a1h`, request `01h`, `wValue=0307h`. Confirm `wIndex`
against the captured interface (candidate 1) and actual length/report-ID presence
rather than filtering assumptions into the capture. Preserve other report IDs,
vendor requests, interrupt traffic and failures until their role is known.

The minimum first handoff is captures 01–04 and 06 with raw descriptors and exact
UI state. Captures 07–09 are required before claiming Linux parity for buttons,
onboard macros or profiles. Static verification plus captured vendor exchanges
still requires explicit approval before the Linux CLI transmits configuration.
