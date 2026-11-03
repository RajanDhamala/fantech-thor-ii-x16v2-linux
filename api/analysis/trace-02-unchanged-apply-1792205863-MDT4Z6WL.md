# 02 Unchanged Apply — reopened app plus Apply

Source: `../captures/vm-052785d3b59d/trace-02-unchanged-apply-1792205863-MDT4Z6WL.pcapng`  
SHA-256: `cd80f9998bb150aa2e7ccccff93ac37a798f32b7f72470319787315cbc072a68`

## Operator clarification

Recording start reconnected the physical USB mouse, and the already-open Fantech app closed. The operator reopened it and pressed **Apply inside the Fantech Windows app**. The original JSON notes mention filters; those notes remain untouched. This analysis records the clarification separately.

## Verified capture facts

- Saved normally and stopped by the operator; 2,801,072 bytes, 27,393 USB records, 24.588517 seconds.
- 12,311 control records and 15,082 interrupt records. These are capture records, not unique Windows API calls.
- Two HID feature-request bursts: approximately 5.080–8.227 seconds and 14.352–17.632 seconds. They are separated by about 6.125 seconds without feature-request setup records.
- Each burst contains 867 outgoing eight-byte report-07/command-18 candidate data-stage records in VirtualBox's setup slots. The matching rule is control-submit, endpoint zero OUT, URB length 8, bytes beginning `07 18`.
- All 867 candidate byte strings in the first burst match `01 Startup` in order, byte for byte. This supports the first burst being startup after reopening the app.
- The second burst matches the first at 866 of those 867 candidate records. Operator confirmation and timing support assigning it to Apply, but no exact UI click timestamp was recorded.

## One observed difference

| Position in candidate sequence | Startup frame | Later frame | Startup bytes | Later bytes |
| --- | --- | --- | --- | --- |
| 131 | 1571 | 16557 | `07 18 03 07 68 00 00 07` | `07 18 03 07 68 00 04 07` |

Byte index 6 (the seventh byte) changes from `00` to `04`. Do not call this an entirely identical replay. The meaning of the differing value is unknown: it may reflect UI/default state, an internal flag, or another app-side update. This recording alone does not identify the setting or a physical memory location.

## Limits and next control

16,290 records have captured lengths smaller than their original lengths. Report-byte comparison uses the setup slots of separate VirtualBox control-phase records, not reconstructed missing bytes. Keep the original capture unchanged. Existing `capinfos`, Wireshark `sharkd`, and a read-only Python record parser were used; no device commands were replayed.

For future captures, start recording **before** opening Fantech. Reopen the app after recording says Recording, wait five seconds, then perform the intended action.

Next suggested control: `03 Repeat Apply`. Start capture, reopen Fantech, wait five seconds, click Apply without changing settings, wait five seconds, click Apply again, wait five seconds, then stop. This tests whether the `04` value remains stable on repeated Apply before assigning it to a setting.

## Analysis window requested after recording

Ignore records with `frame.time_relative < 5` for setting comparisons. The complete original file is loaded first, preserving early descriptors for decoding. The checked window retains 27,248 records and excludes 145; first retained frame is 146. The two partitions sum to the full 27,393 records. A fresh decoder instance was used for this file to avoid cross-file filter state. Full-capture totals elsewhere in this historical report remain unchanged. Startup bursts after five seconds must still be separated from the setting change. Raw capture and operator metadata are untouched.
