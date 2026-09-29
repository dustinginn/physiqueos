# HealthKit Strength Sep 23 timestamp correction deployed; reassessment dry-run green

- Task id: `healthkit-strength-sep23-commit-timestamp-deploy-dryrun-20260923`
- Agent: Codex
- Status: deployment complete; reassessment dry-run complete; stopped before apply
- Server SHA: `31c88481d80703de3355c51f6695b760b0671020`
- Active deployment: `42035d0d-9368-4ada-a4c1-392e659f3366`
- Build ID: `physiqueos-31c88481-20260923`
- Native candidate: `621dbef3cdcf17009e346111e4a86d14b70ed896`, Build 55, not uploaded

## Deployment

The approved reviewed Server candidate was fast-forwarded without force to `combined-app-platform-cutover`. The diff contained no database migrations.

Only the four nonsecret runtime identity values were changed in the app spec:

- web `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID`;
- worker `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID`.

The app-spec update created deployment `958846e7-5e54-45c3-9b06-490f997b8f94`, which showed the known stale-source behavior and attempted to build prior source `98f8ccec`. The required force rebuild canceled it at 1/9. Force-rebuild deployment `42035d0d-9368-4ada-a4c1-392e659f3366` built exact `31c88481` for both web and worker and reached ACTIVE 9/9.

## Authority and health

- Remote production branch: exact full SHA `31c88481d80703de3355c51f6695b760b0671020`.
- Active deployment: exact `42035d0d-9368-4ada-a4c1-392e659f3366`, ACTIVE 9/9.
- Web source: exact full SHA `31c88481d80703de3355c51f6695b760b0671020`.
- Worker source: exact full SHA `31c88481d80703de3355c51f6695b760b0671020`.
- Web and worker runtime SHA: exact full SHA `31c88481d80703de3355c51f6695b760b0671020`.
- Web and worker build ID: `physiqueos-31c88481-20260923`.
- Liveness: HTTP 200 with the exact build ID.
- Readiness: HTTP 200; all nine checks ready, including database, owner identity, runtime authority, object storage, and migration `000014`.

## Zero-write verification

The same no-values Sep 23 Workout audit ran before deployment, after deployment, and again after the reassessment dry-run. Each invocation enforced exact runtime SHA and owner scope, began `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, used owner-scoped reads, and explicitly rolled back.

All three observations agreed on the domain state:

- Strength policy enabled from Sep 23, open-ended, Strength-only, historical backfill false, `linkAutoConfirm=false`, strategic eligibility quarantined;
- one Sep 23 canonical Strength workout and one Logger Strength session;
- no duplicate or possible-duplicate canonical workout;
- no Sep 23 link;
- one-to-one integrity counters all zero;
- zero strategically eligible or non-quarantined HealthKit workouts and zero HealthKit-derived strategic Evidence;
- global HealthKit workout links 1 and claims 2, unchanged;
- canonical workouts 4, Evidence objects 570, canonical days 6, HealthKit observations 166, unchanged;
- migration count 14, latest `000014_evidence_intake_text_provenance`;
- every reported strategic and HealthKit/training collection row count and digest identical.

Only runtime identity changed across deployment. The audit after the dry-run matched the post-deploy audit exactly, proving the reassessment rollback left tracked production state unchanged.

## Exact Sep 23 reassessment dry-run

Safety envelope:

- operation: `link-reassess`;
- mode: `dry-run` only;
- date: `2026-09-23` only;
- authorization reference: null;
- exact runtime SHA and owner verified before reads;
- transaction: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
- `transaction_read_only=on` verified;
- explicit rollback;
- no apply invocation.

Result:

- outcome: `dry_run`;
- match outcome: `confident_match`;
- confidence: `95`;
- match basis: `logger_session_window`;
- matcher: `healthkit-strength-matcher-v5`;
- predicted link status: `candidate`;
- selected workout version: 2;
- canonical type: `traditional_strength_training`.

Exact predicted mutation plan:

1. Create one record in `healthKitWorkoutLinks` with status `candidate`.
2. Update only the selected record's link assessment in `healthKitCanonicalWorkouts`.
3. Create one authorization audit record in `healthKitConfiguration`.

The dry-run used a null authorization reference. A separately authorized apply requires a nonempty authorization reference and derives its audit id from that reference.

## Invariants

The dry-run reported and the surrounding zero-write audit verified:

- Logger session remains byte-identical;
- canonical workout current/telemetry remains byte-identical;
- no claim is created or changed;
- confirmation remains off;
- strategic eligibility remains quarantined;
- daily and workout policies are protected by the read-only drift fence;
- exactly one existing Sep 23 canonical Strength workout and one matching native live Logger session were selected;
- no ambiguity, duplicate workout, or one-to-one integrity violation exists;
- no mutation was executed.

The dry-run facts also fenced the current global counts and digests: links 1, claims 2, canonical workouts 4, Evidence objects and storage metadata 570, canonical days 6, and observations 166.

## Explicitly not done

- Reassessment apply: not performed and not authorized.
- Candidate link, workout assessment, or reassessment audit creation: not performed.
- Link confirmation or claim mutation: not performed.
- Policy or strategic-eligibility mutation: not performed.
- Logger mutation: not performed.
- Build 55 TestFlight upload: not performed and not authorized.
- Cardio: not started.

## Next decision

The read-only result is green and predicts the intended bounded candidate-only reassessment. A separate Founder authorization is required before apply. Build 55 upload remains a different approval gate. Cardio remains blocked until Strength reaches its final verdict.

## Safety

No credentials, tokens, secret environment values, database URLs, certificates, raw production export, exercise details, notes, loads, private media, or signing material are included in this report.
