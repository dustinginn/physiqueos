# HealthKit Cardio graduation — Gate 5 (atomic policy APPLY) + Gate 6 (read-only verification)

Generated: 2026-09-25 (UTC ~15:55)
Task id: `claude-healthkit-cardio-gates-5-6-activate-verify-20260925`
Agent: Claude (HealthKit lane). Governing prompt: `agent-handoffs/inbox/prompts/20260925T110000Z-claude-healthkit-cardio-gates-5-6-activate-verify.md`.

## Result: GATE 5 APPLIED, GATE 6 PASSED. STOPPED. NO HISTORICAL WALK WAS RECONCILED.

**The workout policy family scope is now exactly `["cardio","strength"]` (prospective Cardio canonicalization is ON). Nothing else changed.** No deferred Cardio reconciliation, no historical workout mutation, no strategic-eligibility change, no backfill, no auto-confirm, no Server deployment, no Native upload/device operation, no historical briefing regeneration. The only production write in this task is the single guarded policy update plus its one audit row.

Authorization: the Founder's explicit authorization in the governing prompt, plus a plain-words chat confirmation given for the production write after the session's auto-mode classifier first blocked it (the classifier cannot see GitHub prompts). Authorization reference recorded in the audit row: `founder-chat-2026-09-25-cardio-gates-5-6-replace-families-strength-to-cardio-strength`.

## Gate 5 — what happened (all preconditions were fresh and exact immediately before the apply)
1. **Authority reverified:** Server `e88b8ef78fa236ce09660997f4084bde069018a7`, deployment `9727de79-588e-4445-9306-53b0ee26971e` ACTIVE, web+worker `source_commit_hash` exact, nothing pending, `/ready` healthy, `PROVIDER_MIGRATION_000014_APPLIED`; Build 60 accepted on the Founder's device (per the prompt; the phone was not operated).
2. **Fresh full read (270 observations, 9 workouts):** policy still Strength-only (`["strength"]`, version 3, digest `dc7ba152cf5e9dd528e380bed6bc0366`, effective 2026-09-23, open-ended, quarantined, no backfill, no auto-confirm); the deferred backlog was exactly the same four known walks (id hashes `c9d69996b1`, `25fff29121`, `3c5ef90420`, `99d4773c09` — cardio/walking, `family_not_in_activation_scope`, no `isIndoorWorkout` key, no canonical workout); all 9 workout rows, the policy record and all six HealthKit collection digests identical to Gate 3; no new workout observation (newest stored 2026-09-24T17:52Z).
3. **Fresh dry run, then apply, in one guarded script with hard aborts** (any deviation = exit before an apply payload is even built): the dry run returned exactly `dry_run`, target exactly `[cardio,strength]` (added `cardio`, dropped none), predicted mutations exactly two (policy update + one audit row), every non-family field preserved, policy digest `dc7ba152…` and counts (obs 270, canonical workouts 5, links 2, claims 4, days 9) exactly as read.
4. **The apply's `--expected` snapshot was built from THAT fresh dry run's `facts`** (never Gate 4's) and bound to `--expected-current-families strength` and `--expected-current-policy-digest dc7ba152cf5e9dd528e380bed6bc0366`. Apply started 15:48:31Z, runner exit 0 at 15:48:45Z, empty stderr, success marker observed once. **Outcome `applied`.** No drift/refusal. Single guarded transaction — no deactivate/reactivate gap.
5. **Runner's own in-transaction invariants all true:** `familiesAreExactlyTheTarget`, `onlyFamiliesFieldChanged`, `windowUnchanged`, `linkAutoConfirmUnchanged`, `strategicEligibilityQuarantined`, `noBackfillRequested`, `auditRowPresent`, `otherPolicyUntouched`, and observations / canonical days / canonical workouts / links / claims / evidence unchanged.

## New policy state (exact)
Record `healthkit_workout_canonical_activation_policy`: **`version 4`** (was 3), `status enabled`, `domains ["workout"]`, **`families ["cardio","strength"]`**, `effectiveLocalDate 2026-09-23` (preserved), `endLocalDate` absent/null (preserved), **`openEnded true`**, **`strategicEvidenceEligibility "quarantined"`**, **`historicalBackfill false`**, **`linkAutoConfirm false`**, `updatedAt 2026-09-25T15:48:43.485Z`, `schemaVersion healthkit-workout-activation-policy-v1` (unchanged).
- **New policy digest (runner `facts.policyDigest`, the value future operations must use as `expectedCurrentPolicyDigest`): `4e1c59ab2f09bf886cd69207eb22fed3`** (read post-apply via a zero-write `already_replaced` dry run).
- **Audit row:** `healthkit_workout_activation_audit_c237cca36ea3_replace-families` (kind `healthkit_workout_family_replacement_audit`, version 1, at `2026-09-25T15:48:43.485Z`; before `families ["strength"]` digest `dc7ba152cf5e9dd528e380bed6bc0366`; after `families ["cardio","strength"]` recorded digest `1d487f4b999cf45c54d10b7e288d3611`; `historicalBackfill false`; `strategicEvidenceEligibility quarantined`). Policy fields that changed vs pre-apply: ONLY `families`, `version` (3 -> 4), `updatedAt`, and `auditRecordId` (now the row above); every other key (incl. key presence) is identical — the policy record's own `authorizationReference` still holds the earlier 2026-09-23 reference, and the new authorization reference is recorded in the audit row.

## Gate 6 — immediate independent read-only verification (all `BEGIN … READ ONLY`, `transaction_read_only = on`, rolled back)
| Check | Result |
|---|---|
| Workout policy families exactly `[cardio,strength]`; enabled; openEnded | PASS |
| `strategicEvidenceEligibility` quarantined; `historicalBackfill` false; `linkAutoConfirm` false | PASS |
| Effective date 2026-09-23 / end date null preserved; domains `["workout"]` | PASS |
| Exactly one new workout audit row (4 workout audit rows now); `healthKitConfiguration` 14 -> 15 records | PASS |
| Activity/Nutrition daily policy record (`d5f0b571b6c046be9710a0551a6d4d23`) and graduation policy unchanged | PASS |
| **The 4 historical deferred walks still `workout_canonicalization_deferred / family_not_in_activation_scope`, uncanonicalized** | PASS |
| All 9 workout observation rows byte-identical to pre-apply (states, reasons, canonical existence) | PASS |
| Canonical workouts 5 -> 5, content identical (cardio 2 / strength 3); Strength links 2 and claims 4 unchanged; one-to-one integrity intact; 3 Logger Strength sessions unchanged | PASS |
| **No Cardio Logger session / link / claim created** (Cardio rows have no links; links/claims collections digest-identical) | PASS |
| Observations 270, canonical days 9, canonical workouts 5, links 2, claims 4, evidence 572 — counts and digests identical | PASS |
| Strategic: **34 of 35** strategic-collection digests identical (Goal, Confidence, briefing, plan, protocol, evidence, and 8 of 9 training collections); the single difference is `canonical_training_records/healthKitConfiguration` (14 -> 15 rows) = exactly the intended policy update + its one audit row (the HealthKit configuration lives in that table). `healthKitWorkoutsStrategicEligible 0`, not-quarantined 0, derived-in-strategic-evidence 0 | PASS (expected, by design) |
| Migrations unchanged (14, last `000014_evidence_intake_text_provenance`) | PASS |
| Control plane unchanged (deployment `9727de79` ACTIVE, `e88b8ef7`); `/live` 200; `/ready` healthy on 3/3 samples | PASS |
| Logs since the apply (web+worker): 0 error-level lines, 0 `settlement_gate_error`, 0 old-SHA lines; worker cadence ticks normal | PASS |
No unexpected mutation was found, so the stop condition did not trigger.

## Prospective behavior from now on
New Cardio-family workout observations are eligible for automatic canonicalization: `family` stays `cardio`; the specific canonical type preserves Apple's `isIndoorWorkout` metadata when Apple provides it (`indoor_walking`/`outdoor_walking`, and analogues); evidence stays **quarantined/descriptive** (no strategic eligibility); **no Logger session, Strength link or claim** for Cardio; whole-day Activity accounting is unchanged by workouts (`workoutEnergyAdded` invariant 0). Founder expects no workout today (Sep 25), so no prospective workout is expected before tomorrow.

## HISTORICAL vs PROSPECTIVE — which test is valid for what (important)
- **The four historical Sep 23/24 walks** (all stored without an `isIndoorWorkout` key; classify generic `cardio/walking`). **Useful later (separately authorized Gates 7/8) for:** bounded deferred reconciliation; canonical Cardio workout creation; Activity Detail workout rows; calorie decomposition / no double count; no Logger/link/claim; whole-day Activity invariance. **NOT valid for validating Indoor-vs-Outdoor fidelity** (their stored payloads lack the signal; it is unrecoverable and must never be inferred or backfilled from Founder memory, GPS, location, speed or date — they will present as generic Walking).
- **Tomorrow's first NEW Apple Watch Cardio workout** (post-activation, with `isIndoorWorkout` metadata) is the empirical acceptance for: source Apple workout type/metadata retained; correct Indoor/Outdoor canonical + display type; automatic canonicalization under the active Cardio policy; Activity Detail presentation; no Logger/link/claim; whole-day Activity accounting invariant. **Status: PENDING** (no post-deploy workout exists yet).

## Recommended next (each needs separate Founder authorization)
- **Gates 7/8, strictly serial, per entry, never batched:** for each of the 4 walks, take a FRESH inventory and a dry run of the deferred reconciliation immediately before its apply (the runner's drift fence hashes the FULL observation/canonical-workout collections, so applying entry N invalidates any pre-captured dry run for N+1). Use the NEW policy digest `4e1c59ab2f09bf886cd69207eb22fed3` where a policy digest is required; raw observation ids are held only in a local owner-only file and must be re-resolved fresh at execution. Stop conditions per entry are in `20260925T033000Z-healthkit-cardio-graduation-readiness.md` (Part D).
- Optionally wait for tomorrow's real workout first (prospective type-fidelity acceptance) before, or in parallel with, the historical reconciliation.

## Flags
AUTHORITY_REVERIFIED · FRESH_PREAPPLY_DRYRUN_PASS · FRESH_EXPECTED_SNAPSHOT_USED · GATE5_POLICY_APPLY_PASS · CARDIO_ACTIVATED (policy scope, prospective only) · POLICY_FAMILIES_CARDIO_STRENGTH · NON_FAMILY_POLICY_FIELDS_PRESERVED · GATE6_POSTAPPLY_AUDIT_PASS · FOUR_DEFERRED_WALKS_STILL_DEFERRED · NO_CARDIO_LOGGER_LINK_CLAIM · STRATEGIC_STATE_UNCHANGED (only the intended healthKitConfiguration policy+audit rows changed) · PROSPECTIVE_CARDIO_CANONICALIZATION_ENABLED · HISTORICAL_WALKS_NOT_VALID_FOR_INDOOR_OUTDOOR_FIDELITY · GH_REPORT_PUBLISHED
TOMORROW_PROSPECTIVE_TYPE_FIDELITY_ACCEPTANCE_PENDING = true · DEFERRED_CARDIO_RECONCILED = false · PRODUCTION_MUTATED = true (workout-policy family replacement + one audit row only)

## Disk (STANDING_DISK_SAFETY)
No heavy operation; free space ~20 GiB throughout (floor 15). Local owner-only execution files (raw observation ids, expected snapshots) remain only in the agent job temp directory and are not committed. No raw observation id, credential, database binding or Founder evidence appears in this report.
