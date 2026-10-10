# Goal Adaptation: Founder scenario acceptance gate v1

Results from the **actual** Phase A shadow engine (`goal_adaptation_shadow_v1`) under draft `goal_adaptation_policy_v1`. Dormant: nothing here is deployed, persisted or wired to a production caller.

- `results.json`: deterministic engine output for all 26 scenarios: evidence, schedule, guardrail, coverage, adherence, eligibility, rung, coaching, before/after, and expected-vs-actual checks.
- `scenario-board.html`: the desktop review board (page body; the published Claude artifact uses the same file).
- `screens/`: 1440 and 1280 desktop captures in Dark and Mineral Light, 390 mobile, plus drilldowns of F1, E1 and G1. Render checks are in `render-validation.json`.

**Reproduce**
- Engine fixtures: `src/domain/goalAdaptation/scenarios/GoalAdaptationScenariosV1.js`.
- Runner: `runGoalAdaptationScenarios.js`.
- Test: `GoalAdaptationScenarios.test.js`.
- Regenerate this folder: `node scripts/goal-adaptation/renderScenarioBoard.mjs agent-handoffs/artifacts/goal-adaptation-scenario-gate-20261010`.

## Phase B (added 2026-10-10)

Phase B adds ranked options, evidence-calibrated energy, timelines, guardrail validation and revalidation from the actual dormant engine. All numbers come from `goal_adaptation_policy_v1.phaseB`, which is `provisional_requires_founder_review`.

- `results.json` now holds 30 results: the 26 accepted scenarios plus Phase B extras B1–B4. Each result carries a `phaseB` block with calibration periods, ranked options, the recommendation snapshot and revalidation.
- The 26 accepted Phase A decisions are frozen in `src/domain/goalAdaptation/scenarios/accepted/phaseAAcceptedDecisionsV1.json` and locked by `GoalAdaptationPhaseB.test.js`.
- New screens:
  - `*-phaseb-founder-options.png`: the Founder's Oct 9 options;
  - `*-phaseb-F1-calculations.png`: calibration periods, options and tradeoffs;
  - `*-phaseb-B4-revalidation.png`: an expired recommendation with approval blocked.
