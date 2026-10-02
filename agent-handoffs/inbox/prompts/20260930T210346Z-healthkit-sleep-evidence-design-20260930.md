# HealthKit Sleep Evidence design (DESIGN task, not implementation)

Task: healthkit-sleep-evidence-design-20260930

Read first:
- agent-handoffs/reports/20260930T210326Z-healthkit-sleep-historical-shape-validation.md (sanitized real 30-night data shape; canonical defect section)
- inbox decisions folder: file 20260930T210000Z-sleep-historical-shape-audit... (section 7, Evidence-design handoff)
- inbox coordination folder: file 20260930T013000Z (mandatory GH stop checkpoints: publish a GH checkpoint before every stop)

## Product purpose
Sleep is evidence for physique and recovery coaching. It is not a standalone sleep-tracker product. Design the Evidence surface that lets the Founder see what the canonical Sleep data actually is, so the Founder can later decide what (if anything) matters strategically.

## Inputs
- **Canonical Sleep schema:**
  - Server `src/domain/services/HealthKitSleepCanonicalizer.js` (sleep-canon-v1) and `HealthKitSleepContract.js`.
  - Day fields: sleepDay (wake date, 18:00 boundary), status, timeZone / timeZoneShift, windowClosesAt, mainSleep (asleep, awake, core, deep, rem, unspecified, inBed, stageCoverage), totalAsleepIncludingSecondarySeconds.
  - Episode fields: kind main/secondary, start/end, primarySource (class/family), reconciliation (reason, candidateCount, preferenceApplied), completeness (asleepData, stageDetail, sourceBasis), timeline segments, corroboratingSources.
- **Real data shape (sanitized):** Oura-only, 30/30 nights, one main episode per night, fully staged (core/deep/REM/awake), in-bed present and wider than the asleep span, 40–91 timeline segments per night, time zone inferred at ingest, no secondary episodes, no manual entries, no multi-source overlap.
  - Design for the general schema too: Watch-only unstaged nights, multi-source corroboration, secondary episodes and in-bed-only days. Real data just has not exercised them yet.
- **Known data caveat:** on about 1/3 of nights, Oura duplicated its own data, and sleep-canon-v1 currently distorts the awake/deep/REM/core split on those nights (total asleep is reliable). A Server fix (sleep-canon-v2) is planned. Do not design around the distortion. Do consider how a night recomputed by a newer algorithm version, or updated late, is presented.
- **Existing Native Evidence language and navigation:** `ios/PhysiqueOS/Presentation/Evidence/`.
  - Patterns to reuse: EvidenceView, EvidenceStreamRowView, EvidenceHeaderView, the Activity / Nutrition / Energy / Weight history and day views, and the chart view files.
  - Also reuse the PhysiqueOSTheme / PhysiqueOSTypography components.

## Design freedom: take a thoughtful first pass at
- Sleep Evidence landing and history (across nights)
- the nightly row/card
- night detail
- a stage/timeline visualization, if it is genuinely useful
- main vs secondary sleep
- source/provenance presentation (primary source, corroborating sources, preference applied, inferred time zone)
- completeness and late-update state (window still open until 18:00 on the wake date, stage detail absent, in-bed only, recomputed)
- trends across nights that are useful

Do not clone Oura or Apple Health, and do not overload the UI with every metric. Prioritize what could later help physique/recovery interpretation.

## Strategic boundary: do NOT decide
- Sleep Goal weighting
- Confidence weight
- Briefing inclusion
- Narrative influence
- good/bad thresholds
- coaching recommendations
- Home placement
- recovery score

Present data descriptively. The Founder decides those after reviewing this design.

## Deliverable
- A design proposal first: screen hierarchy, components, states and copy specification.
- Optionally, a NON-SHIPPING Native prototype/preview using synthetic data only (SwiftUI previews or a sandbox-only fixture), on its own branch.
- No Founder data in GitHub, previews or fixtures.
- Do not deploy, upload, activate prospective Sleep, or change Server Sleep eligibility/Briefings/V3/Confidence/Narrative/Goals.
- Publish a GH report with the proposal (and a prototype branch/SHA, if any) and stop for Founder review.
