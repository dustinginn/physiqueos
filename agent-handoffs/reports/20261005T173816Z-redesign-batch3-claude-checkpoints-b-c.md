# Redesign Batch 3 · Checkpoints B + C — Training/Activity and Nutrition/Weight (Claude)

- Task: `batch3-cpa-accepted-implement-bc-20261005` (prompt commit `fe4a29b5`). Checkpoint A was accepted and locked at `ce5c7dd8`.
- Status: **B and C implemented, pixel-audited, tested and pushed. STOPPED for Founder review. Checkpoints D and E not started.**
- Generated (UTC): 2026-10-05T17:38:16Z

## Authorities

| Item | SHA |
|---|---|
| Base | Checkpoint A `ce5c7dd8` / package `7cad090b` |
| B: Training + Activity | `7b1cd96e` |
| C: Nutrition + Weight | `5f6db645` |
| Fix (seed parsing, bar labels) | `5c296d9e` |
| Review packages | `2860f0c50fa393f6c7c4cb3a8f5c34743a291210` |
| Branch | `claude/redesign-batch3-evidence-takeover-20261005` (pushed) |

Locked design authority, as confirmed by the lock record `20261004T201501Z`:

| Family | Design | Typeface / harness |
|---|---|---|
| Training | `33ea6491` (T1–T16) | Jakarta, 390 px |
| Nutrition + Activity | `8e6bd94b` (Founder-corrected N1/A1, N2–N8, A2–A7) | Jakarta, 379 px |
| Weight | `1f8ba1b9` (W1/W2) | SF Pro, 372 px |

## Verified review links (HTTP 200 at the pushed commit)

**Checkpoint B**

- Primary board:
  - Dark: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/checkpoint-b-primary-mobile-review-board.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/checkpoint-b-primary-mobile-review-board-light.png
- Training:
  - Dark: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/training-dark-reference-vs-simulator.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/training-light-reference-vs-simulator.png
- Activity:
  - Dark: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/activity-dark-reference-vs-simulator.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/activity-light-reference-vs-simulator.png
- Sheets and states: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/subpages-states-dark.png
- Build 87 / Codex / candidate: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/context-build87-codex-candidate.png
- Notes: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-b-20261005/PARITY-NOTES.md

**Checkpoint C**

- Primary board:
  - Dark: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/checkpoint-c-primary-mobile-review-board.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/checkpoint-c-primary-mobile-review-board-light.png
- Nutrition:
  - Dark: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/nutrition-dark-reference-vs-simulator.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/nutrition-light-reference-vs-simulator.png
- Weight:
  - Dark: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/weight-dark-reference-vs-simulator.png
  - Mineral Light: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/weight-light-reference-vs-simulator.png
- Sheets and states: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/subpages-states-dark.png
- Build 87 / Codex / candidate: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/context-build87-codex-candidate.png
- Notes: https://github.com/dustinginn/physiqueos/blob/2860f0c50fa393f6c7c4cb3a8f5c34743a291210/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-c-20261005/PARITY-NOTES.md

## Audit verdict

Codex B and C kept Build 87's composition: navy palette, SF Symbol tiles, glass back pills, and inline set strings. The context boards show it was a restyle, not the locked design.

The candidate reproduces each locked harness:

- per-family palettes, Jakarta or SF type at harness scale, and flat text back labels;
- VIEWING scope card and rail rows;
- 10-area tile grid;
- read-only set tables, Superset field, Apple Health provenance;
- Benchmark and Records fields;
- daily hero and 8-metric grid;
- ruled 3-row histories;
- macro-inked meals;
- teal trend, bar and donut charts;
- the Weight record system.

## Parity (simulator minus reference, pt)

**Page heads** (header, scope, first section), across every surface in both appearances:

- within ≤ 2.0;
- Training T1 within ±0.7 throughout;
- horizontal positions ≤ 0.5.

**Lower sections**, after re-aligning past real Sandbox content (the extra Goal-phase pill row and canonical scope cards):

| Section | Residual (pt) |
|---|---|
| Nutrition Day | ≤ 2.0 |
| Calories | ≤ 3.0 |
| Macros / Nutrition root | ≤ 3.4 |
| Exercise | ≤ 3.0 |
| Weight | ≤ 0.3 |
| Meals | ≤ 7.4 |

The Meals residual comes from real summary values (label wraps, a different most-common slot), not section geometry.

**Truthful content gaps:**

- The day row has no source field (no "· APPLE HEALTH"); the Apple-only session has no kind field (no "CARDIO" tag).
- No Sandbox fixture day is totals-only or in-progress, so N4 and A4 are template-only.
- Reports keep their canonical scope and full lists. Bars and donut keep canonical values (grams, day counts).
- Sheets keep their medium/large detents.

## Behavior

- **Preserved:**
  - routes, read models and Goal/phase scope filtering;
  - reporting calculations, weekly averages and DEXA markers;
  - HealthKit attachment wording; Sandbox-only correction editor;
  - Training Evidence vs Logger separation.
- **Not touched:** Log, Logger, Workout Match, Watch, HealthKit lifecycle, Home/Goals/You, Server. Checkpoint A is untouched visually; the Hub only records its title for the back trail.
- **Not presented:** the duplicate Nutrition Areas block, per the locked correction.
- **Back labels:** contextual ("‹ Aug 26"), from an ordered back trail; "‹ Back" outside the Evidence tab.
- **Fixed a real defect:** on Weight and Nutrition charts, a vertical swipe that starts on the chart was trapped by the shared zero-distance drag overlay. Those charts now select by tap and scrub by horizontal-only pan. A UI test proves the page scrolls and the scrub works.
- **Open item for the DEXA, Energy and Briefing owners:** the shared overlay still has this defect on DEXA, Energy and the Weekly/Monthly Briefings. I left it, because those surfaces are out of scope for this task.
- **Project file:** the new kit files sit in a pinned generator block (0x1CFF). Regeneration is additive only, and no existing ID moved.

## Tests

| Run | Result |
|---|---|
| Focused unit tests (Training, Activity, Nutrition, Weight, HealthKit fidelity, Evidence, SharedUI, AppTab, Recovery, Chart, Reconciliation) | 426, 0 failures (1 pre-existing skip) |
| New `EvidenceTrainingNutritionWeightUITests` | 6/6 |
| `EvidenceHubTimelineUITests` | 3/3 |
| Existing `TrainingAcceptanceUITests` Evidence journeys | 4/4, after restoring the shipping identities they key on (uppercase eyebrows, "Details" row, a title-only disclosure label); the test file was not edited |
| `RecoverySleepAcceptanceUITests` | 3/3 |
| Generic Release compile | Passed (app + Watch + Live Activity); review seams absent |

## Safety

- No TestFlight upload, no build-number bump, no Server change, no deploy, no production data.
- Batch 2 files untouched: `TrainingAcceptanceUITests` was not edited.

## Next

Founder reviews B and C. Checkpoint D (Progress Photos + DEXA) starts only on explicit approval.
