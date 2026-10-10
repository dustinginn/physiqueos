# Goal Adaptation: Energy 1:1 accounting + Quick Calibration (design only)

- **Prompt:** `agent-handoffs/inbox/prompts/20261010-claude-goal-adaptation-energy-1to1-quick-calibration-board.md` at `e0b7e4f5`.
- **Builds on:** the Operating Plan customization board (`../goal-adaptation-operating-plan-design-20261010/`, branch commit `225204af`). That folder is left unchanged.
- **Scope:** design only. No engine, Native, Server, onboarding, deployment or TestFlight change.

## What changed

1. **1:1 activity accounting.**
   - Formulas:
     - eat = estimated maintenance + selected balance + added activity;
     - Watch goal = usual active energy + added.
   - Example: 2,117 − 450 + 100 = 1,767, with a Watch goal of 900.
   - The former activity discount is removed everywhere: model, sliders, presets, targets, forecasts, explanations and contract map.
   - Targets are no longer rounded to 25 kcal, so the chosen balance holds exactly.
2. **One-time intro (E0).** Targets are a starting point; logs and wearables have margins of error; PhysiqueOS recalibrates from weight and body-composition trends.
3. **Quick Calibration (QC1–QC16).** A briefing-native, single-target adjustment placed at the end of the Weekly or Monthly briefing:
   - Accept, or choose another amount;
   - inline "Plan updated" with undo;
   - no duplicate application, revalidation, escalation to the full plan review;
   - versioned history and an observation window;
   - no proposal when evidence is insufficient;
   - alternates for a cut, mass building, maintenance and strength.

## Contents

| Path | What it is |
|---|---|
| `energy-quick-calibration-board.html` | The interactive board, published as the Claude artifact |
| `screens/` | 77 screens × Dark/Mineral Light (154 PNGs) |
| `review-board/` | Board captures at 1600 (Dark and Light), 1280 and 390, plus the lightbox |
| `validation.json` | Page errors, overflow, interactive calculation checks and the remnant scan |
| `source/` | Board source; rebuild with `node build-board.mjs` and `PLAYWRIGHT_NODE_MODULES=<server>/node_modules node render-board.mjs --screens` |

## Status of the numbers

- **Provisional:**
  - the intake floor (25% below maintenance, rounded up to 25);
  - the +500 added-activity cap;
  - the presets;
  - the ±300 quick-step limit;
  - the 3-week observation window.
- **Illustrative:** the Quick Calibration evidence values.
