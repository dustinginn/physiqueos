# HANDOFF TASK for HealthKit lane — Briefing evidence settlement device closeout (D2)

Generated: 2026-09-25T04:55:14Z
Task id: `claude-healthkit-briefing-settlement-device-closeout-20260925`
Agent: Claude (Midweek Briefing Founder Takeover lane, secondary) — publishing this handoff, not implementing it
Status: **HANDOFF ONLY.** This is not a completion report. It identifies work for the HealthKit lane to pick up next; the orchestrator should route it to HealthKit Claude.

This is a secondary-lane report. `agent-handoffs/latest.json` / `latest.md` are NOT updated by this publish.

## Why this handoff exists

Per the governing task `claude-midweek-v3-live-wiring-integration-prep-20260924`'s Part C: "Do NOT edit HealthKit-owned Native files from the Midweek worktree if they overlap the HealthKit candidate... If this belongs in HealthKit lane, do not implement it yourself. Publish the exact handoff task to agent-handoffs/inbox/prompts/ or a timestamped report and identify required HealthKit base SHA."

The Briefing Evidence Settlement Policy's device-closeout half (D2) requires touching Native's existing HealthKit sync coordinator (`HealthKitAutomaticSynchronizationCoordinator` and related files) — HealthKit-lane-owned. Per that same task's own instruction, this is published as a handoff rather than implemented directly.

## The full task prompt for the HealthKit lane

Task id: `claude-healthkit-briefing-settlement-device-closeout-20260925`

Continue in the HealthKit lane (Remote Control). Reasoning: medium.

This task authorizes CODE / TEST / REVIEW ONLY. No production deployment, TestFlight archive/upload, Cardio activation, policy/data mutation, or historical briefing regeneration.

**Read first:**
- `docs/BRIEFING_EVIDENCE_SETTLEMENT_DEVICE_CLOSEOUT_INTERFACE.md` (Midweek Server worktree / branch `claude/midweek-v3-engine-server-20260925`) — the full interface spec this task implements against.
- `src/domain/services/BriefingEvidenceSettlementPolicy.js` (same branch) — the Server policy module this closeout is optional input to (`recordDeviceCloseoutReceiptV1`, `buildEvidenceSettlementWatermarkV1`'s `closeoutReceipt` field).
- The latest Midweek integration report in `agent-handoffs/reports/` (timestamped after `20260925T042005Z`) for the exact live-scheduler wiring this composes with (`BriefingCadenceSettlementGate.js`, `BriefingCadenceExecutorService.js`).

**Expected reviewed candidate to build from:**
- HealthKit Native base: `6a108d25e2a05b63c9561be3aeb9952f4e9dafe1` (the already-reviewed Sep24 decode fix + workout-type-fidelity candidate). Build in its own isolated worktree preserving that SHA as base, same pattern as the Sep24 candidate.
- Do NOT touch the Midweek lane's worktrees (`/Users/dustinginn/Developer/PhysiqueOS/native-midweek-v3`, `/private/tmp/physiqueos-midweek-v3-engine-server`) — read-only reference only, via `git show <branch>:<path>`.

**Goal:** Implement Native's half of the device-closeout accelerant, exactly as scoped in the interface doc:

1. On an existing app-open or background-execution trigger, determine whether the active cadence's final evidence day is one a recurring briefing might still be settling for — computable client-side the same way `BriefingScheduleAuthority.js` computes it (cadence day + 03:00 local + the settlement policy's `maximumWaitMinutes`, currently 480). No new Server round-trip is required to discover this.
2. Re-run the EXISTING HealthKit sync machinery for that specific day only — not a new sync mechanism, an additional bounded trigger into what already exists.
3. Let the existing evidence-intake path canonicalize the result exactly as any other sync does today. No new Native→Server endpoint is required for the upload itself.
4. Decide whether to also implement the OPTIONAL observability receipt call (`recordDeviceCloseoutReceiptV1`'s shape). This needs one new, narrowly-scoped Server endpoint that does not yet exist. You may implement steps 1–3 only (self-sufficient without the receipt) and explicitly defer the receipt endpoint if designing a new endpoint is out of proportion — note that decision either way in your completion report.

**Requirements:**
- No exact iOS wake time may be assumed or promised.
- No user action required — never a prompt, button, or required interaction.
- Must never be presented as required or block anything if it fails/is skipped — Server's own hard-deadline fallback remains authoritative regardless.
- Must reuse the existing HealthKit sync/evidence-intake path — no parallel/duplicate ingestion mechanism.
- Bounded: only the specific final evidence day, not an unbounded resync.

**Validation:** Native focused + relevant full unit/UI suites, existing iPhone 17 Pro simulator only. Fresh-context adversarial review of the final candidate. Confirm no interference with this exact sync path's own documented prior incidents (the daily-snapshot 409 revision-loop, the automatic Nutrition sync bounds:nil regression) — add a regression test proving this new bounded-day trigger cannot reintroduce either.

**GITHUB:** Publish a timestamped implementation/review report to `agent-handoffs/reports/`. Update `agent-handoffs/latest.json`/`latest.md` per the HealthKit lane's own normal protocol. Identify the exact final Native candidate SHA and base lineage in the report.

**Not authorized in this task:** No deployment, no TestFlight archive/upload, no Cardio activation, no production data mutation, no policy mutation, no HealthKit Native files outside what this closeout feature genuinely requires.
