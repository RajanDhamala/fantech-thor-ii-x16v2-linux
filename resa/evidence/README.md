# Public evidence summaries

The `*-support.json` files record captured field mappings, capture hashes,
implementation scope and remaining limitations. `linux-discovery.json` is the
cached descriptor fixture used by JavaScript tests; it is not a live device scan.
USB product IDs and descriptor hashes identify the supported protocol and are
intentionally public. There are no personal device serial numbers in that fixture.

The [published research index](../../api/analysis/INDEX.md) links to the detailed
DPI, polling, button and lighting mappings, plus each written trace report and
its filtered JSON evidence. [ANALYSIS.md](../ANALYSIS.md) records the static
investigation.

Paths to raw recordings, full decoder dumps and older research outputs identify
local research inputs. Those inputs are excluded from Git, so these references
are provenance records rather than downloadable files. Raw captures, vendor
executables, decompilations, session exports and host-specific diagnostics are
not part of the published source tree.

Read [the protocol notes](../PROTOCOL.md) for historical recovery details and
[the app README](../README.md) for current setup and supported behavior.
Byte correlations and stored readback do not prove physical effects or persistence.
