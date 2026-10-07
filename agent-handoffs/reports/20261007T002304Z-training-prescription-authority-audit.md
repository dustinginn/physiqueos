# Training prescription authority audit — next architecture decision ready

## Decision

**Outcome D: no trustworthy existing per-exercise prescription authority exists. Establish it anew inside the immutable Training Strategy lineage.**

The repository has a clear prospective authority for Training policy—the active `protocolVersions[].trainingStrategy`—and a clear retrospective authority for performed work—canonical Training evidence. It does not have a persisted current-program/template object that defines intended working sets, rep ranges, targets, increments, or prescribed loads per exercise. The active Training Strategy can be minimally extended as the canonical home, but the missing prescription values cannot be recovered losslessly from any existing repository-owned source.

Do not infer or promote prescription values from workout history. If the Founder has an authoritative program artifact outside PhysiqueOS, ingest it only through a reviewed program-authoring/import flow and create a new immutable Training protocol version with provenance.

No production read was performed. The task authorized one only if this source audit found a plausible persisted production source; the exhaustive collection/model/history audit found none.

No code, schema, Training Strategy, production data, deployment, or Native Build 89/90 was changed.

## Authorities audited

- Production Server authority supplied by the task: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Validated eligibility candidate: `999a225a38ced9ddb16a65bbe840896472265468`
- Refined step candidate inspected: `a7d3ef8ac90d6ebc92cf00d34645496105f57a3a`
- Refinement report: `2a5027a91a423ef118182c2b09ae848f4a66de84`
- Audit instruction authority: `72e9811eedfe1f7fb47062dfb9907dd869c5f95a`
- Proven production-read tooling, intentionally not invoked: `d789ce2770eda2f9bdb13a48bbc572901f2c61e2`

## Essential distinction

### PLAN / PRESCRIPTION

An executable prescription is prospective. It says what should be done and must carry explicit identity, version/effective semantics, canonical exercise linkage, working sets, rep range/current target, rep increment, prescribed load, reset target, and load-step authority.

### PERFORMED EVIDENCE

Canonical Training sessions, Logger drafts, voice/screenshot extraction, previous-performance projections, and performance events say what was performed or observed. Their sets, reps, and loads may evaluate a prescription, but they cannot define one.

The repository uses the word “prescription” in some voice/screenshot parsing code for extracted set/rep/load clauses. That is ingestion terminology for reported performance; it is not planned-program authority.

## Source-by-source audit

| Source | Fields found | Authority class and persistence | Version / identity / Logger survival | Safe progression use |
|---|---|---|---|---|
| Active Training protocol/version | Objective, physique priorities, weekly area frequencies, preferred weekly rhythm, nutrition phase, recovery gates, progression pace, generic double-progression rule, successful-session and exposure gates; refined candidate adds empty/default prescription extension points | **Prospective policy authority** in `protocols` and append-only `protocolVersions` (`canonical_protocol_records`) | Immutable version/effective date; no exercise prescription instances in the active shape. Server projects the active version to Logger recommendations | Correct canonical home, but currently insufficient for rep-vs-load selection |
| Training protocol builder | Same strategy-level fields; default rule and empty `exerciseOverrides` | Builder input for a future protocol version | Canonical version on activation. Its own `evidenceBasis.limitations` says exercise rep ranges, working sets, rep increments, reset targets, and equipment increments are not configured | Cannot select an executable step until populated from explicit authority |
| Training Strategy editor / Native edit contract | Weekly area frequencies, priorities, progression pace | Prospective strategy edit; saves an immutable successor version | Preserves unknown existing progression fields, but does not author per-exercise prescriptions. Native receives the same narrow editor projection | No hidden prescription source; cannot create or validate the required values |
| Legacy Operating Plan training block | Weekday/weekend pattern, estimated duration/calories, margin, notes | Prospective operating context in `operatingPlan` (`canonical_plan_records`) | No program/template identity and no canonical exercise linkage | Not consumable for double progression |
| Execution items / schedules | Generic commitment/evidence/recovery/protocol item, cadence, preferred schedule, linked strategy/goal/evidence IDs | Prospective scheduling in `executionItems` (`canonical_execution_records`) | Stable item identity, but no exercise occurrence, sets, reps, load, or prescription version | Not consumable |
| Workout/program/template/session-generation models | No repository-owned Training program, workout template, planned session, or exercise-prescription model was found | **Absent** from current source and canonical collection map | No persistence, identity, version, or effective-date semantics exist | No source to consume |
| Suggested Today | Suggested body-area/category pattern derived after repeated same-weekday confirmed sessions | **Derived performed-history suggestion**, not a plan; read-time only | Carries history references, not a program version or exercise prescription; reaches Logger as a category suggestion | Must not define sets, reps, or load |
| Logger production draft/read model | Exercise registry, performed exercise IDs, history sessions, previous performance, Server-projected recommendation, in-progress sets | **In-progress/performed evidence**; recoverable draft is client-local and strips `productionContext` | `previousPerformance` initializes draft sets from the last comparable performance. Finalization stores confirmed performed sets, not a planned prescription | Can display a Server plan projection later; cannot be its authority |
| Voice/screenshot interpretation | Extracted exercise name, set count, reps, weight/load and diagnostics called “exercise prescription” | **Reported performed evidence** in an evidence package/review pipeline | Survives confirmation as observed Training evidence when the user confirms it; no plan/program identity | Never infer prospective ranges or targets from it |
| Canonical Training evidence | Canonical exercise ID, occurrence, actual sets/reps/load/load type/unit, observed date, variant, relationship context, provenance, active/superseded state | **Finalized performed evidence** in `canonicalEvidenceObjects` (`canonical_evidence_records`) | Durable and canonical for history; session identity/versioning is evidence lineage, not plan lineage | Appropriate for eligibility/comparison only; never prescription authority |
| Training performance events | Reps-at-load and session-volume PRs with source session/evidence provenance, canonical exercise identity, variant/relationship context | **Derived performed evidence** in `trainingPerformanceEvents` (`canonical_training_records`) | Deterministic event identity and append-only semantics, but no planned range/target | Evaluation/achievement input only |
| Canonical exercise registry | Stable ID/name/aliases, equipment, body region, muscle groups, movement pattern, modifiers, default load type/measurement | **Identity/taxonomy authority** in code plus runtime `canonicalExerciseLibrary` (`canonical_training_records`) | Stable canonical exercise linkage; values survive into Logger and final evidence | Use as the prescription foreign key and load-semantics aid, not as prescription content |
| My Library membership | Canonical exercise membership | User library state in `myLibraryMemberships` (`canonical_training_records`) | Exercise ID only | No prescription content |
| Monthly/briefing/intelligence configuration | Optional `configuredSplit.weeklyFrequencies`; production adapter supplies `configuredSplit: null`; `plannedSessions` is explicitly `null` | Narrative/read-time context | No exercise plan identity or prescription persistence | Not consumable |
| Fixtures, previews, and tests | Synthetic rep ranges/working sets/increments/reset targets in refined-candidate tests; historical performed examples elsewhere | Schema intent and regression evidence only | Not production authority | Must never seed Founder prescriptions |
| Server/Native read contracts | Server projects recommendations and additive progression-step metadata; Native consumes projections. Strategy detail exposes frequencies, priorities, and pace | Server remains sole decision authority; Native is presentation/command transport | Backward-compatible projection exists, but no hidden Native program store or prescription contract exists | Correct delivery path once canonical prescriptions exist |

## Persistence and history evidence

The canonical runtime collection inventory contains `operatingPlan`, `protocols`, `protocolVersions`, `executionItems`, `canonicalEvidenceObjects`, `trainingPerformanceEvents`, `canonicalExerciseLibrary`, and `myLibraryMemberships`. It contains no `trainingPrograms`, `workoutTemplates`, `plannedSessions`, or `exercisePrescriptions` collection.

The PostgreSQL canonical domain tables persist collection payloads as JSONB, and `protocolVersions` already maps to `canonical_protocol_records`. Therefore the recommended embedded/versioned extension does **not** require database DDL. It does require an application-level schema/validation contract and a newly approved immutable protocol version containing real prescription data.

Repository-history searches for the required prescription fields found them only in the recent progression candidates/tests, not in an older program/template authority. Earlier Native Training Operating Plan work introduced strategy reads/writes for weekly frequencies, priorities, and pace—not per-exercise prescriptions.

## Production-read decision and coverage

The conditional production read was **not justified and not performed**. There is no plausible persisted program/template/prescription source in the repository or canonical collection map to inspect. A broad or speculative query would only rediscover performed history, which this task explicitly forbids using as prescription authority.

The prior accepted bounded strategy evidence already established that the active production Training Strategy has the generic double-progression rule and `successfulSessionsRequired: 2`, but no populated exercise override/rep-range authority. This audit did not refresh or expand that read.

Truthful configured coverage is therefore:

- explicit active/current per-exercise prescriptions in the supported authority: **0**;
- complete for true double progression: **0**;
- partial prescription records: **0**;
- ambiguous/duplicate/stale prescription records: **0**;
- three required regression identities with sufficient prescription authority: **0 of 3**;
- total exercises in a “current program”: **not representable**, because no canonical current-program exercise inventory exists.

It would be misleading to use the number of exercises appearing in performed history as the program denominator or to classify their last observed sets as partial prescriptions.

## Three required cases

| Canonical exercise | Authoritative source | Working sets | Rep target/range | Prescribed load | Version/effective authority | Sufficient for refined engine |
|---|---|---:|---|---|---|---|
| `cable_machine_front_raise` | None | Absent | Absent | Absent | No prescription identity/version | **No**. Performed Cable history cannot establish intended top reps, reset reps, or load step. |
| `spider_curl` | None | Absent | Absent | Absent | No prescription identity/version | **No**. The validated 13/14-day Maintain result is evidence/gate behavior, not a prescription source. |
| `pull_up` | None | Absent | Absent | Absent | No prescription identity/version | **No**. Performed weighted Pull-Up history cannot establish whether 7 is below or at the intended ceiling. |

The synthetic Cable 8–10, Spider, and Pull-Up 6–8 values used in candidate tests are regression fixtures only. They are not Founder program authority and must not be copied into production.

## Exact architecture decision

Choose **D**, implemented by making one versioned program/prescription block inside the existing immutable `trainingStrategy` the canonical authority. Do not create parallel authority in Logger drafts, exercise registry records, or performed evidence.

The canonical model should have:

- `programId` and immutable `programVersionId`;
- one `prescriptionId` per canonical exercise/variant/relationship context;
- `prescriptionRevision` and `effectiveAt`;
- `canonicalExerciseId`, explicit execution variant, and relationship context where material;
- working-set count;
- rep-range minimum and maximum;
- explicit current target reps;
- rep increment;
- prescribed load, unit, and load semantics (including bodyweight plus external load);
- load-reset rep target;
- explicit load increment/equipment step or approved allowed-load sequence;
- provenance identifying Founder-authored or Founder-approved imported source;
- a stable `loadExposureContextId` separate from the protocol-version ID.

That last separation is required. Every accepted edit should still create immutable version history, but a rep-only target advancement at the same load must retain the same `loadExposureContextId` and original load-exposure anchor. A prescribed-load change must rotate it and restart the 14-day clock. Material changes to exercise identity, execution variant, relationship context, rep range, working-set count, or program/phase context should also rotate/fail closed unless a reviewed migration rule explicitly proves continuity.

## Migration and versioning recommendation

- **Database migration:** no DDL is required for the recommended embedded JSONB model.
- **Application contract:** required. Add strict validation, bounded reads, immutable successor creation, and read projections.
- **Lossless transformation:** impossible from current PhysiqueOS data; the required intended values do not exist.
- **Founder approval:** one approval can cover a complete imported/authored program version, with per-exercise review required only for unresolved, conflicting, provisional, or exceptional entries. The source artifact itself must be authoritative; workout history is not an import source.
- **Protocol version:** required. Publish prescriptions only in a new immutable Training protocol version with provenance and effective time.
- **Historical workouts:** remain evidence only; no backfill or inferred ranges.
- **Future rep-only update:** immutable prescription revision, same prescribed load and same `loadExposureContextId`; does not reset exposure.
- **Future load update:** immutable prescription revision with new prescribed load and new `loadExposureContextId`; resets exposure.
- **Future program/phase/context update:** new program/protocol version and explicit context rotation; old evidence remains queryable but is not silently treated as qualifying.

## Product implications

- Weighted low-rep compounds receive explicit low ranges and load steps without hard-coded “low rep” heuristics.
- Bodyweight-plus-external-load movements carry bodyweight semantics plus prescribed added load; the registry supplies identity/default semantics, while the prescription supplies the target.
- High-rep isolation work receives its own explicit range and rep increment.
- Cable/machine work can encode the actual equipment stack increment or approved allowed loads; no target load is invented.
- Every exercise may have a distinct range and working-set count under stable canonical identity.
- User-created programs can be drafts until all exercise identities and required prescription fields validate, then become one approved immutable program version.
- Phase/program changes create explicit version boundaries rather than exercise-name heuristics or silent history reuse.
- Native remains a backward-compatible projection consumer; Server remains the sole progression authority.

## Founder decisions required next

1. Confirm the canonical-home decision: prescriptions live inside versioned Training Strategy/program authority, with read projections elsewhere.
2. Identify the authoritative source for the current program: an existing external program artifact to import, or a new authoring flow. Do not nominate workout history.
3. Approve the minimum required field set, including equipment/load-step authority and the separate load-exposure context identifier.
4. Decide whether program-level approval with exception review is acceptable; that is safer and less burdensome than manual approval of every clean imported row.
5. Confirm that current target advancement is explicit planned state, not inferred from the last performed workout.

## Exact recommended implementation sequence

1. Write and approve a small architecture decision record defining planned prescription versus performed evidence, canonical ownership, immutable version semantics, and exposure-context rotation.
2. Add the strict application-level prescription model and validation under `trainingStrategy`; use canonical exercise IDs and no name heuristics.
3. Build a bounded program author/import draft that reports missing, duplicate, provisional, and conflicting prescriptions before approval.
4. Add Founder review/confirmation and publish one immutable Training protocol successor with provenance and effective time.
5. Project that single authority to Server progression and Logger/Native reads; do not duplicate it into drafts, registry, or evidence.
6. Update the refined step engine so rep-only prescription revisions preserve `loadExposureContextId`, while load/material-context changes rotate it and reset/fail closed.
7. Add regression coverage for Cable, Spider Curl, weighted Pull-Up, low-rep compounds, high-rep isolation, cable increments, weighted bodyweight, and phase changes.
8. Run the full progression, Phase 6 Training, Logger, Operating Plan, contract, and lint gates.
9. Perform a newly authorized bounded read-only shadow using the approved candidate strategy version and identical sanitized evidence.
10. Publish a separate DEPLOY / DO NOT DEPLOY recommendation and wait for explicit Founder deployment authorization.

## Audit integrity

- No production console/API/database call occurred.
- No Founder records were accessed.
- No repository implementation file or schema changed.
- No Training Strategy or production state changed.
- No deployment occurred.
- Native Build 89 and Build 90 were untouched.
- No additional task, conversation, session, agent, worktree, or context was created.

## Status

**Training prescription authority audit complete — next architecture decision ready.**
