# Goal Adaptation: Home parity correction + interactive simulator (design only)

- **Prompt:** `20261010-claude-goal-adaptation-home-parity-interactive-simulator.md` at `8712c197`.
- **Scope:** design and simulation only. Illustrative data; no network, no production, Native, Server or TestFlight.

## Stage 1: corrected Home (`home/`)

- **`home-parity-review.html`:** the Home content review (Claude artifact). **Illustrative content only, not a visual specification.** It includes the content-slot matrix, the fit check and the diff-boundary audit. Build 95 SwiftUI remains the source of truth; native pixel parity is to be proven with snapshot tests at implementation.
- **`home/home-render.js`:** source-faithful Home replica from Native Build 94 (`HomeJourneyFieldView.swift`, `ConfidenceRing.swift`, header, strip, priorities). It is shared with the simulator.
- **`home/screens/`:** captures, plus `home/validation.json`.
- **Rebuild:** `node home/build-home-review.mjs`.
- **Render:** `PLAYWRIGHT_NODE_MODULES=<server>/node_modules node home/render-home.mjs`.

## Stage 2: interactive simulator (`simulator/`)

- **`goal-adaptation-simulator.html`:** the stateful simulator (Claude artifact). It is a functional UX simulation, not the Native visual spec.
- **`simulator/sim.js`:** state, screens, actions and simulated evidence.
- **Engine rules:**
  - 1:1 energy;
  - phase completion by outcome, time or hybrid;
  - Quick Calibration after about 3 weeks of slower-than-planned progress;
  - honest lean-mass changes;
  - versions and undo.
- **`simulator/test-sim.mjs`:** end-to-end click test; 37 checks in `test-results.json`, with screenshots in `simulator/screens/`.
- **Rebuild:** `node simulator/build-sim.mjs`.

## Energy model reconciliation (prompt `fcb9ad06`)

- **`simulator/energy-model.js`:** pure, layered energy math. Each layer is kept separate:
  1. RMR, with its source (measured, DEXA report or equation) and a range;
  2. usual activity (Apple Health, or none);
  3. digestion, assumed ≈ 10% of intake;
  4. bottom-up estimate;
  5. outcome-calibrated maintenance, used only with sufficient logging;
  6. approved targets.

  The derived balance is `eat − planning maintenance − extra activity`, with 1:1 activity accounting.
- **`simulator/energy-model.test.mjs`:** 25 arithmetic regression checks, including the Founder case (1,850 + 900 − 1,700 = 1,050, which is not a deficit) and scenarios A (DEXA), B (equation RMR) and C (no wearable, partial logging). Results are in `energy-model.test-results.json`.
- **Energy Lab** in the simulator side panel: switch scenarios, edit assumptions, and read the live reconciliation. Approved targets never change; drafts are recalculated.
- **End-to-end:** `simulator/test-sim.mjs`, 57 checks.

## Body-fat guardrail editing

- **`simulator/guardrail-model.js`:** the guardrail model, with two scopes kept separate.
  - Goal guardrail: overarching, going forward.
  - Phase-only guardrail: expires when that phase ends.
  - The leaning phase target is a third, separate thing.
  - Actions: keep, change or remove.
  - Validation: inverted or out-of-bounds ranges; building above the upper limit; a phase target at or above current body fat; a phase target above the guardrail.
- **`simulator/guardrail-model.test.mjs`:** 17 unit checks.
- **Simulator:**
  - one editor reachable from the leaning setup, Keep building, the plan hub and the phase-complete "What's next" screen;
  - the original and proposed guardrail shown in Review;
  - one approval, with every change recorded in goal history and undoable;
  - on resume, the next phase (Phase 4, linked to Phase 2) shows which guardrail applies.
- **End-to-end:** `simulator/test-sim.mjs`, 81 checks.
