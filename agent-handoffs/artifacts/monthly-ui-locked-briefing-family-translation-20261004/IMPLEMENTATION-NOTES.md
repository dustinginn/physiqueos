# Monthly visual implementation feasibility

No implementation is authorized or included.

## Existing components/tokens to reuse

- `BriefingLeadCard`, Confidence ring data, pre-hero navigation and detail-shell loading/error states.
- Current Monthly section models and production mapper.
- `MonthlyTrainingProgressCard`, `MonthlyEnergyEvolutionCard`, `MonthlyNewBaselineCard`, What Changed, Defining Moments and Month Ahead conditional containers.
- Locked briefing-family palette roles: navy canvas, teal immersive field, semantic green/amber/cyan/lilac, mineral canvas, and stronger selective light fields.
- Existing typography family and shared section-label/body roles.

## New visual primitives

- Month-scale lead geometry with three compact exact highlights.
- Open analytical training record rail.
- Rich Energy Evolution field that preserves the current static weekly bar semantics.
- New Baseline field with a source-bound two-endpoint weight rail.
- Monthly Recovery graph surface with 4–5 weekly aggregates; this cannot ship until Recovery V1 graduates.
- Compact numbered Month Ahead rows and cross-domain What Changed sequence.

## Styling-only versus contract work

The Monthly restyle itself is visual-only and requires no Server change. Energy, Training, New Baseline, What Changed, Month Ahead and Confidence all already have the necessary source data. The weight rail uses only the exact two averages already stated in canonical narrative; it must remain accessibility-labeled and must not imply missing intermediate points.

Recovery is not styling-only: future shipping requires the approved versioned `recovery_briefing_v1` artifact contract, Server-owned status/baseline/weekly aggregates/coverage/commentary/provenance, and additive Native mapping. It remains Confidence-decoupled and foam cannot set status.

## SwiftUI complexity

- Overall visual translation: medium.
- Energy field and static bars: low-to-medium; current data/semantics remain intact.
- Responsive month-scale hero: medium due to Dynamic Type and long exact copy.
- Training rails / What Changed / Month Ahead: low-to-medium.
- Recovery after contract graduation: medium-to-high because mapping, chart accessibility and condition handling are additive.

## Current blockers/debt

- Several Monthly labels remain Native-authored instead of Server-owned.
- Existing colors and card treatments are partly hard-coded and not yet expressed through a global appearance token layer.
- The current rich fixture and the latest tuned V3 review fixture are not the same generation, so implementation validation must use an actual newly published completed-month V3 artifact.
- The global light/dark theme has not been implemented.

None of these blocks design review. They are implementation gates, not reasons to change the accepted Weekly/Midweek/Log designs.
