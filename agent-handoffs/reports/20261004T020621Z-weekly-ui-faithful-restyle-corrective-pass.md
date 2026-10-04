# Weekly UI faithful-restyle corrective pass

Date: 2026-10-04 UTC  
Prompt authority: `3acc2c86e11e24527db27294c5c8ee3740e8cf93`  
Native Build 85 authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026`

## Outcome

The rejected Weekly compositions were discarded as design baselines. A new corrective review set now uses the actual Build 85 Weekly Briefing as the immutable wireframe and applies only the locked Home/Log visual grammar. It contains one structure in two appearances: faithful dark and faithful mineral light.

No existing Weekly content, copy, order, section, card, graph, metric, narrative placement, Confidence content, Coach's Take, Into Next Week, navigation or conditional behavior was redesigned. Recovery is the only insertion, explicitly future-only after Training.

## Actual production authority and baseline

The audit was repeated against the exact Build 85 Native source:

- `ios/PhysiqueOS/Presentation/Briefings/BriefingDetailView.swift`
- `ios/PhysiqueOS/Presentation/Briefings/WeeklyBriefingSections.swift`
- `ios/PhysiqueOS/SharedUI/BriefingPresentation.swift`
- `ios/PhysiqueOS/Contracts/BriefingReadModel.swift`
- `ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift`
- `ios/PhysiqueOS/Resources/BriefingsFixture.json`

The source-confirmed order is Integrated Lead → Energy → Weight → Photos when present → Training → Body Composition when present → material uncertainty when present → Coach's Take / Into Next Week. `BriefingDetailPreHeroNavigation` precedes it. A revision banner follows it when revision provenance is present.

The baseline artifact is rendered from that structure with the unchanged Build 85 tokens and the same chosen Native fixture. It is not based on any rejected Weekly mockup:

- `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/screens/build85-baseline-full.png`
- `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/screens/build85-baseline-above-fold.png`

The annotated W-ID inventory is `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/STRUCTURAL-INVENTORY.md` and the deterministic manifest is `STRUCTURAL-MANIFEST.json`.

## Fixture provenance

The review uses the unchanged repository fixture `weekly_briefing_2026-08-23_2026-08-29`, copied verbatim with the rest of Build 85 `BriefingsFixture.json` to `NATIVE-BRIEFINGS-FIXTURE.json`.

It exercises:

- integrated Confidence 68 / moderate / increased +5 and its exact primary reason;
- full hero headline, narrative and strategy strip;
- seven paired Energy days and the production grouped-bar chart;
- Weight;
- Photos narrative with no destination;
- full Training narrative, coverage, three highlights and four priority groups;
- exact Coach's Take, recommendation and three Into Next Week actions;
- revision provenance and original publication context.

It correctly leaves Body Composition, material uncertainty, Training watch, Photo navigation and optional Energy comparison/semantic rows absent according to the current conditions.

## Complete graph inventory

Build 85 Native Weekly contains one data graph: W15, `WeeklyEnergyCard.chart(_:)`.

- Parent: Energy / W08.
- Type: grouped bar chart.
- Series: Intake; Estimated expenditure.
- X labels in this fixture: 23, 24, 25, 26, 27, 28, 29.
- Data: seven daily points and fourteen bars, exactly matching the copied fixture.
- Condition: `showsChart` and non-empty `dailyBalances`.
- Missing evidence: dashed vertical rule for an unpaired day.
- Legend and chart title remain in their exact production positions.

No second Weekly graph exists. No graph was removed, replaced or added. Full details: `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/GRAPH-INVENTORY.md`.

## W-ID mapping and parity proof

All production IDs preserve exact order and parentage. The chosen fixture produces:

`W01 W02 W03 W04 W05 W06 W07 W08 W09 W10 W13 W14 W15 W16 W17 W18 W19 W20 W21 W23 W24 W25 W26 W27 W28 W29 W33 W34 W35 W36 W37`

Both restyles produce that same production sequence plus exactly one `R-FUTURE` after W29 / the end of Training and before W33 / Coach interpretation. Fixture-absent conditionals W11, W12, W22, W30, W31 and W32 remain absent.

The validator checks exact strings/metrics/labels, W-ID order, parent/component map, conditionals, navigation, chart type/title/series/date/value for all fourteen marks, and the Recovery boundary. Results:

- Build 85 baseline: PASS — 85 exact displayed semantic fields; exact sequence; exact graph.
- Faithful dark: PASS — exact production sequence/parentage; exact graph; valid R-FUTURE.
- Faithful mineral light: PASS — exact production sequence/parentage; exact graph; valid R-FUTURE.
- Navigation: Home and Briefing History unchanged.
- Recovery: one fixture-only section; approved location; no Confidence semantics or coupling.

Durable proof:

- `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/PARITY-PROOF.md`
- `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/validation.json`
- `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/source/render-and-validate.mjs`

## Review artifacts

Full length:

- `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/screens/faithful-dark-full.png`
- `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/screens/faithful-mineral-light-full.png`
- `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/screens/faithful-dark-light-full-pair.png`

Focused review:

- top viewport: `faithful-dark-above-fold.png`, `faithful-mineral-light-above-fold.png`;
- Confidence: `confidence-dark-light-pair.png`;
- production Energy graph: `energy-chart-dark-light-pair.png`;
- Recovery: `recovery-dark-light-pair.png`;
- Coach's Take / Into Next Week: `coach-footer-dark-light-pair.png`;
- comparison board: `agent-handoffs/artifacts/weekly-ui-faithful-restyle-20261004/comparison-board.html`.

## Visual translation only

Dark uses the locked deep navy base, teal/navy existing surfaces, restrained purple, deliberate green/amber/cyan semantics, high-contrast Plus Jakarta Sans typography and subtle borders.

Mineral light uses the locked warm mineral base, ink/navy typography, pale teal integrated lead, restrained purple, semantic chart colors and border-led hierarchy. It does not make every section a white card.

Typography remains at practical long-form sizes. No content was truncated to reduce height. The full page is intentionally long.

## Recovery boundary

`R-FUTURE` uses the approved future seam after Training. Its synthetic content is deliberately non-assertive: Not enough data, Sleep signal not graduated, foam context only. It is marked `FUTURE CONTRACT · FIXTURE ONLY` in the UI and documented in `RECOVERY-FUTURE-FIXTURE.json`.

Recovery remains ungraduated, strategically ineligible, inactive and uncoupled from Confidence. No current Founder Recovery conclusion is asserted.

## Product lock and shipping isolation

- Home remains design-direction locked in dark and mineral light.
- Log remains design-direction locked to Compact Command Center in dark and mineral light.
- The prior Weekly three-composition exploration is rejected and retained only as history.
- This corrective Weekly pair is ready for Founder review; no Weekly visual direction is yet accepted.
- No shipping Native file changed.
- No Server file or behavior changed.
- No production content projection or semantic changed.
- No Recovery activation or policy change occurred.
- No build number, archive, TestFlight build or release action occurred.

Work stops here for Founder review.
