# Frozen selected visual grammar

This is a design reference, not an implemented token migration.

## Color roles

### Dark

- page navy `#061019`
- elevated navy `#0F1C2A`
- immersive field teal `#087B70`
- immersive field navy `#132751`
- primary text `#F3F8FA`
- secondary text `#C3D2D9`
- brand purple `#AA98FF`
- active/success green `#55E39A`
- primary execution amber `#EFB84F`
- evidence/intake teal `#3BD2CA`
- persistent-rule cyan `#3BC6DD`
- dark Primary Goal treatment: `#5C3FD2` on `#EAE4FF` (5.5:1 contrast)

### Mineral light

- warm mineral page `#E8ECE5`
- paper surface `#FBFAF4`
- soft surface `#EEF2ED`
- primary ink `#102431`
- secondary ink `#526970`
- brand purple `#5C3FD2`
- active/success green `#16875F`
- primary execution amber `#C88228`
- evidence/intake teal `#087E78`
- persistent-rule cyan `#107F99`

Purple identifies PhysiqueOS and selected navigation. It does not stand in for every interaction or status. Teal identifies evidence/intake, green active/success, amber execution/review, and cyan persistent requirements. Every semantic color is paired with text, geometry or iconography.

## Typography

Plus Jakarta Sans remains the family. The exploration narrows usage to:

- 11 pt — compact uppercase labels
- 12 pt — metadata, timing and progress copy
- 13–14 pt — row summaries and body copy
- 16–18 pt — important actions / section emphasis
- 26–30 pt — page and hero titles
- 32–33 pt — confidence value and greeting name

Essential copy does not fall below 11 pt. Weight is restrained to regular/medium/semibold/bold roles rather than using bold on every level.

## Geometry and spacing

- Actual target: 402 × 874 pt, exported at 3×.
- 16–23 pt page gutters depending on architecture.
- 7–11 pt compact internal gaps; 14–16 pt primary surface padding.
- 12–16 pt utility radii; 50 pt device mask only.
- 44 pt minimum interaction height; major actions are 60–96 pt.
- Rules and spacing replace containers where containment is not necessary.

## Home hierarchy

The selected immersive field remains the defining Home composition. The corrected version:

- removes the redundant trajectory sublabel;
- exposes only `PRIMARY GOAL` in the goal label position;
- makes all four metric columns easier to scan;
- presents `TARGET DATE` explicitly;
- keeps the accurate 79% confidence ring dominant;
- pushes the large duplicate ring into quiet atmospheric depth;
- keeps Phase 2 progress attached to Phase 2;
- keeps Guardrail separate and persistent;
- preserves Log Morning Weight, Latest Briefing, priorities and tab navigation.

## Reusable primitives for Log

- atmospheric header field;
- compact uppercase section label;
- semantic status row / tile;
- persistent review or guardrail band;
- large execution action field;
- open ruled action row;
- mineral paper utility surface;
- selected tab treatment.

The Log concepts translate these primitives; they do not copy Home’s composition.
