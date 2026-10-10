# Goal Adaptation: corrected Home, matched to production (stage 1, for Founder review)

- **Task id:** `claude-goal-adaptation-home-parity-stage1-20261010`
- **Prompt:** inbox `20261010-claude-goal-adaptation-home-parity-interactive-simulator.md` at `8712c197`
- **Status:** corrected Home is ready for review; stage 2 (the interactive simulator) is in progress and will follow in a separate report.
- **Scope:** design only. No production, Native, Server or TestFlight change.

## Where to look

| Item | Value |
|---|---|
| **Home review** | **https://claude.ai/artifact/GNdGemefiB7g3foKawU9sr** (private until shared) |
| Branch | `claude/goal-adaptation-home-parity-simulator-20261010` @ **`337a75228a5168b010c891f24ec61f89443069c1`** (pushed) |
| Commit | https://github.com/dustinginn/physiqueos/commit/337a75228a5168b010c891f24ec61f89443069c1 |
| Leaning (H2, Dark) | https://github.com/dustinginn/physiqueos/commit/337a75228a5168b010c891f24ec61f89443069c1#diff-0931594b76bb53b64c1b5f2dc410326114ff321a801a97f17b4802a4351a66ca |
| Phase complete (H3, Mineral Light) | https://github.com/dustinginn/physiqueos/commit/337a75228a5168b010c891f24ec61f89443069c1#diff-dd5200b347b5c2a549f7e77b6e916d239acf64f3fdf2ade27f74b01092a5b54a |

## What changed

The Home replica follows the production source for Build 94 (`498297815a`):
- `HomeJourneyFieldView.swift`, `ConfidenceRing.swift`, `HomeHeaderView.swift`, `HomeView.swift` and `TodaysFocusCardView.swift`.
- Everything outside the server's dynamic phase text is unchanged:
  - the connected left phase timeline (line and dots);
  - the 82pt ring in its 110pt frame, labelled **CONFIDENCE**;
  - the four fixed metrics (Target date, Remaining, Progress, Destination);
  - the "PRIMARY GOAL" chip;
  - the 304pt GUARDRAIL box;
  - the 104pt action and briefing strip, Today's Priorities and the tab bar.

**The four states:**

| State | What Home shows |
|---|---|
| H1 Building | The production baseline, unchanged |
| H2 Temporary leaning | Headline "Leaning" · "Temporary · 4 weeks left" · two rows as today: PHASE2 · PAUSED Lean Mass Build "7.1 of 10 lb kept", and PHASE3 · ACTIVE Leaning (temporary) with "Body fat 9.7% → 8–9%". PROGRESS stays the **goal's** 71%. Target date reads "Paused". |
| H3 Phase complete | Simplified to "Leaning complete" · "Back in range" · "Choose when to resume building." The choice is a single Today's Priorities item; details live in Goals. |
| H4 Resumed | Lean Mass Build active again at 6.9 of 10 lb, with a new date (simulated). |

## Checks

- The goal card height in H2 and H4 equals the baseline (495pt). H3 is 20pt shorter.
- 0 page errors and 0 horizontal overflow on desktop and 390pt mobile.
- Ring and guardrail are present in every state.

## Notes

- The production label "PHASE2 · ACTIVE" has no space; it is kept exactly as shipped.
- **Values are simulated.** The baseline is reconstructed from source; your production screenshots remain the visual authority.
- **Needs server support** (not built):
  - render the paused status for the build phase;
  - use goal progress for PROGRESS during a temporary phase;
  - provide the phase-decision priority item.
