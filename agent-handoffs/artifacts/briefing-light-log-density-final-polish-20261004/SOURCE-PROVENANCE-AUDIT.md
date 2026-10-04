# Log source/provenance audit

## Authorities inspected

- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Production Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`
- Native files: `LogView.swift`, `LoggedTodayCardView.swift`, `LogReadModel.swift`, `ProductionDailyDriverAPI.swift`, and `FounderServerAPITests.swift`
- Server projection: `LoggedTodayService.js`

## Current contract facts

- `LogReadModel.loggedToday` contains Training, Nutrition and Activity from `evidence-review-queue`, then Native synthesizes Weight from the exact-date `weight.current` read.
- Training supports server-composed `lines`, allowing one Logger Strength line and one or more canonical workout lines in the same row. A multi-line row routes to Training Day rather than pretending two sessions are one.
- `Traditional Strength Training` is presented as `Strength Training`.
- An explicit HealthKit `other` family remains `other`; it is not classified as Cardio. The density fixture contains Stair Stepper as Cardio and intentionally contains no Cooldown row.
- A direct Apple Health Nutrition daily total may expose calories plus Protein, Carbohydrates and Fat in `P · C · F` order through the existing context field.
- An in-progress Apple Health Activity day is presented as `active calories so far`.
- Weight's current Native Log payload exposes date, value and unit only. It does **not** expose Weight provenance, so the design does not claim Apple Health, PhysiqueOS or another source for Weight.

## Busy-but-normal design fixture

| Visible domain | Value | Source scope used by the design |
|---|---|---|
| Strength Training | 64 min | PhysiqueOS Logger |
| Stair Stepper | 13 min | Apple Health |
| Nutrition | 2,516 calories; 215P · 161C · 111F | Apple Health |
| Activity | 771 active calories so far | Apple Health |
| Weight | 176.7 lb | Source unavailable in the current Log projection |

The values are a clearly identified design-only fixture shaped exactly like the current contract. They are not represented as a read of today's live Founder data.

## Centralized treatment

The refined command center removes `Apple Health` from individual tiles and places one compact `Sources` block at the bottom of Logged Today:

- `Apple Health` → Stair Stepper, Nutrition, Activity;
- `PhysiqueOS Logger` → Strength Training;
- `Weight` → Source unavailable.

This preserves truthful scope, scales to multiple sources and avoids repeated provenance copy. It is a design candidate only; no production projection or evidence policy changed.
