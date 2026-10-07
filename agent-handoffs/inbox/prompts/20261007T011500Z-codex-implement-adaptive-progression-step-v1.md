PhysiqueOS Training progression — implement adaptive step intelligence V1

Continue in this current Codex conversation and current provided work environment.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

BASE

Start from validated eligibility candidate:
999a225a38ced9ddb16a65bbe840896472265468

Do NOT base implementation on the prescription-dependent candidate a7d3ef8ac90d6ebc92cf00d34645496105f57a3a.

Audit/design authority:
60887103bce1ded9ec13dedc61a2d8d7c51b4a96

Current production:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

GOAL

Implement the small evidence-adaptive progression step V1 exactly as approved.

Keep the validated eligibility engine behavior unchanged.

Only after eligibility is true, select exactly one of:

1. REP STEP
+1 rep on every current working set at the same load.

2. LOAD STEP
Increase load using one uniquely repeated compatible historical increment.

3. NONE
Progression opportunity / consider progression with no target.

No formal rep-range system.
No program/template authoring.
No exercise-specific rules.
No hard-coded low-rep threshold.
No ML.
No inferred reset-rep target.

ELIGIBILITY FREEZE

Preserve byte-for-behavior:
- configured successful-session requirement;
- Founder 14-day floor;
- first qualifying success exposure anchor;
- repeated successes do not reset exposure;
- new load/material context resets exposure;
- exact exercise/variant/relationship partition;
- regression/recovery precedence;
- same-day handling;
- fail-closed strategy ambiguity.

Do not modify these semantics except where technically required to call the downstream selector.

STEP SELECTOR INPUT

Use finalized active exact-context canonical Training evidence already available to the progression service.

Reuse the existing canonical load-semantics classifier.

Build one bounded exact-context summary containing only what V1 needs:

- current complete uniform working-set profile;
- current load and load semantics/unit;
- current set count and reps;
- contiguous same-load runs;
- last profile before current load transition;
- first profile at current load;
- latest profile;
- same-load rep trajectory;
- earlier compatible positive load transitions;
- increment sizes and recurrence counts;
- post-transition rep drops/rebuild status;
- stable history references already allowed by the existing contract.

Do not independently redefine warmups or successful sessions.
Use the eligibility engine’s current qualifying profile/context.

REP SUPPORT

repSupported = true only when all are true:

- eligibility already passed;
- current qualifying profile is uniform across the working sets and representable by the current contract;
- current load semantics are known;
- current-load history shows a non-regressing rep advance toward the latest uniform profile;
- either:
  A. the current run is still rebuilding from the immediate prior load transition, OR
  B. no supported load step exists;
- same-load +1 rep on every working set is structurally representable.

Define unresolved rebuild as:
- a prior comparable load transition caused a rep drop;
- latest current-load profile remains below the last comparable pre-transition rep profile.

Do not infer a formal rep ceiling.

LOAD SUPPORT

loadSupported = true only when all are true:

- eligibility already passed;
- exactly one positive increment size recurs in at least TWO compatible historical transitions;
- exercise/variant/relationship/load semantics/unit/set-count are compatible;
- current load is positive;
- prior use of that increment has no unresolved regression/recovery conflict;
- current uniform rep profile meets or exceeds the relevant pre-transition profiles associated with that repeated increment;
- current run is NOT still rebuilding the immediate prior transition.

If:
- multiple competing recurring increment sizes;
- only one increment observation;
- semantics/unit/context mismatch;
- unresolved rebuild;
then loadSupported = false.

For weighted-bodyweight:
- only weighted_bodyweight -> weighted_bodyweight transitions may establish the next compatible added-load increment;
- bodyweight -> weighted_bodyweight may establish a material transition and rep drop, but NOT the next load increment size.

UNIQUE SUPPORT DECISION

repSupported true, loadSupported false:
- progressionStep.kind = reps
- same current load
- +1 rep per current working set
- reasonCode = same_load_rep_rebuild_supported
- confidence = supported

repSupported false, loadSupported true:
- progressionStep.kind = load
- nextLoad = current load + repeated compatible increment
- nextRepTarget = null
- reasonCode = repeated_compatible_load_increment_supported
- confidence = supported

both false:
- progressionStep.kind = none
- no next target
- reasonCode = no_supported_step or more specific fail-closed code
- confidence = insufficient

both true:
- progressionStep.kind = none
- no target
- reasonCode = competing_rep_and_load_evidence
- confidence = insufficient

Do not choose between competing supported propositions in V1.

SERVER CONTRACT

Reuse/simplify the additive progressionStep shape.

Minimum useful fields:

- kind: reps | load | none
- currentLoad
- nextLoad
- currentRepTarget
- nextRepTarget
- loadType
- unit
- reasonCode
- confidence

Keep existing top-level:
- status
- recommendedAction
- suggestedLoad
- suggestedReps
- eligibility gates
- comparison context
- history references

Backward compatibility:
- existing clients may ignore progressionStep.
- Native remains presentation-only.
- Web Logger must consume Server projection rather than recreate selector logic client-side.

Map legacy suggested fields coherently:
- REP STEP: suggestedLoad=current load, suggestedReps=next rep target where current contract permits.
- LOAD STEP: suggestedLoad=next load, suggestedReps must NOT invent reset reps; leave null/unavailable if contract allows.
- NONE: no suggested target.

If existing legacy field requirements make a null rep value unsafe for load-step clients, fail closed rather than fabricating reset reps and document the compatibility constraint.

REASON CODES

Keep small/stable:
- same_load_rep_rebuild_supported
- repeated_compatible_load_increment_supported
- competing_rep_and_load_evidence
- no_supported_step
- ambiguous_load_semantics
- non_uniform_current_profile
- insufficient_compatible_history

Do not proliferate codes unnecessarily.

RELATIVE METRICS

You may compute for explanation/tests:
- +1/current reps
- increment/current external load where denominator is meaningful

Do NOT use these as hard universal thresholds in V1.

Do NOT require bodyweight data.

REAL PRODUCTION FIXTURES — REQUIRED

Encode the sanitized real cases from 60887103 as deterministic tests.

PULL-UP

History:
- canonical semantics bodyweight -> weighted_bodyweight
- bodyweight profile 4 x 13
- +25 first profile 4 x 6
- +25 run: three 4 x 6, one mixed 6/7, then two 4 x 7
- eligibility passes
- no compatible weighted_bodyweight -> weighted_bodyweight increment

Expected:
REP STEP
same +25 lb
4 x 8
supported
same_load_rep_rebuild_supported

CABLE MACHINE FRONT RAISE

History:
- 130 -> 140: +10, 4 x 13 -> 4 x 12
- 140 -> 150: +10, 4 x 12 -> 4 x 9
- current 150 run: two 4 x 9, then five 4 x 10
- eligibility passes

Expected:
REP STEP
150 lb
4 x 11
Reason:
current run still below prior transition profiles; unresolved rebuild
Load +10 is a supported increment SIZE, but not supported as TODAY’S step.

SPIDER CURL

- 50 lb
- 4 x 11
- 3 qualifying sessions
- 13 exposure days
- eligibility fails

Expected:
Maintain
selector not invoked.

ADDITIONAL REQUIRED TESTS

- sparse history after eligibility -> none
- no compatible increment + clear same-load rebuild -> reps
- repeated compatible increment twice + rebuilt current profile meeting trigger profiles + no active rebuild -> load
- competing recurring increment sizes -> none
- one historical increment only -> none
- weighted-bodyweight semantics
- bodyweight -> weighted transition cannot seed next increment
- ordinary external-load movement
- unknown/ambiguous load semantics -> none
- non-uniform current working profile -> none
- exact variant partition
- exact relationship partition
- regression/recovery path -> selector not invoked
- duplicate session ID de-dup
- same-day behavior unchanged
- future +1 rep finalized session changes summary without stored learned state
- future load transition naturally changes increment evidence
- load step never invents reset reps
- Web/Native clients ignoring progressionStep remain backward compatible
- cache invalidation/read freshness where recommendation changes.

NO NEW PERSISTED LEARNED STATE

V1 recomputes from canonical evidence on read.

Do not add:
- learned-state table;
- new collection;
- migration;
- backfill;
- user-specific scoring weights.

If performance becomes an issue, note future derived-cache option but do not implement.

TEST GATES

Run:
- focused V1 selector tests;
- full existing progression suite;
- Logger/Operating Plan focused gates;
- exact Phase 6 Training gate;
- Native/Core projection contract;
- changed-file lint;
- git diff --check;
- broader relevant Server tests.

All existing 999a225a eligibility regressions must remain green.

PRODUCTION SHADOW

After implementation and all local gates pass, Founder explicitly authorizes ONE bounded read-only production shadow using proven d789ce27 tooling.

Do not mutate production.

Use the already established exact-context canonical Training evidence semantics and only the three bounded examples:

- cable_machine_front_raise
- pull_up
- spider_curl

Freshly verify production authority first.

Shadow:
CURRENT production b7eb1e39
vs
NEW V1 candidate

Report:
- eligibility result
- selector invoked yes/no
- repSupported
- loadSupported
- resulting progressionStep
- suggested legacy fields
- exact bounded rationale

Expected if implementation matches audit:
- Pull-Up -> +1 rep to 4 x 8 @ +25
- Cable -> +1 rep to 4 x 11 @ 150
- Spider -> Maintain, selector not invoked

If production evidence differs from the audited snapshot, use actual evidence and explain the delta.

Do not retry automatically if transport fails.

DEPLOYMENT DECISION

Publish explicit:
DEPLOY
or
HOLD / DO NOT DEPLOY

Do NOT deploy in this task.

Only recommend DEPLOY if:
- local gates green;
- bounded production shadow coherent;
- backward compatibility safe;
- no migration/backfill;
- no target invention.

OUTPUT

Push one isolated Server candidate based on 999a225a.

Publish main-visible report-only handoff containing:
- candidate SHA;
- exact selector policy;
- files changed;
- contract behavior;
- Pull-Up/Cable/Spider results;
- all tests;
- production shadow;
- backward compatibility;
- migration/backfill;
- deployment recommendation;
- rollback identity;
- confirmation no production mutation and Native Build 89/90 untouched.

Status if green:
Adaptive progression step V1 implemented — candidate ready for Founder deployment review.

Do not deploy.
STOP.

END TASK.