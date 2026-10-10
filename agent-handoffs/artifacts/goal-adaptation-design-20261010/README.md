# Goal Adaptation: Founder scenario design mockups (design only)

Design-only review artifacts for the Goal Adaptation journey. They use the Founder's real Build Lean Mass situation after the October 9 DEXA.

- Task prompt: `agent-handoffs/inbox/prompts/20261009-claude-goal-adaptation-founder-scenario-design-mockups.md` at `f6e36e7b`
- Built on: architecture audit `agent-handoffs/reports/20261010T004146Z-goal-intelligence-existing-engine-audit.md` (main `ba50a591`)

**Nothing here is implemented.** No Native, Server, schema, engine, production, deployment, TestFlight or release-pointer change was made. Released Build 93 `9d0a2069` and the Build 94 lane are untouched.

## Boards

| Board | Content |
|---|---|
| [Board 0](board-0.png) | Scenario, facts vs illustrative values, journey and trigger policy |
| [Board 1](board-1.png) | Triggers: DEXA briefing card, Weekly reference, Home priority, notification, "Not now" sheet |
| [Board 2](board-2.png) | Decision screen alternatives A and B (with 135% type) and conflict validation |
| [Board 3](board-3.png) | Leaning-phase setup, keep-building revision, single approval, phase started, phase complete, evidence-insufficient |

## Screens (402 pt iPhone, 3x, Dark and Mineral Light)

| # | Screen | Dark | Mineral Light |
|---|---|---|---|
| 1 | DEXA Event briefing with "Review goal options" | [dark](screens/01-dexa-recommendation-dark.png) | [light](screens/01-dexa-recommendation-light.png) |
| 1b | Weekly briefing referencing the same open decision | [dark](screens/02-weekly-plan-check-dark.png) | [light](screens/02-weekly-plan-check-light.png) |
| 2 | Home: dismissible priority in Today's Priorities | [dark](screens/03-home-priority-dark.png) | [light](screens/03-home-priority-light.png) |
| 2b | One coordinated notification | [dark](screens/04-notification-dark.png) | [light](screens/04-notification-light.png) |
| 2c | "Not now": remind / keep plan / remove from Home | [dark](screens/04b-not-now-sheet-dark.png) | [light](screens/04b-not-now-sheet-light.png) |
| 3 | **Decision A: ranked choice cards** (recommended) | [dark](screens/05-options-alt-a-ranked-dark.png) · [135%](screens/05-options-alt-a-ranked-dark-xl.png) | [light](screens/05-options-alt-a-ranked-light.png) · [135%](screens/05-options-alt-a-ranked-light-xl.png) |
| 3 | **Decision B: side-by-side comparison** | [dark](screens/06-options-alt-b-compare-dark.png) · [135%](screens/06-options-alt-b-compare-dark-xl.png) | [light](screens/06-options-alt-b-compare-light.png) · [135%](screens/06-options-alt-b-compare-light-xl.png) |
| 3b | Option within option + constraint-conflict validation | [dark](screens/07-conflict-validation-dark.png) | [light](screens/07-conflict-validation-light.png) |
| 4 | Temporary leaning (cut) phase setup | [dark](screens/08-leaning-phase-setup-dark.png) | [light](screens/08-leaning-phase-setup-light.png) |
| 5 | Keep building: guardrail/date revision + history | [dark](screens/09-keep-building-revision-dark.png) | [light](screens/09-keep-building-revision-light.png) |
| 6 | Compact material-changes review, one approval | [dark](screens/10-review-approve-dark.png) | [light](screens/10-review-approve-light.png) |
| 7 | Confirmation: phase started, journey, goal history | [dark](screens/11-phase-started-dark.png) | [light](screens/11-phase-started-light.png) |
| 7b | Later: phase complete + next-step choice | [dark](screens/12-phase-complete-next-dark.png) | [light](screens/12-phase-complete-next-light.png) |
| 8 | Evidence-insufficient: options stay closed | [dark](screens/13-evidence-insufficient-dark.png) | [light](screens/13-evidence-insufficient-light.png) |

## Source and reproducibility

- `source/screens.html`: a single design source. Tokens are copied from `ios/PhysiqueOS/SharedUI/PhysiqueOSTheme.swift` @ `9d0a2069` (the `redesign*` set). Display type is Plus Jakarta Sans from `../home-design-exploration-20261003/fonts`.
- `source/render-screens.mjs`: Playwright + local Chrome. Captures every phone at 3x and the boards at 1x, and writes `validation.json`.
- Command: `PLAYWRIGHT_NODE_MODULES=<server>/node_modules node source/render-screens.mjs .`

## Checks (`validation.json`)

- Plus Jakarta Sans loaded: yes.
- 32 screens, all exactly 402 pt wide.
- Horizontal overflow 0, elements escaping the frame 0, text under 11 pt 0.
- Buttons, choices, segments and steppers: all at least 44 pt.
- 135% Dynamic Type stress for both decision alternatives: no overflow.
- WCAG contrast of the text token pairs used:
  - Dark: every pair is at least 6.19:1.
  - Mineral Light: every pair is at least 4.71:1 except two.
    - `green/paper` is **4.30:1**. It is the production `redesignGreen`, used here only for bold labels. This is flagged as a design-system observation and was not changed.
    - `muted/canvas` is 4.23:1. It is used only for captions above the phones.
- The decorative Home hero arc clips intentionally.

These are real browser renders of a design source. They are not SwiftUI simulator captures.
