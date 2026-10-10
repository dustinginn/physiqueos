# Goal Adaptation: Operating Plan customization redesign (design only)

Prompt: `agent-handoffs/inbox/prompts/20261009-claude-goal-adaptation-overnight-operating-plan-design-board.md` at `136b1b9a`.

This is design only. It contains no engine, Native, Server, onboarding, deploy or TestFlight change.

## Contents

| Path | What it is |
|---|---|
| `operating-plan-board.html` | The interactive desktop review board, a single file. It is published as the Claude artifact. |
| `screens/` | 60 screens × 2 themes. Each is captured at 2× as `<id>-dark.png` / `<id>-mineral.png`. |
| `review-board/` | Board captures at 1600 (Dark and Light), 1280 and 390 widths, plus the lightbox. |
| `validation.json` | Render checks: page errors, horizontal overflow, filter and lightbox behaviour, and the interactive energy results. |
| `audit/01-native-operating-plan-editors-build94.md` | Every Operating Plan field, state and command in Native Build 94 `49829781`. |
| `audit/02-native-goals-phase-editors-and-tokens-build94.md` | The Goals and Phase editors (sandbox-only) and the design tokens. |
| `audit/03-server-canonical-edit-contracts-85a98025.md` | Server canonical edit contracts at production `85a98025`. |
| `source/` | The board source, explained below. |

The board source in `source/` is split into:
- **Styles:** `phone.css` (V2 phone tokens), `components.css`, `board.css`.
- **Screens:** `screens-a..d.js`.
- **Data:** `registry.js` (screen metadata, coverage matrix, contract map, decisions).
- **Behaviour:** `energy.js` (the interactive energy model) and `board.js` (the board UI).
- **Tooling:** `build-board.mjs` and `render-board.mjs`.

## Rebuild

```sh
cd agent-handoffs/artifacts/goal-adaptation-operating-plan-design-20261010/source
node build-board.mjs
PLAYWRIGHT_NODE_MODULES=<server>/node_modules node render-board.mjs --screens
```

## Where the numbers come from

- **Founder Oct 9 maintenance ≈ 2,117 logged kcal (1,977–2,258).** From the Phase B dormant candidate `99f11ae6`.
- **Provisional design proposals:** the 75% added-activity credit, the +500 cap, the −650 aggressive zone and the presets.
- **Illustrative:** values marked `*`, plus the nutrition and supplement specifics.
