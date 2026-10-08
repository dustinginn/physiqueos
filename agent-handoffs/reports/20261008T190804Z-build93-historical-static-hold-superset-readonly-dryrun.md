# Build 93 historical Static Hold and Super Set audit — source-only dry run, APPLY HOLD

Task id: `build93-historical-static-hold-superset-readonly-dryrun-20261008`

Source assignment: staged Build 93 historical-audit prompt at `f52381e8`.

Status: **SOURCE-ONLY DRY RUN COMPLETE; FRESH PRODUCTION CENSUS NOT RUN; APPLY NOT AUTHORIZED AND NOT SAFE YET.**

No production SQL, write, seed, API mutation, deployment, build bump, Xcode job, or TestFlight action occurred. `agent-handoffs/latest.json` and `latest.md` remain unchanged.

## Executive finding

The source/history evidence supports two separate bounded repairs:

1. **Static Hold:** materialize at most two canonical per-exercise definitions, one for Spider Curls and one for Pendulum Squat Machine. They inherit each exercise's normal weighted sets/reps/load semantics. They must not introduce duration, timed-hold, or isometric measurement semantics and must not rewrite historical evidence.
2. **Historical Super Set:** three legacy Training sessions contain six exercise occurrences where `super_set` was stored as an execution variant. The canonical meaning is an ordered `superset` relationship: two sessions pair Leg Extensions with Sissy Squats, and one session pairs Seated Hip Adductions with Seated Hip Abductions. The safe logical correction removes the misclassified variant from the two affected occurrences in each session and adds one structured relationship group referencing those existing occurrence identities, while preserving every set, rep, load, exercise identity, order, and all unrelated session content.

The Static Hold implementation is source-ready and has strong dry-run/apply fencing. The Super Set logical transform is clear, but an APPLY candidate is **HOLD** until a fresh approved PC read captures the exact current storage/canonical identities, versions, payload digests, occurrence identities, reviewed source ordering, correction lineage, and affected performance/progression census. Guessing those facts would risk changing Founder history.

## Authority and provenance

- Current `origin/main` at audit start: `f52381e8`.
- Accepted Native release pointer: Build 92, Native `beaf5eff9d3c4147fba4dec095e8092c0fae9b91`.
- Release-time Server snapshot: `84cc64e4e7205b2540bf78ea43afd1cbfb068d06`, deployment `32143aa4-90d4-496a-81b2-17f35a609fde`.
- The Server snapshot is **not claimed as a fresh live authority check**. No production console was opened.
- Source reviewed: the deployed Build 92 variant foundation, its seed runner/payload builder/tests, the canonical correction and relationship models/tests, the current backlog and comprehensive Build 93 handoff, prior authorized Training/variant audit reports, and the standing production-read runbook.
- Prior authorized production evidence is used only as historical provenance. It is not substituted for a fresh transaction.

## Why the production dry run stopped

`agent-handoffs/PRODUCTION_READONLY_ACCESS.md` authorizes production SQL only through the saved Founder-PC runner and explicitly makes absence of that PC path a stop condition for Mac sessions. The staged assignment further requires that exact approved PC path and says to produce a source-only plan when safe access is unavailable.

This task is running on the Mac. There is no established bridge to the approved PC runner in this session. The locally present Mac transport is not an authorized substitute under the current runbook. Therefore:

- current app/component/runtime authority was not asserted;
- no database binding was touched;
- no `BEGIN READ ONLY` transaction was opened;
- no current owner-scoped record IDs, versions, or digests were read;
- no private Founder data or production export was created.

This is a deliberate fail-closed result, not a failed SQL attempt.

## Static Hold audit

### Verified source facts

`TrainingExecutionVariantLegacySeedRunner` is fixed in code to exactly:

- Spider Curls / `static_hold` / display `Static Hold`;
- Pendulum Squat Machine / `static_hold` / display `Static Hold`.

The implementation:

- uses per-exercise deterministic identities;
- creates a missing definition, reactivates a compatible retired definition, or leaves a compatible active definition unchanged;
- never duplicates a same-exercise definition;
- never seeds `super_set`;
- never rewrites canonical evidence;
- reports definition/evidence digests and occurrence counts in dry-run mode;
- requires the dry-run facts plus a separate authorization reference for apply;
- refuses drift and verifies that only planned definitions changed.

The canonical model contains no duration, logging-mode, tempo, or per-variant set-schema fields. The prior authorized audit found all historical Static Hold occurrences were weighted-reps sets with both reps and external load and no duration. That prior result covered the two named exercises and found no reusable production variant definitions at that time. These facts establish semantics and scope, but their counts are stale until re-read.

### Exact proposed correction

Run the already-reviewed seed utility in `dry-run` mode against the freshly verified production Server SHA. Accept only a plan containing the two named per-exercise targets and zero evidence writes.

For each target independently:

- missing compatible definition -> create one active `legacy_seed` definition with current key and legacy alias `static_hold`;
- compatible retired definition -> reactivate that exact identity;
- compatible active definition -> no-op;
- any conflicting or ambiguous definition -> refuse the whole apply.

Maximum writes: **2 definition records**. Expected writes cannot be claimed until the fresh dry run. If production still matches the prior zero-definition census, the expected result is two creates.

### Preconditions for a later APPLY

1. Fresh control-plane and runtime authority agree on the intended app, `web` component, deployment, and 40-hex runtime SHA.
2. The approved PC runner opens one bounded connection.
3. Transaction begins `REPEATABLE READ READ ONLY`; `SHOW transaction_read_only` equals `on` before application reads.
4. Owner scope is exact and unambiguous.
5. The dry-run result contains only the two named exercises and at most two predicted definition mutations.
6. Definition and evidence counts/digests, active Static Hold occurrence census, and excluded legacy Super Set count are retained as the sealed expected facts.
7. No `super_set` definition exists or is planned.
8. Founder separately authorizes APPLY by reference to that exact dry-run result.

### Idempotency and failure behavior

- A repeated dry run is read-only.
- After a successful apply, a repeat should report both definitions `existing` and zero writes.
- Same-name active definitions are reused; compatible retired definitions are reactivated.
- Any fact drift, identity conflict, unknown canonical exercise, missing authorization, runtime mismatch, owner mismatch, write-count expansion, or post-write verification failure aborts and rolls back.

### Post-apply verification

In a new approved read-only transaction:

- exactly one active compatible Static Hold definition resolves for each named exercise;
- the Logger projection exposes only those exercise-scoped choices;
- all historical `static_hold` occurrences resolve to the intended definition identity;
- the complete canonical-evidence digest and record/version census are unchanged;
- sets/reps/load and performance-event facts are unchanged;
- no `super_set` definition exists;
- rerunning the seed dry run predicts zero writes.

### Rollback plan

Rollback is compensating and separately authorized; it never deletes history:

- a definition newly created by this apply is retired using its exact identity and expected current version;
- a pre-existing retired definition reactivated by this apply is restored to retired status with a new version and preserved identity;
- a pre-existing active/no-op definition is untouched;
- historical evidence is never rewritten in either direction.

The rollback preview must seal the pre-apply definition payloads and post-apply versions so a concurrent change causes refusal.

## Historical Super Set audit

### Verified source/history facts

Prior authorized evidence established exactly three active historical Training sessions in the bounded group:

- two sessions with Leg Extensions and Sissy Squats;
- one session with Seated Hip Adductions and Seated Hip Abductions.

Each session has the same legacy defect on both member occurrences: `executionVariant.key = super_set`. That is six misclassified occurrence fields across three sessions. Each affected occurrence retained weighted-reps sets with reps and external load and no duration. The deployed Build 92 model now reserves the Superset name, so new canonical variant definitions cannot perpetuate this misuse.

The canonical model for the intended meaning is one ordered relationship group:

```text
relationshipType: superset
memberExerciseIds: [existing first occurrence id, existing second occurrence id]
```

The order must come from the confirmed reviewed source/current canonical occurrence order, never from a guessed alphabetical order. Production record IDs and occurrence IDs are intentionally absent from this GitHub report.

### Exact proposed corrections

If and only if the fresh audit preconditions below pass, prepare three correction previews:

1. Leg Extensions + Sissy Squats session A: remove `executionVariant` from those two existing occurrences; add one ordered `superset` group referencing those same occurrence IDs.
2. Leg Extensions + Sissy Squats session B: apply the identical field-level transform to its own two existing occurrences and IDs.
3. Seated Hip Adductions + Seated Hip Abductions session: remove `executionVariant` from those two existing occurrences; add one ordered `superset` group referencing those same occurrence IDs.

For all three previews:

- keep canonical exercise IDs, occurrence IDs, names, occurrence order, set IDs, set order, reps, load, units, measurement types, timestamps, metadata, goal/phase attribution, source references, and unrelated exercises byte-identical;
- do not create a `super_set` definition;
- do not infer round counts, rest intervals, timing, duration, or any other workout fact;
- record correction provenance and bind it to the exact prior canonical identity/version/digest;
- use the existing canonical correction/reconciliation route, not an untracked ad-hoc SQL rewrite.

### Fresh read-only preconditions

The approved PC audit must return a secure local manifest, not a GitHub dump, containing exactly:

- three active target canonical sessions and no fourth target;
- six and only six affected occurrence fields;
- exact storage ID, canonical ID, record version, and payload digest for each target;
- exact affected occurrence IDs and their confirmed order;
- current quality/supersession state;
- reviewed source/review lineage proving each pair is one superset and establishing order;
- full-set digests before correction;
- existing relationship groups and structural-review issues;
- current performance-event, previous-performance, progression, and PR partitions tied to the targets;
- owner/runtime authority and transaction/rollback proof.

Refuse the correction if a target is superseded, duplicated, missing, already corrected, structurally ambiguous, already in another relationship, lacks two stable occurrence IDs, has a conflicting relationship group, or if reviewed source does not establish the pairing/order.

### Required APPLY implementation gate

No guarded Super Set APPLY utility currently seals this exact three-session transformation. Before any mutation, implement and test a narrowly scoped preview/execute service modeled on the repository's historical reconciliation contract:

- preview is the default and runs only in verified read-only mode;
- the preview seals storage/canonical IDs, versions, complete payload digests, affected field paths, set digests, and derived-context census;
- execute requires a separate authorization string and the intact preview digest;
- execute uses one serializable transaction, owner advisory lock, expected versions, and an exact three-record/six-field scope;
- replay detects the already-corrected semantic state and performs zero writes;
- post-write verification proves only the three intended canonical revisions and any explicitly previewed derived-event reconciliation changed;
- any affected performance event or PR/progression interpretation that cannot be reconciled canonically causes HOLD, not a partial write.

The existing text-correction tests prove that explicit Superset syntax can remap relationship members to stable occurrence IDs. They do not, by themselves, authorize reparsing private workout text or prove a current production correction. The dedicated preview must demonstrate byte-preservation of set facts.

### Post-apply verification

In a fresh approved read-only transaction:

- exactly three active target sessions have exactly one valid `superset` relationship group each;
- all six former `super_set` execution-variant fields are absent;
- no affected occurrence belongs to two groups and no member reference dangles;
- the before/after set digests are identical for every occurrence;
- canonical identities and linkable history are preserved according to the approved correction previews;
- unrelated canonical evidence digests and counts are unchanged;
- no `super_set` variant definition exists;
- history rendering shows the actual relationship rather than a variant suffix;
- progression/previous-performance/PR reads use the structured Superset relationship context and do not borrow standalone or stale legacy-variant baselines;
- the same preview replays as already corrected with zero writes.

### Rollback plan

Rollback is a separately authorized compensating canonical correction:

- seal the exact pre-apply payloads and the post-apply versions before commit;
- restore the three prior canonical payload shapes only through expected-version correction/supersession logic;
- if corrected successor records were used, re-activate the prior records and supersede the successors using the canonical lineage mechanism;
- if same-identity revisions were used, submit a compensating revision from the sealed pre-image;
- reconcile only the derived performance events explicitly listed in the approved preview;
- verify the restored payload and set digests and unchanged unrelated evidence.

No direct version decrement, record deletion, broad catalog reset, or partial per-session rollback is permitted.

## Verification performed in this task

Focused tests ran from an exact source archive of the guarded Build 93 Server integration candidate `d2b39b6d283d1033c8894e96c9720039befdd881`, which contains the deployed variant foundation plus the still-undeployed guarded Build 93 integrations. No candidate branch was modified.

- 5 test files passed.
- 47 tests passed, 0 failed.
- Coverage included the two-target legacy seed, dry-run zero-write behavior, apply drift/idempotency/refusal, reserved Superset names, stable variant partitioning, explicit Superset correction/remapping, relationship validation, and progression partition isolation.

The default Vitest configuration initially selected only Storybook tests; the successful run used `vitest.unit.config.js`. No Xcode work was started, so Claude's Recovery lane and Mac resources were not disturbed.

## Dry-run result and decision

| Group | Source result | Fresh production result | APPLY disposition |
|---|---|---|---|
| Static Hold | Exact two-definition scope verified; implementation/tests green | Not run from this Mac; current counts/digests unknown | HOLD pending approved PC dry run and separate Founder APPLY authorization |
| Super Set | Exact three-session/six-field logical transform identified; correction/relationship tests green | Not run from this Mac; IDs, versions, ordering lineage and derived-context effects unknown | HOLD pending approved PC audit, guarded preview/execute candidate, and separate Founder APPLY authorization |

## Founder decisions required

1. Authorize/resume the bounded production dry run from the established Founder-PC runner. This is still read-only and is not authorization to APPLY.
2. After reviewing the fresh Static Hold facts, separately decide whether to authorize the at-most-two-definition APPLY.
3. After reviewing the secure three-session Super Set manifest and guarded correction candidate, separately decide whether to authorize its APPLY. Any ambiguity remains HOLD.

## Safety

- Production reads this task: 0.
- Production writes: 0.
- Deployments/uploads/build bumps: 0.
- Credentials/secrets/production exports in report: 0.
- Private record IDs or Founder workout values in report: 0.
- Latest release pointers changed: no.
