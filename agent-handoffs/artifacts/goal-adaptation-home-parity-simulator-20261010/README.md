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

## Guardrail ↔ phase-target sync (prompt `ce3b6ad1`)

- The editor defaults to **Goal, going forward**. A goal-wide change (8–9% → 6.5–8.5%) is labelled "Changing your GOAL guardrail". The text explains that the leaning phase aims to bring you back into the new range and that Phase 4 keeps that range.
- **The phase target is aligned automatically** to the lowest upper limit that will apply: the goal's, or a leaning-only override if it is lower (`grAlignedTarget`). It follows every guardrail edit until you set it yourself.
  - If the new range already contains current body fat, the target goes just below current body fat.
  - If the guardrail is removed, the previous target is kept.
- **A target you set yourself is never overwritten.** If it no longer fits the range, one-tap fixes appear: "Use 8.5% (aligned)" or "Edit guardrail". When a set target differs from the aligned one, an "Align to X%" link appears.
- **Steppers can't create an invalid range.** Pushing one limit past the other moves the other with it (`grStep`), and the range stays within 4–20%.
- **Keep building and resume conflicts** offer "Raise upper limit to X%". Keep building also offers "Lean out first instead".
- **Cancel / Done in the editor:** Cancel restores the guardrail and phase target exactly as they were.
- **Review rows:**
  - Goal guardrail (original → new · going forward)
  - leaning-only guardrail, if any
  - Phase ends (original → aligned target)
  - When building resumes (Phase 4, linked, with its guardrail)
- **Home:** text only, in the existing slots.
- **Tests:** `guardrail-model.test.mjs` 32/32; `test-sim.mjs` 109/109; `energy-model.test.mjs` 25/25 (unchanged).
- **Screenshots:** 16–22 in `simulator/screens/`.

## "Why this plan?" (prompt `61afe17e`)

- **Renamed and rewritten:** "Why these numbers?" is now **"Why this plan?"**. It reads in three short coach-like parts:
  1. **What worked last time:** Visible Abs, May 24 – Jul 18 (the Server's cut window). The food, activity, pace, DEXA and lifts lines are marked SIMULATED.
  2. **What's different now:** current body fat and progress kept; maintenance with its range (marked illustrative, or "not calibrated yet"); usual activity.
  3. **So the plan:** eat and move targets; the daily gap and expected rate; plain comparisons with the last cut; one line on calibration over time.
- **Removed from the default page:** the digestion card, the bottom-up walkthrough, the naive "RMR + activity − food" sum and the gap speculation. **"See calculation details"** (`whyDetails`) shows the maintenance used, its range, the eat and activity formulas, resting energy with its source, and a one-line note that a formula estimate is higher and the plan follows your results.
- **History module:** `simulator/personal-history.js` tags every value as either `record` (goal name and dates) or `sim` (all outcome numbers). Scenarios B and C have no earlier cut, so the page says so. A food average logged on fewer than 70% of days is labelled rough.
- **Source audit:** `source-audit/previous-cut-evidence-audit.md`.
- **Tests:** personal history 11/11; end-to-end 120/120; energy 25/25 and guardrail 32/32, both unchanged.
