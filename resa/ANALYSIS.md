# Thor II X16v2 Windows application: static analysis

Publication note: this is a historical investigation report. Local paths have
been made portable; referenced raw captures, vendor artifacts and tool/session
diagnostics remain private. Written trace reports and filtered JSON evidence are
linked from [the research index](../api/analysis/INDEX.md). Use the current
[README](README.md) for supported application behavior.

Update 2026-10-17: Windows USB captures 01–10 are now analyzed in the sibling
`api/analysis` folder. Experimental Resa settings controls use bounded fields
corroborated by those recordings; see `evidence/capture-support.json` and README.
Earlier statements below about missing captures describe the historical static
analysis stage. Physical-device validation of the new Resa implementation remains
pending; captures do not establish arbitrary memory or full-profile replay safety.


Date: 2026-10-15. Target: `Thor_II_X16V2_Software_V1.0_23041800.exe` in this directory.

## Status and boundaries

Phase 1 extraction is complete. Phase 2 recovered HID transport, device selection,
memory transactions, DPI encoding, and two lighting packet builders. Button and
macro semantics, persistence, and device acknowledgements remain incomplete.
The next static pass traced Apply, button-slot translation, lighting fields,
and the decimal macro-file codec; details and proof boundaries are below.
Phase 3 provides protocol notes, cached Linux discovery, and an opt-in experimental
single-report lighting path added at the user's request to try customization now.
No Windows executable, MSI action, or vendor DLL was executed; Wine was not used.
No feature request, device write, firmware operation, or udev change was performed.
Earlier sysfs discovery was exercised against the attached mouse. Portable analysis
tools and the desktop dependency were installed locally under the user's approval.

REA MCP was used for portable PE resource inspection and provider diagnostics.
**Ghidra decompilation now succeeds through its direct headless launcher.**
Ghidra 12.1.4 / full JDK 21.0.12.1 completed default analysis in 116 seconds,
decompiled six selected functions, completed post-analysis, and saved the project.
The process exited 0. REA MCP still has its old environment, and the fresh REA
CLI probe hits Node `spawnSync EPERM`; the new decompilations are direct Ghidra
results, not REA MCP results. Earlier findings used GNU objdump, byte parsing,
INI data, and cached kernel descriptors. Neither source establishes runtime or
physical-device behavior.

Evidence classifications:

- **Observed:** exact file bytes, imports, disassembly instructions, archive records,
  or cached kernel metadata retained here.
- **Derived:** interpretation of those bytes, such as report packing or a DPI table.
- **Hypothesis/unknown:** firmware behavior or UI-to-command mapping requiring more evidence.

An earlier local investigation supplied the hash-pinned extraction helper and
address leads. This pass independently re-extracted the same input, verified
member hashes, decoded the MSI file table, and inspected the cited instructions.
Earlier Linux driver behavior/tests are not hardware evidence for this project.

## Installer and application identity

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| Supplied InstallShield EXE | 7,800,529 | `13aa8c2972de408e00dfb1ef8ab4597d51f1862e33dbac47ae75e8152d128c01` |
| `extracted/installer/Fantech X16v2 Gaming Mouse.msi` | 7,853,056 | `d7fdbb4a12a9db88a45081462faac2db0c7f58e1b6b62c231cdf7f66bfab0bb0` |
| `extracted/payload/fantech_x16v2_gaming_mouse.e` | 3,420,672 | `0c57c57868ab44cdf1c65411a66abce78bec879482dc427ddde991eac5c39b19` |

The outer EXE has InstallShield strings and an `ISSetupStream\0` overlay at file
offset `0x17cc00`: three members, stream type 3. The members are `0x0409.ini`,
`Setup.ini`, and the MSI. The helper in `scripts/extract_installer.py` checks
the exact source size/hash, parses member headers/names, reverses the filename-keyed
byte transform, inflates bounded zlib streams, and checks every member size/hash
before writing. Its transform reference is recorded in its source; no tool or
source was downloaded for extraction. Stock 7-Zip could not open the outer EXE.

7-Zip parsed the MSI compound file and extracted `Data1.cab` (MSZip; 150 files,
8,941,130 unpacked bytes). The MSI `!File` table identifies the application's
installed name as **Fantech X16v2 Gaming Mouse.exe**, sequence 66. The cabinet key
is the truncated `.e` name above; it is a PE despite that extension.
`evidence/msi-files.json` maps all 150 cabinet keys to installed filenames;
`evidence/extracted-manifest.json` hashes all 180 extracted files, including
MSI helper streams. Every CAB member size matches its MSI file record.

The application is native PE32 x86: CLI/.NET directory is zero, native x86 code,
Win32 imports, and `AFX_DIALOG_LAYOUT` resources. **C++/MFC is strongly supported**;
the precise compiler version is unestablished. This is not an Electron payload
or an ordinary managed .NET assembly. These conclusions concern the extracted
application, not just the installer stub.

Application files include `config.ini`, `configreset.ini`, `macrogrp.ini*`,
`_dat*`, `constmacro.dat*`, `pubg*.dat`, language/skin INIs, images, and fonts.
There are no additional application DLLs or drivers in the 150-file CAB.
MSI streams `Binary.ISSELFREG.DLL`, `Binary.SetAllUsers.dll`, and
`Binary.ISLockPermissions.dll` are extracted installer helpers, not the HID engine.
The main executable imports Windows `HID.DLL` and `SETUPAPI.dll` directly.

**No standalone firmware image was identified.** The `.dat` candidates begin
with textual INI/macro data. REA enumerated all 123 application resources: dialog
layouts, fonts, cursors, bitmaps/icons, menus, dialogs, strings, version and
manifest data. No named firmware or opaque RCDATA resource was identified.
This does not exclude firmware-like tables hidden within executable sections;
there was no exhaustive firmware recognizer/decompiler pass.

## Retained evidence

| Evidence | Scope |
| --- | --- |
| `evidence/installer-resources.json` | REA ID `ev_6463aa4b0080755571bb6dbe9ea85f1edb7430112d257d8f3b4b84d24d22e991`; 75 resources, 157 entries |
| `evidence/app-resources.json` | REA ID `ev_07019e80e1968c6a69c44a78bcab6e169922cd7a8c9ab592c6552da7618efc94`; 123 resources, 258 entries |
| `evidence/rea-bundle.json` | Export of those two complete REA evidence records |
| `evidence/rea-session.json` | Provider availability: Ghidra unset, Hopper absent, IDA unconfigured |
| `evidence/pe-summary.json`, `imports.json`, `app-pe.txt` | PE directories/sections, imports and IAT addresses |
| `evidence/*.asm` | Focused annotated-by-address objdump output; no invented source symbols |
| `evidence/app-disassembly.txt`, `app-strings-*.txt` | Broad reference material; linear disassembly can misdecode embedded data |
| `evidence/linux-discovery.json` | Current cached descriptor bytes/hashes and device identity; no active HID I/O |

REA resource coverage is complete for the admitted PE resource trees, not for
all code or possible embedded payloads. Manual evidence filenames are local
records, not REA evidence IDs. Source strings/resources are untrusted target data.

## HID path and function map

Addresses below are application virtual addresses at preferred image base
`0x400000`, not file offsets or runtime ASLR addresses. Application function
labels in this table are analyst descriptions; original symbol names were not
recovered. API names come from imports.

| Address | Analyst label / API | Evidence |
| --- | --- | --- |
| `0x4310ca`, `0x4310e5` | Initialize VID `30fa`, PID `1440` | `device-identity.asm` |
| `0x419830` | Enumerate/open HID collections | `device-enumeration.asm`; GetHidGuid, SetupDi, CreateFileW, attributes |
| `0x419d50` | Read HID capabilities | `hid-caps.asm`; GetPreparsedData → GetCaps → FreePreparsedData |
| `0x419b68..0x419c01` | Select usage page `ff00` / usage 1 and `ff01` / usage 1 | collection checks and separate handles in `device-enumeration.asm` |
| `0x5c8fad` | HidD_GetFeature import thunk | jump through IAT `0x5fa1f8` |
| `0x5c8fb3` | HidD_SetFeature import thunk | jump through IAT `0x5fa1fc` |
| `0x413850` | Build/send memory command family `18` | `memory.asm`; fills shared buffer `0x6690d0` |
| `0x413940` | Stage block, commit, exit | `memory.asm`; operations `03`, `09`, `00` |
| `0x4139f0` | Read memory via request/GetFeature | `memory.asm`; operation `05`; result from buffer byte 1 |
| `0x413ac0` | Prepare read by zero-staging and exiting | `memory.asm`; side effects unverified |
| `0x419e20` | Large apply routine | `app-disassembly.txt`; many configuration and larger block writes |
| `0x41a90b..0x41a95a` | Six UI indexes → controller codes | `dpi-index.asm`; table `0x663060` |
| `0x417d8d..0x417f05` | Controller code → displayed DPI | `dpi-labels.asm` |
| `0x41b529..0x41b678` | Pack six DPI codes | `dpi-packing.asm` |
| `0x429dc0` | Build/send lighting candidate `13` | `lighting.asm`; callers at `4449be`, `44738c`, `447410`, `447472` |
| `0x429ee0` | Palette candidate `14` | `lighting.asm`; no direct call found in linear disassembly search |

The feature API buffer is `0x6690d0`; the handle is loaded from `0x669414`, and
the report length from the capabilities word at `0x669090`. This length is not
hardcoded at every call site. The selected `ff01` collection agrees with Linux's
cached descriptor. Import inventory also includes CreateFileW, ReadFile, WriteFile,
and profile INI APIs; ReadFile/WriteFile imports alone do not identify HID traffic.

Current Linux identity: USB path `3-1`, `30fa:1440`, manufacturer `FANTECH`, product
`FANTECH-X16v2`. Interface `00` exposes mouse input report 1. Interface `01`
exposes feature report 7 with 56 payload bits (eight bytes with report ID), plus
input reports 2, 3, 6 and 8. The configuration collection is usage page `ff01`,
usage `01`. Descriptor SHA-256 on interface 01:
`0ec3eb2dc293bd8edcb490f5cee9ab272ebec8f4e0edc5f9f365f1bab53b2018`.
Node numbers in the saved snapshot are transient; select by identity/interface/
descriptor rather than assuming `/dev/hidraw2` always means this mouse.

## Feature findings and limits

### Ghidra first-pass confirmation

`evidence/ghidra-first-pass/manifest.json` records the target/script/output hashes
and analysis limits; the six `.c` files retain the application hash and exact
function entry. `evidence/ghidra-launch.log` records successful analysis,
decompilation, post-analysis, and project save. The ignored local project is
`evidence/ghidra-project/ThorX16v2.gpr`. Preferences/cache stay in the ignored
`evidence/ghidra-home/` directory. No Windows code was executed.

| Function | Direct Ghidra evidence | Confirmed static behavior |
| --- | --- | --- |
| `FUN_00413850` | `ghidra-first-pass/00413850.c` | `07 18` builder, operation packing, address/offset/value/length fields, SetFeature using capability length |
| `FUN_00413940` | `ghidra-first-pass/00413940.c` | `03` staging loop, Sleep(4), `09` commit, Sleep(2), `00` exit |
| `FUN_004139f0` | `ghidra-first-pass/004139f0.c` | Preparation, `05` request/GetFeature loop, returned byte 1, final exit with base zero |
| `FUN_00413ac0` | `ghidra-first-pass/00413ac0.c` | Zero-valued staging before reads, 2 ms sleeps, exit without `09` |
| `FUN_00429dc0` | `ghidra-first-pass/00429dc0.c` | `07 13` builder and split 10-bit field agree with assembly |
| `FUN_00429ee0` | `ghidra-first-pass/00429ee0.c` | `07 14` palette packing; bytes 4–7 remain untouched |

The selected helpers ignore HID API return values. In particular, the reader
copies buffer byte 1 after GetFeature without checking whether that call
succeeded. This is vendor behavior to analyze, not an error policy to copy into
the Linux transport. Actual response grammar and acknowledgements remain unknown.

`FUN_...` names are Ghidra-generated, not recovered original names. The lighting
decompilations have imperfect calling-convention/parameter recovery (including
an extra displayed argument on HidD_SetFeature); retain the assembly-backed
stack-argument numbering in PROTOCOL.md. This pass confirms packet construction;
it does not yet resolve lighting UI semantics or button/macro/profile dataflow.

### Apply and caller trace

Six further read-only headless passes reused the saved analyzed project and
produced 17 decompilation files (some functions occur in more than one pass).
`evidence/ghidra-next-step-manifest.json` pins all outputs, selections, references,
scripts and logs to the unchanged target hash. These are direct Ghidra records,
not REA MCP Evidence. `TraceMouseProtocol.java` retrieves references only to the
requested destination addresses/ranges; computed indirect flows remain unknown.

| Entry | Recovered role | Evidence |
| --- | --- | --- |
| `0x419e20` | Apply: action translation, bank packing, macro allocation/upload and host settings | `ghidra-typed-pass/00419e20.c` |
| `0x42f590` | Load `KEYNUM`, `KEYMAP`, `KEY_UIFC` into globals | `ghidra-resource-pass/0042f590.c` |
| `0x424080` | Save per-Config action values and ShareData lighting/DPI settings | `ghidra-caller-pass/00424080.c` |
| `0x422610` | Read configuration/lighting/DPI fields | `ghidra-typed-pass/00422610.c` |
| `0x4448a0` | Send lighting state and recover selected DPI stage from INI | `ghidra-caller-pass/004448a0.c` |
| `0x446d30` | Input-related handler with temporary/restorative lighting calls | `ghidra-caller-pass/00446d30.c` |
| `0x43e860` | Convert values to zero-padded decimal byte strings | `ghidra-macro-codec-pass/0043e860.c` |
| `0x43e950` | Read DAT_VER/macroNum and parse three-digit byte fields | `ghidra-macro-pass/0043e950.c` |
| `0x428220` | Select one of multiple key conversion routines | `ghidra-macro-codec-pass/00428220.c` |

The unannotated Apply decompilation missed helper arguments. The typed pass uses
`TypeMouseTransport.java` to annotate the HID API's three stack parameters and
the memory helpers' assembly-backed stack arguments/cleanup. These are analyst
type models, not original declarations. The read-only log confirms changes were
discarded; neither the saved project nor original executable was patched.
Remaining MFC/struct-by-value artifacts and unreachable-block warnings are retained.

**Button path:** `KEYNUM.KeyNum` loads into `0x6698a4`; `KEYMAP.Kn_MAP` loads
into byte `0x669b47+n`. This gives the seven active UI positions the slot values
`1,3,2,5,4,6,7` from the actual packaged file. The Config saver associates
`Kj` with DWORD `0x6698b8 + 0x30*bank + 4*j`. Apply translates that integer to
an action byte, reorders through KEYMAP, then writes it. Protocol details and
the sparse four-bank serialization are in PROTOCOL.md. Complete human-action
labels, runtime profile activation, and firmware acceptance still need captures.

**Lighting path:** the INI saver identifies the globals used by `13`/`14`:
`LED_FEATURE_SCOLOR=0x669d64`, `LED_FEATURE_SYMMETRY=0x669d68`,
`LED_FEATURE_DIREC=0x669d6c`, `LED_BRIGHT=0x669d70`, and
`LED_USER_COLER_EN=0x663058` (the saver forces this to 1).
`LED_TYPE=byte 0x669b9a`; both `LED_CYC_TIME` and `LED_CYCTIME` save byte
`0x669b9b`; `CYC_7COL_EN=byte 0x669b99`. Palette components are confirmed
R/G/B at `0x669ed0+12*i`, `+4`, `+8`, by the saver plus `_R`, `_G`, `_B`
string references (VAs `0x5fd3ac`, `0x5fd3d0`, `0x5fd3f4`). Exact constructor
references to `0x429ee0` remain absent from Ghidra's inventory. This bounded
negative result does not prove it is unreachable or establish the other `14`
builder's behavior.

**Macro files:** the codec is now corroborated by both formatter and parser:
`00%d` below 10, `0%d` below 100, `%d` otherwise; the reader slices three
characters and calls `__wtol`. `scripts/inspect_macro_records.py` checked 32
records across constmacro.dat, _dat, pubg_en.dat, pubg_cn.dat: all split into
bytes `000..255`. `evidence/macro-records.json` records source offsets, hashes,
decoded lengths, prefixes and the 60-byte prefix interpreted as UTF-16LE.
This recovers names such as AKM and Copy/Paste labels, not USB macro events.
Record lengths vary (1861/2621/3181 bytes); `_dat` declares zero macros despite
two serialized values. Do not infer active records from key presence alone.
The parser is version-sensitive, reconstructs a different in-memory layout,
and invokes a key conversion helper; file bytes cannot be uploaded directly.

**Host settings:** the Config saver maps `DPI_SPEED` to byte `0x669b95` and
`WHEEL_SPEED` to byte `0x669b96`. Apply ends with `SystemParametersInfoW`
`70h/71h` and `68h/69h`: Windows pointer speed and wheel-scroll lines, according
to [Microsoft's API definitions](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfoa).
These host-setting operations require separate Linux desktop handling and must
not be mistaken for sensor-DPI or vendor HID commands.

**DPI (derived):** 23 display choices, 200–12800, six stages. Selection bytes at
`0x669f24` index the 23-byte table at VA `0x663060` / file offset `0x260e60`;
output codes at `0x669f54` are packed into memory `0013`, `0015..0019`.
See PROTOCOL.md for the exact table and bit layout. Packaged defaults are
400/800/1200/4800/7200/12800; this is not a read of the mouse's current DPI.
Static labels do not establish actual sensor CPI or native/interpolated resolution.

**RGB (partially derived):** command `13` has a complete eight-byte builder with
multiple flags and a split 10-bit argument. Command `14` packs three four-bit
components from a stride-12 array at `0x669ed0`; it changes only buffer bytes 0–3,
leaving bytes 4–7 from prior operations. INI color components range 0–15.
Do not assume zero padding or runtime use of every builder. The caller/saver
trace now establishes software component order and named fields; effect names,
timing units, accepted modes, tail behavior and persistence still need traffic
and UI correlation. Symbolic byte formulas are preserved in PROTOCOL.md.

**Buttons (serialization recovered, semantics partial):** INI `[KEYNUM]` says
seven buttons, and the loader/Apply chain confirms `[KEYMAP]` slot reordering.
Config0 stores `K0=1,K1=3,K2=2,K3=5,K4=4,K5=6,K6=15`.
These INI values are translated before packet construction.
`0x41af00..0x41b3d2` builds a block at base `0008`; its eight entries read
stride-14 bytes at `0x6ce984`, with optional upper bits sourced from `0x6ceb7c`
and `0x6cebb0`, then call the generic block writer. This is a remapping candidate,
not a verified complete human-action dictionary. Raw primitive conversion and
slot placement are recovered below; physical-button correlation, modifiers,
and multi-byte action behavior still require verification.

**Macros (incomplete):** bundled `_dat*`, `constmacro.dat*`, `pubg*.dat` are text
databases with `[Macros]`, `DAT_VER=3`, and decimal-encoded bytes. `macrogrp.ini*`
are UTF-16LE group files; the packaged `macrogrp.ini2` has zero groups.
`config.ini` includes `SOFT_HARD_MAC=0`, `LEFT_MAC*`, and `MAC_COR*` settings.
The apply routine serializes larger arrays in eight-byte chunks, e.g.
`0x41f43b..0x41f576`, into the same memory writer; macro association is a
hypothesis until dataflow/captures establish record meaning. Event opcodes,
delay units, loop/cancel behavior, memory allocation, and host/onboard execution
are not recovered sufficiently for implementation.

**Profiles (incomplete):** `[Init]` advertises four named software configurations
(Office/Game I/II/III) and `CurConfig=0`, with `[ShareData]` for common settings.
This establishes file organization, not four independent onboard banks. The
number of onboard profiles and behavior across application exit/power removal
remain unverified. Do not translate software-profile indexes into memory-bank
offsets without evidence.

## Reproduce extraction and static inspection

Run only on this exact supplied installer. Outputs must not already exist for
the first extraction step. 7-Zip parses data; it does not invoke MSI actions.

```sh
mkdir -p extracted
python3 scripts/extract_installer.py Thor_II_X16V2_Software_V1.0_23041800.exe extracted/installer
7z x -oextracted/msi 'extracted/installer/Fantech X16v2 Gaming Mouse.msi' Data1.cab
7z x -oextracted/payload extracted/msi/Data1.cab
7z x -oextracted/msi 'extracted/installer/Fantech X16v2 Gaming Mouse.msi' '!_StringData' '!_StringPool' '!File' '!Directory' '!Component' 'Binary.*'
python3 scripts/collect_static.py
```

The collector is specific to this verified PE32/MSI build, not a general hostile
file parser. It regenerates local disassembly/import/file-table evidence.
REA resource records require calling its `inspect_pe_resources` on the installer
and application, then `export_evidence_bundle` on the connected REA server.

## Ghidra installation and REA connection status

Earlier downloads failed DNS resolution, but the local installation now exists.
A fresh `make tools-check` verified full JDK **21.0.12.1** at `tools/jdk-21` and
Ghidra **12.1.4** at `tools/ghidra`. Direct Java `-XshowSettings:properties -version`
also completed successfully and reported a 64-bit OpenJDK VM. Download identities
are recorded in `tools/install-manifest.json`; no additional download is needed.

The live REA MCP server still reports Java 17 and no `GHIDRA_INSTALL_DIR`.
A fresh installed REA 6.5.0 CLI, launched after sourcing `tools/rea-env.sh`, finds
the correct Ghidra installation, headless launcher, and native decompiler, but
reports `runtime_missing`. Reproducing its Java probe with Node `spawnSync`
returned `error: spawnSync .../tools/jdk-21/bin/java EPERM`, despite child status
0 and valid Java property output. This is a subprocess restriction in this
session, not evidence that Java 21 is missing. No sandbox bypass was attempted.

Retained diagnostics: `evidence/rea-portable-providers.json` and
`evidence/ghidra-memory-builder-attempt.json`. The latter is a failed decompilation
attempt, not recovered code. No Windows executable or mouse command was run.

To configure a fresh REA launch in a normal terminal, start from the repository
root and use the locally installed research tools:

```sh
cd resa
source tools/rea-env.sh
make tools-check
```

Reconnect/restart the REA server so it inherits these variables. Shell exports
in this session do not change an already-running MCP server's environment.
Then open the **extracted application**, not the installer stub:

```json
{"path":"/absolute/path/to/checkout/resa/extracted/payload/fantech_x16v2_gaming_mouse.e","provider_id":"ghidra"}
```

The direct headless fallback has now succeeded. Its post-script is
`scripts/ghidra/DumpMouseProtocol.java`; no REA or client configuration was changed.
To reproduce into a **new** project and output directory (the script refuses to
overwrite recovered `.c` files):

```sh
mkdir -p evidence/ghidra-project evidence/ghidra-home
JAVA_TOOL_OPTIONS="-Duser.home=$PWD/evidence/ghidra-home -Dapplication.settingsdir=$PWD/evidence/ghidra-home/settings -Dapplication.cachedir=$PWD/evidence/ghidra-home/cache -Dapplication.tempdir=$PWD/evidence/ghidra-home/tmp" \
  "$GHIDRA_INSTALL_DIR/support/analyzeHeadless" "$PWD/evidence/ghidra-project" ThorX16v2Next \
  -import "$PWD/extracted/payload/fantech_x16v2_gaming_mouse.e" \
  -max-cpu 2 -analysisTimeoutPerFile 180 -scriptPath "$PWD/scripts/ghidra" \
  -postScript DumpMouseProtocol.java "$PWD/evidence/ghidra-next-pass"
```

This imports/analyzes bytes without running the Windows application. No debugger
or runtime observation is authorized by this command.

## Go implementation and validation

`cmd/resa` and its internal packages use only Go's standard library. `resa list` reads
sysfs HID IDs, parent USB/interface metadata and cached report descriptors. It
totals input/output/feature report sizes with global push/pop support and reports
malformed/unsupported descriptors. This discovery command never opens
`/dev/hidraw*` or calls ioctls.

`resa lighting` defaults to a dry run. Only `--apply --experimental` (or the
desktop's dedicated experimental lighting button) opens a matching configuration
node and sends one `07 13 ff (f0|speed) 0b brightness 00 02` report. Brightness and
timing are bounded raw levels 0..7. It fixes packaged mode 7, does not preserve
current lighting, and does not implement RGB palette, memory, firmware, DPI,
button, macro, or full-profile writes. PROTOCOL.md records the static evidence
and ordering uncertainty. The user's later request to customize now authorizes
this experiment; it does not validate the firmware behavior.

The transport requires Linux amd64/arm64, no symlink node, exact USB product/interface
and descriptor identity, and exactly one matching interface. Kernel-cached identity
and descriptor bytes are rechecked on the open fd before the feature ioctl. A
second allowlist in `internal/hidraw` rejects every byte combination outside this
fixed lighting format. Transfer errors/short returns are never retried. Successful
kernel acceptance returns `sent-unverified`, never a device-level success claim.
No current-state query, backup, or persistence check is implemented.

Validation: `go test ./...` passed (descriptor sizes/padding/global stack,
malformed descriptor rejection, and fake-sysfs filtering); `go vet ./...` passed.
Build uses `-buildvcs=false` because this environment's restricted `.git` cannot
provide VCS stamping. `resa list --json` produced `evidence/linux-discovery.json`
for the attached mouse. This proves cached discovery, not active communication
or that any recovered command works on physical hardware.

Additional checks cover all 64 lighting payload combinations, invalid inputs,
device selection/identity rejection before sending, exact one-shot transmission,
short/error returns with no retry, and bridge/UI lifecycle behavior using fake
endpoints. These are implementation tests, not hardware evidence. This environment
has no accessible hidraw nodes for a physical test; none was attempted.

Next evidence: resolve extended action labels, macro event/timing semantics,
profile activation, and the per-action Windows captures in
PROTOCOL.md, including standalone lighting acceptance and prerequisites. Broader
configuration transmission remains absent pending protocol verification and
explicit approval for those hardware tests.
