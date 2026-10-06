PhysiqueOS — integrate approved Batch 3 + macro-color correction onto Batch 2/workout candidate

Continue in the EXISTING Claude Batch 3 Evidence Remote Control chat using High reasoning. Same chat.

WORKTREE RULE

Stay in the single RC-provided worktree.
No EnterWorktree.
Do not create another worktree.

FOUNDER APPROVAL

Batch 3 Checkpoints A–E are Founder-approved.

Final Batch 3 authority:
f5257ae1013dbb04e996bab27e144201b84da8b7
Last code SHA:
44609af1c3c04946231a656a340dd83a2b42910a

There is ONE small Founder-required correction before integration:
Generic Evidence Review Nutrition macro colors must use the EXISTING canonical Nutrition Evidence macro color mapping.

No additional visual review is required for this correction.

CONCURRENT RELIABILITY LANE

A separate Claude chat is auditing an intermittent Founder Production / Evidence app-open access failure.

Do not modify that lane.
Do not attempt to solve that incident here.
Do not upload TestFlight or bump a build number.

The purpose of this task is to produce the clean integrated Native authority so the reliability fix can be layered onto it afterward if needed.

INTEGRATION BASE

Use the already-proven Batch 2 + workout reliability integration preview:

70ebf7534a90ec4256bbddd140cb98920a4025a4

This contains:
- clean Batch 2 RC 793462b1;
- workout reliability Native e9f8a957;
- the accepted TrainingLogger conflict resolution;
- peptide deterministic fix;
- Home briefing identity fix;
- Watch recap/PR/confetti and superset reliability fixes.

Production Server is already:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8
deployment 6fa4e887

No Server work in this task.

MACRO COLOR CORRECTION — REQUIRED

Founder observed that generic Evidence Review currently assigns Nutrition macro colors inconsistently with the existing Nutrition Evidence page.

Do NOT eyeball colors from screenshots.
Do NOT introduce a second mapping.

Locate the existing canonical/shared Nutrition macro presentation mapping used by the accepted Nutrition Evidence surface.

Ensure generic Evidence Review uses the same semantic mapping for:
- Calories;
- Protein;
- Carbohydrates/Carbs;
- Fat.

If the current mapping is expressed as shared semantic tokens/helpers, reuse them directly.

If it is currently local to Nutrition Evidence, extract the narrowest shared semantic helper/token mapping so both surfaces consume one authority without changing the accepted Nutrition Evidence appearance.

Preserve Dark and Mineral Light behavior.

Add deterministic tests proving Nutrition Evidence and generic Evidence Review resolve each macro to the same semantic color/token.

No review-board regeneration is necessary unless the change unexpectedly alters geometry.

MERGE

Integrate Batch 3 f5257ae1/44609af1 onto 70ebf753.

Expected conflict from the final Batch 3 integration map:

ios/PhysiqueOS/Presentation/Home/HomeJourneyFieldView.swift

Resolve by taking the RELEASE / 70ebf753 side verbatim so the latest Home briefing identity fix remains.

Expected no conflicts with:
- workout reliability e9f8a957;
- Batch 2 Workout Match L13 79a1a33d.

WORKOUT MATCH — MUST PRESERVE

Generic Evidence Review must continue to route workoutReconciliation to the specialized Founder-approved Batch 2 L13 Workout Match branch.

Prove after the actual integration:
- routing test;
- L13 visual/acceptance test;
- generic Evidence Review test.

Do not allow Batch 3 generic presentation to replace Workout Match.

DEXA

Preserve the completed DEXA regression proof and exact-prefill correction.

Do not reopen DEXA design.

HOME / BATCH 2

Preserve:
- Home latest briefing identity fix;
- Batch 2 appearance work;
- Log/Training Logger;
- Sources;
- You/Settings;
- peptide deterministic test fix;
- all Batch 2 acceptance behavior.

WORKOUT RELIABILITY

Preserve:
- Watch-finish recap / PR / confetti parity;
- superset contextual history;
- 2-B row refill semantics;
- 2-C contextual recommendation decoding;
- completed-set immutability;
- Watch context acknowledgement;
- latency instrumentation.

Do not modify Server contract.

FINAL INTEGRATED GATES

After integration and macro-color correction, run:

1. project generation and byte-stability check;
2. full PhysiqueOSTests;
3. full PhysiqueOSWatchTests;
4. all Batch 3 Evidence UI suites;
5. Batch 2 appearance/acceptance suites relevant to changed/shared files;
6. Workout Match L13 acceptance;
7. workout reliability targeted suites;
8. Home briefing identity regression;
9. peptide deterministic regression;
10. generic iOS Release compile including Watch + WidgetKit/Live Activity.

Classify any failure against:
- 70ebf753 base;
- Batch 3 accepted authority;
- known pre-existing ledger.

Do not wave through new failures.

INTEGRATION SAFETY

No TestFlight.
No build-number bump.
No production deploy.
No production data mutation.
No Server change.

Do not pull in the separate Evidence reliability lane yet.

OUTPUT

Publish:
- exact integrated Native SHA;
- exact parent/base authorities;
- macro-color correction implementation;
- conflict resolution;
- Workout Match preservation proof;
- full test results;
- Release compile;
- remaining known issues;
- exact instruction for layering the Evidence reliability fix afterward.

Update the normal handoff/reporting pointers without erasing the separate reliability lane's work; clearly label this as the approved Batch 3 multi-lane integration candidate.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

At successful completion notify:
PhysiqueOS Batch 3 — integrated candidate ready; awaiting Evidence reliability fix/build authorization.

STOP

Stop with a clean integrated Native authority.
Do NOT upload TestFlight.
Do NOT bump build number.

END TASK.