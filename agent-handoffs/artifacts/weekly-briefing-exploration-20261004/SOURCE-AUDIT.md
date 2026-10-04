# Weekly Briefing source audit

## Authorities inspected

- Assignment and Server/control repository: `2e3b6f274e08db66aae270f240a4e89a2ce3417c`
- Current shipping Native source: Build 85, `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Real V3 fixture window: Sep 20–26 accepted production-data zero-write preview, later deployed by the accepted Briefing Intelligence lineage. No persisted historical artifact was rewritten.

Native files inspected:

- `ios/PhysiqueOS/Contracts/BriefingReadModel.swift`
- `ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift`
- `ios/PhysiqueOS/Presentation/Briefings/BriefingDetailView.swift`
- `ios/PhysiqueOS/Presentation/Briefings/BriefingHistoryView.swift`
- `ios/PhysiqueOS/Presentation/Briefings/WeeklyBriefingSections.swift`
- `ios/PhysiqueOS/Presentation/Briefings/BriefingPresentation.swift`
- `ios/PhysiqueOS/Resources/BriefingsFixture.json`
- `ios/PhysiqueOSTests/BriefingV3PresentationTests.swift`
- `ios/PhysiqueOSTests/BriefingReadModelTests.swift`
- current Sleep v3 read-model, API and evidence presentation files

Server files and durable authorities inspected:

- `src/screens/WeeklyBriefingScreen.jsx`
- `src/domain/services/WeeklyBriefingScreenPresentationService.js`
- `src/domain/services/WeeklyNarrativePresentationSelector.js`
- `src/domain/services/WeeklyBriefingPresentationService.js`
- `src/domain/services/WeeklyNarrativeService.js`
- the accepted Briefing Intelligence measurement/causality/restraint release report
- the exact production deployment report for that Briefing Intelligence lineage
- Recovery Briefing V1 design architecture and shadow assessment
- Sleep v3 Oct 3 prospective canary audit

## Current production projection

The Native Weekly detail is a long, read-only briefing. Its real section order is:

1. Integrated lead: headline, body, exact server-owned Confidence and strategy strip.
2. Energy.
3. Weight.
4. Photos when present.
5. Training.
6. Body Composition when present.
7. Material uncertainty when the Server marks it for surfacing.
8. Coach’s Take and Into Next Week.

The screen has Home and Briefing History navigation, pull-to-refresh and explicit loading, not-ready, unavailable and failure states. It does not use the app’s bottom tab bar as its local page navigation.

## Narrative V3 boundary

- `canonical_narrative_v3` is the presentation model.
- The Server owns summary/result, meaning, action, watch and Coach’s Take.
- The Native mapper fails closed when the canonical required structure is missing; the client does not reconstruct or silently substitute a new narrative.
- Domain ordering is controlled by the Weekly selector/presentation boundary. Training, energy, weight and photos remain distinct evidence domains; Body Composition and Confidence stay separately attributable.
- Historical persisted briefings remain immutable.

## Confidence V3 boundary

Goal Confidence is server-authored evidence, not a client progress score. The relevant contract includes score, prior score, delta, movement direction/label, explanation, reasons that increased or limit Confidence, evidence that could raise or lower it, next decisive evidence, assumptions, unresolved uncertainty, goal/phase identity, capture time and provenance.

For this real fixture the correct presentation is **79% Confidence, held / no meaningful change**. “79% Moderate” is not used. The mockups do not recompute the score, relabel it as completion, or infer a different band.

## Recovery and Sleep boundary

Recovery is not a section in the current production Weekly projection. Current Sleep v3 remains validation-only/quarantined and `strategicEligible = false`; the planned Recovery assessment has no approved production input boundary and no Confidence coupling.

The planned architecture places a future `recovery_briefing_v1` assessment after Training and before Body Composition/Coach interpretation. It is Server-authored and may carry:

- Green / Yellow / Red / Not enough data status plus reason codes;
- completed-period and personal-baseline Sleep context;
- duration, consistency/continuity and selective stage context;
- training association with causality explicitly not inferred;
- what changed, what it means and what to do;
- coverage, freshness, provenance and a material caveat;
- `confidenceCoupling = none` and `foamCanSetStatus = false` policy boundaries.

Every rendered Recovery example is therefore labeled **Design fixture · future contract**. Its numbers are synthetic layout data, not a current Founder assessment, not part of the production projection and not part of Goal Confidence.

## Design implications

- Long-form comprehension is more important than matching Home’s composition.
- Exact Result / Meaning / Action / Watch separation must remain visible.
- Coverage limitations need a distinct evidence treatment, not muted fine print.
- Confidence needs a complete detailed presentation without dominating every domain.
- Recovery needs a stable recurring location and complete contract capacity, but a conspicuous non-production boundary in this exploration.
- Dark and mineral-light appearances can share hierarchy and geometry while using separate semantic surface/contrast tokens.

