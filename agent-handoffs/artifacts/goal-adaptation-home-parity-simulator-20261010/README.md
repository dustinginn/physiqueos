# Goal Adaptation: Home parity correction + interactive simulator (design only)

- **Prompt:** `20261010-claude-goal-adaptation-home-parity-interactive-simulator.md` at `8712c197`.
- **Scope:** design and simulation only. Illustrative data; no network, no production, Native, Server or TestFlight.

## Stage 1: corrected Home (`home/`)

- **`home-parity-review.html`:** the review page (Claude artifact). Production baseline beside H1–H4, in Dark and Mineral Light, with a slot-parity table.
- **`home/home-render.js`:** source-faithful Home replica from Native Build 94 (`HomeJourneyFieldView.swift`, `ConfidenceRing.swift`, header, strip, priorities). It is shared with the simulator.
- **`home/screens/`:** captures, plus `home/validation.json`.
- **Rebuild:** `node home/build-home-review.mjs`.
- **Render:** `PLAYWRIGHT_NODE_MODULES=<server>/node_modules node home/render-home.mjs`.

## Stage 2: interactive simulator (`simulator/`)

- **`goal-adaptation-simulator.html`:** the stateful simulator (Claude artifact).
- **`simulator/sim.js`:** state, screens, actions and simulated evidence.
- **Engine rules:**
  - 1:1 energy;
  - phase completion by outcome, time or hybrid;
  - Quick Calibration after about 3 weeks of slower-than-planned progress;
  - honest lean-mass changes;
  - versions and undo.
- **`simulator/test-sim.mjs`:** end-to-end click test; 34 checks in `test-results.json`, with screenshots in `simulator/screens/`.
- **Rebuild:** `node simulator/build-sim.mjs`.
