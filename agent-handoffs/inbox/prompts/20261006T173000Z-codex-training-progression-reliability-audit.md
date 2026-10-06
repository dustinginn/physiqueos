PhysiqueOS — Training Logger suggested-progression reliability audit

TASK TYPE

NEW Codex lane/chat.

AUDIT ONLY.
READ-ONLY / DIAGNOSIS ONLY.

Do NOT implement a fix in this task.

CONCURRENCY

A separate Claude lane is currently integrating Build 89.

Do not touch, merge, cherry-pick, rebase, or modify that integration worktree/branch.

Do not modify Claude A, Claude B, or the completed Build 89 Codex small-fixes branch.

This audit should remain independently useful for the NEXT build after Build 89.

BASE / BEHAVIOR AUTHORITY

Audit the currently shipped/production behavior and the exact progression architecture that feeds the Training Logger.

Build 88 shipped source:
7fce3b9708c063f3c6b58571778c595012b5de6d

Build 89 integration is in progress but is not authority for this audit unless a read-only comparison helps identify whether an already-pinned change affects progression.

Do not patch Build 88 or Build 89.

FOUNDER-OBSERVED CASE

Exercise:
Cable Machine Front Raises

Founder-visible recent performance currently shows consecutive sessions at:

Today:
4 sets
Best 10 x 150 lb
6,000 lb volume

Sep 29:
4 sets
Best 10 x 150 lb
6,000 lb volume

Sep 22:
4 sets
Best 10 x 150 lb
6,000 lb volume

There is at least one additional prior consecutive session at the same load/performance visible in history, for approximately four consecutive sessions total at the current load.

Founder expectation:
suggested progression normally tends to advance after approximately two consecutive successful sessions at the current load/performance.

Concern:
the Logger did not appear to prompt progression for this exercise despite approximately four consecutive maintained sessions.

The screenshot is observational evidence only. Do not infer the rule from the screenshot; trace canonical code/data authority.

GOAL

Determine exactly why this exercise did or did not receive a progression suggestion.

Answer whether the issue is:

A. expected behavior under the actual progression policy;
B. progression eligibility/history recognition bug;
C. session-history ordering/window bug;
D. canonical-vs-display mismatch;
E. load/reps/volume progression math bug;
F. exercise identity/alias mismatch;
G. relationship/superset/standalone classification issue;
H. performance-record interaction;
I. suggestion generated correctly but dropped/misprojected before Logger UI;
J. stale/caching/reconciliation issue;
K. another concrete cause.

Do not stop at “the rule says X.” Trace the full pipeline.

AUDIT 1 — SOURCE OF TRUTH

Identify the exact progression authority.

Document:
- Server vs Native ownership;
- relevant service/model/function names;
- configuration/thresholds;
- whether progression is load-first, reps-first, volume-based, performance-record-based, or another model;
- required number of qualifying sessions;
- whether sessions must be consecutive;
- what breaks a streak;
- how skipped/incomplete/partial workouts are treated;
- whether “Keep previous” affects future eligibility;
- whether “Use suggestion” affects future eligibility;
- how a suggestion is classified as MAINTAIN CURRENT PERFORMANCE vs PROGRESSION OPPORTUNITY;
- exact rule for proposed reps/load;
- exercise-specific increments if any;
- rounding rules;
- minimum evidence requirements;
- confidence/fallback behavior.

Do not assume the Founder recollection of two sessions is exact. Verify it.

AUDIT 2 — EXERCISE IDENTITY

Trace Cable Machine Front Raises end-to-end.

Determine:
- canonical exercise ID;
- aliases/display names;
- whether any recent sessions used a different ID/name;
- whether exercise-library migrations affected identity;
- whether standalone/superset relationship metadata changed;
- whether all relevant historical sessions are being grouped as the same exercise.

Audit similar names if present, but do not conflate distinct exercises.

AUDIT 3 — CANONICAL HISTORY

Use the safest available read-only path.

If production read-only inspection is needed, use the established approved read-only production access pattern and bounded owner-scoped SELECTs only.

Never expose credentials.
Never mutate production.
Never run unbounded queries.

For the Founder exercise, reconstruct enough canonical recent history to answer the progression question.

At minimum capture, where available:
- session date/time;
- session/workout ID;
- exercise ID;
- exercise display name;
- relationship type;
- superset group if any;
- set count;
- reps per set;
- load per set;
- completed/incomplete status;
- finalized/confirmed status;
- volume;
- source/provenance;
- whether eligible for progression;
- suggestion generated for the subsequent session;
- reason/decision code if persisted.

Do not publish unnecessary private workout data beyond what is required to explain this case.

AUDIT 4 — PIPELINE TRACE

Trace:

canonical finalized training history
→ progression evidence selection
→ progression decision
→ proposed performance
→ Training Logger draft/suggestion contract
→ Native projection/view model
→ Suggested/Progression Opportunity presentation
→ Use suggestion / Keep previous behavior.

At every boundary answer:
- what input arrives;
- what output leaves;
- whether Cable Machine Front Raises remains eligible;
- whether the proposed progression changes;
- whether anything drops or rewrites the suggestion.

AUDIT 5 — REPRODUCTION

Create a deterministic local fixture/test harness representing:

Session 1: 4 x 10 @ 150
Session 2: 4 x 10 @ 150
Session 3: 4 x 10 @ 150
Session 4: 4 x 10 @ 150

Use the actual canonical exercise relationship semantics discovered in the audit.

Run the real progression decision path if safely possible.

Record:
- suggestion after Session 1;
- after Session 2;
- after Session 3;
- after Session 4;
- exact expected next prescription at each point;
- reason codes.

Then test relevant boundary variants:
- one incomplete set;
- changed reps;
- one skipped workout/date gap if gaps matter;
- standalone vs superset only if the production exercise has relationship history relevant to the bug;
- exercise alias/ID mismatch if discovered;
- Keep previous vs Use suggestion if those actions influence policy.

Do not modify production code to make the reproduction pass.

AUDIT 6 — CROSS-EXERCISE SANITY CHECK

Select a small bounded sample of other recent exercises where:
- progression suggestion did appear;
- maintain suggestion appeared.

Compare the decision inputs to the Founder case.

Goal:
determine whether this is exercise-specific or systemic.

Do not turn this into a full-user training-history dump.

AUDIT 7 — CURRENT UI TRUTH

Explain the exact meaning of the Logger labels:

MAINTAIN CURRENT PERFORMANCE
PROGRESSION OPPORTUNITY

Confirm whether the shown prescription is:
- generated fresh;
- previous-session projection;
- cached draft;
- Server recommendation;
- Native heuristic.

If the Founder screenshot/history can show four equal sessions while the progression engine sees fewer qualifying sessions, explain exactly why.

BUILD 89 COMPARISON

Read-only compare the pinned Build 89 candidate inputs only if useful:

Claude A:
f3579d87b2f111bd6da0e78ff928e7492efffc00

Claude B:
156808fae50fc99ddbd6e1f0e3e90abec69ed26b

Codex small fixes:
5b79118f84ac15ac190e0d73e13e71606c2f6d2f

Determine whether any Build 89 accepted change touches progression decision semantics.

Expected default:
it should not.

Do not merge them.

NO IMPLEMENTATION

Even if root cause is obvious:
DO NOT patch it.

Instead provide:
- exact root cause;
- severity;
- affected scope;
- whether historical data needs repair or only code;
- recommended narrow fix;
- recommended regression tests;
- migration/backfill implications;
- whether Server deploy is required;
- whether Native-only next-build fix is sufficient;
- whether existing Build 89 should be blocked.

BUILD 89 BLOCKING DECISION

Explicitly recommend one:

1. DO NOT BLOCK BUILD 89
Issue predates/is independent and can be fixed next build.

2. BLOCK BUILD 89
Current integration would materially worsen/corrupt progression behavior.

Use evidence, not caution by default.

REPORTING

Publish a complete audit report to the established main-visible agent reporting flow.

Suggested path:
agent-handoffs/reports/<timestamp>-training-progression-reliability-audit.md

The report must include:

Executive finding.
Founder case reconstruction.
Actual progression policy.
Canonical history table.
Pipeline trace.
Deterministic reproduction.
Cross-exercise comparison.
Root cause.
Affected scope.
Build 89 impact/blocking recommendation.
Recommended fix plan.
Regression-test plan.
Data migration/backfill assessment.
Exact relevant files/functions.
Exact commits inspected.
Queries/read-only methods used.
Known uncertainties.

If screenshots/diagrams help, keep them compact.

Do not update latest.json/latest.md.

No product source changes.
No Server changes.
No build bump.
No TestFlight.
No production mutation.

FINAL NOTIFICATION

Notify:
PhysiqueOS Training progression audit — root cause and Build 89 impact ready.

STOP.

END TASK.