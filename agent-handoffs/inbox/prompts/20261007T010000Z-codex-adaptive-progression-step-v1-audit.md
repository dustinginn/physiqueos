PhysiqueOS Training progression — small adaptive step intelligence V1 audit/design

Continue in this current Codex conversation and current provided work environment.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

TASK TYPE

AUDIT / DESIGN ONLY.

Do not implement the large prescription-authority system proposed in the prior audit.
Do not mutate Training Strategy.
Do not deploy.
Do not mutate production.
Do not touch Native Build 89/90.

AUTHORITIES

Current production:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

Validated eligibility candidate:
999a225a38ced9ddb16a65bbe840896472265468

Refined step candidate for reference only:
a7d3ef8ac90d6ebc92cf00d34645496105f57a3a

Corrected production shadow:
1e42df817065bdb3e7afc85c8dce06ac6cb47b6e

Prescription-authority audit:
6dcc9f5680f4ca6f877193de655a847f88403540

FOUNDER DIRECTION

Do NOT build a large explicit prescription/program system yet.

Build toward one small adaptive intelligence step and learn from real behavior over time.

Keep the validated eligibility architecture unchanged.

After eligibility passes, V1 should answer only:

Is +1 rep at the current load a better evidence-supported next step than increasing load?

Allowed post-eligibility outcomes:

1. REP STEP
+1 rep at the same load.

2. LOAD STEP
Increase load using an evidence-supported compatible historical increment.

3. CONSIDER PROGRESSION
Eligibility is true, but evidence is insufficient to safely choose either step.

No giant exercise-specific ruleset.
No hard-coded pull-up/squat/deadlift/cable categories.
No arbitrary low-rep threshold such as <=8.
No inferred formal rep range.
No requirement to build program authoring first.

GOAL

Audit the evidence already available to determine the smallest safe V1 selector that can learn from each user's exercise history.

Design a transparent, deterministic evidence-adaptive selector that can later accumulate confidence as more sessions occur.

Do not implement it yet.

ELIGIBILITY IS OUT OF SCOPE

Preserve exactly:
- configured successful-session requirement;
- 14-day Founder floor;
- first qualifying success exposure anchor;
- repeated successes do not reset exposure;
- new load/material context resets;
- exact exercise/variant/relationship partition;
- regression/recovery precedence.

Do not redesign these gates.

V1 STEP EVIDENCE

Audit what existing canonical evidence can reliably provide for step selection:

- current working load;
- current reps per working set;
- working-set count;
- recent same-load rep progression;
- prior compatible load transitions;
- absolute load increment;
- percentage external-load increment;
- reps immediately before load increase;
- reps immediately after load increase;
- time/sessions required to rebuild reps;
- load type/unit;
- bodyweight-vs-external-load semantics;
- user's contemporaneous bodyweight when relevant and reliably available;
- total effective resistance for weighted bodyweight movements if it can be derived safely;
- exercise/variant/relationship partition;
- historical success/failure after similar steps.

Distinguish directly observed values from derived values.

Do not use bodyweight in a movement unless the load semantics establish that bodyweight materially participates.

Do not assume every bodyweight exercise equals bodyweight + external load without canonical load semantics.

THREE REAL CASES

Use the already sanitized production findings as the core audit examples.

A. Weighted Pull-Ups

Known pattern:
- bodyweight roughly 170 lb is available elsewhere in PhysiqueOS;
- earlier bodyweight-only working sets approximately 12–14 reps;
- +25 lb external load was introduced;
- total effective resistance therefore increased roughly 15% IF canonical weighted-bodyweight semantics justify combining bodyweight and external load;
- reps dropped to about 6;
- after several weeks at +25 lb, working sets advanced to 7;
- eligibility gates are now satisfied;
- no safe historical compatible external-load increment was proven by the prior shadow.

Founder intuition:
the next sensible step is likely +1 rep at the same +25 lb, not another large load jump.

Audit whether canonical evidence actually supports this conclusion without inventing a rep range.

B. Cable Machine Front Raises

Known:
- 150 lb;
- 4 x 10;
- five qualifying sessions;
- 28 exposure days;
- compatible prior +10 lb increments from 130 -> 140 -> 150;
- eligibility passes.

Audit whether history supports LOAD STEP rather than +1 rep, and identify exactly why.

Do not assume 10 is a formal top-of-range.

C. Spider Curls

Known:
- 50 lb;
- 4 x 11;
- three qualifying sessions;
- 13 exposure days.

Eligibility fails the 14-day gate.

Expected:
step selector is never invoked.
Maintain remains unchanged.

This proves V1 stays downstream of eligibility.

SMALL SELECTOR DESIGN

Design the minimum decision model.

Prefer evidence comparisons such as:

REP STEP support:
- user has already demonstrated stable performance at current load;
- recent history shows reps increasing at same load;
- prior load transition caused a meaningful rep drop and the user is still rebuilding;
- +1 rep is materially smaller than the next evidence-supported load step;
- no safe load increment exists.

LOAD STEP support:
- compatible historical load increments exist;
- repeated same-load performance is stable;
- history indicates load increases are the established progression mode at similar rep levels/context;
- proposed load step is small relative to current/effective resistance;
- rep rebuilding after prior similar increments was successful.

CONSIDER support:
- sparse/ambiguous history;
- competing evidence;
- no safe load increment and insufficient rep-trend evidence;
- bodyweight/effective-load semantics uncertain;
- context changed materially.

These are examples to audit, not a preapproved scoring formula.

Do not create dozens of thresholds.

CONFIDENCE

Propose a very small confidence/evidence model.

For example:
- supported;
- insufficient.

Or low/medium/high only if materially useful.

Do not create opaque ML.

Every deterministic recommendation should be explainable from a few concrete evidence facts.

RELATIVE STEP SIZE

Audit whether useful general derived features include:

Rep step magnitude:
+1 / current reps.

External load step magnitude:
load increment / current external load.

Effective resistance step magnitude:
load increment / (bodyweight + external load), ONLY for canonical weighted-bodyweight movements.

Use these as evidence, not universal hard thresholds unless a threshold is strongly justified.

Avoid division/percentage heuristics that become nonsensical at very small external loads.

LEARNING OVER TIME

Define what new evidence should make the selector smarter after each finalized session.

Examples:
- successful +1 rep at same load;
- successful/failed load increase;
- rep drop after load increase;
- sessions required to rebuild;
- repeated historical increment size.

Prefer deriving this from canonical Training evidence rather than creating a separate learned-state database in V1.

If a small derived summary/cache is eventually useful, identify it but do not implement.

FAIL CLOSED

V1 must be allowed to say:
Progression opportunity — consider progression.

Never force a target merely because eligibility passed.

No invented rep target if evidence does not support +1.
No invented load increment.

CONTRACT

Recommend the smallest Server contract change needed to distinguish:
- reps;
- load;
- none.

Assess whether the additive progressionStep contract from a7d3ef8a can be simplified/reused without requiring explicit prescription fields.

Native remains presentation-only.

PRODUCTION READ

Do not perform a new production read unless essential evidence for the three examples is missing from the sanitized production reports/source.

If needed, Founder authorizes one narrowly bounded read-only query using proven d789ce27 tooling, limited to the three exercise histories and relevant bodyweight observations required to evaluate V1 features.

No production writes.

TEST PLAN

Design deterministic tests for:
- Pull-Up pattern -> +1 rep if evidence supports;
- Cable pattern -> load step if evidence supports;
- Spider -> selector not invoked;
- sparse history -> consider;
- no load increment but clear rep rebuilding -> rep;
- safe small load increment and stable history -> load;
- weighted bodyweight semantics;
- ordinary external-load movement;
- ambiguous bodyweight semantics -> consider;
- context partition;
- regression precedence;
- same-day handling;
- repeated future sessions changing recommendation.

OUTPUT

Publish a main-visible report-only handoff.

Report:
- usable evidence signals already available;
- signals missing;
- exact minimal V1 decision model;
- whether bodyweight can safely participate;
- Pull-Up result and rationale;
- Cable result and rationale;
- Spider result;
- confidence/fail-closed semantics;
- smallest contract change;
- what V1 intentionally does NOT solve;
- test plan;
- implementation estimate/scope;
- recommendation IMPLEMENT V1 or HOLD.

No implementation.
No deploy.
No production mutation.

Status:
Adaptive progression step V1 audit complete — Founder review ready.

STOP.

END TASK.