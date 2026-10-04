# Wide-leash Weekly directions

All three directions use the same DOM, exact semantic values and canonical domain order. Only composition CSS changes. This makes the grayscale comparison honest: hierarchy and geometry, not content, create the differences.

## A — Data Editorial

Composition: a premium open report. The hero is the only large atmospheric field; Energy becomes the editorial evidence centerpiece; Weight is a single selective contained band; Training uses open ruled records; Coach's Take closes in one authored navy field.

Cards eliminated: standalone Energy, Photos, Training, Recovery, highlight, Priority Group and revision cards. Weight and Coach remain selectively contained because they act as narrative pivots.

Quantitative treatment:

- exact 68 Confidence ring;
- seven-day intake/expenditure paired columns using all 14 fixture values;
- six independent Training count bars using the exact server-owned counts;
- four Priority Muscle Group rails using exact comparable-exercise counts.

Typography: 35 pt lead headline, 36 pt Energy statement, 44 pt Weight value, 21 pt domain titles, 15 pt narrative. Supporting labels remain 10–12 pt and high contrast.

Implementation: medium. Standard SwiftUI stacks, Canvas/Shape for the ring and atmospheric arc, and Charts or aligned rectangles for Energy. Existing locked-Home gradient, ring and semantic color primitives are reusable.

## B — Immersive Story

Composition: a continuous sequence of broad color scenes. Confidence opens as a 188 pt trajectory moment; Energy changes to seven horizontal paired daily tracks; Weight, Training, future Recovery and Coach each receive a distinct section-spanning field. The page reads as a story, not a stack of cards.

Cards eliminated: all domain cards and metric tiles. The three Training highlights use inset story beats because each is a bounded record; Into Next Week actions use contained bands for actionable separation.

Quantitative treatment:

- exact 68 Confidence ring at immersive scale;
- seven horizontal paired daily Energy tracks retaining each intake/expenditure point;
- large independent Training count columns;
- two-column, left-aligned Priority Muscle Group rails with exact exercise counts.

Typography: 40 pt hero/Energy statements, 62 pt Weight value, 24 pt Coach headings, 15 pt narrative. Section fields can reflow vertically under Dynamic Type without relying on overlap.

Implementation: medium-high. Broad SwiftUI backgrounds and decorative Shapes are straightforward; the horizontal chart requires a dedicated layout or horizontally oriented Charts marks. Reduce Motion uses static fields only.

## C — Dense Analytical

Composition: a compact analytical instrument. Domains are separated by thin rules, with aligned metric rails, a compact Energy plot, inline Weight/Photos rows, tabular Training highlights and a compressed Coach finale. It deliberately minimizes decorative space while retaining practical reading sizes.

Cards eliminated: every regular domain card, metric tile, highlight card, Priority card and Recovery card. Coach's Take is the sole high-emphasis field.

Quantitative treatment:

- compact exact 68 Confidence ring;
- compact seven-day paired Energy columns with all 14 values;
- six exact Training count bars in one scan rail;
- left-aligned full-width Priority Muscle Group table with exact exercise-count rails.

Typography: 25 pt lead/energy statements, 27 pt Weight value, 17–21 pt headings, 15 pt narratives. Density comes from alignment and reduced whitespace, not reduced legibility.

Implementation: low-medium. It maps cleanly to LazyVStack/Grid, Dividers, Swift Charts and existing semantic typography/color tokens.

## Grayscale difference proof

- A alternates open editorial sections with two selective fields and tall paired columns.
- B is a continuous full-width field sequence with a tall hero, horizontal Energy tracks and story-beat Training records.
- C is a short, ruled analytical rail with compact paired columns and table-like rows.

Measured page heights are 4,288 pt, 4,802 pt and 3,437 pt respectively at the same 402 pt target width. Layout signatures and computed chart/priority/highlight geometry are recorded in `validation.json` and are unique across all three.
