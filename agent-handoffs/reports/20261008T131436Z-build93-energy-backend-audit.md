# Build 93 Energy backend historical-data audit

Task ID: `build93-energy-backend-audit-20261008`  
Agent: Codex A  
Status: Complete — zero-write production audit; no correction candidate warranted  
Generated: 2026-10-08T13:14:36Z

## Executive finding

The canonical production Energy history is correct where authoritative numeric targets were recorded. The active phase has one target-bearing Phase Review decision, one matching immutable Energy protocol version, and one matching current protocol projection. Their nonreversible target-pair digest is identical (`h_a6c4b0b3c41d40eb`). Goal link, explicit phase link, version sequence, supersession, effective boundary, current pointer, and transaction linkage all pass.

The earlier completed phase has no authoritative exact caloric-intake or activity-expenditure target record. Its legacy Energy version is goal-linked and correctly superseded, but it predates explicit phase binding and contains qualitative calibration intent rather than exact numeric targets. Neither consumed transition record contains an exact target pair, there is no Energy strategy-link record, and Phase Strategy correctly contains no execution-owned exact targets. This is legitimate legacy source absence, not a wrong value that can be repaired.

No production data correction, backfill, migration, source-code fix, candidate branch, deploy, or release is warranted. The smallest safe backend correction is no mutation. Any surface that presents history must show exact targets only for the later phase and treat the earlier phase's values as unavailable; it must not reconstruct them from current targets, evidence, or fixtures.

## Authority and safety verification

- Repository: `dustinginn/physiqueos`.
- Governing task: GitHub commit `6942b9e997c58e20b9f40c81b2a4014bbde96441`.
- Founder scope correction reviewed: `677aebde92769252e1b5bfccf7cf9fd455297bfa`.
- Live App Platform app and deployment reverified: deployment `32143aa4-90d4-496a-81b2-17f35a609fde`, phase `ACTIVE`, 9/9 successful steps.
- Live `web` and `worker` source SHA reverified: `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`.
- `/api/v1/health/live` and `/api/v1/health/ready` returned the expected build identity; readiness was 9/9.
- Saved provider context was used explicitly with retries disabled during authority verification.
- The accepted Mac console runner's local Git blob (`f7123347a43fb5dcfe8ae2a3029897d5ddb11fa7`) matched the previously accepted source at commit `4025f17560e926b7e33a1cad6757a06716b16d24` exactly.
- The audit payload required the exact live SHA and build ID, a valid owner-bound environment, the database binding and CA, and one bounded database connection.
- Database access used `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, performed only owner-scoped parameterized `SELECT` statements, and completed with explicit `ROLLBACK` before the success marker.
- Output contained counts, aliases, booleans, classifications, and truncated nonreversible digests only. No owner identity, raw target values, raw dates/times, credentials, connection strings, or full records were emitted or retained.
- No HealthKit, Sleep, Workout, Evidence, DEXA, briefing, or other out-of-scope datasets were queried.

## Bounded production audit

Permitted collections and hard row ceilings were fixed before the read:

| Collection | Ceiling | Observed |
| --- | ---: | ---: |
| goals | 10 | 4 |
| goalTransitionDrafts | 10 | 2 |
| goalProtocolTransitionDrafts | 10 | 2 |
| phaseReviewDecisions | 20 | 1 |
| phaseReviewTransactions | 20 | 1 |
| phaseStrategies | 20 | 1 |
| phaseExpectedTrajectories | 20 | 1 |
| phaseLifecycleReadModels | 20 | 1 |
| protocols | 30 | 24 |
| protocolVersions | 80 | 29 |
| energyStrategyLinks | 30 | 0 |

The audit then narrowed in memory to the single active primary Goal and the one goal-supporting Energy protocol. It found two versions: one legacy prior version and one current phase-bound version.

## Source-model trace

At the exact live Server SHA, the authoritative chain is:

1. A committed `phaseReviewDecision` owns the user-authorized `phaseEstablishment.executionTargets`.
2. `PhaseReviewCommitParticipants` copies those values into a new immutable `protocolVersion.change.reviewedChanges`, with explicit `goalLinks`, `phaseId`, prior-version lineage, and effective time.
3. The same commit supersedes the prior version and copies the new values to the mutable current protocol's `effectiveStrategy` and current-version pointer.
4. Phase Strategy owns semantic intent and review logic, not exact execution targets.
5. Current Operating Plan reads project the mutable protocol; historical truth remains in protocol versions and the decision lineage.

This distinction matters: absence from an app view is a projection limitation, while absence from the decision/version chain means the value was never canonically recorded.

## Production findings

### Completed prior phase: `source_absent`

- Canonical phase exists and is completed.
- Legacy Energy version is linked to the Goal, has a valid effective start, is superseded, has an end boundary, and points to the current version.
- Legacy Energy version has no explicit phase link and no complete exact target pair.
- Consumed Goal/Protocol transition lineage exists, but neither transition contains an exact target pair.
- There is no separate Energy strategy-link record carrying targets.
- No accepted Phase Strategy contains exact execution targets, which is consistent with the model's ownership boundary.
- Conclusion: exact historical calories/activity were not captured. They are neither incorrect nor safely recoverable.

### Active later phase: `source_correct`

- One committed Begin-next-phase decision is linked to one committed phase-review transaction.
- The decision contains one complete execution-target pair.
- One immutable protocol version is explicitly linked to the Goal and phase and contains a complete reviewed target pair.
- Decision and immutable-version target digests match: `h_a6c4b0b3c41d40eb`.
- Current protocol and immutable-version target digests match: `h_a6c4b0b3c41d40eb`.
- Current protocol points to the active version and phase.
- Actual effective-date authorities agree: phase start, Goal timeline, expected trajectory, lifecycle read model, current version effective boundary, and prior-version end boundary.
- The immutable decision retains a different projected-date digest. Source inspection proves this is the original decision input preserved across the separately authorized post-Phase-2 reconciliation; it is not used as the post-reconciliation actual effective date. The reconciliation intentionally updated the actual phase/version/trajectory/lifecycle authorities and did not rewrite the historical decision.

### Integrity matrix

| Check | Result |
| --- | --- |
| Duplicate version IDs | 0 |
| Duplicate protocol version numbers | 0 |
| Overlapping effective ranges | none |
| Effective-range gaps | none |
| Previous/superseded-by lineage | pass |
| Prior version status/end boundary | pass |
| Current version status/current pointer | pass |
| Goal/phase linkage for recorded targets | pass |
| Decision/version target equality | pass |
| Version/current-protocol target equality | pass |
| Actual effective-date authority agreement | pass |
| Current-plan overwrite of archived exact targets | not observed |
| Exact target pair in legacy transition lineage | absent |

Overall classification: `canonical_history_correct_where_recorded_with_legacy_source_absence`.

## Remedy decision

No actual backend corruption was proven, so no repair specification or source-only correction candidate was created.

A production backfill would have no authoritative source for the missing earlier-phase numbers. Filling them from the later target, logged nutrition, wearable expenditure, DEXA, Briefings, assumed plans, or fixtures would fabricate history and violate the task's core rule. Altering the immutable decision's original projected-date input would also erase history rather than correct the actual effective boundary, which is already consistent.

If historical Energy presentation is revisited later, the safe read behavior is:

- emit the active later phase's targets and effective boundary from the matching immutable version;
- emit no exact targets for the earlier phase;
- label the earlier values unavailable/uncaptured rather than inferred;
- treat the reconciled phase/version boundary as actual effective history and the decision projection as historical authorization input.

That is a read-model concern, not a canonical data repair. It remains outside this corrected backend-cleanup task.

## Validation and change inventory

- Audit payload syntax: `node --check` passed.
- Final production audit: success marker observed after verified rollback.
- Runtime revision/version observed only as safe counters: 5550 / 5409.
- Code changes: none.
- Optional correction branch `codex/build93-energy-backend-correction-audit-20261008`: not created because no reproducible code defect or warranted repair exists.
- Heavy Next/Xcode work: not run.
- Native code/screens: not changed.
- Production records: not modified.
- Deployment/backfill/release/TestFlight/build-number changes: none.

## Held candidates

- Server historical read projection `e156e01138aaa7488426029d7a8a51d8dcb85954`: **ON HOLD**, not edited, rebased, merged, deployed, or recommended by this audit.
- Native history UI `1bb88fb5dedab189946f215f48248852ba719875`: **ON HOLD / out of corrected scope**, not edited, rebased, merged, built, released, or recommended by this audit.

## Final disposition

Backend correction required: **no**.  
Historical exact-value backfill permitted: **no authoritative source; do not fabricate**.  
Production mutation/deploy/release performed: **no**.  
Recommended next step: accept this audit as closure of the backend-cleanup card and keep both earlier candidates on hold unless the Founder separately opens a read-projection task.

This publication is report-only. `agent-handoffs/latest.json` and `agent-handoffs/latest.md` remain byte-for-byte unchanged as the accepted Native release authority.
