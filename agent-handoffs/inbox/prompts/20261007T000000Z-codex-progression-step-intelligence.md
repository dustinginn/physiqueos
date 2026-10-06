PhysiqueOS Training progression — progression-step intelligence refinement

Continue in this current Codex conversation and current provided work environment.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or additional worktrees.

BASE CANDIDATE

Extend the already validated progression candidate:
999a225a38ced9ddb16a65bbe840896472265468

Do not discard or rewrite its validated eligibility architecture.

Production shadow authority:
1e42df817065bdb3e7afc85c8dce06ac6cb47b6e

Current production Server remains:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

FOUNDER DECISION

HOLD 999a225a from deployment pending this refinement.

The eligibility model is approved:

- configured successful-session count;
- Founder floor of 14 days from FIRST qualifying success at current load/prescription/context;
- repeated successes do not reset exposure;
- exact exercise/variant/relationship partitioning;
- regression/recovery precedence;
- new LOAD/material context starts a new load-exposure window.

The missing intelligence is the progression STEP once eligibility exists.

GOAL

Separate:

1. ELIGIBILITY:
Is this movement ready for progression?

from

2. STEP SELECTION:
Should the next progression be:
- rep progression at the same load;
- load progression with reps reset/reduced appropriately;
- progression opportunity with no deterministic target;
- maintain/recovery.

Implement true double-progression semantics using Operating Plan / Training Strategy as authority.

Do not implement a simplistic low-rep threshold such as <=8 means +1 rep.

PRESCRIPTION AUTHORITY FIRST

Audit where exercise/session prescription authority currently lives.

Determine whether the Server has, per exercise or training strategy:
- rep range minimum;
- rep range maximum;
- target reps;
- working-set count;
- load;
- progression rule;
- exercise-specific override;
- template/session prescription;
- Logger planned prescription;
- any canonical plan/snapshot field suitable as executable authority.

Trace from:
Operating Plan Training Strategy
-> workout/session prescription
-> Logger draft/read
-> finalized canonical Training evidence
-> progression recommendation.

The production shadow established that the active Training Strategy currently stores:
rule type double_progression_confirmed_sessions;
condition reach_top_of_rep_range;
action increase_load;
successfulSessionsRequired 2;
but no exercise-level rep-range maximum was available in the progression strategy shadow.

Do not infer that the strategy lacks all prescription authority until you audit the downstream workout/session prescription.

If explicit per-exercise rep-range authority already exists elsewhere in the canonical plan:
use it.

If it does not:
design the narrowest safe extension to Training Strategy/protocol/session prescription so rep-range authority is explicit and executable.

Do not hard-code exercise-specific rep ranges in Logger service.

TRUE DOUBLE PROGRESSION

Desired general model:

Within prescribed rep range:
- progression step is REP progression at the SAME load.

At prescribed top of rep range:
- once eligibility gates are satisfied, progression step is LOAD progression.

After load progression:
- target reps reset/reduce according to explicit prescription authority, ideally the lower bound or another configured reset target.

Rep progression at the same load does NOT reset the 14-day load-exposure clock.

A load change DOES begin a new load-exposure window.

A material variant/relationship/prescription context change should continue to partition/reset as appropriate.

LOW-REP INTELLIGENCE

The engine must respect the relative significance of reps in low-rep work without inventing arbitrary exercise categories.

Examples:
- weighted pull-up at 4 x 7: +1 rep per set can be substantial progression;
- heavy squat/deadlift at 3–6: 5 -> 6 may be the correct progression step;
- isolation movement at 10–15: rep progression can continue within that larger range before load increases.

Prefer explicit rep-range/prescription authority over heuristic percentages.

If a prescription supports a discrete next rep:
recommend the smallest valid next prescribed rep step, commonly +1 rep per working set.

Do not require multiple-rep jumps merely because a movement is not at top-of-range.

PRODUCTION CASES AS REQUIRED REGRESSIONS

Use the sanitized production findings from 1e42df81 as deterministic fixtures.

CASE 1 — Cable Machine Front Raises

Context:
cable_machine_front_raise
ordinary
standalone
150 lb
current qualifying profile 4 x 10
5 qualifying sessions
first qualifying success 2026-09-08
28 exposure days
2 required
14-day floor
historical compatible increments +10 lb
current candidate target 160 x 8.

Audit the actual prescription authority for Cable.

Expected behavior:
If 10 is confirmed top-of-range and reset target 8 is authoritative, LOAD progression to 160 x 8 remains correct.

Do not preserve 160 x 8 merely because the old candidate happened to derive it heuristically. Prove it against prescription authority.

CASE 2 — Spider Curls

50 lb
4 x 11
3 qualifying sessions
13 exposure days.

Expected:
Maintain due to exposure gate regardless of step selector.

This remains the exact 13/14-day boundary fixture.

CASE 3 — Weighted Pull-Ups

pull_up
ordinary
standalone
body weight + 25 lb external load
current qualifying profile 4 x 7
2 qualifying sessions
16 exposure days
eligibility gates pass
no safe historical compatible load increment.

Founder intent:
If 7 is below the authoritative top of the prescribed rep range, recommend SAME LOAD + next prescribed rep step, e.g. 4 x 8 at body weight +25 lb when +1 rep is the explicit valid step.

Do NOT return load progression merely because eligibility gates pass.

Do NOT invent 8 unless the prescription authority establishes that next step.

If 7 is already top-of-range, then load progression may be appropriate, but target load must remain unavailable unless safely supported.

If production currently lacks sufficient rep-range authority to choose:
the implementation must fail closed and the report must identify exactly what canonical field/model addition is required before a deterministic rep target can ship.

STEP MODEL / CONTRACT

Prefer an explicit Server-owned step model such as:
progressionStep.kind:
- reps
- load
- none

with additive metadata where useful:
- currentRepTarget;
- nextRepTarget;
- repRangeMin;
- repRangeMax;
- currentLoad;
- nextLoad;
- resetRepTarget;
- rationale/reason code;
- authority/provenance.

Do not require these exact names if existing contracts have a better fit.

Native remains presentation-only.

Backward compatibility required.

CURRENT STATE/ACTION SEMANTICS

Audit whether existing:
progression_opportunity;
use_suggestion;
consider_progression;
maintain;
recover_prior_performance

can express rep vs load progression cleanly.

Avoid multiplying states unnecessarily.

Prefer progression_opportunity plus explicit step metadata if compatible.

QUALIFYING SUCCESS

Reconcile success qualification with rep progression.

Important:
The current exact-profile transitional rule cannot require identical reps forever if rep progression itself is expected.

Define how success evidence works as reps advance within the same load.

Potential model:
- current prescription step has its own success evidence;
- reaching/confirming that step allows the next rep step;
- load-exposure anchor persists across rep steps at same load;
- successful-session count for LOAD progression should correspond to the top-of-range condition, not merely earlier lower-rep successes.

Audit carefully.

Do not accidentally let two successful 6-rep sessions + 14 days authorize a load increase when the prescribed range tops at 8.

Likewise, do not make each +1 rep reset the 14-day load exposure.

OPERATING PLAN AUTHORITY

The active strategy says reach_top_of_rep_range -> increase_load.

Make that statement executable end-to-end.

If protocol schema must gain explicit fields such as:
repRangeMin;
repRangeMax;
repIncrement;
loadResetRepTarget;
minimumExposureDays;

design them as general Training Strategy/prescription fields, not Founder-only hacks.

Preserve existing strategy history/versioning.

Do not mutate production strategy/data in this task.

PRODUCTION READ

Use proven d789ce27 tooling only if a narrowly bounded read is necessary to identify existing prescription authority for the three cases.

Founder authorizes read-only inspection limited to the canonical Training Strategy/session prescription fields necessary to resolve rep-range authority for Cable, Spider Curl and Pull-Up.

No broad history read is needed; 1e42df81 already established history.

No production writes.

If the existing source/schema audit answers the authority question without production data, prefer that.

TESTS

Extend deterministic tests for:

Eligibility:
- all existing 999a225a cases remain green;
- 2-session + 14-day exposure;
- repeats do not reset;
- new load resets;
- regression/recovery;
- variant/relationship partitioning.

Step selection:
- below rep-range max -> rep progression at same load;
- +1 rep in low-rep range;
- mid/high-range rep progression;
- top-of-range -> load progression;
- load progression resets reps according to authority;
- rep progression does not reset load exposure;
- top-of-range successful-session evidence required for load progression;
- insufficient top-range confirmations -> no premature load increase;
- safe load increment available;
- load increment unavailable -> consider_progression/no invented target;
- missing rep-range authority -> fail closed;
- configured rep increments other than 1 if schema supports them;
- weighted bodyweight movement semantics;
- same-day behavior;
- cache invalidation;
- Native projection compatibility.

Re-run:
- focused progression suites;
- Phase 6 Training;
- broader Logger/Operating Plan tests;
- lint changed files;
- git diff --check.

NO DEPLOY

Do not deploy 999a225a or the refined candidate.
Do not mutate production.
Do not touch Native Build 89/90.

OUTPUT

Push an isolated refined Server candidate extending 999a225a.

Publish main-visible report-only handoff with:
- prescription-authority findings;
- exact refined policy;
- rep vs load step model;
- how load exposure persists across rep steps;
- how top-of-range confirmations work;
- Cable fixture result;
- Spider fixture result;
- Pull-Up fixture result;
- schema/contract changes;
- whether production strategy data needs a later version/update;
- tests;
- migration/backfill assessment;
- recommended deployment sequence;
- rollback;
- explicit DEPLOY / HOLD recommendation.

Status if complete:
Training progression step intelligence refined — candidate ready for Founder review.

Do not deploy.
STOP.

END TASK.