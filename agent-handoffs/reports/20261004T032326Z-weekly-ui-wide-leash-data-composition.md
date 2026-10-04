# Weekly UI wide-leash data-composition pass

Status: **READY FOR FOUNDER REVIEW — NO WEEKLY DIRECTION SELECTED**

## Authority and scope

- Assignment authority: `425258416b8c8791ff1e1f19eeed642f188aab77`.
- Native Weekly implementation/fixture authority: Build 85 `b8ee8690b194cb90086b62816b9a2c8c400dc026`.
- Canonical fixture: `weekly_briefing_2026-08-23_2026-08-29`, copied unchanged into the disposable harness.
- Locked tone authority: selected Home dark direction; Log remains locked to Compact Command Center.

This pass changes visual composition only. It does not modify shipping Native UI, Server behavior, production content projection, conditional semantics, Recovery status, build number or TestFlight state.

## Canonical information contract

The contract remains Navigation → Lead/Confidence → Energy → Weight → Photos → Training → future-only Recovery fixture → Coach's Take/Into Next Week → revision provenance.

All exact visible words, metrics, Energy points/series, Training highlight records, Priority Muscle Groups, Confidence semantics, Coach content, action order, Recovery placement and revision content are frozen. Fixture-absent Energy comparison rows, photo link, Training watch, Body Composition and uncertainty remain absent.

The sole additive content is the already-approved Recovery future fixture, exactly once after Training. It is visibly labeled `FUTURE CONTRACT · FIXTURE ONLY`, remains `Not enough data`, is not production output and has no Confidence coupling.

## Data-field audit

Truthful visual geometry uses only:

- Confidence score 68;
- seven intake and seven expenditure values for Aug 23–29;
- Training counts 4/4/2/2/1/2 as independent measures;
- Priority Muscle Group comparable-exercise counts 3/4/3/4.

Weight has no canonical time series, so it remains a large exact average/change composition rather than a fabricated sparkline. Highlight deltas have different units/bases and remain exact text rather than normalized comparisons. Recovery has no numeric future-fixture series and remains qualitative. Body Composition is null and remains absent.

See `agent-handoffs/artifacts/weekly-ui-wide-leash-20261004/DATA-FIELD-INVENTORY.md` and `QUANTITATIVE-MAPPINGS.md`.

## Concepts

### A — Data Editorial

An open premium report with a Home-family hero field, dominant paired-column Energy evidence, a single selective Weight band, ruled Training records and an authored navy finale. Standard domain/highlight/priority/recovery cards are removed.

Implementation complexity: medium. Reuse the locked-Home gradient/ring system, semantic palette, typography and standard SwiftUI stacks; use Charts or aligned rectangles for Energy.

### B — Immersive Story

A continuous sequence of broad color scenes, including a 188 pt Confidence trajectory, seven paired horizontal Energy tracks, large Weight moment, deep Training field, future Recovery scene and chapter-like Coach close. Containment is limited to Training story beats and actionable next-week bands.

Implementation complexity: medium-high. Broad section backgrounds are straightforward; the horizontal Energy comparison needs a dedicated SwiftUI layout or horizontal Charts marks.

### C — Dense Analytical

A compact ruled instrument with aligned metric rails, compact paired Energy plot, inline Weight/Photos, tabular Training highlights, two-column Priority analysis and the shortest page. Coach is the only high-emphasis field.

Implementation complexity: low-medium. It maps closely to LazyVStack/Grid, Divider, existing type tokens and Swift Charts.

The concepts materially differ in grayscale: A is open editorial with selective fields, B is full-width immersive chapters with horizontal Energy, and C is compact/table-like with thin rules. Computed layout signatures are unique.

## Artifacts

Root: `agent-handoffs/artifacts/weekly-ui-wide-leash-20261004/`

- inspectable board: `comparison-board.html`;
- full three-way PNG: `screens/full-all-directions.png`;
- A full PNG: `screens/data-editorial-dark-full.png`;
- B full PNG: `screens/immersive-story-dark-full.png`;
- C full PNG: `screens/dense-analytical-dark-full.png`;
- focused comparisons: `screens/above-fold-all-directions.png`, `energy-chart-all-directions.png`, `training-all-directions.png`, `recovery-all-directions.png`, `coach-footer-all-directions.png`;
- design/implementation notes: `DESIGN-DIRECTIONS.md`;
- data audit and mapping: `DATA-FIELD-INVENTORY.md`, `QUANTITATIVE-MAPPINGS.md`;
- information-contract proof: `STRUCTURAL-INVENTORY.md`, `STRUCTURAL-MANIFEST.json`, `PARITY-PROOF.md`, `validation.json`;
- accessibility: `TYPOGRAPHY-ACCESSIBILITY.md`;
- reproducible renderer: `source/render-and-validate.mjs`.

## Parity and accessibility result

All three renders pass the deterministic validator:

- all expected semantic fields exact;
- canonical W-ID order and parentage exact;
- 14 Energy points exact;
- all 25 geometry marks resolve to approved fixture source keys and exact values;
- no invented or unknown value;
- future Recovery boundary and insertion point exact;
- Coach's Take, Into Next Week and revision provenance exact;
- 402 pt iPhone width / 51 pt status safe-area treatment;
- 15 pt narrative minimum;
- Priority Muscle Groups left aligned and compact;
- accessible chart summary and non-color labels preserved.

The SwiftUI notes preserve canonical VoiceOver order, Dynamic Type collapse strategies, 44 pt navigation targets and Reduce Motion feasibility.

## Backlog and lock state

The prior creative-formatting pass is recorded as rejected for remaining too conservative/card-driven. Wide-leash A/B/C is ready for review. Home and Log locks are unchanged. Weekly remains **NOT LOCKED**; mineral-light translation is intentionally deferred until composition selection/refinement.

## Isolation confirmation

The repository diff contains only design artifacts, this report and durable backlog text. No file under shipping Native UI, Server, build configuration or production resources changed. No build or TestFlight action occurred.
