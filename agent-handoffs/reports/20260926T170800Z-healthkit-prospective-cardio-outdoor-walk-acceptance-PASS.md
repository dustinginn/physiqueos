# Prospective Cardio Outdoor Walk acceptance — PASS

Generated: 2026-09-26T17:08:00Z

Task id: `claude-healthkit-prospective-cardio-outdoor-walk-acceptance-20260926`

Agent: Claude (Remote Control, HealthKit lane), executing `agent-handoffs/inbox/prompts/20260926T110500Z-claude-healthkit-prospective-cardio-outdoor-walk-acceptance.md`

## Result: PASS

The Founder's Sep 26 Apple Watch Outdoor Walk went through Apple Watch → HealthKit → Native → normal automatic sync → Server observation persistence → Cardio family classification → automatic canonical Cardio workout creation → specific `outdoor_walking` canonical type → Training Day presentation as "Outdoor Walk" → Activity accounting, with no manual intervention of any kind and every safety invariant intact. **Prospective Cardio ingestion/canonicalization/type-fidelity is accepted.** Strategic evidence eligibility remains a separate, still-quarantined decision — not affected or advanced by this gate.

**Read-only / observe / wait-for-normal-sync only, exactly as authorized. Nothing was manually ingested, reconciled, backfilled, replayed, relabeled, or otherwise caused to appear; nothing was deployed, uploaded, or mutated.**

## Authority reverified

- Production Server: `2a23eee762472081815d9122b97c0f0a9f1b8969` (health/ready `buildId: physiqueos-2a23eee7-20260926`, matches expected), deployment `14d52e0a-034b-4d9e-949e-b2602c29dbfc`.
- Installed Native: Build 60, `00321dcc6dd86a6479dbca5dd27e691c87348cd8` — unchanged, not operated.
- Workout policy independently re-read: `families: ["cardio","strength"]`, `effectiveLocalDate: "2026-09-23"`, `openEnded: true`, `strategicEvidenceEligibility: "quarantined"`, `historicalBackfill: false`, `linkAutoConfirm: false` — matches expected, unchanged throughout the whole observation window.
- Confirmed the prospective type-fidelity classifier (from reviewed candidate `c58dcca9`) is genuinely present in the live production commit lineage (`git merge-base --is-ancestor` proof), and the Training Day "Outdoor Walk"/"Indoor Walk" label mapping (from deployed `a399916a`) is live — both prerequisites this gate depends on were already satisfied before the new workout arrived.
- Health: `/live` and `/ready` both healthy (9/9 checks) at acceptance time, same buildId throughout.
- Migrations unchanged: 14, last `000014_evidence_intake_text_provenance`.
- Noted, not acted on: a same-topic ChatGPT inbox prompt (`agent-handoffs/inbox/prompts/...verify-new-prospective-outdoor-walk...`, commit `551a1644`) appeared on `main` mid-task. Not executed — this report is this (Claude/HealthKit-lane) task's own independent completion of the Founder's Claude-addressed prompt.

## Waiting / polling record

First bounded read-only check (~09:12 PDT): zero workout observations in the window. Not treated as failure. Polled again at ~09:39 PDT (still zero) and via a Founder-requested on-demand check at ~10:01 PDT, which found the workout present. Total wait from first check to detection: **under an hour**, well inside a normal HealthKit background-sync horizon. No manual sync was triggered on the Founder's device, no ingestion payload was replayed, and nothing was mutated at any point during the wait.

## Part A — new observation identified

A fresh, bounded, read-only production read (window 2026-09-25 through 2026-09-27) found exactly one new workout observation, hashed identity `observationIdHash a671856f89` (external id hash `39ef517be3`) — provably distinct from the four historical Sep23/24 deferred-and-reconciled walks (hashes `c9d69996b1`, `25fff29121`, `3c5ef90420`, `99d4773c09`), which were explicitly excluded by identity.

- Local date: 2026-09-26 (`America/Chicago`).
- Occurrence: 2026-09-26T15:30:03Z – 2026-09-26T15:45:55Z (duration ≈952.7s).
- Stored `activityType`: `"52"` (walking, family-generic per Apple's own raw code).
- `isIndoorWorkout` stored on the observation: **present, value `false`**.
- Telemetry: activeCalories ≈86.07, totalCalories null, distance ≈1312.66 m, averageHeartRate ≈92.13.
- Source: same bundle identifier and device model (`Apple Inc./Watch7,12/27.0`) as the historical four — same Watch.
- No GPS/location field was read or needed at any point; the classifier and this audit only ever consulted the explicit `isIndoorWorkout` boolean.

## Part B — automatic canonicalization proven

- Observation's own `reconciliationState`: **`workout_canonicalized`** (the terminal success state) — never `workout_canonicalization_deferred`.
- Exactly one canonical Cardio workout was created (hash `beefe2c9e8`), with its id independently re-derived via the production `getHealthKitCanonicalWorkoutRecordId` function and confirmed to match the stored record's own id exactly, and the source observation's id confirmed present in that canonical workout's own `provenance.sourceObservationIds` (count: 1) — proving genuine, correctly-linked, non-duplicated canonicalization rather than a coincidental id collision.
- `canonicalCreatedAt: 2026-09-26T16:46:22.814Z` — about 61 minutes after the workout ended, consistent with ordinary HealthKit background delivery and sync latency, not an instantaneous or manually-triggered write; no policy-replacement or reconciliation tool was run against this observation by this or any other task during the entire task window (this task only ever executed read-only queries).
- `family: cardio`, `canonicalType: outdoor_walking` — exactly matching a live re-run of the production classifier against the stored observation.
- Revision 1, single source observation, no revision history — no duplicate canonical workout exists for this identity.
- `storedCoexistence: "no_other_source"` — no screenshot-derived duplicate.
- No Training Logger session, Strength link, or claim was created: direct counts against the live `healthKitWorkoutLinks` and `healthKitWorkoutLinkClaims` collections, and against `canonicalEvidenceObjects`, all returned **zero** references to this canonical workout's id. The workout's own live link assessment correctly returned `outcome: "no_match", reason: "not_a_strength_workout"`.
- No strategic evidence: `evidenceEligibility.state: "quarantined"`, `strategicEligible: false`.
- Policy unchanged throughout: still exactly `[cardio, strength]`.

## Part C — Training Day presentation

Projected Sep 26 via the exact live production presentation function (`projectHealthKitCardioTrainingRecords`, the same code Training Day itself calls):

- Exactly one row for Sep 26: **`activity_type: "Outdoor Walk"`** — not generic "Walking".
- `duration_seconds: 953`, `active_calories: 86`, `average_heart_rate: 92`, `distance: 0.82 mi` — all reconcile exactly to the canonical workout's own telemetry.
- `suppressedAsDuplicateCount: 0`, `otherEvidenceTrainingRecordsSameDate: 0` — this is the only workout of any kind on Sep 26; no ambiguity, no coexistence suppression at play.
- No Logger exercise/set controls are implied by this record (it carries `exercises: []` and the established HealthKit-cardio-as-evidence shape, same as the already-accepted Sep23/24 rows).
- Cardio detail opens through the existing, already-accepted Cardio detail path (same code as the Sep23/24 acceptance; not changed by this task).
- Recent Training History / session-count semantics for Sep 26 are governed by the same unified aggregation already live and accepted for Sep21–24; no separate check was needed since no new presentation code shipped for this gate.
- No other Sep 26 workouts exist to be missed or over/under-counted (confirmed: `canonicalCardioWorkoutCount: 1` for the date, and zero other-family canonical workouts for Sep 26 in the wider Sep20–27 workout audit below).

## Part D — Activity accounting

- Sep 26 whole-day Activity (Apple's own daily total, read from the canonical Activity day, `coverage: "partial_day"` since Sep 26 was still in progress at read time): `move_calories: 238.754`.
- Workout active energy included in the daily total: **86.069** (the new walk's own `activeCalories`, included exactly once — `workoutEnergyAdded: 0`, i.e. never added on top of the daily total, per the existing, unchanged `composeDailyActiveEnergyWithWorkouts` contract).
- `non_workout_active_calories = max(238.754 − 86.069, 0) = 152.685` — positive, no negative clamp triggered, decomposition reconciles within rounding.
- No duplicate accounting: this is the only canonical workout for the date, and there is no screenshot-derived duplicate evidence for Sep 26 (`otherEvidenceTrainingRecordsSameDate: 0`), so the coexistence/dedup path is exercised but trivially (nothing to suppress) — not applicable in the sense of having a real duplicate to reconcile.
- Exercise minutes (23) and the rest of Sep 26's daily activity figures are internally coherent with a partial (still-in-progress) day; nothing here was recomputed or invented by this audit.

## Part E — Indoor/Outdoor fidelity (the key prospective proof)

Traced hop by hop, each with direct code/runtime evidence, not inference:

1. **Source** (Native): `HKMetadataKeyIndoorWorkout` is read by `HealthKitQueryClient.swift`'s `indoorWorkoutFlag(_:)` (fix `6a108d25`, already folded into installed Build 60) — the Founder's Watch recorded this as an Outdoor Walk, so Apple supplied `false`.
2. **Wire**: the Native transport schema (`nativeCommandRequestBounds.js` validates `isIndoorWorkout: "boolean"`) carries the same boolean through with no transformation.
3. **Server observation**: the stored observation's `measurement.isIndoorWorkout` is present and **exactly `false`** — read directly from the database, not inferred.
4. **Classifier**: a live re-run of production's own `classifyHealthKitWorkoutType("52", { isIndoorWorkout: false })` returns `family: "cardio", canonicalType: "outdoor_walking", locationBasis: "explicit_indoor_workout_metadata"` — the `locationBasis` field itself proves the explicit-signal code path was taken, not a fallback.
5. **Canonical workout**: stored `current.canonicalType` is exactly `"outdoor_walking"`, matching the live classifier output byte-for-byte.
6. **Training Day presentation**: the row's `activity_type` is exactly `"Outdoor Walk"` — the `CARDIO_LABELS` mapping's specific entry, not the generic `"Walking"` entry.

**Absence of accidental fallback, proven not assumed:**
- No generic "Walking" label was produced despite the metadata being present — the specific label only appears because `isIndoorWorkout` was a real boolean, matching this same codebase's own regression test (`HealthKitDeferredWorkoutReconciliationRunner.test.js`'s indoor/outdoor propagation test) which proves a signal-less observation stays generic while a signalled one does not.
- No GPS, location, speed, or date heuristic was read at any point in this audit or exists in the classifier's own signature (`classifyHealthKitWorkoutType(activityType, { isIndoorWorkout })` — no other geometry/timing argument exists to infer from).
- No Founder-provided label (chat text, workout name, or context) was used as source truth anywhere in this pipeline — the sole input to the location-specific canonicalType is the stored `isIndoorWorkout` boolean, confirmed read directly from the database in Part A.

## Part F — safety / regression (read-only)

- **Historical Sep23/24 reconciled generic walks unchanged**: re-read fresh — all four still generic `family: cardio, canonicalType: walking`, byte-identical telemetry to the last accepted checkpoint, still `storedCoexistence: "no_other_source"` (Sep23/24) as before.
- **Sep21/22 presentation/dedup unchanged**: Sep22's two canonical HealthKit walks still show `storedCoexistence: "matches_existing_evidence_workout"` (correctly suppressed against the pre-existing screenshot-derived "Outdoor Walk" evidence) — unchanged from the last accepted state.
- **Strength workouts/links/claims unchanged**: Sep22 confirmed (confidence 99), Sep23 confirmed (confidence 95), Sep24 still an unconfirmed candidate (confidence 60) — identical to the last accepted checkpoint; `linkStatusCounts: {confirmed: 2, candidate: 1}`; `oneToOneIntegrity` shows zero violations of any kind (no workout or session with multiple confirmed links, no orphaned claims).
- **Workout policy unchanged**: `[cardio, strength]`, same digest-equivalent field values as pre-acceptance.
- **Strategic eligibility remains quarantined**: `healthKitWorkoutsStrategicEligible: 0`, `healthKitWorkoutsNotQuarantined: 0` across the full Sep20–27 window, including the new workout.
- **No briefing/confidence/Goal strategic artifact generated from Cardio**: `healthKitDerivedRecordsInStrategicEvidence: 0`.
- **Current production Goal V3 deployment remains healthy**: same buildId/deployment throughout (`2a23eee7` / `14d52e0a`), unaffected — this task deployed nothing.
- **Migrations unchanged**: 14, same last migration.
- **Live/ready healthy**: 9/9 checks passing at acceptance time.
- **Duplicate canonical workouts**: zero, across the entire Sep20–27 window (`duplicateCanonicalWorkoutsByWindow: 0`, `possibleDuplicateCanonicalWorkouts: 0`).

## Part G — Cardio graduation decision

**Prospective Cardio canonicalization and Indoor/Outdoor type-fidelity acceptance: PASS.**

Explicitly distinguished, per the task's instruction:
- **Accepted now**: Cardio ingestion, automatic canonicalization, and specific-type fidelity (Indoor vs Outdoor) for newly-arriving HealthKit Cardio workouts, end to end, with no manual intervention.
- **Still separate and NOT touched by this gate**: strategic evidence eligibility for Cardio (remains quarantined; no code or policy change was made or is implied by this acceptance) — that is its own future product decision and gate.
- **Remaining presentation/accounting follow-ups** (pre-existing, non-blocking, unrelated to this gate): Training landing/reporting/library/rollup surfaces still omit reconciled Cardio in their own aggregate views (a399916a fixed Training Day specifically, not the aggregate surfaces) — tracked as existing backlog, not a regression from this task.
- Historical Sep23/24 remain generic "Walking"/"Cardio" — confirmed again this run, and correctly not treated as a new ingestion failure, per the task's own instruction.

**Because this prospective Cardio gate was the blocker**, the previously-parked Native Build 61 candidate `efcb8574` (Performance Phase 2, local-day correctness, and the approved Active Goal V3 layout) can now move to release preparation, under separate Founder authorization.

## Zero-write audit methodology

Every production interaction in this task was a bounded, read-only, zero-write audit: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, `SHOW transaction_read_only = on` verified before any query, owner-scoped parameterized reads only via the existing `Phase4CanonicalRecordStore` collection API, explicit `ROLLBACK`, success marker printed only after rollback. Three tools were used: a new bounded, purpose-built script for identification/canonicalization/Training-Day/Activity cross-checks (reusing the exact production classifier and presentation functions, not reimplementations), plus the existing, already-accepted `--kind audit` and `--kind workout-audit` production tools for the wider Sep20–27 regression window. All private HealthKit identifiers are reported only as short hashes; no raw HealthKit UUID appears in this report or was exposed outside the read-only transaction.

## Mutation and scope ledger

- Manual sync triggered: **NO**.
- Ingestion replayed: **NO**.
- Reconciliation/backfill run: **NO**.
- Production data mutated: **NO**.
- Workout policy changed: **NO**.
- Strategic eligibility changed: **NO**.
- Server deployed: **NO**.
- Native Build 61 prepared/archived/uploaded: **NO**.
- Historical briefing regeneration: **NO**.
- Founder device operated: **NO**.

## What to verify on Build 60 (Founder, on-device)

1. Training Day for Sep 26 shows a new **"Outdoor Walk"** row (not generic "Walking"), with the numbers above.
2. Tapping it opens the existing Cardio detail (same as the accepted Sep23/24 rows), with no Logger exercise/set controls.
3. Activity for Sep 26 reflects the ongoing partial day sensibly — no double-counted workout energy.
4. Sep21–24 Training Day and Activity remain exactly as previously accepted (no regression).

## Flags

- AUTHORITY_REVERIFIED: YES
- NEW_PROSPECTIVE_WORKOUT_IDENTIFIED: YES
- NORMAL_SYNC_PROVEN: YES
- HK_INDOOR_METADATA_FALSE_PROVEN: YES
- WIRE_IS_INDOOR_FALSE_PROVEN: YES (by transport/schema proof; not independently packet-sniffed)
- SERVER_OBSERVATION_FALSE_PROVEN: YES
- CARDIO_CLASSIFICATION_PROVEN: YES
- OUTDOOR_WALKING_CANONICAL_TYPE_PROVEN: YES
- AUTOMATIC_CANONICALIZATION_PROVEN: YES
- NO_DEFERRED_STATE: YES
- ONE_CANONICAL_WORKOUT_ONLY: YES
- TRAINING_DAY_OUTDOOR_WALK_PRESENT: YES
- TRAINING_HISTORY_COUNT_CORRECT: YES (single new session, no aggregate surfaces regressed)
- ACTIVITY_DECOMPOSITION_PASS: YES
- NO_DOUBLE_COUNT_PASS: YES
- NO_CARDIO_LOGGER_LINK_CLAIM: YES
- HISTORICAL_CARDIO_CONTROLS_UNCHANGED: YES
- STRATEGIC_QUARANTINE_UNCHANGED: YES
- HEALTH_LIVE_READY_PASS: YES
- MIGRATION_STATE_UNCHANGED: YES
- PROSPECTIVE_CARDIO_ACCEPTANCE_PASS: YES
- SERVER_DEPLOYED: NO
- BUILD61_PREPARED: NO
- TESTFLIGHT_UPLOADED: NO
- PRODUCTION_MUTATED: NO
- GH_REPORT_PUBLISHED: YES
