# Redesign Batch 3 · Checkpoint B correction (Training icons) + B/C regression proof (Claude)

- Task: `batch3-bc-founder-feedback-icons-regression-20261005` (prompt commit `29e28678`)
- Status: **Done and pushed. STOPPED for Founder review. Checkpoints D and E not started.**
- Generated (UTC): 2026-10-05T19:36:26Z

## Authorities

| Item | SHA |
|---|---|
| Native correction | `8aa2d00b` (base: B/C candidate `5c296d9e`) |
| Package | `911781e6` |
| Branch | `claude/redesign-batch3-evidence-takeover-20261005` (pushed) |

## Review links (all HTTP 200 at `911781e6`)

- Primary mobile board (Dark + Mineral Light + mapping): https://github.com/dustinginn/physiqueos/blob/911781e6036edcc6bfc51de600e2eca57c9ee5ab/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-correction-20261005/checkpoint-b-correction-primary-mobile-board.png
- Before/after with changed-pixel mask:
  - Dark: https://github.com/dustinginn/physiqueos/blob/911781e6036edcc6bfc51de600e2eca57c9ee5ab/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-correction-20261005/training-areas-dark-before-after.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/911781e6036edcc6bfc51de600e2eca57c9ee5ab/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-correction-20261005/training-areas-light-before-after.png
- Docs:
  - Icon mapping: https://github.com/dustinginn/physiqueos/blob/911781e6036edcc6bfc51de600e2eca57c9ee5ab/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-correction-20261005/ICON-MAPPING.md
  - Activity completeness: https://github.com/dustinginn/physiqueos/blob/911781e6036edcc6bfc51de600e2eca57c9ee5ab/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-correction-20261005/ACTIVITY-COMPLETENESS.md
  - C regression proof: https://github.com/dustinginn/physiqueos/blob/911781e6036edcc6bfc51de600e2eca57c9ee5ab/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-correction-20261005/C-REGRESSION-PROOF.md

## Part 2 — Training Area icon system

SF Symbols has no muscle-anatomy glyphs, so the icons use one coherent metaphor: the native SF Symbols fitness figure for a movement that trains each area. There are no external assets.

| Area | Icon | Movement |
|---|---|---|
| Chest | `figure.strengthtraining.traditional` | barbell press |
| Back | `figure.rower` | row |
| Shoulders | `figure.mixed.cardio` | arms overhead |
| Biceps | `dumbbell.fill` | arm work (shared with Triceps) |
| Triceps | `dumbbell.fill` | arm work (shared with Biceps) |
| Core | `figure.core.training` | floor core work |
| Quads | `figure.strengthtraining.functional` | lunge |
| Hamstrings | `figure.flexibility` | hinge / reach |
| Glutes | `figure.step.training` | step-up |
| Calves | `figure.run` | ankle push-off |

Each glyph is fitted into a 12 pt square inside the unchanged 22 pt ring.

Pixel diff against accepted B: exactly 10 changed regions, each ≤ 13 pt, all inside the rings. That is 5,050 px in Dark and 5,033 px in Light. Nothing else on the page changed.

## Part 1 — Activity completeness

Every Build 87 lower-page element is present and functional:

- Latest/Today hero → Activity Day, including in-progress and energy warnings;
- Activity Areas (informational);
- Linked Training Context;
- Recent Activity History, 3-row preview → Activity Day;
- Show All sheet → full history → Activity Day → back → Done;
- Goal/phase scope re-read;
- pull, foreground and authority reloads;
- loading, failure and empty states.

Nothing was dropped, and the lifecycle and sheet modifier sets are identical to Build 87.

Proof:
- UI test `testActivityLowerPageIsCompleteAndEveryRouteWorks`;
- unit tests for fixture completeness and failing-API / unknown-day states.

## Part 3 — Nutrition + Weight drawer/sheet regression

All 7 Nutrition report sheets, the history sheet, every Nutrition Day route, the range/macro/slot/metric filters, scope, the Weight inline Show All/Close, tap/scrub selection and scope are preserved. Weight has no sheets in Build 87 either, and DEXA markers were decorative there too.

One real gap was fixed: Reporting rows without a destination are kept as informational rows (Build 87 behavior). Sandbox has none of these.

Nutrition Areas stays hidden under the locked Founder correction `8e6bd94b`; it had no route or action.

Proof: 4 new UI journeys plus 3 existing ones (see `C-REGRESSION-PROOF.md`).

I added stable accessibility identifiers for testing only; there is no visual change.

## Part 4 — Chart gesture fix

Retained on Weight and Nutrition: tap selects, horizontal pan scrubs, and a vertical swipe scrolls the page. Tests prove all three. It was not broadened to DEXA, Energy or Briefings.

## Tests

| Run | Result |
|---|---|
| Focused unit tests | 397, 0 failures (1 pre-existing skip) |
| `EvidenceTrainingNutritionWeightUITests` | 11/11 |
| `EvidenceHubTimelineUITests` | 3/3 |
| Training acceptance Evidence journeys | 4/4 |
| `RecoverySleepAcceptanceUITests` | 3/3 |
| Generic Release compile | Passed (app + Watch + Live Activity); review seams absent |

## Safety

- No TestFlight upload, no build-number bump, no Server change, no deploy, no production data.
- Checkpoint A and the C visuals are untouched.
- Batch 2 files are untouched.

## Next

Founder gives final B acceptance. Checkpoint D (Progress Photos + DEXA) starts only on explicit approval.
