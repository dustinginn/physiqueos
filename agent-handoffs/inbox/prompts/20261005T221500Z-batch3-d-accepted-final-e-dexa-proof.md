PhysiqueOS Redesign Batch 3 — Checkpoint D conditionally accepted; implement final Checkpoint E + DEXA regression proof

Continue in the EXISTING Claude Batch 3 Evidence takeover Remote Control chat using High reasoning. Same chat.

WORKTREE RULE

Stay in the single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

FOUNDER STATUS

Checkpoint A — Evidence Hub + Timeline: ACCEPTED and locked.
Checkpoint B — Training + Activity/Cardio: ACCEPTED and locked.
Checkpoint C — Nutrition + Weight: ACCEPTED and locked.
Checkpoint D — Progress Photos + DEXA: VISUALLY ACCEPTED and locked, conditional only on explicit regression proof that the robust DEXA page retains all existing drawers/disclosures/detail routes/data.

Checkpoint D Native:
9d2d0e06c84dca7de3f0fe4dc80574c2115ceff5

Do not reopen D visuals unless the regression audit proves something was accidentally dropped.

GOAL

Complete the final Batch 3 checkpoint:

E — Add Evidence + generic Evidence Review

Also complete the DEXA disclosure/drawer regression proof requested by Founder.

CHECKPOINT E — ADD EVIDENCE

Implement every Founder-locked Add Evidence/general intake surface and state represented by the design authority.

Cover all currently supported canonical evidence intake paths, including as applicable:
- Add Evidence root/type selection;
- upload/file/media intake;
- manual/text intake;
- supported evidence categories;
- camera/photo intake where canonical;
- DEXA intake;
- Progress Photos intake;
- Nutrition/Weight/Training or other manual intake where supported;
- source/provenance selection where canonical;
- validation;
- loading/uploading;
- processing;
- accepted-to-processing;
- retry;
- failure;
- dismissal/cancel;
- navigation/back;
- accessibility;
- all existing sheets/drawers/routes associated with intake.

Do not invent unsupported intake types merely because they would fit the design.

CHECKPOINT E — GENERIC EVIDENCE REVIEW

Implement the locked generic Evidence Review family for all NON-WORKOUT-MATCH review types.

Cover materially distinct canonical states including:
- review pending;
- evidence/source preview;
- extracted/parsed fields;
- correction/edit affordances;
- confirm/accept;
- accepted-to-processing;
- processing;
- partially committed if canonical;
- commit failed;
- retry;
- dismiss;
- stale/version-guard behavior;
- loading/error;
- any supported multi-item or asset review state;
- accessibility and navigation.

CRITICAL BATCH 2 PROTECTION — WORKOUT MATCH

Workout Match / workoutReconciliation is a specialized Evidence Review branch that was implemented and Founder-approved in Batch 2.

DO NOT redesign it.
DO NOT replace it with the generic Evidence Review layout.
DO NOT remove its specialized semantics.

When Batch 3 eventually integrates with Batch 2:
- generic Evidence Review uses the new Checkpoint E presentation;
- workoutReconciliation continues to use the Founder-approved Batch 2 Workout Match L13 branch.

Add deterministic regression coverage proving the routing/presentation distinction.

CANONICAL BEHAVIOR

Preserve:
- accepted-to-processing semantics;
- review version guards;
- optimistic concurrency/stale handling;
- processing queue;
- commit/retry behavior;
- duplicate/reconciliation behavior;
- asset ownership/provenance;
- canonical Evidence authority;
- review vs strategic interpretation boundary;
- existing correction/dismiss semantics;
- source metadata;
- upload lifecycle.

Do not move coaching interpretation into Evidence Review.

PIXEL PARITY

Use the same measured protocol that succeeded for A–D.

For every materially distinct E surface:
1. exact locked reference;
2. real shipping SwiftUI simulator;
3. Dark + Mineral Light;
4. matched scale;
5. measure margins, headers, typography, cards, rows, fields, buttons, sheets, status treatments, safe areas, nav/tab relationships and visible density;
6. diff tooling;
7. correct;
8. rerender;
9. repeat.

Passing tests is not visual acceptance.
Do not use “close enough.”

DEXA REGRESSION PROOF — REQUIRED FOR FINAL D ACCEPTANCE

Founder explicitly wants assurance that the robust DEXA page has not lost data or interaction surfaces.

Audit Build 87/current canonical DEXA behavior against Checkpoint D and enumerate every:
- drawer;
- disclosure;
- expandable section;
- detail destination;
- history destination;
- correction/edit route;
- source/PDF route;
- Apple Health writeback state/action;
- chart interaction;
- scan detail;
- prior-scan/Since Prior Scan detail;
- loading/error/empty state;
- other data-bearing section/action.

For each item report:
- present in D candidate;
- route/action preserved;
- data/read-model preserved;
- test proving reachability/behavior.

If anything canonical was dropped:
- restore it using the accepted D visual grammar;
- do not redesign the accepted primary page;
- add regression tests.

Founder does NOT require screenshots of every DEXA drawer if the audit/test proof is clean.

DEXA DATA SAFETY

Do not simplify/remove metrics merely because they are not visible on the locked primary screenshot.

Preserve all canonical DEXA data currently available to the Founder, including supplemental/regional data and source/PDF metadata where the product exposes it.

PROGRESS PHOTOS

No further real-Founder-photo validation is required in this task.
Keep the synthetic/local image-path proof from D.
Final real-photo visual validation will happen on physical TestFlight.

CHART FOLLOW-UPS

DEXA chart vertical scrolling is fixed and locked.
Nutrition/Weight chart behavior is fixed and locked.

Do not broaden to Energy or Briefings; retain those for their owning redesign families.

TESTS

Run focused E tests:
- Add Evidence/intake;
- Evidence Review;
- accepted-to-processing;
- processing;
- version guards/stale;
- retry/failure;
- asset/media;
- review routing;
- generic vs Workout Match routing distinction;
- accessibility/navigation;
- appearance.

Run DEXA regression tests for every audited disclosure/route.

Run A–D regression sufficient to prove no drift.

At final Batch 3 closeout run:
- complete relevant Evidence unit suites;
- all Batch 3 UI journeys;
- Training acceptance Evidence journeys;
- Recovery acceptance where shared;
- generic iOS Release compile including Watch/Live Activity/widget graph;
- project-generator byte stability.

Do not hide pre-existing failures; classify them against accepted base.

REVIEW PACKAGE

Publish a mobile-readable Checkpoint E package with verified GH links:
- Add Evidence Dark/Mineral;
- generic Evidence Review Dark/Mineral;
- important processing/error/retry states;
- correction/edit state;
- accepted-to-processing;
- generic-vs-Workout-Match routing proof;
- parity notes.

Also publish DEXA regression inventory/proof as text/test evidence; no giant screenshot board required.

FINAL BATCH 3 CLOSEOUT

After E is complete, publish:
- exact final Batch 3 Native authority;
- A/B/C/D/E accepted/ready status;
- exact review package links;
- DEXA regression proof;
- tests;
- Release compile;
- unresolved items;
- exact integration map against:
  1. clean Batch 2 RC 793462b1;
  2. workout reliability Native e9f8a957 / integration preview 70ebf753;
  3. Founder-approved Batch 2 Workout Match branch.

Do not perform the final multi-lane merge in this task unless separately authorized.
Identify shared-file conflicts exactly and state the required resolution.

WORKOUT RELIABILITY AUTHORITY — DO NOT MODIFY

Production Server is now b7eb1e39, deployment 6fa4e887.
Workout Native candidate e9f8a957 is closed and ready for next-build integration.
Batch 2 + workout preview 70ebf753 is clean.

Do not modify that lane from this Batch 3 worktree.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

At completion notify:
PhysiqueOS Batch 3 — Evidence redesign complete and ready for final review.

STOP

Stop after Checkpoint E + DEXA proof + Batch 3 closeout.
Do not upload TestFlight.
Do not bump build number.
Do not merge into final release authority.

END TASK.