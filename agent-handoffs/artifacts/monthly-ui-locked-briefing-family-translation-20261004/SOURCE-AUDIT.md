# Actual Monthly source audit

## Native Build 85

Audited authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026`.

Primary files:

- `ios/PhysiqueOS/Presentation/Briefings/MonthlyBriefingSections.swift`
- `ios/PhysiqueOS/Presentation/Briefings/BriefingDetailView.swift`
- `ios/PhysiqueOS/Contracts/BriefingReadModel.swift`
- `ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift`
- `ios/PhysiqueOS/Resources/BriefingsFixture.json`

The current loaded order is Integrated Lead → optional Strategic Summary V3 → optional Goal Milestone → Training Progress → Energy Evolution → New Baseline → What Changed → Defining Moments → Month Ahead → optional material uncertainty. Revision provenance is router-owned and follows the body when present.

`MonthlyStrategicSummaryCard` renders the current V3 summary fields without recomputing them. `MonthlyEnergyEvolutionCard` is a static, non-scrubbable weekly aggregate visualization; incomplete points are filtered by source eligibility. `MonthlyNewBaselineCard` owns the exact DEXA metrics and its Body Composition / scale interpretation. There is no separate production Monthly Weight section and no current Activity/Cardio graph; those facts appear only where the Monthly review contract allocates them.

Loaded-state conditions are preserved. The current detail shell presents loading progress; a loaded nil artifact as “This Briefing is unavailable.”; 404/not-ready as “This Briefing isn't ready yet. It will be available here as soon as it is published. No action needed.” with Check Again; and a general failure as “Briefing could not be loaded.” with Try Again.

## Production Server

Audited authority: `3c0f4aefddbb9a6886f6ad012443978303d47024`.

Current Monthly publication uses the completed prior calendar month and remains intentionally eligible on day 1. Routing precedence remains event Briefing → eligible Monthly → recurring Midweek/Weekly. No cadence or collision change is proposed.

The current V3 path is Server-owned through the Monthly service and shared Strategic Interpretation/Narrative/Confidence pipeline. `monthlyNarrative.strategicSummaryV3` and `monthlyPresentation` are mapped to Native. Confidence remains a separately bound canonical assessment; uncertainty does not automatically reduce it. The tuned Monthly review assesses Body Composition, guardrail, body trajectory, Training, Nutrition, routine, Activity, Recovery availability and visual change before allocating prose. It is not a concatenation of Weekly briefings.

## Selected source fixture

The repository's Build 85 rich Monthly fixture predates the latest tuned review projection. The most current exact tuned content available in repository authority is the engine-generated, zero-write September 1–26 V3 preview in `20260928T110000Z-briefing-intelligence-september-mtd-monthly-review-preview.md`. It was produced by the real prepare/finalize path against production-shaped read-only evidence and was not hand-edited.

This design therefore preserves that fixture's month-to-date boundary and every qualifier. It does not relabel it as a completed month or claim publication provenance. Cadence documentation separately preserves the production day-1 completed-month rule.

## Genuine discrepancies and boundaries

- Recovery is currently unavailable in production and strategically inactive. The render inserts only the approved future presentation fixture at the approved location.
- The latest review may omit Defining Moments because its dated evidence is already allocated to source-owned cards. Native still supports the conditional section; this render does not remove it from the contract.
- Monthly Photos is not governed by the Weekly/Midweek removal decision. The current review assesses visual change and can allocate a Monthly comparison when evidence exists. This selected fixture has no September comparison, so no standalone Photos section appears. A Photos action is not present in this exact selected source fixture.
- Three Monthly headings/callout labels remain Native-authored in Build 85. They are preserved here rather than silently rewritten.
