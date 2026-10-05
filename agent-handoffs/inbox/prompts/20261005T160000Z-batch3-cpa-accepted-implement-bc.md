PhysiqueOS Redesign Batch 3 — Checkpoint A accepted; implement Checkpoints B + C together

Continue in the EXISTING Claude Batch 3 Evidence takeover Remote Control chat using High reasoning. Same chat.

WORKTREE RULE

Stay in the single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

FOUNDER ACCEPTANCE

Checkpoint A — Evidence Hub + Timeline — is ACCEPTED and locked.

Accepted Checkpoint A Native authority:
ce5c7dd899f64386a70a6d21c25cf85bd93d6f3a

Review package authority:
7cad090b6aab99a5e4b3603a7a8fa49d5bde53d4

Do not reopen or reinterpret Hub/Timeline.

FOUNDER EXECUTION DECISION

Claude has demonstrated sufficiently consistent visual accuracy that Founder authorizes Checkpoints B and C to be implemented in one working pass.

Implement BOTH:
B — Training + Activity/Cardio Evidence
C — Nutrition + Weight Evidence

Do not begin D or E.

Although B and C may be implemented without an approval stop between them, keep their review artifacts distinct so Founder can review each family clearly.

VISUAL AUTHORITY

Use the exact Founder-locked Evidence designs, not Codex Batch 3 and not Build 87 production UI.

The rejected Codex Batch 3 may be inspected only for behavioral/source/test research.

For every B/C surface, explicitly compare:
- locked reference;
- current Build 87;
- Claude candidate.

If the candidate still looks materially like Build 87 where the locked design differs, it is not done.

CHECKPOINT B — TRAINING + ACTIVITY/CARDIO

Implement all locked Training Evidence and Activity/Cardio Evidence surfaces/states represented by design authority, including as applicable:

Training:
- Training root/history;
- day view;
- structured session;
- exercise detail;
- training-area/library/reporting destinations represented in locked designs;
- strength set presentation;
- standard weighted;
- reps-only;
- bodyweight;
- weighted bodyweight;
- timed sets;
- variants;
- supersets;
- notes;
- provenance/source treatment;
- Apple Health cardio where it appears in Training Evidence;
- loading/error/empty states;
- reporting disclosures and navigation.

Activity/Cardio:
- Activity root/history;
- day/detail;
- active calories/goal presentation;
- workout/cardio rows;
- linked Training context;
- Apple Health provenance;
- recent/full-history treatment;
- loading/error/empty states;
- all locked navigation/detail states.

Preserve the HealthKit architecture boundary:
observation -> canonical PhysiqueOS Activity/Workout -> evidence presentation.
Do not move strategic interpretation into Evidence.

CHECKPOINT C — NUTRITION + WEIGHT

Implement all locked Nutrition and Weight Evidence surfaces/states represented by design authority.

Nutrition:
- history/root;
- latest/historical day;
- meal/source detail;
- calories/macros presentation;
- reporting;
- metric switching;
- phase/strategy filtering;
- full history;
- provenance;
- loading/error/empty.

Weight:
- current summary;
- trend/chart;
- unit-bearing chart semantics;
- Goal-range/scope filtering;
- weekly averages;
- history;
- Show All/Close disclosure;
- canonical current/delta/lowest/averages where the current contract supplies them;
- DEXA markers where current canonical behavior supplies them;
- loading/error/empty.

Preserve the accepted Build Lean Mass weight semantics and canonical Goal filtering. Do not reintroduce the prior weekly-average bug.

PIXEL-PARITY PROTOCOL — SAME BAR AS ACCEPTED A

For every materially distinct B and C surface:

1. Open the exact locked reference.
2. Render the real shipping SwiftUI candidate on the real iPhone simulator.
3. Capture Dark and Mineral Light.
4. Put exact reference beside simulator at matched scale.
5. Measure hierarchy and geometry, including margins, headers, typography, baselines, row/card heights, dividers, chart geometry, labels, icons, controls, section pitch, safe areas, tab/nav relationships and visible density.
6. Use diff tooling where practical.
7. Correct discrepancies.
8. Re-render.
9. Repeat until remaining differences are only unavoidable iOS chrome/rasterization or truthful dynamic content.

Do not accept a production-like surface simply because its colors match.
Do not call passing tests visual parity.
Do not use “close enough.”

REVIEW PACKAGES

Publish TWO distinct mobile-readable packages:

1. Checkpoint B — Training + Activity/Cardio.
2. Checkpoint C — Nutrition + Weight.

Each must include:
- primary mobile review board;
- Dark reference-vs-simulator comparisons;
- Mineral Light reference-vs-simulator comparisons;
- important subpage/state comparisons;
- measurement/parity notes;
- exact implementation SHA;
- focused tests.

Boards must be readable on iPhone.

LINK VALIDATION

Before reporting:
- push artifact commits;
- verify every reported GH blob URL resolves against the exact pushed commit;
- do not provide guessed links.

BEHAVIOR SAFETY

Preserve canonical:
- routes;
- read models;
- provenance;
- units;
- chronology;
- filters;
- reporting calculations;
- HealthKit cardio canonicalization;
- Training Evidence vs Training Logger separation;
- loading/error/empty behavior;
- full-row tap targets;
- stable accessibility/test identities.

Do not touch:
- Batch 2 Log;
- Training Logger;
- Workout Match;
- Watch;
- HealthKit workout lifecycle;
- accepted Checkpoint A;
- Home/Goals/You;
- Server unless a locked visual requirement truly lacks a field.

If a Server field is genuinely missing, stop and report rather than inventing data.

TESTS

Run focused tests after B and after C.

Cover at minimum:
- Training Evidence/read-model/session/reporting;
- Activity/Cardio presentation;
- Nutrition Evidence/reporting calculations;
- Weight read-model/history/chart/filtering;
- HealthKit presentation boundaries;
- SharedUI/appearance;
- navigation/AppTab;
- existing Evidence acceptance journeys.

Add visual/UI coverage necessary to pin the locked hierarchy.

Run Release compile after B+C are complete.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

At successful completion notify:
PhysiqueOS Batch 3 — Training, Activity, Nutrition + Weight ready for review.

STOP CONDITION

After BOTH B and C are implemented, pixel-audited, tested, pushed and their verified review packages are published:
- publish concise B+C report;
- send notification;
- STOP for Founder review.

Do NOT begin Checkpoint D.
Do NOT begin Checkpoint E.
Do NOT upload TestFlight.
Do NOT bump build number.

END TASK.