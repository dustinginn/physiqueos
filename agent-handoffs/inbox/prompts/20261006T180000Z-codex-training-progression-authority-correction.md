PhysiqueOS — Training progression authority correction

TASK TYPE

NEW Codex implementation lane. NEXT-BUILD Server progression work.

STRICTLY ISOLATED from the active Build 89 Native integration lane. Do not touch, merge, rebase, cherry-pick, or modify Build 89 integration. Do not deploy Server or mutate production.

BACKGROUND

Read the completed progression audit in main report commit e6c10085e12da4223e6430bc1f47a9e0b6c4aa84.

The audit proved split authority and a moving time anchor: the Training Strategy advertises two successful sessions, while TrainingLoggerProgressionService independently uses three identical best sets plus cadence measured from the latest performance, allowing successful weekly repeats to postpone progression forever.

FOUNDER POLICY — LOCKED

Progression eligibility at the current prescription/load/context requires BOTH:

1. at least TWO qualifying successful sessions at the current prescription/load/context;

AND

2. at least FOURTEEN DAYS elapsed since the FIRST qualifying successful session at that current prescription/load/context.

The 14-day period is a MINIMUM EXPOSURE WINDOW.

A successful repeated session does NOT reset/restart that 14-day exposure clock.

Examples:

Twice weekly:
Day 0 first success; Day 3/4 second; more successes may follow. No load progression before Day 14. At/after Day 14 progression may become eligible.

Weekly:
Day 0 first; Day 7 second; still wait to Day 14. Day 7 does NOT move eligibility to Day 21.

Every other week:
Day 0 first; Day 14 second; both gates are satisfied, so progression may become eligible immediately for the next recommendation.

Every 21 days:
Day 0 first; Day 21 second; progression may become eligible after second success. No extra 14-day cooldown starts at Day 21.

A NEW prescription/load/context begins a new exposure window.

This is minimum successful-session evidence + minimum exposure duration, NOT a cooldown from the latest workout.

SINGLE AUTHORITY

Do not merely change a cadence constant.

The active Operating Plan Training Strategy should become the executable progression-policy authority wherever safely possible.

At minimum:
- consume trainingStrategy.progression.defaultRule.successfulSessionsRequired rather than duplicating a hard-coded threshold;
- explicitly map rule type/condition/action into Logger execution;
- if a configured strategy cannot safely execute, fail conservatively/report rather than silently substituting an unrelated hidden algorithm.

Represent the Founder-locked 14-day minimum exposure as an explicit policy field such as minimumExposureDays if consistent with architecture.

Server remains the decision authority. Do not create a Native progression heuristic.

PLAN BEFORE CODE

Inspect TrainingProtocolBuilderService, TrainingLoggerProgressionService, Operating Plan/Training Strategy contracts, Goal/phase transitions, Native training-logger projection, exercise identity, relationship/variant context, progression calibration, tests/fixtures.

Publish a short implementation plan in the lane before code.

QUALIFYING SUCCESS

Founder intent is successful sessions at the current prescription/load, not merely one best set.

Define qualifying success deliberately using configured strategy semantics and canonical performed-set data.

Preferred existing double-progression interpretation:
- finalized canonical exercise occurrence;
- relevant working sets at current prescription/load/context meet the prescribed top-of-range success condition;
- session counts once;
- configured successful-session count is required.

Do not silently retain single-best-set-only qualification if strategy says successful sessions.

If current canonical contracts lack enough information to determine prescribed rep-range success safely, STOP that portion and document the missing authority rather than inventing a target.

A bounded transitional implementation may preserve an existing comparable-performance definition only if explicitly labeled/proven safe, but it must still fix the moving-anchor inversion and consume configured successfulSessionsRequired.

CONTEXT PARTITIONING

Preserve canonical exercise identity, execution variant, relationship comparison context, standalone vs exact superset context, and no cross-context progression leakage.

Exposure belongs to the exact comparable context.

CURRENT LOAD / PRESCRIPTION WINDOW

Identify the current stable prescription/load run explicitly.

Exposure start = FIRST qualifying success in current run.
Later successful repeats add evidence but do not move exposureStartDate.
Meaningful prescription/load progression starts a new run.
Regression/recovery must prevent inappropriate progression merely because 14 days elapsed.

REP PROGRESSION

Audit configured rep-range strategy.

Do not automatically treat every rep increase as a new load exposure window.

Define when rep increase is progression within same load, when top-of-range is reached, when load advancement becomes eligible, and what new-load target reps should be.

Do not invent exercise-specific rep ranges if not present.

TARGET LOAD / INCREMENT

Keep eligibility policy separate from target-selection policy.

Preserve existing safe target derivation where it does not conflict with locked eligibility. Do not expand into a giant equipment system.

If explicit equipment increment/rounding authority remains missing, report/backlog it.

FOUNDER REGRESSION FIXTURES

Use canonical id cable_machine_front_raise.

Case A weekly:
Day 0 qualifying success; Day 7 qualifying success; Day 14 Logger recommendation -> progression eligible if configured success conditions met. Day 7 must not reset exposure.

Case B twice weekly:
Day 0, Day 3/4, Day 7, Day 10/11 successes. Before Day 14 not eligible solely from time. At/after Day 14 eligible if success criteria remain satisfied.

Case C every other week:
Day 0 success; Day 14 second success -> progression eligible immediately for next recommendation; no new cooldown.

Case D inversion:
Successful weekly repeat cannot delay an opportunity that would appear by skipping it.

Case E new load:
After progression to new load, exposure resets to first qualifying success at new load.

Case F insufficient success:
Day 0 success, Day 14 elapsed, only one success -> no opportunity.

Case G regression:
Two successes + 14 days but latest performance regressed -> no inappropriate progression; preserve recovery semantics.

STRATEGY COUNT

Do not hard-code 2 deep in service.

Test successfulSessionsRequired = 2 and another value such as 3 to prove policy consumption. Founder Production remains 2 unless separately changed.

14-DAY POLICY

Do not derive minimumExposureDays from movement cadence/user cadence.

Old adaptive cadence may remain useful as context, but must not override the locked exposure rule or recreate the moving-anchor defect. Document any retained role.

SERVER / NATIVE CONTRACT

Keep computation Server-owned.

Native continues consuming status/action/target/reason/evidence/history/calibration/policy metadata.

Optional backward-compatible transparency fields may include successfulSessionsRequired, qualifyingSuccessfulSessions, exposureStartDate, minimumExposureDays, exposureDays, and gate/reason metadata.

Do not require Build 89 Native changes unless compatibility is impossible.

CACHE

Preserve training-logger cache invalidation after writes. Add regression proving durable Finish yields a refreshed recommendation reflecting the new qualifying session.

READ-ONLY PRODUCTION

No production mutation.

If Founder production history is needed, use only the approved PC read-only path. If unavailable in this Codex environment, do not invent access; use deterministic fixtures and publish a bounded PC verification plan.

TESTS

Add deterministic Server/domain coverage for:
2 successes + 14-day first-success exposure;
twice-weekly;
weekly;
every-other-week;
greater-than-14-day spacing;
one success only;
repeat success does not reset exposure;
new load resets;
regression/recovery;
rep/top-of-range if supported;
configured successfulSessionsRequired consumed;
identity/alias;
variant;
standalone/superset;
partial/incomplete qualification explicitly;
same-day multiple sessions;
Goal/phase changes;
adaptive cadence cannot recreate inversion;
target derivation;
cache invalidation;
Server-to-Native compatibility.

Run existing progression suites and broader Training Logger Server tests. Run Native contract/decode tests only if additive fields change.

BUILD 89 ISOLATION

This is next-build Server work. Do not change Build 89 integration.

If the defect is found to corrupt canonical data or Build 89 worsens it, STOP and report before continuing. Otherwise proceed isolated.

NO DEPLOY

At completion do not deploy Server, mutate production, integrate into Build 89, bump Native, or upload TestFlight.

OUTPUT

Push isolated candidate branch and publish main-visible report-only handoff.

Report exact candidate SHA; policy model; Operating Plan authority; qualifying-success definition; 14-day exposure implementation; first-success anchor; new-load reset; rep interaction; target derivation; contract changes; migration/backfill assessment; tests; production-read limitation; post-Build-89 deployment sequence; rollback; Native follow-up needs.

If green status:
Training progression authority correction ready for post-Build-89 Server review.

Notify:
PhysiqueOS Training progression correction — post-Build-89 candidate ready for review.

STOP.

END TASK.