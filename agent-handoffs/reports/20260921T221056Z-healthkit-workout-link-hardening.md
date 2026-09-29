# healthkit-workout-link-hardening-20260921 - completion report

Task id: healthkit-workout-link-hardening-20260921

## Outcome

The dormant HealthKit Workout linking is hardened and deployed with Workout canonicalization still OFF. Server 3e5e6758 (deployment 0438721d-e4c1-44f9-9555-0d9ef4b91eec, ACTIVE, web and worker, health live and ready 200) adds strict one-to-one relationship protection with persistence-level claim rows (no schema change) and a conservative back-to-back boundary rule. No Workout policy exists, there are no canonical workouts, links or claims, nothing HealthKit-derived is strategic Evidence, and the active 2026-09-21 Activity + Nutrition test day is byte-identical before and after. Build 50 (Native candidate d96db0d0) was not archived, uploaded or installed.

## Root gap in the prior guard (deployed 6779d1b8)

- A. The one-to-one guard was opt-in: confirming a link without the surrounding link/workout context silently skipped every check, so a caller could confirm a second link for the same Apple workout or the same Logger session. Reproduced against the deployed code.
- B. A re-created HealthKit UUID (same physical workout, new identity) was not recognised as a duplicate at confirmation, so it could confirm a second Logger session. Reproduced.
- C. A Logger session that only touched the Apple window (09:00-10:00 against 10:00-11:00, same duration, calories and heart rate) scored a confident match because the score ignored how much of the windows actually overlapped. Reproduced.
- Also: creation could confirm through an explicit source identity, and restoring a system-released link could throw and fail a whole ingest batch.

## Exact boundary rule (matcher healthkit-strength-matcher-v3)

- A session is a candidate only with substantive overlap: overlap greater than the 5-minute tolerance (a session or workout shorter than that needs overlap greater than or equal to its own length). Touching or sub-tolerance overlap is excluded.
- Confident needs a duplicate-level score (80) AND start or end aligned within the 5-minute tolerance AND no unverifiable same-day Logger session. An unaligned duplicate-level score is only possible, never confident.
- Dominance: the best session must lead the runner-up by at least 30 (confident threshold minus possible threshold). A smaller lead is ambiguous_multiple. Equal scores are ambiguous. The outcome is computed over the whole set, so it does not depend on the order of sessions or workouts (20,000-case fuzz over every ordering: zero order-dependent outcomes, zero weak confident matches).
- Ambiguous back-to-back sessions never produce a link candidate; a single clearly dominant session (for example a clear 09:00-10:00 workout beside a 10:00-11:00 Logger session) links as a candidate. Rule is general (no thresholds tied to a specific day or session).
- Creation is candidate-only. Nothing auto-confirms, including an explicit source identity.

## Enforcement (no schema migration)

1. Domain: assertHealthKitWorkoutLinkAllowed is fail-closed (context required). It refuses a second confirmed link per Apple workout, per Logger session and per physical-workout duplicate group, and an unavailable workout.
2. Persistence: guarded relationship service (new, HealthKitWorkoutRelationshipService) is the only path that can make a link active. It takes one claim row per Apple workout and one per Logger session in a new application-only collection (healthKitWorkoutLinkClaims, generic record table, deterministic id). Claims use INSERT ... ON CONFLICT DO NOTHING on the primary key and UPDATE ... WHERE version = n, so two confirmations cannot both hold one side. A failed confirmation releases what it acquired. A conflict never overwrites an established link.
3. Command layer: every registered canonical command runs in one transaction under the per-owner advisory lock.
4. Re-created UUID, stale candidate (session superseded or no longer an active strength session, or the workout already linked) and replay are refused or suppressed; reassessment never crowds an established confirmed link.
5. Read-only violation checker and audit field oneToOneIntegrity (per-side multiplicity, claim/link mismatches); the activation runner records claim count and digest and fails on drift.

## Concurrency analysis (honest)

- Per side (one Apple workout, one Logger session): the claim rows are row-level atomic under READ COMMITTED even without the lock, so a race on one side cannot produce two confirmed holders.
- The physical-workout duplicate group is a computed check, not a row constraint; it relies on the per-owner advisory lock, which covers only registered canonical command ports. The future Founder confirm command MUST be a registered port. Until then this is a documented dependency.
- No confirm command exists, so no production path can make a link active today; the concurrency behaviour is proven by unit tests with an atomic in-memory store, not by production traffic.
- The claim on compensation after a failed SQL statement is fail-closed (a stuck held claim would be visible to the audit).

## Tests, review, deployment

- Server unit 8437 (+31) with the identical 298 pre-existing failures as the base and zero new. All ten phase suites have identical failure sets to the base (migration-safety 15, phase3 1, phase6 3, phase6.photo 2, others 0). ESLint, diff check and exact-SHA production build clean. New: boundary matcher (16), relationship service (12), link service rewrites (28), dormant foundation additions (33). Old-defect tests fail on the base (15 tests reproduced).
- Independent fresh-context review of 3e5e6758: APPROVE WITH NON-BLOCKING FOLLOW-UPS (no blocker or major); mutation testing, base-vs-candidate matcher comparison on 6,000 inputs, 20,000-case order fuzz.
- Deployed with the Founder's chat approval via a fast-forward push (6779d1b8 to 3e5e6758), spec stamp and force-rebuild deployment (the stale-commit spec deployment recurred). Preservation ref claude/healthkit-workout-link-hardening-server pushed.

## Zero-write and Activity + Nutrition proof

Before/after bounded read-only baselines (goals, Confidence, all briefings, plans, protocols, all Evidence including Training, DEXA and Photo, exercise library, outbox, cadence) show zero differing sections. The test-day detail (policy, two raw observations, two canonical days, audit row) is byte-identical; the Workout policy is absent; canonical workouts 0, links 0, claims 0, HealthKit records in strategic Evidence 0, oneToOneIntegrity all zero (live read-only audit on 3e5e6758). No Training events, V3, Confidence, briefing or schema change.

## Exact future strength canary (not run; nothing activated)

1. Preconditions: Activity + Nutrition Sep 21 completed-day audit accepted; Build 50 built from the reviewed candidate, uploaded and installed (Build 49 cannot sync workouts).
2. Founder logs one normal strength session in the Workout Logger on day D and records it on Apple Watch; avoid a second overlapping or back-to-back session that day for this first canary.
3. Agent runs the policy operation for the workout domain, exactly D (dry-run first, then apply with the dry-run facts; re-run any old dry-run, since claim facts now exist). Activation must precede the first workout upload for D.
4. After the Logger session is committed, the Founder taps Sync workouts for this day once (You > server connection > HealthKit Founder Canary > Workout canary, date D).
5. Agent runs the read-only workout audit D-1 to D+1: expects one canonical Apple strength workout, a confident (or possible) link CANDIDATE to the Logger session, zero duplicates, oneToOneIntegrity zeros, Logger content and Training events unchanged, zero strategic HealthKit evidence.
6. Confirmation is a later slice (Founder command through the guarded service, registered as a canonical port); the canary itself ends at a candidate.
7. Deactivate afterwards with a new authorization reference; canonical history is kept.

Canary-ready after Activity + Nutrition acceptance: YES, once Build 50 is archived, uploaded and installed. Server needs nothing further for a candidate-only canary.

## Flags

ONE_TO_ONE_HK_TO_LOGGER_ENFORCED=YES
ONE_TO_ONE_LOGGER_TO_HK_ENFORCED=YES
RECREATED_UUID_CONFLICT_GUARDED=YES
STALE_CANDIDATE_CONFLICT_GUARDED=YES
CONCURRENT_CONFIRMATION_RACE_SAFE=YES per side (row-atomic claims); physical-workout group check relies on the per-owner advisory lock, so the future confirm command must be a registered port
BACK_TO_BACK_CLEAR_MATCH_SUPPORTED=YES
BACK_TO_BACK_AMBIGUOUS_AUTO_LINK_DISABLED=YES
TIE_ORDER_INDEPENDENT=YES
WORKOUT_LOGGER_CONTENT_AUTHORITY_UNCHANGED=YES
WORKOUT_PRODUCTION_ACTIVATION_ENABLED=NO
HK_WORKOUT_V3_ELIGIBLE=NO
TRAINING_EVENTS_CHANGED=NO
ACTIVITY_NUTRITION_TESTDAY_UNCHANGED=YES
SCHEMA_UNCHANGED=YES
SERVER_HARDENING_REVIEW_APPROVED=YES (approve with non-blocking follow-ups)
SERVER_HARDENING_DEPLOYED=YES
ZERO_WRITE_POSTDEPLOY_AUDIT_PASSED=YES
READY_FOR_WORKOUT_CANARY_AFTER_ACTIVITY_NUTRITION_ACCEPTANCE=YES (after Build 50)

## Non-blocking review follow-ups (recorded, not fixed)

- Test gaps: workout-already-linked suppression branch, restore-collides refresh branch, compensation when the link write conflicts, activation-runner claimsUnchanged.
- A runner-up that is unaligned and barely overlaps can still force ambiguous_multiple (missed candidate, never a wrong link): neighbouring sessions overlapping 5-15 minutes with matching telemetry can yield no candidate. Fix or document before relying on it.
- An unaligned duplicate-level best candidate is labelled single_session_below_confident_threshold; use a distinct reason.
- Duplicate-group edge cases: workouts of 5 minutes or less and re-created workouts whose strength type changed (50 to 20) are not seen as duplicates (the session claim is still the backstop).
- Violation checker does not yet report two confirmed links in one duplicate group or a link whose session was superseded; the doc sentence about reporting any stored violation should be softened or the checks added.
- Guarded service should require a Founder actor and a valid time, and the pure confirm function should be un-exported or structurally forbidden outside tests; the confirm command should read one session by id instead of listing whole collections (worker memory history).

## Backlog preserved

Activity + Nutrition Sep 21 completed-day revision and audit (the Founder must set the canary date back to 2026-09-21 before the after-midnight sync; needs a new task id); Build 50 archive and upload only after Activity + Nutrition acceptance; display-only Log and Evidence Hub projection of canonical HealthKit days; background delivery and a durable Native revision floor; Workout Logger draft survival across termination and update; Photo tap-to-expand production mismatch; Coaching Updates delivery-time UI cleanup.
