PhysiqueOS Batch 3 — Founder feedback on B/C; C accepted, narrow B correction and regression proof

Continue in the EXISTING Claude Batch 3 Evidence takeover Remote Control chat using High reasoning. Same chat.

WORKTREE RULE

Stay in the single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

FOUNDER DECISIONS

Checkpoint C — Nutrition + Weight:
FOUNDER-APPROVED visually.

Founder does not need additional drawer/sheet screenshots provided you prove that all existing drawers/sheets, destinations, interactions and canonical behavior on Nutrition and Weight are preserved with no regression.

Checkpoint B — Training + Activity/Cardio:
Overall direction is accepted, with one visual improvement and one explicit completeness verification required before final acceptance.

Do NOT begin Checkpoint D yet.

PART 1 — ACTIVITY PAGE COMPLETENESS PROOF

Founder asks whether the rest of the Activity page remains present below the portion shown on the review board.

Explicitly verify that the redesigned Activity page retains and correctly renders all canonical lower-page content, including where applicable:
- Activity Areas;
- Linked Training Context;
- Recent Activity History;
- Show All/full-history route;
- canonical current-day/detail navigation;
- all existing lower-page disclosures/rows/actions;
- loading/error/empty behavior;
- any existing sheets/drawers associated with Activity.

Use the real shipping surface/read model, not an invented fixture-only structure.

No visual review board is required for every lower section unless you discover a discrepancy.

Report a concise inventory and prove with deterministic UI/navigation tests that the content is reachable and functional.

If anything from Build 87/current canonical Activity behavior was accidentally dropped, restore it using the locked redesign grammar before reporting.

PART 2 — TRAINING AREA ICON SYSTEM

Founder wants the Training Areas grid to feel more legitimate and intentional.

The current abstract/placeholder-looking glyphs are not accepted.

Introduce a coherent, relevant icon system for all canonical Training Areas.

Requirements:
- every Training Area gets a visually meaningful icon;
- use SF Symbols or existing app-owned vector/icon assets where they provide a clean, native result;
- do not add external image dependencies;
- icons should communicate the body area or training category as clearly as practical;
- reuse is explicitly allowed where anatomically sensible;
- example: the same arm-oriented icon may be used for Biceps and Triceps;
- avoid arbitrary geometric stand-ins when a more meaningful symbol exists;
- preserve the accepted tile geometry, icon container size, typography, spacing and colors;
- do not turn the grid into an illustrated/body-map redesign.

Audit all canonical areas, including at minimum:
Chest, Back, Shoulders, Biceps, Triceps, Core, Quads, Hamstrings, Glutes, Calves.

Choose the most semantically appropriate available native symbols/assets and document the mapping.

If SF Symbols lacks a literal muscle icon, prefer a consistent semantic fitness/body/movement metaphor over unrelated shapes.

Render the corrected Training Areas grid in Dark and Mineral Light and compare it against the accepted B geometry to prove only the intended glyph content changed.

PART 3 — NUTRITION + WEIGHT DRAWER/SHEET REGRESSION PROOF

Founder visually approves Nutrition and Weight and does not require screenshots of all drawers.

Audit and test all existing drawers/sheets/disclosures/routes associated with those pages.

At minimum verify:
- Nutrition day/detail;
- meal/source detail;
- reporting destinations;
- metric switching;
- Goal/phase/strategy filtering;
- history/full-history;
- any existing correction/detail sheets;
- Weight chart interactions;
- scope/Goal filtering;
- weekly averages/history;
- Show All/Close disclosure;
- DEXA marker interaction if present;
- any existing Weight detail/correction sheet.

Do not invent new drawers.
Do not remove existing ones merely because they were not drawn in the locked primary screens.

Prove no regression with focused unit/UI/navigation tests.

PART 4 — CHART GESTURE FIX

Retain the already-implemented Nutrition/Weight chart correction:
- tap selects;
- horizontal pan scrubs;
- vertical page swipe remains available.

Do not broaden to DEXA/Energy/Briefings in this task. Keep those follow-up notes for their owning checkpoints.

VISUAL SAFETY

Checkpoint A remains locked.
Checkpoint C primary visuals remain locked.
Checkpoint B layout remains locked except for Training Area icon glyph content.

Do not reopen accepted hierarchy, spacing, typography or palette.

TESTS

Run focused:
- Training Evidence;
- Activity Evidence;
- Nutrition Evidence;
- Weight Evidence;
- navigation/routes;
- drawer/sheet/disclosure behavior;
- chart interaction;
- appearance;
- existing Evidence journeys.

Add/update deterministic icon mapping tests if useful.

Run Release compile only if source changes warrant it; otherwise retain the prior B/C compile authority and state why.

REVIEW OUTPUT

Publish a small B correction package containing:
- Training Areas Dark;
- Training Areas Mineral Light;
- icon mapping table;
- Activity completeness inventory/test proof.

For C, publish test/regression proof only; no new visual board is required.

LINKS

Verify any GH artifact links resolve before reporting.

NOTIFICATION

Notify Founder whenever Claude stops or needs input.

At successful completion notify:
PhysiqueOS Batch 3 — Training icons and B/C regression proof ready for review.

STOP

Stop after this narrow B/C correction/proof.
Do NOT start Checkpoint D.
Do NOT start Checkpoint E.
Do NOT upload TestFlight.
Do NOT bump build number.

END TASK.