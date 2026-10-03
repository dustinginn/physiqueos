# Founder authorization request: DEXA -> Apple Health rollout gates

**Status:** AUTHORIZED AND COMPLETED on 2026-10-03. Server `b47663b3...` is live as deployment `b9449c52...`; Build 84 delivery `a4b7b504...` is `VALID`. See `agent-handoffs/reports/20261003T153612Z-dexa-healthkit-server-deployed-build84-valid.md`. The process is now stopped for Founder remote-installation confirmation; physical validation and permanent activation remain unexecuted.

Implementation report: `agent-handoffs/reports/20261003T074545Z-dexa-healthkit-writeback-overnight-implementation.md`

The approved architecture is implemented, hard-tested, independently reviewed, and archived. No production deployment, TestFlight upload, Apple Health mutation, historical backfill, or permanent policy enablement has occurred.

## Gate 1 — Server deployment

Decision requested: authorize or decline production deployment of exact Server SHA:

`b47663b32372a78010dbc8e4aa41303012d98dc7`

- Branch: `codex/dexa-healthkit-server-20261003`
- Base: exact current production source `89fe0a0340adee22d15b92a1f074a0bbd348ac77`
- Nature: additive/backward-compatible dormant intents/receipts and feedback-loop protection.
- Permanent writeback remains disabled after deployment.
- This authorization does not authorize TestFlight upload, physical validation, or policy enablement.

## Gate 2 — Build 84 TestFlight upload

Separately, after the Server contract is live and reverified, authorize or decline upload of exact Native SHA:

`bcd92c74602695766c270fe6af052de45afece4b`

- Branch: `codex/dexa-healthkit-native-build84-20261003`
- Base: exact Build 83 source `3e61dd215e8474c52bd54230d2d9dfb2f3a93534`
- Archive: `PhysiqueOS-Build84-bcd92c74.xcarchive`, version `1.0 (84)`
- App binary SHA-256: `10c34dd17b64f9fbc0ae0aac3d012909a14a86984613b729026b41c6731d04ec`
- Build 83 remains untouched and valid for the Founder's gym test.
- This authorization does not authorize the physical HealthKit validation or permanent policy enablement.

## Later, separate gates

1. Explicitly initiate the Founder's on-device Sep. 12 write/verify/delete validation.
2. Review the physical validation evidence.
3. Only after success, separately decide whether to enable prospective permanent writeback from scan date `2026-10-09`.

Reply with exact-SHA authorization for only the gate(s) intended. The recommended next action is Gate 1 only.
