# 03 Repeat Apply — recording comparison

Source: `../captures/vm-052785d3b59d/trace-03-repeat-apply-1792206079-X3LQVAL3.pcapng`  
SHA-256: `43298fe9e94d58e8c4334a008081b7f93ee543cad936ee26dd8893eca88025ce`

## Capture checks

- Recording stopped by the operator; 2,366,976 bytes, 23,219 USB records, 25.628377 seconds of packet timestamps.
- 12,311 control records and 10,908 interrupt records.
- Two HID feature-request bursts were found. Each contains 867 SET_REPORT setup records and 2 GET_REPORT setup records. Each also has 867 outgoing report-07/command-18 candidate data-stage records in the separate VirtualBox setup-slot view.

| Burst | Feature setup window, seconds | Candidate sequence comparison | Candidate record 131 |
| --- | --- | --- | --- |
| First | 10.806747–14.232809 | All 867 byte strings exactly match 01 Startup | `07 18 03 07 68 00 00 07` |
| Later | 19.040384–22.217081 | All 867 byte strings exactly match 02's later Apply-like burst | `07 18 03 07 68 00 04 07` |

This independently repeats the startup-versus-Apply candidate-byte difference from recording 02. It supports a reproducible difference between reopening the application and applying its currently displayed settings. The meaning of the seventh byte (`00` versus `04`) remains unknown; do not assign it to a lighting/DPI setting or physical memory location.

## Operator clarification: one Apply click

The operator confirmed: **Clicked Apply only once**. The recording name remains `03 Repeat Apply`, but this is a second independent startup-plus-single-Apply run, not two Apply clicks in one recording. Two visible bursts therefore fit the reported actions. The current capture provides no evidence for the behavior of a second Apply click in the same app session.

The original capture and its original metadata notes remain unchanged. The corrected procedure is recorded only in this derived analysis.

## Evidence limits

14,203 records have captured lengths smaller than their original lengths. Comparisons use raw eight-byte values in separate VirtualBox control-phase setup slots, selected by control-submit, endpoint zero OUT, URB length 8, prefix `07 18`. They are not ordinary `usb.capdata` payload fields and do not prove full USB payload coverage.

Installed `capinfos` independently verifies packet count, size, and duration. A read-only Python block parser and the retained 01/02 candidate sequences provide the byte comparisons. REA's TShark provider remains unavailable from the previous provider check; no configuration was changed. No Windows application was launched or device command replayed by this analysis.

## Next experiment

The single-click clarification is resolved. Next, record one isolated DPI value change with the original/new UI values and the affected DPI stage in the name/notes. Leave every other setting unchanged and confirm the displayed and physical result after Apply. Start capture before reopening the Fantech app because Start/Stop reconnects the mouse and can close it. Use two minutes to avoid accidentally ending capture before the intended action.

## Analysis window requested after recording

Ignore records with `frame.time_relative < 5` for setting comparisons. The complete original file is loaded first, preserving early descriptors for decoding. The checked window retains 23,086 records and excludes 133; first retained frame is 134. The two partitions sum to the full 23,219 records. A fresh decoder instance was used for this file to avoid cross-file filter state. Full-capture totals elsewhere in this historical report remain unchanged. Startup bursts after five seconds must still be separated from the setting change. Raw capture and operator metadata are untouched.
