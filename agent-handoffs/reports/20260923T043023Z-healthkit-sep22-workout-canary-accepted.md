# Sep 22 HealthKit Workout canary: activated, synced once, audited — Strength canary ACCEPTED

Task id: `healthkit-sep22-workout-canary-activation-20260923`

## Authority reverified
Deployment `d4754b09-ff14-4c1f-ab9b-8d4ea5814d85` ACTIVE, `source_commit_hash = 4b362591cb5f80c599f8f45eb7f392de7c44a36f`, runtime labels `physiqueos-4b362591-20260923` / `4b362591…` on web and worker, `/live` 200; production branch head `4b362591`; Native `1c57556f` clean. All match the task's hints.

## Part 1 — pre-activation (all read-only, zero-write)
No drift from the GREEN readiness report: Workout policy OFF (no record); 0 workout observations; 0 canonical workouts / links / claims; `oneToOneIntegrity` all zero; `ambiguousAutoLinked 0`; 1 Logger strength session in the window; strategic leakage 0. Activity/Nutrition Sep 22 canonical days quarantined (activity revision 18 at this baseline — advanced from 16 by the ordinary automatic sync since the readiness report, as expected); 26 strategic-collection digests captured, including `canonical_evidence_records/canonicalEvidenceObjects` (the Logger-integrity baseline) and `dailyBriefings`.

Established dry-run (`healthKitActivationPolicy.entry.mjs`, `REPEATABLE READ READ ONLY` + `ROLLBACK`): outcome `dry_run`, predicted policy `{status: enabled, domains: ["workout"], effectiveLocalDate: 2026-09-22, endLocalDate: 2026-09-22}`, `rawWorkoutObservationsInWindow: 0` (nothing stuck raw), expected facts captured for the apply's drift fence.

## Part 2 — authorization and activation
Founder asked in chat (with push notification) for explicit authorization naming the exact semantics: workout kind only, 2026-09-22 → 2026-09-22, quarantined, no backfill, no auto-confirm, no open-ended window, daily policy untouched, one policy record + one audit row. Founder replied "Approved".

Apply (authorization reference `founder-chat-approved-2026-09-23T04:20:19Z-…`, expected facts from the dry-run): outcome `applied`, no drift, policy version 1, audit record `healthkit_workout_activation_audit_4d80e6678b07_activate`. Written policy verified equal to the intended values. All 12 in-transaction invariants true: `policyIsExactlyTheAuthorizedRecord`, `strategicEligibilityQuarantined`, `noBackfillRequested`, `linkAutoConfirmOff`, `auditRowPresent`, `otherPolicyUntouched`, `observationsUnchanged`, `canonicalDaysUnchanged`, `canonicalWorkoutsUnchanged`, `linksUnchanged`, `claimsUnchanged`, `evidenceUnchanged`.

Post-activation audits: Workout policy `enabled` for exactly 2026-09-22..2026-09-22 (`quarantined`, `historicalBackfill false`, `linkAutoConfirm false`), still 0 workout observations; daily policy, A/N canonical days, strategic counts and all 26 digests identical to the pre-activation baseline.

## Part 3 — Founder device checkpoint, and the one deviation from the task text
The Founder opened Founder Production on Build 53 with the Workout day at 2026-09-22 and reported **"Sync workouts for this day" disabled**, without tapping anything else. Diagnosed from Build 53 source before any further instruction (`HealthKitFounderCanaryView.swift`, `HealthKitFounderCanaryCoordinator.swift`, `AppEnvironment.swift`):

`canSyncWorkouts = canaryEnabled && healthKitFounderCanaryCoordinator.authorizationWasExplicitlyRequested && !working`. `canaryEnabled` is the top-card **"Enable this canary"** toggle (`@State`, false on every open). `authorizationWasExplicitlyRequested` is an in-memory flag on a **canary-only** `HealthKitAuthorizationCoordinator` instance (separate from the automatic coordinator's, which is already authorized), set only by the card's "Request Apple Health authorization" button — itself feature-gated until the toggle is on. Turning the toggle on calls only `setEnabled(true)` and clears a stale result; **nothing runs automatically** off it — the Activity historical-validation upload has exactly one caller, its own "Run foreground Activity validation" button.

So the task's "do NOT turn on the older toggle" was written on a mistaken model of the UI: the Workout control cannot be enabled without it, and the instruction's real intent (do not run Activity/Nutrition validation) is met by not tapping those two buttons. Corrected instruction given and followed: toggle ON → "Request Apple Health authorization" → do not tap "Run foreground Activity validation" or "Sync test day now" → tap "Sync workouts for this day" once. Founder's acknowledgement: Workout day 2026-09-22, **Workouts uploaded 3, Pending batches 0, Server canonicalized 3 workout(s)**, no error. "Sync test day now" was visibly enabled and left untouched.

Non-blocking UX gap for the record: the Workout control lives behind a section labeled "Activity validation". Not a code defect; no build needed.

## Part 4 — post-sync audit (read-only, hashed identifiers, `--no-values`)
- Raw workout observations: **3**, all `operational | workout_canonicalized`.
- Canonical workouts: **3** — `strength: 1` (`traditional_strength_training`), `cardio: 2` (`walking` ×2); all `localDate 2026-09-22`, basis `workout_start_in_workout_time_zone`, revision 1, `evidenceEligibility quarantined`, `strategicEligible false`, `activityInteraction.additiveToDailyActivity false`, `contentAuthority.trainingContent = workout_logger`.
- **Strength workout ↔ Logger session**: stored and live assessment both `confident_match`, reason `single_overlapping_session`, 1 candidate, confidence 99, `unverifiableSessionCount 0`; exactly one link, **status `candidate`**, `createdBy system_matcher`, to the single Sep 22 Logger strength session. Not confirmed — by design (`linkAutoConfirm false`); confirmation is a later explicit slice.
- Ambiguity: `ambiguousAutoLinked 0`; `linkStatusCounts {candidate: 1}`; no `confirmed`.
- **Outdoor Walk / cardio separation**: both walks `no_match / not_a_strength_workout`, `links []`, coexistence only — they cannot attach to the Strength Logger session.
- Multiple same-day workouts: 3 distinct canonical workouts, `duplicateCanonicalWorkoutsByWindow 0`, `possibleDuplicateCanonicalWorkouts 0`.
- Idempotency: server log around the tap shows 4 `committed` + 4 `replayed` `healthkit.observations.ingest.v1` receipts, **0 × 409, 0 × INTERNAL_ERROR**, no non-401 `api.request.failed` — replays resolved gracefully (the earlier idempotency-race fix at work). The Build 53 `sourceRevision` limitation was **not encountered**.
- Logger strength detail integrity: `canonical_evidence_records/canonicalEvidenceObjects` **rows 568 → 568, digest identical**; `evidencePackages` 336 → 336 identical. No exercises/sets/reps/loads/variants/supersets/notes touched.
- Duplicate detailed Training session: **none** (evidence digest and row count unchanged).
- Claims: 0; `oneToOneIntegrity` all zero.
- Workout strategic/V3/Confidence/briefing eligibility: `healthKitWorkoutsStrategicEligible 0`, `healthKitWorkoutsNotQuarantined 0`, `healthKitDerivedRecordsInStrategicEvidence 0`; `dailyBriefings` 52 → 52 and `analyses` 408 → 408 digests identical — **no briefing regeneration**.
- Activity/Nutrition: daily policy identical; nutrition day identical (revision 2); **all 26 strategic digests identical**; migrations 14 → 14. The activity day advanced 18 → 21 during the window — the only changed observation state is `activity_summary | operational | activity_day_canonicalized` 18 → 21, i.e. the ordinary automatic Activity sync firing on the Founder's foregrounds on a still-live day; provenance basis `healthkit_activity_summary_daily_total` and coexistence `no_other_source` unchanged; the Workout path is proven (code + invariants) never to write canonical days, and workout energy is `never additive`.

## Acceptance
**Strength canary: ACCEPTED.** Apple Health Strength Training was safely ingested and canonicalized, reconciled to the correct existing Logger strength session as a confident candidate (not auto-linked), the Logger remains authoritative and byte-identical, no duplicate detailed Training session, no unsafe ambiguous auto-link.

**Outdoor Walk: accepted as separate.** Both walks became unmatched canonical cardio workouts (`no_match`, quarantined, coexistence-only), exactly as designed. Implication for future cardio work: cardio canonical workouts already exist and stay isolated; a cardio canary would exercise `assessHealthKitCardioCoexistence` against exercise-less training evidence and, later, cardio graduation — none of that was executed or graduated here.

## Next bounded step (specified, not executed)
1. Link confirmation slice: the strength `candidate` link needs an explicit Founder confirmation command through the guarded service (registered canonical port; claim row; `confirmHealthKitWorkoutRelationship`), with the reviewer's pre-canary note addressed first (restore of a system-released link can throw a one-to-one violation).
2. Only after that: a bounded cardio canary on a single date, then Workout graduation decisions — not in this task.
3. Native (non-blocking, next candidate whenever one is cut): emit `sourceRevision` for workouts so revised HKWorkout aggregates apply rather than 409; consider moving the Workout control out from behind the "Activity validation" gate. The pending formatting-only Native work is irrelevant (formatting was Server-side and is deployed).

## Flags
- WORKOUT_PREACTIVATION_GREEN: YES
- FOUNDER_AUTHORIZED_WORKOUT_CANARY: YES ("Approved" in chat, after exact semantics stated)
- SEP22_WORKOUT_CANARY_ACTIVATED: YES (applied, 12/12 invariants)
- WORKOUT_POLICY_EXACT_DATE_ONLY: YES (2026-09-22..2026-09-22)
- FOUNDER_WORKOUT_SYNC_COMPLETED: YES (single tap; 3 uploaded / 0 pending / 3 canonicalized)
- WORKOUT_OBSERVATIONS_RECEIVED: YES (3)
- STRENGTH_WORKOUT_OBSERVATION_RECEIVED: YES
- STRENGTH_CANONICAL_WORKOUT_CREATED: YES
- STRENGTH_MATCHED_CORRECT_LOGGER_SESSION: YES (confident_match 99, candidate only)
- AMBIGUOUS_MATCH_AUTO_LINK_PREVENTED: YES (0 ambiguous auto-links; no confirmed links)
- OUTDOOR_WALK_OBSERVATION_RECEIVED: YES (2 walks)
- OUTDOOR_WALK_REMAINS_SEPARATE: YES
- DUPLICATE_TRAINING_SESSION_PRESENT: NO
- LOGGER_DETAIL_MUTATED: NO (evidence digest identical)
- WORKOUT_V3_ELIGIBILITY_ENABLED: NO
- ACTIVITY_NUTRITION_UNCHANGED: YES (policy/nutrition/digests identical; activity advanced only via its own automatic sync)
- STRENGTH_CANARY_ACCEPTED: YES
- READY_FOR_CARDIO_CANARY: YES, after the link-confirmation slice
- SECOND_SYNC_REQUIRED: NO
- CODE_FIX_REQUIRED: NO
- SECRETS_EXPOSED: NO
