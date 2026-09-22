# healthkit-completed-day-audit-20260922 - completion report

Task id: healthkit-completed-day-audit-20260922

## Verdict: GREEN

Every GREEN criterion is met: exact completed values, correct date, singleton canonical days both domains, correct revision lineage, complete final state, no unresolved material source conflict, zero fabricated meals, strategic quarantine held throughout, and graduation plumbing verified dormant and ready.

## Authority reverified (live, not trusted from the prompt)

Production Server 93491bc5d829d3693aa29023cd79e96922012130, deployment 1156849f-d5af-47ec-a5d3-d247a99033ee, ACTIVE on web and worker, health live and ready 200. Installed Native Build 49 at 2bfbf54ad105a3a18189e811f06afc421741a7da (confirmed against origin/native/build49-candidate). Prepared next Native candidate c116867f remains unshipped (confirmed against origin/claude/healthkit-graduation-native). All match the prompt's expected values.

## Audit method

Read-only, owner-scoped, bounded queries through the established production console-runner path: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, `SHOW transaction_read_only` fenced to `on`, explicit `ROLLBACK` in every payload, gated on the exact live Server SHA. Three payloads: the existing acceptance-audit operation (`--kind audit`), a raw per-observation query directly against `healthKitObservations` and `healthKitCanonicalDays` for 2026-09-21 built for this task (to compare the canonical record field-by-field against the specific final raw observation, not just an aggregate), and the Workout audit (`--kind workout-audit`) plus a graduation-policy dry run with an empty desired scope (reports current state only; changes nothing). PRODUCTION_MUTATED_DURING_AUDIT = NO: every payload ran in a read-only-fenced transaction that rolled back; no code was modified, no policy was written, no resync or upload occurred.

## Three-sync lineage, Activity

Three raw HealthKit observations for 2026-09-21, each individually canonicalized (state `activity_day_canonicalized`), strictly increasing device-scoped `sourceRevision` 1 -> 2 -> 3, same delivery device throughout:

| Sync | Received (UTC) | Local time | Coverage | Move calories | Exercise min | Stand hrs | Steps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (initial partial) | 2026-09-21T19:49:48Z | ~12:49 PM PT | partial_day | 709.93 | 98 | 6 | 5,321 |
| 2 (later partial) | 2026-09-22T04:58:37Z | ~9:58 PM PT | partial_day | 934.82 | 101 | 13 | 8,401 |
| 3 (completed) | 2026-09-22T12:32:39Z | ~5:32 AM PT | complete_day | 934.82 | 101 | 13 | 8,439 |

Each later sync superseded the same logical day rather than duplicating it: the canonical Activity record's `revisionHistory` holds exactly the two superseded states (revision 1, archived when revision 2's observation was received; revision 2, archived when revision 3's observation was received), and the current record is revision 3. `duplicateCanonicalDays` is empty. Final canonical values (revision 3, coverage complete_day) match the final raw observation exactly: move_calories 934.8199999999977, exercise_minutes 101, stand_hours 13, steps 8,439, plus the approved supplemental `walking_running_distance` field (7,042.95 m), all field-for-field identical to the third raw observation. Provenance: Apple Health / HealthKit / bundle com.apple.Health. Evidence eligibility: quarantined. Duplicate count: 0. Reconciliation with the separately-tracked, pre-existing Apple Fitness screenshot Activity day for the same date: `consistent`, zero conflicting fields (the two independent records agree within tolerance; neither was merged or overwritten -- graduation projection is off, so they remain two separate records).

## Three-sync lineage, Nutrition

| Sync | Received (UTC) | Local time | Coverage | Calories | Protein g | Carbs g | Fat g |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (initial partial) | 2026-09-21T19:49:49Z | ~12:49 PM PT | partial_day | 1,947.75 | 170.48 | 115.74 | 86.97 |
| 2 (later partial) | 2026-09-22T04:58:37Z | ~9:58 PM PT | partial_day | 2,405.51 | 178.25 | 173.88 | 109.47 |
| 3 (completed) | 2026-09-22T12:32:39Z | ~5:32 AM PT | complete_day | 2,405.51 | 178.25 | 173.88 | 109.47 |

Same revision-lineage proof as Activity: two archived revisions, current revision 3, no duplicate canonical day. The completed sync's totals are numerically identical to the 9:58 PM partial (no further food was logged between them); only the coverage flag advanced from partial_day to complete_day, which the canonical-day fingerprint deliberately treats as a material state change (coverage participates in the semantic fingerprint) -- completeness advanced correctly even with unchanged numbers. Final canonical values match the final raw observation exactly: calories 2405.5120239257812, protein_g 178.25211715698242, carbs_g 173.8842658996582, fat_g 109.46525192260742. mealObjects: 0 -- zero fabricated meals, confirmed both in the stored record and by code inspection (the graduation/canonicalization path never creates a meal object for a HealthKit daily total). Assertion: tier full_day_asserted, origin device_aggregate, reliability high, energyUsable true, energyCompleteness complete. Provenance: Apple Health / HealthKit / bundle com.apple.Health. Duplicate count: 0. Reconciliation with the separately-tracked, pre-existing MyFitnessPal screenshot Nutrition day for the same date: `consistent`, zero conflicting fields.

## Strategic quarantine

Held throughout, with hard zero counters read live from production: healthKitCanonicalDaysStrategicEligible 0, healthKitCanonicalDaysNotQuarantined 0, healthKitActivityEligible 0, healthKitNutritionEligible 0, healthKitDerivedRecordsInStrategicEvidence 0, healthKitDerivedRecordsInStrategicEvidenceWithinWindow 0. No HealthKit-derived record has ever entered the strategic Evidence collection, so Confidence, briefings, Training and strategy could not have been, and were not, changed by this test (strategic Evidence is the only input those systems read).

## Graduation plumbing: dormant and ready

Both graduation-policy scopes resolve to disabled in production (`healthkit_canonical_graduation_policy` does not exist as a record; `resolveHealthKitGraduationPolicy` on an absent record returns both scopes off). Workout activation policy: disabled, 0 canonical workouts, 0 links, all one-to-one integrity counters zero, all Workout strategic-eligibility counters zero. A live, read-only graduation dry run (empty requested change, reporting current state only) executed successfully in production, demonstrating the dry-run/simulation capability itself is live and functional without writing anything. The explicit Founder-correction guard, the historical-briefing-regeneration prohibition, and every other safeguard reviewed in the prior task are part of the exact deployed SHA (93491bc5) already active in production -- there is nothing further to activate in code for a dry run or projection/eligibility switch to work when authorized. c116867f remains the reviewed next-build Native lineage carrying both the Activity/Nutrition graduation UI and the Workout canary capability; it has not been built or uploaded.

## Recommended next steps (not executed)

1. Archive, upload and install Build 50 from the reviewed c116867f candidate.
2. Run the graduation dry run for 2026-09-21 and review its predicted Log rows, Energy inputs, duplicate-suppression outcome and V3 eligible-day count.
3. Founder-authorize and apply the projection scope; verify the Log, Activity/Nutrition detail and history, and Evidence Hub rows render correctly with the Apple Health source label.
4. Founder-authorize and apply the evidence-eligibility scope separately; verify V3 sees the canonical facts once (no duplicate observation) and that no historical briefing regenerated.
5. Only after Activity/Nutrition graduation is accepted: the strength Workout canary (a single clean session, no back-to-back ambiguity), then cardio, then background delivery and a durable Native revision floor.

## Flags

COMPLETED_ACTIVITY_MATCHES_HEALTHKIT=YES
COMPLETED_NUTRITION_MATCHES_HEALTHKIT=YES
ACTIVITY_SINGLE_CANONICAL_DAY=YES
NUTRITION_SINGLE_CANONICAL_DAY=YES
ACTIVITY_REVISION_LINEAGE_CORRECT=YES
NUTRITION_REVISION_LINEAGE_CORRECT=YES
COMPLETED_STATE_REPLACED_PARTIAL_STATE=YES
NUTRITION_ZERO_MEALS_VALID=YES
MATERIAL_SOURCE_CONFLICT=NO
HEALTHKIT_ACTIVITY_V3_ELIGIBLE_DURING_TEST=NO
HEALTHKIT_NUTRITION_V3_ELIGIBLE_DURING_TEST=NO
CONFIDENCE_CHANGED_BY_TEST=NO
BRIEFING_CHANGED_BY_TEST=NO
TRAINING_CHANGED_BY_TEST=NO
GRADUATION_PROJECTION_POLICY_ENABLED=NO
GRADUATION_EVIDENCE_POLICY_ENABLED=NO
WORKOUT_ACTIVATION_ENABLED=NO
BUILD50_GRADUATION_CANDIDATE_READY=YES
TESTDAY_FINAL_VERDICT=GREEN
READY_FOR_HEALTHKIT_GRADUATION=YES
PRODUCTION_MUTATED_DURING_AUDIT=NO

## Notes

No code was changed, no deployment occurred, no policy was written, and no resync/graduation/upload was triggered in this task, per its own explicit scope. All figures above were read directly from production canonical records in read-only, rolled-back transactions and cross-checked field-by-field against the corresponding raw HealthKit observation; nothing was estimated or inferred.
