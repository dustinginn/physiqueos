# Adaptive progression-step V1 audit — Founder review ready

## Recommendation

**IMPLEMENT V1**, narrowly and downstream of the already validated eligibility engine.

V1 should make exactly one deterministic choice after eligibility is true:

- `reps`: +1 rep on every current working set at the same load;
- `load`: the uniquely repeated compatible historical load increment, with no invented reset-rep target;
- `none`: Progression opportunity — consider progression, with no target.

The selector should derive two independent evidence propositions—“rep step supported” and “load step supported”—from the user’s own finalized, exact-context history. It should emit a target only when exactly one proposition is supported. If neither or both are supported, it should fail closed to `none`.

The real evidence supports:

| Case | V1 result | Why |
|---|---|---|
| Weighted Pull-Ups | **REP STEP: +25 lb, 4 × 8** | Canonical weighted-bodyweight semantics; current run rebuilt from 4 × 6 through a mixed 6/7 session to two 4 × 7 sessions; no compatible weighted-bodyweight increment exists |
| Cable Machine Front Raises | **REP STEP: 150 lb, 4 × 11** | +10 lb is a proven load-step size, but current 4 × 10 remains below prior transition profiles of 4 × 13 and 4 × 12; the current run is still rebuilding, so rep evidence is supported while load timing is not |
| Spider Curls | **Selector not invoked; Maintain** | Eligibility remains false at 13/14 exposure days; V1 stays strictly downstream |

This is intentionally more conservative than the prior 160 lb × 8 Cable target. The +10 lb increment size is evidence-supported; choosing it now and inventing 8 reset reps are not. The smallest supported action is 4 × 11 at the current 150 lb.

No eligibility behavior, Training Strategy, production data, deployment, or Native Build 89/90 was changed. No V1 code was implemented.

## Authorities

- Task authority: `952c541ea36d5fab122910f593e10977747d2b06`
- Current production Server: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Validated eligibility candidate, unchanged: `999a225a38ced9ddb16a65bbe840896472265468`
- Refined prescription-based step candidate, reference only: `a7d3ef8ac90d6ebc92cf00d34645496105f57a3a`
- Corrected production shadow: `1e42df817065bdb3e7afc85c8dce06ac6cb47b6e`
- Prescription-authority audit: `6dcc9f5680f4ca6f877193de655a847f88403540`
- Production-read tooling used byte-identically: `d789ce2770eda2f9bdb13a48bbc572901f2c61e2`

## Bounded evidence completion

The prior sanitized shadow did not include rep profiles immediately before/after Cable’s load transitions. Those profiles are essential to distinguish a load step from an unfinished rep rebuild, so the task-authorized single read-only audit was performed.

Safety result:

- exact approved context only;
- exact app `bf57cf56-48cc-4cd6-90e4-a23ee5381741`;
- ACTIVE deployment `6fa4e887-8849-450b-b068-5bdb11b90009`;
- web/worker/runtime source exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`;
- health build `physiqueos-b7eb1e39-20261005`;
- one owner-scoped, 120-row-capped `SELECT`;
- one `REPEATABLE READ READ ONLY` transaction with `transaction_read_only=on`;
- explicit rollback, canonical frame/marker/zero-exit acceptance;
- post-read app/deployment/source/build unchanged;
- no raw sessions, owner identifier, credentials, notes, or unrelated records emitted.

The audit returned only exact ordinary/standalone transition summaries for the three predeclared canonical exercise IDs. No bodyweight record was queried because V1 does not need it to choose the Pull-Up step.

## Evidence already available

### Directly observed in finalized canonical Training evidence

- observed session date/time;
- canonical exercise ID;
- every persisted completed set’s reps, load, unit, and load-type fields;
- set count and exact set profile;
- execution variant;
- relationship/superset context;
- active versus pending/draft/partial/superseded state;
- ordered same-load runs and load transitions.

### Canonical read-time interpretation already available

- `bodyweight`, `weighted_bodyweight`, `external_load`, or `unknown` through the Server-owned load-semantics classifier;
- Pull-Up’s canonical default load type is bodyweight, so a positive external load is legitimately classified as added weighted-bodyweight load;
- exact exercise/variant/relationship comparison partitions;
- de-duplication by finalized session;
- current eligibility facts and history references.

### Safely derived for V1

- current complete uniform working-set profile;
- current-load entry profile and later rep movement;
- contiguous load runs;
- pre-transition and first post-transition rep profiles;
- whether the current run is still rebuilding the immediately prior profile;
- positive compatible increments within the same load semantics and unit;
- how many times one exact increment recurs;
- post-transition rep drop and whether/when it rebuilt;
- `+1 / current reps` as an explanatory rep-step magnitude;
- `increment / current external load` as an explanatory load-step magnitude when the denominator is valid.

The selector must use the existing eligibility engine’s notion of the current working-set profile. V1 must not independently reclassify warmups, redefine successful sessions, or alter the exposure anchor.

## Evidence not reliably available

- intended/formal rep range or top-of-range;
- prescribed reset reps after a load increase;
- RPE, RIR, technique quality, range of motion, pain, or why the user selected a load;
- failed or abandoned attempts that were never finalized;
- the equipment’s true smallest increment or mechanical resistance curve;
- an authoritative planned target;
- a session-linked contemporaneous bodyweight inside the Training Logger read;
- assisted/counterweighted bodyweight semantics;
- proof that nominal machine/cable pounds equal cross-machine resistance.

Absence of a later session is not failure evidence. A lower finalized comparable session is evidence, and existing recovery/regression precedence continues to own that case before V1 runs.

## Exact minimal V1 decision model

### 0. Preconditions — unchanged

Do not invoke the selector unless the existing eligibility result is true. Preserve exactly:

- configured successful-session requirement;
- 14-day Founder floor;
- first qualifying-success exposure anchor;
- repeated successes do not reset exposure;
- new load/material context resets exposure;
- canonical exercise/variant/relationship partition;
- regression/recovery precedence;
- same-day session handling already validated by the eligibility candidate.

### 1. Build one exact-context evidence summary

From finalized active sessions only:

1. Use the canonical load-semantics classifier.
2. Require the current qualifying profile to have one load semantics/unit and a uniform rep count across the working sets. Otherwise return `none` because the existing contract has one rep target.
3. Partition history into contiguous load runs.
4. For the transition into the current run, retain the last prior profile, first current-load profile, latest profile, and rebuild status.
5. Collect earlier positive transitions only when exercise, variant, relationship, load semantics, unit, and set count are compatible.

### 2. Rep-step support

`repSupported = true` only when all are true:

- the current-load run contains an observed non-regressing rep advance toward the latest uniform profile;
- the latest profile has the qualifying repetitions already established by eligibility;
- the transition/current-run evidence shows an unresolved rebuild, or no supported load step exists;
- load semantics are known;
- `latest reps + 1` is representable as the same-load, same-set-count target.

An unresolved rebuild means the load transition caused a rep drop and the latest current-load profile remains below the last comparable pre-transition profile. This is a comparison to the user’s own evidence, not an inferred rep range.

### 3. Load-step support

`loadSupported = true` only when all are true:

- exactly one positive increment size recurs in at least two compatible historical transitions;
- current load is positive, unit/semantics are unchanged, and the increment produces a valid next load;
- prior use of that increment has not produced unresolved regression evidence;
- the current uniform rep profile meets or exceeds the user’s own relevant pre-transition profiles for that repeated increment;
- the current run is not still rebuilding the immediate prior transition.

If multiple recurring increment sizes compete, if the increment appears only once, or if context/semantics changed, load support is false. V1 must not choose the minimum of unrelated increments merely because it is numerically smallest.

For weighted-bodyweight movements, only weighted-bodyweight → weighted-bodyweight transitions can establish a compatible added-load increment. Bodyweight → weighted-bodyweight proves a material transition and rep drop, but not the size of the next added-load step.

### 4. Unique-support selection

| `repSupported` | `loadSupported` | Result |
|---:|---:|---|
| true | false | `reps`, same load, every working set +1 rep |
| false | true | `load`, current load + repeated compatible increment; next reps remain null |
| false | false | `none`, Consider Progression |
| true | true | `none`, competing evidence |

This is the full V1 decision table. There is no score, learned weight, exercise list, rep threshold, or inferred formal range.

## Relative step size

The ratios are useful evidence diagnostics, not universal decision thresholds and not dimensionally interchangeable:

- Pull-Up rep step: `1 / 7 = 14.3%` more reps at the same added load.
- Cable rep step: `1 / 10 = 10%` more reps.
- Cable proven load step: `10 / 150 = 6.7%` more nominal external load.

The fact that 6.7% is numerically below 10% does not prove that Cable loading is the smaller physiological step. Reps and nominal machine pounds measure different things.

Do not compute external-load percentage when current external load is zero or near-zero. Do not use added-load percentage alone for weighted-bodyweight movements; `25 / 25` would misleadingly describe the Pull-Up transition as 100% even though bodyweight materially participates.

## Bodyweight decision

Bodyweight may participate only when canonical semantics establish it:

- Pull-Up is canonically bodyweight-default.
- Its bodyweight-only sets classify as `bodyweight`.
- Its +25 lb sets classify as `weighted_bodyweight`, not ordinary external-load sets.
- Therefore the bodyweight → +25 lb transition and its rep drop are valid evidence of a material loading change.

The roughly 170 lb weight context in the staged task makes the +25 lb introduction roughly a 15% increase over bodyweight (and roughly 13% of bodyweight plus added load). That is directionally useful, but V1 should not consume it. The Training Logger read does not currently include weight entries, the exact workout-linked weight was not established, and total effective resistance is movement-dependent. Pull-Up resolves to REP without this estimate.

V1 should add `weightEntries` or an effective-resistance calculation only in a later separately reviewed version if exact date linkage and semantics materially improve decisions. Ambiguous bodyweight or assisted-load semantics must return `none`.

## Real cases

### Weighted Pull-Ups — REP STEP

Sanitized exact-context evidence:

- 12 ordinary/standalone occurrences;
- canonical semantics: bodyweight → weighted bodyweight;
- bodyweight transition profile: 4 × 13;
- first +25 lb profile: 4 × 6;
- six-session +25 lb run: three 4 × 6, one mixed 6/7, then two 4 × 7;
- no weighted-bodyweight → weighted-bodyweight increment exists.

The current run shows a concrete one-rep rebuild while the large bodyweight → +25 lb transition remains unrecovered. The transition cannot establish the next added-load increment because its semantics changed. With eligibility already true, exactly one proposition is supported: **+1 rep at the same +25 lb, yielding 4 × 8**.

### Cable Machine Front Raises — REP STEP

Selector-usable exact-context evidence:

- 11 complete uniform-load ordinary/standalone occurrences in the bounded summary;
- 130 → 140 lb: +10 lb, 4 × 13 → 4 × 12;
- 140 → 150 lb: +10 lb, 4 × 12 → 4 × 9;
- current 150 lb run: two 4 × 9, then five 4 × 10;
- latest 4 × 10 has not rebuilt the immediately prior 4 × 12 profile.

The repeated +10 establishes a compatible future load size and `160 lb` as a possible user-history-derived load. It does not establish that now is the right step, and it supplies no reset reps. The current run has directly advanced from 9 to 10 reps but remains below both prior transition profiles. Under the explicit predicates, rep support is true and load support is false. V1 therefore returns **+1 rep at the same 150 lb, yielding 4 × 11**.

Future evidence resolves this naturally. Repeated 4 × 11/12 sessions would strengthen/complete the rebuild; reaching the user’s prior transition profiles while preserving the repeated +10 history would make a load step uniquely supportable. A finalized 160 lb session chosen manually would add another real transition, but V1 must not use a future choice to justify today’s recommendation retroactively.

### Spider Curls — selector not invoked

- current evidence remains 50 lb, 4 × 11, three qualifying sessions, 13 exposure days;
- count gate passes; 14-day floor does not;
- result stays Maintain / `minimum_exposure_gate_pending`;
- no progression-step selector call and no target.

The bounded summary also shows repeated +5 lb historical transitions, but that is irrelevant until eligibility passes. This is the required proof that V1 is downstream only.

## Confidence and explanation

Use two confidence values only:

- `supported`: exactly one decision proposition is true and every required evidence fact is present;
- `insufficient`: neither or both propositions are true, or semantics/context/profile is ambiguous.

Each recommendation should expose a short stable reason code plus bounded facts, for example:

- `same_load_rep_rebuild_supported`;
- `repeated_compatible_load_increment_supported`;
- `competing_rep_and_load_evidence`;
- `no_supported_step`;
- `ambiguous_load_semantics`;
- `non_uniform_current_profile`.

No numerical confidence score is needed.

## Smallest Server contract change

Reuse the additive `progressionStep` shape from `a7d3ef8a`, but remove its dependency on explicit prescription fields.

Minimum projection:

```json
{
  "kind": "reps | load | none",
  "currentLoad": 25,
  "nextLoad": 25,
  "currentRepTarget": 7,
  "nextRepTarget": 8,
  "loadType": "weighted_bodyweight",
  "unit": "lb",
  "reasonCode": "same_load_rep_rebuild_supported",
  "confidence": "supported | insufficient"
}
```

For a load step, `nextRepTarget` is null. For `none`, both next fields are null. Keep existing top-level eligibility gates, comparison context, history references, action, and backward-compatible Native fields. Native remains presentation-only and may ignore the additive object.

Do not expose `repRangeMin`, `repRangeMax`, `workingSetsRequired`, `resetRepTarget`, or prescription authority in V1; those imply authority this design intentionally does not have. A bounded `evidenceBasis` object may be added only if UI explanation needs more than the reason code; it should contain counts/ratios, not raw sessions.

## Learning from finalized sessions

No learned-state table is needed. Recompute the summary from canonical evidence on each read:

- a successful +1 rep changes the current-run rep trajectory;
- a manually chosen load increase creates a real transition and increment observation;
- its first post-load profile records the rep drop;
- later sessions show improvement, rebuild completion, plateau, or regression;
- recurring increment sizes gain support only through repeated finalized transitions;
- variant/relationship changes remain isolated automatically.

The existing 120-session bounded Training Logger read is sufficient for V1. If performance later requires it, a cache may store only a derived per-context transition summary keyed by source evidence versions; it is not needed for the first implementation.

## Deterministic test plan

1. Real Pull-Up sequence: bodyweight 4 × 13 → +25 lb 4 × 6 → mixed 6/7 → two 4 × 7; eligible; no compatible increment → REP +25 lb 4 × 8.
2. Real Cable sequence: +10 transitions from 4 × 13 and 4 × 12; current 150 lb 9 → repeated 10 below prior trigger → REP at 150 lb, 4 × 11.
3. Real Spider: 13/14 days → selector spy not invoked; Maintain.
4. Sparse history after eligibility fixture → `none`.
5. No compatible increment plus clear same-load rebuild → REP.
6. Two matching compatible increments, rebuilt current profile meeting historical triggers, no active rep rebuild → LOAD with next reps null.
7. Repeated increments of different sizes with no unique recurring value → `none`.
8. Canonical Pull-Up positive load → weighted-bodyweight; bodyweight → weighted transition cannot seed next increment.
9. Ordinary cable/machine positive load → external-load comparison.
10. Unknown/contradictory bodyweight encoding → `none`.
11. Exact variant partition; evidence from another variant cannot vote.
12. Exact relationship partition; standalone and superset histories cannot vote together.
13. Regression/recovery path → selector not invoked.
14. Two distinct same-day finalized sessions retain current eligibility semantics; duplicate session ID is de-duplicated.
15. Future Pull-Up 4 × 8 sessions update rep evidence without stored learned state.
16. Future Cable 4 × 11/12 sessions change the decision only when the explicit support predicates become unique.
17. Load step never invents reset reps.
18. Contract projection remains backward compatible for Web/Native clients that ignore `progressionStep`.

## What V1 intentionally does not solve

- formal double-progression ranges;
- program/template authoring;
- equipment increment catalogs;
- prescribed reset reps;
- RPE/RIR or technique assessment;
- automatic plan mutation;
- cross-exercise heuristics;
- machine-brand normalization;
- assisted bodyweight movements;
- ML/personalized weights;
- eligibility, recovery, or exposure redesign.

## Implementation scope estimate

This is a small Server change:

- one pure evidence-summary/selector module or a tightly isolated helper in the existing progression service;
- reuse the canonical load-semantics classifier;
- replace only the post-eligibility target-selection call;
- one additive projection adjustment;
- approximately 150–250 production lines and 300–500 focused test lines;
- no database migration, new collection, backfill, Training Strategy mutation, Native code, or UI requirement.

Implementation should start from `999a225a`, not merge the prescription-dependent selector from `a7d3ef8a`. The existing eligibility suite must remain byte-for-behavior unchanged, followed by the full progression/Phase 6/Logger gates and a bounded production shadow before any deploy recommendation.

## Final decision

**IMPLEMENT V1.** It is small, evidence-adaptive, deterministic, explainable, and fail-closed. It provides evidence-backed rep steps for Pull-Up and Cable without inventing ranges or reset reps, and leaves Spider eligibility unchanged.

No implementation or deployment is authorized by this audit.

## Status

**Adaptive progression step V1 audit complete — Founder review ready.**
