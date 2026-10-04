# Current Build 85 Midweek V3 audit

## Exact authorities

- Native Build 85: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
  - `ios/PhysiqueOS/Presentation/Briefings/MidweekBriefingSections.swift` blob `96c9b251afed40728fbc21de662096df681781c6`
  - `ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift` blob `26efe760add628c45c72a228781e554ec7918886`
  - `ios/PhysiqueOS/Presentation/Briefings/BriefingDetailView.swift`
  - `ios/PhysiqueOS/SharedUI/BriefingPresentation.swift`
  - `ios/PhysiqueOSTests/BriefingV3PresentationTests.swift`
- Production Server: `3c0f4aefddbb9a6886f6ad012443978303d47024`
  - `src/domain/services/MidweekBriefingPresentationService.js` blob `5c481f8d61f3f5ca17170f66d6e55f5e25ac6e70`
- Production-shaped fixture lineage: `agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json`

## Current hierarchy and order

`BriefingDetailView` owns loading, read, navigation, cadence dispatch and optional revision provenance. The bound V3 Midweek path is:

1. Home / Briefing History navigation.
2. Integrated lead: Midweek label, evidence range, one contract-bound Confidence surface, Result headline, Meaning paragraph, Goal & Phase footer.
3. Contract modules in Server order: Energy, Weight, Body Composition, Training. The fifth contract decision is Recovery with `included=false` and `no_eligible_evidence`.
4. Still Unresolved, only when `visibleItems` exists; Native clamps to two.
5. Coach's Take finale filled from distinct contract coaching claims.
6. Revision banner only when revision provenance exists.

This differs from Weekly's content structure. The translation uses Weekly only for visual grammar.

## Content ownership and Narrative V3 placement

- The bound `midweek_presentation_contract_v1` is the rendering authority.
- Result is owned by `lead.headline`; Meaning by `lead.meaning`; Confidence by `lead.confidence`.
- Action and Watch are rendered in the Coach's Take finale as **What To Do** and **What To Watch**.
- The full concatenated `narrativeV3.detail` never enters the hero.
- When the Server suppresses a second movement as not decision-changing, Biggest Takeaway is absent as a complete slot. Native does not invent replacement copy.
- Legacy goal, phase, coaching and priority fields never leak into the contract path.

The current fixture intentionally contains two distinct 90 lb facts. Machine lateral raises own the Result headline; Leg Extensions remain a structured Training highlight. The latter is not duplicated into Biggest Takeaway.

## Domain and graph inventory

- Energy: `WeeklyEnergyCard`, with daily semantic rows enabled. The current contract includes the chart because two paired days meet the Server threshold. The sole graph is a grouped per-day bar chart: Intake and Estimated expenditure, two dates, four bars, y-axis hidden, canonical chart accessibility summary retained.
- Weight: average plus signed change; V3 legacy interpretation is empty.
- Body Composition: current scan/baseline date plus Body Fat, Lean Mass and Fat Mass. The current fixture has a new scan; its legacy interpretation is empty.
- Training: headline, exact coverage rollup, structured highlights, optional priority groups and optional watch. Current fixture has two highlights, no priority groups and no watch.
- Still Unresolved: one moderate Server-selected item in the current fixture.
- Coach's Take: Action and Watch only; Biggest Takeaway is conditionally absent.
- Photos: no Midweek module or slot in the current bound contract.

No Training chart exists in the current Native Midweek implementation. The translation's compact 2-improving / 3-steady rail is a direct, source-bound rendering of canonical coverage counts, not a fabricated series.

## Conditional behavior

- Energy chart: shown only when `module.chartIncluded == true`; current fixture is true.
- Module inclusion and order: Server-owned; Native renders only `included=true` modules and does not rerank.
- Body Composition: absent when neither a new scan nor baseline exists.
- Priority Muscle Groups: absent when the array is empty or evidence status is withheld.
- Training Watch: absent in the V3 projection unless the contract/structured model includes a current watch.
- Still Unresolved: absent when empty and capped at two.
- Confidence: exactly once, and absent rather than falling through when contract Confidence is missing.
- Biggest Takeaway: absent as a whole slot when no distinct `coachTake` claim exists.
- Revision: absent unless revision provenance exists.

## Load, not-ready and failure states

- Loading: native `ProgressView` in a 300 pt minimum content region.
- Loaded but unavailable: “This Briefing is unavailable.”
- 404 / not ready: “This Briefing isn't ready yet. It will be available here as soon as it is published. No action needed.” plus **Check Again**.
- Failure: “Briefing could not be loaded.” plus **Try Again**.
- Pull-to-refresh and visible foreground refresh use the same API authority.

Those behaviors are unchanged and were not redesigned in this confirmation render.

## Recovery decision

Approved Recovery Briefing V1 architecture explicitly plans Midweek placement after Training and before Coach's Take. Therefore the render includes one clearly labeled **FUTURE CONTRACT · FIXTURE ONLY** Recovery surface using the approved Midweek Green prototype values. It is not part of the 61-field current production projection, cannot affect Confidence, and does not activate Recovery. The current production contract still says Recovery `included=false` / `no_eligible_evidence`.

## Visual translation

- The lead uses the locked immersive teal/navy field, truthful 79% ring, large editorial Result and integrated Goal/Phase footer.
- The body uses the locked dense analytical system: open navy canvas, thin rules, aligned metrics, compact rows, source-bound chart geometry and one high-emphasis Coach's Take close.
- Midweek remains faster and shorter than Weekly: fewer domains, two-day Energy chart, compact current-baseline treatment and no Weekly-only sections.
