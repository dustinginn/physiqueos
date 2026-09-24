Task id: claude-healthkit-revision-loop-fix-design-20260923

Turn the completed Build 55 Activity 409-loop diagnostic into an implementation-ready recovery design for Codex. Read-only design/specification task only. Do not modify application code, production data, policies, App Store Connect, or Codex's active worktree.

Use a SEPARATE NEW Claude chat/session from the Midweek audit. Sonnet High.

Read first:
agent-handoffs/reports/20260924T012249Z-build55-activity-sync-409-loop-diagnostic.md

Known live failure:
- Sep 23 Activity Server state froze at sourceRevision 50 / 18:35:26Z.
- Build 55 foreground and Log pull-to-refresh did query/upload, but 10 attempts were rejected 409 HEALTHKIT_OBSERVATION_IDENTITY_COLLISION.
- Device repeatedly reused an already-consumed per-day revision with newer content.
- abandon-on-rejection did not advance revision floor, creating a permanent same-day loop.
- Build 55 timeout/rerun fixes were engaged; this is distinct from Build 54's in-process wedge.
- Nutrition shares the latent mechanism.
- likely apparent recovery on Sep 24 due to new per-day revision namespace does not repair Sep 23.

Goal:
Specify the smallest robust Native + Server correction and a safe Sep 23 repair path, with exact invariants and tests, so Codex can implement without rediscovering the failure.

Design requirements to evaluate/define:

Native:
1. Per-day/per-scope high-water sourceRevision that never regresses.
2. On Server identity-collision rejection, safely advance/rebase the day's revision floor using authoritative Server information rather than retrying the poisoned revision forever.
3. After a durably accepted upload, local acknowledge/persistence must complete through an uncancellable or otherwise atomic durability boundary so cancellation cannot reopen the accepted->acknowledged gap.
4. Protected-data/locked-device persistence failures must not quarantine/reset a healthy sync state file in a way that loses revision floors.
5. Preserve anchor/cursor correctness and no duplicate observations.
6. Pull-to-refresh must obtain a genuinely fresh attempt after a stuck/recovery condition.
7. Analyze secondary hazard from Claude's report: a pull during the queued rerun can coalesce onto a pass that predates the pull. Define whether a generation/token/rerun counter is needed.
8. Activity and Nutrition must use the same safe daily-aggregate revision semantics.
9. Workout semantics must not be accidentally changed; workouts have different identity/revision behavior.

Server companions:
1. Return nextExpectedRevision or equivalent authoritative recovery metadata on the relevant 409.
2. Log hashed external identity + received sourceRevision + expected floor on collision warning; no sensitive values.
3. Do NOT silently accept lower/reused revisions.
4. Preserve purpose-change and true identity-collision protections.
5. Determine whether the Server should expose a bounded read-only current revision floor endpoint/response or whether 409 metadata is sufficient.
6. Ensure command receipts/observability make repeated collision loops diagnosable.

Sep 23 repair:
Design a bounded safe way to restore the final Sep 23 Activity canonical day after the client fix, without fabricating data and without historical backfill beyond Sep 23.
Prefer re-querying Apple Health for the Sep 23 daily aggregate and emitting it with a fresh authoritative revision after recovery.
Prove that Sep 24+ normal data is not rewritten.
Decide whether Nutrition Sep 23 needs repair/reconciliation even if its visible total appears current.
No production repair in this task.

Diagnostics UX:
Specify minimal Founder diagnostics to expose on the existing diagnostic/canary screen:
lastAttempt
lastSuccess
lastErrorCode
abandonedBatchCount
cursorGeneration/revision high-water
lastDurableAcknowledgement
scope/domain
Do not turn this into end-user UI.

Testing matrix:
- accepted upload then cancellation before local acknowledge;
- reused revision + changed content -> 409 -> recovery -> next fresh revision succeeds;
- state persistence unavailable while device locked -> no state reset/quarantine;
- app relaunch;
- pull-to-refresh during in-flight pass;
- pull during queued rerun;
- offline -> reconnect;
- Activity and Nutrition independently;
- one stream collision cannot freeze other streams;
- repeated identical replay remains idempotent;
- purpose mismatch still refuses;
- revision never regresses across app update/relaunch;
- local date rollover;
- Sep 23 bounded repair;
- no Workout regression.
Require mutation tests for revision-floor/high-water/acknowledge guards.

Output:
- root cause restated precisely;
- state machine before/after;
- Native change map by file/module;
- Server change map;
- protocol/response shape;
- persistence semantics;
- exact tests;
- migration/backward-compat considerations;
- Sep 23 repair plan;
- rollout/acceptance sequence;
- risks;
- implementation-ready Codex task decomposition.

Do not code.
Do not mutate production.
Do not ask Founder to force-quit or manually sync.
Publish durable GitHub progress/checkpoint updates after substantive chunks and a final sanitized report, without interfering with Codex's active task.

Standing simulator/disk rule: if Native inspection needs a simulator, use only existing iPhone 17 Pro simulator; do not create/retain others; do not delete required runtime.
