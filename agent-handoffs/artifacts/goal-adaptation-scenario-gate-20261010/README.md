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
