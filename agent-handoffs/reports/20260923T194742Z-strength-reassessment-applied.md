# Sep 23 Strength guarded reassessment applied

- Task id: `healthkit-strength-sep23-reassessment-apply-20260923`
- Agent: Codex
- Status: applied and independently audited; candidate remains unconfirmed
- Server SHA: `31c88481d80703de3355c51f6695b760b0671020`
- Active deployment: `42035d0d-9368-4ada-a4c1-392e659f3366`, ACTIVE 9/9
- Runtime build: `physiqueos-31c88481-20260923`
- Native candidate: `621dbef3cdcf17009e346111e4a86d14b70ed896`, Build 55, not uploaded

## Authority

Immediately before the operation:

- the remote production branch was exact `31c88481d80703de3355c51f6695b760b0671020`;
- web and worker source hashes were exact `31c88481d80703de3355c51f6695b760b0671020`;
- web and worker runtime SHA/build stamps matched;
- deployment `42035d0d-9368-4ada-a4c1-392e659f3366` was ACTIVE 9/9;
- public liveness and readiness returned HTTP 200/200 with all nine readiness checks green and migration `000014` applied.

## Fresh pre-write baseline

Two independent no-values audits ran under `REPEATABLE READ READ ONLY`, verified `transaction_read_only=on`, used owner-scoped reads, and rolled back:

1. Workout audit captured the Sep 23 Strength workout/session/link/claim state, all strategic and HealthKit/training collection digests, policy flags, and one-to-one counters.
2. Canonical Activity/Nutrition audit captured both Sep 23 canonical days, observation-state counts, quarantine/strategic state, coexistence, and all unrelated strategic collection digests.

The baseline had one Sep 23 Strength workout, one matching Logger Strength session, no Sep 23 link, two global claims, `linkAutoConfirm=false`, and strategic eligibility quarantined.

## Fresh dry-run and drift fence

A new dedicated reassessment dry-run ran immediately before apply:

- outcome: `dry_run`;
- match: `confident_match`;
- confidence: 95;
- basis: `logger_session_window`;
- matcher: `healthkit-strength-matcher-v5`;
- plan: create one quarantined candidate link, update only the selected workout's link assessment, and create one authorization audit row.

Its complete facts object was captured and embedded in the apply payload: links 1, claims 2, canonical workouts 4, Evidence objects and storage metadata 570, canonical days 6, observations 166, plus all corresponding digests and both policy digests.

## Apply result

The apply ran under the owner advisory lock with the fresh dry-run facts as the exact drift fence. It returned `applied` and committed exactly:

1. one `healthKitWorkoutLinks` record with status `candidate`, match `confident_match`, confidence 95, and basis `logger_session_window`;
2. only the selected canonical workout's link assessment;
3. one authorization-bound reassessment audit row with id suffix `ba0d6dda9c77`.

No confirmation or claim was created. The candidate remains quarantined and strategically ineligible.

## In-transaction invariants

All 18 invariants passed:

- exactly one candidate created;
- no confirmed link created;
- candidate quarantined;
- Logger retains training-content authority and HealthKit retains telemetry authority;
- claims unchanged;
- Logger Evidence content unchanged;
- Logger Evidence storage metadata unchanged;
- workout current/telemetry unchanged;
- workout still quarantined;
- other workouts unchanged;
- only the link assessment updated;
- canonical days unchanged;
- observations unchanged;
- daily policy untouched;
- workout policy untouched;
- auto-confirm still off;
- strategic eligibility still off;
- authorization audit row present.

## Independent post-write audit

The same two audit programs ran again after commit, independently of the write runner, under read-only transaction and rollback fences.

Expected and only observed changes:

- global Workout link rows: 1 to 2;
- HealthKit configuration rows: 12 to 13 for the authorization audit;
- canonical workout row count remained 4 while the selected workout digest changed for its assessment update;
- the Sep 23 stored assessment became `confident_match` with one candidate;
- the Sep 23 link view now contains exactly one `candidate` at confidence 95.

Everything else proved unchanged:

- canonical Evidence objects remained 570 with identical digest, proving Logger detail unchanged;
- the apply runner separately proved all 570 storage metadata rows identical;
- claims remained 2 with identical digest;
- all one-to-one integrity counters remained zero;
- canonical days remained 6 with identical digest;
- observations remained 166 with identical digest;
- all other workouts and workout current/telemetry were unchanged;
- daily and workout policies were untouched; `linkAutoConfirm=false` and strategic eligibility remained quarantined;
- no HealthKit workout or canonical day became strategically eligible or non-quarantined;
- no HealthKit-derived record appeared in strategic Evidence;
- the entire Activity/Nutrition audit output was byte-identical before and after, including observation counts, day revisions, coexistence, quarantine, and all unrelated strategic digests;
- every unrelated Workout/strategic collection digest was byte-identical;
- migration count remained 14 with `000014_evidence_intake_text_provenance` latest.

## Explicitly not done

- Candidate confirmation: not performed and not authorized.
- One-to-one claim creation: not performed.
- Logger mutation: not performed.
- Policy graduation or strategic eligibility change: not performed.
- Build 55 TestFlight upload: not performed and not authorized.
- Cardio: not started.

## Next decision

Strength now has the intended single quarantined confidence-95 Sep 23 candidate link. A separate Founder authorization is required before confirmation through the guarded one-to-one claim path. Build 55 upload remains separately gated, and Cardio remains blocked until Strength reaches its final verdict.

## Safety

No credentials, tokens, secret bindings, database URLs, certificates, raw production export, exercise details, notes, loads, private media, or signing material are included.
