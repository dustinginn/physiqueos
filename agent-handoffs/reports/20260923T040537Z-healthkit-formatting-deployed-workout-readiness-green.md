# Formatting fix deployed; Sep 22 Workout canary readiness: GREEN

Task id: `healthkit-formatting-deploy-workout-readiness-20260923`

## Part 1 — Evidence formatting fix deployed

**Candidate reverified before acting:** production deployment `0bdc1748` ACTIVE, `source_commit_hash = ccff693b` (read from its own spec); candidate `claude/healthkit-evidence-summary-formatting-cleanup` head `4b362591cb5f80c599f8f45eb7f392de7c44a36f` on origin, exactly the three independently reviewed commits (`44edddb7`, `d2aa86e0`, `4b362591`) fast-forwardable onto `ccff693b`, no code changed after review, no `db/`/migration files in the diff. Minimal revalidation at that SHA: formatting regression tests 9/9, phase3 282/283 (the one failure is the pre-existing gitignored `private/founder/runtime-store.json` fixture), worktree clean.

**A gap in the previous deploy, found and corrected here.** Production had been running `ccff693b` since deployment `0bdc1748`, but the app-spec env vars `PHYSIQUEOS_GIT_SHA` / `PHYSIQUEOS_BUILD_ID` (RUN_AND_BUILD_TIME, web + worker) were never bumped from `924d5e55` — so the runtime self-identified as the wrong commit in every log envelope, and the zero-write production audits' identity gate (`RUNTIME_SHA_MISMATCH`) refused to run under the true SHA. The established process (`infra/digitalocean/README.md`: spec rendered to `doctl apps update --spec`, then `create-deployment --force-rebuild`) sets those envs per deploy; my `create-deployment --force-rebuild`-only deploy of `ccff693b` skipped that step. I did not bypass the audit gate; this deploy fixes the label properly.

**Founder authorization** was requested in chat (with a push notification) for exactly: (1) fast-forward push of `combined-app-platform-cutover` to `4b362591`; (2) `apps update --spec` changing only `PHYSIQUEOS_GIT_SHA` → `4b362591…` and `PHYSIQUEOS_BUILD_ID` → `physiqueos-4b362591-20260923` on web and worker (a 4-line diff against the live spec, proven before asking); (3) `create-deployment --force-rebuild` if the update reused the old commit. The Founder replied "Approved".

**Executed, in order:**
1. Fast-forward push `ccff693b..4b362591` → `combined-app-platform-cutover` (origin head confirmed `4b362591`).
2. `doctl apps update --spec` (context `physiqueos-production-deploy`) with the 4-line env change. The resulting "app spec updated" deployment `6c997fe9` reported `source_commit_hash = ccff693b` — the known "env-only update reuses the old commit" gotcha, reproduced exactly.
3. `doctl apps create-deployment --force-rebuild` → deployment `d4754b09-ff14-4c1f-ab9b-8d4ea5814d85`, `source_commit_hash = 4b362591cb5f80c599f8f45eb7f392de7c44a36f`; `6c997fe9` was superseded/canceled.

**Live verification:** `d4754b09` reached ACTIVE at 04:02:45Z (BUILDING → DEPLOYING → ACTIVE, ~4.5 min); its own spec reports `source_commit_hash = 4b362591cb5f80c599f8f45eb7f392de7c44a36f` for both web and worker; `/api/v1/health/live` and `/api/v1/health/ready` both 200; a single harmless 401 request was issued to produce a log envelope, and fresh run logs on **both** web and worker now report `buildId physiqueos-4b362591-20260923` / `gitSha 4b362591…` — the runtime label is correct again. Build logs show no migration execution.

**Bounded post-deploy verification (zero-write):** the Sep 22 canonical acceptance audit was run before the deploy (under the runtime's then-declared SHA `924d5e55`, whose audit modules are byte-identical) and again after (under `4b362591`, the identity gate passing): daily policy identical; canonical days identical (activity `2026-09-22` revision 16 / history 15 / source revision 17 / 16 source observations; nutrition revision 2 / history 1 / source revision 2 / 2 observations; both `quarantined`, not strategically eligible); observation-state histogram identical; strategic counts all 0 and identical; all **26 strategic-collection digests identical**; migrations `14 → 14`. Canonical numeric precision and storage are therefore unchanged by the deploy — the formatting change is read-model projection only, which the 9 regression tests at this exact SHA prove renders whole numbers (e.g. `2405.5120239257812 → "2406 calories"`, `782.1669999999962 → "782 active cal"`). A direct authenticated read of the live Evidence read model is the Founder's session to perform, hence the visual-verification request below.

No HealthKit data was mutated to test formatting. No schema/migration change.

## Part 2 — Sep 22 Workout canary readiness audit (read-only): **GREEN**

Two evidence sources: a fresh-context code audit (isolated worktree, Server at deployed `ccff693b`, Native at Build 53 `1c57556f`, every claim cited file:line) and a zero-write production audit for the `2026-09-22` window (`healthKitWorkoutCanaryAudit` through the accepted read-only console runner: REPEATABLE READ READ ONLY, explicit ROLLBACK, success marker only after rollback, `--no-values` so no telemetry numbers left the database; identifiers appear only as short hashes).

**Production state (read-only, Sep 22 window):**
- Workout activation policy: `enabled: false`, not configured (no record) — **OFF**.
- Workout observations stored: **0** (nothing has been uploaded raw before activation, so nothing is stuck in the "stored raw, never reconsidered" state).
- Canonical workouts: 0; links: 0 (no status counts); claims: 0; `oneToOneIntegrity` all zero; `ambiguousAutoLinked: 0`; possible/duplicate canonical workouts: 0.
- Logger strength sessions in window: **1** (the completed Sep 22 Logger session is present as an active detailed strength session).
- Strategic: `healthKitWorkoutsStrategicEligible 0`, `healthKitWorkoutsNotQuarantined 0`, `healthKitDerivedRecordsInStrategicEvidence 0`.
- Activity/Nutrition (from the same-window canonical acceptance audit): daily policy open-ended for `activity,nutrition`, Sep 22 canonical days at revision 16 (activity, 16 source observations) and 2 (nutrition), both `quarantined`, `strategicEligible: false`, 0 HealthKit-derived records in strategic evidence, 0 duplicate canonical days; 26 strategic-collection digests recorded as the before-baseline.

**Code-level findings (all PASS; citations are to the deployed Server SHA / Build 53):**
- *Activation OFF by design*: single `healthKitConfiguration` record, `resolveHealthKitWorkoutActivationPolicy` defaults to disabled with no record and fails closed on any malformed field; domains must be exactly `["workout"]`, window 1–3 days, `strategicEvidenceEligibility` must be `"quarantined"`, `historicalBackfill` and `linkAutoConfirm` must be `false`; no open-ended form exists. Only the activation runner writes it. Native's automatic coordinator syncs only Activity + Nutrition streams; Workout observations are sent only by the explicit Founder control.
- *Build 53 capability present, contract unchanged*: `HealthKitWorkoutCanaryDay` (single date, ≤3 days old, `workoutcanary` namespace registered), the "Sync workouts for this day" control, coordinator/engine path (day-bounded query, additions re-filtered to the day, deletions dropped, refuses to resume a non-operational pending batch, `ingestionPurpose: operational`), workout S1 wire case. The four Activity/Nutrition commits since Build 52 touched Workout files only to register the `workoutcanary` namespace (a no-op for workouts, whose identity is the HKWorkout UUID) plus tests.
- *Namespace safety*: workout external id = HKWorkout UUID; Activity/Nutrition ids are prefixed `activity-summary:<ns>:<date>` / `nutrition-daily-total:<ns>:<date>`; the Server hashes `observationType` into every identity and uses distinct collections and id prefixes — collision impossible.
- *Multiple same-day workouts / retries*: distinct UUIDs → distinct canonical workouts (tested: strength + walk same day, two strength UUIDs); identical replay → `matched`, zero writes, versions unchanged; same identity with different content → 409 `HEALTHKIT_OBSERVATION_IDENTITY_COLLISION` (fail-closed, Native abandons the batch and re-queries on the next tap).
- *Strength matching / Logger protection*: `HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM = false`; the matcher creates only `CANDIDATE` links (`createdBy: system_matcher`); no confirm path is reachable from ingest. CONFIDENT requires explicit source identity, or duplicate-level score ≥80 with real overlap, an aligned boundary, and zero unverifiable same-day sessions; a best match must lead the runner-up by 30 points or the outcome is AMBIGUOUS, which creates nothing and releases stale system candidates. Linking writes only `healthKitWorkoutLinks` and the workout record's own `linkAssessment`/`coexistence`; `canonicalEvidenceObjects` is only read. The canonical workout carries telemetry only — never exercises, sets, reps, loads, variants, supersets or notes — with `contentAuthority.trainingContent = "workout_logger"`.
- *No duplicate Training session*: the HealthKit ingest path never reaches the Evidence-package/Training reconciliation writers; tests assert `canonicalEvidenceObjects`, `evidencePackages`, `trainingPerformanceEvents`, and the exercise library are byte-identical across ingest.
- *Cardio separation*: activity types 52/37/13 classify CARDIO, 50/20 STRENGTH; the strength matcher returns `not_a_strength_workout` for cardio, which is routed only to `assessHealthKitCardioCoexistence` (coexistence field, never a link). An Outdoor Walk cannot attach to the Strength Logger session.
- *No-counterpart cases*: Apple strength workout without a Logger counterpart (policy ON) → canonical workout with `linkAssessment.outcome = no_match`, no link, picked up on a later ingest if a Logger session appears; policy OFF → observation stored raw with a dormant label only, no canonical workout. Logger session without an Apple counterpart → untouched. No product read model loads workout collections; the Founder sees only the control's acknowledgement summary.
- *Downstream eligibility OFF*: `HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE = false`; every workout/link/claim is stamped quarantined; `assertNotQuarantinedHealthKitEvidence` guards every Evidence commit; the only sanctioned HealthKit reader (graduation) lists only canonical days and supports only `activity,nutrition`; nothing under intelligence/Briefing/Confidence references HealthKit workouts; V3 evidence universe contains no HealthKit records (tested).
- *Activity/Nutrition isolation*: the workout branch never writes `healthKitCanonicalDays`; `reconcileHealthKitCanonicalDay` takes no workout input; workout energy is never added to daily totals; the activation runner proves the other policy record untouched by digest.
- *Defects*: none strictly necessary. Two operational notes: (a) Build 53 emits no `sourceRevision` for workouts, so a re-query producing different aggregates for the same UUID is refused (409) rather than applied — fail-closed; (b) the control cannot see Server policy state before uploading, so **activation must precede the tap**, or Sep 22's workouts are stored raw and never reconsidered.

### GREEN — exact next step, specified, NOT executed

**Bounded policy values (workout domain only):** `--policy-kind workout --action activate --domains workout --effective 2026-09-22 --end 2026-09-22` (single-date window; the runner refuses open-ended for workout), resolving to a record with `status: enabled`, schema `healthkit-workout-activation-policy-v1`, `domains: ["workout"]`, `strategicEvidenceEligibility: "quarantined"`, `historicalBackfill: false`, `linkAutoConfirm: false`.

**Required dry-run and zero-write checks, in order:**
1. Re-run the Sep 22 Workout audit under the live SHA and confirm it still shows policy OFF, 0 workout observations, 0 canonical workouts/links/claims, 1 Logger strength session; capture strategic digests.
2. `buildHealthKitPayload.mjs --kind policy --policy-kind workout --mode dry-run --sha <live 40-hex> …` through the read-only runner; confirm it previews the Sep 22 raw-workout window by family with no writes, reports the daily policy digest unchanged, and records the expected-facts file.
3. `--mode apply` only with `--authorization-ref` and the dry-run's `--expected` facts (the runner's drift fence refuses if anything moved); confirm the runner's invariant that the daily Activity/Nutrition policy record is untouched.
4. Re-run the Workout audit: policy now enabled for exactly 2026-09-22..2026-09-22, still 0 observations; strategic digests identical to step 1.

**Exact Founder action (after step 4, once):** You > server connection > HealthKit Founder Canary > Workout canary, keep the date at Sep 22, tap "Sync workouts for this day" **exactly once**. Expected acknowledgement: "Server canonicalized N workout(s)" (N = the Sep 22 HKWorkouts; the walk canonicalizes as cardio, the strength session as strength), cursor responsibility `device`, no error. Do not tap again unless the agent asks; do not run the manual Activity/Nutrition Sync or the test-day canary.

**Exact post-sync audit:** Workout audit for Sep 22: workout observations by state (expect `workout_canonicalized` for each HKWorkout), canonical workouts by family (strength 1, cardio per walks), the strength workout's stored and live link assessment (expect `confident` or `possible` with exactly one `CANDIDATE` link to the Logger session, or `ambiguous`/`no_match` with no link — never a `CONFIRMED` link), `ambiguousAutoLinked 0`, `oneToOneIntegrity` all zero, strategic counts all 0; canonical acceptance audit for Sep 22 with strategic digests identical to the pre-activation baseline and Activity/Nutrition canonical-day revisions unchanged; Training/Evidence digests unchanged (proves the Logger session was not touched).

## Flags

- FORMATTING_SERVER_DEPLOYED: YES (deployment d4754b09, source_commit_hash 4b362591, Founder-authorized in chat)
- FORMATTING_LIVE_VERIFIED: YES (ACTIVE, health 200/200, runtime label 4b362591 on web + worker, zero-write proven before/after; Founder visual check of the Evidence headlines requested)
- WORKOUT_ACTIVATION_CURRENTLY_OFF: YES (production read: `enabled: false`, no record)
- BUILD53_WORKOUT_CANARY_CAPABILITY_PRESENT: YES
- WORKOUT_NAMESPACE_SAFE: YES
- SEP22_STRENGTH_LOGGER_SESSION_PRESENT: YES (production read: 1 active detailed strength session in window)
- MULTIPLE_WORKOUT_DAY_SUPPORTED: YES
- STRENGTH_MATCHING_SEMANTICS_SAFE: YES
- AMBIGUOUS_MATCH_AUTO_LINK_PREVENTED: YES
- LOGGER_DETAIL_OVERWRITE_PREVENTED: YES
- DUPLICATE_TRAINING_SESSION_PREVENTED: YES
- OUTDOOR_WALK_SEPARATION_SAFE: YES
- WORKOUT_V3_ELIGIBILITY_OFF: YES
- ACTIVITY_NUTRITION_UNCHANGED: YES (policy/canonical days/digests read-only verified; Workout path proven not to touch them)
- READY_FOR_SEP22_WORKOUT_CANARY: GREEN (with the activation-before-tap ordering above)
- WORKOUT_POLICY_ACTIVATED_THIS_TASK / FOUNDER_ASKED_TO_SYNC_WORKOUTS: NO / NO
- SECRETS_EXPOSED: NO (spec secrets are DO-encrypted values, never printed into any handoff; audit identifiers hashed; `--no-values`)
