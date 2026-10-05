PhysiqueOS Redesign Implementation Batch 3 — Evidence family

TASK TYPE

Continue in Codex A / existing PhysiqueOS redesign implementation chat.
Use High reasoning.
Same Codex chat.

Batch 2 is concurrently being finalized by Claude. Do not modify Batch 2 Log/Training Logger work.

GOAL

Begin Redesign Implementation Batch 3 for the locked Evidence family.

Implement the Founder-locked Evidence design with rigorous real-simulator pixel parity, while preserving canonical Evidence behavior and the already-implemented Workout Match L13 branch.

CURRENT AUTHORITIES

Apple-VALID Build 87:
f66c7fc690b1b61094e620791ee2d4a40caf3799

Accepted Batch 1:
c4a74ad0855a0500e42a90a81d6f4a871e5cc3c5

Accepted Home correction to be carried forward:
49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7

Batch 2 is NOT yet final release authority. Claude currently owns finalization of its integrated candidate. Do not consume or edit Claude's Batch 2 branch unless explicitly instructed later.

SOURCE/DESIGN AUTHORITY

Use the Founder-locked Evidence design artifacts from the completed design program as canonical visual authority.

Re-audit the exact accepted Evidence artifacts and implementation notes before coding.

Do not reinterpret locked designs.
Do not use old production UI as visual authority.
Canonical product behavior/data contracts still win where the design intentionally abstracts dynamic content; surface genuine conflicts rather than silently changing behavior.

BATCH 3 SCOPE

Evidence family includes, where represented in the locked design:

1. Evidence Hub/root.
2. Evidence stream/category pages.
3. Evidence Timeline.
4. Training Evidence vertical:
   - history;
   - day;
   - session;
   - canonical strength/cardio presentation.
5. Nutrition Evidence.
6. Weight Evidence.
7. Activity/Cardio Evidence.
8. Progress Photos Evidence.
9. DEXA Evidence.
10. Other existing Evidence streams represented by the current 9-stream contract.
11. Add Evidence / general intake entry.
12. Evidence Review generic surfaces.
13. Processing/accepted/error/retry states.
14. Relevant detail pages and filters represented in locked designs.

EXPLICIT EXCLUSION

Workout Match / workoutReconciliation branch of Evidence Review was implemented and Founder-approved in Batch 2 Checkpoint 5.

Do NOT redesign or overwrite that branch.

Generic Evidence Review may be redesigned in Batch 3, but preserve the Batch 2 Workout Match presentation/behavior as an isolated special branch for later integration.

Also do not modify:
- Log redesign;
- Training Logger redesign;
- Watch workout behavior;
- HealthKit lifecycle;
- Home/Goals/You accepted designs;
- Operating Plan;
- Briefings.

IMPLEMENTATION STRATEGY

First perform a short source-to-design mapping inside this task:
- enumerate every materially distinct Evidence surface/state;
- identify shared components;
- identify any files shared with Batch 2;
- identify canonical behavior owners;
- identify any design-vs-contract conflicts.

Then implement.

Avoid asking Founder to reconfirm already locked decisions.

PIXEL-PARITY PROTOCOL — MANDATORY

The bar is the same strict protocol established after Batch 1.

For each implementation checkpoint:
1. Implement only that bounded surface family.
2. Render the real shipping SwiftUI surface on an iPhone 17 Pro-class simulator at equivalent geometry.
3. Capture Dark and Mineral Light.
4. Put the simulator capture beside the EXACT locked reference.
5. Audit pixel-level:
   - safe areas and outer margins;
   - hierarchy;
   - section spacing;
   - card bounds;
   - corner radii;
   - strokes/dividers;
   - typography size/weight/line-height;
   - baselines;
   - wrapping/truncation;
   - icons;
   - row heights;
   - buttons/controls;
   - semantic colors/opacity;
   - charts/progress geometry where applicable;
   - image treatment;
   - navigation/tab relationships;
   - visible density and scrolling.
6. Use image/diff measurement where practical.
7. Correct discrepancies.
8. Re-render.
9. Repeat until remaining differences are unavoidable system rendering or truthful dynamic-content differences.
10. Publish mobile-readable review boards.

Passing tests is not visual acceptance.
“Close enough” is not visual acceptance.

CHECKPOINTS

Use these implementation checkpoints unless the source audit proves a materially better grouping. If grouping changes, document why without changing scope.

CHECKPOINT A — Evidence Hub + Timeline shell
- Evidence root;
- stream grid/list;
- Timeline;
- filtering/navigation;
- loading/error/empty;
- badges/status;
- processing/review affordances.

CHECKPOINT B — Training + Activity/Cardio Evidence
- Training history/day/session vertical;
- structured strength sets;
- supersets/variants/timed/BW sets;
- Apple Health cardio presentation;
- current canonical provenance;
- activity/cardio detail.

CHECKPOINT C — Nutrition + Weight Evidence
- histories;
- day/detail states;
- current summaries;
- provenance;
- canonical units;
- loading/error/empty.

CHECKPOINT D — Photos + DEXA Evidence
- Progress Photos history/detail/comparison;
- real-photo treatment contract;
- DEXA history/detail;
- accepted DEXA Since Last Scan treatment;
- no regression to the old DEXA styling;
- loading/error/empty.

CHECKPOINT E — General intake + generic Evidence Review
- Add Evidence;
- supported evidence types;
- asset/text/manual flows represented in locked design;
- generic review;
- accepted-to-processing;
- commit failed/partially committed;
- retry/dismiss/correct where canonical;
- preserve Batch 2 Workout Match branch untouched.

FOUNDER REVIEW WORKFLOW

Unlike the overnight Batch 2 run, Codex may continue through checkpoints without waiting for Founder approval if the implementation is internally clean, but MUST publish a distinct review package for each checkpoint so Founder can inspect incrementally.

If a genuine product decision/blocker appears, stop and ask rather than inventing behavior.

Do not cut TestFlight in this task.

REAL DATA / IMAGE SAFETY

Where visual acceptance depends on real Founder images, use the existing safe Founder-data mechanism/fixture already established for Progress Photos rather than blank placeholders.

Do not commit private Founder photos to GH artifacts.

If real-photo rendering cannot be safely captured into public review artifacts, use redacted/non-private review artifacts while validating the actual Founder photo path locally and report the limitation.

CANONICAL BEHAVIOR

Preserve:
- Evidence authority/provenance;
- accepted-to-processing semantics;
- processing queue behavior;
- review version guards;
- retry semantics;
- duplicate/reconciliation rules;
- HealthKit canonicalization;
- Training Evidence vertical;
- nutrition aggregation authority;
- DEXA confirmation/correction/dismiss behavior;
- Progress Photo pose/date mapping;
- briefing/evidence boundaries.

Do not move strategic interpretation into Evidence views.

APPEARANCE

Use the accepted global System / Dark / Mineral Light infrastructure.

No local competing theme.

Every Batch 3 surface must work in Dark and Mineral Light.

ACCESSIBILITY

Maintain:
- Dynamic Type feasibility;
- VoiceOver labels/traits;
- non-color-only status;
- >=44 pt targets;
- full-row hit targets where rows visually present as one control;
- stable accessibility/test identities for important navigation doorways.

Learn from the Build 87 Home briefing identity regression: do not remove stable test/accessibility identities during visual refactors.

TESTS

At each checkpoint run focused tests.

Final Batch 3 gates should include all relevant:
- Evidence Hub/read-model tests;
- Evidence Review tests;
- Training Evidence tests;
- Nutrition Evidence tests;
- Weight tests;
- Activity/Cardio/HealthKit presentation tests;
- Progress Photo tests;
- DEXA tests;
- accepted-to-processing tests;
- AppTab/navigation tests;
- SharedUI/appearance tests;
- generic intake tests;
- relevant UI journeys.

Also run regression coverage proving the Batch 2 Workout Match branch is not overwritten.

Run generic iOS Release compile including Watch/Live Activity/widget dependency graph at final checkpoint.

Do not change Server unless a locked Evidence design requires a missing read-model field and no safe Native derivation exists. If Server work is genuinely required, stage the narrow contract and stop for authorization before production deployment.

BATCH 2 INTEGRATION BOUNDARY

Claude is concurrently finalizing Batch 2.

Do not merge Batch 3 into Claude's branch now.

Publish Batch 3 as its own implementation authority.

At the end, provide a clean integration map for combining:
- final approved Batch 2 release authority;
- Batch 3 authority;
- accepted Home correction if not already present upstream.

No cherry-pick guesswork: list exact commits and shared-file conflicts.

NOTIFICATIONS / STOP CONDITIONS

If Codex can send user notifications, notify Founder when:
- a checkpoint review package is ready;
- a product decision is needed;
- a blocker occurs;
- Batch 3 completes.

Do not wait solely for visual approval between checkpoints unless Founder intervenes.

OUTPUT

For every checkpoint publish:
- exact implementation SHA;
- exact locked design references;
- Dark simulator captures;
- Mineral simulator captures;
- side-by-side/diff boards;
- parity notes;
- focused test results;
- genuine remaining differences.

At final completion publish:
- exact Batch 3 authority;
- complete surface/state inventory;
- all checkpoint review links;
- tests;
- Release compile;
- unresolved dependencies;
- Batch 2 integration map;
- recommendation for next redesign family.

No TestFlight upload.
No build-number bump.
No production mutation unless separately authorized.

END TASK.