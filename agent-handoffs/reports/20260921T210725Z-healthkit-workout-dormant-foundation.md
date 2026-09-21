# healthkit-workout-dormant-foundation-20260921 - completion report

Task id: healthkit-workout-dormant-foundation-20260921

## Outcome

The dormant HealthKit Workout foundation is built, reviewed, gated and deployed to production with Workout canonicalization OFF. No workout policy exists, no canonical workout or link record exists, nothing HealthKit-derived is strategic Evidence, and the active 2026-09-21 Activity + Nutrition test-day policy and its canonical days are byte-identical before and after the deploy. A Native change was required only to give the Founder an exact-day workout sync; it is a reviewed candidate for a future Build 50 and was not built or uploaded (the Founder chose to wait until Activity + Nutrition is accepted).

## Existing workout foundation found (audit)

- Server (production a40c0b53): the ingestion command already accepted workout observations with immutable V1 identity; a raw-observation reconciler proposed strength match candidates (candidate / ambiguous / linked / source-only) and left cardio as a deferred canonical candidate; nothing was canonicalized and no workout policy existed. Old S1 foundation branches are superseded and were not revived.
- Native (Build 49): the workouts stream maps HKWorkout (activity type, duration, active energy, distance, average heart rate, source device, start/end, time zone) but has no Founder-triggerable workout sync; only the Activity + Nutrition test day and the validation canary run. Entitlements and usage strings already cover the required types.
- Real data shape: production Logger strength sessions ('Traditional Strength Training', Training Logger + Apple Fitness mixed) carry start, end, duration, calories and average heart rate; production also holds Apple Fitness screenshot walks (training objects with no exercises), so cardio must not duplicate those. No HealthKit workout observations existed.
- Defect found by the audit: Native sends the activity type as the numeric HKWorkoutActivityType raw value (for example 50), but the Server only recognised display names, so a real Apple strength workout would never have been detected. Fixed.

## Architecture map

HKWorkout -> Native observation (activityType numeric raw value) -> healthkit.observations.ingest.v1 -> raw healthKitObservations row (immutable V1 identity, sourceRevision above 1 joins identity) -> [Workout policy on, inside window] canonical Apple workout (healthKitCanonicalWorkouts, Apple telemetry only) -> strength: link candidate (healthKitWorkoutLinks) / cardio: coexistence note -> Evidence eligibility quarantined (separate gate) -> V3 only after a later explicit authorization.

## Server changes (candidate 6779d1b8fb4d10fde26cb303017807bd6b02dfaa on production base a40c0b53)

- Type support: strength = traditional (50) and functional (20) strength training; cardio = walking (52), running (37), cycling (13); names classify identically; everything else stays raw. Local date is derived from the workout's own start in its own time zone, never the client label or ingestion time.
- Identity and revisions: a first or unstated revision keeps the exact V1 identity; an optional workout.sourceRevision above 1 is a new observation of the same source workout; the canonical id is a hash of source bundle and immutable HealthKit id (private ids never stored or reported); replay is a no-op; a newer revision advances the same record with history; an older or equal revision never displaces a newer one. Deletion is not in the observation contract yet, so it is documented, not silently handled.
- Strength matcher: one deterministic Server-owned matcher reusing the existing same-workout thresholds unchanged (confident 80, possible 50, five-minute tolerance): confident_match, possible_match, ambiguous_multiple (never linked), no_match. Logger and Evidence times are normalized to instants in the Apple workout's time zone (offset ISO, naive ISO, bare wall time, meridiem times), an unverifiable same-day session is counted and blocks a confident match, and no bare filename ever establishes identity. Only a single confident or possible match yields a link record, and only as a candidate; nothing confirms automatically (an explicit source identity already named by the Logger session is the one exception, and only when it keeps one-to-one). A link keeps the Logger session as training-content authority and Apple as telemetry authority, records who created it and its history, supports confirm / unlink / relink without deleting either record, and enforces one confirmed link per side. Reassessment runs on every workout batch while the policy is on, refreshes or releases system candidates, and never lets one physical workout (a re-created HealthKit UUID or a second source) hold two candidate links.
- Cardio: one HealthKit workout maps idempotently to one canonical record; coexistence with an existing Evidence workout such as an Apple Fitness walk is recorded (matches / possible / ambiguous / unverifiable), never merged.
- Double counting: workout energy is already inside Apple's daily active-energy total and is descriptive only; the canonical Activity day is unchanged by workouts and a compose helper adds nothing (tested).
- Activation: separate server-owned Workout policy record (domain workout only, exact window of at most 3 local dates, quarantined, no backfill, link auto-confirm forbidden) independent of the daily policy, fail-closed and never throwing. The activation operation gained a policy-kind parameter with its own audit rows, a dry-run that previews raw workouts in the window by family, a drift fence, and an invariant proving the other policy record is untouched. A read-only Workout canary audit proves candidate linkage and quarantine using short hashes only.
- No schema change; three application-only collections reuse the existing generic record table; docs updated.

## Native candidate (d96db0d03a47b7710834fc13878c03b5d63e9451 on Build 49 candidate 2bfbf54a; not built or uploaded)

Foreground-only exact-day workout upload (one local date, at most three days back, cursor scope bound to the date, additions re-filtered to that date, deletions dropped, a pending validation-only batch never resumed as operational), a Workout canary card in the Founder canary view, a manifest contract flag, a dedicated unsupported error, and copy telling the Founder to sync only after the agent confirms activation. No launch or background behavior, no entitlement or usage-string change. Build 50 is REQUIRED for the canary because Build 49 cannot sync workouts.

## Tests, review, deployment

- Server: unit 8406 tests (+80) with the identical 298 pre-existing failures as the production base and zero new; all ten phase suites equal to base with zero new; ESLint and diff check clean; production build succeeded with the exact SHA. Native: 1252 tests, 0 failures (8 new workout tests plus prior suites).
- Fresh-context review found three real defects (Evidence time shapes not matching, write churn on a jsonb store, re-created-UUID duplicate links) plus smaller items; all were fixed with tests that reproduce them (including a key-reordering store wrapper) and re-reviewed: Server APPROVE WITH FOLLOW-UPS, Native APPROVE, no blockers.
- Deployed with the Founder's chat authorization, via a fast-forward push, spec stamp, force-rebuild deployment ac0e440f-a982-48dc-a750-dd894274eea9 ACTIVE with web and worker source 6779d1b8, health live and ready 200. Preservation refs pushed: claude/healthkit-workout-dormant-server and native/build50-workout-candidate. Behavior note for the deploy: with the Workout policy off, a raw numeric strength workout now gets a strength candidate reconciliation state (it previously stayed deferred because the numeric type was not recognized); this only affects the application-only raw observation collection.

## Activation state and zero-write proof

Workout activation: OFF (no workout policy record). Before and after the deploy, the bounded read-only baselines (goals, Confidence, all briefings, plans, protocols, all Evidence including Training, DEXA and Photo, exercise library, outbox, cadence operations) show zero differing sections. The Activity + Nutrition test-day detail (policy, two raw observations, two canonical days, audit row) is byte-identical. Canonical workout records: 0. Workout links: 0. HealthKit-derived records in strategic Evidence: 0. V3 eligible HealthKit workouts: 0. A live read-only run of the new Workout audit in production confirmed the deployed code reads the new collections, the policy is disabled, and there is nothing to report.

## Exact future Workout canary (not run)

1. Preconditions: Activity + Nutrition Sep 21 completed-day audit accepted; Build 50 (from the reviewed candidate) uploaded and installed.
2. The Founder logs a normal strength session in the Workout Logger on canary day D and records it on Apple Watch; nothing synthetic.
3. The agent applies the Workout policy for exactly D (dry-run first, then apply with the dry-run facts and an authorization reference). Activation must come before the first workout upload for D.
4. After the workout and after the Logger session is committed, the Founder opens You > server connection > HealthKit Founder Canary > Workout canary, keeps the date at D and taps Sync workouts for this day once.
5. The agent runs the read-only Workout audit for D-1 to D+1. Expected: one canonical Apple strength workout, a confident (or possible) link CANDIDATE to the Logger session, no duplicates, Logger content and Training events unchanged, zero strategic HealthKit evidence.
6. Founder confirmation is required before any link becomes confirmed; the matcher output is candidate-only and no confirm command exists yet (a later slice).
7. Deactivate afterwards with a new authorization reference; canonical history is kept.

## Flags

WORKOUT_FOUNDATION_AUDITED=YES
WORKOUT_LOGGER_REMAINS_CONTENT_AUTHORITY=YES
HK_WORKOUT_STABLE_IDENTITY_DEFINED=YES
HK_WORKOUT_REVISION_SEMANTICS_DEFINED=YES
STRENGTH_LINK_CANDIDATE_MODEL_READY=YES
AMBIGUOUS_MATCH_AUTO_LINK_DISABLED=YES
CARDIO_CANONICALIZATION_MODEL_READY=YES
WORKOUT_ACTIVITY_DOUBLE_COUNT_PREVENTED=YES
HK_WORKOUT_V3_ELIGIBLE=NO
HK_WORKOUT_CONFIDENCE_IMPACT=NO
TRAINING_PERFORMANCE_EVENTS_FROM_HK_DISABLED=YES
WORKOUT_PRODUCTION_ACTIVATION_ENABLED=NO
ACTIVITY_NUTRITION_TESTDAY_UNCHANGED=YES
SERVER_DEPLOYED_IF_REQUIRED=YES
NATIVE_BUILD50_REQUIRED=YES
READY_FOR_WORKOUT_CANARY_AFTER_ACTIVITY_NUTRITION_ACCEPTANCE=YES (after Build 50 and the pre-canary follow-ups below)

## Follow-ups and findings

- Pre-canary (reviewer, non-blocking): restore of a system-released link can throw a one-to-one violation and fail a whole ingest batch (latent until a confirm command exists); back-to-back workouts that share an exact boundary are treated as duplicates (conservative false negative); the earliest duplicate is primary even if it does not match; a Logger session dated differently from the workout's derived day is skipped silently. Fix the first before any confirm command ships.
- Known limits: deletion convergence and re-created HealthKit workouts rely on the duplicate guard rather than deletion handling; a workout uploaded before activation is stored raw and never reconsidered.
- Backlog preserved: completed-day Activity + Nutrition Sep 21 revision and audit; display-only Log and Evidence Hub projection of HealthKit canonical days; background delivery and a durable Native revision floor for Activity and Nutrition; Workout Logger draft survival across termination and update; Photo Briefing tap-to-expand mismatch; Coaching Updates delivery-time UI cleanup.
- Process note: the stale-commit spec deployment recurred and was resolved by a force-rebuild deployment.
