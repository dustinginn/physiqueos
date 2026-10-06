# Training Areas icon mapping (Checkpoint B correction)

SF Symbols has no muscle-anatomy glyphs. Each area therefore shows the native SF Symbols fitness figure (or piece of equipment) for a movement that mainly trains that area. Every symbol is built into iOS (available since iOS 16; the app targets iOS 18), so there are no external image dependencies.

The mapping lives in `TrainingAreaIcon.systemImage(for:)` in `ios/PhysiqueOS/Presentation/Training/TrainingHistoryView.swift`. The unit test `testEveryCanonicalTrainingAreaHasAMeaningfulMovementIcon` pins it, and also checks that each symbol resolves with `UIImage(systemName:)` and that only Biceps and Triceps share an icon.

| Area | SF Symbol | Why |
|---|---|---|
| Chest | `figure.strengthtraining.traditional` | Barbell press, the primary chest lift |
| Back | `figure.rower` | Row/pull, horizontal back work |
| Shoulders | `figure.mixed.cardio` | Arms overhead, the overhead/shoulder range |
| Biceps | `dumbbell.fill` | Arm work; shared with Triceps, as the task allows |
| Triceps | `dumbbell.fill` | Arm work; shared with Biceps |
| Core | `figure.core.training` | Floor core training |
| Quads | `figure.strengthtraining.functional` | Loaded lunge, knee-dominant |
| Hamstrings | `figure.flexibility` | Hip hinge / hamstring reach |
| Glutes | `figure.step.training` | Step-up, hip extension |
| Calves | `figure.run` | Ankle push-off |
| Unknown id | `dumbbell.fill` | Fail-safe for any non-canonical area |

## What stayed fixed

The locked T1 tile keeps all of these unchanged:

- the 22 pt ring (1 px `line` stroke);
- the muted ink color;
- the label/count typography;
- the 8 pt gap;
- the 9/10 pt insets;
- the 11 pt corner radius;
- the `surface2` fill.

Each glyph is fitted into a 12 pt square (scaled to fit, medium weight), so wide figures (Core, the dumbbell) keep the same clearance from the ring as upright ones.

## Proof that only the glyph changed

The accepted B capture (`2860f0c5` build) was diffed pixel by pixel against the corrected build (threshold ΣΔRGB > 24, status-bar clock ignored).

| Appearance | Changed pixels | Regions | Each region | Location |
|---|---|---|---|---|
| Dark | 5,050 | 10 | ≤ 39 px (13 pt) square | Inside the 68 px (22.7 pt) ring interior |
| Mineral Light | 5,033 | 10 | ≤ 39 px (13 pt) square | Inside the 68 px (22.7 pt) ring interior |

Nothing changed outside those 10 icon interiors. That rules out any change to ring strokes, labels, counts, tile edges, section header, Browse link, or anything above or below the grid. See `training-areas-{dark,light}-before-after.png` (third panel: magenta = changed pixels).
