# Goal Adaptation V3: simplicity with sophistication (design only)

- **Prompt:** `agent-handoffs/inbox/prompts/20261010-claude-goal-adaptation-simplicity-sophistication-v3.md` at `790fa4a6`.
- **Builds on:** prior boards `225204af` (Operating Plan) and `dcc61f35` (1:1 + Quick Calibration). Both are left unchanged.
- **Scope:** design only. No implementation, production access, deployment or TestFlight.

## Contents

| Path | What it is |
|---|---|
| `goal-adaptation-v3-board.html` | The interactive board, published as the Claude artifact |
| `screens/` | 40 screens × Dark/Mineral Light (80 PNGs at 1.5×), including the Home, Goals and briefing addendum (H1–H4, G1–G3, B0–B5) |
| `review-board/` | Board section captures and the lightbox |
| `validation.json` | Errors, overflow, calculation checks and the remnant scan |
| `audit/01-rmr-maintenance-energy-audit.md` | RMR, maintenance and activity-source audit (Server `85a98025`, Native `49829781`, dormant `99f11ae6`) |
| `audit/02-training-learned-pattern-audit.md` | Training Logger and learned-pattern audit |
| `audit/03-home-goals-briefings-phase-audit.md` | Audit of how Home, Goals and briefings present goal phases (addendum `9e1d6207`) |
| `source/` | `model.js` (1:1 energy model + Quick Calibration v3), `screens-v3a/b.js`, `registry.js`, plus the shared phone and board CSS/JS. Rebuild with `node build-board.mjs`; render with `PLAYWRIGHT_NODE_MODULES=<server>/node_modules node render-board.mjs --screens`. |
