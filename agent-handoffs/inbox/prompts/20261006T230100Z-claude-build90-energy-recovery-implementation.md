PhysiqueOS Build 90 — implement Founder-approved Energy + Recovery/Sleep redesign

Continue in this existing Claude B Build 90 remaining-redesign conversation and its current Remote Control-provided worktree.

Do not create another Remote Control session or another worktree.

BASE / DESIGN AUTHORITY

Shipped Build 89:
51399425b683d6a6e36b5c91836290259e31a7e0

Approved Energy + Recovery design candidate:
7e501714

Founder has reviewed the boards and APPROVES Energy + Recovery/Sleep exactly as designed, including all six deliberate deltas:

1. Keep “Avg Est. Expenditure” / “Est. expenditure” and the concise estimate footnote.
2. Keep canonical kcal formatting.
3. Keep Sleep Window date labels + typical-window band.
4. Keep explicit Try again actions on failure states.
5. Keep 44 pt Details / Hide Source & Data disclosure.
6. Keep the readable floating baseline for nightly Total Sleep while bar summaries remain zero-based.

These decisions are final for this implementation lane.

GOAL

Convert the approved Energy + Recovery/Sleep candidate into clean production Build 90 implementation, remove DEBUG review-only seams/artifacts from shipping behavior, add/complete regression coverage, run Release compile now that storage has been recovered, and publish a clean implementation candidate for later Build 90 integration.

Do not bump Build 90.
Do not upload TestFlight.
Do not deploy Server.
Do not mutate production.

ENERGY

Implement exactly the approved boards and preserve:
- canonical Energy read model;
- scope/range behavior;
- Weekly and Daily History;
- completeness states;
- selected week;
- Nutrition/Activity links;
- pull/foreground refresh;
- accepted tap + horizontal scrub + vertical scroll arbitration;
- Energy back trail and sheet Done behavior;
- estimated-expenditure wording;
- kcal;
- no invented as-of/stale field.

RECOVERY / SLEEP

Implement exactly the approved boards and preserve:
- canonical recovery/sleep APIs;
- Goal scopes;
- 2W–All ranges;
- strategicUse quarantine;
- 14-night strategic eligibility;
- paging/weekly threshold;
- root night selection;
- Trends;
- Continuity;
- Timeline inspect;
- Stage Mix;
- Source & Data;
- All Nights;
- Night Detail;
- additional sleep;
- approximate times;
- staged/unstaged/recalculating states;
- loading/failure/empty/not-available/night-not-found states;
- parent-aware back labels;
- accepted chart arbitration.

Do not turn this into new Sleep semantics.

DEBUG / REVIEW SEAMS

Remove or fully isolate any design-capture seams so Release contains none.

Safe Sandbox fixture support may remain only where already legitimate product/test architecture requires it.

No review-only production routes.

DEXA APPOINTMENT DEAD END

The audit found a newly reachable Build 89 issue:
Priority Detail can route to /profile/operating-plan/execution/dexa, whose current production page is a legacy dead end telling the user to manage it in Coaching Updates without navigation.

Before touching it:
audit whether there is a tiny, behavior-preserving navigation correction that can make the existing action actually open the canonical Coaching Updates destination WITHOUT redesigning Operating Plan.

If YES and the change is isolated/safe:
implement the minimal navigation fix with focused test.

If it requires redesigning Operating Plan, changing Server semantics, or opening broader OP routing:
DO NOT implement it here.
Backlog it as OP-A's first fix.

Do not visually redesign the DEXA appointment page in this lane.

TESTS

Run focused:
- Energy read/model/presentation;
- Energy UI journeys;
- chart tap/horizontal scrub/vertical scroll;
- Energy sheet navigation;
- Recovery/Sleep read/model/presentation;
- RecoverySleepAcceptanceUITests;
- Night Detail parent back labels;
- All Nights paging;
- Stage Mix/Source disclosure;
- Recovery chart arbitration;
- any focused DEXA route test if the tiny fix is made.

Then:
- full PhysiqueOSTests;
- relevant Evidence UI suites;
- generic Release compile including app/Watch/Widget as current project requires;
- Release seam scan;
- generator determinism if project generation touched;
- git diff --check.

Storage is approximately 28 GiB free after safe cleanup. Avoid unnecessary duplicate build products and remove this lane's regenerable DerivedData after final validation if needed.

CONCURRENCY

Do not touch the other Build 90 Claude lane owning:
- iPhone Logger stopwatch;
- Watch handoff;
- Photo Briefing expanded viewer;
- Watch button placement.

Do not touch Codex progression or production-access work.

OUTPUT

Push a clean Build 90 Energy/Recovery implementation candidate.

Publish main-visible report-only handoff with:
- exact candidate SHA;
- Founder approvals;
- files changed;
- DEXA dead-end disposition;
- focused/full test results;
- Release compile;
- seam scan;
- storage after;
- integration notes/conflicts;
- confirmation no Server/build bump/TestFlight/production mutation.

Status:
Build 90 Energy + Recovery implementation ready for integration.

Notify:
PhysiqueOS Build 90 Energy + Recovery — implementation candidate ready.

STOP.

END TASK.