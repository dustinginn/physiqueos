# Batch 3 · Checkpoint B correction and B/C regression proof

- **Native:** `8aa2d00b` on `claude/redesign-batch3-evidence-takeover-20261005`. The base is the B/C candidate `5c296d9e`, packaged at `2860f0c5`.
- **Task:** prompt `29e28678`. Checkpoint C is Founder-approved visually. Checkpoint B layout stays locked apart from Training Area glyph content.

## Contents

| File | What |
|---|---|
| `checkpoint-b-correction-primary-mobile-board.png` | **Start here.** Corrected Training Areas grid in Dark and Mineral Light, plus the icon mapping |
| `training-areas-dark-before-after.png`, `training-areas-light-before-after.png` | Accepted B, then corrected, then a changed-pixel mask (magenta) |
| `training-areas-dark.png`, `training-areas-light.png` | Full-resolution corrected grid |
| `ICON-MAPPING.md` | Area → SF Symbol table, rationale, and the geometry-unchanged proof |
| `ACTIVITY-COMPLETENESS.md` | Lower-page Activity inventory against Build 87, with test proof |
| `C-REGRESSION-PROOF.md` | Nutrition and Weight drawer/sheet/route/interaction audit, with test proof (no new C visuals) |

## Tests (simulator iPhone 17 Pro, iOS 27, Sandbox)

| Run | Result |
|---|---|
| Focused unit tests: Training, Training Library, Session Detail, Activity, Nutrition, Nutrition Reporting, Weight, HealthKit workout fidelity, Evidence read model / chronology / hub usage, SharedUI, AppTab, Recovery/Sleep, Chart interaction, Reconciliation | **397 run, 0 failures** (1 pre-existing skip: live-capture fixture) |
| `EvidenceTrainingNutritionWeightUITests` | **11/11** (6 existing + 5 new regression journeys) |
| `EvidenceHubTimelineUITests` (Checkpoint A) | 3/3 |
| `TrainingAcceptanceUITests` Evidence journeys (Library, Reporting, Recent History → Day → Workout → Correction, Corrected Evidence) | 4/4 |
| `RecoverySleepAcceptanceUITests` | 3/3 |
| Generic iOS Release compile | **Passed.** App, Watch and Live Activity embedded; DEBUG review seams absent from the binary |
