Task id: healthkit-testday-first-sync-audit-20260921

Goal

Perform a READ-ONLY acceptance audit of the Founder's first real HealthKit canonical Activity + Nutrition sync for test day 2026-09-21. Diagnose exactly what canonicalized, whether it is correct so far, and whether strategic quarantine remains intact.

This is an audit only. Do not patch, deploy, activate/deactivate policy, resync, mutate canonical data, or change Native/Server code.

Claude chat continuity

This belongs in the existing Claude Remote Control chat named "HealthKit Phase 2". Continue using that implementation thread.

Observed Founder device result

At approximately 2026-09-21 12:49 PM Founder-local, Build 49 showed:
- Test day: 2026-09-21
- Day status: Current day (partial until it ends)
- Activity observations uploaded: 1
- Nutrition observations uploaded: 1
- Pending batches: 0
- Last acknowledgement: 9/21/2026, 12:49 PM
- Server canonicalized: Activity, Nutrition

The Founder correctly does not see these records in the normal Log or Evidence pages yet; current design keeps them in the quarantined HealthKit canonical proving store.

Authority to reverify

Expected production Server:
a40c0b53c49240d5666d2a3475d48541cfd5f57e
deployment dda84642-c713-4091-a3a2-126e02345d3b
schema 000014

Expected Native:
2bfbf54ad105a3a18189e811f06afc421741a7da
Build 49

Expected test-day activation:
Founder owner
date 2026-09-21
domains Activity + Nutrition
canonicalization ON
strategic/V3 eligibility OFF
historical backfill OFF

Production access

Use the approved bounded read-only production access path documented in agent-handoffs/PRODUCTION_READONLY_ACCESS.md.

Every SQL audit:
BEGIN READ ONLY / REPEATABLE READ as appropriate
verify transaction_read_only = on
bounded Founder-owner SELECTs only
ROLLBACK

No production export containing sensitive HealthKit values into GitHub.
The completion handoff may report summarized numeric values necessary for Founder acceptance, but do not publish unnecessary raw health/source payloads.

Audit 1 — activation policy

Prove:
- exact active policy id/version
- exact date scope 2026-09-21 only
- Activity enabled
- Nutrition enabled
- strategic evidence eligibility disabled
- Confidence impact disabled
- historical backfill disabled
- activation audit row exists
- no broader owner/date/domain window accidentally enabled

Audit 2 — raw/transport observation lineage

For the first 12:49 sync, identify:
- Activity observation identity/revision/source
- Nutrition observation identity/revision/source
- observed/effective local date
- ingestion/ack time
- whether each observation was accepted once
- duplicate/retry state
- pending/outbox state
- any validation warnings/errors

Do not confuse ingestion timestamp with effective day.

Audit 3 — canonical Activity

Inspect the quarantined HealthKit canonical day for 2026-09-21.

Report the current partial-day values and semantics that were actually canonicalized, including:
- active energy / Move calories if present
- any other Activity daily field legitimately in this contract
- source/provenance
- coverage/as-of timestamp
- canonical id/version/revision identity
- whether this is marked partial/current-day
- whether any duplicate canonical Activity day exists
- whether existing manual/screenshot Activity for 2026-09-21 exists and, if so, exactly how coexistence/reconciliation is represented

Compare the canonical value to the HealthKit observation submitted by Build 49. They should agree under the source contract.

Do NOT compare against general expectations or infer Apple Watch truth not present in the observation.

Audit 4 — canonical Nutrition

Inspect the quarantined HealthKit canonical Nutrition day for 2026-09-21.

Report:
- calories
- protein
- carbohydrates
- fat
- source/basis/provenance
- coverage/as-of timestamp
- canonical id/version/revision identity
- partial/current-day status
- confirm zero fabricated meal objects
- whether duplicate canonical Nutrition day exists
- whether existing MFP/manual/screenshot Nutrition for 2026-09-21 exists and how coexistence/reconciliation is represented

Confirm daily totals are authority for this HealthKit path and meal detail is not required.

If any macro is absent/zero because Apple Health currently has no samples for it, distinguish that from a pipeline failure.

Audit 5 — idempotency state

Without asking the Founder to sync again and without writing anything:
- inspect observation/canonical identities and revision/fingerprint state;
- determine what the next identical sync would do;
- prove whether an identical replay should no-op/update-in-place rather than create a duplicate;
- identify any condition that would make a legitimate later same-day revision advance the canonical version.

Do not actually replay a write.

Audit 6 — strategic quarantine

This is a hard gate.

Prove after the 12:49 canonical sync:
- zero HealthKit-derived strategic Evidence created from this test-day canonical Activity
- zero HealthKit-derived strategic Evidence created from this test-day canonical Nutrition
- V3 eligible HealthKit Activity = 0
- V3 eligible HealthKit Nutrition = 0
- Confidence history unchanged due to this sync
- no briefing regenerated/revised due to this sync
- no Goal/phase/strategy mutation
- no Training/Workout Logger mutation
- no DEXA/Photo mutation

If canonical records are visible to any generic evidence adapter despite policy eligibility OFF, classify as blocker even if no briefing has yet run.

Audit 7 — user-facing projection status

Confirm from source/read-model behavior that it is currently expected for these quarantined canonical records NOT to appear in:
- normal Log Activity/Nutrition rows
- Evidence Hub Activity/Nutrition

Identify the exact future promotion/read-model step required to make canonical HealthKit data visible there while keeping V3 eligibility independently gated.

Do not implement it now.

Audit 8 — 3 AM / completed-day revision readiness

Determine from the actual stored first-sync state whether a second sync for test date 2026-09-21 after local midnight should:
- update/revise the same canonical Activity day
- update/revise the same canonical Nutrition day
- preserve date = 2026-09-21
- preserve strategic quarantine
- avoid duplicates

Confirm whether the Founder should sync shortly after midnight, or whether waiting until a particular time is better.

Do not require the Founder to stay awake until 3 AM. The purpose of the second sync is completed-day revision; the separate 00:00-02:59 -> 03:00 briefing-boundary proving test can be a later day if desired.

Acceptance classification

Return one of:
GREEN — first sync is correct; continue normal day and perform one completed-day Sep 21 sync after midnight.
YELLOW — usable but specific bounded issue should be understood before second sync.
RED — stop test-day writes/deactivate before further sync.

For GREEN, give exact Founder instructions for the rest of today and the second sync.

Do not overreact to current-day partial values; this is expected at 12:49 PM.

GitHub protocol

Claim/complete this new task through established inbox protocol.
No code changes are expected.

Publish a sanitized completion handoff under:
healthkit-testday-first-sync-audit-20260921

Report:
- authority
- policy scope
- first observation lineage
- current canonical Activity summary
- current canonical Nutrition summary
- duplicate/idempotency assessment
- strategic quarantine proof
- user-facing projection explanation
- second-sync readiness
- GREEN/YELLOW/RED verdict
- exact Founder next action

Explicit flags:
FIRST_ACTIVITY_OBSERVATION_ACCEPTED
FIRST_NUTRITION_OBSERVATION_ACCEPTED
ACTIVITY_CANONICAL_DAY_SINGLETON
NUTRITION_CANONICAL_DAY_SINGLETON
ACTIVITY_VALUES_MATCH_SUBMITTED_OBSERVATION
NUTRITION_VALUES_MATCH_SUBMITTED_OBSERVATION
NUTRITION_MEALS_FABRICATED
IDENTICAL_REPLAY_EXPECTED_IDEMPOTENT
LATER_REVISION_EXPECTED_SAME_CANONICAL_DAY
HEALTHKIT_ACTIVITY_V3_ELIGIBLE
HEALTHKIT_NUTRITION_V3_ELIGIBLE
CONFIDENCE_CHANGED_BY_SYNC
BRIEFING_CHANGED_BY_SYNC
TRAINING_CHANGED_BY_SYNC
NORMAL_LOG_PROJECTION_ENABLED
EVIDENCE_HUB_PROJECTION_ENABLED
READY_FOR_COMPLETED_DAY_SECOND_SYNC
TESTDAY_VERDICT
PRODUCTION_MUTATED_DURING_AUDIT
